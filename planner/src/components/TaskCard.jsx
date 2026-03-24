import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

export default function TaskCard({ task, onToggle, onDelete, overlay = false }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: task.id })

  const style = {
    transform:  CSS.Transform.toString(transform),
    transition: transition ?? undefined,
  }

  const formatDue = (iso) => {
    if (!iso) return null
    const d = new Date(iso)
    const today = new Date()
    const diff  = Math.round((d - today) / 86_400_000)
    if (diff === 0)  return { label: 'Today',     urgent: true  }
    if (diff === 1)  return { label: 'Tomorrow',  urgent: false }
    if (diff === -1) return { label: 'Yesterday', urgent: true  }
    if (diff < -1)   return { label: `${Math.abs(diff)}d overdue`, urgent: true }
    return { label: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), urgent: false }
  }

  const due = formatDue(task.dueDate)

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
        <span className={`task-title ${task.completed ? 'task-title--done' : ''}`}>
          {task.title}
        </span>
        <div className="task-meta">
          {due && (
            <span className={`tag tag--due ${due.urgent ? 'tag--urgent' : ''}`}>
              {due.label}
            </span>
          )}
          {task.source === 'workiq' && (
            <span className="tag tag--source">M365</span>
          )}
        </div>
      </div>

      {/* Actions — visible on hover */}
      {!overlay && (
        <div className="task-actions">
          <button
            className={`btn-icon ${task.completed ? 'btn-icon--undo' : 'btn-icon--check'}`}
            onClick={() => onToggle(task.id)}
            title={task.completed ? 'Mark incomplete' : 'Mark complete'}
          >
            {task.completed ? '↺' : '✓'}
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
