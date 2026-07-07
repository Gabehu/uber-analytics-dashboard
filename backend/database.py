import sqlite3
from pathlib import Path

DATABASE_PATH = Path(__file__).parent / "uber_dashboard.db"


def get_connection():
    conn = sqlite3.connect(DATABASE_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def get_hourly_label(avg_hourly: float):
    if avg_hourly >= 30:
        return "Strong hourly"
    if avg_hourly >= 25:
        return "Good hourly"
    if avg_hourly >= 20:
        return "Acceptable hourly"
    if avg_hourly >= 15:
        return "Weak hourly"
    return "Bad hourly"


def get_promo_label(promo_share: float):
    if promo_share >= 0.25:
        return "Promo-carried"
    if promo_share >= 0.10:
        return "Promo helped"
    return "Organic earnings"


def get_tip_label(tip_share: float):
    if tip_share >= 0.50:
        return "Tip-carried"
    if tip_share >= 0.35:
        return "Solid tips"
    if tip_share < 0.25:
        return "Weak tips"
    return "Normal tips"


def get_mileage_label(earnings_per_mile):
    if earnings_per_mile is None:
        return "Mileage not logged"
    if earnings_per_mile >= 1.50:
        return "Strong mileage"
    if earnings_per_mile >= 1.00:
        return "Solid mileage"
    if earnings_per_mile >= 0.75:
        return "Questionable mileage"
    return "Weak mileage"

def calculate_daily_metrics(record):
    total_earnings = record.net_fare + record.tips + record.promotions

    avg_hourly = total_earnings / record.online_hours if record.online_hours > 0 else 0
    avg_per_trip = total_earnings / record.trips if record.trips > 0 else 0

    fare_share = record.net_fare / total_earnings if total_earnings > 0 else 0
    tip_share = record.tips / total_earnings if total_earnings > 0 else 0
    promo_share = record.promotions / total_earnings if total_earnings > 0 else 0

    earnings_per_mile = None
    if record.miles_driven is not None and record.miles_driven > 0:
        earnings_per_mile = total_earnings / record.miles_driven

    return {
        "total_earnings": round(total_earnings, 2),
        "avg_hourly": round(avg_hourly, 2),
        "avg_per_trip": round(avg_per_trip, 2),
        "fare_share": round(fare_share, 4),
        "tip_share": round(tip_share, 4),
        "promo_share": round(promo_share, 4),
        "earnings_per_mile": round(earnings_per_mile, 2) if earnings_per_mile is not None else None,
        "hourly_label": get_hourly_label(avg_hourly),
        "promo_label": get_promo_label(promo_share),
        "tip_label": get_tip_label(tip_share),
        "mileage_label": get_mileage_label(earnings_per_mile),
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
            fare_share REAL NOT NULL,
            tip_share REAL NOT NULL,
            promo_share REAL NOT NULL,
            hourly_label TEXT NOT NULL,
            promo_label TEXT NOT NULL,
            tip_label TEXT NOT NULL,
            mileage_label TEXT NOT NULL,
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
        class SeedRecord:
            def __init__(self, data):
                self.date = data["date"]
                self.online_hours = data["online_hours"]
                self.trips = data["trips"]
                self.net_fare = data["net_fare"]
                self.tips = data["tips"]
                self.promotions = data["promotions"]
                self.miles_driven = data["miles_driven"]
                self.wallet_balance = data["wallet_balance"]
                self.notes = data["notes"]


        seed_record = SeedRecord(record)
        metrics = calculate_daily_metrics(seed_record)

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
                fare_share,
                tip_share,
                promo_share,
                hourly_label,
                promo_label,
                tip_label,
                mileage_label,
                wallet_balance,
                notes
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                record["date"],
                record["online_hours"],
                record["trips"],
                record["net_fare"],
                record["tips"],
                record["promotions"],
                metrics["total_earnings"],
                metrics["avg_hourly"],
                metrics["avg_per_trip"],
                record["miles_driven"],
                metrics["earnings_per_mile"],
                metrics["fare_share"],
                metrics["tip_share"],
                metrics["promo_share"],
                metrics["hourly_label"],
                metrics["promo_label"],
                metrics["tip_label"],
                metrics["mileage_label"],
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
            fare_share,
            tip_share,
            promo_share,
            hourly_label,
            promo_label,
            tip_label,
            mileage_label,
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
            fare_share,
            tip_share,
            promo_share,
            hourly_label,
            promo_label,
            tip_label,
            mileage_label,
            wallet_balance,
            notes
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
            metrics["fare_share"],
            metrics["tip_share"],
            metrics["promo_share"],
            metrics["hourly_label"],
            metrics["promo_label"],
            metrics["tip_label"],
            metrics["mileage_label"],
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
        "fare_share": metrics["fare_share"],
        "tip_share": metrics["tip_share"],
        "promo_share": metrics["promo_share"],
        "hourly_label": metrics["hourly_label"],
        "promo_label": metrics["promo_label"],
        "tip_label": metrics["tip_label"],
        "mileage_label": metrics["mileage_label"],
        "wallet_balance": record.wallet_balance,
        "notes": record.notes,
    }

def update_daily_record(date: str, record):
    metrics = calculate_daily_metrics(record)

    conn = get_connection()
    cursor = conn.cursor()

    cursor.execute(
        """
        UPDATE daily_logs
        SET
            online_hours = ?,
            trips = ?,
            net_fare = ?,
            tips = ?,
            promotions = ?,
            total_earnings = ?,
            avg_hourly = ?,
            avg_per_trip = ?,
            miles_driven = ?,
            earnings_per_mile = ?,
            fare_share = ?,
            tip_share = ?,
            promo_share = ?,
            hourly_label = ?,
            promo_label = ?,
            tip_label = ?,
            mileage_label = ?,
            wallet_balance = ?,
            notes = ?
        WHERE date = ?
        """,
        (
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
            metrics["fare_share"],
            metrics["tip_share"],
            metrics["promo_share"],
            metrics["hourly_label"],
            metrics["promo_label"],
            metrics["tip_label"],
            metrics["mileage_label"],
            record.wallet_balance,
            record.notes,
            date,
        ),
    )

    updated_count = cursor.rowcount

    conn.commit()
    conn.close()

    if updated_count == 0:
        return None

    return {
        "date": date,
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
        "fare_share": metrics["fare_share"],
        "tip_share": metrics["tip_share"],
        "promo_share": metrics["promo_share"],
        "hourly_label": metrics["hourly_label"],
        "promo_label": metrics["promo_label"],
        "tip_label": metrics["tip_label"],
        "mileage_label": metrics["mileage_label"],
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