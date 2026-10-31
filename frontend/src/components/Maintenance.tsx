import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { motion } from 'framer-motion'
import {
  ArrowDownWideNarrow, CalendarClock, Check, CheckCircle2, CircleAlert,
  ClipboardCheck, Clock3, Filter, Plus, RefreshCw, ShieldCheck, UserRound,
  Wrench, X,
} from 'lucide-react'
import { api } from '../lib/api'
import type { MaintenanceTask as TaskRecord, PropertyRecord, TaskStatus } from '../lib/types'
import './WorkspaceFeatures.css'

type Props = {
  properties: PropertyRecord[]
  notify: (message: string, tone?: 'success' | 'error') => void
}

const statusLabels: Record<TaskStatus, string> = { open: 'Open', in_progress: 'In progress', blocked: 'Blocked', completed: 'Completed' }
const relativeDate = (value?: string | null) => value ? new Date(`${value.slice(0, 10)}T12:00:00`).toLocaleDateString('en', { day: 'numeric', month: 'short', year: 'numeric' }) : 'No due date'
const isOverdue = (task: TaskRecord) => task.status !== 'completed' && !!task.due_date && task.due_date < new Date().toISOString().slice(0, 10)

export default function Maintenance({ properties, notify }: Props) {
  const [tasks, setTasks] = useState<TaskRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [saving, setSaving] = useState(false)
  const [filter, setFilter] = useState('all')
  const [propertyFilter, setPropertyFilter] = useState('all')
  const [priorityFilter, setPriorityFilter] = useState('all')
  const [dateFilter, setDateFilter] = useState('all')
  const [showCreate, setShowCreate] = useState(false)
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [editDescription, setEditDescription] = useState('')
  const [editAssignee, setEditAssignee] = useState('')
  const [editDue, setEditDue] = useState('')
  const [editCompletion, setEditCompletion] = useState('')

  const [newTitle, setNewTitle] = useState('')
  const [newDescription, setNewDescription] = useState('')
  const [newProperty, setNewProperty] = useState('')
  const [newAssignee, setNewAssignee] = useState('')
  const [newDue, setNewDue] = useState('')
  const [newPriority, setNewPriority] = useState('moderate')

  const load = async () => {
    setLoadError('')
    try { setTasks(await api.tasks()) }
    catch (reason) { setLoadError(reason instanceof Error ? reason.message : 'Could not load maintenance tasks.') }
    finally { setLoading(false) }
  }
  useEffect(() => { void load() }, [])
  useEffect(() => { if (!newProperty && properties[0]) setNewProperty(String(properties[0].id)) }, [properties, newProperty])

  const filtered = useMemo(() => tasks.filter((task) =>
    (filter === 'all' || (filter === 'overdue' ? isOverdue(task) : task.status === filter)) &&
    (propertyFilter === 'all' || task.property_id === Number(propertyFilter)) &&
    (priorityFilter === 'all' || task.priority === priorityFilter) &&
    (dateFilter === 'all' || (dateFilter === 'unscheduled' ? !task.due_date : dateFilter === 'due_soon' ? !!task.due_date && task.due_date >= new Date().toISOString().slice(0, 10) && task.due_date <= new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10) : true)),
  ), [tasks, filter, propertyFilter, priorityFilter, dateFilter])
  const counts = useMemo(() => ({ open: tasks.filter((task) => task.status !== 'completed').length, overdue: tasks.filter(isOverdue).length, completed: tasks.filter((task) => task.status === 'completed').length }), [tasks])

  const create = async (event: FormEvent) => {
    event.preventDefault()
    if (!newProperty) { notify('Add a property before creating a task.', 'error'); return }
    setSaving(true)
    try {
      const created = await api.createTask({ property_id: Number(newProperty), title: newTitle.trim(), description: newDescription.trim() || null, assignee: newAssignee.trim() || null, due_date: newDue || null, priority: newPriority })
      setTasks((items) => [created, ...items])
      setNewTitle(''); setNewDescription(''); setNewAssignee(''); setNewDue(''); setShowCreate(false)
      notify('Maintenance task created.')
    } catch (reason) { notify(reason instanceof Error ? reason.message : 'Could not create this task.', 'error') }
    finally { setSaving(false) }
  }

  const changeStatus = async (task: TaskRecord, status: TaskStatus) => {
    const note = status === 'completed' ? task.completion_note : undefined
    setSaving(true)
    try {
      const updated = await api.updateTask(task.id, { status, ...(note !== undefined ? { completion_note: note } : {}) })
      setTasks((items) => items.map((item) => item.id === task.id ? updated : item))
      notify(`Task marked ${statusLabels[status].toLowerCase()}.`)
    } catch (reason) { notify(reason instanceof Error ? reason.message : 'Could not update task status.', 'error') }
    finally { setSaving(false) }
  }

  const beginEdit = (task: TaskRecord) => {
    setExpandedId(task.id === expandedId ? null : task.id)
    setEditTitle(task.title); setEditDescription(task.description || ''); setEditAssignee(task.assignee || '')
    setEditDue(task.due_date || ''); setEditCompletion(task.completion_note || '')
  }

  const saveEdit = async (task: TaskRecord) => {
    if (editTitle.trim().length < 3) { notify('Task title needs at least 3 characters.', 'error'); return }
    setSaving(true)
    try {
      const updated = await api.updateTask(task.id, { title: editTitle.trim(), description: editDescription.trim() || null, assignee: editAssignee.trim() || null, due_date: editDue || null, completion_note: editCompletion.trim() || null })
      setTasks((items) => items.map((item) => item.id === task.id ? updated : item))
      setExpandedId(null); notify('Task details saved.')
    } catch (reason) { notify(reason instanceof Error ? reason.message : 'Could not save task details.', 'error') }
    finally { setSaving(false) }
  }

  const propsById = useMemo(() => new Map(properties.map((property) => [property.id, property.name])), [properties])

  return <motion.section className="page-content feature-page maintenance-page" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
    <div className="maintenance-hero">
      <div className="maintenance-hero-icon"><Wrench size={20} /></div>
      <span className="eyebrow">PROPERTY CARE, IN MOTION</span>
      <h1>Make the next step<br /><em>easy to follow through.</em></h1>
      <p>Turn reviewed observations into clear tasks, with an owner, a date, and a status that stays saved to the property.</p>
      <button className="button button-primary" onClick={() => setShowCreate((value) => !value)}><Plus size={16} /> Add a task</button>
      <div className="maintenance-hero-orbit orbit-a" /><div className="maintenance-hero-orbit orbit-b" />
      <div className="maintenance-hero-art"><div className="maintenance-art-ring"><ClipboardCheck size={30} /></div><span className="art-check check-a"><Check size={12} /></span><span className="art-check check-b"><Check size={12} /></span><span className="art-dot" /></div>
    </div>

    <div className="task-stats-grid"><div className="task-stat-card"><span className="task-stat-icon open"><Clock3 size={16} /></span><div><span>OPEN TASKS</span><b>{counts.open}</b></div></div><div className="task-stat-card"><span className="task-stat-icon overdue"><CalendarClock size={16} /></span><div><span>PAST DUE</span><b>{counts.overdue}</b></div></div><div className="task-stat-card"><span className="task-stat-icon done"><CheckCircle2 size={16} /></span><div><span>COMPLETED</span><b>{counts.completed}</b></div></div></div>

    {showCreate && <form className="task-create-card" onSubmit={(event) => void create(event)}>
      <div className="task-create-heading"><div><span className="eyebrow">NEW FOLLOW-UP</span><h2>Create a maintenance task</h2></div><button type="button" className="icon-button" onClick={() => setShowCreate(false)} aria-label="Close task form"><X size={18} /></button></div>
      <div className="task-form-grid"><label className="case-field-label">Task title<input value={newTitle} onChange={(event) => setNewTitle(event.target.value)} minLength={3} maxLength={180} placeholder="e.g. Arrange a roof review" required /></label><label className="case-field-label">Property<select value={newProperty} onChange={(event) => setNewProperty(event.target.value)} required>{properties.map((property) => <option value={property.id} key={property.id}>{property.name}</option>)}</select></label><label className="case-field-label">Owner / assignee<input value={newAssignee} onChange={(event) => setNewAssignee(event.target.value)} maxLength={120} placeholder="Name or role" /></label><label className="case-field-label">Target date<input type="date" value={newDue} onChange={(event) => setNewDue(event.target.value)} /></label><label className="case-field-label">Priority<select value={newPriority} onChange={(event) => setNewPriority(event.target.value)}><option value="low">Low</option><option value="moderate">Moderate</option><option value="high">High</option></select></label><label className="case-field-label task-form-wide">Next action / notes<textarea rows={3} value={newDescription} onChange={(event) => setNewDescription(event.target.value)} maxLength={4000} placeholder="What should happen next?" /></label></div>
      {!properties.length && <div className="inline-case-error"><CircleAlert size={14} /> Add a property before creating maintenance tasks.</div>}
      <div className="task-create-actions"><button type="button" className="button button-soft" onClick={() => setShowCreate(false)}>Cancel</button><button className="button button-primary" disabled={saving || !properties.length || newTitle.trim().length < 3}>{saving ? 'Saving…' : <><Check size={15} /> Save task</>}</button></div>
    </form>}

    <div className="task-toolbar"><div><span className="eyebrow">FOLLOW-UP QUEUE</span><h2>Your maintenance tasks</h2></div><div className="task-filters"><label><Filter size={14} /><select value={filter} onChange={(event) => setFilter(event.target.value)} aria-label="Filter tasks by status"><option value="all">All statuses</option><option value="open">Open</option><option value="in_progress">In progress</option><option value="blocked">Blocked</option><option value="completed">Completed</option><option value="overdue">Past due</option></select></label><label><ArrowDownWideNarrow size={14} /><select value={priorityFilter} onChange={(event) => setPriorityFilter(event.target.value)} aria-label="Filter tasks by priority"><option value="all">All priorities</option><option value="high">High</option><option value="moderate">Moderate</option><option value="low">Low</option></select></label><label><CalendarClock size={14} /><select value={dateFilter} onChange={(event) => setDateFilter(event.target.value)} aria-label="Filter tasks by due date"><option value="all">Any due date</option><option value="due_soon">Due in 7 days</option><option value="unscheduled">No due date</option></select></label><label><ArrowDownWideNarrow size={14} /><select value={propertyFilter} onChange={(event) => setPropertyFilter(event.target.value)} aria-label="Filter tasks by property"><option value="all">All properties</option>{properties.map((property) => <option key={property.id} value={property.id}>{property.name}</option>)}</select></label><button className="icon-button" onClick={() => { setLoading(true); void load() }} aria-label="Refresh tasks"><RefreshCw size={15} /></button></div></div>

    {loading ? <div className="feature-loading"><span className="feature-spinner" /> Loading maintenance tasks…</div> : loadError ? <div className="feature-error"><CircleAlert /><div><b>Task queue unavailable</b><span>{loadError}</span></div><button className="button button-soft" onClick={() => { setLoading(true); void load() }}>Try again</button></div> : filtered.length ? <div className="task-list">{filtered.map((task) => <article className={`task-card ${isOverdue(task) ? 'is-overdue' : ''} ${task.status === 'completed' ? 'is-complete' : ''}`} key={task.id}>
      <div className="task-card-main"><div className={`task-check ${task.status === 'completed' ? 'checked' : ''}`}><Check size={14} /></div><div className="task-card-copy"><div className="task-card-eyebrow"><span>{propsById.get(task.property_id) || task.property_name || 'Property'}</span>{task.finding_id && <span className="task-linked"><ShieldCheck size={11} /> LINKED FINDING</span>}</div><h3>{task.title}</h3>{task.description && <p>{task.description}</p>}<div className="task-card-meta"><span><UserRound size={13} />{task.assignee || 'Unassigned'}</span><span className={isOverdue(task) ? 'overdue-date' : ''}><CalendarClock size={13} />{isOverdue(task) ? `Past due · ${relativeDate(task.due_date)}` : relativeDate(task.due_date)}</span><span className={`task-priority-text ${task.priority}`}>{task.priority} priority</span></div>{task.completion_note && <div className="task-completion-note"><CheckCircle2 size={13} /> {task.completion_note}</div>}</div></div>
      <div className="task-card-controls"><span className={`task-status-pill ${task.status}`}>{statusLabels[task.status]}</span><label className="task-status-select"><span className="sr-only">Update status for {task.title}</span><select value={task.status} onChange={(event) => void changeStatus(task, event.target.value as TaskStatus)} disabled={saving} aria-label={`Update status for ${task.title}`}>{Object.entries(statusLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label><button className="task-edit-toggle" onClick={() => beginEdit(task)} aria-expanded={expandedId === task.id}>{expandedId === task.id ? 'Close details' : 'Edit details'}</button></div>
      {expandedId === task.id && <div className="task-edit-panel"><label className="case-field-label">Title<input value={editTitle} onChange={(event) => setEditTitle(event.target.value)} maxLength={180} /></label><label className="case-field-label">Owner<input value={editAssignee} onChange={(event) => setEditAssignee(event.target.value)} maxLength={120} /></label><label className="case-field-label">Due date<input type="date" value={editDue} onChange={(event) => setEditDue(event.target.value)} /></label><label className="case-field-label task-form-wide">Next action<textarea rows={2} value={editDescription} onChange={(event) => setEditDescription(event.target.value)} maxLength={4000} /></label>{task.status === 'completed' && <label className="case-field-label task-form-wide">Completion note<textarea rows={2} value={editCompletion} onChange={(event) => setEditCompletion(event.target.value)} maxLength={2000} placeholder="Record what was completed." /></label>}<div className="task-edit-actions"><button className="button button-soft" onClick={() => setExpandedId(null)}>Cancel</button><button className="button button-primary" onClick={() => void saveEdit(task)} disabled={saving}>{saving ? 'Saving…' : <><Check size={14} /> Save changes</>}</button></div></div>}
    </article>)}</div> : <div className="task-empty"><div><ClipboardCheck size={21} /></div><h3>{tasks.length ? 'No tasks match these filters.' : 'Your follow-up queue is clear.'}</h3><p>{tasks.length ? 'Choose another status or property to see more tasks.' : 'Create a task from a reviewed finding or start with a simple maintenance reminder.'}</p>{tasks.length ? <button className="button button-soft" onClick={() => { setFilter('all'); setPropertyFilter('all'); setPriorityFilter('all'); setDateFilter('all') }}>Clear filters</button> : <button className="button button-primary" onClick={() => setShowCreate(true)}><Plus size={15} /> Add a task</button>}</div>}

    <div className="maintenance-footnote"><ShieldCheck size={15} /><span>Tasks help organize follow-up. They do not represent a diagnosis, repair estimate, or safety certification.</span></div>
  </motion.section>
}
