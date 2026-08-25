<template>
  <div class="page-container">
    <div class="page-header">
      <h2 class="page-title">风控配置</h2>
      <div>
        <el-button type="primary" :icon="Plus" @click="ruleDialogVisible = true">
          添加规则
        </el-button>
        <el-button @click="handleInitRules">初始化默认规则</el-button>
      </div>
    </div>
    
    <el-tabs v-model="activeTab" @tab-change="handleTabChange">
      <el-tab-pane label="风控规则" name="rules">
        <div v-loading="loading" class="table-container">
          <el-table :data="rules" border stripe>
            <el-table-column prop="ruleName" label="规则名称" min-width="150" />
            <el-table-column label="规则类型" width="120">
              <template #default="{ row }">{{ ruleTypeText(row.ruleType) }}</template>
            </el-table-column>
            <el-table-column label="规则配置" min-width="200">
              <template #default="{ row }">
                <template v-if="row.ruleType === 'frequency' || row.ruleType === 'ip' || row.ruleType === 'device'">
                  {{ windowText(row.ruleType) }}: {{ row.config.limit }}次/{{ row.config.windowMinutes }}分钟
                </template>
                <template v-else>{{ JSON.stringify(row.config) }}</template>
              </template>
            </el-table-column>
            <el-table-column label="处理动作" width="100">
              <template #default="{ row }">{{ actionText(row.action) }}</template>
            </el-table-column>
            <el-table-column label="状态" width="100">
              <template #default="{ row }">
                <el-switch
                  :model-value="row.status === 'active'"
                  @change="handleToggleRule(row)"
                />
              </template>
            </el-table-column>
            <el-table-column prop="description" label="描述" min-width="150" />
            <el-table-column label="操作" width="150" fixed="right">
              <template #default="{ row }">
                <el-button link type="primary" @click="handleEditRule(row)">编辑</el-button>
                <el-button link type="danger" @click="handleDeleteRule(row)">删除</el-button>
              </template>
            </el-table-column>
          </el-table>
        </div>
      </el-tab-pane>
      
      <el-tab-pane label="黑名单" name="blacklist">
        <div class="search-bar">
          <el-form :inline="true" :model="blacklistSearch">
            <el-form-item label="类型">
              <el-select v-model="blacklistSearch.type" placeholder="全部" clearable style="width: 120px">
                <el-option label="IP" value="ip" />
                <el-option label="设备" value="device" />
                <el-option label="用户" value="user" />
              </el-select>
            </el-form-item>
            <el-form-item label="关键词">
              <el-input v-model="blacklistSearch.keyword" placeholder="IP/设备ID/用户ID" clearable style="width: 200px" />
            </el-form-item>
            <el-form-item>
              <el-button type="primary" @click="loadBlacklist">搜索</el-button>
              <el-button @click="resetBlacklistSearch">重置</el-button>
            </el-form-item>
          </el-form>
          
          <el-button type="primary" :icon="Plus" class="mb-4" @click="blacklistDialogVisible = true">
            添加黑名单
          </el-button>
        </div>
        
        <div v-loading="loading" class="table-container">
          <el-table :data="blacklist" border stripe>
            <el-table-column label="类型" width="100">
              <template #default="{ row }">{{ blacklistTypeText(row.type) }}</template>
            </el-table-column>
            <el-table-column prop="value" label="值" min-width="150" />
            <el-table-column prop="reason" label="原因" min-width="150" />
            <el-table-column label="是否永久" width="100">
              <template #default="{ row }">
                {{ row.isPermanent ? '是' : '否' }}
              </template>
            </el-table-column>
            <el-table-column label="过期时间" width="180">
              <template #default="{ row }">
                {{ row.expireAt ? formatDate(row.expireAt) : '-' }}
              </template>
            </el-table-column>
            <el-table-column prop="createdAt" label="创建时间" width="180">
              <template #default="{ row }">{{ formatDate(row.createdAt) }}</template>
            </el-table-column>
            <el-table-column label="操作" width="100" fixed="right">
              <template #default="{ row }">
                <el-button link type="danger" @click="handleRemoveBlacklist(row)">移除</el-button>
              </template>
            </el-table-column>
          </el-table>
          
          <div class="pagination-container">
            <el-pagination
              v-model:current-page="blacklistPagination.page"
              v-model:page-size="blacklistPagination.pageSize"
              :total="blacklistPagination.total"
              :page-sizes="[10, 20, 50, 100]"
              layout="total, sizes, prev, pager, next, jumper"
              @current-change="loadBlacklist"
            />
          </div>
        </div>
      </el-tab-pane>
      
      <el-tab-pane label="拦截记录" name="intercepts">
        <div v-loading="loading" class="table-container">
          <el-table :data="intercepts" border stripe>
            <el-table-column prop="id" label="ID" width="70" />
            <el-table-column prop="ruleName" label="触发规则" min-width="140" />
            <el-table-column prop="action" label="处理动作" width="90" />
            <el-table-column prop="userId" label="用户ID" width="90" />
            <el-table-column prop="ipAddress" label="IP地址" width="130" />
            <el-table-column prop="deviceId" label="设备ID" width="140" />
            <el-table-column prop="createdAt" label="时间" width="160">
              <template #default="{ row }">{{ formatDate(row.createdAt) }}</template>
            </el-table-column>
            <el-table-column label="详情" min-width="180">
              <template #default="{ row }">
                <el-tooltip :content="JSON.stringify(row.details)" placement="top">
                  <span class="details-text">{{ JSON.stringify(row.details) }}</span>
                </el-tooltip>
              </template>
            </el-table-column>
            <el-table-column label="操作" width="200" fixed="right">
              <template #default="{ row }">
                <el-dropdown trigger="click" @command="(cmd: string) => handleBlacklist(row, cmd)">
                  <el-button type="primary" link>
                    一键拉黑<el-icon class="el-icon--right"><ArrowDown /></el-icon>
                  </el-button>
                  <template #dropdown>
                    <el-dropdown-menu>
                      <el-dropdown-item command="ip" :disabled="!row.ipAddress">拉黑IP</el-dropdown-item>
                      <el-dropdown-item command="device" :disabled="!row.deviceId">拉黑设备</el-dropdown-item>
                      <el-dropdown-item command="user" :disabled="!row.userId">拉黑用户</el-dropdown-item>
                      <el-dropdown-item command="all" divided>全部拉黑</el-dropdown-item>
                    </el-dropdown-menu>
                  </template>
                </el-dropdown>
              </template>
            </el-table-column>
          </el-table>
          
          <div class="pagination-container">
            <el-pagination
              v-model:current-page="interceptPagination.page"
              v-model:page-size="interceptPagination.pageSize"
              :total="interceptPagination.total"
              :page-sizes="[10, 20, 50, 100]"
              layout="total, sizes, prev, pager, next, jumper"
              @current-change="loadIntercepts"
            />
          </div>
        </div>
      </el-tab-pane>
    </el-tabs>
    
    <el-dialog v-model="ruleDialogVisible" :title="editingRule ? '编辑规则' : '添加规则'" width="500px">
      <el-form :model="ruleForm" :rules="ruleFormRules" ref="ruleFormRef" label-width="100px">
        <el-form-item label="规则类型" prop="ruleType">
          <el-select v-model="ruleForm.ruleType" style="width: 100%">
            <el-option label="领取频率限制" value="frequency" />
            <el-option label="IP限制" value="ip" />
            <el-option label="设备限制" value="device" />
            <el-option label="行为检测" value="behavior" />
          </el-select>
        </el-form-item>
        <el-form-item label="规则名称" prop="ruleName">
          <el-input v-model="ruleForm.ruleName" />
        </el-form-item>
        <el-form-item v-if="['frequency', 'ip', 'device'].includes(ruleForm.ruleType)" label="限制次数" prop="config.limit">
          <el-input-number v-model="ruleForm.config.limit" :min="1" />
          <span class="ml-2">次</span>
        </el-form-item>
        <el-form-item v-if="['frequency', 'ip', 'device'].includes(ruleForm.ruleType)" label="时间窗口" prop="config.windowMinutes">
          <el-input-number v-model="ruleForm.config.windowMinutes" :min="1" />
          <span class="ml-2">分钟</span>
        </el-form-item>
        <el-form-item label="处理动作" prop="action">
          <el-select v-model="ruleForm.action" style="width: 100%">
            <el-option label="拦截" value="block" />
            <el-option label="预警" value="warning" />
            <el-option label="验证" value="verify" />
          </el-select>
        </el-form-item>
        <el-form-item label="描述">
          <el-input v-model="ruleForm.description" type="textarea" :rows="2" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="ruleDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="handleSaveRule">保存</el-button>
      </template>
    </el-dialog>
    
    <el-dialog v-model="blacklistDialogVisible" title="添加黑名单" width="400px">
      <el-form :model="blacklistForm" :rules="blacklistFormRules" ref="blacklistFormRef" label-width="80px">
        <el-form-item label="类型" prop="type">
          <el-select v-model="blacklistForm.type" style="width: 100%">
            <el-option label="IP" value="ip" />
            <el-option label="设备" value="device" />
            <el-option label="用户" value="user" />
          </el-select>
        </el-form-item>
        <el-form-item label="值" prop="value">
          <el-input v-model="blacklistForm.value" placeholder="IP地址/设备ID/用户ID" />
        </el-form-item>
        <el-form-item label="是否永久">
          <el-switch v-model="blacklistForm.isPermanent" />
        </el-form-item>
        <el-form-item v-if="!blacklistForm.isPermanent" label="过期时间" prop="expireAt">
          <el-date-picker
            v-model="blacklistForm.expireAt"
            type="datetime"
            placeholder="选择过期时间"
            value-format="YYYY-MM-DD HH:mm:ss"
            style="width: 100%"
          />
        </el-form-item>
        <el-form-item label="原因">
          <el-input v-model="blacklistForm.reason" type="textarea" :rows="2" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="blacklistDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="handleSaveBlacklist">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, ArrowDown } from '@element-plus/icons-vue'
import {
  getRiskRules,
  createRiskRule,
  updateRiskRule,
  toggleRiskRule,
  deleteRiskRule,
  initDefaultRules,
  getBlacklist,
  addToBlacklist,
  removeFromBlacklist,
  getIntercepts,
  blacklistFromIntercept
} from '@/api/riskApi'
import dayjs from 'dayjs'

const activeTab = ref('rules')
const loading = ref(false)
const saving = ref(false)
const rules = ref<any[]>([])
const blacklist = ref<any[]>([])
const intercepts = ref<any[]>([])

const ruleDialogVisible = ref(false)
const ruleFormRef = ref()
const editingRule = ref<any>(null)

const blacklistDialogVisible = ref(false)
const blacklistFormRef = ref()

const blacklistSearch = reactive({
  type: '',
  keyword: ''
})

const blacklistPagination = reactive({
  page: 1,
  pageSize: 10,
  total: 0
})

const interceptPagination = reactive({
  page: 1,
  pageSize: 10,
  total: 0
})

const ruleForm = reactive({
  id: null as number | null,
  ruleType: 'frequency',
  ruleName: '',
  config: {
    limit: 5,
    windowMinutes: 60
  },
  action: 'block',
  status: 'active',
  description: ''
})

const ruleFormRules = {
  ruleType: [{ required: true, message: '请选择规则类型', trigger: 'change' }],
  ruleName: [{ required: true, message: '请输入规则名称', trigger: 'blur' }],
  action: [{ required: true, message: '请选择处理动作', trigger: 'change' }]
}

const blacklistForm = reactive({
  type: 'ip',
  value: '',
  reason: '',
  expireAt: '',
  isPermanent: true
})

const blacklistFormRules = {
  type: [{ required: true, message: '请选择类型', trigger: 'change' }],
  value: [{ required: true, message: '请输入值', trigger: 'blur' }]
}

const ruleTypeText = (type: string) => {
  const map: Record<string, string> = {
    frequency: '领取频率',
    ip: 'IP限制',
    device: '设备限制',
    behavior: '行为检测'
  }
  return map[type] || type
}

const actionText = (action: string) => {
  const map: Record<string, string> = {
    block: '拦截',
    warning: '预警',
    verify: '验证'
  }
  return map[action] || action
}

const windowText = (type: string) => {
  const map: Record<string, string> = {
    frequency: '用户',
    ip: 'IP',
    device: '设备'
  }
  return map[type] || type
}

const blacklistTypeText = (type: string) => {
  const map: Record<string, string> = {
    ip: 'IP',
    device: '设备',
    user: '用户'
  }
  return map[type] || type
}

const formatDate = (date: string) => {
  return dayjs(date).format('YYYY-MM-DD HH:mm:ss')
}

const loadRules = async () => {
  loading.value = true
  try {
    rules.value = await getRiskRules()
  } finally {
    loading.value = false
  }
}

const loadBlacklist = async () => {
  loading.value = true
  try {
    const params = {
      page: blacklistPagination.page,
      pageSize: blacklistPagination.pageSize,
      ...blacklistSearch
    }
    const response = await getBlacklist(params)
    blacklist.value = response.list
    blacklistPagination.total = response.total
  } finally {
    loading.value = false
  }
}

const resetBlacklistSearch = () => {
  blacklistSearch.type = ''
  blacklistSearch.keyword = ''
  blacklistPagination.page = 1
  loadBlacklist()
}

const loadIntercepts = async () => {
  loading.value = true
  try {
    const params = {
      page: interceptPagination.page,
      pageSize: interceptPagination.pageSize
    }
    const response = await getIntercepts(params)
    intercepts.value = response.list
    interceptPagination.total = response.total
  } finally {
    loading.value = false
  }
}

const handleEditRule = (row: any) => {
  editingRule.value = row
  Object.assign(ruleForm, {
    id: row.id,
    ruleType: row.ruleType,
    ruleName: row.ruleName,
    config: { ...row.config },
    action: row.action,
    status: row.status,
    description: row.description || ''
  })
  ruleDialogVisible.value = true
}

const handleToggleRule = async (row: any) => {
  try {
    await toggleRiskRule(row.id)
    ElMessage.success('状态已更新')
    loadRules()
  } catch (error) {
    console.error('Toggle rule failed:', error)
  }
}

const handleDeleteRule = async (row: any) => {
  try {
    await ElMessageBox.confirm('确定要删除该规则吗？', '警告', {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'warning'
    })
    await deleteRiskRule(row.id)
    ElMessage.success('删除成功')
    loadRules()
  } catch (error: any) {
    if (error !== 'cancel') {
      console.error('Delete rule failed:', error)
    }
  }
}

const handleSaveRule = async () => {
  if (!ruleFormRef.value) return
  
  await ruleFormRef.value.validate(async (valid: boolean) => {
    if (!valid) return
    
    saving.value = true
    try {
      if (editingRule.value) {
        await updateRiskRule(editingRule.value.id, ruleForm)
        ElMessage.success('修改成功')
      } else {
        await createRiskRule(ruleForm)
        ElMessage.success('创建成功')
      }
      ruleDialogVisible.value = false
      loadRules()
    } catch (error) {
      console.error('Save rule failed:', error)
    } finally {
      saving.value = false
      editingRule.value = null
    }
  })
}

const handleInitRules = async () => {
  try {
    await initDefaultRules()
    ElMessage.success('默认规则初始化完成')
    loadRules()
  } catch (error) {
    console.error('Init rules failed:', error)
  }
}

const handleRemoveBlacklist = async (row: any) => {
  try {
    await ElMessageBox.confirm('确定要从黑名单移除吗？', '提示', {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'warning'
    })
    await removeFromBlacklist(row.id)
    ElMessage.success('已移除')
    loadBlacklist()
  } catch (error: any) {
    if (error !== 'cancel') {
      console.error('Remove blacklist failed:', error)
    }
  }
}

const handleSaveBlacklist = async () => {
  if (!blacklistFormRef.value) return
  
  await blacklistFormRef.value.validate(async (valid: boolean) => {
    if (!valid) return
    
    saving.value = true
    try {
      await addToBlacklist(blacklistForm)
      ElMessage.success('添加成功')
      blacklistDialogVisible.value = false
      loadBlacklist()
    } catch (error) {
      console.error('Save blacklist failed:', error)
    } finally {
      saving.value = false
    }
  })
}

const handleBlacklist = async (row: any, type: string) => {
  const typeText: Record<string, string> = {
    ip: 'IP',
    device: '设备',
    user: '用户',
    all: 'IP、设备和用户'
  }
  try {
    await ElMessageBox.confirm(
      `确定要将该记录的${typeText[type]}加入黑名单吗？`,
      '拉黑确认',
      {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        type: 'warning'
      }
    )
    const res: any = await blacklistFromIntercept(row.id, { type, isPermanent: true })
    const added = res.results?.filter((r: any) => r.status === 'added').length || 0
    const existed = res.results?.filter((r: any) => r.status === 'existed').length || 0
    if (added > 0 && existed > 0) {
      ElMessage.success(`已添加 ${added} 项，${existed} 项已在黑名单中`)
    } else if (added > 0) {
      ElMessage.success(`成功拉黑 ${added} 项`)
    } else {
      ElMessage.info('所选项目均已在黑名单中')
    }
    loadBlacklist()
    loadIntercepts()
  } catch (error: any) {
    if (error !== 'cancel') {
      console.error('Blacklist failed:', error)
      ElMessage.error(error?.message || '拉黑失败')
    }
  }
}

const handleTabChange = (tabName: string) => {
  if (tabName === 'blacklist') {
    blacklistPagination.page = 1
    loadBlacklist()
  } else if (tabName === 'intercepts') {
    interceptPagination.page = 1
    loadIntercepts()
  }
}

onMounted(() => {
  loadRules()
})
</script>

<style scoped lang="scss">
.pagination-container {
  margin-top: 20px;
  display: flex;
  justify-content: flex-end;
}

.ml-2 {
  margin-left: 8px;
}

.mb-4 {
  margin-bottom: 16px;
}

.details-text {
  font-size: 12px;
  color: #909399;
  display: inline-block;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
