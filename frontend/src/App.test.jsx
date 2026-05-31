import { beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "./App";

function jsonResponse(payload) {
  return {
    ok: true,
    status: 200,
    text: async () => JSON.stringify(payload),
    json: async () => payload,
  };
}

describe("clinical wizard patient and KOOS flow", () => {
  beforeEach(() => {
    cleanup();
    window.localStorage.clear();
    vi.restoreAllMocks();
    vi.stubGlobal("URL", {
      ...URL,
      createObjectURL: vi.fn(() => "blob:mock-image"),
      revokeObjectURL: vi.fn(),
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input) => {
        const url = String(input);

        if (url.includes("/api/health")) {
          return jsonResponse({ status: "ok" });
        }

        if (url.includes("/api/sessions/")) {
          return jsonResponse({ sessions: [] });
        }

        if (url.includes("/api/koos/calculate")) {
          return jsonResponse({
            koos_total: 72.4,
            subscales: {
              pain: 70,
              symptoms: 71,
              adl: 74,
              sport_rec: 73,
              qol: 74,
            },
          });
        }

        if (url.includes("/api/predict-kl")) {
          return jsonResponse({
            kl_grade: 2,
            confidence: 0.87,
            kl_scale_max: 4,
          });
        }

        if (url.includes("/api/imu/analyze")) {
          return jsonResponse({
            overall_score: 0.78,
            session_summary: { rom_deg: 94 },
            dominant_activity_label: "Knee extension",
            feedback: [{ level: "Stable" }],
          });
        }

        if (url.includes("/api/rehab/report")) {
          return jsonResponse({
            session_id: "session-123",
            predicted_delta_KOOS: 8.2,
            rehab_level_label: "Level 2",
            KOOS_pre: 72.4,
            delta_ROM: 12,
            current_ROM: 94,
            rehab_score: 0.78,
            KL_grade: 2,
            interpretation: "Functional progress is improving with current rehab tolerance.",
            delta_note: "ROM improved by 12° compared with the previous session.",
            recommendations: [],
            beta0: 1,
            beta1: 2,
            beta2: 3,
            beta3_KL: 4,
            created_at: "2026-05-31T10:00:00Z",
          });
        }

        return jsonResponse({});
      }),
    );
  });

  it("shows the redesigned patient context summary cards", () => {
    render(<App />);

    expect(screen.getByText(/saved sessions/i)).toBeInTheDocument();
    expect(screen.getByText(/latest rom/i)).toBeInTheDocument();
    expect(screen.getByText(/latest date/i)).toBeInTheDocument();
  });

  it("shows KOOS in 14 panels with category tags", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getAllByRole("button", { name: /koos questionnaire/i })[0]);

    expect(await screen.findByText(/panel 1 of 14/i)).toBeInTheDocument();
    expect(screen.getByText(/^pain$/i)).toBeInTheDocument();
  });

  it("localizes the visible KOOS category chip in Russian", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getAllByRole("button", { name: "RU" })[0]);
    await user.click(screen.getAllByRole("button", { name: /опросник KOOS/i })[0]);

    expect(await screen.findByText(/панель 1 из 14/i)).toBeInTheDocument();
    expect(screen.getByText(/^Боль$/i)).toBeInTheDocument();
    expect(screen.queryByText(/^Pain$/)).not.toBeInTheDocument();
  });

  it("renders backend interpretation and delta note in the final report", async () => {
    const user = userEvent.setup();
    const { container } = render(<App />);

    await user.type(screen.getAllByPlaceholderText("P001")[0], "P100");
    await user.click(screen.getByRole("button", { name: /continue to KOOS questionnaire/i }));
    await screen.findByText(/panel 1 of 14/i);

    for (let panelIndex = 0; panelIndex < 14; panelIndex += 1) {
      const visibleRadios = screen.getAllByRole("radio");
      const firstRadioPerQuestion = visibleRadios.filter((radio, index, radios) => {
        return radios.findIndex((candidate) => candidate.name === radio.name) === index;
      });

      expect(firstRadioPerQuestion).toHaveLength(3);

      for (const radio of firstRadioPerQuestion) {
        await user.click(radio);
      }

      if (panelIndex === 13) {
        await user.click(screen.getByRole("button", { name: /calculate KOOS/i }));
      } else {
        await user.click(screen.getByRole("button", { name: /next questions/i }));
      }
    }

    await user.click(await screen.findByRole("button", { name: /continue to KL image grading/i }));

    const imageInput = container.querySelector('input[type="file"][accept*="image/png"]');
    expect(imageInput).not.toBeNull();
    await user.upload(imageInput, new File(["img"], "knee.png", { type: "image/png" }));
    await user.click(screen.getByRole("button", { name: /analyze KL grade/i }));
    await user.click(await screen.findByRole("button", { name: /continue to IMU rehab analysis/i }));

    const imuInput = container.querySelector('input[type="file"][accept*=".csv"]');
    expect(imuInput).not.toBeNull();
    await user.upload(imuInput, new File(["col1,col2"], "imu.csv", { type: "text/csv" }));
    await user.click(screen.getByRole("button", { name: /analyze IMU/i }));
    await user.click(await screen.findByRole("button", { name: /continue to final rehab report/i }));

    await user.click(screen.getByRole("button", { name: /generate report/i }));

    expect(
      await screen.findByText("Functional progress is improving with current rehab tolerance."),
    ).toBeInTheDocument();
    expect(
      screen.getByText("ROM improved by 12° compared with the previous session."),
    ).toBeInTheDocument();
  });
});
