<template>
  <div class="page-container">
    <div class="page-header">
      <h2 class="page-title">券码管理</h2>
      <div>
        <el-button type="primary" :icon="Plus" @click="generateDialogVisible = true">
          批量生成券码
        </el-button>
        <el-button :icon="Download" @click="handleExport">
          导出券码
        </el-button>
      </div>
    </div>
    
    <div class="search-bar">
      <el-form :inline="true" :model="searchForm">
        <el-form-item label="批次">
          <el-select v-model="searchForm.batchId" placeholder="请选择批次" clearable style="width: 200px">
            <el-option
              v-for="batch in batches"
              :key="batch.id"
              :label="`${batch.name} (${batch.batchCode})`"
              :value="batch.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="状态">
          <el-select v-model="searchForm.status" placeholder="全部" clearable style="width: 120px">
            <el-option label="未使用" value="available" />
            <el-option label="已领取" value="received" />
            <el-option label="已使用" value="used" />
            <el-option label="已过期" value="expired" />
            <el-option label="已作废" value="cancelled" />
          </el-select>
        </el-form-item>
        <el-form-item label="券码">
          <el-input v-model="searchForm.keyword" placeholder="请输入券码" clearable style="width: 200px" />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="loadCodes">搜索</el-button>
          <el-button @click="resetSearch">重置</el-button>
        </el-form-item>
      </el-form>
    </div>
    
    <div v-loading="loading" class="table-container">
      <el-table :data="codes" border stripe>
        <el-table-column prop="code" label="券码" width="180" />
        <el-table-column label="批次" min-width="150">
          <template #default="{ row }">
            <span v-if="row.CouponBatch">{{ row.CouponBatch.name }}</span>
          </template>
        </el-table-column>
        <el-table-column label="券类型" width="100">
          <template #default="{ row }">
            <span v-if="row.CouponBatch" :class="['coupon-type-tag', row.CouponBatch.couponType]">
              {{ couponTypeText(row.CouponBatch.couponType) }}
            </span>
          </template>
        </el-table-column>
        <el-table-column label="面额" width="100">
          <template #default="{ row }">
            <span v-if="row.CouponBatch">
              <template v-if="row.CouponBatch.couponType === 'discount'">
                {{ (row.CouponBatch.discountRate * 10).toFixed(1) }}折
              </template>
              <template v-else>
                ¥{{ row.CouponBatch.faceValue }}
              </template>
            </span>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="100">
          <template #default="{ row }">
            <span :class="['status-tag', row.status]">{{ statusText(row.status) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="领取用户" width="100">
          <template #default="{ row }">
            {{ row.userId || '-' }}
          </template>
        </el-table-column>
        <el-table-column label="领取时间" width="180">
          <template #default="{ row }">
            {{ row.receivedAt ? formatDate(row.receivedAt) : '-' }}
          </template>
        </el-table-column>
        <el-table-column label="有效期" width="360">
          <template #default="{ row }">
            <template v-if="row.validStartTime && row.validEndTime">
              {{ formatDate(row.validStartTime) }} ~ {{ formatDate(row.validEndTime) }}
            </template>
            <template v-else>-</template>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="180" fixed="right">
          <template #default="{ row }">
            <el-button
              v-if="row.status === 'cancelled'"
              link
              type="primary"
              @click="handleActivate(row)"
            >
              激活
            </el-button>
            <el-button
              v-if="row.status !== 'used' && row.status !== 'cancelled'"
              link
              type="danger"
              @click="handleCancel(row)"
            >
              作废
            </el-button>
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
          @current-change="loadCodes"
          @size-change="handleSizeChange"
        />
      </div>
    </div>
    
    <el-dialog v-model="generateDialogVisible" title="批量生成券码" width="400px">
      <el-form :model="generateForm" label-width="80px">
        <el-form-item label="所属批次" required>
          <el-select v-model="generateForm.batchId" placeholder="请选择批次" style="width: 100%">
            <el-option
              v-for="batch in batches"
              :key="batch.id"
              :label="`${batch.name} (${batch.batchCode})`"
              :value="batch.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="生成数量" required>
          <el-input-number v-model="generateForm.count" :min="1" :max="10000" />
        </el-form-item>
        <el-form-item label="券码前缀">
          <el-input v-model="generateForm.prefix" placeholder="可选" maxlength="10" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="generateDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="generating" @click="handleGenerate">生成</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, Download } from '@element-plus/icons-vue'
import { getCodeList, generateCodes, cancelCode, activateCode, CouponCode } from '@/api/couponApi'
import { getBatchList } from '@/api/couponApi'
import { exportCodes } from '@/api/analyticsApi'
import dayjs from 'dayjs'

const loading = ref(false)
const generating = ref(false)
const codes = ref<CouponCode[]>([])
const batches = ref<any[]>([])
const generateDialogVisible = ref(false)

const searchForm = reactive({
  batchId: '',
  status: '',
  keyword: ''
})

const pagination = reactive({
  page: 1,
  pageSize: 10,
  total: 0
})

const generateForm = reactive({
  batchId: null as number | null,
  count: 100,
  prefix: ''
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
    available: '未使用',
    received: '已领取',
    used: '已使用',
    expired: '已过期',
    cancelled: '已作废'
  }
  return map[status] || status
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

const loadCodes = async () => {
  loading.value = true
  try {
    const params = {
      page: pagination.page,
      pageSize: pagination.pageSize,
      ...searchForm
    }
    const response = await getCodeList(params)
    codes.value = response.list
    pagination.total = response.total
  } finally {
    loading.value = false
  }
}

const resetSearch = () => {
  searchForm.batchId = ''
  searchForm.status = ''
  searchForm.keyword = ''
  pagination.page = 1
  loadCodes()
}

const handleSizeChange = () => {
  pagination.page = 1
  loadCodes()
}

const handleActivate = async (row: CouponCode) => {
  try {
    await ElMessageBox.confirm('确定要激活该券码吗？', '提示', {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'warning'
    })
    await activateCode(row.id)
    ElMessage.success('激活成功')
    loadCodes()
  } catch (error: any) {
    if (error !== 'cancel') {
      console.error('Activate failed:', error)
    }
  }
}

const handleCancel = async (row: CouponCode) => {
  try {
    await ElMessageBox.confirm('确定要作废该券码吗？', '警告', {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'warning'
    })
    await cancelCode(row.id)
    ElMessage.success('已作废')
    loadCodes()
  } catch (error: any) {
    if (error !== 'cancel') {
      console.error('Cancel failed:', error)
    }
  }
}

const handleGenerate = async () => {
  if (!generateForm.batchId) {
    ElMessage.warning('请选择批次')
    return
  }
  
  generating.value = true
  try {
    await generateCodes(generateForm.batchId, {
      count: generateForm.count,
      prefix: generateForm.prefix
    })
    ElMessage.success('生成成功')
    generateDialogVisible.value = false
    loadCodes()
  } catch (error) {
    console.error('Generate failed:', error)
  } finally {
    generating.value = false
  }
}

const handleExport = () => {
  if (!searchForm.batchId) {
    ElMessage.warning('请先选择批次')
    return
  }
  
  ElMessage.info('导出中...')
  exportCodes(parseInt(searchForm.batchId as any)).then((blob: any) => {
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `codes-${searchForm.batchId}-${Date.now()}.xlsx`
    link.click()
    URL.revokeObjectURL(url)
    ElMessage.success('导出成功')
  })
}

onMounted(() => {
  loadBatches()
  loadCodes()
})
</script>

<style scoped lang="scss">
.pagination-container {
  margin-top: 20px;
  display: flex;
  justify-content: flex-end;
}
</style>
