import { useDroppable } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import TaskCard from './TaskCard.jsx'

export default function Column({ column, tasks, onToggle, onDelete }) {
  const { setNodeRef, isOver } = useDroppable({ id: column.id })

  const pending   = tasks.filter(t => !t.completed).length
  const completed = tasks.filter(t =>  t.completed).length

  return (
    <div
      className={`column ${isOver ? 'column--over' : ''}`}
      style={{ '--col-color': column.color }}
    >
      <div className="column-header">
        <h2 className="column-title">{column.label}</h2>
        <div className="column-counts">
          {pending > 0 && (
            <span className="badge badge--pending">{pending}</span>
          )}
          {completed > 0 && (
            <span className="badge badge--done">{completed} done</span>
          )}
        </div>
      </div>

      <div className="column-body" ref={setNodeRef}>
        <SortableContext
          items={tasks.map(t => t.id)}
          strategy={verticalListSortingStrategy}
        >
          {tasks.map(task => (
            <TaskCard
              key={task.id}
              task={task}
              onToggle={onToggle}
              onDelete={onDelete}
            />
          ))}
        </SortableContext>

        {tasks.length === 0 && (
          <p className="column-empty">Drop tasks here</p>
        )}
      </div>
    </div>
  )
}
