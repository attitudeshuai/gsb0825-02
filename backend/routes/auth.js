const jwt = require('jsonwebtoken');
const { User } = require('../models');

async function routes(fastify, options) {
  fastify.post('/api/auth/login', async (request, reply) => {
    const { username, password } = request.body;

    if (!username || !password) {
      return reply.status(400).send({ message: '请输入用户名和密码' });
    }

    const user = await User.findOne({ where: { username } });
    if (!user) {
      return reply.status(401).send({ message: '用户名或密码错误' });
    }

    if (user.status !== 'active') {
      return reply.status(401).send({ message: '账号已被禁用' });
    }

    const isValid = await user.comparePassword(password);
    if (!isValid) {
      return reply.status(401).send({ message: '用户名或密码错误' });
    }

    user.lastLoginAt = new Date();
    await user.save();

    const token = jwt.sign(
      { userId: user.id, username: user.username, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: process.env.TOKEN_EXPIRES_IN || '24h' }
    );

    return {
      token,
      user: {
        id: user.id,
        username: user.username,
        realName: user.realName,
        role: user.role
      }
    };
  });

  fastify.get('/api/auth/profile', { preHandler: [require('../middleware/auth').authMiddleware] }, async (request, reply) => {
    return {
      user: {
        id: request.user.id,
        username: request.user.username,
        realName: request.user.realName,
        role: request.user.role,
        lastLoginAt: request.user.lastLoginAt
      }
    };
  });

  fastify.post('/api/auth/change-password', { preHandler: [require('../middleware/auth').authMiddleware] }, async (request, reply) => {
    const { oldPassword, newPassword } = request.body;

    const isValid = await request.user.comparePassword(oldPassword);
    if (!isValid) {
      return reply.status(400).send({ message: '原密码错误' });
    }

    request.user.password = newPassword;
    await request.user.save();

    return { message: '密码修改成功' };
  });
}

module.exports = routes;
