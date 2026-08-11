# Wordly

A clean, mobile-friendly Wordle clone with two twists:

- **5 or 6 letter mode** — toggle in the header, game resets and adjusts guess count (6 tries for 5-letter words, 7 for 6-letter, matching Wordle's own word-length + 1 convention).
- **5 themes** — Dark, Light, Ocean, Sunset, Forest — picked from the palette button, saved across visits.

No frameworks, no build step, no dependencies. Just `index.html`, `style.css`, `script.js`, and `words.js`.

## Running it

Open `index.html` directly in a browser, or serve the folder with any static file server:

```bash
python -m http.server 5173 --directory wordle-custom
```

Or use the bundled zero-dependency PowerShell server (handy on Windows machines without Python/Node):

```powershell
powershell -File .devserver/serve.ps1 -Port 5173
```

Then visit `http://localhost:5173`.

## Deploying

This is a static site — push it to a repo and enable GitHub Pages (Settings → Pages → deploy from branch), or drop the folder onto any static host (Netlify, Vercel, Cloudflare Pages, etc.). No build step required.

## Dictionary

- **5-letter words**: the original curated Wordle answer list (2,314 words), hand-picked for commonness by the game's original creator — no obscure words.
- **6-letter words**: built by intersecting a top-10,000 English word-frequency list with a word-game dictionary (no proper nouns), then manually screened to strip remaining names/places/slang. ~1,230 words.

Both lists live in `words.js` as plain arrays (`WORDS[5]`, `WORDS[6]`), so swapping in your own list is a one-file edit.

## Customizing

- **Add a theme**: add a `[data-theme="yourname"]` block in `style.css` with the same CSS custom properties as the existing themes, then add `{ id, name, swatch }` to the `THEMES` array at the top of `script.js`.
- **Add a length**: add a `WORDS[n]` array in `words.js`, a `<button class="len-btn" data-len="n">n</button>` in `index.html`'s `.length-toggle`, and the on-screen keyboard/board code will handle the rest automatically (max guesses = length + 1).
