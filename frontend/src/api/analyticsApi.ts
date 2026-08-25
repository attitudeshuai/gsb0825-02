import request from './request'

export const getOverview = () => {
  return request({
    url: '/analytics/overview',
    method: 'get'
  })
}

export const getTrend = (params?: { days?: number }) => {
  return request({
    url: '/analytics/trend',
    method: 'get',
    params
  })
}

export const getBatchEffect = (params?: any) => {
  return request({
    url: '/analytics/batch-effect',
    method: 'get',
    params
  })
}

export const getFunnel = (params?: { batchId?: number }) => {
  return request({
    url: '/analytics/funnel',
    method: 'get',
    params
  })
}

export const getCouponTypeDistribution = () => {
  return request({
    url: '/analytics/coupon-type-distribution',
    method: 'get'
  })
}

export const getUserSegment = () => {
  return request({
    url: '/analytics/user-segment',
    method: 'get'
  })
}

export const exportBatches = () => {
  return request({
    url: '/export/batches',
    method: 'get',
    responseType: 'blob'
  })
}

export const exportCodes = (batchId: number) => {
  return request({
    url: `/export/codes/${batchId}`,
    method: 'get',
    responseType: 'blob'
  })
}

export const exportReceiveRecords = (params?: any) => {
  return request({
    url: '/export/records/receive',
    method: 'get',
    params,
    responseType: 'blob'
  })
}

export const exportUseRecords = (params?: any) => {
  return request({
    url: '/export/records/use',
    method: 'get',
    params,
    responseType: 'blob'
  })
}

export const exportAnalytics = () => {
  return request({
    url: '/export/analytics',
    method: 'get',
    responseType: 'blob'
  })
}
