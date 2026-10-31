# PropertyPulse AI — Full Feature Build Prompt

Use this prompt with an AI coding agent that has access to the PropertyPulse AI repository. It is designed to extend the existing product rather than replace it with a disconnected prototype.

---

## BEGIN IMPLEMENTATION PROMPT

### Your role and objective

Act as a senior full-stack product engineer, applied computer-vision engineer, UX designer, and technical writer. Work directly in the existing **PropertyPulse AI** repository. Upgrade it into a polished, coherent, working property-inspection product by implementing the five feature areas below, a guided end-to-end demo case that uses all five features in sequence, and a complete professional README with accurate diagrams and brand assets.

The five feature areas are:

1. Reliable, transparent defect screening with visible evidence and human review.
2. Explainable maintenance triage with practical next actions.
3. Longitudinal issue tracking and honest before/after comparison.
4. A persisted maintenance follow-up workflow.
5. Evidence-rich, shareable inspection reports.

The demo case must take a user from inspection evidence to a reviewed finding, comparison, follow-up task, and final report.

### First inspect the repository and source material

Before editing:

- Read the root README, frontend code and styles, API client and TypeScript types, backend schemas/models/routes/priority rules, classifier and training script, data-source attribution, environment examples, and any existing project blueprint or hackathon source material available in the workspace.
- Inspect the current screens and existing demo data. Identify which requested capabilities already exist, which are incomplete, and which need new persistence or API support.
- Preserve the existing React + TypeScript + Vite frontend and FastAPI + SQLAlchemy backend unless there is a concrete technical reason a small change is required. Do not replace the project with a new framework, a static mockup, or a second disconnected application.
- Keep current working functionality: authentication/demo workspace, property management, inspections, photo upload and sample library, local classifier, inspector review/correction and manual annotations, dashboard, history, and PDF reports.
- Inspect current data and trained model metadata before describing performance. The current small holdout result is around 44%; verify the actual saved value before publishing it. Never claim a performance improvement unless it was measured.

### Product context and intended users

PropertyPulse AI is an evidence-led inspection and maintenance workspace for homeowners and property managers. It helps users record visible building-surface observations, organize inspection history, decide what needs human review, and track follow-up.

The product supports visible maintenance screening. It is **not** an engineering diagnosis, structural-safety certification, insurance decision, valuation, repair-cost estimator, or emergency assessment. The inspector or qualified professional remains responsible for confirming conditions and decisions.

### Non-negotiable engineering and trust requirements

- Make every major control functional and connected to persisted backend behavior. Do not ship decorative buttons, fake success toasts, hard-coded dashboard totals, or frontend-only state for actions that should survive a reload.
- Extend the existing API and data model consistently. Add request/response schemas, authorization and ownership checks, frontend types, API helpers, loading/error/empty states, and backward-compatible database changes as needed.
- Do not delete or reset user data to make the demo work. Make demo seeding repeatable and idempotent, and confine it to a clearly labelled demo workspace or demo case.
- Preserve account-level data ownership for every new API route. A user must not be able to read or change another user's comparisons, tasks, images, findings, or reports.
- Keep image uploads validated and safely stored. Reuse the current safe image-processing path rather than introducing an unsafe arbitrary-file route.
- Keep CC BY 4.0 dataset attribution in the repository and in any redistributed documentation or assets that use sample images.
- Do not present a classifier score as a calibrated probability unless calibration is actually implemented and documented. Call it a model score or confidence estimate when appropriate.
- Do not fabricate AI predictions, visual regions, trend scores, measurements, repair prices, or benchmark results.
- The current classifier is image-level. Do not display an AI-generated bounding box or heatmap as a true defect location unless a real localization method and suitable labeled data support it. Inspector-drawn regions must remain explicitly identified as human annotations.
- If the model is uncertain, unavailable, or the image is unsupported, show that honestly and route the item to human review. Do not silently substitute a made-up result.
- A repeated label is not proof that a defect worsened. Before/after comparisons must distinguish saved observations from measured visual change. Only label an issue worsening when the inspector records that judgment or a validated method supports it.
- Use the existing project as the source of truth for product behavior. If hackathon criteria or the exact official problem statement are unavailable in the source material, do not invent them. Align the product to the documented property-inspection/maintenance problem and clearly note that the exact statement wording was unavailable.
- Avoid unrelated rewrites and dependencies. Keep changes maintainable and explain any new dependency.

### Feature 1 — Reliable defect screening and evidence review

Improve the current classifier workflow so a user can understand and review each image-level suggestion.

Requirements:

- Review the existing training pipeline and evaluation metadata before changing it. Keep a reproducible baseline and report the dataset, split, label set, model version, and limitations.
- Improve the model only in ways the available licensed data and runtime can support. Do not claim that a larger neural model is better without measured evidence. Compare any new approach to the current baseline using the same held-out evaluation method.
- Show the original photo next to the prediction, predicted class, model name/version, and a clearly named model score. Show uncertainty and route low-confidence predictions to the review queue.
- Provide clear actions for the inspector to confirm, correct, dismiss, add a note, or mark a region manually. Preserve an audit trail of the saved human decision and keep it separate from the original model output.
- Use real image localization only if supported by a trained/validated localization model and labeled localization data. Otherwise, keep localization manual and call it “Inspector-marked region.” Do not draw a box around a guessed location.
- Provide understandable empty, loading, error, unsupported-image, and model-unavailable states.
- Keep model quality disclosure visible in the interface and README. Report actual class-wise metrics and confusion information only when they are computed from an actual evaluation run.

### Feature 2 — Explainable maintenance triage

Make priority useful and transparent without turning it into an unsafe diagnosis.

Requirements:

- Produce a review priority and next-step suggestion from supported inputs such as reviewed defect type, repeat observations in the same property area, inspector-reported moisture context, inspector-reported worsening, and human-marked extent when present.
- Keep the triage rules or scoring logic explicit, versionable, and understandable. Store reason codes and display them as plain-language explanations such as “reported active moisture” or “same reviewed finding recorded before.”
- Separate model classification from maintenance priority. A high model score must not automatically mean high maintenance priority.
- Make clear what is observed, what the model suggested, what the inspector entered, and what the app recommends.
- Give safe, practical next actions such as “record a follow-up photo,” “monitor this area,” or “arrange an on-site review by a qualified professional.” Do not claim a specific cause, structural danger, guaranteed repair, fixed repair cost, or regulatory compliance.
- Allow the inspector to record context and override or revise a recommendation, with the reason saved.
- Show why priority changed when new context or repeat history is added.

### Feature 3 — Longitudinal issue tracking and comparison

Let the user follow the same area across inspections and understand what is known over time.

Requirements:

- Link findings across inspections using the same property, normalized area/room label, and reviewed defect category. Do not use visual similarity alone to assert that two findings are the same issue.
- Add a property/area timeline with dated inspection events, thumbnails, saved model suggestions, human review states, and notes.
- Add a before/after view that displays selected historical and current photos side by side. Keep dates, area labels, and image source visible. Allow users to open the original photos and findings.
- Let the inspector record a trend state such as new, recurring, stable, improved, worsening, or unable to compare. Save who/what supplied the trend state and when. Human-entered trends must be visibly attributed to the inspector.
- Derive “recurring” only from repeated reviewed findings in the same property area. Do not claim “worsening” from different unaligned photos, a repeated class label, or a model confidence change.
- If an honest visual change estimate cannot be supported, provide a useful side-by-side comparison and inspector-authored status instead of a fake percentage, severity delta, or computer-vision result.
- Handle missing history, changed room names, deleted images, and unmatched findings gracefully.

### Feature 4 — Maintenance follow-up workflow

Turn triage into an action that can be owned and completed.

Requirements:

- Add a persisted maintenance task linked to a property and, where relevant, a reviewed finding or inspection.
- Support a concise task title, description/next action, owner or assignee text, due date, priority, status, creation/update timestamps, and completion note.
- Support a simple lifecycle such as open, in progress, blocked, and completed. Allow the user to change status and edit task details.
- Allow task creation from a finding or recommendation, and let users view tasks from the property, inspection, and maintenance queue.
- Add useful filters for status, priority, property, and due date. Make overdue tasks visible without alarmist language.
- Keep task actions scoped to the current authenticated user. Validate dates, statuses, text lengths, and referenced records.
- Make empty, loading, error, and completed states clear. Status updates must persist after navigation and reload.

### Feature 5 — Evidence-rich reports

Extend the existing downloadable PDF report into a polished, trustworthy handoff artifact.

Requirements:

- Include property and inspection details, inspection date, area, inspector notes, source photos, reviewed findings, model suggestion and score where available, model version, human review decision, inspector annotations, priority explanations, and recommended next steps.
- When a report includes longitudinal comparison, include both dated photos and identify the trend as inspector-recorded or system-derived, with the basis stated.
- Include related maintenance tasks and their owner, due date, and status when relevant.
- Make section breaks, page breaks, text wrapping, image sizing, footers/page numbers, and long reports readable. Do not let images or text overflow or get clipped.
- Include dataset/model attribution where appropriate and a plain-language limitations statement: this is a visual maintenance-screening record, not a structural-safety certification or professional diagnosis.
- Preserve report access and download authorization checks. Use safe filenames and avoid exposing local storage paths.
- Keep the report visually consistent with the PropertyPulse palette. Readability matters more than decoration.

### A single guided case demo using all five features

Create a polished, repeatable **“Try the guided case”** experience that walks the judge through all five feature areas in sequence. It must be an executable product flow using the real app/API, not a slide-only narrative.

Use a clearly fictional sample case such as:

- Property: “Willow Court · Unit 204”
- Area: bathroom ceiling
- Scenario: a visible surface stain is recorded, the property has a prior inspection record, the homeowner reports active moisture, and a follow-up review is needed.

Keep the case clearly marked as **fictional demo data**. Use the existing attributed sample-image library where suitable. Do not imply that a dataset sample photo is a real photo of Willow Court or that unrelated sample images are genuine time-separated photos of the same property.

Guided case sequence:

1. **Open the seeded case.** Show the fictional property, bathroom area, and a previous inspection/finding. Clearly label seeded historical observations as demo history.
2. **Run the current inspection.** Let the user add a supported sample image or upload a photo and run the real available classifier. Display the actual returned result, model score/version, and uncertainty. If the classifier cannot run, show a useful explanation and do not invent a prediction.
3. **Review the evidence.** The user confirms, corrects, or dismisses the suggestion, adds a note, and can draw an explicitly human-marked region. Show the difference between model output and inspector decision.
4. **Compare history.** Show earlier and current images side by side with dates. Use seeded history only as labelled demo data. Let the inspector record “recurring” or another trend state. Do not claim visual worsening unless a human records it or a validated method supports it.
5. **Explain triage.** Show priority and every reason. For this case, moisture context is an inspector-reported input. Explain how repeat observation and moisture report affect the recommendation without implying a diagnosis.
6. **Create and update a follow-up task.** Create a task such as “Arrange an on-site review of the bathroom ceiling,” assign a demo owner, set a due date, and move it through at least one status change. Persist it.
7. **Generate the report.** Generate and download a PDF containing current evidence, prior demo history, human decision, trend attribution, triage reasons, task status, model information, and safety/limitations text.
8. **Finish with a concise case summary.** Show what was observed, what was reviewed, what action is open/completed, and a link to the report.

Demo implementation requirements:

- Add a “Start guided case” entry point that is easy to find but does not force demo data into a real user's workspace.
- Provide an idempotent seed/reset action scoped only to demo records. Never delete a user's non-demo properties, inspections, images, reports, or tasks.
- Make every step interactive, keyboard-accessible, and usable on narrow screens.
- Keep a visible step indicator and let the user revisit completed steps without losing saved data.
- Use actual APIs and persisted data for analysis, review, comparison metadata, tasks, and report generation.
- Where a historical result is seeded, label its origin as fictional demo history. Where inference is shown, use the actual model response. Do not hard-code model results to make the demo look more impressive.
- If model performance is modest, make the demo succeed through transparent human review and clear workflow value, not exaggerated AI claims.

### Data model, API, and integration expectations

Inspect current SQLAlchemy models and API patterns before deciding names. Add only the records/fields required for a clean implementation. Likely concepts include:

- Maintenance task linked to property and optionally finding/inspection.
- Finding review/audit event, if needed to preserve original inference and human decisions.
- Finding history/link or issue grouping for repeat observations.
- Inspector-authored trend/comparison metadata.
- Demo provenance/seed identifiers so demo data can be safely recognized.

For every new backend capability:

- Add validated request/response schemas.
- Add authenticated endpoints using existing API versioning and ownership patterns.
- Add frontend TypeScript types and API methods.
- Return stable, useful errors and show them to the user.
- Add database migration/backward-compatible startup handling. Do not assume existing SQLite databases can be altered by create-all alone. Preserve existing user data.
- Update dashboard/property/inspection summary data only from persisted records and keep counts consistent.
- Keep current API routes working unless a documented compatibility change is unavoidable.

### Visual design and brand system

Deliver a polished, cohesive, professional UI while preserving the existing PropertyPulse identity. Make it feel calm, precise, premium, and trustworthy—not like a generic admin template.

Use the actual current design tokens as the source of truth:

- Page background / paper: #f6f7f3
- Primary text / ink: #1c2b23
- Primary green: #24493b
- Dark green: #17362b
- Muted text: #849087
- Default border: #e7eae4
- Soft sage: #d9e8ca
- Pulse/mark green: #385a42
- Headings: Manrope
- Body and controls: DM Sans
- Existing icon library: lucide-react, consistent outline style

Requirements:

- Read existing CSS before changing it. Consolidate shared values into documented CSS variables/design tokens instead of adding a competing palette or scattering arbitrary colors.
- Preserve semantic contrast for success, warning, error, and informational states. Pair color with text/icon so meaning is not color-only.
- Maintain clear typography hierarchy, consistent spacing, thoughtful empty states, refined cards, responsive layouts, focus states, keyboard support, and reduced-motion support.
- Keep charts and comparison visuals legible and labeled. Avoid dashboard decoration that obscures actionable information.
- Use Lucide React icons consistently. Do not mix emoji, random icon packs, and unrelated icon styles.
- Create a coherent master brand mark inspired by the existing pulse-line favicon, refined to work with a property/building cue and the green/sage palette. Keep it simple at small sizes and recognizable in monochrome.
- Remove unused starter React/Vite logos and replace the favicon with the final product mark.
- Create and include:
  - Main project/app mark as editable SVG, with light/dark or one-color variants if useful.
  - Updated favicon SVG.
  - App icon PNG at a suitable high-resolution size and an Apple touch icon where practical.
  - A polished repository/social preview thumbnail at 1280 × 640, designed with the actual app palette and identity.
  - A real product screenshot for the README, captured from the running app only if available; never create a fake UI screenshot.
- Keep assets local and properly named. Do not use unlicensed stock images or copyrighted logos.

### World-class README

Replace or substantially upgrade the root README so a new developer, judge, or product reviewer can understand, run, evaluate, and extend the project.

Include:

1. Clear title, one-sentence product promise, brand mark, and polished social preview.
2. Concise project summary and the real property-inspection/maintenance problem being addressed.
3. A **Problem statement alignment** section. Quote or paraphrase the exact official statement only if it is present in supplied source material. Explain how PropertyPulse addresses it with a traceable mapping from need → feature → evidence/demo. If exact wording is unavailable, say so; do not fabricate an official statement or judging rubric.
4. Intended users, user pain points, product goals, and explicit non-goals/safety limits.
5. Feature overview covering all five feature areas and clearly distinguishing existing capabilities from limitations.
6. Guided demo case, how to start it, exact walkthrough order, and what the user should observe at each step.
7. Screenshots of actual current UI pages where available, with concise captions and descriptive alt text. Do not use broken image paths.
8. A product workflow diagram in Mermaid.
9. A system architecture diagram in Mermaid showing the actual frontend, API, database, storage, classifier, priority logic, and report generation.
10. A data/entity relationship diagram in Mermaid reflecting the implemented schema, not an imagined future schema.
11. Optionally, a sequence or deployment diagram if it clarifies a real flow. Use Mermaid where useful; do not add decorative or inaccurate diagrams.
12. Technology stack and brief explanation of each component.
13. Setup requirements and exact commands for model preparation, backend startup, frontend install/start, and production build, consistent with scripts and dependency versions.
14. Environment-variable reference with safe example values and a strong warning never to commit real secrets.
15. API overview or link to generated OpenAPI docs, including authentication expectations.
16. Model/data section with source dataset, CC BY 4.0 attribution, training/evaluation method, label set, actual model metadata, measured metrics if available, and a clear explanation of what those metrics do and do not mean.
17. Clear limitations, privacy, and safety section.
18. Current architecture, persistence/storage behavior, troubleshooting, known limitations, roadmap, contribution guidance, and license/attribution notes.
19. Submission-ready links/placeholders for source repository, deployed working demo, and demo video. Use obvious TODO placeholders only for external URLs that do not yet exist; do not pretend they are live.
20. A visual token table documenting actual project color names/hex values, fonts, and icon style.

README quality rules:

- Keep setup instructions runnable from a fresh clone. Check paths, PowerShell examples, and shell examples for consistency.
- Use stable relative image links that render on GitHub.
- Make Mermaid diagrams syntactically valid and consistent with the actual implementation.
- Do not claim features are implemented before they exist.
- Do not claim scores, accuracy, user impact, time saved, repair savings, or hackathon results that have not been measured.
- Keep the README navigable with a table of contents while complete enough for first-time setup and evaluation.
- Keep attribution and safety language clear, readable, and visible.

### Suggested delivery phases

Implement in a connected order:

1. Inspect repository and document a small change plan.
2. Design data/API extensions and backward-compatible migration.
3. Implement triage and issue-history semantics with truthful attribution.
4. Implement maintenance task persistence and screens.
5. Implement the guided case, ensuring it uses the real workflow.
6. Improve classifier/evaluation presentation only as supported by data.
7. Extend PDF reports with comparison and task context.
8. Polish responsive UX, accessibility, and cohesive brand assets.
9. Rewrite README and diagrams to match the final implementation exactly.

Do not stop after writing a plan. Continue to implementation unless a concrete blocker makes the change impossible. Do not ask for clarification for routine engineering choices. If source material is missing, proceed with the product and mark the missing official detail honestly.

### Acceptance criteria

The project is complete when:

- All five features are accessible from the existing app and connected to persistent backend behavior.
- A user can follow the guided case from current image analysis through human review, comparison, explainable triage, a saved follow-up task, and a downloadable evidence-rich PDF.
- The demo is repeatable and clearly identifies fictional/seeded data without overwriting real user data.
- Model predictions, human annotations, seeded history, and inspector judgments are visibly distinguishable.
- No unsupported AI localization, false change claim, fake benchmark, or structural-safety claim is shown.
- Existing account and record ownership protections cover new routes and records.
- The visual design is polished, responsive, accessible, and consistent with the existing green/sage palette and icon system.
- App identity assets exist and are used by the app and README.
- The README matches the actual code, data, setup, diagrams, attribution, and limitations.
- Final handoff lists the main files/areas changed, run commands, guided demo path, and remaining known limitations without claiming work that was not completed.

### Hackathon framing and final presentation

Present the product as an original AI-assisted property-inspection and maintenance workflow, with human review and evidence traceability as core differentiators. Use supplied hackathon screenshots/listing and project blueprint only for facts they actually contain. Do not invent evaluation criteria or imply official endorsement. Make the final demo easy to follow: problem → inspection evidence → AI suggestion and uncertainty → human review → repeat-history comparison → reasoned next action → completed report.

## END IMPLEMENTATION PROMPT
