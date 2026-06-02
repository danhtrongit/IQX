import { useCallback, useEffect, useState } from "react"
import { useForm } from "react-hook-form"
import { toast } from "sonner"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { ErrorState } from "@/components/common/error-state"
import { fmtDateTime } from "@/lib/format"
import { vtApi, type VTConfigData } from "@/lib/api/vt"

interface ConfigFormValues {
  initialCashVnd: number
  buyFeeRateBps: number
  sellFeeRateBps: number
  sellTaxRateBps: number
  settlementMode: string
  boardLotSize: number
  tradingEnabled: boolean
}

function FieldRow({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div className="grid grid-cols-3 items-start gap-4">
      <div className="pt-2">
        <Label className="text-sm font-medium">{label}</Label>
        {hint && <p className="text-xs text-muted-foreground mt-0.5">{hint}</p>}
      </div>
      <div className="col-span-2">{children}</div>
    </div>
  )
}

export default function VTConfigPage() {
  const [config, setConfig] = useState<VTConfigData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)
  const [saving, setSaving] = useState(false)

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { isDirty, errors },
  } = useForm<ConfigFormValues>()

  const tradingEnabled = watch("tradingEnabled")
  const settlementMode = watch("settlementMode")

  const loadConfig = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await vtApi.getConfig()
      setConfig(data)
      reset({
        initialCashVnd: data.initialCashVnd,
        buyFeeRateBps: data.buyFeeRateBps,
        sellFeeRateBps: data.sellFeeRateBps,
        sellTaxRateBps: data.sellTaxRateBps,
        settlementMode: data.settlementMode,
        boardLotSize: data.boardLotSize,
        tradingEnabled: data.tradingEnabled,
      })
    } catch (e) {
      setError(e instanceof Error ? e : new Error("Không thể tải cấu hình"))
    } finally {
      setLoading(false)
    }
  }, [reset])

  useEffect(() => { void loadConfig() }, [loadConfig])

  const onSubmit = async (values: ConfigFormValues) => {
    setSaving(true)
    try {
      const updated = await vtApi.updateConfig({
        initialCashVnd: Number(values.initialCashVnd),
        buyFeeRateBps: Number(values.buyFeeRateBps),
        sellFeeRateBps: Number(values.sellFeeRateBps),
        sellTaxRateBps: Number(values.sellTaxRateBps),
        settlementMode: values.settlementMode,
        boardLotSize: Number(values.boardLotSize),
        tradingEnabled: values.tradingEnabled,
      })
      setConfig(updated)
      reset({
        initialCashVnd: updated.initialCashVnd,
        buyFeeRateBps: updated.buyFeeRateBps,
        sellFeeRateBps: updated.sellFeeRateBps,
        sellTaxRateBps: updated.sellTaxRateBps,
        settlementMode: updated.settlementMode,
        boardLotSize: updated.boardLotSize,
        tradingEnabled: updated.tradingEnabled,
      })
      toast.success("Đã lưu cấu hình thành công")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Lưu thất bại")
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-96 w-full" />
      </div>
    )
  }

  if (error || !config) {
    return <ErrorState message={error?.message ?? "Không tìm thấy cấu hình"} onRetry={loadConfig} />
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Cấu hình giao dịch ảo</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Cập nhật lần cuối: {fmtDateTime(config.updatedAt)}
          </p>
        </div>
      </div>

      <form onSubmit={(e) => { void handleSubmit(onSubmit)(e) }}>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Tham số hệ thống</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <FieldRow label="Giao dịch đang mở">
              <div className="flex items-center gap-2 pt-1.5">
                <Switch
                  id="trading-enabled"
                  checked={tradingEnabled ?? config.tradingEnabled}
                  onCheckedChange={(v) => setValue("tradingEnabled", v, { shouldDirty: true })}
                />
                <Label htmlFor="trading-enabled" className="cursor-pointer">
                  {tradingEnabled ? "Đang mở" : "Đang đóng"}
                </Label>
              </div>
            </FieldRow>

            <FieldRow label="Vốn ban đầu (VND)" hint="Vốn khởi điểm khi tài khoản được kích hoạt">
              <Input
                type="number"
                {...register("initialCashVnd", { required: true, min: 1 })}
                placeholder="1000000000"
              />
              {errors.initialCashVnd && (
                <p className="text-xs text-destructive mt-1">Vốn phải lớn hơn 0</p>
              )}
            </FieldRow>

            <FieldRow label="Phí mua (bps)" hint="1 bps = 0.01%">
              <Input
                type="number"
                {...register("buyFeeRateBps", { required: true, min: 0, max: 1000 })}
                placeholder="15"
              />
            </FieldRow>

            <FieldRow label="Phí bán (bps)" hint="1 bps = 0.01%">
              <Input
                type="number"
                {...register("sellFeeRateBps", { required: true, min: 0, max: 1000 })}
                placeholder="15"
              />
            </FieldRow>

            <FieldRow label="Thuế bán (bps)" hint="1 bps = 0.01%">
              <Input
                type="number"
                {...register("sellTaxRateBps", { required: true, min: 0, max: 1000 })}
                placeholder="10"
              />
            </FieldRow>

            <FieldRow label="Lot size tối thiểu" hint="Đơn vị giao dịch tối thiểu (cổ phiếu)">
              <Input
                type="number"
                {...register("boardLotSize", { required: true, min: 1 })}
                placeholder="100"
              />
            </FieldRow>

            <FieldRow label="Chế độ thanh toán" hint="T0 = ngay lập tức, T2 = sau 2 ngày giao dịch">
              <Select
                value={settlementMode ?? config.settlementMode}
                onValueChange={(v) => setValue("settlementMode", v ?? "T0", { shouldDirty: true })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Chọn chế độ" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="T0">T0 — Thanh toán ngay</SelectItem>
                  <SelectItem value="T2">T2 — Thanh toán sau 2 ngày</SelectItem>
                </SelectContent>
              </Select>
            </FieldRow>
          </CardContent>
        </Card>

        <div className="flex justify-end gap-3 pt-4">
          <Button
            type="button"
            variant="outline"
            onClick={() => { void loadConfig() }}
            disabled={saving}
          >
            Hủy thay đổi
          </Button>
          <Button type="submit" disabled={!isDirty || saving}>
            {saving ? "Đang lưu..." : "Lưu cấu hình"}
          </Button>
        </div>
      </form>
    </div>
  )
}
