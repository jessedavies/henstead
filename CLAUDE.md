# Henstead

A cosy 3D browser game about a small chicken farm: you play a farmer with a border collie, tend hens, collect eggs and build up the farm. Three.js and TypeScript, no game engine. A second, older game, Come By (an arcade herding game), shares the repo.

Play online: https://jessedavies.github.io/henstead/ (Come By at /come-by/). Every push to `main` redeploys via `.github/workflows/pages.yml`.

History, design decisions and open questions from the first build session: `docs/SESSION_NOTES.md`. Ideas not yet built: `BACKLOG.md`. Asset sources and licences: `CREDITS.md`.

## Commands
- `npm install`
- `npm run dev`: builds unminified with source maps, serves on http://localhost:5173/, rebuilds on save in `src/` or `assets/` and reloads the page.
- `npm run build`: production build into `dist/` (what Pages deploys).
- There is no test suite. Changes were checked with headless Playwright scripts driving the game through `window.__hs` (see Debugging).

## Layout
- `src/henstead.ts`: Henstead entry. Loads the KayKit models, then imports `farm.ts`.
- `src/farm.ts`: the whole Henstead game (scene, landscape, items, hens, dog, farmer, predators, day cycle, UI, save/load). Large single file by design so far.
- `src/kit.ts`: loads packed KayKit models (`assets/models/*.json|bin|png`) and the farmer glTF; shared material per texture atlas; `fetchBinary` falls back to `*.b64.txt` copies.
- `src/kitmodels.ts`: farm pieces built from KayKit models (dog, chickens, farmer with animations, coop, fences, gate, feed patch, decorations, forest model lists).
- `src/models.ts`: models from primitives (all of Come By; Henstead's fox, hawk, snake, scarecrow, eggs).
- `src/audio.ts`: synthesised sounds plus recorded samples and music from `assets/audio`.
- `src/page-farm.html`, `src/page.html`: page markup and CSS for Henstead and Come By. The build appends the bundled script.
- `src/game.ts`: Come By.
- `src/library.ts`, `src/page-library.html`: the design library at `/library/` (look-dev diorama, every model, proposed pieces, UI kit). Not part of the game. It also loads the `x_*` packs, built from `tools/models-library.json` with the same packer; the game never loads them.
- `build.mjs` (exports `buildAll`), `dev.mjs`: build and dev server.
- `tools/pack_models.py`, `tools/models.json`, `tools/recolor.py`: pack chosen KayKit glTF models into `assets/models` (one file per atlas). `recolor.py` repaints KayKit's dog as a border collie.

## Things that are easy to break
- **Saved farms depend on the landscape's random-call order.** `farm.ts` generates trees and bushes from a seeded RNG (`wrand`) and saves cleared obstacles by index. Keep the number and order of `wrand()` calls in the vegetation code unchanged, and append new obstacle types after existing ones (rocks use their own RNG for this reason). Bump `SAVE_KEY` if a change must break old saves.
- **The `hay` item id is the log pile.** Kept for save compatibility; the display name is "Log pile".
- **Vertex colours in packed models are linear**, as three.js expects. `recolor.py` converts its sRGB constants.
- **Models load before the game runs.** `farm.ts` top-level code assumes `kit` is loaded; it is imported dynamically by `henstead.ts`.
- **Forest instancing is tiled** (22-unit tiles, one InstancedMesh per model per tile) so off-screen tiles are culled. A straight swap to KayKit trees was about 1.6M triangles per frame; now about 340k with shadows.
- **The claude.ai artifact host serves no .bin or .glb files**, hence the base64 `.b64.txt` copies the production build writes. Pages serves the binaries directly.

## Debugging
`window.__hs` exposes game state and helpers (`G`, `farmer`, `dog`, `hens`, `items`, `obstacles`, `standing` (trees, with fade `f`), `step(dt)`, `whistle`, `buyBird`, `placeAt`, `selectBuild`, `toggleBuild`, `save`, `renderer`, `scene`, `screen(x,y,z)`). Example: `for (let i = 0; i < 300; i++) __hs.step(1/30)` advances ten seconds.

## Assets
- KayKit models by Kay Lousberg, CC0. All 27 free packs (original zips) are on the `kaykit-packs` branch of this repo. To use more models: unzip the packs into a folder, add names to `tools/models.json`, run `KAYKIT_DIR=that/folder python3 tools/pack_models.py tools/models.json assets/models`.
- Audio: CC0 and public domain, listed in `CREDITS.md`.

## Owner preferences
- Cosy, low-pressure game: no fail state, gentle predators (they spook hens and steal eggs, never kill).
- Must work well on iPad with touch, not only mouse and keyboard.
- Wants the KayKit look (https://kaylousberg.itch.io/kaykit-forest) and is open to buying paid KayKit packs if they fill real gaps.
- Research before big visual or design changes; keep a backlog of ideas rather than building everything at once.
