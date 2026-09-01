export interface BoardLotPartialBounds {
  min: number
  max: number
  value: number
  available: boolean
}

export function boardLotPartialBounds(
  quantitySellable: number,
  boardLotSize: number,
  selected?: number,
): BoardLotPartialBounds {
  const maxLot = Math.floor(quantitySellable / boardLotSize) * boardLotSize
  const max = maxLot >= quantitySellable ? maxLot - boardLotSize : maxLot
  const available = max >= boardLotSize
  return {
    min: boardLotSize,
    max,
    value: Math.min(Math.max(selected ?? boardLotSize, boardLotSize), max),
    available,
  }
}
