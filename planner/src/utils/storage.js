const KEY              = 'cos_planner_v1'
const LOG_KEY          = 'cos_worklog_v1'
const GITHUB_TOKEN_KEY = 'cos_github_token_v1'

// ── GitHub Sync ───────────────────────────────────────────────────────────────

const REPO = 'renorth/chief-of-staff'

export function getGitHubToken() {
  return localStorage.getItem(GITHUB_TOKEN_KEY) ?? ''
}

export function setGitHubToken(token) {
  if (token?.trim()) localStorage.setItem(GITHUB_TOKEN_KEY, token.trim())
  else localStorage.removeItem(GITHUB_TOKEN_KEY)
}

const _shaCache = {}  // path → sha, updated after every successful write

async function fetchFileSha(path, token) {
  try {
    const r = await fetch(`https://api.github.com/repos/${REPO}/contents/${path}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github.v3+json' },
    })
    if (!r.ok) return null
    const data = await r.json()
    return data.sha ?? null
  } catch {
    return null
  }
}

// Fetch a JSON file via the Contents API (bypasses CDN cache; uses auth if token provided)
export async function fetchGitHubFile(path, token) {
  try {
    const headers = { Accept: 'application/vnd.github.raw+json' }
    if (token) headers.Authorization = `Bearer ${token}`
    const r = await fetch(`https://api.github.com/repos/${REPO}/contents/${path}`, { headers })
    if (!r.ok) return null
    return r.json()
  } catch {
    return null
  }
}

export async function pushToGitHub(path, content, token, _retrying = false) {
  if (!token) return { ok: false, error: 'no-token' }
  try {
    // Use cached SHA to avoid stale-read 409s; fall back to a fresh fetch
    const sha = _shaCache[path] ?? await fetchFileSha(path, token)
    const body = {
      message: `planner: sync ${new Date().toISOString()}`,
      content: btoa(unescape(encodeURIComponent(JSON.stringify(content, null, 2)))),
      ...(sha ? { sha } : {}),
    }
    const r = await fetch(`https://api.github.com/repos/${REPO}/contents/${path}`, {
      method:  'PUT',
      headers: {
        Authorization:  `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept:         'application/vnd.github.v3+json',
      },
      body: JSON.stringify(body),
    })
    if (r.status === 401 || r.status === 403) return { ok: false, error: 'bad-token' }
    if (r.status === 409 && !_retrying) {
      // SHA is stale — clear cache, re-fetch, and retry once
      delete _shaCache[path]
      return pushToGitHub(path, content, token, true)
    }
    if (!r.ok) {
      const msg = await r.json().then(d => d.message).catch(() => '')
      return { ok: false, error: `${r.status}${msg ? ': ' + msg : ''}` }
    }
    // Cache the new SHA from the response so the next write skips the GET
    const data = await r.json().catch(() => null)
    if (data?.content?.sha) _shaCache[path] = data.content.sha
    return { ok: true }
  } catch {
    return { ok: false, error: 'network' }
  }
}

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
