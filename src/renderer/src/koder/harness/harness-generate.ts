/**
 * The disk half of the generator: read what the project already has, then write
 * only the rows the plan marked writable.
 *
 * Two host details this has to respect. `fs:writeFile` does not create parent
 * directories, so `docs/design/` and `.agents/skills/` are created first;
 * `fs:createDir` refuses a directory that already exists, so each one is probed
 * before it is created rather than created and forgiven.
 */

import { joinPath } from '@/lib/path'
import { readRuntimeFileContent } from '@/runtime/files/reads/runtime-file-read-client'
import { runtimePathsExist } from '@/runtime/files/metadata/runtime-path-existence-batch'
import type { PathExistenceResult } from '../../../../shared/path-existence-batch'
import {
  createRuntimePath,
  writeRuntimeFile
} from '@/runtime/files/mutations/runtime-file-mutation-client'
import type { RuntimeFileOperationArgs } from '@/runtime/files/runtime-file-client-types'
import {
  HARNESS_AGENTS_FILE,
  HARNESS_CLAUDE_FILE,
  HARNESS_DESIGN_FILE,
  HARNESS_MCP_FILE,
  HARNESS_SKILLS_README
} from './harness-blueprint'
import {
  requiredHarnessDirectories,
  writableHarnessRows,
  type ExistingHarnessFile,
  type HarnessPlanRow
} from './harness-plan'

/** Every file the plan can decide about, so one read covers the whole decision. */
export const HARNESS_PLAN_FILES = [
  HARNESS_AGENTS_FILE,
  HARNESS_CLAUDE_FILE,
  HARNESS_SKILLS_README,
  HARNESS_DESIGN_FILE,
  HARNESS_MCP_FILE
] as const

type ReadTarget = { target: RuntimeFileOperationArgs['target']; worktreeId: string | null }

/**
 * A failed read comes back as absent, which is the one wrong answer that is also
 * the safe one: the plan then proposes a create, and the create is confirmed by
 * a human before it runs.
 */
export async function readExistingHarness(
  read: ReadTarget,
  worktreePath: string
): Promise<ExistingHarnessFile[]> {
  return Promise.all(
    HARNESS_PLAN_FILES.map(async (relativePath): Promise<ExistingHarnessFile> => {
      const content = await readRuntimeFileContent({
        target: read.target,
        worktreeId: read.worktreeId ?? undefined,
        filePath: joinPath(worktreePath, relativePath),
        // Why both: a remote runtime resolves the read root-relative and ignores the absolute path.
        relativePath
      })
        .then((result) => (result.isBinary ? null : result.content))
        .catch(() => null)
      return { relativePath, content }
    })
  )
}

/** An error row means "cannot tell", which is neither present nor absent. */
function existenceOf(rows: readonly PathExistenceResult[] | null, index: number): boolean | null {
  const row = rows?.[index]
  return row && 'exists' in row ? row.exists : null
}

export type HarnessWriteResult = {
  written: string[]
  /** Paths that failed, with the reason, so a partial run is reported as partial. */
  failed: { relativePath: string; message: string }[]
}

export async function applyHarnessPlan(
  context: RuntimeFileOperationArgs,
  worktreePath: string,
  rows: readonly HarnessPlanRow[]
): Promise<HarnessWriteResult> {
  const result: HarnessWriteResult = { written: [], failed: [] }
  const directories = requiredHarnessDirectories(rows)
  if (directories.length > 0) {
    const absolute = directories.map((directory) => joinPath(worktreePath, directory))
    const existence = await runtimePathsExist(context, absolute).catch(() => null)
    for (const [index, directory] of directories.entries()) {
      // No existence answer means "cannot tell"; attempting the create is the
      // cheaper mistake, because an already-present directory only errors here.
      const present = existenceOf(existence, index)
      if (present === true) {
        continue
      }
      try {
        await createRuntimePath(context, absolute[index], 'directory')
      } catch (caught) {
        // Only a confirmed absence makes this a real failure: a create that
        // lost a race with an already-present directory is the expected case.
        if (present === false) {
          result.failed.push({ relativePath: directory, message: errorMessage(caught) })
        }
      }
    }
  }
  for (const row of writableHarnessRows(rows)) {
    try {
      await writeRuntimeFile(context, joinPath(worktreePath, row.relativePath), row.content ?? '')
      result.written.push(row.relativePath)
    } catch (caught) {
      result.failed.push({ relativePath: row.relativePath, message: errorMessage(caught) })
    }
  }
  return result
}

function errorMessage(caught: unknown): string {
  return caught instanceof Error ? caught.message : String(caught)
}
