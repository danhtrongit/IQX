import { useContext } from "react"
import { JourneyContext } from "./journey-state"

export function useJourney() {
  const context = useContext(JourneyContext)
  if (!context) throw new Error("useJourney must be used within JourneyProvider")
  return context
}
