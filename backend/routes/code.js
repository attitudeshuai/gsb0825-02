const { authMiddleware, roleMiddleware } = require('../middleware/auth');
const { CouponCode, CouponBatch, ReceiveRecord, sequelize } = require('../models');
const { Op, QueryTypes } = require('sequelize');
const crypto = require('crypto');
const { checkRisk, checkBlacklist } = require('../services/riskService');

// 生成一个券码/兑换码
function generateCode(prefix) {
  return prefix
    ? prefix + crypto.randomBytes(4).toString('hex').toUpperCase()
    : crypto.randomBytes(8).toString('hex').toUpperCase();
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
    const { userId, deviceId } = request.body;
    const ipAddress = request.ip;

    // 领取前先过风控（黑名单 + 频率/IP/设备规则），命中 block 直接拦下并留拦截记录
    const risk = await checkRisk({ userId, deviceId, ipAddress });
    if (risk.blocked) {
      return reply.status(403).send({ message: `领取被风控拦截：${risk.reason}`, blocked: true, reason: risk.reason });
    }

    // 先读一次券码拿到 batchId（不加锁），以便统一按“先锁批次、再锁券码”的顺序加锁
    const couponMeta = await CouponCode.findByPk(request.params.id, { attributes: ['id', 'batchId'] });
    if (!couponMeta) {
      return reply.status(404).send({ message: '券码不存在' });
    }

    const t = await sequelize.transaction();
    try {
      // 统一加锁顺序：批次行锁 -> 券码行锁。批次行锁同时把“每人限领”计数串行化
      const batch = await CouponBatch.findByPk(couponMeta.batchId, { lock: t.LOCK.UPDATE, transaction: t });
      if (!batch || batch.status !== 'active') {
        await t.rollback();
        return reply.status(400).send({ message: '批次未激活' });
      }

      const coupon = await CouponCode.findByPk(request.params.id, {
        lock: t.LOCK.UPDATE,
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
        channel: 'receive',
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
    const ipAddress = request.ip;

    // 兑换前先过风控（黑名单 + 频率/IP/设备规则），命中 block 直接拦下并留拦截记录
    const risk = await checkRisk({ userId, deviceId, ipAddress });
    if (risk.blocked) {
      return reply.status(403).send({ message: `兑换被风控拦截：${risk.reason}`, blocked: true, reason: risk.reason });
    }

    // 先按兑换码读一次拿到 batchId（不加锁），以便统一按“先锁批次、再锁券码”的顺序加锁
    const couponMeta = await CouponCode.findOne({ where: { code }, attributes: ['id', 'batchId'] });
    if (!couponMeta) {
      return reply.status(404).send({ message: '兑换码不存在' });
    }

    const t = await sequelize.transaction();
    try {
      // 统一加锁顺序：批次行锁 -> 券码行锁。批次行锁同时把“每人限领”计数串行化
      const batch = await CouponBatch.findByPk(couponMeta.batchId, { lock: t.LOCK.UPDATE, transaction: t });
      if (!batch || batch.status !== 'active') {
        await t.rollback();
        return reply.status(400).send({ message: '活动已结束' });
      }

      const coupon = await CouponCode.findByPk(couponMeta.id, {
        lock: t.LOCK.UPDATE,
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

      // 兑换码兑换同样走每人限领校验，防止同一用户用多个兑换码无限兑换同一批次
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

      // 有效期处理与领取对齐：relative 按 validDays 计算，fixed 用批次起止时间
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
    // 先读一次券码拿到 batchId（不加锁），以便统一按“先锁批次、再锁券码”的顺序加锁
    const couponMeta = await CouponCode.findByPk(request.params.id, { attributes: ['id', 'batchId'] });
    if (!couponMeta) {
      return reply.status(404).send({ message: '券码不存在' });
    }

    const t = await sequelize.transaction();
    try {
      // 统一加锁顺序：批次行锁 -> 券码行锁
      const batch = await CouponBatch.findByPk(couponMeta.batchId, { lock: t.LOCK.UPDATE, transaction: t });

      const coupon = await CouponCode.findByPk(request.params.id, {
        lock: t.LOCK.UPDATE,
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

      if (oldStatus === 'received' && batch) {
        await batch.decrement('receivedQuantity', { by: 1, transaction: t });
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

  // 给单个用户发放一张券：独立事务。先锁批次行（统一加锁顺序，并把每人限领计数串行化），
  // 券码池为空时按批次总量自动补生成，避免 manual/targeted 批次没预生成券码而永远库存不足
  async function issueOneCoupon(batchId, userId, channel) {
    const t = await sequelize.transaction();
    try {
      // 统一加锁顺序：批次行锁 -> 券码行锁
      const batch = await CouponBatch.findByPk(batchId, { lock: t.LOCK.UPDATE, transaction: t });
      if (!batch) {
        await t.rollback();
        return { userId, success: false, message: '批次不存在' };
      }
      if (batch.status !== 'active') {
        await t.rollback();
        return { userId, success: false, message: '批次未激活' };
      }

      // 每人限领校验（在批次行锁内完成，串行化，避免并发重复发放/超限）
      const userReceivedCount = await CouponCode.count({
        where: { batchId: batch.id, userId, status: { [Op.ne]: 'cancelled' } },
        transaction: t
      });
      if (userReceivedCount >= batch.limitPerPerson) {
        await t.rollback();
        return { userId, success: false, message: '已达到该用户领取上限' };
      }

      // 优先抢占一张已有的可用券码（行锁 + 跳过已被锁定的行）
      let coupon = await CouponCode.findOne({
        where: { batchId: batch.id, status: 'available' },
        order: [['id', 'ASC']],
        lock: t.LOCK.UPDATE,
        skipLocked: true,
        transaction: t
      });

      // 券码池为空：在批次总量范围内自动补生成一张，防止超发
      if (!coupon) {
        const existingCount = await CouponCode.count({ where: { batchId: batch.id }, transaction: t });
        if (existingCount >= batch.totalQuantity) {
          await t.rollback();
          return { userId, success: false, message: '批次库存不足' };
        }
        coupon = await CouponCode.create({ batchId: batch.id, code: generateCode() }, { transaction: t });
      }

      const now = new Date();
      coupon.userId = userId;
      coupon.status = 'received';
      coupon.receivedAt = now;

      if (batch.validityType === 'relative') {
        coupon.validStartTime = now;
        coupon.validEndTime = new Date(now.getTime() + batch.validDays * 24 * 60 * 60 * 1000);
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
        channel,
        cancelledBy: null
      }, { transaction: t });

      await t.commit();
      return { userId, success: true, couponId: coupon.id, code: coupon.code };
    } catch (error) {
      await t.rollback();
      return { userId, success: false, message: error.message };
    }
  }

  // 处理一批用户的发放：逐个发放并按黑名单拦截，返回汇总结果
  async function issueToUsers(batchId, userIds, channel) {
    const results = [];
    for (const userId of userIds) {
      // 后台发放仅走黑名单拦截（命中会留拦截记录）
      const risk = await checkBlacklist({ userId });
      if (risk.blocked) {
        results.push({ userId, success: false, message: `已拦截：${risk.reason}` });
        continue;
      }
      results.push(await issueOneCoupon(batchId, userId, channel));
    }
    return results;
  }

  // 手动发放：给一个或一批指定用户发券
  fastify.post('/api/codes/issue', { preHandler: [authMiddleware, roleMiddleware(['admin', 'operator'])] }, async (request, reply) => {
    const { batchId, userIds } = request.body;

    if (!batchId || !Array.isArray(userIds) || userIds.length === 0) {
      return reply.status(400).send({ message: '请指定批次和至少一个用户' });
    }

    const batch = await CouponBatch.findByPk(batchId);
    if (!batch) {
      return reply.status(404).send({ message: '批次不存在' });
    }
    if (batch.status !== 'active') {
      return reply.status(400).send({ message: '批次未激活，无法发放' });
    }

    // 去重，避免同一用户在一次请求里被重复计入
    const uniqueUserIds = [...new Set(userIds.map(Number).filter(id => !Number.isNaN(id)))];
    const results = await issueToUsers(batch.id, uniqueUserIds, 'manual');

    const successCount = results.filter(r => r.success).length;
    return {
      message: `发放完成：成功 ${successCount} 个，失败 ${results.length - successCount} 个`,
      successCount,
      failCount: results.length - successCount,
      results
    };
  });

  // 定向发放：按用户分层发券（复用数据分析的分层口径，取对应用户ID发放）
  fastify.post('/api/codes/issue-targeted', { preHandler: [authMiddleware, roleMiddleware(['admin', 'operator'])] }, async (request, reply) => {
    const { batchId, segment } = request.body;
    const validSegments = ['highValue', 'active', 'normal', 'inactive'];

    if (!batchId || !validSegments.includes(segment)) {
      return reply.status(400).send({ message: '请指定批次和有效的用户分层' });
    }

    const batch = await CouponBatch.findByPk(batchId);
    if (!batch) {
      return reply.status(404).send({ message: '批次不存在' });
    }
    if (batch.status !== 'active') {
      return reply.status(400).send({ message: '批次未激活，无法发放' });
    }

    // 复用现有分层口径：按累计实付金额划分用户层级
    const rows = await sequelize.query(`
      SELECT cc.user_id AS "userId",
        COALESCE(SUM(ur.actual_pay_amount), 0) AS total_pay
      FROM coupon_codes cc
      LEFT JOIN use_records ur ON cc.id = ur.coupon_id
      WHERE cc.user_id IS NOT NULL
      GROUP BY cc.user_id
    `, { type: QueryTypes.SELECT });

    const segmentOf = (totalPay) => {
      const pay = parseFloat(totalPay || 0);
      if (pay >= 10000) return 'highValue';
      if (pay >= 1000) return 'active';
      if (pay > 0) return 'normal';
      return 'inactive';
    };

    const userIds = rows
      .filter(r => segmentOf(r.total_pay) === segment)
      .map(r => Number(r.userId));

    if (userIds.length === 0) {
      return reply.status(400).send({ message: '该分层下暂无用户' });
    }

    const results = await issueToUsers(batch.id, userIds, 'targeted');
    const successCount = results.filter(r => r.success).length;

    return {
      message: `定向发放完成：命中用户 ${userIds.length} 个，成功 ${successCount} 个，失败 ${results.length - successCount} 个`,
      segment,
      targetCount: userIds.length,
      successCount,
      failCount: results.length - successCount,
      results
    };
  });
}

module.exports = routes;
