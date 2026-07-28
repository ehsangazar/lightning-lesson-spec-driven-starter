#!/usr/bin/env node
/**
 * Scaffold a new spec from the template.
 *
 *   npm run new-spec -- "cache invalidation"
 *   -> spec/002-cache-invalidation/{SPEC.md,acceptance.test.ts}
 *
 * Numbering is sequential so specs read as a history of decisions rather than a
 * pile of files.
 */

import { mkdirSync, existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const bold = (s) => `[1m${s}[0m`
const dim = (s) => `[2m${s}[0m`

const title = process.argv.slice(2).join(' ').trim()
if (!title) {
  console.error('usage: npm run new-spec -- "short feature title"')
  process.exit(1)
}

const slug = title
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '')

const specRoot = resolve(root, 'spec')
mkdirSync(specRoot, { recursive: true })

const existing = readdirSync(specRoot, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && /^\d{3}-/.test(entry.name))
  .map((entry) => Number(entry.name.slice(0, 3)))
const id = String(Math.max(0, ...existing) + 1).padStart(3, '0')

const dir = `${id}-${slug}`
const target = resolve(specRoot, dir)
if (existsSync(target)) {
  console.error(`spec/${dir} already exists`)
  process.exit(1)
}
mkdirSync(target)

const fill = (text) =>
  text.replaceAll('__ID__', id).replaceAll('__TITLE__', title).replaceAll('__DIR__', dir)

const templateRoot = resolve(specRoot, '_template')
writeFileSync(
  resolve(target, 'SPEC.md'),
  fill(readFileSync(resolve(templateRoot, 'SPEC.md'), 'utf8')),
)
writeFileSync(
  resolve(target, 'acceptance.test.ts'),
  fill(readFileSync(resolve(templateRoot, 'acceptance.test.ts.tmpl'), 'utf8')),
)

console.log(`${bold(`Created spec/${dir}`)}

  spec/${dir}/SPEC.md              the contract
  spec/${dir}/acceptance.test.ts   the executable half

${bold('Next, in this order:')}
  1. Write SPEC.md yourself. Sections 2 and 5 are the ones that do the work.
  2. Turn section 4 into real assertions. Run npm test and watch them fail.
  3. Only then point the agent at it:
       "Read constraints.md, then implement spec/${dir}/SPEC.md."
  4. npm run gate

${dim('Steps 1 and 2 before any prompting. That order is the whole method.')}`)
