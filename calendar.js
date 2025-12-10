// calendar.js
// Dynamic CVNet-style calendar that loads multiple JSON data files
// and renders them with a simple category (tag) filter.
// Type/time filters are effectively disabled for now.

// ======================= CONFIG =======================

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
  // Jobs / funding / competitions can be added later once their files
  // are converted to plain JSON arrays and normalized.
];

// All normalized events live here.
let ALL_EVENTS = [];

// We keep type/time filter variables for compatibility, but they are
// effectively disabled in the matching functions.
let currentTypeFilter = "all";       // kept for future use
let currentTimeFilter = null;        // null = no time filtering
let currentTagFilter = null;         // e.g. "conferences", "education"

// ======================= DATE HELPERS =======================

function tryParseDate(dateStr) {
  if (!dateStr || typeof dateStr !== "string") return null;

  const cleaned = dateStr
    .replace(/\u2013|\u2014/g, "-")
    .trim();

  const rangeParts = cleaned.split("-");
  const firstPart = rangeParts[0].trim();

  if (/TBD|TBA/i.test(firstPart)) return null;

  const parsed = new Date(firstPart);
  if (isNaN(parsed.getTime())) return null;
  return parsed;
}

function computePrimaryDate(event) {
  if (event.deadline) {
    const d = tryParseDate(event.deadline);
    if (d) return d;
  }
  if (event.startDate) {
    const d = tryParseDate(event.startDate);
    if (d) return d;
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
  let deadline = null;
  let tags = [];
  let type = defaultType || "other";

  switch (sourceKey) {
    case "conferences":
      startDate = raw.Date || null;
      deadline = raw.SubmissionDeadlines || null;
      tags.push("conferences");
      break;

    case "education":
      startDate = raw.Dates || null;
      deadline = raw.ApplicationDeadline || null;
      tags.push("education");
      break;

    case "gradPrograms":
      deadline = raw.Deadline || raw.Deadlines || null;
      startDate = raw.StartDate || null;
      tags.push("grad-program");
      break;

    case "onlineSeminars":
      startDate = raw.Date || null;
      tags.push("online");
      break;

    case "specialIssues":
      deadline = raw.Deadline || null;
      tags.push("special-issue");
      break;

    default:
      break;
  }

  return {
    name,
    location,
    website,
    frequency,
    notes,
    startDate,
    deadline,
    tags,
    type,
    source: sourceKey
  };
}

// ======================= FILTERING =======================

// For now, we ignore type/time filters and only use tags.

function eventMatchesType(event) {
  // No type filtering at the moment.
  return true;
}

function eventMatchesTime(event) {
  // No time-window filtering at the moment.
  return true;
}

// Tag filter: if no category is chosen, we intentionally show nothing.
function eventMatchesTag(event) {
  if (!currentTagFilter) return false;
  if (!Array.isArray(event.tags)) return false;
  return event.tags.includes(currentTagFilter);
}

// Combine all filters.
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

  filtered.sort((a, b) => {
    const da = computePrimaryDate(a) || new Date(0);
    const db = computePrimaryDate(b) || new Date(0);
    return da - db;
  });

  renderCalendar(filtered);
}

// ======================= RENDERING =======================

function createEventCard(event) {
  const card = document.createElement("article");

  const titleEl = document.createElement("h3");
  titleEl.textContent = event.name || "Untitled";
  card.appendChild(titleEl);

  if (event.startDate) {
    const p = document.createElement("p");
    p.textContent = "Dates: " + event.startDate;
    card.appendChild(p);
  }

  if (event.deadline) {
    const p = document.createElement("p");
    p.textContent = "Deadline: " + event.deadline;
    card.appendChild(p);
  }

  if (event.location) {
    const p = document.createElement("p");
    p.textContent = "Location: " + event.location;
    card.appendChild(p);
  }

  if (event.frequency) {
    const p = document.createElement("p");
    p.textContent = "Type: " + event.frequency;
    card.appendChild(p);
  }

  if (event.website) {
    const p = document.createElement("p");
    const a = document.createElement("a");
    a.href = event.website;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.textContent = "Website";
    p.appendChild(a);
    card.appendChild(p);
  }

  if (event.notes) {
    const p = document.createElement("p");
    p.textContent = event.notes;
    card.appendChild(p);
  }

  return card;
}

function renderCalendar(events) {
  const listEl = document.getElementById("calendar-list");
  const loadingEl = document.getElementById("calendar-loading-message");

  if (!listEl) {
    console.error("Calendar list element #calendar-list not found.");
    return;
  }

  if (loadingEl) {
    loadingEl.remove();
  }

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
    listEl.appendChild(card);
  });
}

// ======================= BUTTON WIRING =======================

function setupFilterButtons() {
  const tagButtons = document.querySelectorAll("[data-filter-tag]");

  tagButtons.forEach(btn => {
    btn.addEventListener("click", () => {
      const raw = btn.dataset.filterTag;
      const tag = raw === "" ? null : raw;

      // CLEAR: always go back to "no category chosen".
      if (tag === null) {
        currentTagFilter = null;
        tagButtons.forEach(b => b.classList.remove("is-active"));
        applyFiltersAndRender();
        return;
      }

      // Normal category: toggle on/off.
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
}

// ======================= DATA LOADING =======================

async function loadAllEvents() {
  const allEvents = [];
  const listEl = document.getElementById("calendar-list");
  if (listEl) {
    listEl.innerHTML =
      '<p id="calendar-loading-message" class="cv-calendar-loading">Loading items…</p>';
  }

  for (const src of SOURCE_DEFINITIONS) {
    try {
      const response = await fetch(src.file);
      if (!response.ok) {
        console.error("Failed to load " + src.file + ":", response.status);
        continue;
      }
      const rawArray = await response.json();
      if (!Array.isArray(rawArray)) continue;

      rawArray.forEach(rawItem => {
        const event = normalizeItem(rawItem, src.key, src.defaultType);
        allEvents.push(event);
      });
    } catch (err) {
      console.error("Error loading " + src.file + ":", err);
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
