// Đo bản thử. Chạy: node spike/iqline/run-bench.mjs [chromium|firefox|webkit|chrome-headed]
import { createReadStream, existsSync, mkdirSync, statSync, writeFileSync } from "node:fs"
import { createServer } from "node:http"
import { extname, join, normalize } from "node:path"
import { fileURLToPath } from "node:url"
import { chromium, firefox, webkit } from "@playwright/test"

const here = fileURLToPath(new URL(".", import.meta.url))
const target = process.argv[2] ?? "chromium"
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".woff2": "font/woff2", ".woff": "font/woff" }
const server = createServer((request, response) => {
  const path = normalize(decodeURIComponent(new URL(request.url, "http://x").pathname)).replace(/^\/+/, "") || "index.html"
  const file = path.startsWith("data/") ? join(here, path) : join(here, "dist", path)
  if (!existsSync(file) || !statSync(file).isFile()) return response.writeHead(404).end()
  response.writeHead(200, { "content-type": types[extname(file)] ?? "application/octet-stream" })
  createReadStream(file).pipe(response)
}).listen(0, "127.0.0.1")
await new Promise((resolve) => server.once("listening", resolve))
const url = `http://127.0.0.1:${server.address().port}/index.html`
mkdirSync(join(here, "results"), { recursive: true })

const launchers = { chromium: () => chromium.launch(), firefox: () => firefox.launch(), webkit: () => webkit.launch(), "chrome-headed": () => chromium.launch({ channel: "chrome", headless: false }) }
const browser = await launchers[target]()
const isChromium = target === "chromium" || target === "chrome-headed"
const results = { target, version: browser.version(), date: new Date().toISOString(), runs: {} }
const shot = (name) => join(here, "results", `${target}-${name}.png`)

const DAILY = { names: ["VCB-5m"], limit: 5000 }
const LONG = { names: ["HPG-1m", "FPT-1m", "VCB-1m"], limit: 50000 }
const REAL_1M = { names: ["VCB-1m"] }

async function session(options, run) {
  const context = await browser.newContext({ viewport: options.viewport, deviceScaleFactor: options.dpr, isMobile: target === "firefox" ? false : !!options.mobile, hasTouch: !!options.mobile })
  const page = await context.newPage()
  page.on("pageerror", (error) => console.log("pageerror", error.message))
  await page.goto(url)
  if (options.cpu && isChromium) {
    const cdp = await context.newCDPSession(page)
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: options.cpu })
  }
  await run(page)
  await context.close()
}
const call = (page, method, arg) => page.evaluate(([m, a]) => window.iqlineSpike[m](a), [method, arg])
const brief = (r) => `total p50 ${r.total.p50.toFixed(2)} p95 ${r.total.p95.toFixed(2)} max ${r.total.max.toFixed(1)} | scene ${r.scene.p50.toFixed(2)} paint ${r.paint.p50.toFixed(2)} flush ${r.flush.p50.toFixed(2)}`

const desktop = { viewport: { width: 1440, height: 900 }, dpr: 2 }
const mobile = { viewport: { width: 390, height: 844 }, dpr: 3, mobile: true, cpu: 4 }

const CASES = [
  { group: "desktop5k", env: desktop, data: DAILY, shots: ["desktop-dark"], visibles: [200, 1000, 5000] },
  { group: "desktop50k", env: desktop, data: LONG, shots: ["desktop-50k"], visibles: [500, 5000, 50000] },
  { group: "desktopVcb1m", env: desktop, data: REAL_1M, shots: [], visibles: [500, 35000] },
  { group: "mobile5k", env: mobile, data: { ...DAILY, mobile: true }, shots: ["mobile-dark"], visibles: [120, 500, 5000] },
]

for (const item of CASES) {
  await session(item.env, async (page) => {
    const run = (results.runs[item.group] = { load: await call(page, "load", { ...item.data, visible: item.visibles[0] }) })
    console.log(item.group, "load", JSON.stringify(run.load))
    for (const shotName of item.shots) await page.screenshot({ path: shot(shotName) })
    for (const visible of item.visibles) {
      const kind = visible === item.visibles.at(-1) ? "zoom" : "pan"
      const main = await call(page, "bench", { kind, visible })
      // getImageData có thể đẩy canvas của Chrome sang raster phần mềm, nên không đo chung với nhịp khung hình.
      const cadence = await call(page, "cadence", { visible })
      run[`v${visible}`] = { main, cadence }
      console.log(`${item.group} visible=${visible} ${kind}: main p50 ${main.total.p50.toFixed(2)} p95 ${main.total.p95.toFixed(2)} | raf p50 ${cadence.p50.toFixed(1)} p95 ${cadence.p95.toFixed(1)} over20 ${cadence.over20}/${cadence.n} work p95 ${cadence.mainThread.p95.toFixed(2)}`)
    }
    run.crosshair = await call(page, "bench", { kind: "crosshair", visible: item.visibles[0] })
    console.log(item.group, "crosshair", brief(run.crosshair))
    if (item.group === "desktop5k") {
      await page.evaluate(() => window.iqlineSpike.setTextMode("native"))
      run.nativeText = await call(page, "bench", { kind: "pan", visible: 200 })
      await page.evaluate(() => window.iqlineSpike.setTextMode("tabular"))
      run.tabularText = await call(page, "bench", { kind: "pan", visible: 200 })
      console.log("text native", brief(run.nativeText), "// tabular", brief(run.tabularText))
      await page.evaluate(() => window.iqlineSpike.setTheme("light"))
      await page.waitForTimeout(100)
      await page.screenshot({ path: shot("desktop-light") })
      results.tabular = await call(page, "tabularProbe")
      console.log("tabular", JSON.stringify(results.tabular))
    }
  })
}

writeFileSync(join(here, "results", `${target}.json`), JSON.stringify(results, null, 2))
await browser.close()
server.close()
