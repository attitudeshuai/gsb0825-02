const { Op, QueryTypes } = require('sequelize');
const crypto = require('crypto');
const { sequelize, CouponBatch, CouponCode, ReceiveRecord } = require('../models');

const DAY_MS = 24 * 60 * 60 * 1000;

function generateCouponCode() {
  return crypto.randomBytes(8).toString('hex').toUpperCase();
}

const SEGMENT_DEFS = [
  { key: 'highValue', name: '高价值用户', minPay: 10000 },
  { key: 'active', name: '活跃用户', minPay: 1000 },
  { key: 'normal', name: '普通用户', minPay: 0.01 },
  { key: 'inactive', name: '沉睡用户', minPay: null }
];

function buildValidity(batch) {
  const now = new Date();
  if (batch.validityType === 'relative') {
    return {
      validStartTime: now,
      validEndTime: new Date(now.getTime() + (Number(batch.validDays) || 30) * DAY_MS)
    };
  }
  return {
    validStartTime: batch.startTime || now,
    validEndTime: batch.endTime || null
  };
}

function assertBatchIssuable(batch) {
  if (!batch) {
    const err = new Error('批次不存在');
    err.statusCode = 404;
    throw err;
  }
  if (batch.status !== 'active') {
    const err = new Error('批次未激活或已结束，无法发放');
    err.statusCode = 400;
    throw err;
  }
  if (batch.endTime && new Date() > new Date(batch.endTime)) {
    const err = new Error('活动已结束');
    err.statusCode = 400;
    throw err;
  }
}

async function countReceivedByUsers(transaction, batchId, userIds) {
  if (userIds.length === 0) return new Map();
  const rows = await CouponCode.findAll({
    attributes: ['userId', [sequelize.fn('COUNT', sequelize.col('CouponCode.id')), 'cnt']],
    where: {
      batchId,
      userId: { [Op.in]: userIds },
      status: { [Op.ne]: 'cancelled' }
    },
    group: ['userId'],
    transaction,
    raw: true
  });
  const map = new Map();
  rows.forEach(r => map.set(Number(r.userId), Number(r.cnt)));
  return map;
}

async function occupyCoupon({ transaction, coupon, batch, userId, channel, context = {}, risk = {} }) {
  const validity = buildValidity(batch);
  const now = new Date();

  coupon.userId = userId;
  coupon.status = 'received';
  coupon.receivedAt = now;
  coupon.ipAddress = context.ipAddress || null;
  coupon.deviceInfo = context.deviceId ? { deviceId: context.deviceId } : coupon.deviceInfo;
  coupon.validStartTime = validity.validStartTime;
  coupon.validEndTime = validity.validEndTime;
  await coupon.save({ transaction });

  await batch.increment('receivedQuantity', { by: 1, transaction });

  await ReceiveRecord.create({
    batchId: batch.id,
    couponId: coupon.id,
    userId,
    channel,
    deviceId: context.deviceId || null,
    ipAddress: context.ipAddress || null,
    userAgent: context.userAgent || null,
    riskLevel: risk.riskLevel || 'normal',
    riskReason: risk.riskReason || null
  }, { transaction });

  return coupon;
}

async function claimSpecificCoupon({ couponId, code, userId, channel, context, risk }) {
  const existing = couponId
    ? await CouponCode.findByPk(couponId)
    : await CouponCode.findOne({ where: { code } });

  if (!existing) {
    const err = new Error(channel === 'redeem' ? '兑换码不存在' : '券码不存在');
    err.statusCode = 404;
    throw err;
  }

  const t = await sequelize.transaction();
  try {
    const batch = await CouponBatch.findByPk(existing.batchId, { lock: true, transaction: t });
    assertBatchIssuable(batch);

    const coupon = await CouponCode.findByPk(existing.id, { lock: true, transaction: t });
    if (coupon.status !== 'available') {
      const err = new Error(channel === 'redeem' ? '兑换码已被使用或已过期' : '券码不可用');
      err.statusCode = 400;
      throw err;
    }

    const receivedCount = await CouponCode.count({
      where: { batchId: batch.id, userId, status: { [Op.ne]: 'cancelled' } },
      transaction: t
    });
    if (receivedCount >= batch.limitPerPerson) {
      const err = new Error('已达到该批次每人领取上限');
      err.statusCode = 400;
      throw err;
    }

    await occupyCoupon({ transaction: t, coupon, batch, userId, channel, context, risk });

    await t.commit();
    return coupon;
  } catch (error) {
    await t.rollback();
    throw error;
  }
}

async function issueCoupons({ batchId, userIds, channel = 'manual', eachCount = 1 }) {
  const targets = [...new Set(
    (Array.isArray(userIds) ? userIds : [])
      .map(id => Number(id))
      .filter(id => Number.isInteger(id) && id > 0)
  )];

  if (targets.length === 0) {
    const err = new Error('请提供有效的用户ID');
    err.statusCode = 400;
    throw err;
  }

  const perUser = Math.max(1, Math.min(Number(eachCount) || 1, 100));
  const skipped = [];
  const t = await sequelize.transaction();

  try {
    const batch = await CouponBatch.findByPk(batchId, { lock: true, transaction: t });
    assertBatchIssuable(batch);

    const receivedMap = await countReceivedByUsers(t, batch.id, targets);
    const plan = [];
    for (const uid of targets) {
      const already = receivedMap.get(uid) || 0;
      const remainLimit = batch.limitPerPerson - already;
      if (remainLimit <= 0) {
        skipped.push({ userId: uid, reason: '已达到每人限领上限' });
        continue;
      }
      const give = Math.min(perUser, remainLimit);
      for (let i = 0; i < give; i++) plan.push(uid);
    }

    let issued = 0;
    let generated = 0;
    if (plan.length > 0) {
      let availableCoupons = await CouponCode.findAll({
        where: { batchId: batch.id, status: 'available' },
        attributes: ['id'],
        order: [['id', 'ASC']],
        limit: plan.length,
        lock: true,
        transaction: t,
        raw: true
      });

      if (availableCoupons.length < plan.length) {
        const shortage = plan.length - availableCoupons.length;
        const existingCodeCount = await CouponCode.count({ where: { batchId: batch.id }, transaction: t });
        const genCapacity = Math.max(0, batch.totalQuantity - existingCodeCount);
        const genCount = Math.min(shortage, genCapacity);

        if (genCount > 0) {
          const newCodes = [];
          for (let i = 0; i < genCount; i++) {
            newCodes.push({ batchId: batch.id, code: generateCouponCode() });
          }
          await CouponCode.bulkCreate(newCodes, { transaction: t });
          generated = genCount;

          availableCoupons = await CouponCode.findAll({
            where: { batchId: batch.id, status: 'available' },
            attributes: ['id'],
            order: [['id', 'ASC']],
            limit: plan.length,
            lock: true,
            transaction: t,
            raw: true
          });
        }
      }

      const stockShort = plan.length > availableCoupons.length;
      const toIssue = plan.slice(0, availableCoupons.length);

      if (stockShort) {
        const issuedUsers = new Set(toIssue);
        targets.forEach(uid => {
          if (!issuedUsers.has(uid) && !skipped.some(s => s.userId === uid)) {
            skipped.push({ userId: uid, reason: '批次库存不足（已达批次总数量上限）' });
          }
        });
      }

      const now = new Date();
      const validity = buildValidity(batch);
      const records = [];

      for (let i = 0; i < toIssue.length; i++) {
        const uid = toIssue[i];
        const couponId = availableCoupons[i].id;

        const [affected] = await CouponCode.update(
          {
            userId: uid,
            status: 'received',
            receivedAt: now,
            validStartTime: validity.validStartTime,
            validEndTime: validity.validEndTime
          },
          {
            where: { id: couponId, status: 'available' },
            transaction: t
          }
        );

        if (affected !== 1) {
          const err = new Error('券码发放冲突，请重试');
          err.statusCode = 409;
          throw err;
        }

        records.push({
          batchId: batch.id,
          couponId,
          userId: uid,
          channel,
          riskLevel: 'normal'
        });
      }

      if (records.length > 0) {
        await ReceiveRecord.bulkCreate(records, { transaction: t });
        await batch.increment('receivedQuantity', { by: records.length, transaction: t });
      }
      issued = records.length;
    }

    await t.commit();
    return {
      issued,
      generated,
      skipped,
      totalUsers: targets.length,
      channel
    };
  } catch (error) {
    await t.rollback();
    throw error;
  }
}

async function getSegmentUsers() {
  const couponRows = await sequelize.query(`
    SELECT
      user_id,
      COUNT(id) AS coupon_count,
      COUNT(CASE WHEN status = 'used' THEN 1 END) AS used_count
    FROM coupon_codes
    WHERE user_id IS NOT NULL AND status != 'cancelled'
    GROUP BY user_id
  `, { type: QueryTypes.SELECT });

  const payRows = await sequelize.query(`
    SELECT
      user_id,
      COALESCE(SUM(actual_pay_amount), 0) AS total_pay
    FROM use_records
    WHERE is_refunded = false
    GROUP BY user_id
  `, { type: QueryTypes.SELECT });

  const payMap = new Map();
  payRows.forEach(r => payMap.set(Number(r.user_id), parseFloat(r.total_pay || 0)));

  const segments = {
    highValue: { name: '高价值用户', users: [] },
    active: { name: '活跃用户', users: [] },
    normal: { name: '普通用户', users: [] },
    inactive: { name: '沉睡用户', users: [] }
  };

  couponRows.forEach(r => {
    const pay = payMap.get(Number(r.user_id)) || 0;
    const user = {
      userId: Number(r.user_id),
      couponCount: Number(r.coupon_count),
      usedCount: Number(r.used_count),
      totalPay: pay
    };
    if (pay >= 10000) segments.highValue.users.push(user);
    else if (pay >= 1000) segments.active.users.push(user);
    else if (pay > 0) segments.normal.users.push(user);
    else segments.inactive.users.push(user);
  });

  Object.values(segments).forEach(s => s.users.sort((a, b) => b.totalPay - a.totalPay));

  return segments;
}

async function getSegmentOverview() {
  const segments = await getSegmentUsers();
  const overview = {};
  Object.entries(segments).forEach(([key, val]) => {
    overview[key] = { name: val.name, count: val.users.length };
  });
  return overview;
}

async function getUserIdsBySegment(segment, maxUsers) {
  const segments = await getSegmentUsers();
  const seg = segments[segment];
  if (!seg) {
    const err = new Error('未知的人群分层');
    err.statusCode = 400;
    throw err;
  }
  let users = seg.users.map(u => u.userId);
  const limit = Number(maxUsers);
  if (limit && Number.isInteger(limit) && limit > 0) {
    users = users.slice(0, limit);
  }
  return users;
}

module.exports = {
  SEGMENT_DEFS,
  claimSpecificCoupon,
  issueCoupons,
  getSegmentOverview,
  getUserIdsBySegment
};
