# 优惠券管理系统 (Coupon Management System)

企业级优惠券全生命周期管理平台，支持多种券类型配置、精准投放策略、领取核销追踪、风控防刷、数据分析。运营人员可精细化运营优惠券，提升用户转化与复购。

## 技术栈

| 层级 | 技术选型 |
|------|---------|
| 前端 | Vue 3 + Vite + TypeScript + Element Plus |
| 状态管理 | Pinia |
| 后端 | Node.js + Fastify |
| 数据库 | PostgreSQL + Sequelize |
| 认证 | JWT + bcrypt |
| 部署 | Docker Compose |
| 图表 | ECharts + vue-echarts |
| Excel导出 | exceljs + xlsx |

## 功能特性

### 用户认证与权限
- ✅ JWT + bcrypt 安全认证
- ✅ 角色权限区分（管理员、运营专员、财务）
- ✅ 默认演示账号:
  - 管理员: `admin / 123456`
  - 运营专员: `operator / 123456`
  - 财务人员: `finance / 123456`

### 券类型管理
- ✅ 满减券 - 满足消费门槛后减免固定金额
- ✅ 折扣券 - 按比例折扣
- ✅ 直减券 - 无门槛直接减免
- ✅ 兑换券 - 兑换特定商品或服务
- ✅ 运费券 - 抵扣运费

### 券批次管理
- ✅ 批次编码、总数量、每人限领配置
- ✅ 有效期类型（固定时间段、领取后N天）
- ✅ 适用范围（全场、指定商品、指定分类）
- ✅ 叠加规则配置
- ✅ 批次状态管理（未开始、进行中、已结束、已取消）

### 投放策略
- ✅ 用户主动领取
- ✅ 兑换码兑换
- ✅ 定向推送
- ✅ 新人自动发放
- ✅ 批量导入发放

### 领取与核销追踪
- ✅ 领取记录明细查询
- ✅ 核销记录关联订单
- ✅ 过期提醒
- ✅ 未使用券自动回收
- ✅ 退款退回逻辑

### 风控防刷
- ✅ 领取频率限制
- ✅ 设备/IP黑名单
- ✅ 异常领取检测
- ✅ 拦截记录查询
- ✅ 风控规则可配置

### 数据分析
- ✅ 领取率、核销率统计
- ✅ 带动GMV分析
- ✅ 券后ROI计算
- ✅ 用户留存提升分析
- ✅ 用户分层分析
- ✅ 转化漏斗分析
- ✅ 领取/核销趋势图表

### 数据导出
- ✅ 券批次数据导出
- ✅ 券码数据导出
- ✅ 领取记录导出
- ✅ 核销记录导出
- ✅ 效果分析报表导出

## 项目结构

```
coupon-management/
├── backend/                    # 后端服务
│   ├── config/                 # 配置文件
│   │   └── database.js         # 数据库配置
│   ├── middleware/             # 中间件
│   │   └── auth.js             # 认证中间件
│   ├── models/                 # 数据模型
│   │   ├── index.js            # 模型关联
│   │   ├── User.js             # 用户模型
│   │   ├── CouponBatch.js      # 券批次模型
│   │   ├── CouponCode.js       # 券码模型
│   │   ├── ReceiveRecord.js    # 领取记录模型
│   │   ├── UseRecord.js        # 核销记录模型
│   │   └── RiskRule.js         # 风控规则模型
│   ├── routes/                 # 路由
│   │   ├── auth.js             # 认证接口
│   │   ├── batch.js            # 券批次接口
│   │   ├── code.js             # 券码接口
│   │   ├── record.js           # 记录接口
│   │   ├── risk.js             # 风控接口
│   │   ├── analytics.js        # 数据分析接口
│   │   └── export.js           # 数据导出接口
│   ├── scripts/                # 脚本
│   │   └── init-db.js          # 数据库初始化脚本
│   ├── app.js                  # 应用入口
│   ├── package.json
│   ├── .env                    # 环境变量
│   └── Dockerfile
├── frontend/                   # 前端应用
│   ├── src/
│   │   ├── api/                # API接口
│   │   │   ├── request.ts      # axios封装
│   │   │   ├── authApi.ts      # 认证API
│   │   │   ├── couponApi.ts    # 优惠券API
│   │   │   ├── recordApi.ts    # 记录API
│   │   │   ├── riskApi.ts      # 风控API
│   │   │   └── analyticsApi.ts # 数据分析API
│   │   ├── components/         # 公共组件
│   │   │   ├── StatCard.vue    # 统计卡片
│   │   │   ├── CouponPreview.vue # 券预览
│   │   │   ├── RuleBuilder.vue # 规则构建器
│   │   │   └── RiskTag.vue     # 风险标签
│   │   ├── stores/             # Pinia状态管理
│   │   │   ├── authStore.ts    # 认证状态
│   │   │   └── couponStore.ts  # 优惠券状态
│   │   ├── router/             # 路由配置
│   │   │   └── index.ts
│   │   ├── styles/             # 全局样式
│   │   │   └── index.scss
│   │   ├── views/              # 页面组件
│   │   │   ├── Login.vue       # 登录页
│   │   │   ├── Layout.vue      # 布局组件
│   │   │   ├── Dashboard.vue   # 首页概览
│   │   │   ├── BatchList.vue   # 券批次列表
│   │   │   ├── BatchEditor.vue # 券批次编辑
│   │   │   ├── CodeList.vue    # 券码管理
│   │   │   ├── RecordList.vue  # 记录列表
│   │   │   ├── RiskSetting.vue # 风控配置
│   │   │   └── Analytics.vue   # 数据分析
│   │   ├── App.vue
│   │   ├── main.ts
│   │   └── env.d.ts
│   ├── index.html
│   ├── vite.config.ts
│   ├── tsconfig.json
│   ├── package.json
│   ├── nginx.conf
│   └── Dockerfile
├── docker-compose.yml          # Docker Compose配置
├── .gitignore
└── README.md
```

## 快速开始

### 使用 Docker Compose (推荐)

#### 1. 一键启动所有服务

```bash
cd coupon-management
docker-compose up --build
```

#### 2. 访问应用

- 前端地址: http://localhost:8080
- 后端API: http://localhost:3000
- 数据库端口: 5432

#### 3. 登录系统

使用默认演示账号登录:
- 管理员: `admin / 123456`
- 运营专员: `operator / 123456`
- 财务人员: `finance / 123456`

### 本地开发环境

#### 后端开发

```bash
cd backend
npm install
npm run dev
```

#### 前端开发

```bash
cd frontend
npm install
npm run dev
```

#### 数据库初始化

确保PostgreSQL已启动并配置好连接，然后运行:

```bash
cd backend
npm run init-db
```

## API 接口说明

### 认证接口

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| POST | /api/auth/login | 用户登录 | 公开 |
| GET | /api/auth/profile | 获取当前用户信息 | 登录用户 |
| PUT | /api/auth/password | 修改密码 | 登录用户 |

### 券批次接口

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| GET | /api/batches | 获取批次列表 | admin, operator |
| GET | /api/batches/:id | 获取批次详情 | admin, operator |
| POST | /api/batches | 创建批次 | admin, operator |
| PUT | /api/batches/:id | 更新批次 | admin, operator |
| DELETE | /api/batches/:id | 删除批次 | admin |
| POST | /api/batches/:id/activate | 激活批次 | admin, operator |
| POST | /api/batches/:id/cancel | 取消批次 | admin |

### 券码接口

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| GET | /api/codes | 获取券码列表 | admin, operator |
| POST | /api/codes/generate | 批量生成券码 | admin, operator |
| PUT | /api/codes/:id/status | 更新券码状态 | admin, operator |

### 记录接口

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| GET | /api/records/receive | 领取记录列表 | 所有登录用户 |
| GET | /api/records/use | 核销记录列表 | 所有登录用户 |
| POST | /api/receive | 用户领取券 | 登录用户 |
| POST | /api/use | 核销券 | 登录用户 |

### 风控接口

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| GET | /api/risk/rules | 获取风控规则 | admin |
| PUT | /api/risk/rules | 更新风控规则 | admin |
| GET | /api/risk/blacklist | 获取黑名单 | admin |
| POST | /api/risk/blacklist | 添加黑名单 | admin |
| DELETE | /api/risk/blacklist/:id | 删除黑名单 | admin |
| GET | /api/risk/intercepts | 获取拦截记录 | admin |

### 数据分析接口

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| GET | /api/analytics/overview | 获取概览数据 | 所有登录用户 |
| GET | /api/analytics/trend | 获取趋势数据 | 所有登录用户 |
| GET | /api/analytics/funnel | 获取漏斗数据 | 所有登录用户 |
| GET | /api/analytics/type-distribution | 券类型分布 | 所有登录用户 |
| GET | /api/analytics/user-segment | 用户分层数据 | 所有登录用户 |
| GET | /api/analytics/batch-effect | 批次效果分析 | 所有登录用户 |

### 数据导出接口

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| GET | /api/export/batches | 导出批次列表 | admin, operator, finance |
| GET | /api/export/codes | 导出券码列表 | admin, operator, finance |
| GET | /api/export/records/receive | 导出领取记录 | admin, operator, finance |
| GET | /api/export/records/use | 导出核销记录 | admin, operator, finance |
| GET | /api/export/analytics | 导出效果分析 | admin, finance |

## 角色权限说明

### 管理员 (admin)
- 拥有所有功能权限
- 可管理用户权限
- 可配置风控规则
- 可删除批次、券码等数据

### 运营专员 (operator)
- 可创建、编辑、激活券批次
- 可生成、管理券码
- 可查看领取、核销记录
- 可导出数据
- 不可删除批次、配置风控

### 财务人员 (finance)
- 可查看所有数据
- 可导出数据
- 可查看财务相关分析
- 不可创建、编辑数据

## 核心技术实现

### 高并发领券
- 使用数据库事务保证库存扣减原子性
- 乐观锁防止超发
- 风控前置检查拦截异常请求

### 券规则引擎
- 灵活配置使用门槛、最高减免
- 支持叠加限制规则
- 适用商品范围配置
- 规则校验支持扩展

### 风控防刷
- 基于用户行为模式识别异常领取
- 支持设备指纹和IP聚合分析
- 可配置的频率限制规则
- 实时拦截异常请求

### 券过期回收
- 定时任务自动回收过期未使用的券
- 释放库存并更新统计
- 支持用户消息通知

## 数据库设计

### 核心数据表

**users** - 用户表
| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER | 主键 |
| username | VARCHAR(50) | 用户名 |
| password | VARCHAR(255) | 密码(加密) |
| realName | VARCHAR(50) | 真实姓名 |
| role | VARCHAR(20) | 角色(admin/operator/finance) |
| status | BOOLEAN | 状态 |
| createdAt | DATETIME | 创建时间 |
| updatedAt | DATETIME | 更新时间 |

**coupon_batches** - 券批次表
| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER | 主键 |
| batchCode | VARCHAR(50) | 批次编码 |
| name | VARCHAR(100) | 批次名称 |
| couponType | VARCHAR(20) | 券类型 |
| faceValue | DECIMAL(10,2) | 面额 |
| discountRate | DECIMAL(3,2) | 折扣率 |
| minAmount | DECIMAL(10,2) | 使用门槛 |
| maxDiscount | DECIMAL(10,2) | 最高减免 |
| totalQuantity | INTEGER | 总数量 |
| receivedQuantity | INTEGER | 已领取数量 |
| usedQuantity | INTEGER | 已核销数量 |
| limitPerUser | INTEGER | 每人限领 |
| validStartTime | DATETIME | 有效开始时间 |
| validEndTime | DATETIME | 有效结束时间 |
| validDays | INTEGER | 领取后有效天数 |
| status | VARCHAR(20) | 状态 |
| createdBy | INTEGER | 创建人ID |
| createdAt | DATETIME | 创建时间 |
| updatedAt | DATETIME | 更新时间 |

**coupon_codes** - 券码表
| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER | 主键 |
| batchId | INTEGER | 批次ID |
| code | VARCHAR(50) | 券码 |
| userId | INTEGER | 领取用户ID |
| status | VARCHAR(20) | 状态(available/received/used/expired) |
| validStartTime | DATETIME | 有效开始 |
| validEndTime | DATETIME | 有效结束 |
| createdAt | DATETIME | 创建时间 |
| updatedAt | DATETIME | 更新时间 |

**receive_records** - 领取记录表
| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER | 主键 |
| batchId | INTEGER | 批次ID |
| couponId | INTEGER | 券码ID |
| userId | INTEGER | 用户ID |
| channel | VARCHAR(20) | 领取渠道 |
| ip | VARCHAR(50) | IP地址 |
| deviceId | VARCHAR(100) | 设备ID |
| createdAt | DATETIME | 领取时间 |

**use_records** - 核销记录表
| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER | 主键 |
| batchId | INTEGER | 批次ID |
| couponId | INTEGER | 券码ID |
| userId | INTEGER | 用户ID |
| orderNo | VARCHAR(50) | 订单号 |
| orderAmount | DECIMAL(10,2) | 订单金额 |
| discountAmount | DECIMAL(10,2) | 优惠金额 |
| createdAt | DATETIME | 核销时间 |

## 常见问题

### 1. Docker启动失败如何排查？

```bash
# 查看服务状态
docker-compose ps

# 查看日志
docker-compose logs backend
docker-compose logs frontend
docker-compose logs postgres
```

### 2. 数据库连接失败？

检查 `.env` 文件中的数据库配置，确保 `DB_HOST` 在Docker环境中使用 `postgres`（服务名）。

### 3. 前端无法调用API？

检查 `vite.config.ts` 中的代理配置，或 `nginx.conf` 中的反向代理配置。

### 4. 如何重置演示数据？

```bash
# 停止并删除容器
docker-compose down -v

# 重新启动
docker-compose up --build
```

## License

MIT
