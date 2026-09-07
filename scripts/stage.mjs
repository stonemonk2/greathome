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
 * That also means the gate CANNOT see a placement mistake. Furniture blocking a
 * doorway lands low in the frame, below the region we compare. A pass here means
 * the building was not altered — it does not mean the staging is usable. Every
 * output still needs a human to look at it before it goes on the page.
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
- Find every door in the frame BEFORE placing anything. For each one, treat the
  floor in front of it as unusable: its full width plus 12in either side,
  extending 48in into the room. Nothing may overlap that zone — not a sofa arm,
  not a rug corner, not a plant.
- A sofa whose end crosses in front of an entry door is the single most common
  failure in this task. If the only wall long enough for the sofa is the wall the
  entry door sits in, put the sofa on a different wall or leave it out.
- Do NOT block a window, a closet, a heater/wall furnace, or an electrical panel.
- Leave a walkable path from each doorway into the room.

SCALE — every item must be the size that item really is:
- Judge the size of the room from the fixed references in the frame before
  placing anything. These are measured on site, not estimated: a floor plank is
  9in wide, a baseboard is 3.5in tall, an outlet or switch plate is 2.75in wide,
  the front door is 34in wide, the bedroom door is 27in wide by 80in tall, and
  the office door is 32in wide by 80in tall.
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
    80in long — with neutral linen bedding, and a nightstand on either side at
    22in wide. A jute rug under the bed.
    Check the scale before you render. The curtained closet opening in this
    frame is 47in wide. The mattress alone must read clearly wider than that
    opening, by about a foot. The bed and both nightstands together must read
    a little over twice the width of that opening. If your first instinct is a
    smaller bed than that, it is wrong — enlarge it.
    Do not demand clear walking space on all sides: if the bed sits tight
    against a wall, show it tight. A correctly sized bed in a snug room is the
    honest picture.`,
  office: `Virtually stage this empty room as a home office.
    Put a wooden writing desk against the large blank wall on the RIGHT of the
    frame — the wall carrying two outlets, with no door and no window in it. The
    desk is 48in wide and 24in deep: a third wider than the 36in white door on
    the left of the frame. Render it at that size and no smaller. At it, a
    full-size task chair with its seat 18in off the floor, and an open laptop on
    the desk.
    Put ONE potted floor plant against the short stretch of wall between the
    closed white door and the open doorway, where the light switches are.
    Nothing else — no bookshelf, no rug, no second chair. Both doorways keep
    completely clear floor.`,
  kitchen: `Stage this kitchen lightly. Add ONLY small counter items: a wooden
    cutting board, a bowl of fruit, and a folded tea towel. Do not alter the
    cabinets, counters, appliances or backsplash in any way.`,
  bathroom: `Stage this bathroom lightly. Add ONLY rolled white towels on the
    vanity and one small plant. Do not alter the vanity, mirror, shower,
    fixtures or tile.`,
}

/**
 * What each room actually measures — 121a/MEASUREMENTS.md, taped on site.
 *
 * Generic references are not good enough. Told "a door is about 32in" while
 * looking at this unit's 27in bedroom door, a model infers a room a fifth
 * wider than it is, and every piece it places shrinks to match. The numbers
 * below are the ones in the frame.
 */
const ROOM_SCALE = {
  living: `THIS ROOM, measured: the living area is 110in wide and 151in deep
    under an 118in ceiling. The white entry door in this frame is the front door
    of the apartment, 34in wide — use it as the ruler for size, and as a place
    nothing may go. The floor in front of that door must stay completely empty
    and visible all the way down to the baseboard; if any part of the sofa
    overlaps the door opening in the picture, the image is wrong. Put the sofa
    against a wall away from that door, with its back to the wall and the whole
    door still readable.`,
  bedroom: `THIS ROOM, measured: 153in by 106in under a 95in ceiling — the
    lowest in the unit, so keep headboards and lamps low. The curtained closet
    opening in frame is exactly 47in wide: use it as the ruler for everything
    you place. The door is 27in wide. Window sills sit 33in and 34in off the
    floor. A queen at a true 60x80in fits this room with floor left over, so
    place it at that size and do not trim it.`,
  office: `THIS ROOM, measured: 110in by 135in under an 118in ceiling, window
    sill 25in off the floor. Three doors swing into this room — a 32in hall
    door, a 36in closet door and the bathroom door. Every one of those swings
    stays empty floor. The longest clear wall runs are only 80in and 90in, so a
    48in desk fits against one and nothing larger does.`,
  kitchen: `THIS ROOM, measured: the galley is 77in from cabinet face to
    cabinet face, the counters are 36in high and the range is 30in wide. Any
    prop must read at the right size against a 36in counter.`,
  bathroom: `THIS ROOM, measured: 46in wide and 108in long, vanity top 30in
    wide. It is a narrow room — towels must read against a 30in vanity.`,
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

  const result = await generate(key, original, `${prompt}
${ROOM_SCALE[roomKey] ?? ''}`)
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
    '20260830-47': 'bedroom',
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
