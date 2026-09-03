#!/usr/bin/env node
/**
 * Virtual staging via Gemini image models.
 *
 * Adding furniture to a photo is standard practice and legal. Altering the
 * property itself is misrepresentation — a tenant who signs on a stainless
 * range and arrives to a white one has a real complaint. Generative models
 * do this constantly and silently: they "upgrade" appliances, invent
 * backsplashes, put a bay view outside the window, shift the floor colour.
 *
 * So every result goes through a diff gate. We compare the output against
 * the source and reject anything where the *upper* portion of the frame —
 * cabinets, counters, fixtures, windows, walls — moved. Furniture lands low
 * in the frame; a model that repainted the kitchen shows up high.
 *
 *   node scripts/stage.mjs --list
 *   node scripts/stage.mjs 20260816-43
 *   node scripts/stage.mjs --all
 *   node scripts/stage.mjs 20260816-43 --force   # keep a rejected result
 */
import sharp from 'sharp'
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(import.meta.dirname, '..')
const WEB = path.join(ROOT, '121a', '121a-images', 'web')
const OUT = path.join(ROOT, '121a', '121a-images', 'web', 'staged')
const REJECT = path.join(ROOT, '121a', '121a-images', '_staged-raw')

const MODEL = 'gemini-3-pro-image'
const ENDPOINT = (m) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent`

/** How much the protected (upper) region may change before we reject. */
const DRIFT_LIMIT = 0.045

const PRESERVE = `
ABSOLUTE CONSTRAINTS — these override everything else:
- Do NOT change any part of the building. Walls, ceiling, floor, windows,
  window frames, doors, trim, baseboards, cabinets, countertops, backsplash,
  sink, faucet, appliances, light fixtures, outlets and switches must remain
  pixel-identical.
- Do NOT change the colour, finish or material of anything already present.
  The gas range is white — leave it white. The floor is grey laminate —
  leave it exactly that colour.
- Do NOT add or remove windows, and do NOT invent a view through any window.
- Do NOT change the lighting, exposure, white balance or camera angle.
- Do NOT add a backsplash, tile, moulding or built-in that is not already there.
- Add ONLY free-standing furniture, rugs, and small decor that a tenant could
  carry out of the room.

PLACEMENT — a staged room has to be a room someone could actually live in:
- Do NOT place any furniture in front of a door, across a doorway, or where it
  would block a door from opening. Leave the full swing of every door clear.
- Do NOT block a window, a closet, a heater/wall furnace, or an electrical panel.
- Leave a walkable path from each doorway into the room.

SCALE — every item must be the size that item really is:
- Judge the size of the room from the fixed references in the frame before
  placing anything. An interior door is about 32in wide and 80in tall. A light
  switch or outlet plate is about 2.75in wide. A floor plank is about 7in wide.
  A baseboard is about 3.5in tall. A window sill sits about 30in off the floor.
- Real furniture dimensions: queen bed 60x80in, full 54x75in, twin 38x75in.
  Nightstand about 20in wide. Three-seat sofa about 84in long, 35in deep.
  Coffee table about 48x24in. Desk about 48x24in. Dining chair seat 18in high.
- NEVER shrink a piece to make the room look larger. That is the whole reason
  this rule exists: an undersized bed silently advertises a bigger room than
  the one being let.
- If the named piece would not fit at its true size, place it at its true size
  anyway even if the room reads tight, or leave it out entirely and stage fewer
  pieces. Fewer correct pieces beat more shrunken ones.
Keep the framing and perspective exactly as given.`

const ROOMS = {
  living: `Virtually stage this empty living room. Add a fabric sofa, a small
    coffee table, a floor lamp, a low-pile area rug, and one large potted plant.
    Modern, warm, understated — the scale should read comfortable for the room,
    not crowded.`,
  bedroom: `Virtually stage this empty bedroom. Add a queen bed — 60in wide by
    80in long, at that true size and no smaller — with neutral linen bedding,
    plus a nightstand on either side ONLY if one genuinely fits at about 20in
    wide. A small rug is optional. Do not demand clear walking space on all
    sides: if the bed only fits tight against a wall, show it tight against
    that wall. A correctly sized bed in a snug room is the honest picture.`,
  office: `Virtually stage this empty room as a home office. Add a simple wooden
    desk, one task chair, a small bookshelf, and a potted plant. Keep it sparse.`,
  kitchen: `Stage this kitchen lightly. Add ONLY small counter items: a wooden
    cutting board, a bowl of fruit, and a folded tea towel. Do not alter the
    cabinets, counters, appliances or backsplash in any way.`,
  bathroom: `Stage this bathroom lightly. Add ONLY rolled white towels on the
    vanity and one small plant. Do not alter the vanity, mirror, shower,
    fixtures or tile.`,
}

function apiKey() {
  if (process.env.GEMINI_API_KEY) return process.env.GEMINI_API_KEY
  const envFile = path.join(ROOT, '.env')
  if (existsSync(envFile)) {
    const m = readFileSync(envFile, 'utf8').match(/GEMINI_API_KEY=(.+)/)
    if (m) return m[1].trim()
  }
  throw new Error('No GEMINI_API_KEY — set it in .env or the environment')
}

async function generate(key, imgBuf, prompt) {
  const res = await fetch(ENDPOINT(MODEL), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-goog-api-key': key },
    body: JSON.stringify({
      contents: [
        {
          parts: [
            { inline_data: { mime_type: 'image/webp', data: imgBuf.toString('base64') } },
            { text: `${prompt}\n${PRESERVE}` },
          ],
        },
      ],
    }),
  })

  if (!res.ok) {
    throw new Error(`${MODEL} ${res.status}: ${(await res.text()).slice(0, 300)}`)
  }
  const json = await res.json()
  const parts = json.candidates?.[0]?.content?.parts ?? []
  const img = parts.find((p) => p.inline_data ?? p.inlineData)
  if (!img) {
    const why = json.candidates?.[0]?.finishReason ?? 'no image in response'
    throw new Error(`no image returned (${why})`)
  }
  return Buffer.from((img.inline_data ?? img.inlineData).data, 'base64')
}

/**
 * Mean per-pixel difference across the top 55% of the frame, where the
 * building lives and furniture does not. Both images are normalised to the
 * same small greyscale raster first so encoding noise does not register.
 */
async function drift(aBuf, bBuf) {
  const W = 256
  const prep = async (buf) => {
    const img = sharp(buf).resize(W, W, { fit: 'fill' }).greyscale()
    const { data } = await img.raw().toBuffer({ resolveWithObject: true })
    return data
  }
  const [a, b] = await Promise.all([prep(aBuf), prep(bBuf)])

  const rows = Math.floor(W * 0.55)
  let sum = 0
  const n = rows * W
  for (let i = 0; i < n; i++) sum += Math.abs(a[i] - b[i])
  return sum / n / 255
}

async function stageOne(key, slug, roomKey, force) {
  const src = path.join(WEB, `${slug}.webp`)
  if (!existsSync(src)) throw new Error(`no such image: ${slug}`)

  const prompt = ROOMS[roomKey]
  if (!prompt) throw new Error(`unknown room type "${roomKey}" — one of ${Object.keys(ROOMS)}`)

  const original = await readFile(src)
  process.stdout.write(`  ${slug} (${roomKey}) … `)

  const result = await generate(key, original, prompt)
  const d = await drift(original, result)
  const ok = d <= DRIFT_LIMIT

  if (ok || force) {
    await mkdir(OUT, { recursive: true })
    const dest = path.join(OUT, `${slug}-staged.webp`)
    await sharp(result).webp({ quality: 82 }).toFile(dest)
    await sharp(result)
      .resize({ width: 640 })
      .webp({ quality: 74 })
      .toFile(path.join(OUT, `${slug}-staged-thumb.webp`))
    console.log(`${ok ? 'OK' : 'FORCED'}  drift ${(d * 100).toFixed(2)}%`)
    return { slug, ok, drift: d }
  }

  await mkdir(REJECT, { recursive: true })
  await writeFile(path.join(REJECT, `${slug}-rejected.webp`), result)
  console.log(`REJECTED  drift ${(d * 100).toFixed(2)}% > ${(DRIFT_LIMIT * 100).toFixed(1)}%`)
  return { slug, ok: false, drift: d }
}

async function main() {
  const args = process.argv.slice(2)
  const force = args.includes('--force')
  const targets = args.filter((a) => !a.startsWith('--'))

  if (args.includes('--list')) {
    const files = (await readdir(WEB)).filter((f) => /^\d{8}-\d\d\.webp$/.test(f))
    console.log(files.map((f) => f.replace('.webp', '')).join('\n'))
    console.log(`\nroom types: ${Object.keys(ROOMS).join(', ')}`)
    return
  }

  // slug -> room type. Extend as the reshoot lands.
  const PLAN = {
    // Aug 30 reshoot — the marketing set. Room identification is not guesswork:
    // -22 has one closet and one window and matches the already-labelled
    // 20260816-14, so it is the office; the two-window room (-43..-46) is the
    // bedroom by elimination, the unit having only these five rooms.
    '20260830-54': 'living',
    '20260830-57': 'living',
    '20260830-46': 'bedroom',
    '20260830-22': 'office',
    '20260830-21': 'office',
    '20260830-05': 'kitchen',
    '20260830-26': 'bathroom',

    '20260816-43': 'living',
    '20260816-40': 'living',
    '20260816-39': 'living',
    '20260816-01': 'bedroom',
    '20260816-14': 'office',
    '20260816-16': 'office',
    '20260816-27': 'kitchen',
    '20260816-22': 'bathroom',
  }

  const key = apiKey()
  const todo = args.includes('--all')
    ? Object.entries(PLAN)
    : targets.map((t) => [t, PLAN[t] ?? 'living'])

  if (!todo.length) {
    console.log('usage: node scripts/stage.mjs <slug|--all|--list> [--force]')
    return
  }

  console.log(`staging ${todo.length} image(s) with ${MODEL}\n`)
  const results = []
  for (const [slug, room] of todo) {
    try {
      results.push(await stageOne(key, slug, room, force))
    } catch (e) {
      console.log(`FAILED — ${e.message}`)
      results.push({ slug, ok: false, error: e.message })
    }
  }

  const good = results.filter((r) => r.ok).length
  console.log(`\n${good}/${results.length} passed the diff gate`)
  if (good < results.length) {
    console.log(`rejected outputs saved to ${path.relative(ROOT, REJECT)} for inspection`)
  }
  console.log('\nRemember: staged images must carry a "Virtually staged" label.')
}

main().catch((e) => {
  console.error(e.message)
  process.exit(1)
})
