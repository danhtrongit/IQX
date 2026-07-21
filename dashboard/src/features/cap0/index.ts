import "./cap0.css"

export { Badge, badge, LEVELS } from "./Badge"
export { ModeBadge } from "./ModeBadge"
export { PlacementModal } from "./PlacementModal"
export { JourneyPanel } from "./JourneyPanel"
export { JourneyBar } from "./JourneyBar"
export { Gbar } from "./Gbar"
export { PlanBlock, type PlanBlockProps } from "./PlanBlock"
export { cap0Visibility, type Cap0Visibility } from "./cap0Visibility"
export { coachTemplate, type CoachSituation } from "./coachTemplate"
export { DebriefModal, type DebriefData, type DebriefModalProps } from "./DebriefModal"
export { GraduationModal, isGraduationReady } from "./GraduationModal"
export {
  gbarReducer,
  gbarStep,
  gbarStepMessage,
  gbarText,
  gbarVisible,
  initialGbarState,
  GBAR_TAG,
  type GbarAction,
  type GbarState,
  type GbarStep,
  type GbarTone,
} from "./gbarMachine"
export { Cap0TradingPage } from "./Cap0TradingPage"
export {
  Cap0Provider,
  useCap0Events,
  type Cap0EventBus,
  type Cap0EventHandlers,
  type Cap0OrderEvent,
} from "./Cap0Context"
export {
  useCap0Progress,
  useEnterCap0,
  usePlacement,
  useCompleteTask,
  useGraduate,
} from "./hooks"
export { cap0Api } from "./api"
export { cap0Keys } from "./keys"
export {
  countTasksDone,
  tradingModeFor,
  type BadgeOptions,
  type Cap0Gate,
  type Cap0Level,
  type Cap0Progress,
  type PlacementResult,
  type TradingMode,
} from "./types"
