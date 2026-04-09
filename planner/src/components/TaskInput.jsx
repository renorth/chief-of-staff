import { useState } from 'react'
import { COLUMNS, TAGS } from '../constants.js'

export default function TaskInput({ onAdd }) {
  const [title,    setTitle]    = useState('')
  const [category, setCategory] = useState('must_do_today')
  const [tag,      setTag]      = useState(null)
  const [dueDate,  setDueDate]  = useState('')

  const handleSubmit = () => {
    const trimmed = title.trim()
    if (!trimmed) return
    onAdd(trimmed, category, tag, dueDate || null)
    setTitle('')
    setDueDate('')
    // Keep category + tag for rapid entry
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || !e.shiftKey)) handleSubmit()
  }

  const toggleTag = (id) => setTag(prev => prev === id ? null : id)

  return (
    <div className="input-card">
      <input
        className="input-text"
        type="text"
        value={title}
        onChange={e => setTitle(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Add a task…"
        autoFocus
      />

      {/* Row 1 — category */}
      <div className="input-row">
        <span className="input-label">Category</span>
        <div className="cat-group">
          {COLUMNS.map(col => (
            <button
              key={col.id}
              type="button"
              className={`cat-btn ${category === col.id ? 'cat-btn--on' : ''}`}
              style={{ '--col-color': col.color }}
              onClick={() => setCategory(col.id)}
            >
              {col.label}
            </button>
          ))}
        </div>
      </div>

      {/* Row 2 — tags */}
      <div className="input-row input-row--tags">
        <span className="input-label">Tag</span>
        <div className="cat-group">
          {TAGS.map(t => (
            <button
              key={t.id}
              type="button"
              className={`tag-btn ${tag === t.id ? 'tag-btn--on' : ''}`}
              style={{ '--tag-color': t.color }}
              onClick={() => toggleTag(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Row 3 — due date + add */}
      <div className="input-row input-row--due">
        <span className="input-label">Due</span>
        <input
          className="input-date"
          type="date"
          value={dueDate}
          onChange={e => setDueDate(e.target.value)}
        />
        {dueDate && (
          <button
            className="btn-clear-date"
            type="button"
            onClick={() => setDueDate('')}
            title="Clear date"
          >
            ✕
          </button>
        )}
        <button
          className="btn-add"
          type="button"
          disabled={!title.trim()}
          onClick={handleSubmit}
        >
          Add ↵
        </button>
      </div>
    </div>
  )
}
