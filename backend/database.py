import json
import re
import sqlite3
from datetime import date as date_cls
from pathlib import Path

DATABASE_PATH = Path(__file__).parent / "uber_dashboard.db"


class DailyDateConflictError(ValueError):
    """Raised when an edit tries to move a log onto an occupied date."""

    def __init__(self, target_date: str):
        try:
            parsed_date = date_cls.fromisoformat(target_date)
            friendly_date = f"{parsed_date.strftime('%b')} {parsed_date.day}"
        except (TypeError, ValueError):
            friendly_date = target_date

        super().__init__(
            f"A log already exists for {friendly_date}. Choose another date "
            "or delete/merge the existing entry first."
        )
        self.target_date = target_date


# ============================================================
# Day Effects (v3.2) — fixed tag vocabulary
# ============================================================
#
# A small, closed set of self-reported conditions, distinct from the app's
# computed rule-based labels (hourly/promo/tip/mileage). These describe
# what happened, not a judgment about how the day performed, so they're
# stored and displayed separately from LabelChip-style labels.

ALLOWED_DAY_TAGS = {
    "rain",
    "snow",
    "heavy_traffic",
    "high_demand",
    "low_demand",
    "dead_zone",
    "good_orders",
    "bad_orders",
    "shop_and_deliver",
    "delivery_heavy",
    "mixed_orders",
    "quest_day",
    "app_issues",
    "low_battery",
    "phone_hotspot_issues",
}


def _day_tags_to_storage(tags):
    """Converts a list of tag values into the comma-joined string stored in
    the day_tags DB column. Returns None for an empty/missing list so the
    column stays NULL rather than storing an empty string."""
    if not tags:
        return None

    return ",".join(tags)


def _day_tags_from_storage(stored_value):
    """Converts the stored comma-joined string back into a list of tag
    values. Returns None for NULL/empty so untagged days come back as None,
    not an empty list."""
    if stored_value is None or stored_value == "":
        return None

    return [tag for tag in stored_value.split(",") if tag]


def _break_value(session, key):
    if isinstance(session, dict):
        return session.get(key)
    return getattr(session, key, None)


def _raw_break_sessions(breaks):
    if not breaks:
        return None

    return [
        {
            "start_time": _break_value(session, "start_time"),
            "end_time": _break_value(session, "end_time"),
            "start_odometer": _break_value(session, "start_odometer"),
            "end_odometer": _break_value(session, "end_odometer"),
        }
        for session in breaks
    ]


def _breaks_to_storage(breaks):
    raw_sessions = _raw_break_sessions(breaks)
    if not raw_sessions:
        return None
    return json.dumps(raw_sessions, separators=(",", ":"))


def _breaks_from_storage(stored_value):
    if not stored_value:
        return None

    sessions = json.loads(stored_value)
    enriched = []
    for session in sessions:
        duration = calculate_same_day_hours(
            session.get("start_time"),
            session.get("end_time"),
        )
        start_odometer = session.get("start_odometer")
        end_odometer = session.get("end_odometer")
        miles = None
        if start_odometer is not None and end_odometer is not None:
            miles = end_odometer - start_odometer

        enriched.append({
            **session,
            "duration_hours": round_optional(duration, 4),
            "miles": round_optional(miles, 1),
        })

    return enriched


def _raw_work_sessions(sessions):
    if not sessions:
        return None

    return [
        {
            "start_time": _break_value(session, "start_time"),
            "stop_time": _break_value(session, "stop_time"),
            "start_odometer": _break_value(session, "start_odometer"),
            "stop_odometer": _break_value(session, "stop_odometer"),
        }
        for session in sessions
    ]


def _work_sessions_to_storage(sessions):
    raw_sessions = _raw_work_sessions(sessions)
    if not raw_sessions:
        return None
    return json.dumps(raw_sessions, separators=(",", ":"))


def _work_sessions_from_storage(stored_value):
    if not stored_value:
        return None
    return json.loads(stored_value)


def _all_work_sessions(record):
    sessions = []
    first_values = (
        record.work_start_time,
        record.uber_stop_time,
        record.start_odometer,
        record.end_work_odometer,
    )
    if any(value is not None for value in first_values):
        sessions.append({
            "start_time": record.work_start_time,
            "stop_time": record.uber_stop_time,
            "start_odometer": record.start_odometer,
            "stop_odometer": record.end_work_odometer,
        })

    sessions.extend(_raw_work_sessions(
        getattr(record, "additional_sessions", None)
    ) or [])
    return sessions


def _enrich_work_sessions(sessions):
    if not sessions:
        return None

    enriched = []
    for session in sessions:
        start_time = _break_value(session, "start_time")
        stop_time = _break_value(session, "stop_time")
        start_odometer = _break_value(session, "start_odometer")
        stop_odometer = _break_value(session, "stop_odometer")
        miles = None
        if start_odometer is not None and stop_odometer is not None:
            miles = stop_odometer - start_odometer

        enriched.append({
            "start_time": start_time,
            "stop_time": stop_time,
            "start_odometer": start_odometer,
            "stop_odometer": stop_odometer,
            "duration_hours": round_optional(
                calculate_same_day_hours(start_time, stop_time), 4
            ),
            "miles": round_optional(miles, 1),
        })

    return enriched


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

    end_home_odometer = record.end_home_odometer
    home_end_time = record.home_end_time
    work_sessions = _all_work_sessions(record)
    breaks = getattr(record, "breaks", None) or []

    if record.online_hours <= 0:
        raise ValueError("Online hours must be greater than 0.")

    if record.trips <= 0:
        raise ValueError("Trips must be greater than 0.")

    cash_tips = getattr(record, "cash_tips", 0) or 0
    if record.net_fare < 0 or record.tips < 0 or cash_tips < 0 or record.promotions < 0:
        raise ValueError("Fare, tips, cash tips, and promotions cannot be negative.")

    if end_home_odometer is not None and end_home_odometer < 0:
        raise ValueError("End home odometer cannot be negative.")

    home_end_minutes = parse_12_hour_time_to_minutes(home_end_time)
    if home_end_time is not None and home_end_minutes is None:
        raise ValueError("Home/end time must look like 5, 5:30, or 12:05 with AM/PM.")

    first_session_values = (
        record.work_start_time,
        record.uber_stop_time,
        record.start_odometer,
        record.end_work_odometer,
    )
    if getattr(record, "additional_sessions", None) and not any(first_session_values):
        raise ValueError("Session 1 is required before additional work sessions.")

    session_ranges = []
    previous_stop_minutes = None
    previous_stop_odometer = None
    for index, session in enumerate(work_sessions, start=1):
        start_time = _break_value(session, "start_time")
        stop_time = _break_value(session, "stop_time")
        start_minutes = parse_12_hour_time_to_minutes(start_time)
        stop_minutes = parse_12_hour_time_to_minutes(stop_time)

        if start_minutes is None or stop_minutes is None:
            raise ValueError(
                f"Session {index} start and stop times must both be entered "
                "using a time like 5, 5:30, or 12:05 with AM/PM."
            )
        if stop_minutes <= start_minutes:
            raise ValueError(f"Session {index} stop time must be later than its start time.")
        if previous_stop_minutes is not None and start_minutes < previous_stop_minutes:
            raise ValueError("Work sessions cannot overlap and must be entered in time order.")

        start_odometer = _break_value(session, "start_odometer")
        stop_odometer = _break_value(session, "stop_odometer")
        if (start_odometer is None) != (stop_odometer is None):
            raise ValueError(f"Session {index} odometers must be entered together.")
        if start_odometer is not None:
            if start_odometer < 0 or stop_odometer < 0:
                raise ValueError(f"Session {index} odometers cannot be negative.")
            if stop_odometer < start_odometer:
                raise ValueError(
                    f"Session {index} stop odometer cannot be lower than its start odometer."
                )
            if (
                previous_stop_odometer is not None
                and start_odometer < previous_stop_odometer
            ):
                raise ValueError(
                    "Session odometers must stay in trip order between sessions."
                )
            previous_stop_odometer = stop_odometer

        session_ranges.append({
            "start_minutes": start_minutes,
            "stop_minutes": stop_minutes,
            "start_odometer": start_odometer,
            "stop_odometer": stop_odometer,
        })
        previous_stop_minutes = stop_minutes

    if (home_end_time is not None or end_home_odometer is not None) and not session_ranges:
        raise ValueError("A work session is required when final home-end details are entered.")

    if session_ranges:
        final_session = session_ranges[-1]
        if (
            home_end_minutes is not None
            and home_end_minutes < final_session["stop_minutes"]
        ):
            raise ValueError("Home/end time cannot be earlier than the final session stop time.")
        if end_home_odometer is not None:
            final_stop_odometer = final_session["stop_odometer"]
            if final_stop_odometer is None:
                raise ValueError(
                    "The final session odometers are required when home-end odometer is entered."
                )
            if end_home_odometer < final_stop_odometer:
                raise ValueError(
                    "End home odometer cannot be lower than the final session stop odometer."
                )

    previous_break_end = None
    previous_break_end_odometer = None
    for index, session in enumerate(breaks, start=1):
        break_start_time = _break_value(session, "start_time")
        break_end_time = _break_value(session, "end_time")
        break_start_minutes = parse_12_hour_time_to_minutes(break_start_time)
        break_end_minutes = parse_12_hour_time_to_minutes(break_end_time)

        if break_start_minutes is None or break_end_minutes is None:
            raise ValueError(
                f"Break {index} times must look like 5, 5:30, or 12:05 with AM/PM."
            )

        matching_session = next(
            (
                session_range
                for session_range in session_ranges
                if session_range["start_minutes"] <= break_start_minutes
                < break_end_minutes <= session_range["stop_minutes"]
            ),
            None,
        )
        if matching_session is None:
            raise ValueError(
                f"Break {index} must fall completely inside one work session."
            )

        if previous_break_end is not None and break_start_minutes < previous_break_end:
            raise ValueError("Break sessions cannot overlap and must be entered in time order.")
        previous_break_end = break_end_minutes

        break_start_odometer = _break_value(session, "start_odometer")
        break_end_odometer = _break_value(session, "end_odometer")
        if (break_start_odometer is None) != (break_end_odometer is None):
            raise ValueError(
                f"Break {index} start and end odometers must be entered together."
            )
        if break_start_odometer is not None:
            session_start_odometer = matching_session["start_odometer"]
            session_stop_odometer = matching_session["stop_odometer"]
            if session_start_odometer is None or session_stop_odometer is None:
                raise ValueError(
                    f"Session odometers are required for break {index} odometers."
                )
            if not (
                session_start_odometer <= break_start_odometer
                <= break_end_odometer <= session_stop_odometer
            ):
                raise ValueError(
                    f"Break {index} odometers must be inside the same work session."
                )
            if (
                previous_break_end_odometer is not None
                and break_start_odometer < previous_break_end_odometer
            ):
                raise ValueError(
                    "Break odometers cannot overlap and must be entered in trip order."
                )
            previous_break_end_odometer = break_end_odometer

    wallet_balance = record.wallet_balance
    if wallet_balance is not None and wallet_balance < 0:
        raise ValueError("Wallet balance cannot be negative.")

    day_tags = getattr(record, "day_tags", None)
    if day_tags:
        invalid_tags = sorted(set(day_tags) - ALLOWED_DAY_TAGS)
        if invalid_tags:
            raise ValueError(f"Unknown day effect tag(s): {', '.join(invalid_tags)}")

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
        return "Promo-boosted"
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
    cash_tips = getattr(record, "cash_tips", 0) or 0
    combined_tips = record.tips + cash_tips
    total_earnings = record.net_fare + combined_tips + record.promotions

    avg_hourly = total_earnings / record.online_hours if record.online_hours > 0 else 0
    avg_per_trip = total_earnings / record.trips if record.trips > 0 else 0

    fare_share = record.net_fare / total_earnings if total_earnings > 0 else 0
    tip_share = combined_tips / total_earnings if total_earnings > 0 else 0
    promo_share = record.promotions / total_earnings if total_earnings > 0 else 0

    miles_driven = record.miles_driven

    end_home_odometer = record.end_home_odometer
    home_end_time = record.home_end_time
    work_sessions = _all_work_sessions(record)
    breaks = getattr(record, "breaks", None) or []

    break_miles = None
    break_mile_values = []
    for session in breaks:
        break_start_odometer = _break_value(session, "start_odometer")
        break_end_odometer = _break_value(session, "end_odometer")
        if break_start_odometer is not None and break_end_odometer is not None:
            break_mile_values.append(break_end_odometer - break_start_odometer)
    if break_mile_values:
        break_miles = sum(break_mile_values)

    work_miles = None
    session_mile_values = []
    all_sessions_have_mileage = bool(work_sessions)
    for session in work_sessions:
        session_start_odometer = _break_value(session, "start_odometer")
        session_stop_odometer = _break_value(session, "stop_odometer")
        if session_start_odometer is None or session_stop_odometer is None:
            all_sessions_have_mileage = False
            break
        session_mile_values.append(session_stop_odometer - session_start_odometer)
    if all_sessions_have_mileage:
        work_miles = sum(session_mile_values)
        if break_miles is not None:
            work_miles -= break_miles

    total_outing_miles = None
    first_start_odometer = (
        _break_value(work_sessions[0], "start_odometer")
        if work_sessions else None
    )
    if first_start_odometer is not None and end_home_odometer is not None:
        total_outing_miles = end_home_odometer - first_start_odometer

    post_work_miles = None
    final_stop_odometer = (
        _break_value(work_sessions[-1], "stop_odometer")
        if work_sessions else None
    )
    if final_stop_odometer is not None and end_home_odometer is not None:
        post_work_miles = end_home_odometer - final_stop_odometer

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

    break_hours = sum(
        calculate_same_day_hours(
            _break_value(session, "start_time"),
            _break_value(session, "end_time"),
        )
        for session in breaks
    ) if breaks else None
    real_work_hours = sum(
        calculate_same_day_hours(
            _break_value(session, "start_time"),
            _break_value(session, "stop_time"),
        )
        for session in work_sessions
    ) if work_sessions else None
    if real_work_hours is not None and break_hours is not None:
        real_work_hours -= break_hours
    first_start_time = (
        _break_value(work_sessions[0], "start_time")
        if work_sessions else None
    )
    final_stop_time = (
        _break_value(work_sessions[-1], "stop_time")
        if work_sessions else None
    )
    full_outing_hours = calculate_same_day_hours(first_start_time, home_end_time)
    post_work_hours = calculate_same_day_hours(final_stop_time, home_end_time)

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
        "break_miles": round_optional(break_miles, 1),
        "total_outing_miles": round_optional(total_outing_miles, 1),
        "post_work_miles": round_optional(post_work_miles, 1),
        "miles_per_trip": round_optional(miles_per_trip, 1),
        "earnings_per_work_mile": round_optional(earnings_per_work_mile),
        "earnings_per_total_mile": round_optional(earnings_per_total_mile),

        # Preserve minute-level accuracy when daily values are summed into a
        # week. The frontend still presents these as friendly hours/minutes.
        "real_work_hours": round_optional(real_work_hours, 4),
        "break_hours": round_optional(break_hours, 4),
        "full_outing_hours": round_optional(full_outing_hours, 4),
        "post_work_hours": round_optional(post_work_hours, 4),
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
            cash_tips REAL NOT NULL DEFAULT 0,
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
            break_miles REAL,
            total_outing_miles REAL,
            post_work_miles REAL,
            miles_per_trip REAL,
            earnings_per_work_mile REAL,
            earnings_per_total_mile REAL,

            work_start_time TEXT,
            uber_stop_time TEXT,
            home_end_time TEXT,
            breaks_json TEXT,
            additional_sessions_json TEXT,

            real_work_hours REAL,
            break_hours REAL,
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
            notes TEXT,

            day_tags TEXT
        )
        """
    )

    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS app_settings (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            uber_wallet_floor REAL
        )
        """
    )
    cursor.execute(
        "INSERT OR IGNORE INTO app_settings (id, uber_wallet_floor) VALUES (1, NULL)"
    )

    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS quests (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            start_date TEXT NOT NULL,
            end_date TEXT NOT NULL,
            first_tier_trips INTEGER NOT NULL,
            first_tier_bonus REAL NOT NULL,
            final_tier_trips INTEGER NOT NULL,
            final_additional_bonus REAL NOT NULL
        )
        """
    )

    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS weekly_notes (
            week_end TEXT PRIMARY KEY,
            notes TEXT NOT NULL
        )
        """
    )

    # Live tracking is intentionally separate from finalized daily logs.
    # Draft sessions may have an open stop/break endpoint, which would be
    # invalid in daily_logs but is exactly what a running mobile timer needs.
    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS daily_drafts (
            date TEXT PRIMARY KEY,
            sessions_json TEXT NOT NULL DEFAULT '[]',
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
        """
    )

    # v3.2: if the table already existed from before Day Effects shipped,
    # add the new column in place rather than requiring a fresh DB. Wrapped
    # in try/except since ALTER TABLE ADD COLUMN fails if the column is
    # already there (e.g. on a brand-new DB created with the CREATE TABLE
    # above, which already includes it).
    try:
        cursor.execute("ALTER TABLE daily_logs ADD COLUMN day_tags TEXT")
    except sqlite3.OperationalError:
        pass

    # Break tracking is optional and nullable, so existing daily logs remain
    # valid. Add each column independently for databases created by an older
    # app version.
    for column_definition in (
        "breaks_json TEXT",
        "additional_sessions_json TEXT",
        "break_miles REAL",
        "break_hours REAL",
    ):
        try:
            cursor.execute(f"ALTER TABLE daily_logs ADD COLUMN {column_definition}")
        except sqlite3.OperationalError:
            pass

    try:
        cursor.execute(
            "ALTER TABLE daily_logs ADD COLUMN cash_tips REAL NOT NULL DEFAULT 0"
        )
    except sqlite3.OperationalError:
        pass

    # v3.8.1: promotions are a legitimate part of Uber earnings and often
    # motivate the shift, so the former negative-sounding label is now
    # framed as a boost. Update saved computed labels for existing logs too.
    cursor.execute(
        """
        UPDATE daily_logs
        SET promo_label = 'Promo-boosted'
        WHERE promo_label = 'Promo-carried'
        """
    )

    # Preserve data if the brief single-break draft was launched before the
    # multiple-session design replaced it. Those columns may still exist in
    # a local DB even though new databases no longer create them.
    existing_columns = {
        row["name"]
        for row in cursor.execute("PRAGMA table_info(daily_logs)").fetchall()
    }
    legacy_break_columns = {
        "break_start_time",
        "break_end_time",
        "break_start_odometer",
        "break_end_odometer",
    }
    if legacy_break_columns <= existing_columns:
        legacy_rows = cursor.execute(
            """
            SELECT
                date, breaks_json, break_start_time, break_end_time,
                break_start_odometer, break_end_odometer
            FROM daily_logs
            WHERE breaks_json IS NULL
              AND break_start_time IS NOT NULL
              AND break_end_time IS NOT NULL
            """
        ).fetchall()
        for row in legacy_rows:
            cursor.execute(
                "UPDATE daily_logs SET breaks_json = ? WHERE date = ?",
                (
                    _breaks_to_storage([{
                        "start_time": row["break_start_time"],
                        "end_time": row["break_end_time"],
                        "start_odometer": row["break_start_odometer"],
                        "end_odometer": row["break_end_odometer"],
                    }]),
                    row["date"],
                ),
            )

    # These 4 rows are a minimal "starter" set so a brand-new install isn't
    # a completely blank dashboard on first run -- separate from and much
    # smaller than seed_mock.py, which is an opt-in dev script for
    # generating many weeks of richer test data on demand (see that file).
    # INSERT OR IGNORE below means these are only ever added once, on the
    # very first table creation; they won't reappear or duplicate after
    # that, and won't overwrite anything if those same dates already exist.
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
            "day_tags": None,
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
            "day_tags": None,
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
            "day_tags": None,
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
            "day_tags": None,
        },
    ]

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
            self.breaks = None
            self.additional_sessions = None

            self.wallet_balance = data["wallet_balance"]
            self.notes = data["notes"]
            self.day_tags = data.get("day_tags")

    for record in sample_data:
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
                notes,

                day_tags
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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

                _day_tags_to_storage(record.get("day_tags")),
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
            cash_tips,
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
            break_miles,
            total_outing_miles,
            post_work_miles,
            miles_per_trip,
            earnings_per_work_mile,
            earnings_per_total_mile,

            work_start_time,
            uber_stop_time,
            home_end_time,
            breaks_json,
            additional_sessions_json,

            real_work_hours,
            break_hours,
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
            notes,

            day_tags
        FROM daily_logs
        ORDER BY date DESC
        """
    )

    rows = cursor.fetchall()
    conn.close()

    daily_rows = [dict(row) for row in rows]

    for row in daily_rows:
        row["day_tags"] = _day_tags_from_storage(row.get("day_tags"))
        row["breaks"] = _breaks_from_storage(row.pop("breaks_json", None))
        sessions = []
        if (
            row.get("work_start_time") is not None
            and row.get("uber_stop_time") is not None
        ):
            sessions.append({
                "start_time": row.get("work_start_time"),
                "stop_time": row.get("uber_stop_time"),
                "start_odometer": row.get("start_odometer"),
                "stop_odometer": row.get("end_work_odometer"),
            })
        sessions.extend(
            _work_sessions_from_storage(
                row.pop("additional_sessions_json", None)
            ) or []
        )
        row["work_sessions"] = _enrich_work_sessions(sessions)

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


def get_wallet_floor():
    """
    Manually-set, purely local reference value — NOT synced from anywhere.
    Lets the Wallet balance card show how much of the current balance sits
    above the floor you deliberately keep resting there (e.g. because
    Finance sweeps everything above it elsewhere). None until you set it.
    """
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT uber_wallet_floor FROM app_settings WHERE id = 1")
    row = cursor.fetchone()
    conn.close()
    return row["uber_wallet_floor"] if row else None


def set_wallet_floor(value):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        "UPDATE app_settings SET uber_wallet_floor = ? WHERE id = 1",
        (value,),
    )
    conn.commit()
    conn.close()
    return value


# ============================================================
# Quests (v3.7) — progress is always derived from daily logs
# ============================================================

def _validate_quest(quest):
    from datetime import date

    try:
        start_date = date.fromisoformat(quest.start_date)
        end_date = date.fromisoformat(quest.end_date)
    except (TypeError, ValueError):
        raise ValueError("Quest dates must use YYYY-MM-DD.")

    if end_date < start_date:
        raise ValueError("Quest end date cannot be earlier than its start date.")
    if quest.first_tier_trips <= 0:
        raise ValueError("First-tier trip requirement must be greater than 0.")
    if quest.final_tier_trips <= quest.first_tier_trips:
        raise ValueError("Final-tier trips must be greater than first-tier trips.")
    if quest.first_tier_bonus < 0 or quest.final_additional_bonus < 0:
        raise ValueError("Quest bonuses cannot be negative.")


def _quest_title(start_date, end_date):
    if (
        start_date.weekday() == 4
        and end_date.weekday() == 6
        and (end_date - start_date).days == 2
    ):
        return "Weekend Quest"
    if (
        start_date.weekday() == 0
        and end_date.weekday() == 3
        and (end_date - start_date).days == 3
    ):
        return "Weekday Quest"
    return "Quest"


def _quest_response(row):
    from datetime import date

    start_date = date.fromisoformat(row["start_date"])
    end_date = date.fromisoformat(row["end_date"])
    progress = int(row["progress_trips"] or 0)
    first_earned = progress >= row["first_tier_trips"]
    final_earned = progress >= row["final_tier_trips"]

    if final_earned:
        status = "Completed"
    elif date.today() < start_date:
        status = "Scheduled"
    elif date.today() <= end_date:
        status = "Active"
    else:
        status = "Failed"

    earned_bonus = 0
    if first_earned:
        earned_bonus += row["first_tier_bonus"]
    if final_earned:
        earned_bonus += row["final_additional_bonus"]

    return {
        "id": row["id"],
        "title": _quest_title(start_date, end_date),
        "start_date": row["start_date"],
        "end_date": row["end_date"],
        "first_tier_trips": row["first_tier_trips"],
        "first_tier_bonus": round(row["first_tier_bonus"], 2),
        "final_tier_trips": row["final_tier_trips"],
        "final_additional_bonus": round(row["final_additional_bonus"], 2),
        "total_possible_bonus": round(
            row["first_tier_bonus"] + row["final_additional_bonus"], 2
        ),
        "progress_trips": progress,
        "first_tier_remaining": max(row["first_tier_trips"] - progress, 0),
        "final_tier_remaining": max(row["final_tier_trips"] - progress, 0),
        "first_tier_earned": first_earned,
        "final_tier_earned": final_earned,
        "earned_bonus": round(earned_bonus, 2),
        "status": status,
    }


def _quest_rows(where_clause="", params=()):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        f"""
        SELECT
            q.*,
            COALESCE(SUM(d.trips), 0) AS progress_trips
        FROM quests q
        LEFT JOIN daily_logs d
          ON d.date BETWEEN q.start_date AND q.end_date
        {where_clause}
        GROUP BY q.id
        ORDER BY q.start_date DESC, q.id DESC
        """,
        params,
    )
    rows = cursor.fetchall()
    conn.close()
    return rows


def get_quests():
    return [_quest_response(row) for row in _quest_rows()]


def create_quest(quest):
    _validate_quest(quest)
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        """
        INSERT INTO quests (
            start_date, end_date,
            first_tier_trips, first_tier_bonus,
            final_tier_trips, final_additional_bonus
        )
        VALUES (?, ?, ?, ?, ?, ?)
        """,
        (
            quest.start_date,
            quest.end_date,
            quest.first_tier_trips,
            quest.first_tier_bonus,
            quest.final_tier_trips,
            quest.final_additional_bonus,
        ),
    )
    quest_id = cursor.lastrowid
    conn.commit()
    conn.close()
    return _quest_response(_quest_rows("WHERE q.id = ?", (quest_id,))[0])


def _draft_value(item, key, default=None):
    if isinstance(item, dict):
        return item.get(key, default)
    return getattr(item, key, default)


def _draft_sessions_to_dicts(sessions):
    return [
        {
            "start_time": _draft_value(session, "start_time"),
            "stop_time": _draft_value(session, "stop_time"),
            "start_odometer": _draft_value(session, "start_odometer"),
            "stop_odometer": _draft_value(session, "stop_odometer"),
            "breaks": [
                {
                    "start_time": _draft_value(item, "start_time"),
                    "end_time": _draft_value(item, "end_time"),
                    "start_odometer": _draft_value(item, "start_odometer"),
                    "end_odometer": _draft_value(item, "end_odometer"),
                }
                for item in (_draft_value(session, "breaks", []) or [])
            ],
        }
        for session in (sessions or [])
    ]


def _draft_status(sessions):
    if not sessions:
        return "not_started"
    final_session = sessions[-1]
    if final_session.get("stop_time"):
        return "between_sessions"
    final_breaks = final_session.get("breaks") or []
    if final_breaks and not final_breaks[-1].get("end_time"):
        return "on_break"
    return "working"


def validate_daily_draft(draft):
    try:
        date_cls.fromisoformat(draft.date)
    except (TypeError, ValueError):
        raise ValueError("Draft date must use YYYY-MM-DD format.")

    sessions = _draft_sessions_to_dicts(draft.sessions)
    previous_stop = None
    previous_stop_odometer = None
    for session_index, session in enumerate(sessions):
        start = parse_12_hour_time_to_minutes(session["start_time"])
        stop = parse_12_hour_time_to_minutes(session["stop_time"])
        is_last = session_index == len(sessions) - 1
        if start is None:
            raise ValueError(f"Session {session_index + 1} needs a valid start time.")
        if session["stop_time"] is not None and stop is None:
            raise ValueError(f"Session {session_index + 1} needs a valid stop time.")
        if stop is not None and stop <= start:
            raise ValueError(f"Session {session_index + 1} stop time must be later than its start.")
        if stop is None and not is_last:
            raise ValueError("Only the latest session may remain open.")
        if previous_stop is not None and start < previous_stop:
            raise ValueError("Draft sessions cannot overlap and must stay in time order.")

        start_odo = session["start_odometer"]
        stop_odo = session["stop_odometer"]
        if any(value is not None and value < 0 for value in (start_odo, stop_odo)):
            raise ValueError("Session odometers cannot be negative.")
        if start_odo is not None and stop_odo is not None and stop_odo < start_odo:
            raise ValueError("Session stop odometer cannot be lower than its start.")
        if start_odo is not None and previous_stop_odometer is not None and start_odo < previous_stop_odometer:
            raise ValueError("Session odometers must stay in trip order.")

        previous_break_end = None
        for break_index, break_item in enumerate(session["breaks"]):
            break_start = parse_12_hour_time_to_minutes(break_item["start_time"])
            break_end = parse_12_hour_time_to_minutes(break_item["end_time"])
            is_last_break = break_index == len(session["breaks"]) - 1
            if break_start is None or break_start < start:
                raise ValueError(f"Break {break_index + 1} needs a valid start inside its session.")
            if break_item["end_time"] is not None and break_end is None:
                raise ValueError(f"Break {break_index + 1} needs a valid end time.")
            if break_end is not None and break_end <= break_start:
                raise ValueError(f"Break {break_index + 1} end must be later than its start.")
            if break_end is None and (not is_last or not is_last_break or stop is not None):
                raise ValueError("Only the latest break in an open session may remain active.")
            if stop is not None and break_end is not None and break_end > stop:
                raise ValueError(f"Break {break_index + 1} must end inside its session.")
            if previous_break_end is not None and break_start < previous_break_end:
                raise ValueError("Draft breaks cannot overlap and must stay in time order.")
            break_start_odo = break_item["start_odometer"]
            break_end_odo = break_item["end_odometer"]
            if any(value is not None and value < 0 for value in (break_start_odo, break_end_odo)):
                raise ValueError("Break odometers cannot be negative.")
            if break_start_odo is not None and break_end_odo is not None and break_end_odo < break_start_odo:
                raise ValueError("Break end odometer cannot be lower than its start.")
            if break_end is not None:
                previous_break_end = break_end

        if stop is not None:
            previous_stop = stop
        if stop_odo is not None:
            previous_stop_odometer = stop_odo
    return sessions


def get_daily_drafts():
    conn = get_connection()
    rows = conn.execute(
        "SELECT date, sessions_json, updated_at FROM daily_drafts ORDER BY date DESC"
    ).fetchall()
    conn.close()
    drafts = []
    for row in rows:
        sessions = json.loads(row["sessions_json"] or "[]")
        drafts.append({
            "date": row["date"],
            "sessions": sessions,
            "status": _draft_status(sessions),
            "updated_at": row["updated_at"],
        })
    return drafts


def upsert_daily_draft(draft):
    sessions = validate_daily_draft(draft)
    conn = get_connection()
    conn.execute(
        """
        INSERT INTO daily_drafts (date, sessions_json, updated_at)
        VALUES (?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(date) DO UPDATE SET
            sessions_json = excluded.sessions_json,
            updated_at = CURRENT_TIMESTAMP
        """,
        (draft.date, json.dumps(sessions, separators=(",", ":"))),
    )
    conn.commit()
    row = conn.execute(
        "SELECT date, sessions_json, updated_at FROM daily_drafts WHERE date = ?",
        (draft.date,),
    ).fetchone()
    conn.close()
    stored_sessions = json.loads(row["sessions_json"] or "[]")
    return {
        "date": row["date"],
        "sessions": stored_sessions,
        "status": _draft_status(stored_sessions),
        "updated_at": row["updated_at"],
    }


def delete_daily_draft(date):
    conn = get_connection()
    cursor = conn.execute("DELETE FROM daily_drafts WHERE date = ?", (date,))
    conn.commit()
    deleted = cursor.rowcount
    conn.close()
    return deleted


def update_quest(quest_id, quest):
    _validate_quest(quest)
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        """
        UPDATE quests
        SET
            start_date = ?,
            end_date = ?,
            first_tier_trips = ?,
            first_tier_bonus = ?,
            final_tier_trips = ?,
            final_additional_bonus = ?
        WHERE id = ?
        """,
        (
            quest.start_date,
            quest.end_date,
            quest.first_tier_trips,
            quest.first_tier_bonus,
            quest.final_tier_trips,
            quest.final_additional_bonus,
            quest_id,
        ),
    )
    updated_count = cursor.rowcount
    conn.commit()
    conn.close()
    if updated_count == 0:
        return None
    return _quest_response(_quest_rows("WHERE q.id = ?", (quest_id,))[0])


def delete_quest(quest_id):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM quests WHERE id = ?", (quest_id,))
    deleted_count = cursor.rowcount
    conn.commit()
    conn.close()
    return deleted_count


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
            cash_tips,
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
            break_miles,
            total_outing_miles,
            post_work_miles,
            miles_per_trip,
            earnings_per_work_mile,
            earnings_per_total_mile,

            work_start_time,
            uber_stop_time,
            home_end_time,
            breaks_json,
            additional_sessions_json,

            real_work_hours,
            break_hours,
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
            notes,

            day_tags
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            record.date,
            record.online_hours,
            record.trips,
            record.net_fare,
            record.tips,
            record.cash_tips,
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
            metrics["break_miles"],
            metrics["total_outing_miles"],
            metrics["post_work_miles"],
            metrics["miles_per_trip"],
            metrics["earnings_per_work_mile"],
            metrics["earnings_per_total_mile"],

            record.work_start_time,
            record.uber_stop_time,
            record.home_end_time,
            _breaks_to_storage(record.breaks),
            _work_sessions_to_storage(record.additional_sessions),

            metrics["real_work_hours"],
            metrics["break_hours"],
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

            _day_tags_to_storage(record.day_tags),
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
        "cash_tips": record.cash_tips,
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
        "break_miles": metrics["break_miles"],
        "total_outing_miles": metrics["total_outing_miles"],
        "post_work_miles": metrics["post_work_miles"],
        "miles_per_trip": metrics["miles_per_trip"],
        "earnings_per_work_mile": metrics["earnings_per_work_mile"],
        "earnings_per_total_mile": metrics["earnings_per_total_mile"],

        "work_start_time": record.work_start_time,
        "uber_stop_time": record.uber_stop_time,
        "home_end_time": record.home_end_time,
        "work_sessions": _enrich_work_sessions(_all_work_sessions(record)),
        "breaks": _breaks_from_storage(_breaks_to_storage(record.breaks)),

        "real_work_hours": metrics["real_work_hours"],
        "break_hours": metrics["break_hours"],
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

        "day_tags": record.day_tags,
    }


def update_daily_record(date: str, record):
    validate_daily_record(record)
    metrics = calculate_daily_metrics(record)
    target_date = record.date

    conn = get_connection()
    cursor = conn.cursor()

    # Resolve the source row first and update by its stable primary key. This
    # lets the unique date change in place without deleting/recreating the
    # record, so its ID remains unchanged.
    cursor.execute("SELECT id FROM daily_logs WHERE date = ?", (date,))
    source_row = cursor.fetchone()
    if source_row is None:
        conn.close()
        return None

    if target_date != date:
        cursor.execute("SELECT 1 FROM daily_logs WHERE date = ?", (target_date,))
        if cursor.fetchone() is not None:
            conn.close()
            raise DailyDateConflictError(target_date)

    try:
        cursor.execute(
            """
        UPDATE daily_logs
        SET
            date = ?,
            online_hours = ?,
            trips = ?,
            net_fare = ?,
            tips = ?,
            cash_tips = ?,
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
            break_miles = ?,
            total_outing_miles = ?,
            post_work_miles = ?,
            miles_per_trip = ?,
            earnings_per_work_mile = ?,
            earnings_per_total_mile = ?,

            work_start_time = ?,
            uber_stop_time = ?,
            home_end_time = ?,
            breaks_json = ?,
            additional_sessions_json = ?,

            real_work_hours = ?,
            break_hours = ?,
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
            notes = ?,

            day_tags = ?
        WHERE id = ?
        """,
            (
            target_date,
            record.online_hours,
            record.trips,
            record.net_fare,
            record.tips,
            record.cash_tips,
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
            metrics["break_miles"],
            metrics["total_outing_miles"],
            metrics["post_work_miles"],
            metrics["miles_per_trip"],
            metrics["earnings_per_work_mile"],
            metrics["earnings_per_total_mile"],

            record.work_start_time,
            record.uber_stop_time,
            record.home_end_time,
            _breaks_to_storage(record.breaks),
            _work_sessions_to_storage(record.additional_sessions),

            metrics["real_work_hours"],
            metrics["break_hours"],
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

            _day_tags_to_storage(record.day_tags),

            source_row["id"],
            ),
        )
    except sqlite3.IntegrityError as error:
        conn.close()
        raise DailyDateConflictError(target_date) from error

    updated_count = cursor.rowcount

    conn.commit()
    conn.close()

    if updated_count == 0:
        return None

    return {
        "date": target_date,
        "online_hours": record.online_hours,
        "trips": record.trips,
        "net_fare": record.net_fare,
        "tips": record.tips,
        "cash_tips": record.cash_tips,
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
        "break_miles": metrics["break_miles"],
        "total_outing_miles": metrics["total_outing_miles"],
        "post_work_miles": metrics["post_work_miles"],
        "miles_per_trip": metrics["miles_per_trip"],
        "earnings_per_work_mile": metrics["earnings_per_work_mile"],
        "earnings_per_total_mile": metrics["earnings_per_total_mile"],

        "work_start_time": record.work_start_time,
        "uber_stop_time": record.uber_stop_time,
        "home_end_time": record.home_end_time,
        "work_sessions": _enrich_work_sessions(_all_work_sessions(record)),
        "breaks": _breaks_from_storage(_breaks_to_storage(record.breaks)),

        "real_work_hours": metrics["real_work_hours"],
        "break_hours": metrics["break_hours"],
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

        "day_tags": record.day_tags,
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


def delete_all_daily_records():
    """
    Deletes every daily log record. Irreversible -- the frontend gates this
    behind a stronger, type-to-confirm flow rather than a plain confirm
    dialog, given how destructive it is compared to a single-day delete.
    """
    conn = get_connection()
    cursor = conn.cursor()

    cursor.execute("DELETE FROM daily_logs")

    deleted_count = cursor.rowcount

    conn.commit()
    conn.close()

    return deleted_count


# ============================================================
# CSV export (v2.2)
# ============================================================

import csv
import io

# Canonical column order for the mixed CSV backup. Daily fields retain their
# familiar order; quest and weekly-note fields live at the end. record_type
# keeps every row type unambiguous while remaining spreadsheet-readable.
CSV_COLUMNS = [
    "record_type",
    "date", "online_hours", "trips", "net_fare", "tips", "cash_tips", "promotions",
    "total_earnings", "avg_hourly", "avg_per_trip",
    "miles_driven", "earnings_per_mile",
    "start_odometer", "end_work_odometer", "end_home_odometer",
    "work_miles", "break_miles", "total_outing_miles", "post_work_miles", "miles_per_trip",
    "earnings_per_work_mile", "earnings_per_total_mile",
    "work_start_time", "uber_stop_time", "home_end_time",
    "additional_sessions", "breaks",
    "real_work_hours", "break_hours", "full_outing_hours", "post_work_hours",
    "earnings_per_real_work_hour", "earnings_per_full_outing_hour",
    "fare_share", "tip_share", "promo_share",
    "hourly_label", "promo_label", "tip_label", "mileage_label",
    "wallet_balance", "notes",
    "day_tags",
    "quest_start_date", "quest_end_date",
    "quest_first_tier_trips", "quest_first_tier_bonus",
    "quest_final_tier_trips", "quest_final_additional_bonus",
    "weekly_note_week_end", "weekly_note_notes",
]


def get_daily_csv():
    """
    Returns daily logs, raw quest definitions, and weekly notes as one CSV
    backup. Daily rows are newest first, followed by quest and weekly-note
    rows. Derived quest progress, status, and earned bonus are intentionally
    omitted and recalculated on restore from matching daily trips.
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
        # day_tags comes back from get_daily_data() as a list (or None) for
        # API consumption; CSV needs it flattened back to a single
        # comma-joined string ("rain,bad_orders"), same format
        # ImportRecord expects to read back in.
        row_for_csv = dict(row)
        row_for_csv["record_type"] = "daily"
        row_for_csv["day_tags"] = _day_tags_to_storage(row.get("day_tags"))
        row_for_csv["breaks"] = _breaks_to_storage(row.get("breaks"))
        work_sessions = row.get("work_sessions") or []
        row_for_csv["additional_sessions"] = _work_sessions_to_storage(
            work_sessions[1:]
        )
        row_for_csv["work_sessions"] = _work_sessions_to_storage(work_sessions)

        writer.writerow({key: row_for_csv.get(key) for key in fieldnames})

    for quest in get_quests():
        quest_row = {
            "record_type": "quest",
            "quest_start_date": quest["start_date"],
            "quest_end_date": quest["end_date"],
            "quest_first_tier_trips": quest["first_tier_trips"],
            "quest_first_tier_bonus": quest["first_tier_bonus"],
            "quest_final_tier_trips": quest["final_tier_trips"],
            "quest_final_additional_bonus": quest["final_additional_bonus"],
        }
        writer.writerow({key: quest_row.get(key) for key in fieldnames})

    for week_end, notes in get_weekly_notes().items():
        weekly_note_row = {
            "record_type": "weekly_note",
            "weekly_note_week_end": week_end,
            "weekly_note_notes": notes,
        }
        writer.writerow({key: weekly_note_row.get(key) for key in fieldnames})

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
    notes_by_week_end = get_weekly_notes()
    if not daily_rows and not notes_by_week_end:
        return []

    earnings_by_date = {}
    for row in daily_rows:
        earnings_by_date[row["date"]] = row.get("total_earnings", 0) or 0

    # get_daily_data() returns newest-first; the wallet-delta helper wants
    # oldest-first, and reuses the already-attached per-day deltas' inputs
    # (just the date + wallet_balance) rather than recomputing anything.
    rows_asc = list(reversed(daily_rows))

    parsed_dates = [_date.fromisoformat(row["date"]) for row in daily_rows]
    parsed_dates.extend(
        _date.fromisoformat(week_end) for week_end in notes_by_week_end
    )
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
            "notes": notes_by_week_end.get(week_end.isoformat()),
        })

        current_monday += _timedelta(days=7)

    weeks.reverse()
    return weeks


def get_weekly_notes():
    conn = get_connection()
    rows = conn.execute(
        "SELECT week_end, notes FROM weekly_notes ORDER BY week_end DESC"
    ).fetchall()
    conn.close()
    return {row["week_end"]: row["notes"] for row in rows}


def set_weekly_note(week_end: str, notes: str | None):
    try:
        parsed_week_end = _date.fromisoformat(week_end)
    except (TypeError, ValueError) as error:
        raise ValueError("Week end must be a valid date.") from error

    if parsed_week_end.weekday() != 6:
        raise ValueError("Weekly notes must be tied to a Sunday week-ending date.")

    normalized_notes = notes.strip() if notes else ""
    conn = get_connection()
    cursor = conn.cursor()
    if normalized_notes:
        cursor.execute(
            """
            INSERT INTO weekly_notes (week_end, notes)
            VALUES (?, ?)
            ON CONFLICT(week_end) DO UPDATE SET notes = excluded.notes
            """,
            (week_end, normalized_notes),
        )
    else:
        cursor.execute("DELETE FROM weekly_notes WHERE week_end = ?", (week_end,))
    conn.commit()
    conn.close()
    return {"week_end": week_end, "notes": normalized_notes or None}


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
# Only raw daily inputs and quest definitions are read from the CSV. Any
# computed column present in a backup (total earnings, labels, wallet delta,
# quest progress/status, etc.) is deliberately ignored. Both row types are
# restored through their normal create/update paths so imported data cannot
# carry forward stale computed values.


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


def _import_day_tags(value):
    """Parses the day_tags CSV cell ("rain,bad_orders") into a list. Unknown
    tag values are left in the list here -- validate_daily_record() is what
    actually rejects them, same as every other field, so import errors are
    reported consistently (row + message) rather than silently dropped."""
    if value is None or str(value).strip() == "":
        return None

    tags = [tag.strip() for tag in str(value).split(",") if tag.strip()]
    return tags or None


def _import_breaks(value, row):
    if value is not None and str(value).strip() != "":
        parsed = json.loads(str(value))
        if not isinstance(parsed, list):
            raise ValueError("breaks must be a JSON list")
        return parsed or None

    # Compatibility with a CSV exported by the initial single-break draft.
    legacy_start_time = _import_optional_text(row.get("break_start_time"))
    legacy_end_time = _import_optional_text(row.get("break_end_time"))
    if legacy_start_time is None and legacy_end_time is None:
        return None

    return [{
        "start_time": legacy_start_time,
        "end_time": legacy_end_time,
        "start_odometer": _import_optional_float(row.get("break_start_odometer")),
        "end_odometer": _import_optional_float(row.get("break_end_odometer")),
    }]


def _import_work_sessions(value):
    if value is None or str(value).strip() == "":
        return None
    parsed = json.loads(str(value))
    if not isinstance(parsed, list):
        raise ValueError("additional_sessions must be a JSON list")
    return parsed or None


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
        self.cash_tips = _import_required_float(row.get("cash_tips"))
        self.promotions = _import_required_float(row.get("promotions"))

        self.miles_driven = _import_optional_float(row.get("miles_driven"))

        self.start_odometer = _import_optional_float(row.get("start_odometer"))
        self.end_work_odometer = _import_optional_float(row.get("end_work_odometer"))
        self.end_home_odometer = _import_optional_float(row.get("end_home_odometer"))

        self.work_start_time = _import_optional_text(row.get("work_start_time"))
        self.uber_stop_time = _import_optional_text(row.get("uber_stop_time"))
        self.home_end_time = _import_optional_text(row.get("home_end_time"))
        self.additional_sessions = _import_work_sessions(
            row.get("additional_sessions")
        )
        self.breaks = _import_breaks(row.get("breaks"), row)

        self.wallet_balance = _import_optional_float(row.get("wallet_balance"))
        self.notes = _import_optional_text(row.get("notes"))

        self.day_tags = _import_day_tags(row.get("day_tags"))


class ImportQuest:
    """Raw quest definition reconstructed from a mixed backup CSV row."""

    def __init__(self, row):
        self.start_date = (
            row.get("quest_start_date") or ""
        ).strip()
        self.end_date = (
            row.get("quest_end_date") or ""
        ).strip()
        self.first_tier_trips = _import_required_int(
            row.get("quest_first_tier_trips")
        )
        self.first_tier_bonus = _import_required_float(
            row.get("quest_first_tier_bonus")
        )
        self.final_tier_trips = _import_required_int(
            row.get("quest_final_tier_trips")
        )
        self.final_additional_bonus = _import_required_float(
            row.get("quest_final_additional_bonus")
        )


class ImportWeeklyNote:
    def __init__(self, row):
        self.week_end = (row.get("weekly_note_week_end") or "").strip()
        self.notes = _import_optional_text(row.get("weekly_note_notes"))

        if not self.week_end:
            raise ValueError("Missing weekly note week-ending date")
        if not self.notes:
            raise ValueError("Weekly note text is empty")


def _parse_import_csv(csv_text):
    """
    Parses daily, quest, and weekly-note rows from a mixed backup. CSVs created
    before record_type existed remain compatible and are treated as all-daily.
    Each tuple is (row_number, record_type, display_id, record, error).
    """
    reader = csv.DictReader(io.StringIO(csv_text))
    results = []

    for i, row in enumerate(reader, start=2):
        record_type = (row.get("record_type") or "daily").strip().lower()
        if record_type not in {"daily", "quest", "weekly_note"}:
            results.append(
                (i, record_type, None, None, f"Unknown record_type: {record_type}")
            )
            continue

        display_id = None
        try:
            if record_type == "quest":
                record = ImportQuest(row)
                display_id = (
                    f"{record.start_date} to {record.end_date}"
                    if record.start_date or record.end_date
                    else None
                )
            elif record_type == "weekly_note":
                record = ImportWeeklyNote(row)
                display_id = record.week_end
            else:
                display_id = (row.get("date") or "").strip() or None
                if display_id is None:
                    results.append((i, record_type, None, None, "Missing date"))
                    continue
                record = ImportRecord(row)
        except (ValueError, TypeError) as error:
            results.append(
                (
                    i,
                    record_type,
                    display_id,
                    None,
                    f"Invalid number in row: {error}",
                )
            )
            continue

        results.append((i, record_type, display_id, record, None))

    return results


def preview_csv_import(csv_text):
    """
    Dry run: parses and validates every row but writes nothing. Returns
    counts of new/updated daily logs, quests, and weekly notes, plus invalid rows (with
    reasons for up to the first 20, to keep the response small).
    """
    parsed_rows = _parse_import_csv(csv_text)
    existing_dates = {row["date"] for row in get_daily_data()}
    existing_quest_ranges = {
        (quest["start_date"], quest["end_date"])
        for quest in get_quests()
    }
    existing_weekly_note_dates = set(get_weekly_notes())
    seen_dates_in_file = set()
    seen_quest_ranges_in_file = set()
    seen_weekly_note_dates_in_file = set()

    new_count = 0
    update_count = 0
    quest_new_count = 0
    quest_update_count = 0
    weekly_note_new_count = 0
    weekly_note_update_count = 0
    errors = []

    for row_number, record_type, display_id, record, parse_error in parsed_rows:
        if parse_error:
            errors.append(
                {"row": row_number, "date": display_id, "message": parse_error}
            )
            continue

        try:
            if record_type == "quest":
                _validate_quest(record)
            elif record_type == "weekly_note":
                parsed_week_end = _date.fromisoformat(record.week_end)
                if parsed_week_end.weekday() != 6:
                    raise ValueError("Weekly note date must be a Sunday.")
            else:
                validate_daily_record(record)
        except ValueError as error:
            errors.append(
                {"row": row_number, "date": display_id, "message": str(error)}
            )
            continue

        if record_type == "quest":
            quest_range = (record.start_date, record.end_date)
            if (
                quest_range in existing_quest_ranges
                or quest_range in seen_quest_ranges_in_file
            ):
                quest_update_count += 1
            else:
                quest_new_count += 1
            seen_quest_ranges_in_file.add(quest_range)
        elif record_type == "weekly_note":
            if (
                record.week_end in existing_weekly_note_dates
                or record.week_end in seen_weekly_note_dates_in_file
            ):
                weekly_note_update_count += 1
            else:
                weekly_note_new_count += 1
            seen_weekly_note_dates_in_file.add(record.week_end)
        else:
            if display_id in existing_dates or display_id in seen_dates_in_file:
                update_count += 1
            else:
                new_count += 1

            seen_dates_in_file.add(display_id)

    return {
        "total_rows": len(parsed_rows),
        "new_count": new_count,
        "update_count": update_count,
        "quest_new_count": quest_new_count,
        "quest_update_count": quest_update_count,
        "weekly_note_new_count": weekly_note_new_count,
        "weekly_note_update_count": weekly_note_update_count,
        "error_count": len(errors),
        "errors": errors[:20],
    }


def commit_csv_import(csv_text):
    """
    Actually performs the mixed import. Daily rows upsert by date, quest
    definitions by date range, and weekly notes by Sunday week-ending date.
    Computed quest progress/status is derived from restored daily trip totals.
    """
    parsed_rows = _parse_import_csv(csv_text)
    existing_dates = {row["date"] for row in get_daily_data()}
    existing_quest_ids = {
        (quest["start_date"], quest["end_date"]): quest["id"]
        for quest in get_quests()
    }
    existing_weekly_note_dates = set(get_weekly_notes())

    inserted = 0
    updated = 0
    quests_inserted = 0
    quests_updated = 0
    weekly_notes_inserted = 0
    weekly_notes_updated = 0
    errors = []

    for row_number, record_type, display_id, record, parse_error in parsed_rows:
        if parse_error:
            errors.append(
                {"row": row_number, "date": display_id, "message": parse_error}
            )
            continue

        try:
            if record_type == "quest":
                _validate_quest(record)
            elif record_type == "weekly_note":
                parsed_week_end = _date.fromisoformat(record.week_end)
                if parsed_week_end.weekday() != 6:
                    raise ValueError("Weekly note date must be a Sunday.")
            else:
                validate_daily_record(record)
        except ValueError as error:
            errors.append(
                {"row": row_number, "date": display_id, "message": str(error)}
            )
            continue

        try:
            if record_type == "quest":
                quest_range = (record.start_date, record.end_date)
                existing_quest_id = existing_quest_ids.get(quest_range)
                if existing_quest_id is not None:
                    update_quest(existing_quest_id, record)
                    quests_updated += 1
                else:
                    created_quest = create_quest(record)
                    existing_quest_ids[quest_range] = created_quest["id"]
                    quests_inserted += 1
            elif record_type == "weekly_note":
                existed = record.week_end in existing_weekly_note_dates
                set_weekly_note(record.week_end, record.notes)
                if existed:
                    weekly_notes_updated += 1
                else:
                    weekly_notes_inserted += 1
                    existing_weekly_note_dates.add(record.week_end)
            else:
                if display_id in existing_dates:
                    update_daily_record(display_id, record)
                    updated += 1
                else:
                    create_daily_record(record)
                    inserted += 1
                    existing_dates.add(display_id)
        except Exception as error:  # noqa: BLE001 - surface any write failure per-row
            errors.append(
                {"row": row_number, "date": display_id, "message": str(error)}
            )

    return {
        "inserted": inserted,
        "updated": updated,
        "quests_inserted": quests_inserted,
        "quests_updated": quests_updated,
        "weekly_notes_inserted": weekly_notes_inserted,
        "weekly_notes_updated": weekly_notes_updated,
        "error_count": len(errors),
        "errors": errors[:20],
    }
