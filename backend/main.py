import sqlite3
from contextlib import asynccontextmanager
from datetime import date as date_cls
from pathlib import Path

from fastapi import FastAPI, HTTPException, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from database import (
    DailyDateConflictError,
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
    get_quests,
    create_quest,
    update_quest,
    delete_quest,
    set_weekly_note,
    get_daily_drafts,
    upsert_daily_draft,
    delete_daily_draft,
)
from schemas import (
    Summary,
    DailyRecord,
    DailyRecordCreate,
    WeekSummary,
    WeeklyNoteUpdate,
    ImportRequest,
    ImportPreviewResult,
    ImportCommitResult,
    DeleteAllRequest,
    DeleteAllResult,
    WalletFloor,
    WalletFloorUpdate,
    Quest,
    QuestCreate,
    DailyDraft,
    DailyDraftUpsert,
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    initialize_database()
    yield


app = FastAPI(
    title="Uber Dashboard API",
    description="Local API for Uber Nest Tracker",
    version="4.0.0",
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


@app.get("/api/health")
def health():
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


@app.get("/api/quests", response_model=list[Quest])
def quests():
    return get_quests()


@app.post("/api/quests", response_model=Quest, status_code=201)
def add_quest(payload: QuestCreate):
    try:
        return create_quest(payload)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error))


@app.put("/api/quests/{quest_id}", response_model=Quest)
def edit_quest(quest_id: int, payload: QuestCreate):
    try:
        updated = update_quest(quest_id, payload)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error))

    if updated is None:
        raise HTTPException(status_code=404, detail="Quest not found.")
    return updated


@app.delete("/api/quests/{quest_id}")
def remove_quest(quest_id: int):
    if delete_quest(quest_id) == 0:
        raise HTTPException(status_code=404, detail="Quest not found.")
    return {"message": "Quest deleted.", "id": quest_id}


@app.get("/api/daily", response_model=list[DailyRecord])
def daily():
    return get_daily_data()


@app.get("/api/drafts", response_model=list[DailyDraft])
def drafts():
    return get_daily_drafts()


@app.put("/api/drafts/{date}", response_model=DailyDraft)
def save_draft(date: str, payload: DailyDraftUpsert):
    if payload.date != date:
        raise HTTPException(status_code=400, detail="Draft URL and payload dates must match.")
    try:
        return upsert_daily_draft(payload)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error))


@app.delete("/api/drafts/{date}")
def remove_draft(date: str):
    if delete_daily_draft(date) == 0:
        raise HTTPException(status_code=404, detail="No draft found for this date.")
    return {"message": "Draft deleted.", "date": date}


@app.get("/api/weeks", response_model=list[WeekSummary])
def weeks():
    return get_weekly_series()


@app.put("/api/weeks/{week_end}/notes")
def update_weekly_note(week_end: str, payload: WeeklyNoteUpdate):
    try:
        return set_weekly_note(week_end, payload.notes)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error))


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
    filename = f"uber-backup-{date_cls.today().isoformat()}.csv"

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
    except DailyDateConflictError as error:
        raise HTTPException(
            status_code=409,
            detail=str(error)
        )
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


# In phone/production mode, `npm run build` creates frontend/dist and FastAPI
# serves that build from the same origin as /api.  API routes are registered
# first, so this root mount cannot swallow them.  During normal Vite
# development the directory may be absent; the API still runs independently.
FRONTEND_DIST = Path(__file__).resolve().parent.parent / "frontend" / "dist"
if FRONTEND_DIST.is_dir():
    app.mount(
        "/",
        StaticFiles(directory=FRONTEND_DIST, html=True),
        name="frontend",
    )
else:
    @app.get("/")
    def root():
        return {
            "message": "Uber Dashboard API running",
            "frontend": "Run npm run build in frontend for single-origin mode.",
        }
