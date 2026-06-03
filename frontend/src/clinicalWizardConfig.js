export const KOOS_CATEGORY_RANGES = [
  { key: "pain", tag: "Pain", start: 1, end: 9 },
  { key: "symptoms", tag: "Symptoms", start: 10, end: 16 },
  { key: "adl", tag: "Daily living", start: 17, end: 33 },
  { key: "sportRec", tag: "Sport / recreation", start: 34, end: 38 },
  { key: "qol", tag: "Quality of life", start: 39, end: 42 },
];

export const REHAB_EXERCISE_VIDEOS = [
  {
    id: "quad-sets",
    level: 1,
    title: "Quad Sets",
    youtubeId: "5TUK4uT2nnw",
    youtubeUrl: "https://www.youtube.com/watch?v=5TUK4uT2nnw",
    duration: "3 min",
    targetArea: "Quad activation",
    description: "Very easy knee activation exercise for early rehab.",
  },
  {
    id: "heel-slides",
    level: 1,
    title: "Heel Slides",
    youtubeId: "Bz0wSFRjH2c",
    youtubeUrl: "https://www.youtube.com/watch?v=Bz0wSFRjH2c",
    duration: "4 min",
    targetArea: "Knee ROM",
    description: "Gentle movement to improve knee bending range.",
  },
  {
    id: "straight-leg-raise",
    level: 2,
    title: "Straight Leg Raise",
    youtubeId: "zo2pqw794B0",
    youtubeUrl: "https://www.youtube.com/watch?v=zo2pqw794B0",
    duration: "4 min",
    targetArea: "Quad strength",
    description: "Basic strengthening exercise while keeping the knee straight.",
  },
  {
    id: "sit-to-stand",
    level: 2,
    title: "Sit to Stand",
    youtubeId: "1sZZepjDT5M",
    youtubeUrl: "https://www.youtube.com/watch?v=1sZZepjDT5M",
    duration: "5 min",
    targetArea: "Daily movement strength",
    description: "Chair-based strength exercise for safer standing.",
  },
  {
    id: "calf-raises",
    level: 3,
    title: "Calf Raises",
    youtubeId: "3tJCtytFe9A",
    youtubeUrl: "https://www.youtube.com/watch?v=3tJCtytFe9A",
    duration: "4 min",
    targetArea: "Lower leg support",
    description: "Builds ankle and calf support for walking and balance.",
  },
  {
    id: "mini-squats",
    level: 3,
    title: "Mini Squats",
    youtubeId: "w2arL8LK_6E",
    youtubeUrl: "https://www.youtube.com/watch?v=w2arL8LK_6E",
    duration: "5 min",
    targetArea: "Knee control",
    description: "Controlled partial squat for knee and hip strength.",
  },
  {
    id: "step-ups",
    level: 4,
    title: "Step Ups",
    youtubeId: "gxAqDyBNdz8",
    youtubeUrl: "https://www.youtube.com/watch?v=gxAqDyBNdz8",
    duration: "5 min",
    targetArea: "Knee strength",
    description: "Step exercise for stronger functional knee control.",
  },
  {
    id: "single-leg-balance-with-foam-pad",
    level: 4,
    title: "Single Leg Balance With Foam Pad",
    youtubeId: "NIh0i8GokuY",
    youtubeUrl: "https://www.youtube.com/watch?v=NIh0i8GokuY",
    duration: "5 min",
    targetArea: "Balance",
    description: "Balance exercise for stability and proprioception.",
  },
  {
    id: "step-up-variations",
    level: 5,
    title: "Step Up Variations",
    youtubeId: "HyU2a4Ria-0",
    youtubeUrl: "https://www.youtube.com/watch?v=HyU2a4Ria-0",
    duration: "6 min",
    targetArea: "Advanced knee strength",
    description: "Harder step-up progressions for stronger patients.",
  },
  {
    id: "lateral-step-up",
    level: 5,
    title: "Lateral Step-Up",
    youtubeId: "G0U3CUPK55U",
    youtubeUrl: "https://www.youtube.com/watch?v=G0U3CUPK55U",
    duration: "5 min",
    targetArea: "Side knee control",
    description: "Side step-up movement for hip and knee control.",
  },
  {
    id: "physio-lunge",
    level: 5,
    title: "Physio Lunge",
    youtubeId: "FlULiLvlU6I",
    youtubeUrl: "https://www.youtube.com/watch?v=FlULiLvlU6I",
    duration: "6 min",
    targetArea: "Advanced control",
    description: "Harder lunge-style rehab exercise for stronger control.",
  },
];

export const EXERCISE_VIDEO_ORDER = REHAB_EXERCISE_VIDEOS;

export function getRehabLevel(finalRehabScore) {
  if (!Number.isFinite(finalRehabScore)) return 1;
  const level = Math.ceil(Math.max(0, finalRehabScore) / 20);
  return Math.min(5, Math.max(1, level));
}

export function getExerciseVideosForScore(finalRehabScore) {
  const level = getRehabLevel(finalRehabScore);
  return REHAB_EXERCISE_VIDEOS.filter((video) => video.level === level).map((video) => ({
    ...video,
    levelLabel: `Level ${video.level}`,
    embedUrl: `https://www.youtube-nocookie.com/embed/${video.youtubeId}?rel=0&modestbranding=1`,
  }));
}

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
