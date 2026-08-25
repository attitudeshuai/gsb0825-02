<template>
  <div class="page-container">
    <div class="page-header">
      <h2 class="page-title">券发放</h2>
    </div>

    <el-card shadow="never" class="mb-4">
      <el-form label-width="100px">
        <el-form-item label="选择批次" required>
          <el-select
            v-model="batchId"
            placeholder="请选择进行中的批次"
            filterable
            style="width: 480px"
            @change="onBatchChange"
          >
            <el-option
              v-for="batch in activeBatches"
              :key="batch.id"
              :label="`${batch.name}（${batch.batchCode}）`"
              :value="batch.id"
            >
              <span>{{ batch.name }}（{{ batch.batchCode }}）</span>
              <span class="stock-hint">
                剩余 {{ batch.totalQuantity - batch.receivedQuantity }} / {{ batch.totalQuantity }}，每人限领 {{ batch.limitPerPerson }} 张
              </span>
            </el-option>
          </el-select>
          <span v-if="currentBatch" class="ml-2 stock-text">
            可发券码 <b>{{ availableCount }}</b> 张 / 批次总量 {{ currentBatch.totalQuantity }} 张，每人限领 {{ currentBatch.limitPerPerson }} 张
          </span>
        </el-form-item>
        <el-alert
          v-if="currentBatch"
          type="info"
          :closable="false"
          show-icon
          title="手动/定向批次无需提前生成券码：发放时若可发券码不足，系统会在批次总数量内自动补生成券码再发放；达到批次总量后将提示库存不足。"
        />
      </el-form>
    </el-card>

    <el-card shadow="never">
      <el-tabs v-model="activeTab">
        <el-tab-pane label="手动发放（指定用户）" name="manual">
          <el-form label-width="100px">
            <el-form-item label="用户ID" required>
              <el-input
                v-model="manualForm.usersText"
                type="textarea"
                :rows="5"
                placeholder="输入一个或多个用户ID，支持逗号、空格、换行分隔，例如：1001, 1002, 1003"
              />
            </el-form-item>
            <el-form-item label="解析结果">
              <span>共识别到 <b>{{ parsedUserIds.length }}</b> 个用户ID（去重后）</span>
            </el-form-item>
            <el-form-item label="每人发放">
              <el-input-number v-model="manualForm.eachCount" :min="1" :max="100" />
              <span class="ml-2">张（不超过批次每人限领数）</span>
            </el-form-item>
            <el-form-item>
              <el-button
                type="primary"
                :loading="submitting"
                :disabled="!batchId || parsedUserIds.length === 0"
                @click="handleManualIssue"
              >
                确认发放
              </el-button>
            </el-form-item>
          </el-form>
        </el-tab-pane>

        <el-tab-pane label="定向发放（人群分层）" name="targeted">
          <el-form label-width="100px">
            <el-form-item label="目标人群" required>
              <el-select v-model="targetedForm.segment" placeholder="请选择人群分层" style="width: 320px">
                <el-option
                  v-for="seg in segmentOptions"
                  :key="seg.key"
                  :label="`${seg.name}（${seg.count} 人）`"
                  :value="seg.key"
                  :disabled="seg.count === 0"
                />
              </el-select>
            </el-form-item>
            <el-form-item label="发放上限">
              <el-input-number v-model="targetedForm.maxUsers" :min="0" :max="100000" />
              <span class="ml-2">人，0 表示不限（按人群全量发放）</span>
            </el-form-item>
            <el-form-item label="每人发放">
              <el-input-number v-model="targetedForm.eachCount" :min="1" :max="100" />
              <span class="ml-2">张（不超过批次每人限领数）</span>
            </el-form-item>
            <el-form-item>
              <el-button
                type="primary"
                :loading="submitting"
                :disabled="!batchId || !targetedForm.segment"
                @click="handleTargetedIssue"
              >
                确认定向发放
              </el-button>
            </el-form-item>
          </el-form>
        </el-tab-pane>
      </el-tabs>
    </el-card>

    <el-card v-if="lastResult" shadow="never" class="mt-4">
      <template #header>最近一次发放结果</template>
      <el-result
        :icon="lastResult.issued > 0 ? 'success' : 'warning'"
        :title="lastResult.message"
      />
      <el-descriptions :column="3" border>
        <el-descriptions-item label="成功发放">{{ lastResult.issued }} 张</el-descriptions-item>
        <el-descriptions-item label="目标用户数">{{ lastResult.totalUsers }} 人</el-descriptions-item>
        <el-descriptions-item label="跳过用户数">{{ lastResult.skipped.length }} 人</el-descriptions-item>
      </el-descriptions>
      <el-table v-if="lastResult.skipped.length > 0" :data="lastResult.skipped" border stripe class="mt-4">
        <el-table-column prop="userId" label="用户ID" width="150" />
        <el-table-column prop="reason" label="跳过原因" />
      </el-table>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  getBatchList,
  getCodeList,
  issueCoupons,
  issueTargetedCoupons,
  getSegmentOverview,
  type IssueResult
} from '@/api/couponApi'

const route = useRoute()

const activeTab = ref('manual')
const submitting = ref(false)
const batchId = ref<number | null>(null)
const activeBatches = ref<any[]>([])
const segments = ref<Record<string, { name: string; count: number }>>({})
const lastResult = ref<IssueResult | null>(null)
const availableCount = ref(0)

const manualForm = reactive({
  usersText: '',
  eachCount: 1
})

const targetedForm = reactive({
  segment: '',
  maxUsers: 0,
  eachCount: 1
})

const parsedUserIds = computed(() => {
  const ids = manualForm.usersText
    .split(/[\s,，、;；]+/)
    .map(s => s.trim())
    .filter(Boolean)
    .map(s => Number(s))
    .filter(n => Number.isInteger(n) && n > 0)
  return [...new Set(ids)]
})

const segmentOptions = computed(() => {
  const order = ['highValue', 'active', 'normal', 'inactive']
  return order
    .filter(key => segments.value[key])
    .map(key => ({ key, ...segments.value[key] }))
})

const currentBatch = computed(() => activeBatches.value.find(b => b.id === batchId.value))

const loadBatches = async () => {
  const res = await getBatchList({ page: 1, pageSize: 1000, status: 'active' })
  activeBatches.value = res.list
  if (route.query.batchId) {
    const qid = Number(route.query.batchId)
    if (res.list.some(b => b.id === qid)) {
      batchId.value = qid
    }
  }
  await loadAvailableCount()
}

const refreshAfterIssue = () => {
  loadBatches()
  loadSegments()
}

const loadSegments = async () => {
  try {
    segments.value = await getSegmentOverview()
  } catch (error) {
    console.error('Failed to load segments:', error)
  }
}

const loadAvailableCount = async () => {
  if (!batchId.value) {
    availableCount.value = 0
    return
  }
  try {
    const res = await getCodeList({ batchId: batchId.value, status: 'available', page: 1, pageSize: 1 })
    availableCount.value = res.total
  } catch (error) {
    console.error('Failed to load available count:', error)
  }
}

const onBatchChange = () => {
  lastResult.value = null
  loadAvailableCount()
}

const handleManualIssue = async () => {
  if (!batchId.value) {
    ElMessage.warning('请先选择批次')
    return
  }
  if (parsedUserIds.value.length === 0) {
    ElMessage.warning('请输入有效的用户ID')
    return
  }

  try {
    await ElMessageBox.confirm(
      `确认向 ${parsedUserIds.value.length} 个用户每人发放 ${manualForm.eachCount} 张券？`,
      '发放确认',
      { confirmButtonText: '确认发放', cancelButtonText: '取消', type: 'warning' }
    )
  } catch {
    return
  }

  submitting.value = true
  try {
    const result = await issueCoupons(batchId.value, {
      usersText: manualForm.usersText,
      eachCount: manualForm.eachCount
    })
    lastResult.value = result
    ElMessage.success(result.message)
    refreshAfterIssue()
  } catch (error) {
    console.error('Issue failed:', error)
  } finally {
    submitting.value = false
  }
}

const handleTargetedIssue = async () => {
  if (!batchId.value) {
    ElMessage.warning('请先选择批次')
    return
  }
  if (!targetedForm.segment) {
    ElMessage.warning('请选择目标人群')
    return
  }

  const seg = segments.value[targetedForm.segment]
  try {
    await ElMessageBox.confirm(
      `确认向「${seg?.name || targetedForm.segment}」人群${targetedForm.maxUsers > 0 ? `（上限 ${targetedForm.maxUsers} 人）` : `（约 ${seg?.count || 0} 人）`}每人发放 ${targetedForm.eachCount} 张券？`,
      '定向发放确认',
      { confirmButtonText: '确认发放', cancelButtonText: '取消', type: 'warning' }
    )
  } catch {
    return
  }

  submitting.value = true
  try {
    const result = await issueTargetedCoupons(batchId.value, {
      segment: targetedForm.segment,
      maxUsers: targetedForm.maxUsers || undefined,
      eachCount: targetedForm.eachCount
    })
    lastResult.value = result
    ElMessage.success(result.message)
    refreshAfterIssue()
  } catch (error) {
    console.error('Targeted issue failed:', error)
  } finally {
    submitting.value = false
  }
}

onMounted(() => {
  loadBatches()
  loadSegments()
})
</script>

<style scoped lang="scss">
.mb-4 {
  margin-bottom: 16px;
}

.mt-4 {
  margin-top: 16px;
}

.ml-2 {
  margin-left: 8px;
}

.stock-hint {
  float: right;
  color: #909399;
  font-size: 12px;
}

.stock-text {
  color: #606266;
  font-size: 13px;
}
</style>
