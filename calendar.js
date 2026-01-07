/* calendar.js
   CVNet Community Calendar — clean, minimal, working
   (with Conferences subfilters + full-page DOS-style search)

   Required in HTML:
   - #category-menu (buttons with data-filter-tag; CLEAR has data-filter-tag="")
   - #calendar-status
   - #calendar-subfilters
   - #calendar-list
   - #calendar-search
*/

(() => {
  const DATA_BASE = "./";

  // -------------------------
  // Categories (JSON files)
  // -------------------------
  const CATEGORIES = [
    { tag: "conferences", label: "Conferences", file: "conferences.json" },
    { tag: "online", label: "Online Seminars/Clubs", file: "online_seminars_clubs.json" },
    { tag: "special-issue", label: "Special Features/Issues", file: "special_features_issues.json" },
    { tag: "education", label: "Education", file: "education.json" },
    { tag: "grad-program", label: "Grad Programs", file: "grad_programs.json" },
    { tag: "jobs", label: "Jobs", file: "jobs.json" },
    { tag: "funding", label: "Funding", file: "funding.json" },
    { tag: "competitions", label: "Competitions", file: "competitions.json" },
  ];

  // -------------------------
  // Popular Conferences
  // -------------------------
  const POPULAR_CONFERENCES = [
    { label: "APA", id: "american-psychological-association-apa-2026" },
    { label: "APCV", id: "epc-apcv-2026" },
    { label: "APS", id: "association-for-psychological-science-aps-2026" },
    { label: "ARVO", id: "association-for-research-in-vision-and-ophthalmology-arvo-2026" },
    { label: "AVA", id: "applied-vision-association-ava-2026" },
    { label: "BAVRD", id: "bay-area-vision-research-day-bavrd-2026" },
    { label: "ECVP", id: "european-conference-on-visual-perception-ecvp-2026" },
    { label: "Gruppo del Colore", id: "gruppo-del-colore-annual-meeting-2026" },
    { label: "HVEI", id: "human-vision-and-electronic-imaging-hvei-2026" },
    { label: "ICVS", id: "international-colour-vision-society-icvs-2026" },
    { label: "MODVIS", id: "models-in-vision-science-modvis" },
    { label: "Optica Fall Vision", id: "optica-fall-vision-meeting-2026" },
    { label: "Psychonomics", id: "psychonomic-society-annual-meeting-2026" },
    { label: "SfN", id: "society-for-neuroscience-sfn-2026" },
    { label: "VSAC", id: "visual-science-art-conference-vsac-2026" },
    { label: "VSS", id: "vision-sciences-society-vss-2026" },
  ];

  const POPULAR_ID_SET = new Set(POPULAR_CONFERENCES.map(p => p.id));

  // -------------------------
  // DOM
  // -------------------------
  const els = {
    menu: document.getElementById("category-menu"),
    list: document.getElementById("calendar-list"),
    status: document.getElementById("calendar-status"),
    subfilters: document.getElementById("calendar-subfilters"),
    search: document.getElementById("calendar-search"),
  };

  if (!els.menu || !els.list || !els.subfilters) {
    console.error("calendar.js: Missing required HTML elements.");
    return;
  }

  // -------------------------
  // State
  // -------------------------
  const state = {
    activeTag: null,
    confMode: "all",
    cache: new Map(),
    searchQuery: "",
  };

  // -------------------------
  // Init
  // -------------------------
  els.list.innerHTML = `<p>Select a category above to view items.</p>`;
  els.subfilters.innerHTML = "";
  setStatus("");

  els.menu.addEventListener("click", onMenuClick);
  els.subfilters.addEventListener("click", onSubfilterClick);

  if (els.search) {
    els.search.addEventListener("input", () => {
      state.searchQuery = els.search.value.trim().toLowerCase();
      render();
    });
  }

  // -------------------------
  // Initial load from URL
  // -------------------------
  (async () => {
    const section = new URLSearchParams(window.location.search).get("section");
    if (!section) return;

    const cat = getCategory(section);
    if (!cat) return;

    state.activeTag = section;
    highlightMenu(section);

    setStatus(`Loading all items in ${cat.label}…`);
    els.list.innerHTML = `<p>Loading…</p>`;

    await ensureLoaded(section);
    render();
  })();

  // -------------------------
  // Handlers
  // -------------------------
  async function onMenuClick(e) {
    const btn = e.target.closest("button[data-filter-tag]");
    if (!btn) return;

    const tag = (btn.dataset.filterTag ?? "").trim();

    if (tag === "") {
      history.pushState({}, "", window.location.pathname);
      reset();
      return;
    }

    state.activeTag = tag;
    state.confMode = "all";

    const url = new URL(window.location.href);
    url.searchParams.set("section", tag);
    history.pushState({}, "", url);

    highlightMenu(tag);

    const cat = getCategory(tag);
    if (!cat) return;

    setStatus(`Loading all items in ${cat.label}…`);
    els.list.innerHTML = `<p>Loading…</p>`;

    await ensureLoaded(tag);
    render();
  }

  function onSubfilterClick(e) {
    const btn = e.target.closest("button[data-conf-filter]");
    if (!btn || state.activeTag !== "conferences") return;

    const mode = btn.dataset.confFilter;
    if (mode !== "all" && mode !== "popular") return;

    state.confMode = mode;
    render();
  }

  // -------------------------
  // Data loading
  // -------------------------
  async function ensureLoaded(tag) {
    if (state.cache.has(tag)) return;

    const cat = getCategory(tag);
    const res = await fetch(new URL(DATA_BASE + cat.file, location.href), { cache: "no-store" });
    if (!res.ok) {
      state.cache.set(tag, []);
      return;
    }

    let parsed;
    try {
      parsed = JSON.parse(await res.text());
    } catch {
      state.cache.set(tag, []);
      return;
    }

    state.cache.set(tag, parsed.map(o => normalizeItem(o, cat)));
  }

  function normalizeItem(raw, cat) {
    return {
      _id: String(raw?.id ?? ""),
      _category: cat.label,
      title: coalesce(raw.title, raw.name, raw.program, raw.event, raw.id),
      website: coalesce(raw.website, raw.url, raw.link),
      location: coalesce(raw.location, raw.city, raw.where),
      dates: coalesce(raw.dates, raw.date, raw.startDate, raw.start_date),
      frequency: coalesce(raw.frequency),
      submissionDeadlines: coalesce(raw.submissionDeadlines, raw.deadline),
      description: coalesce(raw.description, raw.notes),
    };
  }

  // -------------------------
  // Rendering
  // -------------------------
  function render() {
    if (!state.activeTag) return;

    let items = [];

    if (state.searchQuery) {
      for (const arr of state.cache.values()) items.push(...arr);
    } else {
      items = state.cache.get(state.activeTag) || [];
    }

    if (state.searchQuery) {
      const q = state.searchQuery;
      items = items.filter(i =>
        Object.values(i).join(" ").toLowerCase().includes(q)
      );
      setStatus(`Search results (${items.length})`);
      els.subfilters.innerHTML = "";
    } else {
      const cat = getCategory(state.activeTag);
      if (state.activeTag === "conferences") {
        renderConferenceControls();
        if (state.confMode === "popular") {
          items = items.filter(i => POPULAR_ID_SET.has(i._id));
        }
      } else {
        els.subfilters.innerHTML = "";
      }
      setStatus(`Loaded ${items.length} items in ${cat.label}.`);
    }

    els.list.innerHTML = items.length
      ? items.map(renderCard).join("")
      : `<p>No items found.</p>`;
  }

  function renderConferenceControls() {
    els.subfilters.innerHTML = `
      <div style="margin:8px 0;">
        <button data-conf-filter="all">All Conferences</button>
        <button data-conf-filter="popular">Popular Conferences</button>
      </div>
    `;
  }

  function renderCard(item) {
    return `
      <article class="calendar-card" id="${escapeAttr(item._id)}">
        <h3>${escapeHtml(item.title)}</h3>
        ${item.dates ? `<p><strong>Dates:</strong> ${escapeHtml(item.dates)}</p>` : ""}
        ${item.location ? `<p><strong>Location:</strong> ${escapeHtml(item.location)}</p>` : ""}
        ${item.website ? `<p><a href="${escapeAttr(item.website)}" target="_blank">Website</a></p>` : ""}
        ${item.description ? `<p>${escapeHtml(item.description)}</p>` : ""}
      </article>
    `;
  }

  // -------------------------
  // Helpers
  // -------------------------
  function getCategory(tag) {
    return CATEGORIES.find(c => c.tag === tag);
  }

  function reset() {
    state.activeTag = null;
    state.searchQuery = "";
    els.subfilters.innerHTML = "";
    els.list.innerHTML = `<p>Select a category above to view items.</p>`;
    setStatus("Cleared selection.");
  }

  function setStatus(msg) {
    if (els.status) els.status.textContent = msg;
  }

  function highlightMenu(tag) {
    els.menu.querySelectorAll("button").forEach(b =>
      b.classList.toggle("active", b.dataset.filterTag === tag)
    );
  }

  function coalesce(...v) {
    return v.find(x => x && String(x).trim()) || "";
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c =>
      ({ "&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;" }[c])
    );
  }

  function escapeAttr(s) {
    return String(s).replaceAll('"', "%22");
  }
})();
