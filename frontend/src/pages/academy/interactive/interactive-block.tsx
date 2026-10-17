import type { ReactNode } from "react"

import type { InteractiveBlock } from "../content-types"
import { ChecklistBlock } from "./checklist-block"
import { ClientCaseBlock } from "./client-case-block"
import { IncomeCalculator } from "./income-calculator"
import { RoleplayScore } from "./roleplay-score"
import { ScenarioBlock } from "./scenario-block"
import { WorkpadBlock } from "./workpad-block"

/**
 * The `renderInteractive` the reader hands to `BlockRenderer`: one component per interactive block
 * type of chapters 2-3 and the practice room. They read the lesson and its notes from
 * `LessonInteractiveProvider`.
 */
export function renderInteractiveBlock(block: InteractiveBlock, key: string): ReactNode {
  switch (block.type) {
    case "scenario":
      return <ScenarioBlock key={key} block={block} />
    case "checklist":
      return <ChecklistBlock key={key} block={block} />
    case "workpad":
      return <WorkpadBlock key={key} block={block} />
    case "income_calculator":
      return <IncomeCalculator key={key} block={block} />
    case "practice_case":
      return <ClientCaseBlock key={key} block={block} />
    case "roleplay_score":
      return <RoleplayScore key={key} block={block} />
  }
}
