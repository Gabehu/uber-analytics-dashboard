from fastapi import FastAPI
from database import get_summary_data, get_daily_data
from schemas import Summary, DailyRecord

app = FastAPI(
    title="Uber Dashboard API",
    description="Backend API for Uber Dashboard v2",
    version="0.1.0"
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