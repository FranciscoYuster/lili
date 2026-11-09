#!/usr/bin/env node
/**
 * Rebrands upstream Orca as Lili across user-visible surfaces.
 *
 * Idempotent and re-runnable: run it after every `git merge upstream/main`
 * instead of resolving a thousand conflicts by hand. The fork's branding is
 * therefore one script, not a thousand edits — which is the whole point, since
 * upstream ships roughly 1.5 releases a day and rewrites locale files often.
 *
 *   node scripts/rebrand-lili.mjs           apply
 *   node scripts/rebrand-lili.mjs --check   report only, exit 1 if work remains
 *
 * WHAT IT DELIBERATELY LEAVES ALONE
 * Only capitalised `Orca`/`ORCA` is replaced, because every identifier that
 * must keep working is lower-case or suffixed:
 *   orca://        pairing scheme          breaks pairing if renamed
 *   ~/.orca/       config + credentials    orphans stored Jira/Linear tokens
 *   orcad          headless daemon
 *   orca-plugin.json / orca-catalog.json   breaks plugin installs
 *   ORCA_*         environment variables   excluded by the `ORCA(?!_)` guard
 *   orca serve     CLI invocations in help text
 * See KODER-PATCHES.md for the reference counts behind each of those.
 */

import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs'
import { join, relative } from 'node:path'

const repoRoot = join(import.meta.dirname, '..')
const checkOnly = process.argv.includes('--check')

/** Capitalised only; `ORCA_` is excluded so env-var names survive. */
const WORD_PATTERNS = [
  [/\bORCA(?!_)/g, 'LILI'],
  [/\bOrca\b/g, 'Lili']
]

const localesDir = join(repoRoot, 'src/renderer/src/i18n/locales')
const localeFiles = existsSync(localesDir)
  ? readdirSync(localesDir)
      .filter((name) => name.endsWith('.json'))
      .map((name) => join(localesDir, name))
  : []

/** Source files whose English fallback strings are what ship when a key is missing. */
const SOURCE_TARGETS = [
  'src/renderer/src/components/Landing.tsx',
  'src/renderer/src/i18n/en-runtime-required.json'
].map((p) => join(repoRoot, p))

/** Exact one-off swaps that a word-level pass cannot express. */
const LITERAL_SWAPS = [
  [
    'src/renderer/src/components/Landing.tsx',
    "import logo from '../../../../resources/logo.svg'",
    "import logo from '../../../../resources/lili-logo.png'"
  ],
  // The landing wordmark is set in lower case; upstream shouted its own name.
  // Matching the whole JSON value keeps this off every other string.
  [
    'src/renderer/src/components/Landing.tsx',
    "translate('auto.components.Landing.6ca6ff404e', 'LILI')",
    "translate('auto.components.Landing.6ca6ff404e', 'lili')"
  ]
]

/**
 * Locale values that are exactly `LILI` are the landing wordmark and nothing
 * else, so lower-casing by whole-value match needs no key to stay stable.
 */
const WORDMARK_VALUE = [/":\s*"LILI"/g, '": "lili"']

let changedFiles = 0
let totalReplacements = 0

/** Replaces only inside JSON string values, never inside keys. */
function rebrandLocale(text) {
  let count = 0
  const out = text.replace(/"((?:[^"\\]|\\.)*)"(\s*:)?/g, (match, body, isKey) => {
    if (isKey) {
      return match
    }
    let next = body
    for (const [pattern, replacement] of WORD_PATTERNS) {
      next = next.replace(pattern, () => {
        count += 1
        return replacement
      })
    }
    return `"${next}"${isKey ?? ''}`
  })
  const [wordmarkPattern, wordmarkReplacement] = WORDMARK_VALUE
  const lowered = out.replace(wordmarkPattern, () => {
    count += 1
    return wordmarkReplacement
  })
  return { out: lowered, count }
}

function rebrandSource(text) {
  let count = 0
  let out = text
  for (const [pattern, replacement] of WORD_PATTERNS) {
    out = out.replace(pattern, () => {
      count += 1
      return replacement
    })
  }
  return { out, count }
}

function apply(file, transform) {
  if (!existsSync(file)) {
    return
  }
  const before = readFileSync(file, 'utf8')
  const { out, count } = transform(before)
  if (count === 0 || out === before) {
    return
  }
  changedFiles += 1
  totalReplacements += count
  console.log(`  ${relative(repoRoot, file)}  ${count}`)
  if (!checkOnly) {
    writeFileSync(file, out)
  }
}

console.log(checkOnly ? 'Checking Lili branding…' : 'Applying Lili branding…')

for (const file of localeFiles) {
  apply(file, rebrandLocale)
}
for (const file of SOURCE_TARGETS) {
  apply(file, rebrandSource)
}

for (const [relPath, from, to] of LITERAL_SWAPS) {
  const file = join(repoRoot, relPath)
  if (!existsSync(file)) {
    continue
  }
  const before = readFileSync(file, 'utf8')
  if (!before.includes(from)) {
    continue
  }
  changedFiles += 1
  totalReplacements += 1
  console.log(`  ${relPath}  (literal)`)
  if (!checkOnly) {
    writeFileSync(file, before.replace(from, to))
  }
}

if (totalReplacements === 0) {
  console.log('Already branded; nothing to do.')
  process.exit(0)
}

console.log(`\n${totalReplacements} replacements across ${changedFiles} files.`)
if (checkOnly) {
  console.log('Run without --check to apply.')
  process.exit(1)
}
