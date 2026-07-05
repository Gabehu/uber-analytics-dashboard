from pydantic import BaseModel


class Summary(BaseModel):
    total_earnings: float
    total_trips: int
    online_hours: float
    avg_hourly: float
    avg_per_trip: float


class DailyRecordCreate(BaseModel):
    date: str
    online_hours: float
    trips: int
    net_fare: float
    tips: float
    promotions: float
    miles_driven: float | None = None
    wallet_balance: float | None = None
    notes: str | None = None


class DailyRecord(BaseModel):
    date: str
    online_hours: float
    trips: int
    net_fare: float
    tips: float
    promotions: float
    total_earnings: float
    avg_hourly: float
    avg_per_trip: float
    miles_driven: float | None = None
    earnings_per_mile: float | None = None
    wallet_balance: float | None = None
    notes: str | None = None