/* calendar.js
   CVNet Community Calendar — clean, minimal, working
   (Conferences subfilters + full-page DOS-style search)

   Required in HTML:
   - #category-menu (buttons with data-filter-tag; CLEAR has data-filter-tag="")
   - #calendar-status
   - #calendar-subfilters
   - #calendar-list
   - #calendar-search
*/

(() => {
  const DATA_BASE = "./";

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

  const state = {
    activeTag: null,
    confMode: "all", // "all" | "popular"
    cache: new Map(),
    searchQuery: "",
    allLoaded: false,
  };

  // Init UI
  els.list.innerHTML = `<p>Select a category above to view items, or search.</p>`;
  els.subfilters.innerHTML = "";
  setStatus("");

  els.menu.addEventListener("click", onMenuClick);
  els.subfilters.addEventListener("click", onSubfilterClick);

  if (els.search) {
    els.search.addEventListener("input", onSearchInput);
  }

  // -------------------------
  // Handlers
  // -------------------------
  async function onMenuClick(e) {
    const btn = e.target.closest("button[data-filter-tag]");
    if (!btn) return;

    clearSearch();

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

    setStatus(`Loading…`);
    els.list.innerHTML = `<p>Loading…</p>`;

    await ensureLoaded(tag);
    render();
  }

  function onSubfilterClick(e) {
    const btn = e.target.closest("button[data-conf-filter]");
    if (!btn) return;

    if (state.activeTag !== "conferences") return;
    if (state.searchQuery) return;

    const mode = btn.dataset.confFilter;
    if (mode !== "all" && mode !== "popular") return;

    state.confMode = mode;
    render();
  }

  async function onSearchInput() {
    state.searchQuery = (els.search.value || "").trim().toLowerCase();
    if (!state.searchQuery) {
      render();
      return;
    }

    setStatus("Loading all categories for search…");
    els.subfilters.innerHTML = "";
    await ensureAllLoaded();
    render();
  }

  // -------------------------
  // Data
  // -------------------------
  async function ensureLoaded(tag) {
    if (state.cache.has(tag)) return;

    const cat = getCategory(tag);
    const res = await fetch(new URL(DATA_BASE + cat.file, location), { cache: "no-store" });
    const data = await res.json();
    state.cache.set(tag, data.map(o => normalizeItem(o, cat)));
  }

  async function ensureAllLoaded() {
    if (state.allLoaded) return;
    await Promise.all(CATEGORIES.map(c => ensureLoaded(c.tag)));
    state.allLoaded = true;
  }

  function normalizeItem(raw, cat) {
    return {
      _id: String(raw?.id ?? ""),
      _category: cat.label,
      title: raw.title || raw.name || raw.id || "(Untitled)",
      description: raw.description || "",
      website: raw.website || raw.url || "",
      location: raw.location || "",
      dates: raw.dates || "",
      frequency: raw.frequency || "",
      submissionDeadlines: raw.submissionDeadlines || "",
    };
  }

  // -------------------------
  // Rendering
  // -------------------------
  function render() {
    if (!state.activeTag && !state.searchQuery) return;

    let items = [];

    if (state.searchQuery) {
      for (const arr of state.cache.values()) items.push(...arr);
      const q = state.searchQuery;
      items = items.filter(i =>
        Object.values(i).join(" ").toLowerCase().includes(q)
      );
      els.subfilters.innerHTML = "";
      setStatus(`Search results (${items.length})`);
    } else {
      const cat = getCategory(state.activeTag);
      items = state.cache.get(state.activeTag) || [];

      if (state.activeTag === "conferences") {
        renderConferenceControls();

        if (state.confMode === "popular") {
          items = items.filter(i => POPULAR_ID_SET.has(i._id));
          renderPopularConferenceButtons();
          setStatus(`Loaded ${items.length} items in Popular Conferences.`);
        } else {
          hidePopularConferenceButtons();
          setStatus(`Loaded ${items.length} items in ${cat.label}.`);
        }
      } else {
        hidePopularConferenceButtons();
        els.subfilters.innerHTML = "";
        setStatus(`Loaded ${items.length} items in ${cat.label}.`);
      }
    }

    els.list.innerHTML = items.length
      ? items.map(renderCard).join("")
      : `<p>No items found.</p>`;
  }

  function renderConferenceControls() {
    els.subfilters.innerHTML = `
      <div class="category-menu" style="margin:8px 0;">
        <button data-conf-filter="all" class="${state.confMode === "all" ? "active" : ""}">
          All Conferences
        </button>
        <button data-conf-filter="popular" class="${state.confMode === "popular" ? "active" : ""}">
          Popular Conferences
        </button>
      </div>
    `;
  }

  function renderPopularConferenceButtons() {
    const c = document.getElementById("popular-conference-filters");
    if (!c) return;
    c.innerHTML = "";

    POPULAR_CONFERENCES
      .map(p => p.label)
      .sort()
      .forEach(label => {
        const b = document.createElement("button");
        b.textContent = label;
        b.className = "calendar-subfilter";
        b.type = "button";
        c.appendChild(b);
      });

    c.style.display = "block";
  }

  function hidePopularConferenceButtons() {
    const c = document.getElementById("popular-conference-filters");
    if (!c) return;
    c.style.display = "none";
    c.innerHTML = "";
  }

  function renderCard(item) {
    return `
      <article class="calendar-card">
        <h3>${item.title}</h3>
        ${item.description ? `<p>${item.description}</p>` : ""}
        ${item.website ? `<p><a href="${item.website}" target="_blank">Website</a></p>` : ""}
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
    state.confMode = "all";
    hidePopularConferenceButtons();
    els.subfilters.innerHTML = "";
    els.list.innerHTML = `<p>Select a category above to view items, or search.</p>`;
    setStatus("Cleared selection.");
  }

  function clearSearch() {
    state.searchQuery = "";
    if (els.search) els.search.value = "";
  }

  function setStatus(msg) {
    els.status.textContent = msg;
  }

  function highlightMenu(tag) {
    els.menu.querySelectorAll("button").forEach(b =>
      b.classList.toggle("active", b.dataset.filterTag === tag)
    );
  }
})();
