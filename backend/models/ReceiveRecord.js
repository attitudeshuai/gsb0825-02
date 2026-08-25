const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const ReceiveRecord = sequelize.define('ReceiveRecord', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  batchId: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  couponId: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  userId: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  channel: {
    type: DataTypes.ENUM('receive', 'manual', 'redeem', 'targeted', 'new_user'),
    allowNull: false,
    comment: '领取渠道'
  },
  deviceId: {
    type: DataTypes.STRING(100),
    allowNull: true
  },
  ipAddress: {
    type: DataTypes.STRING(50),
    allowNull: true
  },
  userAgent: {
    type: DataTypes.STRING(500),
    allowNull: true
  },
  riskLevel: {
    type: DataTypes.ENUM('normal', 'warning', 'danger'),
    defaultValue: 'normal'
  },
  riskReason: {
    type: DataTypes.STRING(255),
    allowNull: true
  },
  isCancelled: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  cancelledAt: {
    type: DataTypes.DATE,
    allowNull: true
  },
  cancelledBy: {
    type: DataTypes.INTEGER,
    allowNull: true
  }
}, {
  tableName: 'receive_records',
  timestamps: true,
  underscored: true,
  indexes: [
    { fields: ['batch_id'] },
    { fields: ['user_id'] },
    { fields: ['coupon_id'] },
    { fields: ['created_at'] }
  ]
});

module.exports = ReceiveRecord;
