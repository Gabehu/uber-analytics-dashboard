import { useEffect, useState } from "react";
import "./App.css";

const API_BASE_URL = "http://127.0.0.1:8000";

const emptyForm = {
  date: "",
  online_hours: "",
  trips: "",
  net_fare: "",
  tips: "",
  promotions: "",
  miles_driven: "",
  wallet_balance: "",
  notes: "",
};

function App() {
  const [summary, setSummary] = useState(null);
  const [dailyRecords, setDailyRecords] = useState([]);
  const latestRecord = dailyRecords.length > 0 ? dailyRecords[0] : null;
  const [selectedRecordDate, setSelectedRecordDate] = useState(null);
  const selectedRecord =
    dailyRecords.find((record) => record.date === selectedRecordDate) || null;
  const [selectedWeekStart, setSelectedWeekStart] = useState(null);

  function getWeekStart(dateString) {
    const date = new Date(`${dateString}T00:00:00`);
    const day = date.getDay(); // Sunday = 0, Monday = 1
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

  function formatHoursAndMinutes(hours) {
    const totalMinutes = Math.round(hours * 60);
    const wholeHours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;

    if (wholeHours === 0) {
      return `${minutes}m`;
    }

    return `${wholeHours}h ${minutes}m`;
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

  const weeklyTotalEarnings = weeklyChartData.reduce(
    (total, day) => total + day.earnings,
    0
  );

  const selectedRecordIsInVisibleWeek =
    selectedRecord &&
    weeklyChartData.some((day) => day.date === selectedRecord.date);

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

  const weeklyRecords = latestRecord
  ? dailyRecords.filter((record) =>
      weeklyChartData.some((day) => day.date === record.date)
    )
  : [];

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

  const weeklyAveragePerTrip =
    weeklyTotalTrips > 0 ? weeklyTotalEarnings / weeklyTotalTrips : 0;

  const weeklyMiles = weeklyRecords.reduce((total, record) => {
    if (record.miles_driven === null) {
      return total;
    }

    return total + record.miles_driven;
  }, 0);

  const weeklyEarningsPerMile =
    weeklyMiles > 0 ? weeklyTotalEarnings / weeklyMiles : null;

  const maxWeeklyEarnings =
    weeklyChartData.length > 0
      ? Math.max(...weeklyChartData.map((day) => day.earnings))
      : 0;

  const weekStartDate =
    weeklyChartData.length > 0 ? new Date(`${weeklyChartData[0].date}T00:00:00`) : null;

  const weekEndDate =
    weeklyChartData.length > 0 ? new Date(`${weeklyChartData[6].date}T00:00:00`) : null;
  const [formData, setFormData] = useState(emptyForm);
  const [editingDate, setEditingDate] = useState(null);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  function formatPercent(value) {
    return `${(value * 100).toFixed(1)}%`;
  }

  async function fetchDashboardData() {
    try {
      setError("");

      const summaryResponse = await fetch(`${API_BASE_URL}/api/summary`);
      const dailyResponse = await fetch(`${API_BASE_URL}/api/daily`);

      if (!summaryResponse.ok || !dailyResponse.ok) {
        throw new Error("Failed to fetch dashboard data.");
      }

      const summaryData = await summaryResponse.json();
      const dailyData = await dailyResponse.json();

      setSummary(summaryData);
      setDailyRecords(dailyData);
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

  function selectRecordAndWeek(date) {
    setSelectedRecordDate(date);

    const recordWeekStart = getWeekStart(date);
    setSelectedWeekStart(formatDateForInput(recordWeekStart));
  }

  function handleEdit(record) {
    setEditingDate(record.date);
    selectRecordAndWeek(record.date);

    setFormData({
      date: record.date,
      online_hours: String(record.online_hours),
      trips: String(record.trips),
      net_fare: String(record.net_fare),
      tips: String(record.tips),
      promotions: String(record.promotions),
      miles_driven:
        record.miles_driven !== null ? String(record.miles_driven) : "",
      wallet_balance:
        record.wallet_balance !== null ? String(record.wallet_balance) : "",
      notes: record.notes || "",
    });

    setError("");
    setSuccessMessage("");
  }

  function cancelEdit() {
    setEditingDate(null);
    setFormData(emptyForm);
    setError("");
    setSuccessMessage("");
  }

  async function handleSubmit(event) {
    event.preventDefault();

    setError("");
    setSuccessMessage("");

    const newRecord = {
      date: formData.date,
      online_hours: Number(formData.online_hours),
      trips: Number(formData.trips),
      net_fare: Number(formData.net_fare),
      tips: Number(formData.tips),
      promotions: formData.promotions === "" ? 0 : Number(formData.promotions),
      miles_driven: optionalNumber(formData.miles_driven),
      wallet_balance: optionalNumber(formData.wallet_balance),
      notes: optionalText(formData.notes),
    };

    if (!editingDate && dailyRecords.some((record) => record.date === newRecord.date)) {
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

    if (newRecord.net_fare < 0 || newRecord.tips < 0 || newRecord.promotions < 0) {
      setError("Fare, tips, and promotions cannot be negative.");
      return;
    }

    if (newRecord.miles_driven !== null && newRecord.miles_driven < 0) {
      setError("Miles driven cannot be negative.");
      return;
    }

    if (newRecord.wallet_balance !== null && newRecord.wallet_balance < 0) {
      setError("Wallet balance cannot be negative.");
      return;
    }

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
        throw new Error(errorData.detail || "Failed to create daily record.");
      }

      const savedRecord = await response.json();

      setFormData(emptyForm);
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
        <p className="eyebrow">Uber Dashboard v2</p>
        <h1>Uber Nest Tracker</h1>
        <p className="subtitle">
          Track earnings, breakdowns, mileage, and daily Uber efficiency.
        </p>
      </section>

      {error && <p className="error">Error: {error}</p>}
      {successMessage && <p className="success">{successMessage}</p>}

      {summary ? (
        <section className="summary-grid">
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
              <p className="eyebrow">
                {selectedRecordIsInVisibleWeek ? "Selected day" : "Weekly earnings"}
              </p>

              <div className="week-nav">
                <button type="button" onClick={() => changeWeek(-7)}>
                  ←
                </button>

                <h2>
                  {selectedRecordIsInVisibleWeek
                    ? selectedRecord.date
                    : weekStartDate && weekEndDate
                      ? `${formatShortDate(weekStartDate)} - ${formatShortDate(weekEndDate)}`
                      : "Current week"}
                </h2>

                <button type="button" onClick={() => changeWeek(7)}>
                  →
                </button>
              </div>

              <button type="button" className="latest-week-button" onClick={goToLatestWeek}>
                Latest week
              </button>
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
              <p>Trips</p>
              <strong>
                {selectedRecordIsInVisibleWeek
                  ? selectedRecord.trips
                  : weeklyTotalTrips}
              </strong>
            </div>

            <div>
              <p>Avg hourly</p>
              <strong>
                $
                {selectedRecordIsInVisibleWeek
                  ? selectedRecord.avg_hourly.toFixed(2)
                  : weeklyAverageHourly.toFixed(2)}
              </strong>
            </div>

            <div>
              <p>Avg/trip</p>
              <strong>
                $
                {selectedRecordIsInVisibleWeek
                  ? selectedRecord.avg_per_trip.toFixed(2)
                  : weeklyAveragePerTrip.toFixed(2)}
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
              <p>Miles</p>
              <strong>
                {selectedRecordIsInVisibleWeek
                  ? selectedRecord.miles_driven !== null
                    ? selectedRecord.miles_driven.toFixed(1)
                    : "—"
                  : weeklyMiles > 0
                    ? weeklyMiles.toFixed(1)
                    : "—"}
              </strong>
            </div>

            <div>
              <p>$/mile</p>
              <strong>
                {selectedRecordIsInVisibleWeek
                  ? selectedRecord.earnings_per_mile !== null
                    ? `$${selectedRecord.earnings_per_mile.toFixed(2)}`
                    : "—"
                  : weeklyEarningsPerMile !== null
                    ? `$${weeklyEarningsPerMile.toFixed(2)}`
                    : "—"}
              </strong>
            </div>
          </div>

          {selectedRecordIsInVisibleWeek && (
            <div className="selected-day-extra">
              <div className="selected-day-footer-top">
                <div className="label-row">
                  <span>{selectedRecord.hourly_label}</span>
                  <span>{selectedRecord.promo_label}</span>
                  <span>{selectedRecord.tip_label}</span>
                  <span>{selectedRecord.mileage_label}</span>
                </div>

                <p>
                  <strong>Wallet:</strong>{" "}
                  {selectedRecord.wallet_balance !== null
                    ? `$${selectedRecord.wallet_balance.toFixed(2)}`
                    : "Not logged"}
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

      <section className="form-section">
        <h2>{editingDate ? `Edit daily log: ${editingDate}` : "Add daily log"}</h2>

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
            Miles driven optional
            <input
              type="number"
              name="miles_driven"
              value={formData.miles_driven}
              onChange={handleInputChange}
              step="0.1"
              min="0"
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
              rows="3"
            />
          </label>

          <button type="submit">{editingDate ? "Update log" : "Add log"}</button>

          {editingDate && (
            <button type="button" className="cancel-edit-button" onClick={cancelEdit}>
              Cancel edit
            </button>
          )}
        </form>
      </section>

      <section className="table-section">
        <h2>Daily logs</h2>

        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Total</th>
              <th>$/hr</th>
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
                    {record.earnings_per_mile !== null
                      ? `$${record.earnings_per_mile.toFixed(2)}`
                      : "—"}
                  </td>
                  <td>
                    <div className="table-labels">
                      <span>{record.hourly_label}</span>
                      <span>{record.promo_label}</span>
                      <span>{record.mileage_label}</span>
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