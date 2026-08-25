<template>
  <div class="rule-builder">
    <el-form :model="form" label-width="120px">
      <el-form-item label="使用门槛">
        <el-input-number v-model="form.minAmount" :min="0" :precision="2" />
        <span class="ml-2">元</span>
      </el-form-item>
      
      <el-form-item label="每人限领">
        <el-input-number v-model="form.limitPerPerson" :min="1" />
        <span class="ml-2">张</span>
      </el-form-item>
      
      <el-form-item label="有效期类型">
        <el-radio-group v-model="form.validityType">
          <el-radio label="fixed">固定有效期</el-radio>
          <el-radio label="relative">领取后N天有效</el-radio>
        </el-radio-group>
      </el-form-item>
      
      <template v-if="form.validityType === 'fixed'">
        <el-form-item label="有效期">
          <el-date-picker
            v-model="dateRange"
            type="daterange"
            range-separator="至"
            start-placeholder="开始日期"
            end-placeholder="结束日期"
            value-format="YYYY-MM-DD HH:mm:ss"
          />
        </el-form-item>
      </template>
      
      <template v-else>
        <el-form-item label="有效天数">
          <el-input-number v-model="form.validDays" :min="1" />
          <span class="ml-2">天</span>
        </el-form-item>
      </template>
      
      <el-form-item label="适用范围">
        <el-radio-group v-model="form.scope">
          <el-radio label="all">全场通用</el-radio>
          <el-radio label="category">指定分类</el-radio>
          <el-radio label="product">指定商品</el-radio>
        </el-radio-group>
      </el-form-item>
      
      <el-form-item label="允许叠加">
        <el-switch v-model="form.allowStacking" />
      </el-form-item>
      
      <el-form-item v-if="form.allowStacking" label="叠加规则">
        <el-checkbox v-model="stackingWithSameType">可与同类券叠加</el-checkbox>
        <el-checkbox v-model="stackingWithOtherType">可与其他类型券叠加</el-checkbox>
        <el-checkbox v-model="stackingWithPromotion">可与促销活动叠加</el-checkbox>
      </el-form-item>
    </el-form>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, nextTick } from 'vue'

interface Props {
  modelValue: any
}

const props = defineProps<Props>()
const emit = defineEmits<{
  (e: 'update:modelValue', value: any): void
}>()

const isEmitting = ref(false)

const form = ref<any>({
  minAmount: 0,
  limitPerPerson: 1,
  validityType: 'fixed',
  validDays: 30,
  scope: 'all',
  allowStacking: false,
  stackingRules: {}
})

const dateRange = ref<any[]>([])
const stackingWithSameType = ref(false)
const stackingWithOtherType = ref(false)
const stackingWithPromotion = ref(false)

watch(() => props.modelValue, (val) => {
  if (isEmitting.value) return
  if (!val) return
  form.value.minAmount = val.minAmount ?? 0
  form.value.limitPerPerson = val.limitPerPerson ?? 1
  form.value.validityType = val.validityType ?? 'fixed'
  form.value.validDays = val.validDays ?? 30
  form.value.scope = val.scope ?? 'all'
  form.value.allowStacking = val.allowStacking ?? false
  if (val.startTime && val.endTime) {
    dateRange.value = [val.startTime, val.endTime]
  }
  if (val.stackingRules) {
    stackingWithSameType.value = val.stackingRules.sameType ?? false
    stackingWithOtherType.value = val.stackingRules.otherType ?? false
    stackingWithPromotion.value = val.stackingRules.promotion ?? false
  }
}, { immediate: true })

function emitUpdate() {
  isEmitting.value = true
  const data = {
    minAmount: form.value.minAmount,
    limitPerPerson: form.value.limitPerPerson,
    validityType: form.value.validityType,
    validDays: form.value.validDays,
    scope: form.value.scope,
    allowStacking: form.value.allowStacking,
    stackingRules: {
      sameType: stackingWithSameType.value,
      otherType: stackingWithOtherType.value,
      promotion: stackingWithPromotion.value
    }
  }
  if (dateRange.value?.length === 2) {
    data.startTime = dateRange.value[0]
    data.endTime = dateRange.value[1]
  }
  emit('update:modelValue', data)
  nextTick(() => {
    isEmitting.value = false
  })
}

watch(form, emitUpdate, { deep: true })
watch(dateRange, emitUpdate)
watch(stackingWithSameType, emitUpdate)
watch(stackingWithOtherType, emitUpdate)
watch(stackingWithPromotion, emitUpdate)
</script>
