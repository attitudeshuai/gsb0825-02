require('dotenv').config();
const fastify = require('fastify')({ logger: true });
const cors = require('@fastify/cors');
const cron = require('node-cron');
const dayjs = require('dayjs');
const { sequelize, CouponCode, User } = require('./models');
const { Op } = require('sequelize');

fastify.register(cors, {
  origin: true,
  credentials: true
});

fastify.register(require('./routes/auth'));
fastify.register(require('./routes/batch'));
fastify.register(require('./routes/code'));
fastify.register(require('./routes/record'));
fastify.register(require('./routes/risk'));
fastify.register(require('./routes/segment'));
fastify.register(require('./routes/analytics'));
fastify.register(require('./routes/export'));

fastify.get('/api/health', async (request, reply) => {
  return { status: 'ok', timestamp: new Date().toISOString() };
});

cron.schedule('0 0 * * *', async () => {
  try {
    const now = new Date();
    const expiredCoupons = await CouponCode.update(
      { status: 'expired' },
      {
        where: {
          status: 'received',
          validEndTime: { [Op.lt]: now }
        }
      }
    );
    console.log(`[定时任务] 处理过期优惠券: ${expiredCoupons[0]} 张`);

    const endedBatches = await sequelize.query(`
      UPDATE coupon_batches 
      SET status = 'ended' 
      WHERE status = 'active' AND end_time < ?
    `, { replacements: [now], type: sequelize.QueryTypes.UPDATE });
    
    console.log(`[定时任务] 处理已结束批次: ${endedBatches[1]} 个`);

    const pendingBatches = await sequelize.query(`
      UPDATE coupon_batches 
      SET status = 'active' 
      WHERE status = 'pending' AND start_time <= ? AND (end_time IS NULL OR end_time > ?)
    `, { replacements: [now, now], type: sequelize.QueryTypes.UPDATE });
    
    console.log(`[定时任务] 激活到期批次: ${pendingBatches[1]} 个`);
  } catch (error) {
    console.error('[定时任务] 执行失败:', error);
  }
});

const start = async () => {
  try {
    await sequelize.authenticate();
    console.log('数据库连接成功');

    await sequelize.sync();
    console.log('数据库同步完成');

    const adminExists = await User.findOne({ where: { username: 'admin' } });
    if (!adminExists) {
      await User.create({
        username: 'admin',
        password: '123456',
        realName: '系统管理员',
        role: 'admin'
      });
      console.log('默认管理员账号创建成功: admin / 123456');
    }

    const operatorExists = await User.findOne({ where: { username: 'operator' } });
    if (!operatorExists) {
      await User.create({
        username: 'operator',
        password: '123456',
        realName: '运营专员',
        role: 'operator'
      });
      console.log('默认运营专员账号创建成功: operator / 123456');
    }

    const financeExists = await User.findOne({ where: { username: 'finance' } });
    if (!financeExists) {
      await User.create({
        username: 'finance',
        password: '123456',
        realName: '财务人员',
        role: 'finance'
      });
      console.log('默认财务账号创建成功: finance / 123456');
    }

    const port = process.env.PORT || 3000;
    await fastify.listen({ port, host: '0.0.0.0' });
    console.log(`服务器启动成功，端口: ${port}`);
  } catch (err) {
    console.error('启动失败:', err);
    process.exit(1);
  }
};

start();
