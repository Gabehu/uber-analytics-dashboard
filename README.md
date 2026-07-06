# Uber Nest Tracker

A local Uber earnings and efficiency dashboard built with a React/Vite frontend, FastAPI backend, and SQLite database.

The goal of this project is not just to track Uber earnings, but to help understand what those earnings actually mean:

- How much did I earn?
- How efficient was the day?
- How much came from fare, tips, and promotions?
- Was the day promo-carried, tip-heavy, or actually strong?
- How did the week compare across days?
- Did mileage make the day better or worse?

## Current Status

**Version 2.0** is a full-stack rebuild of the earlier local prototype.

The original v1/v1.1 version proved the basic idea as a local dashboard. V2 rebuilds the project with a separate frontend/backend structure and a more expandable foundation.

**Current stack:**
- React/Vite frontend
- FastAPI backend
- SQLite local database

## Features

### Daily Log Tracking

Add daily Uber work logs with:

- Date
- Online hours
- Trips
- Net fare
- Tips
- Promotions
- Optional miles driven
- Optional wallet balance
- Optional notes

The backend calculates:

- Total earnings
- Average hourly earnings
- Average earnings per trip
- Earnings per mile, when mileage is logged
- Fare share
- Tip share
- Promotion share

### Daily Recap

The dashboard shows a latest-day recap card with:

- Total earnings
- $/hour
- $/trip
- $/mile
- Fare/tips/promotions breakdown
- Mileage status
- Wallet status
- Notes

It also adds simple rule-based labels such as:

- Strong hourly
- Good hourly
- Acceptable hourly
- Promo helped
- Promo-carried
- Solid tips
- Normal tips
- Mileage not logged
- Strong mileage

### Weekly Earnings View

The dashboard includes a weekly earnings chart with:

- Monday–Sunday structure
- Weekly total earnings
- Daily bar comparison
- Week navigation
- Online hours
- Trips
- Average hourly
- Average per trip
- Weekly net fare
- Weekly tips
- Weekly promotions
- Weekly mileage and $/mile when mileage is logged

### Daily Logs Table

The daily logs table gives a cleaner overview of logged days with:

- Date
- Total earnings
- $/hour
- Trips
- $/mile
- Status labels
- Delete action

## Local Data Storage

Daily logs are stored locally in SQLite. The local database is created at:

```
backend/uber_dashboard.db
```

The database file is excluded from version control so real earnings data stays local.

## Privacy

This project is designed to keep personal Uber earnings data local. The SQLite database is ignored by Git and should not be committed.

Recommended `.gitignore` entries:

```gitignore
# Python
backend/venv/
backend/__pycache__/
*.pyc

# Local database
backend/uber_dashboard.db

# Frontend
frontend/node_modules/
frontend/dist/
```

## Project Structure

```
Uber/
  backend/
    database.py
    main.py
    requirements.txt
    schemas.py

  frontend/
    src/
      App.jsx
      App.css
    package.json

  docs/
    v2-plan.md

  README.md
```

## Tech Stack

**Frontend**
- React
- Vite
- JavaScript
- CSS

**Backend**
- Python
- FastAPI
- Pydantic
- SQLite
- Uvicorn

## Run Locally

You need two terminals: one for the backend and one for the frontend.

### Backend

From the project root:

```bash
cd backend
```

Create a virtual environment if needed:

```bash
python -m venv venv
```

Activate it on Windows PowerShell:

```bash
.\venv\Scripts\Activate.ps1
```

Install dependencies:

```bash
python -m pip install -r requirements.txt
```

Run the FastAPI backend:

```bash
python -m uvicorn main:app --reload
```

Backend runs at: `http://127.0.0.1:8000`

FastAPI docs are available at: `http://127.0.0.1:8000/docs`

### Frontend

Open a second terminal. From the project root:

```bash
cd frontend
```

Install dependencies:

```bash
npm install
```

Run the Vite frontend:

```bash
npm run dev
```

Frontend runs at: `http://localhost:5173`

## API Endpoints

Current backend endpoints:

```
GET    /
GET    /api/summary
GET    /api/daily
POST   /api/daily
DELETE /api/daily/{date}
```

### Example Daily Log POST Body

```json
{
  "date": "2026-07-05",
  "online_hours": 4.25,
  "trips": 11,
  "net_fare": 58.40,
  "tips": 41.20,
  "promotions": 15.00,
  "miles_driven": 55.0,
  "wallet_balance": 1452.90,
  "notes": "Good shift, promo helped, mileage test."
}
```

## Version History

### v1.1
Local prototype built with Python, Streamlit, pandas, and SQLite. Included:
- Local data entry
- SQLite storage
- Daily recaps
- Weekly summaries
- Basic earnings/hourly charts

### v2.0
Full-stack rebuild. Includes:
- React/Vite frontend
- FastAPI backend
- SQLite database
- Daily log form
- Delete records from the frontend
- Richer earnings breakdown
- Latest-day recap card
- Weekly earnings chart
- Week navigation
- Rule-based efficiency labels
- Cleaner daily logs table

## Planned Improvements

### Near-term
- Add "View details" for any daily log
- Improve form layout and validation
- Add edit/update support for existing logs
- Add better empty-state and loading-state handling
- Add screenshots to README

### Future Versions

**Odometer-based mileage tracking**
- Start odometer
- End Uber/work odometer
- End home odometer
- Business vs personal/post-shift miles

**Separate time types**
- Uber online time
- Real work time
- Full outing time

**Quest tracker**
- Monday–Thursday and Friday–Sunday quest periods
- Tier 1 and tier 2 bonus tracking
- Trips remaining
- Bonus per remaining trip
- Push/stop recommendation

**Spending and leakage tracker**
- Spending entries
- Wallet change
- Retained earnings
- Retention rate

**Cushion tracker**
- Wallet balance
- Reserved obligations
- Paid-off obligation status
- Real cushion
- Goal progress

**Import tools**
- Weekly statement PDF extraction
- Monthly tax summary extraction
- Review-before-save import flow