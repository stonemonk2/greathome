/**
 * Press-ready PDF for the 36" x 24" yard sign.
 *
 * Consumes the same scene as the screen proof (sign-spec.mjs), then does the
 * three things the proof cannot:
 *
 *   1. OUTLINES every character. Glyphs are converted to vector paths with
 *      opentype.js, so the file carries no font dependency at all -- this is
 *      Vistaprint's "Create Outlines" step, done at build time.
 *   2. CMYK. Flat colours use values converted through the U.S. Web Coated
 *      (SWOP) profile; the hero JPEG is converted through the same profile.
 *   3. Real page boxes. MediaBox/BleedBox are the full 36.25 x 24.25 bleed,
 *      TrimBox is the 36 x 24 cut.
 *
 * PDF space is y-up from the bottom-left; the scene is y-down from the
 * top-left. Every placement below flips through H.
 *
 *   node brand/build-print.mjs
 */
import sharp from 'sharp'
import opentype from 'opentype.js'
import {
  PDFDocument, cmyk, PDFName,
  pushGraphicsState, popGraphicsState, concatTransformationMatrix, drawObject,
} from 'pdf-lib'
import { readFileSync, writeFileSync } from 'fs'
import path from 'path'
import {
  W, H, TRIM, C, FONTS, HERO, HERO_CROP, HERO_ADJUST, geom, qrMatrix, scene,
} from './sign-spec.mjs'

const ROOT = path.resolve(import.meta.dirname, '..')
const OUT = path.join(ROOT, 'brand')
const FONT_DIR = 'C:/Windows/Fonts'
const ICC = 'C:/Windows/System32/spool/drivers/color/RSWOP.icm'
const PDF_PATH = path.join(OUT, 'sign-print-36x24.pdf')

const fonts = Object.fromEntries(Object.entries(FONTS).map(([k, f]) => {
  const b = readFileSync(path.join(FONT_DIR, f.file))
  return [k, opentype.parse(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength))]
}))

/**
 * Adobe-convention CMYK JPEGs store inverted samples, so a DeviceCMYK image
 * needs /Decode [1 0 ...] or it prints as a negative. Whether the encoder in
 * play actually inverts is not something to take on faith -- verify-print.mjs
 * rasterises the finished PDF and compares the hero against the RGB proof,
 * and this flag is what that check validates.
 */
const CMYK_JPEG_INVERTED = true

/**
 * Lay a string out glyph by glyph so letter-spacing and kerning are applied
 * explicitly, and return both the outline and the measured advance. Returns
 * SVG path data in SCENE coordinates (y down, y = baseline).
 */
function outline({ s, font, size, ls, x, y, anchor }) {
  const f = fonts[font]
  const scale = size / f.unitsPerEm
  const glyphs = [...s].map((ch) => f.charToGlyph(ch))

  let width = 0
  glyphs.forEach((g, i) => {
    width += g.advanceWidth * scale
    if (i < glyphs.length - 1) {
      width += f.getKerningValue(g, glyphs[i + 1]) * scale + ls
    }
  })

  let px = anchor === 'middle' ? x - width / 2 : x
  const parts = []
  glyphs.forEach((g, i) => {
    const p = g.getPath(px, y, size)
    const d = p.toPathData(3)
    if (d) parts.push(d)
    px += g.advanceWidth * scale
    if (i < glyphs.length - 1) px += f.getKerningValue(g, glyphs[i + 1]) * scale + ls
  })
  return { d: parts.join(' '), width }
}

/** Hero, cropped and exposure-corrected exactly as the proof, then to CMYK. */
async function heroCmyk(w, h) {
  const buf = await sharp(path.join(ROOT, HERO))
    .rotate()
    .extract(HERO_CROP)
    .modulate({ brightness: HERO_ADJUST.brightness, saturation: HERO_ADJUST.saturation })
    .gamma(HERO_ADJUST.gamma)
    .resize({ width: Math.round(w * 300 / 72), height: Math.round(h * 300 / 72), fit: 'cover', withoutEnlargement: true })
    .withIccProfile(ICC)
    .toColourspace('cmyk')
    .jpeg({ quality: 92 })
    .toBuffer()
  const meta = await sharp(buf).metadata()
  return { buf, width: meta.width, height: meta.height, channels: meta.channels }
}

/**
 * Build the image XObject by hand. pdf-lib's embedJpg creates its stream lazily
 * during save and tags DeviceCMYK without a /Decode, which cannot be patched
 * afterwards -- so the stream is constructed directly, keeping DCTDecode (small
 * file) while stating the decode explicitly.
 */
function putHero(doc, page, hero) {
  const dict = {
    Type: 'XObject', Subtype: 'Image',
    Width: hero.width, Height: hero.height,
    ColorSpace: 'DeviceCMYK', BitsPerComponent: 8, Filter: 'DCTDecode',
  }
  if (CMYK_JPEG_INVERTED) dict.Decode = [1, 0, 1, 0, 1, 0, 1, 0]
  const stream = doc.context.stream(hero.buf, dict)
  const ref = doc.context.register(stream)
  page.node.setXObject(PDFName.of('HeroImg'), ref)
}

const col = (name) => cmyk(...C[name].cmyk)

async function main() {
  const doc = await PDFDocument.create()
  doc.setTitle('121 Santa Fe Ave Unit A - 36x24 yard sign')
  doc.setProducer('greathome/brand/build-print.mjs')
  const page = doc.addPage([W, H])
  page.setMediaBox(0, 0, W, H)
  page.setBleedBox(0, 0, W, H)
  page.setTrimBox(TRIM, TRIM, W - 2 * TRIM, H - 2 * TRIM)
  page.setArtBox(TRIM, TRIM, W - 2 * TRIM, H - 2 * TRIM)

  const hero = await heroCmyk(geom.HERO_W, geom.HERO_H)
  putHero(doc, page, hero)

  const warnings = []

  for (const el of scene()) {
    if (el.type === 'rect') {
      page.drawRectangle({
        x: el.x, y: H - (el.y + el.h), width: el.w, height: el.h, color: col(el.color),
      })
    } else if (el.type === 'image') {
      page.pushOperators(
        pushGraphicsState(),
        concatTransformationMatrix(el.w, 0, 0, el.h, el.x, H - (el.y + el.h)),
        drawObject('HeroImg'),
        popGraphicsState(),
      )
    } else if (el.type === 'qr') {
      const { n, data, module: m } = qrMatrix()
      for (let row = 0; row < n; row++) {
        for (let c2 = 0; c2 < n; c2++) {
          if (!data[row * n + c2]) continue
          const mx = el.x + c2 * m, my = el.y + row * m
          page.drawRectangle({
            x: mx, y: H - (my + m + 0.5), width: m + 0.5, height: m + 0.5, color: col(el.color),
          })
        }
      }
    } else {
      const { d, width } = outline(el)
      if (el.bound && width > el.bound) {
        warnings.push(`"${el.s.slice(0, 28)}" outlines to ${width.toFixed(0)}pt > ${el.bound.toFixed(0)}pt allowed`)
      }
      // drawSvgPath treats (x,y) as the SVG origin and flips y downward, so
      // anchoring at y = H maps scene coordinates straight onto the page.
      page.drawSvgPath(d, { x: 0, y: H, color: col(el.color), borderWidth: 0 })
    }
  }

  const bytes = await doc.save()
  writeFileSync(PDF_PATH, bytes)
  return { bytes, warnings }
}

const { bytes, warnings } = await main()

// ---- verification ----
const raw = Buffer.from(bytes).toString('latin1')
const fontRefs = (raw.match(/\/Type\s*\/Font|\/FontFile\d?/g) || []).length
const tac = Object.entries(C).map(([k, v]) => `${k} ${(v.cmyk.reduce((a, b) => a + b, 0) * 100).toFixed(0)}%`)

console.log(`PDF   : ${PDF_PATH}`)
console.log(`size  : ${(bytes.length / 1048576).toFixed(2)} MB`)
console.log(`boxes : Media/Bleed ${(W / 72).toFixed(2)}x${(H / 72).toFixed(2)}in, Trim ${((W - 2 * TRIM) / 72).toFixed(0)}x${((H - 2 * TRIM) / 72).toFixed(0)}in`)
console.log(`fonts : ${fontRefs} font objects (want 0 -- all text outlined)`)
console.log(`ink   : total area coverage ${tac.join(', ')}`)
console.log(`type  : ${warnings.length ? 'OVERFLOW\n  ' + warnings.join('\n  ') : 'all runs fit their bounds'}`)
