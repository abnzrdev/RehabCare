import { describe, expect, it } from "vitest";
import {
  buildKoosPanels,
  EXERCISE_VIDEO_ORDER,
  KOOS_CATEGORY_RANGES,
  getPanelCategoryMeta,
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

  it("uses the approved redesign sample video data", () => {
    expect(EXERCISE_VIDEO_ORDER).toEqual([
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
    ]);
  });
});
