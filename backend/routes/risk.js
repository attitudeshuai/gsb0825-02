const { authMiddleware, roleMiddleware } = require('../middleware/auth');
const { RiskRule, RiskBlacklist, RiskIntercept, sequelize } = require('../models');
const { Op, QueryTypes } = require('sequelize');
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
    const { userId, deviceId, ipAddress } = request.body;
    const result = await checkRisk({ userId, deviceId, ipAddress });
    return result;
  });

  // 从拦截记录一键加入黑名单：可选择拉黑 IP / 设备 / 用户
  fastify.post('/api/risk/intercepts/:id/blacklist', { preHandler: [authMiddleware, roleMiddleware(['admin'])] }, async (request, reply) => {
    const { type, reason, expireAt, isPermanent = true } = request.body;

    if (!['ip', 'device', 'user'].includes(type)) {
      return reply.status(400).send({ message: '拉黑类型不合法' });
    }

    const intercept = await RiskIntercept.findByPk(request.params.id);
    if (!intercept) {
      return reply.status(404).send({ message: '拦截记录不存在' });
    }

    const valueMap = {
      ip: intercept.ipAddress,
      device: intercept.deviceId,
      user: intercept.userId != null ? intercept.userId.toString() : null
    };
    const value = valueMap[type];

    if (!value) {
      return reply.status(400).send({ message: '该拦截记录缺少对应的' + type + '信息，无法拉黑' });
    }

    const exists = await RiskBlacklist.findOne({ where: { type, value } });
    if (exists) {
      return reply.status(400).send({ message: '该对象已在黑名单中' });
    }

    const item = await RiskBlacklist.create({
      type,
      value,
      reason: reason || `来自拦截记录#${intercept.id}：${intercept.ruleName || ''}`,
      expireAt: isPermanent ? null : expireAt,
      isPermanent
    });

    return item;
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
}

module.exports = routes;
