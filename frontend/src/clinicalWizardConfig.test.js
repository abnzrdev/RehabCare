import { describe, expect, it } from "vitest";
import {
  clampScore,
  buildKoosPanels,
  EXERCISE_VIDEO_ORDER,
  KOOS_CATEGORY_RANGES,
  REHAB_EXERCISE_VIDEOS,
  getExerciseVideosForScore,
  getPanelCategoryMeta,
  getRehabLevel,
  mapRawRehabScoreTo100,
  rehabLevelFromScore,
  rehabMeaningFromScore,
  getSelectedVideo,
} from "./clinicalWizardConfig";

describe("buildKoosPanels", () => {
  it("builds 14 panels of 3 questions covering q1 through q42 in order", () => {
    const panels = buildKoosPanels();

    expect(panels).toHaveLength(14);
    expect(panels.every((panel) => Array.isArray(panel.questions))).toBe(true);
    expect(panels.every((panel) => panel.questions.length === 3)).toBe(true);
    expect(panels.flatMap((panel) => panel.questions)).toEqual(
      Array.from({ length: 42 }, (_, index) => index + 1),
    );
  });
});

describe("getPanelCategoryMeta", () => {
  it('uses the first question category as the visible tag and marks mixed panels with "Includes next section"', () => {
    const meta = getPanelCategoryMeta([9, 10, 11]);

    expect(meta.tag).toBe("Pain");
    expect(meta.note).toBe("Includes next section");
  });

  it("uses the approved category labels for later UI reuse", () => {
    expect(KOOS_CATEGORY_RANGES.map((category) => category.tag)).toEqual([
      "Pain",
      "Symptoms",
      "Daily living",
      "Sport / recreation",
      "Quality of life",
    ]);
  });
});

describe("getSelectedVideo", () => {
  it("returns the first video when no id is selected", () => {
    expect(getSelectedVideo(EXERCISE_VIDEO_ORDER, null)).toEqual(EXERCISE_VIDEO_ORDER[0]);
  });

  it("returns the first video when the selected id is not found", () => {
    expect(getSelectedVideo(EXERCISE_VIDEO_ORDER, "missing-video-id")).toEqual(
      EXERCISE_VIDEO_ORDER[0],
    );
  });

  it("returns the selected video when the id matches", () => {
    expect(getSelectedVideo(EXERCISE_VIDEO_ORDER, EXERCISE_VIDEO_ORDER[1].id)).toEqual(
      EXERCISE_VIDEO_ORDER[1],
    );
  });

  it("returns null when videos is empty", () => {
    expect(getSelectedVideo([], EXERCISE_VIDEO_ORDER[0].id)).toBeNull();
  });

  it("returns null when videos is absent", () => {
    expect(getSelectedVideo(undefined, EXERCISE_VIDEO_ORDER[0].id)).toBeNull();
  });

  it("keeps the seeded rehab exercise dataset", () => {
    expect(REHAB_EXERCISE_VIDEOS.slice(0, 2)).toEqual([
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
    ]);
    expect(EXERCISE_VIDEO_ORDER).toBe(REHAB_EXERCISE_VIDEOS);
  });
});

describe("rehab video helpers", () => {
  it("maps raw rehab scores into the calibrated 0-100 range", () => {
    expect(mapRawRehabScoreTo100(140.55)).toBe(0);
    expect(mapRawRehabScoreTo100(20.6)).toBe(100);
    expect(mapRawRehabScoreTo100(80.575)).toBe(50);
    expect(clampScore(-10)).toBe(0);
    expect(clampScore(120)).toBe(100);
  });

  it("maps scores into the expected five rehab levels", () => {
    expect(getRehabLevel(Number.NaN)).toBe(1);
    expect(rehabLevelFromScore(0)).toBe(1);
    expect(getRehabLevel(20)).toBe(1);
    expect(getRehabLevel(21)).toBe(2);
    expect(getRehabLevel(40)).toBe(2);
    expect(getRehabLevel(41)).toBe(3);
    expect(getRehabLevel(60)).toBe(3);
    expect(getRehabLevel(61)).toBe(4);
    expect(getRehabLevel(80)).toBe(4);
    expect(getRehabLevel(81)).toBe(5);
    expect(getRehabLevel(140)).toBe(5);
    expect(rehabMeaningFromScore(95)).toMatch(/strong/i);
  });

  it("returns the correct number of videos for each rehab level", () => {
    expect(getExerciseVideosForScore(10)).toHaveLength(2);
    expect(getExerciseVideosForScore(35)).toHaveLength(2);
    expect(getExerciseVideosForScore(58)).toHaveLength(2);
    expect(getExerciseVideosForScore(79)).toHaveLength(2);
    expect(getExerciseVideosForScore(95)).toHaveLength(3);
  });

  it("builds the privacy-friendly embed URLs for modal playback", () => {
    expect(getExerciseVideosForScore(79)[0].embedUrl).toContain(
      "https://www.youtube-nocookie.com/embed/",
    );
    expect(getExerciseVideosForScore(79)[0].embedUrl).toContain(
      "?rel=0&modestbranding=1",
    );
  });
});
