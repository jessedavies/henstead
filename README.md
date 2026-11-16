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

Output goes to `dist/`: `farm.html` (Henstead) and `index.html` (Come By) are full pages; serve the folder over HTTP so the audio in `dist/audio/` loads. `henstead.html` and `come-by.html` are the same pages without a document wrapper, for hosts that add their own.

## Files

- `src/models.ts`: all 3D models, built from primitives.
- `src/audio.ts`: synthesised sounds plus optional recorded samples.
- `assets/audio/`: recorded samples and music. See `CREDITS.md` for sources and licences.
- `BACKLOG.md`: ideas not yet built, for both games.
