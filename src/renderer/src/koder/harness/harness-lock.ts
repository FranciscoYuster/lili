/**
 * The project's skills lockfile, read as evidence rather than as truth.
 *
 * `skills-lock.json` is a Koder convention, not an Orca one: it pins every
 * skill a project depends on to a source and a content hash, so a workspace
 * cannot quietly drift onto a different version of someone else's skill.
 *
 * What this module reports is *coverage*, not verification. It answers "is this
 * skill declared in the lock" by name. It does NOT recompute the skill's hash
 * and compare — that needs the file bytes and the same digest the lock was
 * written with, which is a main-process job. Saying "verified" here when all we
 * checked is a name would be worse than saying nothing, so the status names
 * stay honest: locked, unlocked, missing.
 */

export const SKILLS_LOCK_FILENAME = 'skills-lock.json'

export type SkillLockEntry = {
  name: string
  source: string | null
  sourceType: string | null
  /** Short form is all the UI shows; the full value stays for a future check. */
  computedHash: string | null
}

export type SkillsLock = {
  version: number | null
  entries: SkillLockEntry[]
}

function readString(record: Record<string, unknown>, key: string): string | null {
  const value = record[key]
  return typeof value === 'string' && value.trim() !== '' ? value : null
}

/** Returns null for absent or unreadable locks; a malformed lock is not an error state worth
 *  blocking the panel over, it just means the project has no usable coverage data. */
export function parseSkillsLock(text: string | null | undefined): SkillsLock | null {
  if (!text || text.trim() === '') {
    return null
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return null
  }
  if (typeof parsed !== 'object' || parsed === null) {
    return null
  }
  const root = parsed as Record<string, unknown>
  const skills = root.skills
  if (typeof skills !== 'object' || skills === null) {
    return null
  }
  const entries: SkillLockEntry[] = []
  for (const [name, value] of Object.entries(skills as Record<string, unknown>)) {
    if (typeof value !== 'object' || value === null) {
      continue
    }
    const record = value as Record<string, unknown>
    entries.push({
      name,
      source: readString(record, 'source'),
      sourceType: readString(record, 'sourceType'),
      computedHash: readString(record, 'computedHash')
    })
  }
  entries.sort((left, right) => left.name.localeCompare(right.name))
  return { version: typeof root.version === 'number' ? root.version : null, entries }
}

export type HarnessSkillStatus =
  /** Installed on disk and declared in the lock. */
  | 'locked'
  /** Installed on disk, absent from the lock — nothing pins its version. */
  | 'unlocked'
  /** Declared in the lock but not found by discovery — the harness is incomplete. */
  | 'missing'

export type HarnessSkillRow = {
  key: string
  name: string
  /** Where discovery found it, or where the lock says it came from. */
  origin: string | null
  status: HarnessSkillStatus
  hash: string | null
  /** Project skills are this harness; global ones are the machine's, shared by every project. */
  scope: 'project' | 'global'
}

type DiscoveredSkillLike = {
  id: string
  name: string
  sourceLabel: string
  installed: boolean
  rootPath: string
  rootPaths?: string[]
}

/** Discovery scans the home roots of every agent plus every registered repo, so a project
 *  with twelve skills of its own reports two hundred. Path containment is what separates
 *  "this project hands the agent this" from "this machine happens to have it installed". */
function isUnderPath(candidate: string, root: string): boolean {
  if (!root) {
    return false
  }
  const normalizedRoot = root.replace(/[\\/]+$/, '')
  const normalized = candidate.replace(/\\/g, '/')
  const target = normalizedRoot.replace(/\\/g, '/')
  return normalized === target || normalized.startsWith(`${target}/`)
}

function normalize(value: string): string {
  return value.trim().toLowerCase()
}

export function shortHash(hash: string | null): string | null {
  if (!hash) {
    return null
  }
  const bare = hash.includes(':') ? hash.slice(hash.indexOf(':') + 1) : hash
  return bare.slice(0, 7)
}

/**
 * Merges what is on disk with what the lock declares.
 *
 * Both directions matter: an installed skill nobody pinned is a drift risk, and
 * a pinned skill nobody installed is a hole in the harness. A panel that showed
 * only the intersection would hide exactly the two cases worth acting on.
 */
export function buildHarnessSkillRows(
  skills: readonly DiscoveredSkillLike[],
  lock: SkillsLock | null,
  workspacePath: string | null
): HarnessSkillRow[] {
  const lockByName = new Map<string, SkillLockEntry>()
  for (const entry of lock?.entries ?? []) {
    lockByName.set(normalize(entry.name), entry)
  }
  // One row per skill name. The same name legitimately exists under several roots — a skill
  // vendored into three repos plus the agent's home — and the project's own copy is the one
  // this panel is about, so it wins the collision regardless of discovery order.
  const byName = new Map<string, HarnessSkillRow>()
  for (const skill of skills) {
    if (!skill.installed) {
      continue
    }
    const key = normalize(skill.name)
    const entry = lockByName.get(key)
    const roots = skill.rootPaths?.length ? skill.rootPaths : [skill.rootPath]
    const scope: HarnessSkillRow['scope'] =
      workspacePath && roots.some((root) => isUnderPath(root, workspacePath)) ? 'project' : 'global'
    const existing = byName.get(key)
    if (existing && (existing.scope === 'project' || scope === 'global')) {
      continue
    }
    byName.set(key, {
      key: skill.id,
      name: skill.name,
      origin: entry?.source ?? skill.sourceLabel,
      status: entry ? 'locked' : 'unlocked',
      hash: entry?.computedHash ?? null,
      scope
    })
  }
  const seen = new Set(byName.keys())
  const rows: HarnessSkillRow[] = [...byName.values()]
  for (const entry of lock?.entries ?? []) {
    if (seen.has(normalize(entry.name))) {
      continue
    }
    rows.push({
      key: `lock:${entry.name}`,
      name: entry.name,
      origin: entry.source,
      status: 'missing',
      hash: entry.computedHash,
      // The lock belongs to the project, so anything it names and discovery missed is a project hole.
      scope: 'project'
    })
  }
  const order: Record<HarnessSkillStatus, number> = { missing: 0, unlocked: 1, locked: 2 }
  rows.sort(
    (left, right) => order[left.status] - order[right.status] || left.name.localeCompare(right.name)
  )
  return rows
}

export function countLockedSkills(rows: readonly HarnessSkillRow[]): number {
  return rows.filter((row) => row.status === 'locked').length
}

export function projectSkillRows(rows: readonly HarnessSkillRow[]): HarnessSkillRow[] {
  return rows.filter((row) => row.scope === 'project')
}

export function countGlobalSkills(rows: readonly HarnessSkillRow[]): number {
  return rows.filter((row) => row.scope === 'global').length
}
