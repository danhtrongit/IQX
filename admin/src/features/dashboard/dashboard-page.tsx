export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Tổng quan</h1>
        <p className="text-muted-foreground">Chào mừng đến với IQX Admin Dashboard</p>
      </div>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "Tổng người dùng", value: "—" },
          { label: "Premium đang hoạt động", value: "—" },
          { label: "Doanh thu tháng này", value: "—" },
          { label: "Thanh toán chờ xử lý", value: "—" },
        ].map((kpi) => (
          <div key={kpi.label} className="rounded-lg border border-border bg-card p-4">
            <p className="text-sm text-muted-foreground">{kpi.label}</p>
            <p className="mt-1 text-2xl font-bold">{kpi.value}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
