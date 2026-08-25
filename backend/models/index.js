const sequelize = require('../config/database');
const User = require('./User');
const CouponBatch = require('./CouponBatch');
const CouponCode = require('./CouponCode');
const ReceiveRecord = require('./ReceiveRecord');
const UseRecord = require('./UseRecord');
const UserSegment = require('./UserSegment');
const { RiskRule, RiskBlacklist, RiskIntercept } = require('./RiskRule');

CouponBatch.hasMany(CouponCode, { foreignKey: 'batchId' });
CouponCode.belongsTo(CouponBatch, { foreignKey: 'batchId' });

CouponBatch.hasMany(ReceiveRecord, { foreignKey: 'batchId' });
ReceiveRecord.belongsTo(CouponBatch, { foreignKey: 'batchId' });

CouponBatch.hasMany(UseRecord, { foreignKey: 'batchId' });
UseRecord.belongsTo(CouponBatch, { foreignKey: 'batchId' });

CouponCode.hasOne(ReceiveRecord, { foreignKey: 'couponId' });
ReceiveRecord.belongsTo(CouponCode, { foreignKey: 'couponId' });

CouponCode.hasOne(UseRecord, { foreignKey: 'couponId' });
UseRecord.belongsTo(CouponCode, { foreignKey: 'couponId' });

User.hasMany(CouponBatch, { foreignKey: 'createdBy' });
CouponBatch.belongsTo(User, { foreignKey: 'createdBy', as: 'creator' });

User.hasMany(UserSegment, { foreignKey: 'createdBy' });
UserSegment.belongsTo(User, { foreignKey: 'createdBy', as: 'creator' });

module.exports = {
  sequelize,
  User,
  CouponBatch,
  CouponCode,
  ReceiveRecord,
  UseRecord,
  UserSegment,
  RiskRule,
  RiskBlacklist,
  RiskIntercept
};
