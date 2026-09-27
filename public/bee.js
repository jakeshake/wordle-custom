(() => {
  "use strict";

  const S = Shared;

  // NYT-style ranks as a fraction of the puzzle's total points.
  const RANKS = [
    ["Beginner", 0],
    ["Good Start", 0.02],
    ["Moving Up", 0.05],
    ["Good", 0.08],
    ["Solid", 0.15],
    ["Nice", 0.25],
    ["Great", 0.4],
    ["Amazing", 0.5],
    ["Genius", 0.7],
    ["Queen Bee", 1],
  ];
  const GENIUS = 8;
  const QUEEN = 9;

  // Daily hives are re-rolled until they land in this answer-count range,
  // so no day is a 6-word dud or a 150-word slog.
  const MIN_ANSWERS = 20;
  const MAX_ANSWERS = 70;

  const KEYS = {
    mode: "bee:mode",
    daily: (date) => `bee:daily:${date}`,
    practice: "bee:practice",
  };

  const WORDS = BEE_WORDS;
  const MASKS = WORDS.map(S.letterMask);

  const els = {
    game: document.getElementById("bee-game"),
    gate: document.getElementById("name-gate"),
    rankName: document.getElementById("bee-rank-name"),
    trackFill: document.getElementById("bee-track-fill"),
    trackDots: document.getElementById("bee-track-dots"),
    score: document.getElementById("bee-score"),
    timer: document.getElementById("bee-timer"),
    found: document.getElementById("bee-found"),
    foundSummary: document.getElementById("bee-found-summary"),
    foundPanel: document.getElementById("bee-found-panel"),
    input: document.getElementById("bee-input"),
    hive: document.getElementById("hive"),
    extra: document.getElementById("bee-extra"),
    newGame: document.getElementById("new-game-btn"),
  };

  let state = null;
  let stopwatch = null;
  let submitTimer = null;
  let countdownTimer = null;
  let lastPersistSecond = -1;

  // ---------- puzzle generation ----------

  let pangramSets = null;
  function getPangramSets() {
    if (pangramSets) return pangramSets;
    const seen = new Set();
    pangramSets = [];
    for (const m of MASKS) {
      if (S.bitCount(m) === 7 && !seen.has(m)) {
        seen.add(m);
        pangramSets.push(m);
      }
    }
    return pangramSets;
  }

  function lettersOf(mask) {
    const out = [];
    for (let i = 0; i < 26; i++) if (mask & (1 << i)) out.push(String.fromCharCode(97 + i));
    return out;
  }

  function buildPuzzle(seed) {
    const rand = S.seededRandom(seed);
    const sets = getPangramSets();
    let best = null;
    for (let attempt = 0; attempt < 400; attempt++) {
      const set = sets[Math.floor(rand() * sets.length)];
      const letters = lettersOf(set);
      const center = letters[Math.floor(rand() * letters.length)];
      const centerBit = 1 << (center.charCodeAt(0) - 97);
      const answers = [];
      for (let i = 0; i < WORDS.length; i++) {
        const m = MASKS[i];
        if (m & centerBit && (m & ~set) === 0) answers.push(WORDS[i]);
      }
      const candidate = { set, center, outer: letters.filter((l) => l !== center), answers };
      if (answers.length >= MIN_ANSWERS && answers.length <= MAX_ANSWERS) return finalize(candidate);
      if (!best || Math.abs(answers.length - 40) < Math.abs(best.answers.length - 40)) best = candidate;
    }
    return finalize(best);
  }

  function finalize(p) {
    p.answerSet = new Set(p.answers);
    p.pangrams = p.answers.filter((w) => S.letterMask(w) === p.set);
    p.maxScore = p.answers.reduce((sum, w) => sum + wordScore(w, p), 0);
    return p;
  }

  function isPangram(word, puzzle) {
    return S.letterMask(word) === puzzle.set;
  }

  function wordScore(word, puzzle) {
    return (word.length === 4 ? 1 : word.length) + (isPangram(word, puzzle) ? 7 : 0);
  }

  function threshold(pct, max) {
    return pct === 1 ? max : Math.round(pct * max);
  }

  function rankIndex(score, max) {
    let idx = 0;
    RANKS.forEach(([, pct], i) => {
      if (score >= threshold(pct, max)) idx = i;
    });
    return idx;
  }

  function currentScore() {
    return state.found.reduce((sum, w) => sum + wordScore(w, state.puzzle), 0);
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
    els.extra.textContent = mode === "daily" ? "Yesterday's answers" : "Reveal answers";
  }

  function teardown() {
    if (stopwatch && state && state.puzzle) {
      state.activeMs = stopwatch.stop();
      persist();
    }
    stopwatch = null;
    clearTimeout(submitTimer);
    submitTimer = null;
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
    const puzzle = buildPuzzle(`bee:${date}`);
    const saved = S.load(KEYS.daily(date)) || {};
    beginRound({
      mode: "daily",
      date,
      seed: `bee:${date}`,
      puzzle,
      saved,
    });
  }

  function startPractice(fresh) {
    teardown();
    setMode("practice");
    hideGate();
    const saved = (!fresh && S.load(KEYS.practice)) || {};
    const seed = saved.seed || `bee-practice:${Date.now()}:${Math.random()}`;
    beginRound({ mode: "practice", date: null, seed, puzzle: buildPuzzle(seed), saved: fresh ? {} : saved });
  }

  function beginRound({ mode, date, seed, puzzle, saved }) {
    state = {
      mode,
      date,
      seed,
      puzzle,
      outer: S.shuffle(puzzle.outer, S.seededRandom(seed + ":order")),
      found: (saved.found || []).filter((w) => puzzle.answerSet.has(w)),
      current: "",
      started: !!saved.started,
      activeMs: saved.activeMs || 0,
      geniusMs: Number.isFinite(saved.geniusMs) ? saved.geniusMs : null,
      submittedScore: Number.isFinite(saved.submittedScore) ? saved.submittedScore : -1,
    };
    stopwatch = S.createStopwatch(state.activeMs, onTick);
    renderAll();
    persist();
    const queen = currentScore() >= puzzle.maxScore;
    if (state.started && !queen) stopwatch.start();
    els.timer.textContent = S.formatTimer(state.activeMs);
    els.timer.classList.toggle("hidden", !state.started);
    if (mode === "daily" && state.found.length && currentScore() !== state.submittedScore) scheduleSubmit(true);
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
    if (!stopwatch.running && currentScore() < state.puzzle.maxScore) stopwatch.start();
  }

  function persist() {
    if (!state || !state.puzzle) return;
    const score = currentScore();
    const data = {
      found: state.found,
      started: state.started,
      activeMs: state.activeMs,
      geniusMs: state.geniusMs,
      submittedScore: state.submittedScore,
      score,
      maxScore: state.puzzle.maxScore,
      rank: RANKS[rankIndex(score, state.puzzle.maxScore)][0],
    };
    if (state.mode === "daily") S.save(KEYS.daily(state.date), data);
    else S.save(KEYS.practice, { seed: state.seed, ...data });
  }

  function showGate() {
    els.game.classList.add("hidden");
    els.gate.classList.remove("hidden");
    document.getElementById("gate-name-input").value = "";
  }

  function hideGate() {
    els.game.classList.remove("hidden");
    els.gate.classList.add("hidden");
  }

  // ---------- rendering ----------

  function renderAll() {
    renderHive();
    renderInput();
    renderRank();
    renderFound();
  }

  const HEX_R = 50;
  const HEX_H = Math.sqrt(3) * HEX_R;
  const SPREAD = 1.07;
  // top, upper-right, lower-right, bottom, lower-left, upper-left
  const OUTER_POS = [
    [0, -HEX_H],
    [1.5 * HEX_R, -HEX_H / 2],
    [1.5 * HEX_R, HEX_H / 2],
    [0, HEX_H],
    [-1.5 * HEX_R, HEX_H / 2],
    [-1.5 * HEX_R, -HEX_H / 2],
  ].map(([x, y]) => [x * SPREAD, y * SPREAD]);

  function hexPoints(cx, cy) {
    const pts = [];
    for (let i = 0; i < 6; i++) {
      const a = (Math.PI / 3) * i;
      pts.push(`${(cx + HEX_R * Math.cos(a)).toFixed(2)},${(cy + HEX_R * Math.sin(a)).toFixed(2)}`);
    }
    return pts.join(" ");
  }

  function hexCell(letter, x, y, isCenter) {
    return `<g class="hive-cell${isCenter ? " center" : ""}" data-letter="${letter}" role="button" aria-label="${letter}">
      <polygon points="${hexPoints(x, y)}"></polygon>
      <text x="${x}" y="${y}" dy="0.35em">${letter.toUpperCase()}</text>
    </g>`;
  }

  function renderHive() {
    let svg = hexCell(state.puzzle.center, 0, 0, true);
    state.outer.forEach((l, i) => {
      svg += hexCell(l, OUTER_POS[i][0], OUTER_POS[i][1], false);
    });
    els.hive.innerHTML = svg;
  }

  function renderInput() {
    const p = state.puzzle;
    els.input.innerHTML =
      state.current
        .split("")
        .map((ch) => {
          const cls = ch === p.center ? "center" : p.outer.includes(ch) ? "" : "bad";
          return `<span class="${cls}">${ch.toUpperCase()}</span>`;
        })
        .join("") + '<span class="bee-caret"></span>';
  }

  function renderRank() {
    const score = currentScore();
    const max = state.puzzle.maxScore;
    const idx = rankIndex(score, max);
    els.rankName.textContent = RANKS[idx][0];
    els.score.textContent = String(score);
    // Track runs Beginner..Genius like NYT; Queen Bee sits past the end.
    const shown = Math.min(idx, GENIUS);
    els.trackFill.style.width = `${(shown / GENIUS) * 100}%`;
    let dots = "";
    for (let i = 0; i <= GENIUS; i++) {
      dots += `<span class="bee-dot${i <= idx ? " done" : ""}${i === shown ? " current" : ""}"></span>`;
    }
    els.trackDots.innerHTML = dots;
  }

  function capitalize(w) {
    return w.charAt(0).toUpperCase() + w.slice(1);
  }

  function renderFound() {
    const n = state.found.length;
    const expanded = !els.foundPanel.classList.contains("hidden");
    if (expanded || n === 0) {
      els.foundSummary.textContent = `You have found ${n} word${n === 1 ? "" : "s"}`;
    } else {
      els.foundSummary.textContent = state.found.slice().reverse().map(capitalize).join("  ");
    }
    const sorted = state.found.slice().sort();
    els.foundPanel.innerHTML = n
      ? `<ul class="bee-found-list">${sorted
          .map((w) => `<li class="${isPangram(w, state.puzzle) ? "pangram" : ""}">${capitalize(w)}</li>`)
          .join("")}</ul>`
      : '<p class="lb-status">No words yet — start tapping letters!</p>';
  }

  // ---------- input ----------

  function addLetter(letter) {
    if (state.current.length >= 19) return;
    ensureStarted();
    state.current += letter;
    renderInput();
  }

  function deleteLetter() {
    state.current = state.current.slice(0, -1);
    renderInput();
  }

  function shuffleLetters() {
    els.hive.classList.add("shuffling");
    setTimeout(() => {
      state.outer = S.shuffle(state.outer);
      renderHive();
      els.hive.classList.remove("shuffling");
    }, 160);
  }

  function reject(message) {
    S.showToast(message);
    els.input.classList.add("shake");
    setTimeout(() => {
      els.input.classList.remove("shake");
      state.current = "";
      renderInput();
    }, 450);
  }

  function praise(word) {
    if (isPangram(word, state.puzzle)) return "Pangram!";
    if (word.length === 4) return "Good!";
    if (word.length === 5) return "Nice!";
    if (word.length === 6) return "Great!";
    return "Awesome!";
  }

  function submitWord() {
    const word = state.current;
    if (!word) return;
    const p = state.puzzle;
    if (word.length < 4) return reject("Too short");
    if (!word.includes(p.center)) return reject("Missing center letter");
    if ([...word].some((ch) => ch !== p.center && !p.outer.includes(ch))) return reject("Bad letters");
    if (state.found.includes(word)) return reject("Already found");
    if (!p.answerSet.has(word)) return reject("Not in word list");

    const before = rankIndex(currentScore(), p.maxScore);
    state.found.push(word);
    state.current = "";
    const pts = wordScore(word, p);
    S.showToast(`${praise(word)}  +${pts}`);
    const after = rankIndex(currentScore(), p.maxScore);

    renderInput();
    renderRank();
    renderFound();
    els.input.classList.add("accepted");
    setTimeout(() => els.input.classList.remove("accepted"), 300);

    if (after >= GENIUS && state.geniusMs === null) {
      state.geniusMs = stopwatch.current();
    }
    if (after === QUEEN) state.activeMs = stopwatch.stop();
    persist();
    scheduleSubmit(after !== before);

    if (after === QUEEN) setTimeout(() => showResult("queen"), 600);
    else if (after >= GENIUS && before < GENIUS) setTimeout(() => showResult("genius"), 600);
  }

  els.hive.addEventListener("click", (e) => {
    const cell = e.target.closest(".hive-cell");
    if (!cell || !state || !state.puzzle) return;
    cell.classList.add("pressed");
    setTimeout(() => cell.classList.remove("pressed"), 120);
    addLetter(cell.dataset.letter);
  });

  document.getElementById("bee-delete").addEventListener("click", () => state.puzzle && deleteLetter());
  document.getElementById("bee-shuffle").addEventListener("click", () => state.puzzle && shuffleLetters());
  document.getElementById("bee-enter").addEventListener("click", () => state.puzzle && submitWord());

  document.addEventListener("keydown", (e) => {
    if (!state || !state.puzzle || S.anyModalOpen()) return;
    if (!els.gate.classList.contains("hidden")) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === "Enter") {
      e.preventDefault();
      submitWord();
    } else if (e.key === "Backspace") {
      deleteLetter();
    } else if (e.key === " ") {
      e.preventDefault();
      shuffleLetters();
    } else if (/^[a-zA-Z]$/.test(e.key)) {
      addLetter(e.key.toLowerCase());
    }
  });

  els.found.addEventListener("click", () => {
    const willExpand = els.foundPanel.classList.contains("hidden");
    els.foundPanel.classList.toggle("hidden", !willExpand);
    els.found.setAttribute("aria-expanded", String(willExpand));
    els.game.classList.toggle("found-open", willExpand);
    renderFound();
  });

  // ---------- leaderboard submission ----------

  function scheduleSubmit(immediate) {
    if (!state || state.mode !== "daily") return;
    clearTimeout(submitTimer);
    submitTimer = setTimeout(() => submitScore(), immediate ? 0 : 2500);
  }

  async function submitScore({ keepalive = false } = {}) {
    submitTimer = null;
    if (!state || state.mode !== "daily" || !state.puzzle || !state.found.length) return;
    const name = S.getPlayerName();
    if (!name) return;
    const score = currentScore();
    if (score === state.submittedScore) return;
    try {
      await S.postJSON(
        "/api/bee/score",
        {
          name,
          date: state.date,
          score,
          maxScore: state.puzzle.maxScore,
          words: state.found.length,
          pangrams: state.found.filter((w) => isPangram(w, state.puzzle)).length,
          geniusMs: state.geniusMs,
        },
        { keepalive }
      );
      state.submittedScore = score;
      persist();
    } catch {
      // Offline, rate limited, or server down - try again shortly.
      if (!keepalive) submitTimer = setTimeout(() => submitScore(), 20000);
    }
  }

  window.addEventListener("pagehide", () => {
    if (state && state.puzzle && state.mode === "daily" && currentScore() !== state.submittedScore) {
      submitScore({ keepalive: true });
    }
  });

  // Roll over to the new daily hive if the page was left open past midnight.
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && state && state.mode === "daily" && state.date !== S.todayDateString()) {
      startDaily();
    }
  });

  // ---------- modals ----------

  function showRankings() {
    const score = currentScore();
    const max = state.puzzle.maxScore;
    const idx = rankIndex(score, max);
    document.getElementById("rank-list").innerHTML = RANKS.map(
      ([name, pct], i) =>
        `<li class="${i === idx ? "current" : i < idx ? "done" : ""}"><span>${name}</span><span>${threshold(pct, max)}</span></li>`
    )
      .reverse()
      .join("");
    const genius = state.geniusMs !== null ? ` Reached Genius in ${S.formatTimer(state.geniusMs)}.` : "";
    document.getElementById("rank-summary").textContent =
      `You have ${score} point${score === 1 ? "" : "s"} and ${state.found.length} word${state.found.length === 1 ? "" : "s"}.${genius}`;
    S.openModal("rank-modal");
  }

  function showAnswers(puzzle, found, title) {
    document.getElementById("answers-title").textContent = title;
    document.getElementById("answers-letters").innerHTML =
      `<span class="center">${puzzle.center.toUpperCase()}</span>` +
      puzzle.outer.map((l) => `<span>${l.toUpperCase()}</span>`).join("");
    const foundSet = new Set(found);
    document.getElementById("answers-summary").textContent =
      `${puzzle.answers.length} words · ${puzzle.maxScore} points · ${puzzle.pangrams.length} pangram${puzzle.pangrams.length === 1 ? "" : "s"}` +
      (found.length ? ` · you found ${found.length}` : "");
    document.getElementById("answers-list").innerHTML = puzzle.answers
      .map((w) => {
        const cls = [isPangram(w, puzzle) ? "pangram" : "", foundSet.has(w) ? "found" : ""].join(" ").trim();
        return `<li class="${cls}">${capitalize(w)}</li>`;
      })
      .join("");
    S.openModal("answers-modal");
  }

  els.extra.addEventListener("click", () => {
    if (!state || !state.puzzle) return;
    if (state.mode === "daily") {
      const yesterday = S.shiftDate(state.date, -1);
      const saved = S.load(KEYS.daily(yesterday)) || {};
      showAnswers(buildPuzzle(`bee:${yesterday}`), saved.found || [], "Yesterday's Answers");
    } else {
      showAnswers(state.puzzle, state.found, "All Answers");
    }
  });

  document.getElementById("bee-rank").addEventListener("click", () => state && state.puzzle && showRankings());

  function stopCountdown() {
    clearInterval(countdownTimer);
    countdownTimer = null;
  }
  S.onModalClose("result-modal", stopCountdown);

  function showResult(kind) {
    const titleEl = document.getElementById("result-title");
    const textEl = document.getElementById("result-text");
    const statsEl = document.getElementById("result-stats");
    const countdownEl = document.getElementById("result-countdown");
    const btn = document.getElementById("play-again-btn");
    const score = currentScore();

    const stat = (label, value) =>
      `<div class="result-stat"><span class="result-stat-label">${label}</span><span class="result-stat-value">${value}</span></div>`;
    statsEl.innerHTML =
      stat("Score", `${score} / ${state.puzzle.maxScore}`) +
      stat("Genius time", state.geniusMs !== null ? S.formatTimer(state.geniusMs) : "—");

    stopCountdown();
    if (kind === "genius") {
      titleEl.textContent = "Genius! 🐝";
      textEl.textContent = `You've reached Genius with ${state.found.length} words. Find them all for Queen Bee!`;
      countdownEl.classList.add("hidden");
      btn.classList.remove("hidden");
      btn.textContent = "Keep Playing";
      btn.onclick = () => S.closeModal("result-modal");
    } else {
      titleEl.textContent = "Queen Bee! 👑";
      textEl.textContent = `You found all ${state.puzzle.answers.length} words in ${S.formatTimer(state.activeMs)}.`;
      if (state.mode === "daily") {
        countdownEl.classList.remove("hidden");
        btn.classList.add("hidden");
        const tick = () => (countdownEl.textContent = S.formatCountdown(S.msUntilNextMidnight(), "hive"));
        tick();
        countdownTimer = setInterval(tick, 30000);
      } else {
        countdownEl.classList.add("hidden");
        btn.classList.remove("hidden");
        btn.textContent = "New Puzzle";
        btn.onclick = () => {
          S.closeModal("result-modal");
          startPractice(true);
        };
      }
    }
    S.openModal("result-modal");
  }

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
          { label: "Score", value: (r) => r.score },
          { label: "Rank", value: (r) => e(r.rank) },
          { label: "Words", value: (r) => r.words },
          { label: "Pangrams", value: (r) => r.pangrams },
          { label: "Genius Time", value: (r) => t(r.geniusMs) },
        ],
        "Nobody has played today's hive yet — be the first!"
      );
    } else {
      S.renderTable(
        content,
        lbData.overall,
        [
          { label: "Player", value: (r) => e(r.name) },
          { label: "Days", value: (r) => r.played },
          { label: "Avg %", value: (r) => `${r.avgPct}%` },
          { label: "Genius", value: (r) => r.geniusDays },
          { label: "Queen Bee", value: (r) => r.queenBeeDays },
          { label: "Pangrams", value: (r) => r.pangrams },
          { label: "Streak", value: (r) => r.currentStreak },
          { label: "Best", value: (r) => r.maxStreak },
          { label: "Best Genius", value: (r) => t(r.bestGeniusMs) },
        ],
        "No games played yet — be the first!"
      );
    }
  }

  async function loadLeaderboard() {
    const content = document.getElementById("leaderboard-content");
    content.innerHTML = '<p class="lb-status">Loading…</p>';
    try {
      lbData = await S.getJSON(`/api/bee/leaderboard?date=${S.todayDateString()}`);
      renderLeaderboard();
    } catch {
      content.innerHTML = '<p class="lb-status">Leaderboard unavailable right now.</p>';
    }
  }

  document.getElementById("leaderboard-btn").addEventListener("click", () => {
    S.openModal("leaderboard-modal");
    if (state && state.mode === "daily" && state.puzzle && currentScore() !== state.submittedScore) {
      submitScore().finally(loadLeaderboard);
    } else {
      loadLeaderboard();
    }
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
