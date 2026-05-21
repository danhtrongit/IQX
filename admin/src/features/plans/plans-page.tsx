import { useCallback, useEffect, useState } from "react"
import { Plus, Pencil, Trash2 } from "lucide-react"
import { toast } from "sonner"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { StatusBadge } from "@/components/common/status-badge"
import { ConfirmDialog } from "@/components/common/confirm-dialog"
import { ErrorState } from "@/components/common/error-state"
import { Skeleton } from "@/components/ui/skeleton"
import { plansApi, type PlanRow } from "@/lib/api/plans"
import { fmtVnd, fmtDate } from "@/lib/format"
import { PlanDetailDrawer } from "./plan-detail-drawer"

const INTERNAL_PLANS = ["TRIAL_7D"]

export default function PlansPage() {
  const [plans, setPlans] = useState<PlanRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Drawer state
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [editingPlan, setEditingPlan] = useState<PlanRow | null>(null)

  // Delete confirm
  const [deleteTarget, setDeleteTarget] = useState<PlanRow | null>(null)
  const [deleteLoading, setDeleteLoading] = useState(false)

  const fetchPlans = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await plansApi.list()
      // Sort by sort_order asc, then name
      data.sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
      setPlans(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không thể tải danh sách gói")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void fetchPlans() }, [fetchPlans])

  const handleCreate = () => {
    setEditingPlan(null)
    setDrawerOpen(true)
  }

  const handleEdit = (plan: PlanRow) => {
    setEditingPlan(plan)
    setDrawerOpen(true)
  }

  const handleSuccess = (plan: PlanRow) => {
    setPlans((prev) => {
      const idx = prev.findIndex((p) => p.id === plan.id)
      if (idx >= 0) {
        const next = [...prev]
        next[idx] = plan
        return next
      }
      return [...prev, plan].sort(
        (a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name),
      )
    })
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    setDeleteLoading(true)
    try {
      const updated = await plansApi.delete(deleteTarget.id)
      setPlans((prev) =>
        prev.map((p) => (p.id === updated.id ? updated : p)),
      )
      toast.success("Đã ngưng kích hoạt gói")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Thao tác thất bại")
    } finally {
      setDeleteLoading(false)
      setDeleteTarget(null)
    }
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Gói Premium</h1>
          <p className="text-sm text-muted-foreground">
            Quản lý các gói premium
          </p>
        </div>
        <Button size="sm" onClick={handleCreate} className="gap-1.5">
          <Plus className="size-4" />
          Tạo gói mới
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Danh sách gói ({plans.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : error ? (
            <ErrorState message={error} onRetry={fetchPlans} />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Mã</TableHead>
                  <TableHead>Tên</TableHead>
                  <TableHead>Giá (VND)</TableHead>
                  <TableHead>Thời hạn</TableHead>
                  <TableHead>Thứ tự</TableHead>
                  <TableHead>Trạng thái</TableHead>
                  <TableHead>Ngày tạo</TableHead>
                  <TableHead className="text-right">Thao tác</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {plans.map((plan) => {
                  const isInternal = INTERNAL_PLANS.includes(plan.code)
                  return (
                    <TableRow
                      key={plan.id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => handleEdit(plan)}
                    >
                      <TableCell className="font-mono text-sm">
                        <div className="flex items-center gap-2">
                          {plan.code}
                          {isInternal && (
                            <Badge
                              variant="outline"
                              className="h-4 px-1.5 text-[10px] bg-amber-100 text-amber-800 border-amber-200"
                            >
                              Internal
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm font-medium">
                        {plan.name}
                      </TableCell>
                      <TableCell className="text-sm">
                        {fmtVnd(plan.priceVnd)}
                      </TableCell>
                      <TableCell className="text-sm">
                        {plan.durationDays} ngày
                      </TableCell>
                      <TableCell className="text-sm">{plan.sortOrder}</TableCell>
                      <TableCell>
                        <StatusBadge
                          status={plan.isActive ? "active" : "inactive"}
                          label={plan.isActive ? "Đang hoạt động" : "Không hoạt động"}
                        />
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {fmtDate(plan.createdAt)}
                      </TableCell>
                      <TableCell className="text-right">
                        <div
                          className="flex items-center justify-end gap-1"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-7"
                            onClick={() => handleEdit(plan)}
                            title="Chỉnh sửa"
                          >
                            <Pencil className="size-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-7 text-destructive hover:text-destructive"
                            onClick={() => setDeleteTarget(plan)}
                            disabled={isInternal || !plan.isActive}
                            title={
                              isInternal
                                ? "Gói Internal không thể xoá"
                                : !plan.isActive
                                  ? "Gói đã ngưng kích hoạt"
                                  : "Ngưng kích hoạt"
                            }
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })}
                {plans.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={8}
                      className="py-12 text-center text-muted-foreground"
                    >
                      Chưa có gói nào
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Drawer */}
      <PlanDetailDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        plan={editingPlan}
        onSuccess={handleSuccess}
      />

      {/* Delete confirm */}
      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null)
        }}
        title="Ngưng kích hoạt gói"
        description={`Bạn có chắc muốn ngưng kích hoạt gói "${deleteTarget?.name}"? Gói sẽ được ẩn khỏi danh sách công khai nhưng vẫn tồn tại trong hệ thống.`}
        destructive
        confirmLabel={deleteLoading ? "Đang xử lý..." : "Ngưng kích hoạt"}
        onConfirm={handleDelete}
      />
    </div>
  )
}
