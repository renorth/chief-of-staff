import { useState } from 'react'
import { TAGS } from '../App.jsx'

export const STATUSES = [
  'Active',
  'In Progress',
  'In Review',
  'At Risk',
  'Blocked',
  'Resolved',
  'Closed',
]

function todayLabel() {
  return new Date().toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  })
}

export default function WorkLog({
  items,
  onAdd,
  onDelete,
  onStatusChange,
  onTagChange,
  onAddNote,
  onDeleteNote,
}) {
  const [open, setOpen]           = useState(true)
  const [openItems, setOpenItems] = useState({})
  const [noteText, setNoteText]   = useState({})   // itemId → draft text
  const [form, setForm]           = useState({ adoId: '', title: '', status: 'Active', tag: null })

  const toggleItem = (id) =>
    setOpenItems(prev => ({ ...prev, [id]: !prev[id] }))

  const handleAdd = () => {
    if (!form.title.trim()) return
    onAdd({ adoId: form.adoId.trim(), title: form.title.trim(), status: form.status, tag: form.tag })
    setForm({ adoId: '', title: '', status: 'Active', tag: null })
  }

  const handleLogNote = (itemId) => {
    const text = noteText[itemId]?.trim()
    if (!text) return
    onAddNote(itemId, text)
    setNoteText(prev => ({ ...prev, [itemId]: '' }))
  }

  return (
    <div className="worklog">
      <button className="archive-toggle" onClick={() => setOpen(o => !o)}>
        <span className="archive-toggle-label">
          {open ? '▾' : '▸'} ADO Work Log
        </span>
        <span className="archive-count">
          {items.length} item{items.length !== 1 ? 's' : ''}
        </span>
      </button>

      {open && (
        <div className="worklog-body">

          {/* ── Add ADO form ── */}
          <div className="worklog-add">
            <div className="worklog-add-row">
              <input
                className="worklog-input"
                placeholder="ADO # or URL (optional)"
                value={form.adoId}
                onChange={e => setForm(f => ({ ...f, adoId: e.target.value }))}
              />
              <input
                className="worklog-input worklog-input--title"
                placeholder="Title"
                value={form.title}
                onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                onKeyDown={e => e.key === 'Enter' && handleAdd()}
              />
              <select
                className="worklog-status-select"
                value={form.status}
                onChange={e => setForm(f => ({ ...f, status: e.target.value }))}
              >
                {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
              <button
                className="btn-add"
                onClick={handleAdd}
                disabled={!form.title.trim()}
              >
                Add
              </button>
            </div>
            <div className="worklog-add-row worklog-add-row--tags">
              <span className="input-label">Area</span>
              <div className="cat-group">
                {TAGS.map(tag => (
                  <button
                    key={tag.id}
                    className={`tag-btn${form.tag === tag.id ? ' tag-btn--on' : ''}`}
                    style={{ '--tag-color': tag.color }}
                    onClick={() => setForm(f => ({ ...f, tag: f.tag === tag.id ? null : tag.id }))}
                  >
                    {tag.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {items.length === 0 && (
            <p className="worklog-empty">No ADO items yet.</p>
          )}

          {/* ── ADO entries ── */}
          {items.map(item => {
            const tagDef = TAGS.find(t => t.id === item.tag)
            return (
              <div key={item.id} className="worklog-item">

                {/* Header row */}
                <div
                  className="worklog-item-header"
                  onClick={() => toggleItem(item.id)}
                >
                  <span className="worklog-chevron">
                    {openItems[item.id] ? '▾' : '▸'}
                  </span>

                  {item.adoId && (
                    item.adoId.startsWith('http')
                      ? <a
                          className="worklog-ado-id"
                          href={item.adoId}
                          target="_blank"
                          rel="noreferrer"
                          onClick={e => e.stopPropagation()}
                        >
                          ADO ↗
                        </a>
                      : <span className="worklog-ado-id">#{item.adoId}</span>
                  )}

                  <span className="worklog-item-title">{item.title}</span>

                  {tagDef && (
                    <span
                      className="tag tag--area"
                      style={{ '--tag-color': tagDef.color }}
                    >
                      {tagDef.label}
                    </span>
                  )}

                  <select
                    className={`worklog-status worklog-status--${item.status.toLowerCase().replace(/\s+/g, '-')}`}
                    value={item.status}
                    onClick={e => e.stopPropagation()}
                    onChange={e => onStatusChange(item.id, e.target.value)}
                  >
                    {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>

                  <span className="worklog-note-count">
                    {item.notes.length} note{item.notes.length !== 1 ? 's' : ''}
                  </span>

                  <button
                    className="btn-icon btn-icon--delete"
                    onClick={e => { e.stopPropagation(); onDelete(item.id) }}
                    title="Delete ADO item"
                  >
                    ✕
                  </button>
                </div>

                {/* Notes panel */}
                {openItems[item.id] && (
                  <div className="worklog-notes">

                    {/* Tag selector */}
                    <div className="worklog-tag-row">
                      <span className="worklog-tag-label">Area</span>
                      <div className="cat-group">
                        {TAGS.map(tag => (
                          <button
                            key={tag.id}
                            className={`tag-btn${item.tag === tag.id ? ' tag-btn--on' : ''}`}
                            style={{ '--tag-color': tag.color }}
                            onClick={() => onTagChange(item.id, item.tag === tag.id ? null : tag.id)}
                          >
                            {tag.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Existing notes — newest first */}
                    {item.notes.length === 0 && (
                      <p className="worklog-notes-empty">No notes yet.</p>
                    )}
                    {item.notes
                      .slice()
                      .reverse()
                      .map(note => (
                        <div key={note.id} className="worklog-note">
                          <span className="worklog-note-date">{note.date}</span>
                          <span className="worklog-note-text">{note.text}</span>
                          <button
                            className="btn-icon btn-icon--delete"
                            onClick={() => onDeleteNote(item.id, note.id)}
                            title="Delete note"
                          >
                            ✕
                          </button>
                        </div>
                      ))
                    }

                    {/* Add note row */}
                    <div className="worklog-note-add">
                      <span className="worklog-note-date worklog-note-date--today">
                        {todayLabel()}
                      </span>
                      <textarea
                        className="worklog-textarea"
                        placeholder="Add a note…"
                        rows={2}
                        value={noteText[item.id] ?? ''}
                        onChange={e =>
                          setNoteText(prev => ({ ...prev, [item.id]: e.target.value }))
                        }
                      />
                      <button
                        className="btn-add btn-add--sm"
                        onClick={() => handleLogNote(item.id)}
                        disabled={!(noteText[item.id]?.trim())}
                      >
                        Log
                      </button>
                    </div>

                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
