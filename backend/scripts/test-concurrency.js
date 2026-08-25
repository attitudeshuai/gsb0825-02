/**
 * 并发锁顺序验证脚本（真实 Postgres + 后端服务运行中）
 * 阶段A：同一批次并发 领取 + 发放，验证无死锁、不超发、不重复、计数一致
 * 阶段B：同一批次并发 领取 + 发放进行中插入取消批次，验证无死锁
 */
const BASE = `http://localhost:${process.env.PORT || 3100}`;
const { sequelize, CouponBatch, CouponCode } = require('../models');

async function api(method, path, body, token) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function setupBatch(token, name, total) {
  const created = await api('POST', '/api/batches', {
    name,
    couponType: 'fixed',
    faceValue: 10,
    minAmount: 0,
    totalQuantity: total,
    limitPerPerson: 1,
    validityType: 'relative',
    validDays: 30,
    scope: 'all',
    allowStacking: false,
    deliveryStrategy: 'receive'
  }, token);
  const batchId = created.data.id;
  await api('POST', `/api/batches/${batchId}/activate`, {}, token);
  await api('POST', `/api/batches/${batchId}/generate-codes`, { count: total, prefix: 'CT' }, token);
  return batchId;
}

async function cleanupBatch(batchId) {
  await sequelize.query('DELETE FROM risk_intercepts WHERE user_id >= 10000');
  await sequelize.query('DELETE FROM receive_records WHERE batch_id = ?', { replacements: [batchId] });
  await sequelize.query('DELETE FROM use_records WHERE batch_id = ?', { replacements: [batchId] });
  await sequelize.query('DELETE FROM coupon_codes WHERE batch_id = ?', { replacements: [batchId] });
  await sequelize.query('DELETE FROM coupon_batches WHERE id = ?', { replacements: [batchId] });
}

function checkDeadlock(results, phase) {
  const deadlocks = results.filter(r => /deadlock/i.test(r.data && r.data.message || ''));
  if (deadlocks.length > 0) {
    console.error(`❌ [${phase}] 检测到死锁:`, deadlocks.slice(0, 3));
    return false;
  }
  console.log(`✅ [${phase}] 无死锁（共 ${results.length} 个并发请求）`);
  return true;
}

async function main() {
  const login = await api('POST', '/api/auth/login', { username: 'admin', password: '123456' });
  const token = login.data.token;
  console.log('[0] 登录成功');
  let pass = true;

  // ========== 阶段A：并发 领取 + 发放 ==========
  const batchA = await setupBatch(token, '并发测试A-' + Date.now(), 200);
  const codesA = (await api('GET', `/api/codes?batchId=${batchA}&status=available&pageSize=200`, null, token)).data.list;
  console.log(`[A] 批次 ${batchA}，200 券码，40 领取 + 15 发放（45人） 并发`);

  const tasksA = [];
  for (let i = 0; i < 40; i++) {
    tasksA.push(() => api('POST', `/api/codes/${codesA[i].id}/receive`, { userId: 10000 + i, deviceId: 'dev-' + i }, token).then(r => ({ kind: 'receive', ...r })));
  }
  for (let i = 0; i < 15; i++) {
    tasksA.push(() => api('POST', `/api/batches/${batchA}/deliver`, { userIds: [20000 + i * 3, 20001 + i * 3, 20002 + i * 3] }, token).then(r => ({ kind: 'deliver', ...r })));
  }
  const resultsA = await Promise.all(tasksA.map(fn => fn().catch(e => ({ kind: 'unknown', status: 0, data: { message: e.message } }))));

  const distA = {};
  resultsA.forEach(r => {
    const key = `${r.kind}:${r.status}:${(r.data && r.data.message || '').slice(0, 40)}`;
    distA[key] = (distA[key] || 0) + 1;
  });
  console.log('[A] 结果分布:', JSON.stringify(distA, null, 2));

  pass = checkDeadlock(resultsA, 'A') && pass;

  const batchAAfter = await CouponBatch.findByPk(batchA);
  const receivedCodesA = await CouponCode.count({ where: { batchId: batchA, status: 'received' } });
  const [recordsA] = await sequelize.query('SELECT COUNT(*) c FROM receive_records WHERE batch_id = ?', { replacements: [batchA], type: sequelize.QueryTypes.SELECT });
  const dupA = await sequelize.query('SELECT user_id FROM coupon_codes WHERE batch_id = ? AND user_id IS NOT NULL AND status != ? GROUP BY user_id HAVING COUNT(*) > 1', { replacements: [batchA, 'cancelled'], type: sequelize.QueryTypes.SELECT });

  console.log(`[A] receivedQuantity=${batchAAfter.receivedQuantity}，received券码=${receivedCodesA}，领取记录=${recordsA.c}，重复用户=${dupA.length}`);
  if (batchAAfter.receivedQuantity !== receivedCodesA || batchAAfter.receivedQuantity !== parseInt(recordsA.c)) {
    pass = false;
    console.error('❌ [A] 数量不一致');
  } else {
    console.log('✅ [A] 批次计数 = 券码状态数 = 领取记录数');
  }
  if (batchAAfter.receivedQuantity > batchAAfter.totalQuantity) {
    pass = false;
    console.error('❌ [A] 超发');
  } else {
    console.log('✅ [A] 未超发');
  }
  if (dupA.length > 0) {
    pass = false;
    console.error('❌ [A] 存在重复发放');
  } else {
    console.log('✅ [A] 无重复发放');
  }
  const deliverOkA = resultsA.filter(r => r.kind === 'deliver' && r.status === 200).length;
  const receiveOkA = resultsA.filter(r => r.kind === 'receive' && r.status === 200).length;
  console.log(`[A] 领取成功 ${receiveOkA}/40，发放请求成功 ${deliverOkA}/15`);
  if (deliverOkA !== 15) {
    pass = false;
    console.error('❌ [A] 存在非预期发放失败');
  }

  // ========== 阶段B：领取 + 发放进行中插入取消 ==========
  const batchB = await setupBatch(token, '并发测试B-' + Date.now(), 200);
  const codesB = (await api('GET', `/api/codes?batchId=${batchB}&status=available&pageSize=200`, null, token)).data.list;
  console.log(`[B] 批次 ${batchB}，40 领取 + 10 发放，150ms 后插入 3 个取消`);

  const tasksB = [];
  for (let i = 0; i < 40; i++) {
    tasksB.push(() => api('POST', `/api/codes/${codesB[i].id}/receive`, { userId: 30000 + i, deviceId: 'dev-b-' + i }, token).then(r => ({ kind: 'receive', ...r })));
  }
  for (let i = 0; i < 10; i++) {
    tasksB.push(() => api('POST', `/api/batches/${batchB}/deliver`, { userIds: [40000 + i * 3, 40001 + i * 3, 40002 + i * 3] }, token).then(r => ({ kind: 'deliver', ...r })));
  }
  const cancelsB = (async () => {
    await sleep(150);
    const cs = [];
    for (let i = 0; i < 3; i++) {
      cs.push(api('POST', `/api/batches/${batchB}/cancel`, {}, token).then(r => ({ kind: 'cancel', ...r })));
    }
    return Promise.all(cs);
  })();

  const resultsB = (await Promise.all(tasksB.map(fn => fn().catch(e => ({ kind: 'unknown', status: 0, data: { message: e.message } }))))).concat(await cancelsB);

  const distB = {};
  resultsB.forEach(r => {
    const key = `${r.kind}:${r.status}:${(r.data && r.data.message || '').slice(0, 40)}`;
    distB[key] = (distB[key] || 0) + 1;
  });
  console.log('[B] 结果分布:', JSON.stringify(distB, null, 2));
  pass = checkDeadlock(resultsB, 'B') && pass;

  const cancelOkB = resultsB.filter(r => r.kind === 'cancel' && r.status === 200).length;
  console.log(`[B] 取消成功 ${cancelOkB}/3（取消成功后其余请求失败属预期业务拒绝）`);

  // 阶段B一致性：批次计数仍应等于领取记录数（取消不回减计数、记录不删除）
  const [recordsB] = await sequelize.query('SELECT COUNT(*) c FROM receive_records WHERE batch_id = ?', { replacements: [batchB], type: sequelize.QueryTypes.SELECT });
  const batchBAfter = await CouponBatch.findByPk(batchB);
  console.log(`[B] receivedQuantity=${batchBAfter.receivedQuantity}，领取记录=${recordsB.c}`);
  if (batchBAfter.receivedQuantity !== parseInt(recordsB.c)) {
    pass = false;
    console.error('❌ [B] 批次计数与领取记录不一致');
  } else {
    console.log('✅ [B] 批次计数 = 领取记录数');
  }

  await cleanupBatch(batchA);
  await cleanupBatch(batchB);
  console.log('[7] 测试数据已清理');

  await sequelize.close();
  console.log(pass ? '\n=== 全部通过 ===' : '\n=== 存在失败项 ===');
  process.exit(pass ? 0 : 1);
}

main().catch(e => {
  console.error('测试执行失败:', e);
  process.exit(1);
});
