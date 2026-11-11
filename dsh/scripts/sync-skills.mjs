#!/usr/bin/env node
/**
 * Regenerate `dsh/skills/` from the repository's `skills/` directory.
 *
 * The plugin is a vendored copy: npm and GitHub installs must ship the skill
 * files, so they are committed rather than linked. This script is the only
 * writer of `dsh/skills/` and `dsh/vendor-manifest.json`; run `npm run verify`
 * afterwards to prove the copy is complete and untampered.
 *
 * Naming rule: the target directory is the skill's frontmatter `name`, which
 * the Harness requires to be kebab-case and unique. Source directories that do
 * not match (`zh-comments` → `zh-pinglun`, …) are renamed on copy only; the
 * tracked `skills/` tree is never modified.
 */
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import {
  copyFileSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const REPO_ROOT = resolve(ROOT, '..')
const SOURCE = join(REPO_ROOT, 'skills')
const TARGET = join(ROOT, 'skills')
const MANIFEST = join(ROOT, 'vendor-manifest.json')

/** Directories that are not skills and must never be vendored. */
const SKIP = new Set([
  '_shared', // shared CLI templates, no SKILL.md
  'dist', // release zips
  'dy-sub-comments', // duplicate of dy-comments; intentionally left alone
])

const FRONTMATTER_PATTERN = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/u
const SKILL_NAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

/** Read the flat `key: value` frontmatter fields of a SKILL.md. */
function fieldsOf(raw, where) {
  const match = FRONTMATTER_PATTERN.exec(raw)
  if (match === null) throw new Error(`${where} has no YAML frontmatter`)
  const fields = new Map()
  for (const line of match[1].split(/\r?\n/)) {
    if (line.length === 0 || /^\s/u.test(line) || line.startsWith('#')) continue
    const colon = line.indexOf(':')
    if (colon <= 0) continue
    let value = line.slice(colon + 1).trim()
    const quoted =
      value.length >= 2 &&
      ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'")))
    if (quoted) value = value.slice(1, -1)
    fields.set(line.slice(0, colon).trim(), value)
  }
  return fields
}

/** Recursively copy a directory tree (files only; the skills ship no links). */
function copyTree(source, target) {
  mkdirSync(target, { recursive: true })
  for (const entry of readdirSync(source, { withFileTypes: true })) {
    const from = join(source, entry.name)
    const to = join(target, entry.name)
    if (entry.isDirectory()) copyTree(from, to)
    else if (entry.isFile()) copyFileSync(from, to)
  }
}

/** Recursively list files under a directory, sorted for deterministic output. */
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

/** sha256 of a file's bytes. */
function digestOf(file) {
  return createHash('sha256').update(readFileSync(file)).digest('hex')
}

/** Best-effort commit of the source repository, recorded in the manifest. */
function sourceCommit() {
  try {
    return execFileSync('git', ['-C', REPO_ROOT, 'rev-parse', 'HEAD'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
  } catch {
    return ''
  }
}

rmSync(TARGET, { recursive: true, force: true })
mkdirSync(TARGET, { recursive: true })

const sources = readdirSync(SOURCE, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && !SKIP.has(entry.name))
  .sort((left, right) => left.name.localeCompare(right.name))

const skills = {}
const files = {}
const claimed = new Map()

for (const entry of sources) {
  const sourceDir = join(SOURCE, entry.name)
  const skillFile = join(sourceDir, 'SKILL.md')
  if (!statSync(skillFile).isFile()) {
    throw new Error(`sync-skills: ${entry.name} is not a skill (missing SKILL.md)`)
  }
  const skillName = fieldsOf(readFileSync(skillFile, 'utf8'), skillFile).get('name')
  if (typeof skillName !== 'string' || skillName.length === 0) {
    throw new Error(`sync-skills: ${entry.name}/SKILL.md has no frontmatter name`)
  }
  if (!SKILL_NAME_PATTERN.test(skillName)) {
    throw new Error(`sync-skills: ${entry.name}/SKILL.md has an invalid name "${skillName}"`)
  }
  if (claimed.has(skillName)) {
    throw new Error(
      `sync-skills: ${entry.name} and ${claimed.get(skillName)} both claim the skill name "${skillName}"`,
    )
  }
  claimed.set(skillName, entry.name)

  const targetDir = join(TARGET, skillName)
  copyTree(sourceDir, targetDir)
  for (const file of walkDir(targetDir)) {
    const vendored = relative(ROOT, file).split(sep).join('/')
    files[vendored] = {
      sha256: digestOf(file),
      bytes: statSync(file).size,
      source: relative(REPO_ROOT, join(sourceDir, relative(targetDir, file)))
        .split(sep)
        .join('/'),
    }
  }
  skills[skillName] = `skills/${entry.name}`
}

if (Object.keys(skills).length === 0) {
  throw new Error(`sync-skills: no skills found under ${SOURCE}`)
}

const manifest = {
  generator: 'dsh/scripts/sync-skills.mjs',
  sourceRoot: 'skills',
  sourceCommit: sourceCommit(),
  skills,
  files,
}
writeFileSync(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')

console.log(
  `dsh-social-collector: vendored ${Object.keys(skills).length} skills, ${Object.keys(files).length} files`,
)
for (const name of Object.keys(skills).sort()) {
  const renamed = skills[name] === `skills/${name}` ? '' : ` (from ${skills[name]})`
  console.log(`  · ${name}${renamed}`)
}
