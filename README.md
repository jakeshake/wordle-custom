# Wordly

A clean, mobile-friendly Wordle clone with:

- **5 or 6 letter mode** — toggle in the header, adjusts guess count (6 tries for 5-letter, 7 for 6-letter, matching Wordle's own word-length + 1 convention).
- **Daily Challenge** — everyone gets the same word each day (per length), computed deterministically from the date so it resets automatically at local midnight, same as real Wordle. No server round-trip needed to pick it.
- **Practice mode** — unlimited random-word games, doesn't touch the leaderboard.
- **Shared leaderboard** — pick a name (no password), play the Daily Challenge, and your result is submitted to a small backend so everyone on the household server sees the same standings. Tracks games played, win %, current streak, best streak, average guesses, best time, and average luck, separately for 5- and 6-letter.
- **Speed timer** — starts on your first keystroke each Daily game, shown live above the board, recorded on completion, and tracked on the leaderboard as each player's best time.
- **Luck rating** — on a win, shows how many answer-pool words were still possible right before your winning guess. Solve it in few guesses despite a wide-open field and you'll score high on luck; narrow it down methodically and you'll score low ("All Skill"). Averaged per player on the leaderboard.
- **15 themes** — Dark, Light, Standard Neon, Neon City, Synthwave, Bubblegum 3D, Ocean, Sunset, Forest, Halloween, Christmas, Neon 80s, Spooky, Retro Terminal, Bubblegum — picked from the palette button, saved across visits.
- A **huge valid-word dictionary** (8,645 five-letter / 15,232 six-letter words) so common guesses never get rejected, while the daily/practice *answer* always comes from a smaller curated common-word list (2,315 / 1,233 words) so the puzzle itself stays fair and guessable.

## Architecture

Frontend is plain HTML/CSS/JS (`public/`), no build step, no framework. It's paired with a small zero-dependency Node backend (`server.js`, built-in `http`/`fs` only — no `npm install`, no `package.json`) that does two things:

1. Serves the static frontend.
2. Stores and aggregates leaderboard scores as a JSON file, so results submitted from any device/browser are visible to everyone.

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

- **Valid guesses** (`GUESSES[5]`, `GUESSES[6]` in `public/words.js`): a large Scrabble-style word-game dictionary (ENABLE word list), ~8.6k five-letter and ~15.2k six-letter words. This is what guesses are checked against, so legitimate everyday words are essentially never rejected.
- **Possible answers** (`ANSWERS[5]`, `ANSWERS[6]`): the curated common-word lists from the original build — the real 2,314-word Wordle answer list for 5 letters, and a manually-screened ~1,233-word list for 6 letters. Daily and Practice answers are always picked from here, so the puzzle stays solvable/fair. `ANSWERS` is a subset of `GUESSES`, guaranteed at build time.

## Customizing

- **Add a theme**: add a `[data-theme="yourname"]` block in `public/style.css` with the same CSS custom properties as the existing themes, then add `{ id, name, swatch }` to the `THEMES` array at the top of `public/script.js`.
- **Add a length**: add `GUESSES[n]` and `ANSWERS[n]` arrays in `public/words.js`, a `<button class="len-btn" data-len="n">n</button>` in `index.html`'s `.length-toggle`, and the board/keyboard/daily logic handles the rest automatically (max guesses = length + 1).
- **Change the daily reset time or make it shared across timezones**: `todayDateString()` in `public/script.js` uses the browser's local date. Switch it to a fixed UTC-based string if you'd rather everyone share one global reset time regardless of timezone.

## Theme background images

`public/images/themes/` holds per-theme background images, wired up as a `background-image` on the matching `[data-theme="..."]` block in `public/style.css` (see the "Theme background images" section near the top of that file). Currently wired: Ocean, Christmas, Spooky, Bubblegum 3D, Sunset, Standard Neon, Neon City, Neon 80s. Any theme without a file here just keeps its flat/gradient background.

Convention:

- File name matches the theme's `id` from the `THEMES` array in `public/script.js` (e.g. `ocean.jpg`, `neon-city.svg`). Extension can be `.jpg`, `.png`, `.webp`, or `.svg`.
- Portrait-friendly / mobile-first framing, since the board is narrow and tall on phones. `background-position: center top` keeps the top of the image anchored under the header.
- Each wired theme pairs its image with a `linear-gradient(...)` scrim tuned to that image's brightness, layered in the same `background-image` declaration, so tiles/keys (which always paint a solid theme color) and header text stay legible on top.

To add one for a theme that doesn't have it yet: drop the image in this folder, then add its `[data-theme="..."] body { background-image: linear-gradient(...), url("images/themes/yourfile"); }` rule alongside the others, and add the theme's selector to the shared `background-size/position/repeat` rule above them.
