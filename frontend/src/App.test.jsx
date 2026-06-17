import { beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
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
  yaw = 0,
  acc_x,
  acc_y,
  acc_z,
  temperature = 35.8,
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
    yaw,
    temperature,
  };
}

function buildRealtimeMixedRows(now = new Date().toISOString()) {
  return [
    buildImuRow({ timestamp: now, device_id: "pi1", body_part: "hip", pitch: 2.1, roll: -0.8, yaw: 0.2, acc_x: 0.0, acc_y: 0.1, acc_z: 1.0 }),
    buildImuRow({ timestamp: now, device_id: "pi2", body_part: "thigh/knee", pitch: 12.0, roll: -33.6, yaw: 0.4, acc_x: 0.1, acc_y: 0.0, acc_z: 0.9 }),
    buildImuRow({ timestamp: now, device_id: "pi3", body_part: "shin/ankle", pitch: 30.0, roll: 2.3, yaw: -0.1, acc_x: -0.1, acc_y: 0.0, acc_z: 1.0 }),
    buildImuRow({ timestamp: now, device_id: "ble_right_hip", leg: "right", body_part: "hip", pitch: -1.4, roll: 0.6, yaw: 0.1, acc_x: 0.0, acc_y: 0.0, acc_z: 1.0, temperature: 31.8 }),
    buildImuRow({ timestamp: now, device_id: "ble_right_thigh", leg: "right", body_part: "thigh/knee", pitch: 8.0, roll: -32.6, yaw: 0.3, acc_x: 0.1, acc_y: 0.0, acc_z: 0.9, temperature: 31.9 }),
    buildImuRow({ timestamp: now, device_id: "ble_right_shin", leg: "right", body_part: "shin/ankle", pitch: 24.0, roll: 2.1, yaw: -0.2, acc_x: -0.1, acc_y: 0.0, acc_z: 1.0, temperature: 32.0 }),
  ];
}

function mockBluetoothApi(overrides = {}) {
  const requestDevice = vi.fn();
  const bluetooth = {
    requestDevice,
    ...overrides,
  };
  Object.defineProperty(window.navigator, "bluetooth", {
    configurable: true,
    value: bluetooth,
  });
  return bluetooth;
}

function toSignedWord(value) {
  const normalized = value < 0 ? 0x10000 + value : value;
  return [normalized & 0xff, (normalized >> 8) & 0xff];
}

function buildWitMotionAngleFrame({ roll = 0, pitch = 0, yaw = 0, temperature = 0 }) {
  const frame = [0x55, 0x53];
  frame.push(...toSignedWord(roll));
  frame.push(...toSignedWord(pitch));
  frame.push(...toSignedWord(yaw));
  frame.push(...toSignedWord(temperature));
  const checksum = frame.reduce((sum, value) => sum + value, 0) & 0xff;
  frame.push(checksum);
  return Uint8Array.from(frame);
}

function createMockBleConnection(name = "WT901BLE") {
  const listeners = new Set();
  let disconnectHandler = null;
  const characteristic = {
    uuid: "0000ffe4-0000-1000-8000-00805f9a34fb",
    properties: { notify: true },
    startNotifications: vi.fn(async () => characteristic),
    stopNotifications: vi.fn(async () => {}),
    addEventListener: vi.fn((event, handler) => {
      if (event === "characteristicvaluechanged") listeners.add(handler);
    }),
    removeEventListener: vi.fn((event, handler) => {
      if (event === "characteristicvaluechanged") listeners.delete(handler);
    }),
  };
  const service = {
    getCharacteristics: vi.fn(async () => [characteristic]),
  };
  const server = {
    getPrimaryServices: vi.fn(async () => [service]),
  };
  const device = {
    name,
    gatt: {
      connect: vi.fn(async () => server),
      disconnect: vi.fn(() => {
        if (disconnectHandler) disconnectHandler();
      }),
    },
    addEventListener: vi.fn((event, handler) => {
      if (event === "gattserverdisconnected") disconnectHandler = handler;
    }),
  };

  return {
    device,
    emit(frame) {
      const bytes = frame instanceof Uint8Array ? frame : Uint8Array.from(frame);
      const value = new DataView(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
      for (const handler of listeners) {
        handler({ target: { value } });
      }
    },
  };
}

async function completeWizardToImuStep(user, container) {
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
    mockBluetoothApi();
    Object.defineProperty(window, "isSecureContext", {
      configurable: true,
      value: true,
    });
    window.history.replaceState({}, "", "http://localhost:3000/");
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

  it("renders Step 4 with exactly two source choices: CSV and real-time IMU data", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getAllByRole("button", { name: /IMU movement analysis/i })[0]);

    expect(screen.getByRole("radio", { name: /upload imu csv/i })).toBeChecked();
    expect(screen.getByRole("radio", { name: /real-time imu data/i })).not.toBeChecked();
    expect(screen.getByText(/upload a recorded imu csv file for offline knee rom analysis/i)).toBeInTheDocument();
    expect(screen.getByText(/use raspberry pi sensors for the left leg and witmotion bluetooth sensors for the right leg/i)).toBeInTheDocument();
    expect(screen.getAllByRole("radio")).toHaveLength(2);
    expect(screen.queryByRole("radio", { name: /use raspberry pi sensor data/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("radio", { name: /use witmotion bluetooth sensor data/i })).not.toBeInTheDocument();
  });

  it("shows KL image grading as complete after a KL result exists", async () => {
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

    const klStep = screen.getByRole("button", { name: /3 KL image grading COMPLETE/i });
    expect(klStep).toBeInTheDocument();
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

  it("does not show the IMU result placeholder before Analyze ROM is pressed", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getAllByRole("button", { name: /IMU movement analysis/i })[0]);

    expect(screen.queryByText(/no imu result yet/i)).not.toBeInTheDocument();
  });

  it("shows compact real-time status and the live visualization in real-time mode", async () => {
    const now = new Date().toISOString();
    const older = new Date(Date.now() - 60_000).toISOString();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input) => {
        const url = String(input);
        if (url.includes("/api/health")) return jsonResponse({ status: "ok" });
        if (url.includes("/api/sessions/")) return jsonResponse({ sessions: [] });
        if (url.includes("/api/imu/latest")) return jsonResponse({ count: 6, items: buildRealtimeMixedRows(now) });
        if (url.includes("/api/imu/data")) {
          return jsonResponse({
            count: 7,
            items: [
              ...buildRealtimeMixedRows(now),
              buildImuRow({ timestamp: older, device_id: "pi1", body_part: "hip", pitch: 1.0, roll: 0.4, yaw: 0.1, acc_x: 0.0, acc_y: 0.1, acc_z: 1.0 }),
            ],
          });
        }
        return jsonResponse({});
      }),
    );

    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getAllByRole("button", { name: /IMU movement analysis/i })[0]);
    await user.click(screen.getByRole("radio", { name: /real-time imu data/i }));

    expect(screen.queryByText(/raspberry pi imu sensors \(left leg\)/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/witmotion imu sensors \(right leg\)/i)).not.toBeInTheDocument();
    expect(screen.getByText(/real-time sensor status/i)).toBeInTheDocument();
    expect(screen.getAllByTestId("imu-status-card")).toHaveLength(6);
    expect(screen.getAllByText(/^pi1$/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/^pi2$/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/^pi3$/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/^ble_right_hip$/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/^ble_right_thigh$/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/^ble_right_shin$/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/left hip/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/left thigh \/ knee/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/left shin \/ ankle/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/right hip/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/right thigh \/ knee/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/right shin \/ ankle/i).length).toBeGreaterThan(0);
    expect(screen.queryByText(/arm/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/foot/i)).not.toBeInTheDocument();
    expect(screen.getByText(/live movement visualization/i)).toBeInTheDocument();
    expect(screen.getByText(/left leg — raspberry pi/i)).toBeInTheDocument();
    expect(screen.getByText(/right leg — witmotion/i)).toBeInTheDocument();
    expect(screen.getByText(/sensor blocks are shown on their body position/i)).toBeInTheDocument();
    expect(screen.queryByText(/move each physical sensor and watch the matching block rotate in real time/i)).not.toBeInTheDocument();
    expect(screen.getAllByTestId("imu-visualization-block")).toHaveLength(6);
    expect(screen.getByText(/recent imu data \(latest 5\)/i)).toBeInTheDocument();
    expect(within(screen.getByTestId("imu-live-table-body")).getAllByRole("row")).toHaveLength(5);
    expect(screen.getAllByText(/raspberry pi/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/witmotion/i).length).toBeGreaterThan(0);
  });

  it("shows the unsupported browser message when Web Bluetooth is unavailable", async () => {
    Object.defineProperty(window.navigator, "bluetooth", {
      configurable: true,
      value: undefined,
    });

    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getAllByRole("button", { name: /IMU movement analysis/i })[0]);
    await user.click(screen.getByRole("radio", { name: /real-time imu data/i }));

    expect(screen.getByText(/web bluetooth is not supported\. please use chrome or edge\./i)).toBeInTheDocument();
  });

  it("shows the insecure page message when Bluetooth cannot run on the current origin", async () => {
    Object.defineProperty(window, "isSecureContext", {
      configurable: true,
      value: false,
    });
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...window.location, hostname: "example.test" },
    });

    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getAllByRole("button", { name: /IMU movement analysis/i })[0]);
    await user.click(screen.getByRole("radio", { name: /real-time imu data/i }));

    expect(screen.getByText(/bluetooth needs https or localhost\./i)).toBeInTheDocument();
  });

  it("renders three WitMotion BLE sensor cards with connect actions", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getAllByRole("button", { name: /IMU movement analysis/i })[0]);
    await user.click(screen.getByRole("radio", { name: /real-time imu data/i }));

    expect(screen.getByRole("button", { name: /connect all sensors/i })).toBeInTheDocument();
    expect(screen.getAllByText(/^right hip$/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/^right thigh \/ knee$/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/^right shin \/ ankle$/i).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("button", { name: /^connect$/i })).toHaveLength(3);
  });

  it("throttles browser BLE posts so multiple packets inside 5 seconds produce one POST", async () => {
    let nowMs = Date.parse("2026-06-16T09:00:00Z");
    vi.spyOn(Date, "now").mockImplementation(() => nowMs);

    const fetchMock = vi.fn(async (input, init) => {
      const url = String(input);
      if (url.includes("/api/health")) return jsonResponse({ status: "ok" });
      if (url.includes("/api/sessions/")) return jsonResponse({ sessions: [] });
      if (url.includes("/api/imu/latest")) return jsonResponse({ count: 0, items: [] });
      if (url.includes("/api/imu/data")) return jsonResponse({ count: 0, items: [] });
      if (url.includes("/api/imu") && init?.method === "POST") return jsonResponse({ status: "ok" });
      return jsonResponse({});
    });
    vi.stubGlobal("fetch", fetchMock);

    const ble = createMockBleConnection("WT901 Hip");
    mockBluetoothApi({ requestDevice: vi.fn(async () => ble.device) });

    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getAllByRole("button", { name: /IMU movement analysis/i })[0]);
    await user.click(screen.getByRole("radio", { name: /real-time imu data/i }));
    await user.click(screen.getAllByRole("button", { name: /^connect$/i })[0]);
    await Promise.resolve();
    await Promise.resolve();

    ble.emit(buildWitMotionAngleFrame({ pitch: 1000 }));
    nowMs += 1000;
    ble.emit(buildWitMotionAngleFrame({ pitch: 1100 }));
    nowMs += 1000;
    ble.emit(buildWitMotionAngleFrame({ pitch: 1200 }));
    await Promise.resolve();
    await Promise.resolve();

    const postCalls = fetchMock.mock.calls.filter(
      ([input, init]) => String(input).includes("/api/imu") && init?.method === "POST",
    );
    expect(postCalls).toHaveLength(1);
    expect(within(screen.getByTestId("imu-live-table-body")).getAllByRole("row")).toHaveLength(1);
  });

  it("allows another browser BLE POST after 5 seconds have passed", async () => {
    let nowMs = Date.parse("2026-06-16T09:00:00Z");
    vi.spyOn(Date, "now").mockImplementation(() => nowMs);

    const fetchMock = vi.fn(async (input, init) => {
      const url = String(input);
      if (url.includes("/api/health")) return jsonResponse({ status: "ok" });
      if (url.includes("/api/sessions/")) return jsonResponse({ sessions: [] });
      if (url.includes("/api/imu/latest")) return jsonResponse({ count: 0, items: [] });
      if (url.includes("/api/imu/data")) return jsonResponse({ count: 0, items: [] });
      if (url.includes("/api/imu") && init?.method === "POST") return jsonResponse({ status: "ok" });
      return jsonResponse({});
    });
    vi.stubGlobal("fetch", fetchMock);

    const ble = createMockBleConnection("WT901 Hip");
    mockBluetoothApi({ requestDevice: vi.fn(async () => ble.device) });

    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getAllByRole("button", { name: /IMU movement analysis/i })[0]);
    await user.click(screen.getByRole("radio", { name: /real-time imu data/i }));
    await user.click(screen.getAllByRole("button", { name: /^connect$/i })[0]);
    await Promise.resolve();
    await Promise.resolve();

    ble.emit(buildWitMotionAngleFrame({ pitch: 1000 }));
    await Promise.resolve();
    await Promise.resolve();
    nowMs += 5000;
    ble.emit(buildWitMotionAngleFrame({ pitch: 1400 }));
    await Promise.resolve();
    await Promise.resolve();

    const postCalls = fetchMock.mock.calls.filter(
      ([input, init]) => String(input).includes("/api/imu") && init?.method === "POST",
    );
    expect(postCalls).toHaveLength(2);
    expect(within(screen.getByTestId("imu-live-table-body")).getAllByRole("row")).toHaveLength(2);
  });

  it("analyzes both left and right ROM in real-time mode without calling the CSV endpoint", async () => {
    const now = new Date().toISOString();
    const fetchMock = vi.fn(async (input) => {
      const url = String(input);
      if (url.includes("/api/health")) return jsonResponse({ status: "ok" });
      if (url.includes("/api/sessions/")) return jsonResponse({ sessions: [] });
      if (url.includes("/api/imu/latest")) return jsonResponse({ count: 6, items: buildRealtimeMixedRows(now) });
      if (url.includes("/api/imu/data")) {
        return jsonResponse({
          count: 8,
          items: [
            buildImuRow({ timestamp: "2026-06-10T10:00:00Z", device_id: "pi2", body_part: "thigh/knee", pitch: 6, roll: 0, acc_x: 0.2, acc_y: 0.01, acc_z: 0.96 }),
            buildImuRow({ timestamp: "2026-06-10T10:00:01Z", device_id: "pi3", body_part: "shin/ankle", pitch: 18, roll: 0, acc_x: 0.3, acc_y: 0.01, acc_z: 0.95 }),
            buildImuRow({ timestamp: "2026-06-10T10:00:02Z", device_id: "pi2", body_part: "thigh/knee", pitch: 10, roll: 0, acc_x: 0.2, acc_y: 0.01, acc_z: 0.96 }),
            buildImuRow({ timestamp: "2026-06-10T10:00:03Z", device_id: "pi3", body_part: "shin/ankle", pitch: 28, roll: 0, acc_x: 0.3, acc_y: 0.01, acc_z: 0.95 }),
            buildImuRow({ timestamp: "2026-06-10T10:00:04Z", device_id: "ble_right_thigh", leg: "right", body_part: "thigh/knee", pitch: 4, roll: 0, acc_x: 0.1, acc_y: 0.0, acc_z: 0.9 }),
            buildImuRow({ timestamp: "2026-06-10T10:00:05Z", device_id: "ble_right_shin", leg: "right", body_part: "shin/ankle", pitch: 12, roll: 0, acc_x: -0.1, acc_y: 0.0, acc_z: 1.0 }),
            buildImuRow({ timestamp: "2026-06-10T10:00:06Z", device_id: "ble_right_thigh", leg: "right", body_part: "thigh/knee", pitch: 8, roll: 0, acc_x: 0.1, acc_y: 0.0, acc_z: 0.9 }),
            buildImuRow({ timestamp: "2026-06-10T10:00:07Z", device_id: "ble_right_shin", leg: "right", body_part: "shin/ankle", pitch: 24, roll: 0, acc_x: -0.1, acc_y: 0.0, acc_z: 1.0 }),
          ],
        });
      }
      if (url.includes("/api/imu/analyze")) return jsonResponse({ rom_deg: 94, session_summary: { rom_deg: 94, rom_valid: true } });
      return jsonResponse({});
    });
    vi.stubGlobal("fetch", fetchMock);

    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getAllByRole("button", { name: /IMU movement analysis/i })[0]);
    await user.click(screen.getByRole("radio", { name: /real-time imu data/i }));
    await user.click(screen.getByRole("button", { name: /analyze ROM/i }));

    expect(await screen.findByText(/left-leg rom \(raspberry pi\)/i)).toBeInTheDocument();
    expect(screen.getByText(/right-leg rom \(witmotion\)/i)).toBeInTheDocument();
    expect(screen.getAllByText("12.0°").length).toBeGreaterThan(0);
    expect(screen.getAllByText("8.0°").length).toBeGreaterThan(0);
    expect(fetchMock.mock.calls.some(([input]) => String(input).includes("/api/imu/analyze"))).toBe(false);
  });

  it("normalizes legacy BLE IDs into the new right-leg mapping in real-time mode", async () => {
    const now = new Date().toISOString();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input) => {
        const url = String(input);
        if (url.includes("/api/health")) return jsonResponse({ status: "ok" });
        if (url.includes("/api/sessions/")) return jsonResponse({ sessions: [] });
        if (url.includes("/api/imu/latest")) {
          return jsonResponse({
            count: 6,
            items: [
              buildImuRow({ timestamp: now, device_id: "pi1", body_part: "hip", pitch: 1, roll: 1, acc_x: 0, acc_y: 0.1, acc_z: 1 }),
              buildImuRow({ timestamp: now, device_id: "pi2", body_part: "thigh/knee", pitch: 2, roll: 1, acc_x: 0.1, acc_y: 0, acc_z: 1 }),
              buildImuRow({ timestamp: now, device_id: "pi3", body_part: "shin/ankle", pitch: 3, roll: 1, acc_x: -0.1, acc_y: 0, acc_z: 1 }),
              buildImuRow({ timestamp: now, device_id: "ble_left_arm", body_part: "arm", pitch: 4, roll: 1, acc_x: 0, acc_y: 0, acc_z: 1 }),
              buildImuRow({ timestamp: now, device_id: "ble_left_leg", body_part: "leg", pitch: 5, roll: 1, acc_x: 0.1, acc_y: 0, acc_z: 1 }),
              buildImuRow({ timestamp: now, device_id: "ble_right_arm", leg: "right", body_part: "arm", pitch: 6, roll: 1, acc_x: -0.1, acc_y: 0, acc_z: 1 }),
            ],
          });
        }
        if (url.includes("/api/imu/data")) return jsonResponse({ count: 6, items: buildRealtimeMixedRows(now) });
        return jsonResponse({});
      }),
    );

    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getAllByRole("button", { name: /IMU movement analysis/i })[0]);
    await user.click(screen.getByRole("radio", { name: /real-time imu data/i }));

    expect(screen.getAllByText(/^ble_right_hip$/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/^ble_right_thigh$/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/^ble_right_shin$/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/right hip/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/right thigh \/ knee/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/right shin \/ ankle/i).length).toBeGreaterThan(0);
  });

  it("shows only the left warning when the Raspberry Pi pair is missing in real-time mode", async () => {
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
              buildImuRow({ timestamp: now, device_id: "ble_right_thigh", leg: "right", body_part: "thigh/knee", pitch: 10, roll: 1, acc_x: 0.1, acc_y: 0, acc_z: 1 }),
              buildImuRow({ timestamp: now, device_id: "ble_right_shin", leg: "right", body_part: "shin/ankle", pitch: 22, roll: 1, acc_x: -0.1, acc_y: 0, acc_z: 1 }),
            ],
          });
        }
        if (url.includes("/api/imu/data")) {
          return jsonResponse({
            count: 3,
            items: [
              buildImuRow({ timestamp: now, device_id: "pi1", body_part: "hip", pitch: 8.4, roll: 1.1, acc_x: 0.11, acc_y: 0.01, acc_z: 0.97 }),
              buildImuRow({ timestamp: now, device_id: "ble_right_thigh", leg: "right", body_part: "thigh/knee", pitch: 10, roll: 1, acc_x: 0.1, acc_y: 0, acc_z: 1 }),
              buildImuRow({ timestamp: now, device_id: "ble_right_shin", leg: "right", body_part: "shin/ankle", pitch: 22, roll: 1, acc_x: -0.1, acc_y: 0, acc_z: 1 }),
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
    await user.click(screen.getByRole("radio", { name: /real-time imu data/i }));
    await user.click(screen.getByRole("button", { name: /analyze ROM/i }));

    expect(await screen.findByText(/left-leg raspberry pi rom needs left thigh\/knee \(pi2\) and left shin\/ankle \(pi3\) sensors/i)).toBeInTheDocument();
    expect(screen.queryByText(/right-leg witmotion rom needs right thigh\/knee and right shin\/ankle sensors/i)).not.toBeInTheDocument();
  });

  it("enables Continue to final rehab report when right-leg ROM is valid and left-leg warning remains", async () => {
    const now = new Date().toISOString();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input) => {
        const url = String(input);
        if (url.includes("/api/health")) return jsonResponse({ status: "ok" });
        if (url.includes("/api/sessions/")) {
          return jsonResponse({
            sessions: [{ session_id: "prev-1", current_rom: 4, created_at: "2026-06-10T09:00:00Z" }],
          });
        }
        if (url.includes("/api/imu/latest")) {
          return jsonResponse({
            count: 2,
            items: [
              buildImuRow({ timestamp: now, device_id: "ble_right_thigh", leg: "right", body_part: "thigh/knee", pitch: 10, roll: 1, acc_x: 0.1, acc_y: 0, acc_z: 1 }),
              buildImuRow({ timestamp: now, device_id: "ble_right_shin", leg: "right", body_part: "shin/ankle", pitch: 22, roll: 1, acc_x: -0.1, acc_y: 0, acc_z: 1 }),
            ],
          });
        }
        if (url.includes("/api/imu/data")) {
          return jsonResponse({
            count: 4,
            items: [
              buildImuRow({ timestamp: "2026-06-10T10:00:00Z", device_id: "ble_right_thigh", leg: "right", body_part: "thigh/knee", pitch: 4, roll: 0, acc_x: 0.1, acc_y: 0.0, acc_z: 0.9 }),
              buildImuRow({ timestamp: "2026-06-10T10:00:01Z", device_id: "ble_right_shin", leg: "right", body_part: "shin/ankle", pitch: 12, roll: 0, acc_x: -0.1, acc_y: 0.0, acc_z: 1.0 }),
              buildImuRow({ timestamp: "2026-06-10T10:00:02Z", device_id: "ble_right_thigh", leg: "right", body_part: "thigh/knee", pitch: 8, roll: 0, acc_x: 0.1, acc_y: 0.0, acc_z: 0.9 }),
              buildImuRow({ timestamp: "2026-06-10T10:00:03Z", device_id: "ble_right_shin", leg: "right", body_part: "shin/ankle", pitch: 24, roll: 0, acc_x: -0.1, acc_y: 0.0, acc_z: 1.0 }),
            ],
          });
        }
        return jsonResponse({});
      }),
    );

    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getAllByRole("button", { name: /IMU movement analysis/i })[0]);
    await user.click(screen.getByRole("radio", { name: /real-time imu data/i }));
    await user.click(screen.getByRole("button", { name: /analyze ROM/i }));

    expect(await screen.findByText(/left-leg raspberry pi rom needs left thigh\/knee \(pi2\) and left shin\/ankle \(pi3\) sensors/i)).toBeInTheDocument();
    expect(screen.getAllByText("8.0°").length).toBeGreaterThan(0);
    expect(screen.getByText(/needs sensor check/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /continue to final rehab report/i })).toBeEnabled();
  });

  it("shows only the right warning when the WitMotion pair is missing in real-time mode", async () => {
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
              buildImuRow({ timestamp: now, device_id: "pi2", body_part: "thigh/knee", pitch: 8, roll: 1, acc_x: 0.2, acc_y: 0.1, acc_z: 0.9 }),
              buildImuRow({ timestamp: now, device_id: "pi3", body_part: "shin/ankle", pitch: 20, roll: 1, acc_x: 0.3, acc_y: 0.1, acc_z: 0.8 }),
            ],
          });
        }
        if (url.includes("/api/imu/data")) {
          return jsonResponse({
            count: 2,
            items: [
              buildImuRow({ timestamp: now, device_id: "pi2", body_part: "thigh/knee", pitch: 8, roll: 1, acc_x: 0.2, acc_y: 0.1, acc_z: 0.9 }),
              buildImuRow({ timestamp: now, device_id: "pi3", body_part: "shin/ankle", pitch: 20, roll: 1, acc_x: 0.3, acc_y: 0.1, acc_z: 0.8 }),
            ],
          });
        }
        return jsonResponse({});
      }),
    );

    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getAllByRole("button", { name: /IMU movement analysis/i })[0]);
    await user.click(screen.getByRole("radio", { name: /real-time imu data/i }));
    await user.click(screen.getByRole("button", { name: /analyze ROM/i }));

    expect(await screen.findByText(/right-leg witmotion rom needs right thigh\/knee and right shin\/ankle sensors/i)).toBeInTheDocument();
    expect(screen.queryByText(/left-leg raspberry pi rom needs left thigh\/knee \(pi2\) and left shin\/ankle \(pi3\) sensors/i)).not.toBeInTheDocument();
  });

  it("keeps Continue to final rehab report disabled when no live ROM can be calculated", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input) => {
        const url = String(input);
        if (url.includes("/api/health")) return jsonResponse({ status: "ok" });
        if (url.includes("/api/sessions/")) return jsonResponse({ sessions: [] });
        if (url.includes("/api/imu/latest")) return jsonResponse({ count: 0, items: [] });
        if (url.includes("/api/imu/data")) return jsonResponse({ count: 0, items: [] });
        return jsonResponse({});
      }),
    );

    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getAllByRole("button", { name: /IMU movement analysis/i })[0]);
    await user.click(screen.getByRole("radio", { name: /real-time imu data/i }));
    await user.click(screen.getByRole("button", { name: /analyze ROM/i }));

    expect(await screen.findByText(/IMU movement analysis completed/i)).toBeInTheDocument();
    expect(screen.getAllByText("-").length).toBeGreaterThan(0);
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /continue to final rehab report/i })).toBeDisabled();
    });
  });

  it("uses the latest live IMU ROM in the final report after rerunning Step 4 analysis", async () => {
    let currentRows = [
      buildImuRow({ timestamp: "2026-06-10T10:00:00Z", device_id: "ble_right_thigh", leg: "right", body_part: "thigh/knee", pitch: 4, roll: 0, acc_x: 0.1, acc_y: 0.0, acc_z: 0.9 }),
      buildImuRow({ timestamp: "2026-06-10T10:00:01Z", device_id: "ble_right_shin", leg: "right", body_part: "shin/ankle", pitch: 12, roll: 0, acc_x: -0.1, acc_y: 0.0, acc_z: 1.0 }),
      buildImuRow({ timestamp: "2026-06-10T10:00:02Z", device_id: "ble_right_thigh", leg: "right", body_part: "thigh/knee", pitch: 8, roll: 0, acc_x: 0.1, acc_y: 0.0, acc_z: 0.9 }),
      buildImuRow({ timestamp: "2026-06-10T10:00:03Z", device_id: "ble_right_shin", leg: "right", body_part: "shin/ankle", pitch: 24, roll: 0, acc_x: -0.1, acc_y: 0.0, acc_z: 1.0 }),
    ];
    let reportPayload = null;
    const fetchMock = vi.fn(async (input, init) => {
      const url = String(input);
      if (url.includes("/api/health")) return jsonResponse({ status: "ok" });
      if (url.includes("/api/sessions/")) {
        return jsonResponse({
          sessions: [{ session_id: "prev-1", current_rom: 4, created_at: "2026-06-10T09:00:00Z" }],
        });
      }
      if (url.includes("/api/koos/calculate")) {
        return jsonResponse({
          koos_total: 72.4,
          subscales: { pain: 70, symptoms: 71, adl: 74, sport_rec: 73, qol: 74 },
        });
      }
      if (url.includes("/api/predict-kl")) {
        return jsonResponse({ kl_grade: 2, confidence: 0.87, kl_scale_max: 4 });
      }
      if (url.includes("/api/imu/latest")) {
        return jsonResponse({ count: currentRows.length, items: currentRows.slice(-2) });
      }
      if (url.includes("/api/imu/data")) {
        return jsonResponse({ count: currentRows.length, items: currentRows });
      }
      if (url.includes("/api/rehab/report")) {
        reportPayload = JSON.parse(String(init?.body || "{}"));
        const currentRom = Number(reportPayload?.imu_result?.session_summary?.rom_deg);
        return jsonResponse({
          session_id: "session-latest",
          raw_score: 70.0,
          predicted_delta_KOOS: 70.0,
          final_rehab_score: 58.0,
          rehab_level_label: "Level 3",
          rehab_level_meaning: "moderate / continue rehab",
          KOOS_pre: 72.4,
          current_ROM: currentRom,
          previous_ROM: 4,
          delta_ROM: Number((currentRom - 4).toFixed(1)),
          rehab_score: null,
          KL_grade: 2,
          interpretation: "stable",
          score_meaning: "Latest IMU result was used.",
          delta_note: "Latest Step 4 analysis carried into the report.",
          recommendations: [],
          beta0: 139.95,
          beta1: -0.93,
          beta2: -0.785,
          beta3_KL: -7.93,
          raw_score_mapping_low: 20.6,
          raw_score_mapping_high: 140.55,
          created_at: "2026-06-16T10:00:00Z",
          recommended_exercises: [],
        });
      }
      return jsonResponse({});
    });
    vi.stubGlobal("fetch", fetchMock);

    const user = userEvent.setup();
    const { container } = render(<App />);

    await completeWizardToImuStep(user, container);
    await user.click(screen.getByRole("radio", { name: /real-time imu data/i }));
    await user.click(screen.getByRole("button", { name: /analyze ROM/i }));
    expect(await screen.findAllByText("8.0°")).not.toHaveLength(0);

    currentRows = [
      buildImuRow({ timestamp: "2026-06-10T11:00:00Z", device_id: "ble_right_thigh", leg: "right", body_part: "thigh/knee", pitch: 6, roll: 0, acc_x: 0.1, acc_y: 0.0, acc_z: 0.9 }),
      buildImuRow({ timestamp: "2026-06-10T11:00:01Z", device_id: "ble_right_shin", leg: "right", body_part: "shin/ankle", pitch: 14, roll: 0, acc_x: -0.1, acc_y: 0.0, acc_z: 1.0 }),
      buildImuRow({ timestamp: "2026-06-10T11:00:02Z", device_id: "ble_right_thigh", leg: "right", body_part: "thigh/knee", pitch: 10, roll: 0, acc_x: 0.1, acc_y: 0.0, acc_z: 0.9 }),
      buildImuRow({ timestamp: "2026-06-10T11:00:03Z", device_id: "ble_right_shin", leg: "right", body_part: "shin/ankle", pitch: 30, roll: 0, acc_x: -0.1, acc_y: 0.0, acc_z: 1.0 }),
    ];

    await user.click(screen.getByRole("radio", { name: /upload imu csv/i }));
    await user.click(screen.getByRole("radio", { name: /real-time imu data/i }));
    expect(await screen.findAllByText("30.0°")).not.toHaveLength(0);
    await user.click(screen.getByRole("button", { name: /analyze ROM/i }));

    await user.click(screen.getByRole("button", { name: /continue to final rehab report/i }));
    expect(await screen.findByRole("heading", { name: /final rehab report/i })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /generate report/i }));

    await waitFor(() => {
      expect(reportPayload).not.toBeNull();
    });
    expect(reportPayload.imu_result.session_summary.rom_deg).toBe(16);
    expect(await screen.findByText(/latest step 4 analysis carried into the report/i)).toBeInTheDocument();
  }, 10000);

  it("does not show the removed demo seed controls in Step 4 live mode", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getAllByRole("button", { name: /IMU movement analysis/i })[0]);
    await user.click(screen.getByRole("radio", { name: /real-time imu data/i }));

    expect(screen.queryByRole("button", { name: /seed demo imu data/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /clear demo data/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/demo imu sample data/i)).not.toBeInTheDocument();
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
    expect(screen.queryByText(/no IMU result yet/i)).not.toBeInTheDocument();

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
  }, 15000);

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
  }, 10000);

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
  }, 10000);

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
  }, 10000);
});
