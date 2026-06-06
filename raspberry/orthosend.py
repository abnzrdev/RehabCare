#!/usr/bin/env python3
"""Send MPU6050 IMU samples from Raspberry Pi to the OrthoScan backend API."""

from __future__ import annotations

import json
import math
import signal
import sys
import time
import urllib.error
import urllib.request

try:
    import smbus  # type: ignore
except ImportError:  # pragma: no cover - runtime dependency on Raspberry Pi
    smbus = None


API_URL = "http://89.218.178.215:18190/api/imu"
DEVICE_ID = "pi1"
LEG = "left"
BODY_PART = "hip"
SEND_INTERVAL_SECONDS = 1

DEVICE_ADDRESS = 0x68
PWR_MGMT_1 = 0x6B
SMPLRT_DIV = 0x19
CONFIG = 0x1A
GYRO_CONFIG = 0x1B
INT_ENABLE = 0x38
ACCEL_XOUT_H = 0x3B
TEMP_OUT_H = 0x41
GYRO_XOUT_H = 0x43

_RUNNING = True


def handle_stop(signum, frame):  # noqa: ARG001
    global _RUNNING
    _RUNNING = False
    print("\nStopping IMU sender...")


def read_raw_data(bus, register):
    high = bus.read_byte_data(DEVICE_ADDRESS, register)
    low = bus.read_byte_data(DEVICE_ADDRESS, register + 1)
    value = (high << 8) | low
    if value > 32767:
        value -= 65536
    return value


def init_sensor(bus):
    bus.write_byte_data(DEVICE_ADDRESS, SMPLRT_DIV, 7)
    bus.write_byte_data(DEVICE_ADDRESS, PWR_MGMT_1, 1)
    bus.write_byte_data(DEVICE_ADDRESS, CONFIG, 0)
    bus.write_byte_data(DEVICE_ADDRESS, GYRO_CONFIG, 24)
    bus.write_byte_data(DEVICE_ADDRESS, INT_ENABLE, 1)


def read_sensor_sample(bus):
    acc_x = read_raw_data(bus, ACCEL_XOUT_H) / 16384.0
    acc_y = read_raw_data(bus, ACCEL_XOUT_H + 2) / 16384.0
    acc_z = read_raw_data(bus, ACCEL_XOUT_H + 4) / 16384.0

    temp_raw = read_raw_data(bus, TEMP_OUT_H)
    gyro_x = read_raw_data(bus, GYRO_XOUT_H) / 131.0
    gyro_y = read_raw_data(bus, GYRO_XOUT_H + 2) / 131.0
    gyro_z = read_raw_data(bus, GYRO_XOUT_H + 4) / 131.0

    temperature = (temp_raw / 340.0) + 36.53
    roll = math.atan2(acc_y, acc_z) * 57.3
    pitch = math.atan2(-acc_x, math.sqrt((acc_y * acc_y) + (acc_z * acc_z))) * 57.3

    return {
        "device_id": DEVICE_ID,
        "leg": LEG,
        "body_part": BODY_PART,
        "acc_x": round(acc_x, 4),
        "acc_y": round(acc_y, 4),
        "acc_z": round(acc_z, 4),
        "gyro_x": round(gyro_x, 4),
        "gyro_y": round(gyro_y, 4),
        "gyro_z": round(gyro_z, 4),
        "pitch": round(pitch, 4),
        "roll": round(roll, 4),
        "temperature": round(temperature, 4),
    }


def post_sample(sample):
    data = json.dumps(sample).encode("utf-8")
    request = urllib.request.Request(
        API_URL,
        data=data,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=10) as response:
        payload = response.read().decode("utf-8", errors="replace")
        return response.status, payload


def main():
    if smbus is None:
        print("ERROR: smbus is not installed. Install python3-smbus on the Raspberry Pi.", file=sys.stderr)
        return 1

    signal.signal(signal.SIGINT, handle_stop)
    signal.signal(signal.SIGTERM, handle_stop)

    try:
        bus = smbus.SMBus(1)
        init_sensor(bus)
    except FileNotFoundError as exc:
        print(f"ERROR: I2C bus /dev/i2c-1 is unavailable: {exc}", file=sys.stderr)
        return 1
    except OSError as exc:
        print(f"ERROR: Unable to initialize MPU6050 at 0x68: {exc}", file=sys.stderr)
        return 1

    print(f"Sending IMU samples to {API_URL}")
    print(f"device_id={DEVICE_ID} leg={LEG} body_part={BODY_PART} interval={SEND_INTERVAL_SECONDS}s")

    while _RUNNING:
        try:
            sample = read_sensor_sample(bus)
        except OSError as exc:
            print(f"Sensor read failed: {exc}. Check MPU6050 wiring/power. Retrying in {SEND_INTERVAL_SECONDS}s.")
            time.sleep(SEND_INTERVAL_SECONDS)
            continue

        try:
            status, body = post_sample(sample)
            print(
                f"POST OK {status} "
                f"pitch={sample['pitch']:.2f} roll={sample['roll']:.2f} "
                f"temp={sample['temperature']:.2f}C body={body}"
            )
        except urllib.error.HTTPError as exc:
            details = exc.read().decode("utf-8", errors="replace")
            print(f"POST FAILED HTTP {exc.code}: {details}")
        except urllib.error.URLError as exc:
            print(f"POST FAILED network error: {exc.reason}")
        except Exception as exc:  # pragma: no cover - defensive runtime path
            print(f"POST FAILED unexpected error: {exc}")

        if _RUNNING:
            time.sleep(SEND_INTERVAL_SECONDS)

    print("IMU sender stopped.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
