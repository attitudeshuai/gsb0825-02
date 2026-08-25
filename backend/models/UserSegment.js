const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const UserSegment = sequelize.define('UserSegment', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  name: {
    type: DataTypes.STRING(100),
    allowNull: false,
    comment: '分层名称'
  },
  code: {
    type: DataTypes.STRING(50),
    unique: true,
    allowNull: false,
    comment: '分层编码'
  },
  description: {
    type: DataTypes.STRING(500),
    allowNull: true
  },
  segmentType: {
    type: DataTypes.ENUM('static', 'dynamic'),
    defaultValue: 'static',
    comment: '静态(手动指定用户)/动态(按条件)'
  },
  userIds: {
    type: DataTypes.JSON,
    allowNull: true,
    comment: '静态分层的用户ID列表'
  },
  criteria: {
    type: DataTypes.JSON,
    allowNull: true,
    comment: '动态分层条件，如注册时间、用户标签、消费金额等'
  },
  userCount: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    comment: '用户数量缓存'
  },
  status: {
    type: DataTypes.ENUM('active', 'disabled'),
    defaultValue: 'active'
  },
  createdBy: {
    type: DataTypes.INTEGER,
    allowNull: true
  }
}, {
  tableName: 'user_segments',
  timestamps: true,
  underscored: true
});

module.exports = UserSegment;
