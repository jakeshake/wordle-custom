(() => {
  "use strict";

  const S = Shared;

  const KEYS = {
    mode: "boxed:mode",
    daily: (date) => `boxed:daily:${date}`,
    practice: "boxed:practice",
  };

  const els = {
    game: document.getElementById("boxed-game"),
    gate: document.getElementById("name-gate"),
    loading: document.getElementById("loading"),
    current: document.getElementById("boxed-current"),
    words: document.getElementById("boxed-words"),
    par: document.getElementById("boxed-par"),
    timer: document.getElementById("boxed-timer"),
    box: document.getElementById("box"),
    extra: document.getElementById("boxed-extra"),
    newGame: document.getElementById("new-game-btn"),
  };

  let state = null;
  let stopwatch = null;
  let countdownTimer = null;
  let lastPersistSecond = -1;

  // ---------- puzzle generation ----------

  // Common-word pool indexed by first letter. Each daily box is built
  // around a two-word chain from this pool (A ends where B starts, and
  // together they use exactly 12 letters), then the letters are dealt onto
  // four sides so neither word ever steps between two letters on one side.
  let pool = null;
  function getPool() {
    if (pool) return pool;
    const words = BOXED_COMMON;
    const masks = words.map(S.letterMask);
    const byFirst = {};
    const starters = [];
    words.forEach((w, i) => {
      (byFirst[w[0]] = byFirst[w[0]] || []).push(i);
      const distinct = S.bitCount(masks[i]);
      if (w.length >= 4 && distinct >= 5 && distinct <= 9) starters.push(i);
    });
    pool = { words, masks, byFirst, starters };
    return pool;
  }

  function dealSides(chain, rand) {
    const adj = {};
    for (const w of chain) {
      for (let i = 0; i < w.length; i++) {
        adj[w[i]] = adj[w[i]] || new Set();
        if (i > 0) adj[w[i]].add(w[i - 1]);
        if (i < w.length - 1) adj[w[i]].add(w[i + 1]);
      }
    }
    // Most-constrained letters first keeps the backtracking tiny.
    const order = S.shuffle(Object.keys(adj), rand).sort((a, b) => adj[b].size - adj[a].size);
    const sides = [[], [], [], []];
    function place(i) {
      if (i === order.length) return true;
      const letter = order[i];
      let triedEmpty = false;
      for (const s of S.shuffle([0, 1, 2, 3], rand)) {
        const side = sides[s];
        if (side.length >= 3 || side.some((x) => adj[letter].has(x))) continue;
        if (!side.length) {
          if (triedEmpty) continue;
          triedEmpty = true;
        }
        side.push(letter);
        if (place(i + 1)) return true;
        side.pop();
      }
      return false;
    }
    return place(0) ? sides.map((side) => S.shuffle(side, rand)) : null;
  }

  function buildPuzzle(seed) {
    const rand = S.seededRandom(seed);
    const { words, masks, byFirst, starters } = getPool();
    for (let attempt = 0; attempt < 2000; attempt++) {
      const ai = starters[Math.floor(rand() * starters.length)];
      const a = words[ai];
      const matches = (byFirst[a[a.length - 1]] || []).filter(
        (bi) => bi !== ai && S.bitCount(masks[ai] | masks[bi]) === 12
      );
      if (!matches.length) continue;
      const b = words[matches[Math.floor(rand() * matches.length)]];
      const sides = dealSides([a, b], rand);
      if (sides) return makePuzzle(sides, [a, b]);
    }
    throw new Error("could not build a Letter Boxed puzzle");
  }

  function makePuzzle(sides, solution) {
    const sideOf = {};
    sides.forEach((side, s) => side.forEach((l) => (sideOf[l] = s)));
    return { sides, solution, sideOf, _valid: null, _par: null };
  }

  function playable(word, sideOf) {
    let prev = -1;
    for (let i = 0; i < word.length; i++) {
      const s = sideOf[word[i]];
      if (s === undefined || s === prev) return false;
      prev = s;
    }
    return true;
  }

  function validSet(puzzle) {
    if (!puzzle._valid) puzzle._valid = new Set(BOXED_VALID.filter((w) => playable(w, puzzle.sideOf)));
    return puzzle._valid;
  }

  // Par scales with how many two-word solutions exist among common words:
  // a box with lots of them is easier, so it asks for fewer words.
  function parFor(puzzle) {
    if (puzzle._par) return puzzle._par;
    const { words } = getPool();
    const common = words.filter((w) => playable(w, puzzle.sideOf));
    const masks = common.map(S.letterMask);
    const byFirst = {};
    common.forEach((w, i) => (byFirst[w[0]] = byFirst[w[0]] || []).push(i));
    const full = S.letterMask(puzzle.sides.flat().join(""));
    let pairs = 0;
    common.forEach((w, i) => {
      for (const j of byFirst[w[w.length - 1]] || []) {
        if ((masks[i] | masks[j]) === full) pairs++;
      }
    });
    puzzle._par = pairs >= 15 ? 4 : pairs >= 3 ? 5 : 6;
    return puzzle._par;
  }

  // ---------- lifecycle ----------

  function setMode(mode) {
    try {
      localStorage.setItem(KEYS.mode, mode);
    } catch {
      // ignore
    }
    document.querySelectorAll(".mode-btn").forEach((b) => b.classList.toggle("active", b.dataset.mode === mode));
    els.newGame.style.visibility = mode === "practice" ? "visible" : "hidden";
    els.extra.textContent = mode === "daily" ? "Yesterday's solution" : "Show a solution";
  }

  function teardown() {
    if (stopwatch && state && state.puzzle) {
      state.activeMs = stopwatch.stop();
      persist();
    }
    stopwatch = null;
  }

  function startDaily() {
    teardown();
    setMode("daily");
    const date = S.todayDateString();
    if (!S.getPlayerName()) {
      state = { mode: "daily", date };
      showGate();
      return;
    }
    hideGate();
    const seed = `boxed:${date}`;
    beginRound({ mode: "daily", date, seed, saved: S.load(KEYS.daily(date)) || {} });
  }

  function startPractice(fresh) {
    teardown();
    setMode("practice");
    hideGate();
    const saved = (!fresh && S.load(KEYS.practice)) || {};
    const seed = saved.seed || `boxed-practice:${Date.now()}:${Math.random()}`;
    beginRound({ mode: "practice", date: null, seed, saved });
  }

  function beginRound({ mode, date, seed, saved }) {
    const puzzle = buildPuzzle(seed);
    const valid = validSet(puzzle);
    const words = (saved.words || []).filter((w) => valid.has(w));
    state = {
      mode,
      date,
      seed,
      puzzle,
      par: parFor(puzzle),
      words,
      current: typeof saved.current === "string" && saved.current.split("").every((l) => l in puzzle.sideOf)
        ? saved.current
        : words.length ? words[words.length - 1].slice(-1) : "",
      started: !!saved.started,
      activeMs: saved.activeMs || 0,
      solved: !!saved.solved,
      submitted: !!saved.submitted,
    };
    stopwatch = S.createStopwatch(state.activeMs, onTick);
    render();
    persist();
    els.timer.textContent = S.formatTimer(state.activeMs);
    els.timer.classList.toggle("hidden", !state.started);
    if (state.started && !state.solved) stopwatch.start();
    if (state.solved) {
      if (mode === "daily" && !state.submitted) submitResult();
      showResult();
    }
  }

  function onTick(ms) {
    state.activeMs = ms;
    els.timer.textContent = S.formatTimer(ms);
    const sec = Math.floor(ms / 1000);
    if (sec !== lastPersistSecond) {
      lastPersistSecond = sec;
      persist();
    }
  }

  function ensureStarted() {
    if (!state.started) {
      state.started = true;
      els.timer.classList.remove("hidden");
      persist();
    }
    if (!stopwatch.running && !state.solved) stopwatch.start();
  }

  function persist() {
    if (!state || !state.puzzle) return;
    const data = {
      words: state.words,
      current: state.current,
      started: state.started,
      activeMs: state.activeMs,
      solved: state.solved,
      submitted: state.submitted,
      par: state.par,
    };
    if (state.mode === "daily") S.save(KEYS.daily(state.date), data);
    else S.save(KEYS.practice, { seed: state.seed, ...data });
  }

  function showGate() {
    els.loading.classList.add("hidden");
    els.game.classList.add("hidden");
    els.gate.classList.remove("hidden");
    document.getElementById("gate-name-input").value = "";
  }

  function hideGate() {
    els.loading.classList.add("hidden");
    els.game.classList.remove("hidden");
    els.gate.classList.add("hidden");
  }

  // ---------- rendering ----------

  const SLOTS = [100, 150, 200];
  function dotPos(side, i) {
    const t = SLOTS[i];
    return [[t, 50], [250, t], [t, 250], [50, t]][side];
  }
  function labelPos(side, i) {
    const t = SLOTS[i];
    return [[t, 22], [279, t], [t, 280], [21, t]][side];
  }
  function hitPos(side, i) {
    const t = SLOTS[i];
    return [[t, 34], [266, t], [t, 266], [34, t]][side];
  }

  function letterPos(letter) {
    const s = state.puzzle.sideOf[letter];
    return dotPos(s, state.puzzle.sides[s].indexOf(letter));
  }

  function pathFor(word) {
    return word
      .split("")
      .map((l) => letterPos(l).join(","))
      .join(" ");
  }

  function usedLetters() {
    return new Set(state.words.join(""));
  }

  function render() {
    const p = state.puzzle;
    const used = usedLetters();
    const inCurrent = new Set(state.current);
    const last = state.current.slice(-1);

    let svg = '<rect class="box-frame" x="50" y="50" width="200" height="200" rx="2"></rect>';
    state.words.forEach((w) => {
      svg += `<polyline class="box-line" points="${pathFor(w)}"></polyline>`;
    });
    if (state.current.length > 1) {
      svg += `<polyline class="box-line current" points="${pathFor(state.current)}"></polyline>`;
    }
    svg += '<line class="box-line current box-drag" style="display:none"></line>';
    p.sides.forEach((side, s) => {
      side.forEach((l, i) => {
        const [dx, dy] = dotPos(s, i);
        const [lx, ly] = labelPos(s, i);
        const [hx, hy] = hitPos(s, i);
        const cls = [used.has(l) ? "used" : "", inCurrent.has(l) ? "active" : "", l === last ? "last" : ""]
          .join(" ")
          .trim();
        svg += `<g class="box-letter ${cls}" data-letter="${l}" role="button" aria-label="${l}">
          <circle class="box-hit" cx="${hx}" cy="${hy}" r="24"></circle>
          <circle class="box-dot" cx="${dx}" cy="${dy}" r="8"></circle>
          <text class="box-label" x="${lx}" y="${ly}" dy="0.36em">${l.toUpperCase()}</text>
        </g>`;
      });
    });
    els.box.innerHTML = svg;

    els.current.innerHTML = state.current
      ? state.current.toUpperCase().split("").map((c) => `<span>${c}</span>`).join("")
      : '<span class="placeholder">Tap or slide across letters</span>';
    els.words.textContent = state.words.map((w) => w.toUpperCase()).join(" – ");
    els.par.textContent = state.solved
      ? `Solved in ${state.words.length} word${state.words.length === 1 ? "" : "s"} · par ${state.par}`
      : `Try to solve in ${state.par} words · ${used.size}/12 letters`;
  }

  // ---------- input ----------

  function nudge(message) {
    if (message) S.showToast(message);
    els.current.classList.add("shake");
    setTimeout(() => els.current.classList.remove("shake"), 400);
  }

  // Returns true if the letter was added. `quiet` skips the shake, for
  // letters a drag merely passes over.
  function addLetter(letter, quiet = false) {
    if (state.solved) return false;
    const sideOf = state.puzzle.sideOf;
    const last = state.current.slice(-1);
    if (!(letter in sideOf) || (last && sideOf[last] === sideOf[letter])) {
      if (!quiet) nudge();
      return false;
    }
    if (state.current.length >= 20) return false;
    ensureStarted();
    state.current += letter;
    render();
    persist();
    return true;
  }

  function deleteLetter() {
    if (state.solved) return;
    if (state.current.length > 1) {
      state.current = state.current.slice(0, -1);
    } else if (state.words.length) {
      // Deleting the carried-over first letter reopens the previous word.
      state.current = state.words.pop();
    } else {
      state.current = "";
    }
    render();
    persist();
  }

  function restart() {
    if (state.solved) return;
    state.words = [];
    state.current = "";
    render();
    persist();
  }

  function submitWord() {
    if (state.solved) return;
    const word = state.current;
    if (!word) return;
    if (word.length < 3) return nudge("Too short");
    if (!validSet(state.puzzle).has(word)) return nudge("Not a word");

    state.words.push(word);
    state.current = word.slice(-1);
    if (usedLetters().size === 12) {
      state.solved = true;
      state.current = "";
      state.activeMs = stopwatch.stop();
      els.timer.textContent = S.formatTimer(state.activeMs);
    }
    render();
    persist();
    if (state.solved) {
      if (state.mode === "daily") submitResult();
      setTimeout(showResult, 500);
    }
  }

  // ---------- tap + drag selection ----------
  // Press a letter to add it, then keep your finger / mouse button down and
  // glide over more letters to add them too. Letters on the same side as the
  // previous one are skipped silently while dragging, so sliding along an
  // edge doesn't pick up its neighbors.

  let drag = null; // { pointerId } while a press is in progress

  function toBoxCoords(e) {
    const pt = els.box.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    return pt.matrixTransform(els.box.getScreenCTM().inverse());
  }

  // Nearest letter to the pointer, measured against both the dot on the
  // edge and the label outside it, within `radius` viewBox units. Dots are
  // 50 units apart, so a slide from one letter to another can pass fairly
  // close to a third; moves use a tight radius (you have to actually cross
  // the dot or letter), while the initial press gets a generous one.
  const PRESS_RADIUS = 28;
  const SLIDE_RADIUS = 12;
  function letterAt(e, radius) {
    const { x, y } = toBoxCoords(e);
    let best = null;
    let bestDist = radius;
    state.puzzle.sides.forEach((side, s) => {
      side.forEach((l, i) => {
        const targets = radius > SLIDE_RADIUS ? [dotPos(s, i), hitPos(s, i), labelPos(s, i)] : [dotPos(s, i), labelPos(s, i)];
        for (const [px, py] of targets) {
          const d = Math.hypot(px - x, py - y);
          if (d < bestDist) {
            bestDist = d;
            best = l;
          }
        }
      });
    });
    return best;
  }

  function updateDragLine(e) {
    const line = els.box.querySelector(".box-drag");
    const last = state.current.slice(-1);
    if (!line || !last) return;
    const [x1, y1] = letterPos(last);
    const { x, y } = toBoxCoords(e);
    line.setAttribute("x1", x1);
    line.setAttribute("y1", y1);
    line.setAttribute("x2", x);
    line.setAttribute("y2", y);
    line.style.display = "";
  }

  function endDrag() {
    if (!drag) return;
    drag = null;
    const line = els.box.querySelector(".box-drag");
    if (line) line.style.display = "none";
  }

  els.box.addEventListener("pointerdown", (e) => {
    if (!state || !state.puzzle || state.solved) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    const letter = letterAt(e, PRESS_RADIUS);
    if (!letter) return;
    e.preventDefault();
    // Pressing the word's current last letter (e.g. the carried-over start
    // of the next word) just picks up the drag from there.
    if (letter !== state.current.slice(-1)) addLetter(letter);
    drag = { pointerId: e.pointerId };
    try {
      els.box.setPointerCapture(e.pointerId);
    } catch {
      // Capture isn't essential - moves still arrive while over the box.
    }
    updateDragLine(e);
  });

  els.box.addEventListener("pointermove", (e) => {
    if (!drag || e.pointerId !== drag.pointerId) return;
    const letter = letterAt(e, SLIDE_RADIUS);
    if (letter && letter !== state.current.slice(-1)) addLetter(letter, true);
    updateDragLine(e);
  });

  els.box.addEventListener("pointerup", endDrag);
  els.box.addEventListener("pointercancel", endDrag);
  els.box.addEventListener("lostpointercapture", endDrag);

  document.getElementById("boxed-delete").addEventListener("click", () => state.puzzle && deleteLetter());
  document.getElementById("boxed-restart").addEventListener("click", () => state.puzzle && restart());
  document.getElementById("boxed-enter").addEventListener("click", () => state.puzzle && submitWord());

  document.addEventListener("keydown", (e) => {
    if (!state || !state.puzzle || S.anyModalOpen()) return;
    if (!els.gate.classList.contains("hidden")) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === "Enter") {
      e.preventDefault();
      submitWord();
    } else if (e.key === "Backspace") {
      deleteLetter();
    } else if (/^[a-zA-Z]$/.test(e.key)) {
      addLetter(e.key.toLowerCase());
    }
  });

  // ---------- results ----------

  async function submitResult() {
    const name = S.getPlayerName();
    if (!name || state.submitted) return;
    try {
      await S.postJSON("/api/boxed/score", {
        name,
        date: state.date,
        words: state.words.length,
        timeMs: state.activeMs,
        par: state.par,
      });
      state.submitted = true;
      persist();
    } catch {
      // Offline or server down - retried next time the page loads.
    }
  }

  function stopCountdown() {
    clearInterval(countdownTimer);
    countdownTimer = null;
  }
  S.onModalClose("result-modal", stopCountdown);

  function showResult() {
    const n = state.words.length;
    const title =
      n <= 2 ? "Brilliant!" : n < state.par ? "Under par!" : n === state.par ? "Right on par!" : "Solved!";
    document.getElementById("result-title").textContent = title;
    document.getElementById("result-text").textContent = state.words.map((w) => w.toUpperCase()).join(" – ");
    const stat = (label, value) =>
      `<div class="result-stat"><span class="result-stat-label">${label}</span><span class="result-stat-value">${value}</span></div>`;
    document.getElementById("result-stats").innerHTML =
      stat("Words", `${n} <small>(par ${state.par})</small>`) + stat("Time", S.formatTimer(state.activeMs));
    document.getElementById("result-ours").textContent =
      `Our solution: ${state.puzzle.solution.map((w) => w.toUpperCase()).join(" – ")}`;

    const countdownEl = document.getElementById("result-countdown");
    const btn = document.getElementById("play-again-btn");
    stopCountdown();
    if (state.mode === "daily") {
      countdownEl.classList.remove("hidden");
      btn.classList.add("hidden");
      const tick = () => (countdownEl.textContent = S.formatCountdown(S.msUntilNextMidnight(), "box"));
      tick();
      countdownTimer = setInterval(tick, 30000);
    } else {
      countdownEl.classList.add("hidden");
      btn.classList.remove("hidden");
      btn.onclick = () => {
        S.closeModal("result-modal");
        startPractice(true);
      };
    }
    S.openModal("result-modal");
  }

  function showSolution(puzzle, title, yours) {
    document.getElementById("answers-title").textContent = title;
    document.getElementById("answers-sides").innerHTML = puzzle.sides
      .map((side) => `<span>${side.join("").toUpperCase()}</span>`)
      .join("");
    document.getElementById("answers-summary").textContent = "A two-word solution:";
    document.getElementById("answers-solution").textContent = puzzle.solution
      .map((w) => w.toUpperCase())
      .join(" – ");
    document.getElementById("answers-yours").textContent = yours;
    S.openModal("answers-modal");
  }

  els.extra.addEventListener("click", () => {
    if (!state || !state.puzzle) return;
    if (state.mode === "daily") {
      const yesterday = S.shiftDate(state.date, -1);
      const saved = S.load(KEYS.daily(yesterday)) || {};
      const yours = saved.solved
        ? `You solved it in ${saved.words.length}: ${saved.words.map((w) => w.toUpperCase()).join(" – ")}`
        : "";
      showSolution(buildPuzzle(`boxed:${yesterday}`), "Yesterday's Solution", yours);
    } else {
      showSolution(state.puzzle, "Solution", "");
    }
  });

  // Roll over to the new daily box if the page was left open past midnight.
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && state && state.mode === "daily" && state.date !== S.todayDateString()) {
      startDaily();
    }
  });

  // ---------- leaderboard ----------

  let lbView = "today";
  let lbData = null;

  function renderLeaderboard() {
    const content = document.getElementById("leaderboard-content");
    if (!lbData) return;
    const t = (ms) => (Number.isFinite(ms) ? S.formatTimer(ms) : "—");
    const e = S.escapeHtml;
    if (lbView === "today") {
      S.renderTable(
        content,
        lbData.today,
        [
          { label: "Player", value: (r) => e(r.name) },
          { label: "Words", value: (r) => r.words },
          { label: "Par", value: (r) => r.par ?? "—" },
          { label: "Time", value: (r) => t(r.timeMs) },
        ],
        "Nobody has solved today's box yet — be the first!"
      );
    } else {
      S.renderTable(
        content,
        lbData.overall,
        [
          { label: "Player", value: (r) => e(r.name) },
          { label: "Solved", value: (r) => r.solved },
          { label: "Avg Words", value: (r) => r.avgWords ?? "—" },
          { label: "Fewest", value: (r) => r.bestWords ?? "—" },
          { label: "2-Word", value: (r) => r.twoWordSolves },
          { label: "At/Under Par", value: (r) => r.parOrBetter },
          { label: "Best Time", value: (r) => t(r.bestTimeMs) },
          { label: "Streak", value: (r) => r.currentStreak },
          { label: "Best", value: (r) => r.maxStreak },
        ],
        "No solves yet — be the first!"
      );
    }
  }

  async function loadLeaderboard() {
    const content = document.getElementById("leaderboard-content");
    content.innerHTML = '<p class="lb-status">Loading…</p>';
    try {
      lbData = await S.getJSON(`/api/boxed/leaderboard?date=${S.todayDateString()}`);
      renderLeaderboard();
    } catch {
      content.innerHTML = '<p class="lb-status">Leaderboard unavailable right now.</p>';
    }
  }

  document.getElementById("leaderboard-btn").addEventListener("click", () => {
    S.openModal("leaderboard-modal");
    loadLeaderboard();
  });

  document.querySelectorAll(".lb-tab").forEach((btn) => {
    btn.addEventListener("click", () => {
      lbView = btn.dataset.lbView;
      document.querySelectorAll(".lb-tab").forEach((b) => b.classList.toggle("active", b === btn));
      renderLeaderboard();
    });
  });

  // ---------- wiring ----------

  document.getElementById("help-btn").addEventListener("click", () => S.openModal("help-modal"));

  document.querySelectorAll(".mode-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (state && btn.dataset.mode === state.mode) return;
      if (btn.dataset.mode === "daily") startDaily();
      else startPractice(false);
    });
  });

  els.newGame.addEventListener("click", () => {
    if (state && state.mode === "practice") startPractice(true);
  });

  S.initShell({
    onNameSaved() {
      if (state && state.mode === "daily" && !els.gate.classList.contains("hidden")) startDaily();
    },
  });
  S.wireNameGate(() => startDaily());

  let startMode = "daily";
  try {
    startMode = localStorage.getItem(KEYS.mode) === "practice" ? "practice" : "daily";
  } catch {
    // ignore
  }
  if (startMode === "practice") startPractice(false);
  else startDaily();
})();
