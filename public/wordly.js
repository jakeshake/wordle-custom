(() => {
  "use strict";

  const {
    todayDateString,
    hashString,
    msUntilNextMidnight,
    formatTimer,
    getPlayerName,
    setPlayerName,
    showToast,
    openModal,
    closeModal,
    escapeHtml,
  } = Shared;

  const KEY_ROWS = [
    ["q", "w", "e", "r", "t", "y", "u", "i", "o", "p"],
    ["a", "s", "d", "f", "g", "h", "j", "k", "l"],
    ["enter", "z", "x", "c", "v", "b", "n", "m", "back"],
  ];

  const STORAGE_KEYS = {
    length: "wordly:length",
    mode: "wordly:mode",
    daily: (length, date) => `wordly:daily:${length}:${date}`,
  };

  /** @type {{mode:string, length:number, answer:string, guesses:string[], current:string, maxGuesses:number, over:boolean, won:boolean, date:string, submitted:boolean, startedAt:number|null, completedAt:number|null, luck:number|null, guessSet:Set<string>, keyStates:Map<string,string>}} */
  let state;
  let countdownTimer = null;
  let liveTimerInterval = null;

  const boardEl = document.getElementById("board");
  const keyboardEl = document.getElementById("keyboard");
  const nameGateEl = document.getElementById("name-gate");
  const dailyTimerEl = document.getElementById("daily-timer");

  // ---------- word helpers ----------

  function guessSetFor(length) {
    return new Set(GUESSES[length]);
  }

  function maxGuessesFor(length) {
    return length + 1;
  }

  function wordOfDay(length, dateStr) {
    const pool = ANSWERS[length];
    const seed = hashString(`${dateStr}:${length}`);
    return pool[seed % pool.length];
  }

  function pickPracticeAnswer(length) {
    const pool = ANSWERS[length];
    return pool[Math.floor(Math.random() * pool.length)];
  }

  function formatCountdown(ms) {
    return Shared.formatCountdown(ms, "word");
  }

  function luckLabel(score) {
    if (score >= 81) return "Incredibly Lucky";
    if (score >= 51) return "Lucky";
    if (score >= 21) return "Solid";
    return "All Skill";
  }

  // ---------- daily persistence ----------

  function loadDailyState(length, date) {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.daily(length, date));
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  function saveDailyState(length, date, data) {
    localStorage.setItem(STORAGE_KEYS.daily(length, date), JSON.stringify(data));
  }

  // ---------- game lifecycle ----------

  function startDaily(length) {
    const date = todayDateString();
    state = { mode: "daily", length, date };
    localStorage.setItem(STORAGE_KEYS.length, String(length));
    localStorage.setItem(STORAGE_KEYS.mode, "daily");
    syncHeaderButtons();

    const name = getPlayerName();
    if (!name) {
      showNameGate();
      return;
    }
    hideNameGate();

    const answer = wordOfDay(length, date);
    const saved = loadDailyState(length, date);

    state = {
      mode: "daily",
      length,
      date,
      answer,
      guesses: saved ? saved.guesses : [],
      current: "",
      maxGuesses: maxGuessesFor(length),
      over: saved ? saved.over : false,
      won: saved ? saved.won : false,
      submitted: saved ? !!saved.submitted : false,
      startedAt: saved ? saved.startedAt || null : null,
      completedAt: saved ? saved.completedAt || null : null,
      luck: saved ? saved.luck ?? null : null,
      guessSet: guessSetFor(length),
      keyStates: new Map(),
    };

    state.guesses.forEach(updateKeyStates);
    renderBoard();
    renderKeyboard();
    syncHeaderButtons();

    if (state.over) {
      stopLiveTimer();
      showResult(state.won);
    } else if (state.startedAt) {
      startLiveTimer();
    } else {
      stopLiveTimer();
    }
  }

  function startPractice(length) {
    hideNameGate();
    stopLiveTimer();
    state = {
      mode: "practice",
      length,
      date: null,
      answer: pickPracticeAnswer(length),
      guesses: [],
      current: "",
      maxGuesses: maxGuessesFor(length),
      over: false,
      won: false,
      submitted: true,
      guessSet: guessSetFor(length),
      keyStates: new Map(),
    };
    localStorage.setItem(STORAGE_KEYS.length, String(length));
    localStorage.setItem(STORAGE_KEYS.mode, "practice");
    renderBoard();
    renderKeyboard();
    syncHeaderButtons();
  }

  function startGame(mode, length) {
    if (mode === "daily") startDaily(length);
    else startPractice(length);
  }

  function syncHeaderButtons() {
    document.querySelectorAll(".len-btn").forEach((btn) => {
      btn.classList.toggle("active", Number(btn.dataset.len) === state.length);
    });
    document.querySelectorAll(".mode-btn").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.mode === state.mode);
    });
    const newGameBtn = document.getElementById("new-game-btn");
    newGameBtn.style.visibility = state.mode === "practice" ? "visible" : "hidden";
  }

  function showNameGate() {
    boardEl.classList.add("hidden");
    keyboardEl.parentElement.classList.add("hidden");
    nameGateEl.classList.remove("hidden");
    document.getElementById("gate-name-input").value = "";
  }

  function hideNameGate() {
    boardEl.classList.remove("hidden");
    keyboardEl.parentElement.classList.remove("hidden");
    nameGateEl.classList.add("hidden");
  }

  // ---------- rendering ----------

  function renderBoard() {
    boardEl.innerHTML = "";
    boardEl.style.gridTemplateColumns = "1fr";
    boardEl.style.gridAutoRows = "max-content"; /* Grid auto row fix */
    boardEl.style.display = "grid";

    for (let r = 0; r < state.maxGuesses; r++) {
      const row = document.createElement("div");
      row.className = "board-row";
      row.style.gridTemplateColumns = `repeat(${state.length}, minmax(0, 1fr))`;
      row.dataset.row = String(r);

      const guess = state.guesses[r];
      const isCurrentRow = r === state.guesses.length;
      const isPendingRow = !guess && !isCurrentRow;
      if (isPendingRow) {
        row.classList.add("row-pending");
      }
      const letters = guess
        ? guess.split("")
        : isCurrentRow
        ? state.current.split("")
        : [];

      const pattern = guess ? getPattern(guess, state.answer) : null;

      for (let c = 0; c < state.length; c++) {
        const tile = document.createElement("div");
        tile.className = "tile";
        const letter = letters[c];
        if (letter) {
          tile.textContent = letter;
          tile.classList.add("filled");
        }
        if (pattern) {
          tile.classList.add(pattern[c]);
        }
        row.appendChild(tile);
      }
      boardEl.appendChild(row);
    }
  }

  function getPattern(guess, target) {
    const length = guess.length;
    const result = new Array(length).fill("absent");
    const counts = {};
    for (const letter of target) counts[letter] = (counts[letter] || 0) + 1;

    for (let i = 0; i < length; i++) {
      if (guess[i] === target[i]) {
        result[i] = "correct";
        counts[guess[i]]--;
      }
    }
    for (let i = 0; i < length; i++) {
      if (result[i] === "correct") continue;
      const letter = guess[i];
      if (counts[letter] > 0) {
        result[i] = "present";
        counts[letter]--;
      }
    }
    return result;
  }

  function computeLuck() {
    const priorGuesses = state.guesses.slice(0, -1);
    let candidates = ANSWERS[state.length];
    for (const g of priorGuesses) {
      const observed = getPattern(g, state.answer);
      candidates = candidates.filter((word) => {
        const pattern = getPattern(g, word);
        return pattern.every((s, i) => s === observed[i]);
      });
    }
    const remaining = candidates.length;
    if (remaining <= 1) return 0;
    return Math.min(100, Math.round((1 - 1 / remaining) * 100));
  }

  function renderKeyboard() {
    keyboardEl.innerHTML = "";
    KEY_ROWS.forEach((row) => {
      const rowEl = document.createElement("div");
      rowEl.className = "keyboard-row";
      row.forEach((key) => {
        const btn = document.createElement("button");
        btn.className = "key";
        btn.dataset.key = key;
        if (key === "enter" || key === "back") {
          btn.classList.add("wide");
          btn.textContent = key === "enter" ? "Enter" : "⌫";
        } else {
          btn.textContent = key;
          const st = state.keyStates.get(key);
          if (st) btn.classList.add(st);
        }
        rowEl.appendChild(btn);
      });
      keyboardEl.appendChild(rowEl);
    });
  }

  function updateKeyStates(guess) {
    const rank = { absent: 0, present: 1, correct: 2 };
    const pattern = getPattern(guess, state.answer);
    guess.split("").forEach((letter, i) => {
      const status = pattern[i];
      const prev = state.keyStates.get(letter);
      if (!prev || rank[status] > rank[prev]) {
        state.keyStates.set(letter, status);
      }
    });
  }

  function shakeCurrentRow() {
    const row = boardEl.querySelector(`[data-row="${state.guesses.length}"]`);
    if (!row) return;
    row.classList.add("shake");
    setTimeout(() => row.classList.remove("shake"), 400);
  }

  function flipRow(rowIndex, callback) {
    const row = boardEl.querySelector(`[data-row="${rowIndex}"]`);
    if (!row) return callback && callback();
    const tiles = row.querySelectorAll(".tile");
    const pattern = getPattern(state.guesses[rowIndex], state.answer);
    tiles.forEach((tile, i) => {
      setTimeout(() => {
        tile.classList.add("flip");
        setTimeout(() => {
          tile.classList.add(pattern[i]);
        }, 250);
      }, i * 220);
    });
    const totalDelay = tiles.length * 220 + 500;
    setTimeout(() => {
      if (callback) callback();
    }, totalDelay);
  }

  function persistDailyProgress() {
    if (state.mode !== "daily") return;
    saveDailyState(state.length, state.date, {
      guesses: state.guesses,
      over: state.over,
      won: state.won,
      submitted: state.submitted,
      startedAt: state.startedAt,
      completedAt: state.completedAt,
      luck: state.luck,
    });
  }

  function stopLiveTimer() {
    if (liveTimerInterval) {
      clearInterval(liveTimerInterval);
      liveTimerInterval = null;
    }
    dailyTimerEl.classList.add("hidden");
  }

  function startLiveTimer() {
    stopLiveTimer();
    dailyTimerEl.classList.remove("hidden");
    const tick = () => {
      dailyTimerEl.textContent = formatTimer(Date.now() - state.startedAt);
    };
    tick();
    liveTimerInterval = setInterval(tick, 250);
  }

  function submitGuess() {
    if (state.over) return;
    const guess = state.current;
    if (guess.length !== state.length) {
      shakeCurrentRow();
      showToast("Not enough letters");
      return;
    }
    if (!state.guessSet.has(guess)) {
      shakeCurrentRow();
      showToast("Not in word list");
      return;
    }

    const rowIndex = state.guesses.length;
    state.guesses.push(guess);
    state.current = "";
    renderBoard();

    flipRow(rowIndex, () => {
      updateKeyStates(guess);
      renderKeyboard();

      if (guess === state.answer) {
        state.over = true;
        state.won = true;
        if (state.mode === "daily") {
          state.completedAt = Date.now();
          state.luck = computeLuck();
          stopLiveTimer();
        }
        persistDailyProgress();
        const row = boardEl.querySelector(`[data-row="${rowIndex}"]`);
        if (row) row.classList.add("win");
        setTimeout(() => showResult(true), 400);
        return;
      }

      if (state.guesses.length >= state.maxGuesses) {
        state.over = true;
        state.won = false;
        if (state.mode === "daily") {
          state.completedAt = Date.now();
          stopLiveTimer();
        }
        persistDailyProgress();
        setTimeout(() => showResult(false), 200);
        return;
      }

      persistDailyProgress();
    });
  }

  async function reportDailyResult() {
    if (state.mode !== "daily" || state.submitted) return;
    const name = getPlayerName();
    if (!name) return;
    try {
      const res = await fetch("/api/score", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          length: state.length,
          date: state.date,
          won: state.won,
          guesses: state.won ? state.guesses.length : null,
          timeMs: state.won && state.startedAt && state.completedAt
            ? state.completedAt - state.startedAt
            : null,
          luck: state.won ? state.luck : null,
        }),
      });
      if (!res.ok) throw new Error("bad response");
      state.submitted = true;
      persistDailyProgress();
    } catch {
      // Offline or backend unavailable
    }
  }

  function stopCountdown() {
    if (countdownTimer) {
      clearInterval(countdownTimer);
      countdownTimer = null;
    }
  }

  function showResult(won) {
    if (state.mode === "daily") reportDailyResult();

    const title = document.getElementById("result-title");
    const wordEl = document.getElementById("result-word");
    const countdownEl = document.getElementById("result-countdown");
    const playAgainBtn = document.getElementById("play-again-btn");
    const statsEl = document.getElementById("result-stats");
    const timeEl = document.getElementById("result-time");
    const luckEl = document.getElementById("result-luck");

    title.textContent = won
      ? ["Genius!", "Magnificent!", "Impressive!", "Splendid!", "Great!", "Phew!", "Nice!"][
          Math.min(state.guesses.length - 1, 6)
        ]
      : "So close!";
    wordEl.textContent = won
      ? `You got it in ${state.guesses.length} ${state.guesses.length === 1 ? "guess" : "guesses"}.`
      : `The word was ${state.answer.toUpperCase()}.`;

    const hasTime = won && state.mode === "daily" && state.startedAt && state.completedAt;
    const hasLuck = won && state.mode === "daily" && Number.isInteger(state.luck);
    if (hasTime || hasLuck) {
      statsEl.classList.remove("hidden");
      timeEl.textContent = hasTime ? formatTimer(state.completedAt - state.startedAt) : "—";
      luckEl.textContent = hasLuck ? `${state.luck} · ${luckLabel(state.luck)}` : "—";
    } else {
      statsEl.classList.add("hidden");
    }

    if (state.mode === "daily") {
      countdownEl.classList.remove("hidden");
      playAgainBtn.classList.add("hidden");
      stopCountdown();
      const tick = () => {
        countdownEl.textContent = formatCountdown(msUntilNextMidnight());
      };
      tick();
      countdownTimer = setInterval(tick, 30000);
    } else {
      countdownEl.classList.add("hidden");
      playAgainBtn.classList.remove("hidden");
    }

    openModal("result-modal");
  }

  function handleKeyInput(key) {
    if (state.over) return;
    if (state.mode === "daily" && !state.startedAt) {
      state.startedAt = Date.now();
      persistDailyProgress();
      startLiveTimer();
    }
    if (key === "enter") {
      submitGuess();
    } else if (key === "back") {
      state.current = state.current.slice(0, -1);
      renderBoard();
    } else if (/^[a-z]$/.test(key) && state.current.length < state.length) {
      state.current += key;
      renderBoard();
      const row = boardEl.querySelector(`[data-row="${state.guesses.length}"]`);
      if (row) {
        const tiles = row.querySelectorAll(".tile");
        const last = tiles[state.current.length - 1];
        if (last) {
          last.classList.add("pop");
          setTimeout(() => last.classList.remove("pop"), 100);
        }
      }
    }
  }

  keyboardEl.addEventListener("click", (e) => {
    const btn = e.target.closest(".key");
    if (!btn) return;
    handleKeyInput(btn.dataset.key);
  });

  document.addEventListener("keydown", (e) => {
    const openOverlay = document.querySelector(".modal-overlay:not(.hidden)");
    if (openOverlay) return;
    if (!nameGateEl.classList.contains("hidden")) return;

    if (e.key === "Enter") {
      handleKeyInput("enter");
    } else if (e.key === "Backspace") {
      handleKeyInput("back");
    } else if (/^[a-zA-Z]$/.test(e.key)) {
      handleKeyInput(e.key.toLowerCase());
    }
  });

  document.querySelectorAll(".len-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const len = Number(btn.dataset.len);
      if (state && len === state.length) return;
      startGame(state ? state.mode : "daily", len);
    });
  });

  document.querySelectorAll(".mode-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const mode = btn.dataset.mode;
      if (state && mode === state.mode) return;
      startGame(mode, state ? state.length : 5);
    });
  });

  document.getElementById("new-game-btn").addEventListener("click", () => {
    if (state.mode === "practice") startPractice(state.length);
  });

  document.getElementById("play-again-btn").addEventListener("click", () => {
    closeModal("result-modal");
    if (state.mode === "practice") startPractice(state.length);
  });

  // ---- Shell (theme, player name, modals) ----
  Shared.initShell({
    onNameSaved() {
      if (state && state.mode === "daily" && !nameGateEl.classList.contains("hidden")) {
        startDaily(state.length);
      }
    },
  });
  Shared.onModalClose("result-modal", stopCountdown);

  document.getElementById("help-btn").addEventListener("click", () => openModal("help-modal"));

  document.getElementById("gate-name-btn").addEventListener("click", () => {
    const input = document.getElementById("gate-name-input");
    const name = input.value.trim();
    if (!name) {
      input.focus();
      return;
    }
    setPlayerName(name);
    startDaily(state ? state.length : 5);
  });

  document.getElementById("gate-name-input").addEventListener("keydown", (e) => {
    if (e.key === "Enter") document.getElementById("gate-name-btn").click();
  });

  // ---- Leaderboard ----
  let activeLbLen = 5;

  function renderLeaderboard(rows) {
    const content = document.getElementById("leaderboard-content");
    if (!rows.length) {
      content.innerHTML = '<p class="lb-status">No games played yet — be the first!</p>';
      return;
    }
    const table = document.createElement("table");
    table.className = "lb-table";
    table.innerHTML = `
      <thead>
        <tr>
          <th>Player</th><th>Played</th><th>Win %</th><th>Streak</th><th>Best</th>
          <th>Avg Guesses</th><th>Best Time</th><th>Avg Luck</th>
        </tr>
      </thead>
      <tbody>
        ${rows
          .map(
            (r) => `
          <tr>
            <td>${escapeHtml(r.name)}</td>
            <td>${r.played}</td>
            <td>${r.winPct}%</td>
            <td>${r.currentStreak}</td>
            <td>${r.maxStreak}</td>
            <td>${r.avgGuesses ?? "—"}</td>
            <td>${Number.isFinite(r.bestTimeMs) ? formatTimer(r.bestTimeMs) : "—"}</td>
            <td>${Number.isFinite(r.avgLuck) ? r.avgLuck : "—"}</td>
          </tr>`
          )
          .join("")}
      </tbody>`;
    content.innerHTML = "";
    content.appendChild(table);
  }

  async function loadLeaderboard(length) {
    const content = document.getElementById("leaderboard-content");
    content.innerHTML = '<p class="lb-status">Loading…</p>';
    try {
      const res = await fetch(`/api/leaderboard?length=${length}`);
      if (!res.ok) throw new Error("bad response");
      const rows = await res.json();
      renderLeaderboard(rows);
    } catch {
      content.innerHTML = '<p class="lb-status">Leaderboard unavailable right now.</p>';
    }
  }

  document.getElementById("leaderboard-btn").addEventListener("click", () => {
    openModal("leaderboard-modal");
    loadLeaderboard(activeLbLen);
  });

  document.querySelectorAll(".lb-tab").forEach((btn) => {
    btn.addEventListener("click", () => {
      activeLbLen = Number(btn.dataset.lbLen);
      document.querySelectorAll(".lb-tab").forEach((b) => b.classList.toggle("active", b === btn));
      loadLeaderboard(activeLbLen);
    });
  });

  // ---- Init ----
  function init() {
    const savedLength = Number(localStorage.getItem(STORAGE_KEYS.length));
    const startLength = savedLength === 6 ? 6 : 5;
    const savedMode = localStorage.getItem(STORAGE_KEYS.mode);
    const startMode = savedMode === "practice" ? "practice" : "daily";

    startGame(startMode, startLength);
  }

  init();
})();
