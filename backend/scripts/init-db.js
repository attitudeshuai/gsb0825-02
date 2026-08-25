require('dotenv').config();
const { sequelize, User, RiskRule } = require('../models');

async function init() {
  try {
    console.log('开始初始化数据库...');
    
    await sequelize.authenticate();
    console.log('数据库连接成功');

    await sequelize.sync({ force: true });
    console.log('数据库表重建完成');

    await User.bulkCreate([
      {
        username: 'admin',
        password: '123456',
        realName: '系统管理员',
        role: 'admin'
      },
      {
        username: 'operator',
        password: '123456',
        realName: '运营专员',
        role: 'operator'
      },
      {
        username: 'finance',
        password: '123456',
        realName: '财务人员',
        role: 'finance'
      }
    ]);
    console.log('默认用户创建成功');

    await RiskRule.bulkCreate([
      {
        ruleType: 'frequency',
        ruleName: '用户领取频率限制',
        config: { limit: 5, windowMinutes: 60 },
        action: 'block',
        description: '限制用户每小时最多领取5张优惠券'
      },
      {
        ruleType: 'ip',
        ruleName: 'IP领取频率限制',
        config: { limit: 10, windowMinutes: 60 },
        action: 'block',
        description: '限制同一IP每小时最多领取10张优惠券'
      },
      {
        ruleType: 'device',
        ruleName: '设备领取频率限制',
        config: { limit: 5, windowMinutes: 60 },
        action: 'block',
        description: '限制同一设备每小时最多领取5张优惠券'
      }
    ]);
    console.log('默认风控规则创建成功');

    console.log('数据库初始化完成！');
    console.log('默认账号: admin / 123456');
    
    process.exit(0);
  } catch (error) {
    console.error('初始化失败:', error);
    process.exit(1);
  }
}

init();
