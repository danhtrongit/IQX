import type { MascotId } from "../types"
import { BachHoArtwork } from "./BachHoArtwork"
import { ThanhLongArtwork } from "./ThanhLongArtwork"
import { LocHuouArtwork } from "./LocHuouArtwork"
import { PhungHoangArtwork } from "./PhungHoangArtwork"
import { KimQuyArtwork } from "./KimQuyArtwork"

const CREATURES = {
  bach_ho: BachHoArtwork,
  thanh_long: ThanhLongArtwork,
  loc_huou: LocHuouArtwork,
  phung_hoang: PhungHoangArtwork,
  kim_quy: KimQuyArtwork,
}

export function CreatureArtwork({ mascotId, idPrefix }: { mascotId: MascotId; idPrefix: string }) {
  const Artwork = CREATURES[mascotId]
  return <g data-artwork="creature-rig" data-mascot-id={mascotId}><Artwork idPrefix={idPrefix} /></g>
}
