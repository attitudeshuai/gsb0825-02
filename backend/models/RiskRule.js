const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const RiskRule = sequelize.define('RiskRule', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  ruleType: {
    type: DataTypes.ENUM('frequency', 'device', 'ip', 'behavior'),
    allowNull: false,
    comment: '规则类型'
  },
  ruleName: {
    type: DataTypes.STRING(100),
    allowNull: false
  },
  config: {
    type: DataTypes.JSON,
    allowNull: false,
    comment: '规则配置'
  },
  action: {
    type: DataTypes.ENUM('block', 'warning', 'verify'),
    defaultValue: 'block',
    comment: '处理动作'
  },
  status: {
    type: DataTypes.ENUM('active', 'disabled'),
    defaultValue: 'active'
  },
  description: {
    type: DataTypes.STRING(500),
    allowNull: true
  }
}, {
  tableName: 'risk_rules',
  timestamps: true,
  underscored: true
});

const RiskBlacklist = sequelize.define('RiskBlacklist', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  type: {
    type: DataTypes.ENUM('ip', 'device', 'user'),
    allowNull: false
  },
  value: {
    type: DataTypes.STRING(255),
    allowNull: false
  },
  reason: {
    type: DataTypes.STRING(500),
    allowNull: true
  },
  expireAt: {
    type: DataTypes.DATE,
    allowNull: true
  },
  isPermanent: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  }
}, {
  tableName: 'risk_blacklists',
  timestamps: true,
  underscored: true,
  indexes: [
    { fields: ['type', 'value'] }
  ]
});

const RiskIntercept = sequelize.define('RiskIntercept', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  userId: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  ipAddress: {
    type: DataTypes.STRING(50),
    allowNull: true
  },
  deviceId: {
    type: DataTypes.STRING(100),
    allowNull: true
  },
  ruleId: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  ruleName: {
    type: DataTypes.STRING(100),
    allowNull: true
  },
  action: {
    type: DataTypes.STRING(50),
    allowNull: true
  },
  details: {
    type: DataTypes.JSON,
    allowNull: true
  }
}, {
  tableName: 'risk_intercepts',
  timestamps: true,
  underscored: true,
  indexes: [
    { fields: ['created_at'] }
  ]
});

module.exports = { RiskRule, RiskBlacklist, RiskIntercept };
