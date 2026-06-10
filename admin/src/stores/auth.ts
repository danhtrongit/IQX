import { computed, ref } from "vue"
import { defineStore } from "pinia"
import { authApi, getAccessToken, setAccessToken, setRefreshToken, type AdminUser } from "@/lib/api/auth"

interface LoginPayload {
  email: string
  password: string
}

export const useAuthStore = defineStore("auth", () => {
  const user = ref<AdminUser | null>(loadUser())
  const isLoading = ref(false)
  const hasBootstrapped = ref(false)
  const isAuthenticated = computed(() => !!user.value)

  async function bootstrap() {
    if (hasBootstrapped.value) return
    hasBootstrapped.value = true
    const savedUser = loadUser()
    if (!savedUser || !sessionStorage.getItem("admin_accessToken")) {
      clearSession()
      user.value = null
      return
    }
    isLoading.value = true
    try {
      const freshUser = await authApi.getMe()
      if (freshUser.role !== "admin") {
        clearSession()
        user.value = null
        return
      }
      persistUser(freshUser)
      user.value = freshUser
    } catch {
      clearSession()
      user.value = null
    } finally {
      isLoading.value = false
    }
  }

  async function login(payload: LoginPayload) {
    isLoading.value = true
    try {
      const res = await authApi.login(payload)
      setAccessToken(res.accessToken)
      setRefreshToken(res.refreshToken)
      persistUser(res.user)
      user.value = res.user
      hasBootstrapped.value = true
    } finally {
      isLoading.value = false
    }
  }

  async function logout() {
    isLoading.value = true
    try {
      if (getAccessToken()) await authApi.logout().catch(() => undefined)
    } finally {
      clearSession()
      user.value = null
      isLoading.value = false
    }
  }

  async function refreshUser() {
    const freshUser = await authApi.getMe()
    if (freshUser.role !== "admin") {
      clearSession()
      user.value = null
      return
    }
    persistUser(freshUser)
    user.value = freshUser
  }

  function handleForcedLogout() {
    clearSession()
    user.value = null
  }

  return { user, isLoading, isAuthenticated, bootstrap, login, logout, refreshUser, handleForcedLogout }
})

function loadUser(): AdminUser | null {
  try {
    const raw = sessionStorage.getItem("admin_user")
    return raw ? (JSON.parse(raw) as AdminUser) : null
  } catch {
    return null
  }
}

function persistUser(user: AdminUser) {
  sessionStorage.setItem("admin_user", JSON.stringify(user))
}

function clearSession() {
  setAccessToken(null)
  setRefreshToken(null)
  sessionStorage.removeItem("admin_user")
}
