const { authMiddleware, roleMiddleware } = require('../middleware/auth');
const { RiskRule, RiskBlacklist, RiskIntercept, sequelize } = require('../models');
const { Op, QueryTypes } = require('sequelize');

async function checkRisk(request, userId, deviceId, ipAddress, batchId) {
  const now = new Date();

  const blacklist = await RiskBlacklist.findOne({
    where: {
      [Op.or]: [
        { type: 'ip', value: ipAddress },
        { type: 'device', value: deviceId },
        { type: 'user', value: userId?.toString() }
      ],
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

async function routes(fastify, options) {
  fastify.get('/api/risk/rules', { preHandler: [authMiddleware, roleMiddleware(['admin'])] }, async (request, reply) => {
    const rules = await RiskRule.findAll({ order: [['createdAt', 'DESC']] });
    return rules;
  });

  fastify.post('/api/risk/rules', { preHandler: [authMiddleware, roleMiddleware(['admin'])] }, async (request, reply) => {
    const rule = await RiskRule.create(request.body);
    return rule;
  });

  fastify.put('/api/risk/rules/:id', { preHandler: [authMiddleware, roleMiddleware(['admin'])] }, async (request, reply) => {
    const rule = await RiskRule.findByPk(request.params.id);
    if (!rule) {
      return reply.status(404).send({ message: '规则不存在' });
    }
    await rule.update(request.body);
    return rule;
  });

  fastify.post('/api/risk/rules/:id/toggle', { preHandler: [authMiddleware, roleMiddleware(['admin'])] }, async (request, reply) => {
    const rule = await RiskRule.findByPk(request.params.id);
    if (!rule) {
      return reply.status(404).send({ message: '规则不存在' });
    }
    rule.status = rule.status === 'active' ? 'disabled' : 'active';
    await rule.save();
    return rule;
  });

  fastify.delete('/api/risk/rules/:id', { preHandler: [authMiddleware, roleMiddleware(['admin'])] }, async (request, reply) => {
    const rule = await RiskRule.findByPk(request.params.id);
    if (!rule) {
      return reply.status(404).send({ message: '规则不存在' });
    }
    await rule.destroy();
    return { message: '规则已删除' };
  });

  fastify.get('/api/risk/blacklist', { preHandler: [authMiddleware, roleMiddleware(['admin'])] }, async (request, reply) => {
    const { page = 1, pageSize = 10, type, keyword } = request.query;
    const offset = (page - 1) * pageSize;
    
    const where = {};
    if (type) where.type = type;
    if (keyword) where.value = { [Op.like]: `%${keyword}%` };

    const { count, rows } = await RiskBlacklist.findAndCountAll({
      where,
      offset,
      limit: pageSize,
      order: [['createdAt', 'DESC']]
    });

    return {
      list: rows,
      total: count,
      page: parseInt(page),
      pageSize: parseInt(pageSize)
    };
  });

  fastify.post('/api/risk/blacklist', { preHandler: [authMiddleware, roleMiddleware(['admin'])] }, async (request, reply) => {
    const item = await RiskBlacklist.create(request.body);
    return item;
  });

  fastify.delete('/api/risk/blacklist/:id', { preHandler: [authMiddleware, roleMiddleware(['admin'])] }, async (request, reply) => {
    const item = await RiskBlacklist.findByPk(request.params.id);
    if (!item) {
      return reply.status(404).send({ message: '记录不存在' });
    }
    await item.destroy();
    return { message: '已从黑名单移除' };
  });

  fastify.get('/api/risk/intercepts', { preHandler: [authMiddleware, roleMiddleware(['admin'])] }, async (request, reply) => {
    const { page = 1, pageSize = 10, startDate, endDate } = request.query;
    const offset = (page - 1) * pageSize;
    
    const where = {};
    if (startDate && endDate) {
      where.createdAt = { [Op.between]: [new Date(startDate), new Date(endDate)] };
    }

    const { count, rows } = await RiskIntercept.findAndCountAll({
      where,
      offset,
      limit: pageSize,
      order: [['createdAt', 'DESC']]
    });

    return {
      list: rows,
      total: count,
      page: parseInt(page),
      pageSize: parseInt(pageSize)
    };
  });

  fastify.post('/api/risk/check', { preHandler: [authMiddleware] }, async (request, reply) => {
    const { userId, deviceId, ipAddress, batchId } = request.body;
    const result = await checkRisk(request, userId, deviceId, ipAddress, batchId);
    return result;
  });

  fastify.post('/api/risk/init-default-rules', { preHandler: [authMiddleware, roleMiddleware(['admin'])] }, async (request, reply) => {
    const defaultRules = [
      {
        ruleType: 'frequency',
        ruleName: '用户领取频率限制',
        config: { limit: 5, windowMinutes: 60 },
        action: 'block',
        description: '限制用户每小时最多领取5张优惠券'
      },
      {
        ruleType: 'ip',
        ruleName: 'IP领取频率限制',
        config: { limit: 10, windowMinutes: 60 },
        action: 'block',
        description: '限制同一IP每小时最多领取10张优惠券'
      },
      {
        ruleType: 'device',
        ruleName: '设备领取频率限制',
        config: { limit: 5, windowMinutes: 60 },
        action: 'block',
        description: '限制同一设备每小时最多领取5张优惠券'
      }
    ];

    for (const rule of defaultRules) {
      const exists = await RiskRule.findOne({ where: { ruleName: rule.ruleName } });
      if (!exists) {
        await RiskRule.create(rule);
      }
    }

    return { message: '默认规则初始化完成' };
  });

  fastify.decorate('checkRisk', checkRisk);
}

module.exports = routes;
module.exports.checkRisk = checkRisk;
