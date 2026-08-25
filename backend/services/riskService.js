const { RiskRule, RiskBlacklist, RiskIntercept, sequelize } = require('../models');
const { Op, QueryTypes } = require('sequelize');

// 查询命中的有效黑名单（永久或未过期）
async function findActiveBlacklist({ userId, deviceId, ipAddress }) {
  const now = new Date();
  const orConds = [];
  if (ipAddress) orConds.push({ type: 'ip', value: ipAddress });
  if (deviceId) orConds.push({ type: 'device', value: deviceId });
  if (userId !== null && userId !== undefined) orConds.push({ type: 'user', value: userId.toString() });

  if (orConds.length === 0) return null;

  return RiskBlacklist.findOne({
    where: {
      [Op.and]: [
        { [Op.or]: orConds },
        { [Op.or]: [{ isPermanent: true }, { expireAt: { [Op.gt]: now } }] }
      ]
    }
  });
}

// 仅黑名单校验，命中则记录拦截。用于后台手动/定向发放场景
async function checkBlacklist({ userId, deviceId, ipAddress }) {
  const blacklist = await findActiveBlacklist({ userId, deviceId, ipAddress });
  if (blacklist) {
    await RiskIntercept.create({
      userId,
      ipAddress,
      deviceId,
      ruleName: '黑名单拦截',
      action: 'block',
      details: { type: blacklist.type, value: blacklist.value, reason: blacklist.reason }
    });
    return { blocked: true, reason: '目标已被列入黑名单' };
  }
  return { blocked: false };
}

// 完整风控校验：黑名单 + 频率/IP/设备规则。用于用户领取、兑换码兑换场景
async function checkRisk({ userId, deviceId, ipAddress }) {
  const now = new Date();

  const blacklist = await findActiveBlacklist({ userId, deviceId, ipAddress });
  if (blacklist) {
    await RiskIntercept.create({
      userId,
      ipAddress,
      deviceId,
      ruleName: '黑名单拦截',
      action: 'block',
      details: { type: blacklist.type, value: blacklist.value, reason: blacklist.reason }
    });
    return { blocked: true, reason: '您已被列入黑名单' };
  }

  const activeRules = await RiskRule.findAll({ where: { status: 'active' } });

  for (const rule of activeRules) {
    const config = rule.config;
    let isRisk = false;
    let details = {};

    switch (rule.ruleType) {
      case 'frequency': {
        const { limit, windowMinutes } = config;
        const startTime = new Date(now - windowMinutes * 60 * 1000);

        const count = await sequelize.query(`
          SELECT COUNT(*) as cnt FROM receive_records
          WHERE user_id = ? AND created_at > ?
        `, {
          replacements: [userId, startTime],
          type: QueryTypes.SELECT
        });

        if (count[0].cnt >= limit) {
          isRisk = true;
          details = { count: count[0].cnt, limit, windowMinutes };
        }
        break;
      }
      case 'ip': {
        const { limit, windowMinutes } = config;
        const startTime = new Date(now - windowMinutes * 60 * 1000);

        const count = await sequelize.query(`
          SELECT COUNT(*) as cnt FROM receive_records
          WHERE ip_address = ? AND created_at > ?
        `, {
          replacements: [ipAddress, startTime],
          type: QueryTypes.SELECT
        });

        if (count[0].cnt >= limit) {
          isRisk = true;
          details = { count: count[0].cnt, limit, windowMinutes };
        }
        break;
      }
      case 'device': {
        const { limit, windowMinutes } = config;
        const startTime = new Date(now - windowMinutes * 60 * 1000);

        const count = await sequelize.query(`
          SELECT COUNT(*) as cnt FROM receive_records
          WHERE device_id = ? AND created_at > ?
        `, {
          replacements: [deviceId, startTime],
          type: QueryTypes.SELECT
        });

        if (count[0].cnt >= limit) {
          isRisk = true;
          details = { count: count[0].cnt, limit, windowMinutes };
        }
        break;
      }
    }

    if (isRisk) {
      await RiskIntercept.create({
        userId,
        ipAddress,
        deviceId,
        ruleId: rule.id,
        ruleName: rule.ruleName,
        action: rule.action,
        details
      });

      if (rule.action === 'block') {
        return { blocked: true, reason: rule.ruleName };
      }
    }
  }

  return { blocked: false };
}

module.exports = { checkRisk, checkBlacklist, findActiveBlacklist };
