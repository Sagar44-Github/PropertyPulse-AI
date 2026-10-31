# PropertyPulse AI — Product and Delivery Blueprint

> End-to-end product definition, implementation map, trust boundaries, demo narrative, acceptance criteria, and scale-up plan for contributors and hackathon presentation.

## 1. Executive summary

PropertyPulse AI is an evidence-led inspection and maintenance workspace for homeowners and property managers. It connects five activities that are commonly split across spreadsheets, photo folders, email, and task tools:

1. Screen a building-surface image for a supported visual pattern.
2. Have a person review and record the observation.
3. Show a transparent maintenance triage with supporting reasons.
4. Compare a reviewed observation with the property's own history.
5. Create a follow-up task and a shareable report.

The product is deliberately conservative. The model is an experimental image-level classifier. It cannot identify the cause of a mark, locate affected pixels, measure defect size, assess structural safety, or determine repair cost. A human inspector remains responsible for confirming observations and actions.

## 2. Problem framing and hackathon alignment

### Product problem

Property observations lose value when images, locations, dates, context, prior history, decisions, and follow-up tasks are separated. The next owner or property manager may not know which image is current, whether a model label was reviewed, what condition was reported, or whether the planned follow-up happened.

### Product response

PropertyPulse provides one traceable chain from image evidence to human decision and practical follow-through. It keeps distinct:

- what the image classifier suggested,
- what the inspector observed and recorded,
- what the priority rules recommended,
- what the reviewer changed, and
- what the follow-up workflow completed.

### Event context and uncertainty

The supplied screenshot identifies **NEURA X 2026 / PropCare NW** and depicts a final submission step requesting an AI project, repository, demo video, and working demo. The exact official challenge statement and judging rubric were not present in the screenshot or local source material. The product alignment in this document is therefore a concept-level problem framing, not a quotation or claim about official judging criteria. Add the official wording and rubric once available.

## 3. Goals and non-goals

### User goals

- Record a property and the area being inspected.
- Capture evidence and preserve its inspection context.
- Understand a model suggestion without mistaking it for a diagnosis.
- Save a human decision with a note and review history.
- See prior records for the same property area.
- Plan a reasonable follow-up with an owner and due date.
- Share a concise, traceable PDF with a colleague or service provider.

### Product goals

- Reduce handoffs between inspection evidence and maintenance follow-up.
- Make provenance visible for every claim.
- Prefer conservative, practical next actions over unsupported predictions.
- Run locally without cloud dependencies for a hackathon walkthrough.
- Keep the architecture replaceable as data, validation, and deployment needs grow.

### Non-goals for this release

- Engineering or structural diagnosis, emergency response, or hazard clearance.
- Insurance, warranty, compliance, valuation, or real-estate decisions.
- Defect segmentation, dimension measurement, or localization heatmaps.
- Automated repair cost, contractor quote, or guaranteed repair recommendation.
- Predictive maintenance claims based on insufficient property history.
- Public multi-tenant production hosting or regulated-data certification.

## 4. Users

| User | Need | Current product support |
|---|---|---|
| Homeowner | Keep a record of visible conditions and planned maintenance | Portfolio, inspections, review, tasks, reports |
| Property manager | Coordinate observations and follow-up across properties | Account-scoped properties, queue, assignee and due date |
| Inspector or maintenance professional | Record an observation and explain the decision | Confirm/correct/dismiss, note, manual region, priority override |
| Hackathon judge | Understand the problem and see a complete working journey | Seeded case, live classifier, review, trend, task, PDF |

The local application has a convenient demo identity and a single account workspace. Organization membership, team roles, invitations, and shared tenancy are future work.

## 5. Product principles

1. **Evidence first:** preserve the original image, location, date, context, model metadata, and review state together.
2. **Human decision visible:** AI suggestions remain suggestions until reviewed.
3. **Explainable triage:** show the rule reasons and next action.
4. **No fabricated precision:** do not imply calibrated probability, measured change, defect boundaries, or safety certainty.
5. **History needs context:** similar labels do not prove the same physical defect, recurrence, or worsening.
6. **Safe defaults:** uncertain output returns to review; recommendations stay practical and non-diagnostic.
7. **Privacy by design:** scope records to an account and make demo seed/reset narrow.
8. **Replaceable components:** keep interface, API, persistence, model, triage, and report generation separated.

## 6. Five product capabilities

### 6.1 Image screening and evidence review

**User need:** Sort a photo into a supported set of visible surface-pattern labels while keeping the original photo available for human review.

**Current behavior:**

- Upload JPEG, PNG, or WebP, or select a clearly labelled dataset sample.
- API validates file type, size, and minimum dimensions; normalizes orientation; safely re-encodes; hashes and stores the file under the inspection.
- Local model computes HOG features from grayscale 128 × 128 pixels and predicts algae, major_crack, minor_crack, peeling, plain, spalling, or stain.
- Finding stores source label, score, model name/version, alternatives, initial priority, and reasons.
- A person confirms, corrects, dismisses, adds a note, or draws a manual region.
- Review events retain previous and next decisions, reviewer, note, and timestamp.

**Boundary:** Preserve the original model label as model output. Store a corrected label as a human decision. A manually drawn rectangle is not an AI localization.

### 6.2 Explainable maintenance triage

**User need:** Understand what to review next and why without turning an image label into a diagnosis.

**Inputs:** model label and score; inspector-reported context such as active moisture or worsening; prior reviewed observations in the same normalized property area; inspector-marked extent when available.

**Outputs:** priority label, rule score, reason codes, rule version, and plain-language next action.

**Rules:** the deterministic rules are separate from the classifier and versioned as propertypulse-triage-v1. A plain label has a low-priority save-record action and does not claim the area is free of conditions outside the model labels. A score below 0.48 is routed to human review. Context can increase review urgency, with each reason displayed. A reviewer may override priority if a reason is saved.

**Boundary:** Triage does not establish cause, structural risk, cost, repair method, or code compliance.

### 6.3 Property history and human-attributed trends

**User need:** View prior records for the same place and make a contextual comparison.

**Rules:** both findings must be human-reviewed, belong to the same property and normalized area, and have compatible reviewed categories. Otherwise, the reviewer can record unable_to_compare. A trend stores previous/current finding IDs, trend state, note, creator, and inspector attribution.

**Demo disclosure:** The seeded earlier image is a dataset illustration. It is not a prior photograph of the fictional property. The UI must never suggest that the two sample images establish real visual change.

### 6.4 Maintenance workflow

**User need:** Turn a reviewed finding into an owned, dated task and track its progress after leaving the inspection.

Tasks may link to a property, inspection, and finding. Fields include title, description, assignee, due date, priority, status, and completion note. Statuses are open, in_progress, blocked, and completed. The queue supports status/property filters and due/overdue context. API routes verify that every linked record belongs to the owner and selected property. Tasks persist across reloads.

### 6.5 Shareable PDF report

**User need:** Carry a concise record outside the app without losing how the observation was produced.

Generated reports include property, area and date; photo evidence; model label, score and version; triage reasons and rule version; reviewer decision and note; human-marked annotation; historical comparison; linked task; demo/data disclosure where applicable; and professional-review boundary. Download routes verify account ownership.

## 7. Key journeys

### Routine inspection

1. Open the workspace and sign into the demo account or create an account.
2. Create or select a property.
3. Start an inspection; record area, date, notes, and context.
4. Upload a photo or select a dataset example.
5. Review the image-level suggestion and its limits.
6. Confirm, correct, dismiss, or mark a region manually.
7. Inspect the triage reasons and save an override reason if needed.
8. Compare with a reviewed observation from the same property area.
9. Create a follow-up task and manage its status.
10. Generate a PDF and return to property history or dashboard.

### Judge walkthrough

The seeded case is **Willow Court · Unit 204**, a fictional property. The Guided case runs all five feature areas in a single interface. It creates or loads a demo history and current inspection context, then allows the user to choose a sample or upload a photo, run the actual local model, review the output, record a trend, create/update a task, and generate a PDF.

Seeding is repeatable. Reset removes only the property with the guided-case demo key and its dependent records/files. It does not clear unrelated portfolio data.



## 8. Architecture and persistence

### Runtime components

- **Frontend:** React 19, TypeScript, Vite, Framer Motion, Lucide icons, Recharts.
- **API:** FastAPI, Pydantic, Uvicorn, SQLAlchemy.
- **Database:** SQLite by default; configured with DATABASE_URL.
- **Image pipeline:** Pillow validation, EXIF orientation, normalized output, SHA-256 hash.
- **Classifier:** scikit-image HOG, scikit-learn SGDClassifier, joblib.
- **Maintenance triage:** deterministic Python rules with an explicit version.
- **Reports:** ReportLab PDF creation and authenticated download.
- **Local data:** database and reports under backend/data; images under backend/uploads; models under backend/models.

~~~mermaid
flowchart LR
  Person --> Web[React application]
  Web -->|Bearer token, JSON, image upload| API[FastAPI]
  API --> Auth[Account ownership checks]
  Auth --> DB[(SQLAlchemy database)]
  API --> Image[Validate and normalize image]
  Image --> Files[(Private local upload storage)]
  Image --> Model[HOG and SGD classifier]
  Model --> Finding[Saved finding and alternatives]
  Finding --> Review[Human review and audit event]
  Review --> Rules[Versioned maintenance triage]
  Review --> Trend[Inspector-attributed comparison]
  Trend --> Task[Linked maintenance task]
  Review --> PDF[ReportLab PDF]
  Task --> PDF
  PDF --> Files
~~~

### Data relationships

- A User owns Properties.
- A Property contains Inspections and MaintenanceTasks.
- An Inspection contains InspectionImages and Reports.
- An InspectionImage contains Findings.
- A FindingReviewEvent associates a finding with the reviewer and prior/next decision.
- An IssueTrend references a prior and current finding, a property, a creator, human trend state, and note.
- A MaintenanceTask can link to an inspection and finding and always belongs to one property.
- A seeded Property has an explicit demo flag/key and account-scoped unique demo key.

~~~mermaid
erDiagram
  USER ||--o{ PROPERTY : owns
  PROPERTY ||--o{ INSPECTION : contains
  INSPECTION ||--o{ INSPECTION_IMAGE : records
  INSPECTION_IMAGE ||--o{ FINDING : produces
  PROPERTY ||--o{ MAINTENANCE_TASK : tracks
  INSPECTION ||--o{ REPORT : summarizes
  FINDING ||--o{ FINDING_REVIEW_EVENT : audits
  USER ||--o{ FINDING_REVIEW_EVENT : records
  FINDING ||--o{ ISSUE_TREND : compares
  USER ||--o{ ISSUE_TREND : attributes
  FINDING ||--o{ MAINTENANCE_TASK : links

  USER {
    int id PK
    string email
    string name
  }
  PROPERTY {
    int id PK
    int owner_id FK
    string name
    boolean is_demo
  }
  INSPECTION {
    int id PK
    int property_id FK
    string area_label
    json context_flags
  }
  INSPECTION_IMAGE {
    int id PK
    int inspection_id FK
    string storage_key
    string sha256
    boolean is_sample
  }
  FINDING {
    int id PK
    int image_id FK
    string source_label
    float confidence
    string status
    string origin
  }
  FINDING_REVIEW_EVENT {
    int id PK
    int finding_id FK
    int user_id FK
    string previous_status
    string next_status
  }
  ISSUE_TREND {
    int id PK
    int previous_finding_id FK
    int current_finding_id FK
    string trend_state
    string attribution
  }
  MAINTENANCE_TASK {
    int id PK
    int property_id FK
    int finding_id FK
    date due_date
    string status
  }
  REPORT {
    int id PK
    int inspection_id FK
    string content_hash
  }
~~~

Startup creates current tables and runs additive local schema upgrades. For production schema evolution, use Alembic or another explicit migration system.

## 9. API surface

Workspace routes under /api/v1 require bearer authentication. Demo/register/login issue tokens, /health is public, and model status requires authentication. Image URLs are signed, expire after one hour, and inspection-media retrieval rechecks the owning account. Interactive schemas are available at /docs.

| Domain | Route(s) |
|---|---|
| Health/model | GET /health; GET /api/v1/model |
| Authentication/profile | POST /api/v1/auth/demo; POST /api/v1/auth/register; POST /api/v1/auth/login; GET/PATCH /api/v1/auth/me |
| Workspace | GET /api/v1/dashboard |
| Properties | GET/POST /api/v1/properties; GET/PATCH/DELETE /api/v1/properties/{property_id} |
| Inspections | POST /api/v1/properties/{property_id}/inspections; GET /api/v1/inspections/{inspection_id}; GET /api/v1/properties/{property_id}/history |
| Samples/upload | GET /api/v1/demo/samples; POST /api/v1/inspections/{inspection_id}/images; POST /api/v1/inspections/{inspection_id}/samples/{sample_id} |
| Guided case | POST /api/v1/demo/case/seed; DELETE /api/v1/demo/case |
| Media | GET /api/v1/media/{media_token} |
| Analysis/review | POST /api/v1/images/{image_id}/analyze; POST /api/v1/images/{image_id}/annotations; PATCH /api/v1/findings/{finding_id}; GET /api/v1/findings/{finding_id}/reviews; PUT /api/v1/findings/{finding_id}/region |
| Trends | GET /api/v1/properties/{property_id}/trends; POST /api/v1/findings/{finding_id}/trends |
| Tasks | GET/POST /api/v1/tasks; PATCH /api/v1/tasks/{task_id} |
| Reports | POST /api/v1/inspections/{inspection_id}/reports; GET /api/v1/reports/{report_id}/download |

## 10. Data, model, and evaluation plan

### Measured local baseline

- Dataset: chandrabhuma/building_defect_vqa; dataset card lists CC BY 4.0.
- Rows used: 3,172.
- Split: stratified 80/20, holdout 635 rows, seed 42.
- Features: grayscale 128 × 128 image; HOG with 9 orientations, 8 × 8 pixel cells, 2 × 2 cell blocks, L2-Hys normalization.
- Classifier: SGDClassifier with log loss, balanced class weights, max_iter 1500, tolerance 0.001, random_state 42.
- Holdout accuracy: 0.4362 (43.62%).
- Holdout macro F1: 0.4254 (42.54%).
- Local outputs: backend/models/propertypulse_classifier.joblib and backend/models/model_info.json. Generated model artifacts are git-ignored.

These figures describe one research dataset split, not expected performance on new properties, materials, cameras, or light conditions. They are not a safety guarantee. The seven class-wise metric report and confusion matrix are written by the trainer. Do not claim a quality improvement without a measured same-split comparison.

### Model improvement gates

1. Define target capture conditions, surfaces, and an annotation guide.
2. Collect representative images with permission; keep the same property out of both train and holdout sets to reduce leakage.
3. Freeze a reproducible evaluation protocol before comparing methods.
4. Report class-wise precision/recall/F1/support, confusion matrix, calibration, and error patterns.
5. Validate on field images and compare decisions with qualified human review.
6. Add segmentation only with suitable pixel-labelled data and an independent localization evaluation.
7. Version model, preprocessing, metrics, and rollout plan together; maintain rollback.

### Dataset attribution

Source: chandrabhuma/building_defect_vqa, with BD3 research context. Attribution is maintained in backend/DATA_SOURCES.md. Generated sample images come from the source dataset. Keep this notice with any redistributed sample images or derived assets and check upstream terms before reuse.

## 11. Design system and assets

### Brand direction

“PropertyPulse” should feel calm, considered, practical, and trustworthy rather than like an alarm panel. Visual attention comes from readable evidence, clear hierarchy, whitespace, and statuses. Manrope headings and DM Sans supporting text keep the product editorial and approachable.

| Token | Value |
|---|---|
| Main canvas | #F6F7F3 |
| Card surface | #FFFFFF |
| Primary ink | #24372D |
| Primary action | #355C45 |
| Sage accent | #8AA37C |
| Soft sage | #EDF3E9 |
| Warm supporting accent | #C8906D |
| Headings/body | Manrope / DM Sans |

**Assets:** frontend/public/propertypulse-mark.svg, propertypulse-mark-dark.svg, favicon.svg, propertypulse-icon.png (1024 px), apple-touch-icon.png, icons.svg, social-preview.svg; docs/assets/social-preview.svg; generator scripts/render_brand_icons.py. The social preview is a branded illustration, not a screenshot of the running application. Fonts are bundled via npm packages.

The dashboard's isometric room is a code-drawn illustration with selectable hotspots; choosing a room opens the inspection flow with that area prefilled. It does not represent a scan or measured view of an actual user's property.

### Interaction standards

- Keep workflow step, progress, evidence, status, and next action visible.
- Every asynchronous action should have a busy state and recoverable error.
- Empty states explain how to get started.
- Status communicates in text as well as color.
- Images have meaningful alternative text and controls have descriptive accessible names.
- Motion is restrained and respects reduced-motion settings.
- Portfolio navigation and workflow adapt to small screens.

## 12. Local setup

### Requirements

Python 3.11 or newer; Node.js 20.19+ or 22.12+; network access for initial model training.

### Windows PowerShell

From the project directory:

~~~powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
python -m pip install -r backend\requirements.txt
python backend\train_classifier.py
~~~

Start the API in terminal one:

~~~powershell
python -m uvicorn backend.app.main:app --reload --port 8100
~~~

Start the frontend in terminal two:

~~~powershell
cd frontend
npm install
npm run dev
~~~

Open the URL Vite prints, normally http://localhost:5173. API health is at http://localhost:8100/health; API docs at http://localhost:8100/docs.

### Configuration

Copy backend/.env.example to backend/.env. Key settings are PROPERTY_PULSE_SECRET, PROPERTY_PULSE_TOKEN_HOURS, PROPERTY_PULSE_CORS, DATABASE_URL, PROPERTY_PULSE_DATA_DIR, PROPERTY_PULSE_UPLOAD_DIR, PROPERTY_PULSE_MODEL_DIR, and frontend/.env.local VITE_API_BASE. Replace development secrets and restrict CORS before any non-local deployment. Local database, image storage, model, virtual environment, node_modules, and build artifacts are ignored by git. Back up database and associated files together.

## 13. Safety, privacy, and production gaps

### Current safeguards

- Bearer authentication and account ownership checks for properties and dependent resources.
- Image retrieval uses a signed one-hour URL; uploaded-image requests verify that the requesting account owns the associated property.
- Upload type/size/dimension validation and normalized image re-encoding.
- Sample IDs are allow-listed; clients cannot select arbitrary file paths.
- Demo reset is restricted to the specifically keyed case.
- Task links must be owned by the user and belong to the same property.
- Trends require two reviewed findings from the same property/area and reject incompatible categories except unable_to_compare.
- Unavailable model state is shown rather than replaced with a fabricated output.
- Report downloads verify ownership.

### Work before production

- Replace demo login/token handling with a managed identity provider and secure session design.
- Add explicit migration tooling, managed database, private object storage, short-lived image access, request limits, and monitoring.
- Define consent, retention, export, delete, backup, and incident response.
- Audit authorization and organization isolation; complete a security review.
- Configure secrets, security headers, observability, and deployment automation.
- Never expose the development server or local static uploads as a production service.

## 14. Acceptance criteria

### Functional

- A new or returning demo user opens the workspace.
- Demo case seed is repeatable and does not duplicate its property.
- An uploaded photo or attributed sample is processed by the actual local classifier.
- Model result exposes label, score, version, and limitations.
- A human can confirm/correct/dismiss and the review event persists.
- Triage includes version, reasons, next action, and a reasoned human override.
- Comparisons use reviewed observations and human attribution.
- A linked task persists across reload and moves through supported statuses.
- A PDF report is generated and downloaded with evidence and disclosures.
- Resetting demo case does not affect ordinary property data.
- All added records stay scoped to the current account.
- UI handles loading, errors, empty states, mobile widths, and reduced motion.
- Product copy avoids diagnostic certainty, calibrated score claims, AI localization, measured worsening, and safety claims.

### Presentation

- README includes setup, actual model results, data attribution, API overview, Mermaid architecture, product scope, limitations, and scale-up plan.
- Brand assets and thumbnail are usable; thumbnail is not misrepresented as a captured product screenshot.
- Demo narration accurately explains the seeded-history illustration.

## 15. Delivery and scale roadmap

### Phase 1 — Connected hackathon product (current)

- Maintain React/FastAPI architecture and responsive application.
- Connect review events, explainable triage, human trend comparison, linked tasks, case seed/reset, and evidence-rich PDF.
- Document model metrics and dataset attribution.
- Provide project identity assets and product blueprint.
- Build the frontend for production and walk the API through the complete case path.

### Phase 2 — Pilot validation

- Gather consented, representative images and define a written labeling rubric.
- Validate across inspectors, properties, materials, and capture conditions.
- Establish task success and model quality measures.
- Calibrate scores only with evidence; improve uncertainty and out-of-distribution handling.

### Phase 3 — Field product

- Mobile camera guidance, offline drafts, reliable sync, and reusable inspection templates.
- Organization members, roles, assignments, notifications, and activity history.
- Recurring maintenance, vendor access, work completion evidence, quotes, and costs.
- Private object storage and managed multi-tenant database.

### Phase 4 — Production operations and responsible AI

- Versioned training/evaluation pipeline, model registry, drift monitoring, review sampling.
- Consent, retention, export/delete, backups, observability, incident response, security controls.
- Segmentation or measurement only with suitable labels and validation.
- Migrations, reliability engineering, and deployment automation.

### Phase 5 — Integrations and scale

- Property-management software integrations and approved work orders.
- Portfolio reporting and configurable workflows.
- Regional languages, accessibility, and jurisdiction-specific review.
- Privacy-protected enterprise analytics.

## 16. Demo and submission plan

### Three-minute story

1. **Problem:** inspection evidence and follow-up become disconnected.
2. **Product:** open the portfolio and Guided case.
3. **Screen:** choose an example or photo; explain label, model score, and limitations.
4. **Review:** confirm/correct and show persisted human decision plus rule reasons.
5. **History:** record the inspector comparison; say seeded images are illustrations, not a real before/after pair.
6. **Follow-up:** create a task, set an owner/date, and update status.
7. **Share:** generate the PDF and show evidence, decision, and action together.
8. **Scale:** state what pilot validation, mobile/team support, and production deployment require.

### Submission checklist

- Verify official challenge statement, judging criteria, final deadline, allowed tools, and visibility requirements directly on the official event page.
- Confirm demo starts from clean setup steps and model artifacts are available or training is documented.
- Prepare a short, legible demo video using only consenting or demo images.
- Include repository, working demo if deployed, video, setup, attribution, and limitations where the submission form asks.
- Test the PDF and interface in a fresh session.
- Demonstrate the complete product and basis for each claim; do not promise a win or unverified AI performance.

## 17. Open decisions

The supplied project source does not settle these items:

- Exact official challenge statement and judging rubric.
- Launch geography, building types, and language requirements.
- Primary paying buyer and procurement route.
- Review staffing and professional qualification requirements.
- Consent, retention, and deletion policy for uploaded photos.
- Production host, database, object storage, identity provider.
- Legal review of property inspection claims by jurisdiction.
- Next investment priority: field capture, team workflow, or model validation. Resolve through pilot research and measured usage.

## 18. Glossary

| Term | Meaning |
|---|---|
| Image-level label | One class for the whole image; no defect pixels are identified |
| Model score | Model output strength, not a calibrated probability |
| Finding | Saved screening observation with evidence and model metadata |
| Reviewed finding | A finding with a human decision |
| Inspector-marked region | Rectangle manually placed by the reviewer |
| Triage | Deterministic maintenance-priority rules separate from classification |
| Trend | Person-recorded comparison between reviewed observations |
| Demo seed | Repeatable, fictional showcase property and history |
| Data illustration | Dataset example used in UI; not necessarily a photo of the named property |
