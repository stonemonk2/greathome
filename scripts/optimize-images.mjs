#!/usr/bin/env node
/**
 * Build web-ready derivatives from the phone originals.
 *
 * Originals live in 121a/121a-images/<set>/ and are gitignored — they are
 * 2-6MB each and GitHub hard-fails any file over 100MB. Only what this
 * script writes to 121a/121a-images/web/ is committed.
 *
 * Sets are chosen by the date baked into the Pixel filename
 * (PXL_YYYYMMDD_HHMMSS...), so the Aug 16 contractor documentation set and
 * the reshoot marketing set sort themselves without a hardcoded list.
 *
 *   node scripts/optimize-images.mjs              # build derivatives
 *   node scripts/optimize-images.mjs --sheets     # + contact sheets for review
 */
import sharp from 'sharp'
import { readdir, mkdir, writeFile, stat } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(import.meta.dirname, '..')
const IMG = path.join(ROOT, '121a', '121a-images')
const OUT = path.join(IMG, 'web')

const SETS = [
  { dir: '121a-images-reshoot', role: 'marketing' },
  { dir: '121a-images-2026', role: 'archive' },
]

const FULL = { width: 1920, quality: 82 }
const THUMB = { width: 640, quality: 74 }
const PLACEHOLDER = 20

/** PXL_20260816_144940086.MP.jpg -> 20260816 */
const dateOf = (f) => (f.match(/^PXL_(\d{8})_/) || [])[1] ?? '00000000'

const isJpeg = (f) => /\.jpe?g$/i.test(f)

async function buildOne(srcPath, slug) {
  // rotate() with no args applies the EXIF orientation, which phone photos
  // rely on — without it half the portrait shots come out sideways.
  const base = sharp(srcPath).rotate()
  const meta = await base.metadata()

  // metadata() reports pre-rotation dimensions; swap when EXIF says upright.
  const turned = meta.orientation >= 5
  const width = turned ? meta.height : meta.width
  const height = turned ? meta.width : meta.height

  await base
    .clone()
    .resize({ width: FULL.width, withoutEnlargement: true })
    .webp({ quality: FULL.quality })
    .toFile(path.join(OUT, `${slug}.webp`))

  await base
    .clone()
    .resize({ width: THUMB.width, withoutEnlargement: true })
    .webp({ quality: THUMB.quality })
    .toFile(path.join(OUT, `${slug}-thumb.webp`))

  const blur = await base
    .clone()
    .resize({ width: PLACEHOLDER })
    .webp({ quality: 40 })
    .toBuffer()

  return {
    slug,
    src: `${slug}.webp`,
    thumb: `${slug}-thumb.webp`,
    width,
    height,
    orientation: width >= height ? 'landscape' : 'portrait',
    placeholder: `data:image/webp;base64,${blur.toString('base64')}`,
  }
}

async function main() {
  const wantSheets = process.argv.includes('--sheets')
  await mkdir(OUT, { recursive: true })

  const manifest = {}

  for (const { dir, role } of SETS) {
    const abs = path.join(IMG, dir)
    if (!existsSync(abs)) {
      console.log(`skip ${dir} — not present`)
      continue
    }
    const files = (await readdir(abs)).filter(isJpeg).sort()
    if (!files.length) {
      console.log(`skip ${dir} — no jpegs`)
      continue
    }

    console.log(`\n${role}: ${dir} (${files.length} files)`)
    const entries = []

    for (const [i, file] of files.entries()) {
      const slug = `${dateOf(file)}-${String(i + 1).padStart(2, '0')}`
      const rec = await buildOne(path.join(abs, file), slug)
      entries.push({ ...rec, original: file })
      process.stdout.write(`  ${slug} ${rec.orientation}\r`)
    }

    manifest[role] = entries
    const land = entries.filter((e) => e.orientation === 'landscape').length
    console.log(`  ${entries.length} built — ${land} landscape, ${entries.length - land} portrait`)

    if (wantSheets) await contactSheets(entries, role)
  }

  await writeFile(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2))

  let bytes = 0
  for (const f of await readdir(OUT)) {
    bytes += (await stat(path.join(OUT, f))).size
  }
  console.log(`\nweb/ total: ${(bytes / 1048576).toFixed(1)} MB`)
}

/** Grid of thumbnails with index numbers, so a whole set can be reviewed at once. */
async function contactSheets(entries, role) {
  const COLS = 4
  const ROWS = 3
  const CELL = 300
  const per = COLS * ROWS

  for (let s = 0; s * per < entries.length; s++) {
    const chunk = entries.slice(s * per, (s + 1) * per)
    const tiles = await Promise.all(
      chunk.map(async (e, i) => {
        const n = s * per + i + 1
        const img = await sharp(path.join(OUT, e.thumb))
          .resize(CELL, CELL, { fit: 'cover' })
          .composite([
            {
              input: Buffer.from(
                `<svg width="${CELL}" height="40">
                   <rect width="100%" height="40" fill="rgba(0,0,0,0.72)"/>
                   <text x="8" y="27" font-family="sans-serif" font-size="22"
                         fill="#fff">${n}. ${e.slug}</text>
                 </svg>`
              ),
              top: CELL - 40,
              left: 0,
            },
          ])
          .toBuffer()
        return { input: img, top: Math.floor(i / COLS) * CELL, left: (i % COLS) * CELL }
      })
    )

    const out = path.join(OUT, `_sheet-${role}-${s + 1}.jpg`)
    await sharp({
      create: {
        width: COLS * CELL,
        height: ROWS * CELL,
        channels: 3,
        background: '#14110F',
      },
    })
      .composite(tiles)
      .jpeg({ quality: 80 })
      .toFile(out)
    console.log(`  sheet: ${path.basename(out)}`)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
