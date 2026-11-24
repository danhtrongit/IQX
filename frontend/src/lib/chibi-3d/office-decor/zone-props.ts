/**
 * Procedural Open-Floor Zone Props for Khu Văn phòng:
 * - Crisp KGD-style bordered zone rugs (oval & rounded-rectangle)
 * - Soft-border low wooden/stone planter boxes (replacing glass partitions in Phòng họp)
 * - Góc nghỉ props: Snack Shelf, Water Cooler, Chibi Foosball Table, Mini Arcade Cabinet, Standing Lamp
 * - Góc thành tích props: 3 Tiered Trophy Pedestals + Framed Certificate Display Easels
 * - Utility props: Tidy Printer Credenza & Freestanding Meeting Whiteboard Easel
 */
import * as THREE from "three"

import {
  OFFICE_DECOR_FONT_STACK,
  createDecorCanvasTexture,
  type OfficeDecorBatcher,
  type OfficeDecorPalette,
} from "./palette.ts"

/** Creates a crisp framed certificate canvas texture (256x192) for Góc thành tích. */
export function createCertificateTexture(
  headline: string,
  subline: string,
  accentHex = "#e9b949"
): THREE.Texture {
  return createDecorCanvasTexture(
    256,
    192,
    (ctx, w, h) => {
      ctx.fillStyle = "#fbf6ea"
      ctx.fillRect(0, 0, w, h)
      ctx.strokeStyle = accentHex
      ctx.lineWidth = 6
      ctx.strokeRect(10, 10, w - 20, h - 20)
      ctx.strokeStyle = "#1c315a"
      ctx.lineWidth = 2
      ctx.strokeRect(18, 18, w - 36, h - 36)

      // Gold wax seal emblem at top center
      ctx.fillStyle = accentHex
      ctx.beginPath()
      ctx.arc(w / 2, 48, 16, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = "#18274a"
      ctx.textAlign = "center"
      ctx.textBaseline = "middle"
      ctx.font = `900 13px ${OFFICE_DECOR_FONT_STACK}`
      ctx.fillText("IQX", w / 2, 49)

      ctx.fillStyle = "#16244a"
      ctx.font = `800 18px ${OFFICE_DECOR_FONT_STACK}`
      ctx.fillText(headline, w / 2, 92)

      ctx.fillStyle = "#6b4f26"
      ctx.font = `700 14px ${OFFICE_DECOR_FONT_STACK}`
      ctx.fillText(subline, w / 2, 120)

      // Decorative signature rules
      ctx.fillStyle = "rgba(24, 39, 74, 0.35)"
      ctx.fillRect(46, 148, 66, 2)
      ctx.fillRect(w - 112, 148, 66, 2)
    },
    4
  )
}

/** Creates a crisp Meeting Whiteboard Canvas texture (384x224). */
export function createMeetingWhiteboardTexture(): THREE.Texture {
  return createDecorCanvasTexture(
    384,
    224,
    (ctx, w, h) => {
      ctx.fillStyle = "#f7f9fc"
      ctx.fillRect(0, 0, w, h)
      ctx.strokeStyle = "rgba(148, 163, 184, 0.22)"
      ctx.lineWidth = 1
      for (let x = 24; x < w; x += 24) {
        ctx.beginPath()
        ctx.moveTo(x, 12)
        ctx.lineTo(x, h - 12)
        ctx.stroke()
      }
      for (let y = 24; y < h; y += 24) {
        ctx.beginPath()
        ctx.moveTo(12, y)
        ctx.lineTo(w - 12, y)
        ctx.stroke()
      }

      ctx.fillStyle = "#16244a"
      ctx.font = `800 18px ${OFFICE_DECOR_FONT_STACK}`
      ctx.fillText("KẾ HOẠCH TUẦN · KPI", 22, 34)

      ctx.strokeStyle = "#16a34a"
      ctx.lineWidth = 4
      ctx.lineCap = "round"
      ctx.lineJoin = "round"
      ctx.beginPath()
      ctx.moveTo(28, 175)
      ctx.lineTo(78, 152)
      ctx.lineTo(124, 160)
      ctx.lineTo(176, 118)
      ctx.lineTo(222, 126)
      ctx.lineTo(278, 76)
      ctx.lineTo(342, 60)
      ctx.stroke()

      const bars = [
        { x: 40, h: 42, c: "#3b82f6" },
        { x: 64, h: 60, c: "#3b82f6" },
        { x: 88, h: 52, c: "#e9b949" },
        { x: 112, h: 74, c: "#16a34a" },
      ]
      for (const b of bars) {
        ctx.fillStyle = b.c
        ctx.fillRect(b.x + 215, 196 - b.h, 16, b.h)
      }

      ctx.fillStyle = "#fde68a"
      ctx.fillRect(28, 56, 74, 48)
      ctx.fillStyle = "#bfdbfe"
      ctx.fillRect(114, 56, 74, 48)
      ctx.fillStyle = "#1e293b"
      ctx.fillRect(36, 70, 52, 5)
      ctx.fillRect(36, 82, 42, 5)
      ctx.fillRect(122, 70, 52, 5)
      ctx.fillRect(122, 82, 38, 5)
    },
    4
  )
}

/** Creates a cute retro-modern Arcade screen texture ("CHART RUSH", 128x128). */
export function createArcadeScreenTexture(): THREE.Texture {
  return createDecorCanvasTexture(
    128,
    128,
    (ctx, w, h) => {
      ctx.fillStyle = "#0a1124"
      ctx.fillRect(0, 0, w, h)
      ctx.strokeStyle = "#38bdf8"
      ctx.lineWidth = 3
      ctx.strokeRect(5, 5, w - 10, h - 10)
      ctx.fillStyle = "#f6d27a"
      ctx.textAlign = "center"
      ctx.textBaseline = "middle"
      ctx.font = `900 15px ${OFFICE_DECOR_FONT_STACK}`
      ctx.fillText("IQX RUSH", w / 2, 24)
      // Cute pixel-style candlesticks
      const bars = [
        [20, 74, 24, "#34d399"],
        [38, 60, 38, "#34d399"],
        [56, 68, 22, "#f87171"],
        [74, 48, 42, "#34d399"],
        [92, 36, 52, "#f6d27a"],
      ] as const
      for (const [bx, by, bh, col] of bars) {
        ctx.fillStyle = col
        ctx.fillRect(bx, by, 12, bh)
      }
      ctx.fillStyle = "#34d399"
      ctx.font = `800 11px ${OFFICE_DECOR_FONT_STACK}`
      ctx.fillText("HIGH SCORE 9900", w / 2, h - 16)
    },
    2
  )
}

/**
 * Adds a sleek KGD-style flat bordered zone rug (1 draw call via canvas texture, zero heavy bevel tris).
 */
export function mountBorderedZoneRug(
  parent: THREE.Object3D,
  opts: {
    wx: number
    wz: number
    widthU: number
    depthU: number
    shape: "oval" | "rounded"
    fillHex: string
    borderHex: string
    innerBorderHex?: string
    y?: number
    lite?: boolean
  }
): void {
  const { wx, wz, widthU, depthU, shape, fillHex, borderHex, innerBorderHex } = opts
  const y = opts.y ?? 0.011
  const texW = opts.lite ? 256 : 512
  const texH = Math.max(
    128,
    Math.min(512, Math.round((depthU / Math.max(0.5, widthU)) * texW))
  )

  const tex = createDecorCanvasTexture(
    texW,
    texH,
    (ctx, w, h) => {
      ctx.clearRect(0, 0, w, h)
      const pad = Math.max(4, Math.round(Math.min(w, h) * 0.03))
      const bw = Math.max(6, Math.round(Math.min(w, h) * 0.055))

      const traceShape = (inset: number): void => {
        const x = inset
        const ry = inset
        const rw = w - inset * 2
        const rh = h - inset * 2
        ctx.beginPath()
        if (shape === "oval") {
          ctx.ellipse(w / 2, h / 2, rw / 2, rh / 2, 0, 0, Math.PI * 2)
        } else {
          const r = Math.min(rw, rh) * 0.14
          ctx.moveTo(x + r, ry)
          ctx.arcTo(x + rw, ry, x + rw, ry + rh, r)
          ctx.arcTo(x + rw, ry + rh, x, ry + rh, r)
          ctx.arcTo(x, ry + rh, x, ry, r)
          ctx.arcTo(x, ry, x + rw, ry, r)
          ctx.closePath()
        }
      }

      // Outer border frame
      traceShape(pad)
      ctx.fillStyle = borderHex
      ctx.fill()

      // Main woven center field
      traceShape(pad + bw)
      ctx.fillStyle = fillHex
      ctx.fill()

      // Subtle carpet weave lines clipped to rug center
      ctx.save()
      traceShape(pad + bw)
      ctx.clip()
      ctx.fillStyle = "rgba(255, 255, 255, 0.045)"
      for (let sy = 0; sy < h; sy += 6) {
        ctx.fillRect(0, sy, w, 1)
      }
      ctx.fillStyle = "rgba(0, 0, 0, 0.03)"
      for (let sx = 0; sx < w; sx += 8) {
        ctx.fillRect(sx, 0, 1, h)
      }
      ctx.restore()

      // Crisp inner hairline pinstripe
      if (innerBorderHex) {
        traceShape(pad + bw + Math.max(4, Math.round(bw * 0.45)))
        ctx.strokeStyle = innerBorderHex
        ctx.lineWidth = Math.max(2, Math.round(bw * 0.16))
        ctx.stroke()
      }
    },
    opts.lite ? 2 : 6
  )

  const mat = new THREE.MeshStandardMaterial({
    map: tex,
    transparent: true,
    roughness: 0.84,
    metalness: 0.03,
    depthWrite: false,
  })
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(widthU, depthU), mat)
  mesh.rotation.x = -Math.PI / 2
  mesh.position.set(wx, y, wz)
  mesh.receiveShadow = true
  parent.add(mesh)
}

/** Adds a low wooden-and-stone chibi planter box with leafy shrubs (soft border for Phòng họp). */
export function addLowPlanterToBatch(
  batch: OfficeDecorBatcher,
  palette: OfficeDecorPalette,
  wx: number,
  wz: number,
  widthU: number,
  depthU: number,
  lite: boolean
): void {
  const boxH = 0.46
  // Navy plinth base + warm oak planter trough + brass trim rim
  batch.addBox(
    widthU - 0.05,
    0.07,
    depthU - 0.05,
    palette.skirtingDark,
    wx,
    0.035,
    wz,
    false
  )
  batch.addBevelBox(
    widthU,
    boxH - 0.07,
    depthU,
    0.022,
    palette.oakWood,
    wx,
    0.07 + (boxH - 0.07) / 2,
    wz,
    lite,
    true,
    true
  )
  batch.addBox(
    widthU + 0.03,
    0.03,
    depthU + 0.03,
    palette.gold,
    wx,
    boxH + 0.015,
    wz,
    false
  )
  // Dark soil bed
  batch.addBox(
    widthU - 0.08,
    0.04,
    depthU - 0.08,
    palette.soilDark,
    wx,
    boxH - 0.01,
    wz,
    false
  )

  // Lush chibi bush clusters spaced cleanly along the longer axis
  const alongX = widthU >= depthU
  const span = alongX ? widthU - 0.24 : depthU - 0.24
  const count = Math.max(2, Math.round(span / 0.36))
  const wSeg = lite ? 6 : 9
  const hSeg = lite ? 5 : 7

  for (let i = 0; i < count; i += 1) {
    const t = count === 1 ? 0 : i / (count - 1) - 0.5
    const offset = t * span
    const px = alongX ? wx + offset : wx + ((i % 2) * 2 - 1) * 0.03
    const pz = alongX ? wz + ((i % 2) * 2 - 1) * 0.03 : wz + offset
    const mat =
      i % 3 === 0
        ? palette.leafDeep
        : i % 3 === 1
          ? palette.leafMid
          : palette.leafBright
    const r = 0.17 + (i % 2) * 0.03
    batch.addSphere(r, wSeg, hSeg, mat, px, boxH + 0.14, pz, !lite, true, [
      1.05,
      0.86,
      1.05,
    ])
    // Cute highlight puff on top
    batch.addSphere(
      r * 0.56,
      wSeg,
      hSeg,
      palette.leafBright,
      px + 0.04,
      boxH + 0.26,
      pz - 0.03,
      false,
      false
    )
  }
}

/** Adds a cozy 3-tier Snack & Pantry Shelf stocked with snack boxes, tea jars, fruit bowl & pastry dome. */
export function addSnackShelfToBatch(
  batch: OfficeDecorBatcher,
  palette: OfficeDecorPalette,
  wx: number,
  wz: number,
  widthU: number,
  depthU: number,
  lite: boolean
): void {
  const totalH = 1.48
  const seg = lite ? 7 : 10
  // Dark steel side frames
  for (const side of [-1, 1] as const) {
    const fx = wx + side * (widthU / 2 - 0.035)
    for (const sz of [-1, 1] as const) {
      batch.addBox(
        0.04,
        totalH,
        0.04,
        palette.frameMetal,
        fx,
        totalH / 2,
        wz + sz * (depthU / 2 - 0.035),
        true
      )
    }
  }
  // Lower enclosed navy cabinet
  batch.addBevelBox(
    widthU - 0.06,
    0.46,
    depthU - 0.04,
    0.018,
    palette.wallDadoNavy,
    wx,
    0.26,
    wz,
    lite
  )
  // 3 warm oak shelves
  const shelfYs = [0.52, 0.98, 1.44]
  for (const sy of shelfYs) {
    batch.addBevelBox(
      widthU + 0.02,
      0.04,
      depthU + 0.02,
      0.01,
      palette.oakWood,
      wx,
      sy,
      wz,
      lite,
      false
    )
  }
  // Middle shelf (y=0.54): colorful chibi snack boxes & biscuit tins
  const snackCols = [
    palette.redAccent,
    palette.amberAccent,
    palette.blueAccent,
    palette.emeraldAccent,
    palette.pinkAccent,
  ]
  for (let i = 0; i < 5; i += 1) {
    const sx = wx - widthU * 0.36 + i * (widthU * 0.18)
    const sh = 0.22 + (i % 2) * 0.06
    batch.addBevelBox(
      0.16,
      sh,
      0.2,
      0.012,
      snackCols[i]!,
      sx,
      0.54 + sh / 2,
      wz - 0.02,
      lite,
      false
    )
  }
  // Upper shelf (y=1.0): ceramic fruit bowl + colorful oranges/apples + tea jars
  const bowlX = wx - widthU * 0.22
  batch.addCylinder(
    0.16,
    0.09,
    0.09,
    seg,
    palette.whiteCeramic,
    bowlX,
    1.045,
    wz,
    false
  )
  batch.addSphere(0.055, seg, 6, palette.amberAccent, bowlX - 0.05, 1.1, wz + 0.02, false)
  batch.addSphere(0.055, seg, 6, palette.redAccent, bowlX + 0.05, 1.1, wz - 0.02, false)
  batch.addSphere(0.05, seg, 6, palette.leafBright, bowlX, 1.14, wz, false)

  // Glassy/ceramic coffee & tea jars on right half
  for (let j = 0; j < 3; j += 1) {
    const jx = wx + 0.08 + j * 0.21
    batch.addCylinder(0.065, 0.065, 0.19, seg, palette.whiteCeramic, jx, 1.1, wz - 0.03, false)
    batch.addCylinder(0.068, 0.068, 0.03, seg, palette.gold, jx, 1.21, wz - 0.03, false)
  }
  // Top shelf: mini snack basket + stacked paper cups
  batch.addBevelBox(0.32, 0.12, 0.22, 0.014, palette.walnutWood, wx - 0.26, 1.52, wz, lite, false)
  batch.addCylinder(0.048, 0.036, 0.16, seg, palette.paperWhite, wx + 0.3, 1.54, wz, false)
  batch.addCylinder(0.048, 0.036, 0.16, seg, palette.paperWhite, wx + 0.44, 1.54, wz, false)
}

/** Adds a Water Dispenser Cooler with blue jug, hot/cold taps & side cup tube. */
export function addWaterCoolerToBatch(
  batch: OfficeDecorBatcher,
  palette: OfficeDecorPalette,
  wx: number,
  wz: number,
  lite: boolean
): void {
  const seg = lite ? 8 : 14
  batch.addBevelBox(0.44, 0.92, 0.44, 0.022, palette.whiteCeramic, wx, 0.46, wz, lite)
  batch.addBevelBox(0.34, 0.22, 0.06, 0.01, palette.skirtingDark, wx, 0.7, wz + 0.2, lite, false)
  batch.addBox(0.045, 0.05, 0.05, palette.redAccent, wx - 0.07, 0.74, wz + 0.23, false)
  batch.addBox(0.045, 0.05, 0.05, palette.blueAccent, wx + 0.07, 0.74, wz + 0.23, false)
  batch.addCylinder(0.04, 0.04, 0.34, 8, palette.whiteCeramic, wx + 0.24, 0.72, wz, false)
  batch.addCylinder(0.15, 0.15, 0.42, seg, palette.waterGlass, wx, 1.13, wz, true)
  batch.addCylinder(0.06, 0.08, 0.07, seg, palette.blueAccent, wx, 0.94, wz, false)
}

/** Adds a super cute chibi Foosball Table for Góc nghỉ. */
export function addFoosballTableToBatch(
  batch: OfficeDecorBatcher,
  palette: OfficeDecorPalette,
  wx: number,
  wz: number,
  widthU: number,
  depthU: number,
  lite: boolean
): void {
  const tableY = 0.76
  const bodyH = 0.24
  const seg = lite ? 6 : 8

  // 4 sturdy tapered legs + crossbars
  for (const sx of [-1, 1] as const) {
    for (const sz of [-1, 1] as const) {
      batch.addBox(
        0.08,
        tableY - bodyH / 2,
        0.08,
        palette.walnutWood,
        wx + sx * (widthU * 0.42),
        (tableY - bodyH / 2) / 2,
        wz + sz * (depthU * 0.4),
        true
      )
      batch.addBox(
        0.1,
        0.04,
        0.1,
        palette.gold,
        wx + sx * (widthU * 0.42),
        0.02,
        wz + sz * (depthU * 0.4),
        false
      )
    }
  }
  // Walnut & navy cabinet walls around pitch
  batch.addBevelBox(widthU, bodyH, depthU, 0.02, palette.wallDadoNavy, wx, tableY, wz, lite)
  // Emerald felt football pitch recessed inside top
  batch.addBox(
    widthU - 0.14,
    0.04,
    depthU - 0.14,
    palette.feltGreen,
    wx,
    tableY + bodyH / 2 - 0.01,
    wz,
    false
  )
  // Crisp white center line & goal lines
  batch.addBox(0.024, 0.01, depthU - 0.16, palette.paperWhite, wx, tableY + bodyH / 2 + 0.012, wz, false)
  // Oak top rails
  for (const sz of [-1, 1] as const) {
    batch.addBox(
      widthU + 0.03,
      0.045,
      0.075,
      palette.oakWood,
      wx,
      tableY + bodyH / 2 + 0.02,
      wz + sz * (depthU / 2 - 0.03),
      false
    )
  }
  for (const sx of [-1, 1] as const) {
    batch.addBox(
      0.075,
      0.045,
      depthU + 0.03,
      palette.oakWood,
      wx + sx * (widthU / 2 - 0.03),
      tableY + bodyH / 2 + 0.02,
      wz,
      false
    )
  }
  // 4 chrome rods spanning across Z + rubber grips + cute red & blue mini players!
  const rodXs = [-0.34, -0.11, 0.11, 0.34]
  rodXs.forEach((frac, idx) => {
    const rx = wx + frac * widthU
    const rodY = tableY + bodyH / 2 + 0.065
    const rodLen = depthU + 0.34
    batch.addCylinder(
      0.013,
      0.013,
      rodLen,
      seg,
      palette.silver,
      rx,
      rodY,
      wz,
      false,
      false,
      [Math.PI / 2, 0, 0]
    )
    // Grip handle on camera-facing or far side alternating
    const gripSide = idx % 2 === 0 ? 1 : -1
    batch.addCylinder(
      0.026,
      0.026,
      0.13,
      seg,
      palette.obsidian,
      rx,
      rodY,
      wz + gripSide * (rodLen / 2 - 0.06),
      false,
      false,
      [Math.PI / 2, 0, 0]
    )
    // 2 cute chibi foosball player figures per rod
    const teamMat = idx % 2 === 0 ? palette.redAccent : palette.blueAccent
    for (const pzOff of [-depthU * 0.2, depthU * 0.2]) {
      batch.addBox(0.045, 0.1, 0.045, teamMat, rx, rodY - 0.01, wz + pzOff, false)
      batch.addSphere(0.028, 6, 5, palette.whiteCeramic, rx, rodY + 0.06, wz + pzOff, false)
    }
  })
  // Tiny white soccer ball in center
  batch.addSphere(0.028, 6, 5, palette.paperWhite, wx + 0.04, tableY + bodyH / 2 + 0.035, wz, false)
}

/** Adds a cute retro-modern IQX Mini Arcade Cabinet ("IQX RUSH") for Góc nghỉ. */
export function addMiniArcadeCabinet(
  batch: OfficeDecorBatcher,
  palette: OfficeDecorPalette,
  parent: THREE.Object3D,
  wx: number,
  wz: number,
  lite: boolean
): void {
  // Cabinet body + upper hood + sloped control deck
  batch.addBevelBox(0.56, 0.92, 0.5, 0.02, palette.wallDadoNavy, wx, 0.46, wz, lite)
  batch.addBevelBox(0.58, 0.14, 0.58, 0.018, palette.obsidian, wx, 0.92, wz + 0.06, lite, false)
  batch.addBevelBox(0.56, 0.52, 0.42, 0.02, palette.wallDadoNavy, wx, 1.24, wz - 0.04, lite)
  // Glowing top marquee bar
  batch.addBox(0.52, 0.12, 0.04, palette.gold, wx, 1.46, wz + 0.17, false)
  // Joystick & colorful arcade buttons
  batch.addCylinder(0.012, 0.012, 0.07, 6, palette.silver, wx - 0.12, 1.02, wz + 0.22, false)
  batch.addSphere(0.028, 6, 5, palette.redAccent, wx - 0.12, 1.065, wz + 0.22, false)
  batch.addCylinder(0.022, 0.022, 0.025, 6, palette.emeraldAccent, wx + 0.06, 1.0, wz + 0.22, false)
  batch.addCylinder(0.022, 0.022, 0.025, 6, palette.amberAccent, wx + 0.14, 1.0, wz + 0.22, false)

  // Glowing arcade chart screen
  const screenTex = createArcadeScreenTexture()
  const screenMat = new THREE.MeshStandardMaterial({
    map: screenTex,
    emissive: new THREE.Color("#ffffff"),
    emissiveMap: screenTex,
    emissiveIntensity: 0.55,
    roughness: 0.24,
  })
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.32), screenMat)
  screen.position.set(wx, 1.2, wz + 0.18)
  screen.rotation.x = -0.18
  parent.add(screen)
}

/** Adds 3 tiered marble-and-gold Trophy Pedestals with sculpted Gold/Silver/Bronze cups for Góc thành tích. */
export function addTrophyPedestalsToBatch(
  batch: OfficeDecorBatcher,
  palette: OfficeDecorPalette,
  centerWx: number,
  centerWz: number,
  lite: boolean
): void {
  const seg = lite ? 8 : 14
  const pedestals: readonly {
    dx: number
    dz: number
    pedH: number
    cupMat: THREE.Material
    cupScale: number
  }[] = [
    { dx: -0.68, dz: 0.08, pedH: 0.68, cupMat: palette.silver, cupScale: 0.9 },
    { dx: 0, dz: -0.06, pedH: 0.88, cupMat: palette.gold, cupScale: 1.12 },
    { dx: 0.68, dz: 0.12, pedH: 0.58, cupMat: palette.bronze, cupScale: 0.85 },
  ]

  for (const p of pedestals) {
    const px = centerWx + p.dx
    const pz = centerWz + p.dz
    // Tiered navy base + cream marble shaft + gold cap
    batch.addBevelBox(0.5, 0.1, 0.5, 0.016, palette.wallDadoNavy, px, 0.05, pz, lite)
    batch.addBevelBox(0.42, p.pedH - 0.14, 0.42, 0.018, palette.marbleLight, px, 0.1 + (p.pedH - 0.14) / 2, pz, lite)
    batch.addBox(0.46, 0.045, 0.46, palette.gold, px, p.pedH - 0.02, pz, false)
    // Engraved gold front plaque
    batch.addBox(0.22, 0.12, 0.02, p.cupMat, px, p.pedH * 0.56, pz + 0.215, false)

    // Sculpted chibi trophy cup resting on top of pedestal
    const baseY = p.pedH + 0.01
    const sc = p.cupScale
    batch.addCylinder(0.09 * sc, 0.11 * sc, 0.06 * sc, seg, palette.obsidian, px, baseY + 0.03 * sc, pz, false)
    batch.addCylinder(0.03 * sc, 0.045 * sc, 0.12 * sc, seg, p.cupMat, px, baseY + 0.11 * sc, pz, false)
    batch.addCylinder(0.13 * sc, 0.075 * sc, 0.18 * sc, seg, p.cupMat, px, baseY + 0.25 * sc, pz, true)
    // Trophy handles (cute curved ears on left & right)
    for (const side of [-1, 1] as const) {
      batch.addSphere(0.042 * sc, 6, 5, p.cupMat, px + side * 0.125 * sc, baseY + 0.26 * sc, pz, false)
    }
    // Star finial inside/above cup
    batch.addSphere(0.048 * sc, 6, 5, palette.warmGlow, px, baseY + 0.36 * sc, pz, false)
  }
}

/** Adds a sleek mahogany & gold Framed Certificate Display Easel for Góc thành tích. */
export function addCertificateEasel(
  batch: OfficeDecorBatcher,
  palette: OfficeDecorPalette,
  parent: THREE.Object3D,
  wx: number,
  wz: number,
  headline: string,
  subline: string,
  rotY: number,
  lite: boolean
): void {
  const cos = Math.cos(rotY)
  const sin = Math.sin(rotY)
  const toWorld = (lx: number, ly: number, lz: number): [number, number, number] => [
    wx + lx * cos + lz * sin,
    ly,
    wz - lx * sin + lz * cos,
  ]
  const rot: readonly [number, number, number] = [0, rotY, 0]

  // A-frame mahogany easel legs + shelf rail
  for (const sx of [-0.22, 0.22]) {
    batch.addBox(0.04, 1.15, 0.04, palette.walnutWood, ...toWorld(sx, 0.56, 0.04), true, true, [-0.14, rotY, 0])
  }
  batch.addBox(0.04, 1.05, 0.04, palette.walnutWood, ...toWorld(0, 0.52, -0.22), false, true, [0.24, rotY, 0])
  batch.addBox(0.66, 0.045, 0.08, palette.gold, ...toWorld(0, 0.62, 0.1), false, true, rot)

  // Gold certificate frame resting on easel
  const frameCenter = toWorld(0, 0.92, 0.04)
  batch.addBevelBox(0.66, 0.52, 0.045, 0.012, palette.gold, ...frameCenter, lite, true, true, [-0.14, rotY, 0])

  const certTex = createCertificateTexture(headline, subline)
  const certMat = new THREE.MeshStandardMaterial({
    map: certTex,
    roughness: 0.36,
    metalness: 0.06,
  })
  const facePos = toWorld(0, 0.92, 0.072)
  const face = new THREE.Mesh(new THREE.PlaneGeometry(0.58, 0.44), certMat)
  face.position.set(facePos[0], facePos[1], facePos[2])
  face.rotation.set(-0.14, rotY, 0)
  parent.add(face)
}

/** Adds a sleek freestanding mobile whiteboard easel for open-floor Phòng họp. */
export function addWhiteboardEasel(
  batch: OfficeDecorBatcher,
  palette: OfficeDecorPalette,
  parent: THREE.Object3D,
  wx: number,
  wz: number,
  rotY: number,
  lite: boolean
): void {
  const cos = Math.cos(rotY)
  const sin = Math.sin(rotY)
  const toWorld = (lx: number, ly: number, lz: number): [number, number, number] => [
    wx + lx * cos + lz * sin,
    ly,
    wz - lx * sin + lz * cos,
  ]

  // Mobile aluminum stand feet + twin upright posts + marker tray
  for (const sx of [-0.54, 0.54]) {
    batch.addBox(0.05, 0.04, 0.46, palette.frameMetal, ...toWorld(sx, 0.02, 0), false, true, [0, rotY, 0])
    batch.addBox(0.045, 1.54, 0.045, palette.frameMetal, ...toWorld(sx, 0.78, 0), true, true, [0, rotY, 0])
  }
  batch.addBevelBox(1.22, 0.78, 0.055, 0.014, palette.frameMetal, ...toWorld(0, 1.16, 0), lite, true, true, [0, rotY, 0])
  batch.addBox(1.16, 0.035, 0.1, palette.silver, ...toWorld(0, 0.76, 0.05), false, true, [0, rotY, 0])

  const wbTex = createMeetingWhiteboardTexture()
  const wbMat = new THREE.MeshStandardMaterial({
    map: wbTex,
    roughness: 0.28,
  })
  const facePos = toWorld(0, 1.16, 0.034)
  const face = new THREE.Mesh(new THREE.PlaneGeometry(1.14, 0.7), wbMat)
  face.position.set(facePos[0], facePos[1], facePos[2])
  face.rotation.y = rotY
  parent.add(face)
}

/** Adds a brass standing floor lamp with warm glowing shade. */
export function addStandingLampToBatch(
  batch: OfficeDecorBatcher,
  palette: OfficeDecorPalette,
  wx: number,
  wz: number,
  lite: boolean
): void {
  const seg = lite ? 8 : 14
  batch.addCylinder(0.13, 0.15, 0.04, seg, palette.gold, wx, 0.02, wz, false)
  batch.addCylinder(0.02, 0.024, 1.36, 7, palette.gold, wx, 0.7, wz, false)
  batch.addCylinder(0.14, 0.22, 0.27, seg, palette.lampShadeGlow, wx, 1.42, wz, false)
}

/** Adds a tidy low supply credenza + compact multifunction copier/printer for the south open strip. */
export function addPrinterCredenzaToBatch(
  batch: OfficeDecorBatcher,
  palette: OfficeDecorPalette,
  wx: number,
  wz: number,
  widthU: number,
  depthU: number,
  lite: boolean
): void {
  const crH = 0.66
  const seg = lite ? 7 : 10
  // Tapered gold feet + navy cabinet + warm oak slab top
  for (const fx of [-1, 1] as const) {
    for (const fz of [-1, 1] as const) {
      batch.addCylinder(
        0.024,
        0.018,
        0.1,
        6,
        palette.gold,
        wx + fx * (widthU * 0.44),
        0.05,
        wz + fz * (depthU * 0.36),
        false
      )
    }
  }
  batch.addBevelBox(widthU, crH - 0.1, depthU, 0.022, palette.wallDadoNavy, wx, 0.1 + (crH - 0.1) / 2, wz, lite)
  batch.addBevelBox(widthU + 0.06, 0.048, depthU + 0.06, 0.014, palette.oakWood, wx, crH + 0.024, wz, lite)
  const topY = crH + 0.048

  // Compact office copier on left half
  const cx = wx - widthU * 0.22
  batch.addBevelBox(0.68, 0.38, 0.46, 0.022, palette.whiteCeramic, cx, topY + 0.19, wz - 0.02, lite)
  batch.addBevelBox(0.7, 0.06, 0.44, 0.014, palette.frameMetal, cx, topY + 0.4, wz - 0.03, lite, false)
  batch.addBox(0.16, 0.07, 0.03, palette.screenCyan, cx + 0.18, topY + 0.31, wz + 0.215, false, false, [-0.3, 0, 0])
  batch.addBox(0.24, 0.012, 0.18, palette.paperWhite, cx - 0.08, topY + 0.29, wz + 0.24, false, false, [0.14, 0, 0])

  // Stacked A4 paper reams + colorful upright binders + mini succulent on right half
  const rx = wx + widthU * 0.16
  for (let r = 0; r < 3; r += 1) {
    batch.addBox(0.28, 0.048, 0.2, palette.paperWhite, rx, topY + 0.024 + r * 0.052, wz + 0.03, false, false, [0, (r - 1) * 0.04, 0])
  }
  const folderMats = [palette.blueAccent, palette.amberAccent, palette.emeraldAccent]
  folderMats.forEach((mat, idx) => {
    batch.addBevelBox(0.064, 0.24, 0.2, 0.008, mat, rx + 0.26 + idx * 0.072, topY + 0.12, wz - 0.05, lite, false)
  })
  // Mini ceramic pot + succulent at far right end
  const sx = wx + widthU * 0.41
  batch.addCylinder(0.072, 0.056, 0.1, seg, palette.whiteCeramic, sx, topY + 0.05, wz, false)
  batch.addSphere(0.1, seg, 6, palette.leafMid, sx, topY + 0.14, wz, false)
}

/** Adds a sleek chibi Welcome / Check-in Reception Desk for the south open strip (0 extra draw calls). */
export function addWelcomeCounterToBatch(
  batch: OfficeDecorBatcher,
  palette: OfficeDecorPalette,
  wx: number,
  wz: number,
  widthU: number,
  depthU: number,
  lite: boolean
): void {
  const seg = lite ? 7 : 10
  const bodyH = 0.82
  // Navy plinth + beveled navy reception body + warm oak transaction top
  batch.addBox(widthU - 0.06, 0.08, depthU - 0.04, palette.skirtingDark, wx, 0.04, wz, false)
  batch.addBevelBox(widthU, bodyH - 0.08, depthU, 0.024, palette.wallDadoNavy, wx, 0.08 + (bodyH - 0.08) / 2, wz, lite)
  // Decorative gold vertical fluting slats along both north & south faces (visible from 48° camera!)
  const slatCount = lite ? 6 : 10
  for (let i = 0; i < slatCount; i += 1) {
    const t = i / (slatCount - 1) - 0.5
    const sx = wx + t * (widthU - 0.34)
    batch.addBox(0.032, bodyH - 0.24, 0.024, palette.gold, sx, bodyH * 0.52, wz + depthU / 2 + 0.008, false)
    batch.addBox(0.032, bodyH - 0.24, 0.024, palette.gold, sx, bodyH * 0.52, wz - depthU / 2 - 0.008, false)
  }
  // Brushed gold waist trim + oak counter top + raised marble check-in ledge
  batch.addBox(widthU + 0.04, 0.036, depthU + 0.04, palette.gold, wx, bodyH - 0.02, wz, false)
  batch.addBevelBox(widthU + 0.08, 0.056, depthU + 0.08, 0.016, palette.oakWood, wx, bodyH + 0.028, wz, lite)
  const topY = bodyH + 0.056
  batch.addBevelBox(widthU * 0.62, 0.12, 0.16, 0.014, palette.marbleLight, wx, topY + 0.06, wz + depthU * 0.28, lite, false)
  batch.addBox(widthU * 0.64, 0.024, 0.18, palette.gold, wx, topY + 0.13, wz + depthU * 0.28, false)

  // Compact check-in kiosk screen + gold table lamp + visitor guestbook + mini succulent
  const kx = wx - widthU * 0.24
  batch.addBox(0.14, 0.018, 0.1, palette.silver, kx, topY + 0.009, wz - 0.04, false)
  batch.addBevelBox(0.32, 0.22, 0.028, 0.01, palette.obsidian, kx, topY + 0.15, wz - 0.05, lite, false, true, [0.22, 0, 0])
  batch.addBox(0.28, 0.17, 0.012, palette.screenCyan, kx, topY + 0.15, wz - 0.032, false, false, [0.22, 0, 0])

  // Open visitor binder + golden bell on center-right
  batch.addBevelBox(0.28, 0.026, 0.2, 0.006, palette.paperWhite, wx + 0.14, topY + 0.013, wz - 0.04, lite, false, true, [0, -0.08, 0])
  batch.addCylinder(0.055, 0.075, 0.05, seg, palette.gold, wx + 0.44, topY + 0.025, wz - 0.06, false)
  // Cute mini ceramic plant on right corner
  const px = wx + widthU * 0.39
  batch.addCylinder(0.072, 0.056, 0.1, seg, palette.terracotta, px, topY + 0.05, wz - 0.02, false)
  batch.addSphere(0.11, seg, 6, palette.leafBright, px, topY + 0.15, wz - 0.02, false)
}

/** Adds a cozy Guest Waiting Bench + Round Bistro Side Table with coffee mugs for the south open strip. */
export function addSouthLoungeSetToBatch(
  batch: OfficeDecorBatcher,
  palette: OfficeDecorPalette,
  wx: number,
  wz: number,
  widthU: number,
  depthU: number,
  lite: boolean
): void {
  const seg = lite ? 7 : 10
  // Cozy 2-seat plush waiting bench on left 62% of the footprint
  const benchW = widthU * 0.58
  const benchX = wx - widthU * 0.2
  for (const sx of [-1, 1] as const) {
    for (const sz of [-1, 1] as const) {
      batch.addCylinder(
        0.026,
        0.02,
        0.24,
        6,
        palette.walnutWood,
        benchX + sx * (benchW * 0.42),
        0.12,
        wz + sz * (depthU * 0.34),
        true
      )
    }
  }
  batch.addBevelBox(benchW, 0.07, depthU * 0.88, 0.016, palette.oakWood, benchX, 0.27, wz, lite)
  batch.addBevelBox(benchW - 0.04, 0.14, depthU * 0.84, 0.042, palette.navyFabric, benchX, 0.37, wz, lite)
  // Two soft cream accent throw cushions resting on the bench
  batch.addBevelBox(0.28, 0.12, 0.26, 0.036, palette.creamFabric, benchX - benchW * 0.26, 0.48, wz - 0.04, lite, false, true, [0.16, 0.14, 0])
  batch.addBevelBox(0.28, 0.12, 0.26, 0.036, palette.amberAccent, benchX + benchW * 0.24, 0.48, wz - 0.04, lite, false, true, [0.14, -0.18, 0])

  // Sleek round oak & gold bistro side table on right 34% with ceramic mugs & magazine
  const tx = wx + widthU * 0.31
  const tableH = 0.52
  batch.addCylinder(0.18, 0.22, 0.035, seg, palette.gold, tx, 0.018, wz, false)
  batch.addCylinder(0.035, 0.04, tableH - 0.06, seg, palette.frameMetal, tx, tableH / 2, wz, false)
  batch.addCylinder(0.32, 0.32, 0.045, seg, palette.oakWood, tx, tableH, wz, true)
  batch.addCylinder(0.33, 0.33, 0.016, seg, palette.gold, tx, tableH - 0.02, wz, false)
  // Two ceramic cups + stacked magazine on table
  batch.addCylinder(0.04, 0.034, 0.078, seg, palette.whiteCeramic, tx - 0.11, tableH + 0.062, wz + 0.04, false)
  batch.addCylinder(0.04, 0.034, 0.078, seg, palette.amberAccent, tx + 0.09, tableH + 0.062, wz - 0.06, false)
  batch.addBevelBox(0.2, 0.022, 0.15, 0.004, palette.blueAccent, tx + 0.04, tableH + 0.034, wz + 0.11, lite, false, true, [0, 0.2, 0])
}
