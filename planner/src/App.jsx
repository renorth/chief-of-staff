import { useState, useEffect } from 'react'
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
import { loadTasks, saveTasks, mergeWorkiqTasks, loadWorkLog, saveWorkLog } from './utils/storage.js'
import Archive from './components/Archive.jsx'
import WorkLog from './components/WorkLog.jsx'
import { COLUMNS, TAGS } from './constants.js'

const TASKS_URL =
  'https://raw.githubusercontent.com/renorth/chief-of-staff/main/planner/data/tasks.json'


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
        const merged = mergeWorkiqTasks(stored.tasks, remote.tasks)
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
    setTasks(prev => prev.filter(t => t.id !== id))

  const handleEdit = (id, newTitle) =>
    setTasks(prev => prev.map(t => t.id === id ? { ...t, title: newTitle } : t))

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
    setWorkLog(prev => prev.filter(item => item.id !== id))

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
        {syncing
          ? <span className="header-sync header-sync--loading">Syncing…</span>
          : lastSync && (
              <span className="header-sync">
                M365 synced at {formatSync(lastSync)}
              </span>
            )
        }
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
              onEdit={handleEdit}
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
