const { RiskRule, RiskBlacklist, RiskIntercept, sequelize } = require('../models');
const { Op, QueryTypes } = require('sequelize');

async function checkRisk(userId, deviceId, ipAddress, batchId) {
  const now = new Date();

  const blacklist = await RiskBlacklist.findOne({
    where: {
      [Op.or]: [
        { type: 'ip', value: ipAddress },
        { type: 'device', value: deviceId },
        { type: 'user', value: userId ? userId.toString() : null }
      ].filter(condition => condition.value !== null && condition.value !== undefined),
      [Op.and]: [
        { [Op.or]: [{ isPermanent: true }, { expireAt: { [Op.gt]: now } }] }
      ]
    }
  });

  if (blacklist) {
    await RiskIntercept.create({
      userId,
      ipAddress,
      deviceId,
      ruleName: '黑名单拦截',
      action: 'block',
      details: { type: blacklist.type, value: blacklist.value, reason: blacklist.reason }
    });
    return {
      blocked: true,
      reason: '您已被列入黑名单',
      riskLevel: 'danger',
      riskReason: `黑名单拦截: ${blacklist.type}=${blacklist.value}`,
      ruleName: '黑名单拦截'
    };
  }

  const activeRules = await RiskRule.findAll({ where: { status: 'active' } });

  for (const rule of activeRules) {
    const config = rule.config;
    let isRisk = false;
    let details = {};

    switch (rule.ruleType) {
      case 'frequency': {
        if (!userId) break;
        const { limit, windowMinutes } = config;
        const startTime = new Date(now - windowMinutes * 60 * 1000);

        const count = await sequelize.query(`
          SELECT COUNT(*) as cnt FROM receive_records 
          WHERE user_id = ? AND created_at > ? AND is_cancelled = false
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
        if (!ipAddress) break;
        const { limit, windowMinutes } = config;
        const startTime = new Date(now - windowMinutes * 60 * 1000);

        const count = await sequelize.query(`
          SELECT COUNT(*) as cnt FROM receive_records 
          WHERE ip_address = ? AND created_at > ? AND is_cancelled = false
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
        if (!deviceId) break;
        const { limit, windowMinutes } = config;
        const startTime = new Date(now - windowMinutes * 60 * 1000);

        const count = await sequelize.query(`
          SELECT COUNT(*) as cnt FROM receive_records 
          WHERE device_id = ? AND created_at > ? AND is_cancelled = false
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
      case 'behavior': {
        const { maxDifferentIps, windowMinutes, maxSameDevice } = config;
        const startTime = new Date(now - windowMinutes * 60 * 1000);

        if (userId && maxDifferentIps) {
          const ipResult = await sequelize.query(`
            SELECT COUNT(DISTINCT ip_address) as cnt FROM receive_records 
            WHERE user_id = ? AND created_at > ? AND is_cancelled = false
          `, {
            replacements: [userId, startTime],
            type: QueryTypes.SELECT
          });
          if (ipResult[0].cnt >= maxDifferentIps) {
            isRisk = true;
            details = { differentIps: ipResult[0].cnt, maxDifferentIps, windowMinutes };
          }
        }

        if (!isRisk && deviceId && maxSameDevice) {
          const userResult = await sequelize.query(`
            SELECT COUNT(DISTINCT user_id) as cnt FROM receive_records 
            WHERE device_id = ? AND created_at > ? AND is_cancelled = false
          `, {
            replacements: [deviceId, startTime],
            type: QueryTypes.SELECT
          });
          if (userResult[0].cnt >= maxSameDevice) {
            isRisk = true;
            details = { ...details, differentUsers: userResult[0].cnt, maxSameDevice, windowMinutes };
          }
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
        return {
          blocked: true,
          reason: rule.ruleName,
          riskLevel: 'danger',
          riskReason: `${rule.ruleName}: ${JSON.stringify(details)}`,
          ruleId: rule.id,
          ruleName: rule.ruleName
        };
      } else if (rule.action === 'warning') {
        return {
          blocked: false,
          riskLevel: 'warning',
          riskReason: `${rule.ruleName}: ${JSON.stringify(details)}`,
          ruleId: rule.id,
          ruleName: rule.ruleName
        };
      }
    }
  }

  return { blocked: false, riskLevel: 'normal' };
}

module.exports = { checkRisk };
