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
import { loadTasks, saveTasks } from './utils/storage.js'

export const COLUMNS = [
  { id: 'must_do_today',   label: 'Must Do Today',   color: '#a371f7' },
  { id: 'should_do_today', label: 'Should Do Today',  color: '#58a6ff' },
  { id: 'this_week',       label: 'This Week',        color: '#3fb950' },
]

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
  const [tasks, setTasks]         = useState([])
  const [lastSync, setLastSync]   = useState(null)
  const [activeTask, setActiveTask] = useState(null)

  // Load from localStorage on mount
  useEffect(() => {
    const stored = loadTasks()
    setTasks(stored.tasks)
    setLastSync(stored.lastSync)
  }, [])

  // Persist to localStorage whenever tasks change
  useEffect(() => {
    if (tasks.length > 0 || lastSync) {
      saveTasks(tasks, lastSync)
    }
  }, [tasks, lastSync])

  // ── Add task ──────────────────────────────────────────────────────────
  const handleAdd = (title, category) => {
    setTasks(prev => [
      ...prev,
      {
        id:        crypto.randomUUID(),
        title,
        category,
        source:    'manual',
        dueDate:   null,
        completed: false,
        createdAt: new Date().toISOString(),
      },
    ])
  }

  // ── Complete / delete ─────────────────────────────────────────────────
  const handleToggle = (id) =>
    setTasks(prev => prev.map(t => t.id === id ? { ...t, completed: !t.completed } : t))

  const handleDelete = (id) =>
    setTasks(prev => prev.filter(t => t.id !== id))

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
          <h1 className="header-title">Chief of Staff</h1>
          <span className="header-date">{formatDate()}</span>
        </div>
        {lastSync && (
          <span className="header-sync">
            M365 synced at {formatSync(lastSync)}
          </span>
        )}
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
              tasks={tasks.filter(t => t.category === col.id)}
              onToggle={handleToggle}
              onDelete={handleDelete}
            />
          ))}
        </div>

        <DragOverlay dropAnimation={{ duration: 150, easing: 'ease' }}>
          {activeTask
            ? <TaskCard task={activeTask} overlay />
            : null}
        </DragOverlay>
      </DndContext>
    </div>
  )
}
