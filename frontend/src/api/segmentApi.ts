import request from './request'

export interface UserSegment {
  id?: number
  name: string
  code?: string
  description?: string
  segmentType: string
  userIds?: number[]
  criteria?: any
  userCount?: number
  status?: string
  createdBy?: number
  createdAt?: string
}

export const getSegmentList = (params?: any) => {
  return request<{ list: UserSegment[]; total: number }>({
    url: '/segments',
    method: 'get',
    params
  })
}

export const getAllSegments = () => {
  return request<UserSegment[]>({
    url: '/segments/all',
    method: 'get'
  })
}

export const getSegmentDetail = (id: number) => {
  return request<UserSegment>({
    url: `/segments/${id}`,
    method: 'get'
  })
}

export const createSegment = (data: UserSegment) => {
  return request<UserSegment>({
    url: '/segments',
    method: 'post',
    data
  })
}

export const updateSegment = (id: number, data: Partial<UserSegment>) => {
  return request<UserSegment>({
    url: `/segments/${id}`,
    method: 'put',
    data
  })
}

export const deleteSegment = (id: number) => {
  return request({
    url: `/segments/${id}`,
    method: 'delete'
  })
}

export const toggleSegment = (id: number) => {
  return request<UserSegment>({
    url: `/segments/${id}/toggle`,
    method: 'post'
  })
}

export const initBuiltinSegments = () => {
  return request({
    url: '/segments/init-builtin',
    method: 'post'
  })
}

export const refreshSegmentCount = (id: number) => {
  return request<{ userCount: number }>({
    url: `/segments/${id}/refresh-count`,
    method: 'post'
  })
}

export const getSegmentUsers = (id: number, limit = 100) => {
  return request<{ userIds: number[]; total: number }>({
    url: `/segments/${id}/users`,
    method: 'get',
    params: { limit }
  })
}
