const KEY = 'cos_planner_v1'

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

/**
 * Merge WorkIQ-sourced tasks into the current task list.
 *
 * Rules:
 *  - Existing manual tasks are never touched.
 *  - WorkIQ tasks already in the list (matched by id) are updated in place.
 *  - New WorkIQ tasks are appended.
 *  - WorkIQ tasks that no longer appear in the fresh sync are removed
 *    (they were completed or no longer relevant in M365).
 */
export function mergeWorkiqTasks(existing, incoming) {
  const manual   = existing.filter(t => t.source === 'manual')
  const incomingIds = new Set(incoming.map(t => t.id))

  // Keep WorkIQ tasks still present in the new sync (preserving completed state)
  const retained = existing
    .filter(t => t.source === 'workiq' && incomingIds.has(t.id))
    .map(old => {
      const fresh = incoming.find(t => t.id === old.id)
      return { ...fresh, completed: old.completed }   // keep user's tick
    })

  const retainedIds = new Set(retained.map(t => t.id))
  const added       = incoming.filter(t => !retainedIds.has(t.id))

  return [...manual, ...retained, ...added]
}
