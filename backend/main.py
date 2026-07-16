import sqlite3
from contextlib import asynccontextmanager
from datetime import date as date_cls

from fastapi import FastAPI, HTTPException, Response
from fastapi.middleware.cors import CORSMiddleware
from database import (
    initialize_database,
    get_summary_data,
    get_daily_data,
    get_daily_csv,
    get_weekly_series,
    preview_csv_import,
    commit_csv_import,
    create_daily_record,
    update_daily_record,
    delete_daily_record,
    delete_all_daily_records,
    get_wallet_floor,
    set_wallet_floor,
)
from schemas import (
    Summary,
    DailyRecord,
    DailyRecordCreate,
    WeekSummary,
    ImportRequest,
    ImportPreviewResult,
    ImportCommitResult,
    DeleteAllRequest,
    DeleteAllResult,
    WalletFloor,
    WalletFloorUpdate,
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    initialize_database()
    yield


app = FastAPI(
    title="Uber Dashboard API",
    description="Backend API for Uber Dashboard v2",
    version="3.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
def root():
    return {"message": "Uber Dashboard API running"}


@app.get("/api/summary", response_model=Summary)
def summary():
    return get_summary_data()


@app.get("/api/settings/wallet-floor", response_model=WalletFloor)
def get_wallet_floor_setting():
    return {"uber_wallet_floor": get_wallet_floor()}


@app.put("/api/settings/wallet-floor", response_model=WalletFloor)
def update_wallet_floor_setting(payload: WalletFloorUpdate):
    set_wallet_floor(payload.uber_wallet_floor)
    return {"uber_wallet_floor": payload.uber_wallet_floor}


@app.get("/api/daily", response_model=list[DailyRecord])
def daily():
    return get_daily_data()


@app.get("/api/weeks", response_model=list[WeekSummary])
def weeks():
    return get_weekly_series()


@app.post("/api/daily/import/preview", response_model=ImportPreviewResult)
def import_preview(payload: ImportRequest):
    return preview_csv_import(payload.csv_text)


@app.post("/api/daily/import/commit", response_model=ImportCommitResult)
def import_commit(payload: ImportRequest):
    return commit_csv_import(payload.csv_text)


# NOTE: this route is declared before "/api/daily/{date}" so that the literal
# path "csv" is matched here rather than being treated as a {date} value.
@app.get("/api/daily/csv")
def daily_csv():
    csv_text = get_daily_csv()
    filename = f"uber-logs-{date_cls.today().isoformat()}.csv"

    return Response(
        content=csv_text,
        media_type="text/csv",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"'
        },
    )


@app.post("/api/daily", response_model=DailyRecord, status_code=201)
def create_daily(record: DailyRecordCreate):
    try:
        return create_daily_record(record)
    except sqlite3.IntegrityError:
        raise HTTPException(
            status_code=400,
            detail="A daily record with this date already exists."
        )
    except ValueError as error:
        raise HTTPException(
            status_code=400,
            detail=str(error)
        )

@app.put("/api/daily/{date}", response_model=DailyRecord)
def update_daily(date: str, record: DailyRecordCreate):
    try:
        updated_record = update_daily_record(date, record)
    except ValueError as error:
        raise HTTPException(
            status_code=400,
            detail=str(error)
        )

    if updated_record is None:
        raise HTTPException(
            status_code=404,
            detail="No daily record found for this date."
        )

    return updated_record

@app.delete("/api/daily/{date}")
def delete_daily(date: str):
    deleted_count = delete_daily_record(date)

    if deleted_count == 0:
        raise HTTPException(
            status_code=404,
            detail="No daily record found for this date."
        )

    return {
        "message": "Daily record deleted successfully.",
        "date": date
    }


@app.delete("/api/daily", response_model=DeleteAllResult)
def delete_all_daily(payload: DeleteAllRequest):
    # The frontend gates this behind a type-to-confirm flow, but that's a UI
    # convenience, not the real safeguard -- the backend independently
    # requires the exact confirmation text too, so this can't be triggered
    # by anything other than the deliberate confirmed action.
    if payload.confirmation != "DELETE":
        raise HTTPException(
            status_code=400,
            detail='Confirmation text must be exactly "DELETE".'
        )

    deleted_count = delete_all_daily_records()

    return {
        "message": "All daily records deleted.",
        "deleted_count": deleted_count,
    }