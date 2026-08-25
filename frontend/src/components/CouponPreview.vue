<template>
  <div :class="['coupon-preview', couponType]">
    <div class="coupon-preview-value">
      <template v-if="couponType === 'discount'">
        {{ discountText }}
      </template>
      <template v-else>
        ¥{{ faceValue }}
      </template>
    </div>
    <div class="coupon-preview-name">{{ name }}</div>
    <div class="coupon-preview-desc">{{ description }}</div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

interface Props {
  couponType: string
  faceValue: number
  discountRate?: number
  name: string
  minAmount?: number
  description?: string
}

const props = withDefaults(defineProps<Props>(), {
  description: ''
})

const discountText = computed(() => {
  if (props.discountRate) {
    return (props.discountRate * 10).toFixed(1) + '折'
  }
  return ''
})
</script>
