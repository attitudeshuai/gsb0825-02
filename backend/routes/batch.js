const { authMiddleware, roleMiddleware } = require('../middleware/auth');
const { CouponBatch, CouponCode, User, ReceiveRecord, sequelize } = require('../models');
const { querySegmentUserIds } = require('./analytics');
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

      // 锁顺序与领取/兑换/发放保持一致：先锁券码行，再锁批次行，避免交叉加锁导致死锁
      await CouponCode.update(
        { status: 'cancelled' },
        { where: { batchId: batch.id, status: { [Op.in]: ['available', 'received'] } }, transaction: t }
      );

      batch.status = 'cancelled';
      await batch.save({ transaction: t });

      await t.commit();
      return { message: '批次已取消' };
    } catch (error) {
      await t.rollback();
      return reply.status(400).send({ message: error.message });
    }
  });

  fastify.post('/api/batches/:id/deliver', { preHandler: [authMiddleware, roleMiddleware(['admin', 'operator'])] }, async (request, reply) => {
    const { userIds, segment } = request.body;
    const batchId = request.params.id;

    let targetUserIds = [];
    let channel = 'manual';

    if (segment && segment.type) {
      channel = 'targeted';
      try {
        targetUserIds = await querySegmentUserIds(segment.type);
      } catch (error) {
        return reply.status(400).send({ message: error.message });
      }
    } else if (Array.isArray(userIds)) {
      targetUserIds = [...new Set(userIds.map(id => parseInt(id)).filter(id => Number.isInteger(id) && id > 0))];
    }

    if (targetUserIds.length === 0) {
      return reply.status(400).send({ message: '没有可发放的目标用户' });
    }

    const batchExists = await CouponBatch.findByPk(batchId);
    if (!batchExists) {
      return reply.status(404).send({ message: '批次不存在' });
    }
    if (batchExists.status !== 'active') {
      return reply.status(400).send({ message: '只有进行中的批次才能发放' });
    }

    const results = [];
    for (const uid of targetUserIds) {
      const t = await sequelize.transaction();
      try {
        // 锁顺序与领取/兑换保持一致：先锁券码，再锁批次，避免交叉加锁导致死锁；
        // SKIP LOCKED：扫描可用券码时跳过被并发事务（如取消批次）锁住的行，
        // 否则扫描会阻塞在未提交的行版本上，与批量 UPDATE 形成锁等待环
        let coupon = await CouponCode.findOne({
          where: { batchId, status: 'available' },
          order: [['id', 'ASC']],
          lock: true,
          skipLocked: true,
          transaction: t
        });

        // 锁定批次行，串行化库存检查，防止超发
        const batch = await CouponBatch.findByPk(batchId, { lock: true, transaction: t });

        if (batch.receivedQuantity >= batch.totalQuantity) {
          throw new Error('库存不足');
        }

        // 防止重复发放：超过每人限领数量则跳过
        const userCount = await CouponCode.count({
          where: { batchId: batch.id, userId: uid, status: { [Op.ne]: 'cancelled' } },
          transaction: t
        });
        if (userCount >= batch.limitPerPerson) {
          throw new Error('该用户已达领取上限');
        }

        // 优先占用已有可用券码，不足时在总量限制内生成新券码
        if (!coupon) {
          const generatedCount = await CouponCode.count({ where: { batchId: batch.id }, transaction: t });
          if (generatedCount >= batch.totalQuantity) {
            throw new Error('券码库存不足');
          }
          coupon = await CouponCode.create({
            batchId: batch.id,
            code: 'D' + crypto.randomBytes(8).toString('hex').toUpperCase()
          }, { transaction: t });
        }

        coupon.userId = uid;
        coupon.status = 'received';
        coupon.receivedAt = new Date();
        coupon.ipAddress = request.ip;

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
          userId: uid,
          channel,
          ipAddress: request.ip,
          userAgent: request.headers['user-agent']
        }, { transaction: t });

        await t.commit();
        results.push({ userId: uid, success: true, code: coupon.code });
      } catch (error) {
        await t.rollback();
        results.push({ userId: uid, success: false, reason: error.message });
      }
    }

    const successCount = results.filter(r => r.success).length;
    return {
      total: targetUserIds.length,
      successCount,
      failCount: targetUserIds.length - successCount,
      results
    };
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
