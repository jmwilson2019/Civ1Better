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