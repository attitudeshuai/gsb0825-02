<template>
  <span :class="['risk-tag', level]">{{ text }}</span>
</template>

<script setup lang="ts">
import { computed } from 'vue'

interface Props {
  level: string
}

const props = defineProps<Props>()

const text = computed(() => {
  const map: Record<string, string> = {
    normal: '正常',
    warning: '警告',
    danger: '危险'
  }
  return map[props.level] || props.level
})
</script>
