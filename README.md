# Uber Nest Tracker

A local Uber earnings and efficiency dashboard built with a React/Vite frontend, FastAPI backend, and SQLite database.

The goal of this project is not just to track Uber earnings, but to help understand what those earnings actually mean:

- How much did I earn?
- How efficient was the day?
- How much came from fare, tips, and promotions?
- Was the day promo-carried, tip-heavy, or actually strong?
- How did the week compare across days?
- Did mileage make the day better or worse?

## Current status

**Version 2.0.0 is stable.**

Version 2.0 is a full-stack rebuild of the earlier local prototype. The original v1/v1.1 version proved the basic idea as a local dashboard. V2 rebuilds the project with a separate frontend/backend structure and a more expandable foundation.

Current version:

```text
React/Vite frontend
FastAPI backend
SQLite local database
```

## Features

### Daily log tracking

Add daily Uber work logs with:

- Date
- Online hours
- Trips
- Net fare
- Promotions, optional
- Tips
- Miles driven, optional
- Wallet balance, optional
- Notes, optional

The backend calculates:

- Total earnings
- Average hourly earnings
- Average earnings per trip
- Earnings per mile, when mileage is logged
- Fare share
- Tip share
- Promotion share

### Full CRUD support

Daily logs support:

- Create new logs
- Read/view existing logs
- Edit existing logs
- Delete logs

The frontend updates the dashboard after changes, and the backend stores the data locally in SQLite.

### Weekly earnings dashboard

The main dashboard centers around a weekly earnings card with:

- Monday-Sunday structure
- Weekly total earnings
- Daily bar comparison
- Previous/next week navigation
- Latest week button
- Clickable daily bars
- Weekly online hours
- Weekly trips
- Weekly average hourly
- Weekly average per trip
- Weekly net fare
- Weekly tips
- Weekly promotions
- Weekly mileage and $/mile when mileage is logged

### Selected day mode

Clicking a daily bar switches the weekly card into selected-day mode.

Selected-day mode shows:

- Day total
- Online hours
- Trips
- Average hourly
- Average per trip
- Net fare
- Tips
- Promotions
- Miles and $/mile when logged
- Wallet status
- Notes when available

Clicking the same selected bar again returns the card to weekly mode.

### Rule-based labels

The app adds simple rule-based labels to help interpret days quickly.

Examples:

- Strong hourly
- Good hourly
- Acceptable hourly
- Weak hourly
- Organic earnings
- Promo helped
- Promo-carried
- Normal tips
- Solid tips
- Tip-carried
- Mileage not logged
- Strong mileage

### Daily logs table

The daily logs table gives a compact overview of logged days with:

- Date
- Total earnings
- $/hour
- Trips
- $/mile
- Status labels
- View action
- Edit action
- Delete action

The table is meant for scanning and managing records, while the weekly card handles the main dashboard view.

### Input validation

The frontend includes basic validation for:

- Duplicate dates
- Online hours greater than 0
- Trips greater than 0
- Non-negative fare, tips, promotions, mileage, and wallet values

Promotions can be left blank and are treated as `$0.00`.

## Privacy

This project is designed to keep personal Uber earnings data local.

Daily logs are stored in a local SQLite database.

The local database is created at:

```text
backend/uber_dashboard.db
```

The database file is excluded from version control so real earnings data stays local.

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

## Project structure

```text
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

## Tech stack

### Frontend

- React
- Vite
- JavaScript
- CSS

### Backend

- Python
- FastAPI
- Pydantic
- SQLite
- Uvicorn

## Run locally

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

Backend runs at:

```text
http://127.0.0.1:8000
```

FastAPI docs are available at:

```text
http://127.0.0.1:8000/docs
```

### Frontend

Open a second terminal.

From the project root:

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

Frontend runs at:

```text
http://localhost:5173
```

## API endpoints

Current backend endpoints:

```text
GET    /
GET    /api/summary
GET    /api/daily
POST   /api/daily
PUT    /api/daily/{date}
DELETE /api/daily/{date}
```

### Example daily log POST body

```json
{
  "date": "2026-07-05",
  "online_hours": 4.25,
  "trips": 11,
  "net_fare": 58.40,
  "promotions": 15.00,
  "tips": 41.20,
  "miles_driven": 55.0,
  "wallet_balance": 1452.90,
  "notes": "Good shift, promo helped, mileage test."
}
```

## Version history

### v1.1

Local prototype built with Python, Streamlit, pandas, and SQLite.

Included:

- Local data entry
- SQLite storage
- Daily recaps
- Weekly summaries
- Basic earnings/hourly charts

### v2.0.0

Stable full-stack rebuild.

Includes:

- React/Vite frontend
- FastAPI backend
- SQLite database
- Daily log form
- Add/edit/delete support
- Richer earnings breakdown
- Optional mileage, wallet, and notes
- Weekly earnings chart
- Week navigation
- Clickable weekly bars
- Selected-day mode inside the weekly card
- Rule-based efficiency labels
- Compact daily logs table
- Basic frontend validation
- Local-only database storage

## Planned improvements

### v2.1: Mileage and time accuracy

Planned v2.1 focus: make the app better at measuring the real cost of a shift.

Possible additions:

- Advanced tracking section in the daily log form
- Start odometer
- End Uber/work odometer
- End home odometer, optional
- Work start time
- Uber stop time
- Home/end time, optional

Calculated metrics:

- Work miles
- Total outing miles
- Post-work/return miles
- Miles per trip
- Earnings per work mile
- Earnings per total mile
- Real work time
- Full outing time
- Post-work/return time
- Earnings per real work hour
- Earnings per full outing hour

The goal of v2.1 is to answer:

- How much driving did this day actually cost?
- How much unpaid return driving happened?
- Was the day still good after mileage?
- Was the Uber online hourly misleading compared to real time spent?

### Future: Quest tracker

Possible future quest tracking:

- Monday-Thursday quest periods
- Friday-Sunday quest periods
- Tier 1 trip goal and bonus
- Tier 2 trip goal and bonus
- Current quest progress
- Trips remaining
- Bonus per remaining trip
- Push/stop recommendation

### Future: Spending and leakage tracker

Possible future spending features:

- Spending entries
- Spending categories
- Daily spending total
- Wallet change
- Retained earnings
- Retention rate

### Future: Cushion tracker

Possible future cushion features:

- Wallet balance
- Reserved obligations
- Paid-off obligation status
- Real cushion
- Safe floor
- Goal progress

### Future: Import tools

Possible future import features:

- Weekly statement PDF extraction
- Monthly tax summary extraction
- Review-before-save import flow