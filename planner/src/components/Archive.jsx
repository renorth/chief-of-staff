import { useState } from 'react'
import { TAGS } from '../constants.js'

function formatCompleted(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  })
}

export default function Archive({ tasks, onToggle, onDelete }) {
  const [open, setOpen]           = useState(false)
  const [openGroups, setOpenGroups] = useState({})

  if (tasks.length === 0) return null

  const toggleGroup = (id) =>
    setOpenGroups(prev => ({ ...prev, [id]: !prev[id] }))

  // Build groups: one per tag + one for untagged
  const tagDefs = [...TAGS, { id: '__none__', label: 'Untagged', color: '#6e7681' }]
  const groups  = tagDefs
    .map(tag => ({
      ...tag,
      tasks: tasks.filter(t => (t.tag ?? '__none__') === tag.id),
    }))
    .filter(g => g.tasks.length > 0)

  return (
    <div className="archive">
      <button
        className="archive-toggle"
        onClick={() => setOpen(o => !o)}
      >
        <span className="archive-toggle-label">
          {open ? '▾' : '▸'} Archive
        </span>
        <span className="archive-count">{tasks.length} completed</span>
      </button>

      {open && (
        <div className="archive-body">
          {groups.map(group => (
            <div key={group.id} className="archive-group">
              <button
                className="archive-group-header"
                style={{ '--tag-color': group.color }}
                onClick={() => toggleGroup(group.id)}
              >
                <span>
                  {openGroups[group.id] ? '▾' : '▸'}
                  <span className="archive-group-name">{group.label}</span>
                </span>
                <span className="archive-group-count">{group.tasks.length}</span>
              </button>

              {openGroups[group.id] && (
                <ul className="archive-list">
                  {group.tasks
                    .slice()
                    .sort((a, b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? ''))
                    .map(task => (
                      <li key={task.id} className="archive-item">
                        {/* Restore circle */}
                        <button
                          className="task-check task-check--done task-check--sm"
                          onClick={() => onToggle(task.id)}
                          title="Restore task"
                        />
                        <span className="archive-item-title">{task.title}</span>
                        <span className="archive-item-date">
                          {formatCompleted(task.completedAt)}
                        </span>
                        <button
                          className="btn-icon btn-icon--delete"
                          onClick={() => onDelete(task.id)}
                          title="Delete permanently"
                        >
                          ✕
                        </button>
                      </li>
                    ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
