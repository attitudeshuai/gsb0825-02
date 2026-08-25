const { authMiddleware } = require('../middleware/auth');
const { sequelize, CouponBatch, UseRecord, ReceiveRecord } = require('../models');
const { QueryTypes } = require('sequelize');
const dayjs = require('dayjs');

// 用户分层统一口径：按累计实付金额划分（与 /api/analytics/user-segment 一致）
const USER_SEGMENTS = {
  highValue: { name: '高价值用户', condition: 'total_pay >= 10000', test: (p) => p >= 10000 },
  active: { name: '活跃用户', condition: 'total_pay >= 1000 AND total_pay < 10000', test: (p) => p >= 1000 && p < 10000 },
  normal: { name: '普通用户', condition: 'total_pay > 0 AND total_pay < 1000', test: (p) => p > 0 && p < 1000 },
  inactive: { name: '沉睡用户', condition: 'total_pay <= 0', test: (p) => p <= 0 }
};

async function querySegmentUserIds(segment, limit = 1000) {
  const seg = USER_SEGMENTS[segment];
  if (!seg) {
    throw new Error('无效的人群分层');
  }
  const rows = await sequelize.query(`
    SELECT user_id FROM (
      SELECT cc.user_id, COALESCE(SUM(ur.actual_pay_amount), 0) AS total_pay
      FROM coupon_codes cc
      LEFT JOIN use_records ur ON cc.id = ur.coupon_id
      WHERE cc.user_id IS NOT NULL
      GROUP BY cc.user_id
    ) t
    WHERE ${seg.condition}
    LIMIT ?
  `, { replacements: [limit], type: QueryTypes.SELECT });
  return rows.map(r => r.user_id);
}

async function routes(fastify, options) {
  fastify.get('/api/analytics/overview', { preHandler: [authMiddleware] }, async (request, reply) => {
    const result = await sequelize.query(`
      SELECT
        (SELECT COUNT(*) FROM coupon_batches) as total_batches,
        (SELECT COUNT(*) FROM coupon_batches WHERE status = 'active') as active_batches,
        (SELECT COALESCE(SUM(total_quantity), 0) FROM coupon_batches) as total_coupons,
        (SELECT COALESCE(SUM(received_quantity), 0) FROM coupon_batches) as total_received,
        (SELECT COALESCE(SUM(used_quantity), 0) FROM coupon_batches) as total_used,
        (SELECT COALESCE(SUM(actual_pay_amount), 0) FROM use_records) as total_gmv,
        (SELECT COALESCE(SUM(discount_amount), 0) FROM use_records) as total_discount
    `, { type: QueryTypes.SELECT });

    const data = result[0];
    const receiveRate = data.total_received > 0 ? ((data.total_received / data.total_coupons) * 100).toFixed(2) : 0;
    const useRate = data.total_received > 0 ? ((data.total_used / data.total_received) * 100).toFixed(2) : 0;
    const roi = data.total_discount > 0 ? ((data.total_gmv / data.total_discount)).toFixed(2) : 0;

    return {
      ...data,
      receiveRate,
      useRate,
      roi
    };
  });

  fastify.get('/api/analytics/trend', { preHandler: [authMiddleware] }, async (request, reply) => {
    const { days = 7 } = request.query;
    const startDate = dayjs().subtract(days - 1, 'day').format('YYYY-MM-DD');

    const receiveTrend = await sequelize.query(`
      SELECT 
        DATE(created_at) as date,
        COUNT(*) as count
      FROM receive_records
      WHERE created_at >= ?
      GROUP BY DATE(created_at)
      ORDER BY date
    `, {
      replacements: [startDate],
      type: QueryTypes.SELECT
    });

    const useTrend = await sequelize.query(`
      SELECT 
        DATE(created_at) as date,
        COUNT(*) as count,
        COALESCE(SUM(actual_pay_amount), 0) as gmv
      FROM use_records
      WHERE created_at >= ?
      GROUP BY DATE(created_at)
      ORDER BY date
    `, {
      replacements: [startDate],
      type: QueryTypes.SELECT
    });

    const dates = [];
    for (let i = 0; i < days; i++) {
      dates.push(dayjs().subtract(days - 1 - i, 'day').format('YYYY-MM-DD'));
    }

    const receiveData = dates.map(d => {
      const item = receiveTrend.find(r => r.date === d);
      return item ? parseInt(item.count) : 0;
    });

    const useData = dates.map(d => {
      const item = useTrend.find(u => u.date === d);
      return item ? parseInt(item.count) : 0;
    });

    const gmvData = dates.map(d => {
      const item = useTrend.find(u => u.date === d);
      return item ? parseFloat(item.gmv) : 0;
    });

    return {
      dates,
      receiveData,
      useData,
      gmvData
    };
  });

  fastify.get('/api/analytics/batch-effect', { preHandler: [authMiddleware] }, async (request, reply) => {
    const { page = 1, pageSize = 10 } = request.query;
    const offset = (page - 1) * pageSize;

    const result = await sequelize.query(`
      SELECT 
        b.id,
        b.name,
        b.batch_code,
        b.coupon_type,
        b.face_value,
        b.total_quantity,
        b.received_quantity,
        b.used_quantity,
        b.created_at,
        COALESCE(SUM(ur.actual_pay_amount), 0) as gmv,
        COALESCE(SUM(ur.discount_amount), 0) as total_discount
      FROM coupon_batches b
      LEFT JOIN use_records ur ON b.id = ur.batch_id
      GROUP BY b.id
      ORDER BY b.created_at DESC
      LIMIT ? OFFSET ?
    `, {
      replacements: [pageSize, offset],
      type: QueryTypes.SELECT
    });

    const countResult = await sequelize.query(`
      SELECT COUNT(*) as cnt FROM coupon_batches
    `, { type: QueryTypes.SELECT });

    const list = result.map(item => ({
      ...item,
      receiveRate: item.total_quantity > 0 ? ((item.received_quantity / item.total_quantity) * 100).toFixed(2) : 0,
      useRate: item.received_quantity > 0 ? ((item.used_quantity / item.received_quantity) * 100).toFixed(2) : 0,
      roi: item.total_discount > 0 ? ((item.gmv / item.total_discount)).toFixed(2) : 0
    }));

    return {
      list,
      total: parseInt(countResult[0].cnt),
      page: parseInt(page),
      pageSize: parseInt(pageSize)
    };
  });

  fastify.get('/api/analytics/funnel', { preHandler: [authMiddleware] }, async (request, reply) => {
    const { batchId } = request.query;
    
    let batchWhere = '';
    const params = [];
    
    if (batchId) {
      batchWhere = 'WHERE b.id = ?';
      params.push(batchId);
    }

    const result = await sequelize.query(`
      SELECT
        COALESCE(SUM(b.total_quantity), 0) as total,
        COALESCE(SUM(b.received_quantity), 0) as received,
        COALESCE(SUM(b.used_quantity), 0) as used,
        (SELECT COUNT(DISTINCT user_id) FROM receive_records ${batchId ? 'WHERE batch_id = ?' : ''}) as unique_users
      FROM coupon_batches b
      ${batchWhere}
    `, {
      replacements: batchId ? [batchId, batchId] : [],
      type: QueryTypes.SELECT
    });

    const data = result[0];
    return {
      stages: [
        { name: '总发放量', value: parseInt(data.total) },
        { name: '已领取数', value: parseInt(data.received) },
        { name: '已使用数', value: parseInt(data.used) }
      ],
      uniqueUsers: parseInt(data.unique_users || 0),
      conversionRate: data.total > 0 ? ((data.used / data.total) * 100).toFixed(2) : 0
    };
  });

  fastify.get('/api/analytics/coupon-type-distribution', { preHandler: [authMiddleware] }, async (request, reply) => {
    const result = await sequelize.query(`
      SELECT
        coupon_type as type,
        COUNT(*) as count,
        COALESCE(SUM(total_quantity), 0) as total_quantity,
        COALESCE(SUM(used_quantity), 0) as used_quantity
      FROM coupon_batches
      GROUP BY coupon_type
    `, { type: QueryTypes.SELECT });

    const typeMap = {
      fixed: '满减券',
      discount: '折扣券',
      direct: '直减券',
      exchange: '兑换券',
      shipping: '运费券'
    };

    return result.map(item => ({
      ...item,
      name: typeMap[item.type] || item.type,
      value: parseInt(item.count)
    }));
  });

  fastify.get('/api/analytics/user-segment', { preHandler: [authMiddleware] }, async (request, reply) => {
    const result = await sequelize.query(`
      SELECT
        cc.user_id,
        COUNT(*) as coupon_count,
        COUNT(CASE WHEN cc.status = 'used' THEN 1 END) as used_count,
        COALESCE(SUM(ur.discount_amount), 0) as total_discount,
        COALESCE(SUM(ur.actual_pay_amount), 0) as total_pay
      FROM coupon_codes cc
      LEFT JOIN use_records ur ON cc.id = ur.coupon_id
      WHERE cc.user_id IS NOT NULL
      GROUP BY cc.user_id
      ORDER BY total_pay DESC
      LIMIT 100
    `, { type: QueryTypes.SELECT });

    const segments = {
      highValue: [],
      active: [],
      normal: [],
      inactive: []
    };

    result.forEach(user => {
      const totalPay = parseFloat(user.total_pay || 0);
      const key = Object.keys(USER_SEGMENTS).find(k => USER_SEGMENTS[k].test(totalPay));
      segments[key].push(user);
    });

    return {
      segments: {
        highValue: { count: segments.highValue.length, name: '高价值用户' },
        active: { count: segments.active.length, name: '活跃用户' },
        normal: { count: segments.normal.length, name: '普通用户' },
        inactive: { count: segments.inactive.length, name: '沉睡用户' }
      },
      topUsers: result.slice(0, 10)
    };
  });
}

module.exports = routes;
module.exports.querySegmentUserIds = querySegmentUserIds;
