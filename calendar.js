// calendar.js
// Dynamic CVNet-style calendar that loads multiple JSON data files
// and renders them with filters for type/time/tags.

// ======================= CONFIG =======================

// List of JSON sources and how they map into the unified event schema.
// Adjust file paths if your JSON files live in a different folder.
const SOURCE_DEFINITIONS = [
  {
    key: "conferences",
    file: "./conferences.json",
    defaultType: "conference"
  },
  {
    key: "education",
    file: "./education.json",
    defaultType: "course"
  },
  {
    key: "gradPrograms",
    file: "./grad programs.json",
    defaultType: "course"
  },
  {
    key: "onlineSeminars",
    file: "./Online Seminars Clubs.json",
    defaultType: "webinar"
  },
  {
    key: "specialIssues",
    file: "./special feature issue.json",
    defaultType: "deadline-only"
  }
  // If/when you convert Jobs, funding, competitions into pure JSON arrays
  // (without the leading "const ... =" JavaScript syntax), you can add:
  // { key: "jobs", file: "./Jobs.json", defaultType: "deadline-only" },
  // { key: "funding", file: "./funding.json", defaultType: "deadline-only" },
  // { key: "competitions", file: "./competitions.json", defaultType: "deadline-only" }
];

// ======================= STATE =======================

let ALL_EVENTS = [];

let currentTypeFilter = "all";        // 'all', 'conference', 'webinar', 'course', 'workshop', 'deadline-only'
let currentTimeFilter = "upcoming";   // 'upcoming', 'this-month', 'next-3-months', 'past'
let currentTagFilter = null;          // e.g. 'color', 'online'

// ======================= DATE HELPERS =======================

function tryParseDate(dateStr) {
  if (!dateStr || typeof dateStr !== "string") return null;

  // Trim and normalize unicode dashes
  const cleaned = dateStr
    .replace(/\u2013|\u2014/g, "-") // en/em dash to hyphen
    .trim();

  // If it's a range like "May 16–21, 2026" or "May 16-21, 2026", grab the first part.
  const rangeParts = cleaned.split("-");
  const firstPart = rangeParts[0].trim();

  const d = new Date(firstPart);
  if (Number.isNaN(d.getTime())) {
    return null;
  }
  d.setHours(0, 0, 0, 0);
  return d;
}

function formatDateForDisplay(dateStr) {
  const d = tryParseDate(dateStr);
  if (!d) return dateStr || "";
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric"
  });
}

function computePrimaryDate(event) {
  // Use deadline if present, else startDate if present.
  if (event.deadline) {
    return tryParseDate(event.deadline);
  }
  if (event.startDate) {
    return tryParseDate(event.startDate);
  }
  return null;
}

// ======================= NORMALIZATION =======================

function normalizeItem(raw, sourceKey, defaultType) {
  let name = raw.Name || raw.title || raw.Title || "Untitled";
  let location =
    raw.Location ||
    raw.location ||
    raw.Host ||
    raw.Institution ||
    "";
  let website =
    raw.Website ||
    raw.Link ||
    raw.ApplicationLink ||
    raw.url ||
    "";
  let frequency = raw.Frequency || raw.frequency || raw.Type || null;
  let notes = raw.Notes || raw.Overview || raw.Scope || raw.ProjectSummary || "";

  let startDate = null;
  let endDate = null;
  let deadline = null;
  const tags = [];

  switch (sourceKey) {
    case "conferences":
      // Date: event date(s); SubmissionDeadlines: could be text or date
      startDate = raw.Date || null;
      // Store submission deadlines as deadline text
      deadline = raw.SubmissionDeadlines || null;
      tags.push("conferences");
      break;

    case "education":
      // Dates: when the school/program runs; ApplicationDeadline: date
      startDate = raw.Dates || null;
      deadline = raw.ApplicationDeadline || null;
      tags.push("education");
      break;

    case "gradPrograms":
      // Deadline or Deadlines; StartDate if present
      deadline = raw.Deadline || raw.Deadlines || null;
      startDate = raw.StartDate || null;
      tags.push("grad-program");
      break;

    case "onlineSeminars":
      // Date/Time for events; treat Date as startDate
      startDate = raw.Date || null;
      // Many online series are ongoing; no deadline
      tags.push("online");
      tags.push("seminar");
      break;

    case "specialIssues":
      // Deadline is main date
      deadline = raw.Deadline || null;
      tags.push("special-issue");
      break;

    default:
      break;
  }

  // Add generic tags if available
  if (Array.isArray(raw.tags)) {
    raw.tags.forEach(t => tags.push(t));
  }

  const type = defaultType || "other";

  // Generate a simple id if none present
  const id =
    raw.id ||
    raw.ID ||
    `${sourceKey}-${name.toLowerCase().replace(/\s+/g, "-").slice(0, 40)}`;

  return {
    id,
    source: sourceKey,
    type,
    name,
    startDate,
    endDate,
    deadline,
    location,
    frequency,
    website,
    notes,
    tags
  };
}

// ======================= FILTER LOGIC =======================

function eventMatchesType(event) {
  if (!currentTypeFilter || currentTypeFilter === "all") return true;

  // 'workshop' isn't a primary type in our sources yet; treat some courses or conferences as workshops if needed.
  if (currentTypeFilter === "workshop") {
    return event.type === "workshop";
  }

  return event.type === currentTypeFilter;
}

function eventMatchesTime(event) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const primary = computePrimaryDate(event);
  if (!primary) {
    // If we can't parse a date, let it through for all filters except 'past'
    return currentTimeFilter !== "past";
  }

  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0);
  const threeMonthsLater = new Date(
    today.getFullYear(),
    today.getMonth() + 3,
    today.getDate()
  );

  switch (currentTimeFilter) {
    case "this-month":
      return primary >= monthStart && primary <= monthEnd;
    case "next-3-months":
      return primary >= today && primary <= threeMonthsLater;
    case "past":
      return primary < today;
    case "upcoming":
    default:
      return primary >= today;
  }
}

function eventMatchesTag(event) {
  // If no category is chosen, don't show anything.
  if (!currentTagFilter) return false;
  if (!Array.isArray(event.tags)) return false;
  return event.tags.includes(currentTagFilter);
}

// ======================= RENDERING =======================

function createEventCard(event) {
  const card = document.createElement("article");
  card.className = "cv-calendar-card";
  card.dataset.type = event.type || "";
  card.dataset.source = event.source || "";
  if (event.startDate) {
    card.dataset.startDate = event.startDate;
  }
  if (event.deadline) {
    card.dataset.deadline = event.deadline;
  }
  if (Array.isArray(event.tags) && event.tags.length > 0) {
    card.dataset.tags = event.tags.join(",");
  }

  const dateLabel =
    event.type === "deadline-only" || event.source === "specialIssues"
      ? "Deadline"
      : "Date";

  const dateValue =
    event.deadline ||
    event.startDate ||
    null;

  const dateText = dateValue ? formatDateForDisplay(dateValue) : "";

  let metaBits = [];
  if (dateText) {
    metaBits.push(
      `<span class="cv-calendar-card-date"><strong>${dateLabel}:</strong> ${dateText}</span>`
    );
  }
  if (event.location) {
    metaBits.push(
      `<span class="cv-calendar-card-location">${event.location}</span>`
    );
  }
  if (event.frequency) {
    metaBits.push(
      `<span class="cv-calendar-card-frequency">${event.frequency}</span>`
    );
  }

  const metaHtml = metaBits.length > 0
    ? `<p class="cv-calendar-card-meta">${metaBits.join(" &middot; ")}</p>`
    : "";

  const tagsHtml =
    Array.isArray(event.tags) && event.tags.length > 0
      ? `<ul class="cv-calendar-tags">
          ${event.tags.map(tag => `<li>${tag}</li>`).join("")}
        </ul>`
      : "";

  card.innerHTML = `
    <header class="cv-calendar-card-header">
      <h2 class="cv-calendar-card-title">
        ${event.name}
      </h2>
      ${
        event.website
          ? `<p class="cv-calendar-card-link">
               <a href="${event.website}" target="_blank" rel="noopener noreferrer">
                 More info
               </a>
             </p>`
          : ""
      }
    </header>
    <div class="cv-calendar-card-body">
      ${metaHtml}
      ${
        event.notes
          ? `<p class="cv-calendar-card-notes">${event.notes}</p>`
          : ""
      }
      ${tagsHtml}
    </div>
  `;

  return card;
}

function renderCalendar(events) {
  const listEl = document.getElementById("calendar-list");
  const loadingEl = document.getElementById("calendar-loading-message");

  if (!listEl) {
    console.error("Calendar list element #calendar-list not found.");
    return;
  }

  // Remove loading message if it exists
  if (loadingEl) {
    loadingEl.remove();
  }

  // Clear previous content
  listEl.innerHTML = "";

if (!Array.isArray(events) || events.length === 0) {
  if (!currentTagFilter) {
    listEl.innerHTML = `
      <p class="cv-calendar-empty">
        No category chosen.
      </p>
    `;
  } else {
    listEl.innerHTML = `
      <p class="cv-calendar-empty">
        No items match the current filters.
      </p>
    `;
  }
  return;
}


  events.forEach(event => {
    const card = createEventCard(event);
    listEl.appendChild(eventCardOrFallback(card, event));
  });
}

// Helper in case you want to tweak per-source styling later
function eventCardOrFallback(card, event) {
  // Right now we just return the card as-is.
  // Placeholder if you ever want special styling per source/type.
  return card;
}

// ======================= FILTER APPLICATION =======================

function applyFiltersAndRender() {
  if (!Array.isArray(ALL_EVENTS) || ALL_EVENTS.length === 0) {
    renderCalendar([]);
    return;
  }

  let filtered = ALL_EVENTS.filter(ev =>
    eventMatchesType(ev) &&
    eventMatchesTime(ev) &&
    eventMatchesTag(ev)
  );

  // Sort by primary date ascending (deadline or startDate)
  filtered.sort((a, b) => {
    const da = computePrimaryDate(a) || new Date(0);
    const db = computePrimaryDate(b) || new Date(0);
    return da - db;
  });

  renderCalendar(filtered);
}

// ======================= BUTTON WIRING =======================

function setupFilterButtons() {
  // Type buttons
  const typeButtons = document.querySelectorAll("[data-filter-type]");
  typeButtons.forEach(btn => {
    btn.addEventListener("click", () => {
      currentTypeFilter = btn.dataset.filterType || "all";
      typeButtons.forEach(b => b.classList.remove("is-active"));
      btn.classList.add("is-active");
      applyFiltersAndRender();
    });
  });

  // Time buttons
  const timeButtons = document.querySelectorAll("[data-filter-time]");
  timeButtons.forEach(btn => {
    btn.addEventListener("click", () => {
      currentTimeFilter = btn.dataset.filterTime || "upcoming";
      timeButtons.forEach(b => b.classList.remove("is-active"));
      btn.classList.add("is-active");
      applyFiltersAndRender();
    });
  });

  // Tag buttons
const tagButtons = document.querySelectorAll("[data-filter-tag]");
tagButtons.forEach(btn => {
  btn.addEventListener("click", () => {
    const raw = btn.dataset.filterTag;
    const tag = raw === "" ? null : raw;

    // CLEAR button (data-filter-tag="") → always reset to "no category chosen"
    if (tag === null) {
      currentTagFilter = null;
      tagButtons.forEach(b => b.classList.remove("is-active"));
      applyFiltersAndRender();
      return;
    }

    // Normal category buttons: toggle on/off
    if (currentTagFilter === tag) {
      currentTagFilter = null;
      tagButtons.forEach(b => b.classList.remove("is-active"));
    } else {
      currentTagFilter = tag;
      tagButtons.forEach(b => b.classList.remove("is-active"));
      btn.classList.add("is-active");
    }

    applyFiltersAndRender();
  });
});


// ======================= DATA LOADING =======================

async function loadAllEvents() {
  const allEvents = [];
  const listEl = document.getElementById("calendar-list");
  if (listEl) {
    listEl.innerHTML = '<p id="calendar-loading-message" class="cv-calendar-loading">Loading items…</p>';
  }

  for (const src of SOURCE_DEFINITIONS) {
    try {
      const response = await fetch(src.file);
      if (!response.ok) {
        console.error(`Failed to load ${src.file}:`, response.status);
        continue;
      }
      const rawArray = await response.json();
      if (!Array.isArray(rawArray)) continue;

      rawArray.forEach(rawItem => {
        const event = normalizeItem(rawItem, src.key, src.defaultType);
        allEvents.push(event);
      });
    } catch (err) {
      console.error(`Error loading ${src.file}:`, err);
    }
  }

  ALL_EVENTS = allEvents;
  applyFiltersAndRender();
}

// ======================= INIT =======================

document.addEventListener("DOMContentLoaded", () => {
  setupFilterButtons();
  loadAllEvents();
});
