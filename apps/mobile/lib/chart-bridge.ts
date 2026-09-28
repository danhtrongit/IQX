export type ChartBridgeMessage =
  | { type: 'ready' }
  | { type: 'crosshair'; time: number; price: number }
  | { type: 'drawing'; id: string; kind: string; points: Array<{ time: number; price: number }> }
  | { type: 'error'; code: string };

const allowedTypes = new Set(['ready', 'crosshair', 'drawing', 'error']);

/** Validate chart WebView messages before they reach native state. */
export function parseChartBridgeMessage(input: unknown): ChartBridgeMessage | null {
  if (!input || typeof input !== 'object') return null;
  const value = input as Record<string, unknown>;
  if (typeof value.type !== 'string' || !allowedTypes.has(value.type)) return null;
  if (value.type === 'ready') return { type: 'ready' };
  if (value.type === 'error' && typeof value.code === 'string' && value.code.length <= 100)
    return { type: 'error', code: value.code };
  if (value.type === 'crosshair' && Number.isFinite(value.time) && Number.isFinite(value.price))
    return { type: 'crosshair', time: Number(value.time), price: Number(value.price) };
  if (value.type === 'drawing' && typeof value.id === 'string' && typeof value.kind === 'string' && Array.isArray(value.points)) {
    const points = value.points.filter((point): point is { time: number; price: number } => {
      if (!point || typeof point !== 'object') return false;
      const item = point as Record<string, unknown>;
      return Number.isFinite(item.time) && Number.isFinite(item.price);
    }).slice(0, 500).map((point) => ({ time: Number(point.time), price: Number(point.price) }));
    return points.length ? { type: 'drawing', id: value.id.slice(0, 100), kind: value.kind.slice(0, 50), points } : null;
  }
  return null;
}
