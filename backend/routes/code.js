const { authMiddleware, roleMiddleware } = require('../middleware/auth');
const { CouponCode, CouponBatch, ReceiveRecord, sequelize } = require('../models');
const { Op, QueryTypes } = require('sequelize');
const crypto = require('crypto');

async function routes(fastify, options) {
  fastify.get('/api/codes', { preHandler: [authMiddleware] }, async (request, reply) => {
    const { page = 1, pageSize = 10, batchId, status, keyword } = request.query;
    const offset = (page - 1) * pageSize;
    
    const where = {};
    if (batchId) where.batchId = batchId;
    if (status) where.status = status;
    if (keyword) where.code = { [Op.like]: `%${keyword}%` };

    const { count, rows } = await CouponCode.findAndCountAll({
      where,
      offset,
      limit: pageSize,
      order: [['createdAt', 'DESC']],
      include: [{ model: CouponBatch, attributes: ['name', 'batchCode', 'couponType', 'faceValue'] }]
    });

    return {
      list: rows,
      total: count,
      page: parseInt(page),
      pageSize: parseInt(pageSize)
    };
  });

  fastify.post('/api/codes/:id/receive', { preHandler: [authMiddleware] }, async (request, reply) => {
    const t = await sequelize.transaction();
    try {
      const { userId, deviceId } = request.body;
      const coupon = await CouponCode.findByPk(request.params.id, {
        lock: true,
        transaction: t
      });

      if (!coupon) {
        await t.rollback();
        return reply.status(404).send({ message: '券码不存在' });
      }

      if (coupon.status !== 'available') {
        await t.rollback();
        return reply.status(400).send({ message: '券码不可用' });
      }

      const batch = await CouponBatch.findByPk(coupon.batchId, { transaction: t });
      if (batch.status !== 'active') {
        await t.rollback();
        return reply.status(400).send({ message: '批次未激活' });
      }

      const userReceivedCount = await CouponCode.count({
        where: { batchId: batch.id, userId, status: { [Op.ne]: 'cancelled' } },
        transaction: t
      });

      if (userReceivedCount >= batch.limitPerPerson) {
        await t.rollback();
        return reply.status(400).send({ message: '已达到领取上限' });
      }

      coupon.userId = userId;
      coupon.status = 'received';
      coupon.receivedAt = new Date();
      coupon.ipAddress = request.ip;
      coupon.deviceInfo = { deviceId };

      if (batch.validityType === 'relative') {
        coupon.validStartTime = new Date();
        coupon.validEndTime = new Date(Date.now() + batch.validDays * 24 * 60 * 60 * 1000);
      } else {
        coupon.validStartTime = batch.startTime;
        coupon.validEndTime = batch.endTime;
      }

      await coupon.save({ transaction: t });

      await batch.increment('receivedQuantity', { by: 1, transaction: t });

      await ReceiveRecord.create({
        batchId: batch.id,
        couponId: coupon.id,
        userId,
        channel: batch.deliveryStrategy,
        deviceId,
        ipAddress: request.ip,
        userAgent: request.headers['user-agent']
      }, { transaction: t });

      await t.commit();
      return coupon;
    } catch (error) {
      await t.rollback();
      return reply.status(400).send({ message: error.message });
    }
  });

  fastify.post('/api/codes/redeem', { preHandler: [authMiddleware] }, async (request, reply) => {
    const { code, userId, deviceId } = request.body;

    const t = await sequelize.transaction();
    try {
      const coupon = await CouponCode.findOne({
        where: { code },
        lock: true,
        transaction: t
      });

      if (!coupon) {
        await t.rollback();
        return reply.status(404).send({ message: '兑换码不存在' });
      }

      if (coupon.status !== 'available') {
        await t.rollback();
        return reply.status(400).send({ message: '兑换码已被使用或已过期' });
      }

      const batch = await CouponBatch.findByPk(coupon.batchId, { transaction: t });
      if (batch.status !== 'active') {
        await t.rollback();
        return reply.status(400).send({ message: '活动已结束' });
      }

      coupon.userId = userId;
      coupon.status = 'received';
      coupon.receivedAt = new Date();
      coupon.ipAddress = request.ip;
      coupon.deviceInfo = { deviceId };
      coupon.validStartTime = new Date();
      coupon.validEndTime = batch.endTime || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

      await coupon.save({ transaction: t });
      await batch.increment('receivedQuantity', { by: 1, transaction: t });

      await ReceiveRecord.create({
        batchId: batch.id,
        couponId: coupon.id,
        userId,
        channel: 'redeem',
        deviceId,
        ipAddress: request.ip
      }, { transaction: t });

      await t.commit();
      return coupon;
    } catch (error) {
      await t.rollback();
      return reply.status(400).send({ message: error.message });
    }
  });

  fastify.post('/api/codes/:id/activate', { preHandler: [authMiddleware, roleMiddleware(['admin', 'operator'])] }, async (request, reply) => {
    const coupon = await CouponCode.findByPk(request.params.id);
    if (!coupon) {
      return reply.status(404).send({ message: '券码不存在' });
    }
    coupon.status = 'available';
    await coupon.save();
    return coupon;
  });

  fastify.post('/api/codes/:id/cancel', { preHandler: [authMiddleware, roleMiddleware(['admin', 'operator'])] }, async (request, reply) => {
    const t = await sequelize.transaction();
    try {
      const coupon = await CouponCode.findByPk(request.params.id, {
        include: [CouponBatch],
        transaction: t
      });

      if (!coupon) {
        await t.rollback();
        return reply.status(404).send({ message: '券码不存在' });
      }

      if (coupon.status === 'used') {
        await t.rollback();
        return reply.status(400).send({ message: '已使用的券码无法作废' });
      }

      const oldStatus = coupon.status;
      coupon.status = 'cancelled';
      await coupon.save({ transaction: t });

      if (oldStatus === 'received') {
        await coupon.CouponBatch.decrement('receivedQuantity', { by: 1, transaction: t });
      }

      await ReceiveRecord.update(
        { isCancelled: true, cancelledAt: new Date(), cancelledBy: request.user.id },
        { where: { couponId: coupon.id }, transaction: t }
      );

      await t.commit();
      return { message: '券码已作废' };
    } catch (error) {
      await t.rollback();
      return reply.status(400).send({ message: error.message });
    }
  });

  fastify.post('/api/batches/:id/generate-codes', { preHandler: [authMiddleware, roleMiddleware(['admin', 'operator'])] }, async (request, reply) => {
    const { count, prefix } = request.body;
    const batchId = request.params.id;

    const batch = await CouponBatch.findByPk(batchId);
    if (!batch) {
      return reply.status(404).send({ message: '批次不存在' });
    }

    const existingCount = await CouponCode.count({ where: { batchId } });
    if (existingCount + count > batch.totalQuantity) {
      return reply.status(400).send({ message: '超出批次总数量限制' });
    }

    const codes = [];
    for (let i = 0; i < count; i++) {
      const code = prefix
        ? prefix + crypto.randomBytes(4).toString('hex').toUpperCase()
        : crypto.randomBytes(8).toString('hex').toUpperCase();
      codes.push({ batchId, code });
    }

    await CouponCode.bulkCreate(codes);
    return { message: `成功生成 ${count} 个券码` };
  });
}

module.exports = routes;
