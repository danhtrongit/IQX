import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useAuth } from "@/features/auth"
import { usersApi, type UpdateProfilePayload, type UserProfile } from "./api"
import { settingsKeys } from "./keys"

/** GET /users/me — enabled only when authenticated. */
export function useProfile() {
  const { isAuthenticated } = useAuth()
  return useQuery({
    queryKey: settingsKeys.profile,
    queryFn: usersApi.getProfile,
    enabled: isAuthenticated,
    staleTime: 60_000,
  })
}

/** PATCH /users/me — invalidates the cached profile on success. */
export function useUpdateProfile() {
  const queryClient = useQueryClient()
  return useMutation<UserProfile, unknown, UpdateProfilePayload>({
    mutationFn: usersApi.updateProfile,
    onSuccess: (profile) => {
      queryClient.setQueryData(settingsKeys.profile, profile)
      queryClient.invalidateQueries({ queryKey: settingsKeys.profile })
    },
  })
}
