import { useContext } from "react";
import { SectorContext } from "./SectorContext";

export function useSelectedSector() {
  return useContext(SectorContext);
}
