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
    const { orderId, orderAmount, userId, productInfo } = request.body;
    const now = new Date();

    // 先读一次券码拿到 batchId（不加锁），以便统一按“先锁批次、再锁券码”的顺序加锁
    const couponMeta = await CouponCode.findByPk(request.params.id, { attributes: ['id', 'batchId'] });
    if (!couponMeta) {
      return reply.status(404).send({ message: '优惠券不存在' });
    }

    const t = await sequelize.transaction();
    try {
      // 统一加锁顺序：批次行锁 -> 券码行锁
      const batch = await CouponBatch.findByPk(couponMeta.batchId, { lock: t.LOCK.UPDATE, transaction: t });
      if (!batch) {
        await t.rollback();
        return reply.status(404).send({ message: '批次不存在' });
      }

      const coupon = await CouponCode.findByPk(request.params.id, {
        lock: t.LOCK.UPDATE,
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
    const { refundOrderId } = request.body;

    // 先读一次核销记录拿到 batchId/couponId（不加锁），以便统一按“先锁批次、再锁券码”的顺序加锁
    const recordMeta = await UseRecord.findByPk(request.params.id, { attributes: ['id', 'batchId', 'couponId'] });
    if (!recordMeta) {
      return reply.status(404).send({ message: '核销记录不存在' });
    }

    const t = await sequelize.transaction();
    try {
      // 统一加锁顺序：批次行锁 -> 券码行锁
      const batch = await CouponBatch.findByPk(recordMeta.batchId, { lock: t.LOCK.UPDATE, transaction: t });

      const coupon = await CouponCode.findByPk(recordMeta.couponId, { lock: t.LOCK.UPDATE, transaction: t });

      // 对核销记录行加锁后再校验 isRefunded，防止并发双退款把 usedQuantity 减两次
      const useRecord = await UseRecord.findByPk(request.params.id, { lock: t.LOCK.UPDATE, transaction: t });

      if (!useRecord) {
        await t.rollback();
        return reply.status(404).send({ message: '核销记录不存在' });
      }

      if (useRecord.isRefunded) {
        await t.rollback();
        return reply.status(400).send({ message: '该订单已退款' });
      }

      if (coupon) {
        coupon.status = 'received';
        coupon.usedAt = null;
        coupon.orderId = null;
        await coupon.save({ transaction: t });
      }

      if (batch) {
        await batch.decrement('usedQuantity', { by: 1, transaction: t });
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

    // 先不加锁读一次记录元信息，拿到涉及的批次集合
    const recordMetas = await ReceiveRecord.findAll({
      where: { id: { [Op.in]: ids } },
      attributes: ['id', 'couponId', 'batchId', 'isCancelled']
    });

    const t = await sequelize.transaction();
    try {
      // 统一加锁顺序：批次行锁 -> 券码行锁。涉及多个批次时按 batchId 升序加锁，避免并发批量作废互相死锁
      const batchIds = [...new Set(recordMetas.map(r => r.batchId).filter(id => id != null))].sort((a, b) => a - b);
      const batchMap = {};
      for (const batchId of batchIds) {
        batchMap[batchId] = await CouponBatch.findByPk(batchId, { lock: t.LOCK.UPDATE, transaction: t });
      }

      let cancelledCount = 0;
      for (const meta of recordMetas) {
        if (meta.isCancelled || !meta.couponId) continue;

        const coupon = await CouponCode.findByPk(meta.couponId, { lock: t.LOCK.UPDATE, transaction: t });
        const record = await ReceiveRecord.findByPk(meta.id, { lock: t.LOCK.UPDATE, transaction: t });

        // 加锁后重新校验状态，避免并发下重复作废
        if (!record || record.isCancelled || !coupon) continue;

        record.isCancelled = true;
        record.cancelledAt = new Date();
        record.cancelledBy = request.user.id;
        await record.save({ transaction: t });
        cancelledCount++;

        if (coupon.status === 'received') {
          coupon.status = 'cancelled';
          await coupon.save({ transaction: t });

          const batch = batchMap[meta.batchId];
          if (batch) {
            await batch.decrement('receivedQuantity', { by: 1, transaction: t });
          }
        }
      }

      await t.commit();
      return { message: `成功作废 ${cancelledCount} 条记录` };
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
