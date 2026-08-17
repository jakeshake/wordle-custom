# Theme background images

Drop generated background images here, one per theme. Once they're in place,
they get wired up as a `background-image` on the matching `[data-theme="..."]`
block in `public/style.css`.

## Naming

Name each file after the theme's `id` in the `THEMES` array
(`public/script.js`), e.g.:

- `dark.jpg`
- `light.jpg`
- `neon-standard.jpg`
- `neon-city.jpg`
- `synthwave.jpg`
- `bubblegum-3d.jpg`
- `ocean.jpg`
- `sunset.jpg`
- `forest.jpg`
- `halloween.jpg`
- `christmas.jpg`
- `neon80s.jpg`
- `spooky.jpg`
- `terminal.jpg`
- `bubblegum.jpg`

(Extension can be `.jpg`, `.png`, or `.webp` — whatever the generator outputs.)

## Notes

- Portrait-friendly / mobile-first framing works best, since the board is
  narrow and tall on phones.
- Busy or high-contrast images may need a dark/blur overlay in CSS once
  applied, so the tiles and keyboard stay readable on top.
- Not every theme needs an image — themes without a file here just keep
  their current flat/gradient background.
