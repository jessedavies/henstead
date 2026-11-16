# Session notes: first build (November 2026)

What happened in the first Claude Code session (cloud), in order, with the decisions behind it. Read alongside `CLAUDE.md`.

## 1. Engine and first prototype (Come By)
- Asked for a 3D browser game: a border collie on a small farm rounding up chickens, with predators, a coop, crops, eggs, one rooster, and an Untitled-Goose-Game-like fixed camera with whistle commands.
- Chose Three.js + TypeScript, bundled with esbuild into one HTML page. Rejected Godot and Unity web exports (multi-megabyte runtimes, editor-bound), and Babylon and PlayCanvas (no clear gain). No physics engine: steering behaviours on a flat plane.
- Flagged that "play the dog" and "command the dog by whistle" are different games; went with direct control plus whistle verbs.
- Built Come By (`src/game.ts`): timed day/dusk rounds, herd hens into a pen, hawk, then a second build with rooster, fox, egg shop and land clearing. Playtested by the owner to day 7: fun, but not the game they wanted.

## 2. Pivot to a cosy farm sim (Henstead)
- Owner wanted something closer to Stardew Valley or Animal Crossing: an ambient farm builder focused on chickens.
- Decisions asked and answered: play **a farmer with the dog**; predators **gentle**; time split **equally** between building and tending.
- Built `src/farm.ts`: no fail state, about a 3.4-minute day (150 s day, 40 s dusk, 15 s night); a hen lays at dawn if fed, slept in a coop and stayed calm; feed patches; clearing; free placement; buying hens and a rooster; hatching; to-do list; saving in the browser.

## 3. Research, fences, look, clarity, sound
- Research (cosy design: safety, abundance, softness; Animal Crossing's simple shapes and task-list onboarding; Townscaper and Dorfromantik placement feel). Sources are in the chat history, not the repo.
- Fixed hens being unable to get past fences: added grid pathfinding that respects fences and open gates. Farmer and dog hop fences.
- Clarity: prompt bubble on the usable object, ground ring, arrow over the current to-do target, pulsing buttons, whistles revealed at to-do step 4, hen status icons.
- Real audio: CC0 and public domain hen, rooster, dog, birdsong and pop samples; "Apple Cider" music by Zane Little Music. Whistles, hawk and fox are still synthesised.

## 4. iPad, menus, hosting
- Touch: tap to walk or use, drag to steer, pinch to zoom, build mode as drag-then-Place with Rotate and Done buttons, larger targets, touch-specific wording.
- Pause menu (Esc, P or Menu button; auto-pause when the tab hides): resume, how to play, sound and music toggles, two-tap new farm.
- Repo created (`jessedavies/henstead`), GitHub Pages enabled via Actions.

## 5. KayKit redesign
- Owner supplied four free KayKit packs; downloaded the free tier of all other KayKit packs (27 total, now on the `kaykit-packs` branch).
- Henstead now uses KayKit models for nearly everything (see `CREDITS.md`). Fox, hawk, snake, scarecrow and eggs remain primitives because no pack has them.
- Built `tools/pack_models.py` (one compact file per texture atlas, parts kept for the dog, untextured colours as vertex colours) and `tools/recolor.py` (collie markings).
- Lowered and closed in the camera to suit the style; trees between camera and farmer shrink out of the way.
- Performance work: only lighter tree variants, forest split into culled tiles, no anti-aliasing at device pixel ratio 2+.

## 6. Local development
- Added `npm run dev` (rebuild on save, live reload). Owner is moving to local development.

## Recommendations given on buying KayKit (based on store descriptions only)
- Not the Complete KayKit ($150) for this game.
- Forest EXTRA ($9.99): 8 colour variations per model, useful for seasons. Best fit.
- Series 6 ($19.99): includes two farmer characters.
- Medieval Hexagon EXTRA ($9.99): horses, more buildings, seasonal textures.
- No KayKit pack appears to have real chickens (only the plush), a fox, hawk, snake, scarecrow or hay bale.

## Open items
- Nobody has checked balance, the audio mix, or a real iPad yet. Headless tests used software rendering.
- See `BACKLOG.md` for the idea list.
- The claude.ai artifact copy of Henstead (https://claude.ai/artifact/CgcrmWBc1sTZ9tMXh5Z6CS) was a preview channel during the cloud session; GitHub Pages is now the main link.
