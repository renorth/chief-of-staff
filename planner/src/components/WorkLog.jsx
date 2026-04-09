import { useState } from 'react'
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  DragOverlay,
} from '@dnd-kit/core'
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { TAGS } from '../constants.js'

const ADO_TAGS = TAGS.filter(t => t.id !== 'personal')

export const STATUSES = [
  'Live Experiment', 'Active', 'In Backlog', 'Pre-Pitch', 'At Risk', 'Blocked', 'Resolved', 'Closed',
]

function todayLabel() {
  return new Date().toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  })
}

// Card content — used both inline and in DragOverlay
const MAX_NOTES = 5

function AdoCard({
  item, isOpen, onToggle,
  onDelete, onStatusChange, onTagChange, onAddNote, onDeleteNote,
  dragHandleProps = {}, overlay = false,
}) {
  const [noteText, setNoteText]   = useState('')
  const [showAll, setShowAll]     = useState(false)
  const tagDef = ADO_TAGS.find(t => t.id === item.tag)

  const handleLogNote = () => {
    if (!noteText.trim()) return
    onAddNote(item.id, noteText.trim())
    setNoteText('')
  }

  return (
    <div className={`worklog-item${overlay ? ' worklog-item--overlay' : ''}`}>
      <div className="worklog-item-header" onClick={onToggle}>
        <span
          className="drag-handle worklog-drag"
          {...dragHandleProps}
          onClick={e => e.stopPropagation()}
        >
          ⠿
        </span>
        <span className="worklog-chevron">{isOpen ? '▾' : '▸'}</span>

        {item.adoId && (
          item.adoId.startsWith('http')
            ? <a className="worklog-ado-id" href={item.adoId} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()}>ADO ↗</a>
            : <span className="worklog-ado-id">#{item.adoId}</span>
        )}

        <span className="worklog-item-title">{item.title}</span>

        {tagDef && (
          <span className="tag tag--area" style={{ '--tag-color': tagDef.color }}>
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
        >✕</button>
      </div>

      {isOpen && !overlay && (
        <div className="worklog-notes">
          <div className="worklog-tag-row">
            <span className="worklog-tag-label">Area</span>
            <div className="cat-group">
              {ADO_TAGS.map(tag => (
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

          <div className="worklog-note-add">
            <span className="worklog-note-date worklog-note-date--today">{todayLabel()}</span>
            <textarea
              className="worklog-textarea"
              placeholder="Add a note…"
              rows={2}
              value={noteText}
              onChange={e => setNoteText(e.target.value)}
              onKeyDown={e => { if (e.ctrlKey && e.key === 'Enter') { e.preventDefault(); handleLogNote() } }}
            />
            <button
              className="btn-add btn-add--sm"
              onClick={handleLogNote}
              disabled={!noteText.trim()}
            >
              Log
            </button>
          </div>

          {item.notes.length === 0 && (
            <p className="worklog-notes-empty">No notes yet.</p>
          )}
          {(() => {
            const sorted = item.notes.slice().reverse()
            const visible = showAll ? sorted : sorted.slice(0, MAX_NOTES)
            return (
              <>
                {visible.map(note => (
                  <div key={note.id} className="worklog-note">
                    <span className="worklog-note-date">{note.date}</span>
                    <span className="worklog-note-text">{note.text}</span>
                    <button
                      className="btn-icon btn-icon--delete"
                      onClick={() => onDeleteNote(item.id, note.id)}
                      title="Delete note"
                    >✕</button>
                  </div>
                ))}
                {sorted.length > MAX_NOTES && (
                  <button
                    className="worklog-see-all"
                    onClick={() => setShowAll(s => !s)}
                  >
                    {showAll ? 'Show less' : `See all ${sorted.length} notes`}
                  </button>
                )}
              </>
            )
          })()}
        </div>
      )}
    </div>
  )
}

// Sortable wrapper
function SortableAdoItem({ item, isOpen, onToggle, ...handlers }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: item.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.25 : 1,
  }

  return (
    <div ref={setNodeRef} style={style}>
      <AdoCard
        item={item}
        isOpen={isOpen}
        onToggle={onToggle}
        dragHandleProps={{ ...attributes, ...listeners }}
        {...handlers}
      />
    </div>
  )
}

export default function WorkLog({
  items, onAdd, onDelete, onStatusChange, onTagChange, onAddNote, onDeleteNote, onReorder,
}) {
  const [open, setOpen]           = useState(true)
  const [openItems, setOpenItems] = useState({})
  const [filterTag, setFilterTag] = useState(null)   // null = All
  const [activeId, setActiveId]   = useState(null)
  const [form, setForm]           = useState({ adoId: '', title: '', status: 'Active', tag: null })

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  )

  const toggleItem = id => setOpenItems(prev => ({ ...prev, [id]: !prev[id] }))

  const handleAdd = () => {
    if (!form.title.trim()) return
    onAdd({ adoId: form.adoId.trim(), title: form.title.trim(), status: form.status, tag: form.tag })
    setForm({ adoId: '', title: '', status: 'Active', tag: null })
  }

  // Filter then group by STATUSES order
  const filtered = filterTag ? items.filter(i => i.tag === filterTag) : items
  const groups = STATUSES
    .map(status => ({ status, items: filtered.filter(i => i.status === status) }))
    .filter(g => g.items.length > 0)

  // Only show filter buttons for tags actually present
  const presentTags = ADO_TAGS.filter(t => items.some(i => i.tag === t.id))

  const activeItem = activeId ? items.find(i => i.id === activeId) : null

  const handleDragStart = ({ active }) => setActiveId(active.id)

  const handleDragEnd = ({ active, over }) => {
    setActiveId(null)
    if (!over || active.id === over.id) return
    const a = items.find(i => i.id === active.id)
    const o = items.find(i => i.id === over.id)
    // Only reorder within same status group
    if (!a || !o || a.status !== o.status) return
    onReorder(active.id, over.id)
  }

  const cardHandlers = { onDelete, onStatusChange, onTagChange, onAddNote, onDeleteNote }

  return (
    <div className="worklog">
      <button className="archive-toggle" onClick={() => setOpen(o => !o)}>
        <span className="archive-toggle-label">{open ? '▾' : '▸'} ADO Work Log</span>
        <span className="archive-count">{items.length} item{items.length !== 1 ? 's' : ''}</span>
      </button>

      {open && (
        <div className="worklog-body">

          {/* ── Add form ── */}
          <div className="worklog-add">
            <div className="worklog-add-row">
              <input
                className="worklog-input"
                placeholder="ADO #"
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
              <button className="btn-add" onClick={handleAdd} disabled={!form.title.trim()}>
                Add
              </button>
            </div>
            <div className="worklog-add-row worklog-add-row--tags">
              <span className="input-label">Area</span>
              <div className="cat-group">
                {ADO_TAGS.map(tag => (
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

          {/* ── Filter bar ── */}
          {presentTags.length > 0 && (
            <div className="worklog-filter-bar">
              <span className="worklog-tag-label">Filter</span>
              <button
                className={`tag-btn${filterTag === null ? ' tag-btn--on' : ''}`}
                style={{ '--tag-color': '#8b949e' }}
                onClick={() => setFilterTag(null)}
              >
                All
              </button>
              {presentTags.map(tag => (
                <button
                  key={tag.id}
                  className={`tag-btn${filterTag === tag.id ? ' tag-btn--on' : ''}`}
                  style={{ '--tag-color': tag.color }}
                  onClick={() => setFilterTag(f => f === tag.id ? null : tag.id)}
                >
                  {tag.label}
                </button>
              ))}
            </div>
          )}

          {items.length === 0 && (
            <p className="worklog-empty">No ADO items yet.</p>
          )}
          {filtered.length === 0 && items.length > 0 && (
            <p className="worklog-empty">No items match this filter.</p>
          )}

          {/* ── Status groups with drag ── */}
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
          >
            {groups.map(group => (
              <div key={group.status} className="worklog-group">
                <div className={`worklog-group-header worklog-group-header--${group.status.toLowerCase().replace(/\s+/g, '-')}`}>
                  <span className="worklog-group-label">{group.status}</span>
                  <span className="worklog-group-count">{group.items.length}</span>
                </div>
                <SortableContext
                  items={group.items.map(i => i.id)}
                  strategy={verticalListSortingStrategy}
                >
                  {group.items.map(item => (
                    <SortableAdoItem
                      key={item.id}
                      item={item}
                      isOpen={!!openItems[item.id]}
                      onToggle={() => toggleItem(item.id)}
                      {...cardHandlers}
                    />
                  ))}
                </SortableContext>
              </div>
            ))}

            <DragOverlay dropAnimation={{ duration: 150, easing: 'ease' }}>
              {activeItem && (
                <AdoCard
                  item={activeItem}
                  isOpen={false}
                  onToggle={() => {}}
                  overlay
                  {...cardHandlers}
                />
              )}
            </DragOverlay>
          </DndContext>

        </div>
      )}
    </div>
  )
}
