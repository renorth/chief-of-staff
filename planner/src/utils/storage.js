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
    if (raw) {
      const items = JSON.parse(raw)
      // Ensure every item has required array fields (guard against schema drift)
      return Array.isArray(items)
        ? items.map(i => ({ ...i, notes: Array.isArray(i.notes) ? i.notes : [] }))
        : []
    }
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

// ── ADO merge ─────────────────────────────────────────────────────────────────

const DELETED_ADO_KEY = 'cos_deleted_ado_ids_v1'

export function loadDeletedAdoIds() {
  try {
    const raw = localStorage.getItem(DELETED_ADO_KEY)
    return raw ? new Set(JSON.parse(raw)) : new Set()
  } catch {
    return new Set()
  }
}

export function saveDeletedAdoId(adoId) {
  if (!adoId) return
  try {
    const existing = loadDeletedAdoIds()
    existing.add(adoId)
    localStorage.setItem(DELETED_ADO_KEY, JSON.stringify([...existing]))
  } catch {}
}

/**
 * Merge ADO items fetched from GitHub into the work log.
 * - Existing items matched by adoId: title updated only (status/tag preserved).
 * - New items appended with source:'ado', unless in deletedIds.
 */
export function mergeAdoItems(existing, incoming, deletedIds = new Set()) {
  const result = existing.map(item => {
    const match = incoming.find(i => i.adoId === item.adoId)
    if (!match) return item
    return { ...item, title: match.title }  // preserve user's status and tag
  })

  const existingAdoIds = new Set(existing.map(i => i.adoId))
  for (const item of incoming) {
    if (existingAdoIds.has(item.adoId)) continue
    if (deletedIds.has(item.adoId)) continue   // permanently deleted by user
    result.push({
      id:        crypto.randomUUID(),
      adoId:     item.adoId,
      title:     item.title,
      status:    'New',
      tag:       null,
      notes:     [],
      source:    'ado',
      createdAt: new Date().toISOString(),
    })
  }

  return result
}

// ── Tasks ─────────────────────────────────────────────────────────────────────

const DELETED_TASK_KEY = 'cos_deleted_task_ids_v1'

export function loadDeletedTaskIds() {
  try {
    const raw = localStorage.getItem(DELETED_TASK_KEY)
    return raw ? new Set(JSON.parse(raw)) : new Set()
  } catch {
    return new Set()
  }
}

export function saveDeletedTaskId(id) {
  if (!id) return
  try {
    const existing = loadDeletedTaskIds()
    existing.add(id)
    localStorage.setItem(DELETED_TASK_KEY, JSON.stringify([...existing]))
  } catch {}
}

/**
 * Merge remote tasks (WorkIQ or Teams bot) into the current task list.
 *
 * Rules:
 *  - Existing manual tasks are never touched.
 *  - Remote tasks (workiq / teams) already in the list are updated in place.
 *  - New remote tasks are appended, unless permanently deleted by user.
 *  - Remote tasks that no longer appear in the fresh sync are removed.
 */
export function mergeWorkiqTasks(existing, incoming, deletedIds = new Set()) {
  const manual      = existing.filter(t => t.source === 'manual')
  const incomingIds = new Set(incoming.map(t => t.id))

  // Keep remote tasks still present in the new sync (preserving completed state)
  const retained = existing
    .filter(t => (t.source === 'workiq' || t.source === 'teams') && incomingIds.has(t.id))
    .map(old => {
      const fresh = incoming.find(t => t.id === old.id)
      return { ...fresh, completed: old.completed }   // keep user's tick
    })

  const retainedIds = new Set(retained.map(t => t.id))
  const added       = incoming.filter(t => !retainedIds.has(t.id) && !deletedIds.has(t.id))

  return [...manual, ...retained, ...added]
}
