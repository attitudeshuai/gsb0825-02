const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const CouponCode = sequelize.define('CouponCode', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  batchId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'coupon_batches',
      key: 'id'
    }
  },
  code: {
    type: DataTypes.STRING(50),
    unique: true,
    allowNull: false,
    comment: '券码/兑换码'
  },
  userId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: '领取用户ID'
  },
  status: {
    type: DataTypes.ENUM('available', 'received', 'used', 'expired', 'cancelled'),
    defaultValue: 'available',
    comment: '状态'
  },
  receivedAt: {
    type: DataTypes.DATE,
    allowNull: true
  },
  validStartTime: {
    type: DataTypes.DATE,
    allowNull: true
  },
  validEndTime: {
    type: DataTypes.DATE,
    allowNull: true
  },
  usedAt: {
    type: DataTypes.DATE,
    allowNull: true
  },
  orderId: {
    type: DataTypes.STRING(50),
    allowNull: true,
    comment: '关联订单号'
  },
  deviceInfo: {
    type: DataTypes.JSON,
    allowNull: true,
    comment: '领取设备信息'
  },
  ipAddress: {
    type: DataTypes.STRING(50),
    allowNull: true
  }
}, {
  tableName: 'coupon_codes',
  timestamps: true,
  underscored: true,
  indexes: [
    { fields: ['batch_id'] },
    { fields: ['user_id'] },
    { fields: ['code'] },
    { fields: ['status'] }
  ]
});

module.exports = CouponCode;
