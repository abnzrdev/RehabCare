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

function buildImuRow({
  timestamp,
  device_id,
  leg = "left",
  body_part,
  pitch,
  roll,
  acc_x,
  acc_y,
  acc_z,
}) {
  return {
    timestamp,
    device_id,
    leg,
    body_part,
    acc_x,
    acc_y,
    acc_z,
    gyro_x: 1.2,
    gyro_y: 0.5,
    gyro_z: -0.1,
    pitch,
    roll,
    temperature: 35.8,
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

  it("renders Step 4 radio buttons for CSV, Raspberry Pi, and WitMotion modes", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getAllByRole("button", { name: /IMU movement analysis/i })[0]);

    expect(screen.getByRole("radio", { name: /upload imu csv/i })).toBeChecked();
    expect(screen.getByRole("radio", { name: /use raspberry pi sensor data/i })).not.toBeChecked();
    expect(screen.getByRole("radio", { name: /use witmotion bluetooth sensor data/i })).not.toBeChecked();
    expect(screen.getByText(/use csv if you already recorded data/i)).toBeInTheDocument();
    expect(screen.getByText(/use live raspberry pi sensors for knee rom analysis/i)).toBeInTheDocument();
    expect(screen.getByText(/use witmotion bluetooth sensors for live device identification/i)).toBeInTheDocument();
    expect(screen.getAllByRole("radio")).toHaveLength(3);
    expect(screen.queryByRole("button", { name: /seed demo imu data/i })).not.toBeInTheDocument();
  });

  it("keeps Step 4 CSV mode available and analyzes uploaded CSV data", async () => {
    const user = userEvent.setup();
    const { container } = render(<App />);

    await user.click(screen.getAllByRole("button", { name: /IMU movement analysis/i })[0]);

    expect(screen.getByRole("radio", { name: /upload imu csv/i })).toBeChecked();
    expect(screen.getByText(/use csv if you already recorded data/i)).toBeInTheDocument();
    expect(screen.getByText(/selected leg/i)).toBeInTheDocument();

    const imuInput = container.querySelector('input[type="file"][accept*=".csv"]');
    expect(imuInput).not.toBeNull();
    await user.upload(imuInput, new File(["col1,col2", "imu.csv"], "imu.csv", { type: "text/csv" }));
    await user.click(screen.getByRole("button", { name: /analyze ROM/i }));

    expect(await screen.findByText(/IMU movement analysis completed/i)).toBeInTheDocument();
    expect(screen.getAllByText("94.0°").length).toBeGreaterThan(0);
  });

  it("shows only Raspberry Pi cards with calibration controls in Raspberry Pi mode", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getAllByRole("button", { name: /IMU movement analysis/i })[0]);
    await user.click(screen.getByRole("radio", { name: /use raspberry pi sensor data/i }));

    const sensorCards = screen.getByLabelText(/sensor cards/i);
    expect(within(sensorCards).getByText(/left hip/i)).toBeInTheDocument();
    expect(within(sensorCards).getByText(/left thigh\/knee/i)).toBeInTheDocument();
    expect(within(sensorCards).getByText(/left ankle\/shin/i)).toBeInTheDocument();
    expect(within(sensorCards).getByText(/^pi1$/i)).toBeInTheDocument();
    expect(within(sensorCards).getByText(/^pi2$/i)).toBeInTheDocument();
    expect(within(sensorCards).getByText(/^pi3$/i)).toBeInTheDocument();
    expect(screen.queryByText(/bluetooth \/ witmotion imu sensors/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/^ble_left_arm$/i)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /set current position as neutral baseline/i })).toBeInTheDocument();
    expect(screen.getAllByDisplayValue("pitch").length).toBeGreaterThan(0);
    expect(screen.getAllByDisplayValue("1").length).toBeGreaterThan(0);
  });

  it("shows lower-limb Bluetooth WitMotion cards, legacy remapping, and the movement visualization in WitMotion mode", async () => {
    const now = new Date().toISOString();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input) => {
        const url = String(input);
        if (url.includes("/api/health")) return jsonResponse({ status: "ok" });
        if (url.includes("/api/sessions/")) return jsonResponse({ sessions: [] });
        if (url.includes("/api/imu/latest")) {
          return jsonResponse({
            count: 5,
            items: [
              buildImuRow({ timestamp: now, device_id: "pi1", body_part: "hip", pitch: 8.4, roll: 1.1, acc_x: 0.11, acc_y: 0.01, acc_z: 0.97 }),
              buildImuRow({ timestamp: now, device_id: "pi2", body_part: "thigh", pitch: 17.2, roll: 2.2, acc_x: 0.21, acc_y: 0.02, acc_z: 0.96 }),
              buildImuRow({ timestamp: now, device_id: "pi3", body_part: "shin", pitch: 33.9, roll: 3.3, acc_x: 0.31, acc_y: 0.03, acc_z: 0.95 }),
              buildImuRow({ timestamp: now, device_id: "ble_left_arm", body_part: "arm", pitch: 12.3, roll: 4.5, acc_x: 0.1, acc_y: 0.2, acc_z: 0.9 }),
              buildImuRow({ timestamp: now, device_id: "ble_left_shin", body_part: "shin/ankle", pitch: 9.1, roll: 7.4, acc_x: 0.16, acc_y: 0.08, acc_z: 0.82 }),
              buildImuRow({ timestamp: now, device_id: "ble_right_thigh", leg: "right", body_part: "thigh/knee", pitch: 18.7, roll: 5.1, acc_x: 0.3, acc_y: 0.1, acc_z: 0.8 }),
              buildImuRow({ timestamp: now, device_id: "ble_right_leg", leg: "right", body_part: "leg", pitch: 15.6, roll: 6.2, acc_x: 0.27, acc_y: 0.09, acc_z: 0.84 }),
            ],
          });
        }
        if (url.includes("/api/imu/data")) {
          return jsonResponse({
            count: 7,
            items: [
              buildImuRow({ timestamp: now, device_id: "pi1", body_part: "hip", pitch: 8.4, roll: 1.1, acc_x: 0.11, acc_y: 0.01, acc_z: 0.97 }),
              buildImuRow({ timestamp: now, device_id: "pi2", body_part: "thigh", pitch: 17.2, roll: 2.2, acc_x: 0.21, acc_y: 0.02, acc_z: 0.96 }),
              buildImuRow({ timestamp: now, device_id: "pi3", body_part: "shin", pitch: 33.9, roll: 3.3, acc_x: 0.31, acc_y: 0.03, acc_z: 0.95 }),
              buildImuRow({ timestamp: now, device_id: "ble_left_arm", body_part: "arm", pitch: 12.3, roll: 4.5, acc_x: 0.1, acc_y: 0.2, acc_z: 0.9 }),
              buildImuRow({ timestamp: now, device_id: "ble_left_shin", body_part: "shin/ankle", pitch: 9.1, roll: 7.4, acc_x: 0.16, acc_y: 0.08, acc_z: 0.82 }),
              buildImuRow({ timestamp: now, device_id: "ble_right_thigh", leg: "right", body_part: "thigh/knee", pitch: 18.7, roll: 5.1, acc_x: 0.3, acc_y: 0.1, acc_z: 0.8 }),
              buildImuRow({ timestamp: now, device_id: "ble_right_leg", leg: "right", body_part: "leg", pitch: 15.6, roll: 6.2, acc_x: 0.27, acc_y: 0.09, acc_z: 0.84 }),
            ],
          });
        }
        if (url.includes("/api/koos/calculate")) return jsonResponse({ koos_total: 72.4, subscales: {} });
        if (url.includes("/api/predict-kl")) return jsonResponse({ kl_grade: 2, confidence: 0.87, kl_scale_max: 4 });
        if (url.includes("/api/imu/analyze")) return jsonResponse({ rom_deg: 94, session_summary: { rom_deg: 94, rom_valid: true } });
        if (url.includes("/api/rehab/report")) return jsonResponse({ session_id: "session-123" });
        return jsonResponse({});
      }),
    );

    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getAllByRole("button", { name: /IMU movement analysis/i })[0]);
    await user.click(screen.getByRole("radio", { name: /use witmotion bluetooth sensor data/i }));

    expect(screen.queryByText(/raspberry pi knee sensors/i)).not.toBeInTheDocument();
    expect(screen.getByText(/bluetooth \/ witmotion imu sensors/i)).toBeInTheDocument();
    expect(screen.getAllByText(/left thigh \/ knee/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/left shin \/ ankle/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/right thigh \/ knee/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/right shin \/ ankle/i).length).toBeGreaterThan(0);
    expect(screen.queryByText(/^left_arm$/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/^arm$/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/^Left_Leg$/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/^Right_Leg$/i)).not.toBeInTheDocument();
    expect(screen.getByText(/witmotion sensors are live\. knee rom calculation needs a mapped thigh\/knee and shin\/ankle pair\./i)).toBeInTheDocument();
    expect(screen.getByText(/move each physical sensor and watch the matching block rotate\./i)).toBeInTheDocument();
    expect(screen.getByText(/live movement visualization/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/live movement visualization/i)).toBeInTheDocument();
    expect(screen.queryByText(/^pi1$/i)).not.toBeInTheDocument();
  });

  it("maps pi1, pi2, and pi3 to the right-leg sensor cards when Right leg is selected", async () => {
    const now = new Date().toISOString();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input) => {
        const url = String(input);
        if (url.includes("/api/health")) return jsonResponse({ status: "ok" });
        if (url.includes("/api/sessions/")) return jsonResponse({ sessions: [] });
        if (url.includes("/api/imu/latest")) {
          return jsonResponse({
            count: 3,
            items: [
              buildImuRow({ timestamp: now, device_id: "pi1", body_part: "hip", pitch: 8.4, roll: 1.1, acc_x: 0.11, acc_y: 0.01, acc_z: 0.97 }),
              buildImuRow({ timestamp: now, device_id: "pi2", body_part: "thigh", pitch: 17.2, roll: 2.2, acc_x: 0.21, acc_y: 0.02, acc_z: 0.96 }),
              buildImuRow({ timestamp: now, device_id: "pi3", body_part: "shin", pitch: 33.9, roll: 3.3, acc_x: 0.31, acc_y: 0.03, acc_z: 0.95 }),
            ],
          });
        }
        if (url.includes("/api/imu/data")) {
          return jsonResponse({
            count: 3,
            items: [
              buildImuRow({ timestamp: now, device_id: "pi1", body_part: "hip", pitch: 8.4, roll: 1.1, acc_x: 0.11, acc_y: 0.01, acc_z: 0.97 }),
              buildImuRow({ timestamp: now, device_id: "pi2", body_part: "thigh", pitch: 17.2, roll: 2.2, acc_x: 0.21, acc_y: 0.02, acc_z: 0.96 }),
              buildImuRow({ timestamp: now, device_id: "pi3", body_part: "shin", pitch: 33.9, roll: 3.3, acc_x: 0.31, acc_y: 0.03, acc_z: 0.95 }),
            ],
          });
        }
        if (url.includes("/api/koos/calculate")) return jsonResponse({ koos_total: 72.4, subscales: {} });
        if (url.includes("/api/predict-kl")) return jsonResponse({ kl_grade: 2, confidence: 0.87, kl_scale_max: 4 });
        if (url.includes("/api/imu/analyze")) return jsonResponse({ rom_deg: 94, session_summary: { rom_deg: 94, rom_valid: true } });
        if (url.includes("/api/rehab/report")) return jsonResponse({ session_id: "session-123" });
        return jsonResponse({});
      }),
    );

    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getAllByRole("button", { name: /IMU movement analysis/i })[0]);
    await user.click(screen.getByRole("radio", { name: /use raspberry pi sensor data/i }));
    await user.selectOptions(screen.getByLabelText(/selected leg/i), "right");

    const sensorCards = screen.getByLabelText(/sensor cards/i);
    expect(within(sensorCards).getByText(/right hip/i)).toBeInTheDocument();
    expect(within(sensorCards).getByText(/right thigh\/knee/i)).toBeInTheDocument();
    expect(within(sensorCards).getByText(/right ankle\/shin/i)).toBeInTheDocument();
    expect(within(sensorCards).getByText(/^pi1$/i)).toBeInTheDocument();
    expect(within(sensorCards).getByText(/^pi2$/i)).toBeInTheDocument();
    expect(within(sensorCards).getByText(/^pi3$/i)).toBeInTheDocument();
  });

  it("shows only Raspberry Pi rows in the recent IMU table for Raspberry Pi mode", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getAllByRole("button", { name: /IMU movement analysis/i })[0]);
    await user.click(screen.getByRole("radio", { name: /use raspberry pi sensor data/i }));

    expect(screen.getByText(/recent imu data/i)).toBeInTheDocument();
    expect(screen.getAllByText(/device id/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/^pi1$/i).length).toBeGreaterThan(0);
    expect(screen.queryByText(/^ble_left_arm$/i)).not.toBeInTheDocument();
  });

  it("shows only Bluetooth rows in the recent IMU table for WitMotion mode and remaps legacy device labels", async () => {
    const now = new Date().toISOString();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input) => {
        const url = String(input);
        if (url.includes("/api/health")) return jsonResponse({ status: "ok" });
        if (url.includes("/api/sessions/")) return jsonResponse({ sessions: [] });
        if (url.includes("/api/imu/latest")) {
          return jsonResponse({
            count: 2,
            items: [
              buildImuRow({ timestamp: now, device_id: "pi1", body_part: "hip", pitch: 8.4, roll: 1.1, acc_x: 0.11, acc_y: 0.01, acc_z: 0.97 }),
              buildImuRow({ timestamp: now, device_id: "ble_left_arm", body_part: "arm", pitch: 12.3, roll: 4.5, acc_x: 0.1, acc_y: 0.2, acc_z: 0.9 }),
            ],
          });
        }
        if (url.includes("/api/imu/data")) {
          return jsonResponse({
            count: 2,
            items: [
              buildImuRow({ timestamp: now, device_id: "pi1", body_part: "hip", pitch: 8.4, roll: 1.1, acc_x: 0.11, acc_y: 0.01, acc_z: 0.97 }),
              buildImuRow({ timestamp: now, device_id: "ble_left_arm", body_part: "arm", pitch: 12.3, roll: 4.5, acc_x: 0.1, acc_y: 0.2, acc_z: 0.9 }),
            ],
          });
        }
        return jsonResponse({});
      }),
    );

    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getAllByRole("button", { name: /IMU movement analysis/i })[0]);
    await user.click(screen.getByRole("radio", { name: /use witmotion bluetooth sensor data/i }));

    expect(screen.getAllByText(/source/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/bluetooth/i).length).toBeGreaterThan(0);
    expect(screen.queryByText(/^pi1$/i)).not.toBeInTheDocument();
    expect(screen.getAllByText(/^ble_left_arm$/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/left thigh \/ knee/i).length).toBeGreaterThan(0);
    expect(screen.queryByText(/^arm$/i)).not.toBeInTheDocument();
  });

  it("does not show the removed demo seed controls in Step 4 live mode", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getAllByRole("button", { name: /IMU movement analysis/i })[0]);
    await user.click(screen.getByRole("radio", { name: /use raspberry pi sensor data/i }));

    expect(screen.queryByRole("button", { name: /seed demo imu data/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /clear demo data/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/demo imu sample data/i)).not.toBeInTheDocument();
  });

  it("analyzes Raspberry Pi ROM from fetched backend rows without calling the CSV analysis endpoint", async () => {
    const now = new Date().toISOString();
    const fetchMock = vi.fn(async (input) => {
      const url = String(input);
      if (url.includes("/api/health")) return jsonResponse({ status: "ok" });
      if (url.includes("/api/sessions/")) return jsonResponse({ sessions: [] });
      if (url.includes("/api/imu/latest")) {
        return jsonResponse({
          count: 3,
          items: [
            buildImuRow({ timestamp: now, device_id: "pi1", body_part: "hip", pitch: 6, roll: 1, acc_x: 0.11, acc_y: 0.01, acc_z: 0.97 }),
            buildImuRow({ timestamp: now, device_id: "pi2", body_part: "thigh", pitch: 10, roll: 2, acc_x: 0.21, acc_y: 0.02, acc_z: 0.96 }),
            buildImuRow({ timestamp: now, device_id: "pi3", body_part: "shin", pitch: 28, roll: 3, acc_x: 0.31, acc_y: 0.03, acc_z: 0.95 }),
          ],
        });
      }
      if (url.includes("/api/imu/data")) {
        return jsonResponse({
          count: 6,
          items: [
            buildImuRow({ timestamp: "2026-06-10T10:00:00Z", device_id: "pi2", body_part: "thigh", pitch: 5, roll: 1, acc_x: 0.2, acc_y: 0.01, acc_z: 0.96 }),
            buildImuRow({ timestamp: "2026-06-10T10:00:01Z", device_id: "pi3", body_part: "shin", pitch: 12, roll: 1, acc_x: 0.3, acc_y: 0.01, acc_z: 0.95 }),
            buildImuRow({ timestamp: "2026-06-10T10:00:02Z", device_id: "pi2", body_part: "thigh", pitch: 9, roll: 1, acc_x: 0.2, acc_y: 0.01, acc_z: 0.96 }),
            buildImuRow({ timestamp: "2026-06-10T10:00:03Z", device_id: "pi3", body_part: "shin", pitch: 27, roll: 1, acc_x: 0.3, acc_y: 0.01, acc_z: 0.95 }),
            buildImuRow({ timestamp: "2026-06-10T10:00:04Z", device_id: "pi1", body_part: "hip", pitch: 7, roll: 1, acc_x: 0.1, acc_y: 0.01, acc_z: 0.97 }),
            buildImuRow({ timestamp: "2026-06-10T10:00:05Z", device_id: "pi3", body_part: "shin", pitch: 18, roll: 1, acc_x: 0.3, acc_y: 0.01, acc_z: 0.95 }),
          ],
        });
      }
      if (url.includes("/api/koos/calculate")) return jsonResponse({ koos_total: 72.4, subscales: {} });
      if (url.includes("/api/predict-kl")) return jsonResponse({ kl_grade: 2, confidence: 0.87, kl_scale_max: 4 });
      if (url.includes("/api/rehab/report")) return jsonResponse({ session_id: "session-123" });
      if (url.includes("/api/imu/analyze")) return jsonResponse({ rom_deg: 94, session_summary: { rom_deg: 94, rom_valid: true } });
      return jsonResponse({});
    });
    vi.stubGlobal("fetch", fetchMock);

    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getAllByRole("button", { name: /IMU movement analysis/i })[0]);
    await user.click(screen.getByRole("radio", { name: /use raspberry pi sensor data/i }));
    await user.click(screen.getByRole("button", { name: /analyze ROM/i }));

    expect(await screen.findByText(/IMU movement analysis completed/i)).toBeInTheDocument();
    expect(screen.getAllByText("18.0°").length).toBeGreaterThan(0);
    expect(screen.getByText(/live_3sensor_stream/i)).toBeInTheDocument();
    expect(screen.getByText(/live_relative_angle/i)).toBeInTheDocument();
    expect(screen.getAllByText(/^left$/i).length).toBeGreaterThan(0);
    expect(fetchMock.mock.calls.some(([input]) => String(input).includes("/api/imu/analyze"))).toBe(false);
  });

  it("shows a clear warning when pi2 or pi3 data is missing in Raspberry Pi mode", async () => {
    const now = new Date().toISOString();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input) => {
        const url = String(input);
        if (url.includes("/api/health")) return jsonResponse({ status: "ok" });
        if (url.includes("/api/sessions/")) return jsonResponse({ sessions: [] });
        if (url.includes("/api/imu/latest")) {
          return jsonResponse({
            count: 1,
            items: [
              buildImuRow({ timestamp: now, device_id: "pi1", body_part: "hip", pitch: 8.4, roll: 1.1, acc_x: 0.11, acc_y: 0.01, acc_z: 0.97 }),
            ],
          });
        }
        if (url.includes("/api/imu/data")) {
          return jsonResponse({
            count: 1,
            items: [
              buildImuRow({ timestamp: now, device_id: "pi1", body_part: "hip", pitch: 8.4, roll: 1.1, acc_x: 0.11, acc_y: 0.01, acc_z: 0.97 }),
            ],
          });
        }
        if (url.includes("/api/koos/calculate")) return jsonResponse({ koos_total: 72.4, subscales: {} });
        if (url.includes("/api/predict-kl")) return jsonResponse({ kl_grade: 2, confidence: 0.87, kl_scale_max: 4 });
        if (url.includes("/api/imu/analyze")) return jsonResponse({ rom_deg: 94, session_summary: { rom_deg: 94, rom_valid: true } });
        if (url.includes("/api/rehab/report")) return jsonResponse({ session_id: "session-123" });
        return jsonResponse({});
      }),
    );

    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getAllByRole("button", { name: /IMU movement analysis/i })[0]);
    await user.click(screen.getByRole("radio", { name: /use raspberry pi sensor data/i }));
    await user.click(screen.getByRole("button", { name: /analyze ROM/i }));

    expect(await screen.findByText(/need thigh\/knee and ankle\/shin sensor data to calculate rom/i)).toBeInTheDocument();
  });

  it("shows a Bluetooth mapping warning when analyzing in WitMotion mode", async () => {
    const now = new Date().toISOString();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input) => {
        const url = String(input);
        if (url.includes("/api/health")) return jsonResponse({ status: "ok" });
        if (url.includes("/api/sessions/")) return jsonResponse({ sessions: [] });
        if (url.includes("/api/imu/latest")) {
          return jsonResponse({
            count: 2,
            items: [
              buildImuRow({ timestamp: now, device_id: "ble_left_leg", body_part: "leg", pitch: 16.5, roll: 2.1, acc_x: 0.2, acc_y: 0.1, acc_z: 0.9 }),
              buildImuRow({ timestamp: now, device_id: "ble_right_leg", leg: "right", body_part: "leg", pitch: 18.4, roll: 2.8, acc_x: 0.3, acc_y: 0.1, acc_z: 0.8 }),
            ],
          });
        }
        if (url.includes("/api/imu/data")) {
          return jsonResponse({
            count: 2,
            items: [
              buildImuRow({ timestamp: now, device_id: "ble_left_leg", body_part: "leg", pitch: 16.5, roll: 2.1, acc_x: 0.2, acc_y: 0.1, acc_z: 0.9 }),
              buildImuRow({ timestamp: now, device_id: "ble_right_leg", leg: "right", body_part: "leg", pitch: 18.4, roll: 2.8, acc_x: 0.3, acc_y: 0.1, acc_z: 0.8 }),
            ],
          });
        }
        return jsonResponse({});
      }),
    );

    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getAllByRole("button", { name: /IMU movement analysis/i })[0]);
    await user.click(screen.getByRole("radio", { name: /use witmotion bluetooth sensor data/i }));
    await user.click(screen.getByRole("button", { name: /analyze ROM/i }));

    expect((await screen.findAllByText(/witmotion sensors are live\. knee rom calculation needs a mapped thigh\/knee and shin\/ankle pair\./i)).length).toBeGreaterThan(0);
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

  it("shows a six-step workflow without a separate real IMU page", async () => {
    const user = userEvent.setup();
    const { container } = render(<App />);

    expect(screen.queryByRole("button", { name: /refresh/i })).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /exercise videos/i })[0]).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /real imu sensor/i })).not.toBeInTheDocument();
    expect(container.querySelectorAll(".stepList .stepItem")).toHaveLength(6);

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

    expect(await screen.findByText(/step 4 of 6 complete/i)).toBeInTheDocument();
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

    expect(await screen.findByText(/step 5 of 6 complete/i)).toBeInTheDocument();
    expect(screen.getAllByText(/final rehabilitation score/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/IMU rehab score/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText("130.7").length).toBeGreaterThan(0);
    expect(screen.getByText("RAW REHAB SCORE")).toBeInTheDocument();
    expect(screen.getAllByText(/^Final mapped score$/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/^8.2$/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /continue to exercise videos/i }));

    expect(await screen.findByText(/step 6 of 6 complete/i)).toBeInTheDocument();
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
  });

  it("keeps the wizard at six steps and does not render any Step 7 UI", async () => {
    const { container } = render(<App />);

    expect(container.querySelectorAll(".stepList .stepItem")).toHaveLength(6);
    expect(screen.queryByText(/step 7/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /step 7/i })).not.toBeInTheDocument();
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
