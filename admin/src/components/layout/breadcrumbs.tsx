import { useLocation, Link } from "react-router"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"

const routeLabels: Record<string, string> = {
  "": "Tổng quan",
  users: "Người dùng",
  plans: "Gói Premium",
  subscriptions: "Thuê bao",
  payments: "Thanh toán",
  ipn: "IPN Logs",
  vt: "Giao dịch ảo",
  accounts: "Tài khoản",
  config: "Cấu hình",
  audit: "Audit Log",
  system: "System",
}

export function Breadcrumbs() {
  const location = useLocation()
  const segments = location.pathname.split("/").filter(Boolean)

  if (segments.length === 0) {
    return (
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbPage>Tổng quan</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
    )
  }

  return (
    <Breadcrumb>
      <BreadcrumbList>
        <BreadcrumbItem>
          <BreadcrumbLink render={<Link to="/" />}>Tổng quan</BreadcrumbLink>
        </BreadcrumbItem>
        {segments.map((segment, index) => {
          const isLast = index === segments.length - 1
          const path = "/" + segments.slice(0, index + 1).join("/")
          const label = routeLabels[segment] ?? segment

          return (
            <div key={path} className="flex items-center gap-1.5">
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                {isLast ? (
                  <BreadcrumbPage>{label}</BreadcrumbPage>
                ) : (
                  <BreadcrumbLink render={<Link to={path} />}>{label}</BreadcrumbLink>
                )}
              </BreadcrumbItem>
            </div>
          )
        })}
      </BreadcrumbList>
    </Breadcrumb>
  )
}
