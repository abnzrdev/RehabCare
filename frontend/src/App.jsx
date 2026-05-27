import { useState, useRef, useCallback, useEffect } from "react";

// ─────────────────────────────────────────────────────────────
// TRANSLATIONS  (EN · RU · KZ)
// ─────────────────────────────────────────────────────────────
const T = {
  en: {
    brand: "OrthoScan AI", brandSub: "Medical Rehabilitation Platform",
    online: "System Online",
    modOA:  "Knee OA",
    modIMU: "IMU Rehab",

    // ── Module 1 (Knee OA) ──────────────────────────────────────────────────
    heroLabel: "AI Radiology Platform · ConvNeXt-Small · BIN_KNEE_OST_G1",
    heroTitle: "Knee OA", heroItalic: "Diagnostic Intelligence",
    heroDesc: "Upload a knee X-ray for instant AI-powered osteoarthritis screening with bone region heatmap visualization.",
    testAcc: "Test Accuracy", rocAuc: "ROC-AUC", recallFloor: "Recall Floor",
    uploadTitle: "X-Ray Upload", uploadSub: "PNG · JPG · DICOM",
    uploadCta: "Drop X-Ray Here", uploadSub2: "or click to browse",
    remove: "Clear", analyzeBtn: "Run Diagnosis",
    pipeline: "Pipeline", modelConn: "Model Connection",
    checkBtn: "Check Backend", checkDesc: "Tests localhost:8000",
    localActive: "Backend Online", demoActive: "Backend Offline",
    checking: "Checking…", connOk: "Backend Online ✓", connFail: "Backend Offline",
    noReport: "Awaiting X-Ray", noReportSub: "Upload an image to begin",
    analyzing: "Analyzing…", failed: "Analysis Failed",
    diagnosis: "Diagnosis", findings: "Findings", recs: "Recommendations",
    classProb: "Probability", modelOut: "Model Output", meta: "Parameters",
    normalL: "Normal", oaL: "OA", confL: "Conf",
    sev: "Severity", temp: "Temperature", thr: "Threshold", tta: "TTA Passes",
    followup: "Follow-up",
    heatmapTitle: "Bone Region Analysis",
    heatmapSub: "Thermal activation map — blue=low, red=high AI attention",
    disclaimer: "⚠ For clinical decision support only. Confirm with qualified radiologist.",
    steps: ["Preprocessing…", "CLAHE Enhancement…", "ConvNeXt-Small…", "TTA ×3 passes…", "T-Calibration…", "Generating report…"],
    pipeSteps: [
      ["CLAHE",       "clipLimit=2.0"],
      ["Normalize",   "μ=0.6074 σ=0.1944"],
      ["ConvNeXt-S",  "22k pretrained"],
      ["TTA×3",       "hflip+bright"],
      ["T-Scale",     "val-calibrated"],
      ["Thr=0.56",    "Youden's J"],
    ],
    normalG: "Normal (Grade 0)", oaG: "OA (Grades 2–4)",
    urgLabels: { Routine: "Routine", Soon: "Soon", Urgent: "Urgent" },

    // ── Module 2 (IMU Rehab) ────────────────────────────────────────────────
    imuHeroLabel: "LSTM Activity Classification · 94.6% Accuracy · 8 Activities",
    imuHeroTitle: "IMU Rehab", imuHeroItalic: "Movement Intelligence",
    imuHeroDesc: "Upload a single-sensor CSV to get LSTM-powered activity classification and knee rehabilitation ROM scoring.",
    imuLstmAcc: "LSTM Accuracy", imuLstmF1: "LSTM F1", imuActivities: "Activities",
    imuSensorLocLabel: "Sensor Placement",
    imuLocations: {
      right_thigh: "Right Thigh  (recommended)",
      right_shin:  "Right Shin",
      right_foot:  "Right Foot",
      left_thigh:  "Left Thigh",
      left_shin:   "Left Shin",
      left_foot:   "Left Foot",
    },
    imuUploadTitle: "IMU Sensor CSV",
    imuUploadSub: "CSV files only",
    imuUploadCta: "Drop CSV Here",
    imuUploadSub2: "or click to browse",
    imuRemove: "Clear",
    imuAnalyzeBtn: "Analyze Movement",
    imuPipeline: "Pipeline",
    imuPipeSteps: [
      ["CSV Parse",  "expand to 38ch"],
      ["÷ 32768",    "normalize"],
      ["Wavelet",    "db4, level=4"],
      ["Scaler",     "StandardScaler"],
      ["LSTM",       "window=50, stride=25"],
      ["ROM",        "complementary filter"],
    ],
    imuNoReport: "Awaiting CSV Upload",
    imuNoReportSub: "Upload a sensor CSV to begin",
    imuAnalyzing: "Analyzing…",
    imuFailed: "Analysis Failed",
    imuOverallScore: "Overall Score",
    imuDominant: "Dominant Activity",
    imuSummary: "Session Summary",
    imuSamples: "Samples",
    imuRealCh: "Real Channels",
    imuSimCh: "Simulated",
    imuBreakdown: "Activity Breakdown",
    imuROMScores: "ROM Scores by Activity",
    imuFeedbackTitle: "Rehabilitation Feedback",
    imuHealthy: "Healthy",
    imuScore: "Score",
    imuROM: "ROM",
    imuDisclaimer: "⚠ For clinical decision support only. Confirm with qualified physiotherapist.",
    imuSteps: ["Parsing CSV…", "Expanding channels…", "Normalizing…", "Wavelet denoising…", "LSTM inference…", "Computing ROM…"],
    imuModelUnavail: "IMU model not loaded on backend.",
  },

  ru: {
    brand: "OrthoScan AI", brandSub: "Медицинская платформа реабилитации",
    online: "Система онлайн",
    modOA:  "Колено ОА",
    modIMU: "ИМУ Реабилитация",

    heroLabel: "АИ Радиология · ConvNeXt-Small · BIN_KNEE_OST_G1",
    heroTitle: "ОА колена", heroItalic: "Диагностический интеллект",
    heroDesc: "Загрузите рентген колена для мгновенного АИ-скрининга с тепловой картой костных регионов.",
    testAcc: "Точность", rocAuc: "ROC-AUC", recallFloor: "Порог recall",
    uploadTitle: "Загрузка снимка", uploadSub: "PNG · JPG · DICOM",
    uploadCta: "Перетащите рентген", uploadSub2: "или нажмите для выбора",
    remove: "Очистить", analyzeBtn: "Запустить диагноз",
    pipeline: "Конвейер", modelConn: "Подключение модели",
    checkBtn: "Проверить бэкенд", checkDesc: "Тестирует localhost:8000",
    localActive: "Бэкенд онлайн", demoActive: "Бэкенд офлайн",
    checking: "Проверка…", connOk: "Сервер онлайн ✓", connFail: "Используется демо",
    noReport: "Ожидание снимка", noReportSub: "Загрузите изображение для начала",
    analyzing: "Анализ…", failed: "Ошибка анализа",
    diagnosis: "Диагноз", findings: "Находки", recs: "Рекомендации",
    classProb: "Вероятность", modelOut: "Результат", meta: "Параметры",
    normalL: "Норма", oaL: "ОА", confL: "Увер",
    sev: "Тяжесть", temp: "Температура", thr: "Порог", tta: "TTA",
    followup: "Наблюдение",
    heatmapTitle: "Анализ костных регионов",
    heatmapSub: "Тепловая карта активации — синий=низкий, красный=высокий",
    disclaimer: "⚠ Только для поддержки клинических решений. Подтвердите с радиологом.",
    steps: ["Предобработка…", "CLAHE…", "ConvNeXt-Small…", "TTA × 3…", "Калибровка T…", "Формирование отчёта…"],
    pipeSteps: [
      ["CLAHE",        "clipLimit=2.0"],
      ["Нормализация", "μ=0.6074 σ=0.1944"],
      ["ConvNeXt-S",   "22k pretrained"],
      ["TTA×3",        "hflip+bright"],
      ["T-Scale",      "val-calibrated"],
      ["Порог=0.56",   "Youden's J"],
    ],
    normalG: "Норма (Grade 0)", oaG: "ОА (Grade 2–4)",
    urgLabels: { Routine: "Плановое", Soon: "Скорое", Urgent: "Срочное" },

    imuHeroLabel: "LSTM Классификация · 94.6% Точность · 8 Активностей",
    imuHeroTitle: "ИМУ Реабилитация", imuHeroItalic: "Интеллект движения",
    imuHeroDesc: "Загрузите CSV одного датчика для классификации активности и оценки реабилитации колена.",
    imuLstmAcc: "Точность LSTM", imuLstmF1: "F1 LSTM", imuActivities: "Активности",
    imuSensorLocLabel: "Расположение датчика",
    imuLocations: {
      right_thigh: "Правое бедро  (рекомендуется)",
      right_shin:  "Правая голень",
      right_foot:  "Правая стопа",
      left_thigh:  "Левое бедро",
      left_shin:   "Левая голень",
      left_foot:   "Левая стопа",
    },
    imuUploadTitle: "CSV датчика ИМУ",
    imuUploadSub: "Только CSV файлы",
    imuUploadCta: "Перетащите CSV",
    imuUploadSub2: "или нажмите для выбора",
    imuRemove: "Очистить",
    imuAnalyzeBtn: "Анализировать движение",
    imuPipeline: "Конвейер",
    imuPipeSteps: [
      ["CSV Парсинг",   "расширение до 38ch"],
      ["÷ 32768",       "нормализация"],
      ["Вейвлет",       "db4, уровень=4"],
      ["Масштаб",       "StandardScaler"],
      ["LSTM",          "окно=50, шаг=25"],
      ["ДАД",           "дополн. фильтр"],
    ],
    imuNoReport: "Ожидание CSV",
    imuNoReportSub: "Загрузите CSV датчика для начала",
    imuAnalyzing: "Анализ…",
    imuFailed: "Ошибка анализа",
    imuOverallScore: "Общий балл",
    imuDominant: "Основная активность",
    imuSummary: "Сводка сессии",
    imuSamples: "Образцы",
    imuRealCh: "Реальные каналы",
    imuSimCh: "Симулированных",
    imuBreakdown: "Разбивка активности",
    imuROMScores: "Оценки ДАД по активностям",
    imuFeedbackTitle: "Реабилитационная обратная связь",
    imuHealthy: "Здоровый",
    imuScore: "Балл",
    imuROM: "ДАД",
    imuDisclaimer: "⚠ Только для поддержки клинических решений. Подтвердите с физиотерапевтом.",
    imuSteps: ["Парсинг CSV…", "Расширение каналов…", "Нормализация…", "Вейвлет…", "Инференс LSTM…", "Вычисление ДАД…"],
    imuModelUnavail: "Модель ИМУ не загружена на бэкенде.",
  },

  kz: {
    brand: "OrthoScan AI", brandSub: "Медициналық оңалту платформасы",
    online: "Жүйе онлайн",
    modOA:  "Тізе ОА",
    modIMU: "ИМУ Оңалту",

    heroLabel: "АИ Радиология · ConvNeXt-Small · BIN_KNEE_OST_G1",
    heroTitle: "Тізе ОА", heroItalic: "Диагностикалық интеллект",
    heroDesc: "Сүйек аймақтарының жылу картасымен жедел АИ скринингі үшін тізе рентгенін жүктеңіз.",
    testAcc: "Дәлдік", rocAuc: "ROC-AUC", recallFloor: "Recall шегі",
    uploadTitle: "Сурет жүктеу", uploadSub: "PNG · JPG · DICOM",
    uploadCta: "Рентгенді түйсеңіз", uploadSub2: "немесе таңдау үшін басыңыз",
    remove: "Тазалау", analyzeBtn: "Диагноз жүргізу",
    pipeline: "Конвейер", modelConn: "Модель қосылымы",
    checkBtn: "Бэкендті тексеру", checkDesc: "localhost:8000 тексереді",
    localActive: "Бэкенд онлайн", demoActive: "Бэкенд офлайн",
    checking: "Тексеру…", connOk: "Сервер онлайн ✓", connFail: "Демо режимі",
    noReport: "Сурет күту", noReportSub: "Бастау үшін сурет жүктеңіз",
    analyzing: "Талдау…", failed: "Талдау қатесі",
    diagnosis: "Диагноз", findings: "Табыстар", recs: "Ұсыныстар",
    classProb: "Ықтималдық", modelOut: "Нәтиже", meta: "Параметрлер",
    normalL: "Норма", oaL: "ОА", confL: "Сенім",
    sev: "Ауырлық", temp: "Температура", thr: "Шек", tta: "TTA",
    followup: "Бақылау",
    heatmapTitle: "Сүйек аймағын талдау",
    heatmapSub: "Жылу белсенділік картасы — көк=төмен, қызыл=жоғары",
    disclaimer: "⚠ Тек клиникалық шешімді қолдауға арналған. Радиологпен растаңыз.",
    steps: ["Өңдеу…", "CLAHE…", "ConvNeXt-Small…", "TTA × 3…", "T-Калибрлеу…", "Есеп жасау…"],
    pipeSteps: [
      ["CLAHE",        "clipLimit=2.0"],
      ["Нормализация", "μ=0.6074 σ=0.1944"],
      ["ConvNeXt-S",   "22k pretrained"],
      ["TTA×3",        "hflip+bright"],
      ["T-Scale",      "val-calibrated"],
      ["Шек=0.56",     "Youden's J"],
    ],
    normalG: "Норма (Grade 0)", oaG: "ОА (Grade 2–4)",
    urgLabels: { Routine: "Жоспарлы", Soon: "Жақын", Urgent: "Шұғыл" },

    imuHeroLabel: "LSTM Жіктеу · 94.6% Дәлдік · 8 Белсенділік",
    imuHeroTitle: "ИМУ Оңалту", imuHeroItalic: "Қозғалыс интеллекті",
    imuHeroDesc: "Белсенділікті жіктеу және тізе оңалту ROM бағалауы үшін бір сенсор CSV жүктеңіз.",
    imuLstmAcc: "LSTM Дәлдігі", imuLstmF1: "LSTM F1", imuActivities: "Белсенділіктер",
    imuSensorLocLabel: "Сенсор орны",
    imuLocations: {
      right_thigh: "Оң жамбас  (ұсынылады)",
      right_shin:  "Оң балтыр",
      right_foot:  "Оң аяқ",
      left_thigh:  "Сол жамбас",
      left_shin:   "Сол балтыр",
      left_foot:   "Сол аяқ",
    },
    imuUploadTitle: "ИМУ Сенсор CSV",
    imuUploadSub: "Тек CSV файлдар",
    imuUploadCta: "CSV түйсеңіз",
    imuUploadSub2: "немесе таңдау үшін басыңыз",
    imuRemove: "Тазалау",
    imuAnalyzeBtn: "Қозғалысты талдау",
    imuPipeline: "Конвейер",
    imuPipeSteps: [
      ["CSV Парсинг",  "38ch дейін кеңейту"],
      ["÷ 32768",      "нормализация"],
      ["Толқын",       "db4, деңгей=4"],
      ["Масштаб",      "StandardScaler"],
      ["LSTM",         "терезе=50, қадам=25"],
      ["ROM",          "комплементарлы сүзгі"],
    ],
    imuNoReport: "CSV күту",
    imuNoReportSub: "Бастау үшін сенсор CSV жүктеңіз",
    imuAnalyzing: "Талдау…",
    imuFailed: "Талдау қатесі",
    imuOverallScore: "Жалпы балл",
    imuDominant: "Басым белсенділік",
    imuSummary: "Сессия қорытындысы",
    imuSamples: "Үлгілер",
    imuRealCh: "Нақты арналар",
    imuSimCh: "Симуляция",
    imuBreakdown: "Белсенділік бөлінісі",
    imuROMScores: "Белсенділік бойынша ROM",
    imuFeedbackTitle: "Оңалту кері байланысы",
    imuHealthy: "Сау",
    imuScore: "Балл",
    imuROM: "ROM",
    imuDisclaimer: "⚠ Тек клиникалық шешімді қолдауға арналған. Физиотерапевтпен растаңыз.",
    imuSteps: ["CSV парсинг…", "Арналарды кеңейту…", "Нормализация…", "Толқын…", "LSTM инференс…", "ROM есептеу…"],
    imuModelUnavail: "ИМУ моделі бэкендте жүктелмеген.",
  },
};

// ─────────────────────────────────────────────────────────────
// JET COLORMAP  (blue → cyan → green → yellow → red)
// ─────────────────────────────────────────────────────────────
function jetColor(t) {
  t = Math.max(0, Math.min(1, t));
  let r, g, b;
  if      (t < 0.125) { r = 0;              g = 0;               b = 0.5 + t * 4; }
  else if (t < 0.375) { r = 0;              g = (t - 0.125) * 4; b = 1; }
  else if (t < 0.625) { r = (t - 0.375) * 4; g = 1;             b = 1 - (t - 0.375) * 4; }
  else if (t < 0.875) { r = 1;              g = 1 - (t - 0.625) * 4; b = 0; }
  else                { r = 1 - (t - 0.875) * 4; g = 0;         b = 0; }
  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}

// ─────────────────────────────────────────────────────────────
// GRAD-CAM HEATMAP
// ─────────────────────────────────────────────────────────────
function GradCAMHeatmap({ imageData, hotspots = [], visible }) {
  const canvasRef = useRef();
  useEffect(() => {
    if (!imageData || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx    = canvas.getContext("2d");
    const img    = new Image();
    img.onload = () => {
      const W = img.width, H = img.height;
      canvas.width = W; canvas.height = H;
      ctx.drawImage(img, 0, 0);
      if (!visible || hotspots.length === 0) return;
      const SCALE = 0.25;
      const GW = Math.max(1, Math.round(W * SCALE));
      const GH = Math.max(1, Math.round(H * SCALE));
      const grid = new Float32Array(GW * GH).fill(0.08);
      hotspots.forEach(({ x, y, r, intensity }) => {
        const cx = x * GW, cy = y * GH;
        const sigma = r * Math.min(GW, GH) * 2.2;
        const s2 = sigma * sigma, pad = sigma * 3;
        const x0 = Math.max(0, Math.floor(cx - pad)), x1 = Math.min(GW - 1, Math.ceil(cx + pad));
        const y0 = Math.max(0, Math.floor(cy - pad)), y1 = Math.min(GH - 1, Math.ceil(cy + pad));
        for (let gy = y0; gy <= y1; gy++)
          for (let gx = x0; gx <= x1; gx++) {
            const dx = gx - cx, dy = gy - cy;
            grid[gy * GW + gx] = Math.min(1.0, grid[gy * GW + gx] + intensity * Math.exp(-(dx*dx + dy*dy) / (2*s2)));
          }
      });
      let mn = Infinity, mx = -Infinity;
      for (const v of grid) { if (v < mn) mn = v; if (v > mx) mx = v; }
      const range = mx - mn || 1;
      for (let i = 0; i < grid.length; i++) grid[i] = (grid[i] - mn) / range;
      const off = document.createElement("canvas");
      off.width = GW; off.height = GH;
      const octx = off.getContext("2d");
      const idata = octx.createImageData(GW, GH);
      for (let i = 0; i < grid.length; i++) {
        const [r, g, b] = jetColor(grid[i]);
        idata.data[i*4]=r; idata.data[i*4+1]=g; idata.data[i*4+2]=b; idata.data[i*4+3]=255;
      }
      octx.putImageData(idata, 0, 0);
      ctx.save();
      ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = "high";
      ctx.globalAlpha = 0.62; ctx.globalCompositeOperation = "multiply";
      ctx.drawImage(off, 0, 0, GW, GH, 0, 0, W, H);
      ctx.restore();
      const top = [...hotspots].sort((a, b) => b.intensity - a.intensity)[0];
      const tx = top.x * W, ty = top.y * H, tr = top.r * Math.min(W, H) * 0.5;
      ctx.save();
      ctx.beginPath(); ctx.arc(tx, ty, tr, 0, Math.PI*2);
      ctx.strokeStyle = "rgba(255,50,50,1)"; ctx.lineWidth = 2; ctx.setLineDash([5,3]); ctx.stroke(); ctx.setLineDash([]);
      const ch = tr * 0.45; ctx.strokeStyle = "rgba(255,255,255,.95)"; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(tx-ch,ty); ctx.lineTo(tx+ch,ty); ctx.moveTo(tx,ty-ch); ctx.lineTo(tx,ty+ch); ctx.stroke();
      ctx.restore();
      const LH = Math.min(Math.round(H*.55),160), LW = 12, lx = W-LW-8, ly = Math.round((H-LH)/2);
      for (let i = 0; i < LH; i++) { const [r,g,b] = jetColor(1-i/(LH-1)); ctx.fillStyle=`rgb(${r},${g},${b})`; ctx.fillRect(lx,ly+i,LW,1); }
      ctx.strokeStyle="rgba(255,255,255,.35)"; ctx.lineWidth=.5; ctx.strokeRect(lx,ly,LW,LH);
      ctx.fillStyle="rgba(255,255,255,.8)"; ctx.font="bold 8px monospace"; ctx.textAlign="right";
      ctx.fillText("HIGH",lx-3,ly+7); ctx.fillText("LOW",lx-3,ly+LH+1);
    };
    img.src = imageData;
  }, [imageData, hotspots, visible]);
  return (
    <canvas ref={canvasRef}
      style={{ width:"100%",height:"100%",objectFit:"contain",display:"block",borderRadius:12 }} />
  );
}

// ─────────────────────────────────────────────────────────────
// ARC GAUGE
// ─────────────────────────────────────────────────────────────
function ArcGauge({ value = 0, size = 90, color = "#4f8ef7", label }) {
  const r    = size / 2 - 8;
  const circ = 2 * Math.PI * r;
  const dash = circ - (Math.min(value, 100) / 100) * circ;
  return (
    <div style={{ display:"flex",flexDirection:"column",alignItems:"center",gap:4 }}>
      <div style={{ position:"relative",width:size,height:size }}>
        <svg width={size} height={size} style={{ transform:"rotate(-90deg)" }}>
          <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="rgba(255,255,255,.08)" strokeWidth={6} />
          <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={6}
            strokeDasharray={circ} strokeDashoffset={dash} strokeLinecap="round"
            style={{ transition:"stroke-dashoffset 1.4s cubic-bezier(.4,0,.2,1)",filter:`drop-shadow(0 0 8px ${color}88)` }} />
        </svg>
        <div style={{ position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center" }}>
          <span style={{ fontSize:17,fontWeight:800,color:"#fff",fontVariantNumeric:"tabular-nums" }}>{Math.round(value)}</span>
        </div>
      </div>
      {label && <div style={{ fontSize:10,fontWeight:700,color:"rgba(255,255,255,.5)",textTransform:"uppercase",letterSpacing:"0.1em" }}>{label}</div>}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// SHARED STYLES & ANIMATIONS (injected once)
// ─────────────────────────────────────────────────────────────
const GLOBAL_CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&display=swap');
  @keyframes spin    { to { transform: rotate(360deg) } }
  @keyframes fadeUp  { from { opacity:0; transform:translateY(20px) } to { opacity:1; transform:none } }
  @keyframes pulse   { 0%,100% { opacity:1 } 50% { opacity:.3 } }
  @keyframes scan    { from { top:0 } to { top:100% } }
  @keyframes shimmer { from { transform:translateX(-100%) } to { transform:translateX(200%) } }
  @keyframes glow    { 0%,100% { box-shadow:0 0 20px rgba(79,142,247,.3) } 50% { box-shadow:0 0 40px rgba(79,142,247,.6) } }
  @keyframes float   { 0%,100% { transform:translateY(0) } 50% { transform:translateY(-8px) } }
  * { box-sizing:border-box; margin:0; padding:0 }
  ::-webkit-scrollbar { width:4px }
  ::-webkit-scrollbar-track { background:#0a1020 }
  ::-webkit-scrollbar-thumb { background:#1e3a5f; border-radius:2px }
`;

// ─────────────────────────────────────────────────────────────
// MAIN APP
// ─────────────────────────────────────────────────────────────
export default function App() {
  const [lang, setLang]             = useState("en");
  const [module, setModule]         = useState("oa");   // "oa" | "imu"

  // ── OA module state ─────────────────────────────────────────────────────
  const [image, setImage]           = useState(null);
  const [b64, setB64]               = useState(null);
  const [mime, setMime]             = useState("image/png");
  const [drag, setDrag]             = useState(false);
  const [loading, setLoading]       = useState(false);
  const [stepIdx, setStepIdx]       = useState(0);
  const [result, setResult]         = useState(null);
  const [err, setErr]               = useState(null);
  const [heatVisible, setHeatVisible] = useState(true);

  // ── IMU module state ─────────────────────────────────────────────────────
  const [imuFile, setImuFile]         = useState(null);
  const [imuDrag, setImuDrag]         = useState(false);
  const [imuLocation, setImuLocation] = useState("right_thigh");
  const [imuLoading, setImuLoading]   = useState(false);
  const [imuStepIdx, setImuStepIdx]   = useState(0);
  const [imuResult, setImuResult]     = useState(null);
  const [imuErr, setImuErr]           = useState(null);

  // ── Shared connection state ──────────────────────────────────────────────
  const [modelMode, setModelMode]     = useState("demo");
  const [connStatus, setConnStatus]   = useState(null);
  const [imuAvail, setImuAvail]       = useState(false);

  const fileRef    = useRef();
  const imuFileRef = useRef();
  const t = T[lang];

  // ── Backend health check ─────────────────────────────────────────────────
  const checkConn = async () => {
    setConnStatus("checking");
    try {
      const r = await fetch("/api/health", { signal: AbortSignal.timeout(3000) });
      if (r.ok) {
        const data = await r.json();
        setConnStatus("ok");
        setModelMode("local");
        setImuAvail(data.imu === "real");
        return true;
      }
    } catch (_) {}
    setConnStatus("fail"); setModelMode("demo"); setImuAvail(false); return false;
  };
  useEffect(() => { checkConn(); }, []);

  // ── OA handlers ──────────────────────────────────────────────────────────
  const handleFile = useCallback((file) => {
    if (!file?.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      setImage(e.target.result);
      setB64(e.target.result.split(",")[1]);
      setMime(file.type || "image/png");
      setResult(null); setErr(null);
    };
    reader.readAsDataURL(file);
  }, []);

  const analyze = async () => {
    if (!b64) return;
    setLoading(true); setResult(null); setErr(null); setStepIdx(0);
    const iv = setInterval(() => setStepIdx((s) => (s + 1) % t.steps.length), 900);
    try {
      const bs  = atob(b64);
      const arr = new Uint8Array(bs.length);
      for (let i = 0; i < bs.length; i++) arr[i] = bs.charCodeAt(i);
      const fd = new FormData();
      fd.append("file", new Blob([arr], { type: mime }), "xray.jpg");
      const res = await fetch(`/api/predict?lang=${lang}`, { method:"POST", body:fd, signal:AbortSignal.timeout(20000) });
      if (!res.ok) throw new Error(`Server error ${res.status}`);
      const d = await res.json();
      setResult({
        pred:            d.grade,
        diagnosis:       d.diagnosis,
        prob_oa:         d.prob_oa,
        confidence:      d.confidence,
        normal_pct:      d.grade_probs?.["0"] ?? (100 - d.confidence),
        oa_pct:          d.grade_probs?.["1"] ?? d.confidence,
        threshold:       d.threshold ?? 0.56,
        T_optimal:       d.T_optimal ?? 1.0,
        severity:        d.severity ?? "—",
        findings:        d.findings ?? [],
        recommendations: d.recommendations ?? [],
        kl_note:         d.scale ?? "",
        urgency:         d.urgency ?? "Routine",
        hotspots:        d.hotspots ?? null,
        source:          d.source ?? "local",
      });
    } catch (e) { setErr(e.message); }
    finally { clearInterval(iv); setLoading(false); }
  };

  // ── IMU handlers ──────────────────────────────────────────────────────────
  const handleImuFile = useCallback((file) => {
    if (!file) return;
    setImuFile(file);
    setImuResult(null); setImuErr(null);
  }, []);

  const analyzeImu = async () => {
    if (!imuFile) return;
    setImuLoading(true); setImuResult(null); setImuErr(null); setImuStepIdx(0);
    const iv = setInterval(() => setImuStepIdx((s) => (s + 1) % t.imuSteps.length), 1200);
    try {
      const fd = new FormData();
      fd.append("file", imuFile);
      const res = await fetch(
        `/api/imu/analyze?lang=${lang}&sensor_location=${imuLocation}`,
        { method:"POST", body:fd, signal:AbortSignal.timeout(120000) }
      );
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || `Server error ${res.status}`);
      setImuResult(d);
    } catch (e) { setImuErr(e.message); }
    finally { clearInterval(iv); setImuLoading(false); }
  };

  const isOA     = result?.pred === 1;
  const urgColor = { Routine:"#10b981", Soon:"#f59e0b", Urgent:"#ef4444" };

  // Score color for IMU
  const scoreColor = (s) => s >= 85 ? "#10b981" : s >= 65 ? "#4f8ef7" : s >= 45 ? "#f59e0b" : "#ef4444";

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight:"100vh",background:"#050a14",color:"#e2e8f0",fontFamily:"'Inter','Segoe UI',sans-serif",overflowX:"hidden" }}>
      <style>{GLOBAL_CSS}</style>

      {/* Animated background */}
      <div style={{ position:"fixed",inset:0,zIndex:0,pointerEvents:"none",
        background:"radial-gradient(ellipse 80% 60% at 20% 0%,rgba(79,142,247,.07),transparent 60%),radial-gradient(ellipse 60% 50% at 80% 100%,rgba(16,185,129,.05),transparent 60%)" }} />
      <div style={{ position:"fixed",inset:0,zIndex:0,pointerEvents:"none",
        backgroundImage:"linear-gradient(rgba(79,142,247,.03) 1px,transparent 1px),linear-gradient(90deg,rgba(79,142,247,.03) 1px,transparent 1px)",
        backgroundSize:"60px 60px" }} />

      {/* ── NAV ── */}
      <nav style={{ position:"sticky",top:0,zIndex:100,
        background:"rgba(5,10,20,.85)",backdropFilter:"blur(24px) saturate(180%)",
        borderBottom:"1px solid rgba(79,142,247,.12)",boxShadow:"0 4px 30px rgba(0,0,0,.3)" }}>
        <div style={{ maxWidth:1280,margin:"0 auto",padding:"0 28px",height:62,display:"flex",alignItems:"center",justifyContent:"space-between" }}>

          {/* Logo */}
          <div style={{ display:"flex",alignItems:"center",gap:12 }}>
            <div style={{ width:36,height:36,borderRadius:10,
              background:"linear-gradient(135deg,#1d4ed8,#4f8ef7)",
              display:"flex",alignItems:"center",justifyContent:"center",
              boxShadow:"0 0 20px rgba(79,142,247,.4)",animation:"glow 3s ease-in-out infinite" }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round">
                <path d="M18 8h1a4 4 0 010 8h-1"/><path d="M2 8h16v9a4 4 0 01-4 4H6a4 4 0 01-4-4V8z"/>
                <line x1="6" y1="1" x2="6" y2="4"/><line x1="10" y1="1" x2="10" y2="4"/><line x1="14" y1="1" x2="14" y2="4"/>
              </svg>
            </div>
            <div>
              <div style={{ fontSize:15,fontWeight:800,letterSpacing:"-0.03em",background:"linear-gradient(135deg,#fff,#93c5fd)",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent" }}>{t.brand}</div>
              <div style={{ fontSize:10,color:"rgba(255,255,255,.35)",letterSpacing:"0.1em",textTransform:"uppercase" }}>{t.brandSub}</div>
            </div>
          </div>

          <div style={{ display:"flex",alignItems:"center",gap:10 }}>
            {/* Module tabs */}
            <div style={{ display:"flex",gap:2,background:"rgba(255,255,255,.05)",borderRadius:10,padding:3 }}>
              {[["oa",t.modOA,"#4f8ef7"],["imu",t.modIMU,"#10b981"]].map(([m,label,ac]) => (
                <button key={m} onClick={() => setModule(m)} style={{
                  padding:"5px 16px",borderRadius:8,fontSize:12,fontWeight:700,cursor:"pointer",
                  background: module===m ? `${ac}22` : "transparent",
                  border: module===m ? `1px solid ${ac}44` : "1px solid transparent",
                  color: module===m ? ac : "rgba(255,255,255,.4)",
                  transition:"all .15s",
                }}>{label}</button>
              ))}
            </div>

            <div style={{ height:18,width:1,background:"rgba(255,255,255,.1)" }}/>
            <div style={{ display:"flex",alignItems:"center",gap:6 }}>
              <span style={{ width:7,height:7,borderRadius:"50%",background:"#10b981",display:"inline-block",boxShadow:"0 0 8px #10b981",animation:"pulse 2s infinite" }}/>
              <span style={{ fontSize:11,color:"rgba(255,255,255,.45)",fontWeight:500 }}>{t.online}</span>
            </div>
            <div style={{ height:18,width:1,background:"rgba(255,255,255,.1)" }}/>
            <div style={{ padding:"4px 10px",borderRadius:8,fontSize:11,fontWeight:600,
              background: modelMode==="local"?"rgba(16,185,129,.15)":"rgba(79,142,247,.15)",
              border:`1px solid ${modelMode==="local"?"rgba(16,185,129,.3)":"rgba(79,142,247,.3)"}`,
              color: modelMode==="local"?"#10b981":"#4f8ef7" }}>
              {modelMode==="local" ? "🟢 "+t.localActive : "🔵 "+t.demoActive}
            </div>
            <div style={{ height:18,width:1,background:"rgba(255,255,255,.1)" }}/>
            {/* Lang switcher */}
            <div style={{ display:"flex",gap:3,background:"rgba(255,255,255,.05)",borderRadius:9,padding:3 }}>
              {["en","ru","kz"].map((l) => (
                <button key={l} onClick={() => setLang(l)} style={{
                  padding:"4px 12px",borderRadius:7,fontSize:11,fontWeight:700,cursor:"pointer",
                  background: lang===l?"rgba(79,142,247,.9)":"transparent",
                  color: lang===l?"#fff":"rgba(255,255,255,.4)",
                  border:"none",transition:"all .15s",letterSpacing:"0.06em",
                }}>{l.toUpperCase()}</button>
              ))}
            </div>
          </div>
        </div>
      </nav>

      {/* ════════════════════════════════════════════════════════
          MODULE 1 — KNEE OA DIAGNOSTICS
      ════════════════════════════════════════════════════════ */}
      {module === "oa" && (
        <>
          {/* Hero */}
          <div style={{ position:"relative",overflow:"hidden",padding:"48px 28px 40px",
            background:"linear-gradient(160deg,rgba(13,24,50,1) 0%,rgba(5,10,20,1) 100%)",
            borderBottom:"1px solid rgba(79,142,247,.1)" }}>
            <div style={{ maxWidth:1280,margin:"0 auto",display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:24 }}>
              <div style={{ maxWidth:540 }}>
                <div style={{ display:"inline-flex",alignItems:"center",gap:8,padding:"5px 14px",borderRadius:999,
                  background:"rgba(79,142,247,.1)",border:"1px solid rgba(79,142,247,.2)",marginBottom:18 }}>
                  <span style={{ width:6,height:6,borderRadius:"50%",background:"#4f8ef7",display:"inline-block",animation:"pulse 2s infinite" }}/>
                  <span style={{ fontSize:11,color:"#93c5fd",fontWeight:600,letterSpacing:"0.08em" }}>{t.heroLabel}</span>
                </div>
                <h1 style={{ fontSize:"clamp(30px,4vw,52px)",fontWeight:900,lineHeight:1.05,letterSpacing:"-0.04em",marginBottom:14 }}>
                  <span style={{ background:"linear-gradient(135deg,#fff 30%,#93c5fd)",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent" }}>{t.heroTitle}</span><br/>
                  <span style={{ fontSize:"0.7em",fontWeight:300,fontStyle:"italic",color:"rgba(255,255,255,.5)" }}>{t.heroItalic}</span>
                </h1>
                <p style={{ color:"rgba(255,255,255,.45)",fontSize:14,lineHeight:1.7,maxWidth:420 }}>{t.heroDesc}</p>
              </div>
              <div style={{ display:"flex",gap:14 }}>
                {[{ v:"89.7%",l:t.testAcc,c:"#4f8ef7" },{ v:"0.953",l:t.rocAuc,c:"#10b981" },{ v:"≥0.80",l:t.recallFloor,c:"#f59e0b" }].map(({ v,l,c }) => (
                  <div key={l} style={{ textAlign:"center",padding:"18px 22px",borderRadius:16,
                    background:"rgba(255,255,255,.04)",border:"1px solid rgba(255,255,255,.08)",
                    backdropFilter:"blur(12px)",animation:"float 4s ease-in-out infinite",
                    boxShadow:"0 8px 32px rgba(0,0,0,.3),inset 0 1px 0 rgba(255,255,255,.08)" }}>
                    <div style={{ fontSize:26,fontWeight:900,color:c,letterSpacing:"-0.04em",textShadow:`0 0 20px ${c}66` }}>{v}</div>
                    <div style={{ fontSize:10,color:"rgba(255,255,255,.4)",marginTop:4,letterSpacing:"0.1em",textTransform:"uppercase" }}>{l}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* OA Content */}
          <div style={{ maxWidth:1280,margin:"0 auto",padding:"28px 28px 80px",position:"relative",zIndex:1 }}>
            <div style={{ display:"grid",gridTemplateColumns:"380px 1fr",gap:20,alignItems:"start" }}>

              {/* Left panel */}
              <div style={{ display:"flex",flexDirection:"column",gap:14 }}>

                {/* Backend connection */}
                <div style={{ borderRadius:18,overflow:"hidden",background:"rgba(255,255,255,.03)",border:"1px solid rgba(79,142,247,.15)",backdropFilter:"blur(12px)",boxShadow:"0 8px 32px rgba(0,0,0,.3)" }}>
                  <div style={{ padding:"14px 18px 11px",borderBottom:"1px solid rgba(255,255,255,.06)",display:"flex",alignItems:"center",gap:10 }}>
                    <div style={{ width:30,height:30,borderRadius:8,background:"rgba(79,142,247,.15)",display:"flex",alignItems:"center",justifyContent:"center" }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#4f8ef7" strokeWidth="2.2" strokeLinecap="round"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
                    </div>
                    <div>
                      <div style={{ fontSize:13,fontWeight:700 }}>{t.modelConn}</div>
                      <div style={{ fontSize:10,color:"rgba(255,255,255,.35)" }}>{t.checkDesc}</div>
                    </div>
                  </div>
                  <div style={{ padding:"12px 16px" }}>
                    <button onClick={checkConn} disabled={connStatus==="checking"} style={{
                      width:"100%",padding:"9px",borderRadius:10,fontSize:12,fontWeight:700,cursor:"pointer",
                      background: connStatus==="checking"?"rgba(255,255,255,.05)":"linear-gradient(135deg,rgba(79,142,247,.8),rgba(29,78,216,.8))",
                      color: connStatus==="checking"?"rgba(255,255,255,.3)":"#fff",
                      border:"1px solid rgba(79,142,247,.3)",display:"flex",alignItems:"center",justifyContent:"center",gap:8,
                      boxShadow: connStatus!=="checking"?"0 4px 14px rgba(79,142,247,.2)":"none",transition:"all .2s",
                    }}>
                      {connStatus==="checking"
                        ? <><div style={{ width:12,height:12,border:"2px solid rgba(79,142,247,.3)",borderTop:"2px solid #4f8ef7",borderRadius:"50%",animation:"spin .7s linear infinite" }}/>{t.checking}</>
                        : t.checkBtn}
                    </button>
                    {connStatus && (
                      <div style={{ marginTop:10,padding:"8px 12px",borderRadius:9,fontSize:11,fontWeight:600,
                        background: connStatus==="ok"?"rgba(16,185,129,.1)":"rgba(239,68,68,.1)",
                        border:`1px solid ${connStatus==="ok"?"rgba(16,185,129,.25)":"rgba(239,68,68,.25)"}`,
                        color: connStatus==="ok"?"#10b981":"#ef4444" }}>
                        {connStatus==="ok" ? "✓ "+t.connOk : "⚡ "+t.connFail}
                      </div>
                    )}
                  </div>
                </div>

                {/* Upload */}
                <div style={{ borderRadius:18,overflow:"hidden",background:"rgba(255,255,255,.03)",border:"1px solid rgba(255,255,255,.08)",backdropFilter:"blur(12px)",boxShadow:"0 8px 32px rgba(0,0,0,.3)" }}>
                  <div style={{ padding:"14px 18px 11px",borderBottom:"1px solid rgba(255,255,255,.06)",display:"flex",alignItems:"center",justifyContent:"space-between" }}>
                    <div style={{ display:"flex",alignItems:"center",gap:10 }}>
                      <div style={{ width:30,height:30,borderRadius:8,background:"rgba(79,142,247,.15)",display:"flex",alignItems:"center",justifyContent:"center" }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#4f8ef7" strokeWidth="2" strokeLinecap="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21,15 16,10 5,21"/></svg>
                      </div>
                      <div>
                        <div style={{ fontSize:13,fontWeight:700 }}>{t.uploadTitle}</div>
                        <div style={{ fontSize:10,color:"rgba(255,255,255,.35)" }}>{t.uploadSub}</div>
                      </div>
                    </div>
                    {image && (
                      <button onClick={() => { setImage(null); setB64(null); setResult(null); setErr(null); }}
                        style={{ padding:"4px 12px",borderRadius:7,fontSize:11,fontWeight:600,cursor:"pointer",background:"rgba(239,68,68,.15)",border:"1px solid rgba(239,68,68,.25)",color:"#ef4444" }}>
                        {t.remove}
                      </button>
                    )}
                  </div>
                  <div style={{ padding:14 }}>
                    {!image ? (
                      <div onClick={() => fileRef.current.click()}
                        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
                        onDragLeave={() => setDrag(false)}
                        onDrop={(e) => { e.preventDefault(); setDrag(false); handleFile(e.dataTransfer.files[0]); }}
                        style={{ border:`2px dashed ${drag?"#4f8ef7":"rgba(79,142,247,.2)"}`,borderRadius:14,
                          padding:"40px 20px",textAlign:"center",cursor:"pointer",
                          background: drag?"rgba(79,142,247,.08)":"rgba(79,142,247,.02)",transition:"all .2s" }}>
                        <input ref={fileRef} type="file" accept="image/*" style={{ display:"none" }} onChange={(e) => handleFile(e.target.files[0])} />
                        <div style={{ width:52,height:52,borderRadius:14,background:"rgba(79,142,247,.15)",border:"1px solid rgba(79,142,247,.25)",display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 14px",animation:"float 3s ease-in-out infinite" }}>
                          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#4f8ef7" strokeWidth="2" strokeLinecap="round"><polyline points="16,16 12,12 8,16"/><line x1="12" y1="12" x2="12" y2="21"/><path d="M20.39 18.39A5 5 0 0018 9h-1.26A8 8 0 103 16.3"/></svg>
                        </div>
                        <div style={{ fontSize:14,fontWeight:700,color:"#4f8ef7",marginBottom:4 }}>{t.uploadCta}</div>
                        <div style={{ fontSize:11,color:"rgba(255,255,255,.3)" }}>{t.uploadSub2}</div>
                      </div>
                    ) : (
                      <div style={{ position:"relative",borderRadius:12,overflow:"hidden",background:"#000",border:"1px solid rgba(255,255,255,.08)" }}>
                        <img src={image} alt="xray" style={{ width:"100%",maxHeight:230,objectFit:"contain",display:"block" }} />
                        {loading && (
                          <div style={{ position:"absolute",inset:0,overflow:"hidden",pointerEvents:"none" }}>
                            <div style={{ position:"absolute",left:0,right:0,height:3,background:"linear-gradient(90deg,transparent,#4f8ef7,transparent)",animation:"scan 2s linear infinite",boxShadow:"0 0 12px #4f8ef7" }}/>
                            <div style={{ position:"absolute",inset:0,background:"rgba(79,142,247,.05)" }}/>
                          </div>
                        )}
                        <div style={{ position:"absolute",top:8,left:8 }}>
                          <span style={{ fontSize:10,fontWeight:700,padding:"3px 9px",borderRadius:999,background:"rgba(0,0,0,.7)",border:"1px solid rgba(255,255,255,.15)",color:"#93c5fd" }}>
                            {mime.split("/")[1].toUpperCase()}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Pipeline */}
                <div style={{ borderRadius:18,background:"rgba(255,255,255,.03)",border:"1px solid rgba(255,255,255,.07)",backdropFilter:"blur(12px)",padding:"14px 18px",boxShadow:"0 8px 32px rgba(0,0,0,.3)" }}>
                  <div style={{ fontSize:10,fontWeight:800,color:"rgba(255,255,255,.35)",textTransform:"uppercase",letterSpacing:"0.14em",marginBottom:13 }}>{t.pipeline}</div>
                  {t.pipeSteps.map(([name, desc], i) => {
                    const done = (i < 2 && !!image) || (i >= 2 && !!result);
                    return (
                      <div key={i} style={{ display:"flex",gap:11,marginBottom:9,alignItems:"center" }}>
                        <div style={{ width:26,height:26,borderRadius:7,flexShrink:0,
                          background: done?"rgba(79,142,247,.2)":"rgba(255,255,255,.04)",
                          border:`1px solid ${done?"rgba(79,142,247,.4)":"rgba(255,255,255,.1)"}`,
                          display:"flex",alignItems:"center",justifyContent:"center",
                          fontSize:10,fontWeight:800,color:done?"#4f8ef7":"rgba(255,255,255,.2)",fontFamily:"monospace",
                          transition:"all .4s",boxShadow:done?"0 0 10px rgba(79,142,247,.2)":"none" }}>
                          {done ? "✓" : `0${i+1}`}
                        </div>
                        <div>
                          <div style={{ fontSize:12,fontWeight:600,color:done?"#e2e8f0":"rgba(255,255,255,.35)",transition:"color .4s" }}>{name}</div>
                          <div style={{ fontSize:10,color:"rgba(255,255,255,.2)",fontFamily:"monospace",marginTop:1 }}>{desc}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Analyze button */}
                <button onClick={analyze} disabled={!image || loading} style={{
                  width:"100%",padding:"15px",borderRadius:14,
                  background: image&&!loading?"linear-gradient(135deg,#1d4ed8,#4f8ef7)":"rgba(255,255,255,.04)",
                  border:`1px solid ${image&&!loading?"rgba(79,142,247,.5)":"rgba(255,255,255,.08)"}`,
                  color: image&&!loading?"#fff":"rgba(255,255,255,.2)",
                  fontWeight:800,fontSize:15,cursor:image&&!loading?"pointer":"not-allowed",
                  fontFamily:"'Inter',sans-serif",letterSpacing:"-0.01em",
                  boxShadow: image&&!loading?"0 8px 30px rgba(79,142,247,.35),inset 0 1px 0 rgba(255,255,255,.15)":"none",
                  transition:"all .25s",display:"flex",alignItems:"center",justifyContent:"center",gap:10,
                }}>
                  {loading ? (
                    <><div style={{ width:16,height:16,border:"2px solid rgba(255,255,255,.2)",borderTop:"2px solid #fff",borderRadius:"50%",animation:"spin .7s linear infinite" }}/><span style={{ color:"#4f8ef7" }}>{t.steps[stepIdx]}</span></>
                  ) : (
                    <><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polygon points="5,3 19,12 5,21 5,3"/></svg>{t.analyzeBtn}</>
                  )}
                </button>
              </div>

              {/* Right panel */}
              <div style={{ display:"flex",flexDirection:"column",gap:16 }}>
                {!result && !loading && !err && (
                  <div style={{ borderRadius:20,background:"rgba(255,255,255,.02)",border:"1px solid rgba(255,255,255,.07)",backdropFilter:"blur(12px)",padding:"80px 32px",textAlign:"center",boxShadow:"0 8px 32px rgba(0,0,0,.3)" }}>
                    <div style={{ width:64,height:64,borderRadius:18,background:"rgba(79,142,247,.1)",border:"1px solid rgba(79,142,247,.2)",display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 16px",animation:"float 3s ease-in-out infinite" }}>
                      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="rgba(79,142,247,.6)" strokeWidth="1.5" strokeLinecap="round"><path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
                    </div>
                    <div style={{ fontSize:18,fontWeight:700,color:"rgba(255,255,255,.25)",marginBottom:8 }}>{t.noReport}</div>
                    <div style={{ fontSize:13,color:"rgba(255,255,255,.18)",maxWidth:220,margin:"0 auto",lineHeight:1.6 }}>{t.noReportSub}</div>
                  </div>
                )}
                {loading && (
                  <div style={{ borderRadius:20,background:"rgba(255,255,255,.02)",border:"1px solid rgba(79,142,247,.15)",padding:"80px 32px",textAlign:"center",boxShadow:"0 8px 32px rgba(0,0,0,.3)" }}>
                    <div style={{ position:"relative",width:68,height:68,margin:"0 auto 20px" }}>
                      <div style={{ position:"absolute",inset:0,border:"2px solid rgba(79,142,247,.15)",borderRadius:"50%" }}/>
                      <div style={{ position:"absolute",inset:0,border:"3px solid transparent",borderTop:"3px solid #4f8ef7",borderRadius:"50%",animation:"spin 1s linear infinite",boxShadow:"0 0 16px rgba(79,142,247,.4)" }}/>
                      <div style={{ position:"absolute",inset:10,border:"2px solid transparent",borderTop:"2px solid rgba(79,142,247,.5)",borderRadius:"50%",animation:"spin .65s linear infinite reverse" }}/>
                      <div style={{ position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center",fontSize:20 }}>🦴</div>
                    </div>
                    <div style={{ fontSize:14,fontWeight:700,color:"#4f8ef7",marginBottom:6,animation:"pulse 1.5s infinite" }}>{t.steps[stepIdx]}</div>
                    <div style={{ fontSize:12,color:"rgba(255,255,255,.3)" }}>{t.analyzing}</div>
                    <div style={{ height:3,background:"rgba(255,255,255,.05)",borderRadius:999,marginTop:20,overflow:"hidden",position:"relative" }}>
                      <div style={{ position:"absolute",inset:0,background:"linear-gradient(90deg,transparent,#4f8ef7,transparent)",animation:"shimmer 1.6s linear infinite" }}/>
                    </div>
                  </div>
                )}
                {err && !loading && (
                  <div style={{ borderRadius:16,background:"rgba(239,68,68,.08)",border:"1px solid rgba(239,68,68,.2)",padding:20 }}>
                    <div style={{ fontSize:13,fontWeight:700,color:"#ef4444",marginBottom:6 }}>{t.failed}</div>
                    <div style={{ fontSize:12,color:"rgba(239,68,68,.7)",lineHeight:1.5,wordBreak:"break-word" }}>{err}</div>
                  </div>
                )}
                {result && !loading && (
                  <div style={{ animation:"fadeUp .5s ease",display:"flex",flexDirection:"column",gap:14 }}>
                    {/* Diagnosis banner */}
                    <div style={{ borderRadius:20,padding:"22px 26px",
                      background: isOA?"linear-gradient(135deg,rgba(239,68,68,.12),rgba(220,38,38,.06))":"linear-gradient(135deg,rgba(16,185,129,.12),rgba(5,150,105,.06))",
                      border:`1px solid ${isOA?"rgba(239,68,68,.25)":"rgba(16,185,129,.25)"}`,
                      backdropFilter:"blur(12px)",
                      display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:14 }}>
                      <div style={{ display:"flex",alignItems:"center",gap:16 }}>
                        <div style={{ width:54,height:54,borderRadius:16,
                          background: isOA?"rgba(239,68,68,.2)":"rgba(16,185,129,.2)",
                          display:"flex",alignItems:"center",justifyContent:"center",fontSize:26,flexShrink:0 }}>
                          {isOA ? "⚠️" : "✅"}
                        </div>
                        <div>
                          <div style={{ fontSize:22,fontWeight:900,letterSpacing:"-0.03em",color: isOA?"#fca5a5":"#6ee7b7" }}>{result.diagnosis}</div>
                          <div style={{ fontSize:11,color:"rgba(255,255,255,.4)",marginTop:3,fontFamily:"monospace" }}>
                            P(OA)={result.prob_oa?.toFixed(4)} · thr={result.threshold} · 🔧 Backend
                          </div>
                        </div>
                      </div>
                      {result.urgency && (
                        <div style={{ padding:"8px 18px",borderRadius:999,fontSize:13,fontWeight:800,
                          background:`${urgColor[result.urgency]}22`,border:`1px solid ${urgColor[result.urgency]}55`,
                          color: urgColor[result.urgency] }}>
                          {result.urgency==="Urgent"?"🔴":result.urgency==="Soon"?"🟡":"🟢"} {t.urgLabels[result.urgency]} {t.followup}
                        </div>
                      )}
                    </div>

                    {/* Heatmap + Gauges */}
                    <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:14 }}>
                      <div style={{ borderRadius:18,background:"rgba(255,255,255,.03)",border:"1px solid rgba(255,255,255,.08)",overflow:"hidden",backdropFilter:"blur(12px)" }}>
                        <div style={{ padding:"12px 14px 10px",borderBottom:"1px solid rgba(255,255,255,.06)",display:"flex",alignItems:"center",justifyContent:"space-between" }}>
                          <div style={{ display:"flex",alignItems:"center",gap:8 }}>
                            <div style={{ width:28,height:28,borderRadius:7,background:"linear-gradient(135deg,rgba(255,60,0,.3),rgba(255,200,0,.2))",border:"1px solid rgba(255,120,0,.3)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:13 }}>🌡️</div>
                            <div>
                              <div style={{ fontSize:12,fontWeight:700 }}>{t.heatmapTitle}</div>
                              <div style={{ fontSize:9,color:"rgba(255,255,255,.3)",fontFamily:"monospace" }}>Grad-CAM · Jet colormap</div>
                            </div>
                          </div>
                          <button onClick={() => setHeatVisible(v => !v)} style={{ padding:"4px 12px",borderRadius:8,fontSize:10,fontWeight:700,cursor:"pointer",
                            background: heatVisible?"linear-gradient(135deg,rgba(239,68,68,.3),rgba(255,120,0,.2))":"rgba(255,255,255,.06)",
                            border:`1px solid ${heatVisible?"rgba(239,68,68,.4)":"rgba(255,255,255,.1)"}`,
                            color: heatVisible?"#fca5a5":"rgba(255,255,255,.35)" }}>
                            {heatVisible ? "🔴 ON" : "OFF"}
                          </button>
                        </div>
                        <div style={{ background:"#000",position:"relative" }}>
                          <GradCAMHeatmap imageData={image} hotspots={result.hotspots||[]} visible={heatVisible} />
                        </div>
                        {heatVisible && result.hotspots?.length > 0 && (
                          <div style={{ padding:"10px 14px",borderTop:"1px solid rgba(255,255,255,.05)" }}>
                            <div style={{ fontSize:9,fontWeight:800,color:"rgba(255,255,255,.25)",textTransform:"uppercase",letterSpacing:"0.12em",marginBottom:8 }}>Detected Regions</div>
                            {result.hotspots.slice(0,4).map((h,i) => (
                              <div key={i} style={{ display:"flex",alignItems:"center",gap:8,marginBottom:6 }}>
                                <div style={{ width:28,height:6,borderRadius:3,flexShrink:0,
                                  background:`linear-gradient(90deg,#0000aa,#00aaff ${Math.round(h.intensity*30)}%,#00ff88 ${Math.round(h.intensity*55)}%,#ffee00 ${Math.round(h.intensity*80)}%,#ff4400 ${Math.round(h.intensity*100)}%)`,
                                  opacity:0.8+h.intensity*0.2 }}/>
                                <span style={{ fontSize:11,color:"rgba(255,255,255,.55)",flex:1 }}>{h.label||`Region ${i+1}`}</span>
                                <span style={{ fontSize:10,color:"#ff3300",fontFamily:"monospace",fontWeight:700 }}>{Math.round(h.intensity*100)}%</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      <div style={{ borderRadius:18,background:"rgba(255,255,255,.03)",border:"1px solid rgba(255,255,255,.08)",backdropFilter:"blur(12px)",padding:"16px 12px" }}>
                        <div style={{ fontSize:10,fontWeight:800,color:"rgba(255,255,255,.3)",textTransform:"uppercase",letterSpacing:"0.14em",marginBottom:16 }}>{t.modelOut}</div>
                        <div style={{ display:"flex",justifyContent:"space-around",marginBottom:18 }}>
                          <ArcGauge value={result.normal_pct||0} color="#10b981" label={t.normalL} />
                          <ArcGauge value={result.oa_pct||0}     color="#ef4444" label={t.oaL} />
                          <ArcGauge value={result.confidence||0} color="#4f8ef7" label={t.confL} />
                        </div>
                        <div style={{ borderTop:"1px solid rgba(255,255,255,.06)",paddingTop:14 }}>
                          {[[t.normalG,result.normal_pct||0,"#10b981"],[t.oaG,result.oa_pct||0,"#ef4444"]].map(([label,val,c]) => (
                            <div key={label} style={{ marginBottom:9 }}>
                              <div style={{ display:"flex",justifyContent:"space-between",marginBottom:5 }}>
                                <span style={{ fontSize:11,color:"rgba(255,255,255,.45)",fontWeight:500 }}>{label}</span>
                                <span style={{ fontSize:11,fontWeight:700,color:c,fontFamily:"monospace" }}>{val.toFixed(1)}%</span>
                              </div>
                              <div style={{ height:5,background:"rgba(255,255,255,.06)",borderRadius:999,overflow:"hidden" }}>
                                <div style={{ height:"100%",width:`${val}%`,background:c,borderRadius:999,transition:"width 1.3s cubic-bezier(.4,0,.2,1)" }}/>
                              </div>
                            </div>
                          ))}
                        </div>
                        <div style={{ borderTop:"1px solid rgba(255,255,255,.06)",paddingTop:12,marginTop:4 }}>
                          {[[t.sev,result.severity||"—"],[t.temp,`T=${result.T_optimal?.toFixed(3)}`],[t.thr,result.threshold],[t.tta,"3 passes"]].map(([k,v]) => (
                            <div key={k} style={{ display:"flex",justifyContent:"space-between",marginBottom:6 }}>
                              <span style={{ fontSize:11,color:"rgba(255,255,255,.3)" }}>{k}</span>
                              <span style={{ fontSize:11,fontWeight:600,fontFamily:"monospace",color:"rgba(255,255,255,.65)" }}>{v}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Findings + Recs */}
                    <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:14 }}>
                      {[
                        { title:t.findings, icon:"📋", items:result.findings||[], c:"#4f8ef7", bg:"rgba(79,142,247,.1)", border:"rgba(79,142,247,.25)" },
                        { title:t.recs,     icon:"📊", items:result.recommendations||[], c:isOA?"#ef4444":"#10b981", bg:isOA?"rgba(239,68,68,.1)":"rgba(16,185,129,.1)", border:isOA?"rgba(239,68,68,.25)":"rgba(16,185,129,.25)" },
                      ].map(({ title,icon,items,c,bg,border }) => (
                        <div key={title} style={{ borderRadius:16,background:"rgba(255,255,255,.03)",border:"1px solid rgba(255,255,255,.08)",backdropFilter:"blur(12px)",padding:"14px 16px" }}>
                          <div style={{ fontSize:11,fontWeight:800,color:"rgba(255,255,255,.35)",textTransform:"uppercase",letterSpacing:"0.12em",marginBottom:12 }}>{icon} {title}</div>
                          {items.map((item,i) => (
                            <div key={i} style={{ display:"flex",gap:9,marginBottom:8,alignItems:"flex-start" }}>
                              <div style={{ width:20,height:20,borderRadius:6,background:bg,border:`1px solid ${border}`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,marginTop:1 }}>
                                <div style={{ width:6,height:6,borderRadius:"50%",background:c }}/>
                              </div>
                              <span style={{ fontSize:12,color:"rgba(255,255,255,.6)",lineHeight:1.55 }}>{item}</span>
                            </div>
                          ))}
                        </div>
                      ))}
                    </div>

                    {result.kl_note && (
                      <div style={{ borderRadius:12,background:"rgba(255,255,255,.03)",border:"1px solid rgba(255,255,255,.07)",padding:"11px 14px",display:"flex",gap:9 }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,.3)" strokeWidth="2" strokeLinecap="round" style={{ flexShrink:0,marginTop:1 }}><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                        <span style={{ fontSize:11,color:"rgba(255,255,255,.35)",lineHeight:1.55 }}>{result.kl_note}</span>
                      </div>
                    )}
                    <div style={{ borderRadius:12,background:"rgba(245,158,11,.06)",border:"1px solid rgba(245,158,11,.15)",padding:"11px 14px",display:"flex",gap:9,alignItems:"flex-start" }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" style={{ flexShrink:0,marginTop:1 }}><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                      <span style={{ fontSize:11,color:"rgba(245,158,11,.7)",lineHeight:1.55 }}>{t.disclaimer}</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </>
      )}

      {/* ════════════════════════════════════════════════════════
          MODULE 2 — IMU REHABILITATION
      ════════════════════════════════════════════════════════ */}
      {module === "imu" && (
        <>
          {/* Hero */}
          <div style={{ position:"relative",overflow:"hidden",padding:"48px 28px 40px",
            background:"linear-gradient(160deg,rgba(5,20,15,1) 0%,rgba(5,10,20,1) 100%)",
            borderBottom:"1px solid rgba(16,185,129,.1)" }}>
            <div style={{ maxWidth:1280,margin:"0 auto",display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:24 }}>
              <div style={{ maxWidth:540 }}>
                <div style={{ display:"inline-flex",alignItems:"center",gap:8,padding:"5px 14px",borderRadius:999,
                  background:"rgba(16,185,129,.1)",border:"1px solid rgba(16,185,129,.2)",marginBottom:18 }}>
                  <span style={{ width:6,height:6,borderRadius:"50%",background:"#10b981",display:"inline-block",animation:"pulse 2s infinite" }}/>
                  <span style={{ fontSize:11,color:"#6ee7b7",fontWeight:600,letterSpacing:"0.08em" }}>{t.imuHeroLabel}</span>
                </div>
                <h1 style={{ fontSize:"clamp(30px,4vw,52px)",fontWeight:900,lineHeight:1.05,letterSpacing:"-0.04em",marginBottom:14 }}>
                  <span style={{ background:"linear-gradient(135deg,#fff 30%,#6ee7b7)",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent" }}>{t.imuHeroTitle}</span><br/>
                  <span style={{ fontSize:"0.7em",fontWeight:300,fontStyle:"italic",color:"rgba(255,255,255,.5)" }}>{t.imuHeroItalic}</span>
                </h1>
                <p style={{ color:"rgba(255,255,255,.45)",fontSize:14,lineHeight:1.7,maxWidth:440 }}>{t.imuHeroDesc}</p>
              </div>
              <div style={{ display:"flex",gap:14 }}>
                {[{ v:"94.6%",l:t.imuLstmAcc,c:"#10b981" },{ v:"94.8%",l:t.imuLstmF1,c:"#4f8ef7" },{ v:"8",l:t.imuActivities,c:"#f59e0b" }].map(({ v,l,c }) => (
                  <div key={l} style={{ textAlign:"center",padding:"18px 22px",borderRadius:16,
                    background:"rgba(255,255,255,.04)",border:"1px solid rgba(255,255,255,.08)",
                    backdropFilter:"blur(12px)",animation:"float 4s ease-in-out infinite",
                    boxShadow:"0 8px 32px rgba(0,0,0,.3),inset 0 1px 0 rgba(255,255,255,.08)" }}>
                    <div style={{ fontSize:26,fontWeight:900,color:c,letterSpacing:"-0.04em",textShadow:`0 0 20px ${c}66` }}>{v}</div>
                    <div style={{ fontSize:10,color:"rgba(255,255,255,.4)",marginTop:4,letterSpacing:"0.1em",textTransform:"uppercase" }}>{l}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* IMU Content */}
          <div style={{ maxWidth:1280,margin:"0 auto",padding:"28px 28px 80px",position:"relative",zIndex:1 }}>
            <div style={{ display:"grid",gridTemplateColumns:"380px 1fr",gap:20,alignItems:"start" }}>

              {/* Left panel */}
              <div style={{ display:"flex",flexDirection:"column",gap:14 }}>

                {/* IMU model status warning */}
                {!imuAvail && connStatus === "ok" && (
                  <div style={{ borderRadius:14,background:"rgba(245,158,11,.08)",border:"1px solid rgba(245,158,11,.2)",padding:"12px 14px",display:"flex",gap:9,alignItems:"flex-start" }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" style={{ flexShrink:0,marginTop:1 }}><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                    <span style={{ fontSize:11,color:"rgba(245,158,11,.8)",lineHeight:1.55 }}>{t.imuModelUnavail}</span>
                  </div>
                )}

                {/* Sensor placement */}
                <div style={{ borderRadius:18,overflow:"hidden",background:"rgba(255,255,255,.03)",border:"1px solid rgba(16,185,129,.15)",backdropFilter:"blur(12px)",boxShadow:"0 8px 32px rgba(0,0,0,.3)" }}>
                  <div style={{ padding:"14px 18px 11px",borderBottom:"1px solid rgba(255,255,255,.06)",display:"flex",alignItems:"center",gap:10 }}>
                    <div style={{ width:30,height:30,borderRadius:8,background:"rgba(16,185,129,.15)",display:"flex",alignItems:"center",justifyContent:"center" }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2.2" strokeLinecap="round"><circle cx="12" cy="12" r="3"/><path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83"/></svg>
                    </div>
                    <div>
                      <div style={{ fontSize:13,fontWeight:700 }}>{t.imuSensorLocLabel}</div>
                      <div style={{ fontSize:10,color:"rgba(255,255,255,.35)" }}>6 body placements</div>
                    </div>
                  </div>
                  <div style={{ padding:"12px 14px",display:"flex",flexDirection:"column",gap:6 }}>
                    {Object.entries(t.imuLocations).map(([key, label]) => (
                      <button key={key} onClick={() => setImuLocation(key)} style={{
                        width:"100%",padding:"9px 12px",borderRadius:10,fontSize:12,fontWeight:600,
                        cursor:"pointer",textAlign:"left",transition:"all .15s",
                        background: imuLocation===key?"rgba(16,185,129,.2)":"rgba(255,255,255,.03)",
                        border:`1px solid ${imuLocation===key?"rgba(16,185,129,.4)":"rgba(255,255,255,.08)"}`,
                        color: imuLocation===key?"#6ee7b7":"rgba(255,255,255,.5)",
                        boxShadow: imuLocation===key?"0 0 10px rgba(16,185,129,.15)":"none",
                      }}>
                        {imuLocation===key ? "● " : "○ "}{label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* CSV upload */}
                <div style={{ borderRadius:18,overflow:"hidden",background:"rgba(255,255,255,.03)",border:"1px solid rgba(255,255,255,.08)",backdropFilter:"blur(12px)",boxShadow:"0 8px 32px rgba(0,0,0,.3)" }}>
                  <div style={{ padding:"14px 18px 11px",borderBottom:"1px solid rgba(255,255,255,.06)",display:"flex",alignItems:"center",justifyContent:"space-between" }}>
                    <div style={{ display:"flex",alignItems:"center",gap:10 }}>
                      <div style={{ width:30,height:30,borderRadius:8,background:"rgba(16,185,129,.15)",display:"flex",alignItems:"center",justifyContent:"center" }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2" strokeLinecap="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14,2 14,8 20,8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10,9 9,9 8,9"/></svg>
                      </div>
                      <div>
                        <div style={{ fontSize:13,fontWeight:700 }}>{t.imuUploadTitle}</div>
                        <div style={{ fontSize:10,color:"rgba(255,255,255,.35)" }}>{t.imuUploadSub}</div>
                      </div>
                    </div>
                    {imuFile && (
                      <button onClick={() => { setImuFile(null); setImuResult(null); setImuErr(null); }}
                        style={{ padding:"4px 12px",borderRadius:7,fontSize:11,fontWeight:600,cursor:"pointer",background:"rgba(239,68,68,.15)",border:"1px solid rgba(239,68,68,.25)",color:"#ef4444" }}>
                        {t.imuRemove}
                      </button>
                    )}
                  </div>
                  <div style={{ padding:14 }}>
                    {!imuFile ? (
                      <div onClick={() => imuFileRef.current.click()}
                        onDragOver={(e) => { e.preventDefault(); setImuDrag(true); }}
                        onDragLeave={() => setImuDrag(false)}
                        onDrop={(e) => { e.preventDefault(); setImuDrag(false); handleImuFile(e.dataTransfer.files[0]); }}
                        style={{ border:`2px dashed ${imuDrag?"#10b981":"rgba(16,185,129,.2)"}`,borderRadius:14,
                          padding:"40px 20px",textAlign:"center",cursor:"pointer",
                          background: imuDrag?"rgba(16,185,129,.08)":"rgba(16,185,129,.02)",transition:"all .2s" }}>
                        <input ref={imuFileRef} type="file" accept=".csv" style={{ display:"none" }} onChange={(e) => handleImuFile(e.target.files[0])} />
                        <div style={{ width:52,height:52,borderRadius:14,background:"rgba(16,185,129,.15)",border:"1px solid rgba(16,185,129,.25)",display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 14px",animation:"float 3s ease-in-out infinite" }}>
                          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2" strokeLinecap="round"><polyline points="16,16 12,12 8,16"/><line x1="12" y1="12" x2="12" y2="21"/><path d="M20.39 18.39A5 5 0 0018 9h-1.26A8 8 0 103 16.3"/></svg>
                        </div>
                        <div style={{ fontSize:14,fontWeight:700,color:"#10b981",marginBottom:4 }}>{t.imuUploadCta}</div>
                        <div style={{ fontSize:11,color:"rgba(255,255,255,.3)" }}>{t.imuUploadSub2}</div>
                      </div>
                    ) : (
                      <div style={{ borderRadius:12,padding:"14px 16px",background:"rgba(16,185,129,.08)",border:"1px solid rgba(16,185,129,.2)" }}>
                        <div style={{ display:"flex",alignItems:"center",gap:10 }}>
                          <div style={{ width:36,height:36,borderRadius:10,background:"rgba(16,185,129,.2)",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0 }}>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2.2" strokeLinecap="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14,2 14,8 20,8"/></svg>
                          </div>
                          <div>
                            <div style={{ fontSize:12,fontWeight:700,color:"#6ee7b7" }}>{imuFile.name}</div>
                            <div style={{ fontSize:10,color:"rgba(255,255,255,.35)",marginTop:2 }}>{(imuFile.size/1024).toFixed(1)} KB · CSV</div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Pipeline */}
                <div style={{ borderRadius:18,background:"rgba(255,255,255,.03)",border:"1px solid rgba(255,255,255,.07)",backdropFilter:"blur(12px)",padding:"14px 18px" }}>
                  <div style={{ fontSize:10,fontWeight:800,color:"rgba(255,255,255,.35)",textTransform:"uppercase",letterSpacing:"0.14em",marginBottom:13 }}>{t.imuPipeline}</div>
                  {t.imuPipeSteps.map(([name, desc], i) => {
                    const done = (i < 1 && !!imuFile) || (i >= 1 && !!imuResult);
                    return (
                      <div key={i} style={{ display:"flex",gap:11,marginBottom:9,alignItems:"center" }}>
                        <div style={{ width:26,height:26,borderRadius:7,flexShrink:0,
                          background: done?"rgba(16,185,129,.2)":"rgba(255,255,255,.04)",
                          border:`1px solid ${done?"rgba(16,185,129,.4)":"rgba(255,255,255,.1)"}`,
                          display:"flex",alignItems:"center",justifyContent:"center",
                          fontSize:10,fontWeight:800,color:done?"#10b981":"rgba(255,255,255,.2)",fontFamily:"monospace",
                          transition:"all .4s" }}>
                          {done ? "✓" : `0${i+1}`}
                        </div>
                        <div>
                          <div style={{ fontSize:12,fontWeight:600,color:done?"#e2e8f0":"rgba(255,255,255,.35)",transition:"color .4s" }}>{name}</div>
                          <div style={{ fontSize:10,color:"rgba(255,255,255,.2)",fontFamily:"monospace",marginTop:1 }}>{desc}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Analyze button */}
                <button onClick={analyzeImu} disabled={!imuFile || imuLoading} style={{
                  width:"100%",padding:"15px",borderRadius:14,
                  background: imuFile&&!imuLoading?"linear-gradient(135deg,#065f46,#10b981)":"rgba(255,255,255,.04)",
                  border:`1px solid ${imuFile&&!imuLoading?"rgba(16,185,129,.5)":"rgba(255,255,255,.08)"}`,
                  color: imuFile&&!imuLoading?"#fff":"rgba(255,255,255,.2)",
                  fontWeight:800,fontSize:15,cursor:imuFile&&!imuLoading?"pointer":"not-allowed",
                  fontFamily:"'Inter',sans-serif",letterSpacing:"-0.01em",
                  boxShadow: imuFile&&!imuLoading?"0 8px 30px rgba(16,185,129,.3),inset 0 1px 0 rgba(255,255,255,.15)":"none",
                  transition:"all .25s",display:"flex",alignItems:"center",justifyContent:"center",gap:10,
                }}>
                  {imuLoading ? (
                    <><div style={{ width:16,height:16,border:"2px solid rgba(255,255,255,.2)",borderTop:"2px solid #fff",borderRadius:"50%",animation:"spin .7s linear infinite" }}/><span style={{ color:"#6ee7b7" }}>{t.imuSteps[imuStepIdx]}</span></>
                  ) : (
                    <><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polygon points="5,3 19,12 5,21 5,3"/></svg>{t.imuAnalyzeBtn}</>
                  )}
                </button>
              </div>

              {/* Right panel */}
              <div style={{ display:"flex",flexDirection:"column",gap:16 }}>
                {!imuResult && !imuLoading && !imuErr && (
                  <div style={{ borderRadius:20,background:"rgba(255,255,255,.02)",border:"1px solid rgba(255,255,255,.07)",backdropFilter:"blur(12px)",padding:"80px 32px",textAlign:"center" }}>
                    <div style={{ width:64,height:64,borderRadius:18,background:"rgba(16,185,129,.1)",border:"1px solid rgba(16,185,129,.2)",display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 16px",animation:"float 3s ease-in-out infinite" }}>
                      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="rgba(16,185,129,.6)" strokeWidth="1.5" strokeLinecap="round"><path d="M9 19V6l12-3v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
                    </div>
                    <div style={{ fontSize:18,fontWeight:700,color:"rgba(255,255,255,.25)",marginBottom:8 }}>{t.imuNoReport}</div>
                    <div style={{ fontSize:13,color:"rgba(255,255,255,.18)",maxWidth:260,margin:"0 auto",lineHeight:1.6 }}>{t.imuNoReportSub}</div>
                  </div>
                )}

                {imuLoading && (
                  <div style={{ borderRadius:20,background:"rgba(255,255,255,.02)",border:"1px solid rgba(16,185,129,.15)",padding:"80px 32px",textAlign:"center" }}>
                    <div style={{ position:"relative",width:68,height:68,margin:"0 auto 20px" }}>
                      <div style={{ position:"absolute",inset:0,border:"2px solid rgba(16,185,129,.15)",borderRadius:"50%" }}/>
                      <div style={{ position:"absolute",inset:0,border:"3px solid transparent",borderTop:"3px solid #10b981",borderRadius:"50%",animation:"spin 1s linear infinite",boxShadow:"0 0 16px rgba(16,185,129,.4)" }}/>
                      <div style={{ position:"absolute",inset:10,border:"2px solid transparent",borderTop:"2px solid rgba(16,185,129,.5)",borderRadius:"50%",animation:"spin .65s linear infinite reverse" }}/>
                      <div style={{ position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center",fontSize:20 }}>🦵</div>
                    </div>
                    <div style={{ fontSize:14,fontWeight:700,color:"#10b981",marginBottom:6,animation:"pulse 1.5s infinite" }}>{t.imuSteps[imuStepIdx]}</div>
                    <div style={{ fontSize:12,color:"rgba(255,255,255,.3)" }}>{t.imuAnalyzing}</div>
                    <div style={{ height:3,background:"rgba(255,255,255,.05)",borderRadius:999,marginTop:20,overflow:"hidden",position:"relative" }}>
                      <div style={{ position:"absolute",inset:0,background:"linear-gradient(90deg,transparent,#10b981,transparent)",animation:"shimmer 1.6s linear infinite" }}/>
                    </div>
                  </div>
                )}

                {imuErr && !imuLoading && (
                  <div style={{ borderRadius:16,background:"rgba(239,68,68,.08)",border:"1px solid rgba(239,68,68,.2)",padding:20 }}>
                    <div style={{ fontSize:13,fontWeight:700,color:"#ef4444",marginBottom:6 }}>{t.imuFailed}</div>
                    <div style={{ fontSize:12,color:"rgba(239,68,68,.7)",lineHeight:1.5,wordBreak:"break-word" }}>{imuErr}</div>
                  </div>
                )}

                {imuResult && !imuLoading && (() => {
                  const ss   = imuResult.session_summary;
                  const sc   = imuResult.overall_score;
                  const sCol = scoreColor(sc);
                  const breakdown = Object.entries(imuResult.activity_breakdown || {});
                  return (
                    <div style={{ animation:"fadeUp .5s ease",display:"flex",flexDirection:"column",gap:14 }}>

                      {/* Overall score + dominant activity */}
                      <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:14 }}>
                        <div style={{ borderRadius:20,padding:"24px",
                          background:`linear-gradient(135deg,${sCol}18,${sCol}08)`,
                          border:`1px solid ${sCol}30`,backdropFilter:"blur(12px)",textAlign:"center" }}>
                          <div style={{ fontSize:10,fontWeight:800,color:"rgba(255,255,255,.35)",textTransform:"uppercase",letterSpacing:"0.14em",marginBottom:16 }}>{t.imuOverallScore}</div>
                          <ArcGauge value={sc} size={110} color={sCol} />
                          <div style={{ marginTop:12,fontSize:12,color:"rgba(255,255,255,.5)",lineHeight:1.5 }}>
                            {imuResult.feedback?.[0]?.text || (sc >= 85 ? "Excellent movement quality." : sc >= 65 ? "Good progress." : sc >= 45 ? "Keep working on your range." : "Consult your physiotherapist.")}
                          </div>
                        </div>

                        <div style={{ borderRadius:20,background:"rgba(255,255,255,.03)",border:"1px solid rgba(255,255,255,.08)",backdropFilter:"blur(12px)",padding:"22px 20px" }}>
                          <div style={{ fontSize:10,fontWeight:800,color:"rgba(255,255,255,.35)",textTransform:"uppercase",letterSpacing:"0.14em",marginBottom:14 }}>{t.imuDominant}</div>
                          <div style={{ fontSize:22,fontWeight:900,color:"#6ee7b7",letterSpacing:"-0.02em",marginBottom:8 }}>
                            {imuResult.dominant_activity_label}
                          </div>
                          <div style={{ fontSize:10,fontWeight:800,color:"rgba(255,255,255,.35)",textTransform:"uppercase",letterSpacing:"0.14em",marginBottom:10,marginTop:16 }}>{t.imuSummary}</div>
                          {[
                            [t.imuSamples,    ss.total_samples?.toLocaleString()],
                            [t.imuRealCh,     `${ss.n_real_channels} / 38`],
                            [t.imuSimCh,      ss.n_simulated_channels],
                          ].map(([k,v]) => (
                            <div key={k} style={{ display:"flex",justifyContent:"space-between",marginBottom:7 }}>
                              <span style={{ fontSize:11,color:"rgba(255,255,255,.35)" }}>{k}</span>
                              <span style={{ fontSize:11,fontWeight:700,fontFamily:"monospace",color:"rgba(255,255,255,.7)" }}>{v}</span>
                            </div>
                          ))}
                          <div style={{ marginTop:10,padding:"8px 10px",borderRadius:9,background:"rgba(16,185,129,.08)",border:"1px solid rgba(16,185,129,.15)",fontSize:10,color:"rgba(16,185,129,.7)",lineHeight:1.4 }}>
                            📡 {ss.n_real_channels} real · {ss.n_simulated_channels} simulated · {ss.sensor_location?.replace(/_/g," ")}
                          </div>
                        </div>
                      </div>

                      {/* Activity breakdown */}
                      {breakdown.length > 0 && (
                        <div style={{ borderRadius:18,background:"rgba(255,255,255,.03)",border:"1px solid rgba(255,255,255,.08)",backdropFilter:"blur(12px)",padding:"16px 18px" }}>
                          <div style={{ fontSize:10,fontWeight:800,color:"rgba(255,255,255,.35)",textTransform:"uppercase",letterSpacing:"0.14em",marginBottom:14 }}>{t.imuBreakdown}</div>
                          <div style={{ display:"flex",flexDirection:"column",gap:8 }}>
                            {breakdown.map(([act, info]) => (
                              <div key={act}>
                                <div style={{ display:"flex",justifyContent:"space-between",marginBottom:4 }}>
                                  <span style={{ fontSize:12,color:"rgba(255,255,255,.6)",fontWeight:500 }}>{info.label}</span>
                                  <span style={{ fontSize:11,fontFamily:"monospace",color:"#6ee7b7",fontWeight:700 }}>{info.pct}%</span>
                                </div>
                                <div style={{ height:5,background:"rgba(255,255,255,.06)",borderRadius:999,overflow:"hidden" }}>
                                  <div style={{ height:"100%",width:`${info.pct}%`,background:"#10b981",borderRadius:999,
                                    transition:"width 1.3s cubic-bezier(.4,0,.2,1)",opacity:0.7+info.pct/333 }}/>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* ROM scores per activity */}
                      {imuResult.rom_scores?.length > 0 && (
                        <div style={{ borderRadius:18,background:"rgba(255,255,255,.03)",border:"1px solid rgba(255,255,255,.08)",backdropFilter:"blur(12px)",padding:"16px 18px" }}>
                          <div style={{ fontSize:10,fontWeight:800,color:"rgba(255,255,255,.35)",textTransform:"uppercase",letterSpacing:"0.14em",marginBottom:14 }}>{t.imuROMScores}</div>
                          <div style={{ display:"flex",flexDirection:"column",gap:14 }}>
                            {imuResult.rom_scores.map((row) => {
                              const c = scoreColor(row.score_pct);
                              return (
                                <div key={row.activity} style={{ borderRadius:14,background:"rgba(255,255,255,.02)",border:"1px solid rgba(255,255,255,.06)",padding:"14px 16px" }}>
                                  <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10 }}>
                                    <div style={{ fontSize:14,fontWeight:700,color:"#e2e8f0" }}>{row.activity_label}</div>
                                    <div style={{ display:"flex",gap:10,alignItems:"center" }}>
                                      <span style={{ fontSize:11,fontFamily:"monospace",color:"rgba(255,255,255,.4)" }}>{t.imuROM}: {row.rom_deg}° / {row.healthy_baseline}°</span>
                                      <div style={{ padding:"3px 10px",borderRadius:999,fontSize:12,fontWeight:800,
                                        background:`${c}22`,border:`1px solid ${c}44`,color:c }}>
                                        {row.score_pct}%
                                      </div>
                                    </div>
                                  </div>
                                  <div style={{ height:5,background:"rgba(255,255,255,.06)",borderRadius:999,overflow:"hidden",marginBottom:8 }}>
                                    <div style={{ height:"100%",width:`${row.score_pct}%`,background:c,borderRadius:999,transition:"width 1.3s cubic-bezier(.4,0,.2,1)" }}/>
                                  </div>
                                  <div style={{ display:"flex",gap:8 }}>
                                    <div style={{ width:8,height:8,borderRadius:"50%",background:c,flexShrink:0,marginTop:5 }}/>
                                    <span style={{ fontSize:11,color:"rgba(255,255,255,.5)",lineHeight:1.6 }}>
                                      {`ROM: ${row.rom_deg}° patient vs ${row.healthy_baseline}° healthy baseline`}
                                    </span>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* Clinical Feedback Cards */}
                      {imuResult.feedback?.length > 0 && (
                        <div style={{ borderRadius:18,background:"rgba(255,255,255,.03)",border:"1px solid rgba(255,255,255,.08)",backdropFilter:"blur(12px)",padding:"16px 18px" }}>
                          <div style={{ fontSize:10,fontWeight:800,color:"rgba(255,255,255,.35)",textTransform:"uppercase",letterSpacing:"0.14em",marginBottom:14 }}>{t.imuFeedbackTitle}</div>
                          <div style={{ display:"flex",flexDirection:"column",gap:10 }}>
                            {imuResult.feedback.map((fb, i) => {
                              const cfg = {
                                ok:    { border:"rgba(16,185,129,.3)",  bg:"rgba(16,185,129,.07)",  dot:"#10b981", icon:"✓", iconBg:"rgba(16,185,129,.2)",  iconC:"#10b981" },
                                warn:  { border:"rgba(245,158,11,.3)",  bg:"rgba(245,158,11,.07)",  dot:"#f59e0b", icon:"!", iconBg:"rgba(245,158,11,.2)",  iconC:"#f59e0b" },
                                alert: { border:"rgba(239,68,68,.3)",   bg:"rgba(239,68,68,.07)",   dot:"#ef4444", icon:"⚠", iconBg:"rgba(239,68,68,.2)",   iconC:"#ef4444" },
                              }[fb.level] || { border:"rgba(255,255,255,.1)", bg:"rgba(255,255,255,.03)", dot:"#fff", icon:"·", iconBg:"rgba(255,255,255,.1)", iconC:"#fff" };
                              return (
                                <div key={i} style={{ borderRadius:13,padding:"12px 14px",
                                  background:cfg.bg, border:`1px solid ${cfg.border}`,
                                  display:"flex",gap:12,alignItems:"flex-start" }}>
                                  <div style={{ width:28,height:28,borderRadius:8,background:cfg.iconBg,
                                    display:"flex",alignItems:"center",justifyContent:"center",
                                    fontSize:13,fontWeight:900,color:cfg.iconC,flexShrink:0 }}>
                                    {cfg.icon}
                                  </div>
                                  <div style={{ flex:1 }}>
                                    <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:4,flexWrap:"wrap",gap:6 }}>
                                      <span style={{ fontSize:12,fontWeight:700,color:"rgba(255,255,255,.85)" }}>{fb.title}</span>
                                      {fb.score !== undefined && (
                                        <span style={{ fontSize:11,fontFamily:"monospace",fontWeight:700,color:cfg.iconC }}>
                                          {fb.score}%
                                        </span>
                                      )}
                                    </div>
                                    <div style={{ fontSize:12,color:"rgba(255,255,255,.55)",lineHeight:1.6 }}>{fb.text}</div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* Disclaimer */}
                      <div style={{ borderRadius:12,background:"rgba(245,158,11,.06)",border:"1px solid rgba(245,158,11,.15)",padding:"11px 14px",display:"flex",gap:9,alignItems:"flex-start" }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" style={{ flexShrink:0,marginTop:1 }}><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                        <span style={{ fontSize:11,color:"rgba(245,158,11,.7)",lineHeight:1.55 }}>{t.imuDisclaimer}</span>
                      </div>
                    </div>
                  );
                })()}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
