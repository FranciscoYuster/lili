/**
 * What the user types for an MCP server, and the one thing this module exists
 * to refuse: a secret.
 *
 * `.mcp.json` is a committed file. The generator therefore asks for the *name*
 * of an environment variable the project already defines and writes `${NAME}`.
 * Nothing stops a person from pasting the connection string into that field by
 * mistake, so the check is here rather than in a comment — and it is a hard
 * rejection, not a warning, because a warning gets clicked through and the
 * credential ends up in git history where deleting it does not remove it.
 */

import type { HarnessMcpInput } from './harness-blueprint'

export type HarnessMcpDraft = {
  /** Stable key for React; never written anywhere. */
  id: string
  name: string
  command: string
  /** Whitespace-separated, as a person types a command line. */
  args: string
  envKey: string
  /** The NAME of a project environment variable, not its value. */
  envVar: string
}

export type HarnessMcpDraftError =
  | 'nameRequired'
  | 'nameInvalid'
  | 'commandRequired'
  | 'envKeyRequired'
  | 'envVarRequired'
  | 'envVarInvalid'
  | 'envVarLooksLikeSecret'

const SERVER_NAME = /^[a-z0-9][a-z0-9_-]*$/i
const ENV_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/

export function isEnvironmentVariableName(value: string): boolean {
  return ENV_NAME.test(value.trim())
}

/**
 * True when the text is a value rather than a variable name. Anything carrying
 * a scheme, credentials, whitespace or a path separator is a value; so is
 * anything long enough that no one would name a variable that.
 */
export function looksLikeSecret(value: string): boolean {
  const trimmed = value.trim()
  if (trimmed === '') {
    return false
  }
  return (
    /[:/@\s]/.test(trimmed) ||
    trimmed.includes('://') ||
    trimmed.length > 64 ||
    /^(mongodb|postgres|postgresql|mysql|redis|https?)\b/i.test(trimmed)
  )
}

/** Empty when the draft is usable. First error per field, in field order. */
export function validateMcpDraft(draft: HarnessMcpDraft): HarnessMcpDraftError[] {
  const errors: HarnessMcpDraftError[] = []
  const name = draft.name.trim()
  if (name === '') {
    errors.push('nameRequired')
  } else if (!SERVER_NAME.test(name)) {
    errors.push('nameInvalid')
  }
  if (draft.command.trim() === '') {
    errors.push('commandRequired')
  }
  // A key with no variable, or a variable with no key, is half a binding; both
  // blank is legitimate — plenty of servers need no environment at all.
  const envKey = draft.envKey.trim()
  const envVar = draft.envVar.trim()
  if (envKey === '' && envVar !== '') {
    errors.push('envKeyRequired')
  }
  if (envVar === '' && envKey !== '') {
    errors.push('envVarRequired')
  }
  if (envVar !== '') {
    if (looksLikeSecret(envVar)) {
      errors.push('envVarLooksLikeSecret')
    } else if (!isEnvironmentVariableName(envVar)) {
      errors.push('envVarInvalid')
    }
  }
  return errors
}

export function toMcpInput(draft: HarnessMcpDraft): HarnessMcpInput {
  const envKey = draft.envKey.trim()
  const envVar = draft.envVar.trim()
  return {
    name: draft.name.trim(),
    command: draft.command.trim(),
    args: draft.args.trim().split(/\s+/).filter(Boolean),
    env: envKey && envVar ? [{ key: envKey, variable: envVar }] : []
  }
}

/**
 * MongoDB prefilled because it is the case this was built for; every field is
 * editable, and the variable name is left blank on purpose so nobody confirms
 * a guess about which variable this project actually defines.
 */
export function mongoDbDraft(id: string): HarnessMcpDraft {
  return {
    id,
    name: 'mongodb',
    command: 'npx',
    args: '-y mongodb-mcp-server',
    envKey: 'MDB_MCP_CONNECTION_STRING',
    envVar: ''
  }
}

export function blankDraft(id: string): HarnessMcpDraft {
  return { id, name: '', command: 'npx', args: '', envKey: '', envVar: '' }
}
