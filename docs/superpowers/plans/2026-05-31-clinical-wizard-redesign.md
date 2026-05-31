# Clinical Wizard Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign all six clinical wizard steps to match the approved references while preserving the current backend contracts, medical logic, and warm cream application shell.

**Architecture:** Keep the current single-screen wizard flow in React, but reduce risk by extracting the new KOOS pagination and step-state helpers into focused frontend modules before rebuilding the step UIs. The implementation stays centered on `frontend/src/App.jsx`, with small supporting files for testable logic and frontend test setup.

**Tech Stack:** React 18, Vite 5, Vitest, Testing Library, existing REST API integrations

---

## File Structure

### Files to modify

- `frontend/package.json`
  - Add test tooling scripts and dev dependencies for frontend TDD.
- `frontend/src/App.jsx`
  - Rebuild step layouts and UI states for patient context, KOOS, KL, IMU, final report, and exercise videos.
- `frontend/vite.config.js`
  - Add a minimal test configuration if needed so jsdom-based component tests run consistently.

### Files to create

- `frontend/src/clinicalWizardConfig.js`
  - Owns KOOS 14x3 pagination metadata, category tag mapping, and exercise video display helpers.
- `frontend/src/clinicalWizardConfig.test.js`
  - Verifies KOOS pagination, mixed-section tag behavior, and video helper behavior.
- `frontend/src/App.test.jsx`
  - Covers the new UI states at the integration level.
- `frontend/src/test/setup.js`
  - Testing Library setup.

---

### Task 1: Add Frontend Test Tooling

**Files:**
- Modify: `frontend/package.json`
- Modify: `frontend/vite.config.js`
- Create: `frontend/src/test/setup.js`

- [ ] **Step 1: Write the failing test setup changes**

Add the test script and dev dependencies first so the frontend can run red/green tests:

```json
{
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "test": "vitest run"
  },
  "devDependencies": {
    "@testing-library/jest-dom": "^6.6.3",
    "@testing-library/react": "^16.0.1",
    "@testing-library/user-event": "^14.5.2",
    "@vitejs/plugin-react": "^4.3.1",
    "jsdom": "^25.0.1",
    "vite": "^5.4.2",
    "vitest": "^2.1.1"
  }
}
```

Add a minimal Vite test block:

```js
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: "./src/test/setup.js",
  },
});
```

Create setup file:

```js
import "@testing-library/jest-dom";
```

- [ ] **Step 2: Run test command to verify tooling is still missing**

Run: `cd frontend && npm test`

Expected: command fails because `vitest` is not installed yet.

- [ ] **Step 3: Install dependencies**

Run: `cd frontend && npm install`

Expected: `added` packages including `vitest`, `jsdom`, and Testing Library dependencies.

- [ ] **Step 4: Run test command to verify the runner starts**

Run: `cd frontend && npm test`

Expected: Vitest starts and exits with `No test files found` or with failing tests once later tasks add them.

- [ ] **Step 5: Commit**

```bash
git add frontend/package.json frontend/vite.config.js frontend/src/test/setup.js frontend/package-lock.json
git commit -m "test: add frontend vitest setup"
```

### Task 2: Extract KOOS Pagination And Video State Helpers

**Files:**
- Create: `frontend/src/clinicalWizardConfig.js`
- Create: `frontend/src/clinicalWizardConfig.test.js`

- [ ] **Step 1: Write the failing unit tests**

Create tests for the approved KOOS rules and video-state helpers:

```js
import { describe, expect, it } from "vitest";
import {
  EXERCISE_VIDEO_ORDER,
  buildKoosPanels,
  getPanelCategoryMeta,
  getSelectedVideo,
} from "./clinicalWizardConfig";

describe("buildKoosPanels", () => {
  it("builds 14 panels with 3 questions each", () => {
    const panels = buildKoosPanels();
    expect(panels).toHaveLength(14);
    expect(panels.every((panel) => panel.questions.length === 3)).toBe(true);
  });

  it("keeps q1 through q42 in sequence", () => {
    const ids = buildKoosPanels().flatMap((panel) => panel.questions);
    expect(ids).toEqual(Array.from({ length: 42 }, (_, index) => index + 1));
  });
});

describe("getPanelCategoryMeta", () => {
  it("uses the first question category as the visible tag", () => {
    expect(getPanelCategoryMeta([9, 10, 11]).tag).toBe("Pain");
  });

  it("marks mixed panels with an includes-next-section note", () => {
    expect(getPanelCategoryMeta([9, 10, 11]).note).toBe("Includes next section");
  });
});

describe("getSelectedVideo", () => {
  it("returns the first recommendation when nothing is selected", () => {
    expect(getSelectedVideo(EXERCISE_VIDEO_ORDER, null).id).toBe(EXERCISE_VIDEO_ORDER[0].id);
  });

  it("returns the requested video when it exists", () => {
    const selected = EXERCISE_VIDEO_ORDER[1];
    expect(getSelectedVideo(EXERCISE_VIDEO_ORDER, selected.id).id).toBe(selected.id);
  });
});
```

- [ ] **Step 2: Run the unit tests to verify they fail**

Run: `cd frontend && npm test -- src/clinicalWizardConfig.test.js`

Expected: FAIL with module-not-found or missing-export errors for `clinicalWizardConfig.js`.

- [ ] **Step 3: Write the minimal helper module**

Create the helper module with explicit boundaries:

```js
const KOOS_CATEGORY_RANGES = [
  { start: 1, end: 9, tag: "Pain" },
  { start: 10, end: 16, tag: "Symptoms" },
  { start: 17, end: 33, tag: "Daily living" },
  { start: 34, end: 38, tag: "Sport / recreation" },
  { start: 39, end: 42, tag: "Quality of life" },
];

export const EXERCISE_VIDEO_ORDER = [
  { id: "advanced-squats" },
  { id: "lateral-step-downs" },
  { id: "return-to-running-drills" },
];

function getQuestionCategory(questionNumber) {
  return KOOS_CATEGORY_RANGES.find(
    (range) => questionNumber >= range.start && questionNumber <= range.end,
  )?.tag;
}

export function buildKoosPanels() {
  const questions = Array.from({ length: 42 }, (_, index) => index + 1);
  const panels = [];

  for (let index = 0; index < questions.length; index += 3) {
    const panelQuestions = questions.slice(index, index + 3);
    panels.push({
      id: `panel-${panels.length + 1}`,
      questions: panelQuestions,
      categoryMeta: getPanelCategoryMeta(panelQuestions),
    });
  }

  return panels;
}

export function getPanelCategoryMeta(questionNumbers) {
  const firstTag = getQuestionCategory(questionNumbers[0]);
  const hasMixedCategories = questionNumbers.some(
    (questionNumber) => getQuestionCategory(questionNumber) !== firstTag,
  );

  return {
    tag: firstTag,
    note: hasMixedCategories ? "Includes next section" : "",
  };
}

export function getSelectedVideo(videos, selectedVideoId) {
  return videos.find((video) => video.id === selectedVideoId) || videos[0] || null;
}
```

- [ ] **Step 4: Run the unit tests to verify they pass**

Run: `cd frontend && npm test -- src/clinicalWizardConfig.test.js`

Expected: PASS for all helper tests.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/clinicalWizardConfig.js frontend/src/clinicalWizardConfig.test.js
git commit -m "feat: extract wizard config helpers"
```

### Task 3: Lock The Patient And KOOS UI With Integration Tests

**Files:**
- Create: `frontend/src/App.test.jsx`
- Modify: `frontend/src/App.jsx`

- [ ] **Step 1: Write the failing integration tests for patient context and KOOS**

Create an initial UI test file:

```jsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "./App";

describe("clinical wizard patient and KOOS flow", () => {
  it("shows the redesigned patient context summary cards", () => {
    render(<App />);
    expect(screen.getByText(/saved sessions/i)).toBeInTheDocument();
    expect(screen.getByText(/latest rom/i)).toBeInTheDocument();
    expect(screen.getByText(/latest date/i)).toBeInTheDocument();
  });

  it("shows KOOS in 14 panels with category tags", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: /koos questionnaire/i }));

    expect(screen.getByText(/panel 1 of 14/i)).toBeInTheDocument();
    expect(screen.getByText(/pain/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the integration tests to verify they fail**

Run: `cd frontend && npm test -- src/App.test.jsx`

Expected: FAIL because the current UI does not render the new patient summary and KOOS panel labels.

- [ ] **Step 3: Rebuild patient context and KOOS in `App.jsx`**

Implement the minimal UI changes needed to satisfy the tests first:

```jsx
import { buildKoosPanels } from "./clinicalWizardConfig";

const KOOS_PANELS = buildKoosPanels();

function renderPatientStats() {
  return (
    <div className="metricGrid patientStatsGrid">
      <article className="metricCard">
        <small>{t.labels.savedSessions}</small>
        <strong>{patientSessions.length}</strong>
      </article>
      <article className="metricCard">
        <small>{t.labels.latestRom}</small>
        <strong>{latestSession ? `${f(latestSession.current_rom, "°")}` : "-"}</strong>
      </article>
      <article className="metricCard">
        <small>{t.labels.latestDate}</small>
        <strong>{latestSession ? formatDateTime(latestSession.created_at) : "-"}</strong>
      </article>
    </div>
  );
}

function renderKoosPanelHeader(currentPanel, panelIndex) {
  return (
    <header className="koosPanelHeader">
      <div>
        <small>{`Panel ${panelIndex + 1} of ${KOOS_PANELS.length}`}</small>
        <h3>{t.steps.koos}</h3>
      </div>
      <div className="koosTagGroup">
        <span className="chip teal">{currentPanel.categoryMeta.tag}</span>
        {currentPanel.categoryMeta.note ? (
          <small className="muted">{currentPanel.categoryMeta.note}</small>
        ) : null}
      </div>
    </header>
  );
}
```

- [ ] **Step 4: Run the integration tests to verify they pass**

Run: `cd frontend && npm test -- src/App.test.jsx`

Expected: PASS for patient context and KOOS header tests.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/App.jsx frontend/src/App.test.jsx
git commit -m "feat: redesign patient and KOOS steps"
```

### Task 4: Add KOOS 3D Slide Navigation And Readiness Coverage

**Files:**
- Modify: `frontend/src/App.test.jsx`
- Modify: `frontend/src/App.jsx`

- [ ] **Step 1: Write the failing interaction tests**

Extend the integration tests:

```jsx
it("moves to the next KOOS panel and updates the visible tag", async () => {
  const user = userEvent.setup();
  render(<App />);

  await user.click(screen.getByRole("button", { name: /koos questionnaire/i }));
  await user.click(screen.getByLabelText(/option mild for p1/i));
  await user.click(screen.getByLabelText(/option mild for p2/i));
  await user.click(screen.getByLabelText(/option mild for p3/i));
  await user.click(screen.getByRole("button", { name: /next questions/i }));

  expect(screen.getByText(/panel 2 of 14/i)).toBeInTheDocument();
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd frontend && npm test -- src/App.test.jsx`

Expected: FAIL because the current KOOS step does not expose the new navigation labels or motion container.

- [ ] **Step 3: Implement the panel transition and navigation**

Add a lightweight motion wrapper and explicit panel navigation:

```jsx
<div className={`koosPanelViewport ${koosDirection > 0 ? "forward" : "backward"}`}>
  <section key={currentKoosPanel.id} className="koosPanelCard">
    {renderKoosPanelHeader(currentKoosPanel, koosPageIndex)}
    {currentKoosPanel.questions.map((questionNumber) => (
      <QuestionRow key={questionNumber} questionNumber={questionNumber} />
    ))}
  </section>
</div>
```

```js
function goToKoosPanel(nextIndex) {
  setKoosDirection(nextIndex > koosPageIndex ? 1 : -1);
  setKoosPageIndex(nextIndex);
}
```

```css
.koosPanelViewport {
  perspective: 1200px;
  overflow: hidden;
}

.koosPanelCard {
  animation: koos-panel-enter 260ms ease;
  transform-origin: center;
}

.koosPanelViewport.forward .koosPanelCard {
  animation-name: koos-panel-enter-forward;
}

.koosPanelViewport.backward .koosPanelCard {
  animation-name: koos-panel-enter-backward;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd frontend && npm test -- src/App.test.jsx`

Expected: PASS, and KOOS still advances only after the current three answers are completed.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/App.jsx frontend/src/App.test.jsx
git commit -m "feat: add KOOS panel transitions"
```

### Task 5: Redesign KL And IMU Result States

**Files:**
- Modify: `frontend/src/App.test.jsx`
- Modify: `frontend/src/App.jsx`

- [ ] **Step 1: Write the failing UI tests for KL and IMU result layouts**

Add tests that target the post-analysis surfaces with seeded state:

```jsx
it("renders the KL result summary when a grade is available", () => {
  window.localStorage.setItem(
    "orthoscan-ai.ui-state",
    JSON.stringify({
      active_step: "kl",
      kl_result: { kl_grade: 4, confidence: 49.6 },
    }),
  );

  render(<App />);

  expect(screen.getByText(/kl grading completed/i)).toBeInTheDocument();
  expect(screen.getByText(/confidence/i)).toBeInTheDocument();
});

it("renders the IMU score summary when analysis data is available", () => {
  window.localStorage.setItem(
    "orthoscan-ai.ui-state",
    JSON.stringify({
      active_step: "imu",
      imu_result: { current_rom: 46.1, delta_rom: 0, movement_score: 78.1 },
    }),
  );

  render(<App />);

  expect(screen.getByText(/imu analysis completed/i)).toBeInTheDocument();
  expect(screen.getByText(/78.1/i)).toBeInTheDocument();
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd frontend && npm test -- src/App.test.jsx`

Expected: FAIL because the current UI does not render the new result-state headings.

- [ ] **Step 3: Implement the KL and IMU redesigned states**

Add explicit state branches in `App.jsx`:

```jsx
const hasKlResult = Boolean(klResult?.kl_grade !== undefined && klResult?.kl_grade !== null);
const hasImuResult = Boolean(imuResult?.movement_score !== undefined && imuResult?.movement_score !== null);
```

```jsx
{hasKlResult ? (
  <section className="analysisSplit">
    <article className="imageResultCard">{/* uploaded image preview */}</article>
    <article className="resultSummaryCard">{/* grade, confidence, CTA */}</article>
  </section>
) : (
  <section className="analysisSplit">{/* upload state */}</section>
)}
```

```jsx
{hasImuResult ? (
  <section className="analysisDashboard">
    <article className="uploadSummaryCard">{/* CSV summary */}</article>
    <article className="metricDashboard">{/* score, ROM, delta, smoothness */}</article>
  </section>
) : (
  <section className="analysisDashboard">{/* upload state */}</section>
)}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd frontend && npm test -- src/App.test.jsx`

Expected: PASS for KL and IMU result-state coverage.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/App.jsx frontend/src/App.test.jsx
git commit -m "feat: redesign KL and IMU steps"
```

### Task 6: Redesign Final Report And Exercise Videos

**Files:**
- Modify: `frontend/src/App.test.jsx`
- Modify: `frontend/src/App.jsx`

- [ ] **Step 1: Write the failing UI tests for report and video states**

Add report and videos coverage:

```jsx
it("renders the final rehab score hero when report data exists", () => {
  window.localStorage.setItem(
    "orthoscan-ai.ui-state",
    JSON.stringify({
      active_step: "report",
      report_result: { predicted_delta_KOOS: 100, rehab_level: 5, KOOS_pre: 42.6 },
    }),
  );

  render(<App />);

  expect(screen.getByText(/overall rehab progress score/i)).toBeInTheDocument();
  expect(screen.getByText(/100 \/ 100/i)).toBeInTheDocument();
});

it("switches the primary exercise video when another card is selected", async () => {
  const user = userEvent.setup();
  window.localStorage.setItem(
    "orthoscan-ai.ui-state",
    JSON.stringify({
      active_step: "videos",
      report_result: { rehab_level: 5, predicted_delta_KOOS: 100 },
    }),
  );

  render(<App />);

  await user.click(screen.getByRole("button", { name: /lateral step-downs/i }));

  expect(screen.getByRole("heading", { name: /lateral step-downs/i })).toBeInTheDocument();
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd frontend && npm test -- src/App.test.jsx`

Expected: FAIL because the current report and exercise video screens do not match the new states.

- [ ] **Step 3: Implement the final report and video redesign**

Add a score-led report hero and a two-state videos experience:

```jsx
const [selectedVideoId, setSelectedVideoId] = useState(null);
const selectedVideo = getSelectedVideo(recommendedVideos, selectedVideoId);
const secondaryVideos = recommendedVideos.filter((video) => video.id !== selectedVideo?.id);
```

```jsx
<section className="reportHeroBand">
  <div>
    <small>{t.labels.overallRehabProgressScore}</small>
    <strong>{`${f(reportScore)} / 100`}</strong>
  </div>
  <div>{/* rehab stage summary */}</div>
</section>
```

```jsx
<section className="videosExperience">
  {selectedVideo ? (
    <article className="primaryVideoStage">
      <h3>{selectedVideo.title}</h3>
      <iframe title={selectedVideo.title} src={selectedVideo.embedUrl} />
    </article>
  ) : null}
  <aside className="videoSelectionRail">
    {secondaryVideos.map((video) => (
      <button key={video.id} type="button" onClick={() => setSelectedVideoId(video.id)}>
        {video.title}
      </button>
    ))}
  </aside>
</section>
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd frontend && npm test -- src/App.test.jsx`

Expected: PASS for the report hero and exercise-video switching behavior.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/App.jsx frontend/src/App.test.jsx frontend/src/clinicalWizardConfig.js
git commit -m "feat: redesign report and exercise videos"
```

### Task 7: Full Frontend Verification

**Files:**
- Modify: `frontend/src/App.jsx`
- Modify: `frontend/src/App.test.jsx`
- Modify: `frontend/src/clinicalWizardConfig.js`

- [ ] **Step 1: Run the focused frontend test suite**

Run: `cd frontend && npm test`

Expected: PASS for helper and integration tests.

- [ ] **Step 2: Run the production build**

Run: `cd frontend && npm run build`

Expected:

```text
vite v5.x.x building for production...
✓ built in <time>
```

- [ ] **Step 3: Fix any final regressions with minimal edits**

If a test or build fails, fix only the surfaced issue before re-running the same command.

- [ ] **Step 4: Re-run verification**

Run:

```bash
cd frontend && npm test
cd frontend && npm run build
```

Expected: both commands pass cleanly.

- [ ] **Step 5: Commit**

```bash
git add frontend/package.json frontend/package-lock.json frontend/vite.config.js frontend/src/App.jsx frontend/src/App.test.jsx frontend/src/clinicalWizardConfig.js frontend/src/clinicalWizardConfig.test.js frontend/src/test/setup.js
git commit -m "feat: ship clinical wizard redesign"
```

---

## Self-Review

### Spec coverage

- Patient context redesign: covered in Task 3.
- KOOS `14 x 3` pagination and category tags: covered in Task 2 and Task 3.
- KOOS slide with slight 3D turn: covered in Task 4.
- KL upload/result states: covered in Task 5.
- IMU upload/result states: covered in Task 5.
- Final report redesign: covered in Task 6.
- Exercise video library and watching states: covered in Task 6.
- Frontend-only verification: covered in Task 7.

### Placeholder scan

- No `TODO`, `TBD`, or “implement later” markers remain.
- Every task includes explicit files, commands, and concrete code samples.

### Type consistency

- KOOS panel helpers use `buildKoosPanels` and `getPanelCategoryMeta` consistently across tests and implementation.
- Video state uses `getSelectedVideo` and `selectedVideoId` consistently across tests and implementation.

