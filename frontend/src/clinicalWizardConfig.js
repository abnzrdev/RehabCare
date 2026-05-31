export const KOOS_CATEGORY_RANGES = [
  { key: "pain", tag: "Pain", start: 1, end: 9 },
  { key: "symptoms", tag: "Symptoms", start: 10, end: 16 },
  { key: "adl", tag: "Daily living", start: 17, end: 33 },
  { key: "sportRec", tag: "Sport / recreation", start: 34, end: 38 },
  { key: "qol", tag: "Quality of life", start: 39, end: 42 },
];

export const EXERCISE_VIDEO_ORDER = [
  { id: "advanced-squats", title: "Advanced Squats" },
  { id: "lateral-step-downs", title: "Lateral Step-Downs" },
  { id: "return-to-running-drills", title: "Return-to-Running Drills" },
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
