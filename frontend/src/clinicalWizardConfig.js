export const KOOS_CATEGORY_RANGES = [
  { key: "pain", tag: "Pain", start: 1, end: 9 },
  { key: "symptoms", tag: "Symptoms", start: 10, end: 16 },
  { key: "adl", tag: "Daily living", start: 17, end: 33 },
  { key: "sportRec", tag: "Sport / recreation", start: 34, end: 38 },
  { key: "qol", tag: "Quality of life", start: 39, end: 42 },
];

export const EXERCISE_VIDEO_ORDER = [
  {
    id: "step-ups",
    title: "Step-Ups",
    description: "Step onto a low platform with slow control through the knee and hip.",
    level: "Level 4",
    duration: "4 min",
    targetArea: "Knee strength",
    embedUrl: "https://www.youtube-nocookie.com/embed/BHUu__ZSFEk?rel=0",
  },
  {
    id: "lunges",
    title: "Lunges",
    description: "Practice split-stance lowering with attention to knee tracking and balance.",
    level: "Level 4",
    duration: "6 min",
    targetArea: "Knee control",
    embedUrl: "https://www.youtube-nocookie.com/embed/bo_99bo4q3c?rel=0",
  },
  {
    id: "single-leg-balance",
    title: "Single-Leg Balance",
    description: "Stand on one leg to improve balance, hip control, and proprioception.",
    level: "Level 4",
    duration: "5 min",
    targetArea: "Balance",
    embedUrl: "https://www.youtube-nocookie.com/embed/8cp5gTaXqhk?rel=0",
  },
];

function getKoosCategoryForQuestion(questionNumber) {
  return (
    KOOS_CATEGORY_RANGES.find(
      (category) => questionNumber >= category.start && questionNumber <= category.end,
    ) || null
  );
}

export function buildKoosPanels() {
  return Array.from({ length: 14 }, (_, index) => {
    const start = index * 3 + 1;
    const questions = [start, start + 1, start + 2];

    return {
      id: `koos-panel-${index + 1}`,
      questions,
      ...getPanelCategoryMeta(questions),
    };
  });
}

export function getPanelCategoryMeta(questionNumbers) {
  const firstCategory = getKoosCategoryForQuestion(questionNumbers[0]);
  const hasMixedCategories = questionNumbers.some((questionNumber) => {
    const category = getKoosCategoryForQuestion(questionNumber);
    return category?.key !== firstCategory?.key;
  });

  return {
    tag: firstCategory?.tag ?? "",
    note: hasMixedCategories ? "Includes next section" : null,
  };
}

export function getSelectedVideo(videos, selectedVideoId) {
  if (!Array.isArray(videos) || videos.length === 0) {
    return null;
  }

  return videos.find((video) => video.id === selectedVideoId) || videos[0] || null;
}
