const { authMiddleware, roleMiddleware } = require('../middleware/auth');
const { CouponBatch, CouponCode, ReceiveRecord, UseRecord } = require('../models');
const ExcelJS = require('exceljs');
const { Op } = require('sequelize');
const dayjs = require('dayjs');

async function routes(fastify, options) {
  fastify.get('/api/export/batches', { preHandler: [authMiddleware, roleMiddleware(['admin', 'finance'])] }, async (request, reply) => {
    const batches = await CouponBatch.findAll({
      order: [['createdAt', 'DESC']]
    });

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('券批次列表');

    worksheet.columns = [
      { header: '批次编码', key: 'batchCode', width: 20 },
      { header: '批次名称', key: 'name', width: 30 },
      { header: '券类型', key: 'couponType', width: 12 },
      { header: '面额', key: 'faceValue', width: 10 },
      { header: '总数量', key: 'totalQuantity', width: 10 },
      { header: '已领取', key: 'receivedQuantity', width: 10 },
      { header: '已使用', key: 'usedQuantity', width: 10 },
      { header: '状态', key: 'status', width: 10 },
      { header: '创建时间', key: 'createdAt', width: 20 }
    ];

    const typeMap = {
      fixed: '满减券',
      discount: '折扣券',
      direct: '直减券',
      exchange: '兑换券',
      shipping: '运费券'
    };

    const statusMap = {
      pending: '未开始',
      active: '进行中',
      ended: '已结束',
      cancelled: '已取消'
    };

    batches.forEach(batch => {
      worksheet.addRow({
        batchCode: batch.batchCode,
        name: batch.name,
        couponType: typeMap[batch.couponType],
        faceValue: batch.faceValue,
        totalQuantity: batch.totalQuantity,
        receivedQuantity: batch.receivedQuantity,
        usedQuantity: batch.usedQuantity,
        status: statusMap[batch.status],
        createdAt: dayjs(batch.createdAt).format('YYYY-MM-DD HH:mm:ss')
      });
    });

    const buffer = await workbook.xlsx.writeBuffer();
    reply.header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    reply.header('Content-Disposition', `attachment; filename=batches-${Date.now()}.xlsx`);
    return buffer;
  });

  fastify.get('/api/export/codes/:batchId', { preHandler: [authMiddleware, roleMiddleware(['admin', 'operator'])] }, async (request, reply) => {
    const { batchId } = request.params;
    
    const codes = await CouponCode.findAll({
      where: { batchId },
      order: [['createdAt', 'DESC']]
    });

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('券码列表');

    worksheet.columns = [
      { header: '券码', key: 'code', width: 25 },
      { header: '状态', key: 'status', width: 12 },
      { header: '领取用户ID', key: 'userId', width: 15 },
      { header: '领取时间', key: 'receivedAt', width: 20 },
      { header: '有效期开始', key: 'validStartTime', width: 20 },
      { header: '有效期结束', key: 'validEndTime', width: 20 },
      { header: '使用时间', key: 'usedAt', width: 20 },
      { header: '关联订单', key: 'orderId', width: 20 }
    ];

    const statusMap = {
      available: '未使用',
      received: '已领取',
      used: '已使用',
      expired: '已过期',
      cancelled: '已作废'
    };

    codes.forEach(code => {
      worksheet.addRow({
        code: code.code,
        status: statusMap[code.status],
        userId: code.userId || '-',
        receivedAt: code.receivedAt ? dayjs(code.receivedAt).format('YYYY-MM-DD HH:mm:ss') : '-',
        validStartTime: code.validStartTime ? dayjs(code.validStartTime).format('YYYY-MM-DD HH:mm:ss') : '-',
        validEndTime: code.validEndTime ? dayjs(code.validEndTime).format('YYYY-MM-DD HH:mm:ss') : '-',
        usedAt: code.usedAt ? dayjs(code.usedAt).format('YYYY-MM-DD HH:mm:ss') : '-',
        orderId: code.orderId || '-'
      });
    });

    const buffer = await workbook.xlsx.writeBuffer();
    reply.header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    reply.header('Content-Disposition', `attachment; filename=codes-${batchId}-${Date.now()}.xlsx`);
    return buffer;
  });

  fastify.get('/api/export/records/receive', { preHandler: [authMiddleware, roleMiddleware(['admin', 'finance'])] }, async (request, reply) => {
    const { batchId, startDate, endDate } = request.query;
    
    const where = {};
    if (batchId) where.batchId = batchId;
    if (startDate && endDate) {
      where.createdAt = { [Op.between]: [new Date(startDate), new Date(endDate)] };
    }

    const records = await ReceiveRecord.findAll({
      where,
      include: [CouponBatch, CouponCode],
      order: [['createdAt', 'DESC']]
    });

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('领取记录');

    worksheet.columns = [
      { header: '记录ID', key: 'id', width: 10 },
      { header: '批次名称', key: 'batchName', width: 25 },
      { header: '券码', key: 'code', width: 20 },
      { header: '用户ID', key: 'userId', width: 10 },
      { header: '领取渠道', key: 'channel', width: 12 },
      { header: 'IP地址', key: 'ipAddress', width: 15 },
      { header: '风险等级', key: 'riskLevel', width: 12 },
      { header: '领取时间', key: 'createdAt', width: 20 },
      { header: '是否作废', key: 'isCancelled', width: 10 }
    ];

    const channelMap = {
      receive: '主动领取',
      manual: '手动发放',
      redeem: '兑换码',
      targeted: '定向推送',
      new_user: '新人专享'
    };

    const riskMap = {
      normal: '正常',
      warning: '警告',
      danger: '危险'
    };

    records.forEach(record => {
      worksheet.addRow({
        id: record.id,
        batchName: record.CouponBatch?.name || '-',
        code: record.CouponCode?.code || '-',
        userId: record.userId,
        channel: channelMap[record.channel] || record.channel,
        ipAddress: record.ipAddress || '-',
        riskLevel: riskMap[record.riskLevel] || record.riskLevel,
        createdAt: dayjs(record.createdAt).format('YYYY-MM-DD HH:mm:ss'),
        isCancelled: record.isCancelled ? '是' : '否'
      });
    });

    const buffer = await workbook.xlsx.writeBuffer();
    reply.header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    reply.header('Content-Disposition', `attachment; filename=receive-records-${Date.now()}.xlsx`);
    return buffer;
  });

  fastify.get('/api/export/records/use', { preHandler: [authMiddleware, roleMiddleware(['admin', 'finance'])] }, async (request, reply) => {
    const { batchId, startDate, endDate } = request.query;
    
    const where = {};
    if (batchId) where.batchId = batchId;
    if (startDate && endDate) {
      where.createdAt = { [Op.between]: [new Date(startDate), new Date(endDate)] };
    }

    const records = await UseRecord.findAll({
      where,
      include: [CouponBatch, CouponCode],
      order: [['createdAt', 'DESC']]
    });

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('核销记录');

    worksheet.columns = [
      { header: '记录ID', key: 'id', width: 10 },
      { header: '批次名称', key: 'batchName', width: 25 },
      { header: '券码', key: 'code', width: 20 },
      { header: '用户ID', key: 'userId', width: 10 },
      { header: '订单号', key: 'orderId', width: 20 },
      { header: '订单金额', key: 'orderAmount', width: 12 },
      { header: '优惠金额', key: 'discountAmount', width: 12 },
      { header: '实付金额', key: 'actualPayAmount', width: 12 },
      { header: '核销时间', key: 'createdAt', width: 20 },
      { header: '是否退款', key: 'isRefunded', width: 10 }
    ];

    records.forEach(record => {
      worksheet.addRow({
        id: record.id,
        batchName: record.CouponBatch?.name || '-',
        code: record.CouponCode?.code || '-',
        userId: record.userId,
        orderId: record.orderId,
        orderAmount: record.orderAmount,
        discountAmount: record.discountAmount,
        actualPayAmount: record.actualPayAmount,
        createdAt: dayjs(record.createdAt).format('YYYY-MM-DD HH:mm:ss'),
        isRefunded: record.isRefunded ? '是' : '否'
      });
    });

    const buffer = await workbook.xlsx.writeBuffer();
    reply.header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    reply.header('Content-Disposition', `attachment; filename=use-records-${Date.now()}.xlsx`);
    return buffer;
  });

  fastify.get('/api/export/analytics', { preHandler: [authMiddleware, roleMiddleware(['admin', 'finance'])] }, async (request, reply) => {
    const batches = await CouponBatch.findAll({
      order: [['createdAt', 'DESC']]
    });

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('效果分析');

    worksheet.columns = [
      { header: '批次编码', key: 'batchCode', width: 20 },
      { header: '批次名称', key: 'name', width: 30 },
      { header: '券类型', key: 'couponType', width: 12 },
      { header: '面额', key: 'faceValue', width: 10 },
      { header: '总数量', key: 'totalQuantity', width: 10 },
      { header: '已领取', key: 'receivedQuantity', width: 10 },
      { header: '已使用', key: 'usedQuantity', width: 10 },
      { header: '领取率(%)', key: 'receiveRate', width: 12 },
      { header: '核销率(%)', key: 'useRate', width: 12 },
      { header: '创建时间', key: 'createdAt', width: 20 }
    ];

    const typeMap = {
      fixed: '满减券',
      discount: '折扣券',
      direct: '直减券',
      exchange: '兑换券',
      shipping: '运费券'
    };

    batches.forEach(batch => {
      const receiveRate = batch.totalQuantity > 0 ? ((batch.receivedQuantity / batch.totalQuantity) * 100).toFixed(2) : 0;
      const useRate = batch.receivedQuantity > 0 ? ((batch.usedQuantity / batch.receivedQuantity) * 100).toFixed(2) : 0;
      
      worksheet.addRow({
        batchCode: batch.batchCode,
        name: batch.name,
        couponType: typeMap[batch.couponType],
        faceValue: batch.faceValue,
        totalQuantity: batch.totalQuantity,
        receivedQuantity: batch.receivedQuantity,
        usedQuantity: batch.usedQuantity,
        receiveRate,
        useRate,
        createdAt: dayjs(batch.createdAt).format('YYYY-MM-DD HH:mm:ss')
      });
    });

    const buffer = await workbook.xlsx.writeBuffer();
    reply.header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    reply.header('Content-Disposition', `attachment; filename=analytics-${Date.now()}.xlsx`);
    return buffer;
  });
}

module.exports = routes;
