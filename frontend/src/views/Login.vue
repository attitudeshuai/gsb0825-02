<template>
  <div class="login-container">
    <div class="login-box">
      <h2 class="login-title">优惠券管理系统</h2>
      <p class="login-subtitle">企业级优惠券全生命周期管理平台</p>
      
      <el-form :model="form" :rules="rules" ref="formRef" @submit.prevent="handleLogin">
        <el-form-item prop="username">
          <el-input v-model="form.username" placeholder="请输入用户名" size="large" :prefix-icon="User" />
        </el-form-item>
        
        <el-form-item prop="password">
          <el-input v-model="form.password" type="password" placeholder="请输入密码" size="large" :prefix-icon="Lock" show-password />
        </el-form-item>
        
        <el-form-item>
          <el-checkbox v-model="remember">记住我</el-checkbox>
        </el-form-item>
        
        <el-button type="primary" size="large" :loading="loading" style="width: 100%" @click="handleLogin">
          登录
        </el-button>
      </el-form>
      
      <div class="demo-accounts">
        <div class="demo-title">演示账号：</div>
        <div class="demo-item">管理员：admin / 123456</div>
        <div class="demo-item">运营专员：operator / 123456</div>
        <div class="demo-item">财务：finance / 123456</div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { User, Lock } from '@element-plus/icons-vue'
import { useAuthStore } from '@/stores/authStore'

const authStore = useAuthStore()
const router = useRouter()
const route = useRoute()

const formRef = ref()
const loading = ref(false)
const remember = ref(false)

const form = reactive({
  username: '',
  password: ''
})

const rules = {
  username: [{ required: true, message: '请输入用户名', trigger: 'blur' }],
  password: [{ required: true, message: '请输入密码', trigger: 'blur' }]
}

onMounted(() => {
  const savedUsername = localStorage.getItem('remember_username')
  if (savedUsername) {
    form.username = savedUsername
    remember.value = true
  }
})

const handleLogin = async () => {
  if (!formRef.value) return
  
  await formRef.value.validate(async (valid: boolean) => {
    if (!valid) return
    
    loading.value = true
    try {
      await authStore.doLogin(form.username, form.password)
      
      if (remember.value) {
        localStorage.setItem('remember_username', form.username)
      } else {
        localStorage.removeItem('remember_username')
      }
      
      ElMessage.success('登录成功')
      
      const redirect = route.query.redirect as string
      router.push(redirect || '/dashboard')
    } catch (error) {
      console.error('Login failed:', error)
    } finally {
      loading.value = false
    }
  })
}
</script>

<style scoped lang="scss">
.demo-accounts {
  margin-top: 20px;
  padding: 16px;
  background: #f5f7fa;
  border-radius: 8px;
  font-size: 13px;
}

.demo-title {
  color: #606266;
  margin-bottom: 8px;
  font-weight: 500;
}

.demo-item {
  color: #909399;
  line-height: 1.8;
}
</style>
