import { api } from "./client"

export interface PlanRow {
  id: string
  code: string
  name: string
  description: string | null
  priceVnd: number
  durationDays: number
  isActive: boolean
  sortOrder: number
  createdAt: string
  updatedAt: string
}

export interface PlanCreate {
  code: string
  name: string
  description?: string | null
  price_vnd: number
  duration_days: number
  is_active?: boolean
  sort_order?: number
}

export interface BackendPlanResponse {
  id: string
  code: string
  name: string
  description: string | null
  price_vnd: number
  duration_days: number
  is_active: boolean
  sort_order: number
  created_at: string
  updated_at: string
}

export function adaptPlan(raw: BackendPlanResponse): PlanRow {
  return {
    id: String(raw.id),
    code: raw.code,
    name: raw.name,
    description: raw.description,
    priceVnd: raw.price_vnd,
    durationDays: raw.duration_days,
    isActive: raw.is_active,
    sortOrder: raw.sort_order,
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
  }
}

export const plansApi = {
  list: async (): Promise<PlanRow[]> => (await api.get("premium/admin/plans").json<BackendPlanResponse[]>()).map(adaptPlan),
  create: async (body: PlanCreate): Promise<PlanRow> => adaptPlan(await api.post("premium/admin/plans", { json: body }).json<BackendPlanResponse>()),
  update: async (id: string, body: Partial<PlanCreate>): Promise<PlanRow> => adaptPlan(await api.patch(`premium/admin/plans/${id}`, { json: body }).json<BackendPlanResponse>()),
  delete: async (id: string): Promise<PlanRow> => adaptPlan(await api.delete(`premium/admin/plans/${id}`).json<BackendPlanResponse>()),
}
