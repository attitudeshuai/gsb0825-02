<template>
  <div class="page-container">
    <div class="page-header">
      <h2 class="page-title">{{ isUseRecord ? '核销记录' : '领取记录' }}</h2>
      <div>
        <el-button
          v-if="!isUseRecord"
          type="primary"
          :disabled="selectedIds.length === 0"
          @click="handleBatchCancel"
        >
          批量作废
        </el-button>
        <el-button :icon="Download" @click="handleExport">
          导出
        </el-button>
      </div>
    </div>
    
    <div class="search-bar">
      <el-form :inline="true" :model="searchForm">
        <el-form-item label="批次">
          <el-select v-model="searchForm.batchId" placeholder="全部" clearable style="width: 200px">
            <el-option
              v-for="batch in batches"
              :key="batch.id"
              :label="`${batch.name} (${batch.batchCode})`"
              :value="batch.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item v-if="!isUseRecord" label="渠道">
          <el-select v-model="searchForm.channel" placeholder="全部" clearable style="width: 120px">
            <el-option label="主动领取" value="receive" />
            <el-option label="手动发放" value="manual" />
            <el-option label="兑换码" value="redeem" />
            <el-option label="定向推送" value="targeted" />
            <el-option label="新人专享" value="new_user" />
          </el-select>
        </el-form-item>
        <el-form-item v-if="isUseRecord" label="订单号">
          <el-input v-model="searchForm.orderId" placeholder="请输入订单号" clearable style="width: 200px" />
        </el-form-item>
        <el-form-item label="用户ID">
          <el-input v-model="searchForm.userId" placeholder="请输入用户ID" clearable style="width: 150px" />
        </el-form-item>
        <el-form-item label="时间范围">
          <el-date-picker
            v-model="dateRange"
            type="daterange"
            range-separator="至"
            start-placeholder="开始日期"
            end-placeholder="结束日期"
            value-format="YYYY-MM-DD"
          />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="loadRecords">搜索</el-button>
          <el-button @click="resetSearch">重置</el-button>
        </el-form-item>
      </el-form>
    </div>
    
    <div v-loading="loading" class="table-container">
      <el-table
        :data="records"
        border
        stripe
        @selection-change="handleSelectionChange"
      >
        <el-table-column
          v-if="!isUseRecord"
          type="selection"
          width="55"
          :selectable="(row) => !row.isCancelled"
        />
        
        <template v-if="!isUseRecord">
          <el-table-column prop="id" label="ID" width="80" />
          <el-table-column label="批次" min-width="150">
            <template #default="{ row }">
              <span v-if="row.CouponBatch">{{ row.CouponBatch.name }}</span>
            </template>
          </el-table-column>
          <el-table-column label="券码" width="180">
            <template #default="{ row }">
              <span v-if="row.CouponCode">{{ row.CouponCode.code }}</span>
            </template>
          </el-table-column>
          <el-table-column prop="userId" label="用户ID" width="100" />
          <el-table-column label="渠道" width="100">
            <template #default="{ row }">{{ channelText(row.channel) }}</template>
          </el-table-column>
          <el-table-column prop="ipAddress" label="IP地址" width="130" />
          <el-table-column label="风险等级" width="100">
            <template #default="{ row }">
              <RiskTag :level="row.riskLevel" />
            </template>
          </el-table-column>
          <el-table-column prop="createdAt" label="领取时间" width="180">
            <template #default="{ row }">{{ formatDate(row.createdAt) }}</template>
          </el-table-column>
          <el-table-column label="状态" width="100">
            <template #default="{ row }">
              <span :class="row.isCancelled ? 'status-tag cancelled' : 'status-tag active'">
                {{ row.isCancelled ? '已作废' : '正常' }}
              </span>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="120" fixed="right">
            <template #default="{ row }">
              <el-button
                v-if="!row.isCancelled"
                link
                type="danger"
                @click="handleSingleCancel(row)"
              >
                作废
              </el-button>
            </template>
          </el-table-column>
        </template>
        
        <template v-else>
          <el-table-column prop="id" label="ID" width="80" />
          <el-table-column label="批次" min-width="150">
            <template #default="{ row }">
              <span v-if="row.CouponBatch">{{ row.CouponBatch.name }}</span>
            </template>
          </el-table-column>
          <el-table-column label="券码" width="180">
            <template #default="{ row }">
              <span v-if="row.CouponCode">{{ row.CouponCode.code }}</span>
            </template>
          </el-table-column>
          <el-table-column prop="userId" label="用户ID" width="100" />
          <el-table-column prop="orderId" label="订单号" width="150" />
          <el-table-column prop="orderAmount" label="订单金额" width="100">
            <template #default="{ row }">¥{{ row.orderAmount }}</template>
          </el-table-column>
          <el-table-column prop="discountAmount" label="优惠金额" width="100">
            <template #default="{ row }">¥{{ row.discountAmount }}</template>
          </el-table-column>
          <el-table-column prop="actualPayAmount" label="实付金额" width="100">
            <template #default="{ row }">¥{{ row.actualPayAmount }}</template>
          </el-table-column>
          <el-table-column prop="createdAt" label="核销时间" width="180">
            <template #default="{ row }">{{ formatDate(row.createdAt) }}</template>
          </el-table-column>
          <el-table-column label="状态" width="100">
            <template #default="{ row }">
              <span :class="row.isRefunded ? 'status-tag cancelled' : 'status-tag active'">
                {{ row.isRefunded ? '已退款' : '正常' }}
              </span>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="120" fixed="right">
            <template #default="{ row }">
              <el-button
                v-if="!row.isRefunded"
                link
                type="warning"
                @click="handleRefund(row)"
              >
                退款
              </el-button>
            </template>
          </el-table-column>
        </template>
      </el-table>
      
      <div class="pagination-container">
        <el-pagination
          v-model:current-page="pagination.page"
          v-model:page-size="pagination.pageSize"
          :total="pagination.total"
          :page-sizes="[10, 20, 50, 100]"
          layout="total, sizes, prev, pager, next, jumper"
          @current-change="loadRecords"
          @size-change="handleSizeChange"
        />
      </div>
    </div>
    
    <el-dialog v-model="refundDialogVisible" title="退款处理" width="400px">
      <el-form :model="refundForm" label-width="80px">
        <el-form-item label="退款单号" required>
          <el-input v-model="refundForm.refundOrderId" placeholder="请输入退款单号" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="refundDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="refunding" @click="confirmRefund">确认退款</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Download } from '@element-plus/icons-vue'
import { getReceiveRecords, getUseRecords, batchCancelReceive, refundUseRecord } from '@/api/recordApi'
import { getBatchList } from '@/api/couponApi'
import { exportReceiveRecords, exportUseRecords } from '@/api/analyticsApi'
import RiskTag from '@/components/RiskTag.vue'
import dayjs from 'dayjs'

const route = useRoute()

const isUseRecord = computed(() => route.path.includes('/records/use'))
const loading = ref(false)
const refunding = ref(false)
const records = ref<any[]>([])
const batches = ref<any[]>([])
const selectedIds = ref<number[]>([])
const refundDialogVisible = ref(false)
const currentRefundRecord = ref<any>(null)

const searchForm = reactive({
  batchId: '',
  userId: '',
  channel: '',
  orderId: '',
  startDate: '',
  endDate: ''
})

const dateRange = ref<any[]>([])

const pagination = reactive({
  page: 1,
  pageSize: 10,
  total: 0
})

const refundForm = reactive({
  refundOrderId: ''
})

const channelText = (channel: string) => {
  const map: Record<string, string> = {
    receive: '主动领取',
    manual: '手动发放',
    redeem: '兑换码',
    targeted: '定向推送',
    new_user: '新人专享'
  }
  return map[channel] || channel
}

const formatDate = (date: string) => {
  return dayjs(date).format('YYYY-MM-DD HH:mm:ss')
}

const loadBatches = async () => {
  try {
    const response = await getBatchList({ page: 1, pageSize: 1000 })
    batches.value = response.list
  } catch (error) {
    console.error('Failed to load batches:', error)
  }
}

const loadRecords = async () => {
  loading.value = true
  try {
    const params: any = {
      page: pagination.page,
      pageSize: pagination.pageSize,
      ...searchForm
    }
    
    if (dateRange.value?.length === 2) {
      params.startDate = dateRange.value[0]
      params.endDate = dateRange.value[1]
    }
    
    const response = isUseRecord.value
      ? await getUseRecords(params)
      : await getReceiveRecords(params)
    
    records.value = response.list
    pagination.total = response.total
  } finally {
    loading.value = false
  }
}

const resetSearch = () => {
  searchForm.batchId = ''
  searchForm.userId = ''
  searchForm.channel = ''
  searchForm.orderId = ''
  dateRange.value = []
  pagination.page = 1
  loadRecords()
}

const handleSizeChange = () => {
  pagination.page = 1
  loadRecords()
}

const handleSelectionChange = (selection: any[]) => {
  selectedIds.value = selection.map(item => item.id)
}

const handleSingleCancel = async (row: any) => {
  try {
    await ElMessageBox.confirm('确定要作废该领取记录吗？', '警告', {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'warning'
    })
    await batchCancelReceive({ ids: [row.id] })
    ElMessage.success('作废成功')
    loadRecords()
  } catch (error: any) {
    if (error !== 'cancel') {
      console.error('Cancel failed:', error)
    }
  }
}

const handleBatchCancel = async () => {
  if (selectedIds.value.length === 0) return
  
  try {
    await ElMessageBox.confirm(`确定要作废选中的 ${selectedIds.value.length} 条记录吗？`, '警告', {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'warning'
    })
    await batchCancelReceive({ ids: selectedIds.value })
    ElMessage.success('批量作废成功')
    selectedIds.value = []
    loadRecords()
  } catch (error: any) {
    if (error !== 'cancel') {
      console.error('Batch cancel failed:', error)
    }
  }
}

const handleRefund = (row: any) => {
  currentRefundRecord.value = row
  refundForm.refundOrderId = ''
  refundDialogVisible.value = true
}

const confirmRefund = async () => {
  if (!refundForm.refundOrderId) {
    ElMessage.warning('请输入退款单号')
    return
  }
  
  refunding.value = true
  try {
    await refundUseRecord(currentRefundRecord.value.id, {
      refundOrderId: refundForm.refundOrderId
    })
    ElMessage.success('退款成功')
    refundDialogVisible.value = false
    loadRecords()
  } catch (error) {
    console.error('Refund failed:', error)
  } finally {
    refunding.value = false
  }
}

const handleExport = () => {
  ElMessage.info('导出中...')
  
  const params: any = {}
  if (searchForm.batchId) params.batchId = searchForm.batchId
  if (dateRange.value?.length === 2) {
    params.startDate = dateRange.value[0]
    params.endDate = dateRange.value[1]
  }
  
  const exportFn = isUseRecord.value ? exportUseRecords : exportReceiveRecords
  
  exportFn(params).then((blob: any) => {
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${isUseRecord.value ? 'use' : 'receive'}-records-${Date.now()}.xlsx`
    link.click()
    URL.revokeObjectURL(url)
    ElMessage.success('导出成功')
  })
}

onMounted(() => {
  loadBatches()
  loadRecords()
})
</script>

<style scoped lang="scss">
.pagination-container {
  margin-top: 20px;
  display: flex;
  justify-content: flex-end;
}
</style>
