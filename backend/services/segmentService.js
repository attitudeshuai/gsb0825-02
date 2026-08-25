const { sequelize } = require('../models');
const { QueryTypes } = require('sequelize');

const PAYMENT_LEVEL_THRESHOLDS = {
  highValue: 10000,
  active: 1000,
  normal: 0,
  inactive: 0
};

async function getUserIdsByPaymentLevel(level) {
  const threshold = PAYMENT_LEVEL_THRESHOLDS[level];
  if (threshold === undefined) {
    throw new Error(`未知的消费分层: ${level}`);
  }

  let sql;
  let replacements;

  if (level === 'highValue') {
    sql = `
      SELECT cc.user_id AS user_id
      FROM coupon_codes cc
      LEFT JOIN use_records ur ON cc.id = ur.coupon_id
      WHERE cc.user_id IS NOT NULL
      GROUP BY cc.user_id
      HAVING COALESCE(SUM(ur.actual_pay_amount), 0) >= ?
    `;
    replacements = [threshold];
  } else if (level === 'active') {
    sql = `
      SELECT cc.user_id AS user_id
      FROM coupon_codes cc
      LEFT JOIN use_records ur ON cc.id = ur.coupon_id
      WHERE cc.user_id IS NOT NULL
      GROUP BY cc.user_id
      HAVING COALESCE(SUM(ur.actual_pay_amount), 0) >= ?
         AND COALESCE(SUM(ur.actual_pay_amount), 0) < ?
    `;
    replacements = [threshold, PAYMENT_LEVEL_THRESHOLDS.highValue];
  } else if (level === 'normal') {
    sql = `
      SELECT cc.user_id AS user_id
      FROM coupon_codes cc
      LEFT JOIN use_records ur ON cc.id = ur.coupon_id
      WHERE cc.user_id IS NOT NULL
      GROUP BY cc.user_id
      HAVING COALESCE(SUM(ur.actual_pay_amount), 0) > ?
         AND COALESCE(SUM(ur.actual_pay_amount), 0) < ?
    `;
    replacements = [threshold, PAYMENT_LEVEL_THRESHOLDS.active];
  } else {
    sql = `
      SELECT cc.user_id AS user_id
      FROM coupon_codes cc
      LEFT JOIN use_records ur ON cc.id = ur.coupon_id
      WHERE cc.user_id IS NOT NULL
      GROUP BY cc.user_id
      HAVING COALESCE(SUM(ur.actual_pay_amount), 0) = 0
    `;
    replacements = [];
  }

  const rows = await sequelize.query(sql, {
    replacements,
    type: QueryTypes.SELECT
  });

  return rows.map(r => r.user_id).filter(id => id != null);
}

async function resolveSegmentUserIds(segment) {
  if (!segment) return [];

  if (segment.segmentType === 'static') {
    return Array.isArray(segment.userIds) ? segment.userIds : [];
  }

  if (segment.segmentType === 'dynamic' && segment.criteria) {
    const { type, level } = segment.criteria;
    if (type === 'payment_level') {
      return await getUserIdsByPaymentLevel(level);
    }
  }

  return [];
}

async function getSegmentUserCount(segment) {
  const userIds = await resolveSegmentUserIds(segment);
  return userIds.length;
}

module.exports = {
  PAYMENT_LEVEL_THRESHOLDS,
  getUserIdsByPaymentLevel,
  resolveSegmentUserIds,
  getSegmentUserCount
};
