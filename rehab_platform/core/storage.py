from __future__ import annotations

import os
import sqlite3
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

DEFAULT_DB_PATH = Path(__file__).resolve().parents[1] / "data" / "rehab.db"


def get_db_path() -> Path:
    value = os.environ.get("REHAB_DB_PATH")
    if value:
        return Path(value).expanduser()
    return DEFAULT_DB_PATH


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
