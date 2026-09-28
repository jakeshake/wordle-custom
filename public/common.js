// Shared plumbing for every game page: themes, player name, modals, toasts,
// dates, seeded randomness, and small API helpers. Exposed as window.Shared.
window.Shared = (() => {
  "use strict";

  const THEMES = [
    { id: "dark", name: "Dark", swatch: "#538d4e" },
    { id: "light", name: "Light", swatch: "#6aaa64" },
    { id: "neon-standard", name: "Standard Neon", swatch: "#39ff14" },
    { id: "neon-city", name: "Neon City", swatch: "#00e5ff" },
    { id: "synthwave", name: "Synthwave", swatch: "#ff2ec4" },
    { id: "bubblegum-3d", name: "Bubblegum 3D", swatch: "#6fdcc7" },
    { id: "ocean", name: "Ocean", swatch: "#2ea8b8" },
    { id: "sunset", name: "Sunset", swatch: "#e0703f" },
    { id: "forest", name: "Forest", swatch: "#f236c1" },
    { id: "halloween", name: "Halloween", swatch: "#ff7518" },
    { id: "christmas", name: "Christmas", swatch: "#c41e3a" },
    { id: "neon80s", name: "Neon 80s", swatch: "#ff6b00" },
    { id: "spooky", name: "Spooky", swatch: "#7cb342" },
    { id: "terminal", name: "Retro Terminal", swatch: "#33ff33" },
    { id: "bubblegum", name: "Bubblegum", swatch: "#ff8fc7" },
    { id: "art-deco", name: "Art Deco", swatch: "#d4af37" },
  ];

  const THEME_KEY = "wordly:theme";
  const PLAYER_KEY = "wordly:playerName";

  // ---------- storage ----------

  function load(key) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  function save(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Storage full or blocked - progress just won't survive a reload.
    }
  }

  // ---------- dates & timers ----------

  function todayDateString(d = new Date()) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }

  function shiftDate(dateStr, days) {
    const [y, m, d] = dateStr.split("-").map(Number);
    return todayDateString(new Date(y, m - 1, d + days));
  }

  function msUntilNextMidnight() {
    const now = new Date();
    const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    return next.getTime() - now.getTime();
  }

  function formatCountdown(ms, noun = "puzzle") {
    const totalMinutes = Math.max(0, Math.floor(ms / 60000));
    return `Next ${noun} in ${Math.floor(totalMinutes / 60)}h ${totalMinutes % 60}m`;
  }

  function formatTimer(ms) {
    const totalSeconds = Math.max(0, Math.floor(ms / 1000));
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = String(totalSeconds % 60).padStart(2, "0");
    return h ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
  }

  // ---------- seeded randomness ----------

  function hashString(str) {
    let hash = 5381;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash * 33) ^ str.charCodeAt(i)) >>> 0;
    }
    return hash >>> 0;
  }

  // mulberry32: tiny deterministic PRNG so every device builds the same
  // daily puzzle from the same date string.
  function seededRandom(seedStr) {
    let a = hashString(seedStr);
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function shuffle(arr, rand = Math.random) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function letterMask(word) {
    let mask = 0;
    for (let i = 0; i < word.length; i++) mask |= 1 << (word.charCodeAt(i) - 97);
    return mask;
  }

  function bitCount(n) {
    let c = 0;
    while (n) {
      n &= n - 1;
      c++;
    }
    return c;
  }

  // Active-play stopwatch: only counts while the page is visible, so leaving
  // a puzzle open in a background tab doesn't inflate your time.
  function createStopwatch(initialMs, onTick) {
    let accumulated = initialMs || 0;
    let runningSince = null;
    let interval = null;

    function current() {
      return accumulated + (runningSince ? Date.now() - runningSince : 0);
    }
    function pause() {
      if (runningSince) accumulated += Date.now() - runningSince;
      runningSince = null;
    }
    function resume() {
      if (!runningSince && !document.hidden) runningSince = Date.now();
    }
    function start() {
      resume();
      if (!interval) {
        interval = setInterval(() => onTick && onTick(current()), 250);
        document.addEventListener("visibilitychange", onVisibility);
      }
      onTick && onTick(current());
    }
    function stop() {
      pause();
      if (interval) clearInterval(interval);
      interval = null;
      document.removeEventListener("visibilitychange", onVisibility);
      return accumulated;
    }
    function onVisibility() {
      if (document.hidden) pause();
      else resume();
    }
    return { start, stop, current, get running() { return !!interval; } };
  }

  // ---------- player ----------

  function getPlayerName() {
    try {
      return localStorage.getItem(PLAYER_KEY) || "";
    } catch {
      return "";
    }
  }

  function setPlayerName(name) {
    try {
      localStorage.setItem(PLAYER_KEY, name);
    } catch {
      // ignore
    }
  }

  // ---------- UI helpers ----------

  function showToast(message, ms = 1300) {
    const container = document.getElementById("toast-container");
    if (!container) return;
    // One message at a time - rapid-fire input would otherwise stack a
    // column of toasts down the screen.
    container.innerHTML = "";
    const toast = document.createElement("div");
    toast.className = "toast";
    toast.textContent = message;
    toast.style.animationDelay = `0s, ${Math.max(0, ms - 200) / 1000}s`;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), ms);
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = String(str);
    return div.innerHTML;
  }

  const closeHooks = {};
  function openModal(id) {
    document.getElementById(id).classList.remove("hidden");
  }
  function closeModal(id) {
    document.getElementById(id).classList.add("hidden");
    (closeHooks[id] || []).forEach((fn) => fn());
  }
  function onModalClose(id, fn) {
    (closeHooks[id] = closeHooks[id] || []).push(fn);
  }
  function anyModalOpen() {
    return !!document.querySelector(".modal-overlay:not(.hidden)");
  }

  // ---------- theme ----------

  function applyTheme(themeId) {
    document.documentElement.setAttribute("data-theme", themeId);
    try {
      localStorage.setItem(THEME_KEY, themeId);
    } catch {
      // ignore
    }
    renderThemeList(themeId);
  }

  function renderThemeList(activeId) {
    const list = document.getElementById("theme-list");
    if (!list) return;
    list.innerHTML = "";
    THEMES.forEach((theme) => {
      const btn = document.createElement("button");
      btn.className = "theme-option" + (theme.id === activeId ? " active" : "");
      btn.innerHTML = `<span class="theme-swatch" style="background:${theme.swatch}"></span><span>${theme.name}</span>`;
      btn.addEventListener("click", () => applyTheme(theme.id));
      list.appendChild(btn);
    });
  }

  // ---------- shell ----------

  // Injects the theme + player modals every page shares, and wires the
  // header buttons, close buttons, and click-outside-to-close behavior.
  function initShell({ onNameSaved } = {}) {
    if (!document.getElementById("theme-modal")) {
      document.body.insertAdjacentHTML(
        "beforeend",
        `<div id="theme-modal" class="modal-overlay hidden">
          <div class="modal">
            <button class="modal-close" data-close="theme-modal" aria-label="Close">&times;</button>
            <h2>Theme</h2>
            <div id="theme-list" class="theme-list"></div>
          </div>
        </div>
        <div id="name-modal" class="modal-overlay hidden">
          <div class="modal">
            <button class="modal-close" data-close="name-modal" aria-label="Close">&times;</button>
            <h2>Player Profile</h2>
            <p>This name is used for the leaderboards in every game.</p>
            <input id="name-input" class="text-input" type="text" maxlength="40" placeholder="Your name" autocomplete="off" />
            <button id="name-save-btn" class="primary-btn">Save</button>
          </div>
        </div>`
      );
    }

    let savedTheme = null;
    try {
      savedTheme = localStorage.getItem(THEME_KEY);
    } catch {
      // ignore
    }
    if (savedTheme && THEMES.some((t) => t.id === savedTheme)) applyTheme(savedTheme);
    else renderThemeList(null);

    const themeBtn = document.getElementById("theme-btn");
    if (themeBtn) themeBtn.addEventListener("click", () => openModal("theme-modal"));

    const playerBtn = document.getElementById("player-btn");
    if (playerBtn) {
      playerBtn.addEventListener("click", () => {
        document.getElementById("name-input").value = getPlayerName();
        openModal("name-modal");
      });
    }

    const saveName = () => {
      const input = document.getElementById("name-input");
      const name = input.value.trim();
      if (!name) {
        input.focus();
        return;
      }
      setPlayerName(name);
      closeModal("name-modal");
      if (onNameSaved) onNameSaved(name);
    };
    document.getElementById("name-save-btn").addEventListener("click", saveName);
    document.getElementById("name-input").addEventListener("keydown", (e) => {
      if (e.key === "Enter") saveName();
    });

    document.querySelectorAll("[data-close]").forEach((btn) => {
      btn.addEventListener("click", () => closeModal(btn.dataset.close));
    });
    document.querySelectorAll(".modal-overlay").forEach((overlay) => {
      overlay.addEventListener("click", (e) => {
        if (e.target === overlay) closeModal(overlay.id);
      });
    });
    document.addEventListener("keydown", (e) => {
      if (e.key !== "Escape") return;
      const open = document.querySelector(".modal-overlay:not(.hidden)");
      if (open) closeModal(open.id);
    });
  }

  // Name gate shown before a Daily game when no player name is set yet.
  // Expects #name-gate, #gate-name-input, #gate-name-btn in the page.
  function wireNameGate(onSubmit) {
    const input = document.getElementById("gate-name-input");
    const btn = document.getElementById("gate-name-btn");
    btn.addEventListener("click", () => {
      const name = input.value.trim();
      if (!name) {
        input.focus();
        return;
      }
      setPlayerName(name);
      onSubmit(name);
    });
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") btn.click();
    });
  }

  // ---------- API ----------

  async function postJSON(url, body, { keepalive = false } = {}) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      keepalive,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }

  async function getJSON(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }

  // Renders an array of row objects as the shared leaderboard table style.
  // columns: [{ label, value: (row) => string (already escaped/safe) }]
  function renderTable(container, rows, columns, emptyText) {
    if (!rows.length) {
      container.innerHTML = `<p class="lb-status">${escapeHtml(emptyText)}</p>`;
      return;
    }
    const me = getPlayerName();
    container.innerHTML = `
      <table class="lb-table">
        <thead><tr>${columns.map((c) => `<th>${c.label}</th>`).join("")}</tr></thead>
        <tbody>
          ${rows
            .map(
              (r) =>
                `<tr${r.name === me ? ' class="lb-me"' : ""}>${columns
                  .map((c) => `<td>${c.value(r)}</td>`)
                  .join("")}</tr>`
            )
            .join("")}
        </tbody>
      </table>`;
  }

  return {
    THEMES,
    load,
    save,
    todayDateString,
    shiftDate,
    msUntilNextMidnight,
    formatCountdown,
    formatTimer,
    hashString,
    seededRandom,
    shuffle,
    letterMask,
    bitCount,
    createStopwatch,
    getPlayerName,
    setPlayerName,
    showToast,
    escapeHtml,
    openModal,
    closeModal,
    onModalClose,
    anyModalOpen,
    applyTheme,
    initShell,
    wireNameGate,
    postJSON,
    getJSON,
    renderTable,
  };
})();
