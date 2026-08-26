"""
seed_mock.py — Insert realistic multi-week mock data for testing.

This is a DEVELOPMENT / TESTING helper. It is not part of the app and should
not be run against a database holding real earnings you care about.

What it does:
  - Inserts several weeks of daily logs (with a deliberate empty "gap" week)
    so the weekly chart, week-jump date picker, and recent-weeks dropdown all
    have enough data to exercise fully.
  - Some rows include odometer + time fields (to populate work-miles, $/work
    mile, real-hours, real $/hr) and some deliberately omit them (to show the
    "Mileage not logged" / "—" fallbacks). This mirrors real usage where you
    won't always log the advanced fields.

How to run (from the backend folder, with the venv active):
    python seed_mock.py

By default it refuses to run if the database already contains records, so it
won't clobber real data. Pass --force to insert anyway (existing dates are
skipped, not overwritten).

    python seed_mock.py --force

To start completely fresh instead, delete uber_dashboard.db and run the app
once (its own sample_data seeds a minimal set), or run this script.
"""

import sys

from database import (
    initialize_database,
    get_daily_data,
    create_daily_record,
)


class MockRecord:
    """
    A lightweight stand-in for the Pydantic DailyRecordCreate model, exposing
    the same attributes create_daily_record() reads. Any field not provided
    defaults to None so partially-logged days work naturally.
    """

    def __init__(self, data):
        self.date = data["date"]
        self.online_hours = data["online_hours"]
        self.trips = data["trips"]
        self.net_fare = data["net_fare"]
        self.tips = data["tips"]
        self.cash_tips = data.get("cash_tips", 0)
        self.promotions = data.get("promotions", 0)

        self.miles_driven = data.get("miles_driven")

        self.start_odometer = data.get("start_odometer")
        self.end_work_odometer = data.get("end_work_odometer")
        self.end_home_odometer = data.get("end_home_odometer")

        self.work_start_time = data.get("work_start_time")
        self.uber_stop_time = data.get("uber_stop_time")
        self.home_end_time = data.get("home_end_time")

        self.wallet_balance = data.get("wallet_balance")
        self.notes = data.get("notes")


# ----------------------------------------------------------------------------
# Mock dataset
#
# Layout (Monday-Sunday weeks):
#   Week of May 25 - May 31 : a couple of light days, no advanced fields
#   Week of Jun 01 - Jun 07 : GAP — intentionally empty to test empty weeks
#   Week of Jun 08 - Jun 14 : mixed; some rows have odometer + time
#   Week of Jun 15 - Jun 21 : a fuller week, full advanced fields
#   Week of Jun 22 - Jun 28 : strong week, full advanced fields
#   Week of Jun 29 - Jul 05 : partial week, mixed logging
# ----------------------------------------------------------------------------
MOCK_DATA = [
    # --- Week of May 25 (light, basic fields only) ---
    {
        "date": "2026-05-26", "online_hours": 2.5, "trips": 5,
        "net_fare": 32.10, "tips": 18.40, "promotions": 0,
        "notes": "Short evening shift.",
    },
    {
        "date": "2026-05-28", "online_hours": 3.1, "trips": 7,
        "net_fare": 41.00, "tips": 22.75, "promotions": 5,
        "notes": "Slow Thursday.",
    },

    # --- Week of Jun 01 : intentionally left empty (gap week) ---

    # --- Week of Jun 08 (mixed logging) ---
    {
        "date": "2026-06-10", "online_hours": 4.0, "trips": 9,
        "net_fare": 55.20, "tips": 38.10, "promotions": 10,
        "start_odometer": 40120.0, "end_work_odometer": 40168.0,
        "work_start_time": "4:00 PM", "uber_stop_time": "8:00 PM",
        "wallet_balance": 1180.00, "notes": "Mileage + time logged.",
    },
    {
        "date": "2026-06-12", "online_hours": 5.2, "trips": 13,
        "net_fare": 72.40, "tips": 55.90, "promotions": 20,
        "notes": "Busy Friday, forgot to log odometer.",
    },
    {
        "date": "2026-06-13", "online_hours": 6.0, "trips": 15,
        "net_fare": 88.10, "tips": 61.20, "promotions": 24,
        "start_odometer": 40210.0, "end_work_odometer": 40270.0,
        "end_home_odometer": 40288.0,
        "work_start_time": "2:00 PM", "uber_stop_time": "8:00 PM",
        "home_end_time": "8:35 PM",
        "wallet_balance": 1320.00, "notes": "Full advanced logging.",
    },

    # --- Week of Jun 15 (fuller week, full advanced fields) ---
    {
        "date": "2026-06-15", "online_hours": 4.5, "trips": 11,
        "net_fare": 60.00, "tips": 44.30, "promotions": 12,
        "start_odometer": 40300.0, "end_work_odometer": 40352.0,
        "end_home_odometer": 40370.0,
        "work_start_time": "3:30 PM", "uber_stop_time": "8:00 PM",
        "home_end_time": "8:25 PM",
        "wallet_balance": 1400.00, "notes": "Solid Monday.",
    },
    {
        "date": "2026-06-17", "online_hours": 5.5, "trips": 14,
        "net_fare": 79.20, "tips": 58.60, "promotions": 18,
        "start_odometer": 40400.0, "end_work_odometer": 40465.0,
        "end_home_odometer": 40480.0,
        "work_start_time": "1:00 PM", "uber_stop_time": "6:30 PM",
        "home_end_time": "6:55 PM",
        "wallet_balance": 1510.00, "notes": "Strong midweek.",
    },
    {
        "date": "2026-06-19", "online_hours": 3.0, "trips": 6,
        "net_fare": 38.40, "tips": 19.10, "promotions": 0,
        "start_odometer": 40520.0, "end_work_odometer": 40590.0,
        "work_start_time": "5:00 PM", "uber_stop_time": "8:00 PM",
        "wallet_balance": 1545.00, "notes": "High miles, weak return.",
    },
    {
        "date": "2026-06-20", "online_hours": 6.5, "trips": 17,
        "net_fare": 96.30, "tips": 72.40, "promotions": 30,
        "start_odometer": 40600.0, "end_work_odometer": 40668.0,
        "end_home_odometer": 40690.0,
        "work_start_time": "12:00 PM", "uber_stop_time": "6:30 PM",
        "home_end_time": "7:05 PM",
        "wallet_balance": 1690.00, "notes": "Best day of the week.",
    },

    # --- Week of Jun 22 (strong week, full advanced fields) ---
    {
        "date": "2026-06-22", "online_hours": 4.32, "trips": 10,
        "net_fare": 55.13, "tips": 47.32, "promotions": 0,
        "start_odometer": 40800.0, "end_work_odometer": 40848.0,
        "end_home_odometer": 40865.0,
        "work_start_time": "4:00 PM", "uber_stop_time": "8:20 PM",
        "home_end_time": "8:45 PM",
        "wallet_balance": 1740.00, "notes": "Organic, no promos.",
    },
    {
        "date": "2026-06-24", "online_hours": 4.45, "trips": 11,
        "net_fare": 65.43, "tips": 43.10, "promotions": 26,
        "start_odometer": 40900.0, "end_work_odometer": 40952.0,
        "end_home_odometer": 40970.0,
        "work_start_time": "3:00 PM", "uber_stop_time": "7:30 PM",
        "home_end_time": "7:55 PM",
        "wallet_balance": 1830.00, "notes": "Promo helped.",
    },
    {
        "date": "2026-06-26", "online_hours": 5.8, "trips": 15,
        "net_fare": 84.20, "tips": 66.80, "promotions": 22,
        "start_odometer": 41010.0, "end_work_odometer": 41078.0,
        "end_home_odometer": 41096.0,
        "work_start_time": "1:30 PM", "uber_stop_time": "7:20 PM",
        "home_end_time": "7:50 PM",
        "wallet_balance": 1960.00, "notes": "Great Friday.",
    },
    {
        "date": "2026-06-27", "online_hours": 6.2, "trips": 16,
        "net_fare": 90.50, "tips": 70.30, "promotions": 28,
        "start_odometer": 41120.0, "end_work_odometer": 41190.0,
        "end_home_odometer": 41210.0,
        "work_start_time": "12:30 PM", "uber_stop_time": "6:45 PM",
        "home_end_time": "7:15 PM",
        "wallet_balance": 2100.00, "notes": "Weekend surge.",
    },

    # --- Week of Jun 29 (partial week, mixed logging) ---
    {
        "date": "2026-06-30", "online_hours": 3.5, "trips": 8,
        "net_fare": 44.60, "tips": 31.20, "promotions": 8,
        "notes": "Quick Tuesday, basic log only.",
    },
    {
        "date": "2026-07-03", "online_hours": 5.0, "trips": 13,
        "net_fare": 70.00, "tips": 52.00, "promotions": 15,
        "start_odometer": 41400.0, "end_work_odometer": 41460.0,
        "end_home_odometer": 41478.0,
        "work_start_time": "2:00 PM", "uber_stop_time": "7:00 PM",
        "home_end_time": "7:25 PM",
        "wallet_balance": 2240.00, "notes": "Good start to the weekend.",
    },
]


def main():
    force = "--force" in sys.argv

    initialize_database()

    existing = get_daily_data()

    # initialize_database() plants a handful of its own sample rows on a fresh
    # DB, so "any records at all" is the wrong bar for the safety guard —
    # it would always trip on a brand-new database. Instead, only refuse when
    # there's clearly accumulated data beyond that starter set, which signals
    # a database someone actually cares about.
    STARTER_SEED_THRESHOLD = 8

    if len(existing) > STARTER_SEED_THRESHOLD and not force:
        print(
            f"Database already has {len(existing)} record(s).\n"
            "Refusing to seed mock data over what looks like real data.\n"
            "Re-run with --force to insert anyway (existing dates are skipped),\n"
            "or delete uber_dashboard.db to start fresh."
        )
        return

    inserted = 0
    skipped = 0
    existing_dates = {row["date"] for row in existing}

    for entry in MOCK_DATA:
        if entry["date"] in existing_dates:
            skipped += 1
            continue
        try:
            create_daily_record(MockRecord(entry))
            inserted += 1
        except Exception as error:  # noqa: BLE001 - surface any bad mock row
            print(f"  ! Skipped {entry['date']}: {error}")
            skipped += 1

    print(f"Done. Inserted {inserted} mock record(s), skipped {skipped}.")


if __name__ == "__main__":
    main()
