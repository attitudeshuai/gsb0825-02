const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const UseRecord = sequelize.define('UseRecord', {
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
  orderId: {
    type: DataTypes.STRING(50),
    allowNull: false
  },
  orderAmount: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
    comment: '订单金额'
  },
  discountAmount: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
    comment: '优惠金额'
  },
  actualPayAmount: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
    comment: '实付金额'
  },
  productInfo: {
    type: DataTypes.JSON,
    allowNull: true
  },
  isRefunded: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  refundedAt: {
    type: DataTypes.DATE,
    allowNull: true
  },
  refundOrderId: {
    type: DataTypes.STRING(50),
    allowNull: true
  }
}, {
  tableName: 'use_records',
  timestamps: true,
  underscored: true,
  indexes: [
    { fields: ['batch_id'] },
    { fields: ['user_id'] },
    { fields: ['order_id'] },
    { fields: ['created_at'] }
  ]
});

module.exports = UseRecord;
