import { Component, useEffect, useRef, useState } from "react";
import "./App.css";

const API_BASE_URL = "http://127.0.0.1:8000";
const DAILY_LOG_PAGE_SIZE_OPTIONS = [10, 25, 50];

const DAILY_LOG_SORT_OPTIONS = [
  { value: "date-desc", label: "Newest first" },
  { value: "date-asc", label: "Oldest first" },
  { value: "total-desc", label: "Highest total" },
  { value: "total-asc", label: "Lowest total" },
  { value: "hourly-desc", label: "Highest online $/hr" },
  { value: "hourly-asc", label: "Lowest online $/hr" },
  { value: "real-hourly-desc", label: "Highest real $/hr" },
  { value: "real-hourly-asc", label: "Lowest real $/hr" },
  { value: "work-mile-desc", label: "Highest $/work mile" },
  { value: "work-mile-asc", label: "Lowest $/work mile" },
  { value: "trips-desc", label: "Most trips" },
  { value: "trips-asc", label: "Fewest trips" },
];

// Day Effects (v3.1) — fixed tag vocabulary, grouped for the form's chip
// picker. Mirrors ALLOWED_DAY_TAGS in the backend; keep both lists in sync
// if a tag is ever added, renamed, or removed. `category` drives the icon
// shown alongside each tag: one glyph per category (not per tag) keeps the
// icon set small/maintainable while still giving the eye a fast non-text
// anchor for the *type* of condition, with the text supplying the specific
// one. Categories are deliberately NOT color-coded by sentiment -- a day
// effect is an observed condition, not a verdict on the day.
const DAY_TAG_GROUPS = [
  {
    group: "Weather",
    category: "weather",
    tags: [
      { value: "rain", label: "Rain" },
      { value: "snow", label: "Snow" },
    ],
  },
  {
    group: "Demand & traffic",
    category: "traffic",
    tags: [
      { value: "heavy_traffic", label: "Heavy traffic" },
      { value: "high_demand", label: "High demand" },
      { value: "low_demand", label: "Low demand" },
      { value: "dead_zone", label: "Dead zone" },
    ],
  },
  {
    group: "Order quality",
    category: "orders",
    tags: [
      { value: "good_orders", label: "Good orders" },
      { value: "bad_orders", label: "Bad orders" },
    ],
  },
  {
    group: "Operational",
    category: "operational",
    tags: [
      { value: "quest_day", label: "Quest day" },
      { value: "app_issues", label: "App issues" },
      { value: "low_battery", label: "Low battery" },
      { value: "phone_hotspot_issues", label: "Phone/hotspot issues" },
    ],
  },
];

const DAY_TAG_LABELS = Object.fromEntries(
  DAY_TAG_GROUPS.flatMap((group) => group.tags.map((tag) => [tag.value, tag.label]))
);

// Maps each tag value to its category, so a lone tag (in the table or the
// selected-day row) can find its icon without re-walking the groups.
const DAY_TAG_CATEGORY = Object.fromEntries(
  DAY_TAG_GROUPS.flatMap((group) => group.tags.map((tag) => [tag.value, group.category]))
);

function getDayTagLabel(tagValue) {
  return DAY_TAG_LABELS[tagValue] || tagValue;
}

function getDayTagCategory(tagValue) {
  return DAY_TAG_CATEGORY[tagValue] || "operational";
}

// One small inline SVG per category — no icon-library dependency. Each is a
// simple 16x16 path tuned to read at chip size. `weather` = raindrop,
// `traffic` = up/down flow arrows, `orders` = a bag, `operational` = a gear.
function DayTagIcon({ category }) {
  const paths = {
    weather: (
      <path
        d="M8 1.5c2.2 2.8 4 5 4 7a4 4 0 1 1-8 0c0-2 1.8-4.2 4-7z"
        fill="currentColor"
      />
    ),
    traffic: (
      <g fill="currentColor">
        <path d="M4.5 2.5l2.2 2.6H5.3v3.2H3.7V5.1H2.3z" />
        <path d="M11.5 13.5l-2.2-2.6h1.4V7.7h1.6v3.2h1.4z" />
      </g>
    ),
    orders: (
      <path
        d="M4 5V4a2 2 0 0 1 4 0v1h.5A1.5 1.5 0 0 1 10 6.5V12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6.5A1.5 1.5 0 0 1 3.5 5H4zm1 0h2V4a1 1 0 0 0-2 0v1z"
        fill="currentColor"
        transform="translate(2 0)"
      />
    ),
    operational: (
      <path
        d="M8 5.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5zm6.2 3.2l-1.3-.8a5 5 0 0 0 0-1.8l1.3-.8-1.3-2.2-1.4.6a5 5 0 0 0-1.5-.9l-.2-1.5H6.9l-.2 1.5a5 5 0 0 0-1.5.9l-1.4-.6-1.3 2.2 1.3.8a5 5 0 0 0 0 1.8l-1.3.8 1.3 2.2 1.4-.6c.45.37.96.68 1.5.9l.2 1.5h2.2l.2-1.5a5 5 0 0 0 1.5-.9l1.4.6z"
        fill="currentColor"
        opacity="0.9"
      />
    ),
  };

  return (
    <svg
      className="day-tag-icon"
      viewBox="0 0 16 16"
      width="12"
      height="12"
      aria-hidden="true"
      focusable="false"
    >
      {paths[category] || paths.operational}
    </svg>
  );
}

// Real, specific definition per tag -- not just "X condition you tagged" --
// so hovering any Day Effects chip (in the form, the selected-day view, or
// the table) explains what the tag actually means, the same way the
// rule-based status chips explain their numeric boundary. These are
// self-reported/subjective tags with no formula behind them, so the
// wording here is the working definition, not a computed rule.
const DAY_TAG_DEFINITIONS = {
  rain: "It was raining for some or all of the shift.",
  snow: "It was snowing for some or all of the shift.",

  heavy_traffic: "Congestion slowed you down — more time on the road per trip than normal.",
  high_demand: "Orders came in back-to-back with little wait between drop-off and the next ping — the app felt \"on.\"",
  low_demand: "Noticeable dead air between orders — slow ping turnaround, possibly no surge active.",
  dead_zone: "Multiple orders sent you far from stores or populated areas, into sparse/rural territory with a long relocation back — a day-wide pattern, not just one bad order.",

  good_orders: "Orders were worth taking — solid pay, reasonable distance, no major complaints.",
  bad_orders: "Orders were frustrating or low-value — small payouts, bad ratios, or not worth the drive.",

  quest_day: "A quest/bonus incentive was active and factored into the shift.",
  app_issues: "The Uber app itself glitched, froze, or otherwise misbehaved during the shift.",
  low_battery: "Car (or device) battery was a limiting factor — a rough start or a cut-short shift because of it.",
  phone_hotspot_issues: "Phone signal or hotspot connectivity caused problems during the shift.",
};

function getDayTagTooltip(tagValue) {
  return DAY_TAG_DEFINITIONS[tagValue] || `${getDayTagLabel(tagValue)} — condition you tagged for this day.`;
}

// A single day-effect pill: icon + label + tooltip, used in both the
// selected-day row and the table's Effects column so the feature has one
// consistent look everywhere. `inTable` renders a slightly more compact
// variant for the table's Effects column.
function DayTagChip({ tagValue, inTable = false }) {
  const category = getDayTagCategory(tagValue);

  return (
    <span className="day-tag-tooltip-wrap">
      <span
        className={`day-tag-chip day-tag-chip-${category} ${inTable ? "day-tag-chip-table" : ""}`}
        tabIndex="0"
        onMouseUp={(event) => event.currentTarget.blur()}
      >
        <DayTagIcon category={category} />
        <span className="day-tag-chip-label">{getDayTagLabel(tagValue)}</span>
      </span>
      <span className="day-tag-tooltip" role="tooltip">
        <strong className="day-tag-tooltip-title">{getDayTagLabel(tagValue)}</strong>
        <span className="day-tag-tooltip-body">{getDayTagTooltip(tagValue)}</span>
      </span>
    </span>
  );
}

// The "+N" overflow pill in the table's Effects column. Same styled-tooltip
// pattern as DayTagChip/LabelChip, but lists every hidden tag (each with its
// own category icon) instead of a single sentence, since there can be
// several. Kept as its own component rather than bolting a list onto
// DayTagChip so that component's tooltip stays a single-tag sentence.
function DayTagOverflowChip({ tagValues }) {
  return (
    <span className="day-tag-tooltip-wrap">
      <span className="table-day-tag-more" tabIndex="0" onMouseUp={(event) => event.currentTarget.blur()}>
        +{tagValues.length}
      </span>
      <span className="day-tag-tooltip day-tag-overflow-tooltip" role="tooltip">
        {tagValues.map((tag) => {
          const category = getDayTagCategory(tag);
          return (
            <span className="day-tag-overflow-row" key={tag}>
              <DayTagIcon category={category} />
              <span>{getDayTagLabel(tag)}</span>
            </span>
          );
        })}
      </span>
    </span>
  );
}


// Small inline action icons for the Daily logs table (View/Hide, Edit,
// Delete). Icon-only + title/aria-label rather than full text buttons,
// which is what was forcing the Actions column to stay so wide that
// Online $/hr and other columns had no room and started wrapping.
//
// These use the Feather icon set's paths (MIT licensed, stroke-based
// rather than filled shapes). An earlier version hand-drew custom filled
// paths at this same small size, which is easy to get subtly wrong -- a
// slightly-off fill path renders as a blob instead of a recognizable shape.
// Stroke-based paths from an established set are far less fragile at
// small sizes, so this swaps to known-good geometry rather than another
// hand-tuned guess.
function IconBase({ children }) {
  return (
    <svg
      className="action-icon"
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

function ViewIcon() {
  return (
    <IconBase>
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </IconBase>
  );
}

function HideIcon() {
  return (
    <IconBase>
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
      <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </IconBase>
  );
}

function EditIcon() {
  return (
    <IconBase>
      <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
    </IconBase>
  );
}

function DeleteIcon() {
  return (
    <IconBase>
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <line x1="10" y1="11" x2="10" y2="17" />
      <line x1="14" y1="11" x2="14" y2="17" />
    </IconBase>
  );
}

function toLocalInputDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function getTodayInputValue() {
  return toLocalInputDate(new Date());
}

function createEmptyForm(date = getTodayInputValue()) {
  return {
    date,
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

    day_tags: [],
  };
}

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

function formatTooltipCurrency(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return "not available";
  }

  return `$${Number(value).toFixed(2)}`;
}

function formatTooltipNumber(value, decimals = 1) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return "not available";
  }

  return Number(value).toFixed(decimals);
}

function formatTooltipPercent(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return "not available";
  }

  return `${(Number(value) * 100).toFixed(1)}%`;
}

function getRecordShare(record, fieldName, shareFieldName) {
  if (!record) {
    return null;
  }

  if (record[shareFieldName] !== null && record[shareFieldName] !== undefined) {
    return record[shareFieldName];
  }

  if (!record.total_earnings || record.total_earnings <= 0) {
    return null;
  }

  return (record[fieldName] || 0) / record.total_earnings;
}

function getStatusTooltip(label, record) {
  const onlineHourly = record ? formatTooltipCurrency(record.avg_hourly) : "not available";
  const promoAmount = record ? formatTooltipCurrency(record.promotions) : "not available";
  const promoShare = formatTooltipPercent(getRecordShare(record, "promotions", "promo_share"));
  const tipAmount = record ? formatTooltipCurrency(record.tips) : "not available";
  const tipShare = formatTooltipPercent(getRecordShare(record, "tips", "tip_share"));
  const workMiles = record ? formatTooltipNumber(record.work_miles, 1) : "not available";
  const perWorkMile = record ? formatTooltipCurrency(record.earnings_per_work_mile) : "not available";
  const milesPerTrip = record ? formatTooltipNumber(record.miles_per_trip, 1) : "not available";

  const tooltips = {
    "Strong hourly": {
      metric: `Online $/hr: ${onlineHourly}`,
      range: "Strong hourly: $30+ online $/hr",
      body: "This day landed in the strongest hourly bucket based on earnings divided by online hours.",
    },
    "Good hourly": {
      metric: `Online $/hr: ${onlineHourly}`,
      range: "Good hourly: $25–$30 online $/hr",
      body: "This day cleared the good hourly range, but did not reach the strongest bucket.",
    },
    "Acceptable hourly": {
      metric: `Online $/hr: ${onlineHourly}`,
      range: "Acceptable hourly: $20–$25 online $/hr",
      body: "This day was workable, but the hourly rate was not high enough to count as good.",
    },
    "Weak hourly": {
      metric: `Online $/hr: ${onlineHourly}`,
      range: "Weak hourly: $15–$20 online $/hr",
      body: "This day fell below the target hourly range.",
    },
    "Bad hourly": {
      metric: `Online $/hr: ${onlineHourly}`,
      range: "Bad hourly: below $15 online $/hr",
      body: "This day had a very low return for the amount of online time logged.",
    },

    "Organic earnings": {
      metric: `Promotions: ${promoAmount} (${promoShare})`,
      range: "Organic earnings: under 10% of earnings from promotions",
      body: "Most of this day came from fare and tips rather than promotion money.",
    },
    "Promo helped": {
      metric: `Promotions: ${promoAmount} (${promoShare})`,
      range: "Promo helped: 10%–25% of earnings from promotions",
      body: "Promotions gave the day a meaningful boost, but they were not the main source of earnings.",
    },
    "Promo-carried": {
      metric: `Promotions: ${promoAmount} (${promoShare})`,
      range: "Promo-carried: 25%+ of earnings from promotions",
      body: "A large share of this day came from promotions, so the day was heavily dependent on promo money.",
    },

    "Tip-carried": {
      metric: `Tips: ${tipAmount} (${tipShare})`,
      range: "Tip-carried: 50%+ of earnings from tips",
      body: "Tips made up a very large share of this day's earnings.",
    },
    "Solid tips": {
      metric: `Tips: ${tipAmount} (${tipShare})`,
      range: "Solid tips: 35%–50% of earnings from tips",
      body: "Tips were a strong part of the total without fully carrying the day.",
    },
    "Normal tips": {
      metric: `Tips: ${tipAmount} (${tipShare})`,
      range: "Normal tips: 25%–35% of earnings from tips",
      body: "Tip share looked normal for this entry.",
    },
    "Weak tips": {
      metric: `Tips: ${tipAmount} (${tipShare})`,
      range: "Weak tips: under 25% of earnings from tips",
      body: "Tips were a low share of this day's earnings.",
    },

    "Strong mileage": {
      metric: `$/work mile: ${perWorkMile} · Work miles: ${workMiles} · Miles/trip: ${milesPerTrip}`,
      range: "Strong mileage: $1.50+ per work mile",
      body: "Mileage efficiency was strong based on earnings per work mile.",
    },
    "Solid mileage": {
      metric: `$/work mile: ${perWorkMile} · Work miles: ${workMiles} · Miles/trip: ${milesPerTrip}`,
      range: "Solid mileage: $1.00–$1.50 per work mile",
      body: "Mileage efficiency was decent and stayed within a reasonable range.",
    },
    "Questionable mileage": {
      metric: `$/work mile: ${perWorkMile} · Work miles: ${workMiles} · Miles/trip: ${milesPerTrip}`,
      range: "Questionable mileage: $0.75–$1.00 per work mile",
      body: "Mileage efficiency was borderline and worth checking against the route/shift details.",
    },
    "Weak mileage": {
      metric: `$/work mile: ${perWorkMile} · Work miles: ${workMiles} · Miles/trip: ${milesPerTrip}`,
      range: "Weak mileage: below $0.75 per work mile",
      body: "Mileage efficiency was weak, meaning the day required too many work miles for the earnings.",
    },
    "Mileage not logged": {
      metric: "Odometer/work-mile fields are missing.",
      range: null,
      body: "The app cannot calculate mileage efficiency for this entry until mileage data is logged.",
    },
  };

  return (
    tooltips[label] || {
      metric: "Rule details not available.",
      range: null,
      body: "This status was generated from the daily log metrics.",
    }
  );
}

function LabelChip({ label, record }) {
  const tooltip = getStatusTooltip(label, record);

  return (
    <span className="label-tooltip-wrap">
      <span
        className={`label-chip label-${getLabelVariant(label)}`}
        tabIndex="0"
        onMouseUp={(event) => event.currentTarget.blur()}
      >
        {label}
      </span>
      <span className="label-tooltip" role="tooltip">
        <strong className="label-tooltip-title">{label}</strong>
        <span className="label-tooltip-body">{tooltip.body}</span>
        <span className="label-tooltip-metric">{tooltip.metric}</span>
        {tooltip.range && <span className="label-tooltip-range">{tooltip.range}</span>}
      </span>
    </span>
  );
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
  const [formData, setFormData] = useState(() => createEmptyForm());
  const [showAdvancedTracking, setShowAdvancedTracking] = useState(false);
  const [showDayEffects, setShowDayEffects] = useState(false);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingDate, setEditingDate] = useState(null);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isWeekBrowserOpen, setIsWeekBrowserOpen] = useState(false);
  const [dailyLogPage, setDailyLogPage] = useState(1);
  const [dailyLogPageSize, setDailyLogPageSize] = useState(10);
  const [dailyLogSort, setDailyLogSort] = useState("date-desc");
  const [dailyLogStatusFilter, setDailyLogStatusFilter] = useState("all");
  const [dailyLogMonthFilter, setDailyLogMonthFilter] = useState("all");
  const [dailyLogWalletFilter, setDailyLogWalletFilter] = useState("all");
  const [dailyLogTagFilter, setDailyLogTagFilter] = useState("all");
  const [isDailyLogToolsOpen, setIsDailyLogToolsOpen] = useState(false);

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
    return toLocalInputDate(date);
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

  // The Online hours field lets you type "3.59" to mean 3 hours 59 minutes
  // (like a clock), rather than requiring the math to convert 59 minutes
  // into a decimal fraction of an hour yourself. Internally, everywhere
  // else in the app (storage, calculations, avg $/hr, etc.) still uses
  // true decimal hours -- this conversion happens only at the form
  // boundary: hhmmToDecimalHours() runs right before submitting, and
  // decimalHoursToHHMM() runs when populating the form for editing, so an
  // existing record redisplays in the same H.MM format it was entered in.
  function hhmmToDecimalHours(input) {
    const trimmed = String(input).trim();

    if (trimmed === "") {
      return { decimalHours: null };
    }

    const isNegative = trimmed.startsWith("-");
    const unsigned = isNegative ? trimmed.slice(1) : trimmed;
    const parts = unsigned.split(".");

    const hoursPart = parts[0] === "" ? 0 : parseInt(parts[0], 10);
    if (Number.isNaN(hoursPart)) {
      return { error: "That doesn't look like a valid number." };
    }

    let minutesPart = 0;
    if (parts.length > 1) {
      const digits = parts[1];
      if (digits.length === 1) {
        // Standard decimal padding: .5 means .50, so treat "3.5" as 3h 50m,
        // not 3h 5m -- matches how decimals normally work (0.5 === 0.50).
        minutesPart = parseInt(digits, 10) * 10;
      } else {
        minutesPart = parseInt(digits.slice(0, 2), 10);
      }
    }

    if (Number.isNaN(minutesPart)) {
      return { error: "That doesn't look like a valid number." };
    }

    if (minutesPart >= 60) {
      return {
        error: `Minutes portion must be less than 60 (you entered .${parts[1]}). Did you mean ${hoursPart + 1}.00?`,
      };
    }

    const decimalHours = hoursPart + minutesPart / 60;
    return { decimalHours: isNegative ? -decimalHours : decimalHours };
  }

  function decimalHoursToHHMM(decimalHours) {
    if (decimalHours === null || decimalHours === undefined) {
      return "";
    }

    const totalMinutes = Math.round(decimalHours * 60);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;

    return `${hours}.${String(minutes).padStart(2, "0")}`;
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

  function toggleDayTag(tagValue) {
    setFormData((currentFormData) => {
      const currentTags = currentFormData.day_tags || [];
      const isSelected = currentTags.includes(tagValue);

      return {
        ...currentFormData,
        day_tags: isSelected
          ? currentTags.filter((tag) => tag !== tagValue)
          : [...currentTags, tagValue],
      };
    });
  }

  function handleWeeklyBarClick(day) {
    if (selectedRecordDate === day.date) {
      setSelectedRecordDate(null);
      return;
    }

    // Blank days are selectable too. That lets the chart become a shortcut
    // into adding a record for the exact missing date.
    setSelectedRecordDate(day.date);

    const recordWeekStart = getWeekStart(day.date);
    setSelectedWeekStart(formatDateForInput(recordWeekStart));
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

  const selectedChartDay = selectedRecordDate
    ? weeklyChartData.find((day) => day.date === selectedRecordDate) || null
    : null;

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

  const selectedEmptyChartDay =
    selectedChartDay && !selectedChartDay.hasRecord ? selectedChartDay : null;

  const selectedEmptyDayIsInVisibleWeek = Boolean(selectedEmptyChartDay);
  const isSelectedDayMode = Boolean(
    selectedRecordIsInVisibleWeek || selectedEmptyDayIsInVisibleWeek
  );

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

  const displayedTotalEarnings = selectedRecordIsInVisibleWeek
    ? selectedRecord.total_earnings
    : selectedEmptyDayIsInVisibleWeek
      ? 0
      : weeklyTotalEarnings;

  const displayedOnlineHours = selectedRecordIsInVisibleWeek
    ? selectedRecord.online_hours
    : selectedEmptyDayIsInVisibleWeek
      ? 0
      : weeklyTotalHours;

  const displayedRealWorkHours = selectedRecordIsInVisibleWeek
    ? selectedRecord.real_work_hours
    : selectedEmptyDayIsInVisibleWeek
      ? null
      : weeklyRealWorkHours > 0
        ? weeklyRealWorkHours
        : null;

  const displayedTrips = selectedRecordIsInVisibleWeek
    ? selectedRecord.trips
    : selectedEmptyDayIsInVisibleWeek
      ? 0
      : weeklyTotalTrips;

  const displayedAverageHourly = selectedRecordIsInVisibleWeek
    ? selectedRecord.avg_hourly
    : selectedEmptyDayIsInVisibleWeek
      ? 0
      : weeklyAverageHourly;

  const displayedEarningsPerRealHour = selectedRecordIsInVisibleWeek
    ? selectedRecord.earnings_per_real_work_hour
    : selectedEmptyDayIsInVisibleWeek
      ? null
      : weeklyEarningsPerRealHour;

  const displayedNetFare = selectedRecordIsInVisibleWeek
    ? selectedRecord.net_fare
    : selectedEmptyDayIsInVisibleWeek
      ? 0
      : weeklyNetFare;

  const displayedTips = selectedRecordIsInVisibleWeek
    ? selectedRecord.tips
    : selectedEmptyDayIsInVisibleWeek
      ? 0
      : weeklyTips;

  const displayedPromotions = selectedRecordIsInVisibleWeek
    ? selectedRecord.promotions
    : selectedEmptyDayIsInVisibleWeek
      ? 0
      : weeklyPromotions;

  const displayedFareShare = selectedRecordIsInVisibleWeek
    ? selectedRecord.fare_share
    : selectedEmptyDayIsInVisibleWeek
      ? 0
      : weeklyFareShare;

  const displayedTipShare = selectedRecordIsInVisibleWeek
    ? selectedRecord.tip_share
    : selectedEmptyDayIsInVisibleWeek
      ? 0
      : weeklyTipShare;

  const displayedPromoShare = selectedRecordIsInVisibleWeek
    ? selectedRecord.promo_share
    : selectedEmptyDayIsInVisibleWeek
      ? 0
      : weeklyPromoShare;

  const displayedWorkMiles = selectedRecordIsInVisibleWeek
    ? selectedRecord.work_miles
    : selectedEmptyDayIsInVisibleWeek
      ? null
      : weeklyWorkMiles > 0
        ? weeklyWorkMiles
        : null;

  const displayedEarningsPerWorkMile = selectedRecordIsInVisibleWeek
    ? selectedRecord.earnings_per_work_mile
    : selectedEmptyDayIsInVisibleWeek
      ? null
      : weeklyEarningsPerWorkMile;

  const displayedMilesPerTrip = selectedRecordIsInVisibleWeek
    ? selectedRecord.miles_per_trip
    : selectedEmptyDayIsInVisibleWeek
      ? null
      : weeklyTotalTrips > 0 && weeklyWorkMiles > 0
        ? weeklyWorkMiles / weeklyTotalTrips
        : null;

  const displayedWalletDelta = selectedRecordIsInVisibleWeek
    ? selectedRecord.wallet_delta
    : selectedEmptyDayIsInVisibleWeek
      ? null
      : currentWeekData
        ? currentWeekData.wallet_delta
        : null;

  const displayedWalletDeltaSubtext = selectedRecordIsInVisibleWeek
    ? selectedRecord.wallet_delta !== null
      ? selectedRecord.wallet_delta_days_ago === 0
        ? "same day logged"
        : selectedRecord.wallet_delta_days_ago === 1
          ? "vs 1 day ago"
          : `vs ${selectedRecord.wallet_delta_days_ago} days ago`
      : "Wallet not logged"
    : selectedEmptyDayIsInVisibleWeek
      ? "No log yet"
      : currentWeekData && currentWeekData.wallet_delta !== null
        ? `${formatShortDate(new Date(`${currentWeekData.wallet_delta_start_date}T00:00:00`))} → ${formatShortDate(new Date(`${currentWeekData.wallet_delta_end_date}T00:00:00`))}`
        : "Wallet not logged";

  const donutArcs = buildEarningsDonutArcs(
    displayedFareShare,
    displayedTipShare,
    displayedPromoShare
  );

  const dailyLogMonthOptions = Array.from(
    new Set(dailyRecords.map((record) => record.date.slice(0, 7)))
  ).map((monthValue) => {
    const monthDate = new Date(`${monthValue}-01T00:00:00`);

    return {
      value: monthValue,
      label: monthDate.toLocaleDateString("en-US", {
        month: "long",
        year: "numeric",
      }),
    };
  });

  const dailyLogStatusOptions = Array.from(
    new Set(
      dailyRecords.flatMap((record) => [
        record.hourly_label,
        record.promo_label,
        record.mileage_label,
      ])
    )
  )
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b));

  function getRecordStatusLabels(record) {
    return [record.hourly_label, record.promo_label, record.mileage_label].filter(Boolean);
  }

  function getRecordWorkMileValue(record) {
    return record.earnings_per_work_mile !== null && record.earnings_per_work_mile !== undefined
      ? record.earnings_per_work_mile
      : record.earnings_per_mile !== null && record.earnings_per_mile !== undefined
        ? record.earnings_per_mile
        : null;
  }

  function getDailyLogSortValue(record, sortKey) {
    switch (sortKey) {
      case "date-desc":
      case "date-asc":
        return record.date;
      case "total-desc":
      case "total-asc":
        return record.total_earnings;
      case "hourly-desc":
      case "hourly-asc":
        return record.avg_hourly;
      case "real-hourly-desc":
      case "real-hourly-asc":
        return record.earnings_per_real_work_hour;
      case "work-mile-desc":
      case "work-mile-asc":
        return getRecordWorkMileValue(record);
      case "trips-desc":
      case "trips-asc":
        return record.trips;
      default:
        return record.date;
    }
  }

  function compareNullableValues(aValue, bValue, direction) {
    const aIsMissing = aValue === null || aValue === undefined || Number.isNaN(aValue);
    const bIsMissing = bValue === null || bValue === undefined || Number.isNaN(bValue);

    // Missing values always go last, regardless of ascending/descending.
    // A day without real-time or mileage data should not beat a logged day.
    if (aIsMissing && bIsMissing) {
      return 0;
    }

    if (aIsMissing) {
      return 1;
    }

    if (bIsMissing) {
      return -1;
    }

    if (typeof aValue === "string" && typeof bValue === "string") {
      return direction === "asc"
        ? aValue.localeCompare(bValue)
        : bValue.localeCompare(aValue);
    }

    return direction === "asc" ? aValue - bValue : bValue - aValue;
  }

  const filteredDailyRecords = dailyRecords.filter((record) => {
    const matchesStatus =
      dailyLogStatusFilter === "all" ||
      getRecordStatusLabels(record).includes(dailyLogStatusFilter);

    const matchesMonth =
      dailyLogMonthFilter === "all" || record.date.startsWith(dailyLogMonthFilter);

    const matchesWallet =
      dailyLogWalletFilter === "all" ||
      (dailyLogWalletFilter === "logged" &&
        record.wallet_balance !== null &&
        record.wallet_balance !== undefined) ||
      (dailyLogWalletFilter === "missing" &&
        (record.wallet_balance === null || record.wallet_balance === undefined));

    const matchesTag =
      dailyLogTagFilter === "all" ||
      (Array.isArray(record.day_tags) && record.day_tags.includes(dailyLogTagFilter));

    return matchesStatus && matchesMonth && matchesWallet && matchesTag;
  });

  const sortedDailyRecords = [...filteredDailyRecords].sort((a, b) => {
    const direction = dailyLogSort.endsWith("-asc") ? "asc" : "desc";
    const aValue = getDailyLogSortValue(a, dailyLogSort);
    const bValue = getDailyLogSortValue(b, dailyLogSort);
    const primarySort = compareNullableValues(aValue, bValue, direction);

    if (primarySort !== 0) {
      return primarySort;
    }

    // Stable-feeling tie breaker: if two days have the same metric, newer
    // days appear first instead of looking randomly shuffled.
    return b.date.localeCompare(a.date);
  });

  const hasActiveDailyLogFilters =
    dailyLogStatusFilter !== "all" ||
    dailyLogMonthFilter !== "all" ||
    dailyLogWalletFilter !== "all" ||
    dailyLogTagFilter !== "all";

  const hasCustomDailyLogTableView =
    hasActiveDailyLogFilters || dailyLogSort !== "date-desc";

  const activeDailyLogViewParts = [
    dailyLogSort !== "date-desc"
      ? DAILY_LOG_SORT_OPTIONS.find((option) => option.value === dailyLogSort)?.label
      : null,
    dailyLogStatusFilter !== "all" ? dailyLogStatusFilter : null,
    dailyLogMonthFilter !== "all"
      ? dailyLogMonthOptions.find((month) => month.value === dailyLogMonthFilter)?.label
      : null,
    dailyLogWalletFilter === "logged"
      ? "Wallet logged only"
      : dailyLogWalletFilter === "missing"
        ? "Wallet missing only"
        : null,
    dailyLogTagFilter !== "all" ? getDayTagLabel(dailyLogTagFilter) : null,
  ].filter(Boolean);

  const totalFilteredDailyLogs = sortedDailyRecords.length;
  const totalDailyLogPages = Math.max(
    1,
    Math.ceil(totalFilteredDailyLogs / dailyLogPageSize)
  );

  const safeDailyLogPage = Math.min(dailyLogPage, totalDailyLogPages);
  const dailyLogStartIndex =
    totalFilteredDailyLogs > 0 ? (safeDailyLogPage - 1) * dailyLogPageSize : 0;
  const dailyLogEndIndex = Math.min(
    dailyLogStartIndex + dailyLogPageSize,
    totalFilteredDailyLogs
  );
  const paginatedDailyRecords = sortedDailyRecords.slice(
    dailyLogStartIndex,
    dailyLogEndIndex
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
    if (dailyLogPage > totalDailyLogPages) {
      setDailyLogPage(totalDailyLogPages);
    }
  }, [dailyLogPage, totalDailyLogPages]);

  useEffect(() => {
    setDailyLogPage(1);
  }, [
    dailyLogPageSize,
    dailyLogSort,
    dailyLogStatusFilter,
    dailyLogMonthFilter,
    dailyLogWalletFilter,
    dailyLogTagFilter,
  ]);

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

  function resetDailyLogTableView() {
    setDailyLogSort("date-desc");
    setDailyLogStatusFilter("all");
    setDailyLogMonthFilter("all");
    setDailyLogWalletFilter("all");
    setDailyLogTagFilter("all");
    setDailyLogPage(1);
  }

  function scrollFormIntoView() {
    window.requestAnimationFrame(() => {
      formSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }

  function openAddFormForDate(dateString = getTodayInputValue(), shouldScroll = true) {
    setEditingDate(null);
    setIsFormOpen(true);
    setFormData(createEmptyForm(dateString));
    setShowAdvancedTracking(false);
    setShowDayEffects(false);
    setSelectedRecordDate(dateString);

    const weekStart = getWeekStart(dateString);
    setSelectedWeekStart(formatDateForInput(weekStart));

    setError("");
    setSuccessMessage("");

    if (shouldScroll) {
      scrollFormIntoView();
    }
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
      online_hours: decimalHoursToHHMM(record.online_hours),
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

      day_tags: record.day_tags || [],
    });

    setShowAdvancedTracking(
      record.start_odometer !== null ||
        record.end_work_odometer !== null ||
        record.end_home_odometer !== null ||
        record.work_start_time !== null ||
        record.uber_stop_time !== null ||
        record.home_end_time !== null
    );

    // Auto-expand Day Effects only if this record already has tags, so
    // editing a tagged day surfaces them, but editing an untagged day keeps
    // the form compact.
    setShowDayEffects(Array.isArray(record.day_tags) && record.day_tags.length > 0);

    setError("");
    setSuccessMessage("");
  }

  function cancelEdit() {
    setEditingDate(null);
    setIsFormOpen(false);
    setFormData(createEmptyForm());
    setShowAdvancedTracking(false);
    setShowDayEffects(false);
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

    const onlineHoursResult = hhmmToDecimalHours(formData.online_hours);

    if (onlineHoursResult.error) {
      setError(onlineHoursResult.error);
      return;
    }

    const newRecord = {
      date: formData.date,
      online_hours: onlineHoursResult.decimalHours,
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

      day_tags:
        formData.day_tags && formData.day_tags.length > 0 ? formData.day_tags : null,
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

      setFormData(createEmptyForm());
      setShowAdvancedTracking(false);
      setShowDayEffects(false);
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
        setFormData(createEmptyForm());
        setShowAdvancedTracking(false);
        setShowDayEffects(false);
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
        <p className="eyebrow">Uber Dashboard v3.2</p>
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
                  {isSelectedDayMode ? "Selected day" : "Weekly earnings"}
                </p>

                <div className="week-nav">
                  <button type="button" onClick={() => changeWeek(-7)}>
                    ←
                  </button>

                  <h2>
                    {isSelectedDayMode
                      ? formatRecordDate(selectedChartDay.date)
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
              <p>{isSelectedDayMode ? "Day total" : "Week total"}</p>
              <h3>
                <AnimatedNumber
                  value={displayedTotalEarnings}
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
                  className={`weekly-bar-item clickable-weekly-bar ${
                    selectedRecordDate === day.date ? "selected-weekly-bar" : ""
                  } ${day.hasRecord ? "" : "no-record-weekly-bar"}`}
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
                  value={displayedOnlineHours}
                  format={formatHoursAndMinutes}
                />
              </strong>
            </div>

            <div>
              <p>Real work</p>
              <strong>
                {displayedRealWorkHours !== null && displayedRealWorkHours !== undefined ? (
                  <AnimatedNumber value={displayedRealWorkHours} format={formatHoursAndMinutes} />
                ) : (
                  "—"
                )}
              </strong>
            </div>

            <div>
              <p>Trips</p>
              <strong>
                <AnimatedNumber
                  value={displayedTrips}
                  format={(v) => Math.round(v)}
                />
              </strong>
            </div>

            <div>
              <p>Online $/hr</p>
              <strong>
                <AnimatedNumber
                  value={displayedAverageHourly}
                  format={(v) => `$${v.toFixed(2)}`}
                />
              </strong>
            </div>

            <div>
              <p>Real $/hr</p>
              <strong>
                {displayedEarningsPerRealHour !== null ? (
                  <AnimatedNumber
                    value={displayedEarningsPerRealHour}
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
                      value={displayedTotalEarnings}
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
                      value={displayedNetFare}
                      format={(v) => `$${v.toFixed(2)}`}
                    />
                  </strong>
                  <span className="legend-percent legend-percent-fare">
                    <AnimatedNumber
                      value={displayedFareShare}
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
                      value={displayedTips}
                      format={(v) => `$${v.toFixed(2)}`}
                    />
                  </strong>
                  <span className="legend-percent legend-percent-tip">
                    <AnimatedNumber
                      value={displayedTipShare}
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
                      value={displayedPromotions}
                      format={(v) => `$${v.toFixed(2)}`}
                    />
                  </strong>
                  <span className="legend-percent legend-percent-promo">
                    <AnimatedNumber
                      value={displayedPromoShare}
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
                  {displayedWorkMiles !== null ? (
                    <AnimatedNumber value={displayedWorkMiles} format={(v) => v.toFixed(1)} />
                  ) : (
                    "—"
                  )}
                </strong>
              </div>

              <div>
                <p>$/work mile</p>
                <strong>
                  {displayedEarningsPerWorkMile !== null && displayedEarningsPerWorkMile !== undefined ? (
                    <AnimatedNumber value={displayedEarningsPerWorkMile} format={(v) => `$${v.toFixed(2)}`} />
                  ) : (
                    "—"
                  )}
                </strong>
              </div>

              <div>
                <p>Miles/trip</p>
                <strong>
                  {displayedMilesPerTrip !== null ? (
                    <AnimatedNumber value={displayedMilesPerTrip} format={(v) => v.toFixed(1)} />
                  ) : (
                    "—"
                  )}
                </strong>
              </div>

              <div>
                <p>Wallet Δ</p>
                <strong className="wallet-delta-text">
                  {displayedWalletDelta !== null && displayedWalletDelta !== undefined ? (
                    <AnimatedNumber
                      value={displayedWalletDelta}
                      format={(v) => `${v >= 0 ? "+" : "−"}$${Math.abs(v).toFixed(2)}`}
                    />
                  ) : (
                    "—"
                  )}
                </strong>
                <span className="wallet-delta-subtext">
                  {displayedWalletDeltaSubtext}
              </span>
            </div>
          </div>
        </div>

          {(selectedRecordIsInVisibleWeek || selectedEmptyDayIsInVisibleWeek) && (
            <div className="selected-day-extra">
              {selectedRecordIsInVisibleWeek ? (
                <>
                  <div className="selected-day-footer-top">
                    <div className="selected-day-details">
                      <div className="label-row">
                        <LabelChip label={selectedRecord.hourly_label} record={selectedRecord} />
                        <LabelChip label={selectedRecord.promo_label} record={selectedRecord} />
                        <LabelChip label={selectedRecord.tip_label} record={selectedRecord} />
                        <LabelChip label={selectedRecord.mileage_label} record={selectedRecord} />
                      </div>
                    </div>

                    <div className="selected-day-footer-right">
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

                      <div className="selected-day-action-row">
                        <button
                          type="button"
                          className="edit-button selected-day-action-button"
                          onClick={() => handleEdit(selectedRecord)}
                        >
                          Edit this day
                        </button>

                        <button
                          type="button"
                          className="delete-button selected-day-action-button"
                          onClick={() => handleDelete(selectedRecord.date)}
                        >
                          Delete this day
                        </button>
                      </div>
                    </div>
                  </div>

                  {Array.isArray(selectedRecord.day_tags) && selectedRecord.day_tags.length > 0 && (
                    <div className="day-tag-display-row">
                      {selectedRecord.day_tags.map((tag) => (
                        <DayTagChip tagValue={tag} key={tag} />
                      ))}
                    </div>
                  )}

                  {selectedRecord.notes && (
                    <div className="recap-notes">
                      <strong>Notes:</strong>
                      <p>{selectedRecord.notes}</p>
                    </div>
                  )}
                </>
              ) : (
                <div className="selected-day-empty">
                  <div>
                    <strong>No log for {formatRecordDate(selectedEmptyChartDay.date)}</strong>
                    <p>Add this missing day directly from the chart instead of opening the date picker manually.</p>
                  </div>

                  <button
                    type="button"
                    className="primary-button"
                    onClick={() => openAddFormForDate(selectedEmptyChartDay.date)}
                  >
                    + Add log for this day
                  </button>
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
                onClick={() => openAddFormForDate(getTodayInputValue(), false)}
              >
                + Add daily log
              </button>
            )}

            {dailyRecords.length > 0 && (
              <button
                type="button"
                className={`daily-log-toggle-button ${
                  isDailyLogToolsOpen || hasCustomDailyLogTableView
                    ? "daily-log-toggle-button-active"
                    : ""
                }`}
                onClick={() => setIsDailyLogToolsOpen((currentValue) => !currentValue)}
                aria-expanded={isDailyLogToolsOpen}
                aria-controls="daily-log-tools"
              >
                {isDailyLogToolsOpen
                  ? "Hide filters"
                  : hasCustomDailyLogTableView
                    ? "Filters active"
                    : "Filter / sort"}
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

          <div className="form-toggle-row">
            <button
              type="button"
              className="advanced-toggle-button"
              onClick={() => setShowAdvancedTracking((currentValue) => !currentValue)}
            >
              {showAdvancedTracking ? "Hide advanced tracking" : "Show advanced tracking"}
            </button>

            <button
              type="button"
              className="day-effects-toggle-button"
              onClick={() => setShowDayEffects((currentValue) => !currentValue)}
              aria-expanded={showDayEffects}
            >
              {showDayEffects ? "Hide day effects" : "Show day effects"}
              {(formData.day_tags || []).length > 0 && (
                <span className="day-effects-count">{formData.day_tags.length}</span>
              )}
            </button>
          </div>

          {showDayEffects && (
            <div className="day-tags-section">
              <div className="advanced-section-heading">
                <h3>Day effects</h3>
                <p>
                  Optional tags for context — conditions that affected this
                  shift, separate from the raw numbers above.
                </p>
              </div>

              {DAY_TAG_GROUPS.map((group) => (
                <div className="day-tag-group" key={group.group}>
                  <span className="day-tag-group-label">
                    <DayTagIcon category={group.category} />
                    {group.group}
                  </span>
                  <div className="day-tag-chip-row">
                    {group.tags.map((tag) => {
                      const isSelected = (formData.day_tags || []).includes(tag.value);

                      return (
                        <span className="day-tag-tooltip-wrap" key={tag.value}>
                          <button
                            type="button"
                            className={`day-tag-toggle ${isSelected ? "day-tag-toggle-active" : ""}`}
                            onClick={(event) => {
                              toggleDayTag(tag.value);
                              event.currentTarget.blur();
                            }}
                            aria-pressed={isSelected}
                          >
                            {tag.label}
                          </button>
                          <span className="day-tag-tooltip" role="tooltip">
                            <strong className="day-tag-tooltip-title">{tag.label}</strong>
                            <span className="day-tag-tooltip-body">{getDayTagTooltip(tag.value)}</span>
                          </span>
                        </span>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}

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

        {dailyRecords.length > 0 && !isDailyLogToolsOpen && hasCustomDailyLogTableView && (
          <div className="daily-log-active-summary">
            <span>
              Showing {totalFilteredDailyLogs} of {dailyRecords.length} logs
              {activeDailyLogViewParts.length > 0 ? ` · ${activeDailyLogViewParts.join(" · ")}` : ""}
            </span>
            <button type="button" onClick={resetDailyLogTableView}>
              Reset
            </button>
          </div>
        )}

        {dailyRecords.length > 0 && isDailyLogToolsOpen && (
          <div className="daily-log-tools" id="daily-log-tools">
            <div className="daily-log-tools-header">
              <div>
                <h3>Filter and sort logs</h3>
                <p>Use this when you want the best days, worst days, or a narrower slice.</p>
              </div>

              <button
                type="button"
                className="reset-table-view-button"
                onClick={resetDailyLogTableView}
                disabled={!hasCustomDailyLogTableView}
              >
                Reset view
              </button>
            </div>

            <div className="daily-log-controls">
              <label>
                Sort by
                <select
                  value={dailyLogSort}
                  onChange={(event) => setDailyLogSort(event.target.value)}
                >
                  {DAILY_LOG_SORT_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                Status
                <select
                  value={dailyLogStatusFilter}
                  onChange={(event) => setDailyLogStatusFilter(event.target.value)}
                >
                  <option value="all">All statuses</option>
                  {dailyLogStatusOptions.map((status) => (
                    <option key={status} value={status}>
                      {status}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                Month
                <select
                  value={dailyLogMonthFilter}
                  onChange={(event) => setDailyLogMonthFilter(event.target.value)}
                >
                  <option value="all">All months</option>
                  {dailyLogMonthOptions.map((month) => (
                    <option key={month.value} value={month.value}>
                      {month.label}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                Wallet
                <select
                  value={dailyLogWalletFilter}
                  onChange={(event) => setDailyLogWalletFilter(event.target.value)}
                >
                  <option value="all">All wallet logs</option>
                  <option value="logged">Wallet logged only</option>
                  <option value="missing">Wallet missing only</option>
                </select>
              </label>

              <label>
                Day effect
                <select
                  value={dailyLogTagFilter}
                  onChange={(event) => setDailyLogTagFilter(event.target.value)}
                >
                  <option value="all">All day effects</option>
                  {DAY_TAG_GROUPS.map((group) => (
                    <optgroup label={group.group} key={group.group}>
                      {group.tags.map((tag) => (
                        <option key={tag.value} value={tag.value}>
                          {tag.label}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </label>
            </div>

            <p className="daily-log-filter-summary">
              {hasActiveDailyLogFilters
                ? `${totalFilteredDailyLogs} of ${dailyRecords.length} daily logs match`
                : `${dailyRecords.length} daily logs`}
            </p>
          </div>
        )}

        <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Total</th>
              <th>Online $/hr</th>
              <th>Trips</th>
              <th>$/mile</th>
              <th>Status</th>
              <th>Effects</th>
              <th>Actions</th>
            </tr>
          </thead>

          <tbody>
            {dailyRecords.length === 0 ? (
              <tr>
                <td colSpan="8" className="empty-table-cell">
                  No daily logs yet.
                </td>
              </tr>
            ) : paginatedDailyRecords.length === 0 ? (
              <tr>
                <td colSpan="8" className="empty-table-cell">
                  No daily logs match the current filters.
                </td>
              </tr>
            ) : (
              paginatedDailyRecords.map((record) => (
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
                      <LabelChip label={record.hourly_label} record={record} />
                      <LabelChip label={record.promo_label} record={record} />
                      <LabelChip label={record.mileage_label} record={record} />
                    </div>
                  </td>
                  <td>
                    {Array.isArray(record.day_tags) && record.day_tags.length > 0 ? (
                      <div className="table-day-tags">
                        {record.day_tags.slice(0, 2).map((tag) => (
                          <DayTagChip tagValue={tag} inTable key={tag} />
                        ))}
                        {record.day_tags.length > 2 && (
                          <DayTagOverflowChip tagValues={record.day_tags.slice(2)} />
                        )}
                      </div>
                    ) : (
                      <span className="table-day-tags-empty">—</span>
                    )}
                  </td>
                  <td>
                    <div className="table-actions">
                      <button
                        type="button"
                        className="view-button table-icon-button"
                        title={selectedRecordDate === record.date ? "Hide" : "View"}
                        aria-label={selectedRecordDate === record.date ? "Hide" : "View"}
                        onClick={() => {
                          if (selectedRecordDate === record.date) {
                            setSelectedRecordDate(null);
                          } else {
                            selectRecordAndWeek(record.date);
                            window.scrollTo({ top: 0, behavior: "smooth" });
                          }
                        }}
                      >
                        {selectedRecordDate === record.date ? <HideIcon /> : <ViewIcon />}
                      </button>

                      <button
                        type="button"
                        className="edit-button table-icon-button"
                        title="Edit"
                        aria-label="Edit"
                        onClick={() => handleEdit(record)}
                      >
                        <EditIcon />
                      </button>

                      <button
                        type="button"
                        className="delete-button table-icon-button"
                        title="Delete"
                        aria-label="Delete"
                        onClick={() => handleDelete(record.date)}
                      >
                        <DeleteIcon />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        </div>

        {dailyRecords.length > 0 && totalFilteredDailyLogs > 0 && (
          <div className="table-pagination">
            <p>
              Showing {dailyLogStartIndex + 1}–{dailyLogEndIndex} of {totalFilteredDailyLogs}
              {hasActiveDailyLogFilters ? ` filtered from ${dailyRecords.length}` : ""}
            </p>

            <div className="table-pagination-controls">
              <label className="rows-per-page-label">
                Rows per page
                <select
                  value={dailyLogPageSize}
                  onChange={(event) => setDailyLogPageSize(Number(event.target.value))}
                >
                  {DAILY_LOG_PAGE_SIZE_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>

              <div className="page-step-controls">
                <button
                  type="button"
                  onClick={() => setDailyLogPage((currentPage) => Math.max(currentPage - 1, 1))}
                  disabled={safeDailyLogPage === 1}
                >
                  ← Previous
                </button>

                <span>
                  Page {safeDailyLogPage} of {totalDailyLogPages}
                </span>

                <button
                  type="button"
                  onClick={() =>
                    setDailyLogPage((currentPage) =>
                      Math.min(currentPage + 1, totalDailyLogPages)
                    )
                  }
                  disabled={safeDailyLogPage === totalDailyLogPages}
                >
                  Next →
                </button>
              </div>
            </div>
          </div>
        )}

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