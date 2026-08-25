<template>
  <div :class="['stat-card', type]">
    <div class="stat-card-title">{{ title }}</div>
    <div class="stat-card-value">{{ formatValue(value) }}</div>
    <div v-if="subtitle" class="stat-card-subtitle">{{ subtitle }}</div>
  </div>
</template>

<script setup lang="ts">
interface Props {
  title: string
  value: number | string
  subtitle?: string
  type?: 'default' | 'success' | 'warning' | 'info'
}

const props = withDefaults(defineProps<Props>(), {
  type: 'default'
})

const formatValue = (val: number | string) => {
  if (typeof val === 'number') {
    if (val >= 10000) {
      return (val / 10000).toFixed(1) + '万'
    }
    return val.toLocaleString()
  }
  return val
}
</script>
