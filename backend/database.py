import re
import sqlite3
from pathlib import Path

DATABASE_PATH = Path(__file__).parent / "uber_dashboard.db"


def round_optional(value, decimals=2):
    if value is None:
        return None

    return round(value, decimals)


def parse_12_hour_time_to_minutes(time_text):
    """
    Parses same-day 12-hour time strings like:
    - "5:30 PM"
    - "12:05 AM"
    - "9 PM"

    Returns minutes since midnight, or None if empty/invalid.
    """
    if time_text is None:
        return None

    cleaned_time = time_text.strip().upper()

    if cleaned_time == "":
        return None

    match = re.fullmatch(r"(\d{1,2})(?::(\d{2}))?\s*(AM|PM)", cleaned_time)

    if match is None:
        return None

    hour = int(match.group(1))
    minute = int(match.group(2) or 0)
    meridiem = match.group(3)

    if hour < 1 or hour > 12:
        return None

    if minute < 0 or minute > 59:
        return None

    if meridiem == "AM":
        if hour == 12:
            hour = 0
    else:
        if hour != 12:
            hour += 12

    return hour * 60 + minute


def calculate_same_day_hours(start_time, end_time):
    """
    Calculates same-day duration between two 12-hour time strings.

    Since this tracker is not intended for overnight Uber shifts, this returns
    None if the end time is earlier than the start time.
    """
    start_minutes = parse_12_hour_time_to_minutes(start_time)
    end_minutes = parse_12_hour_time_to_minutes(end_time)

    if start_minutes is None or end_minutes is None:
        return None

    if end_minutes < start_minutes:
        return None

    return (end_minutes - start_minutes) / 60

def validate_daily_record(record):
    """
    Backend validation for daily log inputs.
    Frontend validation is helpful, but this is the real API gate.
    """

    start_odometer = record.start_odometer
    end_work_odometer = record.end_work_odometer
    end_home_odometer = record.end_home_odometer

    work_start_time = record.work_start_time
    uber_stop_time = record.uber_stop_time
    home_end_time = record.home_end_time

    if record.online_hours <= 0:
        raise ValueError("Online hours must be greater than 0.")

    if record.trips <= 0:
        raise ValueError("Trips must be greater than 0.")

    if record.net_fare < 0 or record.tips < 0 or record.promotions < 0:
        raise ValueError("Fare, tips, and promotions cannot be negative.")

    if start_odometer is not None and start_odometer < 0:
        raise ValueError("Start odometer cannot be negative.")

    if end_work_odometer is not None and end_work_odometer < 0:
        raise ValueError("End Uber/work odometer cannot be negative.")

    if end_home_odometer is not None and end_home_odometer < 0:
        raise ValueError("End home odometer cannot be negative.")

    if end_work_odometer is not None and start_odometer is None:
        raise ValueError("Start odometer is required when end Uber/work odometer is entered.")

    if end_home_odometer is not None and start_odometer is None:
        raise ValueError("Start odometer is required when end home odometer is entered.")

    if end_home_odometer is not None and end_work_odometer is None:
        raise ValueError("End Uber/work odometer is required when end home odometer is entered.")

    if (
        start_odometer is not None
        and end_work_odometer is not None
        and end_work_odometer < start_odometer
    ):
        raise ValueError("End Uber/work odometer cannot be lower than start odometer.")

    if (
        start_odometer is not None
        and end_home_odometer is not None
        and end_home_odometer < start_odometer
    ):
        raise ValueError("End home odometer cannot be lower than start odometer.")

    if (
        end_work_odometer is not None
        and end_home_odometer is not None
        and end_home_odometer < end_work_odometer
    ):
        raise ValueError("End home odometer cannot be lower than end Uber/work odometer.")

    if uber_stop_time is not None and work_start_time is None:
        raise ValueError("Work start time is required when Uber stop time is entered.")

    if home_end_time is not None and (work_start_time is None or uber_stop_time is None):
        raise ValueError("Work start time and Uber stop time are required when home/end time is entered.")

    work_start_minutes = parse_12_hour_time_to_minutes(work_start_time)
    uber_stop_minutes = parse_12_hour_time_to_minutes(uber_stop_time)
    home_end_minutes = parse_12_hour_time_to_minutes(home_end_time)

    if work_start_time is not None and work_start_minutes is None:
        raise ValueError("Work start time must look like 5, 5:30, or 12:05 with AM/PM.")

    if uber_stop_time is not None and uber_stop_minutes is None:
        raise ValueError("Uber stop time must look like 5, 5:30, or 12:05 with AM/PM.")

    if home_end_time is not None and home_end_minutes is None:
        raise ValueError("Home/end time must look like 5, 5:30, or 12:05 with AM/PM.")

    if (
        work_start_minutes is not None
        and uber_stop_minutes is not None
        and uber_stop_minutes <= work_start_minutes
    ):
        raise ValueError("Uber stop time must be later than work start time.")

    if (
        uber_stop_minutes is not None
        and home_end_minutes is not None
        and home_end_minutes < uber_stop_minutes
    ):
        raise ValueError("Home/end time cannot be earlier than Uber stop time.")

    wallet_balance = record.wallet_balance
    if wallet_balance is not None and wallet_balance < 0:
        raise ValueError("Wallet balance cannot be negative.")

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

    miles_driven = record.miles_driven

    start_odometer = record.start_odometer
    end_work_odometer = record.end_work_odometer
    end_home_odometer = record.end_home_odometer

    work_start_time = record.work_start_time
    uber_stop_time = record.uber_stop_time
    home_end_time = record.home_end_time

    work_miles = None
    if start_odometer is not None and end_work_odometer is not None:
        if end_work_odometer >= start_odometer:
            work_miles = end_work_odometer - start_odometer

    total_outing_miles = None
    if start_odometer is not None and end_home_odometer is not None:
        if end_home_odometer >= start_odometer:
            total_outing_miles = end_home_odometer - start_odometer

    post_work_miles = None
    if end_work_odometer is not None and end_home_odometer is not None:
        if end_home_odometer >= end_work_odometer:
            post_work_miles = end_home_odometer - end_work_odometer

    miles_per_trip = None
    if work_miles is not None and work_miles > 0 and record.trips > 0:
        miles_per_trip = work_miles / record.trips

    earnings_per_work_mile = None
    if work_miles is not None and work_miles > 0:
        earnings_per_work_mile = total_earnings / work_miles

    earnings_per_total_mile = None
    if total_outing_miles is not None and total_outing_miles > 0:
        earnings_per_total_mile = total_earnings / total_outing_miles

    # Legacy v2.0 $/mile.
    # If odometer-based work miles exist, use that.
    # Otherwise, fall back to manually-entered miles_driven.
    earnings_per_mile = None
    effective_miles_for_legacy_metric = work_miles if work_miles is not None else miles_driven

    if effective_miles_for_legacy_metric is not None and effective_miles_for_legacy_metric > 0:
        earnings_per_mile = total_earnings / effective_miles_for_legacy_metric

    real_work_hours = calculate_same_day_hours(work_start_time, uber_stop_time)
    full_outing_hours = calculate_same_day_hours(work_start_time, home_end_time)
    post_work_hours = calculate_same_day_hours(uber_stop_time, home_end_time)

    earnings_per_real_work_hour = None
    if real_work_hours is not None and real_work_hours > 0:
        earnings_per_real_work_hour = total_earnings / real_work_hours

    earnings_per_full_outing_hour = None
    if full_outing_hours is not None and full_outing_hours > 0:
        earnings_per_full_outing_hour = total_earnings / full_outing_hours

    return {
        "total_earnings": round(total_earnings, 2),
        "avg_hourly": round(avg_hourly, 2),
        "avg_per_trip": round(avg_per_trip, 2),
        "fare_share": round(fare_share, 4),
        "tip_share": round(tip_share, 4),
        "promo_share": round(promo_share, 4),

        "earnings_per_mile": round_optional(earnings_per_mile),

        "work_miles": round_optional(work_miles, 1),
        "total_outing_miles": round_optional(total_outing_miles, 1),
        "post_work_miles": round_optional(post_work_miles, 1),
        "miles_per_trip": round_optional(miles_per_trip, 1),
        "earnings_per_work_mile": round_optional(earnings_per_work_mile),
        "earnings_per_total_mile": round_optional(earnings_per_total_mile),

        "real_work_hours": round_optional(real_work_hours, 2),
        "full_outing_hours": round_optional(full_outing_hours, 2),
        "post_work_hours": round_optional(post_work_hours, 2),
        "earnings_per_real_work_hour": round_optional(earnings_per_real_work_hour),
        "earnings_per_full_outing_hour": round_optional(earnings_per_full_outing_hour),

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

            start_odometer REAL,
            end_work_odometer REAL,
            end_home_odometer REAL,

            work_miles REAL,
            total_outing_miles REAL,
            post_work_miles REAL,
            miles_per_trip REAL,
            earnings_per_work_mile REAL,
            earnings_per_total_mile REAL,

            work_start_time TEXT,
            uber_stop_time TEXT,
            home_end_time TEXT,

            real_work_hours REAL,
            full_outing_hours REAL,
            post_work_hours REAL,
            earnings_per_real_work_hour REAL,
            earnings_per_full_outing_hour REAL,

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
            "date": "2026-06-22",
            "online_hours": 4.32,
            "trips": 10,
            "net_fare": 55.13,
            "tips": 47.32,
            "promotions": 0,
            "miles_driven": None,
            "wallet_balance": None,
            "notes": "Seed data from previous test record.",
        },
        {
            "date": "2026-06-23",
            "online_hours": 1.1,
            "trips": 2,
            "net_fare": 12.62,
            "tips": 6.08,
            "promotions": 0,
            "miles_driven": None,
            "wallet_balance": None,
            "notes": "Seed data from previous test record.",
        },
        {
            "date": "2026-06-24",
            "online_hours": 4.45,
            "trips": 11,
            "net_fare": 65.43,
            "tips": 43.10,
            "promotions": 26,
            "miles_driven": None,
            "wallet_balance": None,
            "notes": "Seed data from previous test record.",
        },
        {
            "date": "2026-06-25",
            "online_hours": 4.27,
            "trips": 7,
            "net_fare": 51.31,
            "tips": 47.83,
            "promotions": 16,
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

                self.start_odometer = None
                self.end_work_odometer = None
                self.end_home_odometer = None

                self.work_start_time = None
                self.uber_stop_time = None
                self.home_end_time = None

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

                start_odometer,
                end_work_odometer,
                end_home_odometer,

                work_miles,
                total_outing_miles,
                post_work_miles,
                miles_per_trip,
                earnings_per_work_mile,
                earnings_per_total_mile,

                work_start_time,
                uber_stop_time,
                home_end_time,

                real_work_hours,
                full_outing_hours,
                post_work_hours,
                earnings_per_real_work_hour,
                earnings_per_full_outing_hour,

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
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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

                None,
                None,
                None,

                metrics["work_miles"],
                metrics["total_outing_miles"],
                metrics["post_work_miles"],
                metrics["miles_per_trip"],
                metrics["earnings_per_work_mile"],
                metrics["earnings_per_total_mile"],

                None,
                None,
                None,

                metrics["real_work_hours"],
                metrics["full_outing_hours"],
                metrics["post_work_hours"],
                metrics["earnings_per_real_work_hour"],
                metrics["earnings_per_full_outing_hour"],

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

            start_odometer,
            end_work_odometer,
            end_home_odometer,

            work_miles,
            total_outing_miles,
            post_work_miles,
            miles_per_trip,
            earnings_per_work_mile,
            earnings_per_total_mile,

            work_start_time,
            uber_stop_time,
            home_end_time,

            real_work_hours,
            full_outing_hours,
            post_work_hours,
            earnings_per_real_work_hour,
            earnings_per_full_outing_hour,

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

    daily_rows = [dict(row) for row in rows]
    _attach_daily_wallet_deltas(daily_rows)  # newest-first, as required

    return daily_rows


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

    # Current wallet balance = the most recently logged value, not a sum —
    # wallet_balance is a snapshot of what's actually there, not a running
    # total. Not every day logs it, so this is "most recent day that did."
    cursor.execute(
        """
        SELECT date, wallet_balance
        FROM daily_logs
        WHERE wallet_balance IS NOT NULL
        ORDER BY date DESC
        LIMIT 1
        """
    )
    wallet_row = cursor.fetchone()

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
        "current_wallet_balance": round(wallet_row["wallet_balance"], 2) if wallet_row else None,
        "current_wallet_as_of": wallet_row["date"] if wallet_row else None,
    }


def create_daily_record(record):
    validate_daily_record(record)
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

            start_odometer,
            end_work_odometer,
            end_home_odometer,

            work_miles,
            total_outing_miles,
            post_work_miles,
            miles_per_trip,
            earnings_per_work_mile,
            earnings_per_total_mile,

            work_start_time,
            uber_stop_time,
            home_end_time,

            real_work_hours,
            full_outing_hours,
            post_work_hours,
            earnings_per_real_work_hour,
            earnings_per_full_outing_hour,

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
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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

            record.start_odometer,
            record.end_work_odometer,
            record.end_home_odometer,

            metrics["work_miles"],
            metrics["total_outing_miles"],
            metrics["post_work_miles"],
            metrics["miles_per_trip"],
            metrics["earnings_per_work_mile"],
            metrics["earnings_per_total_mile"],

            record.work_start_time,
            record.uber_stop_time,
            record.home_end_time,

            metrics["real_work_hours"],
            metrics["full_outing_hours"],
            metrics["post_work_hours"],
            metrics["earnings_per_real_work_hour"],
            metrics["earnings_per_full_outing_hour"],

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

        "start_odometer": record.start_odometer,
        "end_work_odometer": record.end_work_odometer,
        "end_home_odometer": record.end_home_odometer,

        "work_miles": metrics["work_miles"],
        "total_outing_miles": metrics["total_outing_miles"],
        "post_work_miles": metrics["post_work_miles"],
        "miles_per_trip": metrics["miles_per_trip"],
        "earnings_per_work_mile": metrics["earnings_per_work_mile"],
        "earnings_per_total_mile": metrics["earnings_per_total_mile"],

        "work_start_time": record.work_start_time,
        "uber_stop_time": record.uber_stop_time,
        "home_end_time": record.home_end_time,

        "real_work_hours": metrics["real_work_hours"],
        "full_outing_hours": metrics["full_outing_hours"],
        "post_work_hours": metrics["post_work_hours"],
        "earnings_per_real_work_hour": metrics["earnings_per_real_work_hour"],
        "earnings_per_full_outing_hour": metrics["earnings_per_full_outing_hour"],

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
    validate_daily_record(record)
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

            start_odometer = ?,
            end_work_odometer = ?,
            end_home_odometer = ?,

            work_miles = ?,
            total_outing_miles = ?,
            post_work_miles = ?,
            miles_per_trip = ?,
            earnings_per_work_mile = ?,
            earnings_per_total_mile = ?,

            work_start_time = ?,
            uber_stop_time = ?,
            home_end_time = ?,

            real_work_hours = ?,
            full_outing_hours = ?,
            post_work_hours = ?,
            earnings_per_real_work_hour = ?,
            earnings_per_full_outing_hour = ?,

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

            record.start_odometer,
            record.end_work_odometer,
            record.end_home_odometer,

            metrics["work_miles"],
            metrics["total_outing_miles"],
            metrics["post_work_miles"],
            metrics["miles_per_trip"],
            metrics["earnings_per_work_mile"],
            metrics["earnings_per_total_mile"],

            record.work_start_time,
            record.uber_stop_time,
            record.home_end_time,

            metrics["real_work_hours"],
            metrics["full_outing_hours"],
            metrics["post_work_hours"],
            metrics["earnings_per_real_work_hour"],
            metrics["earnings_per_full_outing_hour"],

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

        "start_odometer": record.start_odometer,
        "end_work_odometer": record.end_work_odometer,
        "end_home_odometer": record.end_home_odometer,

        "work_miles": metrics["work_miles"],
        "total_outing_miles": metrics["total_outing_miles"],
        "post_work_miles": metrics["post_work_miles"],
        "miles_per_trip": metrics["miles_per_trip"],
        "earnings_per_work_mile": metrics["earnings_per_work_mile"],
        "earnings_per_total_mile": metrics["earnings_per_total_mile"],

        "work_start_time": record.work_start_time,
        "uber_stop_time": record.uber_stop_time,
        "home_end_time": record.home_end_time,

        "real_work_hours": metrics["real_work_hours"],
        "full_outing_hours": metrics["full_outing_hours"],
        "post_work_hours": metrics["post_work_hours"],
        "earnings_per_real_work_hour": metrics["earnings_per_real_work_hour"],
        "earnings_per_full_outing_hour": metrics["earnings_per_full_outing_hour"],

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


# ============================================================
# CSV export (v2.2)
# ============================================================

import csv
import io

# Canonical column order for CSV export. Mirrors get_daily_data()'s field
# order for readability. Any field present in the data but missing here is
# appended at the end rather than dropped, so a future schema addition still
# exports even if this list isn't updated.
CSV_COLUMNS = [
    "date", "online_hours", "trips", "net_fare", "tips", "promotions",
    "total_earnings", "avg_hourly", "avg_per_trip",
    "miles_driven", "earnings_per_mile",
    "start_odometer", "end_work_odometer", "end_home_odometer",
    "work_miles", "total_outing_miles", "post_work_miles", "miles_per_trip",
    "earnings_per_work_mile", "earnings_per_total_mile",
    "work_start_time", "uber_stop_time", "home_end_time",
    "real_work_hours", "full_outing_hours", "post_work_hours",
    "earnings_per_real_work_hour", "earnings_per_full_outing_hour",
    "fare_share", "tip_share", "promo_share",
    "hourly_label", "promo_label", "tip_label", "mileage_label",
    "wallet_balance", "notes",
]


def get_daily_csv():
    """
    Returns all daily logs serialized as a CSV string, newest first.
    Reuses get_daily_data() so the exported columns stay in sync with the
    schema automatically.
    """
    rows = get_daily_data()

    known = list(CSV_COLUMNS)
    extra_keys = []
    for row in rows:
        for key in row.keys():
            if key not in known and key not in extra_keys:
                extra_keys.append(key)

    fieldnames = known + extra_keys

    buffer = io.StringIO()
    writer = csv.DictWriter(buffer, fieldnames=fieldnames, extrasaction="ignore")
    writer.writeheader()
    for row in rows:
        writer.writerow({key: row.get(key) for key in fieldnames})

    return buffer.getvalue()


# ============================================================
# Weekly series (v2.3 — week jump picker; extendable to v2.4 Option C)
# ============================================================

from datetime import date as _date, timedelta as _timedelta


def _monday_of(d):
    # Monday = 0 ... Sunday = 6
    return d - _timedelta(days=d.weekday())


def get_weekly_series():
    """
    Returns a continuous Monday-Sunday week series spanning from the earliest
    logged week through the most recent, newest first. Empty weeks between
    weeks with data are included (total 0.00) so a picker won't appear to skip
    weeks when the data has gaps.

    Each week carries a `daily` list of 7 entries (Mon..Sun) so this endpoint
    can also feed a mini-chart-per-week view later without a schema change.
    """
    daily_rows = get_daily_data()
    if not daily_rows:
        return []

    earnings_by_date = {}
    for row in daily_rows:
        earnings_by_date[row["date"]] = row.get("total_earnings", 0) or 0

    # get_daily_data() returns newest-first; the wallet-delta helper wants
    # oldest-first, and reuses the already-attached per-day deltas' inputs
    # (just the date + wallet_balance) rather than recomputing anything.
    rows_asc = list(reversed(daily_rows))

    parsed_dates = [_date.fromisoformat(row["date"]) for row in daily_rows]
    first_monday = _monday_of(min(parsed_dates))
    last_monday = _monday_of(max(parsed_dates))

    weeks = []
    current_monday = first_monday
    while current_monday <= last_monday:
        week_end = current_monday + _timedelta(days=6)

        daily = []
        week_total = 0.0
        for offset in range(7):
            day = current_monday + _timedelta(days=offset)
            day_key = day.isoformat()
            day_earnings = earnings_by_date.get(day_key, 0)
            week_total += day_earnings
            daily.append({
                "date": day_key,
                "earnings": round(day_earnings, 2),
                "has_record": day_key in earnings_by_date,
            })

        wallet_delta, wallet_delta_start_date, wallet_delta_end_date = (
            _compute_week_wallet_delta(rows_asc, current_monday, week_end)
        )

        weeks.append({
            "week_start": current_monday.isoformat(),
            "week_end": week_end.isoformat(),
            "total_earnings": round(week_total, 2),
            "daily": daily,
            "wallet_delta": wallet_delta,
            "wallet_delta_start_date": wallet_delta_start_date,
            "wallet_delta_end_date": wallet_delta_end_date,
        })

        current_monday += _timedelta(days=7)

    weeks.reverse()
    return weeks


# ============================================================
# Wallet delta (v2.4)
# ============================================================
#
# Wallet balance is optional and not logged every day, so "delta vs
# yesterday" doesn't always make sense. Instead, each day's delta is computed
# against the most recent EARLIER day that also had a wallet balance logged,
# however many days back that was. This is computed live (not stored) so
# editing an old day's wallet balance can never leave a stale delta on a
# later day.
#
# NOTE: a wallet delta is informational only, not a judgment. A drop can
# mean a cash-out/withdrawal rather than "lost money" — there is no rule
# label or color-coding applied to it for that reason.

from datetime import date as _wallet_date


def _attach_daily_wallet_deltas(rows_desc):
    """
    rows_desc: daily rows ordered newest-first (as returned by
    get_daily_data()). Adds 'wallet_delta' and 'wallet_delta_days_ago' to
    each row in place and returns the same list.
    """
    rows_asc = list(reversed(rows_desc))

    last_logged_balance = None
    last_logged_date = None

    for row in rows_asc:
        row["wallet_delta"] = None
        row["wallet_delta_days_ago"] = None

        current_balance = row.get("wallet_balance")
        current_date = _wallet_date.fromisoformat(row["date"])

        if current_balance is not None:
            if last_logged_balance is not None:
                row["wallet_delta"] = round(current_balance - last_logged_balance, 2)
                row["wallet_delta_days_ago"] = (current_date - last_logged_date).days

            last_logged_balance = current_balance
            last_logged_date = current_date

    return rows_desc


def _compute_week_wallet_delta(all_rows_asc, week_start, week_end):
    """
    all_rows_asc: all daily rows (oldest first), each with 'date' and
    'wallet_balance'. week_start/week_end: date objects.

    Returns (delta, start_reference_date, end_reference_date) as
    (float|None, str|None, str|None). None when there isn't enough logged
    data (before AND within/before the week) to compute a real change.
    """
    logged = [
        (_wallet_date.fromisoformat(r["date"]), r["wallet_balance"])
        for r in all_rows_asc
        if r.get("wallet_balance") is not None
    ]
    logged.sort(key=lambda item: item[0])

    if not logged:
        return None, None, None

    end_candidates = [item for item in logged if item[0] <= week_end]
    if not end_candidates:
        return None, None, None
    end_date, end_balance = end_candidates[-1]

    start_candidates = [item for item in logged if item[0] < week_start]
    if not start_candidates:
        return None, None, None
    start_date, start_balance = start_candidates[-1]

    if end_date == start_date:
        return None, None, None

    return (
        round(end_balance - start_balance, 2),
        start_date.isoformat(),
        end_date.isoformat(),
    )


# ============================================================
# CSV import (v2.6) — backup/restore, not general-purpose import
# ============================================================
#
# Only RAW input fields are read from the CSV (date, hours, trips, fare,
# tips, promotions, odometer/time fields, wallet, notes). Any computed
# column present in an exported CSV (total_earnings, labels, wallet_delta,
# etc.) is deliberately ignored -- every row is recalculated fresh through
# the same create_daily_record()/update_daily_record() path a manual entry
# uses, so imported data can never carry forward stale computed numbers.


def _import_optional_float(value):
    if value is None or str(value).strip() == "":
        return None
    return float(value)


def _import_optional_text(value):
    if value is None or str(value).strip() == "":
        return None
    return str(value)


def _import_required_float(value, default=0.0):
    if value is None or str(value).strip() == "":
        return default
    return float(value)


def _import_required_int(value):
    if value is None or str(value).strip() == "":
        return 0
    return int(float(value))


class ImportRecord:
    """
    Stand-in for DailyRecordCreate, built from one CSV row. Exposes the same
    attributes validate_daily_record()/calculate_daily_metrics() read.
    """

    def __init__(self, row):
        self.date = (row.get("date") or "").strip()
        self.online_hours = _import_required_float(row.get("online_hours"))
        self.trips = _import_required_int(row.get("trips"))
        self.net_fare = _import_required_float(row.get("net_fare"))
        self.tips = _import_required_float(row.get("tips"))
        self.promotions = _import_required_float(row.get("promotions"))

        self.miles_driven = _import_optional_float(row.get("miles_driven"))

        self.start_odometer = _import_optional_float(row.get("start_odometer"))
        self.end_work_odometer = _import_optional_float(row.get("end_work_odometer"))
        self.end_home_odometer = _import_optional_float(row.get("end_home_odometer"))

        self.work_start_time = _import_optional_text(row.get("work_start_time"))
        self.uber_stop_time = _import_optional_text(row.get("uber_stop_time"))
        self.home_end_time = _import_optional_text(row.get("home_end_time"))

        self.wallet_balance = _import_optional_float(row.get("wallet_balance"))
        self.notes = _import_optional_text(row.get("notes"))


def _parse_import_csv(csv_text):
    """
    Parses CSV text into a list of (row_number, date, record, error) tuples.
    row_number starts at 2 (row 1 is the header), matching what a person
    would see if they opened the file in a spreadsheet. error is a string
    describing why a row was rejected, or None if it parsed cleanly (parsing
    only -- business-rule validation happens separately).
    """
    reader = csv.DictReader(io.StringIO(csv_text))
    results = []

    for i, row in enumerate(reader, start=2):
        date_str = (row.get("date") or "").strip()

        if not date_str:
            results.append((i, None, None, "Missing date"))
            continue

        try:
            record = ImportRecord(row)
        except (ValueError, TypeError) as error:
            results.append((i, date_str, None, f"Invalid number in row: {error}"))
            continue

        results.append((i, date_str, record, None))

    return results


def preview_csv_import(csv_text):
    """
    Dry run: parses and validates every row but writes nothing. Returns
    counts of how many rows would be newly inserted, how many would
    overwrite an existing date, and how many rows are invalid (with reasons
    for up to the first 20, to keep the response small).
    """
    parsed_rows = _parse_import_csv(csv_text)
    existing_dates = {row["date"] for row in get_daily_data()}
    seen_dates_in_file = set()

    new_count = 0
    update_count = 0
    errors = []

    for row_number, date_str, record, parse_error in parsed_rows:
        if parse_error:
            errors.append({"row": row_number, "date": date_str, "message": parse_error})
            continue

        try:
            validate_daily_record(record)
        except ValueError as error:
            errors.append({"row": row_number, "date": date_str, "message": str(error)})
            continue

        if date_str in existing_dates or date_str in seen_dates_in_file:
            update_count += 1
        else:
            new_count += 1

        seen_dates_in_file.add(date_str)

    return {
        "total_rows": len(parsed_rows),
        "new_count": new_count,
        "update_count": update_count,
        "error_count": len(errors),
        "errors": errors[:20],
    }


def commit_csv_import(csv_text):
    """
    Actually performs the import: valid rows are upserted (created if the
    date is new, overwritten if it already exists), invalid rows are
    skipped and reported. A duplicate date appearing twice within the same
    file is treated as create-then-update (last occurrence wins), not a
    crash, matching "restore" semantics.
    """
    parsed_rows = _parse_import_csv(csv_text)
    existing_dates = {row["date"] for row in get_daily_data()}

    inserted = 0
    updated = 0
    errors = []

    for row_number, date_str, record, parse_error in parsed_rows:
        if parse_error:
            errors.append({"row": row_number, "date": date_str, "message": parse_error})
            continue

        try:
            validate_daily_record(record)
        except ValueError as error:
            errors.append({"row": row_number, "date": date_str, "message": str(error)})
            continue

        try:
            if date_str in existing_dates:
                update_daily_record(date_str, record)
                updated += 1
            else:
                create_daily_record(record)
                inserted += 1
                existing_dates.add(date_str)
        except Exception as error:  # noqa: BLE001 - surface any write failure per-row
            errors.append({"row": row_number, "date": date_str, "message": str(error)})

    return {
        "inserted": inserted,
        "updated": updated,
        "error_count": len(errors),
        "errors": errors[:20],
    }