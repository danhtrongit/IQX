import { act, render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import type { MascotId, MascotState } from "../journey/types"
import { MascotStage } from "./mascot-stage"

type StageProps = {
  mascotId: MascotId
  state: MascotState
  animationToken: string
  paused: boolean
  reducedMotion: boolean
  onComplete?: (token: string) => void
  onTap?: () => boolean | void
}

const mocks = vi.hoisted(() => ({ props: null as unknown, visible: true, reduced: false }))

vi.mock("../journey/mascot-2d/Mascot2DStage", () => ({
  Mascot2DStage: (props: StageProps) => {
    mocks.props = props
    return <div data-testid="mascot-2d" data-mascot={props.mascotId} data-state={props.state} />
  },
}))
vi.mock("../journey/visibility", () => ({
  useStageVisibility: () => mocks.visible,
  useReducedMotion: () => mocks.reduced,
}))

const stage = () => mocks.props as StageProps

beforeEach(() => {
  mocks.props = null
  mocks.visible = true
  mocks.reduced = false
})

describe("MascotStage", () => {
  it.each([
    ["bach_ho", "Bạch Hổ"],
    ["thanh_long", "Thanh Long"],
    ["loc_huou", "Lộc Hươu"],
    ["phung_hoang", "Phụng Hoàng"],
    ["kim_quy", "Kim Quy"],
  ] as const)("draws %s with the existing renderer, in its idle state and never as an egg", (id, name) => {
    render(<MascotStage mascotId={id} />)
    expect(screen.getByRole("heading", { level: 2, name })).toBeTruthy()
    expect(screen.getByTestId("mascot-2d").getAttribute("data-mascot")).toBe(id)
    expect(stage()).toMatchObject({ mascotId: id, state: "idle", animationToken: "", paused: false, reducedMotion: false })
    expect(screen.queryByLabelText(/Trứng/)).toBeNull()
  })

  it("pauses while the stage is hidden and honours reduced motion", () => {
    mocks.visible = false
    mocks.reduced = true
    render(<MascotStage mascotId="bach_ho" />)
    expect(stage()).toMatchObject({ paused: true, reducedMotion: true })
  })

  it("plays a tap reaction once and returns to idle without saving any milestone", () => {
    render(<MascotStage mascotId="bach_ho" />)
    let accepted: boolean | void = undefined
    act(() => { accepted = stage().onTap?.() })
    expect(accepted).toBe(true)
    expect(stage().state).toBe("tap_reaction")
    expect(stage().animationToken).toMatch(/^tap:/)
    // a second tap during the reaction is ignored
    act(() => { accepted = stage().onTap?.() })
    expect(accepted).toBe(false)
    act(() => stage().onComplete?.(stage().animationToken))
    expect(stage()).toMatchObject({ state: "idle", animationToken: "" })
  })
})
