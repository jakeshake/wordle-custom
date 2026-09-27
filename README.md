# Wordly

A small, self-hosted word-game collection: a clean, mobile-friendly Wordle clone plus Spelling Bee and Letter Boxed style games. The home page (`/`) is a game menu showing today's progress in each game, and every game shares the same themes, player name, and leaderboard backend.

## Games

### Wordly (`/wordly`)

- **5 or 6 letter mode** — toggle in the header, adjusts guess count (6 tries for 5-letter, 7 for 6-letter, matching Wordle's own word-length + 1 convention).
- **Daily Challenge** — everyone gets the same word each day (per length), computed deterministically from the date so it resets automatically at local midnight, same as real Wordle. No server round-trip needed to pick it.
- **Practice mode** — unlimited random-word games, doesn't touch the leaderboard.
- **Leaderboard** — games played, win %, current streak, best streak, average guesses, best time, and average luck, separately for 5- and 6-letter.
- **Speed timer** — starts on your first keystroke each Daily game, shown live above the board, recorded on completion, and tracked on the leaderboard as each player's best time.
- **Luck rating** — on a win, shows how many answer-pool words were still possible right before your winning guess. Solve it in few guesses despite a wide-open field and you'll score high on luck; narrow it down methodically and you'll score low ("All Skill"). Averaged per player on the leaderboard.
- A **huge valid-word dictionary** (8,645 five-letter / 15,232 six-letter words) so common guesses never get rejected, while the daily/practice *answer* always comes from a smaller curated common-word list (2,315 / 1,233 words) so the puzzle itself stays fair and guessable.

### Spelling Bee (`/bee`)

- Make words from a 7-letter hive; every word needs the center letter and at least 4 letters. NYT scoring: 1 point for 4-letter words, 1 per letter above that, +7 for a **pangram** (uses all 7 letters).
- Ranks from Beginner to **Genius** (70%) and **Queen Bee** (every word). Tap the rank bar for the thresholds.
- **Daily** hive shared by everyone (resets at midnight), re-rolled until it has 20–70 answers so no day is a dud; **Practice** for unlimited random hives, with a "Reveal answers" button.
- **Yesterday's answers**, with the words you found ticked off.
- **Time to Genius** — an active-play clock that pauses when the tab isn't visible.
- **Leaderboard**: *Today* (score, rank, words, pangrams, Genius time) and *All-time* (days played, average % of max, Genius days, Queen Bee days, pangrams, streak, best Genius time). Scores submit as you play (debounced).
- Keyboard: type letters, Enter, Backspace, Space to shuffle.

### Letter Boxed (`/boxed`)

- 12 letters, 3 per side of a square. Words chain end-to-start, consecutive letters must come from different sides, and the goal is to use all 12 letters in as few words as possible.
- Each daily box is generated around a real two-word solution from common words, so a 2-word solve is always possible. A **par** (4–6 words) is set based on how many 2-word solutions exist.
- Delete past the start of a word to reopen the previous one (NYT behavior); Restart clears everything.
- **Daily** + **Practice** modes, **yesterday's solution**, and an active-play timer.
- **Leaderboard**: *Today* (words, par, time — fewer words wins, time breaks ties) and *All-time* (solves, average words, fewest words, 2-word solves, at/under-par solves, best time, streaks). First solve of the day counts.

### Shared

- **15 themes** — Dark, Light, Standard Neon, Neon City, Synthwave, Bubblegum 3D, Ocean, Sunset, Forest, Halloween, Christmas, Neon 80s, Spooky, Retro Terminal, Bubblegum — picked from the palette button on any page, saved across visits and games.
- **Player name** (no password) set once, used by every game's leaderboard.

## Architecture

Frontend is plain HTML/CSS/JS (`public/`), no build step, no framework. It's paired with a small zero-dependency Node backend (`server.js`, built-in `http`/`fs` only — no `npm install`, no `package.json`) that does two things:

1. Serves the static frontend (gzip-compressed for text assets, with clean URLs like `/bee` → `bee.html`).
2. Stores and aggregates leaderboard scores as JSON files in the data directory (`scores.json` for Wordly, `bee.json`, `boxed.json`), so results submitted from any device/browser are visible to everyone.

Shared frontend code (themes, player name, modals, dates, seeded RNG, stopwatch) lives in `public/common.js`; each game has its own `*.html` + `*.js`, with Spelling Bee / Letter Boxed styles in `public/games.css`.

### Rate limiting

The API is rate limited per client IP with fixed one-minute windows: **30 score submissions/minute** and **120 leaderboard reads/minute** by default (override with `RATE_LIMIT_WRITES` / `RATE_LIMIT_READS` env vars). Over the limit returns `429` with a `Retry-After` header; the games quietly retry later.

If you put the container behind a reverse proxy (Nginx Proxy Manager, SWAG, Traefik…), set `TRUST_PROXY=1` so limits key on the real client IP from `X-Forwarded-For` rather than the proxy's address. Leave it unset when clients connect directly, so nobody can spoof the header.

The daily word itself is **not** served by the backend — it's derived client-side from a deterministic hash of the local date, so it needs no network call and stays in sync across devices without any server coordination. (This does mean the word technically sits in the page's JS if someone opens dev tools — there's no server-side anti-cheat. Fine for a friendly household leaderboard; don't peek at `words.js` before you've guessed.)

Score submissions are trusted from the client (no server-side guess verification) — again, appropriate for a private 2-person leaderboard, not a public competitive one.

## Running it locally

You need Node.js (any reasonably recent version) to run the full app with the leaderboard:

```bash
node server.js
```

Visit `http://localhost` (or set `PORT`/`DATA_DIR` env vars, e.g. `PORT=5173 node server.js`).

To preview just the frontend without Node (leaderboard calls will fail gracefully, everything else works), serve `public/` with any static file server, e.g. the bundled zero-dependency PowerShell server for Windows machines without Python/Node:

```powershell
powershell -File .devserver/serve.ps1 -Port 5173
```

## Docker / Unraid

A `Dockerfile` (Node 20 alpine) and a GitHub Actions workflow (`.github/workflows/docker-publish.yml`) are included. Every push to `main` builds, smoke-tests, and publishes a multi-arch image to GitHub Container Registry at:

```
ghcr.io/<your-github-username>/wordle-custom:latest
```

To run it on Unraid:

1. **Docker tab → Add Container.**
2. **Repository**: `ghcr.io/<your-github-username>/wordle-custom:latest`
3. **Port**: map container port `80` to whatever host port you want (e.g. `8080`).
4. **Path**: map container path `/data` to a host appdata folder (e.g. `/mnt/user/appdata/wordly`) — **this is what makes the leaderboard persist** across container restarts/updates. Without it, scores reset every time the container is recreated.
5. Apply — Unraid pulls the image and starts it. Visit `http://<unraid-ip>:8080`.

If the GHCR package is private, Unraid needs a registry login first (Docker tab → gear icon → add a registry with a GitHub personal access token that has `read:packages` scope). Making the repo/package public avoids this.

To build and run locally instead (no GHCR):

```bash
docker build -t wordly .
docker run -p 8080:80 -v wordly-data:/data wordly
```

## Dictionary

Spelling Bee and Letter Boxed word lists (`public/words-bee.js`, `public/words-boxed.js`) are generated by `tools/build_words.py` from the ENABLE list, filtered by word frequency ([wordfreq](https://pypi.org/project/wordfreq/)) and an offensive-word blocklist:

- **Spelling Bee answers** (~12.8k): common words only (like NYT, no obscure Scrabble words), no words containing S (the hive never uses S, which keeps plurals out, same as NYT).
- **Letter Boxed valid words** (~131k): the full ENABLE list minus words with doubled letters (impossible to play). Solutions for generated puzzles come from a ~12k common-word subset.

Re-run with `pip install wordfreq && python3 tools/build_words.py`.

Wordly:

- **Valid guesses** (`GUESSES[5]`, `GUESSES[6]` in `public/words.js`): a large Scrabble-style word-game dictionary (ENABLE word list), ~8.6k five-letter and ~15.2k six-letter words. This is what guesses are checked against, so legitimate everyday words are essentially never rejected.
- **Possible answers** (`ANSWERS[5]`, `ANSWERS[6]`): the curated common-word lists from the original build — the real 2,314-word Wordle answer list for 5 letters, and a manually-screened ~1,233-word list for 6 letters. Daily and Practice answers are always picked from here, so the puzzle stays solvable/fair. `ANSWERS` is a subset of `GUESSES`, guaranteed at build time.

## Customizing

- **Add a theme**: add a `[data-theme="yourname"]` block in `public/style.css` with the same CSS custom properties as the existing themes, then add `{ id, name, swatch }` to the `THEMES` array at the top of `public/common.js`. Optionally set `--bee-center` / `--bee-center-text` if the theme's `--color-present` doesn't stand out as the Spelling Bee center hex.
- **Add a length**: add `GUESSES[n]` and `ANSWERS[n]` arrays in `public/words.js`, a `<button class="len-btn" data-len="n">n</button>` in `index.html`'s `.length-toggle`, and the board/keyboard/daily logic handles the rest automatically (max guesses = length + 1).
- **Change the daily reset time or make it shared across timezones**: `todayDateString()` in `public/common.js` uses the browser's local date. Switch it to a fixed UTC-based string if you'd rather everyone share one global reset time regardless of timezone.

## Theme background images

`public/images/themes/` holds per-theme background images, wired up as a `background-image` on the matching `[data-theme="..."]` block in `public/style.css` (see the "Theme background images" section near the top of that file). Currently wired: Ocean, Christmas, Spooky, Bubblegum 3D, Sunset, Standard Neon, Neon City, Neon 80s, Synthwave. Any theme without a file here just keeps its flat/gradient background.

Convention:

- File name matches the theme's `id` from the `THEMES` array in `public/common.js` (e.g. `ocean.jpg`, `neon-city.svg`). Extension can be `.jpg`, `.png`, `.webp`, or `.svg`.
- Portrait-friendly / mobile-first framing, since the board is narrow and tall on phones. `background-position: center top` keeps the top of the image anchored under the header.
- Each wired theme pairs its image with a `linear-gradient(...)` scrim tuned to that image's brightness, layered in the same `background-image` declaration, so tiles/keys (which always paint a solid theme color) and header text stay legible on top.

To add one for a theme that doesn't have it yet: drop the image in this folder, then add its `[data-theme="..."] body { background-image: linear-gradient(...), url("images/themes/yourfile"); }` rule alongside the others, and add the theme's selector to the shared `background-size/position/repeat` rule above them.
