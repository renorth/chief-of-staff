import { useState } from 'react'

function todayLabel() {
  return new Date().toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  })
}

function PersonCard({ person, onAddTopic, onDeleteTopic, onTogglePin, onAddNote, onDeleteNote }) {
  const [topicDraft, setTopicDraft] = useState('')
  const [noteDraft, setNoteDraft]   = useState('')
  const [showNotes, setShowNotes]   = useState(false)

  const handleAddTopic = () => {
    const text = topicDraft.trim()
    if (!text) return
    onAddTopic(person.id, text)
    setTopicDraft('')
  }

  const handleAddNote = () => {
    const text = noteDraft.trim()
    if (!text) return
    onAddNote(person.id, text)
    setNoteDraft('')
  }

  const pinned   = person.topics.filter(t => t.pinned)
  const regular  = person.topics.filter(t => !t.pinned)
  const allTopics = [...pinned, ...regular]

  return (
    <div className="oon-card">
      <div className="oon-card-header">
        <span className="oon-name">{person.name}</span>
        <span className="oon-topic-count">{person.topics.length} topic{person.topics.length !== 1 ? 's' : ''}</span>
      </div>

      <div className="oon-add-topic">
        <input
          className="oon-input"
          placeholder="Add topic…"
          value={topicDraft}
          onChange={e => setTopicDraft(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleAddTopic()}
        />
        <button className="btn-add btn-add--sm" onClick={handleAddTopic} disabled={!topicDraft.trim()}>
          Add
        </button>
      </div>

      {allTopics.length > 0 && (
        <ul className="oon-topic-list">
          {allTopics.map(topic => (
            <li key={topic.id} className={`oon-topic${topic.pinned ? ' oon-topic--pinned' : ''}`}>
              <button
                className="oon-pin-btn"
                title={topic.pinned ? 'Unpin' : 'Pin (keep after discussed)'}
                onClick={() => onTogglePin(person.id, topic.id)}
              >
                {topic.pinned ? '📌' : '○'}
              </button>
              <span className="oon-topic-text">{topic.text}</span>
              <button
                className="btn-icon btn-icon--delete"
                onClick={() => onDeleteTopic(person.id, topic.id)}
                title="Remove topic"
              >✕</button>
            </li>
          ))}
        </ul>
      )}

      {allTopics.length === 0 && (
        <p className="oon-empty">No topics yet.</p>
      )}

      <div className="oon-notes-section">
        <button className="oon-notes-toggle" onClick={() => setShowNotes(s => !s)}>
          {showNotes ? '▾' : '▸'} Notes
          {person.notes.length > 0 && <span className="oon-notes-count">{person.notes.length}</span>}
        </button>

        {showNotes && (
          <div className="oon-notes">
            <div className="oon-note-add">
              <span className="worklog-note-date worklog-note-date--today">{todayLabel()}</span>
              <textarea
                className="worklog-textarea"
                placeholder="Add a note…"
                rows={2}
                value={noteDraft}
                onChange={e => setNoteDraft(e.target.value)}
                onKeyDown={e => { if (e.ctrlKey && e.key === 'Enter') { e.preventDefault(); handleAddNote() } }}
              />
              <button
                className="btn-add btn-add--sm"
                onClick={handleAddNote}
                disabled={!noteDraft.trim()}
              >
                Log
              </button>
            </div>

            {person.notes.length === 0 && (
              <p className="worklog-notes-empty">No notes yet.</p>
            )}

            {person.notes.slice().reverse().map(note => (
              <div key={note.id} className="worklog-note">
                <span className="worklog-note-date">{note.date}</span>
                <span className="worklog-note-text">{note.text}</span>
                <button
                  className="btn-icon btn-icon--delete"
                  onClick={() => onDeleteNote(person.id, note.id)}
                  title="Delete note"
                >✕</button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default function OneOnOne({ people, onAddTopic, onDeleteTopic, onTogglePin, onAddNote, onDeleteNote }) {
  const [open, setOpen] = useState(true)

  return (
    <div className="one-on-one">
      <button className="archive-toggle" onClick={() => setOpen(o => !o)}>
        <span className="archive-toggle-label">{open ? '▾' : '▸'} 1:1 Topics</span>
        <span className="archive-count">
          {people.reduce((n, p) => n + p.topics.length, 0)} topics
        </span>
      </button>

      {open && (
        <div className="oon-grid">
          {people.map(person => (
            <PersonCard
              key={person.id}
              person={person}
              onAddTopic={onAddTopic}
              onDeleteTopic={onDeleteTopic}
              onTogglePin={onTogglePin}
              onAddNote={onAddNote}
              onDeleteNote={onDeleteNote}
            />
          ))}
        </div>
      )}
    </div>
  )
}
