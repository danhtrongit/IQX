import type { ReactNode } from "react"
import { useLocation } from "react-router"

import { WorkspaceFrameContext, type WorkspaceFrameState } from "@/components/layout/workspace-frame-context"
import { AcademyMain } from "./academy-main"
import { AcademyPanel } from "./academy-panel"

/** Shows the current URL path and search so a test can read where the tool navigated. */
export function Where() {
  const location = useLocation()
  return <output data-testid="where">{`${location.pathname}${location.search}`}</output>
}

/** The panel and the main area side by side, like the workspace frame places them. */
export function AcademyLayout({ panel, main, frame, children }: { panel: boolean; main: boolean; frame?: WorkspaceFrameState; children?: ReactNode }) {
  const body = (
    <>
      {panel && <aside aria-label="Học viện"><AcademyPanel /></aside>}
      {main && <main><AcademyMain mascotId="bach_ho" /></main>}
      {children}
      <Where />
    </>
  )
  return frame ? <WorkspaceFrameContext.Provider value={frame}>{body}</WorkspaceFrameContext.Provider> : body
}
