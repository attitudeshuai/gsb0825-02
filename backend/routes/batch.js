const { authMiddleware, roleMiddleware } = require('../middleware/auth');
const { CouponBatch, CouponCode, User, sequelize } = require('../models');
const { Op, QueryTypes } = require('sequelize');
const dayjs = require('dayjs');
const crypto = require('crypto');

function generateBatchCode() {
  return 'BATCH' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).substring(2, 6).toUpperCase();
}

async function routes(fastify, options) {
  fastify.get('/api/batches', { preHandler: [authMiddleware] }, async (request, reply) => {
    const { page = 1, pageSize = 10, status, couponType, keyword } = request.query;
    const offset = (page - 1) * pageSize;
    
    const where = {};
    if (status) where.status = status;
    if (couponType) where.couponType = couponType;
    if (keyword) {
      where[Op.or] = [
        { name: { [Op.like]: `%${keyword}%` } },
        { batchCode: { [Op.like]: `%${keyword}%` } }
      ];
    }

    const { count, rows } = await CouponBatch.findAndCountAll({
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

  fastify.get('/api/batches/:id', { preHandler: [authMiddleware] }, async (request, reply) => {
    const batch = await CouponBatch.findByPk(request.params.id, {
      include: [{ model: User, as: 'creator', attributes: ['username', 'realName'] }]
    });
    if (!batch) {
      return reply.status(404).send({ message: '批次不存在' });
    }
    return batch;
  });

  fastify.post('/api/batches', { preHandler: [authMiddleware, roleMiddleware(['admin', 'operator'])] }, async (request, reply) => {
    const t = await sequelize.transaction();
    try {
      const data = request.body;
      data.batchCode = data.batchCode || generateBatchCode();
      data.createdBy = request.user.id;
      data.status = data.status || 'pending';

      const batch = await CouponBatch.create(data, { transaction: t });

      if (data.deliveryStrategy === 'redeem') {
        const codes = [];
        for (let i = 0; i < data.totalQuantity; i++) {
          const code = data.codePrefix
            ? data.codePrefix + crypto.randomBytes(4).toString('hex').toUpperCase()
            : crypto.randomBytes(8).toString('hex').toUpperCase();
          codes.push({
            batchId: batch.id,
            code
          });
        }
        await CouponCode.bulkCreate(codes, { transaction: t });
      }

      await t.commit();
      return batch;
    } catch (error) {
      await t.rollback();
      return reply.status(400).send({ message: error.message });
    }
  });

  fastify.put('/api/batches/:id', { preHandler: [authMiddleware, roleMiddleware(['admin', 'operator'])] }, async (request, reply) => {
    const batch = await CouponBatch.findByPk(request.params.id);
    if (!batch) {
      return reply.status(404).send({ message: '批次不存在' });
    }

    if (batch.status !== 'pending') {
      return reply.status(400).send({ message: '只能编辑未开始的批次' });
    }

    await batch.update(request.body);
    return batch;
  });

  fastify.post('/api/batches/:id/activate', { preHandler: [authMiddleware, roleMiddleware(['admin', 'operator'])] }, async (request, reply) => {
    const batch = await CouponBatch.findByPk(request.params.id);
    if (!batch) {
      return reply.status(404).send({ message: '批次不存在' });
    }

    if (batch.status !== 'pending') {
      return reply.status(400).send({ message: '只能激活未开始的批次' });
    }

    batch.status = 'active';
    batch.startTime = batch.startTime || new Date();
    await batch.save();
    return batch;
  });

  fastify.post('/api/batches/:id/stop', { preHandler: [authMiddleware, roleMiddleware(['admin', 'operator'])] }, async (request, reply) => {
    const batch = await CouponBatch.findByPk(request.params.id);
    if (!batch) {
      return reply.status(404).send({ message: '批次不存在' });
    }

    batch.status = 'ended';
    batch.endTime = new Date();
    await batch.save();
    return batch;
  });

  fastify.post('/api/batches/:id/cancel', { preHandler: [authMiddleware, roleMiddleware(['admin'])] }, async (request, reply) => {
    const t = await sequelize.transaction();
    try {
      const batch = await CouponBatch.findByPk(request.params.id, { transaction: t });
      if (!batch) {
        await t.rollback();
        return reply.status(404).send({ message: '批次不存在' });
      }

      batch.status = 'cancelled';
      await batch.save({ transaction: t });

      await CouponCode.update(
        { status: 'cancelled' },
        { where: { batchId: batch.id, status: { [Op.in]: ['available', 'received'] } }, transaction: t }
      );

      await t.commit();
      return { message: '批次已取消' };
    } catch (error) {
      await t.rollback();
      return reply.status(400).send({ message: error.message });
    }
  });

  fastify.get('/api/batches/statistics/summary', { preHandler: [authMiddleware] }, async (request, reply) => {
    const today = dayjs().format('YYYY-MM-DD');
    
    const result = await sequelize.query(`
      SELECT
        (SELECT COUNT(*) FROM coupon_batches) as total_batches,
        (SELECT COUNT(*) FROM coupon_batches WHERE status = 'active') as active_batches,
        (SELECT COALESCE(SUM(received_quantity), 0) FROM coupon_batches) as total_received,
        (SELECT COALESCE(SUM(used_quantity), 0) FROM coupon_batches) as total_used,
        (SELECT COUNT(*) FROM receive_records WHERE DATE(created_at) = ?) as today_received,
        (SELECT COUNT(*) FROM use_records WHERE DATE(created_at) = ?) as today_used,
        (SELECT COALESCE(SUM(actual_pay_amount), 0) FROM use_records) as total_gmv,
        (SELECT COALESCE(SUM(discount_amount), 0) FROM use_records) as total_discount
    `, {
      replacements: [today, today],
      type: QueryTypes.SELECT
    });

    return result[0];
  });
}

module.exports = routes;
