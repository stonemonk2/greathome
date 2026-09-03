/**
 * Verify the press PDF by rasterising it, rather than trusting that it was
 * written correctly. Checks that survive only here:
 *
 *   - the CMYK hero is not a negative (the /Decode question)
 *   - outlined glyphs landed in the right place (the y-flip between SVG's
 *     top-left origin and PDF's bottom-left one)
 *   - the QR still decodes out of the real press file, under blur
 *
 *   node brand/verify-print.mjs
 */
import { createCanvas } from '@napi-rs/canvas'
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs'
import sharp from 'sharp'
import jsQR from 'jsqr'
import { readFileSync } from 'fs'
import path from 'path'
import { W, H, geom, URL_ENCODED } from './sign-spec.mjs'

const OUT = path.resolve(import.meta.dirname)
const PDF = path.join(OUT, 'sign-print-36x24.pdf')
const PNG = path.join(OUT, 'sign-print-raster.png')

const doc = await pdfjs.getDocument({
  data: new Uint8Array(readFileSync(PDF)),
  isEvalSupported: false,
}).promise
const page = await doc.getPage(1)

const SCALE = 1.6
const vp = page.getViewport({ scale: SCALE })
const canvas = createCanvas(Math.ceil(vp.width), Math.ceil(vp.height))
const ctx = canvas.getContext('2d')
ctx.fillStyle = '#fff'
ctx.fillRect(0, 0, canvas.width, canvas.height)
await page.render({ canvasContext: ctx, viewport: vp, intent: 'print' }).promise

const png = canvas.toBuffer('image/png')
await sharp(png).toFile(PNG)
console.log(`rastered: ${canvas.width}x${canvas.height} -> ${path.basename(PNG)}`)

const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
const px = (x, y) => {
  const i = (Math.round(y) * info.width + Math.round(x)) * info.channels
  return [data[i], data[i + 1], data[i + 2]]
}
const mean = (x0, y0, x1, y1) => {
  let r = 0, g = 0, b = 0, n = 0
  for (let y = y0; y < y1; y += 3) for (let x = x0; x < x1; x += 3) {
    const p = px(x, y); r += p[0]; g += p[1]; b += p[2]; n++
  }
  return [r / n, g / n, b / n]
}
const S = info.width / W                          // raster px per PDF point
const fmt = (c) => c.map((v) => Math.round(v)).join(',')

// --- 1. orientation: the dark column is top-left, the cream band is bottom ---
const topLeft = mean(20 * S, 20 * S, 300 * S, 200 * S)
const bottomMid = mean(1000 * S, 1650 * S, 1600 * S, 1700 * S)
const darkOK = topLeft[0] < 90 && topLeft[1] < 90
const creamOK = bottomMid[0] > 180 && bottomMid[1] > 175
console.log(`orient  : top-left ${fmt(topLeft)} ${darkOK ? 'dark OK' : 'WRONG'} | bottom band ${fmt(bottomMid)} ${creamOK ? 'cream OK' : 'WRONG'}`)

// --- 2. hero is a photo, not a negative ---
// Compare the PDF's hero against the same crop rendered in RGB for the proof.
const { HERO_X, HERO_Y, HERO_W, HERO_H } = geom
const heroPdf = mean((HERO_X + 20) * S, (HERO_Y + 20) * S, (HERO_X + HERO_W - 20) * S, (HERO_Y + HERO_H - 20) * S)
const proofRaster = await sharp(path.join(OUT, 'sign-proof.png')).metadata()
const PS = proofRaster.width / W
const proofPng = await sharp(path.join(OUT, 'sign-proof.png'))
  .extract({
    left: Math.round((HERO_X + 20) * PS), top: Math.round((HERO_Y + 20) * PS),
    width: Math.round((HERO_W - 40) * PS), height: Math.round((HERO_H - 40) * PS),
  }).stats()
const heroProof = [proofPng.channels[0].mean, proofPng.channels[1].mean, proofPng.channels[2].mean]
const delta = Math.hypot(...heroPdf.map((v, i) => v - heroProof[i]))
console.log(`hero    : pdf ${fmt(heroPdf)} vs proof ${fmt(heroProof)} -> delta ${delta.toFixed(0)} ${delta < 60 ? 'OK (not inverted)' : 'INVERTED / WRONG'}`)

// --- 3. QR decodes out of the press file, including under blur ---
for (const [w, blur] of [[2400, 0], [1100, 0.8], [700, 1.2]]) {
  let pipe = sharp(png).resize({ width: w })
  if (blur) pipe = pipe.blur(blur)
  const b = await pipe.ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const r = jsQR(new Uint8ClampedArray(b.data), b.info.width, b.info.height)
  console.log(`qr      : ${String(w).padStart(4)}px blur ${blur} -> ${r?.data === URL_ENCODED ? 'decodes' : 'FAIL (' + (r?.data ?? 'null') + ')'}`)
}

// --- 4. bleed: every edge of the rastered page is artwork ---
let bad = 0
for (let x = 0; x < info.width; x += 11) {
  for (const y of [1, info.height - 2]) { const p = px(x, y); if (p[0] > 240 && p[1] > 240 && p[2] > 240) bad++ }
}
for (let y = 0; y < info.height; y += 11) {
  for (const x of [1, info.width - 2]) { const p = px(x, y); if (p[0] > 240 && p[1] > 240 && p[2] > 240) bad++ }
}
console.log(`bleed   : ${bad} white edge samples (want 0)`)
