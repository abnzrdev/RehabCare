import { useEffect, useMemo, useRef, useState } from "react";

const API = "/api";

const STEPS = [
  { id: "patient" },
  { id: "koos" },
  { id: "kl" },
  { id: "imu" },
  { id: "report" },
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
};

const KOOS_SECTIONS = [
  { key: "pain" },
  { key: "symptoms" },
  { key: "adl" },
  { key: "sport_rec" },
  { key: "qol" },
];

const KOOS_PAGES = [
  { section: "pain", titleKey: "pain1", questions: [1, 2, 3, 4, 5] },
  { section: "pain", titleKey: "pain2", questions: [6, 7, 8, 9] },
  { section: "symptoms", titleKey: "symptoms1", questions: [10, 11, 12, 13, 14] },
  { section: "symptoms", titleKey: "symptoms2", questions: [15, 16] },
  { section: "adl", titleKey: "adl1", questions: [17, 18, 19, 20, 21, 22] },
  { section: "adl", titleKey: "adl2", questions: [23, 24, 25, 26, 27, 28] },
  { section: "adl", titleKey: "adl3", questions: [29, 30, 31, 32, 33] },
  { section: "sport_rec", titleKey: "sport1", questions: [34, 35, 36, 37, 38] },
  { section: "qol", titleKey: "qol1", questions: [39, 40, 41, 42] },
];

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
      imu: "IMU rehab analysis",
      report: "Final rehab report",
    },
    descriptions: {
      patient: "Set patient and session context before clinical inputs.",
      koos: "Complete the KOOS survey in short pages. Answers are saved as q1 through q42.",
      kl: "Upload a knee image and run KL grading.",
      imu: "Upload IMU CSV data for movement analysis.",
      report: "Generate a final rehab report from patient, KOOS, KL, and IMU data.",
    },
    buttons: {
      back: "Back",
      continue: "Continue",
      refresh: "Refresh",
      refreshing: "Refreshing",
      calculateKoos: "Calculate KOOS",
      calculating: "Calculating...",
      generateReport: "Generate report",
      generating: "Generating...",
      analyzeKl: "Analyze KL grade",
      analyzing: "Analyzing...",
      analyzeImu: "Analyze IMU",
      nextQuestions: "Next questions",
      previousQuestions: "Previous questions",
      removeFile: "Remove file",
      chooseDifferentImage: "Choose different image",
      remove: "Remove",
    },
    status: { pending: "Pending", ready: "Ready", complete: "Complete", demo: "Demo", real: "Real", unknown: "Unknown" },
    labels: {
      patientId: "Patient ID",
      patientName: "Patient name (optional)",
      exercise: "Exercise",
      sensorPlacement: "Sensor placement",
      patientHistory: "Patient history",
      noSessions: "No sessions yet for this patient.",
      loading: "Loading...",
      savedSessions: "Saved sessions",
      latestRom: "Latest ROM",
      latestDate: "Latest date",
      onThisStep: "On this step",
      pageOf: "Page",
      of: "of",
      answered: "answered",
      scoreRange: "0..4 numeric scoring",
      currentRom: "Current ROM",
      previousRom: "Previous ROM",
      rehabScore: "Rehab score",
      klGrade: "KL grade",
      displayGrade: "Display grade",
      confidence: "Confidence",
      koosTotal: "KOOS total",
      deltaRom: "Delta ROM",
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
      interpretation: "Interpretation",
      recommendations: "Recommendations",
      sessionDetails: "Session details",
      noInterpretation: "No interpretation returned.",
      noRecommendations: "No recommendations returned.",
    },
    messages: {
      calculateToReady: "Calculate KOOS on the final page to mark this step ready.",
      completeCurrentPage: "Answer all questions on this page to continue.",
      completeAllKoos: "Answer all 42 KOOS questions before calculating.",
      noKlResult: "No KL result yet.",
      noImuResult: "No IMU result yet.",
      generateAfterReady: "Generate report after all previous steps are ready.",
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
      imu: "Анализ ИМУ-реабилитации",
      report: "Итоговый отчет",
    },
    descriptions: {
      patient: "Укажите пациента и параметры сессии перед клиническими данными.",
      koos: "Заполните KOOS короткими страницами. Ответы сохраняются как q1-q42.",
      kl: "Загрузите снимок колена и выполните KL-оценку.",
      imu: "Загрузите CSV ИМУ для анализа движения.",
      report: "Сформируйте итоговый отчет из данных пациента, KOOS, KL и ИМУ.",
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
      analyzeImu: "Анализ ИМУ",
      nextQuestions: "Следующие вопросы",
      previousQuestions: "Предыдущие вопросы",
      removeFile: "Удалить файл",
      chooseDifferentImage: "Выбрать другой снимок",
      remove: "Удалить",
    },
    status: { pending: "Ожидает", ready: "Готово", complete: "Завершено", demo: "Демо", real: "Реальная", unknown: "Неизвестно" },
    labels: {
      patientId: "ID пациента",
      patientName: "Имя пациента (необязательно)",
      exercise: "Упражнение",
      sensorPlacement: "Расположение датчика",
      patientHistory: "История пациента",
      noSessions: "Сессий для пациента пока нет.",
      loading: "Загрузка...",
      savedSessions: "Сохраненные сессии",
      latestRom: "Последний ROM",
      latestDate: "Последняя дата",
      onThisStep: "В этом шаге",
      pageOf: "Страница",
      of: "из",
      answered: "отвечено",
      scoreRange: "оценка 0..4",
      currentRom: "Текущий ROM",
      previousRom: "Предыдущий ROM",
      rehabScore: "Балл реабилитации",
      klGrade: "Степень KL",
      displayGrade: "Отображаемая степень",
      confidence: "Уверенность",
      koosTotal: "Итог KOOS",
      deltaRom: "Изменение ROM",
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
      interpretation: "Интерпретация",
      recommendations: "Рекомендации",
      sessionDetails: "Детали сессии",
      noInterpretation: "Интерпретация не получена.",
      noRecommendations: "Рекомендации не получены.",
    },
    messages: {
      calculateToReady: "Рассчитайте KOOS на последней странице, чтобы отметить шаг готовым.",
      completeCurrentPage: "Ответьте на все вопросы страницы, чтобы продолжить.",
      completeAllKoos: "Ответьте на все 42 вопроса KOOS перед расчетом.",
      noKlResult: "Результата KL пока нет.",
      noImuResult: "Результата ИМУ пока нет.",
      generateAfterReady: "Сформируйте отчет после готовности предыдущих шагов.",
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
      imu: "ИМУ оңалту талдауы",
      report: "Қорытынды есеп",
    },
    descriptions: {
      patient: "Клиникалық деректер алдында пациент пен сессия параметрлерін көрсетіңіз.",
      koos: "KOOS сауалнамасын қысқа беттермен толтырыңыз. Жауаптар q1-q42 ретінде сақталады.",
      kl: "Тізе суретін жүктеп, KL бағасын орындаңыз.",
      imu: "Қозғалысты талдау үшін ИМУ CSV дерегін жүктеңіз.",
      report: "Пациент, KOOS, KL және ИМУ деректерінен қорытынды есеп жасаңыз.",
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
      analyzeImu: "ИМУ талдау",
      nextQuestions: "Келесі сұрақтар",
      previousQuestions: "Алдыңғы сұрақтар",
      removeFile: "Файлды өшіру",
      chooseDifferentImage: "Басқа сурет таңдау",
      remove: "Өшіру",
    },
    status: { pending: "Күтуде", ready: "Дайын", complete: "Аяқталды", demo: "Демо", real: "Нақты", unknown: "Белгісіз" },
    labels: {
      patientId: "Пациент ID",
      patientName: "Пациент аты (міндетті емес)",
      exercise: "Жаттығу",
      sensorPlacement: "Датчик орны",
      patientHistory: "Пациент тарихы",
      noSessions: "Бұл пациент үшін сессия жоқ.",
      loading: "Жүктелуде...",
      savedSessions: "Сақталған сессиялар",
      latestRom: "Соңғы ROM",
      latestDate: "Соңғы күн",
      onThisStep: "Осы қадамда",
      pageOf: "Бет",
      of: "ішінен",
      answered: "жауап берілді",
      scoreRange: "0..4 сандық баға",
      currentRom: "Ағымдағы ROM",
      previousRom: "Алдыңғы ROM",
      rehabScore: "Оңалту балы",
      klGrade: "KL дәрежесі",
      displayGrade: "Көрсетілетін дәреже",
      confidence: "Сенімділік",
      koosTotal: "KOOS жалпы",
      deltaRom: "ROM өзгерісі",
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
      interpretation: "Түсіндіру",
      recommendations: "Ұсынымдар",
      sessionDetails: "Сессия деректері",
      noInterpretation: "Түсіндіру қайтарылмады.",
      noRecommendations: "Ұсынымдар қайтарылмады.",
    },
    messages: {
      calculateToReady: "Қадамды дайын ету үшін соңғы бетте KOOS есептеңіз.",
      completeCurrentPage: "Жалғастыру үшін беттегі барлық сұрақтарға жауап беріңіз.",
      completeAllKoos: "Есептеу алдында KOOS-тың барлық 42 сұрағына жауап беріңіз.",
      noKlResult: "KL нәтижесі әлі жоқ.",
      noImuResult: "ИМУ нәтижесі әлі жоқ.",
      generateAfterReady: "Алдыңғы қадамдар дайын болғаннан кейін есеп жасаңыз.",
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
.topStatus{display:inline-flex;align-items:center;gap:7px;border:1px solid var(--border);background:#f8f3e8;color:var(--muted);padding:6px 8px;font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.05em}
.statusDot{width:7px;height:7px;background:var(--teal);display:inline-block}
.topStatus.demo .statusDot{background:var(--coral)}
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
.klLayout{display:grid;grid-template-columns:minmax(420px,1.35fr) minmax(300px,.85fr);gap:24px;align-items:start}
.uploadStack{display:grid;gap:12px}
.field{display:grid;gap:8px}
.field label{font-size:13px;color:var(--text);font-weight:800}
.field input,.field select{height:46px;border:1px solid var(--border);padding:0 12px;background:#fff;color:var(--text);outline:none}
.field input:focus,.field select:focus{border-color:var(--teal);box-shadow:0 0 0 2px rgba(24,183,166,.16)}
.fileDrop{min-height:220px;border:1px dashed #bfb5a1;background:#f2ead9;display:grid;place-items:center;text-align:center;padding:20px;cursor:pointer;color:var(--text);width:100%}
.fileDrop.large{min-height:260px}
.fileDrop:hover{border-color:var(--teal);background:#edf3e8}
.fileDrop strong{font-size:18px}
.fileDrop span{font-size:13px;color:var(--muted)}
.fileHint{margin-top:8px;font-family:"IBM Plex Mono",monospace;font-size:11px;color:var(--muted)}
.selectedFile{display:grid;gap:4px}
.selectedFile strong{font-size:18px}
.selectedFile span{font-size:13px;color:var(--muted);word-break:break-word}
.preview{width:100%;max-height:340px;object-fit:contain;border:1px solid var(--border);background:#fff}
.chips{display:flex;gap:8px;flex-wrap:wrap}
.chip{padding:5px 8px;border:1px solid var(--border);font-size:11px;font-weight:800;background:#f8f3e8;text-transform:uppercase;letter-spacing:.05em;color:var(--muted)}
.chip.coral{border-color:rgba(255,107,87,.45);color:#9b3a2c;background:var(--coral-soft)}
.chip.teal{border-color:rgba(24,183,166,.45);color:#0c746b;background:var(--teal-soft)}
.metrics{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}
.metric{background:#f8f3e8;border:1px solid var(--border);padding:11px}
.metric small{color:var(--muted);font-size:12px;font-weight:700}
.metric strong{display:block;margin-top:6px;font-size:26px;line-height:1.1;letter-spacing:-.035em}

.koosWrap{display:grid;gap:10px;padding-bottom:18px}
.koosHead{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap}
.koosHead strong{font-size:14px;color:var(--text)}
.koosPageTitle{display:grid;gap:4px}
.koosPageTitle h3{margin:0;font-size:20px;line-height:1.2;letter-spacing:-.025em}
.koosPageMeta{font-family:"IBM Plex Mono",monospace;font-size:12px;color:var(--muted)}
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
.koosAction{position:sticky;bottom:0;z-index:2;background:var(--paper);border-top:1px solid var(--border);padding:12px 0 6px;align-items:center}
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
  .grid2,.metrics,.klLayout{grid-template-columns:1fr}
  .koosOpts{grid-template-columns:1fr}
  .fileDrop,.fileDrop.large{min-height:220px}
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

function statusLabel(active, ready, complete, t) {
  if (complete) return t.status.complete;
  if (ready) return t.status.ready;
  if (active) return t.status.pending;
  return t.status.pending;
}

export default function App() {
  const [lang, setLang] = useState("en");
  const [activeStep, setActiveStep] = useState("patient");
  const [completedSteps, setCompletedSteps] = useState({});
  const [health, setHealth] = useState(null);
  const [healthLoading, setHealthLoading] = useState(false);
  const [healthError, setHealthError] = useState("");

  const [patientId, setPatientId] = useState("");
  const [patientName, setPatientName] = useState("");
  const [exercise, setExercise] = useState("knee_extension");
  const [sensorLocation, setSensorLocation] = useState("right_thigh");
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

  const imageInputRef = useRef(null);
  const csvInputRef = useRef(null);
  const t = STRINGS[lang];

  const latestSession = sessions[0] || null;
  const previousRom = latestSession?.current_rom ?? null;
  const currentRom = imuResult?.session_summary?.rom_deg ?? null;
  const totalAnswered = Object.keys(koosAnswers).length;
  const activeStepMeta = STEPS.find((step) => step.id === activeStep) || STEPS[0];
  const stepHeadings = STEP_HEADINGS[activeStep] || [];
  const koosQuestionText = KOOS_QUESTION_TEXT_I18N[lang] || KOOS_QUESTION_TEXT_I18N.en;
  const currentKoosPage = KOOS_PAGES[koosPageIndex] || KOOS_PAGES[0];
  const isFinalKoosPage = koosPageIndex === KOOS_PAGES.length - 1;
  const currentKoosAnswered = currentKoosPage.questions.filter((num) => koosAnswers[`q${num}`] !== undefined).length;
  const currentKoosComplete = currentKoosAnswered === currentKoosPage.questions.length;
  const canCalculateKoos = isFinalKoosPage && currentKoosComplete && totalAnswered === 42;
  const koosProgressPct = Math.round((totalAnswered / 42) * 100);

  const readyState = useMemo(
    () => ({
      patient: patientId.trim().length > 0,
      koos: Boolean(koosResult?.koos_total !== undefined),
      kl: Boolean(klResult?.kl_grade !== undefined),
      imu: Boolean(imuResult?.overall_score !== undefined),
      report: Boolean(reportResult?.session_id),
    }),
    [patientId, koosResult, klResult, imuResult, reportResult]
  );

  useEffect(() => {
    fetchHealth();
  }, []);

  useEffect(() => {
    fetchSessions(patientId.trim(), exercise);
  }, [patientId, exercise]);

  useEffect(() => {
    return () => {
      if (imagePreview) URL.revokeObjectURL(imagePreview);
    };
  }, [imagePreview]);

  async function fetchHealth() {
    setHealthLoading(true);
    setHealthError("");
    try {
      const res = await fetch(`${API}/health`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setHealth(await res.json());
    } catch (error) {
      setHealthError(error.message);
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
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || data.error || `HTTP ${res.status}`);
      setKoosResult(data);
      setCompletedSteps((prev) => ({ ...prev, koos: true }));
    } catch (error) {
      setKoosError(error.message);
    } finally {
      setKoosLoading(false);
    }
  }

  async function analyzeKl() {
    if (!imageFile) return;
    setKlLoading(true);
    setKlError("");
    try {
      const form = new FormData();
      form.append("file", imageFile);
      const res = await fetch(`${API}/predict-kl?lang=${lang}&kl_scale_max=4`, { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || data.error || `HTTP ${res.status}`);
      setKlResult(data);
    } catch (error) {
      setKlError(error.message);
    } finally {
      setKlLoading(false);
    }
  }

  async function analyzeImu() {
    if (!imuFile) return;
    setImuLoading(true);
    setImuError("");
    try {
      const form = new FormData();
      form.append("file", imuFile);
      const res = await fetch(`${API}/imu/analyze?lang=${lang}&sensor_location=${sensorLocation}`, { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || data.error || `HTTP ${res.status}`);
      setImuResult(data);
    } catch (error) {
      setImuError(error.message);
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
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || data.error || `HTTP ${res.status}`);
      setReportResult(data);
      setCompletedSteps((prev) => ({ ...prev, report: true }));
      fetchSessions(patientId.trim(), exercise);
    } catch (error) {
      setReportError(error.message);
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

  function canContinue(stepId) {
    if (stepId === "patient") return readyState.patient;
    if (stepId === "koos") return readyState.koos;
    if (stepId === "kl") return readyState.kl;
    if (stepId === "imu") return readyState.imu;
    return false;
  }

  function getKoosOptions(qKey) {
    return KOOS_FREQUENCY_KEYS.has(qKey) ? KOOS_FREQUENCY_OPTIONS : KOOS_SEVERITY_OPTIONS;
  }

  function getKoosOptionLabel(qKey, value) {
    const group = KOOS_FREQUENCY_KEYS.has(qKey) ? "frequency" : "severity";
    return t.koosOptions[group][value] || String(value);
  }

  function goToKoosSection(sectionKey) {
    const idx = KOOS_PAGES.findIndex((page) => page.section === sectionKey);
    if (idx >= 0) setKoosPageIndex(idx);
  }

  function selectImageFile(file) {
    if (!file) return;
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
    setImagePreview((old) => {
      if (old) URL.revokeObjectURL(old);
      return "";
    });
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
              <span className={`topStatus ${health?.model === "demo" ? "demo" : ""}`}>
                <span className="statusDot" />
                {health?.model === "demo" ? t.status.demo : health?.model || t.status.unknown}
              </span>
              <div className="lang" aria-label="Language and backend controls">
                {["en", "ru", "kz"].map((code) => (
                  <button key={code} className={lang === code ? "active" : ""} onClick={() => setLang(code)}>
                    {code.toUpperCase()}
                  </button>
                ))}
                <button onClick={fetchHealth} disabled={healthLoading}>{healthLoading ? t.buttons.refreshing : t.buttons.refresh}</button>
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
              <div className="metrics sectionBody" id="patient-history">
                <div className="metric"><small>{t.labels.savedSessions}</small><strong>{sessions.length}</strong></div>
                <div className="metric"><small>{t.labels.latestRom}</small><strong>{latestSession ? f(latestSession.current_rom, "°") : "-"}</strong></div>
                <div className="metric"><small>{t.labels.latestDate}</small><strong style={{ fontSize: 16 }}>{latestSession ? formatDate(latestSession.created_at) : "-"}</strong></div>
              </div>
            </section>
          ) : null}

          {activeStep === "koos" ? (
            <section className="panel" id="koos-calculate">
              <div className="koosWrap sectionBody">
                <div className="koosHead" id="koos-progress">
                  <div className="koosPageTitle">
                    <div className="koosPageMeta">
                      {t.labels.pageOf} {koosPageIndex + 1} {t.labels.of} {KOOS_PAGES.length} · {totalAnswered}/42 {t.labels.answered}
                    </div>
                    <h3>{t.koosPages[currentKoosPage.titleKey]}</h3>
                  </div>
                  <div className="chips"><span className="chip">{t.labels.scoreRange}</span></div>
                </div>
                <div className="progressBar" aria-label={`${koosProgressPct}%`}>
                  <div className="progressFill" style={{ width: `${koosProgressPct}%` }} />
                </div>
                <div className="koosTabs">
                  {KOOS_SECTIONS.map((sec) => (
                    <button key={sec.key} className={`koosTab ${currentKoosPage.section === sec.key ? "active" : ""}`} onClick={() => goToKoosSection(sec.key)}>
                      {t.koosSections[sec.key]}
                    </button>
                  ))}
                </div>
                <div className="koosPage" id="koos-current">
                  {currentKoosPage.questions.map((num) => {
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
                  <button className="btn primary" onClick={() => setKoosPageIndex((prev) => Math.min(KOOS_PAGES.length - 1, prev + 1))} disabled={!currentKoosComplete}>
                    {t.buttons.nextQuestions}
                  </button>
                )}
              </div>
              {koosError ? <div className="error">{koosError}</div> : null}
              {!koosResult && !koosError ? <div className="empty">{t.messages.calculateToReady}</div> : null}
              {koosResult ? (
                <div className="metrics sectionBody">
                  <div className="metric"><small>{t.labels.koosTotal}</small><strong>{f(koosResult.koos_total)}</strong></div>
                  {Object.entries(koosResult.subscales || {}).map(([k, v]) => (
                    <div className="metric" key={k}><small>{t.koosSections[k] || k}</small><strong>{f(v)}</strong></div>
                  ))}
                </div>
              ) : null}
            </section>
          ) : null}

          {activeStep === "kl" ? (
            <section className="panel" id="kl-upload">
              <div className="klLayout sectionBody">
                <div className="uploadStack">
                  <button
                    className="fileDrop large"
                    onClick={() => imageInputRef.current?.click()}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={(event) => {
                      event.preventDefault();
                      selectImageFile(event.dataTransfer.files?.[0]);
                    }}
                  >
                    <div className={imageFile ? "selectedFile" : ""}>
                      <strong>{imageFile ? t.upload.selectedImage : t.upload.dragImage}</strong>
                      <span>{imageFile ? imageFile.name : t.upload.imageTypes}</span>
                      <div className="fileHint">{t.upload.formats}</div>
                    </div>
                  </button>
                  {imageFile ? (
                    <div className="chips">
                      <button className="btn" onClick={clearImageFile}>{t.buttons.removeFile}</button>
                      <button className="btn" onClick={() => imageInputRef.current?.click()}>{t.buttons.chooseDifferentImage}</button>
                    </div>
                  ) : null}
                  <input ref={imageInputRef} type="file" hidden accept="image/*" onChange={(e) => {
                    const file = e.target.files?.[0];
                    selectImageFile(file);
                    e.target.value = "";
                  }} />
                  {imagePreview ? <img src={imagePreview} className="preview" alt="Knee preview" /> : null}
                </div>
                <div id="kl-result">
                  <button className="btn primary" onClick={analyzeKl} disabled={!imageFile || klLoading}>{klLoading ? t.buttons.analyzing : t.buttons.analyzeKl}</button>
                  {klError ? <div className="error">{klError}</div> : null}
                  {!klResult && !klError ? <div className="empty">{t.messages.noKlResult}</div> : null}
                  {klResult ? (
                    <>
                      <div className="metrics" style={{ marginTop: 10 }}>
                        <div className="metric"><small>{t.labels.klGrade}</small><strong>{klResult.kl_grade}</strong></div>
                        <div className="metric"><small>{t.labels.displayGrade}</small><strong>{klResult.display_grade ?? "-"}</strong></div>
                        <div className="metric"><small>{t.labels.confidence}</small><strong>{klResult.confidence ?? "-"}</strong></div>
                      </div>
                      <div className="chips" style={{ marginTop: 10 }}>
                        <span className={`chip ${klResult.source === "demo_kl" ? "coral" : "teal"}`}>{klResult.source === "demo_kl" ? `${t.status.demo} KL` : `${t.status.real} KL`}</span>
                        <span className="chip">{klResult.grade_scale || klResult.scale}</span>
                      </div>
                    </>
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
                    <button className="fileDrop" onClick={() => csvInputRef.current?.click()}>
                      <div><strong>{t.upload.uploadImu}</strong><br /><span>{t.upload.imuTypes}</span></div>
                    </button>
                  ) : (
                    <div className="chips">
                      <span className="chip">{imuFile.name}</span>
                      <button className="btn" onClick={() => { setImuFile(null); setImuResult(null); }}>{t.buttons.remove}</button>
                    </div>
                  )}
                  <input ref={csvInputRef} type="file" hidden accept=".csv,text/csv" onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    setImuFile(file);
                    setImuResult(null);
                    setReportResult(null);
                  }} />
                </div>
                <div id="imu-result">
                  <button className="btn primary" onClick={analyzeImu} disabled={!imuFile || imuLoading}>{imuLoading ? t.buttons.analyzing : t.buttons.analyzeImu}</button>
                  {imuError ? <div className="error">{imuError}</div> : null}
                  {!imuResult && !imuError ? <div className="empty">{t.messages.noImuResult}</div> : null}
                  {imuResult ? (
                    <div className="metrics" style={{ marginTop: 10 }}>
                      <div className="metric"><small>{t.labels.currentRom}</small><strong>{f(currentRom, "°")}</strong></div>
                      <div className="metric"><small>{t.labels.previousRom}</small><strong>{f(previousRom, "°")}</strong></div>
                      <div className="metric"><small>{t.labels.rehabScore}</small><strong>{f(imuResult.overall_score)}</strong></div>
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
              <div className="wizardNav">
                <button className="btn primary" onClick={generateReport} disabled={!readyState.patient || !readyState.koos || !readyState.kl || !readyState.imu || reportLoading}>
                  {reportLoading ? t.buttons.generating : t.buttons.generateReport}
                </button>
              </div>
              {reportError ? <div className="error">{reportError}</div> : null}
              {!reportResult && !reportError ? <div className="empty">{t.messages.generateAfterReady}</div> : null}
              {reportResult ? (
                <div className="sectionBody">
                  <div className="metrics">
                    <div className="metric"><small>{t.labels.currentRom}</small><strong>{f(reportResult.current_ROM, "°")}</strong></div>
                    <div className="metric"><small>{t.labels.deltaRom}</small><strong>{f(reportResult.delta_ROM, "°")}</strong></div>
                    <div className="metric"><small>{t.labels.sessionId}</small><strong style={{ fontSize: 16 }}>{reportResult.session_id || "-"}</strong></div>
                  </div>
                  <div className="reportBlock" id="report-interpretation">
                    <h4>{t.report.interpretation}</h4>
                    <p>{reportResult.interpretation || t.report.noInterpretation}</p>
                    {reportResult.delta_note ? <p style={{ marginTop: 8, color: "var(--muted)" }}>{reportResult.delta_note}</p> : null}
                  </div>
                  <div className="reportBlock" id="report-recommendations">
                    <h4>{t.report.recommendations}</h4>
                    {Array.isArray(reportResult.recommendations) && reportResult.recommendations.length > 0 ? (
                      <ul className="reportList">
                        {reportResult.recommendations.map((item) => <li key={item}>{item}</li>)}
                      </ul>
                    ) : (
                      <p>{t.report.noRecommendations}</p>
                    )}
                  </div>
                  <div className="reportBlock" id="report-session">
                    <h4>{t.report.sessionDetails}</h4>
                    <div className="chips">
                      <span className="chip">{t.steps.patient} {patientId || "-"}</span>
                      <span className="chip">{t.labels.exercise} {t.exercises[exercise] || exercise}</span>
                      <span className="chip">{t.labels.created} {formatDate(reportResult.created_at)}</span>
                    </div>
                  </div>
                </div>
              ) : null}
            </section>
          ) : null}

          <div className="wizardNav">
            <button className="btn" onClick={prevStep} disabled={activeStep === "patient"}>{t.buttons.back}</button>
            {activeStep !== "report" ? (
              <button className="btn primary" onClick={nextStep} disabled={!canContinue(activeStep)}>{t.buttons.continue}</button>
            ) : null}
          </div>
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
