#!/usr/bin/env node
/**
 * Measures runtime GPU/CPU/RAM metrics for Khu Giao Dịch (/khu-giao-dich)
 * and Khu Văn phòng (/van-phong) against an already-running dev server.
 *
 * Usage:
 *   node scripts/perf-spaces.mjs http://127.0.0.1:5174
 *   IQX_ACCESS_TOKEN=... IQX_REFRESH_TOKEN=... node scripts/perf-spaces.mjs http://127.0.0.1:5174
 *
 * Options:
 *   --only=floor|office   Run only one space
 *   --seconds=10          Duration per phase (idle / walking), default 10
 */
import process from "node:process"
import { chromium } from "playwright"

function parseArgs(argv) {
  let baseUrl = ""
  let only = "all"
  let seconds = 10
  for (const arg of argv) {
    if (arg.startsWith("--only=")) {
      only = arg.slice("--only=".length)
    } else if (arg.startsWith("--seconds=")) {
      const parsed = Number(arg.slice("--seconds=".length))
      if (Number.isFinite(parsed) && parsed > 0) seconds = parsed
    } else if (arg.startsWith("--url=")) {
      baseUrl = arg.slice("--url=".length)
    } else if (!arg.startsWith("-") && !baseUrl) {
      baseUrl = arg
    }
  }
  if (!baseUrl) {
    console.error(
      "Usage: node scripts/perf-spaces.mjs <dev-url> [--only=floor|office] [--seconds=10]"
    )
    process.exit(1)
  }
  return {
    baseUrl: baseUrl.replace(/\/+$/, ""),
    only,
    seconds,
  }
}

function metricMap(metrics) {
  const map = new Map()
  for (const m of metrics) {
    map.set(m.name, m.value)
  }
  return map
}

async function readSpaceStats(page) {
  return page.evaluate(() => {
    const hook = window.__iqxSpaceStats
    const stats =
      hook && typeof hook.getStats === "function" ? hook.getStats() : null
    const mem = performance.memory
    return {
      stats,
      usedJSHeapSize: mem ? mem.usedJSHeapSize : null,
      totalJSHeapSize: mem ? mem.totalJSHeapSize : null,
    }
  })
}

async function measurePhase(page, cdp, label, durationSec, holdKeyD) {
  await page.evaluate(() => {
    window.__perfRafFrames = 0
    window.__perfRafRunning = true
    const step = () => {
      if (!window.__perfRafRunning) return
      window.__perfRafFrames += 1
      requestAnimationFrame(step)
    }
    requestAnimationFrame(step)
  })

  const beforeCdp = metricMap((await cdp.send("Performance.getMetrics")).metrics)
  const beforeSnap = await readSpaceStats(page)
  const startWall = performance.now()

  if (holdKeyD) {
    await page.keyboard.down("KeyD")
  }
  await page.waitForTimeout(Math.round(durationSec * 1000))
  if (holdKeyD) {
    await page.keyboard.up("KeyD")
  }

  const wallSec = (performance.now() - startWall) / 1000
  const afterSnap = await readSpaceStats(page)
  const afterCdp = metricMap((await cdp.send("Performance.getMetrics")).metrics)
  const rafFrames = await page.evaluate(() => {
    window.__perfRafRunning = false
    return window.__perfRafFrames ?? 0
  })

  const taskDelta =
    (afterCdp.get("TaskDuration") ?? 0) - (beforeCdp.get("TaskDuration") ?? 0)
  const scriptDelta =
    (afterCdp.get("ScriptDuration") ?? 0) -
    (beforeCdp.get("ScriptDuration") ?? 0)
  const heapBytes =
    afterSnap.usedJSHeapSize ?? afterCdp.get("JSHeapUsedSize") ?? 0

  const renderedBefore = beforeSnap.stats?.host?.renderedFrames ?? 0
  const renderedAfter = afterSnap.stats?.host?.renderedFrames ?? 0
  const skippedBefore = beforeSnap.stats?.host?.skippedFrames ?? 0
  const skippedAfter = afterSnap.stats?.host?.skippedFrames ?? 0
  const shadowBefore = beforeSnap.stats?.host?.shadowUpdates ?? 0
  const shadowAfter = afterSnap.stats?.host?.shadowUpdates ?? 0

  const renderedDelta = Math.max(0, renderedAfter - renderedBefore)
  const skippedDelta = Math.max(0, skippedAfter - skippedBefore)
  const shadowDelta = Math.max(0, shadowAfter - shadowBefore)

  return {
    phase: label,
    wallSec: Number(wallSec.toFixed(2)),
    rafFps: Number((rafFrames / wallSec).toFixed(1)),
    renderFps: Number((renderedDelta / wallSec).toFixed(1)),
    renderedFrames: renderedDelta,
    skippedFrames: skippedDelta,
    shadowUpdates: shadowDelta,
    usedJSHeapMB: Number((heapBytes / (1024 * 1024)).toFixed(2)),
    usedJSHeapBytes: Math.round(heapBytes),
    taskDurationSec: Number(taskDelta.toFixed(4)),
    scriptDurationSec: Number(scriptDelta.toFixed(4)),
    mainThreadCpuPct: Number(((taskDelta / wallSec) * 100).toFixed(2)),
    scriptCpuPct: Number(((scriptDelta / wallSec) * 100).toFixed(2)),
    rendererInfo: afterSnap.stats
      ? {
          memory: afterSnap.stats.memory,
          render: afterSnap.stats.render,
          host: {
            lite: afterSnap.stats.host.lite,
            pacingMode: afterSnap.stats.host.pacingMode,
            targetFps: afterSnap.stats.host.targetFps,
            dpr: afterSnap.stats.host.dpr,
            baseDpr: afterSnap.stats.host.baseDpr,
            shadowAutoUpdate: afterSnap.stats.host.shadowAutoUpdate,
            avgFrameMs: afterSnap.stats.host.avgFrameMs,
          },
        }
      : null,
  }
}

async function runTradingFloor(browser, baseUrl, seconds) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  })
  const page = await context.newPage()
  const cdp = await context.newCDPSession(page)
  await cdp.send("Performance.enable")

  try {
    await page.goto(`${baseUrl}/khu-giao-dich`, {
      waitUntil: "domcontentloaded",
      timeout: 30_000,
    })

    // Guest join flow: fill name, pick first character, submit
    const joinForm = page.locator("form.join")
    await joinForm.waitFor({ state: "visible", timeout: 25_000 })
    await joinForm.locator('input[autocomplete="nickname"], input:not([type="radio"])').first().fill("PerfGuest")
    const firstAvatar = joinForm.locator("label.avatar-card").first()
    if ((await firstAvatar.count()) > 0) {
      await firstAvatar.click()
    }
    await joinForm.locator('button[type="submit"]').click()
    await page.locator(".join-backdrop").waitFor({ state: "hidden", timeout: 25_000 })

    // Wait for live 3D host to resume and render frames
    await page.waitForFunction(
      () => {
        const s = window.__iqxSpaceStats?.getStats?.()
        return Boolean(s && !s.host.paused && !s.host.suspended && s.host.renderedFrames > 2)
      },
      { timeout: 25_000 }
    )

    // Brief settle so adaptive pacer transitions cleanly into idle before idle sampling
    await page.waitForTimeout(2200)

    const idle = await measurePhase(page, cdp, "idle", seconds, false)
    const walking = await measurePhase(page, cdp, "walking", seconds, true)
    return { status: "ok", url: `${baseUrl}/khu-giao-dich`, idle, walking }
  } finally {
    await context.close()
  }
}

async function runOffice(browser, baseUrl, seconds) {
  const accessToken = process.env.IQX_ACCESS_TOKEN ?? ""
  const refreshToken = process.env.IQX_REFRESH_TOKEN ?? ""
  if (!accessToken || !refreshToken) {
    return {
      status: "skipped",
      reason:
        "Missing IQX_ACCESS_TOKEN and/or IQX_REFRESH_TOKEN environment variables",
    }
  }

  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  })
  await context.addInitScript(
    ({ access, refresh }) => {
      window.localStorage.setItem("iqx.v2.access_token", access)
      window.localStorage.setItem("iqx.v2.refresh_token", refresh)
      window.localStorage.setItem("iqx.v2.remember", "true")
    },
    { access: accessToken, refresh: refreshToken }
  )

  const page = await context.newPage()
  const cdp = await context.newCDPSession(page)
  await cdp.send("Performance.enable")

  try {
    await page.goto(`${baseUrl}/van-phong`, {
      waitUntil: "domcontentloaded",
      timeout: 30_000,
    })

    await page.waitForFunction(
      () => {
        const s = window.__iqxSpaceStats?.getStats?.()
        return Boolean(s && !s.host.paused && !s.host.suspended && s.host.renderedFrames > 2)
      },
      { timeout: 30_000 }
    )

    // Brief settle so adaptive pacer transitions cleanly into idle before idle sampling
    await page.waitForTimeout(2200)

    const idle = await measurePhase(page, cdp, "idle", seconds, false)
    const walking = await measurePhase(page, cdp, "walking", seconds, true)
    return { status: "ok", url: `${baseUrl}/van-phong`, idle, walking }
  } finally {
    await context.close()
  }
}

async function main() {
  const { baseUrl, only, seconds } = parseArgs(process.argv.slice(2))
  const browser = await chromium.launch({
    headless: true,
    args: [
      "--use-gl=angle",
      "--enable-unsafe-swiftshader",
      "--enable-precise-memory-info",
    ],
  })

  try {
    const report = {
      measuredAt: new Date().toISOString(),
      baseUrl,
      viewport: "1440x900",
      phaseSeconds: seconds,
    }
    if (only === "all" || only === "floor") {
      report.floor = await runTradingFloor(browser, baseUrl, seconds)
    }
    if (only === "all" || only === "office") {
      report.office = await runOffice(browser, baseUrl, seconds)
    }
    console.log(JSON.stringify(report, null, 2))
  } finally {
    await browser.close()
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
