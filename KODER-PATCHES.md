# Koder patches

Every edit this fork makes to upstream (`stablyai/orca`) files, and why.

**The rule:** new code goes in its own directory (`src/renderer/src/koder/`,
`src/main/koder/`). New files never conflict on merge. Only the entries in the
table below can, so the table stays short — target is 10 or fewer.

After `scripts/sync-upstream.sh`, re-check each row.

## Touchpoints in upstream files

| File                                                                            | What changed                                                                                                                           | Why                                                                           |
| ------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `config/electron-builder.config.cjs`                                            | `appId`, `productName`, `executableName` (x2)                                                                                          | Ship as Lili, not Orca                                                        |
| `src/renderer/index.html`                                                       | `<title>`                                                                                                                              | Window title                                                                  |
| `src/renderer/web-index.html`                                                   | `<title>`                                                                                                                              | Browser tab title                                                             |
| `src/main/window/createMainWindow.ts`                                           | default window title                                                                                                                   | Window title                                                                  |
| `src/main/window/main-window-close-lifecycle.ts`                                | dialog title                                                                                                                           | Close dialog                                                                  |
| `src/renderer/src/web/WebConnect.tsx`                                           | mark + Spanish copy, dropped `Server` icon import                                                                                      | Pairing screen is the first thing a user sees                                 |
| `src/shared/ui-chrome-types.ts`                                                 | `'canvas'` in `TopLevelView`                                                                                                           | Canvas view                                                                   |
| `src/shared/top-level-view.ts`                                                  | `canvas: true` in the lookup                                                                                                           | Canvas view                                                                   |
| `src/shared/rpc-contract/client-ui-params.ts`                                   | `'canvas'` in `TopLevelViewSchema`                                                                                                     | Canvas view — a parity check fails the build without it                       |
| `src/renderer/src/store/slices/ui/ui-slice-contract-core.ts`                    | `UiViewHistory`, `previousViewBeforeCanvas`, `openCanvasPage`, `closeCanvasPage`                                                       | Canvas view                                                                   |
| `src/renderer/src/store/slices/ui/ui-slice-task-actions.ts`                     | initial `previousViewBeforeCanvas`                                                                                                     | Canvas view                                                                   |
| `src/renderer/src/store/slices/ui/ui-slice-view-actions.ts`                     | open/close implementations                                                                                                             | Canvas view                                                                   |
| `src/renderer/src/components/sidebar/SidebarNav.tsx`                            | Canvas nav button under Lili Mobile                                                                                                    | Canvas view                                                                   |
| `src/renderer/src/app-shell/AppWorkspaceShell.tsx`                              | lazy import + render on `activeView === 'canvas'`                                                                                      | Canvas view                                                                   |
| `src/shared/ui-chrome-types.ts`                                                 | `'harness'`, `'economy'` and `'jira'` in `RightSidebarTab`                                                                             | Harness, Economy and Jira panels                                              |
| `src/shared/rpc-contract/client-ui-params.ts`                                   | `'harness'`, `'economy'` and `'jira'` in `STATIC_RIGHT_SIDEBAR_TABS`                                                                   | Harness, Economy and Jira panels                                              |
| `src/renderer/src/store/slices/right-sidebar/right-sidebar-route.ts`            | `'harness'`, `'economy'` and `'jira'` in the persisted-route allowlist                                                                 | All three — without it the tab silently falls back to Explorer on every click |
| `src/renderer/src/components/right-sidebar/use-right-sidebar-activity-items.ts` | `Boxes` import + Harness item after `vault`; `DollarSign` import + Economy item after Harness; `JiraTabIcon` + Jira item after Economy | Harness, Economy and Jira panels                                              |
| `src/renderer/src/components/right-sidebar/right-sidebar-panel-content.tsx`     | lazy import + render on `effectiveTab === 'harness'` / `'economy'` / `'jira'`                                                          | Harness, Economy and Jira panels                                              |
| `src/shared/jira/jira-types.ts`                                                 | `startDate` and `dueDate` on `JiraIssue`                                                                                               | Jira Cronograma — a bar needs both ends                                       |
| `src/main/jira/jira-issue-mapping.ts`                                           | `'duedate'` in `ISSUE_FIELDS`; `startDate` in `JiraAgileFieldIds`; both mapped                                                         | Jira Cronograma                                                               |
| `src/main/jira/jira-agile-fields.ts`                                            | discovers the site's "Start date" date picker; adds it to `agileFieldIdList`                                                           | Jira Cronograma — Cloud has no system start date, each site names its own     |
| `src/renderer/src/components/jira-view-mode-storage.ts`                         | `'timeline'` in `JiraViewMode`                                                                                                         | Jira Cronograma                                                               |
| `src/renderer/src/components/task-page/jira/task-page-jira-view-controls.tsx`   | third toggle after List and Board                                                                                                      | Jira Cronograma                                                               |
| `src/renderer/src/components/task-page/jira/Content.tsx`                        | assignee avatar row, `visibleJiraIssues` filter, Cronograma branch, empty state                                                        | Jira assignee filter + Cronograma                                             |

The Economy (`$`) and Jira panels added **no new touchpoints**: each extra
right-sidebar tab rides the same five seams as Harness, one more line each. That
is the argument for putting the next panel there too rather than in the main
area.

**24 touchpoints — over the target of 10.** Seven are the Canvas view, five the
Harness panel and six the Jira Cronograma and assignee filter,
and they are the floor for _any_ new top-level view: upstream deliberately
spreads a view across the type, the lookup, the RPC schema, the store contract,
the store defaults, the store actions, the nav and the shell, with a
compile-time parity check that fails the build if the RPC schema is missed. The
budget was the right thing to spend here; the next feature should go in a
plugin unless it genuinely needs the main area.

The six Jira rows split in two: three extend the issue read (a due date and the
site's own start-date field) and three add the view. Extending the read is the
part that will conflict on a merge, because upstream edits `ISSUE_FIELDS` and
`mapJiraIssue` whenever it adds a field of its own. Resolving it means keeping
both sides' entries rather than taking either version whole.

## Scripted, not hand-edited

`node scripts/rebrand-lili.mjs` — **re-run after every upstream merge.**

It rewrites ~15,400 occurrences across the 11 locale files, `en-runtime-required.json`
and `Landing.tsx` (wordmark, logo import). Idempotent; `--check` reports without
writing. Resolving a merge conflict in these files means taking upstream's version
and re-running the script, never editing by hand.

Only capitalised `Orca`/`ORCA` is touched, so `orca://`, `~/.orca/`, `orcad`,
`orca-plugin.json` and `ORCA_*` all survive — verified after each run.

## Deliberately NOT changed

Renaming these would touch ~10,540 files and break working behaviour, so they
keep Orca's names even though the product is called Lili:

- `orca://` protocol scheme (127 refs) — breaks pairing
- `~/.orca/` config and credential paths (268 refs) — orphans stored Jira and
  Linear tokens
- `ORCA_*` environment variables (9,526 refs)
- `orcad` headless daemon (8,871 refs)
- `orca-plugin.json` manifest filename (157 refs) — breaks plugin installs
  (UI strings in `src/renderer/src/i18n/locales/*` ARE rebranded, but by the
  script above rather than by hand, so they are not merge-conflict sites you
  resolve manually.)

## Owned directories (no conflicts expected)

- `src/renderer/src/koder/` — `LiliMark.tsx`, `CanvasPage.tsx`, `CanvasTile.tsx`,
  `canvas-tile-layout.ts`, `canvas-tile-live.ts`, `canvas-tile-economy.ts`,
  `harness/HarnessPanel.tsx`, `harness/harness-lock.ts`,
  `economy/EconomyPanel.tsx`, `economy/economy-rows.ts`,
  `jira/JiraAssigneeFilter.tsx`, `jira/assignee-filter.ts`,
  `jira/JiraTimelineView.tsx`, `jira/jira-timeline-model.ts`,
  `jira/JiraPanel.tsx`, `jira/JiraTabIcon.tsx`, `jira/project-issues.ts`
- `scripts/rebrand-lili.mjs`
- `resources/lili-logo.svg`
