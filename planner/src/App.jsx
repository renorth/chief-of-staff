import { useState, useEffect, useRef } from 'react'
import {
  DndContext,
  DragOverlay,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import { arrayMove } from '@dnd-kit/sortable'
import Column from './components/Column.jsx'
import TaskInput from './components/TaskInput.jsx'
import TaskCard from './components/TaskCard.jsx'
import { loadTasks, saveTasks, mergeWorkiqTasks, loadWorkLog, saveWorkLog, mergeAdoItems, loadDeletedAdoIds, saveDeletedAdoId, loadDeletedTaskIds, saveDeletedTaskId, getGitHubToken, setGitHubToken, pushToGitHub } from './utils/storage.js'
import Archive from './components/Archive.jsx'
import WorkLog from './components/WorkLog.jsx'
import { COLUMNS, TAGS } from './constants.js'

const TASKS_URL =
  'https://raw.githubusercontent.com/renorth/chief-of-staff/main/planner/data/tasks.json'

const ADO_ITEMS_URL =
  'https://raw.githubusercontent.com/renorth/chief-of-staff/main/planner/data/ado-items.json'



function formatDate() {
  return new Date().toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  })
}

function formatSync(iso) {
  if (!iso) return null
  return new Date(iso).toLocaleTimeString('en-US', {
    hour: 'numeric', minute: '2-digit',
  })
}

export default function App() {
  const [tasks, setTasks]           = useState([])
  const [lastSync, setLastSync]     = useState(null)
  const [activeTask, setActiveTask] = useState(null)
  const [syncing, setSyncing]       = useState(false)
  const [workLog, setWorkLog]       = useState(() => loadWorkLog())

  const [ghToken, setGhToken]         = useState(() => getGitHubToken())
  const [ghStatus, setGhStatus]       = useState('idle') // idle | saving | saved | error | bad-token
  const [ghLoaded, setGhLoaded]       = useState(false)
  const [showTokenInput, setShowTokenInput] = useState(false)
  const [tokenDraft, setTokenDraft]   = useState('')
  const ghTimerRef                    = useRef(null)

  // Load localStorage then pull latest WorkIQ sync from GitHub
  useEffect(() => {
    const stored = loadTasks()
    setTasks(stored.tasks)
    setLastSync(stored.lastSync)

    setSyncing(true)
    fetch(`${TASKS_URL}?t=${Date.now()}`)
      .then(r => r.ok ? r.json() : null)
      .then(remote => {
        if (!remote?.tasks?.length) return
        // Skip if local data is already up-to-date
        if (stored.lastSync && remote.lastSync && remote.lastSync <= stored.lastSync) return
        const merged = mergeWorkiqTasks(stored.tasks, remote.tasks, loadDeletedTaskIds())
        setTasks(merged)
        if (remote.lastSync) setLastSync(remote.lastSync)
      })
      .catch(() => {})   // offline or rate-limited — use localStorage silently
      .finally(() => setSyncing(false))
  }, [])

  // Persist to localStorage whenever tasks change
  useEffect(() => {
    if (tasks.length > 0 || lastSync) {
      saveTasks(tasks, lastSync)
    }
  }, [tasks, lastSync])

  // Persist work log
  useEffect(() => { saveWorkLog(workLog) }, [workLog])

  // On load: fetch manual tasks + workLog saved from other devices
  useEffect(() => {
    if (!ghToken) { setGhLoaded(true); return }
    const base = 'https://raw.githubusercontent.com/renorth/chief-of-staff/main/planner/data'
    Promise.all([
      fetch(`${base}/manual-tasks.json?t=${Date.now()}`).then(r => r.ok ? r.json() : null).catch(() => null),
      fetch(`${base}/worklog.json?t=${Date.now()}`).then(r => r.ok ? r.json() : null).catch(() => null),
    ]).then(([remoteTasks, remoteLog]) => {
      if (Array.isArray(remoteTasks) && remoteTasks.length > 0) {
        const deletedIds = loadDeletedTaskIds()
        setTasks(prev => {
          const localIds = new Set(prev.map(t => t.id))
          const toAdd    = remoteTasks.filter(t => !localIds.has(t.id) && !deletedIds.has(t.id))
          return toAdd.length ? [...prev, ...toAdd] : prev
        })
      }
      if (Array.isArray(remoteLog) && remoteLog.length > 0) {
        const deletedIds = loadDeletedAdoIds()
        setWorkLog(prev => {
          const remoteMap = new Map(remoteLog.map(i => [i.id, i]))
          const updated   = prev.map(i => remoteMap.has(i.id) ? remoteMap.get(i.id) : i)
          const localIds  = new Set(prev.map(i => i.id))
          const toAdd     = remoteLog.filter(i => !localIds.has(i.id) && !deletedIds.has(i.adoId))
          return toAdd.length ? [...updated, ...toAdd] : updated
        })
      }
    }).finally(() => setGhLoaded(true))
  }, [ghToken])

  // Debounced save to GitHub after any change (only after initial load)
  useEffect(() => {
    if (!ghToken || !ghLoaded) return
    clearTimeout(ghTimerRef.current)
    ghTimerRef.current = setTimeout(async () => {
      setGhStatus('saving')
      const [r1, r2] = await Promise.all([
        pushToGitHub('planner/data/manual-tasks.json', tasks.filter(t => t.source === 'manual'), ghToken),
        pushToGitHub('planner/data/worklog.json', workLog, ghToken),
      ])
      const err = r1.error || r2.error
      if (err === 'bad-token') setGhStatus('bad-token')
      else if (r1.ok && r2.ok) setGhStatus('saved')
      else setGhStatus('error')
    }, 3000)
    return () => clearTimeout(ghTimerRef.current)
  }, [tasks, workLog, ghToken, ghLoaded])

  // Sync ADO items from GitHub on load
  useEffect(() => {
    fetch(`${ADO_ITEMS_URL}?t=${Date.now()}`)
      .then(r => r.ok ? r.json() : null)
      .then(remote => {
        if (!remote?.items?.length) return
        const deletedIds = loadDeletedAdoIds()
        setWorkLog(prev => {
          try {
            return mergeAdoItems(prev, remote.items, deletedIds)
          } catch {
            return prev  // merge failed — keep existing data untouched
          }
        })
      })
      .catch(() => {})  // offline or rate-limited — silently skip
  }, [])

  // ── GitHub token ──────────────────────────────────────────────────────
  const handleTokenSave = (e) => {
    e.preventDefault()
    const t = tokenDraft.trim()
    setGitHubToken(t)
    setGhToken(t)
    setTokenDraft('')
    setShowTokenInput(false)
    setGhStatus('idle')
    setGhLoaded(false)
  }

  const handleTokenClear = () => {
    setGitHubToken('')
    setGhToken('')
    setGhStatus('idle')
    setShowTokenInput(false)
  }

  // ── Add task ──────────────────────────────────────────────────────────
  const handleAdd = (title, category, tag, dueDate) => {
    setTasks(prev => [
      ...prev,
      {
        id:        crypto.randomUUID(),
        title,
        category,
        tag:       tag ?? null,
        source:    'manual',
        dueDate:   dueDate ?? null,
        completed: false,
        createdAt: new Date().toISOString(),
      },
    ])
  }

  // ── Complete / delete / edit ──────────────────────────────────────────
  const handleToggle = (id) =>
    setTasks(prev => prev.map(t => {
      if (t.id !== id) return t
      const completing = !t.completed
      return { ...t, completed: completing, completedAt: completing ? new Date().toISOString() : null }
    }))

  const handleDelete = (id) =>
    setTasks(prev => {
      saveDeletedTaskId(id)
      return prev.filter(t => t.id !== id)
    })

  const handleUpdate = (id, changes) =>
    setTasks(prev => prev.map(t => t.id === id ? { ...t, ...changes } : t))

  // ── Work Log ──────────────────────────────────────────────────────────
  const handleWorkLogAdd = ({ adoId, title, status, tag }) =>
    setWorkLog(prev => [
      ...prev,
      {
        id:        crypto.randomUUID(),
        adoId,
        title,
        status,
        tag:       tag ?? null,
        notes:     [],
        createdAt: new Date().toISOString(),
      },
    ])

  const handleWorkLogDelete = (id) =>
    setWorkLog(prev => {
      const item = prev.find(i => i.id === id)
      if (item?.adoId) saveDeletedAdoId(item.adoId)
      return prev.filter(i => i.id !== id)
    })

  const handleWorkLogStatusChange = (id, status) =>
    setWorkLog(prev => prev.map(item => item.id === id ? { ...item, status } : item))

  const handleWorkLogTagChange = (id, tag) =>
    setWorkLog(prev => prev.map(item => item.id === id ? { ...item, tag } : item))

  const handleWorkLogAddNote = (itemId, text) =>
    setWorkLog(prev => prev.map(item =>
      item.id !== itemId ? item : {
        ...item,
        notes: [
          ...item.notes,
          {
            id:   crypto.randomUUID(),
            date: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
            text,
          },
        ],
      }
    ))

  const handleWorkLogDeleteNote = (itemId, noteId) =>
    setWorkLog(prev => prev.map(item =>
      item.id !== itemId ? item : {
        ...item,
        notes: item.notes.filter(n => n.id !== noteId),
      }
    ))

  const handleWorkLogReorder = (activeId, overId) =>
    setWorkLog(prev => {
      const from = prev.findIndex(i => i.id === activeId)
      const to   = prev.findIndex(i => i.id === overId)
      return arrayMove(prev, from, to)
    })

  // ── Drag and drop ─────────────────────────────────────────────────────
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  )

  const handleDragStart = ({ active }) => {
    setActiveTask(tasks.find(t => t.id === active.id) ?? null)
  }

  // While dragging: move card into the column it's hovering over
  const handleDragOver = ({ active, over }) => {
    if (!over || active.id === over.id) return

    setTasks(prev => {
      const dragged = prev.find(t => t.id === active.id)
      if (!dragged) return prev

      // Hovering over a column drop zone
      const overColumn = COLUMNS.find(c => c.id === over.id)
      if (overColumn) {
        if (dragged.category === overColumn.id) return prev
        return prev.map(t =>
          t.id === active.id ? { ...t, category: overColumn.id } : t
        )
      }

      // Hovering over another card in a different column
      const overCard = prev.find(t => t.id === over.id)
      if (overCard && dragged.category !== overCard.category) {
        return prev.map(t =>
          t.id === active.id ? { ...t, category: overCard.category } : t
        )
      }

      return prev
    })
  }

  // On drop: finalise ordering within the column
  const handleDragEnd = ({ active, over }) => {
    setActiveTask(null)
    if (!over || active.id === over.id) return

    setTasks(prev => {
      const dragged  = prev.find(t => t.id === active.id)
      const overCard = prev.find(t => t.id === over.id)

      // Only reorder when both cards are in the same column
      if (!dragged || !overCard || dragged.category !== overCard.category) return prev

      const col     = dragged.category
      const inCol   = prev.filter(t => t.category === col)
      const outside = prev.filter(t => t.category !== col)
      const from    = inCol.findIndex(t => t.id === active.id)
      const to      = inCol.findIndex(t => t.id === over.id)

      return [...outside, ...arrayMove(inCol, from, to)]
    })
  }

  // ── Render ────────────────────────────────────────────────────────────
  return (
    <div className="app">
      <header className="header">
        <div>
          <h1 className="header-title">Rebecca's Planner</h1>
          <span className="header-date">{formatDate()}</span>
        </div>
        <div className="header-right">
          {syncing
            ? <span className="header-sync header-sync--loading">Syncing…</span>
            : lastSync && (
                <span className="header-sync">
                  M365 synced at {formatSync(lastSync)}
                </span>
              )
          }
          <div className="gh-sync-wrap">
            {!ghToken ? (
              <button className="gh-sync-btn gh-sync-btn--connect" onClick={() => setShowTokenInput(v => !v)}>
                Connect GitHub
              </button>
            ) : ghStatus === 'saving' ? (
              <span className="gh-sync-badge gh-sync-badge--saving">Saving…</span>
            ) : ghStatus === 'saved' ? (
              <span className="gh-sync-badge gh-sync-badge--saved">Saved to GitHub</span>
            ) : ghStatus === 'bad-token' ? (
              <button className="gh-sync-btn gh-sync-btn--error" onClick={() => setShowTokenInput(v => !v)}>
                Token invalid — fix
              </button>
            ) : ghStatus === 'error' ? (
              <span className="gh-sync-badge gh-sync-badge--error">Sync failed</span>
            ) : (
              <button className="gh-sync-btn gh-sync-btn--connected" onClick={() => setShowTokenInput(v => !v)}>
                GitHub connected
              </button>
            )}
            {showTokenInput && (
              <form className="gh-token-form" onSubmit={handleTokenSave}>
                <p className="gh-token-hint">
                  Go to <strong>GitHub → Settings → Developer settings → Personal access tokens → Fine-grained tokens</strong>. Create a token with <strong>Contents: Read and Write</strong> on the <code>chief-of-staff</code> repo only.
                </p>
                <input
                  className="gh-token-input"
                  type="password"
                  placeholder="Paste token here"
                  value={tokenDraft}
                  onChange={e => setTokenDraft(e.target.value)}
                  autoFocus
                />
                <div className="gh-token-actions">
                  <button className="gh-token-save" type="submit" disabled={!tokenDraft.trim()}>Save</button>
                  {ghToken && <button className="gh-token-clear" type="button" onClick={handleTokenClear}>Disconnect</button>}
                  <button className="gh-token-cancel" type="button" onClick={() => setShowTokenInput(false)}>Cancel</button>
                </div>
              </form>
            )}
          </div>
        </div>
      </header>

      <TaskInput onAdd={handleAdd} />

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
      >
        <div className="board">
          {COLUMNS.map(col => (
            <Column
              key={col.id}
              column={col}
              tasks={tasks.filter(t => t.category === col.id && !t.completed)}
              onToggle={handleToggle}
              onDelete={handleDelete}
              onUpdate={handleUpdate}
            />
          ))}
        </div>

        <DragOverlay dropAnimation={{ duration: 150, easing: 'ease' }}>
          {activeTask
            ? <TaskCard task={activeTask} overlay />
            : null}
        </DragOverlay>
      </DndContext>

      <WorkLog
        items={workLog}
        onAdd={handleWorkLogAdd}
        onDelete={handleWorkLogDelete}
        onStatusChange={handleWorkLogStatusChange}
        onTagChange={handleWorkLogTagChange}
        onAddNote={handleWorkLogAddNote}
        onDeleteNote={handleWorkLogDeleteNote}
        onReorder={handleWorkLogReorder}
      />

      <Archive
        tasks={tasks.filter(t => t.completed)}
        onToggle={handleToggle}
        onDelete={handleDelete}
      />
    </div>
  )
}
