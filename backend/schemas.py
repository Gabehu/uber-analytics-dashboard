from pydantic import BaseModel, Field


class Summary(BaseModel):
    total_earnings: float
    total_trips: int
    online_hours: float
    avg_hourly: float
    avg_per_trip: float
    current_wallet_balance: float | None = None
    current_wallet_as_of: str | None = None
    current_wallet_source: str | None = None
    current_wallet_updated_at: str | None = None
    latest_finance_adjustment: dict | None = None
    finance_sync: dict | None = None


class WalletFloor(BaseModel):
    uber_wallet_floor: float | None = None


class WalletFloorUpdate(BaseModel):
    uber_wallet_floor: float


class WalletAdjustmentCreate(BaseModel):
    amount: float = Field(gt=0)
    direction: str
    source_date: str
    source_updated_at: str


class WalletAdjustmentResult(BaseModel):
    source_id: str
    amount: float
    direction: str
    balance_before: float
    balance_after: float
    current_balance: float
    state_updated_at: str
    applied: bool


class QuestCreate(BaseModel):
    start_date: str
    end_date: str
    first_tier_trips: int
    first_tier_bonus: float
    final_tier_trips: int
    final_additional_bonus: float


class Quest(BaseModel):
    id: int
    title: str
    start_date: str
    end_date: str
    first_tier_trips: int
    first_tier_bonus: float
    final_tier_trips: int
    final_additional_bonus: float
    total_possible_bonus: float
    progress_trips: int
    first_tier_remaining: int
    final_tier_remaining: int
    first_tier_earned: bool
    final_tier_earned: bool
    earned_bonus: float
    status: str


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
    notes: str | None = None


class WeeklyNoteUpdate(BaseModel):
    notes: str | None = None


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
    quest_new_count: int = 0
    quest_update_count: int = 0
    weekly_note_new_count: int = 0
    weekly_note_update_count: int = 0
    error_count: int
    errors: list[ImportError]


class ImportCommitResult(BaseModel):
    inserted: int
    updated: int
    quests_inserted: int = 0
    quests_updated: int = 0
    weekly_notes_inserted: int = 0
    weekly_notes_updated: int = 0
    error_count: int
    errors: list[ImportError]


class DeleteAllRequest(BaseModel):
    confirmation: str


class DeleteAllResult(BaseModel):
    message: str
    deleted_count: int


class BreakSessionCreate(BaseModel):
    start_time: str
    end_time: str
    start_odometer: float | None = None
    end_odometer: float | None = None


class BreakSession(BreakSessionCreate):
    duration_hours: float
    miles: float | None = None


class WorkSessionCreate(BaseModel):
    start_time: str
    stop_time: str
    start_odometer: float | None = None
    stop_odometer: float | None = None


class WorkSession(WorkSessionCreate):
    duration_hours: float
    miles: float | None = None


class DraftBreak(BaseModel):
    start_time: str
    end_time: str | None = None
    start_odometer: float | None = None
    end_odometer: float | None = None


class DraftWorkSession(BaseModel):
    id: str | None = None
    start_time: str
    stop_time: str | None = None
    start_odometer: float | None = None
    stop_odometer: float | None = None
    breaks: list[DraftBreak] = Field(default_factory=list)


class DraftTripEvent(BaseModel):
    id: str
    completed_at: str
    session_id: str


class DailyDraftUpsert(BaseModel):
    date: str
    sessions: list[DraftWorkSession] = Field(default_factory=list)
    home_end_time: str | None = None
    end_home_odometer: float | None = None
    trip_events: list[DraftTripEvent] = Field(default_factory=list)
    day_tags: list[str] = Field(default_factory=list)
    notes: str | None = None


class DailyDraft(DailyDraftUpsert):
    status: str
    updated_at: str


class DailyRecordCreate(BaseModel):
    date: str
    online_hours: float
    trips: int
    net_fare: float
    tips: float
    cash_tips: float = 0
    promotions: float

    miles_driven: float | None = None

    start_odometer: float | None = None
    end_work_odometer: float | None = None
    end_home_odometer: float | None = None

    work_start_time: str | None = None
    uber_stop_time: str | None = None
    home_end_time: str | None = None
    additional_sessions: list[WorkSessionCreate] | None = None
    breaks: list[BreakSessionCreate] | None = None

    wallet_balance: float | None = None
    notes: str | None = None

    # v3.2 — Day Effects: optional tags describing conditions that affected
    # the shift (weather, traffic, order quality, operational issues). A
    # fixed vocabulary enforced by ALLOWED_DAY_TAGS in database.py, not
    # freeform text, so it stays filterable rather than turning into a
    # second notes field.
    day_tags: list[str] | None = None
    trip_events: list[DraftTripEvent] | None = None


class DailyRecord(BaseModel):
    date: str
    online_hours: float
    trips: int
    net_fare: float
    tips: float
    cash_tips: float = 0
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
    break_miles: float | None = None
    total_outing_miles: float | None = None
    post_work_miles: float | None = None
    miles_per_trip: float | None = None
    earnings_per_work_mile: float | None = None
    earnings_per_total_mile: float | None = None

    work_start_time: str | None = None
    uber_stop_time: str | None = None
    home_end_time: str | None = None
    work_sessions: list[WorkSession] | None = None
    breaks: list[BreakSession] | None = None

    real_work_hours: float | None = None
    break_hours: float | None = None
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
    trip_events: list[DraftTripEvent] = Field(default_factory=list)
