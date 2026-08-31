import { Component, useEffect, useRef, useState } from "react";
import "./App.css";

// Production is served by FastAPI from the same origin, including when the
// desktop is reached privately through Tailscale.  Keeping this empty makes
// every request use /api on the page's current host instead of accidentally
// treating the phone itself (127.0.0.1) as the backend.  Developers can still
// override it explicitly for an unusual split-host setup.
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "";
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
    group: "Order quality & mix",
    category: "orders",
    tags: [
      { value: "good_orders", label: "Good orders" },
      { value: "bad_orders", label: "Bad orders" },
      { value: "shop_and_deliver", label: "Shop and Deliver" },
      { value: "delivery_heavy", label: "Delivery-heavy" },
      { value: "mixed_orders", label: "Mixed orders" },
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

// A few seconds of input/rounding drift should not create noise. Fifteen
// minutes is large enough to indicate a likely missing/incorrect session.
const REAL_WORK_WARNING_TOLERANCE_HOURS = 0.25;

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
  shop_and_deliver: "Shop and Deliver requests were a meaningful part of the shift — useful context when fewer, longer trips produced stronger earnings per trip.",
  delivery_heavy: "The shift was dominated by standard pickup-and-delivery requests rather than Shop and Deliver orders.",
  mixed_orders: "The shift included a meaningful mix of standard deliveries and Shop and Deliver orders.",

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

// Keep a notification mounted just long enough to animate away after its
// parent clears the message. This gives desktop and mobile the same motion
// without delaying the underlying success/error state or its auto-dismiss
// timer.
function AnimatedNotification({ message, type }) {
  const [visibleMessage, setVisibleMessage] = useState(message);
  const [isLeaving, setIsLeaving] = useState(false);
  const exitTimerRef = useRef(null);

  useEffect(() => {
    window.clearTimeout(exitTimerRef.current);

    if (message) {
      setVisibleMessage(message);
      setIsLeaving(false);
      return undefined;
    }

    if (visibleMessage) {
      setIsLeaving(true);
      exitTimerRef.current = window.setTimeout(() => {
        setVisibleMessage("");
        setIsLeaving(false);
      }, 200);
    }

    return () => window.clearTimeout(exitTimerRef.current);
  }, [message, visibleMessage]);

  if (!visibleMessage) return null;

  return (
    <p
      key={visibleMessage}
      className={`${type} app-notification ${isLeaving ? "app-notification-leaving" : ""}`}
      role={type === "error" ? "alert" : "status"}
    >
      {type === "error" ? `Error: ${visibleMessage}` : visibleMessage}
    </p>
  );
}

function QuestTierProgress({ quest, className = "" }) {
  const finalTarget = Math.max(Number(quest.final_tier_trips) || 0, 1);
  const firstTarget = Math.min(
    Math.max(Number(quest.first_tier_trips) || 0, 0),
    finalTarget
  );
  const progress = Math.min(
    Math.max(Number(quest.progress_trips) || 0, 0),
    finalTarget
  );
  const firstTierPosition = (firstTarget / finalTarget) * 100;
  const firstTierFill = (Math.min(progress, firstTarget) / finalTarget) * 100;
  const finalTierFill =
    (Math.max(progress - firstTarget, 0) / finalTarget) * 100;

  return (
    <span
      className={`quest-progress-track quest-tier-progress ${progress >= firstTarget ? "first-tier-reached" : ""} ${progress >= finalTarget ? "final-tier-reached" : ""} ${className}`.trim()}
      role="progressbar"
      aria-label={`${progress} of ${finalTarget} quest trips; first tier at ${firstTarget} trips`}
      aria-valuemin="0"
      aria-valuemax={finalTarget}
      aria-valuenow={progress}
      title={`First tier at ${firstTarget} trips · Final tier at ${finalTarget} trips`}
    >
      <span
        className="quest-tier-fill quest-tier-fill-first"
        style={{ width: `${firstTierFill}%` }}
      ></span>
      <span
        className="quest-tier-fill quest-tier-fill-final"
        style={{ left: `${firstTierPosition}%`, width: `${finalTierFill}%` }}
      ></span>
      <span
        className="quest-tier-marker"
        style={{ left: `${firstTierPosition}%` }}
        aria-hidden="true"
      ></span>
    </span>
  );
}

const QUEST_CONFETTI_PARTICLES = [
  [-132, -62, -220, 0], [-104, -94, 170, 40], [-72, -72, -130, 90],
  [-38, -104, 230, 20], [-8, -78, -190, 110], [30, -108, 150, 55],
  [62, -76, -250, 125], [96, -98, 210, 75], [128, -58, -160, 15],
  [-118, -20, 190, 130], [-78, -34, -210, 165], [74, -28, 240, 145],
  [116, -16, -180, 105], [-48, -46, 140, 190], [42, -52, -230, 175],
  [4, -118, 260, 150],
];

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

function getCurrentTimeParts() {
  const now = new Date();
  const hours = now.getHours();
  const minutes = String(now.getMinutes()).padStart(2, "0");
  const meridiem = hours >= 12 ? "PM" : "AM";
  const displayHour = hours % 12 || 12;

  return {
    stored: `${displayHour}:${minutes} ${meridiem}`,
    display: `${displayHour}:${minutes} ${meridiem}`,
  };
}

function createMobileEventId(prefix) {
  if (window.crypto?.randomUUID) {
    return `${prefix}-${window.crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function formatCompletedTripTime(timestamp) {
  const parsed = new Date(timestamp);
  if (Number.isNaN(parsed.getTime())) return "Recently";
  return parsed.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatMobileDate(dateString) {
  return new Date(`${dateString}T00:00:00`).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function createEmptyBreak() {
  return {
    start_time_value: "",
    start_time_meridiem: "PM",
    end_time_value: "",
    end_time_meridiem: "PM",
    start_odometer: "",
    end_odometer: "",
  };
}

function createEmptyWorkSession() {
  return {
    start_time_value: "",
    start_time_meridiem: "PM",
    stop_time_value: "",
    stop_time_meridiem: "PM",
    start_odometer: "",
    stop_odometer: "",
  };
}

function createEmptyQuestForm() {
  return {
    start_date: "",
    end_date: "",
    first_tier_trips: "",
    first_tier_bonus: "",
    final_tier_trips: "",
    final_additional_bonus: "",
  };
}

function createEmptyForm(date = getTodayInputValue()) {
  return {
    date,
    online_hours: "",
    trips: "",
    net_fare: "",
    tips: "",
    cash_tips: "",
    promotions: "",

    end_home_odometer: "",

    home_end_time_value: "",
    home_end_time_meridiem: "PM",

    wallet_balance: "",
    notes: "",

    day_tags: [],
    breaks: [],
    work_sessions: [createEmptyWorkSession()],
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

  "Organic earnings": "neutral",
  "Promo helped": "success",
  "Promo-boosted": "warning",

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

function getVisiblePromoLabel(record) {
  if (!record || Number(record.promotions) <= 0) {
    return null;
  }

  return record.promo_label;
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
  const tipAmount = record
    ? formatTooltipCurrency((record.tips || 0) + (record.cash_tips || 0))
    : "not available";
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
    "Promo-boosted": {
      metric: `Promotions: ${promoAmount} (${promoShare})`,
      range: "Promo-boosted: 25%+ of earnings from promotions",
      body: "Promotions provided a substantial boost to this day's total Uber earnings.",
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

const HOURLY_RECAP_SIGNALS = {
  "Strong hourly": { rank: 4, opening: "Strong online hourly", adjective: "strong" },
  "Good hourly": { rank: 3, opening: "Good online hourly", adjective: "good" },
  "Acceptable hourly": { rank: 2, opening: "Acceptable online hourly", adjective: "acceptable" },
  "Weak hourly": { rank: 1, opening: "Weak online hourly", adjective: "weak" },
  "Bad hourly": { rank: 0, opening: "Low online hourly", adjective: "low" },
};

function getHourlyLabelFromRate(hourlyRate) {
  if (hourlyRate === null || hourlyRate === undefined || Number.isNaN(Number(hourlyRate))) {
    return null;
  }

  if (hourlyRate >= 30) return "Strong hourly";
  if (hourlyRate >= 25) return "Good hourly";
  if (hourlyRate >= 20) return "Acceptable hourly";
  if (hourlyRate >= 15) return "Weak hourly";
  return "Bad hourly";
}

// Produces one deliberately modest interpretation from already-computed
// metrics. It is not meant to replace the user's notes: one supporting
// signal and one caveat is the maximum, and tagged effects are described as
// observations rather than asserted as the cause of a result.
function buildDailyQuickRecap(record, quest, hasRealWorkShortfall) {
  if (!record) {
    return null;
  }

  const onlineSignal = HOURLY_RECAP_SIGNALS[record.hourly_label];
  if (!onlineSignal) {
    return null;
  }

  const tags = new Set(Array.isArray(record.day_tags) ? record.day_tags : []);
  const supports = [];
  const cautions = [];

  const realHourlyLabel = getHourlyLabelFromRate(record.earnings_per_real_work_hour);
  const realSignal = HOURLY_RECAP_SIGNALS[realHourlyLabel];
  if (realSignal && realSignal.rank !== onlineSignal.rank) {
    const realHourlyPhrase = `${realSignal.adjective} real-work hourly`;
    if (realSignal.rank > onlineSignal.rank) {
      supports.push(realHourlyPhrase);
    } else {
      cautions.push(`real-work hourly was ${realSignal.adjective}`);
    }
  }

  if (record.tip_label === "Tip-carried") {
    supports.push("tips making up at least half of earnings");
  } else if (record.tip_label === "Solid tips") {
    supports.push("solid tips");
  } else if (record.tip_label === "Weak tips") {
    cautions.push("tip share was low");
  }

  if (record.promo_label === "Promo-boosted") {
    supports.push("a substantial promotion boost");
  } else if (record.promo_label === "Promo helped") {
    supports.push("promotions adding a meaningful boost");
  }

  const taggedMileageContext = tags.has("dead_zone")
    ? "dead-zone driving was also tagged"
    : tags.has("heavy_traffic")
      ? "heavy traffic was also tagged"
      : null;

  if (record.mileage_label === "Strong mileage") {
    supports.push("strong mileage efficiency");
  } else if (record.mileage_label === "Solid mileage") {
    supports.push("solid mileage efficiency");
  } else if (record.mileage_label === "Questionable mileage") {
    cautions.push(
      `mileage efficiency was borderline${taggedMileageContext ? `; ${taggedMileageContext}` : ""}`
    );
  } else if (record.mileage_label === "Weak mileage") {
    cautions.push(
      `mileage efficiency was weak${taggedMileageContext ? `; ${taggedMileageContext}` : ""}`
    );
  } else if (record.mileage_label === "Mileage not logged") {
    cautions.push("mileage efficiency was not available");
  }

  if (quest) {
    const tripWord = record.trips === 1 ? "trip" : "trips";
    if (quest.status === "Completed") {
      supports.unshift(`${record.trips} ${tripWord} toward a completed quest`);
    } else if (quest.status === "Active") {
      supports.unshift(`${record.trips} ${tripWord} toward an active quest`);
    } else if (quest.status === "Failed") {
      cautions.unshift("the overlapping quest ultimately finished short");
    }
  }

  const positiveEffectPhrases = [
    ["shop_and_deliver", "Shop and Deliver noted in the order mix"],
    ["high_demand", "high demand tagged"],
    ["good_orders", "good orders tagged"],
    ["delivery_heavy", "a delivery-heavy order mix"],
    ["mixed_orders", "a mixed order profile"],
  ];
  const cautionEffectPhrases = [
    ["low_demand", "low demand was tagged"],
    ["bad_orders", "bad orders were tagged"],
    ["app_issues", "app issues were tagged"],
    ["phone_hotspot_issues", "connectivity issues were tagged"],
    ["low_battery", "low battery was tagged"],
    ["snow", "snow was tagged"],
    ["rain", "rain was tagged"],
  ];

  const positiveEffect = positiveEffectPhrases.find(([tag]) => tags.has(tag));
  const cautionEffect = cautionEffectPhrases.find(([tag]) => tags.has(tag));
  if (positiveEffect) {
    supports.push(positiveEffect[1]);
  }
  if (cautionEffect) {
    cautions.push(cautionEffect[1]);
  }

  if (hasRealWorkShortfall) {
    cautions.unshift("real work was shorter than Uber online time");
  }

  const support = supports[0] || null;
  const caution = cautions[0] || null;
  if (!support && !caution) {
    return null;
  }

  const opening = support
    ? `${onlineSignal.opening} with ${support}`
    : onlineSignal.opening;

  return `${opening}${caution ? `, while ${caution}` : ""}.`;
}

function getMileageLabelFromRate(earningsPerWorkMile) {
  if (
    earningsPerWorkMile === null ||
    earningsPerWorkMile === undefined ||
    Number.isNaN(Number(earningsPerWorkMile))
  ) {
    return "Mileage not logged";
  }

  if (earningsPerWorkMile >= 1.5) return "Strong mileage";
  if (earningsPerWorkMile >= 1) return "Solid mileage";
  if (earningsPerWorkMile >= 0.75) return "Questionable mileage";
  return "Weak mileage";
}

function buildWeeklyPatternSentence(records, onlineHourly, realHourly, trackingWarningCount) {
  if (!Array.isArray(records) || records.length === 0) {
    return null;
  }

  if (trackingWarningCount > 0) {
    const dayWord = trackingWarningCount === 1 ? "day has" : "days have";
    return (
      `${trackingWarningCount} ${dayWord} real-work time shorter than Uber ` +
      "online time, so its session or break tracking may need review."
    );
  }

  const totalEarnings = records.reduce(
    (total, record) => total + record.total_earnings,
    0
  );
  const standoutRecord = [...records].sort(
    (left, right) => right.total_earnings - left.total_earnings
  )[0];
  const standoutShare =
    totalEarnings > 0 ? standoutRecord.total_earnings / totalEarnings : 0;

  if (records.length >= 3 && standoutShare > 0.4) {
    const standoutDay = new Date(
      `${standoutRecord.date}T00:00:00`
    ).toLocaleDateString("en-US", { weekday: "long" });
    return (
      `${standoutDay} produced ${Math.round(standoutShare * 100)}% of weekly ` +
      "earnings and was the standout day."
    );
  }

  const hourlyGapRate =
    onlineHourly > 0 && realHourly !== null && realHourly !== undefined
      ? (onlineHourly - realHourly) / onlineHourly
      : null;
  if (hourlyGapRate !== null && Math.abs(hourlyGapRate) >= 0.15) {
    if (hourlyGapRate > 0) {
      return (
        `Real-work hourly was ${Math.round(hourlyGapRate * 100)}% below online ` +
        "hourly after including additional tracked work time."
      );
    }

    return (
      `Real-work hourly was ${Math.round(Math.abs(hourlyGapRate) * 100)}% above ` +
      "online hourly after break-adjusted time."
    );
  }

  const effectCounts = new Map();
  records.forEach((record) => {
    (record.day_tags || [])
      .filter((tag) => tag !== "quest_day")
      .forEach((tag) => {
        effectCounts.set(tag, (effectCounts.get(tag) || 0) + 1);
      });
  });
  const effectPriority = [
    "dead_zone",
    "shop_and_deliver",
    "heavy_traffic",
    "high_demand",
    "low_demand",
    "good_orders",
    "bad_orders",
  ];
  const repeatedEffect = [...effectCounts.entries()]
    .filter(([, count]) => count >= 2)
    .sort((left, right) => {
      if (right[1] !== left[1]) {
        return right[1] - left[1];
      }

      const leftPriority = effectPriority.indexOf(left[0]);
      const rightPriority = effectPriority.indexOf(right[0]);
      return (
        (leftPriority === -1 ? effectPriority.length : leftPriority) -
        (rightPriority === -1 ? effectPriority.length : rightPriority)
      );
    })[0];

  if (repeatedEffect) {
    const [tag, count] = repeatedEffect;
    return (
      `${getDayTagLabel(tag)} was the most repeated effect, tagged on ${count} ` +
      `of ${records.length} active days.`
    );
  }

  if (records.length === 1) {
    return "Only one active day was logged this week.";
  }

  const meanDailyEarnings = totalEarnings / records.length;
  const variance =
    records.reduce(
      (total, record) =>
        total + Math.pow(record.total_earnings - meanDailyEarnings, 2),
      0
    ) / records.length;
  const coefficientOfVariation =
    meanDailyEarnings > 0 ? Math.sqrt(variance) / meanDailyEarnings : 0;

  if (coefficientOfVariation <= 0.2) {
    return `Daily earnings were consistent across ${records.length} active days.`;
  }
  if (coefficientOfVariation >= 0.35) {
    return `Daily earnings were uneven across ${records.length} active days.`;
  }

  return null;
}

// Weekly counterpart to the daily recap. It stays narrow: one verdict, the
// dominant earnings source plus quest state, and at most one internal
// week-pattern observation.
function buildWeeklyQuickRecap({
  activeDays,
  totalEarnings,
  onlineHourly,
  realHourly,
  earningsPerWorkMile,
  fareShare,
  tipShare,
  promoShare,
  questStatus,
  records,
  trackingWarningCount,
}) {
  if (activeDays === 0 || totalEarnings <= 0) {
    return null;
  }

  const hourlyBasis = realHourly !== null && realHourly !== undefined
    ? "Real-work"
    : "Online";
  const hourlyLabel = getHourlyLabelFromRate(realHourly ?? onlineHourly);
  const hourlySignal = HOURLY_RECAP_SIGNALS[hourlyLabel];
  const mileageLabel = getMileageLabelFromRate(earningsPerWorkMile);
  const mileageSignals = {
    "Strong mileage": { rank: 3, adjective: "strong" },
    "Solid mileage": { rank: 2, adjective: "solid" },
    "Questionable mileage": { rank: 1, adjective: "borderline" },
    "Weak mileage": { rank: 0, adjective: "weak" },
    "Mileage not logged": { rank: -1, adjective: "unavailable" },
  };
  const mileageSignal = mileageSignals[mileageLabel];

  let verdict = "Acceptable week";
  if (hourlySignal.rank >= 3 && mileageSignal.rank >= 2) {
    verdict = "Strong week";
  } else if (hourlySignal.rank >= 3 && mileageSignal.rank >= 0) {
    verdict = "High-hourly but mileage-heavy week";
  } else if (hourlySignal.rank >= 2 && mileageSignal.rank >= 2) {
    verdict = "Good week";
  } else if (hourlySignal.rank <= 1 || mileageSignal.rank === 0) {
    verdict = "Weak week";
  } else if (hourlySignal.rank >= 3 && mileageSignal.rank === -1) {
    verdict = "Good week by hourly performance";
  }

  const verdictSentence =
    `${verdict}: ${hourlyBasis} hourly was ${hourlySignal.adjective} and ` +
    `mileage efficiency was ${mileageSignal.adjective}.`;

  const dominantShare = [
    { key: "fare", label: "Net fare", share: fareShare },
    { key: "tips", label: "Tips", share: tipShare },
    { key: "promotions", label: "Promotions", share: promoShare },
  ].sort((left, right) => right.share - left.share)[0];
  const dominantPercent = Math.round(dominantShare.share * 100);

  let reasonClause;
  if (dominantShare.key === "tips" && dominantShare.share >= 0.5) {
    reasonClause = `Tips carried ${dominantPercent}% of earnings`;
  } else if (dominantShare.key === "promotions" && dominantShare.share >= 0.5) {
    reasonClause = `Promotions supplied ${dominantPercent}% of earnings`;
  } else {
    reasonClause =
      `${dominantShare.label} was the largest earnings source at ` +
      `${dominantPercent}%`;
  }

  const questClauses = {
    Completed: "the overlapping quest was completed",
    Active: "the overlapping quest remains active",
    Failed: "the overlapping quest finished short",
    Scheduled: "an overlapping quest is scheduled",
  };
  const questClause = questClauses[questStatus] || null;
  const reasonSentence =
    `${reasonClause}${questClause ? `, and ${questClause}` : ""}.`;
  const patternSentence = buildWeeklyPatternSentence(
    records,
    onlineHourly,
    realHourly,
    trackingWarningCount
  );

  return [verdictSentence, reasonSentence, patternSentence]
    .filter(Boolean)
    .join(" ");
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
function AnimatedNumber({ value, format, flash = true }) {
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

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setDisplayValue(endValue);
      previousValueRef.current = endValue;
      setFlashClass("");
      return;
    }

    setFlashClass(
      flash ? (endValue > startValue ? "animated-number-up" : "animated-number-down") : ""
    );

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
  }, [flash, value]);

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
  const [isDailyLogFormClosing, setIsDailyLogFormClosing] = useState(false);
  const dailyLogFormCloseTimerRef = useRef(null);
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
  const [walletFloor, setWalletFloor] = useState(null);
  const [isEditingWalletFloor, setIsEditingWalletFloor] = useState(false);
  const [walletFloorInput, setWalletFloorInput] = useState("");
  const [quests, setQuests] = useState([]);
  const [isQuestManagerOpen, setIsQuestManagerOpen] = useState(false);
  const [editingQuestId, setEditingQuestId] = useState(null);
  const [questForm, setQuestForm] = useState(() => createEmptyQuestForm());
  const [questError, setQuestError] = useState("");
  const [isSavingQuest, setIsSavingQuest] = useState(false);
  const [isEditingWeeklyNote, setIsEditingWeeklyNote] = useState(false);
  const [weeklyNoteDraft, setWeeklyNoteDraft] = useState("");
  const [isSavingWeeklyNote, setIsSavingWeeklyNote] = useState(false);
  const [mobileTab, setMobileTab] = useState("today");
  const [isQuickUpdateOpen, setIsQuickUpdateOpen] = useState(false);
  const [isSavingQuickUpdate, setIsSavingQuickUpdate] = useState(false);
  const [quickUpdateForm, setQuickUpdateForm] = useState({
    trips: "",
    net_fare: "",
    tips: "",
    cash_tips: "",
    promotions: "",
  });
  const [mobileDrafts, setMobileDrafts] = useState([]);
  const [mobileTrackingAction, setMobileTrackingAction] = useState(null);
  const [isSavingMobileTracking, setIsSavingMobileTracking] = useState(false);
  const [deletingMobileSessionIndex, setDeletingMobileSessionIndex] = useState(null);
  const [mobileDraftEditTarget, setMobileDraftEditTarget] = useState(null);
  const [mobileDraftEditError, setMobileDraftEditError] = useState("");
  const [isSavingMobileDraftEdit, setIsSavingMobileDraftEdit] = useState(false);
  const [mobileDraftEditForm, setMobileDraftEditForm] = useState({
    start_time_value: "",
    start_time_meridiem: "PM",
    start_odometer: "",
    end_time_value: "",
    end_time_meridiem: "PM",
    end_odometer: "",
  });
  const [isSavingMobileTrip, setIsSavingMobileTrip] = useState(false);
  const mobileTripSavingRef = useRef(false);
  const [mobileSoundEffectsEnabled, setMobileSoundEffectsEnabled] = useState(() => {
    try {
      return window.localStorage.getItem("uber-mobile-sound-effects") !== "false";
    } catch {
      return true;
    }
  });
  const mobileAudioContextRef = useRef(null);
  const [mobileQuestCelebration, setMobileQuestCelebration] = useState(null);
  const mobileQuestCelebrationTimerRef = useRef(null);
  const [isMobileDraftDetailsOpen, setIsMobileDraftDetailsOpen] = useState(false);
  const [isSavingMobileDraftDetails, setIsSavingMobileDraftDetails] = useState(false);
  const [mobileDraftDetailsError, setMobileDraftDetailsError] = useState("");
  const [mobileDraftDetailsForm, setMobileDraftDetailsForm] = useState({
    day_tags: [],
    notes: "",
  });
  const [mobileNow, setMobileNow] = useState(() => Date.now());
  const [closingMobileSheet, setClosingMobileSheet] = useState(null);
  const mobileSheetCloseTimerRef = useRef(null);
  const [isServerReachable, setIsServerReachable] = useState(true);
  const [installPrompt, setInstallPrompt] = useState(null);
  const [isStandaloneApp, setIsStandaloneApp] = useState(() =>
    window.matchMedia?.("(display-mode: standalone)").matches || false
  );
  const [mobileTrackingForm, setMobileTrackingForm] = useState({
    time_value: "",
    meridiem: "PM",
    odometer: "",
  });
  const [draftBeingFinalizedDate, setDraftBeingFinalizedDate] = useState(null);

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
    (total, record) => total + record.tips + (record.cash_tips || 0),
    0
  );

  const weeklyCashTips = weeklyRecords.reduce(
    (total, record) => total + (record.cash_tips || 0),
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

  const weeklyBreakHours = weeklyRecords.reduce((total, record) => {
    if (record.break_hours === null) {
      return total;
    }

    return total + record.break_hours;
  }, 0);

  const weeklyEarningsPerWorkMile =
    weeklyWorkMiles > 0 ? weeklyTotalEarnings / weeklyWorkMiles : null;

  const weeklyEarningsPerRealHour =
    weeklyRealWorkHours > 0 ? weeklyTotalEarnings / weeklyRealWorkHours : null;

  const weeklyMileageTrackingComplete =
    weeklyRecords.length > 0 &&
    weeklyRecords.every(
      (record) => record.work_miles !== null && record.work_miles !== undefined
    );

  const weeklyRealWorkTrackingComplete =
    weeklyRecords.length > 0 &&
    weeklyRecords.every(
      (record) =>
        record.real_work_hours !== null &&
        record.real_work_hours !== undefined
    );

  const weeklyTrackingWarningCount = weeklyRecords.filter(
    (record) =>
      record.real_work_hours !== null &&
      record.real_work_hours !== undefined &&
      record.online_hours - record.real_work_hours >=
        REAL_WORK_WARNING_TOLERANCE_HOURS
  ).length;

  const currentWeekData = selectedWeekStart
    ? weeks.find((week) => week.week_start === selectedWeekStart)
    : null;

  const mobileDayDate = selectedRecordDate || getTodayInputValue();
  const mobileDayRecord =
    dailyRecords.find((record) => record.date === mobileDayDate) || null;
  const mobileDayQuests = quests
    .filter(
      (quest) =>
        quest.start_date <= mobileDayDate && quest.end_date >= mobileDayDate
    )
    .sort((left, right) => {
      const priority = { Active: 0, Completed: 1, Scheduled: 2, Failed: 3 };
      return (priority[left.status] ?? 4) - (priority[right.status] ?? 4);
    });
  const mobileFeaturedQuest = mobileDayQuests[0] || null;
  const mobileSortedQuests = [...quests].sort((left, right) => {
    const priority = { Active: 0, Scheduled: 1, Completed: 2, Failed: 3 };
    const statusDifference =
      (priority[left.status] ?? 4) - (priority[right.status] ?? 4);
    return statusDifference || right.start_date.localeCompare(left.start_date);
  });
  const activeMobileShift =
    mobileDrafts.find((draft) => draft.date === mobileDayDate) || null;
  const activeMobileSession = activeMobileShift?.sessions?.at(-1) || null;
  const activeMobileBreak = activeMobileSession?.breaks?.at(-1) || null;
  const isMobileSessionRunning = Boolean(
    activeMobileSession && !activeMobileSession.stop_time
  );
  const isMobileBreakRunning = Boolean(
    isMobileSessionRunning && activeMobileBreak && !activeMobileBreak.end_time
  );
  const mobileLiveStartedAt = isMobileBreakRunning
    ? activeMobileBreak?.start_time
    : activeMobileSession?.start_time;
  const mobileDraftTripCount = activeMobileShift?.trip_events?.length || 0;
  const latestMobileTrip = activeMobileShift?.trip_events?.at(-1) || null;
  const mobileFeaturedQuestPreview = mobileFeaturedQuest
    ? {
        ...mobileFeaturedQuest,
        progress_trips:
          mobileFeaturedQuest.progress_trips +
          mobileDrafts.reduce((total, draft) => {
            if (
              draft.date < mobileFeaturedQuest.start_date ||
              draft.date > mobileFeaturedQuest.end_date
            ) {
              return total;
            }
            return total + (draft.trip_events?.length || 0);
          }, 0),
      }
    : null;
  const mobileQuestTierProgress = (() => {
    if (!mobileFeaturedQuestPreview) return null;

    const progress = Math.max(0, Number(mobileFeaturedQuestPreview.progress_trips) || 0);
    const firstTarget = Math.max(0, Number(mobileFeaturedQuestPreview.first_tier_trips) || 0);
    const finalTarget = Math.max(firstTarget, Number(mobileFeaturedQuestPreview.final_tier_trips) || 0);
    const finalTierTarget = Math.max(finalTarget - firstTarget, 0);

    if (progress >= firstTarget && finalTierTarget > 0) {
      return {
        label: progress >= finalTarget ? "Quest complete" : "Final tier",
        progress: Math.min(Math.max(progress - firstTarget, 0), finalTierTarget),
        target: finalTierTarget,
      };
    }

    return {
      label: "First tier",
      progress: Math.min(progress, firstTarget),
      target: firstTarget,
    };
  })();
  const mobileLiveTiming = (() => {
    if (!mobileLiveStartedAt) return { label: null, isFuture: false };
    const parts = splitStoredTime(mobileLiveStartedAt);
    const startMinutes = timeToMinutes(parts.timeValue, parts.meridiem);
    if (startMinutes === null) return { label: null, isFuture: false };
    const now = new Date(mobileNow);
    const start = new Date(`${mobileDayDate}T00:00:00`);
    start.setHours(Math.floor(startMinutes / 60), startMinutes % 60, 0, 0);
    const elapsedMilliseconds = now.getTime() - start.getTime();
    if (elapsedMilliseconds < 0) {
      return {
        label: `−${Math.ceil(Math.abs(elapsedMilliseconds) / 60000)}m`,
        isFuture: true,
      };
    }
    const elapsedMinutes = Math.floor(elapsedMilliseconds / 60000);
    const hours = Math.floor(elapsedMinutes / 60);
    const minutes = elapsedMinutes % 60;
    return {
      label: hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`,
      isFuture: false,
    };
  })();
  const mobileLiveElapsedLabel = mobileLiveTiming.label;

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

  const displayedBreakHours = selectedRecordIsInVisibleWeek
    ? selectedRecord.break_hours
    : selectedEmptyDayIsInVisibleWeek
      ? null
      : weeklyBreakHours > 0
        ? weeklyBreakHours
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
    ? selectedRecord.tips + (selectedRecord.cash_tips || 0)
    : selectedEmptyDayIsInVisibleWeek
      ? 0
      : weeklyTips;

  const displayedCashTips = selectedRecordIsInVisibleWeek
    ? selectedRecord.cash_tips || 0
    : selectedEmptyDayIsInVisibleWeek
      ? 0
      : weeklyCashTips;

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
        getVisiblePromoLabel(record),
        record.mileage_label,
      ])
    )
  )
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b));

  function getRecordStatusLabels(record) {
    return [
      record.hourly_label,
      getVisiblePromoLabel(record),
      record.mileage_label,
    ].filter(Boolean);
  }

  function getMobilePerformanceLabels(record) {
    if (!record) return [];
    return [
      record.hourly_label,
      getVisiblePromoLabel(record),
      record.tip_label,
      record.mileage_label,
    ].filter(Boolean);
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

  const selectedRealWorkShortfall =
    selectedRecordIsInVisibleWeek &&
    selectedRecord.real_work_hours !== null &&
    selectedRecord.real_work_hours !== undefined
      ? selectedRecord.online_hours - selectedRecord.real_work_hours
      : null;

  const shouldWarnRealWorkShortfall =
    selectedRealWorkShortfall !== null &&
    selectedRealWorkShortfall >= REAL_WORK_WARNING_TOLERANCE_HOURS;

  const weekEndDate =
    weeklyChartData.length > 0
      ? new Date(`${weeklyChartData[6].date}T00:00:00`)
      : null;

  const visibleWeekQuests =
    weeklyChartData.length > 0
      ? quests
          .filter(
            (quest) =>
              quest.end_date >= weeklyChartData[0].date &&
              quest.start_date <= weeklyChartData[6].date
          )
          .sort((left, right) => {
            const priority = {
              Active: 0,
              Scheduled: 1,
              Completed: 2,
              Failed: 3,
            };
            return priority[left.status] - priority[right.status];
          })
      : [];

  const selectedDayQuests = isSelectedDayMode
    ? visibleWeekQuests.filter(
        (quest) =>
          quest.start_date <= selectedRecordDate &&
          quest.end_date >= selectedRecordDate
      )
    : [];
  const questPanelQuests = isSelectedDayMode
    ? selectedDayQuests
    : visibleWeekQuests;
  const featuredQuest = questPanelQuests[0] || null;
  const selectedRecordQuest = selectedRecord
    ? quests
        .filter(
          (quest) =>
            quest.start_date <= selectedRecord.date &&
            quest.end_date >= selectedRecord.date
        )
        .sort((left, right) => {
          const priority = {
            Active: 0,
            Completed: 1,
            Failed: 2,
            Scheduled: 3,
          };
          return priority[left.status] - priority[right.status];
        })[0] || null
    : null;
  const selectedDayQuickRecap = buildDailyQuickRecap(
    selectedRecord,
    selectedRecordQuest,
    shouldWarnRealWorkShortfall
  );
  const weeklyRecapQuest =
    ["Completed", "Active", "Failed", "Scheduled"]
      .map((status) =>
        visibleWeekQuests.find((quest) => quest.status === status)
      )
      .find(Boolean) || null;
  const weeklyQuickRecap = buildWeeklyQuickRecap({
    activeDays: weeklyRecords.length,
    totalEarnings: weeklyTotalEarnings,
    onlineHourly: weeklyAverageHourly,
    realHourly: weeklyRealWorkTrackingComplete
      ? weeklyEarningsPerRealHour
      : null,
    earningsPerWorkMile: weeklyMileageTrackingComplete
      ? weeklyEarningsPerWorkMile
      : null,
    fareShare: weeklyFareShare,
    tipShare: weeklyTipShare,
    promoShare: weeklyPromoShare,
    questStatus: weeklyRecapQuest?.status || null,
    records: weeklyRecords,
    trackingWarningCount: weeklyTrackingWarningCount,
  });

  async function fetchDashboardData() {
    try {
      setError("");

      const summaryResponse = await fetch(`${API_BASE_URL}/api/summary`);
      const dailyResponse = await fetch(`${API_BASE_URL}/api/daily`);
      const weeksResponse = await fetch(`${API_BASE_URL}/api/weeks`);
      const questsResponse = await fetch(`${API_BASE_URL}/api/quests`);
      const draftsResponse = await fetch(`${API_BASE_URL}/api/drafts`);

      if (
        !summaryResponse.ok ||
        !dailyResponse.ok ||
        !weeksResponse.ok ||
        !questsResponse.ok ||
        !draftsResponse.ok
      ) {
        throw new Error("Failed to fetch dashboard data.");
      }

      const summaryData = await summaryResponse.json();
      const dailyData = await dailyResponse.json();
      const weeksData = await weeksResponse.json();
      const questsData = await questsResponse.json();
      const draftsData = await draftsResponse.json();

      setSummary(summaryData);
      setDailyRecords(dailyData);
      setWeeks(weeksData);
      setQuests(questsData);
      setMobileDrafts(draftsData);
      setIsServerReachable(true);
    } catch (err) {
      setIsServerReachable(false);
      setError(err.message);
    }
  }

  async function installMobileApp() {
    if (!installPrompt) return;
    await installPrompt.prompt();
    await installPrompt.userChoice;
    setInstallPrompt(null);
  }

  async function fetchWalletFloor() {
    try {
      const response = await fetch(`${API_BASE_URL}/api/settings/wallet-floor`);
      if (!response.ok) return;
      const data = await response.json();
      setWalletFloor(data.uber_wallet_floor);
      setWalletFloorInput(
        data.uber_wallet_floor !== null ? String(data.uber_wallet_floor) : ""
      );
    } catch {
      // Non-critical — the card just won't show floor context if this fails.
    }
  }

  async function saveWalletFloor() {
    const value = Number(walletFloorInput);
    if (Number.isNaN(value) || value < 0) return;

    try {
      const response = await fetch(`${API_BASE_URL}/api/settings/wallet-floor`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uber_wallet_floor: value }),
      });
      if (!response.ok) return;
      const data = await response.json();
      setWalletFloor(data.uber_wallet_floor);
      setIsEditingWalletFloor(false);
    } catch {
      // Leave the edit UI open so the user can retry.
    }
  }

  function openQuestManager(quest = null) {
    setIsQuestManagerOpen(true);
    setQuestError("");

    if (quest) {
      setEditingQuestId(quest.id);
      setQuestForm({
        start_date: quest.start_date,
        end_date: quest.end_date,
        first_tier_trips: String(quest.first_tier_trips),
        first_tier_bonus: String(quest.first_tier_bonus),
        final_tier_trips: String(quest.final_tier_trips),
        final_additional_bonus: String(quest.final_additional_bonus),
      });
    } else {
      setEditingQuestId(null);
      setQuestForm(createEmptyQuestForm());
    }
  }

  function closeQuestManager() {
    if (isSavingQuest) {
      return;
    }
    setIsQuestManagerOpen(false);
    setEditingQuestId(null);
    setQuestForm(createEmptyQuestForm());
    setQuestError("");
  }

  function handleQuestInputChange(event) {
    const { name, value } = event.target;
    setQuestForm((currentForm) => ({ ...currentForm, [name]: value }));
  }

  async function handleQuestSubmit(event) {
    event.preventDefault();
    setQuestError("");

    if (Object.values(questForm).some((value) => String(value).trim() === "")) {
      setQuestError("Complete every quest field.");
      return;
    }

    const payload = {
      start_date: questForm.start_date,
      end_date: questForm.end_date,
      first_tier_trips: Number(questForm.first_tier_trips),
      first_tier_bonus: Number(questForm.first_tier_bonus),
      final_tier_trips: Number(questForm.final_tier_trips),
      final_additional_bonus: Number(questForm.final_additional_bonus),
    };

    if (!payload.start_date || !payload.end_date) {
      setQuestError("Enter both quest dates.");
      return;
    }
    if (
      !Number.isFinite(payload.first_tier_trips) ||
      !Number.isFinite(payload.first_tier_bonus) ||
      !Number.isFinite(payload.final_tier_trips) ||
      !Number.isFinite(payload.final_additional_bonus)
    ) {
      setQuestError("Quest requirements and bonuses must be valid numbers.");
      return;
    }
    if (payload.end_date < payload.start_date) {
      setQuestError("Quest end date cannot be earlier than its start date.");
      return;
    }
    if (payload.first_tier_trips <= 0) {
      setQuestError("First-tier trips must be greater than 0.");
      return;
    }
    if (payload.final_tier_trips <= payload.first_tier_trips) {
      setQuestError("Final-tier trips must be greater than first-tier trips.");
      return;
    }
    if (payload.first_tier_bonus < 0 || payload.final_additional_bonus < 0) {
      setQuestError("Quest bonuses cannot be negative.");
      return;
    }

    setIsSavingQuest(true);
    try {
      const response = await fetch(
        editingQuestId
          ? `${API_BASE_URL}/api/quests/${editingQuestId}`
          : `${API_BASE_URL}/api/quests`,
        {
          method: editingQuestId ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || "Unable to save quest.");
      }

      await fetchDashboardData();
      setEditingQuestId(null);
      setQuestForm(createEmptyQuestForm());
      setSuccessMessage(editingQuestId ? "Quest updated." : "Quest created.");
    } catch (err) {
      setQuestError(err.message);
    } finally {
      setIsSavingQuest(false);
    }
  }

  async function handleDeleteQuest(questId) {
    if (!window.confirm("Delete this quest? Daily logs will not be affected.")) {
      return;
    }

    try {
      const response = await fetch(`${API_BASE_URL}/api/quests/${questId}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || "Unable to delete quest.");
      }
      if (editingQuestId === questId) {
        setEditingQuestId(null);
        setQuestForm(createEmptyQuestForm());
      }
      await fetchDashboardData();
      setSuccessMessage("Quest deleted.");
    } catch (err) {
      setQuestError(err.message);
    }
  }

  useEffect(() => {
    fetchDashboardData();
    fetchWalletFloor();
  }, []);

  useEffect(() => {
    if (selectedWeekStart === null) {
      if (latestRecord) {
        const weekStart = getWeekStart(latestRecord.date);
        setSelectedWeekStart(formatDateForInput(weekStart));
      } else if (weeks.length > 0) {
        setSelectedWeekStart(weeks[0].week_start);
      }
    }
  }, [latestRecord, selectedWeekStart, weeks]);

  useEffect(() => {
    if (dailyLogPage > totalDailyLogPages) {
      setDailyLogPage(totalDailyLogPages);
    }
  }, [dailyLogPage, totalDailyLogPages]);

  useEffect(() => {
    setWeeklyNoteDraft(currentWeekData?.notes || "");
    setIsEditingWeeklyNote(false);
  }, [selectedWeekStart, currentWeekData?.notes]);

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
    if (!error) return;
    const timerId = setTimeout(() => setError(""), 8000);
    return () => clearTimeout(timerId);
  }, [error]);

  useEffect(() => {
    if (!successMessage && !importResult) return;
    const timerId = setTimeout(() => {
      setSuccessMessage("");
      setImportResult(null);
    }, 5000);
    return () => clearTimeout(timerId);
  }, [successMessage, importResult]);

  useEffect(
    () => () => {
      window.clearTimeout(mobileSheetCloseTimerRef.current);
      window.clearTimeout(dailyLogFormCloseTimerRef.current);
      window.clearTimeout(mobileQuestCelebrationTimerRef.current);
      mobileAudioContextRef.current?.close();
    },
    []
  );

  useEffect(() => {
    if (!isMobileSessionRunning) return undefined;
    setMobileNow(Date.now());
    const timerId = window.setInterval(() => setMobileNow(Date.now()), 30_000);
    return () => window.clearInterval(timerId);
  }, [isMobileSessionRunning, isMobileBreakRunning]);

  useEffect(() => {
    function handleInstallPrompt(event) {
      event.preventDefault();
      setInstallPrompt(event);
    }

    function handleInstalled() {
      setInstallPrompt(null);
      setIsStandaloneApp(true);
      setSuccessMessage("Uber Nest Tracker installed.");
    }

    window.addEventListener("beforeinstallprompt", handleInstallPrompt);
    window.addEventListener("appinstalled", handleInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", handleInstallPrompt);
      window.removeEventListener("appinstalled", handleInstalled);
    };
  }, []);

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
    window.clearTimeout(dailyLogFormCloseTimerRef.current);
    setIsDailyLogFormClosing(false);
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

  function addWorkSession() {
    setFormData((currentFormData) => ({
      ...currentFormData,
      work_sessions: [
        ...(currentFormData.work_sessions || []),
        createEmptyWorkSession(),
      ],
    }));
  }

  function updateWorkSession(index, field, value) {
    setFormData((currentFormData) => ({
      ...currentFormData,
      work_sessions: currentFormData.work_sessions.map((session, sessionIndex) =>
        sessionIndex === index ? { ...session, [field]: value } : session
      ),
    }));
  }

  function removeWorkSession(index) {
    if (index === 0) {
      return;
    }
    setFormData((currentFormData) => ({
      ...currentFormData,
      work_sessions: currentFormData.work_sessions.filter(
        (_, sessionIndex) => sessionIndex !== index
      ),
    }));
  }

  function addBreakSession() {
    setFormData((currentFormData) => ({
      ...currentFormData,
      breaks: [...(currentFormData.breaks || []), createEmptyBreak()],
    }));
  }

  function updateBreakSession(index, field, value) {
    setFormData((currentFormData) => ({
      ...currentFormData,
      breaks: currentFormData.breaks.map((session, sessionIndex) =>
        sessionIndex === index ? { ...session, [field]: value } : session
      ),
    }));
  }

  function removeBreakSession(index) {
    setFormData((currentFormData) => ({
      ...currentFormData,
      breaks: currentFormData.breaks.filter((_, sessionIndex) => sessionIndex !== index),
    }));
  }

  function handleEdit(record) {
    window.clearTimeout(dailyLogFormCloseTimerRef.current);
    setIsDailyLogFormClosing(false);
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
      cash_tips: formNumber(record.cash_tips),
      promotions: String(record.promotions),

      end_home_odometer: formNumber(record.end_home_odometer),

      home_end_time_value: homeEndTime.timeValue,
      home_end_time_meridiem: homeEndTime.meridiem,

      wallet_balance: formNumber(record.wallet_balance),
      notes: record.notes || "",

      day_tags: record.day_tags || [],
      breaks: (record.breaks || []).map((session) => {
        const startTime = splitStoredTime(session.start_time);
        const endTime = splitStoredTime(session.end_time);
        return {
          start_time_value: startTime.timeValue,
          start_time_meridiem: startTime.meridiem,
          end_time_value: endTime.timeValue,
          end_time_meridiem: endTime.meridiem,
          start_odometer: formNumber(session.start_odometer),
          end_odometer: formNumber(session.end_odometer),
        };
      }),
      work_sessions:
        (record.work_sessions || []).length > 0
          ? record.work_sessions.map((session) => {
              const startTime = splitStoredTime(session.start_time);
              const stopTime = splitStoredTime(session.stop_time);
              return {
                start_time_value: startTime.timeValue,
                start_time_meridiem: startTime.meridiem,
                stop_time_value: stopTime.timeValue,
                stop_time_meridiem: stopTime.meridiem,
                start_odometer: formNumber(session.start_odometer),
                stop_odometer: formNumber(session.stop_odometer),
              };
            })
          : [createEmptyWorkSession()],
    });

    setShowAdvancedTracking(
      (record.work_sessions || []).length > 0 ||
        record.end_home_odometer !== null ||
        record.home_end_time !== null ||
        (record.breaks || []).length > 0
    );

    // Auto-expand Day Effects only if this record already has tags, so
    // editing a tagged day surfaces them, but editing an untagged day keeps
    // the form compact.
    setShowDayEffects(Array.isArray(record.day_tags) && record.day_tags.length > 0);

    setError("");
    setSuccessMessage("");
  }

  function finishClosingDailyLogForm(clearMessages = true) {
    setEditingDate(null);
    setIsFormOpen(false);
    setIsDailyLogFormClosing(false);
    setFormData(createEmptyForm());
    setShowAdvancedTracking(false);
    setShowDayEffects(false);
    if (clearMessages) {
      setError("");
      setSuccessMessage("");
    }
  }

  function closeDailyLogForm({ clearMessages = true, allowWhileSubmitting = false } = {}) {
    if (isDailyLogFormClosing || (isSubmitting && !allowWhileSubmitting)) return;

    window.clearTimeout(dailyLogFormCloseTimerRef.current);
    setIsDailyLogFormClosing(true);
    dailyLogFormCloseTimerRef.current = window.setTimeout(
      () => finishClosingDailyLogForm(clearMessages),
      240
    );
  }

  function cancelEdit() {
    closeDailyLogForm();
  }

  function dailyRecordToPayload(record, overrides = {}) {
    const workSessions = overrides.work_sessions ?? record.work_sessions ?? [];
    const breakSessions = overrides.breaks ?? record.breaks ?? [];
    const firstSession = workSessions[0] || null;

    return {
      date: overrides.date ?? record.date,
      online_hours: overrides.online_hours ?? record.online_hours,
      trips: overrides.trips ?? record.trips,
      net_fare: overrides.net_fare ?? record.net_fare,
      tips: overrides.tips ?? record.tips,
      cash_tips: overrides.cash_tips ?? record.cash_tips ?? 0,
      promotions: overrides.promotions ?? record.promotions,
      miles_driven: record.miles_driven,
      start_odometer: firstSession?.start_odometer ?? record.start_odometer,
      end_work_odometer: firstSession?.stop_odometer ?? record.end_work_odometer,
      end_home_odometer: record.end_home_odometer,
      work_start_time: firstSession?.start_time ?? record.work_start_time,
      uber_stop_time: firstSession?.stop_time ?? record.uber_stop_time,
      home_end_time: record.home_end_time,
      additional_sessions:
        workSessions.length > 1
          ? workSessions.slice(1).map((session) => ({
              start_time: session.start_time,
              stop_time: session.stop_time,
              start_odometer: session.start_odometer,
              stop_odometer: session.stop_odometer,
            }))
          : null,
      breaks:
        breakSessions.length > 0
          ? breakSessions.map((session) => ({
              start_time: session.start_time,
              end_time: session.end_time,
              start_odometer: session.start_odometer,
              end_odometer: session.end_odometer,
            }))
          : null,
      wallet_balance: record.wallet_balance,
      notes: record.notes,
      day_tags: record.day_tags,
    };
  }

  function closeMobileSheet(sheetName, finishClosing) {
    if (closingMobileSheet) return;

    window.clearTimeout(mobileSheetCloseTimerRef.current);
    setClosingMobileSheet(sheetName);
    mobileSheetCloseTimerRef.current = window.setTimeout(() => {
      finishClosing();
      setClosingMobileSheet(null);
    }, 220);
  }

  function closeQuickUpdateSheet() {
    if (isSavingQuickUpdate) return;
    closeMobileSheet("quick-update", () => setIsQuickUpdateOpen(false));
  }

  function closeMobileTrackingSheet() {
    if (isSavingMobileTracking) return;
    closeMobileSheet("tracking", () => setMobileTrackingAction(null));
  }

  function closeMobileDraftEditSheet() {
    if (isSavingMobileDraftEdit) return;
    closeMobileSheet("draft-edit", () => setMobileDraftEditTarget(null));
  }

  function closeMobileDraftDetailsSheet() {
    if (isSavingMobileDraftDetails) return;
    closeMobileSheet("draft-details", () => setIsMobileDraftDetailsOpen(false));
  }

  function openMobileDraftDetails() {
    if (!activeMobileShift) return;
    setMobileDraftDetailsForm({
      day_tags: activeMobileShift.day_tags || [],
      notes: activeMobileShift.notes || "",
    });
    setMobileDraftDetailsError("");
    setIsMobileDraftDetailsOpen(true);
  }

  function toggleMobileDraftTag(tagValue) {
    setMobileDraftDetailsForm((current) => ({
      ...current,
      day_tags: current.day_tags.includes(tagValue)
        ? current.day_tags.filter((tag) => tag !== tagValue)
        : [...current.day_tags, tagValue],
    }));
  }

  function openQuickUpdate(record) {
    if (!record) return;
    setQuickUpdateForm({
      trips: String(record.trips),
      net_fare: String(record.net_fare),
      tips: String(record.tips),
      cash_tips: formNumber(record.cash_tips),
      promotions: String(record.promotions),
    });
    setError("");
    setIsQuickUpdateOpen(true);
  }

  async function saveQuickUpdate(event) {
    event.preventDefault();
    if (!mobileDayRecord || isSavingQuickUpdate) return;

    const values = {
      trips: Number(quickUpdateForm.trips),
      net_fare: Number(quickUpdateForm.net_fare),
      tips: Number(quickUpdateForm.tips),
      cash_tips:
        quickUpdateForm.cash_tips === "" ? 0 : Number(quickUpdateForm.cash_tips),
      promotions:
        quickUpdateForm.promotions === "" ? 0 : Number(quickUpdateForm.promotions),
    };

    if (!Number.isInteger(values.trips) || values.trips <= 0) {
      setError("Trips must be a whole number greater than 0.");
      return;
    }
    if (
      [values.net_fare, values.tips, values.cash_tips, values.promotions].some(
        (value) => !Number.isFinite(value) || value < 0
      )
    ) {
      setError("Earnings values must be valid non-negative numbers.");
      return;
    }

    setIsSavingQuickUpdate(true);
    setError("");
    try {
      const response = await fetch(
        `${API_BASE_URL}/api/daily/${mobileDayRecord.date}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(dailyRecordToPayload(mobileDayRecord, values)),
        }
      );
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || "Unable to update this day.");
      }
      closeMobileSheet("quick-update", () => setIsQuickUpdateOpen(false));
      setSuccessMessage("Quick update saved.");
      await fetchDashboardData();
    } catch (err) {
      setError(err.message);
    } finally {
      setIsSavingQuickUpdate(false);
    }
  }

  function openMobileTrackingAction(action) {
    if (
      action === "start_session" &&
      activeMobileShift?.home_end_time &&
      !window.confirm(
        "Starting another session will clear the recorded final return home. Continue?"
      )
    ) {
      return;
    }

    const currentTime = getCurrentTimeParts();
    const storedTime =
      action === "edit_home" && activeMobileShift?.home_end_time
        ? activeMobileShift.home_end_time
        : currentTime.stored;
    const parts = splitStoredTime(storedTime);
    setMobileTrackingForm({
      time_value: parts.timeValue,
      meridiem: parts.meridiem,
      odometer:
        action === "edit_home"
          ? formNumber(activeMobileShift?.end_home_odometer)
          : "",
    });
    setError("");
    setMobileTrackingAction(action);
  }

  async function persistMobileDraft(date, sessions, overrides = {}) {
    const existingDraft = mobileDrafts.find((draft) => draft.date === date);
    const homeEndTime = Object.prototype.hasOwnProperty.call(overrides, "home_end_time")
      ? overrides.home_end_time
      : existingDraft?.home_end_time ?? null;
    const endHomeOdometer = Object.prototype.hasOwnProperty.call(
      overrides,
      "end_home_odometer"
    )
      ? overrides.end_home_odometer
      : existingDraft?.end_home_odometer ?? null;
    const tripEvents = Object.prototype.hasOwnProperty.call(overrides, "trip_events")
      ? overrides.trip_events
      : existingDraft?.trip_events ?? [];
    const dayTags = Object.prototype.hasOwnProperty.call(overrides, "day_tags")
      ? overrides.day_tags
      : existingDraft?.day_tags ?? [];
    const notes = Object.prototype.hasOwnProperty.call(overrides, "notes")
      ? overrides.notes
      : existingDraft?.notes ?? null;
    const response = await fetch(`${API_BASE_URL}/api/drafts/${date}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        date,
        sessions,
        home_end_time: homeEndTime,
        end_home_odometer: endHomeOdometer,
        trip_events: tripEvents,
        day_tags: dayTags,
        notes,
      }),
    });
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.detail || "Unable to save live tracking.");
    }
    const savedDraft = await response.json();
    setMobileDrafts((current) => [
      savedDraft,
      ...current.filter((draft) => draft.date !== savedDraft.date),
    ]);
    return savedDraft;
  }

  function prepareMobileAudio() {
    if (!mobileSoundEffectsEnabled) return null;

    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return null;

    if (!mobileAudioContextRef.current || mobileAudioContextRef.current.state === "closed") {
      mobileAudioContextRef.current = new AudioContext();
    }
    if (mobileAudioContextRef.current.state === "suspended") {
      mobileAudioContextRef.current.resume().catch(() => {});
    }
    return mobileAudioContextRef.current;
  }

  function playMobileConfirmationSound(kind = "trip") {
    const audioContext = prepareMobileAudio();
    if (!audioContext) return;

    const sounds = {
      trip: [[720, 0, 0.085, 0.045]],
      first: [[523, 0, 0.12, 0.05], [659, 0.09, 0.14, 0.055], [784, 0.19, 0.22, 0.06]],
      final: [
        [392, 0, 0.16, 0.052],
        [523, 0.075, 0.16, 0.056],
        [659, 0.15, 0.18, 0.06],
        [784, 0.235, 0.24, 0.065],
        [1047, 0.34, 0.38, 0.07],
      ],
    };
    const startAt = audioContext.currentTime + 0.015;

    (sounds[kind] || sounds.trip).forEach(([frequency, delay, duration, volume]) => {
      const oscillator = audioContext.createOscillator();
      const gain = audioContext.createGain();
      const noteStart = startAt + delay;
      oscillator.type = kind === "trip" ? "sine" : "triangle";
      oscillator.frequency.setValueAtTime(frequency, noteStart);
      gain.gain.setValueAtTime(0.0001, noteStart);
      gain.gain.exponentialRampToValueAtTime(volume, noteStart + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, noteStart + duration);
      oscillator.connect(gain);
      gain.connect(audioContext.destination);
      oscillator.start(noteStart);
      oscillator.stop(noteStart + duration + 0.02);
    });
  }

  function toggleMobileSoundEffects() {
    const nextValue = !mobileSoundEffectsEnabled;
    setMobileSoundEffectsEnabled(nextValue);
    try {
      window.localStorage.setItem("uber-mobile-sound-effects", String(nextValue));
    } catch {
      // The preference still works for this visit if storage is unavailable.
    }
  }

  async function addCompletedMobileTrip() {
    if (
      mobileTripSavingRef.current ||
      !activeMobileShift ||
      !isMobileSessionRunning ||
      isMobileBreakRunning
    ) {
      return;
    }

    mobileTripSavingRef.current = true;
    prepareMobileAudio();
    setIsSavingMobileTrip(true);
    setError("");
    try {
      const questBeforeSave = mobileFeaturedQuestPreview;
      const sessions = structuredClone(activeMobileShift.sessions);
      const session = sessions.at(-1);
      session.id = session.id || createMobileEventId("session");
      const tripEvents = [
        ...(activeMobileShift.trip_events || []),
        {
          id: createMobileEventId("trip"),
          completed_at: new Date().toISOString(),
          session_id: session.id,
        },
      ];
      await persistMobileDraft(activeMobileShift.date, sessions, { trip_events: tripEvents });
      let reachedTier = null;
      if (questBeforeSave) {
        const previousProgress = Number(questBeforeSave.progress_trips) || 0;
        const nextProgress = previousProgress + 1;
        if (
          previousProgress < questBeforeSave.final_tier_trips &&
          nextProgress >= questBeforeSave.final_tier_trips
        ) {
          reachedTier = "final";
        } else if (
          previousProgress < questBeforeSave.first_tier_trips &&
          nextProgress >= questBeforeSave.first_tier_trips
        ) {
          reachedTier = "first";
        }

        if (reachedTier) {
          window.clearTimeout(mobileQuestCelebrationTimerRef.current);
          setMobileQuestCelebration({
            questId: questBeforeSave.id,
            tier: reachedTier,
            bonus: reachedTier === "final"
              ? questBeforeSave.total_possible_bonus
              : questBeforeSave.first_tier_bonus,
          });
          mobileQuestCelebrationTimerRef.current = window.setTimeout(
            () => setMobileQuestCelebration(null),
            reachedTier === "final" ? 2000 : 1650
          );
        }
      }
      playMobileConfirmationSound(reachedTier || "trip");
    } catch (err) {
      setError(err.message);
    } finally {
      mobileTripSavingRef.current = false;
      setIsSavingMobileTrip(false);
    }
  }

  async function undoCompletedMobileTrip() {
    if (
      mobileTripSavingRef.current ||
      !activeMobileShift ||
      !(activeMobileShift.trip_events || []).length
    ) {
      return;
    }

    mobileTripSavingRef.current = true;
    setIsSavingMobileTrip(true);
    setError("");
    try {
      await persistMobileDraft(activeMobileShift.date, activeMobileShift.sessions, {
        trip_events: activeMobileShift.trip_events.slice(0, -1),
      });
    } catch (err) {
      setError(err.message);
    } finally {
      mobileTripSavingRef.current = false;
      setIsSavingMobileTrip(false);
    }
  }

  async function saveMobileDraftDetails(event) {
    event.preventDefault();
    if (!activeMobileShift || isSavingMobileDraftDetails) return;

    setIsSavingMobileDraftDetails(true);
    setMobileDraftDetailsError("");
    try {
      await persistMobileDraft(activeMobileShift.date, activeMobileShift.sessions, {
        day_tags: mobileDraftDetailsForm.day_tags,
        notes: mobileDraftDetailsForm.notes.trim() || null,
      });
      closeMobileSheet("draft-details", () => setIsMobileDraftDetailsOpen(false));
      setSuccessMessage("Shift details saved.");
    } catch (err) {
      setMobileDraftDetailsError(err.message);
    } finally {
      setIsSavingMobileDraftDetails(false);
    }
  }

  async function handleDeleteMobileSession(sessionIndex) {
    if (!activeMobileShift || deletingMobileSessionIndex !== null) return;

    const session = activeMobileShift.sessions[sessionIndex];
    if (!session) return;

    const isActiveSession = !session.stop_time;
    const sessionNumber = sessionIndex + 1;
    const breakCount = (session.breaks || []).length;
    const breakWarning = breakCount
      ? ` and ${breakCount} attached break${breakCount === 1 ? "" : "s"}`
      : "";
    const action = isActiveSession ? "Discard" : "Delete";
    const confirmed = window.confirm(
      `${action} Session ${sessionNumber}?\n\n` +
        `This will remove its recorded time, mileage${breakWarning}. ` +
        "The daily earnings log will not be deleted."
    );

    if (!confirmed) return;

    const remainingSessions = activeMobileShift.sessions.filter(
      (_, index) => index !== sessionIndex
    );
    const removedSessionId = session.id;
    const remainingTripEvents = (activeMobileShift.trip_events || []).filter(
      (event) => event.session_id !== removedSessionId
    );
    const hasSavedDraftDetails = Boolean(
      remainingTripEvents.length ||
      (activeMobileShift.day_tags || []).length ||
      activeMobileShift.notes
    );

    setDeletingMobileSessionIndex(sessionIndex);
    setError("");
    setSuccessMessage("");
    try {
      if (remainingSessions.length === 0 && !hasSavedDraftDetails) {
        const response = await fetch(
          `${API_BASE_URL}/api/drafts/${activeMobileShift.date}`,
          { method: "DELETE" }
        );
        if (!response.ok && response.status !== 404) {
          const errorData = await response.json();
          throw new Error(errorData.detail || "Unable to remove this session.");
        }
        setMobileDrafts((current) =>
          current.filter((draft) => draft.date !== activeMobileShift.date)
        );
      } else {
        await persistMobileDraft(activeMobileShift.date, remainingSessions, {
          trip_events: remainingTripEvents,
          home_end_time: null,
          end_home_odometer: null,
        });
      }

    } catch (err) {
      setError(err.message);
    } finally {
      setDeletingMobileSessionIndex(null);
    }
  }

  function openMobileDraftEditor(kind, sessionIndex, breakIndex = null) {
    const session = activeMobileShift?.sessions?.[sessionIndex];
    const item =
      kind === "break" ? session?.breaks?.[breakIndex] : session;
    if (!item) return;

    const start = splitStoredTime(item.start_time);
    const end = splitStoredTime(
      kind === "break" ? item.end_time : item.stop_time
    );
    setMobileDraftEditTarget({ kind, sessionIndex, breakIndex });
    setMobileDraftEditForm({
      start_time_value: start.timeValue,
      start_time_meridiem: start.meridiem,
      start_odometer: formNumber(item.start_odometer),
      end_time_value: end.timeValue,
      end_time_meridiem: end.meridiem,
      end_odometer: formNumber(
        kind === "break" ? item.end_odometer : item.stop_odometer
      ),
    });
    setMobileDraftEditError("");
    setError("");
  }

  async function saveMobileDraftEdit(event) {
    event.preventDefault();
    if (!mobileDraftEditTarget || !activeMobileShift || isSavingMobileDraftEdit) {
      return;
    }

    if (!isValidTimeValue(mobileDraftEditForm.start_time_value)) {
      setMobileDraftEditError("Start time must look like 5, 5:30, or 12:05.");
      return;
    }

    const sessions = structuredClone(activeMobileShift.sessions);
    const session = sessions[mobileDraftEditTarget.sessionIndex];
    const item =
      mobileDraftEditTarget.kind === "break"
        ? session?.breaks?.[mobileDraftEditTarget.breakIndex]
        : session;
    if (!item) {
      setMobileDraftEditError("That tracking entry is no longer available.");
      return;
    }

    const originalEndTime =
      mobileDraftEditTarget.kind === "break" ? item.end_time : item.stop_time;
    if (
      originalEndTime &&
      !isValidTimeValue(mobileDraftEditForm.end_time_value)
    ) {
      setMobileDraftEditError("End time must look like 5, 5:30, or 12:05.");
      return;
    }

    const startOdometer = optionalNumber(mobileDraftEditForm.start_odometer);
    const endOdometer = optionalNumber(mobileDraftEditForm.end_odometer);
    if (
      [startOdometer, endOdometer].some(
        (value) => value !== null && (!Number.isFinite(value) || value < 0)
      )
    ) {
      setMobileDraftEditError("Odometers must be valid non-negative numbers.");
      return;
    }

    item.start_time = combineTimeInput(
      mobileDraftEditForm.start_time_value,
      mobileDraftEditForm.start_time_meridiem
    );
    item.start_odometer = startOdometer;
    if (originalEndTime) {
      const updatedEndTime = combineTimeInput(
        mobileDraftEditForm.end_time_value,
        mobileDraftEditForm.end_time_meridiem
      );
      if (mobileDraftEditTarget.kind === "break") {
        item.end_time = updatedEndTime;
        item.end_odometer = endOdometer;
      } else {
        item.stop_time = updatedEndTime;
        item.stop_odometer = endOdometer;
      }
    }

    setIsSavingMobileDraftEdit(true);
    setMobileDraftEditError("");
    try {
      await persistMobileDraft(activeMobileShift.date, sessions);
      closeMobileSheet("draft-edit", () => setMobileDraftEditTarget(null));
      setSuccessMessage(
        mobileDraftEditTarget.kind === "break"
          ? "Break details updated."
          : "Session details updated."
      );
    } catch (err) {
      setMobileDraftEditError(err.message);
    } finally {
      setIsSavingMobileDraftEdit(false);
    }
  }

  async function handleMobileTrackingSubmit(event) {
    event.preventDefault();
    if (!mobileTrackingAction || isSavingMobileTracking) return;
    if (!isValidTimeValue(mobileTrackingForm.time_value)) {
      setError("Time must look like 5, 5:30, or 12:05.");
      return;
    }

    const timestamp = combineTimeInput(
      mobileTrackingForm.time_value,
      mobileTrackingForm.meridiem
    );
    const odometer = optionalNumber(mobileTrackingForm.odometer);
    if (odometer !== null && (!Number.isFinite(odometer) || odometer < 0)) {
      setError("Odometer must be a valid non-negative number.");
      return;
    }

    const sessions = structuredClone(activeMobileShift?.sessions || []);
    const actionLabels = {
      record_home: "Final return home recorded",
      edit_home: "Final return home updated",
    };
    let draftOverrides = {};

    if (mobileTrackingAction === "start_session") {
      if (isMobileSessionRunning) {
        setError("End the active session before starting another one.");
        return;
      }
      sessions.push({
        id: createMobileEventId("session"),
        start_time: timestamp,
        stop_time: null,
        start_odometer: odometer,
        stop_odometer: null,
        breaks: [],
      });
      draftOverrides = { home_end_time: null, end_home_odometer: null };
    } else if (mobileTrackingAction === "start_break") {
      if (!isMobileSessionRunning || isMobileBreakRunning) return;
      sessions[sessions.length - 1].breaks.push({
        start_time: timestamp,
        end_time: null,
        start_odometer: odometer,
        end_odometer: null,
      });
    } else if (mobileTrackingAction === "resume_session") {
      if (!isMobileBreakRunning) return;
      const breaks = sessions[sessions.length - 1].breaks;
      breaks[breaks.length - 1].end_time = timestamp;
      breaks[breaks.length - 1].end_odometer = odometer;
    } else if (mobileTrackingAction === "end_session") {
      if (!isMobileSessionRunning) return;
      const session = sessions[sessions.length - 1];
      if (isMobileBreakRunning) {
        const breaks = session.breaks;
        breaks[breaks.length - 1].end_time = timestamp;
        breaks[breaks.length - 1].end_odometer = odometer;
      }
      session.stop_time = timestamp;
      session.stop_odometer = odometer;
    } else if (
      mobileTrackingAction === "record_home" ||
      mobileTrackingAction === "edit_home"
    ) {
      if (!activeMobileShift || isMobileSessionRunning) {
        setError("End the active session before recording the final return home.");
        return;
      }
      draftOverrides = {
        home_end_time: timestamp,
        end_home_odometer: odometer,
      };
    }

    setIsSavingMobileTracking(true);
    try {
      await persistMobileDraft(mobileDayDate, sessions, draftOverrides);
      closeMobileSheet("tracking", () => setMobileTrackingAction(null));
      if (actionLabels[mobileTrackingAction]) {
        setSuccessMessage(`${actionLabels[mobileTrackingAction]} at ${timestamp}.`);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setIsSavingMobileTracking(false);
    }
  }

  function draftSessionsForForm(draft) {
    const workSessions = (draft?.sessions || []).filter((session) => session.stop_time);
    const homeEnd = splitStoredTime(draft?.home_end_time || "");
    return {
      workSessions: workSessions.map((session) => {
        const start = splitStoredTime(session.start_time);
        const stop = splitStoredTime(session.stop_time);
        return {
          start_time_value: start.timeValue,
          start_time_meridiem: start.meridiem,
          stop_time_value: stop.timeValue,
          stop_time_meridiem: stop.meridiem,
          start_odometer: formNumber(session.start_odometer),
          stop_odometer: formNumber(session.stop_odometer),
        };
      }),
      breaks: workSessions.flatMap((session) =>
        (session.breaks || []).filter((item) => item.end_time).map((item) => {
          const start = splitStoredTime(item.start_time);
          const end = splitStoredTime(item.end_time);
          return {
            start_time_value: start.timeValue,
            start_time_meridiem: start.meridiem,
            end_time_value: end.timeValue,
            end_time_meridiem: end.meridiem,
            start_odometer: formNumber(item.start_odometer),
            end_odometer: formNumber(item.end_odometer),
          };
        })
      ),
      homeEndTimeValue: homeEnd.timeValue,
      homeEndTimeMeridiem: homeEnd.meridiem,
      endHomeOdometer: formNumber(draft?.end_home_odometer),
      tripCount: draft?.trip_events?.length || 0,
      dayTags: draft?.day_tags || [],
      notes: draft?.notes || "",
    };
  }

  function finishMobileDraft() {
    if (!activeMobileShift || isMobileSessionRunning) {
      setError("End the active session before finishing the daily log.");
      return;
    }
    const captured = draftSessionsForForm(activeMobileShift);
    if (mobileDayRecord) {
      handleEdit(mobileDayRecord);
      setFormData((current) => ({
        ...current,
        trips: String(Number(current.trips || 0) + captured.tripCount),
        work_sessions: [
          ...(current.work_sessions.length === 1 &&
          Object.values(current.work_sessions[0]).every((value) => value === "" || value === "PM")
            ? []
            : current.work_sessions),
          ...captured.workSessions,
        ],
        breaks: [...current.breaks, ...captured.breaks],
        home_end_time_value:
          captured.homeEndTimeValue || current.home_end_time_value,
        home_end_time_meridiem: captured.homeEndTimeValue
          ? captured.homeEndTimeMeridiem
          : current.home_end_time_meridiem,
        end_home_odometer:
          captured.endHomeOdometer !== ""
            ? captured.endHomeOdometer
            : current.end_home_odometer,
        day_tags: [...new Set([...(current.day_tags || []), ...captured.dayTags])],
        notes: captured.notes
          ? [current.notes, captured.notes].filter(Boolean).join("\n\n")
          : current.notes,
      }));
    } else {
      openAddFormForDate(mobileDayDate, false);
      setFormData((current) => ({
        ...current,
        trips: captured.tripCount ? String(captured.tripCount) : current.trips,
        work_sessions: captured.workSessions.length
          ? captured.workSessions
          : [createEmptyWorkSession()],
        breaks: captured.breaks,
        home_end_time_value: captured.homeEndTimeValue,
        home_end_time_meridiem: captured.homeEndTimeMeridiem,
        end_home_odometer: captured.endHomeOdometer,
        day_tags: captured.dayTags,
        notes: captured.notes,
      }));
    }
    setShowAdvancedTracking(true);
    setDraftBeingFinalizedDate(mobileDayDate);
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

    const workSessionPayloads = formData.work_sessions.map((session) => ({
      start_time: combineTimeInput(
        session.start_time_value,
        session.start_time_meridiem
      ),
      stop_time: combineTimeInput(
        session.stop_time_value,
        session.stop_time_meridiem
      ),
      start_odometer: optionalNumber(session.start_odometer),
      stop_odometer: optionalNumber(session.stop_odometer),
    }));
    const firstWorkSession = workSessionPayloads[0];

    const newRecord = {
      date: formData.date,
      online_hours: onlineHoursResult.decimalHours,
      trips: Number(formData.trips),
      net_fare: Number(formData.net_fare),
      tips: Number(formData.tips),
      cash_tips: formData.cash_tips === "" ? 0 : Number(formData.cash_tips),
      promotions: formData.promotions === "" ? 0 : Number(formData.promotions),

      miles_driven: null,

      start_odometer: firstWorkSession.start_odometer,
      end_work_odometer: firstWorkSession.stop_odometer,
      end_home_odometer: optionalNumber(formData.end_home_odometer),

      work_start_time: firstWorkSession.start_time,
      uber_stop_time: firstWorkSession.stop_time,
      home_end_time: combineTimeInput(
        formData.home_end_time_value,
        formData.home_end_time_meridiem
      ),
      additional_sessions:
        workSessionPayloads.length > 1 ? workSessionPayloads.slice(1) : null,
      breaks:
        formData.breaks.length > 0
          ? formData.breaks.map((session) => ({
              start_time: combineTimeInput(
                session.start_time_value,
                session.start_time_meridiem
              ),
              end_time: combineTimeInput(
                session.end_time_value,
                session.end_time_meridiem
              ),
              start_odometer: optionalNumber(session.start_odometer),
              end_odometer: optionalNumber(session.end_odometer),
            }))
          : null,

      wallet_balance: optionalNumber(formData.wallet_balance),
      notes: optionalText(formData.notes),

      day_tags:
        formData.day_tags && formData.day_tags.length > 0 ? formData.day_tags : null,
      trip_events: draftBeingFinalizedDate
        ? [
            ...(dailyRecords.find((record) => record.date === editingDate)?.trip_events || []),
            ...(mobileDrafts.find((draft) => draft.date === draftBeingFinalizedDate)?.trip_events || []),
          ]
        : undefined,
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
      newRecord.cash_tips < 0 ||
      newRecord.promotions < 0
    ) {
      setError("Fare, tips, cash tips, and promotions cannot be negative.");
      return;
    }

    if (newRecord.end_home_odometer !== null && newRecord.end_home_odometer < 0) {
      setError("End home odometer cannot be negative.");
      return;
    }

    if (!isValidTimeValue(formData.home_end_time_value)) {
      setError("Home/end time must look like 5, 5:30, or 12:05 with AM/PM selected.");
      return;
    }

    const homeEndMinutes = timeToMinutes(
      formData.home_end_time_value,
      formData.home_end_time_meridiem
    );

    const sessionRanges = [];
    let previousSessionStop = null;
    let previousSessionStopOdometer = null;
    for (let index = 0; index < formData.work_sessions.length; index += 1) {
      const session = formData.work_sessions[index];
      const savedSession = workSessionPayloads[index];
      const sessionNumber = index + 1;
      const hasAnyValue = [
        session.start_time_value,
        session.stop_time_value,
        session.start_odometer,
        session.stop_odometer,
      ].some((value) => value !== "");

      if (!hasAnyValue && index === 0 && formData.work_sessions.length === 1) {
        continue;
      }
      if (session.start_time_value === "" || session.stop_time_value === "") {
        setError(`Complete session ${sessionNumber} start and stop times.`);
        return;
      }
      if (
        !isValidTimeValue(session.start_time_value) ||
        !isValidTimeValue(session.stop_time_value)
      ) {
        setError(
          `Session ${sessionNumber} times must look like 5, 5:30, or 12:05 with AM/PM selected.`
        );
        return;
      }

      const startMinutes = timeToMinutes(
        session.start_time_value,
        session.start_time_meridiem
      );
      const stopMinutes = timeToMinutes(
        session.stop_time_value,
        session.stop_time_meridiem
      );
      if (stopMinutes <= startMinutes) {
        setError(`Session ${sessionNumber} stop time must be later than its start.`);
        return;
      }
      if (previousSessionStop !== null && startMinutes < previousSessionStop) {
        setError("Work sessions cannot overlap and must be entered in time order.");
        return;
      }

      if ((session.start_odometer === "") !== (session.stop_odometer === "")) {
        setError(`Session ${sessionNumber} odometers must be entered together.`);
        return;
      }
      if (
        savedSession.start_odometer !== null &&
        (savedSession.start_odometer < 0 || savedSession.stop_odometer < 0)
      ) {
        setError(`Session ${sessionNumber} odometers cannot be negative.`);
        return;
      }
      if (
        savedSession.start_odometer !== null &&
        savedSession.stop_odometer < savedSession.start_odometer
      ) {
        setError(
          `Session ${sessionNumber} stop odometer cannot be lower than its start.`
        );
        return;
      }
      if (
        savedSession.start_odometer !== null &&
        previousSessionStopOdometer !== null &&
        savedSession.start_odometer < previousSessionStopOdometer
      ) {
        setError("Session odometers must stay in trip order.");
        return;
      }

      sessionRanges.push({
        startMinutes,
        stopMinutes,
        startOdometer: savedSession.start_odometer,
        stopOdometer: savedSession.stop_odometer,
      });
      previousSessionStop = stopMinutes;
      if (savedSession.stop_odometer !== null) {
        previousSessionStopOdometer = savedSession.stop_odometer;
      }
    }

    let previousBreakEnd = null;
    let previousBreakEndOdometer = null;
    for (let index = 0; index < formData.breaks.length; index += 1) {
      const session = formData.breaks[index];
      const breakNumber = index + 1;

      if (session.start_time_value === "" || session.end_time_value === "") {
        setError(`Complete or remove break ${breakNumber}.`);
        return;
      }

      if (
        !isValidTimeValue(session.start_time_value) ||
        !isValidTimeValue(session.end_time_value)
      ) {
        setError(
          `Break ${breakNumber} times must look like 5, 5:30, or 12:05 with AM/PM selected.`
        );
        return;
      }

      const breakStartMinutes = timeToMinutes(
        session.start_time_value,
        session.start_time_meridiem
      );
      const breakEndMinutes = timeToMinutes(
        session.end_time_value,
        session.end_time_meridiem
      );

      const matchingSession = sessionRanges.find(
        (sessionRange) =>
          sessionRange.startMinutes <= breakStartMinutes &&
          breakStartMinutes < breakEndMinutes &&
          breakEndMinutes <= sessionRange.stopMinutes
      );
      if (!matchingSession) {
        setError(
          `Break ${breakNumber} must fall completely inside one work session.`
        );
        return;
      }

      if (previousBreakEnd !== null && breakStartMinutes < previousBreakEnd) {
        setError("Break sessions cannot overlap and must be entered in time order.");
        return;
      }
      previousBreakEnd = breakEndMinutes;

      const savedSession = newRecord.breaks[index];
      if (
        (session.start_odometer === "") !== (session.end_odometer === "")
      ) {
        setError(`Break ${breakNumber} odometers must be entered together.`);
        return;
      }

      if (
        savedSession.start_odometer !== null &&
        (savedSession.start_odometer < 0 || savedSession.end_odometer < 0)
      ) {
        setError(`Break ${breakNumber} odometers cannot be negative.`);
        return;
      }

      if (
        savedSession.start_odometer !== null &&
        (matchingSession.startOdometer === null ||
          matchingSession.stopOdometer === null)
      ) {
        setError(
          `Session odometers are required for break ${breakNumber} odometers.`
        );
        return;
      }

      if (
        savedSession.start_odometer !== null &&
        !(
          matchingSession.startOdometer <= savedSession.start_odometer &&
          savedSession.start_odometer <= savedSession.end_odometer &&
          savedSession.end_odometer <= matchingSession.stopOdometer
        )
      ) {
        setError(
          `Break ${breakNumber} odometers must be inside the same work session.`
        );
        return;
      }

      if (
        savedSession.start_odometer !== null &&
        previousBreakEndOdometer !== null &&
        savedSession.start_odometer < previousBreakEndOdometer
      ) {
        setError("Break odometers cannot overlap and must be entered in trip order.");
        return;
      }
      if (savedSession.end_odometer !== null) {
        previousBreakEndOdometer = savedSession.end_odometer;
      }
    }

    if (
      (homeEndMinutes !== null || newRecord.end_home_odometer !== null) &&
      sessionRanges.length === 0
    ) {
      setError("Complete session 1 before entering final home-end details.");
      return;
    }

    if (sessionRanges.length > 0) {
      const finalSession = sessionRanges[sessionRanges.length - 1];
      if (homeEndMinutes !== null && homeEndMinutes < finalSession.stopMinutes) {
        setError("Home/end time cannot be earlier than the final session stop.");
        return;
      }
      if (
        newRecord.end_home_odometer !== null &&
        finalSession.stopOdometer === null
      ) {
        setError(
          "Final-session odometers are required when home-end odometer is entered."
        );
        return;
      }
      if (
        newRecord.end_home_odometer !== null &&
        newRecord.end_home_odometer < finalSession.stopOdometer
      ) {
        setError(
          "Home-end odometer cannot be lower than the final session stop odometer."
        );
        return;
      }
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

      setSelectedRecordDate(savedRecord.date);

      const savedRecordWeekStart = getWeekStart(savedRecord.date);
      setSelectedWeekStart(formatDateForInput(savedRecordWeekStart));

      if (editingDate) {
        const originalDate = editingDate;
        setSuccessMessage(
          savedRecord.date !== originalDate
            ? `Daily record moved to ${formatRecordDate(savedRecord.date)} and updated.`
            : "Daily record updated."
        );
      } else {
        setSuccessMessage("Daily record added.");
      }

      closeDailyLogForm({ clearMessages: false, allowWhileSubmitting: true });

      if (draftBeingFinalizedDate) {
        const draftResponse = await fetch(
          `${API_BASE_URL}/api/drafts/${draftBeingFinalizedDate}`,
          { method: "DELETE" }
        );
        if (!draftResponse.ok && draftResponse.status !== 404) {
          throw new Error("The daily log saved, but its live draft could not be cleared.");
        }
        setDraftBeingFinalizedDate(null);
      }

      await fetchDashboardData();
    } catch (err) {
      setError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleDelete(date) {
    const friendlyDate = new Date(`${date}T00:00:00`).toLocaleDateString(
      "en-US",
      { month: "short", day: "numeric", year: "numeric" }
    );
    const confirmed = window.confirm(`Delete ${friendlyDate}?`);

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

  async function handleSaveWeeklyNote() {
    if (!currentWeekData || isSavingWeeklyNote) return;

    setIsSavingWeeklyNote(true);
    setError("");
    try {
      const response = await fetch(
        `${API_BASE_URL}/api/weeks/${currentWeekData.week_end}/notes`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ notes: optionalText(weeklyNoteDraft) }),
        }
      );
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || "Unable to save the weekly note.");
      }

      await fetchDashboardData();
      setIsEditingWeeklyNote(false);
      setSuccessMessage(
        weeklyNoteDraft.trim() ? "Weekly note saved." : "Weekly note removed."
      );
    } catch (err) {
      setError(err.message);
    } finally {
      setIsSavingWeeklyNote(false);
    }
  }

  function renderMobileSessionTimelineEntry(session, index) {
    return (
      <div className="mobile-session-timeline-entry" key={`${session.start_time}-${index}`}>
        <span>Session {index + 1}</span>
        <strong>{session.start_time}–{session.stop_time || "Now"}</strong>
        {(session.start_odometer !== null || session.stop_odometer !== null) && (
          <small>{session.start_odometer ?? "—"} → {session.stop_odometer ?? "—"} mi</small>
        )}
        {(session.breaks || []).map((item, breakIndex) => (
          <div className="mobile-break-timeline-row" key={`${item.start_time}-${breakIndex}`}>
            <small>Break {item.start_time}–{item.end_time || "Now"}</small>
            <button type="button" onClick={() => openMobileDraftEditor("break", index, breakIndex)}>Edit</button>
          </div>
        ))}
        <div className="mobile-session-row-actions">
          <button
            type="button"
            className="mobile-session-edit"
            onClick={() => openMobileDraftEditor("session", index)}
          >
            Edit session
          </button>
          <button
            type="button"
            className="mobile-session-delete"
            onClick={() => handleDeleteMobileSession(index)}
            disabled={deletingMobileSessionIndex !== null}
          >
            {deletingMobileSessionIndex === index
              ? "Removing…"
              : session.stop_time
                ? "Delete session"
                : "Discard session"}
          </button>
        </div>
      </div>
    );
  }

  function renderMobileReturnHomeEntry() {
    if (!activeMobileShift?.home_end_time) return null;
    return (
      <div className="mobile-session-timeline-entry mobile-return-home-row">
        <span>Final return home</span>
        <strong>{activeMobileShift.home_end_time}</strong>
        {activeMobileShift.end_home_odometer !== null && (
          <small>{activeMobileShift.end_home_odometer} mi</small>
        )}
        <button
          type="button"
          className="mobile-session-edit"
          onClick={() => openMobileTrackingAction("edit_home")}
        >
          Edit return home
        </button>
      </div>
    );
  }

  return (
    <main className="app">
      <div className="mobile-app-shell">
        <header className="mobile-topbar">
          <div>
            <span className="mobile-brand">Uber Nest Tracker</span>
            <h1>{mobileTab === "today" ? "Today" : mobileTab === "earnings" ? "Earnings" : "More"}</h1>
          </div>
          {mobileTab === "today" && mobileDayDate !== getTodayInputValue() && (
            <button type="button" className="mobile-today-reset" onClick={() => selectRecordAndWeek(getTodayInputValue())}>Back to today</button>
          )}
        </header>

        <div className="mobile-notification-area">
          <AnimatedNotification message={error} type="error" />
          <AnimatedNotification message={successMessage} type="success" />
        </div>

        {!isServerReachable && (
          <div className="mobile-connection-banner" role="status">
            <div>
              <strong>Home server unavailable</strong>
              <span>Tracking changes need Tailscale and the PC server connected.</span>
            </div>
            <button type="button" onClick={fetchDashboardData}>Retry</button>
          </div>
        )}

        {mobileTab === "today" && (
          <section className={`mobile-tab-panel mobile-today-panel ${!mobileDayRecord && !activeMobileShift ? "mobile-today-idle" : ""}`}>
            <div className="mobile-today-date">{formatMobileDate(mobileDayDate)}</div>

            {mobileDayRecord && (
              <article className="mobile-day-summary">
                <span>Day total</span>
                <strong><AnimatedNumber value={mobileDayRecord.total_earnings} format={(value) => `$${value.toFixed(2)}`} flash={false} /></strong>
                <div>
                  <span>{mobileDayRecord.trips} trips</span>
                  <span>{formatHoursAndMinutes(mobileDayRecord.online_hours)} online</span>
                  <span>{mobileDayRecord.real_work_hours !== null ? `${formatHoursAndMinutes(mobileDayRecord.real_work_hours)} real` : "Real time not tracked"}</span>
                </div>
              </article>
            )}

            {mobileDayRecord && (
              <div className="mobile-performance-chips" aria-label="Daily performance indicators">
                {getMobilePerformanceLabels(mobileDayRecord).map((label) => (
                  <LabelChip key={label} label={label} record={mobileDayRecord} />
                ))}
              </div>
            )}

            {mobileDayDate === getTodayInputValue() && (
              <article key={activeMobileShift?.status || "idle"} className={`mobile-live-tracker ${isMobileSessionRunning && !mobileLiveTiming.isFuture ? "active" : ""} ${isMobileBreakRunning ? "on-break" : ""} ${mobileLiveTiming.isFuture ? "scheduled" : ""}`}>
                <div className="mobile-section-heading">
                  <div>
                    <span className="mobile-section-eyebrow">Live tracking</span>
                    <h2>{mobileLiveTiming.isFuture ? (isMobileBreakRunning ? "Break starts soon" : `Session ${activeMobileShift.sessions.length} starts soon`) : isMobileBreakRunning ? "Break in progress" : isMobileSessionRunning ? `Session ${activeMobileShift.sessions.length} in progress` : activeMobileShift?.home_end_time ? "Return home recorded" : activeMobileShift ? "Ready to continue" : "Ready to work?"}</h2>
                  </div>
                  {isMobileSessionRunning && (
                    <span className={`mobile-live-dot ${isMobileBreakRunning ? "break" : ""} ${mobileLiveTiming.isFuture ? "scheduled" : ""}`}>
                      {mobileLiveTiming.isFuture ? "Soon" : isMobileBreakRunning ? "Break" : "Live"}
                      {mobileLiveElapsedLabel ? ` · ${mobileLiveElapsedLabel}` : ""}
                    </span>
                  )}
                </div>

                {activeMobileSession && isMobileSessionRunning && (
                  <p className="mobile-live-detail">
                    {mobileLiveTiming.isFuture ? "Starts" : "Started"} at {activeMobileSession.start_time}
                    {isMobileBreakRunning ? ` · Break since ${activeMobileBreak.start_time}` : ""}
                  </p>
                )}

                {activeMobileShift?.sessions?.length > 0 && (
                  <div className="mobile-trip-counter">
                    <div className="mobile-trip-count-copy">
                      <span className="mobile-trip-count-label">Completed trips ·</span>
                      <strong><AnimatedNumber value={mobileDraftTripCount} format={(value) => String(Math.round(value))} /></strong>
                      <small className={latestMobileTrip ? "has-trip" : ""}>
                        {latestMobileTrip ? <><span>Latest ·</span><time>{formatCompletedTripTime(latestMobileTrip.completed_at)}</time></> : "Ready for your first trip"}
                      </small>
                    </div>
                    <button
                      type="button"
                      className="mobile-trip-undo"
                      onClick={undoCompletedMobileTrip}
                      disabled={mobileDraftTripCount === 0}
                      aria-busy={isSavingMobileTrip}
                    >
                      Undo last
                    </button>
                  </div>
                )}

                {isMobileSessionRunning && mobileFeaturedQuestPreview && (
                  <div className={`mobile-live-quest ${mobileQuestCelebration?.questId === mobileFeaturedQuestPreview.id ? `celebrating celebrating-${mobileQuestCelebration.tier}` : ""}`}>
                    <div className="mobile-live-quest-heading">
                      <span>{mobileFeaturedQuestPreview.title} · {mobileQuestTierProgress.label}</span>
                      <strong>{mobileQuestTierProgress.progress} / {mobileQuestTierProgress.target}</strong>
                    </div>
                    <QuestTierProgress quest={mobileFeaturedQuestPreview} className="mobile-progress-track" />
                    {mobileQuestCelebration?.questId === mobileFeaturedQuestPreview.id && (
                      <div className={`mobile-quest-celebration ${mobileQuestCelebration.tier}`} role="status" aria-live="polite">
                        <div className="mobile-quest-confetti" aria-hidden="true">
                          {QUEST_CONFETTI_PARTICLES
                            .slice(0, mobileQuestCelebration.tier === "final" ? 16 : 11)
                            .map(([x, y, rotation, delay], index) => (
                              <span
                                key={`${mobileQuestCelebration.tier}-${index}`}
                                style={{
                                  "--confetti-x": `${x}px`,
                                  "--confetti-y": `${y}px`,
                                  "--confetti-rotation": `${rotation}deg`,
                                  "--confetti-delay": `${delay}ms`,
                                }}
                              ></span>
                            ))}
                        </div>
                        <strong className="mobile-quest-celebration-copy">
                          {mobileQuestCelebration.tier === "final" ? "Quest complete" : "First tier complete"}
                          <small>${mobileQuestCelebration.bonus.toFixed(2)} earned</small>
                        </strong>
                      </div>
                    )}
                  </div>
                )}

                {activeMobileShift?.sessions?.length > 0 && (
                  <div className="mobile-session-timeline">
                    {isMobileSessionRunning ? (
                      <>
                        {renderMobileSessionTimelineEntry(
                          activeMobileShift.sessions.at(-1),
                          activeMobileShift.sessions.length - 1
                        )}
                        {activeMobileShift.sessions.length > 1 && (
                          <details className="mobile-session-history">
                            <summary>
                              <span>Earlier activity</span>
                              <small>
                                {activeMobileShift.sessions.length - 1} {activeMobileShift.sessions.length === 2 ? "session" : "sessions"}
                              </small>
                            </summary>
                            <div className="mobile-session-history-body">
                              {activeMobileShift.sessions
                                .slice(0, -1)
                                .map((session, index) => renderMobileSessionTimelineEntry(session, index))}
                            </div>
                          </details>
                        )}
                      </>
                    ) : (
                      <details className="mobile-session-history mobile-shift-history">
                        <summary>
                          <span>Shift timeline</span>
                          <small>
                            {activeMobileShift.sessions.length} {activeMobileShift.sessions.length === 1 ? "session" : "sessions"}
                            {(() => {
                              const breakCount = activeMobileShift.sessions.reduce(
                                (total, session) => total + (session.breaks?.length || 0),
                                0
                              );
                              return breakCount > 0
                                ? ` · ${breakCount} ${breakCount === 1 ? "break" : "breaks"}`
                                : "";
                            })()}
                          </small>
                        </summary>
                        <div className="mobile-session-history-body">
                          {activeMobileShift.sessions.map((session, index) => renderMobileSessionTimelineEntry(session, index))}
                          {renderMobileReturnHomeEntry()}
                        </div>
                      </details>
                    )}
                  </div>
                )}

                {!isMobileSessionRunning && <span className="mobile-tracker-hint">Every timestamp is saved immediately. You can close the app between actions.</span>}
              </article>
            )}

            {mobileDayRecord && <div className="mobile-day-management">
              <button type="button" onClick={() => openQuickUpdate(mobileDayRecord)}>Quick update</button>
              <button type="button" onClick={() => handleEdit(mobileDayRecord)}>Edit full day</button>
            </div>}

            {activeMobileShift && !isMobileSessionRunning && (
              <article className="mobile-draft-details-card">
                <div className="mobile-draft-details-heading">
                  <div><span>Shift details</span><strong>Context & note</strong></div>
                  <button type="button" onClick={openMobileDraftDetails}>
                    {(activeMobileShift.day_tags || []).length || activeMobileShift.notes ? "Edit" : "Add"}
                  </button>
                </div>
                {(activeMobileShift.day_tags || []).length > 0 && (
                  <div className="mobile-draft-tag-list">
                    {activeMobileShift.day_tags.map((tag) => <DayTagChip tagValue={tag} key={tag} />)}
                  </div>
                )}
                {activeMobileShift.notes ? (
                  <p>{activeMobileShift.notes}</p>
                ) : (
                  <small>Save how the shift felt without entering earnings.</small>
                )}
              </article>
            )}

            {mobileFeaturedQuestPreview && !isMobileSessionRunning && (
              <article className="mobile-context-card">
                <div><span>Active quest{mobileDraftTripCount ? " · Live progress" : ""}</span><strong>{mobileFeaturedQuestPreview.title}</strong></div>
                <strong>{Math.min(mobileFeaturedQuestPreview.progress_trips, mobileFeaturedQuestPreview.final_tier_trips)} / {mobileFeaturedQuestPreview.final_tier_trips}</strong>
                <QuestTierProgress quest={mobileFeaturedQuestPreview} className="mobile-progress-track" />
              </article>
            )}

            {mobileDayRecord && (
              <details className="mobile-detail-card mobile-day-details">
                <summary>View day details</summary>
                <div className="mobile-detail-grid">
                  <div><span>Net fare</span><strong>${mobileDayRecord.net_fare.toFixed(2)}</strong></div>
                  <div><span>Tips</span><strong>${(mobileDayRecord.tips + (mobileDayRecord.cash_tips || 0)).toFixed(2)}</strong></div>
                  <div><span>Promotions</span><strong>${mobileDayRecord.promotions.toFixed(2)}</strong></div>
                  <div><span>Work miles</span><strong>{mobileDayRecord.work_miles !== null ? mobileDayRecord.work_miles.toFixed(1) : "—"}</strong></div>
                  <div><span>$/mile</span><strong>{mobileDayRecord.earnings_per_work_mile !== null ? `$${mobileDayRecord.earnings_per_work_mile.toFixed(2)}` : "—"}</strong></div>
                  <div><span>Breaks</span><strong>{mobileDayRecord.break_hours ? formatHoursAndMinutes(mobileDayRecord.break_hours) : "None"}</strong></div>
                </div>
              </details>
            )}

            {mobileDayDate === getTodayInputValue() && <div className="mobile-today-action-dock">
              <div>
                {isMobileSessionRunning && !isMobileBreakRunning ? <>
                  <button
                    type="button"
                    className="mobile-trip-dock-button"
                    onClick={addCompletedMobileTrip}
                    disabled={mobileLiveTiming.isFuture}
                    aria-busy={isSavingMobileTrip}
                    aria-label="Add one completed trip"
                  >
                    +1 Trip
                  </button>
                  <button type="button" className="mobile-break-button" onClick={() => openMobileTrackingAction("start_break")}>Start break</button>
                  <button type="button" className="mobile-end-button" onClick={() => openMobileTrackingAction("end_session")}>End session</button>
                </> : isMobileBreakRunning ? <>
                  <button type="button" className="mobile-start-button" onClick={() => openMobileTrackingAction("resume_session")}>Resume session</button>
                  <button type="button" className="mobile-end-button" onClick={() => openMobileTrackingAction("end_session")}>End session</button>
                </> : activeMobileShift ? <>
                  <button type="button" className="mobile-start-button" onClick={() => openMobileTrackingAction("start_session")}>Start another session</button>
                  <button type="button" className="mobile-home-button" onClick={() => openMobileTrackingAction(activeMobileShift.home_end_time ? "edit_home" : "record_home")}>{activeMobileShift.home_end_time ? "Edit return home" : "Record return home"}</button>
                  <button type="button" className="primary-button mobile-finalize-button" onClick={finishMobileDraft}>{mobileDayRecord ? "Add tracking to day" : "Finish daily log"}</button>
                </> : <>
                  <button type="button" className="mobile-start-button" onClick={() => openMobileTrackingAction("start_session")}>Start live session</button>
                  {mobileDayRecord ? <button type="button" onClick={() => openQuickUpdate(mobileDayRecord)}>Quick update</button> : <button type="button" onClick={() => openAddFormForDate(mobileDayDate, false)}>Add day manually</button>}
                </>}
              </div>
            </div>}
          </section>
        )}

        {mobileTab === "earnings" && (
          <section className="mobile-tab-panel mobile-earnings-panel">
            <div className="mobile-week-nav">
              <button type="button" onClick={() => changeWeek(-7)} aria-label="Previous week">←</button>
              <button type="button" className="mobile-week-label" onClick={() => setIsWeekBrowserOpen(true)}>{weeklyChartData.length ? formatWeekRangeLabel(weeklyChartData[0].date, weeklyChartData[6].date) : "Choose week"}</button>
              <button type="button" onClick={() => changeWeek(7)} aria-label="Next week">→</button>
            </div>

            <div className="mobile-earnings-headline">
              <span>{isSelectedDayMode ? formatMobileDate(selectedRecordDate) : "Week total"}</span>
              <strong><AnimatedNumber value={displayedTotalEarnings} format={(value) => `$${value.toFixed(2)}`} flash={false} /></strong>
              {isSelectedDayMode && <button type="button" onClick={() => setSelectedRecordDate(null)}>All week</button>}
            </div>

            <div className={`mobile-earnings-chart detailed unified ${isSelectedDayMode ? "has-selection" : ""}`}>
              {weeklyChartData.map((day, index) => {
                const maxEarnings = Math.max(...weeklyChartData.map((item) => item.earnings), 1);
                const selected = selectedRecordDate === day.date;
                return (
                  <button type="button" className={selected ? "selected" : ""} key={day.date} onClick={() => handleWeeklyBarClick(day)} aria-pressed={selected} style={{ "--bar-delay": `${index * 45}ms` }}>
                    <span className="mobile-chart-value">{day.earnings > 0 ? `$${Math.round(day.earnings)}` : ""}</span>
                    <span className={`mobile-chart-track ${day.earnings > 0 ? "has-value" : ""}`}><span style={{ height: `${day.earnings > 0 ? Math.max((day.earnings / maxEarnings) * 100, 8) : 0}%` }}></span></span>
                    <strong>{day.shortDate}</strong><small>{day.dayLabel}</small>
                  </button>
                );
              })}
            </div>

            {!isSelectedDayMode && (
              <div className="mobile-earnings-stats mobile-selection-content">
                <div><span>Online</span><strong>{formatHoursAndMinutes(displayedOnlineHours)}</strong></div>
                <div><span>Real work</span><strong>{displayedRealWorkHours !== null ? formatHoursAndMinutes(displayedRealWorkHours) : "—"}</strong></div>
                <div><span>Trips</span><strong><AnimatedNumber value={displayedTrips} format={(value) => String(Math.round(value))} flash={false} /></strong></div>
                <div><span>Work miles</span><strong>{displayedWorkMiles !== null ? <AnimatedNumber value={displayedWorkMiles} format={(value) => value.toFixed(1)} flash={false} /> : "—"}</strong></div>
                <div><span>Online $/hr</span><strong><AnimatedNumber value={displayedAverageHourly} format={(value) => `$${value.toFixed(2)}`} flash={false} /></strong></div>
                <div><span>Real $/hr</span><strong>{displayedEarningsPerRealHour !== null ? <AnimatedNumber value={displayedEarningsPerRealHour} format={(value) => `$${value.toFixed(2)}`} flash={false} /> : "—"}</strong></div>
              </div>
            )}


            {isSelectedDayMode && selectedRecord && (
              <section
                className="mobile-selected-day-snapshot mobile-selection-content"
                key={`snapshot-${selectedRecord.date}`}
              >
                <header>
                  <div><span>Selected day</span><h2>At a glance</h2></div>
                  <button type="button" onClick={() => handleEdit(selectedRecord)}>Edit day</button>
                </header>
                <div className="mobile-day-snapshot-group">
                  <span className="mobile-day-snapshot-group-label">Performance</span>
                  <div className="mobile-performance-chips mobile-day-snapshot-labels" aria-label="Daily performance indicators">
                    {getMobilePerformanceLabels(selectedRecord).map((label) => (
                      <LabelChip key={label} label={label} record={selectedRecord} />
                    ))}
                  </div>
                </div>
                <div className="mobile-day-snapshot-group mobile-day-snapshot-efficiency">
                  <span className="mobile-day-snapshot-group-label">Efficiency</span>
                  <div className="mobile-day-efficiency-grid">
                    <div><span>Online $/hr</span><strong>${selectedRecord.avg_hourly.toFixed(2)}</strong></div>
                    <div><span>Real $/hr</span><strong>{selectedRecord.earnings_per_real_work_hour !== null ? `$${selectedRecord.earnings_per_real_work_hour.toFixed(2)}` : "—"}</strong></div>
                    <div><span>$/work mile</span><strong>{selectedRecord.earnings_per_work_mile !== null ? `$${selectedRecord.earnings_per_work_mile.toFixed(2)}` : "—"}</strong></div>
                    <div><span>Miles/trip</span><strong>{selectedRecord.miles_per_trip !== null ? selectedRecord.miles_per_trip.toFixed(1) : "—"}</strong></div>
                  </div>
                </div>
                {(selectedRecord.day_tags || []).length > 0 && (
                  <div className="mobile-day-snapshot-group mobile-day-snapshot-context">
                    <span className="mobile-day-snapshot-group-label">Context</span>
                    <div className="mobile-inline-effects mobile-day-snapshot-effects" aria-label="Day context">
                      {selectedRecord.day_tags.map((tag) => <DayTagChip tagValue={tag} key={tag} />)}
                    </div>
                  </div>
                )}
                {selectedDayQuickRecap && <p><strong>Quick recap:</strong> {selectedDayQuickRecap}</p>}
              </section>
            )}

            <div className="mobile-week-detail-sections mobile-selection-content" key={`details-${selectedRecordDate || selectedWeekStart}`}>
                <section>
                  <h2>Earnings breakdown</h2>
                  <div><span>Net fare</span><strong>${displayedNetFare.toFixed(2)}</strong></div>
                  <div><span>Tips</span><strong>${displayedTips.toFixed(2)}</strong></div>
                  {isSelectedDayMode && displayedCashTips > 0 && <div><span>Cash tips included</span><strong>${displayedCashTips.toFixed(2)}</strong></div>}
                  <div><span>Promotions</span><strong>${displayedPromotions.toFixed(2)}</strong></div>
                  <div className="total"><span>Total earnings</span><strong>${displayedTotalEarnings.toFixed(2)}</strong></div>
                </section>
                {isSelectedDayMode && selectedRecord && <>
                  <section>
                    <h2>Activity totals</h2>
                    <div><span>Trips</span><strong>{selectedRecord.trips}</strong></div>
                    <div title="Individual completion times retained for future trip analytics">
                      <span>Recorded timestamps</span>
                      <strong>{selectedRecord.trip_events?.length || 0} of {selectedRecord.trips}</strong>
                    </div>
                    <div><span>Online time</span><strong>{formatHoursAndMinutes(selectedRecord.online_hours)}</strong></div>
                    <div><span>Real work</span><strong>{selectedRecord.real_work_hours !== null ? formatHoursAndMinutes(selectedRecord.real_work_hours) : "Not tracked"}</strong></div>
                    <div><span>Break time</span><strong>{selectedRecord.break_hours ? formatHoursAndMinutes(selectedRecord.break_hours) : "None"}</strong></div>
                    <div><span>Work miles</span><strong>{selectedRecord.work_miles !== null ? selectedRecord.work_miles.toFixed(1) : "Not tracked"}</strong></div>
                  </section>
                  {(selectedRecord.work_sessions || []).length > 0 && <section>
                    <h2>Sessions & breaks</h2>
                    {selectedRecord.work_sessions.map((session, index) => <div key={`${session.start_time}-${index}`}><span>Session {index + 1}</span><strong>{session.start_time}–{session.stop_time}</strong></div>)}
                    {(selectedRecord.breaks || []).map((item, index) => <div key={`${item.start_time}-${index}`}><span>Break {index + 1}</span><strong>{item.start_time}–{item.end_time}</strong></div>)}
                  </section>}
                  {selectedRecord.notes && <section>
                    <h2>Notes</h2>
                    <p className="mobile-inline-note">{selectedRecord.notes}</p>
                  </section>}
                </>}
                {!isSelectedDayMode && weeklyQuickRecap && <section><h2>Weekly recap</h2><p>{weeklyQuickRecap}</p></section>}
                {!isSelectedDayMode && currentWeekData && <section className="mobile-week-notes-editor">
                  <h2>Weekly notes</h2>
                  {isEditingWeeklyNote ? <>
                    <textarea value={weeklyNoteDraft} onChange={(event) => setWeeklyNoteDraft(event.target.value)} placeholder="How did this week feel?" rows="4" />
                    <div className="mobile-sheet-actions">
                      <button type="button" onClick={() => { setWeeklyNoteDraft(currentWeekData.notes || ""); setIsEditingWeeklyNote(false); }}>Cancel</button>
                      <button type="button" className="primary-button" onClick={handleSaveWeeklyNote} disabled={isSavingWeeklyNote}>{isSavingWeeklyNote ? "Saving…" : "Save note"}</button>
                    </div>
                  </> : <>
                    <p>{currentWeekData.notes || "No reflection saved for this week."}</p>
                    <button type="button" onClick={() => setIsEditingWeeklyNote(true)}>{currentWeekData.notes ? "Edit note" : "Add note"}</button>
                  </>}
                </section>}
            </div>

            <article className="mobile-wallet-card">
              <span>Wallet</span>
              <h2>{summary?.current_wallet_balance !== null && summary?.current_wallet_balance !== undefined ? `$${summary.current_wallet_balance.toFixed(2)}` : "Not logged"}</h2>
              <p>{summary?.current_wallet_as_of ? `Last recorded ${formatMobileDate(summary.current_wallet_as_of)}` : "Add a wallet balance to a daily log."}</p>
              {walletFloor !== null && summary?.current_wallet_balance !== null && <small>${Math.max(summary.current_wallet_balance - walletFloor, 0).toFixed(2)} above wallet floor</small>}
            </article>
          </section>
        )}

        {mobileTab === "more" && (
          <section className="mobile-tab-panel mobile-more-panel">
            <h2>Tracking</h2>
            <button type="button" className="mobile-more-row" onClick={() => openQuestManager()}><span><strong>Manage quests</strong><small>{mobileSortedQuests.length} saved</small></span><b>›</b></button>
            <article className="mobile-settings-card mobile-sound-setting">
              <div><strong>Sound effects</strong><span>Trip saves and quest milestones</span></div>
              <button
                type="button"
                className="mobile-setting-toggle"
                aria-pressed={mobileSoundEffectsEnabled}
                onClick={toggleMobileSoundEffects}
              >
                {mobileSoundEffectsEnabled ? "On" : "Off"}
              </button>
            </article>
            <h2>Wallet</h2>
            <article className="mobile-settings-card">
              <div><strong>Wallet floor</strong><span>Reference amount kept in Uber</span></div>
              {isEditingWalletFloor ? <div className="mobile-setting-editor"><input type="number" min="0" step="0.01" value={walletFloorInput} onChange={(event) => setWalletFloorInput(event.target.value)} /><button type="button" onClick={saveWalletFloor}>Save</button></div> : <button type="button" onClick={() => setIsEditingWalletFloor(true)}>{walletFloor !== null ? `$${walletFloor.toFixed(2)}` : "Set"}</button>}
            </article>
            <h2>Data</h2>
            <article className="mobile-settings-card mobile-backup-card">
              <div><strong>Backup data</strong><span>Import or export one complete CSV</span></div>
              <div className="mobile-backup-actions"><button type="button" onClick={handleImportButtonClick} disabled={isImporting}>{isImporting ? "Reading…" : "Import"}</button><a href={`${API_BASE_URL}/api/daily/csv`}>Export</a></div>
            </article>
            <article className="mobile-settings-card mobile-danger-setting"><div><strong>Delete daily records</strong><span>Type-to-confirm protection is required</span></div><button type="button" className="delete-button" onClick={handleOpenDeleteAll}>Delete all</button></article>
            <h2>Application</h2>
            {!isStandaloneApp && (
              <article className="mobile-settings-card mobile-install-card">
                <div><strong>Install mobile app</strong><span>Open in its own window from your home screen</span></div>
                {installPrompt ? (
                  <button type="button" className="primary-button" onClick={installMobileApp}>Install</button>
                ) : (
                  <span className="mobile-install-hint">Use Chrome’s Add to Home screen menu</span>
                )}
              </article>
            )}
            <div className="mobile-app-info"><strong>Uber Nest Tracker</strong><span>Version 4.1.0</span></div>
          </section>
        )}
      </div>

      <section className="hero desktop-primary">
        <p className="eyebrow">Uber Dashboard v4.1.0</p>
        <h1>Uber Nest Tracker</h1>
        <p className="subtitle">
          Track earnings, mileage truth, real time, and daily Uber efficiency.
        </p>
      </section>

      {summary ? (
        <section className="summary-grid desktop-primary">
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

                {isEditingWalletFloor ? (
                  <span className="card-caption wallet-floor-edit-row">
                    Floor: $
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      className="wallet-floor-input"
                      value={walletFloorInput}
                      onChange={(e) => setWalletFloorInput(e.target.value)}
                      autoFocus
                    />
                    <button type="button" className="wallet-floor-save-button" onClick={saveWalletFloor}>
                      Save
                    </button>
                  </span>
                ) : walletFloor !== null ? (
                  <span className="card-caption">
                    Floor: ${walletFloor.toFixed(2)} · $
                    {Math.max(summary.current_wallet_balance - walletFloor, 0).toFixed(2)} above floor{" "}
                    <button
                      type="button"
                      className="wallet-floor-edit-trigger"
                      onClick={() => setIsEditingWalletFloor(true)}
                    >
                      edit
                    </button>
                  </span>
                ) : (
                  <button
                    type="button"
                    className="wallet-floor-edit-trigger"
                    onClick={() => setIsEditingWalletFloor(true)}
                  >
                    + set a floor reference
                  </button>
                )}
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
        <p className="desktop-primary">Loading summary...</p>
      )}

      {weeklyChartData.length > 0 && (
        <section className={`chart-section responsive-weekly-section ${mobileTab === "weekly" ? "mobile-weekly-visible" : ""}`}>
          <div className="weekly-chart-top">
            <div>
              <div className="week-nav-group">
                <p className="eyebrow">
                  {isSelectedDayMode ? "Selected day" : "Weekly earnings"}
                </p>

                <div className="week-nav">
                  <button
                    type="button"
                    aria-label="Previous week"
                    onClick={() => changeWeek(-7)}
                  >
                    ←
                  </button>

                  <h2>
                    {isSelectedDayMode
                      ? formatRecordDate(selectedChartDay.date)
                      : weekStartDate && weekEndDate
                        ? `${formatShortDate(weekStartDate)} - ${formatShortDate(weekEndDate)}`
                        : "Current week"}
                  </h2>

                  <button
                    type="button"
                    aria-label="Next week"
                    onClick={() => changeWeek(7)}
                  >
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

          <details className="quest-panel">
            <summary>
              {featuredQuest ? (
                <div className="quest-panel-summary-content">
                  <div className="quest-summary-title">
                    <strong>{featuredQuest.title}</strong>
                    <span
                      className={`quest-status quest-status-${featuredQuest.status.toLowerCase()}`}
                    >
                      {featuredQuest.status}
                    </span>
                  </div>

                  <div className="quest-summary-progress">
                    <span>
                      {Math.min(featuredQuest.progress_trips, featuredQuest.final_tier_trips)}
                      {" / "}
                      {featuredQuest.final_tier_trips} trips
                    </span>
                    <QuestTierProgress quest={featuredQuest} />
                  </div>

                  <span className="quest-summary-bonus">
                    ${featuredQuest.total_possible_bonus.toFixed(2)} potential
                  </span>
                </div>
              ) : (
                <div className="quest-panel-summary-content quest-panel-summary-empty">
                  <strong>Quests</strong>
                  <span>
                    {isSelectedDayMode
                      ? "None cover this day"
                      : "None overlap this week"}
                  </span>
                </div>
              )}
            </summary>

            <div className="quest-panel-body">
              {questPanelQuests.length > 0 ? (
                <div className="quest-week-list">
                  {questPanelQuests.map((quest) => (
                    <details className="quest-progress-card" key={quest.id}>
                      <summary className="quest-progress-card-summary">
                        <div className="quest-progress-card-heading">
                          <div>
                            <strong>{quest.title}</strong>
                            <span>
                              {formatShortDate(new Date(`${quest.start_date}T00:00:00`))}
                              {" - "}
                              {formatShortDate(new Date(`${quest.end_date}T00:00:00`))}
                            </span>
                          </div>
                          <span
                            className={`quest-status quest-status-${quest.status.toLowerCase()}`}
                          >
                            {quest.status}
                          </span>
                        </div>

                        <div className="quest-progress-card-total">
                          <span>
                            {Math.min(quest.progress_trips, quest.final_tier_trips)}
                            {" / "}
                            {quest.final_tier_trips} trips
                          </span>
                          <QuestTierProgress quest={quest} />
                        </div>

                        <div className="quest-progress-card-bonus-summary">
                          <span>${quest.earned_bonus.toFixed(2)} earned</span>
                          <span>
                            ${quest.total_possible_bonus.toFixed(2)} potential
                          </span>
                        </div>

                        <span className="quest-progress-card-chevron" aria-hidden="true">
                          ▾
                        </span>
                      </summary>

                      <div className="quest-progress-card-details">
                        <div className="quest-tier-grid">
                          <div>
                            <span>First tier</span>
                            <strong>
                              {Math.min(quest.progress_trips, quest.first_tier_trips)}
                              {" / "}
                              {quest.first_tier_trips}
                            </strong>
                            <small>
                              {quest.first_tier_earned
                                ? `$${quest.first_tier_bonus.toFixed(2)} earned`
                                : `${quest.first_tier_remaining} trips remaining`}
                            </small>
                          </div>
                          <div>
                            <span>Final tier</span>
                            <strong>
                              {Math.min(quest.progress_trips, quest.final_tier_trips)}
                              {" / "}
                              {quest.final_tier_trips}
                            </strong>
                            <small>
                              {quest.final_tier_earned
                                ? `+$${quest.final_additional_bonus.toFixed(2)} earned`
                                : `${quest.final_tier_remaining} trips remaining`}
                            </small>
                          </div>
                        </div>
                      </div>
                    </details>
                  ))}
                </div>
              ) : (
                <p className="quest-panel-empty-copy">
                  {isSelectedDayMode
                    ? "No quest covers the selected day."
                    : "No quest overlaps the visible week. Create one now or browse to a week containing a saved quest."}
                </p>
              )}

              <button
                type="button"
                className="quest-manage-button"
                onClick={() => openQuestManager()}
              >
                Manage quests
              </button>
            </div>
          </details>

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
              {displayedBreakHours !== null && displayedBreakHours !== undefined && (
                <span className="break-time-summary">
                  Break{" "}
                  <AnimatedNumber value={displayedBreakHours} format={formatHoursAndMinutes} />
                </span>
              )}
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

          {!isSelectedDayMode && weeklyQuickRecap && (
            <div className="quick-weekly-recap">
              <strong>Weekly recap</strong>
              <p>{weeklyQuickRecap}</p>
            </div>
          )}

          {shouldWarnRealWorkShortfall && (
            <div className="time-consistency-warning" role="status">
              <strong>Check work-session times</strong>
              <span>
                Real work is {formatHoursAndMinutes(selectedRealWorkShortfall)} shorter
                than Uber online time. Real work normally includes additional driving,
                so a session or break may be incomplete.
              </span>
            </div>
          )}

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
                    <span className="legend-label-stack">
                      <span className="legend-label">Tips</span>
                      {displayedCashTips > 0 && (
                        <span className="legend-detail">
                          ${displayedCashTips.toFixed(2)} cash
                        </span>
                      )}
                    </span>
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

          {!isSelectedDayMode && currentWeekData && (
            currentWeekData.notes || isEditingWeeklyNote ? (
              <div className="weekly-notes-block">
                <div className="weekly-notes-heading">
                  <div>
                    <strong>Weekly notes</strong>
                  </div>
                  {!isEditingWeeklyNote && (
                    <button
                      type="button"
                      className="weekly-note-edit-button"
                      onClick={() => setIsEditingWeeklyNote(true)}
                    >
                      Edit
                    </button>
                  )}
                </div>

                {isEditingWeeklyNote ? (
                  <div className="weekly-note-editor">
                    <textarea
                      value={weeklyNoteDraft}
                      onChange={(event) => setWeeklyNoteDraft(event.target.value)}
                      rows="3"
                      placeholder="How did this week feel? What stood out?"
                    />
                    <div className="weekly-note-actions">
                      <button
                        type="button"
                        onClick={() => {
                          setWeeklyNoteDraft(currentWeekData.notes || "");
                          setIsEditingWeeklyNote(false);
                        }}
                        disabled={isSavingWeeklyNote}
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        className="primary-button"
                        onClick={handleSaveWeeklyNote}
                        disabled={isSavingWeeklyNote}
                      >
                        {isSavingWeeklyNote ? "Saving..." : "Save note"}
                      </button>
                    </div>
                  </div>
                ) : (
                  <p>{currentWeekData.notes}</p>
                )}
              </div>
            ) : (
              <div className="weekly-note-add-row">
                <button
                  type="button"
                  className="weekly-note-edit-button"
                  onClick={() => setIsEditingWeeklyNote(true)}
                >
                  + Add weekly note
                </button>
              </div>
            )
          )}

          {(selectedRecordIsInVisibleWeek || selectedEmptyDayIsInVisibleWeek) && (
            <div className="selected-day-extra">
              {selectedRecordIsInVisibleWeek ? (
                <>
                  <div className="selected-day-footer-top">
                    <div className="selected-day-details">
                      <div className="label-row">
                        <LabelChip label={selectedRecord.hourly_label} record={selectedRecord} />
                        {getVisiblePromoLabel(selectedRecord) && (
                          <LabelChip
                            label={getVisiblePromoLabel(selectedRecord)}
                            record={selectedRecord}
                          />
                        )}
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

                  {selectedDayQuickRecap && (
                    <div className="quick-daily-recap">
                      <strong>Quick recap:</strong>
                      <p>{selectedDayQuickRecap}</p>
                    </div>
                  )}

                  {Array.isArray(selectedRecord.day_tags) && selectedRecord.day_tags.length > 0 && (
                    <div className="day-tag-display-row">
                      {selectedRecord.day_tags.map((tag) => (
                        <DayTagChip tagValue={tag} key={tag} />
                      ))}
                    </div>
                  )}

                  {Array.isArray(selectedRecord.work_sessions) &&
                    selectedRecord.work_sessions.length > 0 && (
                      <details className="mileage-breakdown">
                        <summary>Mileage breakdown</summary>
                        <div className="mileage-breakdown-body">
                          {selectedRecord.work_sessions.map((session, index) => (
                            <div className="mileage-breakdown-row" key={index}>
                              <span>Session {index + 1} gross</span>
                              <strong>
                                {session.miles !== null && session.miles !== undefined
                                  ? `${session.miles.toFixed(1)} miles`
                                  : "Not fully logged"}
                              </strong>
                            </div>
                          ))}

                          <div className="mileage-breakdown-row mileage-breakdown-excluded">
                            <span>Break miles excluded</span>
                            <strong>
                              {selectedRecord.break_miles !== null &&
                              selectedRecord.break_miles !== undefined
                                ? `${selectedRecord.break_miles.toFixed(1)} miles`
                                : Array.isArray(selectedRecord.breaks) &&
                                    selectedRecord.breaks.length > 0
                                  ? "Not tracked"
                                  : "0.0 miles"}
                            </strong>
                          </div>

                          <div className="mileage-breakdown-row mileage-breakdown-total">
                            <span>Total work miles</span>
                            <strong>
                              {selectedRecord.work_miles !== null &&
                              selectedRecord.work_miles !== undefined
                                ? `${selectedRecord.work_miles.toFixed(1)} miles`
                                : "Not fully logged"}
                            </strong>
                          </div>
                        </div>
                      </details>
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
        <section className={`empty-card responsive-weekly-section ${mobileTab === "weekly" ? "mobile-weekly-visible" : ""}`}>
          <p className="eyebrow">Weekly earnings</p>
          <h2>No weekly data yet</h2>
          <p>Add a daily log to build your first weekly earnings chart.</p>
          <button type="button" className="quest-manage-button" onClick={() => openQuestManager()}>
            Manage quests
          </button>
        </section>
      )}


      <section className="table-section desktop-primary">
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
              {isImporting ? "Reading..." : "Import backup CSV"}
            </button>

            {(dailyRecords.length > 0 || quests.length > 0) && (
              <a
                className="export-csv-button"
                href={`${API_BASE_URL}/api/daily/csv`}
              >
                Export backup CSV
              </a>
            )}
          </div>
        </div>

        <div className="daily-log-notification-area">
          <AnimatedNotification message={error} type="error" />
          <AnimatedNotification message={successMessage} type="success" />
        </div>

        {importPreview && (
          <div className="import-preview-panel">
            <h3>Import preview</h3>
            <p className="import-preview-summary">
              Daily logs: <strong>{importPreview.new_count}</strong> new,{" "}
              <strong>{importPreview.update_count}</strong> overwritten.
              {" "}Quests: <strong>{importPreview.quest_new_count ?? 0}</strong>{" "}
              new, <strong>{importPreview.quest_update_count ?? 0}</strong>{" "}
              updated. Weekly notes:{" "}
              <strong>{importPreview.weekly_note_new_count ?? 0}</strong> new,{" "}
              <strong>{importPreview.weekly_note_update_count ?? 0}</strong> updated
              {importPreview.error_count > 0 && (
                <>
                  . <strong>{importPreview.error_count}</strong> row
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
            Import complete: daily logs {importResult.inserted} added and{" "}
            {importResult.updated} updated; quests{" "}
            {importResult.quests_inserted ?? 0} added and{" "}
            {importResult.quests_updated ?? 0} updated; weekly notes{" "}
            {importResult.weekly_notes_inserted ?? 0} added and{" "}
            {importResult.weekly_notes_updated ?? 0} updated
            {importResult.error_count > 0
              ? `, ${importResult.error_count} row${importResult.error_count === 1 ? "" : "s"} skipped.`
              : "."}
          </p>
        )}

      {(isFormOpen || editingDate) && (
      <section
        className={`form-section ${isDailyLogFormClosing ? "form-section-closing" : ""}`}
        ref={formSectionRef}
      >
        <div className="form-section-header">
          <h2>{editingDate ? `Edit daily log: ${editingDate}` : "Add daily log"}</h2>
          <button type="button" className="mobile-form-close" onClick={cancelEdit} aria-label="Close form">×</button>
        </div>

        <form onSubmit={handleSubmit} className="entry-form">
          <div className="mobile-form-section-title">
            <strong>Basics</strong>
            <span>Date, time online, and completed trips</span>
          </div>
          <label>
            Date
            <input
              type="date"
              name="date"
              value={formData.date}
              onChange={handleInputChange}
              required
            />
            {formData.date > getTodayInputValue() && (
              <span className="future-date-warning">This date is in the future. Double-check it before saving.</span>
            )}
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

          <div className="mobile-form-section-title">
            <strong>Earnings</strong>
            <span>Uber earnings and separate cash tips</span>
          </div>
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
            App tips
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
            Cash tips optional
            <input
              type="number"
              name="cash_tips"
              value={formData.cash_tips}
              onChange={handleInputChange}
              step="0.01"
              min="0"
            />
          </label>

          <div className="mobile-form-section-title">
            <strong>Context</strong>
            <span>Optional wallet snapshot, notes, and day effects</span>
          </div>
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
              rows="1"
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
                            className={`day-tag-toggle day-tag-toggle-${group.category} ${isSelected ? "day-tag-toggle-active" : ""}`}
                            onClick={(event) => {
                              toggleDayTag(tag.value);
                              event.currentTarget.blur();
                            }}
                            aria-pressed={isSelected}
                          >
                            <DayTagIcon category={group.category} />
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
              <div className="work-session-manager">
                <div className="work-session-manager-header tracking-section-header">
                  <div>
                    <h3>Work sessions</h3>
                    <p>
                      Session 1 is the normal work period. Add another when you
                      stop working and go back out later.
                    </p>
                  </div>
                </div>

                <div className="work-session-list">
                  {formData.work_sessions.map((session, index) => (
                    <section className="work-session-card" key={index}>
                      <div className="work-session-card-header">
                        <strong>Session {index + 1}</strong>
                        {index > 0 && (
                          <button
                            type="button"
                            className="remove-break-button"
                            onClick={() => removeWorkSession(index)}
                            aria-label={`Remove session ${index + 1}`}
                          >
                            Remove
                          </button>
                        )}
                      </div>

                      <div className="work-session-fields">
                        <label>
                          Start time
                          <div className="time-input-row">
                            <input
                              type="text"
                              value={session.start_time_value}
                              onChange={(event) =>
                                updateWorkSession(
                                  index,
                                  "start_time_value",
                                  event.target.value
                                )
                              }
                              placeholder="12:00"
                            />
                            <select
                              value={session.start_time_meridiem}
                              onChange={(event) =>
                                updateWorkSession(
                                  index,
                                  "start_time_meridiem",
                                  event.target.value
                                )
                              }
                            >
                              <option value="AM">AM</option>
                              <option value="PM">PM</option>
                            </select>
                          </div>
                        </label>

                        <label>
                          Stop time
                          <div className="time-input-row">
                            <input
                              type="text"
                              value={session.stop_time_value}
                              onChange={(event) =>
                                updateWorkSession(
                                  index,
                                  "stop_time_value",
                                  event.target.value
                                )
                              }
                              placeholder="1:00"
                            />
                            <select
                              value={session.stop_time_meridiem}
                              onChange={(event) =>
                                updateWorkSession(
                                  index,
                                  "stop_time_meridiem",
                                  event.target.value
                                )
                              }
                            >
                              <option value="AM">AM</option>
                              <option value="PM">PM</option>
                            </select>
                          </div>
                        </label>

                        <label>
                          Start odometer optional
                          <input
                            type="number"
                            value={session.start_odometer}
                            onChange={(event) =>
                              updateWorkSession(
                                index,
                                "start_odometer",
                                event.target.value
                              )
                            }
                            step="0.1"
                            min="0"
                          />
                        </label>

                        <label>
                          Stop odometer optional
                          <input
                            type="number"
                            value={session.stop_odometer}
                            onChange={(event) =>
                              updateWorkSession(
                                index,
                                "stop_odometer",
                                event.target.value
                              )
                            }
                            step="0.1"
                            min="0"
                          />
                        </label>
                      </div>
                    </section>
                  ))}
                </div>

                <div className="tracking-section-action">
                  <button
                    type="button"
                    className="add-session-button"
                    onClick={addWorkSession}
                  >
                    + Add another session
                  </button>
                </div>
              </div>

              <div className="break-session-manager">
                <div className="break-session-manager-header tracking-section-header">
                  <div>
                    <h3>Breaks</h3>
                    <p>
                      Add a session only when you took a break. Time pauses real
                      work; optional odometers exclude break driving. Each break
                      must fit inside one work session.
                    </p>
                  </div>
                </div>

                {formData.breaks.length > 0 && (
                  <div className="break-session-list">
                    {formData.breaks.map((session, index) => (
                      <section className="break-session-card" key={index}>
                        <div className="break-session-card-header">
                          <strong>Break {index + 1}</strong>
                          <button
                            type="button"
                            className="remove-break-button"
                            onClick={() => removeBreakSession(index)}
                            aria-label={`Remove break ${index + 1}`}
                          >
                            Remove
                          </button>
                        </div>

                        <div className="break-session-fields">
                          <label>
                            Start time
                            <div className="time-input-row">
                              <input
                                type="text"
                                value={session.start_time_value}
                                onChange={(event) =>
                                  updateBreakSession(
                                    index,
                                    "start_time_value",
                                    event.target.value
                                  )
                                }
                                placeholder="6:20"
                              />
                              <select
                                value={session.start_time_meridiem}
                                onChange={(event) =>
                                  updateBreakSession(
                                    index,
                                    "start_time_meridiem",
                                    event.target.value
                                  )
                                }
                              >
                                <option value="AM">AM</option>
                                <option value="PM">PM</option>
                              </select>
                            </div>
                          </label>

                          <label>
                            End time
                            <div className="time-input-row">
                              <input
                                type="text"
                                value={session.end_time_value}
                                onChange={(event) =>
                                  updateBreakSession(
                                    index,
                                    "end_time_value",
                                    event.target.value
                                  )
                                }
                                placeholder="7:07"
                              />
                              <select
                                value={session.end_time_meridiem}
                                onChange={(event) =>
                                  updateBreakSession(
                                    index,
                                    "end_time_meridiem",
                                    event.target.value
                                  )
                                }
                              >
                                <option value="AM">AM</option>
                                <option value="PM">PM</option>
                              </select>
                            </div>
                          </label>

                          <label>
                            Start odometer optional
                            <input
                              type="number"
                              value={session.start_odometer}
                              onChange={(event) =>
                                updateBreakSession(
                                  index,
                                  "start_odometer",
                                  event.target.value
                                )
                              }
                              step="0.1"
                              min="0"
                            />
                          </label>

                          <label>
                            End odometer optional
                            <input
                              type="number"
                              value={session.end_odometer}
                              onChange={(event) =>
                                updateBreakSession(
                                  index,
                                  "end_odometer",
                                  event.target.value
                                )
                              }
                              step="0.1"
                              min="0"
                            />
                          </label>
                        </div>
                      </section>
                    ))}
                  </div>
                )}

                <div className="tracking-section-action">
                  <button
                    type="button"
                    className="add-break-button"
                    onClick={addBreakSession}
                  >
                    + Add break
                  </button>
                </div>
              </div>

              <div className="final-return-section">
                <div className="advanced-section-heading tracking-section-header">
                  <h3>Final return home</h3>
                  <p>
                    Optional. These apply only after the final work session.
                  </p>
                </div>

                <div className="final-return-fields">
                  <label>
                    Home/end time
                    <div className="time-input-row">
                      <input
                        type="text"
                        name="home_end_time_value"
                        value={formData.home_end_time_value}
                        onChange={handleInputChange}
                        placeholder="9:00"
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

                  <label>
                    Home-end odometer
                    <input
                      type="number"
                      name="end_home_odometer"
                      value={formData.end_home_odometer}
                      onChange={handleInputChange}
                      step="0.1"
                      min="0"
                    />
                  </label>
                </div>
              </div>
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
                      {getVisiblePromoLabel(record) && (
                        <LabelChip
                          label={getVisiblePromoLabel(record)}
                          record={record}
                        />
                      )}
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

      <nav className="mobile-bottom-nav" aria-label="Mobile navigation">
        {[
          ["today", "Today"],
          ["earnings", "Earnings"],
          ["more", "More"],
        ].map(([tabValue, label]) => (
          <button
            type="button"
            className={mobileTab === tabValue ? "active" : ""}
            key={tabValue}
            onClick={() => {
              setMobileTab(tabValue);
              if (tabValue === "today") {
                const today = getTodayInputValue();
                selectRecordAndWeek(today);
              } else if (tabValue === "earnings") {
                setSelectedRecordDate(null);
              }
              window.scrollTo({ top: 0, behavior: "smooth" });
            }}
          >
            <span className={`mobile-nav-icon mobile-nav-icon-${tabValue}`} aria-hidden="true"></span>
            <span>{label}</span>
          </button>
        ))}
      </nav>

      {isQuickUpdateOpen && mobileDayRecord && (
        <div
          className={`mobile-sheet-overlay ${closingMobileSheet === "quick-update" ? "mobile-sheet-closing" : ""}`}
          onClick={closeQuickUpdateSheet}
        >
          <form className="mobile-quick-sheet" onSubmit={saveQuickUpdate} onClick={(event) => event.stopPropagation()}>
            <div className="mobile-sheet-handle"></div>
            <div className="mobile-sheet-heading">
              <div>
                <span>Quick update</span>
                <h2>{formatMobileDate(mobileDayRecord.date)}</h2>
              </div>
              <button type="button" onClick={closeQuickUpdateSheet} aria-label="Close quick update">×</button>
            </div>
            <div className="mobile-quick-grid">
              <label>
                Trips
                <input type="number" min="1" step="1" value={quickUpdateForm.trips} onChange={(event) => setQuickUpdateForm((current) => ({ ...current, trips: event.target.value }))} required />
              </label>
              <label>
                Net fare
                <input type="number" min="0" step="0.01" value={quickUpdateForm.net_fare} onChange={(event) => setQuickUpdateForm((current) => ({ ...current, net_fare: event.target.value }))} required />
              </label>
              <label>
                App tips
                <input type="number" min="0" step="0.01" value={quickUpdateForm.tips} onChange={(event) => setQuickUpdateForm((current) => ({ ...current, tips: event.target.value }))} required />
              </label>
              <label>
                Promotions
                <input type="number" min="0" step="0.01" value={quickUpdateForm.promotions} onChange={(event) => setQuickUpdateForm((current) => ({ ...current, promotions: event.target.value }))} />
              </label>
              <label className="mobile-quick-cash">
                Cash tips
                <input type="number" min="0" step="0.01" value={quickUpdateForm.cash_tips} onChange={(event) => setQuickUpdateForm((current) => ({ ...current, cash_tips: event.target.value }))} />
              </label>
            </div>
            <div className="mobile-sheet-actions">
              <button type="button" onClick={closeQuickUpdateSheet} disabled={isSavingQuickUpdate}>Cancel</button>
              <button type="submit" className="primary-button" disabled={isSavingQuickUpdate}>{isSavingQuickUpdate ? "Saving…" : "Save update"}</button>
            </div>
          </form>
        </div>
      )}

      {mobileTrackingAction && (
        <div
          className={`mobile-sheet-overlay ${closingMobileSheet === "tracking" ? "mobile-sheet-closing" : ""}`}
          onClick={closeMobileTrackingSheet}
        >
          <form className="mobile-quick-sheet mobile-tracking-sheet" onSubmit={handleMobileTrackingSubmit} onClick={(event) => event.stopPropagation()}>
            <div className="mobile-sheet-handle"></div>
            <div className="mobile-sheet-heading">
              <div>
                <span>Live tracking</span>
                <h2>{{
                  start_session: activeMobileShift ? "Start another session" : "Start live session",
                  start_break: "Start break",
                  resume_session: "Resume session",
                  end_session: "End session",
                  record_home: "Record final return home",
                  edit_home: "Edit final return home",
                }[mobileTrackingAction]}</h2>
              </div>
              <button type="button" onClick={closeMobileTrackingSheet} aria-label="Close live tracking">×</button>
            </div>
            {mobileTrackingAction === "end_session" && isMobileBreakRunning && <p className="mobile-tracking-notice">The active break will end at the same time as this session.</p>}
            {mobileTrackingAction === "record_home" && <p className="mobile-tracking-notice mobile-current-time-notice">The current time was filled in automatically. Adjust it only if you arrived earlier.</p>}
            <div className="mobile-tracking-fields">
              <label>
                Time
                <div className="mobile-time-entry">
                  <input type="text" inputMode="numeric" value={mobileTrackingForm.time_value} onChange={(event) => setMobileTrackingForm((current) => ({ ...current, time_value: event.target.value }))} placeholder="5:30" required />
                  <select value={mobileTrackingForm.meridiem} onChange={(event) => setMobileTrackingForm((current) => ({ ...current, meridiem: event.target.value }))}><option>AM</option><option>PM</option></select>
                </div>
              </label>
              <label>
                Odometer <span>optional</span>
                <input type="number" inputMode="decimal" min="0" step="0.1" value={mobileTrackingForm.odometer} onChange={(event) => setMobileTrackingForm((current) => ({ ...current, odometer: event.target.value }))} placeholder="Current mileage" />
              </label>
            </div>
            <div className="mobile-sheet-actions">
              <button type="button" onClick={closeMobileTrackingSheet} disabled={isSavingMobileTracking}>Cancel</button>
              <button type="submit" className="primary-button" disabled={isSavingMobileTracking}>{isSavingMobileTracking ? "Saving…" : "Confirm"}</button>
            </div>
          </form>
        </div>
      )}

      {isMobileDraftDetailsOpen && activeMobileShift && (
        <div
          className={`mobile-sheet-overlay ${closingMobileSheet === "draft-details" ? "mobile-sheet-closing" : ""}`}
          onClick={closeMobileDraftDetailsSheet}
        >
          <form className="mobile-quick-sheet mobile-draft-details-sheet" onSubmit={saveMobileDraftDetails} onClick={(event) => event.stopPropagation()}>
            <div className="mobile-sheet-handle"></div>
            <div className="mobile-sheet-heading">
              <div><span>Saved before earnings</span><h2>Shift details</h2></div>
              <button type="button" onClick={closeMobileDraftDetailsSheet} aria-label="Close shift details">×</button>
            </div>
            <p className="mobile-draft-details-intro">Add context while the shift is fresh. You can enter fare and tips later.</p>
            {mobileDraftDetailsError && <p className="mobile-sheet-error" role="alert">{mobileDraftDetailsError}</p>}
            <div className="mobile-draft-tag-picker">
              {DAY_TAG_GROUPS.map((group) => (
                <div className="day-tag-group" key={group.group}>
                  <span className="day-tag-group-label"><DayTagIcon category={group.category} />{group.group}</span>
                  <div className="day-tag-chip-row">
                    {group.tags.map((tag) => {
                      const isSelected = mobileDraftDetailsForm.day_tags.includes(tag.value);
                      return (
                        <button
                          type="button"
                          key={tag.value}
                          className={`day-tag-toggle day-tag-toggle-${group.category} ${isSelected ? "day-tag-toggle-active" : ""}`}
                          onClick={() => toggleMobileDraftTag(tag.value)}
                          aria-pressed={isSelected}
                        >
                          <DayTagIcon category={group.category} />{tag.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
            <label className="mobile-draft-note-field">
              Optional note
              <textarea
                value={mobileDraftDetailsForm.notes}
                onChange={(event) => setMobileDraftDetailsForm((current) => ({ ...current, notes: event.target.value }))}
                placeholder="How did the orders, traffic, or demand feel?"
                rows="4"
              />
            </label>
            <div className="mobile-sheet-actions">
              <button type="button" onClick={closeMobileDraftDetailsSheet} disabled={isSavingMobileDraftDetails}>Cancel</button>
              <button type="submit" className="primary-button" disabled={isSavingMobileDraftDetails}>{isSavingMobileDraftDetails ? "Saving…" : "Save details"}</button>
            </div>
          </form>
        </div>
      )}

      {mobileDraftEditTarget && activeMobileShift && (() => {
        const targetSession = activeMobileShift.sessions[mobileDraftEditTarget.sessionIndex];
        const targetItem = mobileDraftEditTarget.kind === "break"
          ? targetSession?.breaks?.[mobileDraftEditTarget.breakIndex]
          : targetSession;
        const hasEndTime = Boolean(
          mobileDraftEditTarget.kind === "break"
            ? targetItem?.end_time
            : targetItem?.stop_time
        );
        const title = mobileDraftEditTarget.kind === "break"
          ? `Edit Break ${mobileDraftEditTarget.breakIndex + 1}`
          : `Edit Session ${mobileDraftEditTarget.sessionIndex + 1}`;
        return (
          <div
            className={`mobile-sheet-overlay ${closingMobileSheet === "draft-edit" ? "mobile-sheet-closing" : ""}`}
            onClick={closeMobileDraftEditSheet}
          >
            <form className="mobile-quick-sheet mobile-draft-edit-sheet" onSubmit={saveMobileDraftEdit} onClick={(event) => event.stopPropagation()}>
              <div className="mobile-sheet-handle"></div>
              <div className="mobile-sheet-heading">
                <div><span>Live tracking</span><h2>{title}</h2></div>
                <button type="button" onClick={closeMobileDraftEditSheet} aria-label={`Close ${title}`}>×</button>
              </div>
              {mobileDraftEditError && <p className="mobile-sheet-error" role="alert">{mobileDraftEditError}</p>}
              <div className="mobile-draft-edit-segment">
                <strong>Start</strong>
                <div className="mobile-tracking-fields">
                  <label>
                    Time
                    <div className="mobile-time-entry">
                      <input type="text" inputMode="numeric" value={mobileDraftEditForm.start_time_value} onChange={(event) => setMobileDraftEditForm((current) => ({ ...current, start_time_value: event.target.value }))} placeholder="5:30" required />
                      <select value={mobileDraftEditForm.start_time_meridiem} onChange={(event) => setMobileDraftEditForm((current) => ({ ...current, start_time_meridiem: event.target.value }))}><option>AM</option><option>PM</option></select>
                    </div>
                  </label>
                  <label>
                    Odometer <span>optional</span>
                    <input type="number" inputMode="decimal" min="0" step="0.1" value={mobileDraftEditForm.start_odometer} onChange={(event) => setMobileDraftEditForm((current) => ({ ...current, start_odometer: event.target.value }))} placeholder="Starting mileage" />
                  </label>
                </div>
              </div>
              {hasEndTime && (
                <div className="mobile-draft-edit-segment">
                  <strong>{mobileDraftEditTarget.kind === "break" ? "End" : "Stop"}</strong>
                  <div className="mobile-tracking-fields">
                    <label>
                      Time
                      <div className="mobile-time-entry">
                        <input type="text" inputMode="numeric" value={mobileDraftEditForm.end_time_value} onChange={(event) => setMobileDraftEditForm((current) => ({ ...current, end_time_value: event.target.value }))} placeholder="5:30" required />
                        <select value={mobileDraftEditForm.end_time_meridiem} onChange={(event) => setMobileDraftEditForm((current) => ({ ...current, end_time_meridiem: event.target.value }))}><option>AM</option><option>PM</option></select>
                      </div>
                    </label>
                    <label>
                      Odometer <span>optional</span>
                      <input type="number" inputMode="decimal" min="0" step="0.1" value={mobileDraftEditForm.end_odometer} onChange={(event) => setMobileDraftEditForm((current) => ({ ...current, end_odometer: event.target.value }))} placeholder="Ending mileage" />
                    </label>
                  </div>
                </div>
              )}
              <div className="mobile-sheet-actions">
                <button type="button" onClick={closeMobileDraftEditSheet} disabled={isSavingMobileDraftEdit}>Cancel</button>
                <button type="submit" className="primary-button" disabled={isSavingMobileDraftEdit}>{isSavingMobileDraftEdit ? "Saving…" : "Save changes"}</button>
              </div>
            </form>
          </div>
        );
      })()}

      {isQuestManagerOpen && (
        <div className="quest-manager-overlay" onClick={closeQuestManager}>
          <div className="quest-manager-panel" onClick={(event) => event.stopPropagation()}>
            <div className="quest-manager-header">
              <div>
                <h3>Manage quests</h3>
                <p>Quest progress is calculated automatically from daily trip totals.</p>
              </div>
              <button
                type="button"
                className="week-browser-close"
                onClick={closeQuestManager}
                aria-label="Close quest manager"
              >
                ×
              </button>
            </div>

            <form className="quest-form" onSubmit={handleQuestSubmit}>
              <div className="quest-form-heading">
                <strong>{editingQuestId ? "Edit quest" : "Create quest"}</strong>
                {editingQuestId && (
                  <button
                    type="button"
                    onClick={() => openQuestManager()}
                    className="quest-form-reset"
                  >
                    Cancel edit
                  </button>
                )}
              </div>

              {questError && <div className="quest-form-error">{questError}</div>}

              <div className="quest-form-grid">
                <label>
                  Start date
                  <input
                    type="date"
                    name="start_date"
                    value={questForm.start_date}
                    onChange={handleQuestInputChange}
                    required
                  />
                </label>

                <label>
                  End date
                  <input
                    type="date"
                    name="end_date"
                    value={questForm.end_date}
                    onChange={handleQuestInputChange}
                    required
                  />
                </label>

                <label>
                  First-tier trips
                  <input
                    type="number"
                    name="first_tier_trips"
                    value={questForm.first_tier_trips}
                    onChange={handleQuestInputChange}
                    min="1"
                    step="1"
                    required
                  />
                </label>

                <label>
                  First-tier bonus
                  <input
                    type="number"
                    name="first_tier_bonus"
                    value={questForm.first_tier_bonus}
                    onChange={handleQuestInputChange}
                    min="0"
                    step="0.01"
                    required
                  />
                </label>

                <label>
                  Final-tier trips
                  <input
                    type="number"
                    name="final_tier_trips"
                    value={questForm.final_tier_trips}
                    onChange={handleQuestInputChange}
                    min="2"
                    step="1"
                    required
                  />
                </label>

                <label>
                  Final additional bonus
                  <input
                    type="number"
                    name="final_additional_bonus"
                    value={questForm.final_additional_bonus}
                    onChange={handleQuestInputChange}
                    min="0"
                    step="0.01"
                    required
                  />
                </label>
              </div>

              <button type="submit" className="primary-button" disabled={isSavingQuest}>
                {isSavingQuest
                  ? "Saving..."
                  : editingQuestId
                    ? "Update quest"
                    : "Create quest"}
              </button>
            </form>

            <div className="quest-manager-list-section">
              <h4>Saved quests</h4>
              {quests.length > 0 ? (
                <div className="quest-manager-list">
                  {quests.map((quest) => (
                    <article className="quest-manager-row" key={quest.id}>
                      <div>
                        <strong>{quest.title}</strong>
                        <span>
                          {formatShortDate(new Date(`${quest.start_date}T00:00:00`))}
                          {" - "}
                          {formatShortDate(new Date(`${quest.end_date}T00:00:00`))}
                          {" · "}
                          {Math.min(quest.progress_trips, quest.final_tier_trips)}
                          /{quest.final_tier_trips} trips
                        </span>
                      </div>
                      <span
                        className={`quest-status quest-status-${quest.status.toLowerCase()}`}
                      >
                        {quest.status}
                      </span>
                      <div className="quest-manager-actions">
                        <button
                          type="button"
                          className="edit-button"
                          onClick={() => openQuestManager(quest)}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          className="delete-button"
                          onClick={() => handleDeleteQuest(quest.id)}
                        >
                          Delete
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <p className="quest-panel-empty-copy">No quests saved yet.</p>
              )}
            </div>
          </div>
        </div>
      )}

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
