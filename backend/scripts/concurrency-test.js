// 并发一致性 & 死锁验证脚本（针对真实 Postgres）
// 通过 HTTP 打真实端点：并发领取、核销、退款、批量作废、取消批次
const BASE = process.env.BASE || 'http://127.0.0.1:3000';

let token;
async function api(method, path, body) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(BASE + path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  });
  let data = null;
  try { data = await res.json(); } catch (_) {}
  return { status: res.status, data };
}

function isDeadlock(r) {
  const msg = (r.data && r.data.message) || '';
  return /deadlock/i.test(msg) || /40P01/.test(msg);
}

const results = { deadlocks: 0, checks: [] };
function check(name, pass, detail) {
  results.checks.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'} - ${name}${detail ? ' :: ' + detail : ''}`);
}

async function login() {
  const r = await api('POST', '/api/auth/login', { username: 'admin', password: '123456' });
  token = r.data.token;
  if (!token) throw new Error('登录失败: ' + JSON.stringify(r.data));
}

async function createActiveBatch({ total, limitPerPerson, name }) {
  const r = await api('POST', '/api/batches', {
    name, couponType: 'direct', faceValue: 10, totalQuantity: total,
    limitPerPerson, validityType: 'relative', validDays: 30, scope: 'all',
    allowStacking: false, deliveryStrategy: 'receive'
  });
  const batch = r.data;
  await api('POST', `/api/batches/${batch.id}/activate`);
  return batch;
}

async function genCodes(batchId, count) {
  await api('POST', `/api/batches/${batchId}/generate-codes`, { count });
  const r = await api('GET', `/api/codes?batchId=${batchId}&pageSize=1000`);
  return r.data.list;
}

function tallyDeadlocks(rs) {
  for (const r of rs) if (isDeadlock(r)) results.deadlocks++;
}

// 1. 并发领取同一张券：只应有一个成功，绝不超发
async function testConcurrentSameCoupon() {
  const batch = await createActiveBatch({ total: 50, limitPerPerson: 50, name: 'T1-同券并发' });
  const codes = await genCodes(batch.id, 1);
  const couponId = codes[0].id;
  const N = 20;
  const rs = await Promise.all(
    Array.from({ length: N }, (_, i) => api('POST', `/api/codes/${couponId}/receive`, { userId: 1000 + i, deviceId: 'd' + i }))
  );
  tallyDeadlocks(rs);
  const ok = rs.filter(r => r.status === 200).length;
  check('并发领取同一张券只成功1次', ok === 1, `成功=${ok}/${N}`);
}

// 2. 同一用户并发领取多张（limitPerPerson=1）：只应成功一次
async function testPerPersonLimit() {
  const batch = await createActiveBatch({ total: 50, limitPerPerson: 1, name: 'T2-每人限领' });
  const codes = await genCodes(batch.id, 20);
  const N = 20;
  const rs = await Promise.all(
    codes.map(c => api('POST', `/api/codes/${c.id}/receive`, { userId: 7777, deviceId: 'x' }))
  );
  tallyDeadlocks(rs);
  const ok = rs.filter(r => r.status === 200).length;
  check('同用户并发领取受 limitPerPerson=1 约束', ok === 1, `成功=${ok}/${N}`);
}

// 3. 兑换码并发：同用户用多个兑换码，受 limitPerPerson=1 约束
async function testRedeemLimit() {
  const batch = await createActiveBatch({ total: 20, limitPerPerson: 1, name: 'T3-兑换限领' });
  const codes = await genCodes(batch.id, 10);
  const rs = await Promise.all(
    codes.map(c => api('POST', '/api/codes/redeem', { code: c.code, userId: 8888, deviceId: 'x' }))
  );
  tallyDeadlocks(rs);
  const ok = rs.filter(r => r.status === 200).length;
  check('同用户并发兑换受 limitPerPerson=1 约束', ok === 1, `成功=${ok}/${codes.length}`);
}

// 4. 并发核销同一张券：只成功一次，usedQuantity 只+1
async function testConcurrentUse() {
  const batch = await createActiveBatch({ total: 5, limitPerPerson: 5, name: 'T4-核销并发' });
  const codes = await genCodes(batch.id, 1);
  const couponId = codes[0].id;
  await api('POST', `/api/codes/${couponId}/receive`, { userId: 555, deviceId: 'd' });
  const rs = await Promise.all(
    Array.from({ length: 10 }, () => api('POST', `/api/codes/${couponId}/use`, { orderId: 'O' + Math.random(), orderAmount: 100, userId: 555 }))
  );
  tallyDeadlocks(rs);
  const ok = rs.filter(r => r.status === 200).length;
  const b = (await api('GET', `/api/batches/${batch.id}`)).data;
  check('并发核销只成功1次', ok === 1, `成功=${ok}/10`);
  check('并发核销 usedQuantity 只+1', Number(b.usedQuantity) === 1, `usedQuantity=${b.usedQuantity}`);
  return { batchId: batch.id, couponId, userId: 555 };
}

// 5. 并发退款：只成功一次，usedQuantity 只-1（不被减两次）
async function testConcurrentRefund() {
  const batch = await createActiveBatch({ total: 5, limitPerPerson: 5, name: 'T5-退款并发' });
  const codes = await genCodes(batch.id, 1);
  const couponId = codes[0].id;
  await api('POST', `/api/codes/${couponId}/receive`, { userId: 666, deviceId: 'd' });
  const useRes = await api('POST', `/api/codes/${couponId}/use`, { orderId: 'ORD-1', orderAmount: 100, userId: 666 });
  const useRecordId = useRes.data.useRecord.id;
  const before = (await api('GET', `/api/batches/${batch.id}`)).data.usedQuantity;
  const rs = await Promise.all(
    Array.from({ length: 10 }, () => api('POST', `/api/records/use/${useRecordId}/refund`, { refundOrderId: 'R' + Math.random() }))
  );
  tallyDeadlocks(rs);
  const ok = rs.filter(r => r.status === 200).length;
  const after = (await api('GET', `/api/batches/${batch.id}`)).data.usedQuantity;
  check('并发退款只成功1次', ok === 1, `成功=${ok}/10`);
  check('并发退款 usedQuantity 恰好-1（无双减）', Number(before) - Number(after) === 1, `before=${before}, after=${after}`);
}

// 6. 并发批量作废 + 取消批次：主要验证不产生死锁，且 receivedQuantity 不为负
async function testBatchCancelVsCancelBatch() {
  const batch = await createActiveBatch({ total: 40, limitPerPerson: 40, name: 'T6-作废与取消' });
  const codes = await genCodes(batch.id, 40);
  // 先让不同用户领取
  await Promise.all(codes.map((c, i) => api('POST', `/api/codes/${c.id}/receive`, { userId: 20000 + i, deviceId: 'd' })));
  const recs = (await api('GET', `/api/records/receive?batchId=${batch.id}&pageSize=1000`)).data.list;
  const ids = recs.map(r => r.id);
  // 把 ids 拆成多组并发批量作废，同时并发取消批次
  const groups = [ids.slice(0, 20), ids.slice(10, 30), ids.slice(20, 40)];
  const ops = [
    ...groups.map(g => api('POST', '/api/records/receive/batch-cancel', { ids: g })),
    api('POST', `/api/batches/${batch.id}/cancel`),
    ...codes.slice(0, 10).map(c => api('POST', `/api/codes/${c.id}/cancel`))
  ];
  const rs = await Promise.all(ops);
  tallyDeadlocks(rs);
  const b = (await api('GET', `/api/batches/${batch.id}`)).data;
  check('作废/取消并发无 receivedQuantity 变负', Number(b.receivedQuantity) >= 0, `receivedQuantity=${b.receivedQuantity}`);
}

async function main() {
  await login();
  await testConcurrentSameCoupon();
  await testPerPersonLimit();
  await testRedeemLimit();
  await testConcurrentUse();
  await testConcurrentRefund();
  await testBatchCancelVsCancelBatch();

  console.log('\n===== 汇总 =====');
  check('全程无死锁 (40P01)', results.deadlocks === 0, `deadlock count=${results.deadlocks}`);
  const failed = results.checks.filter(c => !c.pass);
  console.log(`\n通过 ${results.checks.length - failed.length}/${results.checks.length}`);
  process.exit(failed.length === 0 ? 0 : 1);
}

main().catch(e => { console.error('测试异常:', e); process.exit(2); });
