import { createRouter, createWebHistory, RouteRecordRaw } from 'vue-router'
import { useAuthStore } from '@/stores/authStore'

const routes: RouteRecordRaw[] = [
  {
    path: '/login',
    name: 'Login',
    component: () => import('@/views/Login.vue'),
    meta: { requiresAuth: false }
  },
  {
    path: '/',
    component: () => import('@/views/Layout.vue'),
    meta: { requiresAuth: true },
    children: [
      {
        path: '',
        redirect: '/dashboard'
      },
      {
        path: 'dashboard',
        name: 'Dashboard',
        component: () => import('@/views/Dashboard.vue'),
        meta: { title: '首页概览', icon: 'DataLine' }
      },
      {
        path: 'batches',
        name: 'BatchList',
        component: () => import('@/views/BatchList.vue'),
        meta: { title: '券批次管理', icon: 'Tickets', roles: ['admin', 'operator'] }
      },
      {
        path: 'batches/create',
        name: 'BatchCreate',
        component: () => import('@/views/BatchEditor.vue'),
        meta: { title: '创建券批次', icon: 'Plus', roles: ['admin', 'operator'] }
      },
      {
        path: 'batches/:id/edit',
        name: 'BatchEdit',
        component: () => import('@/views/BatchEditor.vue'),
        meta: { title: '编辑券批次', icon: 'Edit', roles: ['admin', 'operator'] }
      },
      {
        path: 'codes',
        name: 'CodeList',
        component: () => import('@/views/CodeList.vue'),
        meta: { title: '券码管理', icon: 'Key', roles: ['admin', 'operator'] }
      },
      {
        path: 'records/receive',
        name: 'ReceiveRecordList',
        component: () => import('@/views/RecordList.vue'),
        meta: { title: '领取记录', icon: 'Download' }
      },
      {
        path: 'records/use',
        name: 'UseRecordList',
        component: () => import('@/views/RecordList.vue'),
        meta: { title: '核销记录', icon: 'Check' }
      },
      {
        path: 'risk',
        name: 'RiskSetting',
        component: () => import('@/views/RiskSetting.vue'),
        meta: { title: '风控配置', icon: 'Warning', roles: ['admin'] }
      },
      {
        path: 'segments',
        name: 'SegmentList',
        component: () => import('@/views/SegmentList.vue'),
        meta: { title: '用户分层', icon: 'UserFilled', roles: ['admin', 'operator'] }
      },
      {
        path: 'analytics',
        name: 'Analytics',
        component: () => import('@/views/Analytics.vue'),
        meta: { title: '数据分析', icon: 'TrendCharts' }
      }
    ]
  }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

router.beforeEach((to, from, next) => {
  const authStore = useAuthStore()
  
  if (to.meta.requiresAuth && !authStore.token) {
    next({ path: '/login', query: { redirect: to.fullPath } })
    return
  }
  
  if (to.meta.roles && authStore.user?.role) {
    const roles = to.meta.roles as string[]
    if (!roles.includes(authStore.user.role)) {
      next('/dashboard')
      return
    }
  }
  
  if (to.path === '/login' && authStore.token) {
    next('/dashboard')
    return
  }
  
  next()
})

export default router
