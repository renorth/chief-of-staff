import { useState, useRef, useEffect } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { TAGS, COLUMNS } from '../constants.js'

export default function TaskCard({ task, onToggle, onDelete, onUpdate, overlay = false }) {
  const [editing,      setEditing]      = useState(false)
  const [editVal,      setEditVal]      = useState(task.title)
  const [editCategory, setEditCategory] = useState(task.category)
  const [editDueDate,  setEditDueDate]  = useState(task.dueDate ?? '')
  const inputRef = useRef(null)

  const {
    attributes, listeners, setNodeRef,
    transform, transition, isDragging,
  } = useSortable({ id: task.id })

  const style = {
    transform:  CSS.Transform.toString(transform),
    transition: transition ?? undefined,
  }

  useEffect(() => {
    if (editing) inputRef.current?.select()
  }, [editing])

  const startEdit = () => {
    setEditVal(task.title)
    setEditCategory(task.category)
    setEditDueDate(task.dueDate ?? '')
    setEditing(true)
  }

  const saveEdit = () => {
    const trimmed = editVal.trim()
    if (!trimmed) { cancelEdit(); return }
    onUpdate(task.id, {
      title:    trimmed,
      category: editCategory,
      dueDate:  editDueDate || null,
    })
    setEditing(false)
  }

  const cancelEdit = () => {
    setEditing(false)
    setEditVal(task.title)
    setEditCategory(task.category)
    setEditDueDate(task.dueDate ?? '')
  }

  const handleEditKey = (e) => {
    if (e.key === 'Enter')  saveEdit()
    if (e.key === 'Escape') cancelEdit()
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
        editing        ? 'task-card--editing'  : '',
        task.completed ? 'task-card--done'     : '',
        isDragging     ? 'task-card--dragging' : '',
        overlay        ? 'task-card--overlay'  : '',
      ].filter(Boolean).join(' ')}
    >
      {/* Circle checkbox — hidden while editing to keep layout clean */}
      {!overlay && !editing && (
        <button
          className={`task-check ${task.completed ? 'task-check--done' : ''}`}
          onPointerDown={e => e.stopPropagation()}
          onClick={() => onToggle(task.id)}
          title={task.completed ? 'Mark incomplete' : 'Mark complete'}
        />
      )}

      {editing ? (
        /* ── Edit form ─────────────────────────────────────────────── */
        <div className="task-edit-form">
          <input
            ref={inputRef}
            className="task-edit-input"
            value={editVal}
            onChange={e => setEditVal(e.target.value)}
            onKeyDown={handleEditKey}
            placeholder="Task title"
          />

          <div className="task-edit-row">
            <span className="task-edit-label">Move to</span>
            <div className="cat-group">
              {COLUMNS.map(col => (
                <button
                  key={col.id}
                  type="button"
                  className={`cat-btn cat-btn--compact ${editCategory === col.id ? 'cat-btn--on' : ''}`}
                  style={{ '--col-color': col.color }}
                  onClick={() => setEditCategory(col.id)}
                >
                  {col.label}
                </button>
              ))}
            </div>
          </div>

          <div className="task-edit-row">
            <span className="task-edit-label">Due</span>
            <input
              className="input-date"
              type="date"
              value={editDueDate}
              onChange={e => setEditDueDate(e.target.value)}
              onKeyDown={handleEditKey}
            />
            {editDueDate && (
              <button
                className="btn-clear-date"
                type="button"
                onClick={() => setEditDueDate('')}
                title="Clear date"
              >
                ✕
              </button>
            )}
          </div>

          <div className="task-edit-actions">
            <button className="btn-cancel" type="button" onClick={cancelEdit}>Cancel</button>
            <button className="btn-save"   type="button" onClick={saveEdit}>Save</button>
          </div>
        </div>
      ) : (
        /* ── View mode ─────────────────────────────────────────────── */
        <>
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
            <span
              className={`task-title ${task.completed ? 'task-title--done' : ''}`}
              onDoubleClick={!overlay ? startEdit : undefined}
            >
              {task.title}
            </span>
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
          {!overlay && (
            <div className="task-actions">
              <button
                className="btn-icon btn-icon--edit"
                onPointerDown={e => e.stopPropagation()}
                onClick={startEdit}
                title="Edit"
              >
                ✎
              </button>
              <button
                className="btn-icon btn-icon--delete"
                onPointerDown={e => e.stopPropagation()}
                onClick={() => onDelete(task.id)}
                title="Delete"
              >
                ✕
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
