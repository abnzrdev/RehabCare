# Clinical Wizard Redesign Design

Date: 2026-05-31
Project: OrthoScan AI clinical rehabilitation wizard
Primary file target: `frontend/src/App.jsx`

## Goal

Redesign the six-step clinical wizard to match the provided visual references while preserving the current warm cream / Filebase-style shell, backend integrations, and medical logic.

The redesign covers:

1. Patient context
2. KOOS questionnaire
3. KL image grading
4. IMU movement analysis
5. Final rehab report
6. Exercise videos

## Constraints

- Keep the current warm cream / Filebase-style UI language.
- Do not redesign the product shell away from the current left rail, right step outline, and language controls.
- Keep all backend endpoints working:
  - `/health`
  - `/sessions/{patient_id}`
  - `/koos/calculate`
  - `/predict-kl`
  - `/imu/analyze`
  - `/rehab/report`
- Do not change the medical logic:
  - `KOOS_pre` comes from questionnaire
  - `KL grade` comes from knee image model
  - `delta_ROM` comes from IMU session comparison
  - `final_rehab_score = beta0 + beta1 * KOOS_pre + beta2 * delta_ROM + beta3_KL`
- Keep questionnaire answers stored as `q1` through `q42` in the existing payload shape.
- Scope is frontend presentation and limited interaction changes only unless a supporting code move is required for clarity.

## Design Direction

Reading this as a redesign of a clinician-facing multi-step workflow for a calm, trust-first audience, with a structured editorial UI language that stays close to the existing warm cream product shell.

Key visual traits:

- Warm cream background and soft paper surfaces
- Deep navy headings with teal action accents
- Clinical card layouts with stronger hierarchy
- Compact status chips and summary tiles
- Split-panel result views for analytical steps
- Cleaner progress states across the left rail

## Global Layout Rules

The redesign keeps the existing shell but improves the content regions.

Persistent shell:

- Left rail with product identity, six wizard steps, and patient history
- Main content column for the active step
- Right rail with "On this step" anchors
- Top-right language controls preserved in the reference style

Common content behaviors:

- Forms use labeled inputs with labels above fields
- Metric cards use compact titles and large numeric values
- Action buttons remain single-line and high-contrast
- Result states use one primary CTA and one secondary reset/change CTA where appropriate
- Typography hierarchy becomes more pronounced, but remains clinical and readable

## Step Designs

### 1. Patient Context

Purpose:
Capture patient/session context before clinical inputs begin.

Layout:

- Main intro at top with step title and short supporting sentence
- Two-column form grid for patient ID, patient name, exercise, and sensor placement
- Compact summary cards under the form for:
  - saved sessions
  - latest ROM
  - latest date
- Primary CTA continues to KOOS
- Left rail patient history remains visible and styled closer to the references

Behavior:

- Preserve current patient/session loading behavior
- Preserve current continue gating logic
- No backend changes

### 2. KOOS Questionnaire

Purpose:
Collect KOOS answers in shorter, more structured panels.

Pagination:

- Replace the current uneven page grouping with exactly `14` panels of `3` questions each
- Total remains `42` questions
- Question keys remain `q1` through `q42`

Question grouping:

- Panels may cross category boundaries where the question sequence requires it
- The UI shows a top-right category tag representing the category of the first question on the active panel
- If a panel contains questions from more than one category, add a secondary muted text note under the tag such as `Includes next section`
- Category tags may be:
  - `Pain`
  - `Symptoms`
  - `Daily living`
  - `Sport / recreation`
  - `Quality of life`

Layout:

- Single questionnaire card per panel
- Header area includes:
  - current panel progress
  - answered count
  - category tag in the top-right
- Three question rows per panel with existing answer options
- Clear previous/next controls
- Final panel includes calculation CTA and summary readiness state

Animation:

- Panel changes use a light horizontal slide with a subtle 3D turn
- Motion is supportive, not dramatic
- The transition should feel interactive without reducing readability

Behavior:

- Keep current scoring options and frequency/severity logic
- Keep current KOOS calculation integration with `/koos/calculate`
- Maintain readiness logic for the step

### 3. KL Image Grading

Purpose:
Upload a knee image and review AI-assisted KL grading.

States:

#### Empty / pre-analysis state

Layout:

- Large upload dropzone on the left
- Right-side analysis card describing the action and showing idle status
- Supporting note about accepted file types and upload guidance

Behavior:

- Preserve current file validation and upload/predict flow
- Preserve `/predict-kl` integration

#### Result / post-analysis state

Layout:

- Left panel shows uploaded knee image preview and file metadata
- Right panel shows the KL result summary:
  - grade label
  - grade number
  - confidence
  - model status
  - explanatory note
  - next-step CTA
  - secondary CTA to choose a different image

Behavior:

- Preserve the current prediction result shape
- No changes to grading logic
- Continue CTA leads into IMU analysis

### 4. IMU Movement Analysis

Purpose:
Upload IMU CSV data and review movement metrics before the final report.

States:

#### Empty / pre-analysis state

Layout:

- Upload area and supporting explanation kept simple and aligned with the new system

Behavior:

- Preserve current CSV validation and `/imu/analyze` integration

#### Result / post-analysis state

Layout:

- Left card summarizes the uploaded CSV and analysis completion
- Main right content shows:
  - movement score hero value
  - status chips
  - metric cards for current ROM, delta ROM, smoothness/control, movement level
  - calculation explanation card
  - next-step CTA to final rehab report
  - secondary actions for re-upload or rerun

Behavior:

- Preserve current ROM and movement analysis logic
- Preserve readiness logic for the step

### 5. Final Rehab Report

Purpose:
Present the combined rehabilitation assessment from KOOS, KL, and IMU data.

Layout:

- Score-led hero area with overall rehabilitation score and rehab stage
- Supporting status chips near the top
- Input summary metric cards for:
  - `KOOS_pre`
  - `delta_ROM`
  - `KL grade`
  - current ROM
  - IMU movement score
  - rehab level
- Supporting sections for:
  - score explanation
  - clinical recommendations
  - session details
  - calculation details
- Primary CTA to continue to exercise videos

Behavior:

- Preserve `/rehab/report` integration
- Preserve final formula and interpretation logic
- No changes to medical computation

### 6. Exercise Videos

Purpose:
Show the recommended exercise plan based on the final rehab stage.

States:

#### Library / assigned-plan state

Layout:

- Summary card showing assigned rehab stage, source scores, and safety note
- Recommendation explanation card
- Grid of recommended video cards
- Buttons for download/review/back navigation

#### Watching state

Layout:

- One selected video becomes the primary player/viewer
- Remaining recommended videos move into a secondary selectable list or grid
- The user can switch from the active video to another recommendation without leaving the step
- Keep the same summary and safety context available around the player

Behavior:

- Add local UI state for selected video
- Preserve existing stage-based recommendation logic
- Do not change backend medical logic

## Interaction Boundaries

Allowed functional changes:

- KOOS repagination from the current uneven structure to `14 x 3`
- KOOS panel transition animation
- Richer state rendering for KL, IMU, final report, and videos
- Exercise videos selected/watching state

Not in scope:

- Changing endpoint contracts
- Changing clinical formulas
- Rebuilding the overall app architecture
- Redesigning beyond the established warm cream product shell

## Implementation Notes

- Primary implementation target is `frontend/src/App.jsx`
- Small local refactors inside that file are acceptable if they reduce complexity
- If styles become too large to manage inline, a limited extraction is acceptable, but only if it makes the file materially clearer
- Existing translations should be preserved and extended only where the new UI introduces required new labels
- Existing local storage and readiness state behaviors should remain intact

## Testing And Verification

Required verification after implementation:

1. `cd frontend && npm run build`

Recommended spot checks during implementation:

- Patient context continue flow
- KOOS answering and final calculate flow
- KL upload and result rendering
- IMU upload and result rendering
- Final report generation
- Exercise video state switching

## Risks

- `frontend/src/App.jsx` already contains significant logic and inline styles, so the redesign can increase complexity if not kept disciplined
- KOOS repagination can introduce regressions if question order or readiness checks are coupled to the old page map
- The step redesign must preserve existing translation coverage where labels are reused in multiple languages

## Decision Summary

Approved design decisions reflected in this spec:

- Redesign all six steps, not only patient and KOOS
- Keep the warm cream/Filebase-like shell
- Use a structured reference-driven layout system across steps
- KOOS uses `14` pages of `3` questions
- KOOS shows top-right category tags to identify question type
- KOOS transition uses a light slide with subtle 3D turn
- KL, IMU, and final report each support clearer post-result analytical layouts
- Exercise videos supports both a recommendation library state and an active watching state
