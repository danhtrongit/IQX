import { render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { AdminScopeRoute } from "./admin-scope-route"

const auth = vi.hoisted(() => ({ role: "admin" as string | undefined }))
vi.mock("@/hooks/use-auth", () => ({ useAuth: () => ({ user: auth.role ? { id: "u-1", role: auth.role } : null }) }))

const AdminPage = () => <p>Bản quản trị viên</p>
const TeamPage = () => <p>Bản trưởng nhóm</p>

beforeEach(() => {
  auth.role = "admin"
})

describe("AdminScopeRoute", () => {
  it("renders the admin page for admins", () => {
    render(<AdminScopeRoute admin={AdminPage} team={TeamPage} />)
    expect(screen.getByText("Bản quản trị viên")).toBeTruthy()
    expect(screen.queryByText("Bản trưởng nhóm")).toBeNull()
  })

  it("renders the team page for team leads, never the admin page", () => {
    auth.role = "team_lead"
    render(<AdminScopeRoute admin={AdminPage} team={TeamPage} />)
    expect(screen.getByText("Bản trưởng nhóm")).toBeTruthy()
    expect(screen.queryByText("Bản quản trị viên")).toBeNull()
  })

  it.each(["premium", "user", undefined])("renders nothing for %s", (role) => {
    auth.role = role
    const { container } = render(<AdminScopeRoute admin={AdminPage} team={TeamPage} />)
    expect(container.textContent).toBe("")
  })
})
