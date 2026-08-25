import request from './request'

export interface RiskRule {
  id?: number
  ruleType: string
  ruleName: string
  config: any
  action: string
  status: string
  description?: string
}

export interface RiskBlacklistItem {
  id?: number
  type: string
  value: string
  reason?: string
  expireAt?: string
  isPermanent: boolean
}

export const getRiskRules = () => {
  return request<RiskRule[]>({
    url: '/risk/rules',
    method: 'get'
  })
}

export const createRiskRule = (data: RiskRule) => {
  return request<RiskRule>({
    url: '/risk/rules',
    method: 'post',
    data
  })
}

export const updateRiskRule = (id: number, data: Partial<RiskRule>) => {
  return request<RiskRule>({
    url: `/risk/rules/${id}`,
    method: 'put',
    data
  })
}

export const toggleRiskRule = (id: number) => {
  return request<RiskRule>({
    url: `/risk/rules/${id}/toggle`,
    method: 'post'
  })
}

export const deleteRiskRule = (id: number) => {
  return request({
    url: `/risk/rules/${id}`,
    method: 'delete'
  })
}

export const initDefaultRules = () => {
  return request({
    url: '/risk/init-default-rules',
    method: 'post'
  })
}

export const getBlacklist = (params?: any) => {
  return request<{ list: RiskBlacklistItem[]; total: number }>({
    url: '/risk/blacklist',
    method: 'get',
    params
  })
}

export const addToBlacklist = (data: RiskBlacklistItem) => {
  return request<RiskBlacklistItem>({
    url: '/risk/blacklist',
    method: 'post',
    data
  })
}

export const removeFromBlacklist = (id: number) => {
  return request({
    url: `/risk/blacklist/${id}`,
    method: 'delete'
  })
}

export const getIntercepts = (params?: any) => {
  return request<{ list: any[]; total: number }>({
    url: '/risk/intercepts',
    method: 'get',
    params
  })
}

export const checkRisk = (data: { userId?: number; deviceId?: string; ipAddress?: string; batchId?: number; scene?: string }) => {
  return request<{ blocked: boolean; reason?: string }>({
    url: '/risk/check',
    method: 'post',
    data
  })
}

export const blacklistFromIntercept = (id: number, data: { type: 'ip' | 'device' | 'user'; reason?: string }) => {
  return request<{ message: string; duplicated?: boolean }>({
    url: `/risk/intercepts/${id}/blacklist`,
    method: 'post',
    data
  })
}
