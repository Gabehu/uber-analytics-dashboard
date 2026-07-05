import sqlite3
from pathlib import Path

DATABASE_PATH = Path(__file__).parent / "uber_dashboard.db"


def get_connection():
    conn = sqlite3.connect(DATABASE_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def calculate_daily_metrics(record):
    total_earnings = record.net_fare + record.tips + record.promotions

    avg_hourly = total_earnings / record.online_hours if record.online_hours > 0 else 0
    avg_per_trip = total_earnings / record.trips if record.trips > 0 else 0

    earnings_per_mile = None
    if record.miles_driven is not None and record.miles_driven > 0:
        earnings_per_mile = total_earnings / record.miles_driven

    return {
        "total_earnings": round(total_earnings, 2),
        "avg_hourly": round(avg_hourly, 2),
        "avg_per_trip": round(avg_per_trip, 2),
        "earnings_per_mile": round(earnings_per_mile, 2) if earnings_per_mile is not None else None,
    }


def initialize_database():
    conn = get_connection()
    cursor = conn.cursor()

    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS daily_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            date TEXT NOT NULL UNIQUE,
            online_hours REAL NOT NULL,
            trips INTEGER NOT NULL,
            net_fare REAL NOT NULL,
            tips REAL NOT NULL,
            promotions REAL NOT NULL,
            total_earnings REAL NOT NULL,
            avg_hourly REAL NOT NULL,
            avg_per_trip REAL NOT NULL,
            miles_driven REAL,
            earnings_per_mile REAL,
            wallet_balance REAL,
            notes TEXT
        )
        """
    )

    sample_data = [
        {
            "date": "2025-07-23",
            "online_hours": 8.17,
            "trips": 19,
            "net_fare": 95.00,
            "tips": 54.71,
            "promotions": 20.00,
            "miles_driven": None,
            "wallet_balance": None,
            "notes": "Seed data from previous test record.",
        },
        {
            "date": "2025-07-24",
            "online_hours": 8.82,
            "trips": 22,
            "net_fare": 110.00,
            "tips": 49.55,
            "promotions": 20.00,
            "miles_driven": None,
            "wallet_balance": None,
            "notes": "Seed data from previous test record.",
        },
        {
            "date": "2025-07-27",
            "online_hours": 4.75,
            "trips": 14,
            "net_fare": 74.55,
            "tips": 35.00,
            "promotions": 15.00,
            "miles_driven": None,
            "wallet_balance": None,
            "notes": "Seed data from previous test record.",
        },
    ]

    for record in sample_data:
        total_earnings = record["net_fare"] + record["tips"] + record["promotions"]
        avg_hourly = total_earnings / record["online_hours"] if record["online_hours"] > 0 else 0
        avg_per_trip = total_earnings / record["trips"] if record["trips"] > 0 else 0

        earnings_per_mile = None
        if record["miles_driven"] is not None and record["miles_driven"] > 0:
            earnings_per_mile = total_earnings / record["miles_driven"]

        cursor.execute(
            """
            INSERT OR IGNORE INTO daily_logs
            (
                date,
                online_hours,
                trips,
                net_fare,
                tips,
                promotions,
                total_earnings,
                avg_hourly,
                avg_per_trip,
                miles_driven,
                earnings_per_mile,
                wallet_balance,
                notes
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                record["date"],
                record["online_hours"],
                record["trips"],
                record["net_fare"],
                record["tips"],
                record["promotions"],
                round(total_earnings, 2),
                round(avg_hourly, 2),
                round(avg_per_trip, 2),
                record["miles_driven"],
                round(earnings_per_mile, 2) if earnings_per_mile is not None else None,
                record["wallet_balance"],
                record["notes"],
            ),
        )

    conn.commit()
    conn.close()


def get_daily_data():
    conn = get_connection()
    cursor = conn.cursor()

    cursor.execute(
        """
        SELECT
            date,
            online_hours,
            trips,
            net_fare,
            tips,
            promotions,
            total_earnings,
            avg_hourly,
            avg_per_trip,
            miles_driven,
            earnings_per_mile,
            wallet_balance,
            notes
        FROM daily_logs
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
            COALESCE(SUM(total_earnings), 0) AS total_earnings,
            COALESCE(SUM(trips), 0) AS total_trips,
            COALESCE(SUM(online_hours), 0) AS online_hours
        FROM daily_logs
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
    metrics = calculate_daily_metrics(record)

    conn = get_connection()
    cursor = conn.cursor()

    cursor.execute(
        """
        INSERT INTO daily_logs
        (
            date,
            online_hours,
            trips,
            net_fare,
            tips,
            promotions,
            total_earnings,
            avg_hourly,
            avg_per_trip,
            miles_driven,
            earnings_per_mile,
            wallet_balance,
            notes
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            record.date,
            record.online_hours,
            record.trips,
            record.net_fare,
            record.tips,
            record.promotions,
            metrics["total_earnings"],
            metrics["avg_hourly"],
            metrics["avg_per_trip"],
            record.miles_driven,
            metrics["earnings_per_mile"],
            record.wallet_balance,
            record.notes,
        ),
    )

    conn.commit()
    conn.close()

    return {
        "date": record.date,
        "online_hours": record.online_hours,
        "trips": record.trips,
        "net_fare": record.net_fare,
        "tips": record.tips,
        "promotions": record.promotions,
        "total_earnings": metrics["total_earnings"],
        "avg_hourly": metrics["avg_hourly"],
        "avg_per_trip": metrics["avg_per_trip"],
        "miles_driven": record.miles_driven,
        "earnings_per_mile": metrics["earnings_per_mile"],
        "wallet_balance": record.wallet_balance,
        "notes": record.notes,
    }


def delete_daily_record(date: str):
    conn = get_connection()
    cursor = conn.cursor()

    cursor.execute(
        """
        DELETE FROM daily_logs
        WHERE date = ?
        """,
        (date,),
    )

    deleted_count = cursor.rowcount

    conn.commit()
    conn.close()

    return deleted_count