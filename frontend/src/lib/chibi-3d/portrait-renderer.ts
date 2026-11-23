import * as THREE from "three"

import { AVATARS } from "@/pages/trading-floor/net/types.ts"

import {
  createChibiCharacter,
  prefersReducedMotion,
} from "./character-builder.ts"
import { safeGet2DContext } from "./textures.ts"
import {
  getAvatarStylePreset,
  resolveOutfitHex,
  type AvatarStylePreset,
  type ChibiAnimMode,
  type ChibiRig,
} from "./types.ts"

const portraitCache = new Map<string, string>()

/** Minimum pixel density multiplier for portrait data URLs so tiles stay sharp at devicePixelRatio 2. */
export const PORTRAIT_MIN_DPR = 2

function getPortraitPixelSize(cssSize: number): number {
  const safeSize = Math.max(32, Math.round(cssSize))
  const rawDpr =
    typeof window !== "undefined" && Number.isFinite(window.devicePixelRatio)
      ? window.devicePixelRatio
      : PORTRAIT_MIN_DPR
  const dpr = Math.max(PORTRAIT_MIN_DPR, Math.min(3, Math.ceil(rawDpr || 2)))
  return safeSize * dpr
}

function shadeHexColor(hex: string, factor: number): string {
  const clean = hex.replace("#", "")
  if (clean.length !== 6) return hex
  const r = Math.max(
    0,
    Math.min(255, Math.round(parseInt(clean.slice(0, 2), 16) * factor))
  )
  const g = Math.max(
    0,
    Math.min(255, Math.round(parseInt(clean.slice(2, 4), 16) * factor))
  )
  const b = Math.max(
    0,
    Math.min(255, Math.round(parseInt(clean.slice(4, 6), 16) * factor))
  )
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
}

/** Crisp SVG fallback when Canvas2D is unavailable (e.g. jsdom without native canvas). */
function buildSvgChibiPortraitDataUrl(
  preset: AvatarStylePreset,
  outfitHex: string,
  size: number
): string {
  const isFemale = preset.gender === "female"
  const isCool = preset.id === "danhtrongit"
  const darkOutfit = shadeHexColor(outfitHex, 0.76)
  const hairEsc = escapeXml(preset.hairColor)
  const outfitEsc = escapeXml(outfitHex)
  const darkOutfitEsc = escapeXml(darkOutfit)
  const shirtEsc = escapeXml(preset.innerShirtHex)
  const accentEsc = escapeXml(preset.tieOrAccentHex)

  // Distinct back hair silhouette per hairstyle
  let backHairSvg = ""
  if (preset.hairStyle === "ponytail") {
    backHairSvg = `<ellipse cx="118" cy="68" rx="18" ry="27" transform="rotate(-18 118 68)" fill="${hairEsc}"/><circle cx="109" cy="49" r="7" fill="#f3c64a"/>`
  } else if (preset.hairStyle === "long_wavy") {
    backHairSvg = `<path d="M32 76 C26 112 30 144 38 158 L122 158 C130 144 134 112 128 76 C122 36 38 36 32 76 Z" fill="${hairEsc}"/>`
  } else if (preset.hairStyle === "layered_clips") {
    backHairSvg = `<path d="M33 78 C28 108 32 132 28 142 L132 142 C128 132 132 108 127 78 C120 38 40 38 33 78 Z" fill="${hairEsc}"/>`
  } else if (preset.hairStyle === "bob") {
    backHairSvg = `<path d="M34 74 C30 100 36 122 50 124 L110 124 C124 122 130 100 126 74 C120 38 40 38 34 74 Z" fill="${hairEsc}"/>`
  } else if (preset.hairStyle === "chignon") {
    backHairSvg = `<circle cx="116" cy="94" r="15" fill="${hairEsc}"/><circle cx="113" cy="92" r="10" fill="none" stroke="#f3c64a" stroke-width="2.4"/>`
  }

  // Distinct front hair silhouette per hairstyle
  let frontHairSvg = `<path d="M39 74 C38 35 61 27 80 27 C99 27 122 35 121 74 C112 57 98 52 82 56 C65 52 49 58 39 74 Z" fill="${hairEsc}"/>`
  if (preset.hairStyle === "spiky" || preset.hairStyle === "tousled_cool") {
    frontHairSvg += `<path d="M52 38 L64 17 L75 33 L88 16 L99 34 L113 24 L114 48 Z" fill="${hairEsc}"/>`
  } else if (preset.hairStyle === "swept_back" || preset.hairStyle === "slicked") {
    frontHairSvg = `<path d="M39 72 C37 32 62 21 82 22 C104 23 123 36 121 72 C113 52 98 44 80 46 C62 44 47 52 39 72 Z" fill="${hairEsc}"/>`
  }
  if (preset.hairHighlight) {
    frontHairSvg += `<path d="M96 46 Q110 55 107 69 Q97 62 92 50 Z" fill="${escapeXml(preset.hairHighlight)}"/>`
  }
  if (preset.hasHeadband) {
    frontHairSvg += `<path d="M46 56 A38 38 0 0 1 114 56" fill="none" stroke="#f3c64a" stroke-width="4" stroke-linecap="round"/><circle cx="98" cy="32" r="4.5" fill="#fffaf0"/>`
  }
  if (preset.hasHairClips) {
    frontHairSvg += `<g transform="translate(105 55) rotate(-20)" fill="#f3c64a"><rect x="-7" y="-2" width="14" height="3" rx="1.5"/><rect x="-6" y="3" width="12" height="3" rx="1.5"/></g>`
  }

  // Distinct outfit layer detail per outfitStyle
  let outfitDetailSvg: string
  if (preset.outfitStyle === "suit_tie" || preset.outfitStyle === "blazer_pin") {
    outfitDetailSvg =
      `<polygon points="66,115 94,115 80,141" fill="${shirtEsc}"/>` +
      `<polygon points="61,116 68,116 77,143 66,143" fill="${darkOutfitEsc}"/>` +
      `<polygon points="99,116 92,116 83,143 94,143" fill="${darkOutfitEsc}"/>` +
      `<polygon points="77,118 83,118 86,147 80,154 74,147" fill="${accentEsc}"/>` +
      (preset.outfitStyle === "blazer_pin"
        ? `<circle cx="66" cy="130" r="3" fill="#f5c542"/>`
        : "")
  } else if (preset.outfitStyle === "polo") {
    outfitDetailSvg =
      `<rect x="75" y="116" width="10" height="24" rx="2" fill="${accentEsc}"/>` +
      `<polygon points="64,114 76,118 68,128" fill="${darkOutfitEsc}"/>` +
      `<polygon points="96,114 84,118 92,128" fill="${darkOutfitEsc}"/>`
  } else if (preset.outfitStyle === "dress_shirt") {
    outfitDetailSvg =
      `<rect x="77" y="118" width="6" height="42" fill="${darkOutfitEsc}"/>` +
      `<polygon points="65,114 78,119 70,129" fill="${shirtEsc}"/>` +
      `<polygon points="95,114 82,119 90,129" fill="${shirtEsc}"/>`
  } else if (preset.outfitStyle === "skirt_blouse") {
    outfitDetailSvg =
      `<path d="M64 115 Q72 127 80 120 Q88 127 96 115 Z" fill="${shirtEsc}"/>` +
      `<polygon points="80,125 68,119 68,131" fill="${accentEsc}"/>` +
      `<polygon points="80,125 92,119 92,131" fill="${accentEsc}"/>` +
      `<circle cx="80" cy="125" r="4" fill="${accentEsc}"/>`
  } else if (preset.outfitStyle === "dress_belt") {
    outfitDetailSvg = `<path d="M64 115 Q80 130 96 115" fill="none" stroke="${shirtEsc}" stroke-width="5" stroke-linecap="round"/><circle cx="80" cy="129" r="3.4" fill="#f5c542"/>`
  } else if (preset.outfitStyle === "chic_blazer") {
    outfitDetailSvg =
      `<polygon points="66,115 94,115 88,160 72,160" fill="${shirtEsc}"/>` +
      `<polygon points="61,116 69,116 74,156 64,156" fill="${darkOutfitEsc}"/>` +
      `<polygon points="99,116 91,116 86,156 96,156" fill="${darkOutfitEsc}"/>` +
      `<circle cx="80" cy="129" r="3" fill="#f5c542"/>`
  } else {
    // tech_blazer (danhtrongit)
    outfitDetailSvg =
      `<polygon points="66,115 94,115 88,160 72,160" fill="${shirtEsc}"/>` +
      `<polygon points="61,116 69,116 74,156 64,156" fill="${darkOutfitEsc}"/>` +
      `<polygon points="99,116 91,116 86,156 96,156" fill="${darkOutfitEsc}"/>` +
      `<rect x="92" y="130" width="19" height="11" rx="3" fill="#f5b81c"/>`
  }

  const glassesSvg = preset.hasGlasses
    ? `<g stroke="${escapeXml(preset.glassesColor ?? "#1f2937")}" stroke-width="2.5" fill="${isCool ? "rgba(56,189,248,0.22)" : "rgba(224,242,254,0.16)"}"><ellipse cx="64" cy="79" rx="12.5" ry="${isCool ? 10.5 : 12}"/><ellipse cx="98" cy="79" rx="12.5" ry="${isCool ? 10.5 : 12}"/><path d="M76.5 79 Q81 76.5 85.5 79" fill="none"/></g>`
    : ""

  const mouthSvg = isCool
    ? `<path d="M75 96 Q83 98 91 93" fill="none" stroke="#6c3428" stroke-width="2.4" stroke-linecap="round"/>`
    : `<path d="M73 95 Q81 102 89 95" fill="none" stroke="#7a3b2e" stroke-width="2.4" stroke-linecap="round"/>`

  const lashesSvg = isFemale
    ? `<path d="M55 74 L51 70 M107 74 L111 70" stroke="#18131a" stroke-width="2" stroke-linecap="round"/>`
    : ""

  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 160 160">`,
    `<defs><radialGradient id="bg" cx="50%" cy="38%" r="65%"><stop offset="0%" stop-color="#243b6b"/><stop offset="100%" stop-color="#0d162c"/></radialGradient></defs>`,
    `<rect width="160" height="160" rx="22" fill="url(#bg)"/>`,
    backHairSvg,
    `<path d="M30 160 C34 122 52 113 80 113 C108 113 126 122 130 160 Z" fill="${outfitEsc}"/>`,
    outfitDetailSvg,
    `<rect x="72" y="104" width="16" height="14" rx="5" fill="${escapeXml(preset.skinColor)}"/>`,
    `<circle cx="40" cy="80" r="7.5" fill="${escapeXml(preset.skinColor)}"/><circle cx="120" cy="80" r="7.5" fill="${escapeXml(preset.skinColor)}"/>`,
    // Sculpted chibi head path (cheeks + gentle tapered chin)
    `<path d="M80 39 C104 39 120 55 120 77 C120 96 105 113 80 114 C55 113 40 96 40 77 C40 55 56 39 80 39 Z" fill="${escapeXml(preset.skinColor)}"/>`,
    `<ellipse cx="53" cy="89" rx="8.5" ry="5.2" fill="#ff768e" opacity="${isFemale ? "0.46" : "0.34"}"/>`,
    `<ellipse cx="108" cy="89" rx="8.5" ry="5.2" fill="#ff768e" opacity="${isFemale ? "0.46" : "0.34"}"/>`,
    `<ellipse cx="64" cy="79" rx="7.2" ry="${isCool ? 7 : isFemale ? 9 : 8.2}" fill="${escapeXml(preset.eyeColor)}"/>`,
    `<ellipse cx="98" cy="79" rx="7.2" ry="${isCool ? 7 : isFemale ? 9 : 8.2}" fill="${escapeXml(preset.eyeColor)}"/>`,
    `<circle cx="61.5" cy="75.8" r="2.6" fill="#ffffff"/><circle cx="95.5" cy="75.8" r="2.6" fill="#ffffff"/>`,
    `<circle cx="66.5" cy="82.2" r="1.2" fill="#ffffff"/><circle cx="100.5" cy="82.2" r="1.2" fill="#ffffff"/>`,
    lashesSvg,
    `<circle cx="81" cy="87.5" r="1.5" fill="#c9886b" opacity="0.65"/>`,
    mouthSvg,
    frontHairSvg,
    glassesSvg,
    `</svg>`,
  ].join("")
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
}

function drawPortraitEye(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  eyeColor: string,
  isFemale: boolean,
  isElegant: boolean,
  isCool: boolean,
  side: -1 | 1
): void {
  // Soft white sclera
  ctx.fillStyle = "#fcfdff"
  ctx.beginPath()
  ctx.ellipse(cx, cy + 0.5, rx * 1.14, ry * 1.07, 0, 0, Math.PI * 2)
  ctx.fill()

  // Glossy jewel iris gradient
  const grad = ctx.createLinearGradient(cx, cy - ry, cx, cy + ry)
  grad.addColorStop(0, eyeColor)
  grad.addColorStop(0.55, shadeHexColor(eyeColor, 1.2))
  grad.addColorStop(1, isCool ? "#38bdf8" : isFemale ? "#9d68a6" : "#785741")
  ctx.fillStyle = grad
  ctx.beginPath()
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2)
  ctx.fill()

  // Deep glossy pupil
  ctx.fillStyle = "#10121a"
  ctx.beginPath()
  ctx.ellipse(cx, cy - 0.5, rx * 0.52, ry * 0.52, 0, 0, Math.PI * 2)
  ctx.fill()

  // Lower jewel crescent shimmer
  ctx.fillStyle = "rgba(255,255,255,0.36)"
  ctx.beginPath()
  ctx.ellipse(cx, cy + ry * 0.46, rx * 0.52, ry * 0.23, 0, 0, Math.PI * 2)
  ctx.fill()

  // Dual crisp catchlights
  ctx.fillStyle = "#ffffff"
  ctx.beginPath()
  ctx.arc(cx - rx * 0.3, cy - ry * 0.34, rx * 0.32, 0, Math.PI * 2)
  ctx.fill()
  ctx.beginPath()
  ctx.arc(cx + rx * 0.3, cy + ry * 0.28, rx * 0.15, 0, Math.PI * 2)
  ctx.fill()

  // Sculpted upper eyelid / lash rim
  ctx.strokeStyle = "#16121a"
  ctx.lineWidth = isCool ? 2.8 : 2.4
  ctx.lineCap = "round"
  ctx.beginPath()
  if (isCool) {
    ctx.moveTo(cx - rx * 1.12, cy - ry * 0.56)
    ctx.quadraticCurveTo(cx, cy - ry * 1.0, cx + rx * 1.12, cy - ry * 0.56)
  } else {
    ctx.ellipse(
      cx,
      cy + 0.5,
      rx * 1.1,
      ry * 1.04,
      0,
      Math.PI * 1.1,
      Math.PI * 1.9
    )
  }
  ctx.stroke()

  if (isFemale) {
    const ox = cx + side * rx * 1.04
    const oy = cy - ry * 0.34
    ctx.lineWidth = 2.0
    ctx.beginPath()
    ctx.moveTo(ox, oy)
    ctx.lineTo(ox + side * 4.8, oy - 3.6)
    if (isElegant) {
      ctx.moveTo(ox - side * 0.8, oy + 3)
      ctx.lineTo(ox + side * 4.2, oy + 0.6)
    }
    ctx.stroke()
  }
}

function drawPortraitBackHair(
  ctx: CanvasRenderingContext2D,
  preset: AvatarStylePreset
): void {
  ctx.fillStyle = preset.hairColor
  if (preset.hairStyle === "ponytail") {
    ctx.beginPath()
    ctx.ellipse(119, 68, 19, 29, -0.32, 0, Math.PI * 2)
    ctx.fill()
    // Tip curl
    ctx.beginPath()
    ctx.moveTo(116, 90)
    ctx.quadraticCurveTo(132, 108, 122, 122)
    ctx.quadraticCurveTo(110, 108, 108, 92)
    ctx.closePath()
    ctx.fill()
    // Gold scrunchie
    ctx.fillStyle = "#f3c64a"
    ctx.beginPath()
    ctx.ellipse(110, 49, 7.5, 6, -0.35, 0, Math.PI * 2)
    ctx.fill()
  } else if (preset.hairStyle === "long_wavy") {
    ctx.beginPath()
    ctx.moveTo(33, 74)
    ctx.bezierCurveTo(24, 104, 34, 124, 28, 158)
    ctx.lineTo(132, 158)
    ctx.bezierCurveTo(126, 124, 136, 104, 127, 74)
    ctx.quadraticCurveTo(80, 32, 33, 74)
    ctx.closePath()
    ctx.fill()
  } else if (preset.hairStyle === "layered_clips") {
    ctx.beginPath()
    ctx.moveTo(33, 76)
    ctx.bezierCurveTo(28, 102, 35, 124, 26, 140)
    ctx.quadraticCurveTo(80, 148, 134, 140)
    ctx.bezierCurveTo(125, 124, 132, 102, 127, 76)
    ctx.quadraticCurveTo(80, 34, 33, 76)
    ctx.closePath()
    ctx.fill()
  } else if (preset.hairStyle === "bob") {
    ctx.beginPath()
    ctx.moveTo(34, 72)
    ctx.bezierCurveTo(28, 102, 38, 122, 54, 124)
    ctx.lineTo(106, 124)
    ctx.bezierCurveTo(122, 122, 132, 102, 126, 72)
    ctx.quadraticCurveTo(80, 32, 34, 72)
    ctx.closePath()
    ctx.fill()
  } else if (preset.hairStyle === "chignon") {
    // Low chignon bun + gold cuff & pearl hairpin
    ctx.beginPath()
    ctx.arc(116, 94, 16, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = "#f3c64a"
    ctx.lineWidth = 2.6
    ctx.beginPath()
    ctx.arc(113, 94, 12, -Math.PI * 0.4, Math.PI * 0.4)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(116, 94)
    ctx.lineTo(132, 76)
    ctx.stroke()
    ctx.fillStyle = "#fffaf0"
    ctx.beginPath()
    ctx.arc(133, 75, 3.2, 0, Math.PI * 2)
    ctx.fill()
  }
}

function drawPortraitOutfit(
  ctx: CanvasRenderingContext2D,
  preset: AvatarStylePreset,
  resolvedHex: string
): void {
  const darkHex = shadeHexColor(resolvedHex, 0.76)

  // Sculpted shoulders & torso gradient
  const bodyGrad = ctx.createLinearGradient(80, 112, 80, 162)
  bodyGrad.addColorStop(0, resolvedHex)
  bodyGrad.addColorStop(1, darkHex)
  ctx.fillStyle = bodyGrad
  ctx.beginPath()
  ctx.moveTo(28, 162)
  ctx.quadraticCurveTo(33, 120, 62, 114)
  ctx.lineTo(98, 114)
  ctx.quadraticCurveTo(127, 120, 132, 162)
  ctx.closePath()
  ctx.fill()

  const style = preset.outfitStyle
  if (style === "suit_tie" || style === "blazer_pin") {
    // Inner white shirt V
    ctx.fillStyle = preset.innerShirtHex
    ctx.beginPath()
    ctx.moveTo(65, 114)
    ctx.lineTo(95, 114)
    ctx.lineTo(80, 145)
    ctx.closePath()
    ctx.fill()

    // Sculpted notched lapels
    ctx.fillStyle = darkHex
    ctx.beginPath()
    ctx.moveTo(60, 114)
    ctx.lineTo(69, 114)
    ctx.lineTo(77, 145)
    ctx.lineTo(65, 140)
    ctx.lineTo(69, 132)
    ctx.lineTo(59, 129)
    ctx.closePath()
    ctx.fill()

    ctx.beginPath()
    ctx.moveTo(100, 114)
    ctx.lineTo(91, 114)
    ctx.lineTo(83, 145)
    ctx.lineTo(95, 140)
    ctx.lineTo(91, 132)
    ctx.lineTo(101, 129)
    ctx.closePath()
    ctx.fill()

    // Crisp folded shirt collar flaps
    ctx.fillStyle = preset.innerShirtHex
    ctx.beginPath()
    ctx.moveTo(67, 113)
    ctx.lineTo(77, 119)
    ctx.lineTo(71, 126)
    ctx.closePath()
    ctx.moveTo(93, 113)
    ctx.lineTo(83, 119)
    ctx.lineTo(89, 126)
    ctx.closePath()
    ctx.fill()

    // Tie knot + blade
    ctx.fillStyle = preset.tieOrAccentHex
    ctx.beginPath()
    ctx.moveTo(76, 118)
    ctx.lineTo(84, 118)
    ctx.lineTo(82.5, 124)
    ctx.lineTo(77.5, 124)
    ctx.closePath()
    ctx.fill()
    ctx.beginPath()
    ctx.moveTo(77.5, 124)
    ctx.lineTo(82.5, 124)
    ctx.lineTo(86, 149)
    ctx.lineTo(80, 156)
    ctx.lineTo(74, 149)
    ctx.closePath()
    ctx.fill()

    // Pocket square & executive pin
    ctx.fillStyle = preset.innerShirtHex
    ctx.fillRect(96, 136, 12, 3.5)
    if (style === "blazer_pin") {
      ctx.fillStyle = "#f5c542"
      ctx.beginPath()
      ctx.arc(65, 129, 3.1, 0, Math.PI * 2)
      ctx.fill()
    }
  } else if (style === "polo") {
    // Ribbed polo collar flaps + contrasting 2-button placket
    ctx.fillStyle = preset.tieOrAccentHex
    ctx.fillRect(75, 116, 10, 26)
    ctx.fillStyle = darkHex
    ctx.beginPath()
    ctx.moveTo(63, 114)
    ctx.lineTo(76, 118)
    ctx.lineTo(68, 129)
    ctx.closePath()
    ctx.moveTo(97, 114)
    ctx.lineTo(84, 118)
    ctx.lineTo(92, 129)
    ctx.closePath()
    ctx.fill()
    ctx.fillStyle = preset.innerShirtHex
    for (const by of [125, 134]) {
      ctx.beginPath()
      ctx.arc(80, by, 1.9, 0, Math.PI * 2)
      ctx.fill()
    }
  } else if (style === "dress_shirt") {
    // Spread collar + front button placket
    ctx.fillStyle = darkHex
    ctx.fillRect(77.5, 118, 5, 44)
    ctx.fillStyle = preset.innerShirtHex
    ctx.beginPath()
    ctx.moveTo(63, 114)
    ctx.lineTo(78, 119)
    ctx.lineTo(69, 130)
    ctx.closePath()
    ctx.moveTo(97, 114)
    ctx.lineTo(82, 119)
    ctx.lineTo(91, 130)
    ctx.closePath()
    ctx.fill()
    for (const by of [129, 141, 153]) {
      ctx.beginPath()
      ctx.arc(80, by, 1.8, 0, Math.PI * 2)
      ctx.fill()
    }
  } else if (style === "skirt_blouse") {
    // Rounded Peter Pan blouse collar + sculpted ribbon bow
    ctx.fillStyle = preset.innerShirtHex
    ctx.beginPath()
    ctx.moveTo(62, 114)
    ctx.quadraticCurveTo(69, 129, 80, 120)
    ctx.quadraticCurveTo(91, 129, 98, 114)
    ctx.closePath()
    ctx.fill()

    ctx.fillStyle = preset.tieOrAccentHex
    ctx.beginPath()
    ctx.ellipse(71, 126, 8.5, 5.2, -0.25, 0, Math.PI * 2)
    ctx.ellipse(89, 126, 8.5, 5.2, 0.25, 0, Math.PI * 2)
    ctx.fill()
    ctx.beginPath()
    ctx.arc(80, 126, 4.2, 0, Math.PI * 2)
    ctx.fill()
  } else if (style === "dress_belt") {
    // Curved white neckline trim + gold accent brooch
    ctx.strokeStyle = preset.innerShirtHex
    ctx.lineWidth = 4.5
    ctx.lineCap = "round"
    ctx.beginPath()
    ctx.moveTo(63, 115)
    ctx.quadraticCurveTo(80, 130, 97, 115)
    ctx.stroke()
    ctx.fillStyle = "#f5c542"
    ctx.beginPath()
    ctx.arc(80, 129, 3.2, 0, Math.PI * 2)
    ctx.fill()
  } else {
    // chic_blazer & tech_blazer: open sleek lapels + contrasting inner top
    ctx.fillStyle = preset.innerShirtHex
    ctx.beginPath()
    ctx.moveTo(65, 114)
    ctx.lineTo(95, 114)
    ctx.lineTo(89, 162)
    ctx.lineTo(71, 162)
    ctx.closePath()
    ctx.fill()

    ctx.fillStyle = darkHex
    ctx.beginPath()
    ctx.moveTo(59, 114)
    ctx.lineTo(68, 114)
    ctx.lineTo(74, 158)
    ctx.lineTo(63, 158)
    ctx.closePath()
    ctx.moveTo(101, 114)
    ctx.lineTo(92, 114)
    ctx.lineTo(86, 158)
    ctx.lineTo(97, 158)
    ctx.closePath()
    ctx.fill()

    if (preset.hasItEmblem) {
      ctx.fillStyle = "#f5b81c"
      ctx.fillRect(92, 130, 19, 11)
      ctx.fillStyle = "#1c1404"
      ctx.font = "900 8px sans-serif"
      ctx.textAlign = "center"
      ctx.textBaseline = "middle"
      ctx.fillText("IT", 101.5, 136)
    } else {
      ctx.fillStyle = "#f5c542"
      ctx.beginPath()
      ctx.arc(80, 129, 3, 0, Math.PI * 2)
      ctx.fill()
    }
  }
}

function drawPortraitFrontHair(
  ctx: CanvasRenderingContext2D,
  preset: AvatarStylePreset
): void {
  const style = preset.hairStyle
  ctx.fillStyle = preset.hairColor

  if (style === "swept_back" || style === "slicked") {
    // Lifted executive swept quiff / sculpted pompadour
    ctx.beginPath()
    ctx.moveTo(39, 75)
    ctx.bezierCurveTo(36, 36, 58, 20, 84, 21)
    ctx.bezierCurveTo(108, 22, 124, 38, 121, 75)
    ctx.quadraticCurveTo(114, 52, 98, 49)
    ctx.quadraticCurveTo(80, 44, 60, 50)
    ctx.quadraticCurveTo(46, 54, 39, 75)
    ctx.closePath()
    ctx.fill()
  } else if (style === "side_part") {
    // Distinct left-parted sweeping bangs + neat temple sideburns
    ctx.beginPath()
    ctx.moveTo(39, 77)
    ctx.bezierCurveTo(37, 36, 58, 24, 80, 24)
    ctx.bezierCurveTo(104, 24, 123, 37, 121, 77)
    ctx.quadraticCurveTo(116, 62, 111, 66)
    ctx.quadraticCurveTo(96, 50, 62, 56)
    ctx.quadraticCurveTo(54, 52, 46, 68)
    ctx.closePath()
    ctx.fill()
  } else if (style === "neat_part") {
    // Comma-parted bangs cleanly above glasses
    ctx.beginPath()
    ctx.moveTo(39, 76)
    ctx.bezierCurveTo(37, 35, 58, 25, 80, 25)
    ctx.bezierCurveTo(102, 25, 123, 35, 121, 76)
    ctx.quadraticCurveTo(112, 56, 94, 58)
    ctx.quadraticCurveTo(84, 52, 80, 48)
    ctx.quadraticCurveTo(75, 52, 65, 58)
    ctx.quadraticCurveTo(48, 56, 39, 76)
    ctx.closePath()
    ctx.fill()
  } else if (style === "spiky" || style === "tousled_cool") {
    // Base crown + dynamic curved spikes
    ctx.beginPath()
    ctx.moveTo(39, 76)
    ctx.bezierCurveTo(37, 36, 58, 25, 80, 25)
    ctx.bezierCurveTo(102, 25, 123, 36, 121, 76)
    ctx.quadraticCurveTo(112, 56, 102, 66)
    ctx.quadraticCurveTo(90, 50, 80, 63)
    ctx.quadraticCurveTo(68, 49, 55, 65)
    ctx.quadraticCurveTo(46, 56, 39, 76)
    ctx.closePath()
    ctx.fill()

    // Sculpted upper tufts
    ctx.beginPath()
    ctx.moveTo(50, 40)
    ctx.lineTo(62, 17)
    ctx.lineTo(74, 33)
    ctx.lineTo(86, 15)
    ctx.lineTo(98, 34)
    ctx.lineTo(114, 23)
    ctx.lineTo(116, 48)
    ctx.closePath()
    ctx.fill()
  } else {
    // Female curved fringe + soft framing side locks
    ctx.beginPath()
    ctx.moveTo(38, 76)
    ctx.bezierCurveTo(36, 35, 58, 25, 80, 25)
    ctx.bezierCurveTo(102, 25, 124, 35, 122, 76)
    ctx.quadraticCurveTo(114, 56, 104, 65)
    ctx.quadraticCurveTo(92, 52, 80, 60)
    ctx.quadraticCurveTo(68, 52, 56, 65)
    ctx.quadraticCurveTo(46, 56, 38, 76)
    ctx.closePath()
    ctx.fill()

    // Framing side hair strands
    if (style === "bob" || style === "ponytail" || style === "long_wavy" || style === "layered_clips") {
      const len = style === "ponytail" ? 104 : style === "bob" ? 116 : 128
      ctx.beginPath()
      ctx.moveTo(41, 66)
      ctx.quadraticCurveTo(33, (66 + len) / 2, 46, len)
      ctx.quadraticCurveTo(45, (66 + len) / 2, 48, 68)
      ctx.closePath()
      ctx.fill()

      ctx.beginPath()
      ctx.moveTo(119, 66)
      ctx.quadraticCurveTo(127, (66 + len) / 2, 114, len)
      ctx.quadraticCurveTo(115, (66 + len) / 2, 112, 68)
      ctx.closePath()
      ctx.fill()
    }
  }

  // Subtle curved anime hair gloss highlight across crown
  ctx.strokeStyle = "rgba(255, 255, 255, 0.18)"
  ctx.lineWidth = 4.2
  ctx.lineCap = "round"
  ctx.beginPath()
  ctx.arc(80, 68, 30, Math.PI * 1.24, Math.PI * 1.76)
  ctx.stroke()

  if (preset.hairHighlight) {
    ctx.fillStyle = preset.hairHighlight
    ctx.beginPath()
    ctx.moveTo(95, 45)
    ctx.quadraticCurveTo(110, 54, 107, 68)
    ctx.quadraticCurveTo(97, 61, 91, 50)
    ctx.closePath()
    ctx.fill()
  }
  if (preset.hasHeadband) {
    ctx.strokeStyle = "#f3c64a"
    ctx.lineWidth = 4
    ctx.beginPath()
    ctx.arc(80, 68, 40, Math.PI * 1.15, Math.PI * 1.85)
    ctx.stroke()
    ctx.fillStyle = "#fffaf0"
    ctx.beginPath()
    ctx.arc(98, 32.5, 4.6, 0, Math.PI * 2)
    ctx.fill()
  }
  if (preset.hasHairClips) {
    ctx.fillStyle = "#f3c64a"
    ctx.save()
    ctx.translate(106, 55)
    ctx.rotate(-0.32)
    ctx.beginPath()
    ctx.roundRect?.(-7, -2, 14, 3.2, 1.5)
    if (!ctx.roundRect) ctx.rect(-7, -2, 14, 3.2)
    ctx.fill()
    ctx.beginPath()
    ctx.roundRect?.(-6, 3, 12, 3, 1.5)
    if (!ctx.roundRect) ctx.rect(-6, 3, 12, 3)
    ctx.fill()
    ctx.restore()
  }
}

/**
 * Renders a razor-sharp HiDPI (`size * 2` physical pixels at DPR 2) Chibi portrait PNG data URL
 * matching the exact sculpted 3D Chibi hairstyle, layered outfit, accessories, expression, and color.
 */
export function renderChibiPortraitDataUrl(
  avatarId: string,
  colorHex?: string | null,
  size = 160
): string {
  const preset = getAvatarStylePreset(avatarId)
  const resolvedHex = resolveOutfitHex(colorHex) ?? preset.defaultOutfitHex
  const pixelSize = getPortraitPixelSize(size)
  const cacheKey = `${preset.id}|${resolvedHex}|${pixelSize}`
  const cached = portraitCache.get(cacheKey)
  if (cached) return cached

  const canvas = document.createElement("canvas")
  canvas.width = pixelSize
  canvas.height = pixelSize
  const ctx = safeGet2DContext(canvas)
  if (!ctx) {
    const fallback = buildSvgChibiPortraitDataUrl(preset, resolvedHex, size)
    portraitCache.set(cacheKey, fallback)
    return fallback
  }

  ctx.save()
  const s = pixelSize / 160
  ctx.scale(s, s)

  const isFemale = preset.gender === "female"
  const isCool = preset.id === "danhtrongit"
  const isCheerful =
    preset.faceVariant === "male_energetic" ||
    preset.faceVariant === "female_cheerful"
  const isElegant = preset.faceVariant === "female_elegant"

  // Warm-navy studio portrait backdrop
  const bg = ctx.createRadialGradient(80, 56, 12, 80, 82, 98)
  bg.addColorStop(0, "#243b6b")
  bg.addColorStop(0.65, "#152342")
  bg.addColorStop(1, "#0d162c")
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, 160, 160)

  // Subtle gold studio halo behind chibi head
  const halo = ctx.createRadialGradient(80, 74, 16, 80, 74, 62)
  halo.addColorStop(0, "rgba(243, 205, 106, 0.24)")
  halo.addColorStop(1, "rgba(243, 205, 106, 0)")
  ctx.fillStyle = halo
  ctx.beginPath()
  ctx.arc(80, 74, 62, 0, Math.PI * 2)
  ctx.fill()

  // 1. Back hair volume
  drawPortraitBackHair(ctx, preset)

  // 2. Layered shoulders & outfit
  drawPortraitOutfit(ctx, preset, resolvedHex)

  // 3. Cute neck with soft chin shadow
  ctx.fillStyle = preset.skinColor
  ctx.fillRect(72, 104, 16, 14)
  ctx.fillStyle = "rgba(176, 112, 82, 0.24)"
  ctx.beginPath()
  ctx.ellipse(80, 110, 9.5, 4.5, 0, 0, Math.PI * 2)
  ctx.fill()

  // 4. Sculpted ears with inner shadow
  ctx.fillStyle = preset.skinColor
  ctx.beginPath()
  ctx.ellipse(40, 80, 7.2, 8.6, 0, 0, Math.PI * 2)
  ctx.ellipse(120, 80, 7.2, 8.6, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = "rgba(196, 130, 98, 0.34)"
  ctx.beginPath()
  ctx.ellipse(41, 80, 3.6, 4.8, 0, 0, Math.PI * 2)
  ctx.ellipse(119, 80, 3.6, 4.8, 0, 0, Math.PI * 2)
  ctx.fill()

  // 5. Sculpted Chibi head (puffed cheeks + gently tapered chin!)
  const skinGrad = ctx.createRadialGradient(74, 64, 8, 80, 77, 44)
  skinGrad.addColorStop(0, "#fff2e4")
  skinGrad.addColorStop(0.56, preset.skinColor)
  skinGrad.addColorStop(1, "#e8b38d")
  ctx.fillStyle = skinGrad
  ctx.beginPath()
  ctx.moveTo(80, 38.5)
  ctx.bezierCurveTo(105, 38.5, 120.5, 54, 120.5, 76)
  ctx.bezierCurveTo(120.5, 96, 104, 112.5, 80, 113.5)
  ctx.bezierCurveTo(56, 112.5, 39.5, 96, 39.5, 76)
  ctx.bezierCurveTo(39.5, 54, 55, 38.5, 80, 38.5)
  ctx.closePath()
  ctx.fill()

  // 6. Cheek blush
  for (const bx of [54, 107]) {
    const blush = ctx.createRadialGradient(bx, 88.5, 1, bx, 88.5, 10.5)
    blush.addColorStop(
      0,
      `rgba(255, 116, 144, ${isFemale ? 0.46 : isCool ? 0.24 : 0.34})`
    )
    blush.addColorStop(1, "rgba(255, 116, 144, 0)")
    ctx.fillStyle = blush
    ctx.beginPath()
    ctx.ellipse(bx, 88.5, 10.5, 6.4, 0, 0, Math.PI * 2)
    ctx.fill()
  }

  // 7. Glossy sparkle eyes (shifted slightly for charming 3/4 feel)
  const exShift = 1.5
  drawPortraitEye(
    ctx,
    63 + exShift,
    78,
    isFemale ? 7.8 : 7,
    isCool ? 6.8 : isFemale ? 9.2 : 8.2,
    preset.eyeColor,
    isFemale,
    isElegant,
    isCool,
    -1
  )
  drawPortraitEye(
    ctx,
    97 + exShift,
    78,
    isFemale ? 7.8 : 7,
    isCool ? 6.8 : isFemale ? 9.2 : 8.2,
    preset.eyeColor,
    isFemale,
    isElegant,
    isCool,
    1
  )

  // 8. Expressive eyebrows
  ctx.strokeStyle = isCool ? "#151b26" : "#3a271d"
  ctx.lineWidth = isFemale ? 1.8 : 2.3
  ctx.lineCap = "round"
  ctx.beginPath()
  if (isCool) {
    ctx.moveTo(55 + exShift, 64)
    ctx.lineTo(71 + exShift, 66.5)
    ctx.moveTo(89 + exShift, 66.5)
    ctx.lineTo(105 + exShift, 63.5)
  } else {
    ctx.moveTo(56 + exShift, 65)
    ctx.quadraticCurveTo(63 + exShift, 61.5, 70 + exShift, 65)
    ctx.moveTo(90 + exShift, 65)
    ctx.quadraticCurveTo(97 + exShift, 61.5, 104 + exShift, 65)
  }
  ctx.stroke()

  // 9. Cute tiny nose accent
  ctx.fillStyle = "rgba(184, 118, 86, 0.56)"
  ctx.beginPath()
  ctx.ellipse(80 + exShift, 87.2, 2.0, 1.4, 0, 0, Math.PI * 2)
  ctx.fill()

  // 10. Expressive mouth
  ctx.strokeStyle = "#7a3b2e"
  ctx.lineWidth = 2.2
  ctx.lineCap = "round"
  if (isCool) {
    ctx.beginPath()
    ctx.moveTo(74 + exShift, 96)
    ctx.quadraticCurveTo(82 + exShift, 98, 90 + exShift, 93)
    ctx.stroke()
  } else if (isCheerful) {
    ctx.fillStyle = "#e06b74"
    ctx.beginPath()
    ctx.arc(80 + exShift, 93.5, 6.2, 0.08 * Math.PI, 0.92 * Math.PI)
    ctx.closePath()
    ctx.fill()
    ctx.stroke()
  } else {
    ctx.beginPath()
    ctx.arc(80 + exShift, 91.5, 6.4, 0.16 * Math.PI, 0.84 * Math.PI)
    ctx.stroke()
  }

  // 11. Front sculpted hairstyle + highlight + accessories
  drawPortraitFrontHair(ctx, preset)

  // 12. Sleek glasses overlay with subtle reflection glint
  if (preset.hasGlasses) {
    ctx.strokeStyle = preset.glassesColor ?? "#1f2937"
    ctx.lineWidth = isFemale ? 2.0 : 2.4
    ctx.fillStyle = isCool
      ? "rgba(56, 189, 248, 0.22)"
      : "rgba(224, 242, 254, 0.16)"
    const rx = isCool ? 12.6 : 12.0
    const ry = isCool ? 10.6 : 11.8
    for (const gx of [63 + exShift, 97 + exShift]) {
      ctx.beginPath()
      ctx.ellipse(gx, 78, rx, ry, 0, 0, Math.PI * 2)
      ctx.fill()
      ctx.stroke()
      // Subtle diagonal glass specular reflection
      ctx.strokeStyle = "rgba(255, 255, 255, 0.38)"
      ctx.lineWidth = 1.4
      ctx.beginPath()
      ctx.moveTo(gx - 6, 73)
      ctx.lineTo(gx - 2, 70)
      ctx.stroke()
      ctx.strokeStyle = preset.glassesColor ?? "#1f2937"
      ctx.lineWidth = isFemale ? 2.0 : 2.4
    }
    ctx.beginPath()
    ctx.moveTo(63 + exShift + rx, 78)
    ctx.quadraticCurveTo(80 + exShift, 75.5, 97 + exShift - rx, 78)
    ctx.stroke()
  }

  ctx.restore()
  const url = canvas.toDataURL("image/png")
  portraitCache.set(cacheKey, url)
  return url
}

/** Generates crisp Chibi portrait data URLs for all 11 canonical Trading Floor avatars. */
export function buildAllChibiPortraits(
  colorHex?: string | null,
  size = 160
): Record<string, string> {
  const out: Record<string, string> = {}
  for (const avatar of AVATARS) {
    out[avatar.id] = renderChibiPortraitDataUrl(avatar.id, colorHex, size)
  }
  return out
}

// ---------- Live Interactive 3D Mini-Stage Controller ----------

export interface Chibi3DPreviewSpec {
  avatarId: string
  colorHex?: string | null
  size?: number
  anim?: ChibiAnimMode
  interactive?: boolean
  lite?: boolean
  onContextLost?: () => void
}

export interface Chibi3DPreviewHandle {
  update: (next: {
    avatarId?: string
    colorHex?: string | null
    size?: number
    anim?: ChibiAnimMode
  }) => void
  dispose: () => void
}

/** Charming 3/4 front idle presentation angle & gentle sway bounds (never turns back to camera). */
export const PREVIEW_INITIAL_YAW = 0.22
export const PREVIEW_SWAY_AMP = 0.32
export const PREVIEW_SWAY_FREQ = 0.9

export function computePreviewYaw(baseYaw: number, swayTimeS: number): number {
  return baseYaw + Math.sin(swayTimeS * PREVIEW_SWAY_FREQ) * PREVIEW_SWAY_AMP
}

/**
 * Mounts a live, responsive interactive 3D Chibi character inside `container`.
 * Presents the character at a charming 3/4 front angle with gentle idle sway while supporting smooth 360° drag.
 * Respects `prefers-reduced-motion: reduce` and renders crisply up to devicePixelRatio 2.
 * Returns `null` cleanly if WebGL is unavailable so callers can render the crisp 2D portrait fallback.
 */
export function mountChibi3DPreview(
  container: HTMLElement,
  initial: Chibi3DPreviewSpec
): Chibi3DPreviewHandle | null {
  if (
    typeof navigator !== "undefined" &&
    /\bjsdom\b/i.test(navigator.userAgent)
  ) {
    return null
  }
  let renderer: THREE.WebGLRenderer
  try {
    renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: "high-performance",
    })
  } catch {
    return null
  }

  let fallbackSize = initial.size ?? 168
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.08

  const dom = renderer.domElement
  dom.style.width = "100%"
  dom.style.height = "100%"
  dom.style.display = "block"
  dom.style.cursor = initial.interactive === false ? "default" : "grab"
  container.appendChild(dom)

  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 30)
  camera.position.set(0, 1.3, 3.58)
  camera.lookAt(0, 0.87, 0)

  let disposed = false

  const syncRendererSize = (): void => {
    if (disposed) return
    const w = Math.max(1, Math.round(container.clientWidth || fallbackSize))
    const h = Math.max(1, Math.round(container.clientHeight || fallbackSize))
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    renderer.setPixelRatio(dpr)
    renderer.setSize(w, h, false)
    camera.aspect = w / h
    camera.updateProjectionMatrix()
  }

  syncRendererSize()

  let resizeObserver: ResizeObserver | null = null
  if (typeof ResizeObserver !== "undefined") {
    resizeObserver = new ResizeObserver(() => syncRendererSize())
    resizeObserver.observe(container)
  }

  // Warm 3-point chibi studio lighting highlighting sculpted cheeks, hair & lapels
  const hemi = new THREE.HemisphereLight(0xfff9f0, 0x6f7c99, 1.38)
  scene.add(hemi)
  const key = new THREE.DirectionalLight(0xfff4e0, 1.65)
  key.position.set(2.4, 3.8, 3.2)
  scene.add(key)
  const rim = new THREE.DirectionalLight(0x93c5fd, 0.92)
  rim.position.set(-2.6, 2.2, -2.5)
  scene.add(rim)

  // Subtle glowing circular pedestal ring
  const ringMat = new THREE.MeshBasicMaterial({
    color: 0xe9b949,
    transparent: true,
    opacity: 0.42,
  })
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.46, 0.52, 32), ringMat)
  ring.rotation.x = -Math.PI / 2
  ring.position.y = 0.005
  scene.add(ring)

  let currentAvatarId = initial.avatarId
  let currentColorHex = initial.colorHex ?? null
  let currentAnim: ChibiAnimMode = initial.anim ?? "idle"
  const lite = initial.lite === true
  let rig: ChibiRig = createChibiCharacter({
    avatarId: currentAvatarId,
    outfitColorHex: currentColorHex,
    lite,
  })
  scene.add(rig.root)

  let baseYaw = PREVIEW_INITIAL_YAW
  let swayTime = 0
  let dragging = false
  let lastX = 0
  let contextLost = false
  let rafId = 0
  let lastTs = performance.now()

  // Present initial frame immediately facing front 3/4
  rig.update(0, { anim: currentAnim, facingRad: baseYaw })
  renderer.render(scene, camera)

  const onPointerDown = (e: PointerEvent): void => {
    if (initial.interactive === false) return
    if (!prefersReducedMotion()) {
      baseYaw = computePreviewYaw(baseYaw, swayTime)
    }
    swayTime = 0
    dragging = true
    lastX = e.clientX
    dom.style.cursor = "grabbing"
    dom.setPointerCapture?.(e.pointerId)
  }
  const onPointerMove = (e: PointerEvent): void => {
    if (!dragging) return
    const dx = e.clientX - lastX
    lastX = e.clientX
    baseYaw += dx * 0.015
  }
  const onPointerUp = (): void => {
    dragging = false
    dom.style.cursor = initial.interactive === false ? "default" : "grab"
  }
  const onContextLost = (e: Event): void => {
    e.preventDefault()
    contextLost = true
    initial.onContextLost?.()
  }
  const onContextRestored = (): void => {
    contextLost = false
    syncRendererSize()
  }

  dom.addEventListener("pointerdown", onPointerDown)
  dom.addEventListener("pointermove", onPointerMove)
  dom.addEventListener("pointerup", onPointerUp)
  dom.addEventListener("pointercancel", onPointerUp)
  dom.addEventListener("webglcontextlost", onContextLost)
  dom.addEventListener("webglcontextrestored", onContextRestored)

  const tick = (now: number): void => {
    if (disposed) return
    rafId = requestAnimationFrame(tick)
    if (contextLost) return
    const dt = Math.min(0.05, Math.max(0, (now - lastTs) / 1000))
    lastTs = now
    const reduced = prefersReducedMotion()
    if (!dragging && !reduced) {
      swayTime += dt
    }
    const facingRad =
      dragging || reduced ? baseYaw : computePreviewYaw(baseYaw, swayTime)
    rig.update(dt, {
      anim: currentAnim,
      facingRad,
      reducedMotion: reduced,
    })
    renderer.render(scene, camera)
  }
  rafId = requestAnimationFrame(tick)

  return {
    update: (next) => {
      if (disposed) return
      if (next.anim !== undefined) currentAnim = next.anim
      if (next.size !== undefined && next.size > 0) {
        fallbackSize = next.size
        syncRendererSize()
      }
      const nextColor =
        next.colorHex !== undefined ? next.colorHex : currentColorHex
      if (next.avatarId !== undefined && next.avatarId !== currentAvatarId) {
        scene.remove(rig.root)
        rig.dispose()
        currentAvatarId = next.avatarId
        currentColorHex = nextColor
        rig = createChibiCharacter({
          avatarId: currentAvatarId,
          outfitColorHex: currentColorHex,
          lite,
        })
        scene.add(rig.root)
        baseYaw = PREVIEW_INITIAL_YAW
        swayTime = 0
        rig.update(0, { anim: currentAnim, facingRad: baseYaw })
      } else if (nextColor !== currentColorHex) {
        currentColorHex = nextColor
        rig.setOutfitColor(currentColorHex)
      }
    },
    dispose: () => {
      if (disposed) return
      disposed = true
      cancelAnimationFrame(rafId)
      resizeObserver?.disconnect()
      dom.removeEventListener("pointerdown", onPointerDown)
      dom.removeEventListener("pointermove", onPointerMove)
      dom.removeEventListener("pointerup", onPointerUp)
      dom.removeEventListener("pointercancel", onPointerUp)
      dom.removeEventListener("webglcontextlost", onContextLost)
      dom.removeEventListener("webglcontextrestored", onContextRestored)
      scene.remove(rig.root)
      rig.dispose()
      ring.geometry.dispose()
      ringMat.dispose()
      renderer.dispose()
      if (dom.parentNode === container) {
        container.removeChild(dom)
      }
    },
  }
}
