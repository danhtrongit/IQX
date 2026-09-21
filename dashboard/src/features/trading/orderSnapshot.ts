/**
 * Percentage of the user's original demo capital represented by the order
 * accepted by the trading engine.
 *
 * The Cấp 3 form shows a suggestion first, but the user may edit quantity and
 * a market order may fill at a different price. Kết sổ and later discipline
 * analysis therefore use the accepted quantity and returned price, never the
 * stale suggestion.
 */
export function actualCapitalPct(
  quantity: number,
  acceptedPrice: number,
  initialCapital: number | null | undefined,
): number | null {
  if (
    !Number.isFinite(quantity) ||
    quantity <= 0 ||
    !Number.isFinite(acceptedPrice) ||
    acceptedPrice <= 0 ||
    initialCapital == null ||
    !Number.isFinite(initialCapital) ||
    initialCapital <= 0
  ) {
    return null
  }

  return ((quantity * acceptedPrice) / initialCapital) * 100
}
