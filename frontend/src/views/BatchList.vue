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
        <el-table-column label="库存进度" width="200">
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
        <el-table-column prop="createdAt" label="创建时间" width="180">
          <template #default="{ row }">
            {{ formatDate(row.createdAt) }}
          </template>
        </el-table-column>
        <el-table-column label="操作" width="340" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="viewDetail(row)">详情</el-button>
            <el-button v-if="row.status === 'pending'" link type="primary" @click="editBatch(row)">编辑</el-button>
            <el-button v-if="row.status === 'pending'" link type="success" @click="handleActivate(row)">激活</el-button>
            <el-button v-if="row.status === 'active'" link type="primary" @click="openIssueDialog(row)">发放</el-button>
            <el-button v-if="row.status === 'active'" link type="warning" @click="handleStop(row)">停止</el-button>
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

    <el-dialog v-model="issueDialogVisible" title="发放优惠券" width="520px">
      <div v-if="issueBatch" class="mb-4 text-sm">
        批次：<strong>{{ issueBatch.name }}</strong>（剩余库存 {{ issueBatch.totalQuantity - issueBatch.receivedQuantity }}）
      </div>
      <el-tabs v-model="issueMode">
        <el-tab-pane label="指定用户发放" name="manual">
          <el-form label-width="90px">
            <el-form-item label="用户ID">
              <el-input
                v-model="issueForm.userIdsText"
                type="textarea"
                :rows="4"
                placeholder="支持一个或多个用户ID，用逗号、空格或换行分隔，如：1001,1002 1003"
              />
            </el-form-item>
          </el-form>
        </el-tab-pane>
        <el-tab-pane label="按人群定向发放" name="targeted">
          <el-form label-width="90px">
            <el-form-item label="用户分层">
              <el-select v-model="issueForm.segment" placeholder="请选择用户分层" style="width: 100%">
                <el-option label="高价值用户（累计实付≥1万）" value="highValue" />
                <el-option label="活跃用户（累计实付≥1千）" value="active" />
                <el-option label="普通用户（有过消费）" value="normal" />
                <el-option label="沉睡用户（未产生消费）" value="inactive" />
              </el-select>
            </el-form-item>
            <div class="text-sm tip">按数据分析的分层口径，向该分层内已有领取记录的用户发放。</div>
          </el-form>
        </el-tab-pane>
      </el-tabs>
      <template #footer>
        <el-button @click="issueDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="issuing" @click="handleIssue">确认发放</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus } from '@element-plus/icons-vue'
import { useCouponStore } from '@/stores/couponStore'
import { activateBatch, stopBatch, cancelBatch, issueCoupons, issueTargetedCoupons } from '@/api/couponApi'
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

const issueDialogVisible = ref(false)
const issuing = ref(false)
const issueMode = ref<'manual' | 'targeted'>('manual')
const issueBatch = ref<any>(null)
const issueForm = reactive({
  userIdsText: '',
  segment: ''
})

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

const getProgress = (row: any) => {
  if (!row.totalQuantity) return 0
  return Math.min(100, (row.receivedQuantity / row.totalQuantity) * 100)
}

const formatDate = (date: string) => {
  return dayjs(date).format('YYYY-MM-DD HH:mm:ss')
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

const openIssueDialog = (row: any) => {
  issueBatch.value = row
  issueMode.value = 'manual'
  issueForm.userIdsText = ''
  issueForm.segment = ''
  issueDialogVisible.value = true
}

const showIssueResult = (res: any) => {
  if (res.failCount > 0) {
    const failMsgs = (res.results || [])
      .filter((r: any) => !r.success)
      .slice(0, 5)
      .map((r: any) => `用户${r.userId}：${r.message}`)
      .join('；')
    ElMessage.warning(`${res.message}。失败示例：${failMsgs}`)
  } else {
    ElMessage.success(res.message)
  }
}

const handleIssue = async () => {
  if (!issueBatch.value) return

  issuing.value = true
  try {
    if (issueMode.value === 'manual') {
      const userIds = issueForm.userIdsText
        .split(/[\s,，]+/)
        .map(s => parseInt(s, 10))
        .filter(n => !Number.isNaN(n))
      if (userIds.length === 0) {
        ElMessage.warning('请输入至少一个有效的用户ID')
        return
      }
      const res = await issueCoupons({ batchId: issueBatch.value.id, userIds })
      showIssueResult(res)
    } else {
      if (!issueForm.segment) {
        ElMessage.warning('请选择用户分层')
        return
      }
      const res = await issueTargetedCoupons({ batchId: issueBatch.value.id, segment: issueForm.segment })
      showIssueResult(res)
    }
    issueDialogVisible.value = false
    loadBatches()
  } catch (error) {
    console.error('Issue failed:', error)
  } finally {
    issuing.value = false
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

.mb-4 {
  margin-bottom: 16px;
}

.tip {
  margin-top: -8px;
}
</style>
