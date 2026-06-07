import { beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
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
  let rehabReportScore;

  beforeEach(() => {
    cleanup();
    window.localStorage.clear();
    vi.restoreAllMocks();
    rehabReportScore = 8.2;
    vi.stubGlobal("URL", {
      ...URL,
      createObjectURL: vi.fn(() => "blob:mock-image"),
      revokeObjectURL: vi.fn(),
    });
    const latestImuTimestamp = new Date(Date.now() - 30 * 1000).toISOString();
    const previousImuTimestamp = new Date(Date.now() - 90 * 1000).toISOString();
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

        if (url.includes("/api/imu/latest")) {
          return jsonResponse({
            count: 1,
            items: [
              {
                timestamp: latestImuTimestamp,
                device_id: "pi1",
                leg: "left",
                body_part: "hip",
                acc_x: 0.12,
                acc_y: 0.03,
                acc_z: 0.98,
                gyro_x: 1.2,
                gyro_y: 0.5,
                gyro_z: -0.1,
                pitch: 10.4,
                roll: 3.2,
                temperature: 35.8,
              },
            ],
          });
        }

        if (url.includes("/api/imu/data")) {
          return jsonResponse({
            count: 2,
            items: [
              {
                timestamp: latestImuTimestamp,
                device_id: "pi1",
                leg: "left",
                body_part: "hip",
                acc_x: 0.13,
                acc_y: 0.04,
                acc_z: 0.99,
                gyro_x: 1.25,
                gyro_y: 0.55,
                gyro_z: -0.08,
                pitch: 11.2,
                roll: 3.6,
                temperature: 35.9,
              },
              {
                timestamp: previousImuTimestamp,
                device_id: "pi1",
                leg: "left",
                body_part: "hip",
                acc_x: 0.12,
                acc_y: 0.03,
                acc_z: 0.98,
                gyro_x: 1.2,
                gyro_y: 0.5,
                gyro_z: -0.1,
                pitch: 10.4,
                roll: 3.2,
                temperature: 35.8,
              },
            ],
          });
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
            rom_deg: 94,
            session_summary: {
              rom_deg: 94,
              sensor_format: "hugadb_6imu_2emg",
              rom_method_used: "accelerometer_relative_tilt",
              rom_valid: true,
              rom_warning: "Raw gyro ROM was rejected because ROM exceeded physiological range; accelerometer relative tilt was used instead.",
              rom_candidate_diagnostics: [
                { name: "pitch_detrended", rom_deg: null, min_angle_deg: null, max_angle_deg: null, valid: false, reason: "Required columns are missing." },
                { name: "gyro_integrated_detrended", rom_deg: 251776, min_angle_deg: -125888, max_angle_deg: 125888, valid: false, reason: "ROM exceeded physiological range." },
                { name: "accelerometer_relative_tilt", rom_deg: 94, min_angle_deg: -12, max_angle_deg: 82, valid: true, reason: "accelerometer_relative_tilt accepted." },
              ],
              n_real_channels: 14,
              emg_detected: true,
              sensor_setup_note: "HuGaDB-style multi-sensor CSV detected. RF/RS/RT/LF/LS/LT are mapped to right/left foot, shin, and thigh.",
            },
            dominant_activity_label: "Knee extension",
            feedback: [{ level: "Stable" }],
          });
        }

        if (url.includes("/api/rehab/report")) {
          const rawScore = 140.55 - ((rehabReportScore / 100) * (140.55 - 20.6));
          const beta3Kl = Number((rawScore - 139.95 + (0.93 * 72.4) + (0.785 * 12)).toFixed(3));
          return jsonResponse({
            session_id: "session-123",
            raw_score: Number(rawScore.toFixed(3)),
            predicted_delta_KOOS: Number(rawScore.toFixed(3)),
            final_rehab_score: rehabReportScore,
            rehab_level_label: `Level ${Math.min(5, Math.max(1, Math.ceil(Math.max(0, rehabReportScore) / 20)))}`,
            rehab_level_meaning: rehabReportScore > 80 ? "strong / lower rehab gap / harder exercise plan" : "weak / high rehab need / easiest exercise plan",
            KOOS_pre: 72.4,
            delta_ROM: 12,
            current_ROM: 94,
            rehab_score: 0.78,
            KL_grade: 2,
            interpretation: "Functional progress is improving with current rehab tolerance.",
            score_meaning: "This patient is improving based on KOOS, Delta ROM, KL grade, and the mapped rehab score.",
            delta_note: "ROM improved by 12° compared with the previous session.",
            recommendations: [],
            beta0: 139.95,
            beta1: -0.93,
            beta2: -0.785,
            beta3_KL: beta3Kl,
            raw_score_mapping_low: 20.6,
            raw_score_mapping_high: 140.55,
            created_at: "2026-05-31T10:00:00Z",
            recommended_exercises: [],
          });
        }

        return jsonResponse({});
      }),
    );
  });

  it("keeps patient context free of live IMU widgets", async () => {
    render(<App />);
    const patientPanel = document.getElementById("patient-context");

    expect(screen.getByText(/saved sessions/i)).toBeInTheDocument();
    expect(screen.getByText(/latest rom/i)).toBeInTheDocument();
    expect(screen.getByText(/latest date/i)).toBeInTheDocument();
    expect(patientPanel).not.toBeNull();
    expect(within(patientPanel).queryByText(/real imu sensor/i)).not.toBeInTheDocument();
    expect(within(patientPanel).queryByText(/real imu sensor feed/i)).not.toBeInTheDocument();
    expect(within(patientPanel).queryByText(/recent imu data/i)).not.toBeInTheDocument();
    expect(within(patientPanel).queryByText(/pi1 \/ left hip/i)).not.toBeInTheDocument();
  });

  it("renders Sensor setup with auto-detect default and both-legs option", async () => {
    const user = userEvent.setup();
    render(<App />);

    const sensorSetupSelect = screen.getByLabelText(/sensor setup/i);
    expect(sensorSetupSelect).toHaveValue("auto");
    expect(screen.getByRole("option", { name: /auto-detect from csv/i })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /both legs .*6 imu \+ 2 emg/i })).toBeInTheDocument();

    await user.selectOptions(sensorSetupSelect, "right_thigh");
    expect(sensorSetupSelect).toHaveValue("right_thigh");
    expect(screen.getAllByText(/single sensor . right thigh/i).length).toBeGreaterThan(0);
  });

  it("keeps Step 4 CSV mode available and analyzes uploaded CSV data", async () => {
    const user = userEvent.setup();
    const { container } = render(<App />);

    await user.click(screen.getAllByRole("button", { name: /IMU movement analysis/i })[0]);

    expect(screen.getByLabelText(/data source/i)).toHaveValue("csv");
    expect(screen.getByText(/choose csv upload if you already recorded data/i)).toBeInTheDocument();
    expect(screen.getByText(/selected leg/i)).toBeInTheDocument();

    const imuInput = container.querySelector('input[type="file"][accept*=".csv"]');
    expect(imuInput).not.toBeNull();
    await user.upload(imuInput, new File(["col1,col2", "imu.csv"], "imu.csv", { type: "text/csv" }));
    await user.click(screen.getByRole("button", { name: /analyze ROM/i }));

    expect(await screen.findByText(/IMU movement analysis completed/i)).toBeInTheDocument();
    expect(screen.getAllByText("94.0°").length).toBeGreaterThan(0);
  });

  it("renders live Step 4 controls for leg selection, mapping, and calibration", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getAllByRole("button", { name: /IMU movement analysis/i })[0]);
    await user.selectOptions(screen.getByLabelText(/data source/i), "live");

    expect(screen.getByText(/choose live sensors if raspberry pi sensors are connected/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/selected leg/i)).toHaveValue("left");
    expect(screen.getByText(/physical sensor mapping/i)).toBeInTheDocument();
    expect(screen.getAllByText(/hip sensor/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/thigh\/knee sensor/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/ankle\/shin sensor/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/pi1/)).toBeInTheDocument();
    expect(screen.getByText(/pi2/)).toBeInTheDocument();
    expect(screen.getByText(/pi3/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /set current position as neutral baseline/i })).toBeInTheDocument();
    expect(screen.getAllByDisplayValue("pitch").length).toBeGreaterThan(0);
    expect(screen.getAllByDisplayValue("1").length).toBeGreaterThan(0);
  });

  it("shows a missing sensor warning in Step 4 live mode when required sensors are not streaming", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getAllByRole("button", { name: /IMU movement analysis/i })[0]);
    await user.selectOptions(screen.getByLabelText(/data source/i), "live");

    expect(await screen.findByText(/missing or stale live sensor data/i)).toBeInTheDocument();
    expect(screen.getAllByText(/waiting/i).length).toBeGreaterThan(0);
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

  it("shows a seven-step workflow with a separate real IMU page after exercise videos", async () => {
    const user = userEvent.setup();
    const { container } = render(<App />);

    expect(screen.queryByRole("button", { name: /refresh/i })).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /exercise videos/i })[0]).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /real imu sensor/i })[0]).toBeInTheDocument();

    await user.type(screen.getAllByPlaceholderText("P001")[0], "P100");
    await user.click(screen.getByRole("button", { name: /continue to KOOS questionnaire/i }));
    await screen.findByText(/panel 1 of 14/i);

    for (let panelIndex = 0; panelIndex < 14; panelIndex += 1) {
      const visibleRadios = screen.getAllByRole("radio");
      const firstRadioPerQuestion = visibleRadios.filter((radio, index, radios) => {
        return radios.findIndex((candidate) => candidate.name === radio.name) === index;
      });

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
    await user.click(await screen.findByRole("button", { name: /continue to IMU/i }));

    expect(screen.getByRole("heading", { name: /IMU movement analysis/i })).toBeInTheDocument();
    expect(screen.getByText(/capture or upload IMU movement data to calculate knee ROM/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /analyze ROM/i })).toBeInTheDocument();
    expect(screen.getByText(/no IMU result yet/i)).toBeInTheDocument();

    const imuInput = container.querySelector('input[type="file"][accept*=".csv"]');
    expect(imuInput).not.toBeNull();
    await user.upload(imuInput, new File(["col1,col2"], "imu.csv", { type: "text/csv" }));
    await user.click(screen.getByRole("button", { name: /analyze ROM/i }));

    expect(await screen.findByText(/step 4 of 7 complete/i)).toBeInTheDocument();
    expect(screen.getByText(/IMU movement analysis completed/i)).toBeInTheDocument();
    expect(screen.getAllByText(/range of motion/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText("94.0°").length).toBeGreaterThan(0);
    expect(screen.getByText("hugadb_6imu_2emg")).toBeInTheDocument();
    expect(screen.getByText("accelerometer_relative_tilt")).toBeInTheDocument();
    expect(screen.getByText(/^14$/)).toBeInTheDocument();
    expect(screen.getByText(/^Yes$/)).toBeInTheDocument();
    expect(screen.getByText(/sensor setup/i)).toBeInTheDocument();
    expect(screen.getAllByText(/auto-detect from csv/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/HuGaDB-style multi-sensor CSV detected/i)).toBeInTheDocument();
    expect(screen.getByText(/Raw gyro ROM was rejected because ROM exceeded physiological range/i)).toBeInTheDocument();
    expect(screen.queryByText(/^Rehab score$/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/IMU rehab score/i)).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /continue to final rehab report/i }));
    await user.click(screen.getByRole("button", { name: /generate report/i }));

    expect(await screen.findByText(/step 5 of 7 complete/i)).toBeInTheDocument();
    expect(screen.getAllByText(/final rehabilitation score/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/IMU rehab score/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText("130.7").length).toBeGreaterThan(0);
    expect(screen.getByText("RAW REHAB SCORE")).toBeInTheDocument();
    expect(screen.getAllByText(/^Final mapped score$/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/^8.2$/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /continue to exercise videos/i }));

    expect(await screen.findByText(/step 6 of 7 complete/i)).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: /exercise videos/i })).toBeInTheDocument();
    expect(screen.getByText(/review the prescribed exercise video library after the final rehabilitation report/i)).toBeInTheDocument();
    expect(screen.getAllByText(/^2$/).length).toBeGreaterThan(0);
    expect(screen.getByText(/exercise videos ready/i)).toBeInTheDocument();
    expect(screen.getByText(/exercise guidance is available for the current rehabilitation level/i)).toBeInTheDocument();
    expect(screen.getAllByText(/level 1 exercise plan/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/based on final rehab score: 8.2/i)).toBeInTheDocument();
    expect(
      screen.getByText(/these exercises are guidance only\. a clinician should confirm the final exercise plan/i),
    ).toBeInTheDocument();

    expect(screen.getByText("Quad Sets")).toBeInTheDocument();
    expect(screen.getByText("Heel Slides")).toBeInTheDocument();
    expect(screen.getAllByText(/^Level 1$/i).length).toBeGreaterThanOrEqual(2);
    expect(screen.queryByText("Step Ups")).not.toBeInTheDocument();
    expect(screen.getByText("4 min")).toBeInTheDocument();
    expect(screen.getByText("3 min")).toBeInTheDocument();
    expect(screen.getByText("Knee ROM")).toBeInTheDocument();
    expect(screen.getByText("Quad activation")).toBeInTheDocument();
    expect(container.querySelectorAll("iframe")).toHaveLength(0);

    await user.click(screen.getAllByRole("button", { name: /watch video/i })[0]);

    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(screen.getByTitle("Quad Sets")).toHaveAttribute(
      "src",
      expect.stringContaining("youtube-nocookie.com/embed/"),
    );
    expect(screen.getAllByRole("button", { name: /^Watch video$/i })).toHaveLength(2);
    expect(screen.getAllByRole("link", { name: /open on youtube/i }).length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByRole("button", { name: /assign|mark watched/i }).length).toBeGreaterThanOrEqual(2);

    await user.click(screen.getAllByRole("button", { name: /real imu sensor/i })[0]);

    expect(screen.getByRole("heading", { level: 2, name: /real imu sensor/i })).toBeInTheDocument();
    expect(await screen.findByText(/real imu sensor feed/i)).toBeInTheDocument();
    const sensorCards = screen.getByLabelText(/sensor cards/i);
    expect(within(sensorCards).getByText(/hip sensor/i)).toBeInTheDocument();
    expect(within(sensorCards).getByText(/knee \/ thigh sensor/i)).toBeInTheDocument();
    expect(within(sensorCards).getByText(/ankle \/ shin sensor/i)).toBeInTheDocument();
    expect(within(sensorCards).getByText(/^pi1$/)).toBeInTheDocument();
    expect(within(sensorCards).getByText(/^left$/)).toBeInTheDocument();
    expect(within(sensorCards).getByText(/^hip$/i)).toBeInTheDocument();
    expect(within(sensorCards).getAllByText(/^online$/i).length).toBeGreaterThan(0);
    expect(within(sensorCards).getAllByText(/waiting for sensor/i)).toHaveLength(2);
    expect(screen.getByText(/recent imu data/i)).toBeInTheDocument();
    expect(screen.getByText(/auto-refresh every 1.5 seconds/i)).toBeInTheDocument();
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
    await user.click(await screen.findByRole("button", { name: /continue to IMU/i }));

    const imuInput = container.querySelector('input[type="file"][accept*=".csv"]');
    expect(imuInput).not.toBeNull();
    await user.upload(imuInput, new File(["col1,col2"], "imu.csv", { type: "text/csv" }));
    await user.click(screen.getByRole("button", { name: /analyze ROM/i }));
    await user.click(await screen.findByRole("button", { name: /continue to final rehab report/i }));

    await user.click(screen.getByRole("button", { name: /generate report/i }));

    expect(
      await screen.findByText("Functional progress is improving with current rehab tolerance."),
    ).toBeInTheDocument();
    expect(
      screen.getByText("ROM improved by 12° compared with the previous session."),
    ).toBeInTheDocument();
  });

  it("renders first-session baseline report details without blocking the final report", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input) => {
        const url = String(input);

        if (url.includes("/api/health")) return jsonResponse({ status: "ok" });
        if (url.includes("/api/sessions/")) return jsonResponse({ sessions: [] });
        if (url.includes("/api/koos/calculate")) {
          return jsonResponse({
            koos_total: 72.4,
            subscales: { pain: 70, symptoms: 71, adl: 74, sport_rec: 73, qol: 74 },
          });
        }
        if (url.includes("/api/predict-kl")) {
          return jsonResponse({ kl_grade: 2, confidence: 0.87, kl_scale_max: 4 });
        }
        if (url.includes("/api/imu/analyze")) {
          return jsonResponse({
            overall_score: 0.78,
            rom_deg: 94,
            session_summary: { rom_deg: 94, min_angle_deg: -12, max_angle_deg: 82, rom_valid: true },
          });
        }
        if (url.includes("/api/rehab/report")) {
          return jsonResponse({
            session_id: "session-baseline",
            raw_score: 64.688,
            predicted_delta_KOOS: 64.688,
            final_rehab_score: 63.24,
            rehab_level_label: "Level 4",
            rehab_level_meaning: "strong / lower rehab gap / harder exercise plan",
            KOOS_pre: 72.4,
            current_ROM: 94,
            previous_ROM: null,
            previous_rom_deg: null,
            delta_ROM: 0,
            delta_rom_signed_deg: 0,
            delta_rom_abs_deg: 0,
            delta_rom_used_in_score_deg: 0,
            rehab_score: 0.78,
            KL_grade: 2,
            interpretation: "stable",
            score_meaning: "This first-session estimate uses KOOS, current ROM, KL grade, and a baseline Delta ROM of 0.00°.",
            delta_note: "First session baseline: no previous ROM found; Delta ROM set to 0 for baseline estimate.",
            is_first_rom_session: true,
            recommendations: [],
            beta0: 139.95,
            beta1: -0.93,
            beta2: -0.785,
            beta3_KL: -7.93,
            raw_score_mapping_low: 20.6,
            raw_score_mapping_high: 140.55,
            created_at: "2026-06-04T10:00:00Z",
            recommended_exercises: [],
          });
        }

        return jsonResponse({});
      }),
    );

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
    await user.click(await screen.findByRole("button", { name: /continue to IMU/i }));

    const imuInput = container.querySelector('input[type="file"][accept*=".csv"]');
    expect(imuInput).not.toBeNull();
    await user.upload(imuInput, new File(["col1,col2"], "imu.csv", { type: "text/csv" }));
    await user.click(screen.getByRole("button", { name: /analyze ROM/i }));
    await user.click(await screen.findByRole("button", { name: /continue to final rehab report/i }));
    await user.click(screen.getByRole("button", { name: /generate report/i }));

    expect(await screen.findByRole("status")).toBeInTheDocument();
    expect(screen.getByText(/^First ROM session$/i)).toBeInTheDocument();
    expect(screen.getByText(/delta rom is set to 0 as a baseline estimate/i)).toBeInTheDocument();
    expect(screen.getByText("First session")).toBeInTheDocument();
    expect(screen.getAllByText("0.0° baseline").length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText("0.0° baseline estimate")).toBeInTheDocument();
    expect(screen.getAllByText("64.7").length).toBeGreaterThan(0);
    expect(screen.getByText(/^63.2$/)).toBeInTheDocument();
    expect(screen.getByText(/no previous rom was found, so this first report uses 0.00 as baseline/i)).toBeInTheDocument();
  });

  it("shows three advanced videos when the final rehab score maps to level 5", async () => {
    rehabReportScore = 88;
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
    await user.click(await screen.findByRole("button", { name: /continue to IMU/i }));

    const imuInput = container.querySelector('input[type="file"][accept*=".csv"]');
    expect(imuInput).not.toBeNull();
    await user.upload(imuInput, new File(["col1,col2"], "imu.csv", { type: "text/csv" }));
    await user.click(screen.getByRole("button", { name: /analyze ROM/i }));
    await user.click(await screen.findByRole("button", { name: /continue to final rehab report/i }));
    await user.click(screen.getByRole("button", { name: /generate report/i }));
    await user.click(await screen.findByRole("button", { name: /continue to exercise videos/i }));

    expect((await screen.findAllByText(/level 5 exercise plan/i)).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/^3$/).length).toBeGreaterThan(0);
    expect(screen.getByText("Step Up Variations")).toBeInTheDocument();
    expect(screen.getByText("Lateral Step-Up")).toBeInTheDocument();
    expect(screen.getByText("Physio Lunge")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /^Watch video$/i })).toHaveLength(3);
  });
});
