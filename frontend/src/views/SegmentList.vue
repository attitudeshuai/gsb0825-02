<template>
  <div class="page-container">
    <div class="page-header">
      <h2 class="page-title">用户分层管理</h2>
      <div>
        <el-button @click="handleInitBuiltin">初始化内置分层</el-button>
        <el-button type="primary" :icon="Plus" @click="openCreateDialog">
          新建分层
        </el-button>
      </div>
    </div>

    <div class="search-bar">
      <el-form :inline="true" :model="searchForm">
        <el-form-item label="状态">
          <el-select v-model="searchForm.status" placeholder="全部" clearable style="width: 120px">
            <el-option label="启用" value="active" />
            <el-option label="禁用" value="disabled" />
          </el-select>
        </el-form-item>
        <el-form-item label="关键词">
          <el-input v-model="searchForm.keyword" placeholder="分层名称/编码" clearable style="width: 200px" />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="loadSegments">搜索</el-button>
          <el-button @click="resetSearch">重置</el-button>
        </el-form-item>
      </el-form>
    </div>

    <el-alert
      title="内置动态分层（高价值/活跃/普通/沉睡）按用户累计实付金额自动计算，发券时实时查询用户列表，无需手动维护。"
      type="info"
      :closable="false"
      show-icon
      style="margin-bottom: 16px"
    />

    <div v-loading="loading" class="table-container">
      <el-table :data="segments" border stripe>
        <el-table-column prop="id" label="ID" width="70" />
        <el-table-column prop="name" label="分层名称" min-width="150" />
        <el-table-column prop="code" label="分层编码" width="180" />
        <el-table-column label="类型" width="80">
          <template #default="{ row }">
            <el-tag :type="row.segmentType === 'static' ? 'primary' : 'success'" size="small">
              {{ row.segmentType === 'static' ? '静态' : '动态' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="用户数" width="160">
          <template #default="{ row }">
            <span>{{ row.userCount || 0 }}</span>
            <el-button
              v-if="row.segmentType === 'dynamic'"
              link
              type="primary"
              size="small"
              :loading="refreshingId === row.id"
              @click="handleRefreshCount(row)"
              style="margin-left: 8px"
            >
              刷新
            </el-button>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="90">
          <template #default="{ row }">
            <el-switch
              :model-value="row.status === 'active'"
              @change="handleToggle(row)"
            />
          </template>
        </el-table-column>
        <el-table-column prop="description" label="描述" min-width="180" show-overflow-tooltip />
        <el-table-column prop="createdAt" label="创建时间" width="170">
          <template #default="{ row }">{{ formatDate(row.createdAt) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="180" fixed="right">
          <template #default="{ row }">
            <el-button
              v-if="!row.code || !row.code.startsWith('BUILTIN_')"
              link
              type="primary"
              @click="openEditDialog(row)"
            >
              编辑
            </el-button>
            <el-button
              v-if="!row.code || !row.code.startsWith('BUILTIN_')"
              link
              type="danger"
              @click="handleDelete(row)"
            >
              删除
            </el-button>
            <span v-if="row.code && row.code.startsWith('BUILTIN_')" class="builtin-tag">内置</span>
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
          @current-change="loadSegments"
          @size-change="handleSizeChange"
        />
      </div>
    </div>

    <el-dialog v-model="dialogVisible" :title="editingSegment ? '编辑分层' : '新建分层'" width="550px">
      <el-form :model="form" :rules="formRules" ref="formRef" label-width="100px">
        <el-form-item label="分层名称" prop="name">
          <el-input v-model="form.name" placeholder="如：VIP用户、高价值用户" />
        </el-form-item>
        <el-form-item label="分层类型" prop="segmentType">
          <el-radio-group v-model="form.segmentType">
            <el-radio label="static">静态（手动指定用户ID）</el-radio>
            <el-radio label="dynamic">动态（按实付金额）</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item v-if="form.segmentType === 'static'" label="用户ID列表" prop="userIdsText">
          <el-input
            v-model="form.userIdsText"
            type="textarea"
            :rows="6"
            placeholder="请输入用户ID，多个ID用英文逗号、换行或空格分隔"
          />
          <div class="form-tip">当前共 {{ parsedUserCount }} 个用户</div>
        </el-form-item>
        <el-form-item v-else label="分层规则">
          <el-select v-model="form.paymentLevel" placeholder="请选择消费分层" style="width: 100%">
            <el-option label="高价值用户（累计实付 ≥ 10000元）" value="highValue" />
            <el-option label="活跃用户（累计实付 1000 ~ 10000元）" value="active" />
            <el-option label="普通用户（累计实付 0 ~ 1000元）" value="normal" />
            <el-option label="沉睡用户（领过券但无实付）" value="inactive" />
          </el-select>
        </el-form-item>
        <el-form-item label="描述">
          <el-input v-model="form.description" type="textarea" :rows="2" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="handleSave">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus } from '@element-plus/icons-vue'
import {
  getSegmentList,
  createSegment,
  updateSegment,
  deleteSegment,
  toggleSegment,
  initBuiltinSegments,
  refreshSegmentCount
} from '@/api/segmentApi'
import dayjs from 'dayjs'

const loading = ref(false)
const saving = ref(false)
const segments = ref<any[]>([])
const dialogVisible = ref(false)
const formRef = ref()
const editingSegment = ref<any>(null)
const refreshingId = ref<number | null>(null)

const searchForm = reactive({
  status: '',
  keyword: ''
})

const pagination = reactive({
  page: 1,
  pageSize: 10,
  total: 0
})

const form = reactive({
  name: '',
  segmentType: 'static',
  userIdsText: '',
  paymentLevel: '',
  description: ''
})

const formRules = {
  name: [{ required: true, message: '请输入分层名称', trigger: 'blur' }],
  segmentType: [{ required: true, message: '请选择分层类型', trigger: 'change' }]
}

const parsedUserCount = computed(() => {
  return form.userIdsText
    .split(/[\s,，\n\r]+/)
    .map(s => parseInt(s.trim(), 10))
    .filter(n => !isNaN(n) && n > 0).length
})

const formatDate = (date: string) => dayjs(date).format('YYYY-MM-DD HH:mm:ss')

const loadSegments = async () => {
  loading.value = true
  try {
    const params = {
      page: pagination.page,
      pageSize: pagination.pageSize,
      ...searchForm
    }
    const res: any = await getSegmentList(params)
    segments.value = res.list
    pagination.total = res.total
  } finally {
    loading.value = false
  }
}

const resetSearch = () => {
  searchForm.status = ''
  searchForm.keyword = ''
  pagination.page = 1
  loadSegments()
}

const handleSizeChange = () => {
  pagination.page = 1
  loadSegments()
}

const handleInitBuiltin = async () => {
  try {
    const res: any = await initBuiltinSegments()
    ElMessage.success(res.message || '初始化完成')
    loadSegments()
  } catch (error: any) {
    ElMessage.error(error?.message || '初始化失败')
  }
}

const handleRefreshCount = async (row: any) => {
  refreshingId.value = row.id
  try {
    const res: any = await refreshSegmentCount(row.id)
    row.userCount = res.userCount
    ElMessage.success(`当前人数：${res.userCount}`)
  } catch (error: any) {
    ElMessage.error(error?.message || '刷新失败')
  } finally {
    refreshingId.value = null
  }
}

const openCreateDialog = () => {
  editingSegment.value = null
  Object.assign(form, {
    name: '',
    segmentType: 'static',
    userIdsText: '',
    paymentLevel: '',
    description: ''
  })
  dialogVisible.value = true
}

const openEditDialog = (row: any) => {
  editingSegment.value = row
  Object.assign(form, {
    name: row.name,
    segmentType: row.segmentType,
    userIdsText: row.userIds ? row.userIds.join(', ') : '',
    paymentLevel: row.criteria?.level || '',
    description: row.description || ''
  })
  dialogVisible.value = true
}

const handleSave = async () => {
  if (!formRef.value) return
  await formRef.value.validate(async (valid: boolean) => {
    if (!valid) return
    saving.value = true
    try {
      const payload: any = {
        name: form.name,
        segmentType: form.segmentType,
        description: form.description
      }
      if (form.segmentType === 'static') {
        payload.userIds = form.userIdsText
          .split(/[\s,，\n\r]+/)
          .map(s => parseInt(s.trim(), 10))
          .filter((n: number) => !isNaN(n) && n > 0)
      } else {
        if (!form.paymentLevel) {
          ElMessage.warning('请选择分层规则')
          saving.value = false
          return
        }
        payload.criteria = { type: 'payment_level', level: form.paymentLevel }
      }
      if (editingSegment.value) {
        await updateSegment(editingSegment.value.id, payload)
        ElMessage.success('修改成功')
      } else {
        await createSegment(payload)
        ElMessage.success('创建成功')
      }
      dialogVisible.value = false
      loadSegments()
    } catch (error: any) {
      ElMessage.error(error?.message || '保存失败')
    } finally {
      saving.value = false
    }
  })
}

const handleToggle = async (row: any) => {
  try {
    await toggleSegment(row.id)
    ElMessage.success('状态已更新')
    loadSegments()
  } catch (error: any) {
    ElMessage.error(error?.message || '操作失败')
  }
}

const handleDelete = async (row: any) => {
  try {
    await ElMessageBox.confirm('确定要删除该分层吗？', '警告', {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'warning'
    })
    await deleteSegment(row.id)
    ElMessage.success('删除成功')
    loadSegments()
  } catch (error: any) {
    if (error !== 'cancel') {
      console.error('Delete failed:', error)
    }
  }
}

onMounted(() => {
  loadSegments()
})
</script>

<style scoped lang="scss">
.pagination-container {
  margin-top: 20px;
  display: flex;
  justify-content: flex-end;
}

.form-tip {
  font-size: 12px;
  color: #909399;
  margin-top: 4px;
}

.builtin-tag {
  font-size: 12px;
  color: #909399;
}
</style>
