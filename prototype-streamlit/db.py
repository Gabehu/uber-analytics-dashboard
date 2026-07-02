import sqlite3
from pathlib import Path
from datetime import datetime

DB_PATH = Path("data") / "uber_dashboard.db"


def get_connection():
    """Create the data folder if needed and return a SQLite connection."""
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    return sqlite3.connect(DB_PATH)


def create_table():
    """Create the main workday entries table if it does not already exist."""
    conn = get_connection()
    cursor = conn.cursor()

    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS workday_entries (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            date TEXT NOT NULL,
            online_hours INTEGER NOT NULL,
            online_minutes INTEGER NOT NULL,
            trips INTEGER NOT NULL,
            net_fare REAL NOT NULL,
            promotions REAL NOT NULL,
            tips REAL NOT NULL,
            wallet_balance REAL,
            miles_driven REAL,
            area TEXT,
            shift_type TEXT,
            notes TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )
        """
    )

    conn.commit()
    conn.close()

def add_entry(
    date,
    online_hours,
    online_minutes,
    trips,
    net_fare,
    promotions,
    tips,
    wallet_balance=None,
    miles_driven=None,
    area="",
    shift_type="",
    notes="",
):
    """Insert a new Uber workday entry into the database."""
    conn = get_connection()
    cursor = conn.cursor()

    now = datetime.now().isoformat(timespec="seconds")

    cursor.execute(
        """
        INSERT INTO workday_entries (
            date,
            online_hours,
            online_minutes,
            trips,
            net_fare,
            promotions,
            tips,
            wallet_balance,
            miles_driven,
            area,
            shift_type,
            notes,
            created_at,
            updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            str(date),
            int(online_hours),
            int(online_minutes),
            int(trips),
            float(net_fare),
            float(promotions),
            float(tips),
            float(wallet_balance) if wallet_balance is not None else None,
            float(miles_driven) if miles_driven is not None else None,
            area,
            shift_type,
            notes,
            now,
            now,
        ),
    )

    conn.commit()
    conn.close()


def get_entries():
    """Return all workday entries ordered from newest to oldest."""
    conn = get_connection()
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()

    cursor.execute(
        """
        SELECT *
        FROM workday_entries
        ORDER BY date DESC, id DESC
        """
    )

    rows = cursor.fetchall()
    conn.close()

    return [dict(row) for row in rows]

def update_entry(
    entry_id,
    date,
    online_hours,
    online_minutes,
    trips,
    net_fare,
    promotions,
    tips,
    wallet_balance=None,
    miles_driven=None,
    area="",
    shift_type="",
    notes="",
):
    """Update an existing workday entry by ID."""
    conn = get_connection()
    cursor = conn.cursor()

    now = datetime.now().isoformat(timespec="seconds")

    cursor.execute(
        """
        UPDATE workday_entries
        SET
            date = ?,
            online_hours = ?,
            online_minutes = ?,
            trips = ?,
            net_fare = ?,
            promotions = ?,
            tips = ?,
            wallet_balance = ?,
            miles_driven = ?,
            area = ?,
            shift_type = ?,
            notes = ?,
            updated_at = ?
        WHERE id = ?
        """,
        (
            str(date),
            int(online_hours),
            int(online_minutes),
            int(trips),
            float(net_fare),
            float(promotions),
            float(tips),
            float(wallet_balance) if wallet_balance is not None else None,
            float(miles_driven) if miles_driven is not None else None,
            area,
            shift_type,
            notes,
            now,
            int(entry_id),
        ),
    )

    conn.commit()
    conn.close()


def delete_entry(entry_id):
    """Delete a workday entry by ID."""
    conn = get_connection()
    cursor = conn.cursor()

    cursor.execute(
        """
        DELETE FROM workday_entries
        WHERE id = ?
        """,
        (int(entry_id),),
    )

    conn.commit()
    conn.close()