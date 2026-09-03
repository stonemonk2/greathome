/**
 * Single source of truth for the 36" x 24" yard sign.
 *
 * Both the RGB screen proof (build-sign.mjs) and the CMYK press PDF
 * (build-print.mjs) consume the scene this module returns, so the two cannot
 * drift apart. Nothing here knows about SVG or PDF.
 *
 * DIE-LINE IS DERIVED, NOT DOWNLOADED. The 18x24 Vistaprint template gave
 * bleed = trim + 0.125in per side and safety = 0.125in inside trim; the same
 * rules are applied here. Confirm against the real 24x36 template before press.
 *   bleed  2610 x 1746 pt = 36.25 x 24.25 in
 *   trim   inset  9 pt -> 36 x 24 in
 *   safety inset 18 pt -> 35.75 x 23.75 in
 * Coordinates are PostScript points at 72/inch, origin TOP-LEFT.
 *
 * Type: Georgia Bold carries the voice, Arial Bold carries the data. Georgia
 * ships old-style figures, which drop numerals below the baseline -- fine in a
 * book, bad on a sign read at speed -- so every numeral here is Arial.
 */
import QR from 'qrcode'

// ---- die-line ----
export const W = 2610, H = 1746
export const TRIM = 9, SAFE = 18

/**
 * Palette. `rgb` drives the screen proof; `cmyk` (0-1 each) drives the press
 * file, converted through the U.S. Web Coated (SWOP) profile that ships with
 * Windows -- not the naive 1-max(r,g,b) formula, which turns this gold muddy.
 *
 * INK is the exception: SWOP maps #14110F to K90 with almost no CMY, which
 * prints as flat grey over a field this large, so it uses the rich black
 * Vistaprint's own guidelines recommend (C40 M30 Y30 K100, 200% coverage).
 *
 * FLAT_K is pure black on one plate. The QR and every dark-on-cream character
 * use it: a four-plate black fringes under misregistration, which is precisely
 * what destroys a scan and softens type.
 */
export const C = {
  INK: { rgb: '#14110F', cmyk: [0.40, 0.30, 0.30, 1.00] },
  GOLD: { rgb: '#B8873A', cmyk: [0.208, 0.443, 0.886, 0.024] },
  CREAM: { rgb: '#EDE6DA', cmyk: [0.055, 0.067, 0.125, 0.004] },
  MUTED: { rgb: '#8A8377', cmyk: [0.306, 0.278, 0.349, 0.267] },
  PANEL_SUB: { rgb: '#5C574F', cmyk: [0.310, 0.314, 0.361, 0.580] },
  FLAT_K: { rgb: '#14110F', cmyk: [0, 0, 0, 1] },
}

// ---- copy ----
// Apex 301s to www.greathome.us. At EC=Q this is 25 modules -- the same count
// the long /121a URL needed at EC=M, so the stronger error correction is free.
export const URL_ENCODED = 'https://greathome.us'
const URL_SHOWN = 'www.greathome.us'

// Unstaged kitchen, straight off the original 4080x3072 frame rather than a
// web derivative, so the hero is not resolution-capped. The crop drops an
// out-of-focus curtain on the left edge and dead floor at the bottom right.
// Correction is exposure only -- no hue shift, because warming this frame
// pushes the wall paint toward beige, which misrepresents the finish.
export const HERO = '121a/121a-images/121a-images-reshoot/PXL_20260830_142131882.jpg'
export const HERO_CROP = { left: 800, top: 400, width: 2500, height: 1875 }
export const HERO_ADJUST = { brightness: 1.05, saturation: 1.05, gamma: 1.04 }

// Font identity, resolved to a file by the print build and to a family name by
// the proof. GB = Georgia Bold, AB = Arial Bold, AR = Arial Regular.
export const FONTS = {
  GB: { file: 'georgiab.ttf', family: "Georgia, 'Times New Roman', serif", weight: 700 },
  AB: { file: 'arialbd.ttf', family: 'Arial, Helvetica, sans-serif', weight: 700 },
  AR: { file: 'arial.ttf', family: 'Arial, Helvetica, sans-serif', weight: 400 },
}

// ---- layout ----
const PANEL_X = 1480        // cream QR panel, bleeds off the right edge
const BAND_Y = 1416         // full-width cream URL band, bleeds off the bottom
const M = 81                // 1in in from the trim edge
const COL_R = PANEL_X - 84  // keeps left-column type clear of the cream panel

const HERO_X = M, HERO_Y = 730, HERO_W = 780, HERO_H = 585
const SIDE = HERO_X + HERO_W + 62

const PANEL_MID = (PANEL_X + (W - TRIM)) / 2
const QR_SIZE = 840
const QR_X = PANEL_MID - QR_SIZE / 2
const QR_Y = 340

export const geom = {
  PANEL_X, BAND_Y, M, COL_R, HERO_X, HERO_Y, HERO_W, HERO_H,
  SIDE, PANEL_MID, QR_SIZE, QR_X, QR_Y,
  /** Widest a left-column run may be before it collides with the cream panel. */
  colWidth: COL_R - M,
  /** Quiet zone actually available vs the 4 modules the spec requires. */
  quiet: Math.min(QR_X - PANEL_X, (W - TRIM) - (QR_X + QR_SIZE)),
}

/** QR module matrix. Level Q survives 25% damage at no extra module cost here. */
export function qrMatrix() {
  const d = QR.create(URL_ENCODED, { errorCorrectionLevel: 'Q' })
  return { n: d.modules.size, data: d.modules.data, module: QR_SIZE / d.modules.size }
}

/**
 * The scene, in paint order. Bleeding fills are over-extended past the canvas:
 * an edge landing exactly on the boundary antialiases to partial alpha, which
 * can print as a white hairline at the cut.
 *
 * `bound` on a text run is the maximum width it may occupy; the print build
 * measures the real outlined width against it and fails loudly on overflow.
 */
export function scene() {
  const t = (o) => ({ type: 'text', anchor: 'start', ls: 0, ...o })
  return [
    { type: 'rect', x: -8, y: -8, w: W + 16, h: H + 16, color: 'INK' },
    { type: 'rect', x: PANEL_X, y: -8, w: W - PANEL_X + 8, h: BAND_Y + 8, color: 'CREAM' },
    { type: 'rect', x: -8, y: BAND_Y, w: W + 16, h: H - BAND_Y + 8, color: 'CREAM' },

    // ---- left column ----
    t({ x: M, y: 150, s: 'GREATHOME', font: 'GB', size: 52, color: 'GOLD', ls: 9, bound: geom.colWidth }),
    // 232, not 240: outlined Georgia Bold measures 1354pt at 240, which
    // overhangs the gold rule beneath it. Sized to the column instead.
    t({ x: M, y: 440, s: 'FOR RENT', font: 'GB', size: 232, color: 'CREAM', ls: 2, bound: geom.colWidth }),
    { type: 'rect', x: M, y: 502, w: COL_R - M, h: 4, color: 'GOLD' },

    // No rent on the sign: it is printed once and the asking price is not
    // fixed. The QR and URL carry the live number.
    t({ x: M, y: 622, s: '1 BR + OFFICE  ·  1 BATH  ·  650 SQ FT', font: 'AB', size: 66, color: 'CREAM', ls: 2, bound: geom.colWidth }),
    t({ x: M, y: 682, s: 'Taken to the studs and rebuilt in 2026', font: 'AR', size: 36, color: 'MUTED', ls: 1, bound: geom.colWidth }),

    { type: 'image', x: HERO_X, y: HERO_Y, w: HERO_W, h: HERO_H },

    // "NOW" rather than a date: a printed sign outlives any specific one.
    { type: 'rect', x: SIDE, y: HERO_Y + 8, w: 4, h: 184, color: 'GOLD' },
    t({ x: SIDE + 34, y: HERO_Y + 58, s: 'AVAILABLE', font: 'AB', size: 40, color: 'GOLD', ls: 5, bound: COL_R - SIDE - 34 }),
    t({ x: SIDE + 34, y: HERO_Y + 158, s: 'NOW', font: 'AB', size: 94, color: 'CREAM', ls: 1, bound: COL_R - SIDE - 34 }),

    t({ x: SIDE, y: HERO_Y + HERO_H - 54, s: '121 Santa Fe Ave, Unit A', font: 'AB', size: 36, color: 'CREAM', ls: 1, bound: COL_R - SIDE }),
    t({ x: SIDE, y: HERO_Y + HERO_H, s: 'Point Richmond', font: 'AR', size: 34, color: 'MUTED', ls: 1, bound: COL_R - SIDE }),

    // ---- right panel ----
    t({ x: PANEL_MID, y: 188, s: 'SCAN FOR PHOTOS,', font: 'AB', size: 48, color: 'FLAT_K', ls: 6, anchor: 'middle', bound: W - TRIM - PANEL_X }),
    t({ x: PANEL_MID, y: 254, s: 'VIDEO & FLOOR PLAN', font: 'AB', size: 48, color: 'FLAT_K', ls: 6, anchor: 'middle', bound: W - TRIM - PANEL_X }),

    { type: 'qr', x: QR_X, y: QR_Y, size: QR_SIZE, color: 'FLAT_K' },

    { type: 'rect', x: PANEL_MID - 230, y: QR_Y + QR_SIZE + 78, w: 460, h: 3, color: 'GOLD' },
    t({ x: PANEL_MID, y: QR_Y + QR_SIZE + 146, s: 'Contact & apply online', font: 'AR', size: 42, color: 'PANEL_SUB', anchor: 'middle', bound: W - TRIM - PANEL_X }),

    // ---- bottom band ----
    t({ x: W / 2, y: 1650, s: URL_SHOWN, font: 'AB', size: 240, color: 'FLAT_K', ls: -2, anchor: 'middle', bound: W - 2 * M }),
  ]
}
