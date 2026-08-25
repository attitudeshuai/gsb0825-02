<template>
  <div class="page-container">
    <div class="page-header">
      <h2 class="page-title">数据分析</h2>
      <el-dropdown @command="handleExport">
        <el-button type="primary" :icon="Download">
          导出数据
          <el-icon class="el-icon--right"><ArrowDown /></el-icon>
        </el-button>
        <template #dropdown>
          <el-dropdown-menu>
            <el-dropdown-item command="batches">导出批次列表</el-dropdown-item>
            <el-dropdown-item command="analytics">导出效果分析</el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>
    </div>
    
    <el-row :gutter="20" class="mb-4">
      <el-col :span="6">
        <StatCard title="总批次" :value="overview.totalBatches || 0" type="default" />
      </el-col>
      <el-col :span="6">
        <StatCard title="总发放量" :value="overview.totalCoupons || 0" type="info" />
      </el-col>
      <el-col :span="6">
        <StatCard title="领取率" :value="`${overview.receiveRate || 0}%`" type="success" />
      </el-col>
      <el-col :span="6">
        <StatCard title="核销率" :value="`${overview.useRate || 0}%`" type="warning" />
      </el-col>
    </el-row>
    
    <el-row :gutter="20">
      <el-col :span="24">
        <div class="chart-container">
          <div class="chart-title">领取/核销/GMV趋势</div>
          <v-chart class="chart" :option="trendChartOption" autoresize />
        </div>
      </el-col>
    </el-row>
    
    <el-row :gutter="20" class="mt-4">
      <el-col :span="12">
        <div class="chart-container">
          <div class="chart-title">转化漏斗</div>
          <v-chart class="chart" :option="funnelChartOption" autoresize />
        </div>
      </el-col>
      <el-col :span="12">
        <div class="chart-container">
          <div class="chart-title">券类型分布</div>
          <v-chart class="chart" :option="typeChartOption" autoresize />
        </div>
      </el-col>
    </el-row>
    
    <el-row :gutter="20" class="mt-4">
      <el-col :span="12">
        <div class="chart-container">
          <div class="chart-title">用户分层</div>
          <v-chart class="chart" :option="userChartOption" autoresize />
        </div>
      </el-col>
      <el-col :span="12">
        <div class="chart-container">
          <div class="chart-title">ROI概览</div>
          <div class="roi-stats">
            <div class="roi-item">
              <div class="roi-label">累计GMV</div>
              <div class="roi-value">¥{{ formatNumber(overview.totalGmv || 0) }}</div>
            </div>
            <div class="roi-item">
              <div class="roi-label">累计优惠</div>
              <div class="roi-value">¥{{ formatNumber(overview.totalDiscount || 0) }}</div>
            </div>
            <div class="roi-item highlight">
              <div class="roi-label">整体ROI</div>
              <div class="roi-value">{{ overview.roi || 0 }}</div>
            </div>
            <div class="roi-item">
              <div class="roi-label">独立用户数</div>
              <div class="roi-value">{{ funnelData.uniqueUsers || 0 }}</div>
            </div>
          </div>
        </div>
      </el-col>
    </el-row>
    
    <div class="chart-container mt-4">
      <div class="chart-title">批次效果分析</div>
      <el-table :data="batchEffectList" border stripe>
        <el-table-column prop="name" label="批次名称" min-width="150" />
        <el-table-column prop="batchCode" label="批次编码" width="150" />
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
        <el-table-column label="总数量" width="100">
          <template #default="{ row }">{{ row.totalQuantity }}</template>
        </el-table-column>
        <el-table-column label="领取率" width="100">
          <template #default="{ row }">{{ row.receiveRate }}%</template>
        </el-table-column>
        <el-table-column label="核销率" width="100">
          <template #default="{ row }">{{ row.useRate }}%</template>
        </el-table-column>
        <el-table-column label="GMV" width="120">
          <template #default="{ row }">¥{{ formatNumber(row.gmv || 0) }}</template>
        </el-table-column>
        <el-table-column label="ROI" width="100">
          <template #default="{ row }">{{ row.roi || 0 }}</template>
        </el-table-column>
      </el-table>
      
      <div class="pagination-container">
        <el-pagination
          v-model:current-page="pagination.page"
          v-model:page-size="pagination.pageSize"
          :total="pagination.total"
          :page-sizes="[10, 20, 50]"
          layout="total, sizes, prev, pager, next, jumper"
          @current-change="loadBatchEffect"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted, computed } from 'vue'
import * as echarts from 'echarts'
import VChart from 'vue-echarts'
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { LineChart, PieChart, FunnelChart } from 'echarts/charts'
import { TitleComponent, TooltipComponent, LegendComponent, GridComponent } from 'echarts/components'
import { Download, ArrowDown } from '@element-plus/icons-vue'
import StatCard from '@/components/StatCard.vue'
import {
  getOverview,
  getTrend,
  getFunnel,
  getCouponTypeDistribution,
  getUserSegment,
  getBatchEffect,
  exportBatches,
  exportAnalytics
} from '@/api/analyticsApi'
import { ElMessage } from 'element-plus'

use([CanvasRenderer, LineChart, PieChart, FunnelChart, TitleComponent, TooltipComponent, LegendComponent, GridComponent])

const overview = reactive<any>({})
const trendData = reactive<any>({})
const typeDistribution = ref<any[]>([])
const funnelData = reactive<any>({})
const userSegment = reactive<any>({})
const batchEffectList = ref<any[]>([])

const pagination = reactive({
  page: 1,
  pageSize: 10,
  total: 0
})

const formatNumber = (num: number) => {
  if (!num) return '0'
  return num.toLocaleString('zh-CN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })
}

const couponTypeText = (type: string) => {
  const map: Record<string, string> = {
    fixed: '满减券',
    discount: '折扣券',
    direct: '直减券',
    redeem: '兑换券',
    shipping: '运费券'
  }
  return map[type] || type
}

const loadData = async () => {
  try {
    const [o, t, td, f, us] = await Promise.all([
      getOverview(),
      getTrend({ days: 30 }),
      getCouponTypeDistribution(),
      getFunnel(),
      getUserSegment()
    ])
    Object.assign(overview, o)
    Object.assign(trendData, t)
    typeDistribution.value = td
    Object.assign(funnelData, f)
    Object.assign(userSegment, us)
  } catch (error) {
    console.error('Failed to load analytics data:', error)
  }
}

const loadBatchEffect = async () => {
  try {
    const res = await getBatchEffect({
      page: pagination.page,
      pageSize: pagination.pageSize
    })
    batchEffectList.value = res.list
    pagination.total = res.total
  } catch (error) {
    console.error('Failed to load batch effect:', error)
  }
}

const handleExport = async (command: string) => {
  try {
    if (command === 'batches') {
      await exportBatches()
    } else if (command === 'analytics') {
      await exportAnalytics()
    }
    ElMessage.success('导出成功')
  } catch (error) {
    ElMessage.error('导出失败')
  }
}

const trendChartOption = computed(() => ({
  tooltip: { trigger: 'axis' },
  legend: { data: ['领取量', '核销量', 'GMV'] },
  grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
  xAxis: {
    type: 'category',
    data: trendData.dates || []
  },
  yAxis: [
    { type: 'value', name: '数量' },
    { type: 'value', name: 'GMV(元)' }
  ],
  series: [
    {
      name: '领取量',
      type: 'line',
      smooth: true,
      data: trendData.receiveData || [],
      itemStyle: { color: '#67C23A' },
      areaStyle: { color: 'rgba(103, 194, 58, 0.1)' }
    },
    {
      name: '核销量',
      type: 'line',
      smooth: true,
      data: trendData.useData || [],
      itemStyle: { color: '#409EFF' },
      areaStyle: { color: 'rgba(64, 158, 255, 0.1)' }
    },
    {
      name: 'GMV',
      type: 'line',
      smooth: true,
      yAxisIndex: 1,
      data: trendData.gmvData || [],
      itemStyle: { color: '#E6A23C' }
    }
  ]
}))

const typeChartOption = computed(() => ({
  tooltip: { trigger: 'item' },
  series: [{
    type: 'pie',
    radius: ['40%', '70%'],
    data: typeDistribution.value.map(item => ({
      value: item.value,
      name: item.name
    })),
    label: {
      formatter: '{b}: {c} ({d}%)'
    }
  }],
  color: ['#409EFF', '#67C23A', '#E6A23C', '#F56C6C', '#909399']
}))

const funnelChartOption = computed(() => ({
  tooltip: { trigger: 'item', formatter: '{b}: {c}' },
  series: [{
    type: 'funnel',
    left: '10%',
    width: '80%',
    label: { formatter: '{b}: {c}' },
    data: funnelData.stages || []
  }],
  color: ['#667eea', '#764ba2', '#f093fb', '#f5576c', '#4facfe']
}))

const userChartOption = computed(() => {
  const segments = userSegment.segments || {}
  const data = Object.keys(segments).map(key => ({
    value: segments[key].count,
    name: segments[key].name
  }))
  return {
    tooltip: { trigger: 'item' },
    series: [{
      type: 'pie',
      radius: '60%',
      data,
      label: {
        formatter: '{b}: {c} ({d}%)'
      }
    }],
    color: ['#f56c6c', '#e6a23c', '#409eff', '#909399', '#67c23a']
  }
})

onMounted(() => {
  loadData()
  loadBatchEffect()
})
</script>

<style scoped lang="scss">
.chart {
  height: 300px;
}

.mb-4 {
  margin-bottom: 20px;
}

.mt-4 {
  margin-top: 20px;
}

.roi-stats {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 20px;
  padding: 20px;
}

.roi-item {
  text-align: center;
  padding: 20px;
  background: #f5f7fa;
  border-radius: 8px;

  &.highlight {
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: #fff;
  }
}

.roi-label {
  font-size: 14px;
  color: #909399;
  margin-bottom: 8px;
}

.roi-item.highlight .roi-label {
  color: rgba(255, 255, 255, 0.8);
}

.roi-value {
  font-size: 24px;
  font-weight: bold;
}

.coupon-type-tag {
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 12px;

  &.fixed {
    background: #ecf5ff;
    color: #409eff;
  }

  &.discount {
    background: #f0f9eb;
    color: #67c23a;
  }

  &.direct {
    background: #fdf6ec;
    color: #e6a23c;
  }

  &.redeem {
    background: #fef0f0;
    color: #f56c6c;
  }

  &.shipping {
    background: #f4f4f5;
    color: #909399;
  }
}

.pagination-container {
  display: flex;
  justify-content: center;
  margin-top: 20px;
}
</style>
