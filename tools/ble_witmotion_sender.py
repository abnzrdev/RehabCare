from __future__ import annotations

import asyncio
import json
import os
import struct
import time
from dataclasses import dataclass, field
from typing import Any

import requests
from bleak import BleakClient, BleakScanner

ORTHO_API_URL = os.environ.get("ORTHO_API_URL", "http://89.218.178.215:18190/api/imu")
ORTHO_BLE_POST_INTERVAL_SECONDS = float(os.environ.get("ORTHO_BLE_POST_INTERVAL_SECONDS", "1.0"))
NOTIFY_UUID_CANDIDATES = (
    "0000ffe4-0000-1000-8000-00805f9a34fb",
    "0000ffe1-0000-1000-8000-00805f9a34fb",
)

# Edit these defaults directly if you want fixed MAC assignments without env vars.
DEFAULT_SENSOR_MAP = [
    {"label": "Left_Arm", "device_id": "ble_left_arm", "leg": "left", "body_part": "arm", "mac": "C9:CE:CE:5D:A9:BF"},
    {"label": "Left_Leg", "device_id": "ble_left_leg", "leg": "left", "body_part": "leg", "mac": None},
    {"label": "Right_Arm", "device_id": "ble_right_arm", "leg": "right", "body_part": "arm", "mac": None},
    {"label": "Right_Leg", "device_id": "ble_right_leg", "leg": "right", "body_part": "leg", "mac": None},
]


@dataclass
class SensorConfig:
    label: str
    device_id: str
    leg: str
    body_part: str
    mac: str | None = None


@dataclass
class SensorState:
    config: SensorConfig
    address: str | None = None
    name: str | None = None
    connected: bool = False
    last_seen: float = 0.0
    last_posted: float = 0.0
    packets: int = 0
    temperature: float = 0.0
    acc_x: float = 0.0
    acc_y: float = 0.0
    acc_z: float = 0.0
    gyro_x: float = 0.0
    gyro_y: float = 0.0
    gyro_z: float = 0.0
    roll: float = 0.0
    pitch: float = 0.0
    yaw: float = 0.0
    notify_uuid: str | None = None
    lock: asyncio.Lock = field(default_factory=asyncio.Lock)

    def has_payload(self) -> bool:
        return self.last_seen > 0.0

    def build_payload(self) -> dict[str, Any]:
        return {
            "device_id": self.config.device_id,
            "leg": self.config.leg,
            "body_part": self.config.body_part,
            "pitch": round(self.pitch, 3),
            "roll": round(self.roll, 3),
            "acc_x": round(self.acc_x, 3),
            "acc_y": round(self.acc_y, 3),
            "acc_z": round(self.acc_z, 3),
            "gyro_x": round(self.gyro_x, 3),
            "gyro_y": round(self.gyro_y, 3),
            "gyro_z": round(self.gyro_z, 3),
            "temperature": round(self.temperature, 3),
        }


class WitMotionParser:
    def __init__(self, state: SensorState) -> None:
        self.state = state
        self.buffer = bytearray()

    async def feed(self, data: bytes) -> None:
        async with self.state.lock:
            self.buffer.extend(data)
            self._parse_combined_frames()
            self._parse_standard_frames()

    def _parse_combined_frames(self) -> None:
        frame_len = 20
        while True:
            start = self.buffer.find(b"\x55\x61")
            if start < 0:
                if len(self.buffer) > 128:
                    del self.buffer[:-32]
                return
            if len(self.buffer) - start < frame_len:
                if start > 0:
                    del self.buffer[:start]
                return
            frame = bytes(self.buffer[start : start + frame_len])
            del self.buffer[: start + frame_len]
            values = struct.unpack("<9h", frame[2:20])
            self._apply_combined(values)

    def _parse_standard_frames(self) -> None:
        while True:
            start = self.buffer.find(b"\x55")
            if start < 0:
                if len(self.buffer) > 128:
                    del self.buffer[:-32]
                return
            if len(self.buffer) - start < 11:
                if start > 0:
                    del self.buffer[:start]
                return
            frame = bytes(self.buffer[start : start + 11])
            if (sum(frame[:10]) & 0xFF) != frame[10]:
                del self.buffer[start + 1]
                continue
            del self.buffer[: start + 11]
            frame_type = frame[1]
            values = struct.unpack("<4h", frame[2:10])
            self._apply_standard(frame_type, values)

    def _mark_update(self) -> None:
        self.state.last_seen = time.time()
        self.state.packets += 1

    def _apply_combined(self, values: tuple[int, ...]) -> None:
        acc_x, acc_y, acc_z, gyro_x, gyro_y, gyro_z, roll, pitch, yaw = values
        self.state.acc_x = acc_x / 32768.0 * 16.0
        self.state.acc_y = acc_y / 32768.0 * 16.0
        self.state.acc_z = acc_z / 32768.0 * 16.0
        self.state.gyro_x = gyro_x / 32768.0 * 2000.0
        self.state.gyro_y = gyro_y / 32768.0 * 2000.0
        self.state.gyro_z = gyro_z / 32768.0 * 2000.0
        self.state.roll = roll / 32768.0 * 180.0
        self.state.pitch = pitch / 32768.0 * 180.0
        self.state.yaw = yaw / 32768.0 * 180.0
        self._mark_update()

    def _apply_standard(self, frame_type: int, values: tuple[int, int, int, int]) -> None:
        x, y, z, temp_raw = values
        if frame_type == 0x51:
            self.state.acc_x = x / 32768.0 * 16.0
            self.state.acc_y = y / 32768.0 * 16.0
            self.state.acc_z = z / 32768.0 * 16.0
            self.state.temperature = temp_raw / 100.0
            self._mark_update()
        elif frame_type == 0x52:
            self.state.gyro_x = x / 32768.0 * 2000.0
            self.state.gyro_y = y / 32768.0 * 2000.0
            self.state.gyro_z = z / 32768.0 * 2000.0
            self.state.temperature = temp_raw / 100.0
            self._mark_update()
        elif frame_type == 0x53:
            self.state.roll = x / 32768.0 * 180.0
            self.state.pitch = y / 32768.0 * 180.0
            self.state.yaw = z / 32768.0 * 180.0
            self._mark_update()


def load_sensor_configs() -> list[SensorConfig]:
    override = os.environ.get("ORTHO_BLE_SENSORS")
    items: list[dict[str, Any]]
    if override:
        parsed = json.loads(override)
        if isinstance(parsed, dict):
            items = []
            defaults = {item["device_id"]: item for item in DEFAULT_SENSOR_MAP}
            for device_id, extra in parsed.items():
                merged = dict(defaults.get(device_id, {}))
                merged.update(extra if isinstance(extra, dict) else {})
                merged["device_id"] = device_id
                merged.setdefault("label", device_id)
                merged.setdefault("leg", "unknown")
                merged.setdefault("body_part", "unknown")
                items.append(merged)
        elif isinstance(parsed, list):
            items = parsed
        else:
            raise ValueError("ORTHO_BLE_SENSORS must be a JSON list or object.")
    else:
        items = DEFAULT_SENSOR_MAP
    return [SensorConfig(**item) for item in items]


def looks_like_witmotion(device_name: str | None) -> bool:
    name = (device_name or "").lower()
    return any(token in name for token in ("wit", "wt", "imu", "motion"))


async def discover_sensor_assignments(configs: list[SensorConfig]) -> dict[str, tuple[str, str | None]]:
    print("Scanning room for WitMotion sensors...")
    devices = await BleakScanner.discover(timeout=8.0, return_adv=False)
    assignments: dict[str, tuple[str, str | None]] = {}
    used_addresses: set[str] = set()

    by_address = {device.address.upper(): device for device in devices}
    for config in configs:
        if not config.mac:
            continue
        device = by_address.get(config.mac.upper())
        if not device:
            continue
        assignments[config.device_id] = (device.address, device.name)
        used_addresses.add(device.address.upper())
        print(f"FOUND SENSOR {config.device_id} mac={device.address} name={device.name or '-'}")

    remaining = [device for device in devices if device.address.upper() not in used_addresses and looks_like_witmotion(device.name)]
    for config in configs:
        if config.device_id in assignments or not remaining:
            continue
        device = remaining.pop(0)
        assignments[config.device_id] = (device.address, device.name)
        used_addresses.add(device.address.upper())
        print(f"FOUND SENSOR {config.device_id} mac={device.address} name={device.name or '-'}")

    return assignments


async def resolve_notify_uuid(client: BleakClient) -> str:
    for service in client.services:
        for char in service.characteristics:
            uuid = str(char.uuid).lower()
            if "notify" in {prop.lower() for prop in char.properties} and uuid in NOTIFY_UUID_CANDIDATES:
                return char.uuid
    for service in client.services:
        for char in service.characteristics:
            if "notify" in {prop.lower() for prop in char.properties}:
                return char.uuid
    raise RuntimeError("No notify characteristic found.")


async def connect_sensor(state: SensorState) -> None:
    parser = WitMotionParser(state)
    while True:
        if not state.address:
            await asyncio.sleep(2.0)
            continue
        try:
            async with BleakClient(state.address, timeout=10.0) as client:
                await client.get_services()
                state.notify_uuid = await resolve_notify_uuid(client)

                def handle(_: Any, data: bytearray) -> None:
                    asyncio.create_task(parser.feed(bytes(data)))

                await client.start_notify(state.notify_uuid, handle)
                state.connected = True
                print(f"CONNECTED {state.config.device_id} mac={state.address} uuid={state.notify_uuid}")
                while client.is_connected:
                    await asyncio.sleep(1.0)
        except Exception as exc:  # noqa: BLE001
            print(f"CONNECT FAILED {state.config.device_id} error={exc}")
        finally:
            state.connected = False
            await asyncio.sleep(2.0)


async def post_sensor_loop(states: list[SensorState]) -> None:
    session = requests.Session()
    while True:
        for state in states:
            async with state.lock:
                if not state.has_payload():
                    continue
                payload = state.build_payload()
            try:
                response = session.post(ORTHO_API_URL, json=payload, timeout=5.0)
                if response.ok:
                    state.last_posted = time.time()
                    print(f"POST OK {response.status_code} {state.config.device_id}")
                else:
                    print(f"POST FAILED {response.status_code} {state.config.device_id} body={response.text[:200]}")
            except Exception as exc:  # noqa: BLE001
                print(f"POST FAILED {state.config.device_id} error={exc}")
        await asyncio.sleep(ORTHO_BLE_POST_INTERVAL_SECONDS)


async def dashboard_loop(states: list[SensorState]) -> None:
    while True:
        lines = [
            "",
            "=" * 100,
            f"WitMotion BLE dashboard  api={ORTHO_API_URL}  interval={ORTHO_BLE_POST_INTERVAL_SECONDS:.1f}s",
            "=" * 100,
        ]
        now = time.time()
        for state in states:
            age = "-" if not state.last_seen else f"{now - state.last_seen:5.1f}s"
            lines.extend([
                (
                    f"{state.config.label:<10} {state.config.device_id:<15} "
                    f"mac={state.address or '-':<17} connected={'yes' if state.connected else 'no ':<3} "
                    f"last={age:<6} packets={state.packets:<6}"
                ),
                (
                    f"  leg={state.config.leg:<5} body_part={state.config.body_part:<4} "
                    f"pitch={state.pitch:7.2f} roll={state.roll:7.2f} yaw={state.yaw:7.2f} temp={state.temperature:6.2f}"
                ),
                (
                    f"  acc=({state.acc_x:7.3f}, {state.acc_y:7.3f}, {state.acc_z:7.3f}) "
                    f"gyro=({state.gyro_x:8.2f}, {state.gyro_y:8.2f}, {state.gyro_z:8.2f})"
                ),
            ])
        print("\033[2J\033[H" + "\n".join(lines), flush=True)
        await asyncio.sleep(1.0)


async def main() -> None:
    configs = load_sensor_configs()
    states = [SensorState(config=config) for config in configs]
    assignments = await discover_sensor_assignments(configs)
    for state in states:
        assignment = assignments.get(state.config.device_id)
        if assignment:
            state.address, state.name = assignment
        elif state.config.mac:
            state.address = state.config.mac
            print(f"FOUND SENSOR {state.config.device_id} mac={state.address} name=- (configured, not discovered)")

    tasks = [asyncio.create_task(connect_sensor(state)) for state in states if state.address]
    tasks.append(asyncio.create_task(post_sensor_loop(states)))
    tasks.append(asyncio.create_task(dashboard_loop(states)))
    if not any(state.address for state in states):
        print("No sensors assigned. Set MAC addresses at the top of the file or use ORTHO_BLE_SENSORS.")
    await asyncio.gather(*tasks)


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("Stopped.")
