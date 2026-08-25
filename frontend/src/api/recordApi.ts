import request from './request'

export interface ReceiveRecord {
  id: number
  batchId: number
  couponId: number
  userId: number
  channel: string
  deviceId?: string
  ipAddress?: string
  riskLevel: string
  riskReason?: string
  isCancelled: boolean
  createdAt: string
  CouponBatch?: any
  CouponCode?: any
}

export interface UseRecord {
  id: number
  batchId: number
  couponId: number
  userId: number
  orderId: string
  orderAmount: number
  discountAmount: number
  actualPayAmount: number
  isRefunded: boolean
  createdAt: string
  CouponBatch?: any
  CouponCode?: any
}

export const getReceiveRecords = (params?: any) => {
  return request<{ list: ReceiveRecord[]; total: number }>({
    url: '/records/receive',
    method: 'get',
    params
  })
}

export const getUseRecords = (params?: any) => {
  return request<{ list: UseRecord[]; total: number }>({
    url: '/records/use',
    method: 'get',
    params
  })
}

export const refundUseRecord = (id: number, data: { refundOrderId: string }) => {
  return request({
    url: `/records/use/${id}/refund`,
    method: 'post',
    data
  })
}

export const batchCancelReceive = (data: { ids: number[] }) => {
  return request({
    url: '/records/receive/batch-cancel',
    method: 'post',
    data
  })
}
