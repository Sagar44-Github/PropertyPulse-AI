import {
 useEffect, useMemo, useState, type ChangeEvent } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  AlertTriangle, ArrowDownToLine, ArrowLeft, ArrowRight, Check, CheckCircle2, CircleAlert,
  Clock3, FileText, ImagePlus, LoaderCircle, RotateCcw, ShieldCheck, Sparkles,
  Upload, UserRoundCheck, Wrench,
} from 'lucide-react'
import { api, mediaUrl } from '../lib/api'
import type { DemoSample, Finding, GuidedCase as GuidedCaseRecord, Inspection, MaintenanceTask, TrendState } from '../lib/types'
import './WorkspaceFeatures.css'

type Props = {
  notify: (message: string, tone?: 'success' | 'error') => void
  onWorkspaceRefresh: () => Promise<void>
  onOpenMaintenance: () => void
}

const steps = [
  { title: 'Screen evidence', short: 'Screen' },
  { title: 'Review & triage', short: 'Review' },
  { title: 'Compare history', short: 'Compare' },
  { title: 'Plan follow-up', short: 'Follow-up' },
  { title: 'Share report', short: 'Report' },
]

const titleCase = (value: string) => value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
const displayDate = (value?: string | null) => value ? new Date(value).toLocaleDateString('en', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Date unavailable'

function findingsOf(inspection?: Inspection | null): Finding[] {
  return inspection?.images.flatMap((image) => image.findings) || []
}

function reviewedCategory(finding: Finding) {
  return finding.status === 'corrected' && finding.origin !== 'demo_seed'
    ? finding.defect_type.toLocaleLowerCase().replaceAll('_', ' ').trim()
    : (finding.source_label || finding.defect_type.toLocaleLowerCase()).replaceAll('_', ' ').trim()
}

function downloadPdf(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = name
  anchor.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1500)
}

export default function GuidedCase({ notify, onWorkspaceRefresh, onOpenMaintenance }: Props) {
  const [caseData, setCaseData] = useState<GuidedCaseRecord | null>(null)
  const [samples, setSamples] = useState<DemoSample[]>([])
  const [modelReady, setModelReady] = useState(false)
  const [step, setStep] = useState(0)
  const [busy, setBusy] = useState(true)
  const [working, setWorking] = useState(false)
  const [error, setError] = useState('')
  const [sampleId, setSampleId] = useState('stain')
  const [reviewNote, setReviewNote] = useState('')
  const [overridePriority, setOverridePriority] = useState('')
  const [overrideReason, setOverrideReason] = useState('')
  const [trendState, setTrendState] = useState<TrendState>('recurring')
  const [trendNote, setTrendNote] = useState('Same bathroom area, reviewed by the inspector. The sample images are illustrative, not matched property photographs.')
  const [task, setTask] = useState<MaintenanceTask | null>(null)
  const [taskOwner, setTaskOwner] = useState('Demo property manager')
  const [taskDueDate, setTaskDueDate] = useState(() => {
    const date = new Date()
    date.setDate(date.getDate() + 7)
    return date.toISOString().slice(0, 10)
  })
  const [reportReady, setReportReady] = useState(false)

  const hydrate = async () => {
    const [record, availableSamples, model] = await Promise.all([api.guidedCase(), api.samples(), api.model()])
    setCaseData(record)
    setSamples(availableSamples)
    setModelReady(model.ready)
    const defaultSample = availableSamples.find((sample) => sample.id === 'stain') || availableSamples[0]
    if (defaultSample) setSampleId((selected) => availableSamples.some((sample) => sample.id === selected) ? selected : defaultSample.id)
    const existingTask = record.tasks.find((item) => item.inspection_id === record.current_inspection_id) || record.tasks[0] || null
    setTask(existingTask)
    if (record.current_inspection_id) {
      const current = record.inspections.find((item) => item.id === record.current_inspection_id)
      const currentFinding = findingsOf(current)[0]
      if (currentFinding) {
        const existingTrend = record.trends.find((item) => item.current_finding_id === currentFinding.id)
        if (existingTrend) setTrendState(existingTrend.trend_state)
      }
    }
    return record
  }

  useEffect(() => {
    let active = true
    void hydrate().catch((reason) => {
      if (active) setError(reason instanceof Error ? reason.message : 'Could not open the guided case.')
    }).finally(() => { if (active) setBusy(false) })
    return () => { active = false }
  }, [])

  const currentInspection = useMemo(() => caseData?.inspections.find((item) => item.id === caseData.current_inspection_id) || null, [caseData])
  const previousInspection = useMemo(() => caseData?.inspections.find((item) => item.id === caseData.previous_inspection_id) || null, [caseData])
  const currentFinding = findingsOf(currentInspection)[0] || null
  const previousFinding = findingsOf(previousInspection).find((finding) => ['confirmed', 'corrected'].includes(finding.status)) || findingsOf(previousInspection)[0] || null
  const sameCategory = !!currentFinding && !!previousFinding && reviewedCategory(currentFinding) === reviewedCategory(previousFinding)
  const currentImage = currentInspection?.images.find((image) => image.findings.some((finding) => finding.id === currentFinding?.id)) || currentInspection?.images[0] || null
  const previousImage = previousInspection?.images.find((image) => image.findings.some((finding) => finding.id === previousFinding?.id)) || previousInspection?.images[0] || null
  const currentTrend = caseData?.trends.find((item) => item.current_finding_id === currentFinding?.id) || null
  const reviewed = !!currentFinding && ['confirmed', 'corrected'].includes(currentFinding.status)
  const taskDone = !!task
  const maxStep = !currentFinding ? 0 : !reviewed ? 1 : !currentTrend ? 2 : !taskDone ? 3 : 4
  useEffect(() => {
    if (currentFinding && previousFinding && !sameCategory && !currentTrend) setTrendState('unable_to_compare')
  }, [currentFinding?.id, previousFinding?.id, sameCategory, currentTrend?.id])
  const reasonLabels: Record<string, string> = {
    visible_surface_finding: 'Visible surface pattern was recorded',
    surface_condition_class: 'Surface-pattern class uses a maintenance review rule',
    repeat_observation: 'A similar reviewed finding exists in this area',
    recurrence_escalated: 'Repeated occurrence across multiple inspections raises urgency',
    active_moisture_reported: 'Active moisture was reported in this scenario',
    user_reports_worsening: 'Inspector reported that the condition appears to be worsening',
    inspector_severity_high: 'Inspector assessed high-severity condition',
    unresolved_open_task: 'Unresolved maintenance task already open for this property',
    low_model_confidence: 'Model score is low; a human review is needed',
    image_quality_blurry: 'Low image sharpness detected; human review needed',
    image_quality_poor_lighting: 'Poor illumination; details may be obscured',
    image_quality_overexposed: 'Image overexposed; glare may wash out details',
    large_inspector_marked_region: 'Inspector-marked region covers substantial area',
    maintenance_review_only: 'Guidance is for maintenance review only (no failure prediction)',
    no_supported_defect_detected: 'No supported defect pattern was detected',
    fictional_demo_history: 'Seeded fictional history record',
  }

  const reload = async () => {
    const record = await hydrate()
    await onWorkspaceRefresh()
    return record
  }

  const chooseSample = (event: ChangeEvent<HTMLSelectElement>) => setSampleId(event.target.value)

  const analyzeSample = async () => {
    if (!caseData?.current_inspection_id || !sampleId) return
    setWorking(true)
    setError('')
    try {
      const image = await api.addSample(caseData.current_inspection_id, sampleId)
      await api.analyze(image.id)
      await reload()
      setStep(1)
      notify('The current photo was analyzed with the available local model.')
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : 'Could not analyze this sample.'
      setError(message)
      notify(message, 'error')
    } finally { setWorking(false) }
  }

  const analyzeSavedImage = async (imageId: number) => {
    setWorking(true)
    setError('')
    try {
      await api.analyze(imageId)
      await reload()
      setStep(1)
      notify('The saved current photo was analyzed with the available local model.')
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : 'Could not analyze this saved photo.'
      setError(message)
      notify(message, 'error')
    } finally { setWorking(false) }
  }

  const uploadAndAnalyze = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file || !caseData?.current_inspection_id) return
    
    // Validate image format
    const validFormats = ['image/jpeg', 'image/png', 'image/webp']
    if (!validFormats.includes(file.type)) {
      setError('Invalid format: Only JPG, PNG, and WebP images are supported.')
      notify('Invalid image format', 'error')
      return
    }
    // Validate file size (max 15MB)
    if (file.size > 15 * 1024 * 1024) {
      setError('File too large: Images must be under 15 MB.')
      notify('Image exceeds 15 MB limit', 'error')
      return
    }

    setWorking(true)
    setError('')
    try {
      // Validate dimensions
      await new Promise<void>((resolve, reject) => {
        const testImg = new Image()
        testImg.onload = () => {
          if (testImg.width < 256 || testImg.height < 256) {
            reject(new Error(`Image dimensions (${testImg.width}?${testImg.height}) are too small. Minimum resolution is 256?256 pixels.`))
          } else {
            resolve()
          }
        }
        testImg.onerror = () => reject(new Error('Unable to read image dimensions.'))
        testImg.src = URL.createObjectURL(file)
      })

      const image = await api.upload(caseData.current_inspection_id, file)
      if (image.quality_warnings && image.quality_warnings.length > 0) {
        notify(`Quality warning: ${image.quality_warnings[0]}`, 'error')
      }
      await api.analyze(image.id)
      await reload()
      setStep(1)
      notify('Your photo was saved and analyzed.')
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : 'Could not analyze this photo.'
      setError(message)
      notify(message, 'error')
    } finally { setWorking(false) }
  }

  const saveReview = async (status: 'confirmed' | 'dismissed') => {
    if (!currentFinding) return
    if (overridePriority && overrideReason.trim().length < 5) {
      setError('Add a short reason for changing the suggested priority.')
      return
    }
    setWorking(true)
    try {
      await api.reviewFinding(currentFinding.id, {
        status,
        reviewer_note: reviewNote.trim() || currentFinding.reviewer_note,
        ...(overridePriority ? { priority_override: overridePriority, priority_override_reason: overrideReason.trim() } : {}),
      })
      await reload()
      if (status === 'confirmed') setStep(2)
      notify(status === 'dismissed' ? 'The suggestion was dismissed with your review recorded. Dismissed items are excluded from issue comparison.' : 'Your review and triage are saved.')
    } catch (reason) { notify(reason instanceof Error ? reason.message : 'Could not save your review.', 'error') }
    finally { setWorking(false) }
  }

  const saveTrend = async () => {
    if (!currentFinding || !previousFinding) return
    setWorking(true)
    try {
      await api.recordTrend(currentFinding.id, {
        previous_finding_id: previousFinding.id,
        trend_state: trendState,
        note: trendNote.trim() || null,
      })
      await reload()
      setStep(3)
      notify('Your comparison status is saved and attributed to the inspector.')
    } catch (reason) { notify(reason instanceof Error ? reason.message : 'Could not save this comparison.', 'error') }
    finally { setWorking(false) }
  }

  const createFollowUp = async () => {
    if (!caseData?.property.id || !caseData.current_inspection_id) return
    setWorking(true)
    try {
      const created = await api.createTask({
        property_id: caseData.property.id,
        inspection_id: caseData.current_inspection_id,
        finding_id: currentFinding?.id,
        title: 'Arrange an on-site review of the bathroom ceiling',
        description: currentFinding?.next_action || 'Review the visible area on site and record a dated follow-up photo.',
        assignee: taskOwner.trim() || null,
        due_date: taskDueDate || null,
        priority: currentFinding?.priority === 'high' ? 'high' : currentFinding?.priority === 'low' ? 'low' : 'moderate',
      })
      setTask(created)
      await reload()
      setStep(4)
      notify('Follow-up task saved to the maintenance queue.')
    } catch (reason) { notify(reason instanceof Error ? reason.message : 'Could not create the follow-up task.', 'error') }
    finally { setWorking(false) }
  }

  const setTaskStatus = async (status: MaintenanceTask['status']) => {
    if (!task) return
    setWorking(true)
    try { setTask(await api.updateTask(task.id, { status })); await reload(); notify('Follow-up status updated.') }
    catch (reason) { notify(reason instanceof Error ? reason.message : 'Could not update the task.', 'error') }
    finally { setWorking(false) }
  }

  const createReport = async () => {
    if (!caseData?.current_inspection_id) return
    setWorking(true)
    try {
      const report = await api.createReport(caseData.current_inspection_id)
      const file = await api.downloadReport(report.id)
      downloadPdf(file, 'PropertyPulse-Willow-Court-Inspection.pdf')
      setReportReady(true)
      notify('The case report was generated and downloaded.')
    } catch (reason) { notify(reason instanceof Error ? reason.message : 'Could not generate the PDF.', 'error') }
    finally { setWorking(false) }
  }

  const restartCase = async () => {
    if (!window.confirm('Restart the fictional guided case? Only this guided case, its images, reports, trends and tasks will be cleared.')) return
    setWorking(true)
    try {
      await api.resetGuidedCase()
      setStep(0)
      setReportReady(false)
      setTask(null)
      const record = await api.guidedCase()
      setCaseData(record)
      notify('The guided case was reset. Your other properties and tasks were not changed.')
      await onWorkspaceRefresh()
    } catch (reason) { notify(reason instanceof Error ? reason.message : 'Could not restart the case.', 'error') }
    finally { setWorking(false) }
  }

  if (busy) return <div className="feature-loading"><LoaderCircle className="spin" /> Preparing the fictional guided case…</div>
  if (error && !caseData) return <div className="feature-error"><CircleAlert /> <div><b>We couldn’t open the guided case.</b><span>{error}</span></div><button className="button button-soft" onClick={() => { setBusy(true); setError(''); void hydrate().catch((reason) => setError(String(reason))).finally(() => setBusy(false)) }}>Try again</button></div>
  if (!caseData) return null

  return <motion.section className="page-content feature-page guided-case-page" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
    <div className="guided-hero">
      <div className="guided-hero-copy">
        <div className="feature-kicker"><span className="guided-kicker-icon"><Sparkles size={14} /></span> GUIDED PRODUCT WALKTHROUGH <span className="fictional-pill">FICTIONAL CASE</span></div>
        <h1>One inspection.<br /><em>A clearer next step.</em></h1>
        <p>Follow a visible bathroom ceiling observation through screening, human review, comparison, follow-up, and a shareable report.</p>
        <div className="guided-case-meta"><span><ShieldCheck size={14} /> Evidence stays connected</span><span><UserRoundCheck size={14} /> Inspector remains in control</span></div>
      </div>
      <div className="guided-hero-art" aria-hidden="true"><div className="guided-art-orbit orbit-one" /><div className="guided-art-orbit orbit-two" /><div className="guided-building"><div className="building-roof" /><div className="building-body"><div /><div /><div /><div /></div><div className="building-pulse"><Check size={15} /></div></div><div className="guided-art-caption"><ActivityIcon /> EVIDENCE → ACTION</div></div>
    </div>

    <div className="fictional-notice"><CircleAlert size={17} /><div><b>Fictional demo data</b><span>Willow Court is invented. Its earlier image is a licensed dataset illustration, not a photograph of this property. The current model output below comes from the image you choose and run.</span></div><button onClick={() => void restartCase()} disabled={working}><RotateCcw size={14} /> Restart case</button></div>

    <div className="case-stepper" aria-label="Guided case progress">
      {steps.map((item, index) => <button key={item.title} className={`case-step ${step === index ? 'active' : ''} ${index < maxStep ? 'complete' : ''}`} disabled={index > maxStep} onClick={() => setStep(index)} aria-current={step === index ? 'step' : undefined}><span className="case-step-number">{index < maxStep ? <Check size={14} /> : `0${index + 1}`}</span><span>{item.short}</span></button>)}
    </div>

    {error && <div className="inline-case-error"><CircleAlert size={15} /> {error}</div>}
    <AnimatePresence mode="wait">
      {step === 0 && <motion.div key="screen" className="case-panel" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -5 }}>
        <div className="case-panel-heading"><div><span className="eyebrow">01 · SCREEN THE CURRENT EVIDENCE</span><h2>Start with a photo of the bathroom ceiling.</h2><p>The available classifier returns the actual result for the selected image. You can use an attributed sample to rehearse the workflow or add your own photo.</p></div><div className="case-panel-icon"><ImagePlus size={19} /></div></div>
        <div className="case-property-strip"><div className="case-property-avatar">WC</div><div><b>{caseData.property.name}</b><span>Bathroom ceiling · {displayDate(currentInspection?.inspection_date)}</span></div><span className="case-context-chip"><span /> Active moisture reported</span></div>
        {currentInspection?.images.length ? <div className="case-existing-images"><b>Current inspection photos</b><div>{currentInspection.images.map((image) => <div className="case-mini-image" key={image.id}><img src={mediaUrl(image.url)} alt={image.filename} /><span>{image.filename}</span>{image.findings.length > 0 ? <CheckCircle2 size={14} /> : <button className="text-button" onClick={() => void analyzeSavedImage(image.id)} disabled={working || !modelReady}>{working ? 'Analyzing…' : 'Analyze'}</button>}</div>)}</div><p>You can continue using the saved current inspection, or restart the fictional case to try another photo.</p>{currentFinding && <button className="button button-primary" onClick={() => setStep(1)}><Sparkles size={15} /> Continue to review</button>}<div className="case-upload-option"><label className="case-upload-zone"><input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => void uploadAndAnalyze(event)} disabled={working || !modelReady} /><span className="upload-cloud"><Upload size={20} /></span><b>Add another property photo</b><span>JPG, PNG or WebP · analyzed by the local model</span></label></div></div> : <div className="case-evidence-grid">
          <div className="case-sample-picker"><div className="case-option-label"><span>OPTION A</span> Use a demo image</div><label className="case-select-label">Choose an available sample<select value={sampleId} onChange={chooseSample}>{samples.map((sample) => <option value={sample.id} key={sample.id}>{sample.label}</option>)}</select></label><div className="case-sample-preview">{samples.find((item) => item.id === sampleId) && <img src={mediaUrl(samples.find((item) => item.id === sampleId)!.url)} alt={`${samples.find((item) => item.id === sampleId)?.label} dataset sample`} />}<span><ImagePlus size={12} /> DATASET ILLUSTRATION</span></div><button className="button button-dark full-width" onClick={() => void analyzeSample()} disabled={working || !modelReady || !sampleId}>{working ? <LoaderCircle className="spin" size={15} /> : <Sparkles size={15} />}{working ? 'Running local screening…' : modelReady ? 'Add image & analyze' : 'Local model unavailable'}</button></div>
          <div className="case-upload-option"><div className="case-option-label"><span>OPTION B</span> Add your own photo</div><label className="case-upload-zone"><input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => void uploadAndAnalyze(event)} disabled={working || !modelReady} /><span className="upload-cloud"><Upload size={20} /></span><b>Choose a property photo</b><span>JPG, PNG or WebP · analyzed by the local model</span></label><div className="case-model-note"><ShieldCheck size={15} /><span><b>{modelReady ? 'Model ready' : 'Model unavailable'}</b>{modelReady ? ' · Score is uncalibrated and is not a probability of risk.' : ' · Prepare the local model to run image screening.'}</span></div></div>
        </div>}
      </motion.div>}

      {step === 1 && currentFinding && <motion.div key="review" className="case-panel" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -5 }}>
        <div className="case-panel-heading"><div><span className="eyebrow">02 · REVIEW THE EVIDENCE</span><h2>Keep the model suggestion and your decision distinct.</h2><p>Nothing becomes a confirmed property record until an inspector chooses how to treat the finding.</p></div><div className="case-panel-icon"><UserRoundCheck size={19} /></div></div>
        <div className="case-review-grid"><div className="case-review-photo">{currentImage && <img src={mediaUrl(currentImage.url)} alt={currentImage.filename} />}<span>{currentImage?.is_sample ? 'DATASET SAMPLE · NOT A PROPERTY PHOTO' : 'INSPECTOR-PROVIDED PHOTO'}</span>{currentImage?.quality_warnings && currentImage.quality_warnings.length > 0 && <div className="quality-warning-banner"><AlertTriangle size={14} /><span><strong>Quality Notice:</strong> {currentImage.quality_warnings[0]}</span></div>}</div><div className="case-review-content">
          <div className="case-model-result"><div><span className="eyebrow">MODEL SUGGESTION · {currentFinding.model_version || 'VERSION UNAVAILABLE'}</span><b>{titleCase(currentFinding.defect_type)}</b></div><div className={`priority-pill ${currentFinding.priority}`}>{titleCase(currentFinding.priority)}</div>{currentFinding.confidence != null && <div className="case-score-row"><span>Uncalibrated model score</span><b>{Math.round(currentFinding.confidence * 100)}%</b></div>}{currentFinding.prediction_alternatives && currentFinding.prediction_alternatives.length > 1 && <div className="candidate-strip"><span>Other model candidates</span>{currentFinding.prediction_alternatives.slice(1).map((candidate) => <i key={candidate.source_label}>{candidate.label} · {Math.round(candidate.score * 100)}%</i>)}</div>}<p>{currentFinding.evidence_text}</p><small>Image-level classification only. It does not locate the pattern or establish its cause.</small></div>
          <label className="case-field-label">Inspector note<textarea rows={2} value={reviewNote} onChange={(event) => setReviewNote(event.target.value)} placeholder="What did you observe on site?" /></label>
          <div className="case-override-grid"><label className="case-field-label">Adjust priority (optional)<select value={overridePriority} onChange={(event) => setOverridePriority(event.target.value)}><option value="">Use rule recommendation</option><option value="low">Low</option><option value="moderate">Moderate</option><option value="high">High</option></select></label><label className="case-field-label">Reason for override{overridePriority && <i>required</i>}<input value={overrideReason} onChange={(event) => setOverrideReason(event.target.value)} placeholder="Explain your decision" /></label></div>
          {currentFinding.priority_override_reason && <div className="case-override-saved">Inspector priority override: <b>{titleCase(currentFinding.priority)}</b> · {currentFinding.priority_override_reason}</div>}
        </div></div>
        <div className="triage-explainer"><div className="triage-icon"><Sparkles size={15} /></div><div><span className="eyebrow">EXPLAINABLE TRIAGE · {currentFinding.triage_rule_version || 'PROPERTY PULSE RULES'}</span><h3>{titleCase(currentFinding.priority)} maintenance review</h3><p>{currentFinding.next_action}</p><div className="triage-reasons">{currentFinding.reason_codes.map((reason) => <span key={reason}><Check size={12} /> {reasonLabels[reason] || titleCase(reason)}</span>)}</div></div></div>
        <div className="case-actions"><button className="button button-outline" onClick={() => void saveReview('dismissed')} disabled={working || currentFinding.status === 'dismissed'}>Dismiss suggestion</button><button className="button button-primary" onClick={() => void saveReview('confirmed')} disabled={working || currentFinding.status === 'confirmed' || currentFinding.status === 'corrected'}>{working ? <LoaderCircle className="spin" size={15} /> : <Check size={15} />}{reviewed ? 'Review saved' : 'Confirm and continue'}</button></div>
        {reviewed && <div className="case-saved-note"><CheckCircle2 size={15} /> Human review saved · {titleCase(currentFinding.status)}{currentFinding.reviewer_note ? ` · “${currentFinding.reviewer_note}”` : ''}</div>}
      </motion.div>}

      {step === 2 && <motion.div key="compare" className="case-panel" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -5 }}>
        <div className="case-panel-heading"><div><span className="eyebrow">03 · COMPARE THE PROPERTY HISTORY</span><h2>Look at the two records side by side.</h2><p>Similarity is linked from reviewed category and matching property area. Sample images are not evidence that the same physical mark changed over time.</p></div><div className="case-panel-icon"><Clock3 size={19} /></div></div>
        {!currentFinding || !reviewed ? <div className="case-empty-state"><CircleAlert /><div><b>Review the current suggestion first.</b><span>Confirm or dismiss the current finding before recording an inspector trend.</span></div><button className="button button-soft" onClick={() => setStep(1)}>Return to review</button></div> : !previousFinding || !previousImage ? <div className="case-empty-state"><CircleAlert /><div><b>No earlier reviewed evidence is available.</b><span>This case can still proceed, but a comparison cannot be saved without an earlier image and finding.</span></div></div> : <>
          <div className="comparison-pair"><article className="comparison-card"><div className="comparison-photo"><img src={mediaUrl(previousImage.url)} alt="Earlier illustrative image from the demo dataset" /><span>EARLIER RECORD</span></div><div className="comparison-meta"><span>{displayDate(previousInspection?.inspection_date)} · {previousInspection?.area_label}</span><b>{titleCase(previousFinding.defect_type)}</b><small>Fictional seeded history · dataset sample illustration</small></div></article><div className="comparison-middle"><ArrowRight size={18} /><span>INSPECTOR<br />COMPARES</span></div><article className="comparison-card"><div className="comparison-photo"><img src={currentImage ? mediaUrl(currentImage.url) : ''} alt={currentImage?.filename || 'Current property photo'} /><span>CURRENT RECORD</span></div><div className="comparison-meta"><span>{displayDate(currentInspection?.inspection_date)} · {currentInspection?.area_label}</span><b>{titleCase(currentFinding.defect_type)}</b><small>{currentImage?.is_sample ? 'Current dataset sample illustration' : 'Current inspector-provided photo'}</small></div></article></div>
          <div className="comparison-warning"><ShieldCheck size={15} /><span>Side-by-side photos are not automatically aligned. This screen does not calculate visual change or prove that a condition worsened.</span></div>
          <div className="trend-form"><label className="case-field-label">Inspector-recorded trend<select value={trendState} onChange={(event) => setTrendState(event.target.value as TrendState)}>{sameCategory ? <><option value="recurring">Recurring</option><option value="stable">Stable</option><option value="improved">Improved</option><option value="worsening">Worsening (inspector judgment)</option><option value="unable_to_compare">Unable to compare</option></> : <option value="unable_to_compare">Unable to compare</option>}</select></label><label className="case-field-label">Comparison note<textarea rows={2} value={trendNote} onChange={(event) => setTrendNote(event.target.value)} /></label><button className="button button-primary" onClick={() => void saveTrend()} disabled={working}>{working ? <LoaderCircle className="spin" size={15} /> : <Check size={15} />}{currentTrend ? 'Update comparison status' : 'Save inspector comparison'}</button></div>
          {currentTrend && <div className="case-saved-note"><CheckCircle2 size={15} /> {titleCase(currentTrend.trend_state)} · recorded by inspector · {displayDate(currentTrend.created_at)}</div>}
        </>}
      </motion.div>}

      {step === 3 && <motion.div key="followup" className="case-panel" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -5 }}>
        <div className="case-panel-heading"><div><span className="eyebrow">04 · CREATE A MAINTENANCE FOLLOW-UP</span><h2>Turn the reviewed finding into an owned next step.</h2><p>The task is stored against this demo property and finding, and it appears in the workspace maintenance queue.</p></div><div className="case-panel-icon"><Wrench size={19} /></div></div>
        {task ? <div className="created-task-card"><div className="created-task-top"><span className="task-card-icon"><Wrench size={17} /></span><div><span className="eyebrow">PERSISTED FOLLOW-UP TASK</span><h3>{task.title}</h3></div><span className={`task-status-pill ${task.status}`}>{titleCase(task.status)}</span></div><p>{task.description}</p><div className="created-task-meta"><span><UserRoundCheck size={14} /> {task.assignee || 'Unassigned'}</span><span><Clock3 size={14} /> Due {displayDate(task.due_date)}</span><span className={`priority-pill ${task.priority}`}>{titleCase(task.priority)}</span></div><div className="task-status-actions"><span>Move task through workflow</span>{(['open', 'in_progress', 'blocked', 'completed'] as const).map((status) => <button key={status} className={task.status === status ? 'selected' : ''} onClick={() => void setTaskStatus(status)} disabled={working}>{titleCase(status)}</button>)}</div><button className="text-button" onClick={onOpenMaintenance}>Open maintenance queue <ArrowRight size={14} /></button></div> : <div className="followup-create-grid"><div className="followup-suggestion"><span className="eyebrow">SUGGESTED NEXT STEP</span><div className="followup-suggestion-icon"><Wrench size={18} /></div><h3>{currentFinding?.next_action || 'Arrange an on-site review of this area.'}</h3><p>Task priority follows the reviewed maintenance triage. The task is a workflow reminder, not a diagnosis.</p><div className="followup-linkage"><CheckCircle2 size={14} /> Linked to {caseData.property.name} · {currentInspection?.area_label}</div></div><div className="followup-fields"><label className="case-field-label">Task owner<input value={taskOwner} onChange={(event) => setTaskOwner(event.target.value)} /></label><label className="case-field-label">Target date<input type="date" value={taskDueDate} onChange={(event) => setTaskDueDate(event.target.value)} /></label><div className="followup-task-preview"><span>{currentFinding?.priority || 'moderate'} priority</span><b>Arrange an on-site review of the bathroom ceiling</b><small>Will be saved as an open task and linked to this finding.</small></div><button className="button button-dark full-width" onClick={() => void createFollowUp()} disabled={working || !currentFinding || !currentTrend}>{working ? <LoaderCircle className="spin" size={15} /> : <Check size={15} />} Create follow-up task</button></div></div>}
      </motion.div>}

      {step === 4 && <motion.div key="report" className="case-panel" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -5 }}>
        <div className="case-panel-heading"><div><span className="eyebrow">05 · SHARE THE INSPECTION RECORD</span><h2>Bring the evidence, judgment, and next action together.</h2><p>The PDF includes the image, actual model response, human review, reasoned triage, recorded trend, related task, and limits.</p></div><div className="case-panel-icon"><FileText size={19} /></div></div>
        <div className="report-preview-card"><div className="report-preview-paper"><div className="paper-brand"><span className="brand-symbol"><ActivityIcon /></span><b>PROPERTY<span>PULSE</span></b></div><span className="paper-eyebrow">VISUAL MAINTENANCE SCREENING</span><h3>Inspection report</h3><p>{caseData.property.name}<br />{currentInspection?.area_label} · {displayDate(currentInspection?.inspection_date)}</p><div className="paper-rule" /><div className="paper-preview-block"><span>REVIEWED FINDING</span><b>{currentFinding ? titleCase(currentFinding.defect_type) : 'No reviewed finding'}</b><small>{currentFinding ? `${titleCase(currentFinding.priority)} priority · ${titleCase(currentFinding.status)}` : 'Review not saved'}</small></div><div className="paper-preview-footer"><span>CONFIDENTIAL PROPERTY RECORD</span><span>01 / 01+</span></div></div><div className="report-preview-copy"><div className="report-ready-mark"><FileText size={20} /></div><span className="eyebrow">CASE HANDOFF</span><h3>{reportReady ? 'Your report is ready.' : 'A complete record, ready to share.'}</h3><p>Generate a real PDF from saved API records. You can return to earlier steps, revise the inspection, and download an updated report.</p><div className="report-includes"><span><Check size={13} /> Evidence and model information</span><span><Check size={13} /> Human decision and triage reasons</span><span><Check size={13} /> Inspector trend and linked task</span><span><Check size={13} /> Safety and model limitations</span></div><button className="button button-primary" onClick={() => void createReport()} disabled={working || !currentInspection}>{working ? <LoaderCircle className="spin" size={15} /> : <ArrowDownToLine size={16} />}{working ? 'Preparing report…' : reportReady ? 'Download updated PDF' : 'Generate & download PDF'}</button><small>Generated from the current saved inspection. Seeded history is labelled in the report.</small></div></div>
        {task && <div className="case-final-summary"><span className="summary-check"><CheckCircle2 size={16} /></span><div><span className="eyebrow">CASE SUMMARY</span><b>{titleCase(currentFinding?.defect_type || 'finding')} · {titleCase(currentTrend?.trend_state || 'not compared')}</b><span>{task.title} · {titleCase(task.status)} · Owner: {task.assignee || 'Unassigned'}</span></div><span className={`task-status-pill ${task.status}`}>{titleCase(task.status)}</span></div>}
      </motion.div>}
    </AnimatePresence>
    <div className="case-footer-nav"><button className="button button-soft" onClick={() => setStep((value) => Math.max(0, value - 1))} disabled={step === 0}><ArrowLeft size={14} /> Previous</button><span>Step {step + 1} of {steps.length}</span><button className="button button-soft" onClick={() => setStep((value) => Math.min(maxStep, value + 1))} disabled={step >= maxStep}>Next step <ArrowRight size={14} /></button></div>
  </motion.section>
}

function ActivityIcon() { return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M2 12h5l3-7 4 14 3-7h5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg> }
