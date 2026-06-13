import { useEffect, useMemo, useRef, useState } from "react";
import {
  buildKoosPanels,
  clampScore,
  getExerciseVideosForScore,
  mapRawRehabScoreTo100,
  rehabLevelFromScore,
  rehabMeaningFromScore,
  RAW_SCORE_MAPPING_HIGH,
  RAW_SCORE_MAPPING_LOW,
  getSelectedVideo,
} from "./clinicalWizardConfig";
import FormulaBreakdown from "./components/FormulaBreakdown";

function normalizeApiBaseUrl(value) {
  const trimmed = String(value || "").trim();
  return trimmed ? trimmed.replace(/\/+$/, "") : "";
}

// Vercel should host the frontend only. All API state, including IMU data,
// remains on the external backend defined by VITE_API_BASE_URL.
const API_BASE_URL = normalizeApiBaseUrl(import.meta.env.VITE_API_BASE_URL);
const API = API_BASE_URL ? `${API_BASE_URL}/api` : "/api";
const KL_ACCEPT = "image/png,image/jpeg,image/jpg,image/bmp,image/tiff";
const IMU_ACCEPT = ".csv,text/csv";
const KL_FILE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "bmp", "tiff"]);
const IMU_FILE_EXTENSIONS = new Set(["csv"]);
const APP_STORAGE_KEY = "orthoscan-ai.ui-state";
const DEFAULT_STEP = "patient";

function canUseStorage() {
  try {
    return typeof window !== "undefined" && Boolean(window.localStorage);
  } catch {
    return false;
  }
}

function readStoredAppState() {
  if (!canUseStorage()) return {};
  try {
    const raw = window.localStorage.getItem(APP_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function safeStep(step) {
  return STEPS.some((item) => item.id === step) ? step : DEFAULT_STEP;
}

function writeStoredAppState(state) {
  if (!canUseStorage()) return;
  try {
    window.localStorage.setItem(APP_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Ignore storage failures in private mode / quota errors.
  }
}

const STEPS = [
  { id: "patient" },
  { id: "koos" },
  { id: "kl" },
  { id: "imu" },
  { id: "report" },
  { id: "videos" },
];

const STEP_HEADINGS = {
  patient: [
    { id: "patient-overview", key: "overview" },
    { id: "patient-context", key: "patientDetails" },
    { id: "patient-history", key: "sessionHistory" },
  ],
  koos: [
    { id: "koos-overview", key: "overview" },
    { id: "koos-progress", key: "progress" },
    { id: "koos-current", key: "currentQuestions" },
    { id: "koos-calculate", key: "calculateKoos" },
  ],
  kl: [
    { id: "kl-overview", key: "overview" },
    { id: "kl-upload", key: "imageUpload" },
    { id: "kl-result", key: "klResult" },
  ],
  imu: [
    { id: "imu-overview", key: "overview" },
    { id: "imu-upload", key: "csvUpload" },
    { id: "imu-result", key: "analysisResult" },
  ],
  report: [
    { id: "report-summary", key: "summary" },
    { id: "report-interpretation", key: "interpretation" },
    { id: "report-recommendations", key: "recommendations" },
    { id: "report-session", key: "sessionDetails" },
  ],
  videos: [
    { id: "videos-overview", key: "overview" },
    { id: "videos-library", key: "exerciseVideos" },
  ],
};

const KOOS_PANELS = buildKoosPanels();
const KOOS_PANEL_TAG_KEYS = {
  Pain: "pain",
  Symptoms: "symptoms",
  "Daily living": "adl",
  "Sport / recreation": "sport_rec",
  "Quality of life": "qol",
};
const KOOS_SUBSCALE_ORDER = ["pain", "symptoms", "adl", "sport_rec", "qol"];

const KOOS_QUESTION_TEXT = {
  q1: "P1. How often do you experience knee pain?",
  q2: "P2. Twisting/pivoting on your knee",
  q3: "P3. Straightening knee fully",
  q4: "P4. Bending knee fully",
  q5: "P5. Walking on flat surface",
  q6: "P6. Going up or down stairs",
  q7: "P7. At night while in bed",
  q8: "P8. Sitting or lying",
  q9: "P9. Standing upright",
  q10: "S1. Do you have swelling in your knee?",
  q11: "S2. Do you feel grinding, hear clicking, or any other noise when your knee moves?",
  q12: "S3. Does your knee catch or hang up when moving?",
  q13: "S4. Can you straighten your knee fully?",
  q14: "S5. Can you bend your knee fully?",
  q15: "S6. How severe is your knee joint stiffness after first wakening in the morning?",
  q16: "S7. How severe is your knee stiffness after sitting, lying, or resting later in the day?",
  q17: "A1. Descending stairs",
  q18: "A2. Ascending stairs",
  q19: "A3. Rising from sitting",
  q20: "A4. Standing",
  q21: "A5. Bending to floor / picking up an object",
  q22: "A6. Walking on flat surface",
  q23: "A7. Getting in/out of car",
  q24: "A8. Going shopping",
  q25: "A9. Putting on socks/stockings",
  q26: "A10. Rising from bed",
  q27: "A11. Taking off socks/stockings",
  q28: "A12. Lying in bed / turning over",
  q29: "A13. Getting in/out of bath",
  q30: "A14. Sitting",
  q31: "A15. Getting on/off toilet",
  q32: "A16. Heavy domestic duties",
  q33: "A17. Light domestic duties",
  q34: "SP1. Squatting",
  q35: "SP2. Running",
  q36: "SP3. Jumping",
  q37: "SP4. Twisting/pivoting on your injured knee",
  q38: "SP5. Kneeling",
  q39: "Q1. How often are you aware of your knee problem?",
  q40: "Q2. Have you modified your lifestyle to avoid potentially damaging activities to your knee?",
  q41: "Q3. How much are you troubled with lack of confidence in your knee?",
  q42: "Q4. In general, how much difficulty do you have with your knee?",
};

const KOOS_QUESTION_TEXT_I18N = {
  en: KOOS_QUESTION_TEXT,
  ru: {
    q1: "P1. Как часто вы испытываете боль в колене?",
    q2: "P2. Поворот или разворот на колене",
    q3: "P3. Полное выпрямление колена",
    q4: "P4. Полное сгибание колена",
    q5: "P5. Ходьба по ровной поверхности",
    q6: "P6. Подъем или спуск по лестнице",
    q7: "P7. Ночью в постели",
    q8: "P8. Сидя или лежа",
    q9: "P9. Стоя прямо",
    q10: "S1. Бывает ли отек колена?",
    q11: "S2. Чувствуете ли вы скрежет, щелчки или другой шум при движении колена?",
    q12: "S3. Заедает ли колено при движении?",
    q13: "S4. Можете ли вы полностью выпрямить колено?",
    q14: "S5. Можете ли вы полностью согнуть колено?",
    q15: "S6. Насколько сильна скованность колена утром после пробуждения?",
    q16: "S7. Насколько сильна скованность колена после сидения, лежания или отдыха днем?",
    q17: "A1. Спуск по лестнице",
    q18: "A2. Подъем по лестнице",
    q19: "A3. Вставание со стула",
    q20: "A4. Стояние",
    q21: "A5. Наклон к полу / поднятие предмета",
    q22: "A6. Ходьба по ровной поверхности",
    q23: "A7. Посадка в автомобиль / выход из автомобиля",
    q24: "A8. Поход за покупками",
    q25: "A9. Надевание носков или чулок",
    q26: "A10. Подъем с кровати",
    q27: "A11. Снятие носков или чулок",
    q28: "A12. Лежание в постели / переворачивание",
    q29: "A13. Вход в ванну / выход из ванны",
    q30: "A14. Сидение",
    q31: "A15. Посадка на туалет / вставание",
    q32: "A16. Тяжелая домашняя работа",
    q33: "A17. Легкая домашняя работа",
    q34: "SP1. Приседание",
    q35: "SP2. Бег",
    q36: "SP3. Прыжки",
    q37: "SP4. Поворот или разворот на травмированном колене",
    q38: "SP5. Стояние на коленях",
    q39: "Q1. Как часто вы ощущаете проблему с коленом?",
    q40: "Q2. Изменили ли вы образ жизни, чтобы избегать потенциально вредных нагрузок на колено?",
    q41: "Q3. Насколько вас беспокоит недостаток уверенности в колене?",
    q42: "Q4. В целом, насколько большие трудности вызывает ваше колено?",
  },
  kz: {
    q1: "P1. Тізеңіз қаншалықты жиі ауырады?",
    q2: "P2. Тізеде бұрылу немесе айналу",
    q3: "P3. Тізені толық жазу",
    q4: "P4. Тізені толық бүгу",
    q5: "P5. Тегіс жерде жүру",
    q6: "P6. Баспалдақпен көтерілу немесе түсу",
    q7: "P7. Түнде төсекте",
    q8: "P8. Отырғанда немесе жатқанда",
    q9: "P9. Тік тұрған кезде",
    q10: "S1. Тізеңіз ісіне ме?",
    q11: "S2. Тізе қозғалғанда сықыр, шерту немесе басқа дыбыс сезіле ме?",
    q12: "S3. Қозғалғанда тізеңіз тұрып қала ма?",
    q13: "S4. Тізеңізді толық жаза аласыз ба?",
    q14: "S5. Тізеңізді толық бүге аласыз ба?",
    q15: "S6. Таңертең оянғаннан кейін тізе сіресуі қаншалықты қатты?",
    q16: "S7. Күн ішінде отырғаннан, жатқаннан немесе демалғаннан кейін сіресу қаншалықты қатты?",
    q17: "A1. Баспалдақпен түсу",
    q18: "A2. Баспалдақпен көтерілу",
    q19: "A3. Отырған жерден тұру",
    q20: "A4. Тұру",
    q21: "A5. Еденге еңкею / зат көтеру",
    q22: "A6. Тегіс жерде жүру",
    q23: "A7. Көлікке кіру / көліктен шығу",
    q24: "A8. Дүкенге бару",
    q25: "A9. Шұлық немесе чулки кию",
    q26: "A10. Төсектен тұру",
    q27: "A11. Шұлық немесе чулки шешу",
    q28: "A12. Төсекте жату / аударылу",
    q29: "A13. Ваннаға кіру / ваннадан шығу",
    q30: "A14. Отыру",
    q31: "A15. Дәретханаға отыру / тұру",
    q32: "A16. Ауыр үй жұмыстары",
    q33: "A17. Жеңіл үй жұмыстары",
    q34: "SP1. Отыру-тұру",
    q35: "SP2. Жүгіру",
    q36: "SP3. Секіру",
    q37: "SP4. Зақымдалған тізеде бұрылу немесе айналу",
    q38: "SP5. Тізерлеу",
    q39: "Q1. Тізе мәселесін қаншалықты жиі сезесіз?",
    q40: "Q2. Тізеге зиян келтіруі мүмкін әрекеттерден қашу үшін өмір салтыңызды өзгерттіңіз бе?",
    q41: "Q3. Тізеңізге сенімсіздік сізді қаншалықты мазалайды?",
    q42: "Q4. Жалпы, тізеңіз сізге қаншалықты қиындық тудырады?",
  },
};

const KOOS_SEVERITY_OPTIONS = [
  { value: 0, label: "None / no problem" },
  { value: 1, label: "Mild" },
  { value: 2, label: "Moderate" },
  { value: 3, label: "Severe" },
  { value: 4, label: "Extreme" },
];

const KOOS_FREQUENCY_OPTIONS = [
  { value: 0, label: "Never" },
  { value: 1, label: "Rarely/Monthly" },
  { value: 2, label: "Sometimes/Weekly" },
  { value: 3, label: "Often/Daily" },
  { value: 4, label: "Always/Constantly" },
];

const KOOS_FREQUENCY_KEYS = new Set(["q1", "q39", "q40"]);

const EXERCISES = [
  { value: "knee_extension", label: "Knee extension" },
  { value: "walking", label: "Walking" },
  { value: "going_up", label: "Going up stairs" },
  { value: "going_down", label: "Going down stairs" },
];

const SENSOR_SETUPS = [
  { value: "right_thigh", label: "Single sensor - Right thigh" },
  { value: "right_shin", label: "Single sensor - Right shin" },
  { value: "right_foot", label: "Single sensor - Right foot" },
  { value: "left_thigh", label: "Single sensor - Left thigh" },
  { value: "left_shin", label: "Single sensor - Left shin" },
  { value: "left_foot", label: "Single sensor - Left foot" },
  { value: "both_legs_6imu_2emg", label: "Both legs - 6 IMU + 2 EMG" },
  { value: "auto", label: "Auto-detect from CSV" },
];

const REALTIME_IMU_COPY = {
  en: {
    title: "Real IMU sensor feed",
    latestSensor: "Live IMU sensor",
    cardTitle: "Sensor cards",
    raspberryPiSensors: "Raspberry Pi IMU sensors (left leg)",
    bluetoothSensors: "WitMotion IMU sensors (right leg)",
    hipSensor: "Hip sensor",
    kneeSensor: "Knee / thigh sensor",
    ankleSensor: "Ankle / shin sensor",
    recentTable: "Recent IMU data (latest 5)",
    refreshNote: "Auto-refresh every 1.5 seconds",
    noSensor: "Waiting for live sensor data.",
    waitingForSensor: "Waiting for sensor",
    noRows: "No IMU samples received yet.",
    source: "Source",
    raspberryPiSource: "Raspberry Pi",
    bluetoothSource: "WitMotion",
    unknownSource: "Unknown",
    timestamp: "Timestamp",
    deviceId: "Device ID",
    leg: "Leg",
    bodyPart: "Body part",
    liveStatus: "Live status",
    online: "Online",
    waitingForData: "Waiting for data",
    lastUpdated: "Last updated",
    pitch: "Pitch",
    roll: "Roll",
    yaw: "Yaw",
    accX: "Acc X",
    accY: "Acc Y",
    accZ: "Acc Z",
    temp: "Temp",
    label: "Label",
  },
  ru: {
    title: "Поток реального IMU",
    latestSensor: "Реальный IMU датчик",
    cardTitle: "Карточки датчиков",
    raspberryPiSensors: "Raspberry Pi IMU датчики (левая нога)",
    bluetoothSensors: "WitMotion IMU датчики (правая нога)",
    hipSensor: "Датчик бедра",
    kneeSensor: "Датчик колена / бедра",
    ankleSensor: "Датчик лодыжки / голени",
    recentTable: "Последние данные IMU (live)",
    refreshNote: "Автообновление каждые 1.5 секунды",
    noSensor: "Ожидание данных от реального датчика.",
    waitingForSensor: "Ожидание датчика",
    noRows: "Пока нет полученных IMU сэмплов.",
    source: "Источник",
    raspberryPiSource: "Raspberry Pi",
    bluetoothSource: "WitMotion",
    unknownSource: "Неизвестно",
    timestamp: "Время",
    deviceId: "ID устройства",
    leg: "Нога",
    bodyPart: "Часть тела",
    liveStatus: "Статус",
    online: "Онлайн",
    waitingForData: "Ожидание данных",
    lastUpdated: "Последнее обновление",
    pitch: "Pitch",
    roll: "Roll",
    yaw: "Yaw",
    accX: "Acc X",
    accY: "Acc Y",
    accZ: "Acc Z",
    temp: "Temp",
    label: "Label",
  },
  kz: {
    title: "Нақты IMU ағыны",
    latestSensor: "Нақты IMU сенсоры",
    cardTitle: "Сенсор карталары",
    raspberryPiSensors: "Raspberry Pi IMU сенсорлары (сол аяқ)",
    bluetoothSensors: "WitMotion IMU сенсорлары (оң аяқ)",
    hipSensor: "Жамбас сенсоры",
    kneeSensor: "Тізе / сан сенсоры",
    ankleSensor: "Тобық / жіліншік сенсоры",
    recentTable: "Соңғы IMU деректері (live)",
    refreshNote: "Әр 1.5 секунд сайын жаңарады",
    noSensor: "Нақты сенсор дерегі күтілуде.",
    waitingForSensor: "Сенсор күтілуде",
    noRows: "Әзірге IMU үлгілері түскен жоқ.",
    source: "Дереккөзі",
    raspberryPiSource: "Raspberry Pi",
    bluetoothSource: "WitMotion",
    unknownSource: "Белгісіз",
    timestamp: "Уақыты",
    deviceId: "Құрылғы ID",
    leg: "Аяқ",
    bodyPart: "Дене бөлігі",
    liveStatus: "Күйі",
    online: "Онлайн",
    waitingForData: "Дерек күтілуде",
    lastUpdated: "Соңғы жаңарту",
    pitch: "Pitch",
    roll: "Roll",
    yaw: "Yaw",
    accX: "Acc X",
    accY: "Acc Y",
    accZ: "Acc Z",
    temp: "Temp",
    label: "Label",
  },
};

const STEP4_IMU_COPY = {
  dataSource: "Data source",
  sourceCsv: "Upload IMU CSV",
  sourceLive: "Real-time IMU data",
  sourceCsvHint: "Upload a recorded IMU CSV file for offline knee ROM analysis.",
  sourceLiveHint: "Use Raspberry Pi sensors for the LEFT leg and WitMotion Bluetooth sensors for the RIGHT leg.",
  csvUploadHelper: "Use CSV if you already recorded data.",
  selectedLeg: "Selected leg",
  leftLeg: "Left leg",
  rightLeg: "Right leg",
  leftSide: "Left",
  rightSide: "Right",
  sensorMappingTitle: "Sensor mapping",
  howItWorksTitle: "How it works",
  legHint: "CSV mode keeps the existing offline workflow. Real-time mode uses fixed left/right hardware mapping.",
  witmotionLiveNote: "Raspberry Pi measures the left leg. WitMotion measures the right leg. Real-time mode uses both together.",
  witmotionMappingNote: "Legacy Bluetooth rows are normalized into the right-leg sensor mapping automatically.",
  witmotionHelperText: "Sensor blocks are shown on their body position. Move each sensor and watch the matching body area rotate.",
  liveMovementTitle: "Live movement visualization",
  realtimeStatusTitle: "Real-time sensor status",
  leftLegPanelTitle: "Left leg — Raspberry Pi",
  rightLegPanelTitle: "Right leg — WitMotion",
  liveSampleTitle: "Live IMU sample data",
  sampleTableHint: "Analyze ROM uses the same rows shown in this table.",
  axisTitle: "Axis and sign configuration",
  calibrationTitle: "Calibration baseline",
  calibrationButton: "Set current position as neutral baseline",
  calibrationHint: "Baseline values are captured from the latest live readings and subtracted before ROM is calculated.",
  axisColumn: "Angle axis",
  signColumn: "Sign",
  waitingStatus: "Waiting",
  baselineWaiting: "Waiting for baseline",
  baselineReady: "Baseline set",
  hipSensor: "Hip sensor",
  kneeSensor: "Thigh/knee sensor",
  ankleSensor: "Ankle/shin sensor",
  liveResultTitle: "Live ROM results",
  liveResultFormula: "Relative angle = distal sensor pitch - proximal sensor pitch. ROM = max(relative angle) - min(relative angle).",
  liveResultEmpty: "Run live analysis after enough sensor samples have been received.",
  liveResultUnavailable: "Not enough calibrated live data is available to calculate ROM yet.",
  liveResultPiWarning: "Left-leg Raspberry Pi ROM needs left thigh/knee (pi2) and left shin/ankle (pi3) sensors.",
  bluetoothMappingWarning: "Right-leg WitMotion ROM needs right thigh/knee and right shin/ankle sensors.",
  liveTableAnalysisLeg: "Analysis leg",
  liveTableSensorRole: "Sensor role",
  liveTableCalibratedAngle: "Calibrated angle",
  leftLegRomTitle: "Left-leg ROM (Raspberry Pi)",
  rightLegRomTitle: "Right-leg ROM (WitMotion)",
  liveCombinedStatus: "Live dual-leg analysis",
};

const STRINGS = {
  en: {
    app: "OrthoScan AI",
    clinicalLine: "Clinical rehabilitation workflow",
    sidebarSubtitle: "Clinical rehabilitation wizard",
    steps: {
      patient: "Patient context",
      koos: "KOOS questionnaire",
      kl: "KL image grading",
      imu: "IMU movement analysis",
      report: "Final rehab report",
      videos: "Exercise videos",
    },
    descriptions: {
      patient: "Set patient and session context before clinical inputs.",
      koos: "Complete the KOOS survey in short pages. Answers are saved as q1 through q42.",
      kl: "Upload a knee image and run KL grading.",
      imu: "Capture or upload IMU movement data to calculate knee ROM.",
      report: "Generate a final rehab report from patient, KOOS, KL, and IMU data.",
      videos: "Review the prescribed exercise video library after the final rehabilitation report.",
    },
    buttons: {
      back: "Back",
      continue: "Continue",
      calculateKoos: "Calculate KOOS",
      calculating: "Calculating...",
      generateReport: "Generate report",
      generating: "Generating...",
      analyzeKl: "Analyze KL grade",
      analyzing: "Analyzing...",
      analyzeImu: "Analyze ROM",
      nextQuestions: "Next questions",
      previousQuestions: "Previous questions",
      continueToKoos: "Continue to KOOS questionnaire",
      continueToKl: "Continue to KL image grading",
      continueToImu: "Continue to IMU movement analysis",
      continueToReport: "Continue to final rehab report",
      continueToVideos: "Continue to exercise videos",
      watchVideo: "Watch video",
      assignVideo: "Assign",
      markWatched: "Mark watched",
      closeVideo: "Close video",
      openOnYouTube: "Open on YouTube",
      removeFile: "Remove file",
      chooseDifferentImage: "Choose different image",
      remove: "Remove",
      rerunImu: "Re-run IMU analysis",
      editImuData: "Edit IMU data",
    },
    status: { pending: "Pending", ready: "Ready", complete: "Complete", demo: "Demo", demoMode: "Demo mode", real: "Real", unknown: "Unknown" },
    reportStatus: { improving: "Improving", stable: "Stable", needs_attention: "Needs attention", insufficient_data: "Needs attention" },
    labels: {
      patientId: "Patient ID",
      patientName: "Patient name (optional)",
      exercise: "Exercise",
      sensorSetup: "Sensor setup",
      patientHistory: "Patient history",
      noSessions: "No sessions yet for this patient.",
      loading: "Loading...",
      savedSessions: "Saved sessions",
      stepComplete: `Step {step} of ${STEPS.length} complete`,
      latestRom: "Latest ROM",
      latestDate: "Latest date",
      patientReady: "Patient context ready",
      onThisStep: "On this step",
      pageOf: "Page",
      panel: "Panel",
      of: "of",
      answered: "answered",
      scoreRange: "0..4 numeric scoring",
      currentRom: "Current ROM",
      previousRom: "Previous ROM",
      rehabScore: "Rehab score",
      rangeOfMotion: "Range of Motion",
      klGrade: "KL grade",
      displayGrade: "Display grade",
      confidence: "Confidence",
      koosPre: "KOOS_pre",
      koosTotal: "KOOS_pre",
      predictedKoosDelta: "Predicted KOOS change",
      deltaRom: "Delta ROM",
      movementResult: "Movement result",
      imuRehabScore: "IMU rehab score",
      modelSource: "Model source",
      formulaResult: "Formula result",
      finalRehabilitationScore: "Final rehabilitation score",
      rehabLevel: "Rehab level",
      answeredQuestions: "Answered questions",
      scorePerQuestion: "Score per question",
      klScale: "KL scale",
      aiAssisted: "AI-assisted",
      smoothness: "Smoothness",
      repetitions: "Repetitions",
      movementStatus: "Movement status",
      readyForReport: "Ready for report",
      duration: "Duration",
      targetArea: "Target area",
      exerciseCount: "Exercise count",
      inputSummary: "Input summary",
      createdAt: "Created at",
      clinicalInputs: "Clinical inputs used",
      betaValues: "Beta values",
      sessionId: "Session ID",
      created: "Created",
    },
    exercises: {
      knee_extension: "Knee extension",
      walking: "Walking",
      going_up: "Going up stairs",
      going_down: "Going down stairs",
    },
    sensorSetups: {
      right_thigh: "Single sensor - Right thigh",
      right_shin: "Single sensor - Right shin",
      right_foot: "Single sensor - Right foot",
      left_thigh: "Single sensor - Left thigh",
      left_shin: "Single sensor - Left shin",
      left_foot: "Single sensor - Left foot",
      both_legs_6imu_2emg: "Both legs - 6 IMU + 2 EMG",
      auto: "Auto-detect from CSV",
    },
    koosSections: {
      pain: "Pain",
      symptoms: "Symptoms",
      adl: "Daily Living",
      sport_rec: "Sport/Recreation",
      qol: "Quality of Life",
    },
    koosPages: {
      pain1: "Pain: questions P1-P5",
      pain2: "Pain: questions P6-P9",
      symptoms1: "Symptoms: questions S1-S5",
      symptoms2: "Symptoms: questions S6-S7",
      adl1: "Daily Living: questions A1-A6",
      adl2: "Daily Living: questions A7-A12",
      adl3: "Daily Living: questions A13-A17",
      sport1: "Sport/Recreation: questions SP1-SP5",
      qol1: "Quality of Life: questions Q1-Q4",
    },
    koosOptions: {
      severity: ["None / no problem", "Mild", "Moderate", "Severe", "Extreme"],
      frequency: ["Never", "Rarely/Monthly", "Sometimes/Weekly", "Often/Daily", "Always/Constantly"],
    },
    upload: {
      selectedImage: "Selected knee image",
      dragImage: "Drag or select knee image",
      imageTypes: "X-ray / radiograph / CT image",
      formats: "PNG, JPG, JPEG, BMP, TIFF",
      uploadImu: "Upload IMU CSV",
      imuTypes: "Single-sensor or multi-sensor CSV",
      selectedImu: "Selected IMU CSV",
    },
    report: {
      summary: "Summary",
      prediction: "Rehabilitation prediction",
      interpretation: "Interpretation",
      recommendations: "Recommendations",
      sessionDetails: "Session details",
      noInterpretation: "No interpretation returned.",
      noRecommendations: "No recommendations returned.",
      noExercises: "No exercise recommendations returned.",
      calculationDetails: "Calculation details",
      recommendationTitle: "Recommendation {number}",
      exercisePlan: "Exercise plan",
      watchVideo: "Watch video",
      exerciseSafetyNote: "These exercises are educational suggestions only. Stop if pain increases and consult a physiotherapist.",
    },
    messages: {
      calculateToReady: "Calculate KOOS on the final page to mark this step ready.",
      completeCurrentPage: "Answer all questions on this page to continue.",
      completeAllKoos: "Answer all 42 KOOS questions before calculating.",
      includesNextSection: "Includes next section",
      noKlResult: "No KL result yet.",
      noImuResult: "No IMU result yet.",
      generateAfterReady: "Generate report after all previous steps are ready.",
      noVideos: "No exercise videos available yet.",
      exercisePlanLevel: "Level {level} exercise plan",
      basedOnFinalScore: "Based on final rehab score: {score}",
      videoPlanDisclaimer: "These exercises are guidance only. A clinician should confirm the final exercise plan.",
    },
    errors: {
      backendOffline: "Backend is not reachable. Please start the backend and try again.",
      klInvalid: "Please upload a valid knee image.",
      imuInvalid: "Please upload a valid IMU CSV sensor recording.",
      wrongKlFile: "Wrong file type. Please choose a valid knee image.",
      wrongImuFile: "Wrong file type. Please choose a CSV file for IMU analysis.",
    },
    completion: {
      patientTitle: "Patient context completed",
      patientText: "Session details are ready for clinical scoring.",
      koosTitle: "KOOS_pre completed",
      koosText: "Pre-rehabilitation questionnaire scoring is ready for image grading.",
      klTitle: "KL grading completed",
      klText: "Image grading is ready for movement analysis.",
      imuTitle: "IMU movement analysis completed",
      imuText: "ROM calculation is ready for the final report.",
      reportTitle: "Final report completed",
      reportText: "Session saved with rehabilitation prediction and recommendations.",
      sessionSaved: "Session saved",
      videosTitle: "Exercise videos ready",
      videosText: "Exercise guidance is available for the current rehabilitation level.",
    },
    klLabels: { 0: "Normal", 1: "Doubtful", 2: "Mild", 3: "Moderate", 4: "Severe" },
    movementStatus: {
      improving: "Improving",
      stable: "Stable / no change yet",
      reduced: "Reduced movement",
      unknown: "Awaiting previous ROM",
    },
    explanations: {
      klExplanation: "KL grade estimates osteoarthritis severity from the knee image.",
      romExplanation: "ROM = knee movement range in degrees.",
      deltaRomExplanation: "Delta ROM = current ROM minus previous ROM.",
      rehabScoreExplanation: "Rehab score = current movement compared with healthy baseline.",
      koosFormula: "KOOS_pre subscale = 100 - (mean answer / 4) × 100. KOOS_pre = average of available KOOS_pre subscales.",
      koosScoring: "Each KOOS question is scored from 0 to 4, where higher symptom burden lowers the KOOS score.",
      klHow: "KL grading is produced from the uploaded knee image by an AI classifier that estimates the most likely Kellgren-Lawrence grade.",
      klSafety: "This is an AI-assisted estimate and should always be reviewed with clinical judgement.",
      imuRomFormula: "ROM = max angle - min angle from the analyzed IMU session.",
      imuSmoothness: "Smoothness reflects gyroscope stability: steadier motion suggests better movement control and less shakiness.",
      imuScoreFormula: "IMU rehab score combines movement range and control, then maps that score into a rehab level for exercise progression.",
      finalPredictionExplanation: "This score combines KOOS_pre, ROM change, and KL grade to estimate rehabilitation progress.",
      higherScoreMeaning: "High mapped score = better rehab condition.",
      lowerScoreMeaning: "Low mapped score = higher rehab need.",
      reportCombination: "KOOS_pre and KL grade affect the report formula, while IMU ROM and rehab score drive change tracking, rehab level, and exercise suggestions.",
      formulaReadable: "predicted_delta_KOOS = β0 + β1×KOOS_pre + β2×signed_delta_ROM + β3_KL",
    },
    reportSections: {
      overallPrediction: "Overall rehabilitation prediction",
      finalRehabilitationScore: "Final rehabilitation score",
      inputSummary: "Input summary",
      scoreExplanation: "Score explanation",
      clinicalInputs: "Clinical inputs used",
      formulaResult: "Calculation details",
      interpretation: "Interpretation",
      recommendations: "Recommendations",
      sessionDetails: "Session details",
      exerciseVideos: "Exercise videos",
    },
    recommendationText: {
      continueProtocol: "Continue current rehab protocol.",
      reevaluateNextSession: "Re-evaluate KOOS and ROM in next session.",
      reviewTechnique: "Review exercise technique and intensity.",
      clinicianFollowUp: "Consider clinician follow-up for plan adjustment.",
      collectMoreSessions: "Collect more sessions to establish trend.",
    },
    toc: {
      overview: "Overview",
      patientDetails: "Patient details",
      sessionHistory: "Session history",
      progress: "Progress",
      currentQuestions: "Current questions",
      calculateKoos: "Calculate KOOS",
      imageUpload: "Image upload",
      klResult: "KL result",
      csvUpload: "CSV upload",
      analysisResult: "Analysis result",
      summary: "Summary",
      interpretation: "Interpretation",
      recommendations: "Recommendations",
      sessionDetails: "Session details",
      exerciseVideos: "Exercise videos",
      liveSensorFeed: "Live sensor feed",
    },
  },
  ru: {
    app: "OrthoScan AI",
    clinicalLine: "Клинический реабилитационный процесс",
    sidebarSubtitle: "Клинический мастер реабилитации",
    steps: {
      patient: "Контекст пациента",
      koos: "Опросник KOOS",
      kl: "KL-оценка снимка",
      imu: "Анализ движения ИМУ",
      report: "Итоговый отчет",
      videos: "Видеоупражнения",
    },
    descriptions: {
      patient: "Укажите пациента и параметры сессии перед клиническими данными.",
      koos: "Заполните KOOS короткими страницами. Ответы сохраняются как q1-q42.",
      kl: "Загрузите снимок колена и выполните KL-оценку.",
      imu: "Загрузите или запишите данные ИМУ, чтобы рассчитать ROM колена.",
      report: "Сформируйте итоговый отчет из данных пациента, KOOS, KL и ИМУ.",
      videos: "Просмотрите библиотеку упражнений после итогового отчета.",
    },
    buttons: {
      back: "Назад",
      continue: "Продолжить",
      refresh: "Обновить",
      refreshing: "Обновление",
      calculateKoos: "Рассчитать KOOS",
      calculating: "Расчет...",
      generateReport: "Сформировать отчет",
      generating: "Формирование...",
      analyzeKl: "Анализ KL",
      analyzing: "Анализ...",
      analyzeImu: "Рассчитать ROM",
      nextQuestions: "Следующие вопросы",
      previousQuestions: "Предыдущие вопросы",
      continueToKoos: "Перейти к опроснику KOOS",
      continueToKl: "Перейти к KL-оценке снимка",
      continueToImu: "Перейти к анализу движения ИМУ",
      continueToReport: "Перейти к итоговому отчету",
      continueToVideos: "Перейти к видеоупражнениям",
      watchVideo: "Смотреть видео",
      assignVideo: "Назначить",
      markWatched: "Отметить просмотр",
      closeVideo: "Закрыть видео",
      openOnYouTube: "Открыть на YouTube",
      removeFile: "Удалить файл",
      chooseDifferentImage: "Выбрать другой снимок",
      remove: "Удалить",
      rerunImu: "Повторить анализ ИМУ",
      editImuData: "Изменить данные ИМУ",
    },
    status: { pending: "Ожидает", ready: "Готово", complete: "Завершено", demo: "Демо", demoMode: "Демо-режим", real: "Реальная", unknown: "Неизвестно" },
    reportStatus: { improving: "Улучшение", stable: "Стабильно", needs_attention: "Требует внимания", insufficient_data: "Требует внимания" },
    labels: {
      patientId: "ID пациента",
      patientName: "Имя пациента (необязательно)",
      exercise: "Упражнение",
      sensorSetup: "Схема датчиков",
      patientHistory: "История пациента",
      noSessions: "Сессий для пациента пока нет.",
      loading: "Загрузка...",
      savedSessions: "Сохраненные сессии",
      stepComplete: `Шаг {step} из ${STEPS.length} завершен`,
      latestRom: "Последний ROM",
      latestDate: "Последняя дата",
      patientReady: "Контекст пациента готов",
      onThisStep: "В этом шаге",
      pageOf: "Страница",
      panel: "Панель",
      of: "из",
      answered: "отвечено",
      scoreRange: "оценка 0..4",
      currentRom: "Текущий ROM",
      previousRom: "Предыдущий ROM",
      rehabScore: "Балл реабилитации",
      rangeOfMotion: "Диапазон движения",
      klGrade: "Степень KL",
      displayGrade: "Отображаемая степень",
      confidence: "Уверенность",
      koosPre: "KOOS_pre",
      koosTotal: "KOOS_pre",
      predictedKoosDelta: "Прогноз изменения KOOS",
      deltaRom: "Изменение ROM",
      movementResult: "Результат движения",
      imuRehabScore: "Балл ИМУ-реабилитации",
      modelSource: "Источник модели",
      formulaResult: "Результат формулы",
      finalRehabilitationScore: "Итоговый балл реабилитации",
      rehabLevel: "Уровень реабилитации",
      answeredQuestions: "Отвечено вопросов",
      scorePerQuestion: "Балл за вопрос",
      klScale: "Шкала KL",
      aiAssisted: "AI-помощь",
      smoothness: "Плавность",
      repetitions: "Повторения",
      movementStatus: "Статус движения",
      readyForReport: "Готово к отчету",
      duration: "Длительность",
      targetArea: "Целевая зона",
      exerciseCount: "Количество упражнений",
      inputSummary: "Сводка исходных данных",
      createdAt: "Создано",
      clinicalInputs: "Использованные клинические данные",
      betaValues: "Значения beta",
      sessionId: "ID сессии",
      created: "Создано",
    },
    exercises: {
      knee_extension: "Разгибание колена",
      walking: "Ходьба",
      going_up: "Подъем по лестнице",
      going_down: "Спуск по лестнице",
    },
    sensorSetups: {
      right_thigh: "Один датчик - правое бедро",
      right_shin: "Один датчик - правая голень",
      right_foot: "Один датчик - правая стопа",
      left_thigh: "Один датчик - левое бедро",
      left_shin: "Один датчик - левая голень",
      left_foot: "Один датчик - левая стопа",
      both_legs_6imu_2emg: "Обе ноги - 6 IMU + 2 EMG",
      auto: "Автоопределение по CSV",
    },
    koosSections: {
      pain: "Боль",
      symptoms: "Симптомы",
      adl: "Повседневная активность",
      sport_rec: "Спорт/активность",
      qol: "Качество жизни",
    },
    koosPages: {
      pain1: "Боль: вопросы P1-P5",
      pain2: "Боль: вопросы P6-P9",
      symptoms1: "Симптомы: вопросы S1-S5",
      symptoms2: "Симптомы: вопросы S6-S7",
      adl1: "Повседневная активность: A1-A6",
      adl2: "Повседневная активность: A7-A12",
      adl3: "Повседневная активность: A13-A17",
      sport1: "Спорт/активность: SP1-SP5",
      qol1: "Качество жизни: Q1-Q4",
    },
    koosOptions: {
      severity: ["Нет / нет проблемы", "Легкая", "Умеренная", "Сильная", "Крайняя"],
      frequency: ["Никогда", "Редко/ежемесячно", "Иногда/еженедельно", "Часто/ежедневно", "Всегда/постоянно"],
    },
    upload: {
      selectedImage: "Выбран снимок колена",
      dragImage: "Перетащите или выберите снимок",
      imageTypes: "Рентген / радиография / КТ",
      formats: "PNG, JPG, JPEG, BMP, TIFF",
      uploadImu: "Загрузить CSV ИМУ",
      imuTypes: "CSV одного датчика или мультисенсорный CSV",
      selectedImu: "Выбран CSV ИМУ",
    },
    report: {
      summary: "Сводка",
      prediction: "Прогноз реабилитации",
      interpretation: "Интерпретация",
      recommendations: "Рекомендации",
      sessionDetails: "Детали сессии",
      noInterpretation: "Интерпретация не получена.",
      noRecommendations: "Рекомендации не получены.",
      noExercises: "Рекомендации по упражнениям не получены.",
      calculationDetails: "Детали расчета",
      recommendationTitle: "Рекомендация {number}",
      exercisePlan: "План упражнений",
      watchVideo: "Смотреть видео",
      exerciseSafetyNote: "Эти упражнения являются только обучающими рекомендациями. Остановитесь при усилении боли и проконсультируйтесь с физиотерапевтом.",
    },
    messages: {
      calculateToReady: "Рассчитайте KOOS на последней странице, чтобы отметить шаг готовым.",
      completeCurrentPage: "Ответьте на все вопросы страницы, чтобы продолжить.",
      completeAllKoos: "Ответьте на все 42 вопроса KOOS перед расчетом.",
      includesNextSection: "Включает следующий раздел",
      noKlResult: "Результата KL пока нет.",
      noImuResult: "Результата ИМУ пока нет.",
      generateAfterReady: "Сформируйте отчет после готовности предыдущих шагов.",
      noVideos: "Видеоупражнения пока недоступны.",
      exercisePlanLevel: "План упражнений уровня {level}",
      basedOnFinalScore: "На основе итогового балла реабилитации: {score}",
      videoPlanDisclaimer: "Эти упражнения служат только ориентиром. Итоговый план упражнений должен подтвердить клиницист.",
    },
    errors: {
      backendOffline: "Бэкенд недоступен. Запустите бэкенд и попробуйте снова.",
      klInvalid: "Загрузите корректный снимок колена.",
      imuInvalid: "Загрузите корректную CSV-запись ИМУ-датчика.",
      wrongKlFile: "Неверный тип файла. Выберите корректный снимок колена.",
      wrongImuFile: "Неверный тип файла. Выберите CSV-файл для анализа ИМУ.",
    },
    completion: {
      patientTitle: "Контекст пациента завершен",
      patientText: "Данные сессии готовы для клинической оценки.",
      koosTitle: "KOOS_pre завершен",
      koosText: "До-реабилитационная оценка опросника готова для анализа снимка.",
      klTitle: "KL-оценка завершена",
      klText: "Оценка снимка готова для анализа движения.",
      imuTitle: "Анализ движения ИМУ завершен",
      imuText: "ROM-расчет готов для итогового отчета.",
      reportTitle: "Итоговый отчет завершен",
      reportText: "Сессия сохранена с прогнозом реабилитации и рекомендациями.",
      sessionSaved: "Сессия сохранена",
      videosTitle: "Видеоупражнения готовы",
      videosText: "Рекомендации по упражнениям доступны для текущего уровня реабилитации.",
    },
    klLabels: { 0: "Норма", 1: "Сомнительная", 2: "Легкая", 3: "Умеренная", 4: "Тяжелая" },
    movementStatus: {
      improving: "Улучшение",
      stable: "Стабильно / пока без изменений",
      reduced: "Движение снижено",
      unknown: "Ожидается предыдущий ROM",
    },
    explanations: {
      klExplanation: "Степень KL оценивает выраженность остеоартрита по снимку колена.",
      romExplanation: "ROM = диапазон движения колена в градусах.",
      deltaRomExplanation: "Delta ROM = текущий ROM минус предыдущий ROM.",
      rehabScoreExplanation: "Балл реабилитации = текущее движение в сравнении со здоровым базовым уровнем.",
      koosFormula: "Подшкала KOOS_pre = 100 - (средний ответ / 4) × 100. KOOS_pre = среднее по доступным подшкалам KOOS_pre.",
      koosScoring: "Каждый вопрос KOOS оценивается от 0 до 4; более выраженные симптомы снижают итоговый балл KOOS.",
      klHow: "KL-оценка формируется по загруженному снимку колена с помощью AI-классификатора, который оценивает наиболее вероятную степень Kellgren-Lawrence.",
      klSafety: "Это AI-оценка с поддержкой врача и она должна проверяться клиническим решением.",
      imuRomFormula: "ROM = максимальный угол - минимальный угол в анализируемой ИМУ-сессии.",
      imuSmoothness: "Плавность отражает стабильность гироскопа: более ровное движение обычно означает лучший контроль и меньше дрожания.",
      imuScoreFormula: "Балл ИМУ-реабилитации объединяет диапазон движения и контроль движения, затем переводится в уровень реабилитации для подбора упражнений.",
      finalPredictionExplanation: "Этот балл объединяет KOOS_pre, изменение ROM и степень KL для оценки прогресса реабилитации.",
      higherScoreMeaning: "Высокий mapped score = лучшее состояние реабилитации.",
      lowerScoreMeaning: "Низкий mapped score = более высокая потребность в реабилитации.",
      reportCombination: "KOOS_pre и степень KL влияют на формулу отчета, а ROM и балл ИМУ влияют на отслеживание изменений, уровень реабилитации и подбор упражнений.",
      formulaReadable: "predicted_delta_KOOS = β0 + β1×KOOS_pre + β2×signed_delta_ROM + β3_KL",
    },
    reportSections: {
      overallPrediction: "Общий прогноз реабилитации",
      finalRehabilitationScore: "Итоговый балл реабилитации",
      inputSummary: "Сводка исходных данных",
      scoreExplanation: "Пояснение балла",
      clinicalInputs: "Использованные клинические данные",
      formulaResult: "Детали расчета",
      interpretation: "Интерпретация",
      recommendations: "Рекомендации",
      sessionDetails: "Детали сессии",
      exerciseVideos: "Видеоупражнения",
    },
    recommendationText: {
      continueProtocol: "Продолжайте текущий протокол реабилитации.",
      reevaluateNextSession: "Повторно оцените KOOS и ROM на следующей сессии.",
      reviewTechnique: "Проверьте технику и интенсивность упражнения.",
      clinicianFollowUp: "Рассмотрите консультацию специалиста для корректировки плана.",
      collectMoreSessions: "Соберите больше сессий, чтобы определить динамику.",
    },
    toc: {
      overview: "Обзор",
      patientDetails: "Данные пациента",
      sessionHistory: "История сессий",
      progress: "Прогресс",
      currentQuestions: "Текущие вопросы",
      calculateKoos: "Расчет KOOS",
      imageUpload: "Загрузка снимка",
      klResult: "Результат KL",
      csvUpload: "Загрузка CSV",
      analysisResult: "Результат анализа",
      summary: "Сводка",
      interpretation: "Интерпретация",
      recommendations: "Рекомендации",
      sessionDetails: "Детали сессии",
      exerciseVideos: "Видеоупражнения",
      liveSensorFeed: "Поток живого датчика",
    },
  },
  kz: {
    app: "OrthoScan AI",
    clinicalLine: "Клиникалық оңалту процесі",
    sidebarSubtitle: "Клиникалық оңалту шебері",
    steps: {
      patient: "Пациент контексті",
      koos: "KOOS сауалнамасы",
      kl: "KL сурет бағасы",
      imu: "ИМУ қозғалыс талдауы",
      report: "Қорытынды есеп",
      videos: "Жаттығу бейнелері",
    },
    descriptions: {
      patient: "Клиникалық деректер алдында пациент пен сессия параметрлерін көрсетіңіз.",
      koos: "KOOS сауалнамасын қысқа беттермен толтырыңыз. Жауаптар q1-q42 ретінде сақталады.",
      kl: "Тізе суретін жүктеп, KL бағасын орындаңыз.",
      imu: "Тізе ROM-ын есептеу үшін ИМУ қозғалыс дерегін жүктеңіз немесе жазыңыз.",
      report: "Пациент, KOOS, KL және ИМУ деректерінен қорытынды есеп жасаңыз.",
      videos: "Қорытынды есептен кейін жаттығу бейнелерін қарап шығыңыз.",
    },
    buttons: {
      back: "Артқа",
      continue: "Жалғастыру",
      refresh: "Жаңарту",
      refreshing: "Жаңартылуда",
      calculateKoos: "KOOS есептеу",
      calculating: "Есептелуде...",
      generateReport: "Есеп жасау",
      generating: "Жасалуда...",
      analyzeKl: "KL талдау",
      analyzing: "Талдануда...",
      analyzeImu: "ROM есептеу",
      nextQuestions: "Келесі сұрақтар",
      previousQuestions: "Алдыңғы сұрақтар",
      continueToKoos: "KOOS сауалнамасына өту",
      continueToKl: "KL сурет бағалауына өту",
      continueToImu: "ИМУ қозғалыс талдауына өту",
      continueToReport: "Қорытынды есепке өту",
      continueToVideos: "Жаттығу бейнелеріне өту",
      watchVideo: "Бейнені көру",
      assignVideo: "Тағайындау",
      markWatched: "Қаралды деп белгілеу",
      closeVideo: "Бейнені жабу",
      openOnYouTube: "YouTube-та ашу",
      removeFile: "Файлды өшіру",
      chooseDifferentImage: "Басқа сурет таңдау",
      remove: "Өшіру",
      rerunImu: "ИМУ талдауын қайталау",
      editImuData: "ИМУ дерегін өңдеу",
    },
    status: { pending: "Күтуде", ready: "Дайын", complete: "Аяқталды", demo: "Демо", demoMode: "Демо режимі", real: "Нақты", unknown: "Белгісіз" },
    reportStatus: { improving: "Жақсару", stable: "Тұрақты", needs_attention: "Назар қажет", insufficient_data: "Назар қажет" },
    labels: {
      patientId: "Пациент ID",
      patientName: "Пациент аты (міндетті емес)",
      exercise: "Жаттығу",
      sensorSetup: "Датчик жинағы",
      patientHistory: "Пациент тарихы",
      noSessions: "Бұл пациент үшін сессия жоқ.",
      loading: "Жүктелуде...",
      savedSessions: "Сақталған сессиялар",
      stepComplete: `${STEPS.length} қадамның {step}-қадамы аяқталды`,
      latestRom: "Соңғы ROM",
      latestDate: "Соңғы күн",
      patientReady: "Пациент контексті дайын",
      onThisStep: "Осы қадамда",
      pageOf: "Бет",
      panel: "Панель",
      of: "ішінен",
      answered: "жауап берілді",
      scoreRange: "0..4 сандық баға",
      currentRom: "Ағымдағы ROM",
      previousRom: "Алдыңғы ROM",
      rehabScore: "Оңалту балы",
      rangeOfMotion: "Қозғалыс диапазоны",
      klGrade: "KL дәрежесі",
      displayGrade: "Көрсетілетін дәреже",
      confidence: "Сенімділік",
      koosPre: "KOOS_pre",
      koosTotal: "KOOS_pre",
      predictedKoosDelta: "KOOS өзгеріс болжамы",
      deltaRom: "ROM өзгерісі",
      movementResult: "Қозғалыс нәтижесі",
      imuRehabScore: "ИМУ оңалту балы",
      modelSource: "Модель көзі",
      formulaResult: "Формула нәтижесі",
      finalRehabilitationScore: "Қорытынды оңалту балы",
      rehabLevel: "Оңалту деңгейі",
      answeredQuestions: "Жауап берілген сұрақтар",
      scorePerQuestion: "Әр сұрақ бағасы",
      klScale: "KL шкаласы",
      aiAssisted: "AI көмегімен",
      smoothness: "Тегістік",
      repetitions: "Қайталау саны",
      movementStatus: "Қозғалыс күйі",
      readyForReport: "Есепке дайын",
      duration: "Ұзақтығы",
      targetArea: "Нысан аймағы",
      exerciseCount: "Жаттығу саны",
      inputSummary: "Кіріс деректер қысқашасы",
      createdAt: "Жасалған уақыты",
      clinicalInputs: "Қолданылған клиникалық деректер",
      betaValues: "Beta мәндері",
      sessionId: "Сессия ID",
      created: "Жасалды",
    },
    exercises: {
      knee_extension: "Тізені жазу",
      walking: "Жүру",
      going_up: "Баспалдақпен көтерілу",
      going_down: "Баспалдақпен түсу",
    },
    sensorSetups: {
      right_thigh: "Бір датчик - оң сан",
      right_shin: "Бір датчик - оң сирақ",
      right_foot: "Бір датчик - оң аяқ",
      left_thigh: "Бір датчик - сол сан",
      left_shin: "Бір датчик - сол сирақ",
      left_foot: "Бір датчик - сол аяқ",
      both_legs_6imu_2emg: "Екі аяқ - 6 IMU + 2 EMG",
      auto: "CSV бойынша автоанықтау",
    },
    koosSections: {
      pain: "Ауырсыну",
      symptoms: "Симптомдар",
      adl: "Күнделікті өмір",
      sport_rec: "Спорт/белсенділік",
      qol: "Өмір сапасы",
    },
    koosPages: {
      pain1: "Ауырсыну: P1-P5",
      pain2: "Ауырсыну: P6-P9",
      symptoms1: "Симптомдар: S1-S5",
      symptoms2: "Симптомдар: S6-S7",
      adl1: "Күнделікті өмір: A1-A6",
      adl2: "Күнделікті өмір: A7-A12",
      adl3: "Күнделікті өмір: A13-A17",
      sport1: "Спорт/белсенділік: SP1-SP5",
      qol1: "Өмір сапасы: Q1-Q4",
    },
    koosOptions: {
      severity: ["Жоқ / мәселе жоқ", "Жеңіл", "Орташа", "Қатты", "Өте қатты"],
      frequency: ["Ешқашан", "Сирек/ай сайын", "Кейде/апта сайын", "Жиі/күн сайын", "Әрдайым/тұрақты"],
    },
    upload: {
      selectedImage: "Тізе суреті таңдалды",
      dragImage: "Суретті сүйреңіз немесе таңдаңыз",
      imageTypes: "Рентген / радиография / КТ",
      formats: "PNG, JPG, JPEG, BMP, TIFF",
      uploadImu: "ИМУ CSV жүктеу",
      imuTypes: "Бір датчик CSV немесе көп датчикті CSV",
      selectedImu: "ИМУ CSV таңдалды",
    },
    report: {
      summary: "Қысқаша",
      prediction: "Оңалту болжамы",
      interpretation: "Түсіндіру",
      recommendations: "Ұсынымдар",
      sessionDetails: "Сессия деректері",
      noInterpretation: "Түсіндіру қайтарылмады.",
      noRecommendations: "Ұсынымдар қайтарылмады.",
      noExercises: "Жаттығу ұсынымдары қайтарылмады.",
      calculationDetails: "Есептеу деректері",
      recommendationTitle: "{number}-ұсыным",
      exercisePlan: "Жаттығу жоспары",
      watchVideo: "Бейнені көру",
      exerciseSafetyNote: "Бұл жаттығулар тек білім беру мақсатындағы ұсынымдар. Ауырсыну күшейсе тоқтатып, физиотерапевтке жүгініңіз.",
    },
    messages: {
      calculateToReady: "Қадамды дайын ету үшін соңғы бетте KOOS есептеңіз.",
      completeCurrentPage: "Жалғастыру үшін беттегі барлық сұрақтарға жауап беріңіз.",
      completeAllKoos: "Есептеу алдында KOOS-тың барлық 42 сұрағына жауап беріңіз.",
      includesNextSection: "Келесі бөлімді қамтиды",
      noKlResult: "KL нәтижесі әлі жоқ.",
      noImuResult: "ИМУ нәтижесі әлі жоқ.",
      generateAfterReady: "Алдыңғы қадамдар дайын болғаннан кейін есеп жасаңыз.",
      noVideos: "Жаттығу бейнелері әлі қолжетімсіз.",
      exercisePlanLevel: "{level}-деңгей жаттығу жоспары",
      basedOnFinalScore: "Қорытынды оңалту балына негізделген: {score}",
      videoPlanDisclaimer: "Бұл жаттығулар тек бағдар ретінде берілген. Қорытынды жаттығу жоспарын клиницист растауы керек.",
    },
    errors: {
      backendOffline: "Бэкенд қолжетімсіз. Бэкендті іске қосып, қайта көріңіз.",
      klInvalid: "Жарамды тізе суретін жүктеңіз.",
      imuInvalid: "Жарамды ИМУ CSV датчик жазбасын жүктеңіз.",
      wrongKlFile: "Файл түрі қате. Жарамды тізе суретін таңдаңыз.",
      wrongImuFile: "Файл түрі қате. ИМУ талдауы үшін CSV файлын таңдаңыз.",
    },
    completion: {
      patientTitle: "Пациент контексті аяқталды",
      patientText: "Сессия деректері клиникалық бағалауға дайын.",
      koosTitle: "KOOS_pre аяқталды",
      koosText: "Оңалтуға дейінгі сауалнама бағасы суретті талдауға дайын.",
      klTitle: "KL бағасы аяқталды",
      klText: "Сурет бағасы қозғалыс талдауына дайын.",
      imuTitle: "ИМУ қозғалыс талдауы аяқталды",
      imuText: "ROM есебі қорытынды есепке дайын.",
      reportTitle: "Қорытынды есеп аяқталды",
      reportText: "Сессия оңалту болжамы және ұсыныстарымен сақталды.",
      sessionSaved: "Сессия сақталды",
      videosTitle: "Жаттығу бейнелері дайын",
      videosText: "Ағымдағы оңалту деңгейіне арналған жаттығу нұсқаулары қолжетімді.",
    },
    klLabels: { 0: "Қалыпты", 1: "Күмәнді", 2: "Жеңіл", 3: "Орташа", 4: "Ауыр" },
    movementStatus: {
      improving: "Жақсару",
      stable: "Тұрақты / әзірге өзгеріс жоқ",
      reduced: "Қозғалыс төмендеді",
      unknown: "Алдыңғы ROM күтілуде",
    },
    explanations: {
      klExplanation: "KL дәрежесі тізе суреті бойынша остеоартрит ауырлығын бағалайды.",
      romExplanation: "ROM = тізе қозғалысының градуспен өлшенетін диапазоны.",
      deltaRomExplanation: "Delta ROM = ағымдағы ROM минус алдыңғы ROM.",
      rehabScoreExplanation: "Оңалту балы = ағымдағы қозғалысты сау базалық деңгеймен салыстыру.",
      koosFormula: "KOOS_pre ішкі шкаласы = 100 - (орташа жауап / 4) × 100. KOOS_pre = қолжетімді KOOS_pre ішкі шкалаларының орташа мәні.",
      koosScoring: "KOOS сұрақтарының әрқайсысы 0-ден 4-ке дейін бағаланады; симптом жоғарылаған сайын KOOS балы төмендейді.",
      klHow: "KL бағасы жүктелген тізе суреті бойынша Kellgren-Lawrence дәрежесін болжайтын AI классификаторы арқылы алынады.",
      klSafety: "Бұл AI көмегімен алынған баға, оны міндетті түрде клиникалық бағалаумен тексеру керек.",
      imuRomFormula: "ROM = талданған ИМУ сессиясындағы ең үлкен бұрыш - ең кіші бұрыш.",
      imuSmoothness: "Тегістік гироскоп тұрақтылығынан бағаланады: қозғалыс тұрақты болса, бақылау жақсырақ және діріл аздау болады.",
      imuScoreFormula: "ИМУ оңалту балы қозғалыс ауқымы мен бақылауын біріктіреді, содан кейін жаттығу деңгейін таңдау үшін оңалту деңгейіне ауыстырылады.",
      finalPredictionExplanation: "Бұл балл KOOS_pre, ROM өзгерісі және KL дәрежесін біріктіріп, оңалту прогресін бағалайды.",
      higherScoreMeaning: "Жоғары mapped score = оңалту жағдайы жақсырақ.",
      lowerScoreMeaning: "Төмен mapped score = оңалту қажеттілігі жоғарырақ.",
      reportCombination: "KOOS_pre мен KL дәрежесі есеп формуласына әсер етеді, ал ИМУ ROM және балы өзгеріс трегіне, оңалту деңгейіне және жаттығу ұсынымдарына әсер етеді.",
      formulaReadable: "predicted_delta_KOOS = β0 + β1×KOOS_pre + β2×signed_delta_ROM + β3_KL",
    },
    reportSections: {
      overallPrediction: "Жалпы оңалту болжамы",
      finalRehabilitationScore: "Қорытынды оңалту балы",
      inputSummary: "Кіріс деректер қысқашасы",
      scoreExplanation: "Балл түсіндірмесі",
      clinicalInputs: "Қолданылған клиникалық деректер",
      formulaResult: "Есептеу деректері",
      interpretation: "Түсіндіру",
      recommendations: "Ұсынымдар",
      sessionDetails: "Сессия деректері",
      exerciseVideos: "Жаттығу бейнелері",
      liveSensorFeed: "Тікелей сенсор ағыны",
    },
    recommendationText: {
      continueProtocol: "Ағымдағы оңалту протоколын жалғастырыңыз.",
      reevaluateNextSession: "Келесі сессияда KOOS және ROM көрсеткіштерін қайта бағалаңыз.",
      reviewTechnique: "Жаттығу техникасы мен қарқынын тексеріңіз.",
      clinicianFollowUp: "Жоспарды түзету үшін маман кеңесін қарастырыңыз.",
      collectMoreSessions: "Динамиканы анықтау үшін көбірек сессия жинаңыз.",
    },
    toc: {
      overview: "Шолу",
      patientDetails: "Пациент деректері",
      sessionHistory: "Сессия тарихы",
      progress: "Прогресс",
      currentQuestions: "Ағымдағы сұрақтар",
      calculateKoos: "KOOS есептеу",
      imageUpload: "Сурет жүктеу",
      klResult: "KL нәтижесі",
      csvUpload: "CSV жүктеу",
      analysisResult: "Талдау нәтижесі",
      summary: "Қысқаша",
      interpretation: "Түсіндіру",
      recommendations: "Ұсынымдар",
      sessionDetails: "Сессия деректері",
      exerciseVideos: "Жаттығу бейнелері",
      liveSensorFeed: "Тікелей сенсор ағыны",
    },
  },
};

const GLOBAL_CSS = `
@import url('https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&family=Instrument+Serif:ital@0;1&family=IBM+Plex+Mono:wght@400;500;600&display=swap');

:root{
  --bg:#E5DCC7;
  --paper:#F7F2E7;
  --card:#EEE7D7;
  --border:#D9D1BD;
  --text:#111827;
  --muted:#6B6256;
  --teal:#18B7A6;
  --coral:#FF6B57;
  --teal-soft:rgba(24,183,166,.1);
  --coral-soft:rgba(255,107,87,.11);
}
*{box-sizing:border-box}
html,body,#root{width:100%;min-height:100%;margin:0}
html{scroll-behavior:smooth}
body{font-family:"Manrope",sans-serif;background:var(--bg);color:var(--text);font-size:16px;line-height:1.55;-webkit-font-smoothing:antialiased}
button,input,select{font:inherit}
.app{width:100%;max-width:none;min-height:100dvh;margin:0;background:var(--bg);overflow:hidden}
.shell{width:100%;max-width:none;margin:0;display:grid;grid-template-columns:280px minmax(0,1fr) 170px;align-items:start;min-height:100dvh}
.sidebar{background:var(--paper);border-right:1px solid var(--border);padding:24px 12px;display:grid;gap:16px;height:100dvh;position:sticky;top:0;overflow-y:auto}
.brand{padding:0 6px 8px}
.brand h1{font-family:"Instrument Serif",serif;font-size:42px;line-height:.95;font-weight:400;letter-spacing:-.03em;margin:0 0 10px}
.brand p{margin:0;color:var(--muted);font-size:14px}
.topbar{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:28px}
.topbarMeta{font-family:"IBM Plex Mono",monospace;font-size:12px;color:var(--muted)}
.topToolbar{display:flex;align-items:center;gap:8px;flex-wrap:wrap;justify-content:flex-end}
.lang{display:flex;gap:6px;flex-wrap:wrap}
.lang button{border:1px solid var(--border);background:transparent;color:var(--muted);padding:7px 9px;font-size:12px;font-weight:800;cursor:pointer}
.lang button:hover{border-color:var(--teal);color:var(--text)}
.lang button.active{background:var(--teal);border-color:var(--teal);color:#fff}
.stepList{display:grid;gap:2px}
.stepItem{width:100%;text-align:left;border:0;background:transparent;padding:10px 8px;cursor:pointer;display:grid;grid-template-columns:28px 1fr auto;align-items:center;gap:10px;position:relative;color:var(--text)}
.stepItem::before{content:"";position:absolute;left:0;top:8px;bottom:8px;width:3px;background:transparent}
.stepItem.active::before{background:var(--teal)}
.stepItem.active{background:var(--teal-soft)}
.stepItem:hover{background:#eee6d5}
.stepNum{width:28px;height:28px;border:1px solid var(--border);display:grid;place-items:center;font-weight:800;background:var(--paper);font-size:12px}
.stepItem.active .stepNum{border-color:var(--teal);color:var(--teal);background:#fff}
.stepTitle{font-size:13px;font-weight:800;line-height:1.3}
.badge{font-size:10px;font-weight:800;padding:3px 6px;border:1px solid var(--border);color:var(--muted);text-transform:uppercase;letter-spacing:.05em;white-space:nowrap}
.badge.ready{color:#0c746b;border-color:rgba(24,183,166,.45);background:var(--teal-soft)}
.badge.complete{color:#fff;border-color:var(--teal);background:var(--teal)}
.history{border-top:1px solid var(--border);padding:14px 6px 0;display:grid;gap:8px}
.history h3{margin:0;font-size:13px;text-transform:uppercase;letter-spacing:.08em;color:var(--muted)}
.historyCard{border-top:1px solid var(--border);padding:10px 0}
.historyTop{display:flex;justify-content:space-between;gap:8px;font-size:12px}
.historyMeta{font-size:11px;color:var(--muted);margin-top:6px}
.historyEmpty{color:#928878;font-size:11px;line-height:1.35;padding:2px 0 0}

.main{background:var(--paper);border-right:1px solid var(--border);height:100dvh;overflow-y:auto;padding:24px 54px 88px;width:100%;min-width:0}
.breadcrumbs{font-family:"IBM Plex Mono",monospace;font-size:12px;color:var(--muted)}
.clinicalLine{font-family:"IBM Plex Mono",monospace;font-size:12px;color:var(--muted)}
.hero{padding:0 0 24px;border-bottom:1px solid var(--border)}
.hero h2{margin:0;font-family:"Instrument Serif",serif;font-size:52px;line-height:.98;font-weight:400;letter-spacing:-.04em}
.hero p{margin:12px 0 0;color:var(--muted);font-size:17px;max-width:860px}
.panel{padding:24px 0;border-bottom:1px solid var(--border)}
.panel h3{margin:0 0 8px;font-size:20px;letter-spacing:-.025em;line-height:1.2}
.panel p{margin:0;color:var(--muted);max-width:82ch}
.sectionBody{margin-top:0}
.sectionBody + .sectionBody{margin-top:16px}
.subsectionTitle{margin:0 0 10px;font-size:15px;font-weight:800;color:var(--text)}
.grid2{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px}
.klLayout{display:grid;grid-template-columns:minmax(520px,1.35fr) minmax(360px,.9fr);gap:24px;align-items:start}
.uploadStack{display:grid;gap:12px}
.field{display:grid;gap:8px}
.field label{font-size:13px;color:var(--text);font-weight:800}
.field input,.field select{height:46px;border:1px solid var(--border);padding:0 12px;background:#fff;color:var(--text);outline:none}
.field input:focus,.field select:focus{border-color:var(--teal);box-shadow:0 0 0 2px rgba(24,183,166,.16)}
.fileDrop{min-height:220px;border:1px dashed #bfb5a1;background:#f2ead9;display:grid;place-items:center;text-align:center;padding:20px;cursor:pointer;color:var(--text);width:100%}
.fileDrop.large{min-height:420px}
.fileDrop:hover{border-color:var(--teal);background:#edf3e8}
.fileDrop strong{font-size:18px}
.fileDrop span{font-size:13px;color:var(--muted)}
.fileHint{margin-top:8px;font-family:"IBM Plex Mono",monospace;font-size:11px;color:var(--muted)}
.selectedFile{display:grid;gap:4px}
.selectedFile strong{font-size:18px}
.selectedFile span{font-size:13px;color:var(--muted);word-break:break-word}
.preview{width:100%;max-height:340px;object-fit:contain;border:1px solid var(--border);background:#fff}
.klPreviewShell{border:1px solid var(--border);background:#111;min-height:460px;display:grid;overflow:hidden}
.xrayPreview{width:100%;height:100%;min-height:460px;object-fit:contain;background:#111}
.fileSummary{display:flex;align-items:center;justify-content:space-between;gap:12px;border:1px solid var(--border);background:#f8f3e8;padding:10px 12px;flex-wrap:wrap}
.fileSummary strong{font-size:13px}
.fileSummary span{font-size:12px;color:var(--muted);word-break:break-word}
.chips{display:flex;gap:8px;flex-wrap:wrap}
.chip{padding:5px 8px;border:1px solid var(--border);font-size:11px;font-weight:800;background:#f8f3e8;text-transform:uppercase;letter-spacing:.05em;color:var(--muted)}
.chip.coral{border-color:rgba(255,107,87,.45);color:#9b3a2c;background:var(--coral-soft)}
.chip.teal{border-color:rgba(24,183,166,.45);color:#0c746b;background:var(--teal-soft)}
.metrics{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}
.metrics.wideMetrics{grid-template-columns:repeat(4,minmax(0,1fr))}
.summaryCards{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}
.imuSourceCards{grid-template-columns:repeat(2,minmax(220px,1fr))}
.summaryCard{background:#fffaf0;border:1px solid var(--border);padding:14px 16px;display:grid;gap:6px}
.summaryCard small{color:var(--muted);font-size:12px;font-weight:700}
.summaryCard strong{display:block;font-size:30px;line-height:1.05;letter-spacing:-.04em}
.sensorCard{grid-template-rows:auto auto 1fr}
.sensorCardHeader{display:flex;align-items:flex-start;justify-content:space-between;gap:10px}
.sensorCardHeader strong{font-size:22px;line-height:1.15;letter-spacing:-.03em}
.sensorCardSummary{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}
.sensorCardPlaceholder{display:grid;place-items:center;min-height:140px;border:1px dashed var(--border);background:#f8f3e8;color:var(--muted);font-weight:700}
.sensorMeta{display:grid;gap:8px}
.sensorMetrics{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}
.sensorMetric{border:1px solid var(--border);background:#f8f3e8;padding:10px}
.sensorMetric strong{margin-top:4px;font-size:15px;line-height:1.25;letter-spacing:0;word-break:break-word}
.summaryDate{font-size:16px !important;line-height:1.35 !important;letter-spacing:0 !important}
.imuStepLayout{display:grid;gap:18px}
.imuDashboardTop{display:grid;grid-template-columns:minmax(0,1.45fr) minmax(280px,.72fr);gap:18px;align-items:start}
.imuControlCard,.imuActionCard,.imuSensorPanel{border:1px solid var(--border);background:#fffaf0;padding:16px;min-width:0}
.imuControlCard{display:grid;gap:16px}
.imuActionCard{display:grid;gap:12px;align-content:start}
.imuRealtimeStatus{display:grid;gap:12px}
.imuStatusGrid{display:grid;grid-template-columns:repeat(6,minmax(150px,1fr));gap:10px}
.imuStatusCard{border:1px solid var(--border);background:#fffaf0;padding:12px;display:grid;gap:6px;min-width:0}
.imuStatusCardTop{display:flex;align-items:flex-start;justify-content:space-between;gap:8px}
.imuStatusSource{font-family:"IBM Plex Mono",monospace;font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.06em}
.imuStatusCard strong{font-size:14px;line-height:1.25;letter-spacing:0}
.imuStatusCard small{font-size:11px;color:var(--muted)}
.imuStatusMetrics{font-size:12px;color:var(--text);line-height:1.35}
.bleVisualizationPanel{border:1px solid var(--border);background:linear-gradient(180deg,#fffaf0,#f5eddc);padding:14px 16px}
.bleVisualizationGrid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px;margin-top:14px}
.legVizPanel{border:1px solid var(--border);background:rgba(255,255,255,.72);padding:14px;display:grid;gap:12px;min-width:0}
.legVizPanelHeader{display:flex;justify-content:space-between;gap:10px;align-items:flex-start;flex-wrap:wrap}
.legVizPanelHeader h5{margin:0;font-size:16px;line-height:1.2}
.legVizCanvas{position:relative;min-height:280px;border:1px dashed var(--border);background:linear-gradient(180deg,rgba(24,183,166,.06),rgba(255,255,255,.65));display:grid;place-items:center;overflow:hidden}
.legVizSvg{width:180px;height:250px;opacity:.34}
.legVizSvg path,.legVizSvg circle,.legVizSvg rect{fill:#d6cfbf;stroke:#bdb29c;stroke-width:1.2}
.legVizMarker{position:absolute;display:grid;gap:4px;justify-items:center;transform:translate(-50%,-50%)}
.legVizStage{width:56px;height:56px;border:1px dashed var(--border);background:linear-gradient(180deg,rgba(24,183,166,.08),rgba(255,255,255,.78));display:grid;place-items:center;perspective:900px;border-radius:16px}
.legVizStage.offline{background:linear-gradient(180deg,rgba(107,98,86,.08),rgba(255,255,255,.78))}
.bleVizTile{position:relative;width:34px;height:46px;transform-style:preserve-3d;transform:rotateX(var(--tile-rotate-x,0deg)) rotateZ(var(--tile-rotate-z,0deg));transition:transform .24s ease-out}
.bleVizFace{position:absolute;inset:0;border:1px solid rgba(17,24,39,.16);border-radius:12px}
.bleVizFaceTop{background:linear-gradient(180deg,#59d4c7,#18b7a6);transform:translateZ(9px)}
.legVizStage.offline .bleVizFaceTop{background:linear-gradient(180deg,#c7c1b3,#a79f90)}
.bleVizFaceFront{background:rgba(255,255,255,.94);transform:rotateX(90deg) translateZ(14px);height:18px;inset:auto 0 0}
.bleVizFaceSide{background:rgba(17,24,39,.08);transform:rotateY(90deg) translateZ(9px);width:18px;inset:0 auto 0 0}
.legVizMarkerLabel{font-size:11px;color:var(--muted);text-align:center;line-height:1.2}
.legVizLegend{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}
.legVizLegendItem{border:1px solid var(--border);background:#f8f3e8;padding:8px 10px;display:grid;gap:3px}
.legVizLegendItem strong{font-size:12px;line-height:1.25}
.legVizLegendItem span{font-size:11px;color:var(--muted);line-height:1.35}
.imuLegResultGrid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
.imuLegResultCard{border:1px solid var(--border);background:#f8f3e8;padding:14px;display:grid;gap:10px}
.imuLegResultCard h5{margin:0;font-size:16px}
.imuSidebarCard{border-top:1px solid var(--border);padding-top:18px;margin-top:18px;display:grid;gap:14px}
.imuSidebarGroup{display:grid;gap:8px}
.imuSidebarGroup strong{font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:var(--muted)}
.imuSidebarGroup span{font-size:13px;line-height:1.4;color:var(--text)}
.metric{background:#f8f3e8;border:1px solid var(--border);padding:11px}
.metric small{color:var(--muted);font-size:12px;font-weight:700}
.metric strong{display:block;margin-top:6px;font-size:26px;line-height:1.1;letter-spacing:-.035em}
.resultHero{border:1px solid var(--border);background:#fffaf0;padding:22px;display:grid;gap:16px;margin-top:16px}
.resultHeroTop{display:flex;align-items:flex-start;justify-content:space-between;gap:14px;flex-wrap:wrap}
.resultKicker{font-family:"IBM Plex Mono",monospace;font-size:12px;color:#0c746b;text-transform:uppercase;letter-spacing:.08em;font-weight:800}
.resultHero h4{margin:4px 0 0;font-size:28px;line-height:1.1;letter-spacing:-.03em}
.resultHero p{margin:5px 0 0;color:var(--muted)}
.resultValue{font-size:64px;line-height:.9;letter-spacing:-.05em;font-weight:800;color:var(--text);text-align:right}
.resultValue span{display:block;margin-top:6px;font-family:"IBM Plex Mono",monospace;font-size:11px;letter-spacing:.08em;color:var(--muted);text-transform:uppercase}
.resultActions{display:flex;gap:10px;flex-wrap:wrap;align-items:center;border-top:1px solid var(--border);padding-top:14px}
.explainList{display:grid;gap:8px}
.explainItem{border-left:3px solid var(--teal);background:#f8f3e8;padding:9px 11px;color:var(--muted);font-size:13px}
.flowLine{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:12px}
.flowItem{border:1px solid var(--border);background:#f8f3e8;padding:8px 10px;font-size:12px;font-weight:800;color:var(--text)}
.flowArrow{font-family:"IBM Plex Mono",monospace;color:var(--muted);font-size:12px}
.formulaBox{border:1px solid var(--border);background:#f8f3e8;padding:12px;font-family:"IBM Plex Mono",monospace;font-size:13px;color:var(--text);overflow-wrap:anywhere}
.recommendationCards{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin-top:10px}
.recommendationCard{border:1px solid var(--border);background:#f8f3e8;padding:12px;color:var(--text)}
.recommendationCard::before{content:"";display:block;width:24px;height:3px;background:var(--teal);margin-bottom:8px}
.recommendationCard strong{display:block;font-size:12px;text-transform:uppercase;letter-spacing:.05em;color:#0c746b;margin-bottom:6px}
.recommendationCard p{margin:0;color:var(--text);font-size:14px}
.detailPanel{display:grid;gap:10px;margin-top:12px}
.detailGrid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
.detailCard{border:1px solid var(--border);background:#f8f3e8;padding:12px}
.detailCard strong{display:block;font-size:12px;text-transform:uppercase;letter-spacing:.05em;color:#0c746b;margin-bottom:6px}
.detailCard p{margin:0;color:var(--text);font-size:13px;line-height:1.45}
.infoCard{margin-top:14px;border:1px solid rgba(12,116,107,.24);background:linear-gradient(180deg,#fff7e8,#f8f3e8);padding:14px 16px;display:grid;gap:8px}
.infoCard strong{font-size:13px;letter-spacing:.04em;text-transform:uppercase;color:#0c746b}
.infoCard p{margin:0;color:var(--text);line-height:1.5}
.microNote{margin-top:10px;font-size:12px;line-height:1.45;color:var(--muted)}
.exerciseGrid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px;margin-top:12px}
.exerciseCard{border:1px solid var(--border);background:#fffaf0;padding:12px;display:grid;gap:12px;grid-template-rows:auto auto 1fr auto;min-height:100%}
.exerciseCard.active{border-color:rgba(24,183,166,.45);box-shadow:0 18px 40px rgba(183,170,146,.16)}
.exerciseThumb{position:relative;min-height:188px;border:1px solid var(--border);background:
linear-gradient(145deg, rgba(255,255,255,.72), rgba(233,224,205,.95)),
radial-gradient(circle at top right, rgba(24,183,166,.14), transparent 44%);
overflow:hidden}
.exerciseThumbButton{display:block;width:100%;padding:0;border:0;background:transparent;cursor:pointer;text-align:left}
.exerciseThumbButton:focus-visible{outline:2px solid var(--teal);outline-offset:2px}
.exerciseFrame{width:100%;height:100%;min-height:188px;border:0;background:#e8e0cf}
.exerciseThumb.placeholder::before,.exerciseThumb.placeholder::after{content:"";position:absolute;border:1px solid rgba(17,24,39,.14)}
.exerciseThumb.placeholder::before{left:16px;right:16px;bottom:18px;height:42px;background:rgba(255,250,240,.72)}
.exerciseThumb.placeholder::after{left:22px;top:22px;width:34%;height:62%;border-right:0;border-bottom:0;background:
linear-gradient(180deg, rgba(24,183,166,.08), transparent)}
.exerciseThumbArt{position:absolute;inset:0;background:
linear-gradient(120deg, transparent 0 36%, rgba(17,24,39,.08) 36% 38%, transparent 38% 100%),
linear-gradient(0deg, transparent 0 62%, rgba(17,24,39,.06) 62% 64%, transparent 64% 100%)}
.playOverlay{position:absolute;inset:0;display:grid;place-items:center;pointer-events:none}
.playCircle{width:64px;height:64px;border-radius:999px;border:1px solid rgba(24,183,166,.35);background:rgba(255,250,240,.92);display:grid;place-items:center;box-shadow:0 10px 30px rgba(162,150,126,.18)}
.playTriangle{width:0;height:0;border-top:10px solid transparent;border-bottom:10px solid transparent;border-left:16px solid var(--teal);margin-left:4px}
.exerciseCardTop{display:flex;align-items:flex-start;justify-content:space-between;gap:8px}
.exerciseCard h5{margin:0;font-size:18px;line-height:1.2;letter-spacing:-.02em}
.exerciseCard p{margin:0;color:var(--muted);font-size:13px;line-height:1.5}
.exerciseLevel{font-family:"IBM Plex Mono",monospace;font-size:11px;color:#0c746b;text-transform:uppercase;letter-spacing:.08em;border:1px solid rgba(24,183,166,.35);background:var(--teal-soft);padding:5px 8px}
.exerciseMeta{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}
.exerciseMetaCard{border:1px solid var(--border);background:#f8f3e8;padding:10px}
.exerciseMetaCard small{display:block;font-size:11px;font-weight:800;color:var(--muted);text-transform:uppercase;letter-spacing:.06em}
.exerciseMetaCard strong{display:block;margin-top:4px;font-size:14px;line-height:1.2;color:var(--text)}
.exerciseActions{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.exercisePrimary,.exerciseSecondary{display:inline-flex;align-items:center;justify-content:center;min-height:40px;padding:0 14px;border:1px solid var(--border);font-weight:800;cursor:pointer;text-decoration:none}
.exercisePrimary{background:var(--teal);border-color:var(--teal);color:#fff}
.exerciseSecondary{background:#f8f3e8;color:var(--text)}
.exercisePrimary:hover,.exerciseSecondary:hover{border-color:#bfb5a1;background:#fff;color:var(--text)}
.exercisePrimary:hover{background:#14a292;color:#fff;border-color:#14a292}
.exerciseStatus{font-family:"IBM Plex Mono",monospace;font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.08em}
.exercisePlanMeta{display:grid;gap:6px;margin-top:12px}
.exercisePlanTitle{font-size:18px;font-weight:800;line-height:1.2;color:var(--text)}
.exercisePlanScore{font-family:"IBM Plex Mono",monospace;font-size:12px;color:var(--muted)}
.videoModal{position:fixed;inset:0;background:rgba(17,24,39,.56);display:grid;place-items:center;padding:24px;z-index:40}
.videoModalCard{width:min(920px,100%);background:var(--paper);border:1px solid var(--border);box-shadow:0 30px 60px rgba(17,24,39,.18);padding:18px;display:grid;gap:14px}
.videoModalTop{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;flex-wrap:wrap}
.videoModalTop h5{margin:0;font-size:24px;line-height:1.1;letter-spacing:-.03em}
.videoModalMeta{display:flex;gap:8px;flex-wrap:wrap}
.videoModalFrame{aspect-ratio:16/9;width:100%;border:1px solid var(--border);background:#e8e0cf}
.videoModalFrame iframe{width:100%;height:100%;border:0}
.videoModalActions{display:flex;gap:10px;flex-wrap:wrap;align-items:center;justify-content:space-between}
.statusPill{display:inline-flex;align-items:center;border:1px solid rgba(24,183,166,.45);background:var(--teal-soft);color:#0c746b;padding:5px 8px;font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.05em}
.statusPill.coral{border-color:rgba(255,107,87,.45);background:var(--coral-soft);color:#9b3a2c}
.resultBars{display:grid;gap:10px}
.resultBarRow{display:grid;grid-template-columns:minmax(130px,.42fr) minmax(0,1fr) 52px;gap:10px;align-items:center}
.resultBarLabel{font-size:12px;font-weight:800;color:var(--text)}
.resultBarTrack{height:8px;background:#eadfcb;border:1px solid var(--border)}
.resultBarFill{height:100%;background:var(--teal)}
.resultBarValue{font-family:"IBM Plex Mono",monospace;font-size:12px;color:var(--muted);text-align:right}
.calcCardGrid{display:grid;gap:12px;margin-top:14px}
.calcCard{border:1px solid var(--border);background:#fffaf0}
.calcCardHeader{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;padding:14px 14px 0;flex-wrap:wrap}
.calcCardTitleWrap{display:grid;gap:4px}
.calcCardTitleWrap h5{margin:0;font-size:15px;line-height:1.25}
.calcCardTitleWrap p{margin:0;color:var(--muted);font-size:12px;line-height:1.45}
.calcToggle{border:1px solid var(--border);background:#f8f3e8;color:var(--text);padding:8px 10px;font-size:12px;font-weight:800;cursor:pointer}
.calcCardBody{display:grid;gap:12px;padding:14px}
.calcFormulaBlock{display:grid;gap:6px}
.calcLabel{font-family:"IBM Plex Mono",monospace;font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.08em}
.calcFormulaText{margin:0}
.calcInputs{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}
.calcInput{border:1px solid var(--border);background:#f8f3e8;padding:10px}
.calcInput small{display:block;font-size:11px;font-weight:800;color:var(--muted);text-transform:uppercase;letter-spacing:.06em}
.calcInput strong{display:block;margin-top:4px;font-size:13px;line-height:1.35;color:var(--text)}
.calcSteps{display:grid;gap:8px}
.calcStep{display:grid;grid-template-columns:78px minmax(0,1fr);gap:10px;align-items:flex-start}
.calcStepIndex{font-family:"IBM Plex Mono",monospace;font-size:11px;color:#0c746b;text-transform:uppercase;letter-spacing:.08em;padding-top:2px}
.calcStepBody{border:1px solid var(--border);background:#fff;padding:10px}
.calcStepBody strong{display:block;font-size:12px;text-transform:uppercase;letter-spacing:.05em;color:#0c746b;margin-bottom:5px}
.calcStepBody p{margin:0;color:var(--text);font-size:13px;line-height:1.45}
.calcFinal{border:1px solid rgba(24,183,166,.32);background:var(--teal-soft);padding:12px}
.calcFinal strong{display:block;margin-top:6px;font-size:16px;line-height:1.3;color:var(--text)}

.koosWrap{display:grid;gap:10px;padding-bottom:18px}
.koosHead{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap}
.koosPanelHead{padding:16px;border:1px solid var(--border);background:#fffaf0}
.koosHead strong{font-size:14px;color:var(--text)}
.koosPageTitle{display:grid;gap:4px}
.koosPageTitle h3{margin:0;font-size:20px;line-height:1.2;letter-spacing:-.025em}
.koosPageMeta{font-family:"IBM Plex Mono",monospace;font-size:12px;color:var(--muted)}
.koosPanelSubmeta{font-size:12px;color:var(--muted)}
.koosPanelTags{align-items:flex-start}
.progressBar{height:6px;background:#eadfcb;border:1px solid var(--border)}
.progressFill{height:100%;background:var(--teal)}
.koosTabs{display:flex;gap:4px;flex-wrap:wrap;border-bottom:1px solid var(--border);padding-bottom:6px}
.koosTab{border:0;background:transparent;padding:6px 8px 9px;color:var(--muted);font-weight:800;cursor:pointer;position:relative;font-size:13px}
.koosTab.active{color:#0f6e66}
.koosTab.active::after{content:"";position:absolute;left:8px;right:8px;bottom:-7px;height:2px;background:var(--teal)}
.koosPage{display:grid;gap:12px}
.koosQuestion{border:1px solid var(--border);padding:14px;background:#fff}
.koosQuestion + .koosQuestion{margin-top:0}
.koosQuestion h4{margin:0 0 12px;font-size:15px;line-height:1.4}
.koosOpts{display:grid;grid-template-columns:repeat(5,minmax(110px,1fr));gap:8px}
.opt{border:1px solid var(--border);min-height:48px;padding:7px 8px;background:#f7f3e8;text-align:left;display:grid;grid-template-columns:auto 1fr;gap:7px;align-items:center;cursor:pointer}
.opt input{accent-color:var(--teal)}
.opt span{font-size:11px;color:#3b4e53;line-height:1.25;font-weight:800}
.opt.selected{border-color:var(--teal);background:#eaf8f5}

.error{margin-top:12px;padding:10px;border:1px solid rgba(255,107,87,.45);background:var(--coral-soft);color:#7a2f24;font-size:13px}
.empty{margin-top:12px;padding:12px;border:1px solid var(--border);background:#f8f3e8;color:var(--muted);font-size:13px}

.wizardNav{display:flex;justify-content:space-between;gap:10px;margin-top:18px;flex-wrap:wrap}
.koosAction{margin-top:24px;padding-top:16px;border-top:1px solid var(--border);align-items:center}
.koosActionNote{color:var(--muted);font-size:12px}
.btn{height:42px;padding:0 14px;border:1px solid var(--border);font-weight:800;cursor:pointer;background:#f8f3e8;color:var(--text);transition:background .15s ease,transform .15s ease,border-color .15s ease}
.btn:hover{border-color:#bfb5a1;background:#fff}
.btn:active{transform:translateY(1px)}
.btn.primary{background:var(--teal);border-color:var(--teal);color:#fff}
.btn:disabled{opacity:.42;cursor:not-allowed;background:#eee6d5;color:#8a8070;border-color:var(--border);transform:none}
.reportBlock{border-top:1px solid var(--border);padding:16px 0}
.reportBlock:first-child{border-top:0}
.reportBlock h4{margin:0 0 8px;font-size:16px}
.reportBlock p{margin:0;color:var(--text)}
.reportBlockHead{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;flex-wrap:wrap}
.reportList{margin:0;padding-left:18px;color:var(--text)}
.reportList li{margin:6px 0}
.tableTitle{font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:var(--muted);padding:10px 12px 0}
.dataTableWrap{margin-top:14px;overflow:auto;border:1px solid var(--border);background:#f8f3e8}
.imuTableWrap{max-width:100%;overflow-x:auto;overflow-y:auto}
.dataTable{width:100%;border-collapse:collapse;font-size:12px}
.imuDataTable{min-width:1040px;font-size:13px}
.dataTable th,.dataTable td{padding:9px 10px;border-bottom:1px solid var(--border);text-align:left;white-space:nowrap}
.imuDataTable th,.imuDataTable td{padding:12px 14px}
.dataTable th{font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);background:#f3ede0}
.imuDataTable thead th{position:sticky;top:0;z-index:1;background:#efe6d4}
.dataTable tr:last-child td{border-bottom:0}
.betaTable{width:100%;border-collapse:collapse;margin-top:10px;background:#f8f3e8;border:1px solid var(--border);font-family:"IBM Plex Mono",monospace;font-size:12px}
.betaTable th,.betaTable td{padding:9px 10px;border-bottom:1px solid var(--border);text-align:left}
.betaTable tr:last-child th,.betaTable tr:last-child td{border-bottom:0}
.betaTable th{width:120px;color:var(--muted);font-weight:800}
.toc{background:var(--paper);height:100dvh;position:sticky;top:0;padding:34px 12px;border-right:1px solid var(--border);overflow-y:auto}
.tocTitle{font-family:"IBM Plex Mono",monospace;text-transform:uppercase;letter-spacing:.08em;font-size:11px;color:var(--muted);margin-bottom:14px}
.tocNav{display:grid;gap:2px}
.tocLink{display:block;width:100%;text-align:left;border:0;background:transparent;color:var(--muted);font-size:13px;line-height:1.35;padding:7px 0 7px 12px;border-left:2px solid transparent;text-decoration:none;cursor:pointer}
.tocLink:hover,.tocLink.active{color:var(--text);border-left-color:var(--teal)}

@media (max-width:1100px){
  .shell{grid-template-columns:260px minmax(0,1fr)}
  .toc{display:none}
  .main{padding:28px 34px 52px}
  .klLayout{grid-template-columns:1fr}
  .imuDashboardTop,.imuLegResultGrid{grid-template-columns:1fr}
  .imuStatusGrid{grid-template-columns:repeat(3,minmax(0,1fr))}
  .bleVisualizationGrid{grid-template-columns:1fr}
}
@media (max-width:760px){
  .shell{grid-template-columns:1fr}
  .app{overflow-x:hidden;overflow-y:auto}
  .sidebar{position:static;height:auto;border-right:0;border-bottom:1px solid var(--border)}
  .main{height:auto;overflow:visible;border-right:0;padding:20px 18px 44px}
  .topbar{align-items:flex-start;flex-direction:column;margin-bottom:22px}
  .topToolbar{justify-content:flex-start}
  .hero h2{font-size:42px}
  .hero p{font-size:16px}
  .bleVisualizationGrid,.imuStatusGrid,.imuSourceCards,.sensorCardSummary,.sensorMetrics,.legVizLegend{grid-template-columns:1fr}
  .grid2,.metrics,.metrics.wideMetrics,.klLayout,.recommendationCards,.detailGrid,.exerciseGrid,.calcInputs{grid-template-columns:1fr}
  .resultValue{text-align:left;font-size:40px}
  .resultBarRow{grid-template-columns:1fr}
  .resultBarValue{text-align:left}
  .calcStep{grid-template-columns:1fr}
  .koosOpts{grid-template-columns:1fr}
  .fileDrop,.fileDrop.large,.klPreviewShell,.xrayPreview{min-height:260px}
  .videoModal{padding:12px}
  .videoModalCard{padding:14px}
  .videoModalTop h5{font-size:20px}
}
`;

function formatDate(value) {
  if (!value) return "-";
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}

function f(value, unit = "") {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "-";
  return `${Number(value).toFixed(1)}${unit}`;
}

function pct(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "-";
  const num = Number(value);
  return `${(num <= 1 ? num * 100 : num).toFixed(1)}%`;
}

function getFileExtension(file) {
  return file?.name?.split(".").pop()?.toLowerCase() || "";
}

function isKlFile(file) {
  return KL_FILE_EXTENSIONS.has(getFileExtension(file));
}

function isImuFile(file) {
  return IMU_FILE_EXTENSIONS.has(getFileExtension(file));
}

async function readResponsePayload(res) {
  const text = await res.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { message: text };
  }
}

function cleanBackendMessage(value) {
  if (value === null || value === undefined) return "";
  if (Array.isArray(value)) {
    return value
      .map((item) => cleanBackendMessage(item))
      .filter(Boolean)
      .join(" ");
  }
  if (typeof value === "object") {
    return cleanBackendMessage(value.message || value.msg || JSON.stringify(value));
  }
  return String(value)
    .replace(/^Error:\s*/i, "")
    .replace(/\bHTTP\s+\d{3}\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function friendlyError(error, t, fallbackKey = "backendOffline") {
  const fallback = t.errors[fallbackKey] || t.errors.backendOffline;
  if (Number(error?.status) >= 500) return fallback;
  const raw = cleanBackendMessage(error?.detail || error?.message || error?.error || error);
  if (!raw) return fallback;
  if (/failed to fetch|networkerror|load failed|network request failed/i.test(raw)) return t.errors.backendOffline;
  if (/internal server error|request failed|status code 500/i.test(raw)) return fallback;
  return raw;
}

function formatScore(value) {
  if (!Number.isFinite(Number(value))) return "-";
  const numeric = Number(value);
  return Number.isInteger(numeric) ? String(numeric) : numeric.toFixed(1);
}

function roundCalc(value, digits = 2) {
  if (!Number.isFinite(Number(value))) return null;
  const factor = 10 ** digits;
  return Math.round(Number(value) * factor) / factor;
}

function formatCalcNumber(value, digits = 2) {
  if (!Number.isFinite(Number(value))) return "-";
  return Number(value).toFixed(digits);
}

function formatMaybeSigned(value, digits = 2) {
  if (!Number.isFinite(Number(value))) return "-";
  const num = Number(value);
  return `${num < 0 ? "-" : ""}${Math.abs(num).toFixed(digits)}`;
}

function statusLabel(active, ready, complete, t) {
  if (complete) return t.status.complete;
  if (ready) return t.status.ready;
  if (active) return t.status.pending;
  return t.status.pending;
}

function realtimeImuCopy(lang) {
  return REALTIME_IMU_COPY[lang] || REALTIME_IMU_COPY.en;
}

const LIVE_IMU_RECENT_MS = 2 * 60 * 1000;
const LIVE_IMU_FETCH_LIMIT = 300;
const LEGACY_BLE_DEVICE_ID_MAP = {
  ble_left_arm: "ble_right_hip",
  ble_left_leg: "ble_right_thigh",
  ble_right_arm: "ble_right_shin",
  ble_right_leg: "ble_right_shin",
};
const PI_IMU_DEVICE_CONFIG = [
  { deviceId: "pi1", label: "Left hip", leg: "left", bodyPart: "hip" },
  { deviceId: "pi2", label: "Left thigh / knee", leg: "left", bodyPart: "thigh/knee" },
  { deviceId: "pi3", label: "Left shin / ankle", leg: "left", bodyPart: "shin/ankle" },
];
const WITMOTION_IMU_DEVICE_CONFIG = [
  { deviceId: "ble_right_hip", label: "Right hip", leg: "right", bodyPart: "hip" },
  { deviceId: "ble_right_thigh", label: "Right thigh / knee", leg: "right", bodyPart: "thigh/knee" },
  { deviceId: "ble_right_shin", label: "Right shin / ankle", leg: "right", bodyPart: "shin/ankle" },
];
const REALTIME_IMU_DEVICE_CONFIG = [...PI_IMU_DEVICE_CONFIG, ...WITMOTION_IMU_DEVICE_CONFIG];
const LEG_VISUALIZATION_LAYOUT = {
  pi1: { left: "46%", top: "22%" },
  pi2: { left: "51%", top: "47%" },
  pi3: { left: "55%", top: "75%" },
  ble_right_hip: { left: "54%", top: "22%" },
  ble_right_thigh: { left: "49%", top: "47%" },
  ble_right_shin: { left: "45%", top: "75%" },
};

function createDefaultLiveSensorConfig() {
  return {
    hip: { deviceId: "pi1", axis: "pitch", sign: 1 },
    knee: { deviceId: "pi2", axis: "pitch", sign: 1 },
    ankle: { deviceId: "pi3", axis: "pitch", sign: 1 },
  };
}

function toTimestampMs(value) {
  if (!value) return null;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : null;
}

function isLiveSensorRecent(row) {
  const timestamp = toTimestampMs(row?.timestamp);
  if (timestamp === null) return false;
  return Date.now() - timestamp <= LIVE_IMU_RECENT_MS;
}

function asFiniteNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function getImuDeviceId(row) {
  return String(row?.device_id || "").trim();
}

function normalizeBluetoothDeviceId(deviceId) {
  const value = String(deviceId || "").trim();
  return LEGACY_BLE_DEVICE_ID_MAP[value] || value;
}

function isPiRow(row) {
  return getImuDeviceId(row).startsWith("pi");
}

function isWitMotionRow(row) {
  return getImuDeviceId(row).startsWith("ble_");
}

function getSource(deviceId) {
  if (String(deviceId || "").startsWith("pi")) return "pi";
  if (String(deviceId || "").startsWith("ble_")) return "ble";
  return "unknown";
}

function getDeviceConfig(deviceId) {
  return REALTIME_IMU_DEVICE_CONFIG.find((item) => item.deviceId === String(deviceId || "").trim()) || null;
}

function normalizeImuRow(row) {
  if (!row) return null;
  const rawDeviceId = getImuDeviceId(row);
  const normalizedDeviceId = isWitMotionRow(row) ? normalizeBluetoothDeviceId(rawDeviceId) : rawDeviceId;
  const config = getDeviceConfig(normalizedDeviceId);
  return {
    ...row,
    original_device_id: rawDeviceId,
    device_id: normalizedDeviceId,
    leg: config?.leg || row.leg || "-",
    body_part: config?.bodyPart || row.body_part || "-",
    label: config?.label || normalizedDeviceId || "-",
    source: getSource(normalizedDeviceId),
  };
}

function normalizeImuRows(rows) {
  return (Array.isArray(rows) ? rows : [])
    .map((row) => normalizeImuRow(row))
    .filter(Boolean);
}

function getImuLabel(row) {
  if (!row) return "-";
  return row.label || getDeviceConfig(getImuDeviceId(row))?.label || getImuDeviceId(row) || "-";
}

function isBluetoothImuRow(row) {
  return isWitMotionRow(row);
}

function isRaspberryPiImuRow(row) {
  return isPiRow(row);
}

function getImuSourceLabel(row, liveCopy) {
  const source = row?.source || getSource(getImuDeviceId(row));
  if (source === "pi") return liveCopy.raspberryPiSource;
  if (source === "ble") return "WitMotion";
  return liveCopy.unknownSource;
}

function buildLatestRowsByDevice(rows) {
  const latestByDevice = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    const deviceId = getImuDeviceId(row);
    if (!deviceId) continue;
    const existing = latestByDevice.get(deviceId);
    const rowTime = toTimestampMs(row?.timestamp) ?? -1;
    const existingTime = toTimestampMs(existing?.timestamp) ?? -1;
    if (!existing || rowTime > existingTime) latestByDevice.set(deviceId, row);
  }
  return latestByDevice;
}

function buildRealtimeSensorCards(config, latestByDevice, liveCopy) {
  return config.map((device) => {
    const latestRow = latestByDevice.get(device.deviceId) || null;
    return {
      ...device,
      latestRow,
      isOnline: Boolean(latestRow && isLiveSensorRecent(latestRow)),
      statusLabel: latestRow ? (isLiveSensorRecent(latestRow) ? liveCopy.online : liveCopy.waitingForData) : liveCopy.waitingForSensor,
    };
  });
}

function buildRealtimeLegAnalysis({ rows, title, sourceLabel, proximalDeviceId, distalDeviceId, warningText }) {
  const filteredRows = (Array.isArray(rows) ? rows : [])
    .filter((row) => row.device_id === proximalDeviceId || row.device_id === distalDeviceId)
    .sort((a, b) => (toTimestampMs(a?.timestamp) ?? 0) - (toTimestampMs(b?.timestamp) ?? 0));

  const hasProximal = filteredRows.some((row) => row.device_id === proximalDeviceId);
  const hasDistal = filteredRows.some((row) => row.device_id === distalDeviceId);
  const warnings = [];
  const relativeAngles = [];
  let proximalAngle = null;
  let distalAngle = null;

  for (const row of filteredRows) {
    const pitch = asFiniteNumber(row.pitch);
    if (pitch === null) continue;
    if (row.device_id === proximalDeviceId) proximalAngle = pitch;
    if (row.device_id === distalDeviceId) distalAngle = pitch;
    if (proximalAngle !== null && distalAngle !== null) {
      relativeAngles.push(roundCalc(distalAngle - proximalAngle, 3));
    }
  }

  if (!hasProximal || !hasDistal) warnings.push(warningText);
  if (relativeAngles.length === 0 && warnings.length === 0) warnings.push(warningText);

  if (relativeAngles.length === 0) {
    return {
      title,
      sourceLabel,
      rom_deg: null,
      min_angle_deg: null,
      max_angle_deg: null,
      valid: false,
      warnings,
    };
  }

  const minAngle = Math.min(...relativeAngles);
  const maxAngle = Math.max(...relativeAngles);
  return {
    title,
    sourceLabel,
    rom_deg: roundCalc(maxAngle - minAngle, 1),
    min_angle_deg: roundCalc(minAngle, 1),
    max_angle_deg: roundCalc(maxAngle, 1),
    valid: warnings.length === 0,
    warnings,
  };
}

function buildRealtimeAnalysis(rows, step4Copy) {
  const leftLeg = buildRealtimeLegAnalysis({
    rows,
    title: step4Copy.leftLegRomTitle,
    sourceLabel: "Raspberry Pi",
    proximalDeviceId: "pi2",
    distalDeviceId: "pi3",
    warningText: step4Copy.liveResultPiWarning,
  });
  const rightLeg = buildRealtimeLegAnalysis({
    rows,
    title: step4Copy.rightLegRomTitle,
    sourceLabel: "WitMotion",
    proximalDeviceId: "ble_right_thigh",
    distalDeviceId: "ble_right_shin",
    warningText: step4Copy.bluetoothMappingWarning,
  });
  const warnings = [...leftLeg.warnings, ...rightLeg.warnings];
  const availableRoms = [leftLeg.rom_deg, rightLeg.rom_deg].filter((value) => Number.isFinite(Number(value)));
  const combinedRom = availableRoms.length > 0
    ? roundCalc(availableRoms.reduce((sum, value) => sum + Number(value), 0) / availableRoms.length, 1)
    : null;
  return {
    analysis_source: "live_combined",
    dominant_activity_label: step4Copy.liveCombinedStatus,
    rom_deg: combinedRom,
    current_ROM: combinedRom,
    left_leg: leftLeg,
    right_leg: rightLeg,
    live_samples: rows,
    warning: warnings[0] || "",
    feedback: warnings.length ? [{ level: "Needs sensor check" }] : [{ level: "Ready for report" }],
    session_summary: {
      rom_deg: combinedRom,
      rom_valid: leftLeg.valid && rightLeg.valid,
      rom_method_used: "live_dual_leg_relative_angle",
      rom_warning: warnings.join(" | "),
      sensor_format: "live_dual_leg_stream",
      sensor_setup_note: "Real-time mode combines Raspberry Pi left-leg sensors with WitMotion right-leg sensors.",
    },
  };
}

function getConfiguredAngleValue(row, axis) {
  if (!row) return null;
  return asFiniteNumber(axis === "roll" ? row.roll : row.pitch);
}

function getBaselineAngleValue(baseline, axis) {
  if (!baseline) return 0;
  const value = axis === "roll" ? baseline.roll : baseline.pitch;
  return asFiniteNumber(value) ?? 0;
}

function normalizeSignValue(value) {
  return Number(value) === -1 ? -1 : 1;
}

function calculateCalibratedAngle(row, config, baseline) {
  const rawAngle = getConfiguredAngleValue(row, config?.axis);
  if (rawAngle === null) return null;
  const calibrated = (rawAngle - getBaselineAngleValue(baseline, config?.axis)) * normalizeSignValue(config?.sign);
  return roundCalc(calibrated, 3);
}

function formatLegPositionLabel(leg, roleKey, copy) {
  const legLabel = leg === "right" ? copy.rightSide : copy.leftSide;
  if (roleKey === "knee") return `${legLabel} thigh/knee`;
  if (roleKey === "ankle") return `${legLabel} ankle/shin`;
  return `${legLabel} hip`;
}
function buildStep4LiveSensorCards({ latestRows, rows, config, baselines, analysisLeg, liveCopy, step4Copy }) {
  const mergedLatestRows = buildLatestRowsByDevice([...(Array.isArray(latestRows) ? latestRows : []), ...(Array.isArray(rows) ? rows : [])]);
  return LIVE_IMU_ROLE_ORDER.map((role) => {
    const roleConfig = config?.[role.key] || {};
    const latestRow = mergedLatestRows.get(String(roleConfig.deviceId || role.deviceId || "")) || null;
    const baseline = baselines?.[role.key] || null;
    return {
      key: role.key,
      title: liveCopy?.[role.titleKey] || step4Copy?.[role.titleKey] || role.key,
      deviceId: String(roleConfig.deviceId || role.deviceId || ""),
      positionLabel: formatLegPositionLabel(analysisLeg, role.key, step4Copy),
      statusLabel: latestRow ? (isLiveSensorRecent(latestRow) ? liveCopy.online : liveCopy.waitingForData) : liveCopy.waitingForSensor,
      isOnline: Boolean(latestRow && isLiveSensorRecent(latestRow)),
      latestRow,
      calibratedAngle: calculateCalibratedAngle(latestRow, roleConfig, baseline),
    };
  });
}

function buildBluetoothLiveSensorCards({ latestRows, rows, liveCopy }) {
  const mergedLatestRows = buildLatestBluetoothRowsByDevice([...(Array.isArray(latestRows) ? latestRows : []), ...(Array.isArray(rows) ? rows : [])]);
  return BLE_IMU_DEVICE_CONFIG
    .map((device) => {
      const latestRow = mergedLatestRows.get(device.deviceId) || null;
      return {
        ...device,
        latestRow,
        isOnline: Boolean(latestRow && isLiveSensorRecent(latestRow)),
        statusLabel: latestRow ? (isLiveSensorRecent(latestRow) ? liveCopy.online : liveCopy.waitingForData) : liveCopy.waitingForSensor,
      };
    });
}

function buildLiveImuAnalysis({ latestRows, rows, config, baselines, analysisLeg, copy, fallbackCopy }) {
  const allRows = [ ...(Array.isArray(latestRows) ? latestRows : []), ...(Array.isArray(rows) ? rows : []) ];
  const mergedLatestRows = buildLatestRowsByDevice([...(Array.isArray(latestRows) ? latestRows : []), ...(Array.isArray(rows) ? rows : [])]);
  const roleStatuses = LIVE_IMU_ROLE_ORDER.map((role) => {
    const roleConfig = config?.[role.key] || {};
    const latestRow = mergedLatestRows.get(roleConfig.deviceId) || null;
    const baseline = baselines?.[role.key] || null;
    const baselineReady = Boolean(
      baseline
      && String(baseline.deviceId || "") === String(roleConfig.deviceId || "")
      && baseline.pitch !== null
      && baseline.pitch !== undefined
      && baseline.roll !== null
      && baseline.roll !== undefined
    );

    return {
      ...role,
      title: fallbackCopy?.[role.titleKey] || copy?.[role.titleKey] || role.key,
      config: roleConfig,
      latestRow,
      baseline,
      baselineReady,
      isOnline: Boolean(latestRow && isLiveSensorRecent(latestRow)),
    };
  });

  const roleByDevice = new Map(roleStatuses.map((status) => [String(status.config?.deviceId || ""), status]));
  const mappedRows = (Array.isArray(rows) ? rows : [])
    .filter((row) => roleByDevice.has(String(row?.device_id || "")))
    .sort((a, b) => (toTimestampMs(a?.timestamp) ?? 0) - (toTimestampMs(b?.timestamp) ?? 0));

  const liveSamples = [];
  const currentAngles = {};
  const motionSeries = [];

  for (const row of mappedRows) {
    const status = roleByDevice.get(String(row?.device_id || ""));
    if (!status) continue;
    const calibratedAngle = calculateCalibratedAngle(row, status.config, baselines?.[status.key]);
    liveSamples.push({
      timestamp: row?.timestamp || null,
      analysis_leg: analysisLeg,
      device_id: row?.device_id || "-",
      source: "real",
      source_label: copy.online,
      sensor_role: status.title,
      body_part: row?.body_part || "-",
      pitch: asFiniteNumber(row?.pitch),
      roll: asFiniteNumber(row?.roll),
      raw_pitch: asFiniteNumber(row?.pitch),
      raw_roll: asFiniteNumber(row?.roll),
      acc_x: asFiniteNumber(row?.acc_x),
      acc_y: asFiniteNumber(row?.acc_y),
      acc_z: asFiniteNumber(row?.acc_z),
      gyro_x: asFiniteNumber(row?.gyro_x),
      gyro_y: asFiniteNumber(row?.gyro_y),
      gyro_z: asFiniteNumber(row?.gyro_z),
      temperature: asFiniteNumber(row?.temperature),
      calibrated_angle: calibratedAngle,
    });

    if (calibratedAngle === null) continue;
    currentAngles[status.key] = calibratedAngle;
    if (currentAngles.knee !== undefined && currentAngles.ankle !== undefined) {
      motionSeries.push({
        timestamp: row?.timestamp || null,
        angle: roundCalc(currentAngles.ankle - currentAngles.knee, 3),
      });
    }
  }

  const warnings = [];
  const kneeRows = liveSamples.filter((row) => row.device_id === roleStatuses.find((status) => status.key === "knee")?.config?.deviceId);
  const ankleRows = liveSamples.filter((row) => row.device_id === roleStatuses.find((status) => status.key === "ankle")?.config?.deviceId);
  const hasSensorGaps = roleStatuses.some((status) => !status.isOnline);
  const hasBluetoothRows = allRows.some((row) => isBluetoothImuRow(row));
  if (kneeRows.length === 0 || ankleRows.length === 0) {
    warnings.push(
      hasBluetoothRows
        ? fallbackCopy.bluetoothMappingWarning
        : fallbackCopy.liveResultPiWarning,
    );
  } else if (motionSeries.length === 0) {
    warnings.push(fallbackCopy.liveResultUnavailable);
  }

  if (motionSeries.length === 0) {
    return { roleStatuses, liveSamples, motionSeries, warnings, result: null };
  }

  const motionAngles = motionSeries
    .map((item) => asFiniteNumber(item.angle))
    .filter((value) => value !== null);
  const minAngle = Math.min(...motionAngles);
  const maxAngle = Math.max(...motionAngles);
  const romDeg = roundCalc(maxAngle - minAngle, 1);

  return {
    roleStatuses,
    liveSamples,
    motionSeries,
    warnings,
    result: {
      analysis_source: "live",
      dominant_activity_label: "Live sensor ROM",
      overall_score: null,
      rom_deg: romDeg,
      min_angle_deg: roundCalc(minAngle, 1),
      max_angle_deg: roundCalc(maxAngle, 1),
      feedback: [{ level: hasSensorGaps ? "Needs sensor check" : "Calibrated live stream" }],
      warning: warnings[0] || "",
      live_samples: liveSamples,
      live_motion_series: motionSeries,
      live_sensor_statuses: roleStatuses,
      live_warnings: warnings,
      session_summary: {
        rom_deg: romDeg,
        min_angle_deg: roundCalc(minAngle, 1),
        max_angle_deg: roundCalc(maxAngle, 1),
        rom_valid: true,
        rom_method_used: "live_relative_angle",
        rom_warning: warnings[0] || "",
        sensor_format: "live_3sensor_stream",
        n_real_channels: roleStatuses.filter((status) => status.latestRow).length,
        emg_detected: false,
        repetitions: motionSeries.length,
        analysis_leg: analysisLeg,
        sensor_setup_note: `Live analysis for the ${analysisLeg} leg uses calibrated ankle/shin minus thigh/knee angles from recent Raspberry Pi database rows.`,
      },
    },
  };
}

function Step4ImuSampleTable({ title, hint, rows, liveCopy }) {
  if (!Array.isArray(rows) || rows.length === 0) return null;

  return (
    <div className="dataTableWrap">
      <div className="tableTitle">{title}</div>
      {hint ? <div className="microNote">{hint}</div> : null}
      <table className="dataTable">
        <thead>
          <tr>
            <th>{liveCopy.timestamp}</th>
            <th>analysis_leg</th>
            <th>{liveCopy.deviceId}</th>
            <th>sensor_role</th>
            <th>{liveCopy.bodyPart}</th>
            <th>{liveCopy.pitch}</th>
            <th>{liveCopy.roll}</th>
            <th>{liveCopy.accX}</th>
            <th>{liveCopy.accY}</th>
            <th>{liveCopy.accZ}</th>
            <th>gyro_x</th>
            <th>gyro_y</th>
            <th>gyro_z</th>
            <th>temperature</th>
            <th>{liveCopy.source}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={`${row.timestamp || "ts"}_${row.device_id || "dev"}_${row.source || "src"}_${index}`}>
              <td>{formatDate(row.timestamp)}</td>
              <td>{row.analysis_leg || "-"}</td>
              <td>{row.device_id || "-"}</td>
              <td>{row.sensor_role || "-"}</td>
              <td>{row.body_part || "-"}</td>
              <td>{f(row.pitch, "°")}</td>
              <td>{f(row.roll, "°")}</td>
              <td>{f(row.acc_x)}</td>
              <td>{f(row.acc_y)}</td>
              <td>{f(row.acc_z)}</td>
              <td>{f(row.gyro_x)}</td>
              <td>{f(row.gyro_y)}</td>
              <td>{f(row.gyro_z)}</td>
              <td>{f(row.temperature)}</td>
              <td>{row.source || "-"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function App() {
  const storedState = readStoredAppState();
  const storedPatientId = storedState.patient_id || "";
  const [lang, setLang] = useState(() => storedState.lang || "en");
  const [activeStep, setActiveStep] = useState(() => (storedPatientId ? safeStep(storedState.active_step) : DEFAULT_STEP));
  const [completedSteps, setCompletedSteps] = useState({});
  const [health, setHealth] = useState(null);
  const [healthLoading, setHealthLoading] = useState(false);
  const [healthError, setHealthError] = useState("");

  const [patientId, setPatientId] = useState(() => storedPatientId);
  const [patientName, setPatientName] = useState(() => storedState.patient_name || "");
  const [exercise, setExercise] = useState(() => storedState.exercise || "knee_extension");
  const [sensorLocation, setSensorLocation] = useState(() => storedState.sensor_location || "auto");
  const [sessions, setSessions] = useState([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [liveImuLatest, setLiveImuLatest] = useState([]);
  const [liveImuRows, setLiveImuRows] = useState([]);
  const [liveImuLoading, setLiveImuLoading] = useState(false);

  const [koosAnswers, setKoosAnswers] = useState({});
  const [koosPageIndex, setKoosPageIndex] = useState(0);
  const [koosResult, setKoosResult] = useState(null);
  const [koosLoading, setKoosLoading] = useState(false);
  const [koosError, setKoosError] = useState("");

  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState("");
  const [klResult, setKlResult] = useState(null);
  const [klLoading, setKlLoading] = useState(false);
  const [klError, setKlError] = useState("");

  const [imuFile, setImuFile] = useState(null);
  const [imuResult, setImuResult] = useState(null);
  const [imuLoading, setImuLoading] = useState(false);
  const [imuError, setImuError] = useState("");
  const [imuDataSource, setImuDataSource] = useState("csv");
  const [imuAnalysisLeg, setImuAnalysisLeg] = useState("left");
  const [liveSensorConfig, setLiveSensorConfig] = useState(() => createDefaultLiveSensorConfig());
  const [liveSensorBaselines, setLiveSensorBaselines] = useState({
    hip: null,
    knee: null,
    ankle: null,
  });

  const [reportResult, setReportResult] = useState(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [reportError, setReportError] = useState("");
  const [watchedVideos, setWatchedVideos] = useState({});
  const [selectedVideoId, setSelectedVideoId] = useState("");
  const [isVideoModalOpen, setIsVideoModalOpen] = useState(false);

  const imageInputRef = useRef(null);
  const csvInputRef = useRef(null);
  const t = STRINGS[lang];
  const liveImuText = realtimeImuCopy(lang);
  const step4ImuText = STEP4_IMU_COPY;

  const latestSession = sessions[0] || null;
  const previousSessionRom = latestSession?.current_rom ?? null;
  const currentMinAngle = imuResult?.min_angle_deg ?? imuResult?.session_summary?.min_angle_deg ?? imuResult?.rom_scores?.[0]?.min_angle_deg ?? null;
  const currentMaxAngle = imuResult?.max_angle_deg ?? imuResult?.session_summary?.max_angle_deg ?? imuResult?.rom_scores?.[0]?.max_angle_deg ?? null;
  const currentRom = imuResult?.rom_deg ?? imuResult?.session_summary?.rom_deg ?? imuResult?.rom_scores?.[0]?.rom_deg ?? null;
  const imuSummary = imuResult?.session_summary || {};
  const imuRomValid = imuSummary.rom_valid !== false && currentRom !== null && currentRom !== undefined;
  const imuRomMethodUsed = imuSummary.rom_method_used || "-";
  const imuRomDiagnostics = Array.isArray(imuSummary.rom_candidate_diagnostics) ? imuSummary.rom_candidate_diagnostics : [];
  const gyroRomDiagnostic = imuRomDiagnostics.find((item) => item?.name === "gyro_integrated_detrended");
  const imuFallbackWarning = !imuRomValid
    ? (imuSummary.rom_warning || imuResult?.warning || "ROM could not be calculated reliably from this file.")
    : (
        imuSummary.rom_warning
        || (
          imuRomMethodUsed === "accelerometer_relative_tilt" && gyroRomDiagnostic && gyroRomDiagnostic.valid === false
            ? `Raw gyro ROM was rejected because ${String(gyroRomDiagnostic.reason || "").replace(/\.$/, "").toLowerCase()}; accelerometer relative tilt was used instead.`
            : ""
        )
      );
  const imuSignedDeltaRom = currentRom !== null && previousSessionRom !== null
    ? Number((Number(currentRom) - Number(previousSessionRom)).toFixed(1))
    : null;
  const imuAbsoluteDeltaRom = imuSignedDeltaRom !== null ? Number(Math.abs(imuSignedDeltaRom).toFixed(1)) : null;
  const imuRepetitions = imuResult?.session_summary?.repetitions ?? imuResult?.repetitions ?? 8;
  const totalAnswered = Object.keys(koosAnswers).length;
  const activeStepMeta = STEPS.find((step) => step.id === activeStep) || STEPS[0];
  const stepHeadings = STEP_HEADINGS[activeStep] || [];
  const koosQuestionText = KOOS_QUESTION_TEXT_I18N[lang] || KOOS_QUESTION_TEXT_I18N.en;
  const currentKoosPanel = KOOS_PANELS[koosPageIndex] || KOOS_PANELS[0];
  const isFinalKoosPage = koosPageIndex === KOOS_PANELS.length - 1;
  const currentKoosAnswered = currentKoosPanel.questions.filter((num) => koosAnswers[`q${num}`] !== undefined).length;
  const currentKoosComplete = currentKoosAnswered === currentKoosPanel.questions.length;
  const canCalculateKoos = isFinalKoosPage && currentKoosComplete && totalAnswered === 42;
  const koosProgressPct = Math.round((totalAnswered / 42) * 100);

  const readyState = useMemo(
    () => ({
      patient: patientId.trim().length > 0,
      koos: Boolean(koosResult?.koos_total !== undefined),
      kl: Boolean(klResult?.kl_grade !== undefined),
      imu: Boolean(imuResult && imuRomValid),
      report: Boolean(reportResult?.session_id),
      videos: Boolean(reportResult?.session_id),
    }),
    [patientId, koosResult, klResult, imuResult, imuRomValid, reportResult]
  );
  const activeStepComplete =
    (activeStep === "patient" && readyState.patient) ||
    (activeStep === "koos" && readyState.koos) ||
    (activeStep === "kl" && readyState.kl) ||
    (activeStep === "imu" && readyState.imu) ||
    (activeStep === "report" && readyState.report) ||
    (activeStep === "videos" && readyState.videos);
  const showGlobalWizardNav = !["koos", "videos"].includes(activeStep) && !activeStepComplete;
  const klModelStatus = klResult?.kl_model || health?.kl_model;
  const klGradeLabel = klResult ? t.klLabels[String(klResult.kl_grade)] || klResult.label || t.labels.klGrade : "-";
  const movementResult = imuResult?.dominant_activity_label || imuResult?.dominant_activity || imuResult?.source || "-";
  const reportStatusKey = reportResult?.interpretation || "insufficient_data";
  const rawFormulaScore = reportResult?.raw_score ?? reportResult?.predicted_delta_KOOS;
  const finalRehabScore = reportResult?.final_rehab_score ?? mapRawRehabScoreTo100(Number(rawFormulaScore));
  const rehabLevel = rehabLevelFromScore(finalRehabScore);
  const isFirstRomSession = Boolean(reportResult?.is_first_rom_session);
  const firstRomSessionTitle = "First ROM session";
  const firstRomSessionMessage = "This is the patient's first ROM session. Delta ROM needs both previous ROM and current ROM. For this first report, Delta ROM is set to 0 as a baseline estimate. After the next session, the system will calculate real Delta ROM.";
  const exerciseVideos = useMemo(() => getExerciseVideosForScore(finalRehabScore), [finalRehabScore]);
  const selectedVideo = getSelectedVideo(exerciseVideos, selectedVideoId);
  const localizedKoosPanelTag =
    t.koosSections[KOOS_PANEL_TAG_KEYS[currentKoosPanel.tag]] || currentKoosPanel.tag || "";
  const localizedKoosPanelNote =
    currentKoosPanel.note === "Includes next section"
      ? t.messages.includesNextSection
      : currentKoosPanel.note || "";
  const normalizedLiveImuLatest = useMemo(() => normalizeImuRows(liveImuLatest), [liveImuLatest]);
  const normalizedLiveImuRows = useMemo(() => normalizeImuRows(liveImuRows), [liveImuRows]);
  const realtimeLatestByDevice = useMemo(
    () => buildLatestRowsByDevice([...(Array.isArray(normalizedLiveImuLatest) ? normalizedLiveImuLatest : []), ...(Array.isArray(normalizedLiveImuRows) ? normalizedLiveImuRows : [])]),
    [normalizedLiveImuLatest, normalizedLiveImuRows]
  );
  const step4PiSensorCards = useMemo(
    () => buildRealtimeSensorCards(PI_IMU_DEVICE_CONFIG, realtimeLatestByDevice, liveImuText),
    [realtimeLatestByDevice, liveImuText]
  );
  const step4WitMotionSensorCards = useMemo(
    () => buildRealtimeSensorCards(WITMOTION_IMU_DEVICE_CONFIG, realtimeLatestByDevice, liveImuText),
    [realtimeLatestByDevice, liveImuText]
  );
  const step4RealtimeAnalysis = useMemo(
    () => buildRealtimeAnalysis(normalizedLiveImuRows, step4ImuText),
    [normalizedLiveImuRows, step4ImuText]
  );
  const step4RecentLiveRows = useMemo(
    () => (Array.isArray(normalizedLiveImuRows) ? normalizedLiveImuRows : [])
      .filter((row) => {
        if (imuDataSource === "live") return isPiRow(row) || isWitMotionRow(row);
        return false;
      })
      .sort((a, b) => (toTimestampMs(b?.timestamp) ?? 0) - (toTimestampMs(a?.timestamp) ?? 0))
      .slice(0, 5),
    [imuDataSource, normalizedLiveImuRows]
  );
  const step4VisualizationSensors = [...step4PiSensorCards, ...step4WitMotionSensorCards];
  const step4VisibleSampleRows = Array.isArray(step4RealtimeAnalysis.live_samples) ? step4RealtimeAnalysis.live_samples : [];
  const koosBreakdowns = useMemo(() => {
    if (!koosResult) return [];

    const details = koosResult.subscale_details || {};
    const subscaleCards = KOOS_SUBSCALE_ORDER.filter((key) => Number.isFinite(Number(koosResult?.subscales?.[key]))).map((key) => {
      const score = Number(koosResult.subscales[key]);
      const detail = details[key] || {};
      const meanAnswer = Number(detail.mean_answer);
      const answeredValues = Array.isArray(detail.answered_values) ? detail.answered_values : [];
      const divideResult = roundCalc(meanAnswer / 4, 4);
      const multiplyResult = roundCalc((meanAnswer / 4) * 100, 2);
      const label = t.koosSections[key] || key;

      return {
        title: label,
        formula: detail.formula || "KOOS_pre subscale = 100 - (mean answer / 4) × 100",
        inputs: [
          { label: "Answered values", value: answeredValues.length ? answeredValues.join(", ") : "-" },
          { label: "Mean answer", value: formatCalcNumber(meanAnswer, 4) },
        ],
        steps: [
          { label: "Substitute patient values", value: `${label} KOOS_pre = 100 - (${formatCalcNumber(meanAnswer, 4)} / 4) × 100` },
          { label: "Divide", value: `${label} = 100 - ${formatCalcNumber(divideResult, 4)} × 100` },
          { label: "Multiply", value: `${label} = 100 - ${formatCalcNumber(multiplyResult, 2)}` },
        ],
        finalAnswer: `${label} = ${formatCalcNumber(score, 2)}`,
        meaningText: "Higher KOOS values indicate better knee status.",
      };
    });

    const totalDetails = koosResult.total_details || {};
    const totalValues = Array.isArray(totalDetails.values) ? totalDetails.values.map(Number) : [];
    const totalLabels = (totalDetails.available_subscales || []).map((key) => t.koosSections[key] || key);
    const totalSum = Number(totalDetails.sum);
    const totalCount = Number(totalDetails.count);
    if (totalValues.length > 0 && totalCount > 0) {
      subscaleCards.push({
        title: t.labels.koosPre,
        formula: totalDetails.formula || "KOOS_pre = average of available KOOS_pre subscales",
        inputs: totalLabels.map((label, index) => ({
          label,
          value: formatCalcNumber(totalValues[index], 2),
        })),
        steps: [
          { label: "Substitute values", value: `KOOS_pre = (${totalLabels.join(" + ")}) / ${totalCount}` },
          { label: "Use patient values", value: `KOOS_pre = (${totalValues.map((value) => formatCalcNumber(value, 2)).join(" + ")}) / ${totalCount}` },
          { label: "Add", value: `KOOS_pre = ${formatCalcNumber(totalSum, 2)} / ${totalCount}` },
        ],
        finalAnswer: `KOOS_pre = ${formatCalcNumber(koosResult.koos_total, 2)}`,
        meaningText: "This pre-rehabilitation score is the average of the available KOOS_pre subscales.",
      });
    }

    return subscaleCards;
  }, [koosResult, t]);
  const imuRomDetail = useMemo(() => {
    if (!imuResult || !imuRomValid || !Number.isFinite(Number(currentRom))) return null;
    const gyroStd = Number(imuSummary.gyro_std_dps);
    const smoothnessScore = Number.isFinite(gyroStd) ? roundCalc(Math.max(0, Math.min(100, 100 * (1 - gyroStd / 80))), 1) : null;
    const signedDelta = imuSignedDeltaRom;
    const absoluteDelta = imuAbsoluteDeltaRom;
    const deltaExplanation = imuResult?.delta_rom_formula_explanation?.steps || [];

    return {
      title: "Range of Motion",
      formula: "ROM = max angle - min angle",
      inputs: [
        { label: "Max angle", value: Number.isFinite(Number(currentMaxAngle)) ? `${formatCalcNumber(currentMaxAngle, 1)}°` : "-" },
        { label: "Min angle", value: Number.isFinite(Number(currentMinAngle)) ? `${formatCalcNumber(currentMinAngle, 1)}°` : "-" },
        { label: "Previous ROM", value: previousSessionRom !== null ? `${formatCalcNumber(previousSessionRom, 1)}°` : "No previous session" },
      ],
      romSteps: Number.isFinite(Number(currentMaxAngle)) && Number.isFinite(Number(currentMinAngle)) ? [
        { label: "Patient values", value: `Max angle = ${formatCalcNumber(currentMaxAngle, 1)}°, Min angle = ${formatCalcNumber(currentMinAngle, 1)}°` },
        { label: "Substitute", value: `ROM = ${formatCalcNumber(currentMaxAngle, 1)} - ${formatCalcNumber(currentMinAngle, 1)}` },
        { label: "Calculate", value: `ROM = ${formatCalcNumber(currentRom, 1)}°` },
      ] : [],
      romFinal: `Range of Motion = ${formatCalcNumber(currentRom, 1)}°`,
      deltaFormula: "Delta ROM = current session ROM - previous session ROM",
      deltaSteps: previousSessionRom !== null ? [
        { label: "Current ROM", value: `Current ROM = ${formatCalcNumber(currentRom, 1)}°` },
        { label: "Previous ROM", value: `Previous ROM = ${formatCalcNumber(previousSessionRom, 1)}°` },
        { label: "Signed delta", value: `Delta ROM = ${formatCalcNumber(currentRom, 1)} - ${formatCalcNumber(previousSessionRom, 1)} = ${formatCalcNumber(signedDelta, 1)}°` },
        { label: "Absolute difference", value: `Absolute Delta ROM = abs(${formatCalcNumber(signedDelta, 1)}) = ${formatCalcNumber(absoluteDelta, 1)}°` },
      ] : deltaExplanation.map((item) => ({ label: "Rule", value: item })),
      deltaFinal: previousSessionRom !== null
        ? `Delta ROM difference = ${formatCalcNumber(absoluteDelta, 1)}°`
        : "Delta ROM cannot be calculated because this is the first available session.",
      smoothnessText: Number.isFinite(smoothnessScore)
        ? `Signed delta shows direction, absolute delta shows difference size. Smoothness score = clip(100 × (1 - gyro_std / 80), 0, 100). Current gyro_std = ${formatCalcNumber(gyroStd, 2)} °/s, smoothness = ${formatCalcNumber(smoothnessScore, 1)}%.`
        : "Smoothness status is based on movement analysis output from the backend.",
    };
  }, [currentMaxAngle, currentMinAngle, currentRom, imuAbsoluteDeltaRom, imuResult, imuRomValid, imuSignedDeltaRom, imuSummary.gyro_std_dps, previousSessionRom]);
  const imuSensorFormat = imuSummary.sensor_format || "-";
  const imuRealChannelsCount = Number.isFinite(Number(imuSummary.n_real_channels)) ? Number(imuSummary.n_real_channels) : null;
  const imuEmgDetected = imuSummary.emg_detected ? "Yes" : "No";
  const imuSensorSetupNote = imuSummary.sensor_setup_note || "-";
  const klBreakdown = useMemo(() => {
    if (!klResult) return null;
    const mapping = klResult.report_score_mapping || {};
    const betaMap = mapping.beta3_by_kl || {};
    const beta3 = mapping.beta3_kl;
    const mappingText = Object.entries(betaMap)
      .map(([grade, value]) => `KL ${grade} -> β3_KL ${value}`)
      .join(", ");

    return {
      title: "KL grading and report coefficient",
      formula: "X-ray image -> KL grading model -> KL grade -> β3_KL lookup for the report formula",
      inputs: [
        { label: "Model source", value: klResult.source || klResult.kl_model || "-" },
        { label: "KL grade", value: String(klResult.kl_grade ?? "-") },
        { label: "Confidence", value: pct(klResult.confidence) },
      ],
      steps: [
        { label: "Model output", value: `KL grade = ${klResult.kl_grade ?? "-"} (${klResult.label || klGradeLabel})` },
        { label: "Use the project mapping", value: mappingText || "KL coefficient mapping is loaded from the backend report formula." },
        { label: "Selected coefficient", value: Number.isFinite(Number(beta3)) ? `β3_KL = ${formatMaybeSigned(beta3, 2)}` : "β3_KL is not available for this result." },
      ],
      finalAnswer: Number.isFinite(Number(beta3))
        ? `KL grade ${klResult.kl_grade} contributes β3_KL = ${formatMaybeSigned(beta3, 2)}`
        : `KL grade = ${klResult.kl_grade ?? "-"}`,
      meaningText: "The image model predicts the KL grade directly. The report then looks up the existing KL coefficient from backend code.",
    };
  }, [klGradeLabel, klResult]);
  const reportBreakdown = useMemo(() => {
    if (!reportResult) return null;
    const koosPre = Number(reportResult.KOOS_pre);
    const deltaRom = Number(reportResult.delta_rom_used_in_score_deg ?? reportResult.delta_ROM);
    const beta3 = Number(reportResult.beta3_KL);
    const rawScore = Number(reportResult.raw_score ?? reportResult.predicted_delta_KOOS);
    const mappedScore =
      Number(reportResult.final_rehab_score ?? mapRawRehabScoreTo100(rawScore));
    const mappedLevel = rehabLevelFromScore(mappedScore);
    const mappedMeaning =
      reportResult.rehab_level_meaning || rehabMeaningFromScore(mappedScore);
    const rawLow = Number(reportResult.raw_score_mapping_low ?? RAW_SCORE_MAPPING_LOW);
    const rawHigh = Number(reportResult.raw_score_mapping_high ?? RAW_SCORE_MAPPING_HIGH);
    const rawFormulaText =
      "raw_score = 139.95 - 0.93*KOOS_pre - 0.785*Delta_ROM + beta3_KL";
    const firstSessionNote = reportResult.delta_rom_formula_explanation?.note
      || "Delta ROM is normally current ROM minus previous ROM. No previous ROM was found, so this first report uses 0.00 as baseline.";
    if (!Number.isFinite(koosPre) || !Number.isFinite(deltaRom) || !Number.isFinite(beta3) || !Number.isFinite(rawScore)) {
      return {
        title: t.reportSections.finalRehabilitationScore,
        formula: reportResult.formula_text || rawFormulaText,
        inputs: [
          { label: "KOOS_pre", value: f(reportResult.KOOS_pre) },
          { label: "Delta_ROM", value: f(reportResult.delta_rom_used_in_score_deg, "°") },
          { label: "KL grade", value: String(reportResult.KL_grade ?? "-") },
        ],
        steps: [],
        finalAnswer: "The full formula cannot be completed because a previous ROM value is not available yet.",
        meaningText: "The backend only calculates the raw formula output and mapped rehab score when KOOS_pre, Delta ROM, and the KL coefficient are all available.",
      };
    }
    const mappedNumerator = roundCalc(rawHigh - rawScore, 3);
    const mappedDenominator = roundCalc(rawHigh - rawLow, 2);
    const unclampedMapped = roundCalc(
      (100 * (rawHigh - rawScore)) / (rawHigh - rawLow),
      3,
    );

    return {
      title: t.reportSections.finalRehabilitationScore,
      formula: reportResult.formula_text || rawFormulaText,
      inputs: [
        { label: "KOOS_pre", value: formatCalcNumber(koosPre, 2) },
        { label: "Delta_ROM", value: `${formatCalcNumber(deltaRom, 2)}°` },
        { label: "Absolute delta ROM", value: `${formatCalcNumber(reportResult.delta_rom_abs_deg, 2)}°` },
        { label: "KL grade", value: String(reportResult.KL_grade ?? "-") },
        { label: "β3_KL", value: formatMaybeSigned(beta3, 3) },
        { label: "Mapped final rehab score", value: `${formatCalcNumber(mappedScore, 2)} / 100` },
      ],
      steps: [
        { label: "Original raw formula", value: rawFormulaText },
        { label: "Substitute patient values", value: `raw_score = 139.95 - 0.93*${formatCalcNumber(koosPre, 2)} - 0.785*${formatCalcNumber(deltaRom, 2)} + ${formatCalcNumber(beta3, 3)}` },
        { label: "Raw score result", value: `raw_score = ${formatCalcNumber(rawScore, 3)}` },
        { label: "Mapping formula", value: "final_rehab_score = 100 * (raw_high - raw_score) / (raw_high - raw_low)" },
        { label: "Map and clamp", value: `final_rehab_score = clamp(100 * (${formatCalcNumber(rawHigh, 2)} - ${formatCalcNumber(rawScore, 3)}) / (${formatCalcNumber(rawHigh, 2)} - ${formatCalcNumber(rawLow, 2)}), 0, 100) = clamp(100 * ${formatCalcNumber(mappedNumerator, 3)} / ${formatCalcNumber(mappedDenominator, 2)}, 0, 100) = ${formatCalcNumber(mappedScore, 2)} / 100` },
        { label: "Final mapped score", value: `final_rehab_score = ${formatCalcNumber(mappedScore, 2)} / 100` },
        { label: "Selected level", value: `Level ${mappedLevel}` },
        { label: "Simple meaning", value: `${t.explanations.lowerScoreMeaning} ${t.explanations.higherScoreMeaning}` },
        ...(reportResult.is_first_rom_session ? [{ label: "First-session note", value: firstSessionNote }] : []),
      ],
      finalAnswer: `Raw score ${formatCalcNumber(rawScore, 3)} -> Final rehab score ${formatCalcNumber(mappedScore, 2)}/100 -> Level ${mappedLevel}`,
      meaningText: `The raw formula stays visible for transparency. The mapped 0-100 score drives Level ${mappedLevel}: ${mappedMeaning}.`,
    };
  }, [reportResult, reportStatusKey, t.explanations.higherScoreMeaning, t.explanations.lowerScoreMeaning, t.reportSections.finalRehabilitationScore]);
  const exerciseLevelBreakdown = useMemo(() => {
    if (!Number.isFinite(Number(finalRehabScore))) {
      return {
        title: "Exercise level selection",
        formula: "Rehab level is selected from the mapped final rehab score (0-100).",
        inputs: [{ label: "Mapped final rehab score", value: "-" }],
        steps: [],
        finalAnswer: `Level ${rehabLevel} exercise plan selected.`,
        meaningText: "The current frontend falls back to Level 1 when the report score is unavailable.",
      };
    }
    const clampedMappedScore = clampScore(Number(finalRehabScore));
    return {
      title: "Exercise level selection",
      formula: "Use the same mapped final rehab score helpers as the final report: clampScore -> rehabLevelFromScore -> rehabMeaningFromScore",
      inputs: [
        { label: "Mapped final rehab score", value: formatCalcNumber(finalRehabScore, 2) },
        { label: "Selected level", value: `Level ${rehabLevel}` },
        { label: "Patient interpretation", value: rehabMeaningFromScore(finalRehabScore) },
      ],
      steps: [
        { label: "Clamp score", value: `clampScore(${formatCalcNumber(finalRehabScore, 2)}) = ${formatCalcNumber(clampedMappedScore, 2)}` },
        { label: "Select level band", value: `${formatCalcNumber(clampedMappedScore, 2)} falls in the ${rehabLevel === 1 ? "0-20" : rehabLevel === 2 ? "21-40" : rehabLevel === 3 ? "41-60" : rehabLevel === 4 ? "61-80" : "81-100"} range` },
        { label: "Patient interpretation", value: rehabMeaningFromScore(finalRehabScore) },
      ],
      finalAnswer: `Level ${rehabLevel} exercise plan selected.`,
      meaningText: "This uses the same mapped-score helpers as the final rehab report.",
    };
  }, [finalRehabScore, rehabLevel]);

  function translatedRecommendation(item) {
    const map = {
      "Continue current rehab protocol.": t.recommendationText.continueProtocol,
      "Re-evaluate KOOS and ROM in next session.": t.recommendationText.reevaluateNextSession,
      "Review exercise technique and intensity.": t.recommendationText.reviewTechnique,
      "Consider clinician follow-up for plan adjustment.": t.recommendationText.clinicianFollowUp,
      "Collect more sessions to establish trend.": t.recommendationText.collectMoreSessions,
    };
    return map[item] || item;
  }

  useEffect(() => {
    fetchHealth();
  }, []);

  useEffect(() => {
    let active = true;
    let timerId;

    async function loadLiveImu() {
      if (!active) return;
      setLiveImuLoading(true);
      try {
        const [latestRes, dataRes] = await Promise.all([
          fetch(`${API}/imu/latest`),
          fetch(`${API}/imu/data?limit=${LIVE_IMU_FETCH_LIMIT}`),
        ]);
        const latestPayload = await readResponsePayload(latestRes);
        const dataPayload = await readResponsePayload(dataRes);
        if (!active) return;
        setLiveImuLatest(latestRes.ok && Array.isArray(latestPayload.items) ? latestPayload.items : []);
        setLiveImuRows(dataRes.ok && Array.isArray(dataPayload.items) ? dataPayload.items : []);
      } catch {
        if (!active) return;
        setLiveImuLatest([]);
        setLiveImuRows([]);
      } finally {
        if (active) setLiveImuLoading(false);
      }
    }

    if (!(activeStep === "imu" && imuDataSource === "live")) {
      setLiveImuLoading(false);
      return () => {
        active = false;
      };
    }

    loadLiveImu();
    timerId = window.setInterval(loadLiveImu, 1500);

    return () => {
      active = false;
      window.clearInterval(timerId);
    };
  }, [activeStep, imuDataSource]);

  useEffect(() => {
    setHealthError("");
    setKoosError("");
    setKlError("");
    setImuError("");
    setReportError("");
  }, [activeStep]);

  useEffect(() => {
    writeStoredAppState({
      patient_id: patientId.trim(),
      patient_name: patientName.trim(),
      exercise,
      sensor_location: sensorLocation,
      active_step: safeStep(activeStep),
      lang,
    });
  }, [patientId, patientName, exercise, sensorLocation, activeStep, lang]);

  useEffect(() => {
    fetchSessions(patientId.trim(), exercise);
  }, [patientId, exercise]);

  useEffect(() => {
    return () => {
      if (imagePreview) URL.revokeObjectURL(imagePreview);
    };
  }, [imagePreview]);

  useEffect(() => {
    if (exerciseVideos.length === 0) {
      setSelectedVideoId("");
      setIsVideoModalOpen(false);
      return;
    }

    setSelectedVideoId((current) =>
      exerciseVideos.some((video) => video.id === current) ? current : exerciseVideos[0].id,
    );
  }, [exerciseVideos]);

  async function fetchHealth() {
    setHealthLoading(true);
    setHealthError("");
    try {
      const res = await fetch(`${API}/health`);
      const data = await readResponsePayload(res);
      if (!res.ok) throw { ...data, status: res.status };
      setHealth(data);
      setHealthError("");
    } catch (error) {
      setHealthError(friendlyError(error, t, "backendOffline"));
    } finally {
      setHealthLoading(false);
    }
  }

  async function fetchSessions(pid, ex) {
    if (!pid) {
      setSessions([]);
      return;
    }
    setSessionsLoading(true);
    setSessions([]);
    try {
      const q = new URLSearchParams();
      if (ex) q.set("exercise", ex);
      const res = await fetch(`${API}/sessions/${encodeURIComponent(pid)}?${q.toString()}`);
      if (!res.ok) throw new Error("sessions error");
      const data = await res.json();
      setSessions(Array.isArray(data.sessions) ? data.sessions : []);
    } catch {
      setSessions([]);
    } finally {
      setSessionsLoading(false);
    }
  }

  async function calculateKoos() {
    setKoosLoading(true);
    setKoosError("");
    try {
      const res = await fetch(`${API}/koos/calculate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers: koosAnswers }),
      });
      const data = await readResponsePayload(res);
      if (!res.ok) throw { ...data, status: res.status };
      setKoosResult(data);
      setKoosError("");
      setCompletedSteps((prev) => ({ ...prev, koos: true }));
    } catch (error) {
      setKoosError(friendlyError(error, t, "backendOffline"));
    } finally {
      setKoosLoading(false);
    }
  }

  async function analyzeKl() {
    if (!imageFile) return;
    if (!isKlFile(imageFile)) {
      setKlError(t.errors.wrongKlFile);
      return;
    }
    setKlLoading(true);
    setKlError("");
    try {
      const form = new FormData();
      form.append("file", imageFile);
      const res = await fetch(`${API}/predict-kl?lang=${lang}&kl_scale_max=4`, { method: "POST", body: form });
      const data = await readResponsePayload(res);
      if (!res.ok) throw { ...data, status: res.status };
      setKlResult(data);
      setKlError("");
    } catch (error) {
      setKlError(friendlyError(error, t, "klInvalid"));
    } finally {
      setKlLoading(false);
    }
  }

  async function analyzeImu() {
    if (imuDataSource === "live") {
      setImuLoading(true);
      setImuError("");
      try {
        setImuResult(step4RealtimeAnalysis);
        return;
      } finally {
        setImuLoading(false);
      }
    }

    if (!imuFile) return;
    if (!isImuFile(imuFile)) {
      setImuError(t.errors.wrongImuFile);
      return;
    }
    setImuLoading(true);
    setImuError("");
    try {
      const form = new FormData();
      form.append("file", imuFile);
      const res = await fetch(`${API}/imu/analyze?lang=${lang}&sensor_location=${sensorLocation}`, { method: "POST", body: form });
      const data = await readResponsePayload(res);
      if (!res.ok) throw { ...data, status: res.status };
      setImuResult(data);
      setImuError("");
    } catch (error) {
      setImuError(friendlyError(error, t, "imuInvalid"));
    } finally {
      setImuLoading(false);
    }
  }

  async function generateReport() {
    if (!readyState.patient || !readyState.koos || !readyState.kl || !readyState.imu) return;
    setReportLoading(true);
    setReportError("");
    try {
      const payload = {
        patient_id: patientId.trim(),
        patient_name: patientName.trim() || null,
        exercise,
        koos_pre: koosResult.koos_total,
        kl_grade: klResult.kl_grade,
        imu_result: imuResult,
        image_result: klResult,
      };
      const res = await fetch(`${API}/rehab/report`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await readResponsePayload(res);
      if (!res.ok) throw { ...data, status: res.status };
      setReportResult(data);
      setReportError("");
      setCompletedSteps((prev) => ({ ...prev, report: true }));
      fetchSessions(patientId.trim(), exercise);
    } catch (error) {
      setReportError(friendlyError(error, t, "backendOffline"));
    } finally {
      setReportLoading(false);
    }
  }

  function markComplete(id) {
    setCompletedSteps((prev) => ({ ...prev, [id]: true }));
  }

  function nextStep() {
    const idx = STEPS.findIndex((s) => s.id === activeStep);
    if (idx < 0 || idx === STEPS.length - 1) return;
    markComplete(activeStep);
    setActiveStep(STEPS[idx + 1].id);
  }

  function prevStep() {
    const idx = STEPS.findIndex((s) => s.id === activeStep);
    if (idx <= 0) return;
    setActiveStep(STEPS[idx - 1].id);
  }

  function continueToKoos() {
    markComplete("patient");
    setActiveStep("koos");
  }

  function continueToKl() {
    markComplete("koos");
    setActiveStep("kl");
  }

  function continueToImu() {
    markComplete("kl");
    setActiveStep("imu");
  }

  function continueToReport() {
    if (!imuRomValid) return;
    markComplete("imu");
    setActiveStep("report");
  }

  function continueToVideos() {
    markComplete("report");
    setActiveStep("videos");
  }

  function stepCompleteText(step) {
    return t.labels.stepComplete.replace("{step}", step);
  }

  function canContinue(stepId) {
    if (stepId === "patient") return readyState.patient;
    if (stepId === "koos") return readyState.koos;
    if (stepId === "kl") return readyState.kl;
    if (stepId === "imu") return readyState.imu;
    if (stepId === "report") return readyState.report;
    if (stepId === "videos") return readyState.videos;
    return false;
  }

  function getKoosOptions(qKey) {
    return KOOS_FREQUENCY_KEYS.has(qKey) ? KOOS_FREQUENCY_OPTIONS : KOOS_SEVERITY_OPTIONS;
  }

  function getKoosOptionLabel(qKey, value) {
    const group = KOOS_FREQUENCY_KEYS.has(qKey) ? "frequency" : "severity";
    return t.koosOptions[group][value] || String(value);
  }

  function selectImageFile(file) {
    if (!file) return;
    setKlError("");
    setReportError("");
    if (!isKlFile(file)) {
      setImageFile(null);
      setKlResult(null);
      setReportResult(null);
      setKlError(t.errors.wrongKlFile);
      setImagePreview((old) => {
        if (old) URL.revokeObjectURL(old);
        return "";
      });
      return;
    }
    setImageFile(file);
    setKlResult(null);
    setReportResult(null);
    setImagePreview((old) => {
      if (old) URL.revokeObjectURL(old);
      return URL.createObjectURL(file);
    });
  }

  function clearImageFile() {
    setImageFile(null);
    setKlResult(null);
    setKlError("");
    setReportError("");
    setImagePreview((old) => {
      if (old) URL.revokeObjectURL(old);
      return "";
    });
  }

  function selectImuFile(file) {
    if (!file) return;
    setImuError("");
    setReportError("");
    if (!isImuFile(file)) {
      setImuFile(null);
      setImuResult(null);
      setReportResult(null);
      setImuError(t.errors.wrongImuFile);
      return;
    }
    setImuFile(file);
    setImuResult(null);
    setReportResult(null);
  }

  function clearImuFile() {
    setImuFile(null);
    setImuResult(null);
    setImuError("");
    setReportError("");
  }

  function handleImuDataSourceChange(value) {
    setImuDataSource(value);
    setImuResult(null);
    setImuError("");
    setReportResult(null);
  }

  function handleImuAnalysisLegChange(value) {
    setImuAnalysisLeg(value);
    setImuResult(null);
    setImuError("");
    setReportResult(null);
  }

  function updateLiveSensorRoleConfig(roleKey, updates) {
    setLiveSensorConfig((current) => ({
      ...current,
      [roleKey]: {
        ...current[roleKey],
        ...updates,
      },
    }));
    setImuResult(null);
    setImuError("");
    setReportResult(null);
  }

  function captureLiveBaseline() {
    const latestByDevice = buildLatestRowsByDevice([...(Array.isArray(liveImuLatest) ? liveImuLatest : []), ...(Array.isArray(liveImuRows) ? liveImuRows : [])]);
    const nextBaselines = {};

    for (const role of LIVE_IMU_ROLE_ORDER) {
      const config = liveSensorConfig[role.key];
      const row = latestByDevice.get(config.deviceId);
      if (!row) {
        nextBaselines[role.key] = liveSensorBaselines[role.key] || null;
        continue;
      }
      nextBaselines[role.key] = {
        deviceId: config.deviceId,
        timestamp: row.timestamp || null,
        pitch: asFiniteNumber(row.pitch),
        roll: asFiniteNumber(row.roll),
      };
    }

    setLiveSensorBaselines((current) => ({ ...current, ...nextBaselines }));
    setImuResult(null);
    setImuError("");
    setReportResult(null);
  }

  return (
    <div className="app">
      <style>{GLOBAL_CSS}</style>
      <div className="shell">
        <aside className="sidebar">
          <div className="brand">
            <h1>{t.app}</h1>
            <p>{t.sidebarSubtitle}</p>
          </div>

          <div className="stepList">
            {STEPS.map((step, i) => {
              const complete = Boolean(completedSteps[step.id] || readyState.report && step.id === "report");
              const ready = Boolean(readyState[step.id]);
              const active = activeStep === step.id;
              return (
                <button key={step.id} className={`stepItem ${active ? "active" : ""}`} onClick={() => setActiveStep(step.id)}>
                  <div className="stepNum">{i + 1}</div>
                  <div className="stepTitle">{t.steps[step.id]}</div>
                  <div className={`badge ${complete ? "complete" : ready ? "ready" : ""}`}>{statusLabel(active, ready, complete, t)}</div>
                </button>
              );
            })}
          </div>

          <div className="history">
            <h3>{t.labels.patientHistory}</h3>
            {sessionsLoading ? <div className="empty">{t.labels.loading}</div> : null}
            {!sessionsLoading && sessions.length === 0 ? <div className="historyEmpty">{t.labels.noSessions}</div> : null}
            {sessions.slice(0, 4).map((session) => (
              <div className="historyCard" key={session.session_id}>
                <div className="historyTop">
                  <strong>{session.patient_name || session.patient_id}</strong>
                  <span>{formatDate(session.created_at)}</span>
                </div>
                <div className="historyMeta">ROM {f(session.current_rom, "°")} | KOOS {f(session.koos_pre)} | KL {session.kl_grade ?? "-"}</div>
              </div>
            ))}
          </div>
        </aside>

        <main className="main">
          <div className="topbar">
            <div className="clinicalLine">{t.clinicalLine}</div>
            <div className="topToolbar">
              <div className="lang" aria-label="Language switcher">
                {["en", "ru", "kz"].map((code) => (
                  <button key={code} className={lang === code ? "active" : ""} onClick={() => setLang(code)}>
                    {code.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <section className="hero" id={`${activeStep}-overview`}>
            <h2>{t.steps[activeStepMeta.id]}</h2>
            <p>{t.descriptions[activeStepMeta.id]}</p>
            {healthError ? <div className="error">{healthError}</div> : null}
          </section>

          {activeStep === "patient" ? (
            <section className="panel" id="patient-context">
              <div className="grid2 sectionBody">
                <div className="field">
                  <label htmlFor="patient-id">{t.labels.patientId}</label>
                  <input id="patient-id" value={patientId} onChange={(e) => setPatientId(e.target.value)} placeholder="P001" />
                </div>
                <div className="field">
                  <label htmlFor="patient-name">{t.labels.patientName}</label>
                  <input id="patient-name" value={patientName} onChange={(e) => setPatientName(e.target.value)} />
                </div>
                <div className="field">
                  <label htmlFor="exercise">{t.labels.exercise}</label>
                  <select id="exercise" value={exercise} onChange={(e) => setExercise(e.target.value)}>
                    {EXERCISES.map((x) => <option key={x.value} value={x.value}>{t.exercises[x.value]}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="sensor-setup">{t.labels.sensorSetup}</label>
                  <select id="sensor-setup" value={sensorLocation} onChange={(e) => setSensorLocation(e.target.value)}>
                    {SENSOR_SETUPS.map((x) => <option key={x.value} value={x.value}>{t.sensorSetups[x.value]}</option>)}
                  </select>
                </div>
              </div>
              <div className="summaryCards sectionBody" id="patient-history">
                <article className="summaryCard">
                  <small>{t.labels.savedSessions}</small>
                  <strong>{sessions.length}</strong>
                </article>
                <article className="summaryCard">
                  <small>{t.labels.latestRom}</small>
                  <strong>{latestSession ? f(latestSession.current_rom, "°") : "-"}</strong>
                </article>
                <article className="summaryCard">
                  <small>{t.labels.latestDate}</small>
                  <strong className="summaryDate">{latestSession ? formatDate(latestSession.created_at) : "-"}</strong>
                </article>
              </div>
              {readyState.patient ? (
                <div className="resultHero">
                  <div className="resultHeroTop">
                    <div>
                      <div className="resultKicker">{stepCompleteText(1)}</div>
                      <h4>{t.completion.patientTitle}</h4>
                      <p>{t.completion.patientText}</p>
                    </div>
                    <div className="resultValue">{patientId.trim()}<span>{t.labels.patientReady}</span></div>
                  </div>
                  <div className="metrics">
                    <div className="metric"><small>{t.labels.patientName}</small><strong style={{ fontSize: 18 }}>{patientName.trim() || "-"}</strong></div>
                    <div className="metric"><small>{t.labels.exercise}</small><strong style={{ fontSize: 18 }}>{t.exercises[exercise] || exercise}</strong></div>
                    <div className="metric"><small>{t.labels.sensorSetup}</small><strong style={{ fontSize: 18 }}>{t.sensorSetups[sensorLocation] || sensorLocation}</strong></div>
                  </div>
                  <div className="resultActions">
                    <button className="btn primary" onClick={continueToKoos}>{t.buttons.continueToKoos}</button>
                  </div>
                </div>
              ) : null}
            </section>
          ) : null}

          {activeStep === "koos" ? (
            <section className="panel" id="koos-calculate">
              {!koosResult ? (
                <>
                  <div className="koosWrap sectionBody">
                    <div className="koosHead koosPanelHead" id="koos-progress">
                      <div className="koosPageTitle">
                        <div className="koosPageMeta">
                          {t.labels.panel} {koosPageIndex + 1} {t.labels.of} {KOOS_PANELS.length}
                        </div>
                        <h3>{t.steps.koos}</h3>
                        <div className="koosPanelSubmeta">
                          {totalAnswered}/42 {t.labels.answered}
                        </div>
                      </div>
                      <div className="chips koosPanelTags">
                        {localizedKoosPanelTag ? <span className="chip teal">{localizedKoosPanelTag}</span> : null}
                        {localizedKoosPanelNote ? <span className="chip">{localizedKoosPanelNote}</span> : null}
                        <span className="chip">{t.labels.scoreRange}</span>
                      </div>
                    </div>
                    <div className="progressBar" aria-label={`${koosProgressPct}%`}>
                      <div className="progressFill" style={{ width: `${koosProgressPct}%` }} />
                    </div>
                    <div className="koosPage" id="koos-current">
                      {currentKoosPanel.questions.map((num) => {
                        const key = `q${num}`;
                        const options = getKoosOptions(key);
                        return (
                          <div className="koosQuestion" key={key}>
                            <h4>{koosQuestionText[key]}</h4>
                            <div className="koosOpts">
                              {options.map((opt) => {
                                const selected = koosAnswers[key] === opt.value;
                                return (
                                  <label className={`opt ${selected ? "selected" : ""}`} key={`${key}_${opt.value}`}>
                                    <input
                                      type="radio"
                                      name={key}
                                      checked={selected}
                                      onChange={() => {
                                        setKoosAnswers((prev) => ({ ...prev, [key]: opt.value }));
                                        setKoosResult(null);
                                        setReportResult(null);
                                      }}
                                    />
                                    <span>{opt.value} = {getKoosOptionLabel(key, opt.value)}</span>
                                  </label>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  <div className="wizardNav koosAction">
                    <button className="btn" onClick={() => setKoosPageIndex((prev) => Math.max(0, prev - 1))} disabled={koosPageIndex === 0}>
                      {t.buttons.previousQuestions}
                    </button>
                    {!currentKoosComplete ? <span className="koosActionNote">{t.messages.completeCurrentPage}</span> : null}
                    {isFinalKoosPage && currentKoosComplete && totalAnswered < 42 ? <span className="koosActionNote">{t.messages.completeAllKoos}</span> : null}
                    {isFinalKoosPage ? (
                      <button className="btn primary" onClick={calculateKoos} disabled={!canCalculateKoos || koosLoading}>
                        {koosLoading ? t.buttons.calculating : t.buttons.calculateKoos}
                      </button>
                    ) : (
                      <button className="btn primary" onClick={() => setKoosPageIndex((prev) => Math.min(KOOS_PANELS.length - 1, prev + 1))} disabled={!currentKoosComplete}>
                        {t.buttons.nextQuestions}
                      </button>
                    )}
                  </div>
                </>
              ) : (
                <div className="resultHero">
                  <div className="resultHeroTop">
                    <div>
                      <div className="resultKicker">{stepCompleteText(2)}</div>
                      <h4>{t.completion.koosTitle}</h4>
                      <p>{t.completion.koosText}</p>
                    </div>
                    <div className="resultValue">{f(koosResult.koos_total)}<span>{t.labels.koosPre}</span></div>
                  </div>
                  <div className="resultBars subscaleBars">
                    {Object.entries(koosResult.subscales || {}).map(([k, v]) => (
                      <div className="resultBarRow" key={k}>
                        <div className="resultBarLabel">{t.koosSections[k] || k}</div>
                        <div className="resultBarTrack"><div className="resultBarFill" style={{ width: `${Math.max(0, Math.min(100, Number(v) || 0))}%` }} /></div>
                        <div className="resultBarValue">{f(v)}</div>
                      </div>
                    ))}
                  </div>
                  <div className="detailPanel">
                    <div className="formulaBox">{t.explanations.koosFormula}</div>
                    <div className="detailGrid">
                      <div className="detailCard">
                        <strong>{t.labels.scorePerQuestion}</strong>
                        <p>{t.explanations.koosScoring}</p>
                      </div>
                      <div className="detailCard">
                        <strong>{t.labels.answeredQuestions}</strong>
                        <p>{totalAnswered}/42</p>
                      </div>
                    </div>
                  </div>
                  <div className="calcCardGrid">
                    {koosBreakdowns.map((card) => (
                      <FormulaBreakdown
                        key={card.title}
                        title={card.title}
                        formula={card.formula}
                        inputs={card.inputs}
                        steps={card.steps}
                        finalAnswer={card.finalAnswer}
                        meaningText={card.meaningText}
                      />
                    ))}
                  </div>
                  <div className="resultActions">
                    <button className="btn primary" onClick={continueToKl}>{t.buttons.continueToKl}</button>
                  </div>
                </div>
              )}
              {koosError ? <div className="error">{koosError}</div> : null}
            </section>
          ) : null}

          {activeStep === "kl" ? (
            <section className="panel" id="kl-upload">
              <div className="klLayout sectionBody">
                <div className="uploadStack">
                  {imagePreview ? (
                    <div className="klPreviewShell">
                      <img src={imagePreview} className="xrayPreview" alt={t.upload.selectedImage} />
                    </div>
                  ) : (
                    <button
                      className="fileDrop large"
                      onClick={() => imageInputRef.current?.click()}
                      onDragOver={(event) => event.preventDefault()}
                      onDrop={(event) => {
                        event.preventDefault();
                        selectImageFile(event.dataTransfer.files?.[0]);
                      }}
                    >
                      <div>
                        <strong>{t.upload.dragImage}</strong>
                        <span>{t.upload.imageTypes}</span>
                        <div className="fileHint">{t.upload.formats}</div>
                      </div>
                    </button>
                  )}
                  {imageFile ? (
                    <div className="fileSummary">
                      <div>
                        <strong>{t.upload.selectedImage}</strong>
                        <span>{imageFile.name}</span>
                      </div>
                      <div className="chips">
                        <button className="btn" onClick={clearImageFile}>{t.buttons.removeFile}</button>
                        <button className="btn" onClick={() => imageInputRef.current?.click()}>{t.buttons.chooseDifferentImage}</button>
                      </div>
                    </div>
                  ) : null}
                  <input ref={imageInputRef} type="file" hidden accept={KL_ACCEPT} onChange={(e) => {
                    const file = e.target.files?.[0];
                    selectImageFile(file);
                    e.target.value = "";
                  }} />
                </div>
                <div id="kl-result">
                  {!klResult ? (
                    <button className="btn primary" onClick={analyzeKl} disabled={!imageFile || klLoading}>{klLoading ? t.buttons.analyzing : t.buttons.analyzeKl}</button>
                  ) : null}
                  {klError ? <div className="error">{klError}</div> : null}
                  {!klResult && !klError ? <div className="empty">{t.messages.noKlResult}</div> : null}
                  {klResult ? (
                    <div className="resultHero">
                      <div className="resultHeroTop">
                        <div>
                          <div className="resultKicker">{stepCompleteText(3)}</div>
                          <h4>{t.completion.klTitle}</h4>
                          <p>{t.completion.klText}</p>
                        </div>
                        <div className="resultValue">{klGradeLabel}<span>{t.labels.klGrade} {klResult.kl_grade}</span></div>
                      </div>
                      <div className="explainList">
                        <div className="explainItem">{t.explanations.klExplanation}</div>
                        <div className="explainItem">{t.explanations.klHow}</div>
                      </div>
                      <div className="metrics wideMetrics">
                        <div className="metric"><small>{t.labels.klGrade}</small><strong>{klResult.kl_grade}</strong></div>
                        <div className="metric"><small>{t.labels.confidence}</small><strong>{pct(klResult.confidence)}</strong></div>
                        <div className="metric"><small>{t.labels.klScale}</small><strong>{klResult.kl_scale_max ?? klResult.scale_max ?? 4}</strong></div>
                        <div className="metric"><small>{t.labels.aiAssisted}</small><strong style={{ fontSize: 18 }}>{t.status.ready}</strong></div>
                      </div>
                      <div className="formulaBox">Image preprocessing → KL classifier → class probabilities → predicted KL grade</div>
                      {klBreakdown ? (
                        <div className="calcCardGrid">
                          <FormulaBreakdown
                            title={klBreakdown.title}
                            formula={klBreakdown.formula}
                            inputs={klBreakdown.inputs}
                            steps={klBreakdown.steps}
                            finalAnswer={klBreakdown.finalAnswer}
                            meaningText={klBreakdown.meaningText}
                          />
                        </div>
                      ) : null}
                      <div className="microNote">{t.explanations.klSafety}</div>
                      {klModelStatus === "demo_kl" ? (
                        <div className="chips">
                          <span className="chip coral">{t.status.demoMode}</span>
                        </div>
                      ) : null}
                      <div className="resultActions">
                        <button className="btn primary" onClick={continueToImu}>{t.buttons.continueToImu}</button>
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>
            </section>
          ) : null}

          {activeStep === "imu" ? (
            <section className="panel" id="imu-upload">
              <div className="imuStepLayout sectionBody">
                <div className="imuDashboardTop">
                  <div className="imuControlCard">
                    <div className="field">
                      <label>{step4ImuText.dataSource}</label>
                      <div className="summaryCards imuSourceCards" role="radiogroup" aria-label={step4ImuText.dataSource}>
                        {[
                          { value: "csv", label: step4ImuText.sourceCsv, hint: step4ImuText.sourceCsvHint },
                          { value: "live", label: step4ImuText.sourceLive, hint: step4ImuText.sourceLiveHint },
                        ].map((option) => (
                          <label key={option.value} className="summaryCard" style={{ cursor: "pointer" }}>
                            <div className="sensorCardHeader">
                              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                <input
                                  type="radio"
                                  name="imu-data-source"
                                  value={option.value}
                                  checked={imuDataSource === option.value}
                                  onChange={(event) => handleImuDataSourceChange(event.target.value)}
                                />
                                <strong className="summaryDate">{option.label}</strong>
                              </div>
                              <span className={`chip ${imuDataSource === option.value ? "teal" : ""}`}>
                                {imuDataSource === option.value ? t.status.ready : t.status.pending}
                              </span>
                            </div>
                            <div className="microNote">{option.hint}</div>
                          </label>
                        ))}
                      </div>
                    </div>

                    {imuDataSource === "csv" ? (
                      <>
                        <div className="field">
                          <label htmlFor="imu-analysis-leg">{step4ImuText.selectedLeg}</label>
                          <select id="imu-analysis-leg" value={imuAnalysisLeg} onChange={(event) => handleImuAnalysisLegChange(event.target.value)}>
                            <option value="left">{step4ImuText.leftLeg}</option>
                            <option value="right">{step4ImuText.rightLeg}</option>
                          </select>
                          <div className="microNote">{step4ImuText.legHint}</div>
                        </div>
                        {!imuFile ? (
                          <button
                            className="fileDrop"
                            onClick={() => csvInputRef.current?.click()}
                            onDragOver={(event) => event.preventDefault()}
                            onDrop={(event) => {
                              event.preventDefault();
                              selectImuFile(event.dataTransfer.files?.[0]);
                            }}
                          >
                            <div><strong>{t.upload.uploadImu}</strong><br /><span>{t.upload.imuTypes}</span><div className="fileHint">{step4ImuText.csvUploadHelper}</div></div>
                          </button>
                        ) : (
                          <div className="fileSummary">
                            <div>
                              <strong>{t.upload.selectedImu}</strong>
                              <span>{imuFile.name}</span>
                            </div>
                            <button className="btn" onClick={clearImuFile}>{t.buttons.remove}</button>
                          </div>
                        )}
                        <input ref={csvInputRef} type="file" hidden accept={IMU_ACCEPT} onChange={(e) => {
                          const file = e.target.files?.[0];
                          selectImuFile(file);
                          e.target.value = "";
                        }} />
                      </>
                    ) : (
                      <>
                        <div className="reportBlock">
                          <div className="reportBlockHead">
                            <h4>{step4ImuText.sourceLive}</h4>
                            <span className="microNote">{liveImuText.refreshNote}</span>
                          </div>
                          <p className="microNote">{step4ImuText.witmotionLiveNote}</p>
                          <p className="microNote">{step4ImuText.witmotionMappingNote}</p>
                          {liveImuLoading && step4RecentLiveRows.length === 0 ? <div className="empty">{t.labels.loading}</div> : null}
                        </div>
                      </>
                    )}
                  </div>

                  <div className="imuActionCard" id="imu-result">
                    <div className="reportBlockHead">
                      <h4>{t.buttons.analyzeImu}</h4>
                    </div>
                    <p className="microNote">
                      {imuDataSource === "live"
                        ? "Run combined left/right live ROM analysis from Raspberry Pi and WitMotion sensors."
                        : "Analyze the uploaded CSV file using the existing offline ROM workflow."}
                    </p>
                    <button className="btn primary" onClick={analyzeImu} disabled={(imuDataSource === "csv" && !imuFile) || imuLoading}>
                      {imuLoading ? t.buttons.analyzing : t.buttons.analyzeImu}
                    </button>
                    {imuError ? <div className="error">{imuError}</div> : null}
                  </div>
                </div>

                {imuResult ? (
                  <div>
                    {imuResult?.analysis_source === "live_combined" ? (
                      <div className="resultHero">
                        <div className="resultHeroTop">
                          <div>
                            <div className="resultKicker">{stepCompleteText(4)}</div>
                            <h4>{t.completion.imuTitle}</h4>
                            <p>{t.completion.imuText}</p>
                          </div>
                          <div className="resultValue">{f(currentRom, "°")}<span>{step4ImuText.liveCombinedStatus}</span></div>
                        </div>
                        <div className="formulaBox">{step4ImuText.liveResultFormula}</div>
                        <div className="imuLegResultGrid">
                          {[imuResult.left_leg, imuResult.right_leg].map((side) => (
                            <div className="imuLegResultCard" key={side.title}>
                              <div className="sensorCardHeader">
                                <div>
                                  <small>{side.sourceLabel}</small>
                                  <h5>{side.title}</h5>
                                </div>
                                <span className={`chip ${side.valid ? "teal" : "coral"}`}>{side.valid ? t.status.ready : "Warning"}</span>
                              </div>
                              {side.rom_deg !== null ? (
                                <div className="metrics">
                                  <div className="metric"><small>{t.labels.rangeOfMotion}</small><strong>{f(side.rom_deg, "°")}</strong></div>
                                  <div className="metric"><small>Min angle</small><strong>{f(side.min_angle_deg, "°")}</strong></div>
                                  <div className="metric"><small>Max angle</small><strong>{f(side.max_angle_deg, "°")}</strong></div>
                                </div>
                              ) : null}
                              {side.warnings.map((warning) => (
                                <div className="error" key={warning}>{warning}</div>
                              ))}
                            </div>
                          ))}
                        </div>
                        <div className="metrics wideMetrics">
                          <div className="metric"><small>{t.labels.rangeOfMotion}</small><strong>{f(currentRom, "°")}</strong></div>
                          <div className="metric"><small>{t.labels.previousRom}</small><strong>{f(previousSessionRom, "°")}</strong></div>
                          <div className="metric"><small>Signed Delta ROM</small><strong>{f(imuSignedDeltaRom, "°")}</strong></div>
                          <div className="metric"><small>Absolute Delta ROM</small><strong>{f(imuAbsoluteDeltaRom, "°")}</strong></div>
                          <div className="metric"><small>{t.labels.movementStatus}</small><strong style={{ fontSize: 18 }}>{imuRomValid ? t.labels.readyForReport : "Needs sensor check"}</strong></div>
                          <div className="metric"><small>ROM method used</small><strong style={{ fontSize: 16 }}>{imuRomMethodUsed}</strong></div>
                          <div className="metric"><small>Sensor format</small><strong style={{ fontSize: 16 }}>{imuSensorFormat}</strong></div>
                          <div className="metric"><small>{t.labels.exercise}</small><strong style={{ fontSize: 18 }}>{t.exercises[exercise] || movementResult}</strong></div>
                        </div>
                        <div className="formulaBox">{imuSensorSetupNote}</div>
                        <div className="resultActions">
                          <button className="btn primary" onClick={continueToReport} disabled={!imuRomValid}>{t.buttons.continueToReport}</button>
                          <button className="btn" onClick={analyzeImu} disabled={imuLoading}>{t.buttons.rerunImu}</button>
                          <button className="btn" onClick={() => setImuResult(null)}>{t.buttons.editImuData}</button>
                        </div>
                      </div>
                    ) : (
                      <div className="resultHero">
                        <div className="resultHeroTop">
                          <div>
                            <div className="resultKicker">{stepCompleteText(4)}</div>
                            <h4>{t.completion.imuTitle}</h4>
                            <p>{t.completion.imuText}</p>
                          </div>
                          <div className="resultValue">{f(currentRom, "°")}<span>{t.labels.rangeOfMotion}</span></div>
                        </div>
                        <div className="explainList">
                          <div className="explainItem">{t.explanations.imuRomFormula}</div>
                          <div className="explainItem">{t.explanations.deltaRomExplanation}</div>
                          <div className="explainItem">{t.explanations.imuSmoothness}</div>
                        </div>
                        <div className="formulaBox">ROM = max angle - min angle</div>
                        <div className="metrics wideMetrics">
                          <div className="metric"><small>Min angle</small><strong>{f(currentMinAngle, "°")}</strong></div>
                          <div className="metric"><small>Max angle</small><strong>{f(currentMaxAngle, "°")}</strong></div>
                          <div className="metric"><small>{t.labels.rangeOfMotion}</small><strong>{f(currentRom, "°")}</strong></div>
                          <div className="metric"><small>{t.labels.exercise}</small><strong style={{ fontSize: 18 }}>{t.exercises[exercise] || movementResult}</strong></div>
                          <div className="metric"><small>{t.labels.sensorSetup}</small><strong style={{ fontSize: 18 }}>{t.sensorSetups[sensorLocation] || sensorLocation}</strong></div>
                          <div className="metric"><small>{t.labels.repetitions}</small><strong>{imuRepetitions}</strong></div>
                          <div className="metric"><small>{t.labels.movementStatus}</small><strong style={{ fontSize: 18 }}>{t.labels.readyForReport}</strong></div>
                          <div className="metric"><small>{t.labels.previousRom}</small><strong>{f(previousSessionRom, "°")}</strong></div>
                          <div className="metric"><small>Signed Delta ROM</small><strong>{f(imuSignedDeltaRom, "°")}</strong></div>
                          <div className="metric"><small>Absolute Delta ROM</small><strong>{f(imuAbsoluteDeltaRom, "°")}</strong></div>
                          <div className="metric"><small>{t.labels.smoothness}</small><strong style={{ fontSize: 18 }}>{imuResult?.feedback?.[1]?.level || imuResult?.feedback?.[0]?.level || "-"}</strong></div>
                          <div className="metric"><small>Sensor format</small><strong style={{ fontSize: 16 }}>{imuSensorFormat}</strong></div>
                          <div className="metric"><small>ROM method used</small><strong style={{ fontSize: 16 }}>{imuRomMethodUsed}</strong></div>
                          <div className="metric"><small>Real channels</small><strong>{imuRealChannelsCount ?? "-"}</strong></div>
                          <div className="metric"><small>EMG detected</small><strong>{imuEmgDetected}</strong></div>
                        </div>
                        <div className="formulaBox">{imuSensorSetupNote}</div>
                        {imuFallbackWarning ? (
                          <div className={imuRomValid ? "empty" : "error"}>{imuFallbackWarning}</div>
                        ) : null}
                        {imuRomDetail ? (
                          <div className="calcCardGrid">
                            <FormulaBreakdown
                              title={imuRomDetail.title}
                              formula={imuRomDetail.formula}
                              inputs={imuRomDetail.inputs}
                              steps={imuRomDetail.romSteps}
                              finalAnswer={imuRomDetail.romFinal}
                              meaningText={imuRomDetail.smoothnessText}
                            />
                            <FormulaBreakdown
                              title="Delta ROM"
                              formula={imuRomDetail.deltaFormula}
                              inputs={[
                                { label: "Current ROM", value: `${formatCalcNumber(currentRom, 1)}°` },
                                { label: "Previous ROM", value: previousSessionRom !== null ? `${formatCalcNumber(previousSessionRom, 1)}°` : "No previous session" },
                              ]}
                              steps={imuRomDetail.deltaSteps}
                              finalAnswer={imuRomDetail.deltaFinal}
                              meaningText="Signed Delta ROM shows direction of change. Absolute Delta ROM shows the size of the difference."
                            />
                          </div>
                        ) : null}
                        <div className="resultActions">
                          <button className="btn primary" onClick={continueToReport} disabled={!imuRomValid}>{t.buttons.continueToReport}</button>
                          <button className="btn" onClick={analyzeImu} disabled={(imuDataSource === "csv" && !imuFile) || imuLoading}>{t.buttons.rerunImu}</button>
                          <button className="btn" onClick={imuDataSource === "csv" ? clearImuFile : () => setImuResult(null)}>{t.buttons.editImuData}</button>
                        </div>
                      </div>
                    )}
                  </div>
                ) : null}

                {imuDataSource === "live" ? (
                  <>
                    <div className="imuSensorPanel imuRealtimeStatus">
                      <div className="reportBlockHead">
                        <h4>{step4ImuText.realtimeStatusTitle}</h4>
                      </div>
                      <div className="imuStatusGrid" aria-label={step4ImuText.realtimeStatusTitle}>
                        {step4VisualizationSensors.map((card) => (
                          <article key={`${card.deviceId}-status`} className="imuStatusCard" data-testid="imu-status-card">
                            <div className="imuStatusCardTop">
                              <div>
                                <div className="imuStatusSource">{getImuSourceLabel(card.latestRow || { device_id: card.deviceId }, liveImuText)}</div>
                                <strong>{card.label}</strong>
                              </div>
                              <span className={`chip ${card.isOnline ? "teal" : ""}`}>{card.isOnline ? liveImuText.online : step4ImuText.waitingStatus}</span>
                            </div>
                            <small>{card.deviceId}</small>
                            <div className="imuStatusMetrics">
                              {card.latestRow
                                ? `Pitch ${f(card.latestRow.pitch, "°")} · Roll ${f(card.latestRow.roll, "°")}`
                                : liveImuText.waitingForSensor}
                            </div>
                          </article>
                        ))}
                      </div>
                    </div>

                    <div className="bleVisualizationPanel" aria-label={step4ImuText.liveMovementTitle}>
                      <div className="reportBlockHead">
                        <h4>{step4ImuText.liveMovementTitle}</h4>
                      </div>
                      <p className="microNote">{step4ImuText.witmotionHelperText}</p>
                      <div className="bleVisualizationGrid">
                        {[
                          { title: step4ImuText.leftLegPanelTitle, cards: step4PiSensorCards },
                          { title: step4ImuText.rightLegPanelTitle, cards: step4WitMotionSensorCards },
                        ].map((panel) => (
                          <div className="legVizPanel" key={panel.title}>
                            <div className="legVizPanelHeader">
                              <h5>{panel.title}</h5>
                            </div>
                            <div className="legVizCanvas">
                              <svg className="legVizSvg" viewBox="0 0 180 250" aria-hidden="true">
                                <circle cx="90" cy="28" r="18" />
                                <rect x="64" y="40" width="52" height="28" rx="14" />
                                <path d="M76 66 C66 96, 68 118, 74 144 L86 186 C88 194, 86 208, 82 226 L98 226 C102 206, 104 192, 101 182 L94 148 C91 128, 92 104, 104 74 Z" />
                                <path d="M106 66 C116 96, 114 118, 108 144 L96 186 C94 194, 96 208, 100 226 L84 226 C80 206, 78 192, 81 182 L88 148 C91 128, 90 104, 78 74 Z" />
                              </svg>
                              {panel.cards.map((card) => {
                                const pitch = asFiniteNumber(card.latestRow?.pitch) ?? 0;
                                const roll = asFiniteNumber(card.latestRow?.roll) ?? 0;
                                const tileStyle = {
                                  "--tile-rotate-x": `${pitch}deg`,
                                  "--tile-rotate-z": `${roll}deg`,
                                };
                                const position = LEG_VISUALIZATION_LAYOUT[card.deviceId] || { left: "50%", top: "50%" };
                                return (
                                  <div
                                    key={`${card.deviceId}-viz`}
                                    className="legVizMarker"
                                    data-testid="imu-visualization-block"
                                    style={{ left: position.left, top: position.top }}
                                    title={`${card.deviceId} — ${card.label}`}
                                  >
                                    <div className={`legVizStage ${card.isOnline ? "online" : "offline"}`}>
                                      <div className="bleVizTile" style={tileStyle}>
                                        <span className="bleVizFace bleVizFaceTop" />
                                        <span className="bleVizFace bleVizFaceFront" />
                                        <span className="bleVizFace bleVizFaceSide" />
                                      </div>
                                    </div>
                                    <div className="legVizMarkerLabel">{card.deviceId}</div>
                                  </div>
                                );
                              })}
                            </div>
                            <div className="legVizLegend">
                              {panel.cards.map((card) => (
                                <div className="legVizLegendItem" key={`${card.deviceId}-legend`}>
                                  <strong>{card.deviceId}</strong>
                                  <span>{card.label}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="dataTableWrap imuTableWrap" id="imu-live">
                      <div className="tableTitle">{liveImuText.recentTable}</div>
                      {step4RecentLiveRows.length === 0 ? (
                        <div className="microNote">{liveImuText.noRows}</div>
                      ) : (
                        <table className="dataTable imuDataTable">
                          <thead>
                            <tr>
                              <th>{liveImuText.timestamp}</th>
                              <th>{liveImuText.source}</th>
                              <th>{liveImuText.deviceId}</th>
                              <th>{liveImuText.label}</th>
                              <th>{liveImuText.leg}</th>
                              <th>{liveImuText.bodyPart}</th>
                              <th>{liveImuText.pitch}</th>
                              <th>{liveImuText.roll}</th>
                              <th>{liveImuText.yaw}</th>
                              <th>{liveImuText.accX}</th>
                              <th>{liveImuText.accY}</th>
                              <th>{liveImuText.accZ}</th>
                              <th>{liveImuText.temp}</th>
                            </tr>
                          </thead>
                          <tbody data-testid="imu-live-table-body">
                            {step4RecentLiveRows.map((row, index) => (
                              <tr key={`${row.timestamp || "ts"}_${row.device_id || "dev"}_${index}`}>
                                <td>{formatDate(row.timestamp)}</td>
                                <td>{getImuSourceLabel(row, liveImuText)}</td>
                                <td>{row.device_id || "-"}</td>
                                <td>{getImuLabel(row)}</td>
                                <td>{row.leg || "-"}</td>
                                <td>{row.body_part || "-"}</td>
                                <td>{f(row.pitch, "°")}</td>
                                <td>{f(row.roll, "°")}</td>
                                <td>{f(row.yaw, "°")}</td>
                                <td>{f(row.acc_x)}</td>
                                <td>{f(row.acc_y)}</td>
                                <td>{f(row.acc_z)}</td>
                                <td>{f(row.temperature)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                  </>
                ) : null}
              </div>
            </section>
          ) : null}

          {activeStep === "report" ? (
            <section className="panel" id="report-summary">
              <div className="chips">
                <span className={`chip ${readyState.patient ? "teal" : ""}`}>{t.steps.patient} {readyState.patient ? t.status.ready : t.status.pending}</span>
                <span className={`chip ${readyState.koos ? "teal" : ""}`}>KOOS {readyState.koos ? t.status.ready : t.status.pending}</span>
                <span className={`chip ${readyState.kl ? "teal" : ""}`}>KL {readyState.kl ? t.status.ready : t.status.pending}</span>
                <span className={`chip ${readyState.imu ? "teal" : ""}`}>IMU {readyState.imu ? t.status.ready : t.status.pending}</span>
              </div>
              {!reportResult ? (
                <div className="wizardNav">
                  <button className="btn primary" onClick={generateReport} disabled={!readyState.patient || !readyState.koos || !readyState.kl || !readyState.imu || reportLoading}>
                    {reportLoading ? t.buttons.generating : t.buttons.generateReport}
                  </button>
                </div>
              ) : null}
              {reportError ? <div className="error">{reportError}</div> : null}
              {!reportResult && !reportError ? <div className="empty">{t.messages.generateAfterReady}</div> : null}
              {reportResult ? (
                <div className="sectionBody">
                  <div className="resultHero">
                    <div className="resultHeroTop">
                      <div>
                        <div className="resultKicker">{stepCompleteText(5)}</div>
                        <h4>{t.reportSections.finalRehabilitationScore}</h4>
                        <p>{t.explanations.finalPredictionExplanation}</p>
                        <div className="chips">
                          <div className={`statusPill ${reportStatusKey === "needs_attention" || reportStatusKey === "insufficient_data" ? "coral" : ""}`}>
                            {t.reportStatus[reportStatusKey] || t.reportStatus.insufficient_data}
                          </div>
                          <span className="chip teal">{t.labels.rehabLevel} {reportResult.rehab_level_label || "-"}</span>
                          {reportResult.rehab_level_meaning ? <span className="chip">{reportResult.rehab_level_meaning}</span> : null}
                        </div>
                      </div>
                      <div className="resultValue">
                        {f(rawFormulaScore)}
                        <span>RAW REHAB SCORE</span>
                      </div>
                    </div>
                    <div className="resultActions">
                      <span className="chip teal">{t.completion.sessionSaved}</span>
                      <button className="btn primary" onClick={continueToVideos}>{t.buttons.continueToVideos}</button>
                    </div>
                  </div>

                  <div className="flowLine" aria-label={t.labels.inputSummary}>
                    <span className="flowItem">{t.labels.koosPre}</span>
                    <span className="flowArrow">+</span>
                    <span className="flowItem">{t.labels.deltaRom}</span>
                    <span className="flowArrow">+</span>
                    <span className="flowItem">{t.labels.klGrade}</span>
                    <span className="flowArrow">→</span>
                    <span className="flowItem">{t.labels.finalRehabilitationScore}</span>
                  </div>
                  <div className="flowLine" aria-label={t.labels.rehabLevel}>
                    <span className="flowItem">{t.labels.finalRehabilitationScore}</span>
                    <span className="flowArrow">→</span>
                    <span className="flowItem">{t.labels.rehabLevel}</span>
                    <span className="flowArrow">→</span>
                    <span className="flowItem">{t.report.exercisePlan}</span>
                  </div>

                  <div className="reportBlock">
                    <h4>{t.reportSections.inputSummary}</h4>
                    {isFirstRomSession ? (
                      <div className="infoCard" role="status" aria-live="polite">
                        <strong>{firstRomSessionTitle}</strong>
                        <p>{firstRomSessionMessage}</p>
                      </div>
                    ) : null}
                    <div className="metrics wideMetrics">
                      <div className="metric"><small>{t.labels.koosPre}</small><strong>{f(reportResult.KOOS_pre)}</strong></div>
                      <div className="metric"><small>Min angle</small><strong>{f(reportResult.min_angle_deg, "°")}</strong></div>
                      <div className="metric"><small>Max angle</small><strong>{f(reportResult.max_angle_deg, "°")}</strong></div>
                      <div className="metric"><small>{t.labels.currentRom}</small><strong>{f(reportResult.rom_deg, "°")}</strong></div>
                      <div className="metric"><small>{t.labels.previousRom}</small><strong>{isFirstRomSession ? "First session" : f(reportResult.previous_rom_deg, "°")}</strong></div>
                      <div className="metric"><small>Signed Delta ROM</small><strong>{isFirstRomSession ? "0.0° baseline" : f(reportResult.delta_rom_signed_deg, "°")}</strong></div>
                      <div className="metric"><small>Absolute Delta ROM</small><strong>{isFirstRomSession ? "0.0° baseline" : f(reportResult.delta_rom_abs_deg, "°")}</strong></div>
                      <div className="metric"><small>Delta ROM used in score</small><strong>{isFirstRomSession ? "0.0° baseline estimate" : f(reportResult.delta_rom_used_in_score_deg, "°")}</strong></div>
                      <div className="metric"><small>{t.labels.klGrade}</small><strong>{reportResult.KL_grade ?? "-"}</strong></div>
                      <div className="metric"><small>{t.labels.imuRehabScore}</small><strong>{f(reportResult.rehab_score)}</strong></div>
                      <div className="metric"><small>Raw rehab score</small><strong>{f(rawFormulaScore)}</strong></div>
                      <div className="metric"><small>Final mapped score</small><strong>{f(finalRehabScore)}</strong></div>
                      <div className="metric"><small>{t.labels.rehabLevel}</small><strong style={{ fontSize: 18 }}>{reportResult.rehab_level_label || "-"}</strong></div>
                    </div>
                  </div>

                  <div className="reportBlock" id="report-interpretation">
                    <h4>{t.reportSections.interpretation}</h4>
                    <p>{reportResult.interpretation || t.report.noInterpretation}</p>
                    {reportResult.score_meaning ? <p style={{ marginTop: 8 }}>{reportResult.score_meaning}</p> : null}
                    {reportResult.delta_note ? <p style={{ marginTop: 8, color: "var(--muted)" }}>{reportResult.delta_note}</p> : null}
                    {isFirstRomSession && reportResult.delta_rom_formula_explanation?.note ? (
                      <p style={{ marginTop: 8, color: "var(--muted)" }}>{reportResult.delta_rom_formula_explanation.note}</p>
                    ) : null}
                    {reportResult.delta_rom_formula_explanation?.steps ? (
                      <div className="microNote">
                        {reportResult.delta_rom_formula_explanation.steps.join(" | ")}
                      </div>
                    ) : null}
                    <div className="detailPanel">
                      <div className="detailCard">
                        <strong>{t.reportSections.scoreExplanation}</strong>
                        <p>{t.explanations.higherScoreMeaning}</p>
                      </div>
                      <div className="detailCard">
                        <strong>{t.report.calculationDetails}</strong>
                        <p>{t.explanations.reportCombination}</p>
                      </div>
                    </div>
                  </div>

                  <div className="reportBlock" id="report-recommendations">
                    <h4>{t.reportSections.recommendations}</h4>
                    {Array.isArray(reportResult.recommendations) && reportResult.recommendations.length > 0 ? (
                      <div className="recommendationCards">
                        {reportResult.recommendations.map((item, index) => (
                          <div className="recommendationCard" key={item}>
                            <strong>{t.report.recommendationTitle.replace("{number}", index + 1)}</strong>
                            <p>{translatedRecommendation(item)}</p>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p>{t.report.noRecommendations}</p>
                    )}
                    <div className="detailPanel">
                      <div className="detailCard">
                        <strong>{t.report.exercisePlan}</strong>
                        <p>{t.explanations.imuScoreFormula}</p>
                      </div>
                    </div>
                    <div className="microNote">{t.report.exerciseSafetyNote}</div>
                  </div>
                  <div className="reportBlock" id="report-session">
                    <h4>{t.reportSections.sessionDetails}</h4>
                    <div className="metrics">
                      <div className="metric"><small>{t.labels.patientId}</small><strong style={{ fontSize: 18 }}>{patientId || "-"}</strong></div>
                      <div className="metric"><small>{t.labels.exercise}</small><strong style={{ fontSize: 18 }}>{t.exercises[exercise] || exercise}</strong></div>
                      <div className="metric"><small>{t.labels.sessionId}</small><strong style={{ fontSize: 16 }}>{reportResult.session_id || "-"}</strong></div>
                      <div className="metric"><small>{t.labels.createdAt}</small><strong style={{ fontSize: 16 }}>{formatDate(reportResult.created_at)}</strong></div>
                    </div>
                  </div>
                  <div className="reportBlock">
                    <h4>{t.report.calculationDetails}</h4>
                    <div className="formulaBox">{t.explanations.formulaReadable}</div>
                    <table className="betaTable">
                      <tbody>
                        <tr><th>β0</th><td>{f(reportResult.beta0)}</td></tr>
                        <tr><th>β1</th><td>{f(reportResult.beta1)}</td></tr>
                        <tr><th>β2</th><td>{f(reportResult.beta2)}</td></tr>
                        <tr><th>β3_KL</th><td>{f(reportResult.beta3_KL)}</td></tr>
                      </tbody>
                    </table>
                    {reportBreakdown ? (
                      <div className="calcCardGrid">
                        <FormulaBreakdown
                          title={reportBreakdown.title}
                          formula={reportBreakdown.formula}
                          inputs={reportBreakdown.inputs}
                          steps={reportBreakdown.steps}
                          finalAnswer={reportBreakdown.finalAnswer}
                          meaningText={reportBreakdown.meaningText}
                          defaultOpen
                        />
                      </div>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </section>
          ) : null}

          {activeStep === "videos" ? (
            <section className="panel" id="videos-overview">
              <div className="sectionBody">
                <div className="resultHero">
                  <div className="resultHeroTop">
                    <div>
                      <div className="resultKicker">{stepCompleteText(6)}</div>
                      <h4>{t.completion.videosTitle}</h4>
                      <p>{t.completion.videosText}</p>
                    </div>
                    <div className="resultValue">{exerciseVideos.length}<span>{t.steps.videos}</span></div>
                  </div>
                </div>

                <div className="reportBlock" id="videos-library">
                  <h4>{t.reportSections.exerciseVideos}</h4>
                  <div className="exercisePlanMeta">
                    <div className="exercisePlanTitle">
                      {t.messages.exercisePlanLevel.replace("{level}", String(rehabLevel))}
                    </div>
                    <div className="exercisePlanScore">
                      {t.messages.basedOnFinalScore.replace("{score}", formatScore(finalRehabScore))}
                    </div>
                  </div>
                  {exerciseLevelBreakdown ? (
                    <div className="calcCardGrid">
                      <FormulaBreakdown
                        title={exerciseLevelBreakdown.title}
                        formula={exerciseLevelBreakdown.formula}
                        inputs={exerciseLevelBreakdown.inputs}
                        steps={exerciseLevelBreakdown.steps}
                        finalAnswer={exerciseLevelBreakdown.finalAnswer}
                        meaningText={exerciseLevelBreakdown.meaningText}
                        defaultOpen
                      />
                    </div>
                  ) : null}
                  {exerciseVideos.length > 0 ? (
                    <div className="exerciseGrid">
                      {exerciseVideos.map((item) => (
                        <article className={`exerciseCard ${selectedVideoId === item.id ? "active" : ""}`} key={item.id}>
                          <button
                            className={`exerciseThumb exerciseThumbButton ${item.embedUrl ? "" : "placeholder"}`}
                            type="button"
                            onClick={() => {
                              setSelectedVideoId(item.id);
                              setIsVideoModalOpen(true);
                            }}
                            aria-label={`${t.buttons.watchVideo}: ${item.title}`}
                          >
                            {item.embedUrl ? (
                              <>
                                <div className="exerciseThumbArt" />
                                <div className="playOverlay">
                                  <div className="playCircle">
                                    <div className="playTriangle" />
                                  </div>
                                </div>
                              </>
                            ) : (
                              <>
                                <div className="exerciseThumbArt" />
                                <div className="playOverlay">
                                  <div className="playCircle">
                                    <div className="playTriangle" />
                                  </div>
                                </div>
                              </>
                            )}
                          </button>
                          <div className="exerciseCardTop">
                            <h5>{item.title}</h5>
                            <span className="exerciseLevel">{item.levelLabel}</span>
                          </div>
                          <p>{item.description}</p>
                          <div className="exerciseMeta">
                            <div className="exerciseMetaCard">
                              <small>{t.labels.duration}</small>
                              <strong>{item.duration}</strong>
                            </div>
                            <div className="exerciseMetaCard">
                              <small>{t.labels.targetArea}</small>
                              <strong>{item.targetArea}</strong>
                            </div>
                          </div>
                          <div className="exerciseActions">
                            <button
                              className="exercisePrimary"
                              onClick={() => {
                                setSelectedVideoId(item.id);
                                setIsVideoModalOpen(true);
                              }}
                            >
                              {t.buttons.watchVideo}
                            </button>
                            <a className="exerciseSecondary" href={item.youtubeUrl} target="_blank" rel="noreferrer">
                              {t.buttons.openOnYouTube}
                            </a>
                            <button className="exerciseSecondary" onClick={() => setWatchedVideos((prev) => ({ ...prev, [item.id]: !prev[item.id] }))}>
                              {watchedVideos[item.id] ? t.buttons.markWatched : t.buttons.assignVideo}
                            </button>
                            <span className="exerciseStatus">
                              {selectedVideoId === item.id ? t.buttons.watchVideo : watchedVideos[item.id] ? t.buttons.markWatched : t.buttons.assignVideo}
                            </span>
                          </div>
                        </article>
                      ))}
                    </div>
                  ) : (
                    <p className="microNote">{t.messages.noVideos}</p>
                  )}
                  <div className="microNote">{t.messages.videoPlanDisclaimer}</div>
                </div>
              </div>
            </section>
          ) : null}

          {activeStep === "videos" && isVideoModalOpen && selectedVideo?.embedUrl ? (
            <div className="videoModal" role="dialog" aria-modal="true" aria-labelledby="exercise-video-modal-title">
              <div className="videoModalCard">
                <div className="videoModalTop">
                  <div>
                    <h5 id="exercise-video-modal-title">{selectedVideo.title}</h5>
                    <div className="videoModalMeta">
                      <span className="exerciseLevel">{selectedVideo.levelLabel}</span>
                      <span className="chip">{selectedVideo.duration}</span>
                      <span className="chip">{selectedVideo.targetArea}</span>
                    </div>
                  </div>
                  <button className="btn" type="button" onClick={() => setIsVideoModalOpen(false)}>
                    {t.buttons.closeVideo}
                  </button>
                </div>
                <div className="videoModalFrame">
                  <iframe
                    src={selectedVideo.embedUrl}
                    title={selectedVideo.title}
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                    referrerPolicy="strict-origin-when-cross-origin"
                    allowFullScreen
                  />
                </div>
                <div className="videoModalActions">
                  <span className="exerciseStatus">{selectedVideo.description}</span>
                  <a className="exerciseSecondary" href={selectedVideo.youtubeUrl} target="_blank" rel="noreferrer">
                    {t.buttons.openOnYouTube}
                  </a>
                </div>
              </div>
            </div>
          ) : null}

          {showGlobalWizardNav ? (
            <div className="wizardNav">
              <button className="btn" onClick={prevStep} disabled={activeStep === "patient"}>{t.buttons.back}</button>
              {activeStep !== "report" ? (
                <button className="btn primary" onClick={nextStep} disabled={!canContinue(activeStep)}>{t.buttons.continue}</button>
              ) : null}
            </div>
          ) : null}
        </main>

        <aside className="toc" aria-label={t.labels.onThisStep}>
          <div className="tocTitle">{t.labels.onThisStep}</div>
          <nav className="tocNav">
            {stepHeadings.map((item) => (
              <a className="tocLink" href={`#${item.id}`} key={item.id}>{t.toc[item.key]}</a>
            ))}
          </nav>
          {activeStep === "imu" ? (
            <div className="imuSidebarCard">
              <div className="imuSidebarGroup">
                <strong>{step4ImuText.sensorMappingTitle}</strong>
                <span>LEFT LEG (Raspberry Pi)</span>
                <span>pi1 Left hip</span>
                <span>pi2 Left thigh / knee</span>
                <span>pi3 Left shin / ankle</span>
              </div>
              <div className="imuSidebarGroup">
                <span>RIGHT LEG (WitMotion)</span>
                <span>ble_right_hip Right hip</span>
                <span>ble_right_thigh Right thigh / knee</span>
                <span>ble_right_shin Right shin / ankle</span>
              </div>
              <div className="imuSidebarGroup">
                <strong>{step4ImuText.howItWorksTitle}</strong>
                <span>{step4ImuText.witmotionLiveNote}</span>
              </div>
            </div>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
