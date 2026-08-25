const { authMiddleware, roleMiddleware } = require('../middleware/auth');
const { CouponCode, CouponBatch, ReceiveRecord, sequelize } = require('../models');
const { Op } = require('sequelize');
const crypto = require('crypto');
const { checkRisk } = require('../services/riskService');
const { assignCouponToUser, getUserReceivedCount } = require('../services/couponService');

async function lockBatchAndCoupon(t, batchId, couponId) {
  const batch = await CouponBatch.findByPk(batchId, {
    lock: true,
    transaction: t
  });

  const coupon = await CouponCode.findByPk(couponId, {
    lock: true,
    transaction: t
  });

  return { batch, coupon };
}

function validateBatchAndStock(batch) {
  if (!batch) return '批次不存在';
  if (batch.status !== 'active') return '批次未激活或已结束';

  const now = new Date();
  if (batch.startTime && now < batch.startTime) return '活动尚未开始';
  if (batch.endTime && now > batch.endTime) return '活动已结束';
  if (batch.receivedQuantity >= batch.totalQuantity) return '优惠券已被领完';

  return null;
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

  fastify.post('/api/batches/:id/receive', { preHandler: [authMiddleware] }, async (request, reply) => {
    const { userId, deviceId } = request.body;
    const batchId = request.params.id;
    const ipAddress = request.ip;
    const userAgent = request.headers['user-agent'];

    const riskResult = await checkRisk(userId, deviceId, ipAddress, batchId);
    if (riskResult.blocked) {
      return reply.status(400).send({ message: riskResult.reason, risk: riskResult });
    }

    const t = await sequelize.transaction();
    try {
      const batch = await CouponBatch.findByPk(batchId, {
        lock: true,
        transaction: t
      });

      const batchError = validateBatchAndStock(batch);
      if (batchError) {
        await t.rollback();
        return reply.status(400).send({ message: batchError });
      }

      const userReceivedCount = await getUserReceivedCount(t, batchId, userId);
      if (userReceivedCount >= batch.limitPerPerson) {
        await t.rollback();
        return reply.status(400).send({ message: '已达到领取上限' });
      }

      let coupon = await CouponCode.findOne({
        where: { batchId, status: 'available' },
        lock: true,
        transaction: t,
        order: [['id', 'ASC']]
      });

      if (!coupon) {
        coupon = await CouponCode.create({
          batchId,
          code: crypto.randomBytes(8).toString('hex').toUpperCase(),
          status: 'available'
        }, { transaction: t });
      }

      const result = await assignCouponToUser(
        t,
        batch,
        coupon,
        userId,
        'receive',
        deviceId,
        ipAddress,
        userAgent,
        riskResult
      );

      await t.commit();
      return result.coupon;
    } catch (error) {
      await t.rollback();
      return reply.status(400).send({ message: error.message });
    }
  });

  fastify.post('/api/codes/:id/receive', { preHandler: [authMiddleware] }, async (request, reply) => {
    const { userId, deviceId } = request.body;
    const ipAddress = request.ip;
    const userAgent = request.headers['user-agent'];

    const riskResult = await checkRisk(userId, deviceId, ipAddress, null);
    if (riskResult.blocked) {
      return reply.status(400).send({ message: riskResult.reason, risk: riskResult });
    }

    const existingCoupon = await CouponCode.findByPk(request.params.id, {
      attributes: ['id', 'batchId']
    });
    if (!existingCoupon) {
      return reply.status(404).send({ message: '券码不存在' });
    }

    const t = await sequelize.transaction();
    try {
      const { batch, coupon } = await lockBatchAndCoupon(t, existingCoupon.batchId, existingCoupon.id);

      const batchError = validateBatchAndStock(batch);
      if (batchError) {
        await t.rollback();
        return reply.status(400).send({ message: batchError });
      }

      if (!coupon) {
        await t.rollback();
        return reply.status(404).send({ message: '券码不存在' });
      }

      if (coupon.status !== 'available') {
        await t.rollback();
        return reply.status(400).send({ message: '券码不可用' });
      }

      const userReceivedCount = await getUserReceivedCount(t, batch.id, userId);
      if (userReceivedCount >= batch.limitPerPerson) {
        await t.rollback();
        return reply.status(400).send({ message: '已达到领取上限' });
      }

      const result = await assignCouponToUser(
        t,
        batch,
        coupon,
        userId,
        'receive',
        deviceId,
        ipAddress,
        userAgent,
        riskResult
      );

      await t.commit();
      return result.coupon;
    } catch (error) {
      await t.rollback();
      return reply.status(400).send({ message: error.message });
    }
  });

  fastify.post('/api/codes/redeem', { preHandler: [authMiddleware] }, async (request, reply) => {
    const { code, userId, deviceId } = request.body;
    const ipAddress = request.ip;
    const userAgent = request.headers['user-agent'];

    const riskResult = await checkRisk(userId, deviceId, ipAddress, null);
    if (riskResult.blocked) {
      return reply.status(400).send({ message: riskResult.reason, risk: riskResult });
    }

    const existingCoupon = await CouponCode.findOne({
      where: { code },
      attributes: ['id', 'batchId']
    });
    if (!existingCoupon) {
      return reply.status(404).send({ message: '兑换码不存在' });
    }

    const t = await sequelize.transaction();
    try {
      const { batch, coupon } = await lockBatchAndCoupon(t, existingCoupon.batchId, existingCoupon.id);

      const batchError = validateBatchAndStock(batch);
      if (batchError) {
        await t.rollback();
        return reply.status(400).send({ message: batchError });
      }

      if (!coupon) {
        await t.rollback();
        return reply.status(404).send({ message: '兑换码不存在' });
      }

      if (coupon.status !== 'available') {
        await t.rollback();
        return reply.status(400).send({ message: '兑换码已被使用或已过期' });
      }

      const userReceivedCount = await getUserReceivedCount(t, batch.id, userId);
      if (userReceivedCount >= batch.limitPerPerson) {
        await t.rollback();
        return reply.status(400).send({ message: '已达到领取上限' });
      }

      coupon.userId = userId;
      coupon.status = 'received';
      coupon.receivedAt = new Date();
      coupon.ipAddress = ipAddress;
      coupon.deviceInfo = { deviceId };
      coupon.validStartTime = new Date();
      coupon.validEndTime = batch.endTime || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      await coupon.save({ transaction: t });

      const [affectedCount] = await CouponBatch.update(
        { receivedQuantity: sequelize.literal('received_quantity + 1') },
        {
          where: {
            id: batch.id,
            receivedQuantity: { [Op.lt]: sequelize.col('total_quantity') }
          },
          transaction: t
        }
      );

      if (affectedCount === 0) {
        throw new Error('库存不足，兑换失败');
      }

      await ReceiveRecord.create({
        batchId: batch.id,
        couponId: coupon.id,
        userId,
        channel: 'redeem',
        deviceId,
        ipAddress,
        userAgent,
        riskLevel: riskResult.riskLevel || 'normal',
        riskReason: riskResult.riskReason || null
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
    const existingCoupon = await CouponCode.findByPk(request.params.id, {
      attributes: ['id', 'batchId']
    });
    if (!existingCoupon) {
      return reply.status(404).send({ message: '券码不存在' });
    }

    const t = await sequelize.transaction();
    try {
      const batch = await CouponBatch.findByPk(existingCoupon.batchId, {
        lock: true,
        transaction: t
      });

      const coupon = await CouponCode.findByPk(existingCoupon.id, {
        lock: true,
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
        await CouponBatch.update(
          { receivedQuantity: sequelize.literal('received_quantity - 1') },
          {
            where: { id: batch.id, receivedQuantity: { [Op.gt]: 0 } },
            transaction: t
          }
        );
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
