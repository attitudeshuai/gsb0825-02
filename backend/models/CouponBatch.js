const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const CouponBatch = sequelize.define('CouponBatch', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  batchCode: {
    type: DataTypes.STRING(50),
    unique: true,
    allowNull: false
  },
  name: {
    type: DataTypes.STRING(100),
    allowNull: false
  },
  couponType: {
    type: DataTypes.ENUM('fixed', 'discount', 'direct', 'exchange', 'shipping'),
    allowNull: false,
    comment: '满减券/折扣券/直减券/兑换券/运费券'
  },
  faceValue: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
    comment: '面额'
  },
  discountRate: {
    type: DataTypes.DECIMAL(3, 2),
    allowNull: true,
    comment: '折扣率，折扣券专用'
  },
  minAmount: {
    type: DataTypes.DECIMAL(10, 2),
    defaultValue: 0,
    comment: '最低使用门槛'
  },
  maxDiscount: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: true,
    comment: '最高减免金额'
  },
  totalQuantity: {
    type: DataTypes.INTEGER,
    allowNull: false,
    comment: '总数量'
  },
  usedQuantity: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    comment: '已使用数量'
  },
  receivedQuantity: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    comment: '已领取数量'
  },
  limitPerPerson: {
    type: DataTypes.INTEGER,
    defaultValue: 1,
    comment: '每人限领数量'
  },
  validityType: {
    type: DataTypes.ENUM('fixed', 'relative'),
    defaultValue: 'fixed',
    comment: '有效期类型：固定/相对'
  },
  startTime: {
    type: DataTypes.DATE,
    allowNull: true
  },
  endTime: {
    type: DataTypes.DATE,
    allowNull: true
  },
  validDays: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: '领取后有效天数'
  },
  scope: {
    type: DataTypes.ENUM('all', 'category', 'product'),
    defaultValue: 'all',
    comment: '适用范围'
  },
  scopeValue: {
    type: DataTypes.JSON,
    allowNull: true,
    comment: '适用范围值'
  },
  allowStacking: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    comment: '是否允许叠加'
  },
  stackingRules: {
    type: DataTypes.JSON,
    allowNull: true,
    comment: '叠加规则'
  },
  deliveryStrategy: {
    type: DataTypes.ENUM('manual', 'receive', 'redeem', 'targeted', 'new_user'),
    defaultValue: 'receive',
    comment: '投放策略'
  },
  status: {
    type: DataTypes.ENUM('pending', 'active', 'ended', 'cancelled'),
    defaultValue: 'pending',
    comment: '状态'
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  createdBy: {
    type: DataTypes.INTEGER,
    allowNull: false
  }
}, {
  tableName: 'coupon_batches',
  timestamps: true,
  underscored: true
});

module.exports = CouponBatch;
