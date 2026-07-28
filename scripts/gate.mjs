#!/usr/bin/env node
/**
 * The gate.
 *
 * An agent proposes; this disposes. It answers one question in three parts:
 * did the change stay inside the lines, does it compile, and does it satisfy
 * the executable half of the spec?
 *
 *   npm run gate                  auto-detect the active spec from the diff
 *   npm run gate -- 001-rate-limit    name it explicitly
 *   BASE=origin/main npm run gate     compare against a different base ref
 *
 * Deliberately dependency-free and about 200 lines, so you can read it,
 * distrust it, and change it. Copy it into your own repo as-is.
 */

import { execFileSync, spawnSync } from 'node:child_process'
import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const c = {
  dim: (s) => `[2m${s}[0m`,
  red: (s) => `[31m${s}[0m`,
  green: (s) => `[32m${s}[0m`,
  yellow: (s) => `[33m${s}[0m`,
  bold: (s) => `[1m${s}[0m`,
}

// ---------------------------------------------------------------- globs

/** Tiny glob matcher. Supports ** (any depth), * (one segment), ?. */
function globToRegExp(glob) {
  let out = ''
  for (let i = 0; i < glob.length; i++) {
    const ch = glob[i]
    if (ch === '*' && glob[i + 1] === '*') {
      i++
      if (glob[i + 1] === '/') i++ // `**/` also matches zero directories
      out += '(?:.*)'
    } else if (ch === '*') {
      out += '[^/]*'
    } else if (ch === '?') {
      out += '[^/]'
    } else {
      out += ch.replace(/[.+^${}()|[\]\\]/g, '\\$&')
    }
  }
  return new RegExp(`^${out}$`)
}

const matches = (file, globs) => globs.some((g) => globToRegExp(g).test(file))

/** Pull the lines out of a fenced block, e.g. ```allow … ``` */
function fencedList(markdown, fence) {
  const re = new RegExp('```' + fence + '\\r?\\n([\\s\\S]*?)```', 'g')
  const lines = []
  for (const match of markdown.matchAll(re)) {
    for (const line of match[1].split('\n')) {
      const trimmed = line.trim()
      if (trimmed && !trimmed.startsWith('#')) lines.push(trimmed)
    }
  }
  return lines
}

// ---------------------------------------------------------------- git

function git(args, { trim = true } = {}) {
  try {
    const out = execFileSync('git', args, { cwd: root, stdio: ['ignore', 'pipe', 'ignore'] }).toString()
    return trim ? out.trim() : out
  } catch {
    return null
  }
}

function resolveBase() {
  const candidates = process.env.BASE
    ? [process.env.BASE]
    : ['origin/main', 'origin/master', 'main', 'master']
  for (const ref of candidates) {
    if (git(['rev-parse', '--verify', '--quiet', ref])) return ref
  }
  return null
}

function changedFiles() {
  if (!git(['rev-parse', '--git-dir'])) return { files: null, reason: 'not a git repository' }

  const files = new Set()

  // Uncommitted work, including untracked files. Not trimmed: porcelain lines
  // begin with a two-column status, and the first column is often a space.
  const status = git(['status', '--porcelain'], { trim: false })
  if (status) {
    for (const line of status.split('\n')) {
      const match = /^..\s(.+)$/.exec(line)
      if (!match) continue
      const path = match[1].trim().replace(/^"|"$/g, '')
      files.add(path.includes(' -> ') ? path.split(' -> ')[1] : path)
    }
  }

  // Everything committed on this branch since it left the base.
  const base = resolveBase()
  if (base) {
    const mergeBase = git(['merge-base', base, 'HEAD']) ?? base
    const committed = git(['diff', '--name-only', '--diff-filter=d', `${mergeBase}..HEAD`])
    if (committed) for (const path of committed.split('\n')) if (path.trim()) files.add(path.trim())
  }

  return { files: [...files].sort(), reason: base ? `base ${base}` : 'uncommitted changes only' }
}

// ---------------------------------------------------------------- spec

function activeSpec(changed) {
  const explicit = process.argv[2] ?? process.env.SPEC
  if (explicit) return explicit

  const touched = new Set()
  for (const file of changed ?? []) {
    const match = /^spec\/([^/]+)\//.exec(file)
    if (match && match[1] !== 'TEMPLATE.md') touched.add(match[1])
  }

  if (touched.size === 1) return [...touched][0]
  if (touched.size > 1) {
    fail(
      `the diff touches ${touched.size} specs: ${[...touched].join(', ')}`,
      'One spec per change. Split it, or name the one you mean: npm run gate -- <spec-id>',
    )
  }
  return null
}

// ---------------------------------------------------------------- checks

const results = []
let failed = false

function fail(headline, detail) {
  console.error(`\n${c.red('GATE FAILED')}  ${headline}`)
  if (detail) console.error(c.dim(`            ${detail}`))
  process.exit(1)
}

function record(name, ok, note) {
  results.push({ name, ok, note })
  if (!ok) failed = true
  const mark = ok ? c.green('PASS') : c.red('FAIL')
  console.log(`  ${mark}  ${name}${note ? c.dim(`  ${note}`) : ''}`)
}

function checkPaths() {
  console.log(c.bold('\n1. Allowed paths'))

  const { files: changed, reason } = changedFiles()
  if (changed === null) {
    record('path guard', true, `skipped, ${reason}`)
    return
  }

  const constraintsPath = resolve(root, 'constraints.md')
  const deny = existsSync(constraintsPath)
    ? fencedList(readFileSync(constraintsPath, 'utf8'), 'deny')
    : []

  // The deny fence applies to every change, spec or no spec. It is the half of
  // the guard that does not depend on anyone having written a spec first.
  const denied = changed.filter((file) => matches(file, deny))

  const spec = activeSpec(changed)
  let allow = null
  if (spec) {
    const specFile = resolve(root, 'spec', spec, 'SPEC.md')
    if (!existsSync(specFile)) fail(`no spec at spec/${spec}/SPEC.md`, listSpecs())

    allow = fencedList(readFileSync(specFile, 'utf8'), 'allow')
    if (allow.length === 0) {
      fail(
        `spec/${spec}/SPEC.md has no \`\`\`allow fence`,
        'The gate cannot guard paths it was never given.',
      )
    }
  }

  const outside = allow
    ? changed.filter((file) => !matches(file, deny) && !matches(file, allow))
    : []

  const scope = spec ? `spec ${spec}` : 'no active spec, deny fence only'
  console.log(c.dim(`        ${scope} · ${changed.length} changed file(s) · ${reason}`))

  for (const file of denied) console.log(`        ${c.red('never touch')}  ${file}`)
  for (const file of outside) console.log(`        ${c.yellow('not allowed')}  ${file}`)

  const ok = denied.length === 0 && outside.length === 0
  record('path guard', ok, ok ? `all ${changed.length} file(s) in bounds` : undefined)

  if (!spec && ok && changed.length > 0) {
    console.log(
      c.dim(
        '        No spec directory in this diff, so only the deny fence was checked.\n' +
          '        A change with no spec is what this repo exists to discourage.\n' +
          '        Scaffold one with: npm run new-spec -- "my feature"',
      ),
    )
  }

  if (!ok) {
    if (denied.length) {
      console.log(
        c.dim(
          '\n        Never-touch paths come from the `deny` fence in constraints.md.\n' +
            '        They are off limits whatever the spec says.',
        ),
      )
    }
    if (outside.length && allow) {
      console.log(
        c.dim(
          '\n        Allowed by this spec:\n' +
            allow.map((glob) => `          ${glob}`).join('\n') +
            '\n        Either the change went out of bounds, or the spec is wrong.\n' +
            '        Both are worth knowing before a human reads the diff.',
        ),
      )
    }
    // A change that went out of bounds is not worth compiling. Stop here so the
    // real finding is the last thing on screen, not buried above a test run.
    console.log(`\n${c.red('GATE FAILED')} — the diff went outside its allowed paths.`)
    console.log(c.dim('Fix the change, or fix the spec. Do not fix the gate.'))
    process.exit(1)
  }
}

function listSpecs() {
  const dir = resolve(root, 'spec')
  if (!existsSync(dir)) return ''
  const specs = readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
  return specs.length ? `known specs: ${specs.join(', ')}` : ''
}

function run(label, heading, command, args) {
  console.log(c.bold(`\n${heading}`))
  const result = spawnSync(command, args, { cwd: root, stdio: 'inherit', shell: process.platform === 'win32' })
  record(label, result.status === 0)
}

// ---------------------------------------------------------------- main

console.log(c.bold('spec-driven gate'))
checkPaths()
run('typecheck', '2. Types', 'npx', ['tsc', '--noEmit'])
run('tests', '3. Tests', 'npx', ['vitest', 'run'])

console.log(c.bold('\nsummary'))
for (const { name, ok } of results) {
  console.log(`  ${ok ? c.green('PASS') : c.red('FAIL')}  ${name}`)
}

if (failed) {
  console.log(`\n${c.red('GATE FAILED')} — this change is not mergeable yet.`)
  process.exit(1)
}
console.log(`\n${c.green('GATE PASSED')} — the machine-checkable half is done.`)
console.log(c.dim('Now the human half: the review checklist at the end of the spec.'))
