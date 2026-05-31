import { describe, expect, it } from "vitest";
import {
  buildKoosPanels,
  EXERCISE_VIDEO_ORDER,
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
});

describe("getSelectedVideo", () => {
  it("returns the first video when no id is selected", () => {
    expect(getSelectedVideo(EXERCISE_VIDEO_ORDER, null)).toEqual(EXERCISE_VIDEO_ORDER[0]);
  });

  it("returns the selected video when the id matches", () => {
    expect(getSelectedVideo(EXERCISE_VIDEO_ORDER, EXERCISE_VIDEO_ORDER[1].id)).toEqual(
      EXERCISE_VIDEO_ORDER[1],
    );
  });
});
