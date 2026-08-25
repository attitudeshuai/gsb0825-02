<template>
  <div class="page-container">
    <div class="page-header">
      <h2 class="page-title">券批次管理</h2>
      <el-button type="primary" :icon="Plus" @click="router.push('/batches/create')">
        创建批次
      </el-button>
    </div>
    
    <div class="search-bar">
      <el-form :inline="true" :model="searchForm">
        <el-form-item label="状态">
          <el-select v-model="searchForm.status" placeholder="全部" clearable style="width: 120px">
            <el-option label="未开始" value="pending" />
            <el-option label="进行中" value="active" />
            <el-option label="已结束" value="ended" />
            <el-option label="已取消" value="cancelled" />
          </el-select>
        </el-form-item>
        <el-form-item label="券类型">
          <el-select v-model="searchForm.couponType" placeholder="全部" clearable style="width: 120px">
            <el-option label="满减券" value="fixed" />
            <el-option label="折扣券" value="discount" />
            <el-option label="直减券" value="direct" />
            <el-option label="兑换券" value="exchange" />
            <el-option label="运费券" value="shipping" />
          </el-select>
        </el-form-item>
        <el-form-item label="关键词">
          <el-input v-model="searchForm.keyword" placeholder="批次名称/编码" clearable style="width: 200px" />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="loadBatches">搜索</el-button>
          <el-button @click="resetSearch">重置</el-button>
        </el-form-item>
      </el-form>
    </div>
    
    <div v-loading="loading" class="table-container">
      <el-table :data="batches" border stripe>
        <el-table-column prop="batchCode" label="批次编码" width="180" />
        <el-table-column prop="name" label="批次名称" min-width="150" />
        <el-table-column label="券类型" width="100">
          <template #default="{ row }">
            <span :class="['coupon-type-tag', row.couponType]">{{ couponTypeText(row.couponType) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="面额" width="100">
          <template #default="{ row }">
            <template v-if="row.couponType === 'discount'">
              {{ (row.discountRate * 10).toFixed(1) }}折
            </template>
            <template v-else>
              ¥{{ row.faceValue }}
            </template>
          </template>
        </el-table-column>
        <el-table-column label="投放策略" width="110">
          <template #default="{ row }">
            <el-tag size="small" :type="strategyTagType(row.deliveryStrategy)">
              {{ strategyText(row.deliveryStrategy) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="库存进度" width="180">
          <template #default="{ row }">
            <div class="progress-container">
              <div class="progress-bar">
                <div class="progress-fill" :style="{ width: getProgress(row) + '%' }"></div>
              </div>
              <span class="text-sm">{{ row.receivedQuantity }}/{{ row.totalQuantity }}</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="100">
          <template #default="{ row }">
            <span :class="['status-tag', row.status]">{{ statusText(row.status) }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="createdAt" label="创建时间" width="170">
          <template #default="{ row }">
            {{ formatDate(row.createdAt) }}
          </template>
        </el-table-column>
        <el-table-column label="操作" width="320" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="viewDetail(row)">详情</el-button>
            <el-button v-if="row.status === 'pending'" link type="primary" @click="editBatch(row)">编辑</el-button>
            <el-button v-if="row.status === 'pending'" link type="success" @click="handleActivate(row)">激活</el-button>
            <el-button v-if="row.status === 'active'" link type="warning" @click="openDistributeDialog(row)">发券</el-button>
            <el-button v-if="row.status === 'active'" link type="info" @click="handleStop(row)">停止</el-button>
            <el-button v-if="row.status !== 'cancelled'" link type="danger" @click="handleCancel(row)">取消</el-button>
          </template>
        </el-table-column>
      </el-table>
      
      <div class="pagination-container">
        <el-pagination
          v-model:current-page="pagination.page"
          v-model:page-size="pagination.pageSize"
          :total="pagination.total"
          :page-sizes="[10, 20, 50, 100]"
          layout="total, sizes, prev, pager, next, jumper"
          @current-change="loadBatches"
          @size-change="handleSizeChange"
        />
      </div>
    </div>

    <el-dialog v-model="distributeDialogVisible" :title="`发放优惠券 - ${currentBatch?.name || ''}`" width="600px">
      <el-tabs v-model="distributeTab">
        <el-tab-pane label="手动发放" name="manual">
          <el-form label-width="100px">
            <el-form-item label="发放方式">
              <el-radio-group v-model="manualMode">
                <el-radio label="single">单个用户</el-radio>
                <el-radio label="batch">批量用户</el-radio>
              </el-radio-group>
            </el-form-item>
            <el-form-item v-if="manualMode === 'single'" label="用户ID">
              <el-input-number v-model="singleUserId" :min="1" placeholder="请输入用户ID" style="width: 100%" controls-position="right" />
            </el-form-item>
            <el-form-item v-else label="用户ID列表">
              <el-input
                v-model="batchUserIds"
                type="textarea"
                :rows="6"
                placeholder="请输入用户ID，多个ID用英文逗号、换行或空格分隔"
              />
              <div class="form-tip">示例：1001, 1002, 1003 或每行一个ID</div>
            </el-form-item>
            <el-alert
              v-if="currentBatch"
              :title="`剩余库存：${currentBatch.totalQuantity - currentBatch.receivedQuantity} 张，每人限领 ${currentBatch.limitPerPerson} 张`"
              type="info"
              :closable="false"
              show-icon
            />
          </el-form>
        </el-tab-pane>
        <el-tab-pane label="定向发放" name="targeted">
          <el-form label-width="100px">
            <el-form-item label="选择分层">
              <el-select v-model="selectedSegmentId" placeholder="请选择用户分层" style="width: 100%">
                <el-option-group label="内置动态分层">
                  <el-option
                    v-for="seg in dynamicSegments"
                    :key="seg.id"
                    :label="`${seg.name}（实时约 ${seg.userCount} 人）`"
                    :value="seg.id"
                  >
                    <span>{{ seg.name }}</span>
                    <span style="float: right; color: #909399; font-size: 12px">
                      {{ seg.segmentType === 'dynamic' ? '动态' : '静态' }} · {{ seg.userCount }}人
                    </span>
                  </el-option>
                </el-option-group>
                <el-option-group v-if="staticSegments.length" label="自定义静态分层">
                  <el-option
                    v-for="seg in staticSegments"
                    :key="seg.id"
                    :label="`${seg.name}（${seg.userCount}人）`"
                    :value="seg.id"
                  />
                </el-option-group>
              </el-select>
            </el-form-item>
            <el-form-item v-if="selectedSegment">
              <el-button link type="primary" :loading="refreshingCount" @click="refreshSegmentCount">
                刷新分层人数
              </el-button>
              <span v-if="selectedSegment?.description" class="segment-desc">{{ selectedSegment.description }}</span>
            </el-form-item>
            <el-alert
              v-if="currentBatch"
              :title="`剩余库存：${currentBatch.totalQuantity - currentBatch.receivedQuantity} 张，每人限领 ${currentBatch.limitPerPerson} 张`"
              type="info"
              :closable="false"
              show-icon
            />
            <el-alert
              title="定向发放会根据分层条件实时查询用户，动态分层人数以刷新时为准。已达限领上限的用户会自动跳过。"
              type="warning"
              :closable="false"
              show-icon
              style="margin-top: 12px"
            />
            <div v-if="!segments.length" class="empty-tip">
              暂无用户分层，<el-link type="primary" @click="router.push('/segments')">去创建</el-link>
            </div>
          </el-form>
        </el-tab-pane>
      </el-tabs>

      <div v-if="distributeResult" class="distribute-result">
        <el-alert :title="distributeResult.message" type="success" :closable="false" show-icon />
        <div v-if="distributeResult.skipped?.length" class="result-section">
          <h4>已跳过 ({{ distributeResult.skipped.length }})</h4>
          <div v-for="(item, idx) in distributeResult.skipped.slice(0, 10)" :key="idx" class="result-item">
            用户{{ item.userId }}: {{ item.reason }}
          </div>
          <div v-if="distributeResult.skipped.length > 10" class="result-more">
            ...还有 {{ distributeResult.skipped.length - 10 }} 条
          </div>
        </div>
        <div v-if="distributeResult.failed?.length" class="result-section">
          <h4>发放失败 ({{ distributeResult.failed.length }})</h4>
          <div v-for="(item, idx) in distributeResult.failed.slice(0, 10)" :key="idx" class="result-item error">
            用户{{ item.userId }}: {{ item.reason }}
          </div>
          <div v-if="distributeResult.failed.length > 10" class="result-more">
            ...还有 {{ distributeResult.failed.length - 10 }} 条
          </div>
        </div>
      </div>

      <template #footer>
        <el-button @click="distributeDialogVisible = false">关闭</el-button>
        <el-button type="primary" :loading="distributing" @click="handleDistribute">
          确认发放
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus } from '@element-plus/icons-vue'
import { useCouponStore } from '@/stores/couponStore'
import { activateBatch, stopBatch, cancelBatch, manualDistribute, targetedDistribute } from '@/api/couponApi'
import { getAllSegments, initBuiltinSegments, refreshSegmentCount as refreshSegmentCountApi } from '@/api/segmentApi'
import dayjs from 'dayjs'

const router = useRouter()
const couponStore = useCouponStore()

const loading = ref(false)
const batches = ref<any[]>([])
const searchForm = reactive({
  status: '',
  couponType: '',
  keyword: ''
})

const pagination = reactive({
  page: 1,
  pageSize: 10,
  total: 0
})

const distributeDialogVisible = ref(false)
const distributeTab = ref('manual')
const distributing = ref(false)
const currentBatch = ref<any>(null)
const manualMode = ref<'single' | 'batch'>('single')
const singleUserId = ref<number | null>(null)
const batchUserIds = ref('')
const selectedSegmentId = ref<number | null>(null)
const distributeResult = ref<any>(null)
const segments = ref<any[]>([])
const refreshingCount = ref(false)

const dynamicSegments = computed(() => segments.value.filter(s => s.segmentType === 'dynamic'))
const staticSegments = computed(() => segments.value.filter(s => s.segmentType === 'static'))
const selectedSegment = computed(() => segments.value.find(s => s.id === selectedSegmentId.value) || null)

const couponTypeText = (type: string) => {
  const map: Record<string, string> = {
    fixed: '满减券',
    discount: '折扣券',
    direct: '直减券',
    exchange: '兑换券',
    shipping: '运费券'
  }
  return map[type] || type
}

const statusText = (status: string) => {
  const map: Record<string, string> = {
    pending: '未开始',
    active: '进行中',
    ended: '已结束',
    cancelled: '已取消'
  }
  return map[status] || status
}

const strategyText = (strategy: string) => {
  const map: Record<string, string> = {
    manual: '手动发放',
    receive: '用户领取',
    redeem: '兑换码',
    targeted: '定向发放',
    new_user: '新人券'
  }
  return map[strategy] || strategy
}

const strategyTagType = (strategy: string) => {
  const map: Record<string, string> = {
    manual: 'warning',
    receive: 'success',
    redeem: 'primary',
    targeted: 'danger',
    new_user: 'info'
  }
  return map[strategy] || ''
}

const getProgress = (row: any) => {
  if (!row.totalQuantity) return 0
  return Math.min(100, (row.receivedQuantity / row.totalQuantity) * 100)
}

const formatDate = (date: string) => {
  return dayjs(date).format('YYYY-MM-DD HH:mm:ss')
}

const parseUserIds = (text: string): number[] => {
  return text
    .split(/[\s,，\n\r]+/)
    .map(s => parseInt(s.trim(), 10))
    .filter(n => !isNaN(n) && n > 0)
}

const loadBatches = async () => {
  loading.value = true
  try {
    const params = {
      page: pagination.page,
      pageSize: pagination.pageSize,
      ...searchForm
    }
    const response = await couponStore.fetchBatches(params)
    batches.value = response.list
    pagination.total = response.total
  } finally {
    loading.value = false
  }
}

const resetSearch = () => {
  searchForm.status = ''
  searchForm.couponType = ''
  searchForm.keyword = ''
  pagination.page = 1
  loadBatches()
}

const handleSizeChange = () => {
  pagination.page = 1
  loadBatches()
}

const viewDetail = (row: any) => {
  ElMessage.info('查看详情功能开发中')
}

const editBatch = (row: any) => {
  router.push(`/batches/${row.id}/edit`)
}

const handleActivate = async (row: any) => {
  try {
    await ElMessageBox.confirm('确定要激活该批次吗？', '提示', {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'warning'
    })
    await activateBatch(row.id)
    ElMessage.success('激活成功')
    loadBatches()
  } catch (error: any) {
    if (error !== 'cancel') {
      console.error('Activate failed:', error)
    }
  }
}

const handleStop = async (row: any) => {
  try {
    await ElMessageBox.confirm('确定要停止该批次吗？', '提示', {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'warning'
    })
    await stopBatch(row.id)
    ElMessage.success('已停止')
    loadBatches()
  } catch (error: any) {
    if (error !== 'cancel') {
      console.error('Stop failed:', error)
    }
  }
}

const handleCancel = async (row: any) => {
  try {
    await ElMessageBox.confirm('取消后该批次下的所有券将作废，确定要取消吗？', '警告', {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'warning'
    })
    await cancelBatch(row.id)
    ElMessage.success('已取消')
    loadBatches()
  } catch (error: any) {
    if (error !== 'cancel') {
      console.error('Cancel failed:', error)
    }
  }
}

const openDistributeDialog = async (row: any) => {
  currentBatch.value = row
  distributeDialogVisible.value = true
  distributeResult.value = null
  distributeTab.value = 'manual'
  manualMode.value = 'single'
  singleUserId.value = null
  batchUserIds.value = ''
  selectedSegmentId.value = null
  try {
    await initBuiltinSegments()
    const segList = await getAllSegments()
    segments.value = segList || []
  } catch (e) {
    segments.value = []
  }
}

const refreshSegmentCount = async () => {
  if (!selectedSegmentId.value) return
  refreshingCount.value = true
  try {
    const res: any = await refreshSegmentCountApi(selectedSegmentId.value)
    const seg = segments.value.find(s => s.id === selectedSegmentId.value)
    if (seg) {
      seg.userCount = res.userCount
    }
    ElMessage.success(`当前分层人数：${res.userCount}`)
  } catch (error: any) {
    ElMessage.error(error?.message || '刷新失败')
  } finally {
    refreshingCount.value = false
  }
}

const handleDistribute = async () => {
  if (!currentBatch.value) return

  try {
    if (distributeTab.value === 'manual') {
      let userIds: number[] = []
      if (manualMode.value === 'single') {
        if (!singleUserId.value) {
          ElMessage.warning('请输入用户ID')
          return
        }
        userIds = [singleUserId.value]
      } else {
        userIds = parseUserIds(batchUserIds.value)
        if (userIds.length === 0) {
          ElMessage.warning('请输入有效的用户ID')
          return
        }
      }
      distributing.value = true
      const res: any = await manualDistribute(currentBatch.value.id, { userIds })
      distributeResult.value = res
      ElMessage.success(res.message || '发放完成')
    } else {
      if (!selectedSegmentId.value) {
        ElMessage.warning('请选择用户分层')
        return
      }
      distributing.value = true
      const res: any = await targetedDistribute(currentBatch.value.id, { segmentId: selectedSegmentId.value })
      distributeResult.value = res
      ElMessage.success(res.message || '发放完成')
    }
    loadBatches()
  } catch (error: any) {
    ElMessage.error(error?.message || '发放失败')
  } finally {
    distributing.value = false
  }
}

onMounted(() => {
  loadBatches()
})
</script>

<style scoped lang="scss">
.pagination-container {
  margin-top: 20px;
  display: flex;
  justify-content: flex-end;
}

.text-sm {
  font-size: 12px;
  color: #909399;
}

.form-tip {
  font-size: 12px;
  color: #909399;
  margin-top: 4px;
}

.empty-tip {
  margin-top: 12px;
  font-size: 13px;
  color: #909399;
}

.segment-desc {
  margin-left: 12px;
  font-size: 12px;
  color: #909399;
}

.distribute-result {
  margin-top: 16px;
  max-height: 300px;
  overflow-y: auto;
}

.result-section {
  margin-top: 12px;

  h4 {
    margin: 0 0 8px 0;
    font-size: 14px;
    color: #606266;
  }
}

.result-item {
  font-size: 13px;
  color: #e6a23c;
  padding: 4px 0;
  border-bottom: 1px dashed #ebeef5;

  &.error {
    color: #f56c6c;
  }
}

.result-more {
  font-size: 12px;
  color: #909399;
  padding: 4px 0;
}
</style>
