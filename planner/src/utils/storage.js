const KEY     = 'cos_planner_v1'
const LOG_KEY = 'cos_worklog_v1'

/**
 * Load tasks from localStorage.
 * Falls back to empty state — never throws.
 */
export function loadTasks() {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const data = JSON.parse(raw)
      return {
        tasks:    Array.isArray(data.tasks) ? data.tasks : [],
        lastSync: data.lastSync ?? null,
      }
    }
  } catch {
    // Corrupted storage — start fresh
    localStorage.removeItem(KEY)
  }
  return { tasks: [], lastSync: null }
}

/**
 * Persist tasks to localStorage.
 * Preserves lastSync if not provided.
 */
export function saveTasks(tasks, lastSync = undefined) {
  try {
    const existing  = JSON.parse(localStorage.getItem(KEY) ?? '{}')
    const syncValue = lastSync !== undefined ? lastSync : (existing.lastSync ?? null)
    localStorage.setItem(KEY, JSON.stringify({ tasks, lastSync: syncValue }))
  } catch {
    // Quota exceeded or private browsing — silently skip
  }
}

// ── Work Log ──────────────────────────────────────────────────────────────────

export function loadWorkLog() {
  try {
    const raw = localStorage.getItem(LOG_KEY)
    if (raw) return JSON.parse(raw)
  } catch {
    localStorage.removeItem(LOG_KEY)
  }
  return []
}

export function saveWorkLog(items) {
  try {
    localStorage.setItem(LOG_KEY, JSON.stringify(items))
  } catch {
    // Quota exceeded or private browsing — silently skip
  }
}

// ── Tasks ─────────────────────────────────────────────────────────────────────

/**
 * Merge remote tasks (WorkIQ or Teams bot) into the current task list.
 *
 * Rules:
 *  - Existing manual tasks are never touched.
 *  - Remote tasks (workiq / teams) already in the list are updated in place.
 *  - New remote tasks are appended.
 *  - Remote tasks that no longer appear in the fresh sync are removed.
 */
export function mergeWorkiqTasks(existing, incoming) {
  const manual   = existing.filter(t => t.source === 'manual')
  const incomingIds = new Set(incoming.map(t => t.id))

  // Keep remote tasks still present in the new sync (preserving completed state)
  const retained = existing
    .filter(t => (t.source === 'workiq' || t.source === 'teams') && incomingIds.has(t.id))
    .map(old => {
      const fresh = incoming.find(t => t.id === old.id)
      return { ...fresh, completed: old.completed }   // keep user's tick
    })

  const retainedIds = new Set(retained.map(t => t.id))
  const added       = incoming.filter(t => !retainedIds.has(t.id))

  return [...manual, ...retained, ...added]
}
