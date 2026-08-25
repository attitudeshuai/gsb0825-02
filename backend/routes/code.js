const { authMiddleware, roleMiddleware } = require('../middleware/auth');
const { CouponCode, CouponBatch, ReceiveRecord, sequelize } = require('../models');
const { Op, QueryTypes } = require('sequelize');
const crypto = require('crypto');
const { checkRisk } = require('../services/riskService');
const { claimSpecificCoupon } = require('../services/couponService');

function buildContext(request, body) {
  return {
    ipAddress: request.ip,
    deviceId: body.deviceId || null,
    userAgent: request.headers['user-agent'] || null
  };
}

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
    try {
      const { userId, deviceId } = request.body;
      if (!userId) {
        return reply.status(400).send({ message: '缺少用户ID' });
      }

      const preCoupon = await CouponCode.findByPk(request.params.id);
      if (!preCoupon) {
        return reply.status(404).send({ message: '券码不存在' });
      }

      const context = buildContext(request, request.body);
      const risk = await checkRisk({
        userId,
        deviceId,
        ipAddress: request.ip,
        batchId: preCoupon.batchId,
        scene: 'receive'
      });

      if (risk.blocked) {
        return reply.status(403).send({ message: risk.reason, blocked: true, riskLevel: risk.riskLevel });
      }

      const coupon = await claimSpecificCoupon({
        couponId: request.params.id,
        userId,
        channel: 'receive',
        context,
        risk
      });

      return { ...coupon.toJSON(), riskLevel: risk.riskLevel, riskReason: risk.riskReason || null };
    } catch (error) {
      return reply.status(error.statusCode || 400).send({ message: error.message });
    }
  });

  fastify.post('/api/codes/redeem', { preHandler: [authMiddleware] }, async (request, reply) => {
    try {
      const { code, userId, deviceId } = request.body;
      if (!code || !userId) {
        return reply.status(400).send({ message: '缺少兑换码或用户ID' });
      }

      const preCoupon = await CouponCode.findOne({ where: { code } });
      if (!preCoupon) {
        return reply.status(404).send({ message: '兑换码不存在' });
      }

      const context = buildContext(request, request.body);
      const risk = await checkRisk({
        userId,
        deviceId,
        ipAddress: request.ip,
        batchId: preCoupon.batchId,
        scene: 'redeem'
      });

      if (risk.blocked) {
        return reply.status(403).send({ message: risk.reason, blocked: true, riskLevel: risk.riskLevel });
      }

      const coupon = await claimSpecificCoupon({
        code,
        userId,
        channel: 'redeem',
        context,
        risk
      });

      return { ...coupon.toJSON(), riskLevel: risk.riskLevel, riskReason: risk.riskReason || null };
    } catch (error) {
      return reply.status(error.statusCode || 400).send({ message: error.message });
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
    const preCoupon = await CouponCode.findByPk(request.params.id);
    if (!preCoupon) {
      return reply.status(404).send({ message: '券码不存在' });
    }

    const t = await sequelize.transaction();
    try {
      const batch = await CouponBatch.findByPk(preCoupon.batchId, { lock: true, transaction: t });
      const coupon = await CouponCode.findByPk(preCoupon.id, { lock: true, transaction: t });

      if (coupon.status === 'used') {
        await t.rollback();
        return reply.status(400).send({ message: '已使用的券码无法作废' });
      }

      const oldStatus = coupon.status;
      coupon.status = 'cancelled';
      await coupon.save({ transaction: t });

      if (oldStatus === 'received' && batch) {
        await batch.decrement('receivedQuantity', { by: 1, transaction: t });
      }

      await ReceiveRecord.update(
        { isCancelled: true, cancelledAt: new Date(), cancelledBy: request.user.id },
        { where: { couponId: coupon.id, isCancelled: false }, transaction: t }
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
