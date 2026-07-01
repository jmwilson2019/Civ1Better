# Civ 1 Better

A modern take on the classic Civilization 1 game with procedural map generation, smooth controls, and dual platform support.

## Features

- **Procedural Maps**: Uses Perlin noise to generate realistic continents and terrain
- **Smooth Controls**: Mouse drag to pan, scroll wheel to zoom, arrow keys for navigation
- **Directional Arrows**: Visual indicators for unit movement directions
- **Terrain Details**: Enhanced rendering with waves, grass patterns, and varied colors
- **Unit & City Management**: Basic settler and warrior units, city production queues
- **Dual Platforms**: Web version (JavaScript/Canvas) and Desktop version (Python/Pygame)

## Versions

### Web Version (JavaScript)
- **File**: `index.html` + `game.js`
- **Requirements**: Modern web browser
- **How to run**: Open `index.html` in your browser
- **Controls**:
  - Mouse drag: Pan camera
  - Mouse scroll: Zoom in/out
  - Left click: Select units/cities
  - Arrow keys: Pan camera
  - Space: End turn

### Desktop Version (Python)
- **File**: `main.py` + `dist/Civ1Better.exe`
- **Requirements**: Windows (EXE is standalone)
- **How to run**: Double-click `dist/Civ1Better.exe`
- **Controls**: Same as web version, plus keyboard shortcuts

## Technical Details

### Map Generation
- Uses multi-octave Perlin noise for natural-looking continents
- Terrain types: Ocean, Plains, Grassland, Desert, Forest, Hills, Mountains
- Each tile has yield values (Food, Shields, Trade)

### Rendering
- Viewport culling for performance
- Variable tile size for zoom functionality
- Fallback shapes for units and cities (no external assets required)

### AI
- Basic AI civilizations with random city placement
- Simple unit production and movement

## Development

The game was developed with cross-platform compatibility in mind:
- JavaScript version for web deployment
- Python/Pygame version for desktop with EXE distribution

Both versions share similar features and gameplay mechanics.

## Future Enhancements

- More unit types and buildings
- Advanced AI behavior
- Multiplayer support
- Save/load game functionality
- More detailed graphics and animations

---

## Work History

A chronological log of what has been built so far. Newest at the top.

### 2026-07-01 — Seraphina Glyph behavior-controls audit (assessment)
- Audited `SynerGro-AI/Seraphina.AGIv1.0.8` Glyph control points: manifest validation (`glyph/glyph/manifest.py`), install gate flow (`glyph/glyph/operations.py` + `glyph/glyph/gate.py`), runtime loader controls (`glyph/glyph/sandbox.py`), and event signaling (`glyph/glyph/signals.py`).
- Current controls are strong on baseline policy enforcement: strict manifest field checks, deny-by-default gate for `risk_level="high"`, optional verifier path for non-allowed risks, zip-slip-safe extraction, and integrity/runtime compatibility checks before install.
- Main exposure area remains execution isolation: the sandbox explicitly states it is not a hard security boundary and relies on filtered builtins/import allowlists rather than process/container isolation.
- Additional hardening opportunities: sign/attest trust metadata (`.glyph-meta/trust.json`) to reduce local tampering risk, and pass a package-specific install path to external verifiers instead of `Path(".")` to make verifier context explicit.

### 2026-06-04 — Repository published
- Initialized public GitHub repo `jmwilson2019/Civ1Better`.
- Added `.gitignore` covering Python (`__pycache__/`), PyInstaller (`build/`, `dist/`), editor (`.vscode/`), and large media (`*.mp4`, `*.zip`, big `*.jpg` assets).
- Removed a stray nested `.git` folder inside `assets/assets/icons/` that blocked staging.
- Committed and pushed: `game.js`, `index.html`, `main.py`, `style.css`, `styles.css`, `Civ1Better.spec`, `main.spec`, `installer.iss`, and assets.

### Prior milestones (pre-publish)
- **Enhanced Civ 1 clone** — Perlin-noise procedural maps, zoom, and dual-platform support (web + desktop).
- **Python rewrite** — Clean `main.py` with Perlin maps, unit/city icons, flags, and hover tooltips.
- **Unit art** — Tank icons for warriors, procedural settler/archer sprites, blit-based unit rendering.

### Current game systems (as of latest commit)
- **Map**: 200×120 Perlin-noise terrain with continents/islands/landlocked modes, latitude-based tundra/jungle, light coastal smoothing.
- **Units**: Settler, Warrior, Archer, Chariot with movement, attack/defense, and veteran bonuses.
- **Cities**: Production queue, growth from food, citizen roles (worker/tax/scientist/entertainer), mayor AI, buildings (Granary, Marketplace, Library, Temple, Colosseum, Barracks) and Pyramids wonder.
- **Combat**: Probabilistic atk/(atk+def) resolution with combat log.
- **Economy**: Gold from trade + tax collectors, research from trade + scientists + Library bonus.
- **AI**: Two AI civs (`ai1`, `ai2`) plus periodic barbarian spawns; AI settlers auto-found, AI units pathfind toward player targets.
- **UI**: Tooltip on hover, directional move arrows, in-DOM production picker, city management menu.
- **Controls**: Space+drag pan, scroll/touch zoom, click-to-select, right-click city for menu, `C` to found city.

---

## Plan Going Forward

Roadmap is grouped by horizon. Items are intentionally small enough to ship as individual commits.

### Near-term (next few sessions)
- [ ] **Finish the city UI** — complete the truncated citizen-management handlers (`decSci`, `incSci`, `decEnt`, `incEnt`) and the `closeCityMenu` / `forceElection` buttons.
- [ ] **Hook up `checkVictory()`** — referenced in `endTurnBtn` but not yet defined; add domination + science-victory conditions.
- [ ] **Persist games** — `Save` / `Load` via `localStorage` (JSON serialize `map`, `units`, `cities`, `explored`, turn/tech/gold).
- [ ] **Keyboard polish** — Enter = end turn, number keys = cycle selected unit, `B` = build menu.
- [ ] **Bug pass** — verify `selectedUnit.movesLeft = 0` after combat doesn't crash when the unit died; clean up the duplicated productivity-bonus code between `processCity` and `showCityMenu` into a single helper.

### Mid-term
- [ ] **Tech tree** — replace the linear `TECH_COSTS` ladder with a real prerequisite graph that unlocks units/buildings.
- [ ] **Diplomacy screen** — UI for the `diplomacy{}` object (declare war, peace, trade gold/tech).
- [ ] **Worker units** — irrigation, roads, and mines that modify tile yields.
- [ ] **Naval & air units** — triremes that can cross water, scouts with extra movement.
- [ ] **Asset pipeline** — pull in the existing icons under `assets/` for units, cities, and yields (already referenced in earlier `main.py` versions).
- [ ] **Sound** — simple click/move/combat SFX, toggleable.

### Long-term
- [ ] **Hex grid option** — toggle between square and hex tiles.
- [ ] **Smarter AI** — threat assessment, expansion priority, basic alliance behavior.
- [ ] **Multiplayer** — hot-seat first, then a lightweight WebSocket server (Workers/Node).
- [ ] **Desktop parity** — keep `main.py` (Pygame) in sync with the JS rules engine, or extract rules into a shared JSON spec.
- [ ] **Distribute** — publish the web build to GitHub Pages and ship signed Windows installer via Inno Setup (`installer.iss` already scaffolded).

### Known issues / tech debt
- `game.js` is one large file inside a `DOMContentLoaded` handler — split into modules (`map.js`, `units.js`, `cities.js`, `ui.js`, `ai.js`) once the feature surface stabilizes.
- Map size (200×120) is fixed; expose as a setting.
- `Math.random()` is used everywhere — add a seedable RNG so games are reproducible / shareable.
- No automated tests yet — add a minimal Vitest/Jest suite for combat math and city growth.

## Contributing / Workflow

Standard push cycle for this repo:

```powershell
git add -A
git commit -m "Short description of change"
git push
```
