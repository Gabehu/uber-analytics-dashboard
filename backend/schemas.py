from pydantic import BaseModel


class Summary(BaseModel):
    total_earnings: float
    total_trips: int
    online_hours: float
    avg_hourly: float
    avg_per_trip: float


class DailyRecordCreate(BaseModel):
    date: str
    earnings: float
    online_hours: float
    trips: int


class DailyRecord(BaseModel):
    date: str
    earnings: float
    online_hours: float
    trips: int
    avg_hourly: float