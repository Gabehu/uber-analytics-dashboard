from pydantic import BaseModel


class Summary(BaseModel):
    total_earnings: float
    total_trips: int
    online_hours: float
    avg_hourly: float
    avg_per_trip: float
    current_wallet_balance: float | None = None
    current_wallet_as_of: str | None = None


class WeekDay(BaseModel):
    date: str
    earnings: float
    has_record: bool


class WeekSummary(BaseModel):
    week_start: str
    week_end: str
    total_earnings: float
    daily: list[WeekDay]
    wallet_delta: float | None = None
    wallet_delta_start_date: str | None = None
    wallet_delta_end_date: str | None = None


class ImportRequest(BaseModel):
    csv_text: str


class ImportError(BaseModel):
    row: int
    date: str | None = None
    message: str


class ImportPreviewResult(BaseModel):
    total_rows: int
    new_count: int
    update_count: int
    error_count: int
    errors: list[ImportError]


class ImportCommitResult(BaseModel):
    inserted: int
    updated: int
    error_count: int
    errors: list[ImportError]


class DeleteAllRequest(BaseModel):
    confirmation: str


class DeleteAllResult(BaseModel):
    message: str
    deleted_count: int


class DailyRecordCreate(BaseModel):
    date: str
    online_hours: float
    trips: int
    net_fare: float
    tips: float
    promotions: float

    miles_driven: float | None = None

    start_odometer: float | None = None
    end_work_odometer: float | None = None
    end_home_odometer: float | None = None

    work_start_time: str | None = None
    uber_stop_time: str | None = None
    home_end_time: str | None = None

    wallet_balance: float | None = None
    notes: str | None = None

    # v3.2 — Day Effects: optional tags describing conditions that affected
    # the shift (weather, traffic, order quality, operational issues). A
    # fixed vocabulary enforced by ALLOWED_DAY_TAGS in database.py, not
    # freeform text, so it stays filterable rather than turning into a
    # second notes field.
    day_tags: list[str] | None = None


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

    start_odometer: float | None = None
    end_work_odometer: float | None = None
    end_home_odometer: float | None = None

    work_miles: float | None = None
    total_outing_miles: float | None = None
    post_work_miles: float | None = None
    miles_per_trip: float | None = None
    earnings_per_work_mile: float | None = None
    earnings_per_total_mile: float | None = None

    work_start_time: str | None = None
    uber_stop_time: str | None = None
    home_end_time: str | None = None

    real_work_hours: float | None = None
    full_outing_hours: float | None = None
    post_work_hours: float | None = None
    earnings_per_real_work_hour: float | None = None
    earnings_per_full_outing_hour: float | None = None

    fare_share: float
    tip_share: float
    promo_share: float

    hourly_label: str
    promo_label: str
    tip_label: str
    mileage_label: str

    wallet_balance: float | None = None
    wallet_delta: float | None = None
    wallet_delta_days_ago: int | None = None
    notes: str | None = None

    day_tags: list[str] | None = None