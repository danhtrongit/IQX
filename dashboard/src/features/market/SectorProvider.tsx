import { useState, type ReactNode } from "react";
import { SectorContext } from "./SectorContext";

export function SectorProvider({ children }: { children: ReactNode }) {
  const [selectedSectorCode, setSelectedSectorCode] = useState<string | null>(null);
  return (
    <SectorContext.Provider value={{ selectedSectorCode, setSelectedSectorCode }}>
      {children}
    </SectorContext.Provider>
  );
}
