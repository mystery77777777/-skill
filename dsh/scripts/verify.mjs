#!/usr/bin/env node
/**
 * Offline integrity check for the vendored skills and the plugin manifest.
 *
 * Run with `npm run verify` (or `node scripts/verify.mjs`). It never touches
 * the network and never mutates the repository, so it is safe in CI.
 *
 * It asserts, for every directory under `skills/`:
 *   - `SKILL.md` exists and carries YAML frontmatter;
 *   - frontmatter `name` equals the directory name and matches the DSH
 *     kebab-case skill-name grammar;
 *   - frontmatter `description` is a non-empty single-line scalar;
 *   - every relative Markdown link inside the skill resolves to a shipped file.
 *
 * It then loads the plugin with a stub Cordis context and asserts that the
 * provider publishes exactly those skills with usable bodies, checks the bundle
 * manifest (`dsh.bundle.patch`, `main`), the locale files, and that the vendored
 * bytes still match `vendor-manifest.json`.
 */
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

import { apply, inject, name } from '../lib/index.js'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const SKILLS_DIR = join(ROOT, 'skills')
const FRONTMATTER_PATTERN = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/u
const SKILL_NAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const RELATIVE_LINK_PATTERN = /\[[^\]]*\]\((?!https?:|mailto:|#)([^)#\s]+)/gu

const problems = []

function fail(message) {
  problems.push(message)
}

/** Recursively list files under a directory. */
function walkDir(directory) {
  const found = []
  for (const entry of readdirSync(directory, { withFileTypes: true }).sort((left, right) =>
    left.name.localeCompare(right.name),
  )) {
    const full = join(directory, entry.name)
    if (entry.isDirectory()) found.push(...walkDir(full))
    else if (entry.isFile()) found.push(full)
  }
  return found
}

/** Read the flat `key: value` frontmatter fields of a SKILL.md. */
function fieldsOf(raw) {
  const match = FRONTMATTER_PATTERN.exec(raw)
  if (match === null) return undefined
  const fields = new Map()
  for (const line of match[1].split(/\r?\n/)) {
    if (line.length === 0 || /^\s/u.test(line) || line.startsWith('#')) continue
    const colon = line.indexOf(':')
    if (colon <= 0) continue
    fields.set(line.slice(0, colon).trim(), line.slice(colon + 1).trim())
  }
  return fields
}

const directories = readdirSync(SKILLS_DIR, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort()

if (directories.length === 0) fail('skills/ contains no skill directories')

const expected = new Set()
const seen = new Map()

for (const directory of directories) {
  const skillDir = join(SKILLS_DIR, directory)
  const skillFile = join(skillDir, 'SKILL.md')
  if (!existsSync(skillFile)) {
    fail(`${directory}: missing SKILL.md`)
    continue
  }
  const raw = readFileSync(skillFile, 'utf8')
  const fields = fieldsOf(raw)
  if (fields === undefined) {
    fail(`${directory}: SKILL.md has no YAML frontmatter`)
    continue
  }
  const skillName = fields.get('name')
  const description = fields.get('description')
  if (skillName !== directory) {
    fail(`${directory}: frontmatter name is ${JSON.stringify(skillName)}`)
    continue
  }
  if (!SKILL_NAME_PATTERN.test(skillName)) fail(`${directory}: invalid skill name`)
  if (typeof description !== 'string' || description.length === 0) {
    fail(`${directory}: missing or empty description`)
  }
  if (description !== undefined && /[\r\n]/u.test(description)) {
    fail(`${directory}: description must be a single line`)
  }
  if (seen.has(skillName)) fail(`${directory}: duplicate skill name (also in ${seen.get(skillName)})`)
  seen.set(skillName, directory)
  expected.add(directory)

  for (const match of raw.matchAll(RELATIVE_LINK_PATTERN)) {
    const target = match[1]
    const resolved = join(skillDir, target)
    if (!existsSync(resolved) || !statSync(resolved).isFile()) {
      fail(`${directory}: relative link does not resolve: ${target}`)
    }
  }
}

// The plugin must mount and publish exactly the vendored skills.
const registered = []
const ctx = {
  skills: {
    registerProvider(create) {
      registered.push(create())
    },
  },
}
try {
  apply(ctx, {})
} catch (error) {
  fail(`apply() threw: ${error.message}`)
}
if (registered.length !== 1) {
  fail(`apply() must register exactly one provider, registered ${registered.length}`)
}
if (registered.length === 1 && problems.length === 0) {
  const provider = registered[0]
  const candidates = await provider.list()
  const names = candidates.map((candidate) => candidate.name).sort()
  if (names.length !== expected.size) {
    fail(`provider published ${names.length} skills, expected ${expected.size}`)
  }
  for (const skillName of expected) {
    if (!names.includes(skillName)) fail(`provider is missing skill ${skillName}`)
  }
  for (const candidate of candidates) {
    if (candidate.rank !== 600) fail(`${candidate.name}: unexpected rank ${candidate.rank}`)
    if (candidate.source !== 'bundled') fail(`${candidate.name}: unexpected source`)
    if (candidate.provider !== 'dsh-social-collector') {
      fail(`${candidate.name}: unexpected provider ${candidate.provider}`)
    }
    if (typeof candidate.description !== 'string' || candidate.description.length === 0) {
      fail(`${candidate.name}: empty description`)
    }
    if (candidate.invocation.modelInvocable !== true &&
        candidate.invocation.modelInvocable !== false) {
      fail(`${candidate.name}: invalid invocation policy`)
    }
    if (candidate.resourceBase?.kind !== 'directory' || !existsSync(candidate.resourceBase.path)) {
      fail(`${candidate.name}: resourceBase does not point at a directory`)
    }
    const loaded = await provider.get(candidate, { signal: undefined })
    if (typeof loaded.content !== 'string' || loaded.content.trim().length === 0) {
      fail(`${candidate.name}: empty body`)
    }
    if (loaded.content.startsWith('---')) {
      fail(`${candidate.name}: body still contains frontmatter`)
    }
    if (!loaded.content.includes('node cli.js')) {
      fail(`${candidate.name}: body lost its "node cli.js" instructions`)
    }
    if (loaded.name !== candidate.name) fail(`${candidate.name}: get() renamed the skill`)
    if ('rank' in loaded || 'locator' in loaded) {
      fail(`${candidate.name}: get() leaked provider-internal fields`)
    }
  }
  const userOnly = candidates
    .filter((candidate) => candidate.invocation.modelInvocable === false)
    .map((candidate) => candidate.name)
  console.log(`user-invocable-only skills: ${userOnly.join(', ') || '(none)'}`)
}

// Bundle manifest: patch file, entry file, locale.
if (name !== 'social-collector') fail(`unexpected plugin name ${name}`)
if (!Array.isArray(inject) || !inject.includes('skills')) fail('plugin does not inject skills')
if (!existsSync(join(ROOT, 'cordis.patch.yml'))) fail('missing cordis.patch.yml')

const manifest = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'))
if (manifest.dsh?.bundle?.patch !== './cordis.patch.yml') {
  fail('package.json does not declare dsh.bundle.patch')
}
if (!existsSync(join(ROOT, 'cordis.patch.yml'))) {
  fail('dsh.bundle.patch points at a missing file')
}
if (typeof manifest.main !== 'string' || !existsSync(join(ROOT, manifest.main))) {
  fail('package.json main entry does not exist')
}
if (typeof manifest.license !== 'string' || manifest.license.length === 0) {
  fail('package.json declares no license')
}
if (typeof manifest.version !== 'string' || manifest.version.length === 0) {
  fail('package.json declares no version')
}

for (const locale of ['en', 'zh']) {
  const file = join(ROOT, 'locale', `${locale}.json`)
  if (!existsSync(file)) {
    fail(`missing locale/${locale}.json`)
    continue
  }
  const parsed = JSON.parse(readFileSync(file, 'utf8'))
  if (typeof parsed?.meta?.title !== 'string' || typeof parsed?.meta?.description !== 'string') {
    fail(`locale/${locale}.json must carry meta.title and meta.description`)
  }
}

// Vendored bytes must still match the manifest recorded by the sync script.
const vendorPath = join(ROOT, 'vendor-manifest.json')
if (!existsSync(vendorPath)) {
  fail('missing vendor-manifest.json')
} else {
  const vendor = JSON.parse(readFileSync(vendorPath, 'utf8'))
  const recorded = Object.entries(vendor.files ?? {})
  if (recorded.length === 0) fail('vendor-manifest.json records no files')
  for (const [path, entry] of recorded) {
    const full = join(ROOT, path)
    if (!existsSync(full)) {
      fail(`vendor-manifest.json: missing vendored file ${path}`)
      continue
    }
    const bytes = readFileSync(full)
    const digest = createHash('sha256').update(bytes).digest('hex')
    if (digest !== entry.sha256) fail(`vendored file drifted: ${path}`)
    if (bytes.length !== entry.bytes) fail(`vendored file size drifted: ${path}`)
  }
  const onDisk = walkDir(SKILLS_DIR).map((path) => relative(ROOT, path).split(sep).join('/'))
  for (const path of onDisk) {
    if (!(path in vendor.files)) fail(`unrecorded vendored file (re-run sync): ${path}`)
  }
  if (Object.keys(vendor.skills ?? {}).length !== expected.size) {
    fail('vendor-manifest.json skill count does not match skills/')
  }
}

if (problems.length > 0) {
  console.error(`\ndsh-social-collector: ${problems.length} problem(s)`)
  for (const problem of problems) console.error(`  - ${problem}`)
  process.exitCode = 1
} else {
  console.log(`dsh-social-collector: OK — ${expected.size} skills verified`)
}
