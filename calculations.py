"""
Small helper functions for calculating Uber earnings metrics.

These functions return None when a metric cannot be calculated safely,
such as dividing by zero hours or zero trips.
"""

def online_decimal_hours(hours, minutes):
    return hours + (minutes / 60)


def total_earnings(net_fare, promotions, tips):
    return net_fare + promotions + tips


def hourly_rate(total, online_hours_decimal):
    if online_hours_decimal <= 0:
        return None
    return total / online_hours_decimal


def average_per_trip(total, trips):
    if trips <= 0:
        return None
    return total / trips


def percentage(part, total):
    if total <= 0:
        return None
    return part / total