const { authMiddleware, roleMiddleware } = require('../middleware/auth');
const { ReceiveRecord, UseRecord, CouponCode, CouponBatch, sequelize } = require('../models');
const { Op, QueryTypes } = require('sequelize');
const dayjs = require('dayjs');

function calculateDiscount(batch, orderAmount) {
  let discount = 0;
  const orderAmountNum = parseFloat(orderAmount);
  const faceValue = parseFloat(batch.faceValue);
  const minAmount = parseFloat(batch.minAmount) || 0;

  if (orderAmountNum < minAmount) {
    return 0;
  }

  switch (batch.couponType) {
    case 'fixed':
    case 'direct':
    case 'shipping':
    case 'exchange':
      discount = faceValue;
      break;
    case 'discount':
      discount = orderAmountNum * (1 - parseFloat(batch.discountRate));
      if (batch.maxDiscount) {
        discount = Math.min(discount, parseFloat(batch.maxDiscount));
      }
      break;
  }

  return Math.min(discount, orderAmountNum);
}

async function routes(fastify, options) {
  fastify.get('/api/records/receive', { preHandler: [authMiddleware] }, async (request, reply) => {
    const { page = 1, pageSize = 10, batchId, userId, channel, startDate, endDate } = request.query;
    const offset = (page - 1) * pageSize;
    
    const where = {};
    if (batchId) where.batchId = batchId;
    if (userId) where.userId = userId;
    if (channel) where.channel = channel;
    if (startDate && endDate) {
      where.createdAt = { [Op.between]: [new Date(startDate), new Date(endDate)] };
    }

    const { count, rows } = await ReceiveRecord.findAndCountAll({
      where,
      offset,
      limit: pageSize,
      order: [['createdAt', 'DESC']],
      include: [
        { model: CouponBatch, attributes: ['name', 'batchCode', 'couponType', 'faceValue'] },
        { model: CouponCode, attributes: ['code', 'status'] }
      ]
    });

    return {
      list: rows,
      total: count,
      page: parseInt(page),
      pageSize: parseInt(pageSize)
    };
  });

  fastify.get('/api/records/use', { preHandler: [authMiddleware] }, async (request, reply) => {
    const { page = 1, pageSize = 10, batchId, userId, orderId, startDate, endDate } = request.query;
    const offset = (page - 1) * pageSize;
    
    const where = {};
    if (batchId) where.batchId = batchId;
    if (userId) where.userId = userId;
    if (orderId) where.orderId = { [Op.like]: `%${orderId}%` };
    if (startDate && endDate) {
      where.createdAt = { [Op.between]: [new Date(startDate), new Date(endDate)] };
    }

    const { count, rows } = await UseRecord.findAndCountAll({
      where,
      offset,
      limit: pageSize,
      order: [['createdAt', 'DESC']],
      include: [
        { model: CouponBatch, attributes: ['name', 'batchCode', 'couponType'] },
        { model: CouponCode, attributes: ['code'] }
      ]
    });

    return {
      list: rows,
      total: count,
      page: parseInt(page),
      pageSize: parseInt(pageSize)
    };
  });

  fastify.post('/api/codes/:id/use', { preHandler: [authMiddleware] }, async (request, reply) => {
    const t = await sequelize.transaction();
    try {
      const { orderId, orderAmount, userId, productInfo } = request.body;
      const now = new Date();

      const coupon = await CouponCode.findByPk(request.params.id, {
        lock: true,
        transaction: t
      });

      if (!coupon) {
        await t.rollback();
        return reply.status(404).send({ message: '优惠券不存在' });
      }

      if (coupon.status !== 'received') {
        await t.rollback();
        return reply.status(400).send({ message: '优惠券不可用' });
      }

      if (coupon.userId != userId) {
        await t.rollback();
        return reply.status(400).send({ message: '优惠券不属于该用户' });
      }

      if (coupon.validEndTime && now > coupon.validEndTime) {
        await t.rollback();
        return reply.status(400).send({ message: '优惠券已过期' });
      }

      if (coupon.validStartTime && now < coupon.validStartTime) {
        await t.rollback();
        return reply.status(400).send({ message: '优惠券未到使用时间' });
      }

      const batch = await CouponBatch.findByPk(coupon.batchId, { transaction: t });
      const discountAmount = calculateDiscount(batch, orderAmount);

      if (discountAmount <= 0) {
        await t.rollback();
        return reply.status(400).send({ message: '订单金额未达到使用门槛' });
      }

      coupon.status = 'used';
      coupon.usedAt = now;
      coupon.orderId = orderId;
      await coupon.save({ transaction: t });

      await batch.increment('usedQuantity', { by: 1, transaction: t });

      const useRecord = await UseRecord.create({
        batchId: batch.id,
        couponId: coupon.id,
        userId,
        orderId,
        orderAmount,
        discountAmount,
        actualPayAmount: parseFloat(orderAmount) - discountAmount,
        productInfo
      }, { transaction: t });

      await t.commit();
      return {
        coupon,
        useRecord,
        discountAmount
      };
    } catch (error) {
      await t.rollback();
      return reply.status(400).send({ message: error.message });
    }
  });

  fastify.post('/api/records/use/:id/refund', { preHandler: [authMiddleware, roleMiddleware(['admin', 'finance'])] }, async (request, reply) => {
    const t = await sequelize.transaction();
    try {
      const { refundOrderId } = request.body;
      const useRecord = await UseRecord.findByPk(request.params.id, {
        include: [CouponCode, CouponBatch],
        transaction: t
      });

      if (!useRecord) {
        await t.rollback();
        return reply.status(404).send({ message: '核销记录不存在' });
      }

      if (useRecord.isRefunded) {
        await t.rollback();
        return reply.status(400).send({ message: '该订单已退款' });
      }

      const coupon = useRecord.CouponCode;
      if (coupon) {
        coupon.status = 'received';
        coupon.usedAt = null;
        coupon.orderId = null;
        await coupon.save({ transaction: t });
      }

      if (useRecord.CouponBatch) {
        await useRecord.CouponBatch.decrement('usedQuantity', { by: 1, transaction: t });
      }

      useRecord.isRefunded = true;
      useRecord.refundedAt = new Date();
      useRecord.refundOrderId = refundOrderId;
      await useRecord.save({ transaction: t });

      await t.commit();
      return { message: '退款成功，优惠券已退回' };
    } catch (error) {
      await t.rollback();
      return reply.status(400).send({ message: error.message });
    }
  });

  fastify.post('/api/records/receive/batch-cancel', { preHandler: [authMiddleware, roleMiddleware(['admin', 'operator'])] }, async (request, reply) => {
    const { ids } = request.body;
    const t = await sequelize.transaction();

    try {
      const records = await ReceiveRecord.findAll({
        where: { id: { [Op.in]: ids } },
        include: [CouponCode, CouponBatch],
        transaction: t
      });

      for (const record of records) {
        if (!record.isCancelled && record.CouponCode) {
          record.isCancelled = true;
          record.cancelledAt = new Date();
          record.cancelledBy = request.user.id;
          await record.save({ transaction: t });

          if (record.CouponCode.status === 'received') {
            record.CouponCode.status = 'cancelled';
            await record.CouponCode.save({ transaction: t });

            if (record.CouponBatch) {
              await record.CouponBatch.decrement('receivedQuantity', { by: 1, transaction: t });
            }
          }
        }
      }

      await t.commit();
      return { message: `成功作废 ${records.length} 条记录` };
    } catch (error) {
      await t.rollback();
      return reply.status(400).send({ message: error.message });
    }
  });

  fastify.post('/api/user-coupons', { preHandler: [authMiddleware] }, async (request, reply) => {
    const { userId, status, batchId } = request.body;
    
    const where = { userId };
    if (status) where.status = status;
    if (batchId) where.batchId = batchId;

    const coupons = await CouponCode.findAll({
      where,
      order: [['receivedAt', 'DESC']],
      include: [{ model: CouponBatch, attributes: ['name', 'couponType', 'faceValue', 'discountRate', 'minAmount', 'description'] }]
    });

    return coupons;
  });
}

module.exports = routes;
