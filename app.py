import streamlit as st
import pandas as pd
from datetime import date, timedelta

from db import create_table, add_entry, get_entries, update_entry, delete_entry
from calculations import (
    online_decimal_hours,
    total_earnings,
    hourly_rate,
    average_per_trip,
    percentage,
)


# -----------------------------
# Page setup and app initialization
# -----------------------------

st.set_page_config(
    page_title="Uber Analytics Dashboard",
    page_icon="🚗",
    layout="wide",
)

# Make sure the SQLite table exists before the app tries to read/write data.
create_table()


# -----------------------------
# Helper functions
# -----------------------------

def get_current_week_range():
    """Return the Monday-Sunday date range for the current week."""
    today = date.today()
    start_of_week = today - timedelta(days=today.weekday())
    end_of_week = start_of_week + timedelta(days=6)
    return start_of_week, end_of_week


def format_hours(decimal_hours):
    """Convert decimal hours into a readable hours/minutes string."""
    if decimal_hours is None:
        return "N/A"

    hours = int(decimal_hours)
    minutes = round((decimal_hours - hours) * 60)

    return f"{hours}h {minutes}m"


# -----------------------------
# Load entries and calculate derived metrics
# -----------------------------

st.title("Uber Analytics Dashboard")
st.caption("Local dashboard for tracking Uber earnings, hours, trips, and weekly performance.")

entries = get_entries()

if entries:
    df = pd.DataFrame(entries)

    # Add calculated columns used by the dashboard.
    # These are not stored in SQLite because they can be derived from the raw entry fields.
    df["online_decimal"] = df.apply(
        lambda row: online_decimal_hours(row["online_hours"], row["online_minutes"]),
        axis=1,
    )

    df["total"] = df.apply(
        lambda row: total_earnings(row["net_fare"], row["promotions"], row["tips"]),
        axis=1,
    )

    df["hourly_rate"] = df.apply(
        lambda row: hourly_rate(row["total"], row["online_decimal"]),
        axis=1,
    )

    df["avg_per_trip"] = df.apply(
        lambda row: average_per_trip(row["total"], row["trips"]),
        axis=1,
    )

    df["tip_percent"] = df.apply(
        lambda row: percentage(row["tips"], row["total"]),
        axis=1,
    )
else:
    df = pd.DataFrame()


# -----------------------------
# Current week filtering
# -----------------------------

st.subheader("Overview")

week_start, week_end = get_current_week_range()

if not df.empty:
    df["date_obj"] = pd.to_datetime(df["date"]).dt.date

    # TODO: Add a week selector so older weeks can be reviewed.
    # V1 only shows the current Monday-Sunday week.
    week_df = df[
        (df["date_obj"] >= week_start)
        & (df["date_obj"] <= week_end)
    ].copy()
else:
    week_df = pd.DataFrame()

if not week_df.empty:
    total_week_earnings = week_df["total"].sum()
    total_week_trips = week_df["trips"].sum()
    total_week_hours = week_df["online_decimal"].sum()

    if total_week_hours > 0:
        week_hourly = total_week_earnings / total_week_hours
    else:
        week_hourly = None

    if total_week_trips > 0:
        week_avg_per_trip = total_week_earnings / total_week_trips
    else:
        week_avg_per_trip = None

    best_day_total = week_df["total"].max()
else:
    total_week_earnings = 0
    total_week_trips = 0
    total_week_hours = 0
    week_hourly = None
    week_avg_per_trip = None
    best_day_total = 0


# -----------------------------
# Overview cards
# -----------------------------

col1, col2, col3, col4 = st.columns(4)

col1.metric("This Week Earnings", f"${total_week_earnings:.2f}")

if week_hourly is None:
    col2.metric("This Week $/hr", "N/A")
else:
    col2.metric("This Week $/hr", f"${week_hourly:.2f}/hr")

col3.metric("Trips This Week", int(total_week_trips))
col4.metric("Best Day This Week", f"${best_day_total:.2f}")

st.divider()


# -----------------------------
# Main layout: recent entries + add form
# -----------------------------

left_col, right_col = st.columns([2, 1])


# -----------------------------
# Recent workdays table
# -----------------------------

with left_col:
    st.subheader("Recent Workdays")

    if df.empty:
        st.info("No entries yet. Add your first Uber workday on the right.")
    else:
        display_df = df.copy()

        display_df["online_time"] = display_df.apply(
            lambda row: f"{int(row['online_hours'])}h {int(row['online_minutes'])}m",
            axis=1,
        )

        display_df["total"] = display_df["total"].map(lambda x: f"${x:.2f}")
        display_df["hourly_rate"] = display_df["hourly_rate"].map(
            lambda x: "N/A" if x is None else f"${x:.2f}/hr"
        )
        display_df["tip_percent"] = display_df["tip_percent"].map(
            lambda x: "N/A" if x is None else f"{x * 100:.1f}%"
        )

        st.dataframe(
            display_df[
                [
                    "date",
                    "online_time",
                    "trips",
                    "total",
                    "hourly_rate",
                    "net_fare",
                    "promotions",
                    "tips",
                    "tip_percent",
                    "area",
                    "shift_type",
                    "notes",
                ]
            ],
            use_container_width=True,
            hide_index=True,
        )


        # -----------------------------
        # Selected workday recap and entry management
        # -----------------------------

        st.divider()
        st.subheader("Selected Workday")

        entry_options = {
            f"{row['date']} | ${row['total']:.2f} | {row['trips']} trips | ID {row['id']}": row["id"]
            for _, row in df.iterrows()
        }

        selected_label = st.selectbox(
            "Select a workday",
            options=list(entry_options.keys()),
        )

        selected_id = entry_options[selected_label]
        selected_entry = df[df["id"] == selected_id].iloc[0]

        selected_total = selected_entry["total"]
        selected_hourly = selected_entry["hourly_rate"]
        selected_avg_trip = selected_entry["avg_per_trip"]

        selected_net_fare = selected_entry["net_fare"]
        selected_promotions = selected_entry["promotions"]
        selected_tips = selected_entry["tips"]

        selected_fare_percent = percentage(selected_net_fare, selected_total)
        selected_promo_percent = percentage(selected_promotions, selected_total)
        selected_tip_percent = percentage(selected_tips, selected_total)

        selected_hours = int(selected_entry["online_hours"])
        selected_minutes = int(selected_entry["online_minutes"])

        st.markdown("### Daily Recap")

        recap_col1, recap_col2, recap_col3, recap_col4 = st.columns(4)

        recap_col1.metric("Total Earnings", f"${selected_total:.2f}")

        if selected_hourly is None:
            recap_col2.metric("Hourly Rate", "N/A")
        else:
            recap_col2.metric("Hourly Rate", f"${selected_hourly:.2f}/hr")

        recap_col3.metric("Trips", int(selected_entry["trips"]))

        if selected_avg_trip is None:
            recap_col4.metric("Avg Per Trip", "N/A")
        else:
            recap_col4.metric("Avg Per Trip", f"${selected_avg_trip:.2f}")

        st.write(
            f"You made **${selected_total:.2f}** over "
            f"**{selected_hours}h {selected_minutes}m** online."
        )

        if selected_hourly is not None:
            st.write(f"That comes out to **${selected_hourly:.2f}/hr**.")

        if selected_avg_trip is not None:
            st.write(
                f"You completed **{int(selected_entry['trips'])} trips**, "
                f"averaging **${selected_avg_trip:.2f} per trip**."
            )

        breakdown_col1, breakdown_col2, breakdown_col3 = st.columns(3)

        fare_percent_text = (
            "N/A"
            if selected_fare_percent is None
            else f"{selected_fare_percent * 100:.1f}%"
        )
        promo_percent_text = (
            "N/A"
            if selected_promo_percent is None
            else f"{selected_promo_percent * 100:.1f}%"
        )
        tip_percent_text = (
            "N/A"
            if selected_tip_percent is None
            else f"{selected_tip_percent * 100:.1f}%"
        )

        breakdown_col1.metric("Net Fare", f"${selected_net_fare:.2f}")
        breakdown_col1.caption(f"{fare_percent_text} of total")

        breakdown_col2.metric("Promotions", f"${selected_promotions:.2f}")
        breakdown_col2.caption(f"{promo_percent_text} of total")

        breakdown_col3.metric("Tips", f"${selected_tips:.2f}")
        breakdown_col3.caption(f"{tip_percent_text} of total")

        if selected_entry["notes"]:
            st.markdown("**Notes**")
            st.write(selected_entry["notes"])


        # -----------------------------
        # Edit selected entry
        # -----------------------------
        # TODO: Replace dropdown/expanders with a cleaner detail/edit page in a future version.

        with st.expander("Edit selected entry"):
            with st.form("edit_entry_form"):
                edit_date = st.date_input(
                    "Date",
                    value=pd.to_datetime(selected_entry["date"]).date(),
                    key="edit_date",
                )

                edit_trips = st.number_input(
                    "Trips",
                    min_value=0,
                    step=1,
                    value=int(selected_entry["trips"]),
                    key="edit_trips",
                )

                edit_col_hours, edit_col_minutes = st.columns(2)
                with edit_col_hours:
                    edit_online_hours = st.number_input(
                        "Online hours",
                        min_value=0,
                        step=1,
                        value=int(selected_entry["online_hours"]),
                        key="edit_online_hours",
                    )
                with edit_col_minutes:
                    edit_online_minutes = st.number_input(
                        "Online minutes",
                        min_value=0,
                        max_value=59,
                        step=1,
                        value=int(selected_entry["online_minutes"]),
                        key="edit_online_minutes",
                    )

                edit_net_fare = st.number_input(
                    "Net fare",
                    min_value=0.0,
                    step=0.01,
                    format="%.2f",
                    value=float(selected_entry["net_fare"]),
                    key="edit_net_fare",
                )

                edit_promotions = st.number_input(
                    "Promotions",
                    min_value=0.0,
                    step=0.01,
                    format="%.2f",
                    value=float(selected_entry["promotions"]),
                    key="edit_promotions",
                )

                edit_tips = st.number_input(
                    "Tips",
                    min_value=0.0,
                    step=0.01,
                    format="%.2f",
                    value=float(selected_entry["tips"]),
                    key="edit_tips",
                )

                edit_wallet_balance = st.number_input(
                    "Wallet balance optional",
                    min_value=0.0,
                    step=0.01,
                    format="%.2f",
                    value=float(selected_entry["wallet_balance"] or 0),
                    key="edit_wallet_balance",
                )

                edit_miles_driven = st.number_input(
                    "Miles driven optional",
                    min_value=0.0,
                    step=0.1,
                    format="%.1f",
                    value=float(selected_entry["miles_driven"] or 0),
                    key="edit_miles_driven",
                )

                edit_area = st.text_input(
                    "Area optional",
                    value=selected_entry["area"] or "",
                    key="edit_area",
                )

                shift_options = ["", "Lunch", "Dinner", "Late night", "Mixed"]
                current_shift = selected_entry["shift_type"] or ""

                if current_shift in shift_options:
                    shift_index = shift_options.index(current_shift)
                else:
                    shift_index = 0

                edit_shift_type = st.selectbox(
                    "Shift type optional",
                    shift_options,
                    index=shift_index,
                    key="edit_shift_type",
                )

                edit_notes = st.text_area(
                    "Notes",
                    value=selected_entry["notes"] or "",
                    key="edit_notes",
                )

                update_submitted = st.form_submit_button("Save Changes")

            if update_submitted:
                update_entry(
                    entry_id=selected_id,
                    date=edit_date,
                    online_hours=edit_online_hours,
                    online_minutes=edit_online_minutes,
                    trips=edit_trips,
                    net_fare=edit_net_fare,
                    promotions=edit_promotions,
                    tips=edit_tips,
                    wallet_balance=edit_wallet_balance,
                    miles_driven=edit_miles_driven,
                    area=edit_area,
                    shift_type=edit_shift_type,
                    notes=edit_notes,
                )

                st.success("Entry updated.")
                st.rerun()


        # -----------------------------
        # Delete selected entry
        # -----------------------------

        with st.expander("Delete selected entry"):
            st.warning("Deleting an entry cannot be undone.")

            confirm_delete = st.checkbox(
                "I understand. Delete this entry.",
                key="confirm_delete",
            )

            if st.button("Delete Entry", disabled=not confirm_delete):
                delete_entry(selected_id)
                st.success("Entry deleted.")
                st.rerun()


# -----------------------------
# Add daily entry form
# -----------------------------

with right_col:
    st.subheader("Add Daily Entry")

    with st.form("add_entry_form", clear_on_submit=True):
        entry_date = st.date_input("Date", value=date.today())

        trips = st.number_input("Trips", min_value=0, step=1)

        col_hours, col_minutes = st.columns(2)
        with col_hours:
            online_hours = st.number_input("Online hours", min_value=0, step=1)
        with col_minutes:
            online_minutes = st.number_input(
                "Online minutes",
                min_value=0,
                max_value=59,
                step=1,
            )

        net_fare = st.number_input(
            "Net fare",
            min_value=0.0,
            step=0.01,
            format="%.2f",
        )

        promotions = st.number_input(
            "Promotions",
            min_value=0.0,
            step=0.01,
            format="%.2f",
        )

        tips = st.number_input(
            "Tips",
            min_value=0.0,
            step=0.01,
            format="%.2f",
        )

        wallet_balance = st.number_input(
            "Wallet balance optional",
            min_value=0.0,
            step=0.01,
            format="%.2f",
        )

        miles_driven = st.number_input(
            "Miles driven optional",
            min_value=0.0,
            step=0.1,
            format="%.1f",
        )

        area = st.text_input(
            "Area optional",
            placeholder="Plymouth, Maple Grove, etc.",
        )

        shift_type = st.selectbox(
            "Shift type optional",
            ["", "Lunch", "Dinner", "Late night", "Mixed"],
        )

        notes = st.text_area("Notes")

        submitted = st.form_submit_button("Add Entry")

    if submitted:
        add_entry(
            date=entry_date,
            online_hours=online_hours,
            online_minutes=online_minutes,
            trips=trips,
            net_fare=net_fare,
            promotions=promotions,
            tips=tips,
            wallet_balance=wallet_balance,
            miles_driven=miles_driven,
            area=area,
            shift_type=shift_type,
            notes=notes,
        )

        st.success("Entry saved.")
        st.rerun()


# -----------------------------
# This week summary
# -----------------------------

st.divider()
st.subheader("This Week Summary")

st.caption(f"{week_start.strftime('%b %d')} - {week_end.strftime('%b %d, %Y')}")

if week_df.empty:
    st.info("No entries for this week yet.")
else:
    week_net_fare = week_df["net_fare"].sum()
    week_promotions = week_df["promotions"].sum()
    week_tips = week_df["tips"].sum()

    week_fare_percent = percentage(week_net_fare, total_week_earnings)
    week_promo_percent = percentage(week_promotions, total_week_earnings)
    week_tip_percent = percentage(week_tips, total_week_earnings)

    best_earning_day = week_df.loc[week_df["total"].idxmax()]
    best_hourly_day = week_df.loc[week_df["hourly_rate"].idxmax()]

    summary_col1, summary_col2, summary_col3, summary_col4 = st.columns(4)

    summary_col1.metric("Earnings", f"${total_week_earnings:.2f}")
    summary_col2.metric("Online Time", format_hours(total_week_hours))

    if week_hourly is None:
        summary_col3.metric("Hourly Rate", "N/A")
    else:
        summary_col3.metric("Hourly Rate", f"${week_hourly:.2f}/hr")

    if week_avg_per_trip is None:
        summary_col4.metric("Avg Per Trip", "N/A")
    else:
        summary_col4.metric("Avg Per Trip", f"${week_avg_per_trip:.2f}")

    st.markdown("### Weekly Earnings Breakdown")

    breakdown_col1, breakdown_col2, breakdown_col3 = st.columns(3)

    fare_percent_text = (
        "N/A"
        if week_fare_percent is None
        else f"{week_fare_percent * 100:.1f}%"
    )
    promo_percent_text = (
        "N/A"
        if week_promo_percent is None
        else f"{week_promo_percent * 100:.1f}%"
    )
    tip_percent_text = (
        "N/A"
        if week_tip_percent is None
        else f"{week_tip_percent * 100:.1f}%"
    )

    breakdown_col1.metric("Net Fare", f"${week_net_fare:.2f}")
    breakdown_col1.caption(f"{fare_percent_text} of total")

    breakdown_col2.metric("Promotions", f"${week_promotions:.2f}")
    breakdown_col2.caption(f"{promo_percent_text} of total")

    breakdown_col3.metric("Tips", f"${week_tips:.2f}")
    breakdown_col3.caption(f"{tip_percent_text} of total")

    st.markdown("### Best Days")

    best_col1, best_col2 = st.columns(2)

    best_col1.write(
        f"**Best earning day:** {best_earning_day['date']} "
        f"with **${best_earning_day['total']:.2f}**"
    )

    best_col2.write(
        f"**Best hourly day:** {best_hourly_day['date']} "
        f"at **${best_hourly_day['hourly_rate']:.2f}/hr**"
    )


# -----------------------------
# Charts
# -----------------------------

st.divider()
st.subheader("Charts")

if df.empty:
    st.info("No chart data yet. Add entries to see earnings trends.")
else:
    chart_df = df.copy()

    chart_df["date_obj"] = pd.to_datetime(chart_df["date"])
    chart_df = chart_df.sort_values("date_obj")

    daily_earnings = chart_df.groupby("date_obj", as_index=False)["total"].sum()
    daily_earnings["date_label"] = daily_earnings["date_obj"].dt.strftime("%b %d")

    st.markdown("### Daily Earnings Over Time")

    st.bar_chart(
        daily_earnings,
        x="date_label",
        y="total",
        use_container_width=True,
    )

    st.markdown("### Hourly Rate Over Time")

    hourly_chart = chart_df[["date_obj", "hourly_rate"]].copy()
    hourly_chart["date_label"] = hourly_chart["date_obj"].dt.strftime("%b %d")
    hourly_chart = hourly_chart.sort_values("date_obj")

    st.line_chart(
        hourly_chart,
        x="date_label",
        y="hourly_rate",
        use_container_width=True,
    )