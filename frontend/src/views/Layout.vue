<template>
  <el-container class="layout-container">
    <el-aside width="220px" style="background: #304156;">
      <div class="sidebar-logo">
        <el-icon size="24"><Tickets /></el-icon>
        <span class="ml-2">优惠券系统</span>
      </div>
      <el-menu
        :default-active="activeMenu"
        background-color="#304156"
        text-color="#bfcbd9"
        active-text-color="#409EFF"
        router
      >
        <template v-for="item in menuItems" :key="item.path">
          <el-menu-item v-if="!item.roles || (authStore.user?.role && item.roles.includes(authStore.user.role))" :index="item.path">
            <el-icon><component :is="item.icon" /></el-icon>
            <span>{{ item.title }}</span>
          </el-menu-item>
        </template>
      </el-menu>
    </el-aside>
    
    <el-container>
      <el-header class="header-container">
        <div class="header-title">{{ currentTitle }}</div>
        <div class="user-info">
          <el-dropdown @command="handleCommand">
            <span class="user-name">
              <el-icon><User /></el-icon>
              {{ authStore.user?.realName || authStore.user?.username }}
              <el-tag :type="roleTagType" size="small" class="ml-2">{{ roleText }}</el-tag>
            </span>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item command="profile">个人信息</el-dropdown-item>
                <el-dropdown-item command="password">修改密码</el-dropdown-item>
                <el-dropdown-item divided command="logout">退出登录</el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>
      </el-header>
      
      <el-main style="background: #f5f7fa;">
        <router-view v-slot="{ Component }">
          <transition name="fade" mode="out-in">
            <component :is="Component" />
          </transition>
        </router-view>
      </el-main>
    </el-container>
  </el-container>
  
  <el-dialog v-model="passwordDialogVisible" title="修改密码" width="400px">
    <el-form :model="passwordForm" :rules="passwordRules" ref="passwordFormRef" label-width="80px">
      <el-form-item label="原密码" prop="oldPassword">
        <el-input v-model="passwordForm.oldPassword" type="password" show-password />
      </el-form-item>
      <el-form-item label="新密码" prop="newPassword">
        <el-input v-model="passwordForm.newPassword" type="password" show-password />
      </el-form-item>
      <el-form-item label="确认密码" prop="confirmPassword">
        <el-input v-model="passwordForm.confirmPassword" type="password" show-password />
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="passwordDialogVisible = false">取消</el-button>
      <el-button type="primary" @click="handleChangePassword">确认</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Tickets, DataLine, Key, Promotion, Download, Check, Warning, TrendCharts, User } from '@element-plus/icons-vue'
import { useAuthStore } from '@/stores/authStore'
import { changePassword } from '@/api/authApi'

const authStore = useAuthStore()
const router = useRouter()
const route = useRoute()

const passwordDialogVisible = ref(false)
const passwordFormRef = ref()
const passwordForm = reactive({
  oldPassword: '',
  newPassword: '',
  confirmPassword: ''
})

const passwordRules = {
  oldPassword: [{ required: true, message: '请输入原密码', trigger: 'blur' }],
  newPassword: [{ required: true, message: '请输入新密码', trigger: 'blur' }],
  confirmPassword: [
    { required: true, message: '请确认新密码', trigger: 'blur' },
    {
      validator: (_rule: any, value: string, callback: any) => {
        if (value !== passwordForm.newPassword) {
          callback(new Error('两次输入的密码不一致'))
        } else {
          callback()
        }
      },
      trigger: 'blur'
    }
  ]
}

const menuItems = [
  { path: '/dashboard', title: '首页概览', icon: DataLine },
  { path: '/batches', title: '券批次管理', icon: Tickets, roles: ['admin', 'operator'] },
  { path: '/batches/create', title: '创建券批次', icon: Tickets, roles: ['admin', 'operator'] },
  { path: '/codes', title: '券码管理', icon: Key, roles: ['admin', 'operator'] },
  { path: '/issue', title: '券发放', icon: Promotion, roles: ['admin', 'operator'] },
  { path: '/records/receive', title: '领取记录', icon: Download },
  { path: '/records/use', title: '核销记录', icon: Check },
  { path: '/risk', title: '风控配置', icon: Warning, roles: ['admin'] },
  { path: '/analytics', title: '数据分析', icon: TrendCharts }
]

const activeMenu = computed(() => route.path)

const currentTitle = computed(() => {
  const item = menuItems.find(m => m.path === route.path)
  return item?.title || '优惠券管理系统'
})

const roleText = computed(() => {
  const map: Record<string, string> = {
    admin: '管理员',
    operator: '运营专员',
    finance: '财务'
  }
  return map[authStore.user?.role || ''] || ''
})

const roleTagType = computed(() => {
  const map: Record<string, string> = {
    admin: 'danger',
    operator: 'primary',
    finance: 'success'
  }
  return map[authStore.user?.role || ''] || 'info'
})

onMounted(async () => {
  if (authStore.token && !authStore.user) {
    try {
      await authStore.fetchProfile()
    } catch (error) {
      console.error('Failed to fetch profile:', error)
    }
  }
})

const handleCommand = (command: string) => {
  if (command === 'logout') {
    ElMessageBox.confirm('确定要退出登录吗？', '提示', {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'warning'
    }).then(() => {
      authStore.logout()
      router.push('/login')
      ElMessage.success('已退出登录')
    }).catch(() => {})
  } else if (command === 'password') {
    passwordDialogVisible.value = true
  } else if (command === 'profile') {
    ElMessage.info('个人信息功能开发中')
  }
}

const handleChangePassword = async () => {
  if (!passwordFormRef.value) return
  
  await passwordFormRef.value.validate(async (valid: boolean) => {
    if (!valid) return
    
    try {
      await changePassword({
        oldPassword: passwordForm.oldPassword,
        newPassword: passwordForm.newPassword
      })
      ElMessage.success('密码修改成功')
      passwordDialogVisible.value = false
      passwordFormRef.value.resetFields()
    } catch (error) {
      console.error('Change password failed:', error)
    }
  })
}
</script>

<style scoped lang="scss">
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

.user-name {
  display: flex;
  align-items: center;
  cursor: pointer;
  color: #606266;
}
</style>
