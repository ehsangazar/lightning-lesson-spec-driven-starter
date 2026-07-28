#!/usr/bin/env node
/**
 * Rewind the repo to the state both demo runs start from: the API before
 * anyone asked for rate limiting.
 *
 *   npm run demo:reset          rewind
 *   git checkout -- src/        put it back
 *
 * Used on stage to run the same feature twice, ad-hoc then spec-first. Safe to
 * delete once you have pointed this template at your own repo.
 */

import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const bold = (s) => `[1m${s}[0m`
const dim = (s) => `[2m${s}[0m`

// Drop the snapshot's own header comment, so what lands in src/ reads as the
// codebase as it was rather than as a stage prop.
const before = readFileSync(resolve(root, 'scripts/before/app.ts'), 'utf8')
writeFileSync(resolve(root, 'src/app.ts'), before.replace(/^(?:\/\/.*\n)+\n/, ''))

const rateLimit = resolve(root, 'src/rate-limit.ts')
if (existsSync(rateLimit)) rmSync(rateLimit)

console.log(`${bold('Rewound to the pre-feature state.')}

  src/app.ts        rate limiting removed
  src/rate-limit.ts deleted

The regression suite in tests/ still passes. The acceptance suite in
spec/001-rate-limit/ does not, because the thing it describes does not exist.
That red is the spec.

${bold('Run 1 · ad-hoc')}   ask the agent: "add rate limiting to the API"
${bold('Run 2 · spec-first')} ask the agent: "implement spec/001-rate-limit/SPEC.md"

Then, either way:  npm run gate

${dim('Restore the finished implementation with: git checkout -- src/')}`)
