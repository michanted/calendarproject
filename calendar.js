// calendar.js
// Minimal CVNet calendar: loads multiple JSON sources, normalizes them,
// and renders cards. Only the category menu (data-filter-tag buttons) is used
// as a filter; no type/time filters are currently active.

// ======================= GLOBAL STATE =======================

let ALL_EVENTS = [];
let currentTagFilter = null; // e.g. "conferences", "education", "online", "special-issue", etc.

// JSON sources you currently have wired
const SOURCE_DEFINITIONS = [
  {
    key: "conferences",
    file: "./conferences.json"
  },
  {
    key: "education",
    file: "./education.json"
  },
  {
    key: "grad-programs",
    file: "./grad programs.json"
  },
  {
    key: "online",
    file: "./Online Seminars Clubs.json"
  },
  {
    key: "special-issues",
    file: "./special feature issue.json"
  }
  // Jobs / funding / competitions can be added later once
  // their files are pure JSON (not JS) and normalized.
];

// ======================= NORMALIZATION =======================

function normalizeItem(raw, sourceKey) {
  const event = {
    sourceKey,
    title: raw.Name || raw.name || "Untitled",
    type: "other",
    tags: [],
    location: raw.Location || "",
    dateText: "",
    deadline: "",
    website: raw.Website || raw.Link || "",
    notes: raw.Notes || ""
  };

  switch (sourceKey) {
    case "conferences":
      event.type = "conference";
      event.tags.push("conferences");
      event.dateText = raw.Date || "";
      event.deadline = raw.SubmissionDeadlines || "";
      break;

    case "education":
      event.type = "course";
      event.tags.push("education");
      event.dateText = raw.Dates || "";
      event.deadline = raw.ApplicationDeadline || "";
      break;

    case "grad-programs":
      event.type = "grad-program";
      event.tags.push("grad-program");
      // Use start date as date text if available
      if (raw.StartDate) {
        event.dateText = "Start date: " + raw.StartDate;
      }
      event.deadline = raw.Deadline || raw.Deadlines || "";
      break;

    case "online":
      event.type = "webinar";
      event.tags.push("online");
      event.dateText = raw.Schedule || raw.Date || "";
      if (!event.location) {
        event.location = "Online";
      }
      break;

    case "special-issues":
      event.type = "deadline-only";
      event.tags.push("special-issue");
      event.dateText = raw.Deadline || "";
      event.deadline = raw.Deadline || "";
      break;

    default:
      // Unknown source; leave defaults
      break;
  }

  return event;
}

// Try to extract a real Date object from text like:
// "December 29, 2025 – January 8, 2026" or "December 12, 2025" or "TBD".
function parseDateFromText(text) {
  if (!text || typeof text !== "string") return null;

  // Take only the first segment before an en dash or hyphen.
  let candidate = text.split("–")[0].split("-")[0].trim();

  // Skip obvious non-dates like "TBD".
  if (/TBD|TBA/i.test(candidate)) return null;

  const parsed = new Date(candidate);
  if (isNaN(parsed.getTime())) return null;
  return parsed;
}

function computePrimaryDate(event) {
  // Prefer explicit deadline if present.
  if (event.deadline) {
    const d = parseDateFromText(event.deadline);
    if (d) return d;
  }
  // Then try the date text.
  if (event.dateText) {
    const d = parseDateFromText(event.dateText);
    if (d) return d;
  }
  return null;
}

// ======================= FILTERING =======================

// Tag filter: if no category chosen, we intentionally show nothing.
function eventMatchesTag(event) {
  // If no category is chosen, don't show anything.
  if (!currentTagFilter) return false;
  if (!Array.isArray(event.tags)) return false;
  return event.tags.includes(currentTagFilter);
}

// Apply filters and re-render
function applyFiltersAndRender() {
  if (!Array.isArray(ALL_EVENTS) || ALL_EVENTS.length === 0) {
    renderCalendar([]);
    return;
  }

  // Only tag filtering for now.
  let filtered = ALL_EVENTS.filter(ev => eventMatchesTag(ev));

  // Sort by primary date ascending (deadline or start date).
  filtered.sort((a, b) => {
    const da = computePrimaryDate(a) || new Date(0);
    const db = computePrimaryDate(b) || new Date(0);
    return da - db;
  });

  renderCalendar(filtered);
}

// ======================= RENDERING =======================

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
    listEl.appendChild(card);
  });
}

function createEventCard(event) {
  const article = document.createElement("article");

  // Title
  const titleEl = document.createElement("h3");
  titleEl.textContent = event.title || "Untitled";
  article.appendChild(titleEl);

  // Date text
  if (event.dateText) {
    const p = document.createElement("p");
    p.textContent = "Dates: " + event.dateText;
    article.appendChild(p);
  }

  // Deadline
  if (event.deadline) {
    const p = document.createElement("p");
    p.textContent = "Deadline: " + event.deadline;
    article.appendChild(p);
  }

  // Location
  if (event.location) {
    const p = document.createElement("p");
    p.textContent = "Location: " + event.location;
    article.appendChild(p);
  }

  // Website
  if (event.website) {
    const p = document.createElement("p");
    const a = document.createElement("a");
    a.href = event.website;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.textContent = "Website";
    p.appendChild(a);
    article.appendChild(p);
  }

  // Notes (short)
  if (event.notes) {
    const p = document.createElement("p");
    p.textContent = event.notes;
    article.appendChild(p);
  }

  return article;
}

// ======================= BUTTON WIRING =======================

// Tag buttons (category menu)
function setupFilterButtons() {
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
}

// ======================= DATA LOADING =======================

async function loadAllEvents() {
  const allEvents = [];
  const listEl = document.getElementById("calendar-list");
  if (listEl) {
    listEl.innerHTML =
      '<p id="calendar-loading-message" class="cv-calendar-loading">Loading items…</p>';
  }

  for (const def of SOURCE_DEFINITIONS) {
    try {
      const res = await fetch(def.file);
      if (!res.ok) {
        console.error("Failed to fetch", def.file, res.status);
        continue;
      }
      const json = await res.json();
      if (!Array.isArray(json)) {
        console.error("JSON from", def.file, "is not an array");
        continue;
      }
      json.forEach(raw => {
        const ev = normalizeItem(raw, def.key);
        allEvents.push(ev);
      });
    } catch (err) {
      console.error("Error loading", def.file, err);
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
