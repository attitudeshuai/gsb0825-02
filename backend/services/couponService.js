const { CouponBatch, CouponCode, ReceiveRecord, sequelize } = require('../models');
const { Op } = require('sequelize');
const crypto = require('crypto');

function generateCouponCode(prefix) {
  return (prefix || '') + crypto.randomBytes(8).toString('hex').toUpperCase();
}

async function getUserReceivedCount(t, batchId, userId) {
  return await ReceiveRecord.count({
    where: {
      batchId,
      userId,
      isCancelled: false
    },
    transaction: t
  });
}

async function findAvailableCoupon(t, batchId) {
  const batch = await CouponBatch.findByPk(batchId, {
    lock: true,
    transaction: t
  });

  if (!batch) {
    return { error: '批次不存在' };
  }

  if (batch.status !== 'active') {
    return { error: '批次未激活或已结束' };
  }

  const now = new Date();
  if (batch.startTime && now < batch.startTime) {
    return { error: '活动尚未开始' };
  }
  if (batch.endTime && now > batch.endTime) {
    return { error: '活动已结束' };
  }

  if (batch.receivedQuantity >= batch.totalQuantity) {
    return { error: '优惠券已被领完' };
  }

  let coupon = await CouponCode.findOne({
    where: {
      batchId,
      status: 'available'
    },
    lock: true,
    transaction: t,
    order: [['id', 'ASC']]
  });

  if (!coupon) {
    const existingCount = await CouponCode.count({
      where: { batchId },
      transaction: t
    });

    if (existingCount >= batch.totalQuantity) {
      return { error: '优惠券已被领完' };
    }

    coupon = await CouponCode.create({
      batchId,
      code: generateCouponCode(),
      status: 'available'
    }, { transaction: t });
  }

  return { batch, coupon };
}

function calculateValidity(batch) {
  if (batch.validityType === 'relative' && batch.validDays) {
    return {
      validStartTime: new Date(),
      validEndTime: new Date(Date.now() + batch.validDays * 24 * 60 * 60 * 1000)
    };
  }
  return {
    validStartTime: batch.startTime,
    validEndTime: batch.endTime
  };
}

async function assignCouponToUser(t, batch, coupon, userId, channel, deviceId, ipAddress, userAgent, riskInfo) {
  const { validStartTime, validEndTime } = calculateValidity(batch);

  coupon.userId = userId;
  coupon.status = 'received';
  coupon.receivedAt = new Date();
  coupon.ipAddress = ipAddress;
  coupon.deviceInfo = { deviceId };
  coupon.validStartTime = validStartTime;
  coupon.validEndTime = validEndTime;
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
    throw new Error('库存不足，发放失败');
  }

  const record = await ReceiveRecord.create({
    batchId: batch.id,
    couponId: coupon.id,
    userId,
    channel,
    deviceId,
    ipAddress,
    userAgent,
    riskLevel: riskInfo?.riskLevel || 'normal',
    riskReason: riskInfo?.riskReason || null
  }, { transaction: t });

  return { coupon, record };
}

async function distributeToUsers(batchId, userIds, channel, operatorId, options = {}) {
  const results = {
    success: [],
    skipped: [],
    failed: []
  };

  const uniqueUserIds = [...new Set(userIds)];
  let stockExhausted = false;

  for (const userId of uniqueUserIds) {
    if (stockExhausted) {
      results.failed.push({ userId, reason: '优惠券已被领完' });
      continue;
    }

    const t = await sequelize.transaction();
    try {
      const available = await findAvailableCoupon(t, batchId);
      if (available.error) {
        await t.rollback();
        if (available.error.includes('领完') || available.error.includes('库存')) {
          stockExhausted = true;
        }
        results.failed.push({ userId, reason: available.error });
        continue;
      }

      const { batch, coupon } = available;

      const userCount = await getUserReceivedCount(t, batchId, userId);
      if (userCount >= batch.limitPerPerson) {
        await t.rollback();
        results.skipped.push({ userId, reason: '已达到领取上限' });
        continue;
      }

      await assignCouponToUser(
        t,
        batch,
        coupon,
        userId,
        channel,
        options.deviceId || null,
        options.ipAddress || null,
        options.userAgent || null,
        { riskLevel: 'normal' }
      );

      await t.commit();
      results.success.push({ userId, couponId: coupon.id, code: coupon.code });
    } catch (error) {
      await t.rollback();
      if (error.message.includes('库存')) {
        stockExhausted = true;
      }
      results.failed.push({ userId, reason: error.message });
    }
  }

  return results;
}

module.exports = {
  generateCouponCode,
  getUserReceivedCount,
  findAvailableCoupon,
  calculateValidity,
  assignCouponToUser,
  distributeToUsers
};
