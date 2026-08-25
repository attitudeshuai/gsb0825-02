import request from './request'

export interface LoginParams {
  username: string
  password: string
}

export interface LoginResponse {
  token: string
  user: {
    id: number
    username: string
    realName: string
    role: string
  }
}

export const login = (data: LoginParams) => {
  return request<LoginResponse>({
    url: '/auth/login',
    method: 'post',
    data
  })
}

export const getProfile = () => {
  return request<{ user: LoginResponse['user'] }>({
    url: '/auth/profile',
    method: 'get'
  })
}

export const changePassword = (data: { oldPassword: string; newPassword: string }) => {
  return request({
    url: '/auth/change-password',
    method: 'post',
    data
  })
}
