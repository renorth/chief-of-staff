import { useState, useRef, useEffect } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { TAGS } from '../App.jsx'

export default function TaskCard({ task, onToggle, onDelete, onEdit, overlay = false }) {
  const [editing, setEditing] = useState(false)
  const [editVal, setEditVal] = useState(task.title)
  const inputRef = useRef(null)

  const {
    attributes, listeners, setNodeRef,
    transform, transition, isDragging,
  } = useSortable({ id: task.id })

  const style = {
    transform:  CSS.Transform.toString(transform),
    transition: transition ?? undefined,
  }

  // Focus input when edit mode opens
  useEffect(() => {
    if (editing) inputRef.current?.select()
  }, [editing])

  const startEdit = () => {
    setEditVal(task.title)
    setEditing(true)
  }

  const saveEdit = () => {
    const trimmed = editVal.trim()
    if (trimmed && trimmed !== task.title) onEdit(task.id, trimmed)
    setEditing(false)
  }

  const handleEditKey = (e) => {
    if (e.key === 'Enter')  saveEdit()
    if (e.key === 'Escape') { setEditing(false); setEditVal(task.title) }
  }

  const formatDue = (iso) => {
    if (!iso) return null
    const d     = new Date(iso)
    const today = new Date()
    const diff  = Math.round((d - today) / 86_400_000)
    if (diff === 0)  return { label: 'Today',     urgent: true  }
    if (diff === 1)  return { label: 'Tomorrow',  urgent: false }
    if (diff === -1) return { label: 'Yesterday', urgent: true  }
    if (diff < -1)   return { label: `${Math.abs(diff)}d overdue`, urgent: true }
    return { label: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), urgent: false }
  }

  const due     = formatDue(task.dueDate)
  const tagMeta = task.tag ? TAGS.find(t => t.id === task.tag) : null

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={[
        'task-card',
        task.completed ? 'task-card--done'    : '',
        isDragging     ? 'task-card--dragging' : '',
        overlay        ? 'task-card--overlay'  : '',
      ].filter(Boolean).join(' ')}
    >
      {/* Circle checkbox */}
      {!overlay && (
        <button
          className={`task-check ${task.completed ? 'task-check--done' : ''}`}
          onClick={() => onToggle(task.id)}
          title={task.completed ? 'Mark incomplete' : 'Mark complete'}
        />
      )}

      {/* Drag handle */}
      <span
        className="drag-handle"
        {...attributes}
        {...listeners}
        title="Drag to move"
      >
        ⠿
      </span>

      {/* Content */}
      <div className="task-body">
        {editing ? (
          <input
            ref={inputRef}
            className="task-edit-input"
            value={editVal}
            onChange={e => setEditVal(e.target.value)}
            onKeyDown={handleEditKey}
            onBlur={saveEdit}
          />
        ) : (
          <span
            className={`task-title ${task.completed ? 'task-title--done' : ''}`}
            onDoubleClick={!overlay ? startEdit : undefined}
          >
            {task.title}
          </span>
        )}
        <div className="task-meta">
          {due && (
            <span className={`tag tag--due ${due.urgent ? 'tag--urgent' : ''}`}>
              {due.label}
            </span>
          )}
          {tagMeta && (
            <span className="tag tag--area" style={{ '--tag-color': tagMeta.color }}>
              {tagMeta.label}
            </span>
          )}
          {task.source === 'workiq' && (
            <span className="tag tag--source">M365</span>
          )}
        </div>
      </div>

      {/* Hover actions */}
      {!overlay && !editing && (
        <div className="task-actions">
          <button
            className="btn-icon btn-icon--edit"
            onClick={startEdit}
            title="Edit"
          >
            ✎
          </button>
          <button
            className="btn-icon btn-icon--delete"
            onClick={() => onDelete(task.id)}
            title="Delete"
          >
            ✕
          </button>
        </div>
      )}
    </div>
  )
}
