import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent, type FormEvent, type PointerEvent, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  Activity, AlertTriangle, ArrowLeft, ArrowRight, ArrowUpRight, Bell, Building2,
  Check, CheckCircle2, ChevronDown, ChevronRight, CircleHelp, Clock3, CloudUpload, Download,
  FileText, Filter, Home, ImagePlus, Layers3, MapPin, Menu, MoreHorizontal, Plus, ScanLine,
  Search, Settings2, ShieldCheck, Sparkles, Upload, Wrench, X, Zap, ClipboardCheck, Route,
} from 'lucide-react'
import { api, mediaUrl } from './lib/api'
import type { DashboardData, DemoSample, FindingReviewEvent, Inspection, PropertyRecord, User } from './lib/types'
import GuidedCase from './components/GuidedCase'
import Maintenance from './components/Maintenance'
import RoomScene from './components/RoomScene'
import ModelTransparencyDashboard from './components/ModelTransparencyDashboard'
import './App.css'

type Page = 'overview' | 'properties' | 'inspections' | 'maintenance' | 'guided' | 'insights' | 'reports' | 'settings' | 'review'
type Toast = { id: number; text: string; tone?: 'success' | 'error' }

const navItems: { id: Page; label: string; icon: typeof Home }[] = [
  { id: 'overview', label: 'Overview', icon: Home },
  { id: 'properties', label: 'My properties', icon: Building2 },
  { id: 'inspections', label: 'Inspections', icon: ScanLine },
  { id: 'maintenance', label: 'Maintenance', icon: ClipboardCheck },
  { id: 'guided', label: 'Guided case', icon: Route },
  { id: 'insights', label: 'AI insights', icon: Sparkles },
  { id: 'reports', label: 'Reports', icon: FileText },
]

const formatDate = (value?: string | null) => value ? new Date(value).toLocaleDateString('en', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Not inspected yet'
const titleCase = (value: string) => value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
const reasonLabel = (value: string) => ({
  visible_surface_finding: 'Visible surface pattern',
  surface_condition_class: 'Surface-pattern review rule',
  repeat_observation: 'Similar reviewed finding recorded before in this area',
  recurrence_escalated: 'Repeated occurrence across multiple inspections',
  active_moisture_reported: 'Active moisture reported by inspector/resident',
  user_reports_worsening: 'Worsening reported by inspector',
  inspector_severity_high: 'Inspector-assessed high severity',
  unresolved_open_task: 'Unresolved maintenance task already open for property',
  low_model_confidence: 'Low model score; human review needed',
  inspector_marked_region: 'Region marked by inspector',
  large_inspector_marked_region: 'Inspector-marked region covers substantial area',
  image_quality_blurry: 'Low image sharpness; human review needed',
  image_quality_poor_lighting: 'Poor illumination; details may be obscured',
  image_quality_overexposed: 'Image overexposed; glare may wash out details',
  maintenance_review_only: 'Maintenance review guidance only (no failure prediction)',
  no_supported_defect_detected: 'No supported pattern detected in model label set',
} as Record<string, string>)[value] || titleCase(value)
const PortfolioChart = lazy(() => import('./components/PortfolioChart'))
const initials = (name: string) => name.split(/\s+/).slice(0, 2).map((word) => word[0]).join('').toUpperCase()

function App() {
  const [page, setPage] = useState<Page>('overview')
  const [user, setUser] = useState<User | null>(null)
  const [dashboard, setDashboard] = useState<DashboardData | null>(null)
  const [busy, setBusy] = useState(true)
  const [error, setError] = useState('')
  const [modal, setModal] = useState<'property' | 'inspection' | null>(null)
  const [inspectionArea, setInspectionArea] = useState('')
  const [activeProperty, setActiveProperty] = useState<PropertyRecord | null>(null)
  const [activeInspection, setActiveInspection] = useState<Inspection | null>(null)
  const [toasts, setToasts] = useState<Toast[]>([])
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const openInspectionModal = (area = '') => {
    setInspectionArea(area)
    setModal('inspection')
  }

  const notify = useCallback((text: string, tone: Toast['tone'] = 'success') => {
    const id = Date.now() + Math.random()
    setToasts((items) => [...items, { id, text, tone }])
    window.setTimeout(() => setToasts((items) => items.filter((item) => item.id !== id)), 4000)
  }, [])

  const refresh = useCallback(async () => {
    setError('')
    try {
      const data = await api.dashboard()
      setDashboard(data)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not load your workspace.')
    }
  }, [])

  useEffect(() => {
    let mounted = true
    ;(async () => {
      try {
        let account: User
        try { account = await api.me() } catch { account = await api.demoLogin() }
        if (!mounted) return
        setUser(account)
        const data = await api.dashboard()
        if (mounted) setDashboard(data)
      } catch (reason) {
        if (mounted) setError(reason instanceof Error ? reason.message : 'Unable to connect to PropertyPulse.')
      } finally {
        if (mounted) setBusy(false)
      }
    })()
    return () => { mounted = false }
  }, [])

  useEffect(() => {
    const navigate = (event: Event) => {
      const target = (event as CustomEvent<Page>).detail
      if (target) { setPage(target); setActiveProperty(null) }
    }
    window.addEventListener('pulse-page', navigate)
    return () => window.removeEventListener('pulse-page', navigate)
  }, [])

  const openInspection = useCallback(async (id: number) => {
    try {
      const inspection = await api.inspection(id)
      setActiveInspection(inspection)
      setPage('review')
    } catch (reason) { notify(reason instanceof Error ? reason.message : 'Could not open inspection.', 'error') }
  }, [notify])

  const openProperty = (property: PropertyRecord) => { setActiveProperty(property); setPage('properties') }

  const onCreatedProperty = async (property: PropertyRecord) => {
    setModal(null)
    await refresh()
    setActiveProperty(property)
    setPage('properties')
    notify('Property details saved.')
  }

  const onCreatedInspection = async (inspection: Inspection) => {
    setModal(null)
    setInspectionArea('')
    await refresh()
    setActiveInspection(inspection)
    setPage('review')
    notify('Inspection created. Your evidence is ready to review.')
  }

  if (busy) return <div className="boot-screen"><div className="brand-mark large"><img src="/propertypulse-mark.svg" alt="" /></div><div className="boot-copy"><strong>PropertyPulse</strong><span>Preparing your property workspace…</span></div><div className="boot-line" /></div>
  if (error && !dashboard) return <div className="connect-screen"><div className="brand-mark large"><img src="/propertypulse-mark.svg" alt="" /></div><span className="eyebrow">PROPERTY CARE, WITH CLARITY</span><h1>Your property portfolio,<br />in a new light.</h1><p>{error}</p><button className="button button-primary" onClick={async () => { setBusy(true); try { const account = await api.demoLogin(); setUser(account); await refresh() } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not connect to the API.') } finally { setBusy(false) } }}><Zap size={17} /> Connect demo workspace</button><span className="connect-hint">Start the local API and try again. Your demo workspace is ready.</span></div>

  return (
    <div className="app-shell">
      <aside className={`sidebar ${sidebarOpen ? 'sidebar-open' : ''}`}>
        <div className="brand-lockup"><div className="brand-mark"><img src="/propertypulse-mark.svg" alt="" /></div><div><b>property<span>pulse</span></b><small>PROPERTY INTELLIGENCE</small></div><button className="mobile-close icon-button" onClick={() => setSidebarOpen(false)} aria-label="Close menu"><X size={18} /></button></div>
        <div className="workspace-switch"><div className="workspace-avatar">NW</div><div className="workspace-text"><b>Propcare NW</b><small>Personal workspace</small></div><ChevronDown size={15} /></div>
        <div className="nav-caption">WORKSPACE</div>
        <nav className="main-nav">{navItems.map(({ id, label, icon: Icon }) => <button key={id} className={`nav-item ${page === id || (id === 'properties' && !!activeProperty) ? 'active' : ''}`} onClick={() => { setPage(id); setActiveProperty(null); setSidebarOpen(false) }}><Icon size={18} strokeWidth={1.9} /><span>{label}</span>{id === 'inspections' && (dashboard?.summary.open_reviews ?? 0) > 0 && <i className="nav-count">{dashboard?.summary.open_reviews}</i>}</button>)}</nav>
        <div className="sidebar-spacer" />
        <div className="sidebar-tip"><div className="tip-icon"><Sparkles size={16} /></div><b>A clearer view<br />of what matters.</b><span>Every recommendation comes with its reasoning.</span><button onClick={() => setPage('insights')}>Explore insights <ArrowRight size={14} /></button><div className="tip-orbit orbit-one" /><div className="tip-orbit orbit-two" /></div>
        <button className={`nav-item settings-nav ${page === 'settings' ? 'active' : ''}`} onClick={() => { setPage('settings'); setActiveProperty(null) }}><Settings2 size={18} /><span>Settings</span></button>
        <div className="profile-block"><div className="profile-avatar">{initials(user?.name || 'Sagar')}</div><div className="profile-text"><b>{user?.name || 'Sagar'}</b><small>Property manager</small></div><MoreHorizontal size={18} /></div>
      </aside>
      {sidebarOpen && <button className="sidebar-scrim" aria-label="Close navigation" onClick={() => setSidebarOpen(false)} />}

      <main className="main-area">
        <header className="topbar"><div className="topbar-left"><button className="mobile-menu icon-button" onClick={() => setSidebarOpen(true)} aria-label="Open menu"><Menu size={20} /></button><div className="crumb"><span>Workspace</span><ChevronRight size={14} /><b>{activeProperty ? activeProperty.name : page === 'review' ? 'Inspection review' : navItems.find((item) => item.id === page)?.label || 'Settings'}</b></div></div><div className="topbar-right"><div className="sync-status"><span className="pulse-dot" /> Workspace connected</div><button className="icon-button notification-button" aria-label="Notifications" onClick={() => notify('You are all caught up.') }><Bell size={18} /><i /></button><div className="top-avatar">{initials(user?.name || 'Sagar')}</div></div></header>
        <div className="page-wrap">
          <AnimatePresence mode="wait">
            {page === 'overview' && <Overview key="overview" dashboard={dashboard} userName={user?.name || 'there'} onNew={openInspectionModal} onAddProperty={() => { setActiveProperty(null); setModal('property') }} onOpenInspection={openInspection} onOpenProperty={openProperty} onGuided={() => setPage('guided')} />}
            {page === 'properties' && <Properties key={activeProperty ? `property-${activeProperty.id}` : 'properties'} properties={dashboard?.properties || []} activeProperty={activeProperty} onSelect={setActiveProperty} onAdd={() => { setActiveProperty(null); setModal('property') }} onEdit={() => setModal('property')} onNewInspection={(property) => { setActiveProperty(property); openInspectionModal() }} onOpenInspection={openInspection} onDelete={async (property) => { if (window.confirm(`Remove ${property.name} and its inspection history?`)) { try { await api.deleteProperty(property.id); setActiveProperty(null); await refresh(); notify('Property removed.') } catch (reason) { notify(reason instanceof Error ? reason.message : 'Could not remove property.', 'error') } } }} />}
            {page === 'inspections' && <Inspections key="inspections" dashboard={dashboard} onNew={() => openInspectionModal()} onOpen={openInspection} />}
            {page === 'maintenance' && <Maintenance key="maintenance" properties={dashboard?.properties || []} notify={notify} />}
            {page === 'guided' && <GuidedCase key="guided" notify={notify} onWorkspaceRefresh={refresh} onOpenMaintenance={() => setPage('maintenance')} />}
            {page === 'review' && activeInspection && <Review key={`review-${activeInspection.id}`} inspection={activeInspection} modelReady={dashboard?.model.ready ?? false} onBack={() => { setPage('inspections'); void refresh() }} onRefresh={async () => { const updated = await api.inspection(activeInspection.id); setActiveInspection(updated); await refresh() }} notify={notify} />}
            {page === 'insights' && <Insights key="insights" dashboard={dashboard} onOpen={openInspection} />}
            {page === 'reports' && <Reports key="reports" dashboard={dashboard} onOpen={openInspection} notify={notify} />}
            {page === 'settings' && <Settings key="settings" user={user} model={dashboard?.model} notify={notify} onProfileUpdated={setUser} />}
          </AnimatePresence>
        </div>
      </main>

      <AnimatePresence>{modal === 'property' && <PropertyModal key={activeProperty ? `edit-property-${activeProperty.id}` : 'new-property'} initial={activeProperty} onClose={() => setModal(null)} onCreated={onCreatedProperty} notify={notify} />}{modal === 'inspection' && <InspectionModal key="new-inspection" properties={dashboard?.properties || []} initialProperty={activeProperty} initialArea={inspectionArea} onClose={() => { setModal(null); setInspectionArea('') }} onCreated={onCreatedInspection} notify={notify} />}</AnimatePresence>
      <div className="toast-stack" aria-live="polite">{toasts.map((toast) => <motion.div key={toast.id} initial={{ opacity: 0, y: 12, scale: .96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, x: 30 }} className={`toast ${toast.tone || 'success'}`}>{toast.tone === 'error' ? <CircleHelp size={18} /> : <CheckCircle2 size={18} />}{toast.text}<button onClick={() => setToasts((items) => items.filter((item) => item.id !== toast.id))}><X size={15} /></button></motion.div>)}</div>
    </div>
  )
}

function PageIntro({ eyebrow, title, text, action }: { eyebrow: string; title: ReactNode; text: string; action?: ReactNode }) {
  return <motion.div className="page-intro" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .35 }}><div><div className="eyebrow">{eyebrow}</div><h1>{title}</h1><p>{text}</p></div>{action && <div className="intro-action">{action}</div>}</motion.div>
}

function Overview({ dashboard, userName, onNew, onAddProperty, onOpenInspection, onOpenProperty, onGuided }: { dashboard: DashboardData | null; userName: string; onNew: (area?: string) => void; onAddProperty: () => void; onOpenInspection: (id: number) => void; onOpenProperty: (property: PropertyRecord) => void; onGuided: () => void }) {
  const [query, setQuery] = useState('')
  const chartData = useMemo(() => {
    const now = new Date()
    const months = Array.from({ length: 6 }, (_, offset) => new Date(now.getFullYear(), now.getMonth() - 5 + offset, 1))
    return months.map((date) => {
      const inMonth = (dashboard?.recent_inspections || []).filter((item) => {
        const inspected = new Date(item.inspection_date)
        return inspected.getFullYear() === date.getFullYear() && inspected.getMonth() === date.getMonth()
      })
      return { month: date.toLocaleDateString('en', { month: 'short' }), inspections: inMonth.length, findings: inMonth.reduce((sum, item) => sum + item.finding_count, 0) }
    })
  }, [dashboard])
  if (!dashboard) return null
  const { summary, properties, recent_inspections: inspections } = dashboard
  const now = new Date()
  const greeting = now.getHours() < 12 ? 'Good morning' : now.getHours() < 18 ? 'Good afternoon' : 'Good evening'
  const dateLabel = now.toLocaleDateString('en', { weekday: 'long', month: 'long', day: 'numeric' }).toUpperCase()
  const filtered = properties.filter((property) => `${property.name} ${property.location_label || ''}`.toLowerCase().includes(query.toLowerCase()))
  return <motion.section className="page-content" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
    <PageIntro eyebrow={dateLabel} title={<>{greeting}, {userName.split(/\s+/)[0]} <span className="title-sparkle">✳</span></>} text="A little clarity goes a long way. Here's what your properties are telling you." action={<div className="overview-actions"><button className="button button-soft" onClick={onGuided}><Route size={15} /> Guided case</button><button className="button button-primary" onClick={() => onNew()}><Plus size={17} /> New inspection</button></div>} />
    <section className="welcome-banner"><div className="welcome-copy"><div className="banner-kicker"><span className="sparkle-badge"><Sparkles size={13} /></span> YOUR PORTFOLIO, IN PERSPECTIVE</div><h2>Care is easier<br />when it’s <em>clear.</em></h2><p>See what needs attention, understand why, and keep a steady record of every property.</p><button className="banner-link" onClick={() => onNew()}>Start an inspection <ArrowRight size={15} /></button></div><RoomScene onStartInspection={onNew} /></section>
    <section className="stats-grid">
      <StatCard icon={<Building2 size={17} />} label="PROPERTIES" value={summary.property_count} foot="In your portfolio" tint="mint" />
      <StatCard icon={<ScanLine size={17} />} label="INSPECTIONS" value={summary.inspection_count} foot="Across your properties" tint="lavender" />
      <StatCard icon={<ShieldCheck size={17} />} label="REVIEW QUEUE" value={summary.open_reviews} foot={summary.open_reviews ? 'Ready for your review' : 'Nothing waiting on you'} tint="peach" trend={summary.open_reviews ? 'Needs a look' : 'Up to date'} />
      <StatCard icon={<CheckCircle2 size={17} />} label="REVIEWED" value={summary.review_completion == null ? '—' : `${summary.review_completion}%`} foot={summary.review_completion == null ? 'No findings to review yet' : 'Findings checked by you'} tint="blue" />
    </section>
    <div className="dashboard-grid">
      <section className="panel care-panel"><div className="panel-heading"><div><span className="eyebrow">PORTFOLIO PULSE</span><h2>Inspection activity</h2></div><span className="select-pill">Last 6 months <ChevronDown size={14} /></span></div><div className="chart-summary"><strong>{inspections.length} recent record{inspections.length === 1 ? '' : 's'}</strong><span>Recent journal records by month.</span></div><div className="chart-wrap"><Suspense fallback={<LoadingLine />}><PortfolioChart data={chartData} /></Suspense></div><div className="chart-legend"><span><i className="legend-dot care-dot" /> Inspections</span><span><i className="legend-dot inspect-dot" /> Findings</span></div></section>
      <section className="panel focus-panel"><div className="focus-top"><span className="eyebrow">A GOOD NEXT STEP</span><div className="focus-icon"><Sparkles size={17} /></div></div><h2>{summary.open_reviews ? 'A few findings need your eye.' : 'Build a clearer history.'}</h2><p>{summary.open_reviews ? 'Your review is what turns a model suggestion into a useful property record.' : 'A quick inspection adds the first useful chapter to your property story.'}</p><div className="focus-divider" /><div className="focus-item"><div className="focus-item-icon"><Clock3 size={15} /></div><div><b>{summary.open_reviews ? `${summary.open_reviews} finding${summary.open_reviews === 1 ? '' : 's'} to review` : 'Choose a space to inspect'}</b><span>It takes only a few minutes</span></div><ArrowRight size={15} /></div><button className="button button-dark full-width" onClick={summary.open_reviews && inspections[0] ? () => onOpenInspection(inspections[0].id) : () => onNew()}>{summary.open_reviews ? 'Open review queue' : 'Begin an inspection'} <ArrowRight size={15} /></button><div className="focus-foot"><ShieldCheck size={13} /> Recommendations always show their reasoning</div></section>
    </div>
    <section className="section-block"><div className="section-heading"><div><span className="eyebrow">YOUR PLACES</span><h2>Properties <span className="muted-count">{properties.length.toString().padStart(2, '0')}</span></h2></div><div className="section-tools"><label className="search-field"><Search size={15} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find a property" /></label><button className="text-button" onClick={onAddProperty}><Plus size={15} /> Add property</button></div></div><div className="property-grid">{filtered.slice(0, 3).map((property) => <PropertyCard key={property.id} property={property} onClick={() => onOpenProperty(property)} />)}<button className="add-property-card" onClick={onAddProperty}><span className="add-circle"><Plus size={18} /></span><b>Add a property</b><span>Keep every place in one view</span></button></div></section>
    <section className="section-block recent-section"><div className="section-heading"><div><span className="eyebrow">RECENT ACTIVITY</span><h2>Inspection journal</h2></div><button className="text-button" onClick={() => { window.dispatchEvent(new CustomEvent('pulse-page', { detail: 'inspections' })) }}>See all <ArrowRight size={14} /></button></div>{inspections.length ? <div className="journal-list">{inspections.slice(0, 4).map((inspection) => <InspectionRow key={inspection.id} inspection={inspection} onClick={() => onOpenInspection(inspection.id)} />)}</div> : <div className="empty-inline"><div className="empty-icon"><ImagePlus size={19} /></div><div><b>Your journal starts with one small step.</b><span>Run your first inspection to keep a thoughtful record.</span></div><button className="button button-soft" onClick={() => onNew()}>Start now <ArrowRight size={14} /></button></div>}</section>
  </motion.section>
}

function StatCard({ icon, label, value, foot, tint, trend }: { icon: ReactNode; label: string; value: ReactNode; foot: string; tint: string; trend?: string }) {
  return <div className="stat-card"><div className="stat-top"><div className={`stat-icon ${tint}`}>{icon}</div>{trend && <span className="stat-tag">{trend}</span>}</div><span className="stat-label">{label}</span><strong className="stat-value">{value}</strong><span className="stat-foot">{foot}</span><span className="stat-sheen" /></div>
}

function PropertyCard({ property, onClick }: { property: PropertyRecord; onClick: () => void }) {
  const style = property.cover_image_url ? { backgroundImage: `linear-gradient(180deg, transparent 44%, rgba(19,38,30,.36) 100%),url("${property.cover_image_url}")` } : undefined
  return <button className="property-card" onClick={onClick}>
    <div className="property-image" style={style}><span className="property-type">{property.property_type}</span>{property.is_demo && <span className="property-demo-tag">GUIDED DEMO</span>}<span className="property-arrow"><ArrowUpRight size={17} /></span><span className="image-shade" /></div>
    <div className="property-card-body"><div className="property-name-row"><h3>{property.name}</h3><span className="property-health"><i /> {property.inspection_count ? 'Tracked' : 'New'}</span></div><span className="property-location"><MapPin size={13} /> {property.location_label || 'Location not set'}</span><div className="property-card-foot"><span><ScanLine size={13} /> {property.inspection_count} inspections</span><span>Last visit · {formatDate(property.last_inspection_date)}</span></div></div>
  </button>
}

function InspectionRow({ inspection, onClick }: { inspection: Inspection; onClick: () => void }) {
  const findings = inspection.finding_count
  return <button className="journal-row" onClick={onClick}><div className="journal-date"><b>{new Date(inspection.inspection_date).toLocaleDateString('en', { day: '2-digit' })}</b><span>{new Date(inspection.inspection_date).toLocaleDateString('en', { month: 'short' }).toUpperCase()}</span></div><div className="journal-main"><b>{inspection.area_label}</b><span>{inspection.property_name || 'Property'} · {formatDate(inspection.inspection_date)}</span></div><div className="journal-status"><span className={`status-dot ${findings ? 'status-warn' : ''}`} />{findings ? `${findings} finding${findings === 1 ? '' : 's'}` : 'No findings yet'}</div><ChevronRight size={16} /></button>
}

function Properties({ properties, activeProperty, onSelect, onAdd, onEdit, onNewInspection, onOpenInspection, onDelete }: { properties: PropertyRecord[]; activeProperty: PropertyRecord | null; onSelect: (property: PropertyRecord | null) => void; onAdd: () => void; onEdit: (property: PropertyRecord) => void; onNewInspection: (property: PropertyRecord) => void; onOpenInspection: (id: number) => void; onDelete: (property: PropertyRecord) => void }) {
  const [history, setHistory] = useState<Inspection[]>([])
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (!activeProperty) { setHistory([]); return }
    setBusy(true)
    api.history(activeProperty.id).then(setHistory).catch(() => setHistory([])).finally(() => setBusy(false))
  }, [activeProperty?.id])
  if (activeProperty) return <motion.section className="page-content" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}><button className="back-link" onClick={() => onSelect(null)}><ArrowLeft size={15} /> All properties</button><div className="property-detail-hero" style={activeProperty.cover_image_url ? { backgroundImage: `linear-gradient(90deg,rgba(14,35,27,.86),rgba(14,35,27,.18)),url("${activeProperty.cover_image_url}")` } : undefined}><span className="detail-badge">{activeProperty.property_type}</span><div><span className="eyebrow">PROPERTY PROFILE</span><h1>{activeProperty.name}</h1><span className="detail-location"><MapPin size={14} /> {activeProperty.location_label || 'Location not set'} <span>•</span> {activeProperty.age_band || 'Age not set'}</span></div><div className="property-hero-actions"><button className="button button-white" onClick={() => onEdit(activeProperty)}><Settings2 size={15} /> Edit details</button><button className="button button-white" onClick={() => onNewInspection(activeProperty)}><Plus size={16} /> Start inspection</button></div></div><div className="property-detail-stats"><div><span>INSPECTIONS</span><b>{history.length}</b></div><div><span>LAST INSPECTED</span><b>{formatDate(history[0]?.inspection_date)}</b></div><div><span>OPEN FINDINGS</span><b>{history.reduce((total, item) => total + item.images.reduce((sum, image) => sum + image.findings.filter((finding) => ['suggested', 'needs_review'].includes(finding.status)).length, 0), 0)}</b></div><button className="text-button danger-text" onClick={() => onDelete(activeProperty)}>Remove property</button></div><div className="section-block detail-history"><div className="section-heading"><div><span className="eyebrow">PROPERTY STORY</span><h2>Inspection history</h2></div><button className="button button-soft" onClick={() => onNewInspection(activeProperty)}><Plus size={15} /> New inspection</button></div>{busy ? <LoadingLine /> : history.length ? <div className="journal-list">{history.map((inspection) => <InspectionRow key={inspection.id} inspection={inspection} onClick={() => onOpenInspection(inspection.id)} />)}</div> : <EmptyState icon={<Layers3 size={21} />} title="This story is just beginning" text="Add an inspection to create a record of how the property changes over time." />}</div></motion.section>
  return <motion.section className="page-content" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}><PageIntro eyebrow="YOUR PORTFOLIO" title="Every place, thoughtfully tracked." text="Keep a clear record of the homes and spaces you look after." action={<button className="button button-primary" onClick={onAdd}><Plus size={17} /> Add property</button>} /><div className="property-grid properties-page-grid">{properties.map((property) => <PropertyCard key={property.id} property={property} onClick={() => onSelect(property)} />)}<button className="add-property-card large-add" onClick={onAdd}><span className="add-circle"><Plus size={18} /></span><b>Add a property</b><span>Your next place, all in one view</span></button></div>{!properties.length && <EmptyState icon={<Building2 size={22} />} title="Your portfolio is ready for its first place" text="Add a property to begin keeping a thoughtful maintenance history." />}</motion.section>
}

function Inspections({ dashboard, onNew, onOpen }: { dashboard: DashboardData | null; onNew: () => void; onOpen: (id: number) => void }) {
  const [filter, setFilter] = useState('All inspections')
  const inspections = dashboard?.recent_inspections || []
  const visible = filter === 'Needs review' ? inspections.filter((item) => item.images.some((image) => image.findings.some((finding) => ['suggested', 'needs_review'].includes(finding.status)))) : inspections
  return <motion.section className="page-content" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}><PageIntro eyebrow="FIELD NOTES" title="Inspection journal." text="Every photo, suggestion and decision stays with the property it belongs to." action={<button className="button button-primary" onClick={() => onNew()}><Plus size={17} /> New inspection</button>} /><div className="filter-toolbar"><div className="filter-tabs">{['All inspections', 'Needs review'].map((item) => <button key={item} className={filter === item ? 'selected' : ''} onClick={() => setFilter(item)}>{item}{item === 'Needs review' && dashboard?.summary.open_reviews ? <i>{dashboard.summary.open_reviews}</i> : null}</button>)}</div><span className="select-pill"><Filter size={14} /> Most recent</span></div>{visible.length ? <div className="journal-list full-journal">{visible.map((inspection) => <InspectionRow key={inspection.id} inspection={inspection} onClick={() => onOpen(inspection.id)} />)}</div> : <EmptyState icon={<ScanLine size={22} />} title={filter === 'Needs review' ? 'Your review queue is clear' : 'Your inspection journal is waiting'} text={filter === 'Needs review' ? 'When there are suggestions to review, they will appear here.' : 'Start an inspection and keep every observation connected to its place.'} action={<button className="button button-primary" onClick={() => onNew()}><Plus size={16} /> Start an inspection</button>} />}</motion.section>
}

function Review({ inspection: initial, modelReady, onBack, onRefresh, notify }: { inspection: Inspection; modelReady: boolean; onBack: () => void; onRefresh: () => Promise<void>; notify: (text: string, tone?: Toast['tone']) => void }) {
  const [inspection, setInspection] = useState(initial)
  const [selected, setSelected] = useState(0)
  const [activeFindingId, setActiveFindingId] = useState<number | null>(null)
  const [working, setWorking] = useState(false)
  const [drawing, setDrawing] = useState(false)
  const [correcting, setCorrecting] = useState(false)
  const [correctionType, setCorrectionType] = useState('')
  const [correctionNote, setCorrectionNote] = useState('')
  const [priorityOverride, setPriorityOverride] = useState('')
  const [priorityOverrideReason, setPriorityOverrideReason] = useState('')
  const [inspectorSeverity, setInspectorSeverity] = useState('')
  const [reviewHistory, setReviewHistory] = useState<FindingReviewEvent[]>([])
  const [drag, setDrag] = useState<{ x: number; y: number; width: number; height: number } | null>(null)
  const [startPoint, setStartPoint] = useState<{ x: number; y: number } | null>(null)
  const imageRef = useRef<HTMLDivElement>(null)
  useEffect(() => { setInspection(initial) }, [initial])
  const images = inspection.images
  const image = images[selected]
  const finding = image?.findings.find((item) => item.id === activeFindingId) || image?.findings[0]
  useEffect(() => { setActiveFindingId(null) }, [selected])
  useEffect(() => {
    let active = true
    if (finding) api.findingReviews(finding.id).then((rows) => { if (active) setReviewHistory(rows) }).catch(() => { if (active) setReviewHistory([]) })
    else setReviewHistory([])
    return () => { active = false }
  }, [finding?.id, finding?.status])
  const refreshLocal = async () => { const updated = await api.inspection(inspection.id); setInspection(updated); await onRefresh() }
  const review = async (status: string, defectType?: string, reviewerNote?: string) => {
    if (!finding) return
    setWorking(true)
    try { await api.reviewFinding(finding.id, { status, defect_type: defectType, reviewer_note: reviewerNote ?? finding.reviewer_note, ...(inspectorSeverity ? { inspector_severity: inspectorSeverity } : {}) }); await refreshLocal(); setCorrecting(false); notify(status === 'dismissed' ? 'Finding dismissed from the record.' : 'Your review has been saved.') }
    catch (reason) { notify(reason instanceof Error ? reason.message : 'Could not save this review.', 'error') }
    finally { setWorking(false) }
  }
  const analyze = async () => {
    if (!image) return
    setWorking(true)
    try { await api.analyze(image.id); await refreshLocal(); notify('Image analyzed. Review the suggestion and its reasons.') }
    catch (reason) { notify(reason instanceof Error ? reason.message : 'Analysis failed.', 'error') }
    finally { setWorking(false) }
  }
  const coords = (event: PointerEvent<HTMLDivElement>) => {
    const box = imageRef.current?.getBoundingClientRect()
    if (!box) return null
    return { x: Math.max(0, Math.min(1, (event.clientX - box.left) / box.width)), y: Math.max(0, Math.min(1, (event.clientY - box.top) / box.height)) }
  }
  const pointerDown = (event: PointerEvent<HTMLDivElement>) => { if (!drawing) return; event.currentTarget.setPointerCapture(event.pointerId); const point = coords(event); if (point) { setStartPoint(point); setDrag({ ...point, width: 0, height: 0 }) } }
  const pointerMove = (event: PointerEvent<HTMLDivElement>) => { if (!drawing || !startPoint) return; const point = coords(event); if (point) setDrag({ x: Math.min(startPoint.x, point.x), y: Math.min(startPoint.y, point.y), width: Math.abs(startPoint.x - point.x), height: Math.abs(startPoint.y - point.y) }) }
  const pointerUp = async () => {
    if (!drawing || !drag || drag.width < .015 || drag.height < .015) { setStartPoint(null); return }
    setWorking(true)
    try {
      const annotation = await api.annotate(image.id, { defect_type: 'Inspector observation', bbox: drag, reviewer_note: 'Region marked by inspector.' })
      setActiveFindingId(annotation.id)
      await refreshLocal(); notify('Inspector-marked region saved.'); setDrawing(false); setDrag(null)
    } catch (reason) { notify(reason instanceof Error ? reason.message : 'Could not save the region.', 'error') }
    finally { setWorking(false); setStartPoint(null) }
  }
  const generateReport = async () => {
    setWorking(true)
    try { const report = await api.createReport(inspection.id); const blob = await api.downloadReport(report.id); const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = `PropertyPulse-inspection-${inspection.id}.pdf`; link.click(); URL.revokeObjectURL(url); notify('Inspection report downloaded.') }
    catch (reason) { notify(reason instanceof Error ? reason.message : 'Could not generate report.', 'error') }
    finally { setWorking(false) }
  }
  const savePriorityOverride = async () => {
    if (!finding || priorityOverrideReason.trim().length < 5) { notify('Add a short reason for changing the priority.', 'error'); return }
    setWorking(true)
    try {
      await api.reviewFinding(finding.id, { status: finding.status, reviewer_note: finding.reviewer_note, priority_override: priorityOverride, priority_override_reason: priorityOverrideReason.trim(), ...(inspectorSeverity ? { inspector_severity: inspectorSeverity } : {}) })
      await refreshLocal()
      notify('Your priority override and reason are saved.')
    } catch (reason) { notify(reason instanceof Error ? reason.message : 'Could not save this priority override.', 'error') }
    finally { setWorking(false) }
  }
  const createFollowUp = async () => {
    if (!finding) return
    const due = new Date(); due.setDate(due.getDate() + 7)
    setWorking(true)
    try {
      await api.createTask({ property_id: inspection.property_id, inspection_id: inspection.id, finding_id: finding.id, title: `Review ${finding.defect_type.toLowerCase()} with a qualified professional`, description: finding.next_action || 'Record an on-site maintenance review and follow-up photo.', due_date: due.toISOString().slice(0, 10), priority: finding.priority === 'high' ? 'high' : finding.priority === 'low' ? 'low' : 'moderate' })
      notify('A maintenance follow-up linked to this finding was created.')
    } catch (reason) { notify(reason instanceof Error ? reason.message : 'Could not create the follow-up task.', 'error') }
    finally { setWorking(false) }
  }
  const displayedBox = drag || finding?.bbox
  return <motion.section className="page-content review-page" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}><button className="back-link" onClick={onBack}><ArrowLeft size={15} /> Inspection journal</button><div className="review-heading"><div><span className="eyebrow">INSPECTION · {formatDate(inspection.inspection_date).toUpperCase()}</span><h1>{inspection.area_label}</h1><p>{inspection.property_name} <span>·</span> {inspection.images.length} photo{inspection.images.length === 1 ? '' : 's'} <span>·</span> Evidence-led review</p></div><button className="button button-soft" onClick={generateReport} disabled={working}><Download size={16} /> Export report</button></div>
    {!images.length ? <EmptyState icon={<ImagePlus size={22} />} title="No photos in this inspection yet" text="Add another inspection to upload property photos and run visual screening." /> : <div className="review-layout"><div className="review-visual-column"><div className="review-image-stage"><div className="image-stage-top"><span><i className="live-dot" /> VISUAL EVIDENCE</span><button className={`annotate-toggle ${drawing ? 'annotating' : ''}`} onClick={() => { setDrawing(!drawing); setDrag(null) }}><Layers3 size={14} /> {drawing ? 'Drag to mark region' : 'Mark a region'}</button></div><div className={`inspection-image-wrap ${drawing ? 'drawing-enabled' : ''}`} ref={imageRef} onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={pointerUp}>{image && <img src={mediaUrl(image.url)} alt={image.filename} draggable={false} />}{displayedBox && <div className="finding-box" style={{ left: `${displayedBox.x * 100}%`, top: `${displayedBox.y * 100}%`, width: `${displayedBox.width * 100}%`, height: `${displayedBox.height * 100}%` }}><span>{finding?.defect_type || 'Inspector mark'}</span></div>}{drawing && <div className="draw-helper">Click and drag to outline a visible concern</div>}</div>{image?.quality_warnings && image.quality_warnings.length > 0 && <div className="quality-warning-banner"><AlertTriangle size={15} /><div><strong>Image Quality Notice:</strong> {image.quality_warnings.join(' ')}</div></div>}<div className="image-meta"><span>{image?.filename}</span><span>{image?.width} ? {image?.height}</span><span className={image?.is_sample ? 'sample-chip' : ''}>{image?.is_sample ? 'DEMO IMAGE' : 'YOUR PHOTO'}</span><span className={`quality-badge ${image?.quality_warnings && image.quality_warnings.length > 0 ? 'warn' : 'ok'}`}>{image?.quality_warnings && image.quality_warnings.length > 0 ? 'QUALITY ALERT' : 'QUALITY OK'}</span></div></div><div className="thumb-strip">{images.map((item, index) => <button key={item.id} className={`thumb-item ${selected === index ? 'thumb-active' : ''}`} onClick={() => setSelected(index)}><img src={mediaUrl(item.url)} alt="" /><span>{index + 1}</span>{item.findings.length > 0 && <i />}</button>)}<button className="thumb-add" onClick={() => notify('To add photos, create a new inspection with the same property and area.')}><Plus size={18} /></button></div><div className="evidence-note"><ShieldCheck size={16} /><span><b>Transparent Rule-Based Screening.</b> Model outputs are uncalibrated decision scores, not probabilities of risk or structural failure. Prioritization is deterministic and based on category, recurrence, and reported conditions. Inspector maintains final override authority.</span></div></div>
      <aside className="finding-column"><div className="finding-panel"><div className="finding-panel-heading"><div><span className="eyebrow">AI-ASSISTED SCREENING</span><h2>What we noticed</h2></div><span className="ai-orb"><Sparkles size={17} /></span></div>{(image?.findings.length || 0) > 1 && <div className="finding-selector">{image?.findings.map((item, index) => <button key={item.id} className={finding?.id === item.id ? 'finding-selected' : ''} onClick={() => setActiveFindingId(item.id)}><span>{index + 1}</span>{titleCase(item.defect_type)}{item.source_label === 'inspector_marked' && <i>INSPECTOR</i>}</button>)}</div>}{finding ? <><div className="finding-type-row"><div className="finding-type-icon"><Activity size={16} /></div><div><span>{finding.source_label === 'inspector_marked' ? 'INSPECTOR OBSERVATION' : 'VISIBLE PATTERN'}</span><b>{titleCase(finding.defect_type)}</b></div><span className={`priority-pill ${finding.priority}`}>{titleCase(finding.priority)}</span></div>{finding.confidence != null && <div className="confidence-row"><span>Uncalibrated match score</span><b>{Math.round(finding.confidence * 100)}%</b><div className="confidence-track"><i style={{ width: `${Math.round(finding.confidence * 100)}%` }} /></div></div>}{finding.prediction_alternatives && finding.prediction_alternatives.length > 1 && <div className="candidate-strip"><span>Other model candidates</span>{finding.prediction_alternatives.slice(1).map((candidate) => <i key={candidate.source_label}>{candidate.label} · {Math.round(candidate.score * 100)}%</i>)}</div>}<p className="finding-evidence">{finding.evidence_text || 'A visual pattern was identified in the image. Review the photo and context before deciding what to do.'}</p><div className="reason-box"><div><Sparkles size={14} /><b>Why this priority?</b></div>{finding.reason_codes.length ? finding.reason_codes.map((reason) => <span key={reason}><Check size={12} /> {reasonLabel(reason)}</span>) : <span><Check size={12} /> No additional risk context recorded</span>}</div>{finding.next_action && <p className="review-next-action"><b>Suggested next step:</b> {finding.next_action}</p>}{finding.priority_override && <p className="review-override-note">Inspector override · {titleCase(finding.priority_override)} · {finding.priority_override_reason}</p>}<details className="review-triage-override"><summary>Adjust suggested priority & severity</summary><div><label>Inspector severity assessment<select value={inspectorSeverity} onChange={(event) => setInspectorSeverity(event.target.value)}><option value="">Rule default (derived from defect & flags)</option><option value="low">Low severity</option><option value="moderate">Moderate severity</option><option value="high">High severity</option></select></label><label>Priority override<select value={priorityOverride || finding.priority} onChange={(event) => setPriorityOverride(event.target.value)}><option value="low">Low</option><option value="moderate">Moderate</option><option value="high">High</option></select></label><label>Reason<textarea rows={2} value={priorityOverrideReason} onChange={(event) => setPriorityOverrideReason(event.target.value)} placeholder="Explain the context behind this change" /></label><button className="button button-soft" onClick={() => void savePriorityOverride()} disabled={working || !priorityOverrideReason.trim()}>Save priority & severity</button></div></details><div className="human-review"><div className="human-avatar">YOU</div><div><b>Your review matters</b><span>Confirm, correct or dismiss this suggestion.</span></div></div><div className="review-actions"><button className="button button-primary" onClick={() => review('confirmed')} disabled={working || finding.status === 'confirmed'}><Check size={16} /> {finding.status === 'confirmed' ? 'Confirmed' : 'Confirm'}</button><button className="button button-outline" onClick={() => { setCorrectionType(finding.defect_type); setCorrectionNote(finding.reviewer_note || ''); setCorrecting((value) => !value) }} disabled={working}><Wrench size={15} /> Correct</button><button className="dismiss-button" onClick={() => review('dismissed')} disabled={working}>Dismiss</button></div>{['confirmed', 'corrected'].includes(finding.status) && <button className="button button-soft review-task-action" onClick={() => void createFollowUp()} disabled={working}><Wrench size={14} /> Create linked maintenance task</button>}{correcting && <div className="correction-panel"><label>Corrected finding<input value={correctionType} onChange={(event) => setCorrectionType(event.target.value)} /></label><label>Inspector note<textarea rows={2} value={correctionNote} onChange={(event) => setCorrectionNote(event.target.value)} placeholder="Add the context behind your correction…" /></label><div><button className="button button-soft" onClick={() => setCorrecting(false)}>Cancel</button><button className="button button-primary" onClick={() => { if (correctionType.trim()) void review('corrected', correctionType.trim(), correctionNote.trim()) }} disabled={working || !correctionType.trim()}><Check size={14} /> Save correction</button></div></div>}<div className="review-state"><span className={`state-dot ${finding.status === 'confirmed' ? 'state-ok' : finding.status === 'dismissed' ? 'state-muted' : ''}`} /> Record status · {titleCase(finding.status)}</div>{reviewHistory.length > 0 && <details className="review-audit-details"><summary>Review history · {reviewHistory.length}</summary>{reviewHistory.map((event) => <div key={event.id}><span>{formatDate(event.created_at)} · {titleCase(event.next_status)}</span>{event.previous_defect_type && event.previous_defect_type !== event.next_defect_type && <span>Changed from {event.previous_defect_type}</span>}{event.note && <p>{event.note}</p>}</div>)}</details>}</> : <div className="analysis-empty"><div className="analysis-empty-icon"><ScanLine size={23} /></div><h3>{image?.status === 'failed' ? 'Analysis paused' : 'Ready to take a closer look?'}</h3><p>We’ll compare visible image patterns against a focused building-defect model. You’ll see the match score and the reasons behind each maintenance priority.</p><button className="button button-dark full-width" onClick={analyze} disabled={working || !modelReady}><Sparkles size={16} /> {working ? 'Analyzing image…' : modelReady ? 'Analyze this image' : 'Model unavailable'}</button>{!modelReady && <span className="model-needed">Prepare the local classifier before image analysis is available.</span>}<span className="powered-note"><ShieldCheck size={13} /> Classification is separate from maintenance priority</span></div>}</div><div className="manual-note"><div className="manual-note-icon"><Layers3 size={15} /></div><div><b>Mark what you see</b><span>Draw a region on the photo to add an inspector-marked note.</span></div><button onClick={() => setDrawing(true)} aria-label="Mark region"><ArrowRight size={15} /></button></div></aside></div>}
  </motion.section>
}

function Insights({ dashboard, onOpen }: { dashboard: DashboardData | null; onOpen: (id: number) => void }) {
  const findings = dashboard?.recent_inspections.flatMap((inspection) => inspection.images.flatMap((image) => image.findings)) || []
  const distribution = ['high', 'moderate', 'low', 'needs_review'].map((priority) => ({ priority, count: findings.filter((finding) => finding.priority === priority && finding.status !== 'dismissed').length }))
  return <motion.section className="page-content" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}><PageIntro eyebrow="THE REASONS, IN VIEW" title="Useful context. Clear next steps." text="PropertyPulse separates visual pattern matching from maintenance priority, so every recommendation stays understandable." /><div className="insight-hero"><div className="insight-hero-copy"><span className="insight-kicker"><Sparkles size={14} /> A MORE THOUGHTFUL WAY TO CARE</span><h2>AI that makes<br />room for <em>your judgment.</em></h2><p>Image patterns can help surface what deserves attention. You stay in charge of what gets recorded and what happens next.</p><div className="insight-pills"><span><Check size={12} /> Explainable reasons</span><span><Check size={12} /> Human-reviewed records</span></div></div><div className="insight-visual"><div className="insight-ring ring-a" /><div className="insight-ring ring-b" /><div className="insight-core"><Sparkles size={26} /></div><div className="insight-node node-a"><Activity size={14} /></div><div className="insight-node node-b"><ShieldCheck size={14} /></div><div className="insight-node node-c"><Layers3 size={14} /></div><span className="visual-label label-a">IMAGE PATTERN</span><span className="visual-label label-b">CONTEXT</span><span className="visual-label label-c">YOUR REVIEW</span></div></div><div className="insights-cards"><div className="panel insight-metric"><span className="eyebrow">OPEN FINDINGS</span><strong>{dashboard?.summary.open_reviews || 0}</strong><p>Suggestions waiting for your decision.</p><div className="priority-bars">{distribution.map((item) => <div key={item.priority}><span>{titleCase(item.priority)}</span><i><b className={`bar-${item.priority}`} style={{ width: `${findings.length ? Math.max(4, item.count / findings.length * 100) : 4}%` }} /></i><b>{item.count}</b></div>)}</div></div><div className="panel insight-principles"><span className="eyebrow">OUR SCREENING PRINCIPLES</span><div className="principle"><div className="principle-icon green"><ScanLine size={17} /></div><div><b>Describe what’s visible</b><span>Image classification suggests a pattern, with a match score.</span></div></div><div className="principle"><div className="principle-icon peach"><Activity size={17} /></div><div><b>Explain why it matters</b><span>Priority uses clear maintenance context and repeat observations.</span></div></div><div className="principle"><div className="principle-icon lavender"><ShieldCheck size={17} /></div><div><b>Keep you in the loop</b><span>Confirm, correct or dismiss each suggestion before it becomes a record.</span></div></div></div><div className="panel model-card"><div className="model-card-top"><div className="model-icon"><Sparkles size={17} /></div><span className={`model-status ${dashboard?.model.ready ? '' : 'offline'}`}><i /> {dashboard?.model.ready ? 'MODEL READY' : 'MODEL OFFLINE'}</span></div><h3>{dashboard?.model.model_name || 'Building defect classifier'}</h3><p>Local image model ? {dashboard?.model.classes.length || 0} visual classes</p><div className="model-separator" /><div className="model-stat-row"><span>Holdout accuracy</span><b>{dashboard?.model.metrics?.holdout_accuracy != null ? `${(dashboard.model.metrics.holdout_accuracy * 100).toFixed(1)}%` : '43.6%'}</b></div><div className="model-stat-row"><span>Macro F1 score</span><b>{dashboard?.model.metrics?.holdout_macro_f1 != null ? `${(dashboard.model.metrics.holdout_macro_f1 * 100).toFixed(1)}%` : '42.5%'}</b></div><div className="model-stat-row"><span>Holdout test samples</span><b>{dashboard?.model.metrics?.holdout_size || 635}</b></div><div className="model-stat-row"><span>Classes</span><b>{dashboard?.model.classes.length || 0}</b></div><span className="model-disclaimer">Scores are uncalibrated decision boundary margins; not structural probabilities.</span></div></div><ModelTransparencyDashboard model={dashboard?.model} /><div className="insight-recent"><div className="section-heading"><div><span className="eyebrow">RECENT SIGNALS</span><h2>Keep the context close</h2></div></div>{findings.length ? dashboard?.recent_inspections.filter((inspection) => inspection.finding_count > 0).slice(0, 4).map((inspection) => <button className="signal-row" key={inspection.id} onClick={() => onOpen(inspection.id)}><div className="signal-icon"><Activity size={15} /></div><div><b>{inspection.area_label}</b><span>{inspection.property_name} · {inspection.finding_count} observation{inspection.finding_count === 1 ? '' : 's'}</span></div><span className="signal-date">{formatDate(inspection.inspection_date)}</span><ArrowRight size={15} /></button>) : <EmptyState icon={<Activity size={21} />} title="Signals appear as you inspect" text="Run an image screening to understand visible patterns in context." />}</div></motion.section>
}

function ClassMetrics({ model }: { model?: DashboardData['model'] }) {
  const report = model?.metrics?.class_report
  if (!model || !report) return null
  return <details className="class-metric-details"><summary>Class-by-class holdout results</summary><div>{model.classes.map((label) => {
    const item = report[label]
    if (!item) return null
    return <span key={label}><b>{titleCase(label)}</b><i>Precision {Math.round((item.precision || 0) * 100)}%</i><i>Recall {Math.round((item.recall || 0) * 100)}%</i><i>F1 {Math.round((item['f1-score'] || 0) * 100)}%</i></span>
  })}</div><small>Measured on the saved held-out dataset split only. These results are not a guarantee for real properties.</small></details>
}

function Reports({ dashboard, onOpen, notify }: { dashboard: DashboardData | null; onOpen: (id: number) => void; notify: (text: string, tone?: Toast['tone']) => void }) {
  const [busyId, setBusyId] = useState<number | null>(null)
  const inspections = dashboard?.recent_inspections || []
  const download = async (inspection: Inspection) => {
    setBusyId(inspection.id)
    try { const report = await api.createReport(inspection.id); const file = await api.downloadReport(report.id); const url = URL.createObjectURL(file); const anchor = document.createElement('a'); anchor.href = url; anchor.download = `PropertyPulse-${inspection.area_label.replaceAll(' ', '-')}-${inspection.id}.pdf`; anchor.click(); URL.revokeObjectURL(url); notify('Your inspection report is ready.') }
    catch (reason) { notify(reason instanceof Error ? reason.message : 'Could not create report.', 'error') }
    finally { setBusyId(null) }
  }
  return <motion.section className="page-content" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}><PageIntro eyebrow="SHAREABLE PROPERTY RECORDS" title="Thoughtful reports, ready when you are." text="Download a concise record of the inspection, visible findings, review decisions and maintenance context." /><div className="reports-feature"><div className="report-cover"><div className="report-paper"><div className="paper-logo"><Activity size={13} /> PROPERTY<span>PULSE</span></div><div className="paper-lines"><i /><i /><i /><i /></div><div className="paper-picture"><span>VISUAL EVIDENCE</span><Activity size={20} /></div><div className="paper-foot"><span>INSPECTION SUMMARY</span><b>01 / 04</b></div></div><div className="report-stamp"><FileText size={16} /><span>PDF<br />REPORT</span></div></div><div className="reports-feature-copy"><span className="eyebrow">MADE FOR THE NEXT DECISION</span><h2>Evidence and context,<br /><em>in one place.</em></h2><p>Each report includes the property and inspection details, image observations, explainable priority reasons, and your review status.</p><div className="report-checks"><span><Check size={14} /> Image and date record</span><span><Check size={14} /> Finding and review state</span><span><Check size={14} /> Professional screening note</span></div></div></div><div className="section-block report-list-block"><div className="section-heading"><div><span className="eyebrow">INSPECTION RECORDS</span><h2>Generate a report</h2></div><span className="report-count">{inspections.length} available</span></div>{inspections.length ? <div className="report-list">{inspections.map((inspection) => <div className="report-row" key={inspection.id}><div className="report-file-icon"><FileText size={18} /></div><div className="report-row-main"><b>{inspection.property_name} <span>/</span> {inspection.area_label}</b><span>{formatDate(inspection.inspection_date)} · {inspection.finding_count} finding{inspection.finding_count === 1 ? '' : 's'} · {inspection.images.length} photo{inspection.images.length === 1 ? '' : 's'}</span></div><button className="button button-outline" onClick={() => download(inspection)} disabled={busyId === inspection.id}>{busyId === inspection.id ? <span className="mini-spinner" /> : <Download size={15} />}{busyId === inspection.id ? 'Preparing…' : 'Download PDF'}</button><button className="icon-button row-chevron" onClick={() => onOpen(inspection.id)} aria-label="Open inspection"><ChevronRight size={17} /></button></div>)}</div> : <EmptyState icon={<FileText size={22} />} title="Reports follow your inspections" text="Once you have an inspection record, its clear, shareable summary can be generated here." />}</div><div className="report-footnote"><ShieldCheck size={15} /><span>Reports summarize visual screening and inspector review. They are not structural-safety certifications or engineering diagnoses.</span></div></motion.section>
}

function Settings({ user, model, notify, onProfileUpdated }: { user: User | null; model?: DashboardData['model']; notify: (text: string, tone?: Toast['tone']) => void; onProfileUpdated: (user: User) => void }) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(user?.name || '')
  const [saving, setSaving] = useState(false)
  const saveProfile = async () => {
    if (name.trim().length < 2) { notify('Enter a name with at least 2 characters.', 'error'); return }
    setSaving(true)
    try { const updated = await api.updateProfile(name.trim()); onProfileUpdated(updated); setEditing(false); notify('Profile name updated.') }
    catch (reason) { notify(reason instanceof Error ? reason.message : 'Could not update your profile.', 'error') }
    finally { setSaving(false) }
  }
  return <motion.section className="page-content" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}><PageIntro eyebrow="YOUR WORKSPACE" title="A few things about your setup." text="Manage your profile, understand the screening model and see where your records live." /><div className="settings-layout"><div className="settings-main"><div className="panel settings-panel"><div className="settings-panel-heading"><div><span className="eyebrow">PROFILE</span><h2>Workspace profile</h2></div><div className="settings-user-avatar">{initials(user?.name || 'Sagar')}</div></div><div className="settings-fields"><div><span>NAME</span><b>{user?.name || 'Workspace user'}</b></div><div><span>EMAIL</span><b>{user?.email || 'Not available'}</b></div><div><span>WORKSPACE</span><b>Propcare NW · Personal</b></div></div>{editing ? <div className="profile-edit-row"><label>Update your name<input value={name} onChange={(event) => setName(event.target.value)} autoFocus /></label><button className="button button-soft" onClick={() => { setName(user?.name || ''); setEditing(false) }} disabled={saving}>Cancel</button><button className="button button-primary" onClick={saveProfile} disabled={saving}>{saving ? 'Saving…' : 'Save profile'}</button></div> : <button className="button button-soft" onClick={() => setEditing(true)}>Edit profile <ArrowRight size={14} /></button>}</div><div className="panel settings-panel"><div className="settings-panel-heading"><div><span className="eyebrow">IMAGE SCREENING</span><h2>Model and data</h2></div><span className={`model-status ${model?.ready ? '' : 'offline'}`}><i /> {model?.ready ? 'READY' : 'OFFLINE'}</span></div><p className="settings-copy">The local classifier looks for broad visual patterns associated with common building defects. Its output is a suggestion for human review.</p><div className="class-chips">{model?.classes.map((label) => <span key={label}>{titleCase(label)}</span>) || <span>Model is being prepared</span>}</div><ClassMetrics model={model} /><div className="settings-warning"><ShieldCheck size={16} /><span><b>Designed for maintenance screening.</b> It does not certify structural safety, estimate repair cost, or replace an on-site qualified professional.</span></div></div></div><aside className="settings-side"><div className="settings-side-icon"><Activity size={19} /></div><span className="eyebrow">DATA AND PRIVACY</span><h3>Your evidence stays yours.</h3><p>Images, findings and inspection notes are stored in your local PropertyPulse workspace.</p><div className="privacy-row"><CheckCircle2 size={15} /><span>Account-scoped records</span></div><div className="privacy-row"><CheckCircle2 size={15} /><span>Local inference path</span></div><div className="privacy-row"><CheckCircle2 size={15} /><span>Exportable PDF reports</span></div><button className="text-button" onClick={() => notify('This demo stores data locally in the project backend.')}>Learn about data handling <ArrowRight size={14} /></button></aside></div></motion.section>
}

function PropertyModal({ initial, onClose, onCreated, notify }: { initial: PropertyRecord | null; onClose: () => void; onCreated: (property: PropertyRecord) => void; notify: (text: string, tone?: Toast['tone']) => void }) {
  const [name, setName] = useState(initial?.name || '')
  const [kind, setKind] = useState(initial?.property_type || 'Detached home')
  const [location, setLocation] = useState(initial?.location_label || '')
  const [age, setAge] = useState(initial?.age_band || '0–10 years')
  const [saving, setSaving] = useState(false)
  const submit = async (event: FormEvent) => { event.preventDefault(); setSaving(true); try { const payload = { name: name.trim(), property_type: kind, location_label: location.trim(), age_band: age, notes: initial?.notes || null, cover_image_url: initial?.cover_image_url || null }; const property = initial ? await api.updateProperty(initial.id, payload) : await api.createProperty(payload); onCreated(property) } catch (reason) { notify(reason instanceof Error ? reason.message : 'Could not save property.', 'error') } finally { setSaving(false) } }
  return <ModalShell title={initial ? 'Edit property details' : 'Add a property'} subtitle={initial ? 'Keep this property record current.' : 'Give this place a home in your portfolio.'} onClose={onClose} icon={<Building2 size={18} />}><form className="modal-form" onSubmit={submit}><label>Property name<input autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Willow & Stone Residence" minLength={2} required /></label><div className="form-two"><label>Property type<select value={kind} onChange={(event) => setKind(event.target.value)}>{['Detached home', 'Apartment', 'Townhouse', 'Condominium', 'Commercial', 'Other'].map((item) => <option key={item}>{item}</option>)}</select></label><label>Approximate age<select value={age} onChange={(event) => setAge(event.target.value)}>{['0–10 years', '10–20 years', '20–40 years', '40+ years', 'Not sure'].map((item) => <option key={item}>{item}</option>)}</select></label></div><label>Location<input value={location} onChange={(event) => setLocation(event.target.value)} placeholder="Neighborhood or city" /></label><div className="modal-actions"><button type="button" className="button button-soft" onClick={onClose}>Cancel</button><button className="button button-primary" disabled={saving || name.trim().length < 2}>{saving ? <span className="mini-spinner" /> : initial ? <Check size={16} /> : <Plus size={16} />}{saving ? 'Saving…' : initial ? 'Save changes' : 'Add property'}</button></div></form></ModalShell>
}

function InspectionModal({ properties, initialProperty, initialArea, onClose, onCreated, notify }: { properties: PropertyRecord[]; initialProperty: PropertyRecord | null; initialArea: string; onClose: () => void; onCreated: (inspection: Inspection) => void; notify: (text: string, tone?: Toast['tone']) => void }) {
  const [step, setStep] = useState(1)
  const [propertyId, setPropertyId] = useState<number>(initialProperty?.id || properties[0]?.id || 0)
  const [area, setArea] = useState(initialArea || 'Living room')
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [notes, setNotes] = useState('')
  const [flags, setFlags] = useState<string[]>([])
  const [files, setFiles] = useState<File[]>([])
  const [samples, setSamples] = useState<DemoSample[]>([])
  const [selectedSamples, setSelectedSamples] = useState<string[]>([])
  const [loadingSamples, setLoadingSamples] = useState(false)
  const [saving, setSaving] = useState(false)
  const [draggingFiles, setDraggingFiles] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)
  useEffect(() => { if (step === 2) { setLoadingSamples(true); api.samples().then(setSamples).catch(() => setSamples([])).finally(() => setLoadingSamples(false)) } }, [step])
  const contextOptions = [{ key: 'active_moisture', label: 'Active moisture present' }, { key: 'worsening', label: 'Appears to be worsening' }, { key: 'recurring_issue', label: 'Seen before' }, { key: 'near_plumbing', label: 'Near plumbing' }]
  const toggleFlag = (flag: string) => setFlags((items) => items.includes(flag) ? items.filter((item) => item !== flag) : [...items, flag])
  const appendFiles = (incoming: File[]) => {
    const supportedTypes = ['image/jpeg', 'image/png', 'image/webp']
    const invalidFormat = incoming.filter((file) => !supportedTypes.includes(file.type))
    if (invalidFormat.length > 0) {
      notify(`Unsupported format in ${invalidFormat.length} file(s). Only JPG, PNG, and WebP are accepted.`, 'error')
    }
    const oversized = incoming.filter((file) => file.size > 15 * 1024 * 1024)
    if (oversized.length > 0) {
      notify(`${oversized.length} image(s) exceed 15 MB limit and were skipped.`, 'error')
    }
    const images = incoming.filter((file) => supportedTypes.includes(file.type) && file.size <= 15 * 1024 * 1024)
    const room = Math.max(0, 8 - files.length - selectedSamples.length)
    if (images.length > room) notify(`An inspection can contain up to 8 images. ${room} more can be added.`, 'error')
    setFiles((items) => [...items, ...images.slice(0, room)])
  }
  const addFiles = (event: ChangeEvent<HTMLInputElement>) => { appendFiles(Array.from(event.target.files || [])); event.target.value = '' }
  const dropFiles = (event: DragEvent<HTMLButtonElement>) => { event.preventDefault(); setDraggingFiles(false); appendFiles(Array.from(event.dataTransfer.files)) }
  const toggleSample = (id: string) => setSelectedSamples((items) => {
    if (items.includes(id)) return items.filter((item) => item !== id)
    if (files.length + items.length >= 8) { notify('An inspection can contain up to 8 images.', 'error'); return items }
    return [...items, id]
  })
  const create = async () => {
    if (!propertyId) { notify('Add a property before starting an inspection.', 'error'); return }
    if (!files.length && !selectedSamples.length) { notify('Add at least one photo or sample image to continue.', 'error'); return }
    setSaving(true)
    let created: Inspection | null = null
    try {
      created = await api.createInspection(propertyId, { area_label: area.trim(), inspection_date: date, notes: notes.trim() || null, context_flags: flags })
      const uploaded = await Promise.all(files.map((file) => api.upload(created!.id, file)))
      const addedSamples = await Promise.all(selectedSamples.map((id) => api.addSample(created!.id, id)))
      const allImages = [...uploaded, ...addedSamples]
      await Promise.all(allImages.map((item) => api.analyze(item.id)))
      const full = await api.inspection(created.id)
      onCreated(full)
    } catch (reason) {
      if (created) {
        try { const full = await api.inspection(created.id); onCreated(full); notify(reason instanceof Error ? `${reason.message} Your inspection has been saved; retry analysis from the review screen.` : 'Your inspection has been saved; retry analysis from the review screen.', 'error') }
        catch { notify(reason instanceof Error ? reason.message : 'Could not complete this inspection.', 'error') }
      } else notify(reason instanceof Error ? reason.message : 'Could not create inspection.', 'error')
    } finally { setSaving(false) }
  }
  const totalSelected = files.length + selectedSamples.length
  return <ModalShell title={step === 1 ? 'Start an inspection' : 'Add visual evidence'} subtitle={step === 1 ? 'A few details help put each image in the right context.' : 'Use your own photos or explore the sample image library.'} onClose={onClose} icon={<ScanLine size={18} />} wide><div className="wizard-progress"><div className={step >= 1 ? 'step-done' : ''}><i>{step > 1 ? <Check size={12} /> : '01'}</i><span>Inspection details</span></div><b /><div className={step >= 2 ? 'step-done' : ''}><i>02</i><span>Photo evidence</span></div></div>{step === 1 ? <div className="modal-form"><label>Property<select value={propertyId} onChange={(event) => setPropertyId(Number(event.target.value))}>{properties.map((property) => <option key={property.id} value={property.id}>{property.name}</option>)}</select></label>{!properties.length && <div className="inline-warning">Add a property before creating an inspection.</div>}<div className="form-two"><label>Area or room<input value={area} onChange={(event) => setArea(event.target.value)} placeholder="e.g. Upstairs bathroom" required /></label><label>Inspection date<input type="date" value={date} onChange={(event) => setDate(event.target.value)} required /></label></div><label>Things to keep in mind <span className="label-muted">(optional context)</span></label><div className="choice-chips">{contextOptions.map(({ key, label }) => <button type="button" key={key} className={flags.includes(key) ? 'choice-selected' : ''} onClick={() => toggleFlag(key)}>{flags.includes(key) && <Check size={12} />}{label}</button>)}</div><label>Notes<textarea value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Anything else you want to remember…" rows={3} /></label><div className="modal-actions"><button className="button button-soft" type="button" onClick={onClose}>Cancel</button><button className="button button-primary" type="button" onClick={() => { if (area.trim().length < 2) notify('Add an area name to continue.', 'error'); else setStep(2) }} disabled={!properties.length}>Continue <ArrowRight size={16} /></button></div></div> : <div className="modal-form evidence-form"><input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={addFiles} /><button type="button" className={`upload-zone ${draggingFiles ? 'upload-dragging' : ''}`} onDragOver={(event) => { event.preventDefault(); setDraggingFiles(true) }} onDragLeave={() => setDraggingFiles(false)} onDrop={dropFiles} onClick={() => fileInput.current?.click()}><span className="upload-icon"><CloudUpload size={21} /></span><b>Drop in your property photos</b><span>JPG, PNG or WebP · up to 15 MB each · choose up to 8</span><span className="button button-outline"><Upload size={14} /> Browse photos</span></button>{files.length > 0 && <div className="selected-files">{files.map((file, index) => <div key={`${file.name}-${index}`}><ImagePlus size={14} /><span>{file.name}</span><button type="button" onClick={() => setFiles((items) => items.filter((_, fileIndex) => fileIndex !== index))}><X size={14} /></button></div>)}</div>}<div className="sample-heading"><span>OR TRY THE SAMPLE LIBRARY</span><i /></div>{loadingSamples ? <LoadingLine /> : samples.length ? <div className="sample-grid">{samples.map((sample) => <button type="button" key={sample.id} className={`sample-card ${selectedSamples.includes(sample.id) ? 'sample-selected' : ''}`} onClick={() => toggleSample(sample.id)}><img src={mediaUrl(sample.url)} alt={sample.label} /><span>{sample.label}</span><i>{selectedSamples.includes(sample.id) && <Check size={13} />}</i></button>)}</div> : <div className="sample-unavailable">Sample image library becomes available after the local model dataset is prepared.</div>}<div className="selection-summary"><span><ImagePlus size={15} /> {totalSelected} image{totalSelected === 1 ? '' : 's'} selected</span><span>Maximum 8 images</span></div><div className="modal-actions"><button className="button button-soft" onClick={() => setStep(1)} disabled={saving}><ArrowLeft size={15} /> Back</button><button className="button button-primary" onClick={create} disabled={saving || totalSelected === 0}>{saving ? <span className="mini-spinner" /> : <Sparkles size={16} />}{saving ? 'Analyzing photos…' : 'Create & analyze'} <ArrowRight size={15} /></button></div><div className="modal-safe-note"><ShieldCheck size={14} /> Your photos are stored with this inspection. Sample images are clearly labelled in every record.</div></div>}</ModalShell>
}

function ModalShell({ children, title, subtitle, icon, onClose, wide }: { children: ReactNode; title: string; subtitle: string; icon: ReactNode; onClose: () => void; wide?: boolean }) {
  useEffect(() => { const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }; window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey) }, [onClose])
  return <motion.div className="modal-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}><motion.div className={`modal-card ${wide ? 'modal-wide' : ''}`} initial={{ opacity: 0, y: 24, scale: .97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 15, scale: .98 }} transition={{ type: 'spring', stiffness: 300, damping: 28 }}><div className="modal-heading"><div className="modal-heading-icon">{icon}</div><div><h2>{title}</h2><p>{subtitle}</p></div><button className="icon-button" onClick={onClose} aria-label="Close dialog"><X size={18} /></button></div>{children}</motion.div></motion.div>
}

function EmptyState({ icon, title, text, action }: { icon: ReactNode; title: string; text: string; action?: ReactNode }) {
  return <div className="empty-state"><div className="empty-state-icon">{icon}</div><h3>{title}</h3><p>{text}</p>{action}</div>
}

function LoadingLine() { return <div className="loading-line"><i /><span>Loading records…</span></div> }

export default App
