const { authMiddleware, roleMiddleware } = require('../middleware/auth');
const { RiskRule, RiskBlacklist, RiskIntercept } = require('../models');
const { Op } = require('sequelize');
const { checkRisk } = require('../services/riskService');

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
    const { type, value, reason, expireAt, isPermanent } = request.body;

    const existing = await RiskBlacklist.findOne({ where: { type, value } });
    if (existing) {
      return reply.status(400).send({ message: '该记录已在黑名单中' });
    }

    const item = await RiskBlacklist.create({ type, value, reason, expireAt, isPermanent });
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
    const { page = 1, pageSize = 10, startDate, endDate, userId, ruleName } = request.query;
    const offset = (page - 1) * pageSize;

    const where = {};
    if (startDate && endDate) {
      where.createdAt = { [Op.between]: [new Date(startDate), new Date(endDate)] };
    }
    if (userId) where.userId = userId;
    if (ruleName) where.ruleName = { [Op.like]: `%${ruleName}%` };

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

  fastify.post('/api/risk/intercepts/:id/blacklist', { preHandler: [authMiddleware, roleMiddleware(['admin'])] }, async (request, reply) => {
    const { type, reason, expireAt, isPermanent } = request.body;
    const intercept = await RiskIntercept.findByPk(request.params.id);

    if (!intercept) {
      return reply.status(404).send({ message: '拦截记录不存在' });
    }

    const results = [];
    const blacklistReasons = reason || `来自拦截记录 #${intercept.id}: ${intercept.ruleName}`;
    const permanent = isPermanent !== undefined ? isPermanent : true;

    const addIfNotExists = async (blType, blValue) => {
      if (!blValue) return;
      const existing = await RiskBlacklist.findOne({ where: { type: blType, value: blValue.toString() } });
      if (existing) {
        results.push({ type: blType, value: blValue, status: 'existed' });
        return;
      }
      await RiskBlacklist.create({
        type: blType,
        value: blValue.toString(),
        reason: blacklistReasons,
        expireAt: permanent ? null : expireAt,
        isPermanent: permanent
      });
      results.push({ type: blType, value: blValue, status: 'added' });
    };

    if (type === 'ip' || type === 'all') {
      await addIfNotExists('ip', intercept.ipAddress);
    }
    if (type === 'device' || type === 'all') {
      await addIfNotExists('device', intercept.deviceId);
    }
    if (type === 'user' || type === 'all') {
      await addIfNotExists('user', intercept.userId);
    }

    return { message: '拉黑操作完成', results };
  });

  fastify.post('/api/risk/check', { preHandler: [authMiddleware] }, async (request, reply) => {
    const { userId, deviceId, ipAddress, batchId } = request.body;
    const result = await checkRisk(userId, deviceId, ipAddress, batchId);
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
