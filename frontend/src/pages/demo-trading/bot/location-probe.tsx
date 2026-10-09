import { useLocation } from "react-router"

/** Test aid: prints the router location so a test can read the URL a click navigated to. */
export function LocationProbe() {
  const location = useLocation()
  return <output data-testid="location">{location.pathname}{location.search}</output>
}
