const { authMiddleware, roleMiddleware } = require('../middleware/auth');
const { UserSegment, User } = require('../models');
const { Op } = require('sequelize');
const { resolveSegmentUserIds, getSegmentUserCount } = require('../services/segmentService');

function generateSegmentCode() {
  return 'SEG' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).substring(2, 6).toUpperCase();
}

const BUILTIN_SEGMENTS = [
  {
    name: '高价值用户',
    code: 'BUILTIN_HIGH_VALUE',
    segmentType: 'dynamic',
    criteria: { type: 'payment_level', level: 'highValue' },
    description: '累计实付金额 ≥ 10000 元的用户'
  },
  {
    name: '活跃用户',
    code: 'BUILTIN_ACTIVE',
    segmentType: 'dynamic',
    criteria: { type: 'payment_level', level: 'active' },
    description: '累计实付金额 1000 ~ 10000 元的用户'
  },
  {
    name: '普通用户',
    code: 'BUILTIN_NORMAL',
    segmentType: 'dynamic',
    criteria: { type: 'payment_level', level: 'normal' },
    description: '累计实付金额 0 ~ 1000 元的用户'
  },
  {
    name: '沉睡用户',
    code: 'BUILTIN_INACTIVE',
    segmentType: 'dynamic',
    criteria: { type: 'payment_level', level: 'inactive' },
    description: '领过券但从未产生实付的用户'
  }
];

async function routes(fastify, options) {
  fastify.get('/api/segments', { preHandler: [authMiddleware] }, async (request, reply) => {
    const { page = 1, pageSize = 10, status, keyword } = request.query;
    const offset = (page - 1) * pageSize;

    const where = {};
    if (status) where.status = status;
    if (keyword) {
      where[Op.or] = [
        { name: { [Op.like]: `%${keyword}%` } },
        { code: { [Op.like]: `%${keyword}%` } }
      ];
    }

    const { count, rows } = await UserSegment.findAndCountAll({
      where,
      offset,
      limit: pageSize,
      order: [['createdAt', 'DESC']],
      include: [{ model: User, as: 'creator', attributes: ['username', 'realName'] }]
    });

    return {
      list: rows,
      total: count,
      page: parseInt(page),
      pageSize: parseInt(pageSize)
    };
  });

  fastify.get('/api/segments/all', { preHandler: [authMiddleware] }, async (request, reply) => {
    const segments = await UserSegment.findAll({
      where: { status: 'active' },
      attributes: ['id', 'name', 'code', 'userCount', 'segmentType', 'criteria', 'description'],
      order: [['segmentType', 'ASC'], ['name', 'ASC']]
    });
    return segments;
  });

  fastify.get('/api/segments/:id', { preHandler: [authMiddleware] }, async (request, reply) => {
    const segment = await UserSegment.findByPk(request.params.id, {
      include: [{ model: User, as: 'creator', attributes: ['username', 'realName'] }]
    });
    if (!segment) {
      return reply.status(404).send({ message: '分层不存在' });
    }
    return segment;
  });

  fastify.get('/api/segments/:id/users', { preHandler: [authMiddleware] }, async (request, reply) => {
    const { limit = 100 } = request.query;
    const segment = await UserSegment.findByPk(request.params.id);
    if (!segment) {
      return reply.status(404).send({ message: '分层不存在' });
    }

    const userIds = await resolveSegmentUserIds(segment);
    const count = userIds.length;
    const previewIds = userIds.slice(0, parseInt(limit));

    return { userIds: previewIds, total: count };
  });

  fastify.post('/api/segments/:id/refresh-count', { preHandler: [authMiddleware, roleMiddleware(['admin', 'operator'])] }, async (request, reply) => {
    const segment = await UserSegment.findByPk(request.params.id);
    if (!segment) {
      return reply.status(404).send({ message: '分层不存在' });
    }

    if (segment.segmentType !== 'dynamic') {
      return reply.status(400).send({ message: '只有动态分层需要刷新用户数' });
    }

    const count = await getSegmentUserCount(segment);
    segment.userCount = count;
    await segment.save();

    return { userCount: count };
  });

  fastify.post('/api/segments', { preHandler: [authMiddleware, roleMiddleware(['admin', 'operator'])] }, async (request, reply) => {
    const data = request.body;
    data.code = data.code || generateSegmentCode();
    data.createdBy = request.user.id;

    if (data.segmentType === 'static' && data.userIds && Array.isArray(data.userIds)) {
      data.userCount = data.userIds.length;
    } else if (data.segmentType === 'dynamic') {
      data.userIds = null;
      data.userCount = 0;
    }

    const segment = await UserSegment.create(data);
    return segment;
  });

  fastify.put('/api/segments/:id', { preHandler: [authMiddleware, roleMiddleware(['admin', 'operator'])] }, async (request, reply) => {
    const segment = await UserSegment.findByPk(request.params.id);
    if (!segment) {
      return reply.status(404).send({ message: '分层不存在' });
    }

    const data = request.body;
    if (data.segmentType === 'static' && data.userIds && Array.isArray(data.userIds)) {
      data.userCount = data.userIds.length;
    } else if (data.segmentType === 'dynamic') {
      data.userIds = null;
    }

    await segment.update(data);
    return segment;
  });

  fastify.delete('/api/segments/:id', { preHandler: [authMiddleware, roleMiddleware(['admin', 'operator'])] }, async (request, reply) => {
    const segment = await UserSegment.findByPk(request.params.id);
    if (!segment) {
      return reply.status(404).send({ message: '分层不存在' });
    }
    if (segment.code && segment.code.startsWith('BUILTIN_')) {
      return reply.status(400).send({ message: '内置分层不可删除' });
    }
    await segment.destroy();
    return { message: '分层已删除' };
  });

  fastify.post('/api/segments/:id/toggle', { preHandler: [authMiddleware, roleMiddleware(['admin', 'operator'])] }, async (request, reply) => {
    const segment = await UserSegment.findByPk(request.params.id);
    if (!segment) {
      return reply.status(404).send({ message: '分层不存在' });
    }
    segment.status = segment.status === 'active' ? 'disabled' : 'active';
    await segment.save();
    return segment;
  });

  fastify.post('/api/segments/init-builtin', { preHandler: [authMiddleware, roleMiddleware(['admin', 'operator'])] }, async (request, reply) => {
    const results = [];
    for (const seg of BUILTIN_SEGMENTS) {
      const [instance, created] = await UserSegment.findOrCreate({
        where: { code: seg.code },
        defaults: { ...seg, createdBy: request.user.id, userCount: 0 }
      });
      results.push({ code: seg.code, name: seg.name, created });
    }
    return { message: '内置分层初始化完成', results };
  });
}

module.exports = routes;
