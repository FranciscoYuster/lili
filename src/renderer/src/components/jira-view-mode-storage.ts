export type JiraViewMode = 'list' | 'board' | 'timeline'

// Device-local, like the Jira list columns, rather than synced through ui.set.
const STORAGE_KEY = 'orca.jira.view-mode.v1'

function isNonDefaultMode(value: string | null): value is 'board' | 'timeline' {
  return value === 'board' || value === 'timeline'
}

export function loadJiraViewMode(): JiraViewMode {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    return isNonDefaultMode(stored) ? stored : 'list'
  } catch {
    return 'list'
  }
}

export function saveJiraViewMode(mode: JiraViewMode): void {
  try {
    // Storing only the non-default keeps a future default change from being pinned by old devices.
    if (isNonDefaultMode(mode)) {
      localStorage.setItem(STORAGE_KEY, mode)
    } else {
      localStorage.removeItem(STORAGE_KEY)
    }
  } catch {
    // The live view stays usable when browser storage is unavailable or full.
  }
}
