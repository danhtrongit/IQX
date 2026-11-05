// Nghe kênh realtime trong giờ giao dịch: node spike/iqline/ws-probe.mjs <file ra> [số giây]
import { writeFileSync } from "node:fs"
const out = process.argv[2], secs = Number(process.argv[3] || 150)
const ws = new WebSocket("wss://iqx.vn/api/v2/market-data/ws")
const frames = []
const t0 = Date.now()
ws.onopen = () => {
  console.log("open")
  ws.send(JSON.stringify({ action: "subscribe", symbols: ["VCB", "FPT", "VNINDEX", "VN30"], channels: ["ohlc", "tick"] }))
  ws.send(JSON.stringify({ action: "subscribe", symbols: ["VNINDEX"], channels: ["index"] }))
}
ws.onmessage = (e) => frames.push({ t: Date.now() - t0, raw: String(e.data).slice(0, 600) })
ws.onerror = (e) => console.log("error", e.message)
ws.onclose = (e) => console.log("close", e.code, e.reason)
setInterval(() => ws.readyState === 1 && ws.send(JSON.stringify({ action: "ping" })), 20000)
setTimeout(() => { writeFileSync(out, JSON.stringify(frames)); console.log("frames", frames.length); process.exit(0) }, secs * 1000)
