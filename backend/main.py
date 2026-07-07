import sqlite3

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from database import (
    initialize_database,
    get_summary_data,
    get_daily_data,
    create_daily_record,
    update_daily_record,
    delete_daily_record,
)
from schemas import Summary, DailyRecord, DailyRecordCreate

app = FastAPI(
    title="Uber Dashboard API",
    description="Backend API for Uber Dashboard v2",
    version="0.1.0"
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


@app.on_event("startup")
def startup_event():
    initialize_database()


@app.get("/")
def root():
    return {"message": "Uber Dashboard API running"}


@app.get("/api/summary", response_model=Summary)
def summary():
    return get_summary_data()


@app.get("/api/daily", response_model=list[DailyRecord])
def daily():
    return get_daily_data()


@app.post("/api/daily", response_model=DailyRecord, status_code=201)
def create_daily(record: DailyRecordCreate):
    try:
        return create_daily_record(record)
    except sqlite3.IntegrityError:
        raise HTTPException(
            status_code=400,
            detail="A daily record with this date already exists."
        )

@app.put("/api/daily/{date}", response_model=DailyRecord)
def update_daily(date: str, record: DailyRecordCreate):
    updated_record = update_daily_record(date, record)

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