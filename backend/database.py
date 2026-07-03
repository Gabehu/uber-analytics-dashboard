daily_data = [
    {
        "date": "2025-07-23",
        "earnings": 169.71,
        "online_hours": 8.17,
        "trips": 19,
        "avg_hourly": 20.77
    },
    {
        "date": "2025-07-24",
        "earnings": 179.55,
        "online_hours": 8.82,
        "trips": 22,
        "avg_hourly": 20.36
    },
    {
        "date": "2025-07-27",
        "earnings": 124.55,
        "online_hours": 4.75,
        "trips": 14,
        "avg_hourly": 26.22
    }
]


def get_daily_data():
    return daily_data


def get_summary_data():
    total_earnings = sum(day["earnings"] for day in daily_data)
    total_trips = sum(day["trips"] for day in daily_data)
    total_hours = sum(day["online_hours"] for day in daily_data)

    avg_hourly = total_earnings / total_hours if total_hours > 0 else 0
    avg_per_trip = total_earnings / total_trips if total_trips > 0 else 0

    return {
        "total_earnings": round(total_earnings, 2),
        "total_trips": total_trips,
        "online_hours": round(total_hours, 2),
        "avg_hourly": round(avg_hourly, 2),
        "avg_per_trip": round(avg_per_trip, 2)
    }