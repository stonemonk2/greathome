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
Keep the framing and perspective exactly as given.`

const ROOMS = {
  living: `Virtually stage this empty living room. Add a fabric sofa, a small
    coffee table, a floor lamp, a low-pile area rug, and one large potted plant.
    Modern, warm, understated — the scale should read comfortable for the room,
    not crowded.`,
  bedroom: `Virtually stage this empty bedroom. Add a queen bed with neutral
    linen bedding, two small nightstands with lamps, and a small rug.
    Leave clear walking space.`,
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
