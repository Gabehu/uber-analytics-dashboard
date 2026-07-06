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

  const weeklyChartData = latestRecord
    ? (() => {
        const weekStart = getWeekStart(latestRecord.date);

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
          };
        });
      })()
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
      promotions: Number(formData.promotions),
      miles_driven: optionalNumber(formData.miles_driven),
      wallet_balance: optionalNumber(formData.wallet_balance),
      notes: optionalText(formData.notes),
    };

    try {
      const response = await fetch(`${API_BASE_URL}/api/daily`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(newRecord),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || "Failed to create daily record.");
      }

      setFormData(emptyForm);
      setSuccessMessage("Daily record added.");
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

      {latestRecord && (
        <section className="recap-card">
          <div className="recap-header">
            <div>
              <p className="eyebrow">Latest day recap</p>
              <h2>{latestRecord.date}</h2>
            </div>

            <div className="label-row">
              <span>{latestRecord.hourly_label}</span>
              <span>{latestRecord.promo_label}</span>
              <span>{latestRecord.tip_label}</span>
              <span>{latestRecord.mileage_label}</span>
            </div>
          </div>

          <div className="recap-grid">
            <div className="mini-card">
              <p>Total</p>
              <h3>${latestRecord.total_earnings.toFixed(2)}</h3>
            </div>

            <div className="mini-card">
              <p>$/hr</p>
              <h3>${latestRecord.avg_hourly.toFixed(2)}</h3>
            </div>

            <div className="mini-card">
              <p>$/trip</p>
              <h3>${latestRecord.avg_per_trip.toFixed(2)}</h3>
            </div>

            <div className="mini-card">
              <p>$/mile</p>
              <h3>
                {latestRecord.earnings_per_mile !== null
                  ? `$${latestRecord.earnings_per_mile.toFixed(2)}`
                  : "—"}
              </h3>
            </div>
          </div>

          <div className="breakdown-grid">
            <div>
              <p>Fare</p>
              <strong>${latestRecord.net_fare.toFixed(2)}</strong>
              <span>{formatPercent(latestRecord.fare_share)}</span>
            </div>

            <div>
              <p>Tips</p>
              <strong>${latestRecord.tips.toFixed(2)}</strong>
              <span>{formatPercent(latestRecord.tip_share)}</span>
            </div>

            <div>
              <p>Promos</p>
              <strong>${latestRecord.promotions.toFixed(2)}</strong>
              <span>{formatPercent(latestRecord.promo_share)}</span>
            </div>
          </div>

          <div className="recap-details">
            <p>
              <strong>Online hours:</strong>{" "}
              {latestRecord.online_hours.toFixed(2)}
            </p>

            <p>
              <strong>Trips:</strong> {latestRecord.trips}
            </p>

            <p>
              <strong>Miles:</strong>{" "}
              {latestRecord.miles_driven !== null
                ? latestRecord.miles_driven.toFixed(1)
                : "Not logged"}
            </p>

            <p>
              <strong>Wallet:</strong>{" "}
              {latestRecord.wallet_balance !== null
                ? `$${latestRecord.wallet_balance.toFixed(2)}`
                : "Not logged"}
            </p>
          </div>

          {latestRecord.notes && (
            <div className="recap-notes">
              <strong>Notes:</strong>
              <p>{latestRecord.notes}</p>
            </div>
          )}
        </section>
      )}

      {weeklyChartData.length > 0 && (
        <section className="chart-section">
          <div className="weekly-chart-top">
            <div>
              <p className="eyebrow">Weekly earnings</p>
              <h2>
                {weekStartDate && weekEndDate
                  ? `${formatShortDate(weekStartDate)} - ${formatShortDate(weekEndDate)}`
                  : "Current week"}
              </h2>
            </div>

            <div className="weekly-total">
              <p>Total</p>
              <h3>${weeklyTotalEarnings.toFixed(2)}</h3>
            </div>
          </div>

          <div className="weekly-bars">
            {weeklyChartData.map((day) => {
              const barHeight =
                maxWeeklyEarnings > 0
                  ? (day.earnings / maxWeeklyEarnings) * 100
                  : 0;

              return (
                <div className="weekly-bar-item" key={day.date}>
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
                </div>
              );
            })}
          </div>

          <div className="weekly-stats">
            <div>
              <p>Online</p>
              <strong>{formatHoursAndMinutes(weeklyTotalHours)}</strong>
            </div>

            <div>
              <p>Trips</p>
              <strong>{weeklyTotalTrips}</strong>
            </div>

            <div>
              <p>Avg hourly</p>
              <strong>${weeklyAverageHourly.toFixed(2)}</strong>
            </div>

            <div>
              <p>Avg/trip</p>
              <strong>${weeklyAveragePerTrip.toFixed(2)}</strong>
            </div>
          </div>

          <div className="weekly-breakdown-stats">
            <div>
              <p>Net fare</p>
              <strong>${weeklyNetFare.toFixed(2)}</strong>
              <span>{formatPercent(weeklyFareShare)}</span>
            </div>

            <div>
              <p>Tips</p>
              <strong>${weeklyTips.toFixed(2)}</strong>
              <span>{formatPercent(weeklyTipShare)}</span>
            </div>

            <div>
              <p>Promotions</p>
              <strong>${weeklyPromotions.toFixed(2)}</strong>
              <span>{formatPercent(weeklyPromoShare)}</span>
            </div>

            <div>
              <p>Miles</p>
              <strong>{weeklyMiles > 0 ? weeklyMiles.toFixed(1) : "—"}</strong>
            </div>

            <div>
              <p>$/mile</p>
              <strong>
                {weeklyEarningsPerMile !== null
                  ? `$${weeklyEarningsPerMile.toFixed(2)}`
                  : "—"}
              </strong>
            </div>
          </div>
        </section>
      )}

      <section className="form-section">
        <h2>Add daily log</h2>

        <form onSubmit={handleSubmit} className="entry-form">
          <label>
            Date
            <input
              type="date"
              name="date"
              value={formData.date}
              onChange={handleInputChange}
              required
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
            Promotions
            <input
              type="number"
              name="promotions"
              value={formData.promotions}
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

          <button type="submit">Add log</button>
        </form>
      </section>

      <section className="table-section">
        <h2>Daily logs</h2>

        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Total</th>
              <th>Fare</th>
              <th>Tips</th>
              <th>Promos</th>
              <th>Hours</th>
              <th>Trips</th>
              <th>$/hr</th>
              <th>$/trip</th>
              <th>Miles</th>
              <th>$/mile</th>
              <th>Wallet</th>
              <th>Actions</th>
            </tr>
          </thead>

          <tbody>
            {dailyRecords.map((record) => (
              <tr key={record.date}>
                <td>{record.date}</td>
                <td>${record.total_earnings.toFixed(2)}</td>
                <td>${record.net_fare.toFixed(2)}</td>
                <td>${record.tips.toFixed(2)}</td>
                <td>${record.promotions.toFixed(2)}</td>
                <td>{record.online_hours.toFixed(2)}</td>
                <td>{record.trips}</td>
                <td>${record.avg_hourly.toFixed(2)}</td>
                <td>${record.avg_per_trip.toFixed(2)}</td>
                <td>
                  {record.miles_driven !== null
                    ? record.miles_driven.toFixed(1)
                    : "—"}
                </td>
                <td>
                  {record.earnings_per_mile !== null
                    ? `$${record.earnings_per_mile.toFixed(2)}`
                    : "—"}
                </td>
                <td>
                  {record.wallet_balance !== null
                    ? `$${record.wallet_balance.toFixed(2)}`
                    : "—"}
                </td>
                <td>
                  <button
                    type="button"
                    className="delete-button"
                    onClick={() => handleDelete(record.date)}
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  );
}

export default App;