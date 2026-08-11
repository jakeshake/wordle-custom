(() => {
  "use strict";

  const THEMES = [
    { id: "dark", name: "Dark", swatch: "#538d4e" },
    { id: "light", name: "Light", swatch: "#6aaa64" },
    { id: "ocean", name: "Ocean", swatch: "#2ea8b8" },
    { id: "sunset", name: "Sunset", swatch: "#e0703f" },
    { id: "forest", name: "Forest", swatch: "#6fae4f" },
  ];

  const KEY_ROWS = [
    ["q", "w", "e", "r", "t", "y", "u", "i", "o", "p"],
    ["a", "s", "d", "f", "g", "h", "j", "k", "l"],
    ["enter", "z", "x", "c", "v", "b", "n", "m", "back"],
  ];

  const STORAGE_KEYS = {
    theme: "wordly:theme",
    length: "wordly:length",
  };

  /** @type {{length:number, answer:string, guesses:string[], current:string, maxGuesses:number, over:boolean, wordSet:Set<string>, keyStates:Map<string,string>}} */
  let state;

  const boardEl = document.getElementById("board");
  const keyboardEl = document.getElementById("keyboard");
  const toastContainer = document.getElementById("toast-container");

  function wordSetFor(length) {
    return new Set(WORDS[length]);
  }

  function pickAnswer(length) {
    const list = WORDS[length];
    return list[Math.floor(Math.random() * list.length)];
  }

  function maxGuessesFor(length) {
    return length + 1;
  }

  function startGame(length) {
    state = {
      length,
      answer: pickAnswer(length),
      guesses: [],
      current: "",
      maxGuesses: maxGuessesFor(length),
      over: false,
      wordSet: wordSetFor(length),
      keyStates: new Map(),
    };
    localStorage.setItem(STORAGE_KEYS.length, String(length));
    renderBoard();
    renderKeyboard();
    document.querySelectorAll(".len-btn").forEach((btn) => {
      btn.classList.toggle("active", Number(btn.dataset.len) === length);
    });
  }

  function renderBoard() {
    boardEl.innerHTML = "";
    boardEl.style.gridTemplateColumns = "1fr";
    boardEl.style.gridTemplateRows = `repeat(${state.maxGuesses}, 1fr)`;
    boardEl.style.display = "grid";

    for (let r = 0; r < state.maxGuesses; r++) {
      const row = document.createElement("div");
      row.className = "board-row";
      row.style.gridTemplateColumns = `repeat(${state.length}, 1fr)`;
      row.dataset.row = String(r);

      const guess = state.guesses[r];
      const isCurrentRow = r === state.guesses.length;
      const letters = guess
        ? guess.split("")
        : isCurrentRow
        ? state.current.split("")
        : [];

      for (let c = 0; c < state.length; c++) {
        const tile = document.createElement("div");
        tile.className = "tile";
        const letter = letters[c];
        if (letter) {
          tile.textContent = letter;
          tile.classList.add("filled");
        }
        if (guess) {
          const status = statusFor(guess, c);
          tile.classList.add(status);
        }
        row.appendChild(tile);
      }
      boardEl.appendChild(row);
    }
  }

  function statusFor(guess, index) {
    const letter = guess[index];
    if (state.answer[index] === letter) return "correct";
    if (state.answer.includes(letter)) return "present";
    return "absent";
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
    guess.split("").forEach((letter, i) => {
      const status = statusFor(guess, i);
      const prev = state.keyStates.get(letter);
      if (!prev || rank[status] > rank[prev]) {
        state.keyStates.set(letter, status);
      }
    });
  }

  function showToast(message) {
    const toast = document.createElement("div");
    toast.className = "toast";
    toast.textContent = message;
    toastContainer.appendChild(toast);
    setTimeout(() => toast.remove(), 1300);
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
    tiles.forEach((tile, i) => {
      setTimeout(() => {
        tile.classList.add("flip");
        setTimeout(() => {
          const status = statusFor(state.guesses[rowIndex], i);
          tile.classList.add(status);
        }, 250);
      }, i * 220);
    });
    const totalDelay = tiles.length * 220 + 500;
    setTimeout(() => {
      if (callback) callback();
    }, totalDelay);
  }

  function submitGuess() {
    if (state.over) return;
    const guess = state.current;
    if (guess.length !== state.length) {
      shakeCurrentRow();
      showToast("Not enough letters");
      return;
    }
    if (!state.wordSet.has(guess)) {
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
        const row = boardEl.querySelector(`[data-row="${rowIndex}"]`);
        if (row) row.classList.add("win");
        setTimeout(() => showResult(true), 400);
        return;
      }

      if (state.guesses.length >= state.maxGuesses) {
        state.over = true;
        setTimeout(() => showResult(false), 200);
      }
    });
  }

  function showResult(won) {
    const modal = document.getElementById("result-modal");
    const title = document.getElementById("result-title");
    const wordEl = document.getElementById("result-word");
    title.textContent = won
      ? ["Genius!", "Magnificent!", "Impressive!", "Splendid!", "Great!", "Phew!", "Nice!"][
          Math.min(state.guesses.length - 1, 6)
        ]
      : "So close!";
    wordEl.textContent = won
      ? `You got it in ${state.guesses.length} ${state.guesses.length === 1 ? "guess" : "guesses"}.`
      : `The word was ${state.answer.toUpperCase()}.`;
    openModal("result-modal");
  }

  function handleKeyInput(key) {
    if (state.over) return;
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
    if (!document.getElementById("help-modal").classList.contains("hidden")) return;
    if (!document.getElementById("theme-modal").classList.contains("hidden")) return;
    if (!document.getElementById("result-modal").classList.contains("hidden")) return;

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
      startGame(len);
    });
  });

  document.getElementById("new-game-btn").addEventListener("click", () => {
    startGame(state.length);
  });

  document.getElementById("play-again-btn").addEventListener("click", () => {
    closeModal("result-modal");
    startGame(state.length);
  });

  // ---- Modal helpers ----
  function openModal(id) {
    document.getElementById(id).classList.remove("hidden");
  }
  function closeModal(id) {
    document.getElementById(id).classList.add("hidden");
  }

  document.getElementById("help-btn").addEventListener("click", () => openModal("help-modal"));
  document.getElementById("theme-btn").addEventListener("click", () => openModal("theme-modal"));

  document.querySelectorAll("[data-close]").forEach((btn) => {
    btn.addEventListener("click", () => closeModal(btn.dataset.close));
  });

  document.querySelectorAll(".modal-overlay").forEach((overlay) => {
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) overlay.classList.add("hidden");
    });
  });

  // ---- Theme ----
  function applyTheme(themeId) {
    document.documentElement.setAttribute("data-theme", themeId);
    localStorage.setItem(STORAGE_KEYS.theme, themeId);
    renderThemeList(themeId);
  }

  function renderThemeList(activeId) {
    const list = document.getElementById("theme-list");
    list.innerHTML = "";
    THEMES.forEach((theme) => {
      const btn = document.createElement("button");
      btn.className = "theme-option" + (theme.id === activeId ? " active" : "");
      btn.innerHTML = `<span class="theme-swatch" style="background:${theme.swatch}"></span><span>${theme.name}</span>`;
      btn.addEventListener("click", () => applyTheme(theme.id));
      list.appendChild(btn);
    });
  }

  // ---- Init ----
  function init() {
    const savedTheme = localStorage.getItem(STORAGE_KEYS.theme);
    if (savedTheme && THEMES.some((t) => t.id === savedTheme)) {
      applyTheme(savedTheme);
    } else {
      renderThemeList(null);
    }

    const savedLength = Number(localStorage.getItem(STORAGE_KEYS.length));
    const startLength = savedLength === 6 ? 6 : 5;
    startGame(startLength);
  }

  init();
})();
