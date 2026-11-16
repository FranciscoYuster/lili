/**
 * The harness this project hands its agents, as content rather than as a wish.
 *
 * One source of truth — AGENTS.md — plus thin per-agent adapters. Claude reads
 * it through a two-line CLAUDE.md that imports it with `@`; Codex, OpenCode and
 * the rest read AGENTS.md directly, because that file is their native name for
 * the same thing. Nothing here is duplicated per agent: a harness that says the
 * same thing in forty dialects drifts in thirty-nine of them.
 *
 * Skills live in `.agents/skills/` because that root is already shared — this
 * app's own discovery reads it for Codex and Muse. Only material with no
 * equivalent elsewhere (hooks, subagents, slash commands) stays under `.claude/`.
 *
 * Generated text is English by project convention, even though the panel speaks
 * Spanish: these files are checked in and read by tools, not by one team.
 */

/** An MCP server the user chose, carrying variable NAMES — never their values. */
export type HarnessMcpInput = {
  /** Server key under `mcpServers`. */
  name: string
  command: string
  args: string[]
  /**
   * Environment the server needs. `variable` is the name of a variable the
   * project already defines; the written file holds `${variable}`, so the
   * secret itself never enters a committed file.
   */
  env: { key: string; variable: string }[]
}

export type HarnessInputs = {
  /** Repository or product name, as it should read in a heading. */
  projectName: string
  /** One sentence: what this project is for. Blank is allowed and marked TODO. */
  summary: string
  /** Free text, e.g. "Next.js 16 · MongoDB · Vercel". */
  stack: string
  mcp: HarnessMcpInput[]
  /** `plugin@marketplace` references this project should enable. */
  plugins: string[]
  /** Marketplaces the repository itself should declare, as `owner/repo`. */
  marketplaces: { name: string; repo: string }[]
}

export const HARNESS_AGENTS_FILE = 'AGENTS.md'
export const HARNESS_CLAUDE_FILE = 'CLAUDE.md'
export const HARNESS_MCP_FILE = '.mcp.json'
export const HARNESS_SKILLS_DIR = '.agents/skills'
export const HARNESS_SKILLS_README = `${HARNESS_SKILLS_DIR}/README.md`
export const HARNESS_DESIGN_FILE = 'docs/design/DESIGN-SYSTEM.md'

/** The line that makes CLAUDE.md an adapter instead of a second source. */
export const CLAUDE_IMPORT_LINE = `@${HARNESS_AGENTS_FILE}`

const TODO = '<!-- TODO: fill this in. An agent will follow whatever is here. -->'

function orTodo(value: string): string {
  const trimmed = value.trim()
  return trimmed || TODO
}

export function buildAgentsDoc(inputs: HarnessInputs): string {
  const title = inputs.projectName.trim() || 'This project'
  return `# ${title} — agent harness

Every agent that works in this repository reads this file. Claude reads it
through \`${HARNESS_CLAUDE_FILE}\`, which imports it; Codex and the others read it
directly. Change it here and every agent changes with it.

## What this is

${orTodo(inputs.summary)}

## Stack

${orTodo(inputs.stack)}

## How to run it

${TODO}

- Install:
- Develop:
- Test:
- Build:

## Conventions that are not negotiable

${TODO}

## What an agent must not do

- Do not commit secrets. Connection strings and API keys come from environment
  variables; \`${HARNESS_MCP_FILE}\` holds variable names, never values.
- Do not change the production schema or production data directly. Propose a
  migration and let a human apply it.
- Do not widen the scope of a task on its own initiative. Finish what was asked
  and say what else you found.

## Where the rest lives

- \`${HARNESS_SKILLS_DIR}/\` — skills shared by every agent in this project.
- \`.claude/\` — only what has no equivalent elsewhere: hooks, subagents, commands.
- \`${HARNESS_DESIGN_FILE}\` — how the interface is supposed to look and behave.
- \`${HARNESS_MCP_FILE}\` — the MCP servers this project declares.
`
}

export function buildClaudeDoc(): string {
  // Two lines on purpose: a CLAUDE.md with its own rules becomes a second
  // source, and the two drift apart the first time only one is edited.
  return `${CLAUDE_IMPORT_LINE}\n`
}

/** Prepends the import to a CLAUDE.md that already has content of its own. */
export function withClaudeImport(existing: string): string {
  return `${CLAUDE_IMPORT_LINE}\n\n${existing.replace(/^\n+/, '')}`
}

export function claudeImportsAgents(content: string): boolean {
  // Matches the import on its own line, so a mention inside prose does not count.
  return new RegExp(`^\\s*@${HARNESS_AGENTS_FILE}\\s*$`, 'm').test(content)
}

export function buildSkillsReadme(): string {
  return `# Shared skills

Skills in this folder are read by every agent that supports a shared skills
root, including Codex and this app's own discovery. Agent-specific material —
hooks, subagents, slash commands — has no equivalent here and stays in
\`.claude/\`.

One directory per skill, each with a \`SKILL.md\` carrying \`name\` and
\`description\` frontmatter. The description is what an agent reads to decide
whether the skill applies, so write it as a trigger, not as a summary.
`
}

export function buildDesignDoc(inputs: HarnessInputs): string {
  const title = inputs.projectName.trim() || 'This project'
  return `# ${title} — design system

What the interface is allowed to look like. An agent that has to guess a colour
invents one, and every screen it touches drifts a little further from the rest.

## Tokens

${TODO}

| Token | Value | Used for |
| --- | --- | --- |
|  |  |  |

## Typography

${TODO}

## Spacing and radius

${TODO}

## Components

${TODO}

## States

Every interactive surface needs all five, and an agent will ship only the first
unless the other four are written down: default, hover, focus-visible, disabled,
loading. Empty and error states count as screens, not as afterthoughts.

## Accessibility floor

- Contrast at least 4.5:1 for body text, in both themes.
- Touch targets at least 44×44 px.
- Focus is always visible; never \`outline: none\` without a replacement.
- \`prefers-reduced-motion\` is respected.
`
}

/** The `.mcp.json` body for the chosen servers. Values are variable references. */
export function buildMcpConfig(servers: readonly HarnessMcpInput[]): string {
  const mcpServers: Record<string, unknown> = {}
  for (const server of servers) {
    const env: Record<string, string> = {}
    for (const entry of server.env) {
      // The committed file carries the reference; the value stays in the environment.
      env[entry.key] = `\${${entry.variable}}`
    }
    mcpServers[server.name] = {
      command: server.command,
      args: server.args,
      ...(Object.keys(env).length > 0 ? { env } : {})
    }
  }
  return `${JSON.stringify({ mcpServers }, null, 2)}\n`
}
