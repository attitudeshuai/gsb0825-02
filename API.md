# API 接口文档

## 基础信息

- 基础URL: `http://localhost:3000/api`
- 认证方式: Bearer Token (JWT)
- 数据格式: JSON
- 字符编码: UTF-8

## 通用响应格式

### 成功响应
```json
{
  "code": 0,
  "message": "success",
  "data": {}
}
```

### 失败响应
```json
{
  "code": 400,
  "message": "错误信息",
  "data": null
}
```

### 分页响应
```json
{
  "code": 0,
  "message": "success",
  "data": {
    "list": [],
    "total": 100,
    "page": 1,
    "pageSize": 10
  }
}
```

## 状态码说明

| 状态码 | 说明 |
|--------|------|
| 0 | 成功 |
| 400 | 请求参数错误 |
| 401 | 未认证 |
| 403 | 无权限 |
| 404 | 资源不存在 |
| 500 | 服务器内部错误 |

---

## 1. 认证接口

### 1.1 用户登录

**POST** `/auth/login`

**请求体:**
```json
{
  "username": "admin",
  "password": "123456"
}
```

**成功响应:**
```json
{
  "code": 0,
  "message": "success",
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "user": {
      "id": 1,
      "username": "admin",
      "realName": "系统管理员",
      "role": "admin"
    }
  }
}
```

---

### 1.2 获取当前用户信息

**GET** `/auth/profile`

**Header:** `Authorization: Bearer <token>`

**成功响应:**
```json
{
  "code": 0,
  "message": "success",
  "data": {
    "id": 1,
    "username": "admin",
    "realName": "系统管理员",
    "role": "admin",
    "createdAt": "2024-01-01T00:00:00.000Z"
  }
}
```

---

### 1.3 修改密码

**PUT** `/auth/password`

**Header:** `Authorization: Bearer <token>`

**请求体:**
```json
{
  "oldPassword": "123456",
  "newPassword": "654321"
}
```

---

## 2. 券批次接口

### 2.1 获取批次列表

**GET** `/batches`

**Header:** `Authorization: Bearer <token>`

**查询参数:**
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| page | number | 否 | 页码，默认1 |
| pageSize | number | 否 | 每页数量，默认10 |
| status | string | 否 | 状态筛选(pending/active/ended/cancelled) |
| couponType | string | 否 | 券类型筛选 |
| keyword | string | 否 | 关键词搜索 |

**成功响应:**
```json
{
  "code": 0,
  "message": "success",
  "data": {
    "list": [
      {
        "id": 1,
        "batchCode": "BATCH001",
        "name": "新年满减券",
        "couponType": "fixed",
        "faceValue": 50,
        "minAmount": 200,
        "totalQuantity": 1000,
        "receivedQuantity": 500,
        "usedQuantity": 300,
        "status": "active",
        "validStartTime": "2024-01-01T00:00:00.000Z",
        "validEndTime": "2024-02-01T00:00:00.000Z",
        "createdAt": "2024-01-01T00:00:00.000Z"
      }
    ],
    "total": 100,
    "page": 1,
    "pageSize": 10
  }
}
```

---

### 2.2 获取批次详情

**GET** `/batches/:id`

**Header:** `Authorization: Bearer <token>`

---

### 2.3 创建批次

**POST** `/batches`

**Header:** `Authorization: Bearer <token>`

**请求体:**
```json
{
  "name": "新年满减券",
  "couponType": "fixed",
  "faceValue": 50,
  "minAmount": 200,
  "maxDiscount": 50,
  "totalQuantity": 1000,
  "limitPerUser": 1,
  "validityType": "fixed",
  "validStartTime": "2024-01-01T00:00:00.000Z",
  "validEndTime": "2024-02-01T00:00:00.000Z",
  "scope": "all",
  "stackable": false,
  "description": "满200减50优惠券"
}
```

**字段说明:**
| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| name | string | 是 | 批次名称 |
| couponType | string | 是 | 券类型: fixed(满减), discount(折扣), direct(直减), redeem(兑换), shipping(运费) |
| faceValue | number | 是 | 面额(非折扣券必填) |
| discountRate | number | 否 | 折扣率(折扣券必填，0.1-0.99) |
| minAmount | number | 否 | 使用门槛 |
| maxDiscount | number | 否 | 最高减免 |
| totalQuantity | number | 是 | 总数量 |
| limitPerUser | number | 是 | 每人限领 |
| validityType | string | 是 | 有效期类型: fixed(固定时间段), relative(领取后N天) |
| validStartTime | string | 否 | 有效开始时间(fixed类型必填) |
| validEndTime | string | 否 | 有效结束时间(fixed类型必填) |
| validDays | number | 否 | 领取后有效天数(relative类型必填) |
| scope | string | 是 | 适用范围: all(全场), category(指定分类), product(指定商品) |
| scopeItems | array | 否 | 适用范围ID列表 |
| stackable | boolean | 是 | 是否可叠加 |
| stackLimit | number | 否 | 叠加限制数量 |
| description | string | 否 | 描述 |

---

### 2.4 更新批次

**PUT** `/batches/:id`

**Header:** `Authorization: Bearer <token>`

**请求体:** 同创建批次

---

### 2.5 删除批次

**DELETE** `/batches/:id`

**Header:** `Authorization: Bearer <token>`

**权限:** admin

---

### 2.6 激活批次

**POST** `/batches/:id/activate`

**Header:** `Authorization: Bearer <token>`

---

### 2.7 取消批次

**POST** `/batches/:id/cancel`

**Header:** `Authorization: Bearer <token>`

**权限:** admin

---

## 3. 券码接口

### 3.1 获取券码列表

**GET** `/codes`

**Header:** `Authorization: Bearer <token>`

**查询参数:**
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| page | number | 否 | 页码 |
| pageSize | number | 否 | 每页数量 |
| batchId | number | 否 | 批次ID |
| status | string | 否 | 状态: available/received/used/expired |
| code | string | 否 | 券码搜索 |

---

### 3.2 批量生成券码

**POST** `/codes/generate`

**Header:** `Authorization: Bearer <token>`

**请求体:**
```json
{
  "batchId": 1,
  "quantity": 1000,
  "prefix": "CNY",
  "codeLength": 8,
  "codeType": "random"
}
```

**字段说明:**
| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| batchId | number | 是 | 批次ID |
| quantity | number | 是 | 生成数量 |
| prefix | string | 否 | 券码前缀 |
| codeLength | number | 是 | 券码长度 |
| codeType | string | 是 | 生成类型: random(随机), numeric(纯数字), alphanumeric(字母数字) |

---

### 3.3 更新券码状态

**PUT** `/codes/:id/status`

**Header:** `Authorization: Bearer <token>`

**请求体:**
```json
{
  "status": "cancelled"
}
```

---

## 4. 记录接口

### 4.1 领取记录列表

**GET** `/records/receive`

**Header:** `Authorization: Bearer <token>`

**查询参数:**
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| page | number | 否 | 页码 |
| pageSize | number | 否 | 每页数量 |
| batchId | number | 否 | 批次ID |
| userId | string | 否 | 用户ID/手机号 |
| channel | string | 否 | 渠道 |
| startTime | string | 否 | 开始时间 |
| endTime | string | 否 | 结束时间 |

---

### 4.2 核销记录列表

**GET** `/records/use`

**Header:** `Authorization: Bearer <token>`

**查询参数:** 同领取记录

---

### 4.3 用户领取券

**POST** `/receive`

**Header:** `Authorization: Bearer <token>`

**请求体:**
```json
{
  "batchId": 1,
  "userId": "user001",
  "channel": "app",
  "ip": "192.168.1.1",
  "deviceId": "device001"
}
```

---

### 4.4 核销券

**POST** `/use`

**Header:** `Authorization: Bearer <token>`

**请求体:**
```json
{
  "code": "CNY123456",
  "userId": "user001",
  "orderNo": "ORD20240101001",
  "orderAmount": 300
}
```

---

## 5. 风控接口

### 5.1 获取风控规则

**GET** `/risk/rules`

**Header:** `Authorization: Bearer <token>`

**权限:** admin

**成功响应:**
```json
{
  "code": 0,
  "message": "success",
  "data": {
    "maxReceivePerHour": 10,
    "maxReceivePerDay": 50,
    "maxReceivePerUser": 3,
    "ipMaxReceivePerHour": 100,
    "deviceMaxReceivePerHour": 50,
    "abnormalDetectEnabled": true,
    "riskThreshold": 80
  }
}
```

---

### 5.2 更新风控规则

**PUT** `/risk/rules`

**Header:** `Authorization: Bearer <token>`

**权限:** admin

**请求体:** 同获取风控规则的data字段

---

### 5.3 获取黑名单列表

**GET** `/risk/blacklist`

**Header:** `Authorization: Bearer <token>`

**权限:** admin

**查询参数:**
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| page | number | 否 | 页码 |
| pageSize | number | 否 | 每页数量 |
| type | string | 否 | 类型: ip, device, user |
| keyword | string | 否 | 关键词搜索 |

---

### 5.4 添加黑名单

**POST** `/risk/blacklist`

**Header:** `Authorization: Bearer <token>`

**权限:** admin

**请求体:**
```json
{
  "type": "ip",
  "value": "192.168.1.1",
  "reason": "异常领取行为",
  "expireTime": "2024-12-31T23:59:59.000Z"
}
```

---

### 5.5 删除黑名单

**DELETE** `/risk/blacklist/:id`

**Header:** `Authorization: Bearer <token>`

**权限:** admin

---

### 5.6 获取拦截记录

**GET** `/risk/intercepts`

**Header:** `Authorization: Bearer <token>`

**权限:** admin

**查询参数:**
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| page | number | 否 | 页码 |
| pageSize | number | 否 | 每页数量 |
| interceptType | string | 否 | 拦截类型 |
| startTime | string | 否 | 开始时间 |
| endTime | string | 否 | 结束时间 |

---

## 6. 数据分析接口

### 6.1 获取概览数据

**GET** `/analytics/overview`

**Header:** `Authorization: Bearer <token>`

**成功响应:**
```json
{
  "code": 0,
  "message": "success",
  "data": {
    "totalBatches": 50,
    "totalCoupons": 100000,
    "totalReceived": 60000,
    "totalUsed": 40000,
    "receiveRate": 60,
    "useRate": 66.67,
    "totalGmv": 2000000,
    "totalDiscount": 500000,
    "roi": 4.0,
    "todayReceived": 500,
    "todayUsed": 300
  }
}
```

---

### 6.2 获取趋势数据

**GET** `/analytics/trend`

**Header:** `Authorization: Bearer <token>`

**查询参数:**
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| days | number | 否 | 天数，默认7 |
| batchId | number | 否 | 批次ID |

**成功响应:**
```json
{
  "code": 0,
  "message": "success",
  "data": {
    "dates": ["2024-01-01", "2024-01-02", "2024-01-03"],
    "receiveData": [100, 200, 150],
    "useData": [50, 120, 100],
    "gmvData": [5000, 12000, 10000]
  }
}
```

---

### 6.3 获取漏斗数据

**GET** `/analytics/funnel`

**Header:** `Authorization: Bearer <token>`

**成功响应:**
```json
{
  "code": 0,
  "message": "success",
  "data": {
    "stages": [
      { "name": "曝光", "value": 100000 },
      { "name": "点击", "value": 50000 },
      { "name": "领取", "value": 30000 },
      { "name": "使用", "value": 15000 },
      { "name": "复购", "value": 5000 }
    ],
    "uniqueUsers": 25000
  }
}
```

---

### 6.4 券类型分布

**GET** `/analytics/type-distribution`

**Header:** `Authorization: Bearer <token>`

**成功响应:**
```json
{
  "code": 0,
  "message": "success",
  "data": [
    { "name": "满减券", "value": 50000, "type": "fixed" },
    { "name": "折扣券", "value": 30000, "type": "discount" },
    { "name": "直减券", "value": 15000, "type": "direct" },
    { "name": "兑换券", "value": 3000, "type": "redeem" },
    { "name": "运费券", "value": 2000, "type": "shipping" }
  ]
}
```

---

### 6.5 用户分层数据

**GET** `/analytics/user-segment`

**Header:** `Authorization: Bearer <token>`

**成功响应:**
```json
{
  "code": 0,
  "message": "success",
  "data": {
    "segments": {
      "highValue": { "name": "高价值用户", "count": 1000, "avgGmv": 5000 },
      "mediumValue": { "name": "中等价值用户", "count": 5000, "avgGmv": 2000 },
      "lowValue": { "name": "低价值用户", "count": 15000, "avgGmv": 500 },
      "newUser": { "name": "新用户", "count": 4000, "avgGmv": 300 },
      "churned": { "name": "流失用户", "count": 2000, "avgGmv": 0 }
    }
  }
}
```

---

### 6.6 批次效果分析

**GET** `/analytics/batch-effect`

**Header:** `Authorization: Bearer <token>`

**查询参数:**
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| page | number | 否 | 页码 |
| pageSize | number | 否 | 每页数量 |
| sortBy | string | 否 | 排序字段: receiveRate, useRate, gmv, roi |
| sortOrder | string | 否 | 排序方向: asc, desc |

---

## 7. 数据导出接口

### 7.1 导出批次列表

**GET** `/export/batches`

**Header:** `Authorization: Bearer <token>`

**响应:** Excel文件下载

---

### 7.2 导出券码列表

**GET** `/export/codes`

**Header:** `Authorization: Bearer <token>`

**查询参数:** batchId, status 等筛选条件

---

### 7.3 导出领取记录

**GET** `/export/records/receive`

**Header:** `Authorization: Bearer <token>`

---

### 7.4 导出核销记录

**GET** `/export/records/use`

**Header:** `Authorization: Bearer <token>`

---

### 7.5 导出效果分析

**GET** `/export/analytics`

**Header:** `Authorization: Bearer <token>`

---

## 券类型说明

| 类型值 | 名称 | 说明 |
|--------|------|------|
| fixed | 满减券 | 满足消费门槛后减免固定金额 |
| discount | 折扣券 | 按比例折扣，如8折 |
| direct | 直减券 | 无门槛直接减免固定金额 |
| redeem | 兑换券 | 兑换特定商品或服务 |
| shipping | 运费券 | 抵扣运费 |

## 批次状态说明

| 状态值 | 名称 | 说明 |
|--------|------|------|
| pending | 未开始 | 未到开始时间 |
| active | 进行中 | 可正常领取使用 |
| ended | 已结束 | 已过结束时间 |
| cancelled | 已取消 | 手动取消 |

## 券码状态说明

| 状态值 | 名称 | 说明 |
|--------|------|------|
| available | 未领取 | 可被领取 |
| received | 已领取 | 已被用户领取，待使用 |
| used | 已使用 | 已核销 |
| expired | 已过期 | 超过有效期未使用 |
| cancelled | 已作废 | 手动作废 |

## 领取渠道说明

| 渠道值 | 名称 | 说明 |
|--------|------|------|
| app | APP | 移动端APP |
| miniapp | 小程序 | 微信小程序等 |
| web | 网页 | H5/PC网页 |
| api | API | 接口发放 |
| manual | 手动 | 后台手动发放 |

## 角色说明

| 角色值 | 名称 | 权限范围 |
|--------|------|----------|
| admin | 管理员 | 所有功能 |
| operator | 运营专员 | 批次管理、券码管理、记录查询、数据导出 |
| finance | 财务人员 | 数据查询、数据导出、财务分析 |
