const { Op, QueryTypes } = require('sequelize');
const { RiskRule, RiskBlacklist, RiskIntercept, sequelize } = require('../models');

const SCENE_TEXT = {
  receive: '用户领取',
  redeem: '兑换码兑换'
};

const BLACKLIST_TYPE_TEXT = {
  ip: 'IP',
  device: '设备',
  user: '用户'
};

async function countReceiveRecords(whereSql, replacements) {
  const rows = await sequelize.query(
    `SELECT COUNT(*) AS cnt FROM receive_records WHERE ${whereSql}`,
    { replacements, type: QueryTypes.SELECT }
  );
  return parseInt(rows[0].cnt, 10) || 0;
}

async function countDistinctUsers(whereSql, replacements) {
  const rows = await sequelize.query(
    `SELECT COUNT(DISTINCT user_id) AS cnt FROM receive_records WHERE ${whereSql}`,
    { replacements, type: QueryTypes.SELECT }
  );
  return parseInt(rows[0].cnt, 10) || 0;
}

async function recordIntercept({ userId, ipAddress, deviceId, batchId, scene, ruleId, ruleName, action, details }) {
  try {
    await RiskIntercept.create({
      userId: userId || null,
      ipAddress: ipAddress || null,
      deviceId: deviceId || null,
      ruleId: ruleId || null,
      ruleName,
      action,
      details: {
        scene,
        sceneText: SCENE_TEXT[scene] || scene,
        batchId: batchId || null,
        ...details
      }
    });
  } catch (err) {
    console.error('[风控] 拦截记录写入失败:', err.message);
  }
}

async function checkBlacklist({ userId, deviceId, ipAddress, batchId, scene }) {
  const now = new Date();
  const targets = [];
  if (ipAddress) targets.push({ type: 'ip', value: ipAddress });
  if (deviceId) targets.push({ type: 'device', value: deviceId });
  if (userId != null) targets.push({ type: 'user', value: String(userId) });

  if (targets.length === 0) return null;

  const hit = await RiskBlacklist.findOne({
    where: {
      [Op.and]: [
        { [Op.or]: targets.map(t => ({ type: t.type, value: t.value })) },
        { [Op.or]: [{ isPermanent: true }, { expireAt: { [Op.gt]: now } }] }
      ]
    },
    order: [['createdAt', 'ASC']]
  });

  if (hit) {
    await recordIntercept({
      userId,
      ipAddress,
      deviceId,
      batchId,
      scene,
      ruleName: `黑名单拦截（${BLACKLIST_TYPE_TEXT[hit.type] || hit.type}）`,
      action: 'block',
      details: {
        blacklistType: hit.type,
        blacklistValue: hit.value,
        reason: hit.reason || null,
        isPermanent: hit.isPermanent,
        expireAt: hit.expireAt
      }
    });
    return {
      blocked: true,
      riskLevel: 'danger',
      reason: `命中${BLACKLIST_TYPE_TEXT[hit.type] || ''}黑名单，无法完成${SCENE_TEXT[scene] || '操作'}`,
      riskReason: '黑名单拦截',
      ruleName: '黑名单拦截'
    };
  }
  return null;
}

async function evaluateRule(rule, { userId, deviceId, ipAddress }) {
  const config = rule.config || {};
  const windowMinutes = Number(config.windowMinutes) || 60;
  const windowMinutesSafe = Math.floor(windowMinutes);
  const windowCond = `is_cancelled = false AND channel IN ('receive','redeem') AND created_at > NOW() - INTERVAL '${windowMinutesSafe} minutes'`;

  switch (rule.ruleType) {
    case 'frequency': {
      if (!userId || !config.limit) return null;
      const cnt = await countReceiveRecords(
        `user_id = ? AND ${windowCond}`,
        [userId]
      );
      if (cnt >= config.limit) {
        return { count: cnt, limit: config.limit, windowMinutes, dimension: 'user' };
      }
      return null;
    }
    case 'ip': {
      if (!ipAddress || !config.limit) return null;
      const cnt = await countReceiveRecords(
        `ip_address = ? AND ${windowCond}`,
        [ipAddress]
      );
      if (cnt >= config.limit) {
        return { count: cnt, limit: config.limit, windowMinutes, dimension: 'ip' };
      }
      return null;
    }
    case 'device': {
      if (!deviceId || !config.limit) return null;
      const cnt = await countReceiveRecords(
        `device_id = ? AND ${windowCond}`,
        [deviceId]
      );
      if (cnt >= config.limit) {
        return { count: cnt, limit: config.limit, windowMinutes, dimension: 'device' };
      }
      return null;
    }
    case 'behavior': {
      const distinctUserLimit = Number(config.distinctUserLimit) || 0;
      if (distinctUserLimit > 0 && (ipAddress || deviceId)) {
        let whereSql;
        let params;
        if (ipAddress && deviceId) {
          whereSql = `(ip_address = ? OR device_id = ?) AND ${windowCond}`;
          params = [ipAddress, deviceId];
        } else if (ipAddress) {
          whereSql = `ip_address = ? AND ${windowCond}`;
          params = [ipAddress];
        } else {
          whereSql = `device_id = ? AND ${windowCond}`;
          params = [deviceId];
        }
        const userCnt = await countDistinctUsers(whereSql, params);
        if (userCnt >= distinctUserLimit) {
          return { distinctUsers: userCnt, distinctUserLimit, windowMinutes, dimension: 'behavior' };
        }
      }
      return null;
    }
    default:
      return null;
  }
}

async function checkRisk({ userId, deviceId, ipAddress, batchId = null, scene = 'receive' }) {
  const blacklistResult = await checkBlacklist({ userId, deviceId, ipAddress, batchId, scene });
  if (blacklistResult) return blacklistResult;

  const activeRules = await RiskRule.findAll({ where: { status: 'active' } });

  let warningReason = null;

  for (const rule of activeRules) {
    let hit = null;
    try {
      hit = await evaluateRule(rule, { userId, deviceId, ipAddress });
    } catch (err) {
      console.error(`[风控] 规则 ${rule.ruleName} 执行失败:`, err.message);
      continue;
    }

    if (hit) {
      await recordIntercept({
        userId,
        ipAddress,
        deviceId,
        batchId,
        scene,
        ruleId: rule.id,
        ruleName: rule.ruleName,
        action: rule.action,
        details: { ruleType: rule.ruleType, ...hit }
      });

      if (rule.action === 'block') {
        return {
          blocked: true,
          riskLevel: 'danger',
          reason: `触发风控规则「${rule.ruleName}」，${SCENE_TEXT[scene] || '操作'}已被拦截`,
          riskReason: rule.ruleName,
          ruleName: rule.ruleName
        };
      }
      if (!warningReason) {
        warningReason = rule.ruleName;
      }
    }
  }

  if (warningReason) {
    return {
      blocked: false,
      riskLevel: 'warning',
      reason: warningReason,
      riskReason: warningReason,
      ruleName: warningReason
    };
  }

  return { blocked: false, riskLevel: 'normal' };
}

module.exports = { checkRisk, SCENE_TEXT, BLACKLIST_TYPE_TEXT };
