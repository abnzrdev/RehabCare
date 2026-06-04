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

const API = "/api";
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

const SENSOR_LOCATIONS = [
  { value: "right_thigh", label: "Right thigh" },
  { value: "right_shin", label: "Right shin" },
  { value: "right_foot", label: "Right foot" },
  { value: "left_thigh", label: "Left thigh" },
  { value: "left_shin", label: "Left shin" },
  { value: "left_foot", label: "Left foot" },
];

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
      sensorPlacement: "Sensor placement",
      patientHistory: "Patient history",
      noSessions: "No sessions yet for this patient.",
      loading: "Loading...",
      savedSessions: "Saved sessions",
      stepComplete: "Step {step} of 6 complete",
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
    sensorLocations: {
      right_thigh: "Right thigh",
      right_shin: "Right shin",
      right_foot: "Right foot",
      left_thigh: "Left thigh",
      left_shin: "Left shin",
      left_foot: "Left foot",
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
      imuTypes: "Single-sensor CSV",
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
      sensorPlacement: "Расположение датчика",
      patientHistory: "История пациента",
      noSessions: "Сессий для пациента пока нет.",
      loading: "Загрузка...",
      savedSessions: "Сохраненные сессии",
      stepComplete: "Шаг {step} из 6 завершен",
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
    sensorLocations: {
      right_thigh: "Правое бедро",
      right_shin: "Правая голень",
      right_foot: "Правая стопа",
      left_thigh: "Левое бедро",
      left_shin: "Левая голень",
      left_foot: "Левая стопа",
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
      imuTypes: "CSV одного датчика",
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
      sensorPlacement: "Датчик орны",
      patientHistory: "Пациент тарихы",
      noSessions: "Бұл пациент үшін сессия жоқ.",
      loading: "Жүктелуде...",
      savedSessions: "Сақталған сессиялар",
      stepComplete: "6 қадамның {step}-қадамы аяқталды",
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
    sensorLocations: {
      right_thigh: "Оң сан",
      right_shin: "Оң сирақ",
      right_foot: "Оң аяқ",
      left_thigh: "Сол сан",
      left_shin: "Сол сирақ",
      left_foot: "Сол аяқ",
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
      imuTypes: "Бір датчик CSV",
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
.summaryCard{background:#fffaf0;border:1px solid var(--border);padding:14px 16px;display:grid;gap:6px}
.summaryCard small{color:var(--muted);font-size:12px;font-weight:700}
.summaryCard strong{display:block;font-size:30px;line-height:1.05;letter-spacing:-.04em}
.summaryDate{font-size:16px !important;line-height:1.35 !important;letter-spacing:0 !important}
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
.reportList{margin:0;padding-left:18px;color:var(--text)}
.reportList li{margin:6px 0}
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
  const [sensorLocation, setSensorLocation] = useState(() => storedState.sensor_location || "right_thigh");
  const [sessions, setSessions] = useState([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);

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

  const [reportResult, setReportResult] = useState(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [reportError, setReportError] = useState("");
  const [watchedVideos, setWatchedVideos] = useState({});
  const [selectedVideoId, setSelectedVideoId] = useState("");
  const [isVideoModalOpen, setIsVideoModalOpen] = useState(false);

  const imageInputRef = useRef(null);
  const csvInputRef = useRef(null);
  const t = STRINGS[lang];

  const latestSession = sessions[0] || null;
  const previousSessionRom = latestSession?.current_rom ?? null;
  const currentMinAngle = imuResult?.min_angle_deg ?? imuResult?.session_summary?.min_angle_deg ?? imuResult?.rom_scores?.[0]?.min_angle_deg ?? null;
  const currentMaxAngle = imuResult?.max_angle_deg ?? imuResult?.session_summary?.max_angle_deg ?? imuResult?.rom_scores?.[0]?.max_angle_deg ?? null;
  const currentRom = imuResult?.rom_deg ?? imuResult?.session_summary?.rom_deg ?? imuResult?.rom_scores?.[0]?.rom_deg ?? null;
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
      imu: Boolean(imuResult?.session_summary?.rom_deg !== undefined),
      report: Boolean(reportResult?.session_id),
      videos: Boolean(reportResult?.session_id),
    }),
    [patientId, koosResult, klResult, imuResult, reportResult]
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
  const exerciseVideos = useMemo(() => getExerciseVideosForScore(finalRehabScore), [finalRehabScore]);
  const selectedVideo = getSelectedVideo(exerciseVideos, selectedVideoId);
  const localizedKoosPanelTag =
    t.koosSections[KOOS_PANEL_TAG_KEYS[currentKoosPanel.tag]] || currentKoosPanel.tag || "";
  const localizedKoosPanelNote =
    currentKoosPanel.note === "Includes next section"
      ? t.messages.includesNextSection
      : currentKoosPanel.note || "";
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
  const imuSummary = imuResult?.session_summary || {};
  const imuRomDetail = useMemo(() => {
    if (!imuResult || !Number.isFinite(Number(currentRom))) return null;
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
  }, [currentMaxAngle, currentMinAngle, currentRom, imuAbsoluteDeltaRom, imuResult, imuSignedDeltaRom, imuSummary.gyro_std_dps, previousSessionRom]);
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
      ],
      finalAnswer: `Raw score ${formatCalcNumber(rawScore, 3)} -> Final rehab score ${formatCalcNumber(mappedScore, 2)}/100 -> Level ${mappedLevel}`,
      meaningText: `The raw formula stays visible for transparency. The mapped 0-100 score drives Level ${mappedLevel}: ${mappedMeaning}.`,
    };
  }, [reportResult, reportStatusKey, t.reportSections.finalRehabilitationScore]);
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
                  <label>{t.labels.patientId}</label>
                  <input value={patientId} onChange={(e) => setPatientId(e.target.value)} placeholder="P001" />
                </div>
                <div className="field">
                  <label>{t.labels.patientName}</label>
                  <input value={patientName} onChange={(e) => setPatientName(e.target.value)} />
                </div>
                <div className="field">
                  <label>{t.labels.exercise}</label>
                  <select value={exercise} onChange={(e) => setExercise(e.target.value)}>
                    {EXERCISES.map((x) => <option key={x.value} value={x.value}>{t.exercises[x.value]}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label>{t.labels.sensorPlacement}</label>
                  <select value={sensorLocation} onChange={(e) => setSensorLocation(e.target.value)}>
                    {SENSOR_LOCATIONS.map((x) => <option key={x.value} value={x.value}>{t.sensorLocations[x.value]}</option>)}
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
                    <div className="metric"><small>{t.labels.sensorPlacement}</small><strong style={{ fontSize: 18 }}>{t.sensorLocations[sensorLocation] || sensorLocation}</strong></div>
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
              <div className="grid2 sectionBody">
                <div>
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
                      <div><strong>{t.upload.uploadImu}</strong><br /><span>{t.upload.imuTypes}</span></div>
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
                </div>
                <div id="imu-result">
                  <button className="btn primary" onClick={analyzeImu} disabled={!imuFile || imuLoading}>{imuLoading ? t.buttons.analyzing : t.buttons.analyzeImu}</button>
                  {imuError ? <div className="error">{imuError}</div> : null}
                  {!imuResult && !imuError ? <div className="empty">{t.messages.noImuResult}</div> : null}
                  {imuResult ? (
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
                        <div className="metric"><small>{t.labels.sensorPlacement}</small><strong style={{ fontSize: 18 }}>{t.sensorLocations[sensorLocation] || sensorLocation}</strong></div>
                        <div className="metric"><small>{t.labels.repetitions}</small><strong>{imuRepetitions}</strong></div>
                        <div className="metric"><small>{t.labels.movementStatus}</small><strong style={{ fontSize: 18 }}>{t.labels.readyForReport}</strong></div>
                        <div className="metric"><small>{t.labels.previousRom}</small><strong>{f(previousSessionRom, "°")}</strong></div>
                        <div className="metric"><small>Signed Delta ROM</small><strong>{f(imuSignedDeltaRom, "°")}</strong></div>
                        <div className="metric"><small>Absolute Delta ROM</small><strong>{f(imuAbsoluteDeltaRom, "°")}</strong></div>
                        <div className="metric"><small>{t.labels.smoothness}</small><strong style={{ fontSize: 18 }}>{imuResult?.feedback?.[1]?.level || imuResult?.feedback?.[0]?.level || "-"}</strong></div>
                      </div>
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
                        <button className="btn primary" onClick={continueToReport}>{t.buttons.continueToReport}</button>
                        <button className="btn" onClick={analyzeImu} disabled={!imuFile || imuLoading}>{t.buttons.rerunImu}</button>
                        <button className="btn" onClick={clearImuFile}>{t.buttons.editImuData}</button>
                      </div>
                    </div>
                  ) : null}
                </div>
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
                    <div className="metrics wideMetrics">
                      <div className="metric"><small>{t.labels.koosPre}</small><strong>{f(reportResult.KOOS_pre)}</strong></div>
                      <div className="metric"><small>Min angle</small><strong>{f(reportResult.min_angle_deg, "°")}</strong></div>
                      <div className="metric"><small>Max angle</small><strong>{f(reportResult.max_angle_deg, "°")}</strong></div>
                      <div className="metric"><small>{t.labels.currentRom}</small><strong>{f(reportResult.rom_deg, "°")}</strong></div>
                      <div className="metric"><small>{t.labels.previousRom}</small><strong>{f(reportResult.previous_rom_deg, "°")}</strong></div>
                      <div className="metric"><small>Signed Delta ROM</small><strong>{f(reportResult.delta_rom_signed_deg, "°")}</strong></div>
                      <div className="metric"><small>Absolute Delta ROM</small><strong>{f(reportResult.delta_rom_abs_deg, "°")}</strong></div>
                      <div className="metric"><small>Delta ROM used in score</small><strong>{f(reportResult.delta_rom_used_in_score_deg, "°")}</strong></div>
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
        </aside>
      </div>
    </div>
  );
}
