<template>
  <div class="page-container">
    <div class="page-header">
      <h2 class="page-title">首页概览</h2>
    </div>
    
    <el-row :gutter="20" class="mb-4">
      <el-col :span="6">
        <StatCard title="券批次总数" :value="stats.totalBatches || 0" type="default" />
      </el-col>
      <el-col :span="6">
        <StatCard title="今日领取量" :value="stats.todayReceived || 0" type="success" />
      </el-col>
      <el-col :span="6">
        <StatCard title="今日核销量" :value="stats.todayUsed || 0" type="warning" />
      </el-col>
      <el-col :span="6">
        <StatCard title="累计带动GMV" :value="parseFloat(stats.totalGmv || 0)" type="info" subtitle="元" />
      </el-col>
    </el-row>
    
    <el-row :gutter="20">
      <el-col :span="16">
        <div class="chart-container">
          <div class="chart-title">领取/核销趋势 (近7天)</div>
          <v-chart class="chart" :option="trendChartOption" autoresize />
        </div>
      </el-col>
      <el-col :span="8">
        <div class="chart-container">
          <div class="chart-title">券类型分布</div>
          <v-chart class="chart" :option="typeChartOption" autoresize />
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
          <div class="chart-title">用户分层</div>
          <v-chart class="chart" :option="userChartOption" autoresize />
        </div>
      </el-col>
    </el-row>
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
import StatCard from '@/components/StatCard.vue'
import { getBatchStatistics } from '@/api/couponApi'
import { getTrend, getCouponTypeDistribution, getFunnel, getUserSegment } from '@/api/analyticsApi'

use([CanvasRenderer, LineChart, PieChart, FunnelChart, TitleComponent, TooltipComponent, LegendComponent, GridComponent])

const stats = reactive<any>({})
const trendData = reactive<any>({})
const typeDistribution = ref<any[]>([])
const funnelData = reactive<any>({})
const userSegment = reactive<any>({})

const loadData = async () => {
  try {
    const [s, t, td, f, us] = await Promise.all([
      getBatchStatistics(),
      getTrend({ days: 7 }),
      getCouponTypeDistribution(),
      getFunnel(),
      getUserSegment()
    ])
    Object.assign(stats, s)
    Object.assign(trendData, t)
    typeDistribution.value = td
    Object.assign(funnelData, f)
    Object.assign(userSegment, us)
  } catch (error) {
    console.error('Failed to load dashboard data:', error)
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
  color: ['#667eea', '#764ba2', '#f093fb']
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
    color: ['#f56c6c', '#e6a23c', '#409eff', '#909399']
  }
})

onMounted(() => {
  loadData()
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
</style>
