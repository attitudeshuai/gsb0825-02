import { defineStore } from 'pinia'
import { ref } from 'vue'
import { getBatchList, getBatchDetail, createBatch, updateBatch, CouponBatch, getCodeList } from '@/api/couponApi'

export const useCouponStore = defineStore('coupon', () => {
  const batches = ref<CouponBatch[]>([])
  const total = ref(0)
  const currentBatch = ref<CouponBatch | null>(null)
  const loading = ref(false)

  const fetchBatches = async (params?: any) => {
    loading.value = true
    try {
      const response = await getBatchList(params)
      batches.value = response.list
      total.value = response.total
      return response
    } finally {
      loading.value = false
    }
  }

  const fetchBatchDetail = async (id: number) => {
    loading.value = true
    try {
      const response = await getBatchDetail(id)
      currentBatch.value = response
      return response
    } finally {
      loading.value = false
    }
  }

  const createNewBatch = async (data: CouponBatch) => {
    loading.value = true
    try {
      const response = await createBatch(data)
      return response
    } finally {
      loading.value = false
    }
  }

  const updateExistingBatch = async (id: number, data: Partial<CouponBatch>) => {
    loading.value = true
    try {
      const response = await updateBatch(id, data)
      return response
    } finally {
      loading.value = false
    }
  }

  const clearCurrentBatch = () => {
    currentBatch.value = null
  }

  return {
    batches,
    total,
    currentBatch,
    loading,
    fetchBatches,
    fetchBatchDetail,
    createNewBatch,
    updateExistingBatch,
    clearCurrentBatch
  }
})
