import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { login, getProfile, LoginResponse } from '@/api/authApi'

export const useAuthStore = defineStore('auth', () => {
  const token = ref<string | null>(localStorage.getItem('token'))
  const user = ref<LoginResponse['user'] | null>(null)

  const isLoggedIn = computed(() => !!token.value)

  const setToken = (newToken: string) => {
    token.value = newToken
    localStorage.setItem('token', newToken)
  }

  const setUser = (newUser: LoginResponse['user']) => {
    user.value = newUser
  }

  const doLogin = async (username: string, password: string) => {
    const response = await login({ username, password })
    setToken(response.token)
    setUser(response.user)
    return response
  }

  const fetchProfile = async () => {
    if (!token.value) return null
    try {
      const response = await getProfile()
      setUser(response.user)
      return response.user
    } catch (error) {
      logout()
      throw error
    }
  }

  const logout = () => {
    token.value = null
    user.value = null
    localStorage.removeItem('token')
  }

  return {
    token,
    user,
    isLoggedIn,
    setToken,
    setUser,
    doLogin,
    fetchProfile,
    logout
  }
})
