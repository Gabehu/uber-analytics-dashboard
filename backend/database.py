import sqlite3
from pathlib import Path

DATABASE_PATH = Path(__file__).parent / "uber_dashboard.db"


def get_connection():
    conn = sqlite3.connect(DATABASE_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def initialize_database():
    conn = get_connection()
    cursor = conn.cursor()

    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS daily_earnings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            date TEXT NOT NULL UNIQUE,
            earnings REAL NOT NULL,
            online_hours REAL NOT NULL,
            trips INTEGER NOT NULL,
            avg_hourly REAL NOT NULL
        )
        """
    )

    sample_data = [
        ("2025-07-23", 169.71, 8.17, 19, 20.77),
        ("2025-07-24", 179.55, 8.82, 22, 20.36),
        ("2025-07-27", 124.55, 4.75, 14, 26.22),
    ]

    cursor.executemany(
        """
        INSERT OR IGNORE INTO daily_earnings
        (date, earnings, online_hours, trips, avg_hourly)
        VALUES (?, ?, ?, ?, ?)
        """,
        sample_data
    )

    conn.commit()
    conn.close()


def get_daily_data():
    conn = get_connection()
    cursor = conn.cursor()

    cursor.execute(
        """
        SELECT date, earnings, online_hours, trips, avg_hourly
        FROM daily_earnings
        ORDER BY date DESC
        """
    )

    rows = cursor.fetchall()
    conn.close()

    return [dict(row) for row in rows]


def get_summary_data():
    conn = get_connection()
    cursor = conn.cursor()

    cursor.execute(
        """
        SELECT
            COALESCE(SUM(earnings), 0) AS total_earnings,
            COALESCE(SUM(trips), 0) AS total_trips,
            COALESCE(SUM(online_hours), 0) AS online_hours
        FROM daily_earnings
        """
    )

    row = cursor.fetchone()
    conn.close()

    total_earnings = row["total_earnings"]
    total_trips = row["total_trips"]
    online_hours = row["online_hours"]

    avg_hourly = total_earnings / online_hours if online_hours > 0 else 0
    avg_per_trip = total_earnings / total_trips if total_trips > 0 else 0

    return {
        "total_earnings": round(total_earnings, 2),
        "total_trips": total_trips,
        "online_hours": round(online_hours, 2),
        "avg_hourly": round(avg_hourly, 2),
        "avg_per_trip": round(avg_per_trip, 2),
    }


def create_daily_record(record):
    avg_hourly = record.earnings / record.online_hours if record.online_hours > 0 else 0

    conn = get_connection()
    cursor = conn.cursor()

    cursor.execute(
        """
        INSERT INTO daily_earnings
        (date, earnings, online_hours, trips, avg_hourly)
        VALUES (?, ?, ?, ?, ?)
        """,
        (
            record.date,
            record.earnings,
            record.online_hours,
            record.trips,
            round(avg_hourly, 2),
        )
    )

    conn.commit()
    conn.close()

    return {
        "date": record.date,
        "earnings": record.earnings,
        "online_hours": record.online_hours,
        "trips": record.trips,
        "avg_hourly": round(avg_hourly, 2),
    }


def delete_daily_record(date: str):
    conn = get_connection()
    cursor = conn.cursor()

    cursor.execute(
        """
        DELETE FROM daily_earnings
        WHERE date = ?
        """,
        (date,)
    )

    deleted_count = cursor.rowcount

    conn.commit()
    conn.close()

    return deleted_count