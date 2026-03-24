import { useState } from 'react'
import { COLUMNS } from '../App.jsx'

export default function TaskInput({ onAdd }) {
  const [title,    setTitle]    = useState('')
  const [category, setCategory] = useState('must_do_today')

  const handleSubmit = (e) => {
    e.preventDefault()
    const trimmed = title.trim()
    if (!trimmed) return
    onAdd(trimmed, category)
    setTitle('')
    // Keep the selected category so rapid-fire entry stays in the same bucket
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') handleSubmit(e)
  }

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
      <div className="input-row">
        <div className="cat-group">
          {COLUMNS.map(col => (
            <button
              key={col.id}
              type="button"
              className={`cat-btn ${category === col.id ? 'cat-btn--on' : ''}`}
              style={{
                '--col-color': col.color,
              }}
              onClick={() => setCategory(col.id)}
            >
              {col.label}
            </button>
          ))}
        </div>
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
