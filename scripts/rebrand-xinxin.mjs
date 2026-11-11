#!/usr/bin/env node
/**
 * Rebrands upstream Orca as 信心 across user-visible surfaces.
 *
 * Idempotent and re-runnable: run it after every `git merge upstream/main`
 * instead of resolving a thousand conflicts by hand. The fork's branding is
 * therefore one script, not a thousand edits — which is the whole point, since
 * upstream ships roughly 1.5 releases a day and rewrites locale files often.
 *
 *   node scripts/rebrand-xinxin.mjs           apply
 *   node scripts/rebrand-xinxin.mjs --check   report only, exit 1 if work remains
 *
 * It also accepts `Lili`, the fork's previous name, so a tree rebranded once
 * before converges on a second run instead of needing a one-off migration.
 *
 * WHY THE DISPLAY NAME IS CJK AND THE IDENTIFIERS ARE NOT
 * 信心 is what a person reads: window titles, the wordmark, the macOS bundle.
 * Everything a machine reads stays ASCII — `xinxin` for files and executables —
 * because a build artifact, a shell completion and a CI upload all assume a
 * path they can type.
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

const DISPLAY_NAME = '信心'

/**
 * Capitalised only; `ORCA_` is excluded so env-var names survive. 信心 has no
 * case, so the shouted and capitalised forms collapse onto the same output —
 * which is also why the old lower-casing pass for the wordmark is gone.
 */
const WORD_PATTERNS = [
  [/\bORCA(?!_)/g, DISPLAY_NAME],
  [/\bOrca\b/g, DISPLAY_NAME],
  [/\bLILI\b/g, DISPLAY_NAME],
  [/\bLili\b/g, DISPLAY_NAME],
  // The wordmark shipped lower-case. Word-bounded on purpose: Turkish
  // "Gizlilik" (privacy) contains the letters and must not be touched.
  [/\blili\b/g, DISPLAY_NAME]
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
  'src/renderer/src/i18n/en-runtime-required.json',
  // The window and browser-tab title. Missed on the first rename, which is how
  // "lili" survived in the most visible place there is.
  'src/renderer/index.html'
].map((p) => join(repoRoot, p))

/** Exact one-off swaps that a word-level pass cannot express. */
const LITERAL_SWAPS = [
  [
    'src/renderer/src/components/Landing.tsx',
    "import logo from '../../../../resources/logo.svg'",
    "import logo from '../../../../resources/xinxin-logo.png'"
  ],
  [
    'src/renderer/src/components/Landing.tsx',
    "import logo from '../../../../resources/lili-logo.png'",
    "import logo from '../../../../resources/xinxin-logo.png'"
  ],
  // The landing wordmark was lower-cased for the previous name; the CJK form is
  // the name itself, so both earlier spellings land on it.
  [
    'src/renderer/src/components/Landing.tsx',
    "translate('auto.components.Landing.6ca6ff404e', 'lili')",
    `translate('auto.components.Landing.6ca6ff404e', '${DISPLAY_NAME}')`
  ]
]

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
  return { out, count }
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

console.log(checkOnly ? `Checking ${DISPLAY_NAME} branding…` : `Applying ${DISPLAY_NAME} branding…`)

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
