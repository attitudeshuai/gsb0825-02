import request from './request'

export interface CouponBatch {
  id?: number
  batchCode?: string
  name: string
  couponType: string
  faceValue: number
  discountRate?: number
  minAmount: number
  maxDiscount?: number
  totalQuantity: number
  usedQuantity?: number
  receivedQuantity?: number
  limitPerPerson: number
  validityType: string
  startTime?: string
  endTime?: string
  validDays?: number
  scope: string
  scopeValue?: any
  allowStacking: boolean
  stackingRules?: any
  deliveryStrategy: string
  status?: string
  description?: string
  createdBy?: number
  createdAt?: string
  codePrefix?: string
}

export interface BatchListResponse {
  list: CouponBatch[]
  total: number
  page: number
  pageSize: number
}

export const getBatchList = (params?: any) => {
  return request<BatchListResponse>({
    url: '/batches',
    method: 'get',
    params
  })
}

export const getBatchDetail = (id: number) => {
  return request<CouponBatch>({
    url: `/batches/${id}`,
    method: 'get'
  })
}

export const createBatch = (data: CouponBatch) => {
  return request<CouponBatch>({
    url: '/batches',
    method: 'post',
    data
  })
}

export const updateBatch = (id: number, data: Partial<CouponBatch>) => {
  return request<CouponBatch>({
    url: `/batches/${id}`,
    method: 'put',
    data
  })
}

export const activateBatch = (id: number) => {
  return request<CouponBatch>({
    url: `/batches/${id}/activate`,
    method: 'post'
  })
}

export const stopBatch = (id: number) => {
  return request<CouponBatch>({
    url: `/batches/${id}/stop`,
    method: 'post'
  })
}

export const cancelBatch = (id: number) => {
  return request({
    url: `/batches/${id}/cancel`,
    method: 'post'
  })
}

export const getBatchStatistics = () => {
  return request({
    url: '/batches/statistics/summary',
    method: 'get'
  })
}

export interface CouponCode {
  id: number
  batchId: number
  code: string
  userId?: number
  status: string
  receivedAt?: string
  validStartTime?: string
  validEndTime?: string
  usedAt?: string
  orderId?: string
  CouponBatch?: CouponBatch
}

export const getCodeList = (params?: any) => {
  return request<{ list: CouponCode[]; total: number }>({
    url: '/codes',
    method: 'get',
    params
  })
}

export const generateCodes = (batchId: number, data: { count: number; prefix?: string }) => {
  return request({
    url: `/batches/${batchId}/generate-codes`,
    method: 'post',
    data
  })
}

export const redeemCode = (data: { code: string; userId: number; deviceId?: string }) => {
  return request({
    url: '/codes/redeem',
    method: 'post',
    data
  })
}

export const cancelCode = (id: number) => {
  return request({
    url: `/codes/${id}/cancel`,
    method: 'post'
  })
}

export const activateCode = (id: number) => {
  return request({
    url: `/codes/${id}/activate`,
    method: 'post'
  })
}

export const receiveCoupon = (id: number, data: { userId: number; deviceId?: string }) => {
  return request({
    url: `/codes/${id}/receive`,
    method: 'post',
    data
  })
}

export const useCoupon = (id: number, data: { orderId: string; orderAmount: number; userId: number; productInfo?: any }) => {
  return request({
    url: `/codes/${id}/use`,
    method: 'post',
    data
  })
}

export const getUserCoupons = (data: { userId: number; status?: string; batchId?: number }) => {
  return request<CouponCode[]>({
    url: '/user-coupons',
    method: 'post',
    data
  })
}

export interface IssueResult {
  message: string
  issued: number
  generated?: number
  totalUsers: number
  channel: string
  skipped: { userId: number; reason: string }[]
  segmentUsers?: number
}

export const issueCoupons = (batchId: number, data: { usersText?: string; userIds?: number[]; eachCount?: number }) => {
  return request<IssueResult>({
    url: `/batches/${batchId}/issue`,
    method: 'post',
    data
  })
}

export const issueTargetedCoupons = (batchId: number, data: { segment: string; maxUsers?: number; eachCount?: number }) => {
  return request<IssueResult>({
    url: `/batches/${batchId}/issue-targeted`,
    method: 'post',
    data
  })
}

export const getSegmentOverview = () => {
  return request<Record<string, { name: string; count: number }>>({
    url: '/batches/segments',
    method: 'get'
  })
}
