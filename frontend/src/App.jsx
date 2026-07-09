import { useEffect, useState } from "react";
import "./App.css";

const API_BASE_URL = "http://127.0.0.1:8000";

function getTodayInputValue() {
  const today = new Date();
  return today.toISOString().slice(0, 10);
}

const emptyForm = {
  date: getTodayInputValue(),
  online_hours: "",
  trips: "",
  net_fare: "",
  tips: "",
  promotions: "",

  start_odometer: "",
  end_work_odometer: "",
  end_home_odometer: "",

  work_start_time_value: "",
  work_start_time_meridiem: "PM",

  uber_stop_time_value: "",
  uber_stop_time_meridiem: "PM",

  home_end_time_value: "",
  home_end_time_meridiem: "PM",

  wallet_balance: "",
  notes: "",
};

// Maps a rule-based label to a color meaning, so the UI can encode
// good/mixed/weak days at a glance instead of using one flat color everywhere.
const LABEL_VARIANTS = {
  "Strong hourly": "success",
  "Good hourly": "success",
  "Acceptable hourly": "warning",
  "Weak hourly": "danger",
  "Bad hourly": "danger",

  "Organic earnings": "success",
  "Promo helped": "warning",
  "Promo-carried": "danger",

  "Tip-carried": "success",
  "Solid tips": "success",
  "Normal tips": "warning",
  "Weak tips": "danger",

  "Strong mileage": "success",
  "Solid mileage": "success",
  "Questionable mileage": "warning",
  "Weak mileage": "danger",
  "Mileage not logged": "neutral",
};

function getLabelVariant(label) {
  return LABEL_VARIANTS[label] || "neutral";
}

function App() {
  const [summary, setSummary] = useState(null);
  const [dailyRecords, setDailyRecords] = useState([]);
  const [weeks, setWeeks] = useState([]);
  const latestRecord = dailyRecords.length > 0 ? dailyRecords[0] : null;

  const [selectedRecordDate, setSelectedRecordDate] = useState(null);
  const selectedRecord =
    dailyRecords.find((record) => record.date === selectedRecordDate) || null;

  const [selectedWeekStart, setSelectedWeekStart] = useState(null);
  const [formData, setFormData] = useState(emptyForm);
  const [showAdvancedTracking, setShowAdvancedTracking] = useState(false);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingDate, setEditingDate] = useState(null);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  function getWeekStart(dateString) {
    const date = new Date(`${dateString}T00:00:00`);
    const day = date.getDay();
    const diffToMonday = day === 0 ? -6 : 1 - day;

    const monday = new Date(date);
    monday.setDate(date.getDate() + diffToMonday);

    return monday;
  }

  function formatDateForInput(date) {
    return date.toISOString().slice(0, 10);
  }

  function formatShortDate(date) {
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
  }

  function formatRecordDate(dateString) {
    const date = new Date(`${dateString}T00:00:00`);

    return date.toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
    });
  }

  function formatHoursAndMinutes(hours) {
    const totalMinutes = Math.round(hours * 60);
    const wholeHours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;

    if (wholeHours === 0) {
      return `${minutes}m`;
    }

    return `${wholeHours}h ${minutes}m`;
  }

  function formatPercent(value) {
    return `${(value * 100).toFixed(1)}%`;
  }

  function optionalNumber(value) {
    if (value === "") {
      return null;
    }

    return Number(value);
  }

  function optionalText(value) {
    if (value.trim() === "") {
      return null;
    }

    return value;
  }

  function formNumber(value) {
    return value !== null && value !== undefined ? String(value) : "";
  }

  function combineTimeInput(timeValue, meridiem) {
    const trimmedTime = timeValue.trim();

    if (trimmedTime === "") {
      return null;
    }

    return `${trimmedTime} ${meridiem}`;
  }

  function splitStoredTime(timeText) {
    if (!timeText) {
      return {
        timeValue: "",
        meridiem: "PM",
      };
    }

    const match = timeText.trim().match(/^(\d{1,2}(?::\d{2})?)\s*(AM|PM)$/i);

    if (!match) {
      return {
        timeValue: "",
        meridiem: "PM",
      };
    }

    return {
      timeValue: match[1],
      meridiem: match[2].toUpperCase(),
    };
  }

  function isValidTimeValue(timeValue) {
    const trimmedTime = timeValue.trim();

    if (trimmedTime === "") {
      return true;
    }

    const match = trimmedTime.match(/^(\d{1,2})(?::(\d{2}))?$/);

    if (!match) {
      return false;
    }

    const hour = Number(match[1]);
    const minute = match[2] === undefined ? 0 : Number(match[2]);

    return hour >= 1 && hour <= 12 && minute >= 0 && minute <= 59;
  }

  function timeToMinutes(timeValue, meridiem) {
    const trimmedTime = timeValue.trim();

    if (trimmedTime === "") {
      return null;
    }

    const match = trimmedTime.match(/^(\d{1,2})(?::(\d{2}))?$/);

    if (!match) {
      return null;
    }

    let hour = Number(match[1]);
    const minute = match[2] === undefined ? 0 : Number(match[2]);

    if (hour < 1 || hour > 12 || minute < 0 || minute > 59) {
      return null;
    }

    if (meridiem === "AM") {
      if (hour === 12) {
        hour = 0;
      }
    } else if (hour !== 12) {
      hour += 12;
    }

    return hour * 60 + minute;
  }

  function formatOptionalCurrency(value) {
    return value !== null && value !== undefined ? `$${value.toFixed(2)}` : "—";
  }

  function formatOptionalNumber(value, decimals = 1) {
    return value !== null && value !== undefined ? value.toFixed(decimals) : "—";
  }

  function formatOptionalHours(value) {
    return value !== null && value !== undefined ? formatHoursAndMinutes(value) : "—";
  }

  function formatWalletDelta(delta, daysAgo) {
    if (delta === null || delta === undefined) {
      return null;
    }

    const sign = delta >= 0 ? "+" : "−";
    const amount = `${sign}$${Math.abs(delta).toFixed(2)}`;

    if (daysAgo === null || daysAgo === undefined) {
      return amount;
    }

    const whenText = daysAgo === 0 ? "same day logged" : daysAgo === 1 ? "1 day ago" : `${daysAgo} days ago`;
    return `${amount} · ${whenText}`;
  }

  function handleWeeklyBarClick(day) {
    if (!day.hasRecord) {
      return;
    }

    if (selectedRecordDate === day.date) {
      setSelectedRecordDate(null);
      return;
    }

    selectRecordAndWeek(day.date);
  }

  function changeWeek(offsetInDays) {
    if (!selectedWeekStart) {
      return;
    }

    const currentWeekStart = new Date(`${selectedWeekStart}T00:00:00`);
    currentWeekStart.setDate(currentWeekStart.getDate() + offsetInDays);

    setSelectedWeekStart(formatDateForInput(currentWeekStart));
  }

  function goToLatestWeek() {
    if (!latestRecord) {
      return;
    }

    const latestWeekStart = getWeekStart(latestRecord.date);
    setSelectedWeekStart(formatDateForInput(latestWeekStart));
  }

  function jumpToDate(dateString) {
    if (!dateString) {
      return;
    }

    // Clear any selected day so the view returns to the weekly summary
    // for the chosen week rather than staying pinned to a single day.
    setSelectedRecordDate(null);

    const weekStart = getWeekStart(dateString);
    setSelectedWeekStart(formatDateForInput(weekStart));
  }

  function jumpToWeekStart(weekStartString) {
    if (!weekStartString) {
      return;
    }

    setSelectedRecordDate(null);
    setSelectedWeekStart(weekStartString);
  }

  function formatWeekRangeLabel(weekStartString, weekEndString) {
    const start = new Date(`${weekStartString}T00:00:00`);
    const end = new Date(`${weekEndString}T00:00:00`);

    return `${formatShortDate(start)} - ${formatShortDate(end)}`;
  }

  function selectRecordAndWeek(date) {
    setSelectedRecordDate(date);

    const recordWeekStart = getWeekStart(date);
    setSelectedWeekStart(formatDateForInput(recordWeekStart));
  }

  const weeklyChartData = selectedWeekStart
    ? (() => {
        const weekStart = new Date(`${selectedWeekStart}T00:00:00`);

        return Array.from({ length: 7 }, (_, index) => {
          const currentDate = new Date(weekStart);
          currentDate.setDate(weekStart.getDate() + index);

          const dateKey = formatDateForInput(currentDate);
          const matchingRecord = dailyRecords.find(
            (record) => record.date === dateKey
          );

          return {
            date: dateKey,
            dayLabel: currentDate.toLocaleDateString("en-US", {
              weekday: "short",
            }),
            shortDate: currentDate.getDate(),
            earnings: matchingRecord ? matchingRecord.total_earnings : 0,
            trips: matchingRecord ? matchingRecord.trips : 0,
            onlineHours: matchingRecord ? matchingRecord.online_hours : 0,
            hasRecord: Boolean(matchingRecord),
          };
        });
      })()
    : [];

  const weeklyRecords = latestRecord
    ? dailyRecords.filter((record) =>
        weeklyChartData.some((day) => day.date === record.date)
      )
    : [];

  const weeklyTotalEarnings = weeklyChartData.reduce(
    (total, day) => total + day.earnings,
    0
  );

  const weeklyTotalTrips = weeklyChartData.reduce(
    (total, day) => total + day.trips,
    0
  );

  const weeklyTotalHours = weeklyChartData.reduce(
    (total, day) => total + day.onlineHours,
    0
  );

  const weeklyAverageHourly =
    weeklyTotalHours > 0 ? weeklyTotalEarnings / weeklyTotalHours : 0;

  const selectedRecordIsInVisibleWeek =
    selectedRecord &&
    weeklyChartData.some((day) => day.date === selectedRecord.date);

  const weeklyNetFare = weeklyRecords.reduce(
    (total, record) => total + record.net_fare,
    0
  );

  const weeklyTips = weeklyRecords.reduce(
    (total, record) => total + record.tips,
    0
  );

  const weeklyPromotions = weeklyRecords.reduce(
    (total, record) => total + record.promotions,
    0
  );

  const weeklyFareShare =
    weeklyTotalEarnings > 0 ? weeklyNetFare / weeklyTotalEarnings : 0;

  const weeklyTipShare =
    weeklyTotalEarnings > 0 ? weeklyTips / weeklyTotalEarnings : 0;

  const weeklyPromoShare =
    weeklyTotalEarnings > 0 ? weeklyPromotions / weeklyTotalEarnings : 0;

  const weeklyWorkMiles = weeklyRecords.reduce((total, record) => {
    if (record.work_miles === null) {
      return total;
    }

    return total + record.work_miles;
  }, 0);

  const weeklyRealWorkHours = weeklyRecords.reduce((total, record) => {
    if (record.real_work_hours === null) {
      return total;
    }

    return total + record.real_work_hours;
  }, 0);

  const weeklyEarningsPerWorkMile =
    weeklyWorkMiles > 0 ? weeklyTotalEarnings / weeklyWorkMiles : null;

  const weeklyEarningsPerRealHour =
    weeklyRealWorkHours > 0 ? weeklyTotalEarnings / weeklyRealWorkHours : null;

  const currentWeekData = selectedWeekStart
    ? weeks.find((week) => week.week_start === selectedWeekStart)
    : null;

  const maxWeeklyEarnings =
    weeklyChartData.length > 0
      ? Math.max(...weeklyChartData.map((day) => day.earnings))
      : 0;

  const weekStartDate =
    weeklyChartData.length > 0
      ? new Date(`${weeklyChartData[0].date}T00:00:00`)
      : null;

  const weekEndDate =
    weeklyChartData.length > 0
      ? new Date(`${weeklyChartData[6].date}T00:00:00`)
      : null;

  async function fetchDashboardData() {
    try {
      setError("");

      const summaryResponse = await fetch(`${API_BASE_URL}/api/summary`);
      const dailyResponse = await fetch(`${API_BASE_URL}/api/daily`);
      const weeksResponse = await fetch(`${API_BASE_URL}/api/weeks`);

      if (!summaryResponse.ok || !dailyResponse.ok || !weeksResponse.ok) {
        throw new Error("Failed to fetch dashboard data.");
      }

      const summaryData = await summaryResponse.json();
      const dailyData = await dailyResponse.json();
      const weeksData = await weeksResponse.json();

      setSummary(summaryData);
      setDailyRecords(dailyData);
      setWeeks(weeksData);
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    fetchDashboardData();
  }, []);

  useEffect(() => {
    if (latestRecord && selectedWeekStart === null) {
      const weekStart = getWeekStart(latestRecord.date);
      setSelectedWeekStart(formatDateForInput(weekStart));
    }
  }, [latestRecord, selectedWeekStart]);

  useEffect(() => {
    if (!error && !successMessage) {
      return;
    }

    const timerId = setTimeout(() => {
      setError("");
      setSuccessMessage("");
    }, 3000);

    return () => clearTimeout(timerId);
  }, [error, successMessage]);

  function handleInputChange(event) {
    const { name, value } = event.target;

    setFormData((currentFormData) => ({
      ...currentFormData,
      [name]: value,
    }));
  }

  function handleEdit(record) {
    const workStartTime = splitStoredTime(record.work_start_time);
    const uberStopTime = splitStoredTime(record.uber_stop_time);
    const homeEndTime = splitStoredTime(record.home_end_time);

    setEditingDate(record.date);
    setIsFormOpen(true);
    selectRecordAndWeek(record.date);

    setFormData({
      date: record.date,
      online_hours: String(record.online_hours),
      trips: String(record.trips),
      net_fare: String(record.net_fare),
      tips: String(record.tips),
      promotions: String(record.promotions),

      start_odometer: formNumber(record.start_odometer),
      end_work_odometer: formNumber(record.end_work_odometer),
      end_home_odometer: formNumber(record.end_home_odometer),

      work_start_time_value: workStartTime.timeValue,
      work_start_time_meridiem: workStartTime.meridiem,

      uber_stop_time_value: uberStopTime.timeValue,
      uber_stop_time_meridiem: uberStopTime.meridiem,

      home_end_time_value: homeEndTime.timeValue,
      home_end_time_meridiem: homeEndTime.meridiem,

      wallet_balance: formNumber(record.wallet_balance),
      notes: record.notes || "",
    });

    setShowAdvancedTracking(
      record.start_odometer !== null ||
        record.end_work_odometer !== null ||
        record.end_home_odometer !== null ||
        record.work_start_time !== null ||
        record.uber_stop_time !== null ||
        record.home_end_time !== null
    );

    setError("");
    setSuccessMessage("");
  }

  function cancelEdit() {
    setEditingDate(null);
    setIsFormOpen(false);
    setFormData(emptyForm);
    setShowAdvancedTracking(false);
    setError("");
    setSuccessMessage("");
  }

  async function handleSubmit(event) {
    event.preventDefault();

    if (isSubmitting) {
      return;
    }

    setError("");
    setSuccessMessage("");

    const newRecord = {
      date: formData.date,
      online_hours: Number(formData.online_hours),
      trips: Number(formData.trips),
      net_fare: Number(formData.net_fare),
      tips: Number(formData.tips),
      promotions: formData.promotions === "" ? 0 : Number(formData.promotions),

      miles_driven: null,

      start_odometer: optionalNumber(formData.start_odometer),
      end_work_odometer: optionalNumber(formData.end_work_odometer),
      end_home_odometer: optionalNumber(formData.end_home_odometer),

      work_start_time: combineTimeInput(
        formData.work_start_time_value,
        formData.work_start_time_meridiem
      ),
      uber_stop_time: combineTimeInput(
        formData.uber_stop_time_value,
        formData.uber_stop_time_meridiem
      ),
      home_end_time: combineTimeInput(
        formData.home_end_time_value,
        formData.home_end_time_meridiem
      ),

      wallet_balance: optionalNumber(formData.wallet_balance),
      notes: optionalText(formData.notes),
    };

    if (
      !editingDate &&
      dailyRecords.some((record) => record.date === newRecord.date)
    ) {
      setError("A daily record with this date already exists.");
      return;
    }

    if (newRecord.online_hours <= 0) {
      setError("Online hours must be greater than 0.");
      return;
    }

    if (newRecord.trips <= 0) {
      setError("Trips must be greater than 0.");
      return;
    }

    if (
      newRecord.net_fare < 0 ||
      newRecord.tips < 0 ||
      newRecord.promotions < 0
    ) {
      setError("Fare, tips, and promotions cannot be negative.");
      return;
    }

    if (newRecord.start_odometer !== null && newRecord.start_odometer < 0) {
      setError("Start odometer cannot be negative.");
      return;
    }

    if (
      newRecord.end_work_odometer !== null &&
      newRecord.end_work_odometer < 0
    ) {
      setError("End Uber/work odometer cannot be negative.");
      return;
    }

    if (newRecord.end_home_odometer !== null && newRecord.end_home_odometer < 0) {
      setError("End home odometer cannot be negative.");
      return;
    }

    if (
      newRecord.start_odometer !== null &&
      newRecord.end_work_odometer !== null &&
      newRecord.end_work_odometer < newRecord.start_odometer
    ) {
      setError("End Uber/work odometer cannot be lower than start odometer.");
      return;
    }

    if (
      newRecord.start_odometer !== null &&
      newRecord.end_home_odometer !== null &&
      newRecord.end_home_odometer < newRecord.start_odometer
    ) {
      setError("End home odometer cannot be lower than start odometer.");
      return;
    }

    if (
      newRecord.end_work_odometer !== null &&
      newRecord.end_home_odometer !== null &&
      newRecord.end_home_odometer < newRecord.end_work_odometer
    ) {
      setError("End home odometer cannot be lower than end Uber/work odometer.");
      return;
    }

    if (formData.end_work_odometer !== "" && formData.start_odometer === "") {
      setError("Start odometer is required when end Uber/work odometer is entered.");
      return;
    }

    if (formData.end_home_odometer !== "" && formData.start_odometer === "") {
      setError("Start odometer is required when end home odometer is entered.");
      return;
    }

    if (formData.end_home_odometer !== "" && formData.end_work_odometer === "") {
      setError("End Uber/work odometer is required when end home odometer is entered.");
      return;
    }

    if (
      !isValidTimeValue(formData.work_start_time_value) ||
      !isValidTimeValue(formData.uber_stop_time_value) ||
      !isValidTimeValue(formData.home_end_time_value)
    ) {
      setError("Times must look like 5, 5:30, or 12:05 with AM/PM selected.");
      return;
    }

    if (
      formData.uber_stop_time_value !== "" &&
      formData.work_start_time_value === ""
    ) {
      setError("Work start time is required when Uber stop time is entered.");
      return;
    }

    if (
      formData.home_end_time_value !== "" &&
      (formData.work_start_time_value === "" ||
        formData.uber_stop_time_value === "")
    ) {
      setError(
        "Work start time and Uber stop time are required when home/end time is entered."
      );
      return;
    }

    const workStartMinutes = timeToMinutes(
      formData.work_start_time_value,
      formData.work_start_time_meridiem
    );
    const uberStopMinutes = timeToMinutes(
      formData.uber_stop_time_value,
      formData.uber_stop_time_meridiem
    );
    const homeEndMinutes = timeToMinutes(
      formData.home_end_time_value,
      formData.home_end_time_meridiem
    );

    if (
      workStartMinutes !== null &&
      uberStopMinutes !== null &&
      uberStopMinutes <= workStartMinutes
    ) {
      setError("Uber stop time must be later than work start time.");
      return;
    }

    if (
      uberStopMinutes !== null &&
      homeEndMinutes !== null &&
      homeEndMinutes < uberStopMinutes
    ) {
      setError("Home/end time cannot be earlier than Uber stop time.");
      return;
    }

    if (newRecord.wallet_balance !== null && newRecord.wallet_balance < 0) {
      setError("Wallet balance cannot be negative.");
      return;
    }

    setIsSubmitting(true);

    try {
      const url = editingDate
        ? `${API_BASE_URL}/api/daily/${editingDate}`
        : `${API_BASE_URL}/api/daily`;

      const method = editingDate ? "PUT" : "POST";

      const response = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(newRecord),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || "Failed to save daily record.");
      }

      const savedRecord = await response.json();

      setFormData(emptyForm);
      setShowAdvancedTracking(false);
      setIsFormOpen(false);
      setSelectedRecordDate(savedRecord.date);

      const savedRecordWeekStart = getWeekStart(savedRecord.date);
      setSelectedWeekStart(formatDateForInput(savedRecordWeekStart));

      if (editingDate) {
        setEditingDate(null);
        setSuccessMessage("Daily record updated.");
      } else {
        setSuccessMessage("Daily record added.");
      }

      await fetchDashboardData();
    } catch (err) {
      setError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleDelete(date) {
    const confirmed = window.confirm(`Delete record for ${date}?`);

    if (!confirmed) {
      return;
    }

    setError("");
    setSuccessMessage("");

    try {
      const response = await fetch(`${API_BASE_URL}/api/daily/${date}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || "Failed to delete daily record.");
      }

      if (selectedRecordDate === date) {
        setSelectedRecordDate(null);
      }

      if (editingDate === date) {
        setEditingDate(null);
        setFormData(emptyForm);
        setShowAdvancedTracking(false);
      }

      setSuccessMessage("Daily record deleted.");
      await fetchDashboardData();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <main className="app">
      <section className="hero">
        <p className="eyebrow">Uber Dashboard v2.1</p>
        <h1>Uber Nest Tracker</h1>
        <p className="subtitle">
          Track earnings, mileage truth, real time, and daily Uber efficiency.
        </p>
      </section>

      {error && <p className="error">Error: {error}</p>}
      {successMessage && <p className="success">{successMessage}</p>}

      {summary ? (
        <section className="summary-grid">
          <div className="card card-featured">
            <p>Wallet balance</p>
            {summary.current_wallet_balance !== null ? (
              <>
                <h2>${summary.current_wallet_balance.toFixed(2)}</h2>
                <span className="card-caption">
                  as of {formatShortDate(new Date(`${summary.current_wallet_as_of}T00:00:00`))}
                </span>
              </>
            ) : (
              <>
                <h2>—</h2>
                <span className="card-caption">Not logged yet</span>
              </>
            )}
          </div>

          <div className="card">
            <p>Total earnings</p>
            <h2>${summary.total_earnings.toFixed(2)}</h2>
          </div>

          <div className="card">
            <p>Total trips</p>
            <h2>{summary.total_trips}</h2>
          </div>

          <div className="card">
            <p>Online hours</p>
            <h2>{summary.online_hours.toFixed(2)}</h2>
          </div>

          <div className="card">
            <p>Avg hourly</p>
            <h2>${summary.avg_hourly.toFixed(2)}</h2>
          </div>

          <div className="card">
            <p>Avg per trip</p>
            <h2>${summary.avg_per_trip.toFixed(2)}</h2>
          </div>
        </section>
      ) : (
        <p>Loading summary...</p>
      )}

      {weeklyChartData.length > 0 && (
        <section className="chart-section">
          <div className="weekly-chart-top">
            <div>
              <div className="week-nav-group">
                <p className="eyebrow">
                  {selectedRecordIsInVisibleWeek ? "Selected day" : "Weekly earnings"}
                </p>

                <div className="week-nav">
                  <button type="button" onClick={() => changeWeek(-7)}>
                    ←
                  </button>

                  <h2>
                    {selectedRecordIsInVisibleWeek
                      ? formatRecordDate(selectedRecord.date)
                      : weekStartDate && weekEndDate
                        ? `${formatShortDate(weekStartDate)} - ${formatShortDate(weekEndDate)}`
                        : "Current week"}
                  </h2>

                  <button type="button" onClick={() => changeWeek(7)}>
                    →
                  </button>
                </div>
              </div>

              <div className="week-jump-controls">
                <button type="button" className="latest-week-button" onClick={goToLatestWeek}>
                  Latest week
                </button>

                <input
                  type="date"
                  className="week-jump-date"
                  aria-label="Jump to week containing date"
                  value={selectedWeekStart || ""}
                  onChange={(event) => jumpToDate(event.target.value)}
                />

                {weeks.length > 0 && (
                  <select
                    className="week-jump-select"
                    aria-label="Jump to a recent week"
                    value={selectedWeekStart || ""}
                    onChange={(event) => jumpToWeekStart(event.target.value)}
                  >
                    <option value="" disabled>
                      Jump to week…
                    </option>
                    {weeks.map((week) => (
                      <option key={week.week_start} value={week.week_start}>
                        {formatWeekRangeLabel(week.week_start, week.week_end)} · $
                        {week.total_earnings.toFixed(2)}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            </div>

            <div className="weekly-total">
              <p>{selectedRecordIsInVisibleWeek ? "Day total" : "Week total"}</p>
              <h3>
                $
                {selectedRecordIsInVisibleWeek
                  ? selectedRecord.total_earnings.toFixed(2)
                  : weeklyTotalEarnings.toFixed(2)}
              </h3>
            </div>
          </div>

          <div className="weekly-bars">
            {weeklyChartData.map((day) => {
              const barHeight =
                maxWeeklyEarnings > 0
                  ? (day.earnings / maxWeeklyEarnings) * 100
                  : 0;

              return (
                <button
                  type="button"
                  className={`weekly-bar-item ${
                    selectedRecord?.date === day.date ? "selected-weekly-bar" : ""
                  } ${day.hasRecord ? "clickable-weekly-bar" : ""}`}
                  key={day.date}
                  onClick={() => handleWeeklyBarClick(day)}
                  disabled={!day.hasRecord}
                >
                  <div className="weekly-bar-value">
                    {day.earnings > 0 ? `$${day.earnings.toFixed(0)}` : ""}
                  </div>

                  <div className="weekly-bar-track">
                    <div
                      className={`weekly-bar-fill ${
                        day.earnings === 0 ? "empty-bar" : ""
                      }`}
                      style={{ height: `${barHeight}%` }}
                    ></div>
                  </div>

                  <div className="weekly-day-label">{day.shortDate}</div>
                  <div className="weekly-weekday-label">{day.dayLabel}</div>
                </button>
              );
            })}
          </div>

          <div className="weekly-stats">
            <div>
              <p>Online</p>
              <strong>
                {selectedRecordIsInVisibleWeek
                  ? formatHoursAndMinutes(selectedRecord.online_hours)
                  : formatHoursAndMinutes(weeklyTotalHours)}
              </strong>
            </div>

            <div>
              <p>Real work</p>
              <strong>
                {selectedRecordIsInVisibleWeek
                  ? formatOptionalHours(selectedRecord.real_work_hours)
                  : weeklyRealWorkHours > 0
                    ? formatHoursAndMinutes(weeklyRealWorkHours)
                    : "—"}
              </strong>
            </div>

            <div>
              <p>Trips</p>
              <strong>
                {selectedRecordIsInVisibleWeek
                  ? selectedRecord.trips
                  : weeklyTotalTrips}
              </strong>
            </div>

            <div>
              <p>Online $/hr</p>
              <strong>
                $
                {selectedRecordIsInVisibleWeek
                  ? selectedRecord.avg_hourly.toFixed(2)
                  : weeklyAverageHourly.toFixed(2)}
              </strong>
            </div>

            <div>
              <p>Real $/hr</p>
              <strong>
                {selectedRecordIsInVisibleWeek
                  ? formatOptionalCurrency(selectedRecord.earnings_per_real_work_hour)
                  : formatOptionalCurrency(weeklyEarningsPerRealHour)}
              </strong>
            </div>
          </div>

          <div className="weekly-breakdown-stats">
            <div>
              <p>Net fare</p>
              <strong>
                $
                {selectedRecordIsInVisibleWeek
                  ? selectedRecord.net_fare.toFixed(2)
                  : weeklyNetFare.toFixed(2)}
              </strong>
              <span>
                {selectedRecordIsInVisibleWeek
                  ? formatPercent(selectedRecord.fare_share)
                  : formatPercent(weeklyFareShare)}
              </span>
            </div>

            <div>
              <p>Tips</p>
              <strong>
                $
                {selectedRecordIsInVisibleWeek
                  ? selectedRecord.tips.toFixed(2)
                  : weeklyTips.toFixed(2)}
              </strong>
              <span>
                {selectedRecordIsInVisibleWeek
                  ? formatPercent(selectedRecord.tip_share)
                  : formatPercent(weeklyTipShare)}
              </span>
            </div>

            <div>
              <p>Promotions</p>
              <strong>
                $
                {selectedRecordIsInVisibleWeek
                  ? selectedRecord.promotions.toFixed(2)
                  : weeklyPromotions.toFixed(2)}
              </strong>
              <span>
                {selectedRecordIsInVisibleWeek
                  ? formatPercent(selectedRecord.promo_share)
                  : formatPercent(weeklyPromoShare)}
              </span>
            </div>

            <div>
              <p>Work miles</p>
              <strong>
                {selectedRecordIsInVisibleWeek
                  ? formatOptionalNumber(selectedRecord.work_miles)
                  : weeklyWorkMiles > 0
                    ? weeklyWorkMiles.toFixed(1)
                    : "—"}
              </strong>
            </div>

            <div>
              <p>$/work mile</p>
              <strong>
                {selectedRecordIsInVisibleWeek
                  ? formatOptionalCurrency(selectedRecord.earnings_per_work_mile)
                  : formatOptionalCurrency(weeklyEarningsPerWorkMile)}
              </strong>
            </div>

            <div>
              <p>Miles/trip</p>
              <strong>
                {selectedRecordIsInVisibleWeek
                  ? formatOptionalNumber(selectedRecord.miles_per_trip)
                  : weeklyTotalTrips > 0 && weeklyWorkMiles > 0
                    ? (weeklyWorkMiles / weeklyTotalTrips).toFixed(1)
                    : "—"}
              </strong>
            </div>

            <div>
              <p>Wallet Δ</p>
              <strong className="wallet-delta-text">
                {selectedRecordIsInVisibleWeek
                  ? (selectedRecord.wallet_delta !== null
                      ? `${selectedRecord.wallet_delta >= 0 ? "+" : "−"}$${Math.abs(selectedRecord.wallet_delta).toFixed(2)}`
                      : "—")
                  : (currentWeekData && currentWeekData.wallet_delta !== null
                      ? `${currentWeekData.wallet_delta >= 0 ? "+" : "−"}$${Math.abs(currentWeekData.wallet_delta).toFixed(2)}`
                      : "—")}
              </strong>
              <span className="wallet-delta-subtext">
                {selectedRecordIsInVisibleWeek
                  ? (selectedRecord.wallet_delta !== null
                      ? (selectedRecord.wallet_delta_days_ago === 0
                          ? "same day logged"
                          : selectedRecord.wallet_delta_days_ago === 1
                            ? "vs 1 day ago"
                            : `vs ${selectedRecord.wallet_delta_days_ago} days ago`)
                      : "")
                  : (currentWeekData && currentWeekData.wallet_delta !== null
                      ? `${formatShortDate(new Date(`${currentWeekData.wallet_delta_start_date}T00:00:00`))} → ${formatShortDate(new Date(`${currentWeekData.wallet_delta_end_date}T00:00:00`))}`
                      : "")}
              </span>
            </div>
          </div>

          {selectedRecordIsInVisibleWeek && (
            <div className="selected-day-extra">
              <div className="selected-day-footer-top">
                <div className="label-row">
                  <span className={`label-chip label-${getLabelVariant(selectedRecord.hourly_label)}`}>
                    {selectedRecord.hourly_label}
                  </span>
                  <span className={`label-chip label-${getLabelVariant(selectedRecord.promo_label)}`}>
                    {selectedRecord.promo_label}
                  </span>
                  <span className={`label-chip label-${getLabelVariant(selectedRecord.tip_label)}`}>
                    {selectedRecord.tip_label}
                  </span>
                  <span className={`label-chip label-${getLabelVariant(selectedRecord.mileage_label)}`}>
                    {selectedRecord.mileage_label}
                  </span>
                </div>

                <p>
                  <strong>Wallet:</strong>{" "}
                  {selectedRecord.wallet_balance !== null
                    ? `$${selectedRecord.wallet_balance.toFixed(2)}`
                    : "Not logged"}
                  {formatWalletDelta(selectedRecord.wallet_delta, selectedRecord.wallet_delta_days_ago) && (
                    <span className="wallet-delta-inline">
                      {" "}
                      ({formatWalletDelta(selectedRecord.wallet_delta, selectedRecord.wallet_delta_days_ago)})
                    </span>
                  )}
                </p>
              </div>

              {selectedRecord.notes && (
                <div className="recap-notes">
                  <strong>Notes:</strong>
                  <p>{selectedRecord.notes}</p>
                </div>
              )}
            </div>
          )}
        </section>
      )}

      {weeklyChartData.length === 0 && (
        <section className="empty-card">
          <p className="eyebrow">Weekly earnings</p>
          <h2>No weekly data yet</h2>
          <p>Add a daily log to build your first weekly earnings chart.</p>
        </section>
      )}


      <section className="table-section">
        <div className="table-section-header">
          <h2>Daily logs</h2>

          <div className="table-header-actions">
            {!isFormOpen && !editingDate && (
              <button
                type="button"
                className="primary-button"
                onClick={() => {
                  setIsFormOpen(true);
                  setError("");
                  setSuccessMessage("");
                }}
              >
                + Add daily log
              </button>
            )}

            {isFormOpen && !editingDate && (
              <button
                type="button"
                className="cancel-edit-button"
                onClick={() => {
                  setIsFormOpen(false);
                  setFormData(emptyForm);
                  setShowAdvancedTracking(false);
                  setError("");
                  setSuccessMessage("");
                }}
              >
                Cancel
              </button>
            )}

            {dailyRecords.length > 0 && (
              <a
                className="export-csv-button"
                href={`${API_BASE_URL}/api/daily/csv`}
              >
                Export CSV
              </a>
            )}
          </div>
        </div>

      {(isFormOpen || editingDate) && (
      <section className="form-section">
        <div className="form-section-header">
          <h2>{editingDate ? `Edit daily log: ${editingDate}` : "Add daily log"}</h2>
        </div>

        <form onSubmit={handleSubmit} className="entry-form">
          <label>
            Date
            <input
              type="date"
              name="date"
              value={formData.date}
              onChange={handleInputChange}
              required
              disabled={editingDate !== null}
            />
          </label>

          <label>
            Online hours
            <input
              type="number"
              name="online_hours"
              value={formData.online_hours}
              onChange={handleInputChange}
              step="0.01"
              min="0"
              required
            />
          </label>

          <label>
            Trips
            <input
              type="number"
              name="trips"
              value={formData.trips}
              onChange={handleInputChange}
              min="0"
              required
            />
          </label>

          <label>
            Net fare
            <input
              type="number"
              name="net_fare"
              value={formData.net_fare}
              onChange={handleInputChange}
              step="0.01"
              min="0"
              required
            />
          </label>

          <label>
            Promotions
            <input
              type="number"
              name="promotions"
              value={formData.promotions}
              onChange={handleInputChange}
              step="0.01"
              min="0"
            />
          </label>

          <label>
            Tips
            <input
              type="number"
              name="tips"
              value={formData.tips}
              onChange={handleInputChange}
              step="0.01"
              min="0"
              required
            />
          </label>

          <label>
            Wallet balance optional
            <input
              type="number"
              name="wallet_balance"
              value={formData.wallet_balance}
              onChange={handleInputChange}
              step="0.01"
              min="0"
            />
          </label>

          <label className="notes-field">
            Notes optional
            <textarea
              name="notes"
              value={formData.notes}
              onChange={handleInputChange}
              rows="2"
            />
          </label>

          <button
            type="button"
            className="advanced-toggle-button"
            onClick={() => setShowAdvancedTracking((currentValue) => !currentValue)}
          >
            {showAdvancedTracking ? "Hide advanced tracking" : "Show advanced tracking"}
          </button>

          {showAdvancedTracking && (
            <div className="advanced-tracking-panel">
              <div className="advanced-section-heading">
                <h3>Mileage tracking</h3>
                <p>
                  Use odometer readings to calculate work miles, return miles, and
                  earnings per mile.
                </p>
              </div>

              <label>
                Start odometer
                <input
                  type="number"
                  name="start_odometer"
                  value={formData.start_odometer}
                  onChange={handleInputChange}
                  step="0.1"
                  min="0"
                />
              </label>

              <label>
                End Uber/work odometer
                <input
                  type="number"
                  name="end_work_odometer"
                  value={formData.end_work_odometer}
                  onChange={handleInputChange}
                  step="0.1"
                  min="0"
                />
              </label>

              <label>
                End home odometer optional
                <input
                  type="number"
                  name="end_home_odometer"
                  value={formData.end_home_odometer}
                  onChange={handleInputChange}
                  step="0.1"
                  min="0"
                />
              </label>

              <div className="advanced-section-heading">
                <h3>Time tracking</h3>
                <p>
                  Use normal time plus AM/PM. This version assumes same-day shifts.
                </p>
              </div>

              <label>
                Work start time
                <div className="time-input-row">
                  <input
                    type="text"
                    name="work_start_time_value"
                    value={formData.work_start_time_value}
                    onChange={handleInputChange}
                    placeholder="5:30"
                  />
                  <select
                    name="work_start_time_meridiem"
                    value={formData.work_start_time_meridiem}
                    onChange={handleInputChange}
                  >
                    <option value="AM">AM</option>
                    <option value="PM">PM</option>
                  </select>
                </div>
              </label>

              <label>
                Uber stop time
                <div className="time-input-row">
                  <input
                    type="text"
                    name="uber_stop_time_value"
                    value={formData.uber_stop_time_value}
                    onChange={handleInputChange}
                    placeholder="9:45"
                  />
                  <select
                    name="uber_stop_time_meridiem"
                    value={formData.uber_stop_time_meridiem}
                    onChange={handleInputChange}
                  >
                    <option value="AM">AM</option>
                    <option value="PM">PM</option>
                  </select>
                </div>
              </label>

              <label>
                Home/end time optional
                <div className="time-input-row">
                  <input
                    type="text"
                    name="home_end_time_value"
                    value={formData.home_end_time_value}
                    onChange={handleInputChange}
                    placeholder="10:15"
                  />
                  <select
                    name="home_end_time_meridiem"
                    value={formData.home_end_time_meridiem}
                    onChange={handleInputChange}
                  >
                    <option value="AM">AM</option>
                    <option value="PM">PM</option>
                  </select>
                </div>
              </label>
            </div>
          )}

          <button type="submit" className="primary-button" disabled={isSubmitting}>
            {isSubmitting ? "Saving..." : editingDate ? "Update log" : "Add log"}
          </button>

          {editingDate && (
            <button type="button" className="cancel-edit-button" onClick={cancelEdit}>
              Cancel edit
            </button>
          )}
        </form>
      </section>
      )}

        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Total</th>
              <th>Online $/hr</th>
              <th>Trips</th>
              <th>$/mile</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>

          <tbody>
            {dailyRecords.length === 0 ? (
              <tr>
                <td colSpan="7" className="empty-table-cell">
                  No daily logs yet.
                </td>
              </tr>
            ) : (
              dailyRecords.map((record) => (
                <tr
                  key={record.date}
                  className={selectedRecord?.date === record.date ? "selected-row" : ""}
                >
                  <td>{record.date.slice(5)}</td>
                  <td>${record.total_earnings.toFixed(2)}</td>
                  <td>${record.avg_hourly.toFixed(2)}</td>
                  <td>{record.trips}</td>
                  <td>
                    {record.earnings_per_work_mile !== null
                      ? `$${record.earnings_per_work_mile.toFixed(2)}`
                      : record.earnings_per_mile !== null
                        ? `$${record.earnings_per_mile.toFixed(2)}`
                        : "—"}
                  </td>
                  <td>
                    <div className="table-labels">
                      <span className={`label-chip label-${getLabelVariant(record.hourly_label)}`}>
                        {record.hourly_label}
                      </span>
                      <span className={`label-chip label-${getLabelVariant(record.promo_label)}`}>
                        {record.promo_label}
                      </span>
                      <span className={`label-chip label-${getLabelVariant(record.mileage_label)}`}>
                        {record.mileage_label}
                      </span>
                    </div>
                  </td>
                  <td>
                    <div className="table-actions">
                      <button
                        type="button"
                        className="view-button"
                        onClick={() => {
                          if (selectedRecordDate === record.date) {
                            setSelectedRecordDate(null);
                          } else {
                            selectRecordAndWeek(record.date);
                          }
                        }}
                      >
                        {selectedRecordDate === record.date ? "Hide" : "View"}
                      </button>

                      <button
                        type="button"
                        className="edit-button"
                        onClick={() => handleEdit(record)}
                      >
                        Edit
                      </button>

                      <button
                        type="button"
                        className="delete-button"
                        onClick={() => handleDelete(record.date)}
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>
    </main>
  );
}

export default App;