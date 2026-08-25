const jwt = require('jsonwebtoken');
const { User } = require('../models');

const authMiddleware = async (request, reply) => {
  try {
    const authHeader = request.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return reply.status(401).send({ message: '未提供认证令牌' });
    }

    const token = authHeader.replace('Bearer ', '');
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    const user = await User.findByPk(decoded.userId);
    if (!user || user.status !== 'active') {
      return reply.status(401).send({ message: '用户不存在或已被禁用' });
    }

    request.user = user;
  } catch (error) {
    return reply.status(401).send({ message: '认证令牌无效或已过期' });
  }
};

const roleMiddleware = (roles) => {
  return async (request, reply) => {
    if (!request.user) {
      return reply.status(401).send({ message: '请先登录' });
    }
    
    if (!roles.includes(request.user.role)) {
      return reply.status(403).send({ message: '权限不足' });
    }
  };
};

module.exports = { authMiddleware, roleMiddleware };
