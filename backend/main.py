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
    create_daily_record,
    update_daily_record,
    delete_daily_record,
)
from schemas import Summary, DailyRecord, DailyRecordCreate


@asynccontextmanager
async def lifespan(app: FastAPI):
    initialize_database()
    yield


app = FastAPI(
    title="Uber Dashboard API",
    description="Backend API for Uber Dashboard v2",
    version="2.2.0",
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


@app.get("/api/daily", response_model=list[DailyRecord])
def daily():
    return get_daily_data()


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