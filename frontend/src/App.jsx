import { Component, useEffect, useRef, useState } from "react";
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

function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3);
}

const ANIMATED_NUMBER_DURATION_MS = 600;
const ANIMATED_NUMBER_FLASH_MS = 800;

// Counts smoothly from its previous value to a new one whenever `value`
// changes, and briefly flashes green (increase) or red (decrease) based on
// the direction of that change -- purely a "this number just moved" visual,
// not a judgment about whether the change itself was good or bad (e.g. a
// wallet balance dropping could be a cash-out, not a loss). Skips the
// animation entirely on first mount so numbers don't count up from zero
// when the page first loads.
function AnimatedNumber({ value, format }) {
  const [displayValue, setDisplayValue] = useState(value);
  const [flashClass, setFlashClass] = useState("");

  const previousValueRef = useRef(value);
  const hasMountedRef = useRef(false);
  const animationFrameRef = useRef(null);
  const flashTimeoutRef = useRef(null);

  useEffect(() => {
    if (!hasMountedRef.current) {
      hasMountedRef.current = true;
      previousValueRef.current = value;
      setDisplayValue(value);
      return;
    }

    const startValue = previousValueRef.current;
    const endValue = value;

    if (startValue === endValue) {
      return;
    }

    setFlashClass(endValue > startValue ? "animated-number-up" : "animated-number-down");

    const startTime = performance.now();

    function step(now) {
      const elapsed = now - startTime;
      const t = Math.min(elapsed / ANIMATED_NUMBER_DURATION_MS, 1);
      const eased = easeOutCubic(t);
      setDisplayValue(startValue + (endValue - startValue) * eased);

      if (t < 1) {
        animationFrameRef.current = requestAnimationFrame(step);
      }
    }

    animationFrameRef.current = requestAnimationFrame(step);
    previousValueRef.current = endValue;

    const flashTimeoutId = setTimeout(() => {
      setFlashClass("");
    }, ANIMATED_NUMBER_FLASH_MS);
    flashTimeoutRef.current = flashTimeoutId;

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      if (flashTimeoutRef.current) {
        clearTimeout(flashTimeoutRef.current);
      }
    };
  }, [value]);

  return <span className={`animated-number ${flashClass}`}>{format(displayValue)}</span>;
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
  const [isWeekBrowserOpen, setIsWeekBrowserOpen] = useState(false);

  const formSectionRef = useRef(null);
  const importFileInputRef = useRef(null);
  const [importPreview, setImportPreview] = useState(null);
  const [importCsvText, setImportCsvText] = useState(null);
  const [importResult, setImportResult] = useState(null);
  const [isImporting, setIsImporting] = useState(false);
  const [isDeleteAllOpen, setIsDeleteAllOpen] = useState(false);
  const [deleteAllConfirmText, setDeleteAllConfirmText] = useState("");
  const [isDeletingAll, setIsDeletingAll] = useState(false);

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

  const DONUT_RADIUS = 40;
  const DONUT_CIRCUMFERENCE = 2 * Math.PI * DONUT_RADIUS;

  function buildEarningsDonutArcs(fareShare, tipShare, promoShare) {
    const total = fareShare + tipShare + promoShare;

    if (total <= 0) {
      // No earnings to show a composition for — all arc lengths are zero,
      // so only the neutral gray track circle shows through underneath.
      return { fareLen: 0, tipLen: 0, promoLen: 0 };
    }

    return {
      fareLen: (fareShare / total) * DONUT_CIRCUMFERENCE,
      tipLen: (tipShare / total) * DONUT_CIRCUMFERENCE,
      promoLen: (promoShare / total) * DONUT_CIRCUMFERENCE,
    };
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

  const donutArcs = buildEarningsDonutArcs(
    selectedRecordIsInVisibleWeek ? selectedRecord.fare_share : weeklyFareShare,
    selectedRecordIsInVisibleWeek ? selectedRecord.tip_share : weeklyTipShare,
    selectedRecordIsInVisibleWeek ? selectedRecord.promo_share : weeklyPromoShare
  );

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
    if (!error && !successMessage && !importResult) {
      return;
    }

    const timerId = setTimeout(() => {
      setError("");
      setSuccessMessage("");
      setImportResult(null);
    }, 3000);

    return () => clearTimeout(timerId);
  }, [error, successMessage, importResult]);

  // Deliberately depends on editingDate ONLY, not isFormOpen. Editing a
  // record scrolls the form into view since it can be anywhere in a long
  // table; adding a new one does NOT scroll, since the Add button already
  // opens the form right where you clicked (in the Daily logs header) --
  // scrolling there would just move the page for no reason and, worse,
  // could scroll the Cancel button out of view right after you opened the
  // form. If isFormOpen gets added back to this dependency array "for
  // consistency," that regression comes back too.
  useEffect(() => {
    if (editingDate && formSectionRef.current) {
      formSectionRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [editingDate]);

  useEffect(() => {
    if (!isWeekBrowserOpen) {
      return;
    }

    function handleKeyDown(event) {
      if (event.key === "Escape") {
        setIsWeekBrowserOpen(false);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isWeekBrowserOpen]);

  function handleBrowseWeekSelect(weekStartString) {
    jumpToWeekStart(weekStartString);
    setIsWeekBrowserOpen(false);
  }

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

  function handleImportButtonClick() {
    importFileInputRef.current?.click();
  }

  async function handleImportFileSelected(event) {
    const file = event.target.files && event.target.files[0];

    // Reset the input value so selecting the same file again still fires
    // this handler (browsers won't re-fire onChange for an unchanged value).
    event.target.value = "";

    if (!file) {
      return;
    }

    setError("");
    setSuccessMessage("");
    setImportResult(null);
    setIsImporting(true);

    try {
      const csvText = await file.text();

      const response = await fetch(`${API_BASE_URL}/api/daily/import/preview`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csv_text: csvText }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || "Failed to read that CSV file.");
      }

      const preview = await response.json();
      setImportCsvText(csvText);
      setImportPreview(preview);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsImporting(false);
    }
  }

  function handleCancelImport() {
    setImportPreview(null);
    setImportCsvText(null);
  }

  async function handleConfirmImport() {
    if (!importCsvText) {
      return;
    }

    setIsImporting(true);
    setError("");

    try {
      const response = await fetch(`${API_BASE_URL}/api/daily/import/commit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csv_text: importCsvText }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || "Import failed.");
      }

      const result = await response.json();
      setImportResult(result);
      setImportPreview(null);
      setImportCsvText(null);
      await fetchDashboardData();
    } catch (err) {
      setError(err.message);
    } finally {
      setIsImporting(false);
    }
  }

  function handleOpenDeleteAll() {
    setIsDeleteAllOpen(true);
    setDeleteAllConfirmText("");
  }

  function handleCancelDeleteAll() {
    setIsDeleteAllOpen(false);
    setDeleteAllConfirmText("");
  }

  async function handleConfirmDeleteAll() {
    if (deleteAllConfirmText !== "DELETE") {
      return;
    }

    setIsDeletingAll(true);
    setError("");

    try {
      const response = await fetch(`${API_BASE_URL}/api/daily`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmation: deleteAllConfirmText }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || "Failed to delete all records.");
      }

      const result = await response.json();
      setIsDeleteAllOpen(false);
      setDeleteAllConfirmText("");
      setSelectedRecordDate(null);
      setSuccessMessage(`Deleted ${result.deleted_count} daily record${result.deleted_count === 1 ? "" : "s"}.`);
      await fetchDashboardData();
    } catch (err) {
      setError(err.message);
    } finally {
      setIsDeletingAll(false);
    }
  }

  return (
    <main className="app">
      <section className="hero">
        <p className="eyebrow">Uber Dashboard v3.0</p>
        <h1>Uber Nest Tracker</h1>
        <p className="subtitle">
          Track earnings, mileage truth, real time, and daily Uber efficiency.
        </p>
      </section>

      {summary ? (
        <section className="summary-grid">
          <div className="card card-featured">
            <p>Wallet balance</p>
            {summary.current_wallet_balance !== null ? (
              <>
                <h2>
                  <AnimatedNumber
                    value={summary.current_wallet_balance}
                    format={(v) => `$${v.toFixed(2)}`}
                  />
                </h2>
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
                  <button
                    type="button"
                    className="latest-week-button"
                    onClick={() => setIsWeekBrowserOpen(true)}
                  >
                    Browse weeks
                  </button>
                )}
              </div>
            </div>

            <div className="weekly-total">
              <p>{selectedRecordIsInVisibleWeek ? "Day total" : "Week total"}</p>
              <h3>
                <AnimatedNumber
                  value={
                    selectedRecordIsInVisibleWeek
                      ? selectedRecord.total_earnings
                      : weeklyTotalEarnings
                  }
                  format={(v) => `$${v.toFixed(2)}`}
                />
              </h3>
            </div>
          </div>

          <div className="weekly-bars">
            {weeklyChartData.map((day, index) => {
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
                  // Deliberately using the array index as the key, not
                  // day.date. This list always has exactly 7 fixed
                  // positions (Mon..Sun) that never reorder, so index is
                  // safe here -- and it's required for the bar-height CSS
                  // transition to work at all. If keyed by date instead,
                  // React would remount fresh bars every time the week
                  // changes (different dates = different keys), so the
                  // "height" CSS property would never see a change on an
                  // existing element to animate -- it'd just appear already
                  // at its final value, with no transition to show.
                  key={index}
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
                <AnimatedNumber
                  value={selectedRecordIsInVisibleWeek ? selectedRecord.online_hours : weeklyTotalHours}
                  format={formatHoursAndMinutes}
                />
              </strong>
            </div>

            <div>
              <p>Real work</p>
              <strong>
                {(() => {
                  const val = selectedRecordIsInVisibleWeek
                    ? selectedRecord.real_work_hours
                    : weeklyRealWorkHours > 0
                      ? weeklyRealWorkHours
                      : null;
                  return val !== null && val !== undefined ? (
                    <AnimatedNumber value={val} format={formatHoursAndMinutes} />
                  ) : (
                    "—"
                  );
                })()}
              </strong>
            </div>

            <div>
              <p>Trips</p>
              <strong>
                <AnimatedNumber
                  value={selectedRecordIsInVisibleWeek ? selectedRecord.trips : weeklyTotalTrips}
                  format={(v) => Math.round(v)}
                />
              </strong>
            </div>

            <div>
              <p>Online $/hr</p>
              <strong>
                <AnimatedNumber
                  value={selectedRecordIsInVisibleWeek ? selectedRecord.avg_hourly : weeklyAverageHourly}
                  format={(v) => `$${v.toFixed(2)}`}
                />
              </strong>
            </div>

            <div>
              <p>Real $/hr</p>
              <strong>
                {(selectedRecordIsInVisibleWeek
                  ? selectedRecord.earnings_per_real_work_hour
                  : weeklyEarningsPerRealHour) !== null ? (
                  <AnimatedNumber
                    value={
                      selectedRecordIsInVisibleWeek
                        ? selectedRecord.earnings_per_real_work_hour
                        : weeklyEarningsPerRealHour
                    }
                    format={(v) => `$${v.toFixed(2)}`}
                  />
                ) : (
                  "—"
                )}
              </strong>
            </div>
          </div>

          <div className="earnings-composition-row">
            <div className="earnings-donut-block">
              <div className="earnings-donut">
                <svg viewBox="0 0 100 100" className="earnings-donut-svg">
                  <circle className="donut-track" cx="50" cy="50" r={DONUT_RADIUS} />
                  <circle
                    className="donut-arc donut-arc-fare"
                    cx="50"
                    cy="50"
                    r={DONUT_RADIUS}
                    style={{
                      strokeDasharray: `${donutArcs.fareLen} ${DONUT_CIRCUMFERENCE - donutArcs.fareLen}`,
                      strokeDashoffset: 0,
                    }}
                  />
                  <circle
                    className="donut-arc donut-arc-tip"
                    cx="50"
                    cy="50"
                    r={DONUT_RADIUS}
                    style={{
                      strokeDasharray: `${donutArcs.tipLen} ${DONUT_CIRCUMFERENCE - donutArcs.tipLen}`,
                      strokeDashoffset: -donutArcs.fareLen,
                    }}
                  />
                  <circle
                    className="donut-arc donut-arc-promo"
                    cx="50"
                    cy="50"
                    r={DONUT_RADIUS}
                    style={{
                      strokeDasharray: `${donutArcs.promoLen} ${DONUT_CIRCUMFERENCE - donutArcs.promoLen}`,
                      strokeDashoffset: -(donutArcs.fareLen + donutArcs.tipLen),
                    }}
                  />
                </svg>

                <div className="earnings-donut-center">
                  <span className="earnings-donut-center-value">
                    <AnimatedNumber
                      value={
                        selectedRecordIsInVisibleWeek
                          ? selectedRecord.total_earnings
                          : weeklyTotalEarnings
                      }
                      format={(v) => `$${v.toFixed(2)}`}
                    />
                  </span>
                  <span className="earnings-donut-center-label">Total</span>
                </div>
              </div>

              <ul className="earnings-donut-legend">
                <li>
                  <span className="legend-swatch">
                    <span className="legend-dot legend-dot-fare"></span>
                    <span className="legend-label">Net fare</span>
                  </span>
                  <strong>
                    <AnimatedNumber
                      value={selectedRecordIsInVisibleWeek ? selectedRecord.net_fare : weeklyNetFare}
                      format={(v) => `$${v.toFixed(2)}`}
                    />
                  </strong>
                  <span className="legend-percent legend-percent-fare">
                    <AnimatedNumber
                      value={selectedRecordIsInVisibleWeek ? selectedRecord.fare_share : weeklyFareShare}
                      format={formatPercent}
                    />
                  </span>
                </li>

                <li>
                  <span className="legend-swatch">
                    <span className="legend-dot legend-dot-tip"></span>
                    <span className="legend-label">Tips</span>
                  </span>
                  <strong>
                    <AnimatedNumber
                      value={selectedRecordIsInVisibleWeek ? selectedRecord.tips : weeklyTips}
                      format={(v) => `$${v.toFixed(2)}`}
                    />
                  </strong>
                  <span className="legend-percent legend-percent-tip">
                    <AnimatedNumber
                      value={selectedRecordIsInVisibleWeek ? selectedRecord.tip_share : weeklyTipShare}
                      format={formatPercent}
                    />
                  </span>
                </li>

                <li>
                  <span className="legend-swatch">
                    <span className="legend-dot legend-dot-promo"></span>
                    <span className="legend-label">Promotions</span>
                  </span>
                  <strong>
                    <AnimatedNumber
                      value={selectedRecordIsInVisibleWeek ? selectedRecord.promotions : weeklyPromotions}
                      format={(v) => `$${v.toFixed(2)}`}
                    />
                  </strong>
                  <span className="legend-percent legend-percent-promo">
                    <AnimatedNumber
                      value={selectedRecordIsInVisibleWeek ? selectedRecord.promo_share : weeklyPromoShare}
                      format={formatPercent}
                    />
                  </span>
                </li>
              </ul>
            </div>

            <div className="weekly-breakdown-stats weekly-breakdown-stats-compact">
              <div>
                <p>Work miles</p>
                <strong>
                  {(() => {
                    const val = selectedRecordIsInVisibleWeek
                      ? selectedRecord.work_miles
                      : weeklyWorkMiles > 0
                        ? weeklyWorkMiles
                        : null;
                    return val !== null ? (
                      <AnimatedNumber value={val} format={(v) => v.toFixed(1)} />
                    ) : (
                      "—"
                    );
                  })()}
                </strong>
              </div>

              <div>
                <p>$/work mile</p>
                <strong>
                  {(() => {
                    const val = selectedRecordIsInVisibleWeek
                      ? selectedRecord.earnings_per_work_mile
                      : weeklyEarningsPerWorkMile;
                    return val !== null && val !== undefined ? (
                      <AnimatedNumber value={val} format={(v) => `$${v.toFixed(2)}`} />
                    ) : (
                      "—"
                    );
                  })()}
                </strong>
              </div>

              <div>
                <p>Miles/trip</p>
                <strong>
                  {(() => {
                    const val = selectedRecordIsInVisibleWeek
                      ? selectedRecord.miles_per_trip
                      : weeklyTotalTrips > 0 && weeklyWorkMiles > 0
                        ? weeklyWorkMiles / weeklyTotalTrips
                        : null;
                    return val !== null ? (
                      <AnimatedNumber value={val} format={(v) => v.toFixed(1)} />
                    ) : (
                      "—"
                    );
                  })()}
                </strong>
              </div>

              <div>
                <p>Wallet Δ</p>
                <strong className="wallet-delta-text">
                  {(() => {
                    const val = selectedRecordIsInVisibleWeek
                      ? selectedRecord.wallet_delta
                      : currentWeekData
                        ? currentWeekData.wallet_delta
                        : null;
                    return val !== null && val !== undefined ? (
                      <AnimatedNumber
                        value={val}
                        format={(v) => `${v >= 0 ? "+" : "−"}$${Math.abs(v).toFixed(2)}`}
                      />
                    ) : (
                      "—"
                    );
                  })()}
                </strong>
                <span className="wallet-delta-subtext">
                  {selectedRecordIsInVisibleWeek
                    ? (selectedRecord.wallet_delta !== null
                        ? (selectedRecord.wallet_delta_days_ago === 0
                            ? "same day logged"
                            : selectedRecord.wallet_delta_days_ago === 1
                              ? "vs 1 day ago"
                              : `vs ${selectedRecord.wallet_delta_days_ago} days ago`)
                        : "Wallet not logged")
                    : (currentWeekData && currentWeekData.wallet_delta !== null
                        ? `${formatShortDate(new Date(`${currentWeekData.wallet_delta_start_date}T00:00:00`))} → ${formatShortDate(new Date(`${currentWeekData.wallet_delta_end_date}T00:00:00`))}`
                      : "Wallet not logged")}
              </span>
            </div>
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

            <input
              type="file"
              accept=".csv"
              ref={importFileInputRef}
              onChange={handleImportFileSelected}
              style={{ display: "none" }}
            />

            <button
              type="button"
              className="import-csv-button"
              onClick={handleImportButtonClick}
              disabled={isImporting}
            >
              {isImporting ? "Reading..." : "Import CSV"}
            </button>

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

        {error && <p className="error">Error: {error}</p>}
        {successMessage && <p className="success">{successMessage}</p>}

        {importPreview && (
          <div className="import-preview-panel">
            <h3>Import preview</h3>
            <p className="import-preview-summary">
              <strong>{importPreview.new_count}</strong> new day
              {importPreview.new_count === 1 ? "" : "s"} will be added,{" "}
              <strong>{importPreview.update_count}</strong> existing day
              {importPreview.update_count === 1 ? "" : "s"} will be overwritten
              {importPreview.error_count > 0 && (
                <>
                  , and <strong>{importPreview.error_count}</strong> row
                  {importPreview.error_count === 1 ? "" : "s"} will be skipped due to errors
                </>
              )}
              .
            </p>

            {importPreview.errors.length > 0 && (
              <ul className="import-error-list">
                {importPreview.errors.map((err, index) => (
                  <li key={index}>
                    Row {err.row}
                    {err.date ? ` (${err.date})` : ""}: {err.message}
                  </li>
                ))}
                {importPreview.error_count > importPreview.errors.length && (
                  <li className="import-error-truncated">
                    …and {importPreview.error_count - importPreview.errors.length} more
                  </li>
                )}
              </ul>
            )}

            <div className="import-preview-actions">
              <button
                type="button"
                className="primary-button"
                onClick={handleConfirmImport}
                disabled={isImporting}
              >
                {isImporting ? "Importing..." : "Confirm import"}
              </button>
              <button
                type="button"
                className="cancel-edit-button"
                onClick={handleCancelImport}
                disabled={isImporting}
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {importResult && (
          <p className="success">
            Import complete: {importResult.inserted} added, {importResult.updated} updated
            {importResult.error_count > 0
              ? `, ${importResult.error_count} row${importResult.error_count === 1 ? "" : "s"} skipped.`
              : "."}
          </p>
        )}

      {(isFormOpen || editingDate) && (
      <section className="form-section" ref={formSectionRef}>
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

          <div className="form-actions">
            <button type="submit" className="primary-button" disabled={isSubmitting}>
              {isSubmitting ? "Saving..." : editingDate ? "Update log" : "Add log"}
            </button>

            <button type="button" className="cancel-edit-button" onClick={cancelEdit}>
              Cancel
            </button>
          </div>
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
                            window.scrollTo({ top: 0, behavior: "smooth" });
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

        {dailyRecords.length > 0 && (
          <div className="danger-zone">
            <button type="button" className="delete-all-trigger" onClick={handleOpenDeleteAll}>
              Delete all daily records…
            </button>
          </div>
        )}
      </section>

      {isWeekBrowserOpen && (
        <div className="week-browser-overlay" onClick={() => setIsWeekBrowserOpen(false)}>
          <div className="week-browser-panel" onClick={(event) => event.stopPropagation()}>
            <div className="week-browser-panel-header">
              <h3>Select week</h3>
              <button
                type="button"
                className="week-browser-close"
                onClick={() => setIsWeekBrowserOpen(false)}
                aria-label="Close"
              >
                ×
              </button>
            </div>

            <div className="week-browser-weekday-header">
              <span className="week-browser-weekday-header-label">Weekly earnings</span>
              <div className="week-browser-weekday-letters">
                {["M", "T", "W", "T", "F", "S", "S"].map((letter, index) => (
                  <span key={index}>{letter}</span>
                ))}
              </div>
            </div>

            <div className="week-browser-list">
              {weeks.map((week) => {
                const maxDayEarnings = Math.max(...week.daily.map((day) => day.earnings), 0);
                const isActive = week.week_start === selectedWeekStart;

                return (
                  <button
                    type="button"
                    key={week.week_start}
                    className={`week-browser-row ${isActive ? "week-browser-row-active" : ""}`}
                    onClick={() => handleBrowseWeekSelect(week.week_start)}
                  >
                    <div className="week-browser-row-info">
                      <span className="week-browser-range">
                        {formatWeekRangeLabel(week.week_start, week.week_end)}
                      </span>
                      <span className="week-browser-total">${week.total_earnings.toFixed(2)}</span>
                    </div>

                    <div className="week-browser-chart-block">
                      <div className="week-browser-mini-chart">
                        {week.daily.map((day) => (
                          <div
                            key={day.date}
                            className={`week-browser-mini-bar ${
                              day.earnings === 0 ? "week-browser-mini-bar-empty" : ""
                            }`}
                            style={{
                              height: maxDayEarnings > 0 ? `${(day.earnings / maxDayEarnings) * 100}%` : "0%",
                            }}
                          ></div>
                        ))}
                      </div>
                      <div className="week-browser-mini-labels">
                        {week.daily.map((day) => (
                          <span key={day.date}>{parseInt(day.date.split("-")[2], 10)}</span>
                        ))}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {isDeleteAllOpen && (
        <div className="delete-all-overlay" onClick={handleCancelDeleteAll}>
          <div className="delete-all-panel" onClick={(event) => event.stopPropagation()}>
            <h3>Delete all daily records?</h3>
            <p className="delete-all-warning">
              This permanently deletes every daily log in your database. There is no undo.
            </p>

            {dailyRecords.length > 0 && (
              <p className="delete-all-export-hint">
                Consider{" "}
                <a href={`${API_BASE_URL}/api/daily/csv`} className="delete-all-export-link">
                  exporting a backup
                </a>{" "}
                first if you haven't already.
              </p>
            )}

            <label className="delete-all-confirm-label">
              Type <strong>DELETE</strong> to confirm
              <input
                type="text"
                className="delete-all-confirm-input"
                value={deleteAllConfirmText}
                onChange={(event) => setDeleteAllConfirmText(event.target.value)}
                autoFocus
                placeholder="DELETE"
              />
            </label>

            <div className="delete-all-actions">
              <button
                type="button"
                className="delete-button"
                disabled={deleteAllConfirmText !== "DELETE" || isDeletingAll}
                onClick={handleConfirmDeleteAll}
              >
                {isDeletingAll ? "Deleting..." : "Delete everything"}
              </button>
              <button
                type="button"
                className="cancel-edit-button"
                onClick={handleCancelDeleteAll}
                disabled={isDeletingAll}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

// React only supports catching render-time errors with a class component
// (there's no hook equivalent) -- this is a personal, single-user app, so
// the goal here is modest: replace a blank white screen with a readable
// message and a hint to check the console, not a polished recovery flow.
class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    console.error("Uber Nest Tracker crashed:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <main className="app">
          <section className="hero">
            <h1>Something went wrong</h1>
            <p className="subtitle">
              The dashboard hit an unexpected error. Check the browser console for
              details, then try refreshing the page.
            </p>
          </section>
        </main>
      );
    }

    return this.props.children;
  }
}

function AppWithErrorBoundary() {
  return (
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  );
}

export default AppWithErrorBoundary;