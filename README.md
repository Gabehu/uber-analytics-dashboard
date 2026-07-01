# Uber Analytics Dashboard

A local Uber earnings analytics dashboard built with Python, Streamlit, pandas, and SQLite.

## Features

- Add daily Uber workday entries
- Save entries locally with SQLite
- Edit and delete entries
- Calculate earnings, hourly rate, average per trip, and tip percentage
- View daily recap summaries
- View current week summaries
- Display basic earnings and hourly rate charts

## Privacy

Real Uber earnings data is stored locally in a SQLite database and is excluded from version control.

## Run locally

```bash
pip install -r requirements.txt
streamlit run app.py

Then commit it:

```powershell
git add README.md
git commit -m "Add README"
git push