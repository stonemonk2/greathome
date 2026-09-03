/**
 * RGB screen proof of the yard sign. Geometry and copy come from sign-spec.mjs,
 * which build-print.mjs also consumes, so proof and press file cannot diverge.
 *
 *   node brand/build-sign.mjs
 */
import sharp from 'sharp'
import jsQR from 'jsqr'
import { writeFileSync } from 'fs'
import path from 'path'
import {
  W, H, TRIM, SAFE, C, FONTS, URL_ENCODED, HERO, HERO_CROP, HERO_ADJUST,
  geom, qrMatrix, scene,
} from './sign-spec.mjs'

const ROOT = path.resolve(import.meta.dirname, '..')
const OUT = path.join(ROOT, 'brand')

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

async function heroDataUri(w, h) {
  const buf = await sharp(path.join(ROOT, HERO))
    .rotate()
    .extract(HERO_CROP)
    .modulate({ brightness: HERO_ADJUST.brightness, saturation: HERO_ADJUST.saturation })
    .gamma(HERO_ADJUST.gamma)
    .resize({ width: Math.round(w * 300 / 72), height: Math.round(h * 300 / 72), fit: 'cover', withoutEnlargement: true })
    .jpeg({ quality: 92 })
    .toBuffer()
  const meta = await sharp(buf).metadata()
  return { uri: `data:image/jpeg;base64,${buf.toString('base64')}`, px: meta.width, dpi: meta.width / (w / 72) }
}

function qrRects(x, y, color) {
  const { n, data, module: m } = qrMatrix()
  let r = ''
  for (let row = 0; row < n; row++) {
    for (let col = 0; col < n; col++) {
      if (!data[row * n + col]) continue
      // +0.5 overlap kills hairline seams between modules in RIP output
      r += `<rect x="${(x + col * m).toFixed(3)}" y="${(y + row * m).toFixed(3)}" width="${(m + 0.5).toFixed(3)}" height="${(m + 0.5).toFixed(3)}"/>`
    }
  }
  return `<g fill="${C[color].rgb}" shape-rendering="crispEdges">${r}</g>`
}

async function build({ guides }) {
  const hero = await heroDataUri(geom.HERO_W, geom.HERO_H)

  const body = scene().map((el) => {
    if (el.type === 'rect') {
      return `<rect x="${el.x}" y="${el.y}" width="${el.w}" height="${el.h}" fill="${C[el.color].rgb}"/>`
    }
    if (el.type === 'image') {
      return `<image x="${el.x}" y="${el.y}" width="${el.w}" height="${el.h}" xlink:href="${hero.uri}" preserveAspectRatio="xMidYMid slice"/>`
    }
    if (el.type === 'qr') return qrRects(el.x, el.y, el.color)
    const f = FONTS[el.font]
    const anchor = el.anchor === 'middle' ? ' text-anchor="middle"' : ''
    return `<text x="${el.x}" y="${el.y}"${anchor} font-family="${f.family}" font-size="${el.size}" font-weight="${f.weight}" fill="${C[el.color].rgb}" letter-spacing="${el.ls}">${esc(el.s)}</text>`
  }).join('\n  ')

  const guideLayer = guides ? `
    <g fill="none" stroke-width="4">
      <rect x="0" y="0" width="${W}" height="${H}" stroke="#E61937"/>
      <rect x="${TRIM}" y="${TRIM}" width="${W - 2 * TRIM}" height="${H - 2 * TRIM}" stroke="#1D44B8"/>
      <rect x="${SAFE}" y="${SAFE}" width="${W - 2 * SAFE}" height="${H - 2 * SAFE}" stroke="#19FF00"/>
    </g>` : ''

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  ${body}${guideLayer}
</svg>`

  const name = guides ? 'sign-proof-guides' : 'sign-proof'
  writeFileSync(path.join(OUT, `${name}.svg`), svg)
  await sharp(Buffer.from(svg), { density: 110 }).png().toFile(path.join(OUT, `${name}.png`))
  return { hero }
}

/**
 * Scan simulation: downscale the finished proof to the pixel width a phone
 * would resolve across a 36in sign at a given distance, add blur for optics
 * and motion, then decode. Decoding the pristine render proves nothing.
 */
async function scanSim() {
  const png = path.join(OUT, 'sign-proof.png')
  const cases = [
    { px: 1600, blur: 0.5, at: '~8 ft' }, { px: 1100, blur: 0.8, at: '~12 ft' },
    { px: 800, blur: 1.0, at: '~17 ft' }, { px: 560, blur: 1.3, at: '~24 ft' },
    { px: 400, blur: 1.6, at: '~34 ft' },
  ]
  const out = []
  for (const c of cases) {
    const b = await sharp(png).resize({ width: c.px }).blur(c.blur).ensureAlpha()
      .raw().toBuffer({ resolveWithObject: true })
    const r = jsQR(new Uint8ClampedArray(b.data), b.info.width, b.info.height)
    out.push({ ...c, ok: r?.data === URL_ENCODED })
  }
  return out
}

/** Every edge pixel must be artwork, or the trim will show white. */
async function bleedCheck() {
  const { data, info } = await sharp(path.join(OUT, 'sign-proof.png'))
    .flatten({ background: '#FF00FF' }).raw().toBuffer({ resolveWithObject: true })
  const at = (x, y) => {
    const i = (y * info.width + x) * info.channels
    return [data[i], data[i + 1], data[i + 2]]
  }
  const near = ([r, g, b]) => Math.min(
    Math.abs(r - 0x14) + Math.abs(g - 0x11) + Math.abs(b - 0x0f),
    Math.abs(r - 0xed) + Math.abs(g - 0xe6) + Math.abs(b - 0xda)) < 60
  let bad = 0
  for (let x = 0; x < info.width; x += 7) { if (!near(at(x, 0))) bad++; if (!near(at(x, info.height - 1))) bad++ }
  for (let y = 0; y < info.height; y += 7) { if (!near(at(0, y))) bad++; if (!near(at(info.width - 1, y))) bad++ }
  return bad
}

const info = await build({ guides: false })
await build({ guides: true })

const { n, module: m } = qrMatrix()
console.log(`sign  : 36 x 24 in  (bleed ${(W / 72).toFixed(2)} x ${(H / 72).toFixed(2)} in)`)
console.log(`QR    : ${n} modules EC=Q, ${(m / 72).toFixed(3)}in/module, ${(geom.QR_SIZE / 72).toFixed(2)}in wide`)
console.log(`quiet : ${geom.quiet.toFixed(1)}pt actual vs ${(4 * m).toFixed(1)}pt required -> ${geom.quiet >= 4 * m ? 'OK' : 'TOO TIGHT'}`)
console.log(`hero  : ${info.hero.px}px placed -> ${Math.round(info.hero.dpi)} dpi`)
console.log(`bleed : ${await bleedCheck()} non-artwork edge samples (want 0)`)
console.log('scan simulation:')
for (const r of await scanSim()) {
  console.log(`  ${String(r.px).padStart(4)}px capture / blur ${r.blur.toFixed(1)}  ${r.at.padStart(6)}  ${r.ok ? 'decodes' : 'FAILS'}`)
}
