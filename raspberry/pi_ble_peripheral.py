#!/usr/bin/env python3
"""Experimental Raspberry Pi BLE peripheral for OrthoScan IMU browser streaming.

Run either this experimental BLE peripheral or the stable orthosend.py daemon.
Do not run both against the same MPU6050 by default.
"""

from __future__ import annotations

import json
import math
import os
import signal
import sys

try:
    import smbus  # type: ignore
except ImportError:  # pragma: no cover - runtime dependency on Raspberry Pi
    smbus = None

try:  # pragma: no cover - runtime dependency on Raspberry Pi / BlueZ
    import dbus
    import dbus.exceptions
    import dbus.mainloop.glib
    import dbus.service
    from gi.repository import GLib
except ImportError:  # pragma: no cover - runtime dependency on Raspberry Pi / BlueZ
    dbus = None
    GLib = None

if dbus is None:  # pragma: no cover - allow graceful runtime error messaging
    class _DummyDBusException(Exception):
        pass

    class _DummyExceptions:
        DBusException = _DummyDBusException

    class _DummyService:
        Object = object

        @staticmethod
        def method(*args, **kwargs):
            def decorator(func):
                return func
            return decorator

        @staticmethod
        def signal(*args, **kwargs):
            def decorator(func):
                return func
            return decorator

    class _DummyDbus:
        exceptions = _DummyExceptions()
        service = _DummyService()

        @staticmethod
        def Array(value, signature=None):  # noqa: ARG004
            return value

        @staticmethod
        def ObjectPath(value):
            return value

        @staticmethod
        def String(value):
            return value

    dbus = _DummyDbus()


BLUEZ_SERVICE_NAME = "org.bluez"
DBUS_OM_IFACE = "org.freedesktop.DBus.ObjectManager"
DBUS_PROP_IFACE = "org.freedesktop.DBus.Properties"
GATT_MANAGER_IFACE = "org.bluez.GattManager1"
LE_ADVERTISING_MANAGER_IFACE = "org.bluez.LEAdvertisingManager1"
GATT_SERVICE_IFACE = "org.bluez.GattService1"
GATT_CHRC_IFACE = "org.bluez.GattCharacteristic1"
LE_ADVERTISEMENT_IFACE = "org.bluez.LEAdvertisement1"

ORTHOSCAN_SERVICE_UUID = "12345678-1234-5678-1234-56789abcdef0"
ORTHOSCAN_NOTIFY_UUID = "12345678-1234-5678-1234-56789abcdef1"

DEFAULT_DEVICE_ID = "pi1"
DEFAULT_LEG = "left"
DEFAULT_BODY_PART = "hip"
DEFAULT_NOTIFY_INTERVAL_SECONDS = 5.0

DEVICE_ADDRESS = 0x68
PWR_MGMT_1 = 0x6B
SMPLRT_DIV = 0x19
CONFIG = 0x1A
GYRO_CONFIG = 0x1B
INT_ENABLE = 0x38
ACCEL_XOUT_H = 0x3B
TEMP_OUT_H = 0x41
GYRO_XOUT_H = 0x43

MAIN_LOOP = None


def default_ble_name(device_id: str) -> str:
    suffix = str(device_id or DEFAULT_DEVICE_ID).upper()
    if suffix.startswith("PI"):
        return f"ORTHO_{suffix}"
    return "ORTHO_PI1"


def get_env_float(name: str, default: float) -> float:
    raw = os.environ.get(name)
    if raw in (None, ""):
        return float(default)
    try:
        return float(raw)
    except ValueError:
        print(f"WARNING: {name}={raw!r} is invalid. Using default {default}.", file=sys.stderr)
        return float(default)


DEVICE_ID = os.environ.get("ORTHO_DEVICE_ID", DEFAULT_DEVICE_ID)
LEG = os.environ.get("ORTHO_LEG", DEFAULT_LEG)
BODY_PART = os.environ.get("ORTHO_BODY_PART", DEFAULT_BODY_PART)
BLE_NAME = os.environ.get("ORTHO_BLE_NAME", default_ble_name(DEVICE_ID))
NOTIFY_INTERVAL_SECONDS = get_env_float("ORTHO_BLE_NOTIFY_INTERVAL_SECONDS", DEFAULT_NOTIFY_INTERVAL_SECONDS)


def handle_stop(signum, frame):  # noqa: ARG001
    if MAIN_LOOP is not None:
        MAIN_LOOP.quit()


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
        "pitch": round(pitch, 4),
        "roll": round(roll, 4),
        "acc_x": round(acc_x, 4),
        "acc_y": round(acc_y, 4),
        "acc_z": round(acc_z, 4),
        "gyro_x": round(gyro_x, 4),
        "gyro_y": round(gyro_y, 4),
        "gyro_z": round(gyro_z, 4),
        "temperature": round(temperature, 4),
    }


def find_adapter(bus):
    remote_om = dbus.Interface(bus.get_object(BLUEZ_SERVICE_NAME, "/"), DBUS_OM_IFACE)
    for path, interfaces in remote_om.GetManagedObjects().items():
        if GATT_MANAGER_IFACE in interfaces and LE_ADVERTISING_MANAGER_IFACE in interfaces:
            return path
    return None


class Advertisement(dbus.service.Object):
    PATH_BASE = "/org/orthoscan/pi_ble/advertisement"

    def __init__(self, bus, index):
        self.path = f"{self.PATH_BASE}{index}"
        self.bus = bus
        self.local_name = BLE_NAME
        self.service_uuids = [ORTHOSCAN_SERVICE_UUID]
        dbus.service.Object.__init__(self, bus, self.path)

    def get_path(self):
        return dbus.ObjectPath(self.path)

    def get_properties(self):
        return {
            LE_ADVERTISEMENT_IFACE: {
                "Type": "peripheral",
                "ServiceUUIDs": dbus.Array(self.service_uuids, signature="s"),
                "LocalName": dbus.String(self.local_name),
                "Includes": dbus.Array(["tx-power"], signature="s"),
            }
        }

    @dbus.service.method(DBUS_PROP_IFACE, in_signature="s", out_signature="a{sv}")
    def GetAll(self, interface):
        if interface != LE_ADVERTISEMENT_IFACE:
            raise dbus.exceptions.DBusException("org.freedesktop.DBus.Error.InvalidArgs")
        return self.get_properties()[LE_ADVERTISEMENT_IFACE]

    @dbus.service.method(LE_ADVERTISEMENT_IFACE, in_signature="", out_signature="")
    def Release(self):
        print("Advertisement released")


class Application(dbus.service.Object):
    PATH = "/"

    def __init__(self, bus):
        self.bus = bus
        self.services = []
        dbus.service.Object.__init__(self, bus, self.PATH)

    def get_path(self):
        return dbus.ObjectPath(self.PATH)

    def add_service(self, service):
        self.services.append(service)

    @dbus.service.method(DBUS_OM_IFACE, out_signature="a{oa{sa{sv}}}")
    def GetManagedObjects(self):
        response = {}
        for service in self.services:
            response[service.get_path()] = service.get_properties()
            for characteristic in service.characteristics:
                response[characteristic.get_path()] = characteristic.get_properties()
        return response


class Service(dbus.service.Object):
    PATH_BASE = "/org/orthoscan/pi_ble/service"

    def __init__(self, bus, index, uuid, primary=True):
        self.path = f"{self.PATH_BASE}{index}"
        self.bus = bus
        self.uuid = uuid
        self.primary = primary
        self.characteristics = []
        dbus.service.Object.__init__(self, bus, self.path)

    def get_path(self):
        return dbus.ObjectPath(self.path)

    def add_characteristic(self, characteristic):
        self.characteristics.append(characteristic)

    def get_properties(self):
        return {
            GATT_SERVICE_IFACE: {
                "UUID": self.uuid,
                "Primary": self.primary,
                "Characteristics": dbus.Array(
                    [characteristic.get_path() for characteristic in self.characteristics],
                    signature="o",
                ),
            }
        }

    @dbus.service.method(DBUS_PROP_IFACE, in_signature="s", out_signature="a{sv}")
    def GetAll(self, interface):
        if interface != GATT_SERVICE_IFACE:
            raise dbus.exceptions.DBusException("org.freedesktop.DBus.Error.InvalidArgs")
        return self.get_properties()[GATT_SERVICE_IFACE]


class Characteristic(dbus.service.Object):
    def __init__(self, bus, index, uuid, flags, service):
        self.path = f"{service.path}/char{index}"
        self.bus = bus
        self.uuid = uuid
        self.flags = flags
        self.service = service
        dbus.service.Object.__init__(self, bus, self.path)

    def get_path(self):
        return dbus.ObjectPath(self.path)

    def get_properties(self):
        return {
            GATT_CHRC_IFACE: {
                "Service": self.service.get_path(),
                "UUID": self.uuid,
                "Flags": dbus.Array(self.flags, signature="s"),
            }
        }

    @dbus.service.method(DBUS_PROP_IFACE, in_signature="s", out_signature="a{sv}")
    def GetAll(self, interface):
        if interface != GATT_CHRC_IFACE:
            raise dbus.exceptions.DBusException("org.freedesktop.DBus.Error.InvalidArgs")
        return self.get_properties()[GATT_CHRC_IFACE]

    @dbus.service.method(GATT_CHRC_IFACE, in_signature="", out_signature="")
    def StartNotify(self):
        raise NotImplementedError()

    @dbus.service.method(GATT_CHRC_IFACE, in_signature="", out_signature="")
    def StopNotify(self):
        raise NotImplementedError()

    @dbus.service.signal(DBUS_PROP_IFACE, signature="sa{sv}as")
    def PropertiesChanged(self, interface, changed, invalidated):
        pass


class OrthoImuCharacteristic(Characteristic):
    def __init__(self, bus, index, service, sensor_bus):
        super().__init__(bus, index, ORTHOSCAN_NOTIFY_UUID, ["notify"], service)
        self.sensor_bus = sensor_bus
        self.notifying = False
        self.interval_ms = max(250, int(NOTIFY_INTERVAL_SECONDS * 1000))

    def _build_value(self):
        payload = json.dumps(read_sensor_sample(self.sensor_bus), separators=(",", ":")) + "\n"
        return dbus.Array(payload.encode("utf-8"), signature="y")

    def _notify_once(self):
        if not self.notifying:
            return False
        try:
            value = self._build_value()
            self.PropertiesChanged(GATT_CHRC_IFACE, {"Value": value}, [])
        except OSError as exc:
            print(f"Sensor read failed during BLE notify: {exc}", file=sys.stderr)
        except Exception as exc:  # pragma: no cover - defensive runtime path
            print(f"Unexpected BLE notify error: {exc}", file=sys.stderr)
        return True

    @dbus.service.method(GATT_CHRC_IFACE, in_signature="", out_signature="")
    def StartNotify(self):
        if self.notifying:
            return
        self.notifying = True
        print(f"BLE notify started for {BLE_NAME} at {NOTIFY_INTERVAL_SECONDS:.1f}s intervals")
        GLib.timeout_add(self.interval_ms, self._notify_once)

    @dbus.service.method(GATT_CHRC_IFACE, in_signature="", out_signature="")
    def StopNotify(self):
        if not self.notifying:
            return
        self.notifying = False
        print("BLE notify stopped")


def register_success():
    print("BLE service registered")


def register_failure(error):
    print(f"BLE registration failed: {error}", file=sys.stderr)
    if MAIN_LOOP is not None:
        MAIN_LOOP.quit()


def main():
    global MAIN_LOOP

    if smbus is None:
        print("ERROR: smbus is not installed. Install python3-smbus on the Raspberry Pi.", file=sys.stderr)
        return 1
    if dbus is None or GLib is None:
        print("ERROR: dbus-python / PyGObject is not installed. Install BlueZ D-Bus dependencies on the Raspberry Pi.", file=sys.stderr)
        return 1

    signal.signal(signal.SIGINT, handle_stop)
    signal.signal(signal.SIGTERM, handle_stop)

    try:
        sensor_bus = smbus.SMBus(1)
        init_sensor(sensor_bus)
    except FileNotFoundError as exc:
        print(f"ERROR: I2C bus /dev/i2c-1 is unavailable: {exc}", file=sys.stderr)
        return 1
    except OSError as exc:
        print(f"ERROR: Unable to initialize MPU6050 at 0x68: {exc}", file=sys.stderr)
        return 1

    dbus.mainloop.glib.DBusGMainLoop(set_as_default=True)
    bus = dbus.SystemBus()
    adapter = find_adapter(bus)
    if adapter is None:
        print("ERROR: No BLE adapter with GATT/advertising support was found.", file=sys.stderr)
        return 1

    service_manager = dbus.Interface(bus.get_object(BLUEZ_SERVICE_NAME, adapter), GATT_MANAGER_IFACE)
    advertising_manager = dbus.Interface(
        bus.get_object(BLUEZ_SERVICE_NAME, adapter),
        LE_ADVERTISING_MANAGER_IFACE,
    )

    app = Application(bus)
    service = Service(bus, 0, ORTHOSCAN_SERVICE_UUID, primary=True)
    service.add_characteristic(OrthoImuCharacteristic(bus, 0, service, sensor_bus))
    app.add_service(service)
    advertisement = Advertisement(bus, 0)

    print("Starting experimental OrthoScan Pi BLE peripheral")
    print(f"  BLE name={BLE_NAME}")
    print(f"  device_id={DEVICE_ID} leg={LEG} body_part={BODY_PART}")
    print(f"  notify_interval={NOTIFY_INTERVAL_SECONDS:.1f}s")
    print("  Stable orthosend.py daemon should not be reading the same MPU6050 at the same time.")

    MAIN_LOOP = GLib.MainLoop()
    service_manager.RegisterApplication(app.get_path(), {}, reply_handler=register_success, error_handler=register_failure)
    advertising_manager.RegisterAdvertisement(
        advertisement.get_path(),
        {},
        reply_handler=lambda: print("BLE advertisement registered"),
        error_handler=register_failure,
    )

    try:
        MAIN_LOOP.run()
    finally:
        try:
            advertising_manager.UnregisterAdvertisement(advertisement.get_path())
        except Exception:
            pass
        print("Experimental Pi BLE peripheral stopped")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
