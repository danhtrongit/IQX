import { api } from "./client"

// ── Types ──────────────────────────────────────────────────────────────────

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

// ── Backend raw shape ──────────────────────────────────────────────────────

interface BackendPlanResponse {
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

// ── Adapter ────────────────────────────────────────────────────────────────

function adapt(raw: BackendPlanResponse): PlanRow {
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

// ── API client ─────────────────────────────────────────────────────────────

export const plansApi = {
  list: async (): Promise<PlanRow[]> => {
    const raw = await api
      .get("premium/admin/plans")
      .json<BackendPlanResponse[]>()
    return raw.map(adapt)
  },

  create: async (body: PlanCreate): Promise<PlanRow> => {
    const raw = await api
      .post("premium/admin/plans", { json: body })
      .json<BackendPlanResponse>()
    return adapt(raw)
  },

  update: async (id: string, body: Partial<PlanCreate>): Promise<PlanRow> => {
    const raw = await api
      .patch(`premium/admin/plans/${id}`, { json: body })
      .json<BackendPlanResponse>()
    return adapt(raw)
  },

  delete: async (id: string): Promise<PlanRow> => {
    const raw = await api
      .delete(`premium/admin/plans/${id}`)
      .json<BackendPlanResponse>()
    return adapt(raw)
  },
}
