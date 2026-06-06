from __future__ import annotations

import os
import sqlite3
from collections import OrderedDict
from csv import DictReader, DictWriter
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

DEFAULT_DB_PATH = Path(__file__).resolve().parents[1] / "data" / "rehab.db"
DEFAULT_IMU_CSV_PATH = Path(__file__).resolve().parents[2] / "data" / "imu_data.csv"
IMU_CSV_COLUMNS = [
    "timestamp",
    "device_id",
    "leg",
    "body_part",
    "acc_x",
    "acc_y",
    "acc_z",
    "gyro_x",
    "gyro_y",
    "gyro_z",
    "pitch",
    "roll",
    "temperature",
]


def get_db_path() -> Path:
    value = os.environ.get("REHAB_DB_PATH")
    if value:
        return Path(value).expanduser()
    return DEFAULT_DB_PATH


def get_imu_csv_path() -> Path:
    value = os.environ.get("REHAB_IMU_CSV_PATH")
    if value:
        return Path(value).expanduser()
    return DEFAULT_IMU_CSV_PATH


@dataclass
class SessionRecord:
    patient_id: str
    patient_name: str | None
    exercise: str
    koos_pre: float | None
    kl_grade: int | None
    current_rom: float | None
    previous_rom: float | None
    delta_rom: float | None
    rehab_score: float | None
    image_result: dict[str, Any] | None
    imu_result: dict[str, Any] | None


def _connect() -> sqlite3.Connection:
    db_path = get_db_path()
    db_path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    with _connect() as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS sessions (
                session_id TEXT PRIMARY KEY,
                patient_id TEXT NOT NULL,
                patient_name TEXT,
                created_at TEXT NOT NULL,
                exercise TEXT NOT NULL,
                koos_pre REAL,
                kl_grade INTEGER,
                current_rom REAL,
                previous_rom REAL,
                delta_rom REAL,
                rehab_score REAL,
                image_result_json TEXT,
                imu_result_json TEXT
            )
            """
        )
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_sessions_patient_exercise_time ON sessions(patient_id, exercise, created_at)"
        )


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _ensure_imu_csv() -> Path:
    csv_path = get_imu_csv_path()
    csv_path.parent.mkdir(parents=True, exist_ok=True)
    if not csv_path.exists():
        with csv_path.open("w", newline="", encoding="utf-8") as fh:
            writer = DictWriter(fh, fieldnames=IMU_CSV_COLUMNS)
            writer.writeheader()
    return csv_path


def append_imu_row(row: dict[str, Any]) -> dict[str, Any]:
    csv_path = _ensure_imu_csv()
    normalized = {column: row.get(column, "") for column in IMU_CSV_COLUMNS}
    with csv_path.open("a", newline="", encoding="utf-8") as fh:
        writer = DictWriter(fh, fieldnames=IMU_CSV_COLUMNS)
        writer.writerow(normalized)
    return normalized


def read_imu_rows(limit: int | None = 100) -> list[dict[str, Any]]:
    csv_path = _ensure_imu_csv()
    with csv_path.open(newline="", encoding="utf-8") as fh:
        rows = list(DictReader(fh))
    ordered = list(reversed(rows))
    if limit is None:
        return ordered
    return ordered[: max(0, int(limit))]


def get_latest_imu_rows_by_device() -> list[dict[str, Any]]:
    latest_by_device: OrderedDict[str, dict[str, Any]] = OrderedDict()
    for row in read_imu_rows(limit=None):
        device_id = str(row.get("device_id") or "").strip()
        if not device_id or device_id in latest_by_device:
            continue
        latest_by_device[device_id] = row
    return list(latest_by_device.values())


def build_session_id(patient_id: str) -> str:
    ts = datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S%f")
    return f"sess_{patient_id}_{ts}"


def get_last_session(patient_id: str, exercise: str) -> dict[str, Any] | None:
    with _connect() as conn:
        row = conn.execute(
            """
            SELECT * FROM sessions
            WHERE patient_id = ? AND exercise = ?
            ORDER BY created_at DESC
            LIMIT 1
            """,
            (patient_id, exercise),
        ).fetchone()
    return dict(row) if row else None


def save_session(record: SessionRecord) -> dict[str, Any]:
    import json

    session_id = build_session_id(record.patient_id)
    created_at = now_iso()
    with _connect() as conn:
        conn.execute(
            """
            INSERT INTO sessions (
                session_id, patient_id, patient_name, created_at, exercise,
                koos_pre, kl_grade, current_rom, previous_rom, delta_rom, rehab_score,
                image_result_json, imu_result_json
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                session_id,
                record.patient_id,
                record.patient_name,
                created_at,
                record.exercise,
                record.koos_pre,
                record.kl_grade,
                record.current_rom,
                record.previous_rom,
                record.delta_rom,
                record.rehab_score,
                json.dumps(record.image_result or {}, ensure_ascii=True),
                json.dumps(record.imu_result or {}, ensure_ascii=True),
            ),
        )

    return {
        "session_id": session_id,
        "created_at": created_at,
    }


def get_patient_sessions(patient_id: str, exercise: str | None = None) -> list[dict[str, Any]]:
    import json

    query = "SELECT * FROM sessions WHERE patient_id = ?"
    params: list[Any] = [patient_id]
    if exercise:
        query += " AND exercise = ?"
        params.append(exercise)
    query += " ORDER BY created_at DESC"

    with _connect() as conn:
        rows = conn.execute(query, params).fetchall()

    out = []
    for row in rows:
        item = dict(row)
        item["image_result"] = json.loads(item.pop("image_result_json") or "{}")
        item["imu_result"] = json.loads(item.pop("imu_result_json") or "{}")
        out.append(item)
    return out
