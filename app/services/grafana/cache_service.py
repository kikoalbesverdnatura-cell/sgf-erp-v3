import os
import sqlite3
import json
from typing import List, Dict, Any

DB_PATH = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
    "data",
    "metrics_cache.db"
)

def init_db():
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    # Create table for daily metrics cache
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS daily_metrics_cache (
            worker_fk INTEGER,
            work_date TEXT,
            is_encajador INTEGER,
            metrics_json TEXT,
            PRIMARY KEY (worker_fk, work_date)
        )
    """)
    conn.commit()
    conn.close()

def get_cached_history(worker_fk: int) -> List[Dict[str, Any]]:
    init_db()
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    cursor.execute(
        "SELECT metrics_json FROM daily_metrics_cache WHERE worker_fk = ? ORDER BY work_date DESC",
        (worker_fk,)
    )
    rows = cursor.fetchall()
    conn.close()
    
    results = []
    for r in rows:
        try:
            results.append(json.loads(r["metrics_json"]))
        except Exception:
            pass
    return results

def save_daily_metrics(worker_fk: int, work_date: str, is_encajador: bool, metrics: Dict[str, Any]):
    init_db()
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute(
        """
        INSERT INTO daily_metrics_cache (worker_fk, work_date, is_encajador, metrics_json)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(worker_fk, work_date) DO UPDATE SET
            is_encajador = excluded.is_encajador,
            metrics_json = excluded.metrics_json
        """,
        (worker_fk, work_date, 1 if is_encajador else 0, json.dumps(metrics))
    )
    conn.commit()
    conn.close()

def clear_cache_for_worker(worker_fk: int):
    init_db()
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("DELETE FROM daily_metrics_cache WHERE worker_fk = ?", (worker_fk,))
    conn.commit()
    conn.close()
