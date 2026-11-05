// Mốc so sánh của TradingView trên trang công khai. Chạy: node spike/iqline/tv-baseline.mjs [url]
import { mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { chromium } from "@playwright/test"

const here = fileURLToPath(new URL(".", import.meta.url))
const url = process.argv[2] ?? "https://iqx.vn/bieu-do?symbol=VCB"
mkdirSync(join(here, "results"), { recursive: true })
const browser = await chromium.launch({ channel: "chrome", headless: false })
const out = { url, version: browser.version(), date: new Date().toISOString(), loads: [] }

const classify = (u) => (u.includes("/charting_library/") ? "charting_library" : u.includes("/api/") ? "api" : /\.(woff2?|ttf)/.test(u) ? "fonts" : "app")

async function chartFrame(page) {
  // Biểu đồ nằm trong iframe của thư viện; đã vẽ khi có canvas đủ lớn và lớp "Đang tải" biến mất.
  for (;;) {
    for (const frame of page.frames()) {
      if (frame === page.mainFrame()) continue
      const ready = await frame.evaluate(() => [...document.querySelectorAll("canvas")].some((c) => c.width > 300 && c.height > 200)).catch(() => false)
      if (ready) return frame
    }
    await page.waitForTimeout(50)
  }
}

for (let run = 0; run < 3; run++) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 })
  const page = await context.newPage()
  const cdp = await context.newCDPSession(page)
  await cdp.send("Network.enable")
  await cdp.send("Network.setCacheDisabled", { cacheDisabled: true })
  const urls = new Map()
  const totals = {}
  const counts = {}
  cdp.on("Network.responseReceived", (event) => urls.set(event.requestId, event.response.url))
  cdp.on("Network.loadingFinished", (event) => {
    const key = classify(urls.get(event.requestId) ?? "")
    totals[key] = (totals[key] ?? 0) + event.encodedDataLength
    counts[key] = (counts[key] ?? 0) + 1
  })
  const start = Date.now()
  await page.goto(url, { waitUntil: "commit" })
  await chartFrame(page)
  await page.getByText("Đang tải biểu đồ").waitFor({ state: "hidden", timeout: 60000 }).catch(() => {})
  const chartMs = Date.now() - start
  await page.waitForTimeout(3000)
  out.loads.push({ chartMs, kb: Object.fromEntries(Object.entries(totals).map(([k, v]) => [k, Math.round(v / 1024)])), requests: counts, finalUrl: page.url() })
  console.log("load", JSON.stringify(out.loads.at(-1)))
  if (run === 0) await page.screenshot({ path: join(here, "results", "tv-baseline.png") })
  if (run === 2) {
    const frame = await chartFrame(page)
    const box = await (await frame.frameElement()).boundingBox()
    const cx = box.x + box.width * 0.5
    const cy = box.y + box.height * 0.4
    const sample = async (label, action) => {
      await frame.evaluate(() => {
        const state = (window.__cadence = { deltas: [], stop: false })
        let previous = 0
        const tick = (now) => {
          if (previous) state.deltas.push(now - previous)
          previous = now
          if (!state.stop) requestAnimationFrame(tick)
        }
        requestAnimationFrame(tick)
      })
      await action()
      const deltas = await frame.evaluate(() => {
        window.__cadence.stop = true
        return window.__cadence.deltas
      })
      const sorted = [...deltas].sort((a, b) => a - b)
      const at = (q) => sorted[Math.floor(q * sorted.length)]
      out[label] = { p50: at(0.5), p95: at(0.95), max: sorted.at(-1), over20: deltas.filter((d) => d > 20).length, n: deltas.length }
      console.log(label, JSON.stringify(out[label]))
    }
    const drag = async () => {
      await page.mouse.move(cx, cy)
      await page.mouse.down()
      for (let i = 0; i < 240; i++) {
        await page.mouse.move(cx + 300 * Math.sin((i / 240) * Math.PI * 2), cy)
        await page.waitForTimeout(8)
      }
      await page.mouse.up()
    }
    await sample("panDefault", drag)
    await page.mouse.move(cx, cy)
    for (let i = 0; i < 40; i++) {
      await page.mouse.wheel(0, 240)
      await page.waitForTimeout(40)
    }
    await page.waitForTimeout(2000)
    await page.screenshot({ path: join(here, "results", "tv-zoomed-out.png") })
    await sample("panZoomedOut", drag)
  }
  await context.close()
}
writeFileSync(join(here, "results", "tv-baseline.json"), JSON.stringify(out, null, 2))
await browser.close()
