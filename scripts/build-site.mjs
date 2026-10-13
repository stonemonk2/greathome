#!/usr/bin/env node
/**
 * Stage the public site into _site/ for the GitHub Actions Pages deploy.
 *
 * Pages used to publish the whole repo through Jekyll, which put
 * package.json, the build scripts, the print PDFs and every unused photo on
 * www.greathome.us. This copies only what the site actually serves:
 *
 *   1. CNAME and the root favicons.
 *   2. Every tracked .html page, outside tooling folders (scripts/, brand/,
 *      node_modules/, .github/) and any .- or _-prefixed path. A new property
 *      folder with an index.html publishes on its own.
 *   3. Any other tracked file a published page references — href, src,
 *      srcset, poster, CSS url(), or a same-origin URL in content (og:image).
 *      This is the only way a .pdf, .json or .mjs ever gets published.
 *   4. Images a page builds in JavaScript (the 121a gallery): an image in the
 *      page's own folder whose basename equals a string literal in the page's
 *      inline <script>, or starts with that literal plus "-".
 *   5. *.md never publishes, even when linked — the 121a working notes stay
 *      in the repo but are never served.
 *
 * The build fails on a same-origin reference to a file that isn't tracked, or
 * if a .md, dotfile or _-prefixed path lands in _site/.
 *
 *   node scripts/build-site.mjs
 */
import { execFileSync } from 'node:child_process'
import { readFileSync, rmSync, mkdirSync, copyFileSync, readdirSync } from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(import.meta.dirname, '..')
const OUT = path.join(ROOT, '_site')
const posix = path.posix

const ORIGIN = /^https?:\/\/(www\.)?greathome\.us(?=\/|$)/i
const IMG = /\.(webp|avif|jpe?g|png|gif|svg)$/i
const TOOLING = ['scripts/', 'brand/', 'node_modules/', '.github/']
const INFRA = /^(CNAME|favicon[^/]*\.(ico|svg|png))$/

const hidden = (f) => f.split('/').some((s) => s.startsWith('.') || s.startsWith('_'))

const tracked = execFileSync('git', ['ls-files', '-z'], { cwd: ROOT, encoding: 'utf8' })
  .split('\0').filter(Boolean)
const trackedSet = new Set(tracked)

const pages = tracked.filter((f) => f.endsWith('.html') && !hidden(f) && !TOOLING.some((d) => f.startsWith(d)))

const publish = new Set(tracked.filter((f) => INFRA.test(f)))
for (const p of pages) publish.add(p)
const broken = []

// Resolve a same-origin URL to a repo path, or null for external/fragment/data URLs.
function resolve(page, ref) {
  ref = ref.trim().replace(ORIGIN, '')
  if (!ref || ref.includes('${') || /^(#|[a-z][a-z0-9+.-]*:|\/\/)/i.test(ref)) return null
  const clean = decodeURI(ref.split(/[?#]/)[0])
  if (!clean) return null
  let f = clean.startsWith('/') ? clean.slice(1) : posix.join(posix.dirname(page), clean)
  f = posix.normalize(f).replace(/^\.\/?/, '')
  if (f === '' || clean.endsWith('/')) f = posix.join(f, 'index.html')
  else if (!trackedSet.has(f) && trackedSet.has(posix.join(f, 'index.html'))) f = posix.join(f, 'index.html')
  return f
}

function reference(page, ref) {
  const f = resolve(page, ref)
  if (!f) return
  if (!trackedSet.has(f)) return broken.push(`${page}: ${ref}`)
  if (!f.endsWith('.md')) publish.add(f)
}

for (const page of pages) {
  const html = readFileSync(path.join(ROOT, page), 'utf8')

  for (const [, , v] of html.matchAll(/\s(href|src|poster)\s*=\s*["']([^"']*)["']/gi)) reference(page, v)
  for (const [, v] of html.matchAll(/\ssrcset\s*=\s*["']([^"']*)["']/gi))
    for (const part of v.split(',')) reference(page, part.trim().split(/\s+/)[0])
  for (const [, v] of html.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/gi)) reference(page, v)
  // content="" is mostly prose (descriptions, titles); only follow it when it is clearly our URL.
  for (const [, v] of html.matchAll(/\scontent\s*=\s*["']([^"']*)["']/gi))
    if (ORIGIN.test(v) || /^\/[^\s]*$/.test(v)) reference(page, v)

  const dir = posix.dirname(page)
  if (dir === '.') continue
  const literals = new Set()
  for (const [, js] of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi))
    for (const [, , v] of js.matchAll(/(['"`])([^'"`$\n]{3,})\1/g)) literals.add(v)
  for (const f of tracked) {
    if (!f.startsWith(dir + '/') || !IMG.test(f) || hidden(f)) continue
    const base = posix.basename(f).replace(IMG, '')
    for (const l of literals) if (base === l || base.startsWith(l + '-')) { publish.add(f); break }
  }
}

if (broken.length) {
  console.error('Same-origin references to files that are not tracked:\n  ' + broken.join('\n  '))
  process.exit(1)
}

rmSync(OUT, { recursive: true, force: true })
for (const f of [...publish].sort()) {
  mkdirSync(path.dirname(path.join(OUT, f)), { recursive: true })
  copyFileSync(path.join(ROOT, f), path.join(OUT, f))
}

// Check what actually landed on disk, not just the plan.
const staged = readdirSync(OUT, { recursive: true, withFileTypes: true })
  .filter((e) => e.isFile())
  .map((e) => posix.join(path.relative(OUT, e.parentPath).split(path.sep).join('/'), e.name))
const leaked = staged.filter((f) => f.endsWith('.md') || hidden(f))
if (leaked.length) {
  console.error('Refusing to publish:\n  ' + leaked.join('\n  '))
  process.exit(1)
}

console.log(staged.sort().join('\n'))
console.log(`\n${staged.length} files staged in _site/ (of ${tracked.length} tracked)`)
