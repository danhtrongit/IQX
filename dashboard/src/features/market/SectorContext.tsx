import { createContext } from "react";

export interface SectorContextValue {
  selectedSectorCode: string | null;
  setSelectedSectorCode: (code: string | null) => void;
}

export const SectorContext = createContext<SectorContextValue>({
  selectedSectorCode: null,
  setSelectedSectorCode: () => {},
});
