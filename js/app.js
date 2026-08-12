/* =========================================================================
   Flesh & Blood Proxy Maker — app logic
   Vanilla JS, no dependencies. Loads data/cards.min.json, lets the user
   search / paste a deck in a slide-out drawer, pick a version from a visual
   gallery, set quantities, and print a true-to-size sheet.
   ========================================================================= */

(() => {
  "use strict";

  // ---- paper presets ---------------------------------------------------
  // `page`   -> the @page rule (size + orientation + margin)
  // `printH` -> printable height (paper height - 2*margin) in mm, used to
  //             vertically center a single page while leaving multi-page
  //             sheets packed from the top.
  // NOTE: we intentionally set only `size` (orientation), not `margin`.
  // Declaring an @page margin breaks Safari — it disables Safari's own default
  // print margins and then doesn't apply the value, so content clips at the top
  // edge. Letting each browser use its normal (non-zero) print margins works
  // everywhere and gives correct per-page margins on multi-page sheets.
  const PAPER = {
    "letter-landscape": { page: "size: letter landscape;", perPage: 8 },
    "a4-portrait":      { page: "size: A4 portrait;",       perPage: 9 },
    "letter-portrait":  { page: "size: letter portrait;",   perPage: 9 },
    "a4-landscape":     { page: "size: A4 landscape;",      perPage: 8 },
  };
  let paperValue = "letter-landscape";

  // ---- state -----------------------------------------------------------
  let CARDS = [];            // full card database (slim)
  const CODES = new Map();   // "WTR054" -> { card, versionIndex }
  const list = [];           // print list: { card, versionIndex, qty }

  // ---- element refs ----------------------------------------------------
  const el = (id) => document.getElementById(id);
  const searchInput = el("searchInput");
  const searchStatus = el("searchStatus");
  const results = el("results");
  const deckInput = el("deckInput");
  const deckStatus = el("deckStatus");
  const printList = el("printList");
  const emptyMsg = el("emptyMsg");
  const cardCount = el("cardCount");
  const pageStyle = el("pageStyle");
  const modal = el("versionModal");
  const modalTitle = el("modalTitle");
  const modalGrid = el("modalGrid");
  const drawer = el("addDrawer");
  const drawerBackdrop = el("drawerBackdrop");
  const themeToggle = el("themeToggle");

  // ---- helpers ---------------------------------------------------------
  const esc = (s) =>
    String(s).replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
    );

  // Card color from pitch value (FaB: 1=Red, 2=Yellow, 3=Blue). Colorless
  // cards (equipment, weapons, heroes, …) return "" and show no notation.
  function colorName(card) {
    return { 1: "Red", 2: "Yellow", 3: "Blue" }[card.p] || "";
  }

  function cardTitle(card) {
    const c = colorName(card);
    return c ? `${card.n} (${c})` : card.n;
  }

  // ---- hover preview (large card image) -------------------------------
  const preview = el("cardPreview");
  function movePreview(e) {
    const pad = 16;
    const w = preview.offsetWidth || 390;
    const h = preview.offsetHeight || 545;
    let x = e.clientX - w - pad;           // prefer left of the cursor
    if (x < pad) x = e.clientX + pad;      // flip right if there's no room
    let y = Math.min(Math.max(e.clientY - h / 2, pad), window.innerHeight - h - pad);
    preview.style.left = x + "px";
    preview.style.top = y + "px";
  }
  function attachPreview(imgEl, url) {
    imgEl.addEventListener("mouseenter", (e) => { preview.src = url; preview.classList.add("show"); movePreview(e); });
    imgEl.addEventListener("mousemove", movePreview);
    imgEl.addEventListener("mouseleave", () => preview.classList.remove("show"));
  }

  // ---- announcement banner --------------------------------------------
  // Dismissal is remembered per data-id, so changing the id in index.html
  // re-shows the banner to everyone (including people who dismissed the last).
  function initAnnouncement() {
    const bar = el("announcement");
    if (!bar) return;
    const id = bar.dataset.id || "default";
    if (localStorage.getItem("annDismissed") === id) {
      bar.hidden = true;
      return;
    }
    el("announcementClose").addEventListener("click", () => {
      bar.hidden = true;
      localStorage.setItem("annDismissed", id);
    });
  }

  // ---- accessibility settings -----------------------------------------
  // Each option maps to an attribute on <html>. The same map is mirrored in the
  // early-apply script in index.html (to avoid a flash before this JS runs).
  const A11Y = {
    cvd:          { attr: "data-cvd", val: "", label: "Color-blind friendly colors",
                    desc: "Use a high-visibility blue accent instead of red, which is easier to tell apart with red–green color blindness." },
    contrast:     { attr: "data-contrast", val: "high", label: "High contrast",
                    desc: "Strengthen text and border contrast." },
    largeText:    { attr: "data-text", val: "large", label: "Larger text",
                    desc: "Increase the overall text size." },
    boldText:     { attr: "data-bold", val: "", label: "Bold text",
                    desc: "Use a heavier font weight for readability." },
    underline:    { attr: "data-underline", val: "", label: "Underline links",
                    desc: "Always underline links so they aren't identified by color alone." },
    reduceMotion: { attr: "data-motion", val: "reduce", label: "Reduce motion",
                    desc: "Turn off animations and transitions." },
  };
  let a11y = {};
  function loadA11y() { try { a11y = JSON.parse(localStorage.getItem("a11y") || "{}"); } catch (e) { a11y = {}; } }
  function applyA11y() {
    const root = document.documentElement;
    for (const k in A11Y) {
      if (a11y[k]) root.setAttribute(A11Y[k].attr, A11Y[k].val);
      else root.removeAttribute(A11Y[k].attr);
    }
  }
  function renderSettings() {
    const box = el("settingsList");
    box.innerHTML = "";
    for (const k in A11Y) {
      const s = A11Y[k];
      const row = document.createElement("label");
      row.className = "setting-row";
      row.innerHTML = `
        <input type="checkbox" ${a11y[k] ? "checked" : ""} />
        <span>
          <span class="s-label">${esc(s.label)}</span><br />
          <span class="s-desc">${esc(s.desc)}</span>
        </span>`;
      row.querySelector("input").addEventListener("change", (e) => {
        a11y[k] = e.target.checked;
        localStorage.setItem("a11y", JSON.stringify(a11y));
        applyA11y();
      });
      box.appendChild(row);
    }
  }

  // ---- theme -----------------------------------------------------------
  function effectiveTheme() {
    const forced = document.documentElement.getAttribute("data-theme");
    if (forced) return forced;
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  const SUN_SVG =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<circle cx="12" cy="12" r="5"></circle>' +
    '<line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line>' +
    '<line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>' +
    '<line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line>' +
    '<line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg>';
  const MOON_SVG =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>';

  function updateThemeIcon() {
    // Show the icon for the mode you'll switch TO.
    themeToggle.innerHTML = effectiveTheme() === "dark" ? SUN_SVG : MOON_SVG;
  }
  function toggleTheme() {
    const next = effectiveTheme() === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem("theme", next);
    updateThemeIcon();
  }

  // ---- paper selection -------------------------------------------------
  function setPaper(value) {
    paperValue = PAPER[value] ? value : "letter-landscape";
    const preset = PAPER[paperValue];
    // Only set the @page rule. We deliberately do NOT force a full-page
    // min-height on the sheet: that vertically centered a single page in
    // Chrome but made Firefox/Safari round past the printable area and emit a
    // blank trailing page. Cards are top-aligned and horizontally centered.
    pageStyle.textContent = `@page { ${preset.page} }`;
    updateCount();
  }

  function updateCount() {
    const total = list.reduce((n, it) => n + it.qty, 0);
    const perPage = PAPER[paperValue].perPage;
    const pages = Math.ceil(total / perPage);
    const cardsTxt = `${total} card${total === 1 ? "" : "s"}`;
    const pagesTxt = total ? ` · ${pages} page${pages === 1 ? "" : "s"}` : "";
    cardCount.textContent = `(${cardsTxt}${pagesTxt})`;
  }

  // ---- data load -------------------------------------------------------
  async function loadCards() {
    try {
      const res = await fetch("data/cards.min.json", { cache: "no-cache" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      CARDS = await res.json();
      // Build a code -> version lookup. Versions are stored base-first, so the
      // base printing wins when a code is shared (e.g. a card and its extended
      // art), while a code unique to one version resolves straight to it.
      CODES.clear();
      for (const card of CARDS) {
        card.v.forEach((v, i) => {
          const code = (v.id || "").toUpperCase();
          if (code && !CODES.has(code)) CODES.set(code, { card, versionIndex: i });
        });
      }
      searchStatus.textContent =
        `${CARDS.length.toLocaleString()} cards loaded. Start typing to search.`;
    } catch (err) {
      searchStatus.textContent =
        "Could not load card data (data/cards.min.json). Serve the site over http, not file://.";
      console.error(err);
    }
  }

  // ---- drawer ----------------------------------------------------------
  function openDrawer() {
    drawer.classList.add("open");
    drawerBackdrop.classList.add("open");
    setTimeout(() => searchInput.focus(), 60);
  }
  function closeDrawer() {
    drawer.classList.remove("open");
    drawerBackdrop.classList.remove("open");
  }

  // ---- search ----------------------------------------------------------
  let searchTimer = null;
  function onSearch() {
    el("clearSearch").hidden = searchInput.value.length === 0;
    clearTimeout(searchTimer);
    searchTimer = setTimeout(runSearch, 120);
  }
  function clearSearch() {
    searchInput.value = "";
    el("clearSearch").hidden = true;
    runSearch();
    searchInput.focus();
  }

  function runSearch() {
    const q = searchInput.value.trim().toLowerCase();
    results.innerHTML = "";
    if (q.length < 2) {
      searchStatus.textContent = "Type at least 2 characters.";
      return;
    }
    const matches = CARDS.filter((c) => c.n.toLowerCase().includes(q)).slice(0, 60);
    searchStatus.textContent = matches.length
      ? `${matches.length}${matches.length === 60 ? "+" : ""} result(s)`
      : "No matches.";

    const frag = document.createDocumentFragment();
    for (const card of matches) {
      const multi = card.v.length > 1;
      const div = document.createElement("div");
      div.className = "result";
      const code = card.v[0].id ? ` · ${esc(card.v[0].id)}` : "";
      div.innerHTML = `
        <img class="thumb" loading="lazy" src="${esc(card.v[0].u)}" alt="${esc(card.n)}" />
        <div class="name">${esc(cardTitle(card))}</div>
        <div class="sub">${esc(card.t)}${code}</div>
        ${multi ? `<span class="badge">${card.v.length} versions</span>` : ""}`;
      div.addEventListener("click", () =>
        multi
          ? openVersionModal(card, (i) => { addCard(card, i); closeModal(); })
          : addCard(card, 0)
      );
      frag.appendChild(div);
    }
    results.appendChild(frag);
  }

  // ---- version gallery modal ------------------------------------------
  let escHandler = null;
  function openVersionModal(card, onPick, selectedIndex = -1) {
    modalTitle.textContent = cardTitle(card);
    modalGrid.innerHTML = "";
    card.v.forEach((ver, i) => {
      const tile = document.createElement("button");
      tile.type = "button";
      tile.className = "version-tile" + (i === selectedIndex ? " selected" : "");
      const codeTxt = ver.id ? `${esc(ver.l)} · ${esc(ver.id)}` : esc(ver.l);
      tile.innerHTML = `
        <img loading="lazy" src="${esc(ver.u)}" alt="${esc(ver.l)}" />
        <span class="ver-label">${codeTxt}</span>`;
      tile.addEventListener("click", () => onPick(i));
      modalGrid.appendChild(tile);
    });
    modal.classList.remove("hidden");
    escHandler = (e) => { if (e.key === "Escape") closeModal(); };
    document.addEventListener("keydown", escHandler);
  }
  function closeModal() {
    modal.classList.add("hidden");
    if (escHandler) document.removeEventListener("keydown", escHandler);
    escHandler = null;
  }

  // ---- deck list paste -------------------------------------------------
  function addFromDeck() {
    const lines = deckInput.value.split("\n").map((l) => l.trim()).filter(Boolean);
    let added = 0;
    const missing = [];

    for (const raw of lines) {
      const m = raw.match(/^(?:(\d+)\s*x?\s+)?(.*)$/i);
      let qty = m && m[1] ? parseInt(m[1], 10) : 1;
      let rest = (m ? m[2] : raw).trim();

      // 1) Exact card code, e.g. "GEM062" or "3 WTR054".
      const byCode = CODES.get(rest.toUpperCase());
      if (byCode) { addCard(byCode.card, byCode.versionIndex, qty); added++; continue; }

      // 2) Card name, with an optional (red|yellow|blue) pitch hint.
      let name = rest, pitch = "";
      const pm = name.match(/\((red|yellow|blue)\)\s*$/i);
      if (pm) {
        pitch = { red: "1", yellow: "2", blue: "3" }[pm[1].toLowerCase()];
        name = name.replace(/\((red|yellow|blue)\)\s*$/i, "").trim();
      }

      const card = findCard(name, pitch);
      if (card) { addCard(card, 0, qty); added++; }
      else missing.push(raw);
    }

    deckStatus.textContent =
      `Added ${added} line(s).` + (missing.length ? ` Not found: ${missing.join("; ")}` : "");
  }

  function findCard(name, pitch) {
    const lc = name.toLowerCase();
    const exact = CARDS.filter((c) => c.n.toLowerCase() === lc);
    if (exact.length) {
      if (pitch) {
        const byPitch = exact.find((c) => String(c.p) === String(pitch));
        if (byPitch) return byPitch;
      }
      return exact[0];
    }
    return CARDS.find((c) => c.n.toLowerCase().startsWith(lc)) || null;
  }

  // ---- print list management ------------------------------------------
  function addCard(card, versionIndex = 0, qty = 1) {
    const existing = list.find((it) => it.card === card && it.versionIndex === versionIndex);
    if (existing) existing.qty += qty;
    else list.push({ card, versionIndex, qty });
    renderList();
  }

  function changeVersion(item, newIndex) {
    const dupe = list.find((it) => it !== item && it.card === item.card && it.versionIndex === newIndex);
    if (dupe) {
      dupe.qty += item.qty;
      list.splice(list.indexOf(item), 1);
    } else {
      item.versionIndex = newIndex;
    }
    renderList();
  }

  function renderList() {
    printList.innerHTML = "";
    updateCount();
    emptyMsg.style.display = list.length ? "none" : "block";

    list.forEach((it) => {
      const li = document.createElement("li");
      li.className = "pl-item";
      const v = it.card.v[it.versionIndex];
      const multi = it.card.v.length > 1;

      const codeTxt = v.id ? `${esc(v.l)} · ${esc(v.id)}` : esc(v.l);
      li.innerHTML = `
        <img class="thumb${multi ? " clickable" : ""}" loading="lazy" src="${esc(v.u)}" alt=""
             title="${multi ? "Click to change version" : ""}" />
        <div class="info">
          <div class="name">${esc(cardTitle(it.card))}</div>
          <div class="sub muted">${codeTxt}${multi ? " · <span class=\"link\">change version</span>" : ""}</div>
        </div>
        <div class="qty">
          <button type="button" class="dec">–</button>
          <input type="text" inputmode="numeric" pattern="[0-9]*" value="${it.qty}" class="qval" aria-label="Quantity" />
          <button type="button" class="inc">+</button>
        </div>
        <button type="button" class="del" title="Remove">✕</button>`;

      attachPreview(li.querySelector(".thumb"), v.u);
      if (multi) {
        const open = () =>
          openVersionModal(it.card, (i) => { changeVersion(it, i); closeModal(); }, it.versionIndex);
        li.querySelector(".thumb").addEventListener("click", open);
        li.querySelector(".link").addEventListener("click", open);
      }
      li.querySelector(".inc").addEventListener("click", () => { it.qty++; renderList(); });
      li.querySelector(".dec").addEventListener("click", () => { it.qty = Math.max(1, it.qty - 1); renderList(); });
      li.querySelector(".qval").addEventListener("change", (e) => {
        it.qty = Math.max(1, parseInt(e.target.value, 10) || 1);
        renderList();
      });
      li.querySelector(".del").addEventListener("click", () => {
        list.splice(list.indexOf(it), 1);
        renderList();
      });

      printList.appendChild(li);
    });
  }

  // ---- build print sheet + print --------------------------------------
  function buildSheet() {
    const sheet = el("printSheet");
    sheet.innerHTML = "";
    const frag = document.createDocumentFragment();
    for (const it of list) {
      const v = it.card.v[it.versionIndex];
      const rotClass = v.r ? `rot${v.r}` : "rot0";
      for (let i = 0; i < it.qty; i++) {
        const card = document.createElement("div");
        card.className = "print-card";
        const img = document.createElement("img");
        img.className = rotClass;
        img.src = v.u;
        img.alt = it.card.n;
        card.appendChild(img);
        frag.appendChild(card);
      }
    }
    sheet.appendChild(frag);
  }

  function doPrint() {
    if (!list.length) { alert("Add some cards to the print list first."); return; }
    buildSheet();
    requestAnimationFrame(() => requestAnimationFrame(() => window.print()));
  }

  // ---- wire up ---------------------------------------------------------
  function openSettings() { renderSettings(); el("settingsModal").classList.remove("hidden"); }
  function closeSettings() { el("settingsModal").classList.add("hidden"); }

  function init() {
    initAnnouncement();
    loadA11y();
    applyA11y();
    updateThemeIcon();
    setPaper(el("paper").value);
    el("paper").addEventListener("change", (e) => setPaper(e.target.value));
    searchInput.addEventListener("input", onSearch);
    el("clearSearch").addEventListener("click", clearSearch);
    el("addDeckBtn").addEventListener("click", addFromDeck);
    el("printBtn").addEventListener("click", doPrint);
    el("clearBtn").addEventListener("click", () => { list.length = 0; renderList(); });
    themeToggle.addEventListener("click", toggleTheme);

    el("addCardsBtn").addEventListener("click", openDrawer);
    el("drawerClose").addEventListener("click", closeDrawer);
    drawerBackdrop.addEventListener("click", closeDrawer);

    el("modalClose").addEventListener("click", closeModal);
    modal.addEventListener("click", (e) => { if (e.target === modal) closeModal(); });

    const settingsModal = el("settingsModal");
    el("settingsBtn").addEventListener("click", openSettings);
    el("settingsClose").addEventListener("click", closeSettings);
    settingsModal.addEventListener("click", (e) => { if (e.target === settingsModal) closeSettings(); });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeSettings(); });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && drawer.classList.contains("open") && modal.classList.contains("hidden")) {
        closeDrawer();
      }
    });

    document.querySelectorAll(".tab").forEach((tab) => {
      tab.addEventListener("click", () => {
        document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
        tab.classList.add("active");
        document.querySelectorAll(".tab-body").forEach((b) => b.classList.add("hidden"));
        document.querySelector(`.tab-body[data-body="${tab.dataset.tab}"]`).classList.remove("hidden");
      });
    });

    // Keep the theme icon in sync if the OS preference changes and the user
    // hasn't picked an explicit theme.
    window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", updateThemeIcon);

    renderList();
    loadCards();
  }

  document.addEventListener("DOMContentLoaded", init);
})();
