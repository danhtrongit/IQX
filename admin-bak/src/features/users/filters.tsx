import { Download } from "lucide-react"
import type { DateRange } from "react-day-picker"
import { Button } from "@/components/ui/button"
import { SearchInput } from "@/components/filters/search-input"
import { StatusMultiSelect } from "@/components/filters/status-multi-select"
import { DateRangePicker } from "@/components/filters/date-range-picker"

const ROLE_OPTIONS = [
  { value: "user", label: "User" },
  { value: "premium", label: "Premium" },
  { value: "admin", label: "Admin" },
]

const STATUS_OPTIONS = [
  { value: "active", label: "Đang hoạt động" },
  { value: "inactive", label: "Không hoạt động" },
  { value: "suspended", label: "Bị đình chỉ" },
  { value: "deleted", label: "Đã xoá" },
]

interface UsersFiltersProps {
  search: string
  onSearchChange: (v: string) => void
  roles: string[]
  onRolesChange: (v: string[]) => void
  statuses: string[]
  onStatusesChange: (v: string[]) => void
  loginRange: DateRange | undefined
  onLoginRangeChange: (v: DateRange | undefined) => void
  onExportCsv: () => void
  exporting?: boolean
}

export function UsersFilters({
  search,
  onSearchChange,
  roles,
  onRolesChange,
  statuses,
  onStatusesChange,
  loginRange,
  onLoginRangeChange,
  onExportCsv,
  exporting = false,
}: UsersFiltersProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <SearchInput
        value={search}
        onChange={onSearchChange}
        placeholder="Tìm email, tên..."
        className="w-64"
      />
      <StatusMultiSelect
        options={ROLE_OPTIONS}
        value={roles}
        onChange={onRolesChange}
        placeholder="Vai trò"
      />
      <StatusMultiSelect
        options={STATUS_OPTIONS}
        value={statuses}
        onChange={onStatusesChange}
        placeholder="Trạng thái"
      />
      <DateRangePicker
        value={loginRange}
        onChange={onLoginRangeChange}
        placeholder="Đăng nhập lần cuối"
      />
      <div className="ml-auto">
        <Button
          variant="outline"
          size="sm"
          onClick={onExportCsv}
          disabled={exporting}
          className="gap-1.5"
        >
          <Download className="size-3.5" />
          {exporting ? "Đang xuất..." : "Xuất CSV"}
        </Button>
      </div>
    </div>
  )
}
