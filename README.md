# Chicken farm games

Two browser games sharing one codebase (Three.js, TypeScript, no game engine).

- **Henstead** (`src/farm.ts`): a cosy chicken farm. Play a farmer with a border collie; tend hens, collect eggs, build and decorate. Mouse, keyboard and touch.
- **Come By** (`src/game.ts`): a timed arcade herding game. Play the collie and pen the hens before dark.

## Build

```bash
npm install
```

```bash
node build.mjs
```

Output goes to `dist/`: `index.html` is Henstead and `come-by/index.html` is Come By. Serve the folder over HTTP (for example `npx serve dist`) so the audio in `dist/audio/` loads; opening the files directly from disk runs the games without recorded sound. `henstead.html` and `come-by.html` are the same pages without a document wrapper, for hosts that add their own.

## Play online

Every push to `main` builds the games and deploys them to GitHub Pages (`.github/workflows/pages.yml`):

- Henstead: https://jessedavies.github.io/henstead/
- Come By: https://jessedavies.github.io/henstead/come-by/

On an iPad, open the link in Safari and use Share, then Add to Home Screen, to play it full screen.

## Files

- `src/kit.ts`, `src/kitmodels.ts`: loads the KayKit models (CC0) and builds the farm's pieces from them.
- `src/models.ts`: models built from primitives (Come By, and the fox, hawk, snake, scarecrow and eggs in Henstead).
- `assets/models/`: packed KayKit models. To change which models are used, unzip the KayKit packs into a folder and run `KAYKIT_DIR=that/folder python3 tools/pack_models.py tools/models.json assets/models`.
- `src/audio.ts`: synthesised sounds plus optional recorded samples.
- `assets/audio/`: recorded samples and music. See `CREDITS.md` for sources and licences.
- `BACKLOG.md`: ideas not yet built, for both games.
