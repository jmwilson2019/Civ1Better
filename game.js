// Wrap entire game code in DOMContentLoaded to ensure canvas is ready
document.addEventListener('DOMContentLoaded', function() {
    const canvas = document.getElementById('gameCanvas');
    const ctx = canvas.getContext('2d');
    const tooltip = document.getElementById('tooltip');

    let tileSize = 10;           // smaller tiles = higher definition, variable for zoom
    const MAP_WIDTH = 200;          // 200x120 = 24,000 tiles
    const MAP_HEIGHT = 120;         // thousands of tiles total

    const TERRAIN_COLORS = {
        water: '#0066cc',
        plains: '#4CAF50',
        forest: '#2E7D32',
        hills: '#8D6E63',
        mountain: '#555555',
        tundra: '#a0a0a0',
        jungle: '#1e6b1e'
    };

    const YIELDS = {
        water: {food: 0, shields: 0, trade: 1},
        plains: {food: 2, shields: 1, trade: 1},
        forest: {food: 1, shields: 2, trade: 0},
        hills: {food: 1, shields: 2, trade: 1},
        mountain: {food: 0, shields: 1, trade: 0},
        tundra: {food: 1, shields: 0, trade: 0},
        jungle: {food: 3, shields: 0, trade: 1}
    };

    let map = [];
    let units = [];
    let cities = [];
    let explored = [];
    let currentTurn = 1;
    let research = 0;
    let techLevel = 0;

    const TECH_COSTS = [0, 20, 50, 100, 200, 300, 400, 500, 600, 700];
    const TECH_NAMES = ['', 'Bronze Working', 'Iron Working', 'Writing', 'Horseback Riding', 
                    'Navigation', 'Flight', 'Industrial Age', 'Modern Age', 'Future Tech'];

    const UNITS = {
        settler: { name: 'Settler', cost: 40, movement: 2, attack: 0, defense: 1 },
        warrior: { name: 'Warrior', cost: 10, movement: 1, attack: 1, defense: 1 },
        archer: { name: 'Archer', cost: 30, movement: 1, attack: 3, defense: 2 },
        chariot: { name: 'Chariot', cost: 40, movement: 2, attack: 3, defense: 1 },
    };

    const BUILDINGS = {
        granary: { name: 'Granary', cost: 60, wonder: false },
        marketplace: { name: 'Marketplace', cost: 80, wonder: false },
        library: { name: 'Library', cost: 80, wonder: false },
        temple: { name: 'Temple', cost: 40, wonder: false },
        colosseum: { name: 'Colosseum', cost: 100, wonder: false },
        barracks: { name: 'Barracks', cost: 40, wonder: false },
        pyramids: { name: 'Pyramids', cost: 200, wonder: true },
    };

    let gameFrozen = false;

    let startTime = performance.now();
    let totalMoves = 0;
    let intrigueLevel = 0;
    let wondersBuilt = [];
    let researchBonus = 0;

    let playerGold = 0;
    let combatLog = [];
    let diplomacy = {};
    let selectedCity = null;

    // Initialize diplomacy (single source of truth for AI civs)
    const aiCivs = ['ai1', 'ai2'];
    aiCivs.forEach(ai => {
        diplomacy[ai] = {relation: 0, treaty: null, trade: 0};
    });

    function logCombat(msg) {
        combatLog.push(msg);
        if (combatLog.length > 20) combatLog.shift();
    }

    // ==================== CAMERA / VIEWPORT ====================
    let cameraX = 0;
    let cameraY = 0;
    let isDragging = false;
    let dragStartX = 0, dragStartY = 0;
    let dragStartCamX = 0, dragStartCamY = 0;
    let isSpaceDown = false;
    let hoveredDir = null;  // 'up', 'down', 'left', 'right'

    function clampCamera() {
        cameraX = Math.max(0, Math.min(cameraX, MAP_WIDTH * tileSize - canvas.width));
        cameraY = Math.max(0, Math.min(cameraY, MAP_HEIGHT * tileSize - canvas.height));
    }

    function resizeCanvas() {
        const ui = document.getElementById('ui');
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight - ui.offsetHeight;
        clampCamera();
    }

    window.addEventListener('resize', resizeCanvas);

    // ==================== PERLIN NOISE ====================
    // Simple Perlin noise implementation for JS
    function fade(t) { return t * t * t * (t * (t * 6 - 15) + 10); }
    function lerp(a, b, t) { return a + t * (b - a); }
    function grad(hash, x, y) {
        const h = hash & 15;
        const u = h < 8 ? x : y;
        const v = h < 4 ? y : h == 12 || h == 14 ? x : 0;
        return ((h & 1) == 0 ? u : -u) + ((h & 2) == 0 ? v : -v);
    }

    const p = [151,160,137,91,90,15,131,13,201,95,96,53,194,233,7,225,140,36,103,30,69,142,8,99,37,240,21,10,23,190,6,148,247,120,234,75,0,26,197,62,94,252,219,203,117,35,11,32,57,177,33,88,237,149,56,87,174,20,125,136,171,168,68,175,74,165,71,134,139,48,27,166,77,146,158,231,49,210,105,163,170,181,178,187,96,19,143,135,69,97,30,22,39,43,0,167,5,176,155,31,76,139,228,46,49,101,194,235,125,106,176,83,144,218,58,197,216,196,87,39,181,238,145,174,212,214,7,204,150,118,192,14,106,44,165,27,100,26,16,145,40,153,156,187,131,152,10,0,21,54,104,26,173,28,197,85,171,11,141,20,114,121,201,221,187,116,233,178,39,49,255,9,35,150,39,21,200,159,141,250,201,46,47,141,191,79,174,55,6,78,218,161,73,107,234,37,53,77,51,34,208,141,153,12,194,240,161,131,205,109,115,85,196,237,152,86,171,170,198,103,112,54,28,170,24,64,229,61,71,37,63,29,138,168,133,88,12,10,126,156,144,171,118,52,212,37,204,19,16,161,141,35,19,56,46,208,79,81,171,253,56,160,176,161,81,124,128,57,85,90,207,205,180,177,134,44,235,107,5,113,73,49,204,184,162,70,221,74,190,83,128,74,71,233,35,82,53,160,144,169,111,186,81,171,31,44,70,250,131,47,137,15,69,13,90,133,255,12,166,101,233,229,203,30,123,211,34,157,207,16,122,155,227,192,46,209,0,204,79,141,84,255,207,150,59,14,211,169,177,162,90,238,12,22,167,79,22,107,196,111,78,173,22,213,86,130,104,20,238,119,84,105,97,173];

    let permutation = [];
    for (let i = 0; i < 512; i++) permutation[i] = p[i % 256];

    function noise(x, y) {
        const X = Math.floor(x) & 255;
        const Y = Math.floor(y) & 255;
        x -= Math.floor(x);
        y -= Math.floor(y);
        const u = fade(x);
        const v = fade(y);
        const A = permutation[X] + Y, AA = permutation[A], AB = permutation[A + 1];
        const B = permutation[X + 1] + Y, BA = permutation[B], BB = permutation[B + 1];
        return lerp(v, lerp(u, grad(permutation[AA], x, y), grad(permutation[BA], x - 1, y)),
                   lerp(u, grad(permutation[AB], x, y - 1), grad(permutation[BB], x - 1, y - 1)));
    }

    function pnoise2(x, y, octaves = 1, persistence = 0.5, lacunarity = 2.0) {
        let value = 0;
        let amplitude = 1;
        let frequency = 1;
        for (let i = 0; i < octaves; i++) {
            value += noise(x * frequency, y * frequency) * amplitude;
            amplitude *= persistence;
            frequency *= lacunarity;
        }
        return value;
    }

    function exploreAround(x, y, radius = 1) {
        for (let dy = -radius; dy <= radius; dy++) {
            for (let dx = -radius; dx <= radius; dx++) {
                const ex = x + dx;
                const ey = y + dy;
                if (ex >= 0 && ex < MAP_WIDTH && ey >= 0 && ey < MAP_HEIGHT) {
                    explored[ey][ex] = true;
                }
            }
        }
    }

    // ==================== MAP GENERATION ====================
    function generateMap(mode = 'random') {
        // Start with heightmap using multi-octave Perlin noise
        let height = Array.from({ length: MAP_HEIGHT }, () => Array(MAP_WIDTH).fill(0));

        // Multiple noise layers for organic continents
        for (let octave = 0; octave < 6; octave++) {
            const freq = Math.pow(2, octave);
            const amp = 1.0 / Math.pow(2, octave);
            const offsetX = Math.random() * 10;
            const offsetY = Math.random() * 10;

            for (let y = 0; y < MAP_HEIGHT; y++) {
                for (let x = 0; x < MAP_WIDTH; x++) {
                    const nx = (x / MAP_WIDTH - 0.5) * freq + offsetX;
                    const ny = (y / MAP_HEIGHT - 0.5) * freq + offsetY;
                    const val = pnoise2(nx, ny, octave + 1, 0.5, 2.0);
                    height[y][x] += (val + 1.0) / 2.0 * amp;  // Normalize to 0-1
                }
            }
        }

        // Normalize height
        let maxH = 0, minH = 1;
        for (let y = 0; y < MAP_HEIGHT; y++) {
            for (let x = 0; x < MAP_WIDTH; x++) {
                maxH = Math.max(maxH, height[y][x]);
                minH = Math.min(minH, height[y][x]);
            }
        }
        for (let y = 0; y < MAP_HEIGHT; y++) {
            for (let x = 0; x < MAP_WIDTH; x++) {
                height[y][x] = (height[y][x] - minH) / (maxH - minH);
            }
        }

        // Create final map from height + mode parameters
        map = Array.from({ length: MAP_HEIGHT }, () => Array(MAP_WIDTH).fill('water'));
        const landTarget = mode === 'continents' ? 0.45 : mode === 'islands' ? 0.25 : mode === 'landlocked' ? 0.55 : 0.38;

        for (let y = 0; y < MAP_HEIGHT; y++) {
            const lat = Math.abs(y - MAP_HEIGHT / 2) / (MAP_HEIGHT / 2); // 0 = equator, 1 = pole
            for (let x = 0; x < MAP_WIDTH; x++) {
                const h = height[y][x];

                if (h < landTarget) continue;  // water

                if (lat > 0.78 && Math.random() < 0.7) map[y][x] = 'tundra';
                else if (h > 0.92) map[y][x] = 'mountain';
                else if (h > 0.78) map[y][x] = 'hills';
                else if (h > 0.65 && lat < 0.45 && Math.random() < 0.6) map[y][x] = 'jungle';
                else if (h > 0.55) map[y][x] = 'forest';
                else map[y][x] = 'plains';
            }
        }

        // Light smoothing pass
        for (let pass = 0; pass < 2; pass++) {
            for (let y = 1; y < MAP_HEIGHT - 1; y++) {
                for (let x = 1; x < MAP_WIDTH - 1; x++) {
                    if (map[y][x] === 'water') {
                        let landNeighbors = 0;
                        for (let dy = -1; dy <= 1; dy++) {
                            for (let dx = -1; dx <= 1; dx++) {
                                if (map[y + dy][x + dx] !== 'water') landNeighbors++;
                            }
                        }
                        if (landNeighbors >= 5) map[y][x] = 'plains';
                    }
                }
            }
        }

        // Make sure player start is on land
        const startX = Math.floor(MAP_WIDTH / 2);
        const startY = Math.floor(MAP_HEIGHT / 2);
        if (map[startY][startX] === 'water') map[startY][startX] = 'plains';

        // Initialize explored
        explored = Array.from({ length: MAP_HEIGHT }, () => Array(MAP_WIDTH).fill(false));
        exploreAround(startX, startY, 2);

        // === Reset units and cities ===
        cities = [];
        units = [];

        units.push({
            x: startX, y: startY,
            type: 'settler',
            owner: 'player',
            selected: true,
            movesLeft: 2,
            strength: 1
        });

        // Center camera on selected unit
        const sel = units.find(u => u.selected);
        if (sel) {
            cameraX = sel.x * tileSize + tileSize / 2 - canvas.width / 2;
            cameraY = sel.y * tileSize + tileSize / 2 - canvas.height / 2;
            clampCamera();
        }

        // AI starts (uses module-level aiCivs)
        aiCivs.forEach(aiId => {
            let ax, ay, attempts = 0;
            do {
                ax = Math.floor(Math.random() * MAP_WIDTH);
                ay = Math.floor(Math.random() * MAP_HEIGHT);
                attempts++;
            } while ((map[ay][ax] === 'water' || map[ay][ax] === 'mountain') && attempts < 120);

            if (attempts < 120) {
                map[ay][ax] = 'plains';
                cities.push({
                    x: ax, y: ay, size: 1,
                    name: `${aiId.toUpperCase()} City`,
                    owner: aiId,
                    food: 0, shields: 0, revenue: 0, happiness: 'Content',
                    productionQueue: ['warrior'],
                    currentProduction: null,
                    taxCollectors: 0, scientists: 0, entertainers: 0,
                    mayorType: ['balanced', 'production', 'gold', 'research', 'happiness'][Math.floor(Math.random() * 5)]
                });
                units.push({
                    x: ax, y: ay,
                    type: 'settler',
                    owner: aiId,
                    selected: false,
                    movesLeft: 2,
                    strength: 1
                });
            }
        });
    }

    // ==================== RENDERING ====================
    function render() {
        clampCamera();
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Only draw tiles in the viewport
        const startTileX = Math.floor(cameraX / tileSize);
        const startTileY = Math.floor(cameraY / tileSize);
        const endTileX = Math.min(MAP_WIDTH, startTileX + Math.ceil(canvas.width / tileSize) + 1);
        const endTileY = Math.min(MAP_HEIGHT, startTileY + Math.ceil(canvas.height / tileSize) + 1);

        for (let y = startTileY; y < endTileY; y++) {
            for (let x = startTileX; x < endTileX; x++) {
                if (!explored[y][x]) continue;
                const px = x * tileSize - cameraX;
                const py = y * tileSize - cameraY;
                const terrain = map[y][x];
                ctx.fillStyle = TERRAIN_COLORS[terrain] || '#333';
                ctx.fillRect(px, py, tileSize, tileSize);
                // Add terrain details
                if (terrain === 'water') {
                    // Waves
                    ctx.strokeStyle = 'rgba(173,216,230,0.3)';
                    ctx.lineWidth = 1;
                    for (let wy = 0; wy < tileSize; wy += 4) {
                        ctx.beginPath();
                        ctx.moveTo(px, py + wy);
                        ctx.lineTo(px + tileSize, py + wy);
                        ctx.stroke();
                    }
                } else if (terrain === 'plains') {
                    // Grass patches
                    ctx.fillStyle = '#32CD32';
                    for (let i = 0; i < 3; i++) {
                        const gx = px + Math.random() * tileSize;
                        const gy = py + Math.random() * tileSize;
                        ctx.beginPath();
                        ctx.arc(gx, gy, 1, 0, Math.PI * 2);
                        ctx.fill();
                    }
                }
                ctx.strokeStyle = 'rgba(255,255,255,0.05)';
                ctx.lineWidth = 0.5;
                ctx.strokeRect(px, py, tileSize, tileSize);
            }
        }

        // Draw units (skip off-screen)
        units.forEach(unit => {
            const sx = unit.x * tileSize + tileSize / 2 - cameraX;
            const sy = unit.y * tileSize + tileSize / 2 - cameraY;
            if (sx < -tileSize || sx > canvas.width + tileSize) return;
            if (sy < -tileSize || sy > canvas.height + tileSize) return;
            if (!explored[unit.y][unit.x]) return;

            let color = '#ff4444';
            if (unit.owner === 'player') {
                color = unit.type === 'settler' ? '#ffcc00' : '#ff2222';
            } else if (unit.owner.startsWith('ai')) {
                color = '#4488ff';
            } else if (unit.owner === 'barbarian') {
                color = '#bb00bb';
            }

            // Draw unit as full square tile
            ctx.fillStyle = color;
            ctx.fillRect(sx - tileSize/2, sy - tileSize/2, tileSize, tileSize);

            // Draw unit type initial
            ctx.fillStyle = '#ffffff';
            ctx.font = `bold ${Math.max(8, tileSize / 3)}px Arial`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(unit.type.charAt(0).toUpperCase(), sx, sy);

            if (unit.selected) {
                ctx.strokeStyle = '#ffff00';
                ctx.lineWidth = 3;
                ctx.strokeRect(sx - tileSize/2, sy - tileSize/2, tileSize, tileSize);
            }
        });

        // Draw cities (skip off-screen)
        cities.forEach(city => {
            const sx = city.x * tileSize + tileSize / 2 - cameraX;
            const sy = city.y * tileSize + tileSize / 2 - cameraY;
            if (sx < -20 || sx > canvas.width + 20) return;
            if (sy < -20 || sy > canvas.height + 20) return;
            if (!explored[city.y][city.x]) return;

            ctx.fillStyle = city.owner === 'player' ? '#ffddaa' : '#aaccee';
            ctx.fillRect(sx - 7, sy - 5, 14, 10);
            ctx.strokeStyle = '#000000';
            ctx.lineWidth = 1;
            ctx.strokeRect(sx - 7, sy - 5, 14, 10);
            ctx.fillStyle = '#000000';
            ctx.font = 'bold 8px Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(city.size.toString(), sx, sy);
        });

        // Draw directional arrows
        if (hoveredDir) {
            const sel = units.find(u => u.selected);
            if (sel) {
                const dx = hoveredDir === 'right' ? 1 : hoveredDir === 'left' ? -1 : 0;
                const dy = hoveredDir === 'down' ? 1 : hoveredDir === 'up' ? -1 : 0;
                const tx = sel.x + dx;
                const ty = sel.y + dy;
                const tsx = tx * tileSize - cameraX;
                const tsy = ty * tileSize - cameraY;
                const arrowSize = tileSize / 4;
                ctx.fillStyle = '#00ff00';
                ctx.beginPath();
                if (hoveredDir === 'right') {
                    ctx.moveTo(tsx + 5, tsy + tileSize / 2 - arrowSize / 2);
                    ctx.lineTo(tsx + 5 + arrowSize, tsy + tileSize / 2);
                    ctx.lineTo(tsx + 5, tsy + tileSize / 2 + arrowSize / 2);
                } else if (hoveredDir === 'left') {
                    ctx.moveTo(tsx + tileSize - 5, tsy + tileSize / 2 - arrowSize / 2);
                    ctx.lineTo(tsx + tileSize - 5 - arrowSize, tsy + tileSize / 2);
                    ctx.lineTo(tsx + tileSize - 5, tsy + tileSize / 2 + arrowSize / 2);
                } else if (hoveredDir === 'down') {
                    ctx.moveTo(tsx + tileSize / 2 - arrowSize / 2, tsy + tileSize - 5);
                    ctx.lineTo(tsx + tileSize / 2, tsy + tileSize - 5 - arrowSize);
                    ctx.lineTo(tsx + tileSize / 2 + arrowSize / 2, tsy + tileSize - 5);
                } else if (hoveredDir === 'up') {
                    ctx.moveTo(tsx + tileSize / 2 - arrowSize / 2, tsy + 5);
                    ctx.lineTo(tsx + tileSize / 2, tsy + 5 + arrowSize);
                    ctx.lineTo(tsx + tileSize / 2 + arrowSize / 2, tsy + 5);
                }
                ctx.closePath();
                ctx.fill();
                ctx.strokeStyle = '#000000';
                ctx.lineWidth = 1;
                ctx.stroke();
            }
        }

        // Update UI (DOM elements already exist in index.html)
        document.getElementById('turnCounter').textContent = `Turn: ${currentTurn}`;
        document.getElementById('techDisplay').textContent =
            `Tech: ${techLevel} (${TECH_NAMES[techLevel] || 'None'}) | Research: ${Math.floor(research)}/${TECH_COSTS[techLevel + 1] || 'Max'}`;
        document.getElementById('goldDisplay').textContent = `Gold: ${Math.floor(playerGold)}`;
        document.getElementById('combatLog').innerHTML = combatLog.slice(-3).join('<br>');
        document.getElementById('diplomacy').innerHTML = '<h4>Diplomacy</h4>' + Object.keys(diplomacy).map(ai =>
            `<p>${ai}: ${diplomacy[ai].relation > 0 ? 'Friendly' : 'Neutral'}</p>`
        ).join('');

        requestAnimationFrame(render);
    }

    // ==================== MOUSE INTERACTION ====================
    canvas.addEventListener('mousedown', (e) => {
        // Pan handled in mousemove with space key
    });

    canvas.addEventListener('mousemove', (e) => {
        // Pan camera with space + drag (like Photoshop)
        if (isSpaceDown) {
            if (!isDragging) {
                isDragging = true;
                dragStartX = e.clientX;
                dragStartY = e.clientY;
                dragStartCamX = cameraX;
                dragStartCamY = cameraY;
            }
            cameraX = dragStartCamX + (dragStartX - e.clientX);
            cameraY = dragStartCamY + (dragStartY - e.clientY);
            clampCamera();
            tooltip.style.display = 'none';
            canvas.style.cursor = 'grabbing';
            return;
        }

        // Tooltip on hover (no button)
        if (e.buttons === 0) {
            canvas.style.cursor = 'default';
            const rect = canvas.getBoundingClientRect();
            const mx = e.clientX - rect.left;
            const my = e.clientY - rect.top;
            const tileX = Math.floor((mx + cameraX) / tileSize);
            const tileY = Math.floor((my + cameraY) / tileSize);

            if (tileX >= 0 && tileX < MAP_WIDTH && tileY >= 0 && tileY < MAP_HEIGHT) {
                const terrain = map[tileY][tileX];
                const yieldData = YIELDS[terrain] || {food: 0, shields: 0, trade: 0};
                let html = `<b>(${tileX}, ${tileY})</b> - ${terrain.toUpperCase()}<br>`;
                html += `Food: ${yieldData.food} | Shields: ${yieldData.shields} | Trade: ${yieldData.trade}`;
                const city = cities.find(c => c.x === tileX && c.y === tileY);
                const unit = units.find(u => u.x === tileX && u.y === tileY);
                if (city) html += `<br><b>City:</b> ${city.name} (Pop ${city.size}, ${city.owner})`;
                if (unit) html += `<br><b>Unit:</b> ${unit.type} (${unit.owner})`;

                // Check for directional hover
                hoveredDir = null;
                const sel = units.find(u => u.selected);
                if (sel && sel.movesLeft > 0) {
                    const dx = tileX - sel.x;
                    const dy = tileY - sel.y;
                    const wt = map[tileY][tileX];
                    const canMove = (Math.abs(dx) + Math.abs(dy) === 1) && wt !== 'water' && wt !== 'mountain';
                    if (canMove) {
                        if (dx === 1 && dy === 0) hoveredDir = 'right';
                        else if (dx === -1 && dy === 0) hoveredDir = 'left';
                        else if (dx === 0 && dy === 1) hoveredDir = 'down';
                        else if (dx === 0 && dy === -1) hoveredDir = 'up';
                    }
                }
                if (hoveredDir) html += `<br>Move ${hoveredDir.toUpperCase()}?`;

                tooltip.innerHTML = html;
                tooltip.style.display = 'block';
                tooltip.style.left = (e.clientX + 12) + 'px';
                tooltip.style.top = (e.clientY + 12) + 'px';
            } else {
                tooltip.style.display = 'none';
                hoveredDir = null;
            }
        }
    });

    canvas.addEventListener('mouseup', (e) => {
        if (gameFrozen) return;
        canvas.style.cursor = 'default';
        if (isDragging) { isDragging = false; return; }

        const rect = canvas.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;
        const tileX = Math.floor((mx + cameraX) / tileSize);
        const tileY = Math.floor((my + cameraY) / tileSize);

        if (tileX < 0 || tileX >= MAP_WIDTH || tileY < 0 || tileY >= MAP_HEIGHT) return;

        // Select unit if clicked on one
        const clickedUnit = units.find(u => u.x === tileX && u.y === tileY);
        if (clickedUnit) {
            units.forEach(u => u.selected = false);
            clickedUnit.selected = true;
            // Center camera on unit with 3px margin
            const centerX = clickedUnit.x * tileSize + tileSize / 2;
            const centerY = clickedUnit.y * tileSize + tileSize / 2;
            cameraX = centerX - canvas.width / 2;
            cameraY = centerY - canvas.height / 2;
            clampCamera();
            return;
        }

        // Move selected unit one step
        const selectedUnit = units.find(u => u.selected);
        if (selectedUnit && selectedUnit.movesLeft > 0) {
            const dx = Math.abs(tileX - selectedUnit.x);
            const dy = Math.abs(tileY - selectedUnit.y);
            const terrainHere = map[tileY][tileX];
            const canMove = terrainHere !== 'water' && terrainHere !== 'mountain';
            if ((dx + dy === 1) && canMove) {
                const enemy = units.find(u => u.owner !== 'player' && u.x === tileX && u.y === tileY);
                if (enemy) {
                    const ud = UNITS[selectedUnit.type];
                    const ed = UNITS[enemy.type];
                    const atk = ((ud && ud.attack) || (selectedUnit.strength && selectedUnit.strength.attack) || 1) * (selectedUnit.veteran ? 1.5 : 1);
                    const def = ((ed && ed.defense) || (enemy.strength && enemy.strength.defense) || 1) * (enemy.veteran ? 1.5 : 1);
                    if (Math.random() < atk / (atk + def)) {
                        units = units.filter(u => u !== enemy);
                        logCombat(`${selectedUnit.type} defeats ${enemy.type}!`);
                        selectedUnit.x = tileX;
                        selectedUnit.y = tileY;
                        exploreAround(tileX, tileY, 1);
                    } else {
                        units = units.filter(u => u !== selectedUnit);
                        logCombat(`${enemy.type} defeats ${selectedUnit.type}!`);
                    }
                    if (selectedUnit) selectedUnit.movesLeft = 0;
                } else {
                    selectedUnit.x = tileX;
                    selectedUnit.y = tileY;
                    exploreAround(tileX, tileY, 1);
                    selectedUnit.movesLeft--;
                    totalMoves++;
                    const centerX = selectedUnit.x * tileSize + tileSize / 2;
                    const centerY = selectedUnit.y * tileSize + tileSize / 2;
                    cameraX = centerX - canvas.width / 2;
                    cameraY = centerY - canvas.height / 2;
                    clampCamera();
                    if (selectedUnit.movesLeft <= 0) selectedUnit.selected = false;
                }
            }
        }
    });

    canvas.addEventListener('wheel', (e) => {
        e.preventDefault();
        const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
        const oldSize = tileSize;
        tileSize = Math.max(5, Math.min(50, tileSize * zoomFactor));
        // Adjust camera to zoom toward mouse
        const rect = canvas.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;
        const worldX = mx + cameraX;
        const worldY = my + cameraY;
        cameraX = worldX - mx * (tileSize / oldSize);
        cameraY = worldY - my * (tileSize / oldSize);
        clampCamera();
    });

    // Touch controls
    let initialDistance = 0;
    let initialTouches = [];
    let isPanning = false;
    let isTouchPanning = false;

    canvas.addEventListener('touchstart', (e) => {
        if (e.touches.length === 1) {
            isPanning = true;
            initialTouches = [{x: e.touches[0].clientX, y: e.touches[0].clientY}];
        } else if (e.touches.length === 2) {
            isTouchPanning = true;
            const touch1 = e.touches[0];
            const touch2 = e.touches[1];
            initialDistance = Math.hypot(touch2.clientX - touch1.clientX, touch2.clientY - touch1.clientY);
            initialTouches = [{x: touch1.clientX, y: touch1.clientY}, {x: touch2.clientX, y: touch2.clientY}];
        }
    });

    canvas.addEventListener('touchmove', (e) => {
        if (e.touches.length === 1 && isPanning) {
            e.preventDefault();
            const touch = e.touches[0];
            const dy = touch.clientY - initialTouches[0].y;
            const scale = 1 + dy / 200; // adjust sensitivity for zoom
            const oldSize = tileSize;
            tileSize = Math.max(5, Math.min(50, tileSize * scale));
            // Zoom toward touch point
            const rect = canvas.getBoundingClientRect();
            const mx = touch.clientX - rect.left;
            const my = touch.clientY - rect.top;
            const worldX = mx + cameraX;
            const worldY = my + cameraY;
            cameraX = worldX - mx * (tileSize / oldSize);
            cameraY = worldY - my * (tileSize / oldSize);
            clampCamera();
            initialTouches[0] = {x: touch.clientX, y: touch.clientY};
        } else if (e.touches.length === 2 && isTouchPanning) {
            e.preventDefault();
            const touch1 = e.touches[0];
            const touch2 = e.touches[1];
            const dx = (touch1.clientX + touch2.clientX) / 2 - (initialTouches[0].x + initialTouches[1].x) / 2;
            const dy = (touch1.clientY + touch2.clientY) / 2 - (initialTouches[0].y + initialTouches[1].y) / 2;
            cameraX -= dx;
            cameraY -= dy;
            clampCamera();
            initialTouches = [{x: touch1.clientX, y: touch1.clientY}, {x: touch2.clientX, y: touch2.clientY}];
        }
    });

    canvas.addEventListener('touchend', (e) => {
        if (e.touches.length < 1) {
            isPanning = false;
        }
        if (e.touches.length < 2) {
            isTouchPanning = false;
        }
    });

    canvas.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        const rect = canvas.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;
        const tileX = Math.floor((mx + cameraX) / tileSize);
        const tileY = Math.floor((my + cameraY) / tileSize);
        const city = cities.find(c => c.x === tileX && c.y === tileY);
        if (city && city.owner === 'player') {
            selectedCity = city;
            showCityMenu(city);
        }
    });

    window.addEventListener('keydown', (e) => {
        if (gameFrozen) return;
        if (e.key === ' ') {
            e.preventDefault();
            isSpaceDown = true;
        } else if (e.key === 'c' || e.key === 'C') {
            const sel = units.find(u => u.selected && u.owner === 'player' && u.type === 'settler');
            if (sel) {
                foundCity(sel.x, sel.y, 'player');
                units = units.filter(u => u !== sel);
            }
        }
    });

    window.addEventListener('keyup', (e) => {
        if (e.key === ' ') {
            isSpaceDown = false;
            isDragging = false;
        }
    });

    canvas.addEventListener('mouseleave', () => {
        tooltip.style.display = 'none';
        canvas.style.cursor = 'default';
        hoveredDir = null;
    });

    // ==================== UI BUTTONS & END TURN ====================
    const mapModeSelect = document.getElementById('mapMode');
    const newMapBtn = document.getElementById('newMapBtn');
    const newGameBtn = document.getElementById('newGameBtn');
    const endTurnBtn = document.getElementById('endTurnBtn');

    newMapBtn.addEventListener('click', () => {
        generateMap(mapModeSelect.value);
    });

    newGameBtn.addEventListener('click', () => {
        currentTurn = 1;
        research = 0;
        techLevel = 0;
        wondersBuilt = [];
        researchBonus = 0;
        startTime = performance.now();
        totalMoves = 0;
        intrigueLevel = 0;
        playerGold = 0;
        combatLog = [];
        diplomacy = {};
        selectedCity = null;
        generateMap(mapModeSelect.value);
    });

    // Helper: found a city for any owner
    function foundCity(x, y, owner, name) {
        cities.push({
            x, y, size: 1,
            name: name || `City ${cities.length + 1}`,
            owner,
            food: 0, shields: 0, revenue: 0, happiness: 'Content',
            productionQueue: ['warrior'],
            currentProduction: null,
            buildings: {},
            taxCollectors: 0, scientists: 0, entertainers: 0,
            mayorType: ['balanced', 'production', 'gold', 'research', 'happiness'][Math.floor(Math.random() * 5)]
        });
        exploreAround(x, y, 2);
    }

    function computeProductivity(cx, cy) {
        let bonus = 0;
        for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
                if (dx === 0 && dy === 0) continue;
                const nx = cx + dx, ny = cy + dy;
                if (nx < 0 || nx >= MAP_WIDTH || ny < 0 || ny >= MAP_HEIGHT) continue;
                const t = map[ny][nx];
                if (t === 'water') bonus += 0.1;
                else if (t === 'hills' || t === 'mountain') bonus += 0.2;
                else if (t === 'forest') bonus += 0.1;
                else if (t === 'plains') bonus += 0.05;
            }
        }
        return Math.min(bonus, 1.0);
    }

    function processCity(city) {
        const terrain = map[city.y][city.x];
        const baseYields = YIELDS[terrain] || {food: 0, shields: 0, trade: 0};
        const productivityBonus = computeProductivity(city.x, city.y);
        const pyramidsBonus = wondersBuilt.includes('pyramids') ? 1 : 0;

        let yields = {...baseYields};
        yields.food += pyramidsBonus;
        if (city.buildings && city.buildings.granary) yields.food += city.size;
        if (city.buildings && city.buildings.marketplace) yields.trade *= 1.5;
        const libraryBonus = (city.buildings && city.buildings.library) ? 1 : 0;

        const workers = Math.max(0, city.size - city.taxCollectors - city.scientists - city.entertainers);
        const workerRatio = city.size > 0 ? workers / city.size : 0;
        const effShields = yields.shields * workerRatio * (1 + productivityBonus);
        const effFood = yields.food * workerRatio;
        const tradePerSize = yields.trade * workerRatio * (1 + productivityBonus);

        city.food += effFood;
        city.shields += effShields;

        const goldGain = tradePerSize * (1 + (city.taxCollectors / Math.max(1, city.size)));
        const sciGain = tradePerSize * (city.scientists / Math.max(1, city.size)) + libraryBonus;
        city.revenue = Math.round(goldGain * 10) / 10;

        if (city.owner === 'player') {
            playerGold += goldGain;
            research += sciGain;
        }

        // Happiness (food deficit computed once)
        const foodDeficit = effFood < city.size * 2 ? 1 : 0;
        let unhappy = Math.max(0, city.size - 2) * (city.buildings && city.buildings.temple ? 0 : 1) + foodDeficit;
        unhappy -= city.entertainers;
        if (city.buildings && city.buildings.colosseum) unhappy -= city.size;
        city.happiness = unhappy > 0 ? `Unhappy (${unhappy})` : 'Content';

        // Growth
        const foodNeeded = city.size * 10;
        if (city.food >= foodNeeded) {
            city.size++;
            city.food -= foodNeeded;
            const roles = ['worker', 'taxCollector', 'scientist', 'entertainer'];
            const r = roles[Math.floor(Math.random() * roles.length)];
            if (r === 'taxCollector') city.taxCollectors++;
            else if (r === 'scientist') city.scientists++;
            else if (r === 'entertainer') city.entertainers++;
        }

        // Mayor AI (player only - AI manages own cities by simple rules below)
        if (city.owner === 'player' && Math.random() < 0.2) {
            const mt = city.mayorType;
            if (mt === 'production' && workers < city.size * 0.7) {
                if (city.taxCollectors > 0) city.taxCollectors--;
                else if (city.scientists > 0) city.scientists--;
                else if (city.entertainers > 0) city.entertainers--;
            } else if (mt === 'gold' && city.taxCollectors < city.size * 0.3 && workers > 0) city.taxCollectors++;
            else if (mt === 'research' && city.scientists < city.size * 0.3 && workers > 0) city.scientists++;
            else if (mt === 'happiness' && city.entertainers < city.size * 0.3 && workers > 0) city.entertainers++;
        }

        // Production
        const prodItem = city.currentProduction || city.productionQueue[0];
        const prodData = UNITS[prodItem] || BUILDINGS[prodItem];
        if (prodData && city.shields >= prodData.cost) {
            const isWonder = BUILDINGS[prodItem] && BUILDINGS[prodItem].wonder;
            if (isWonder && wondersBuilt.includes(prodItem)) {
                // Wonder already built; cancel and pick something new
                city.currentProduction = null;
                if (city.productionQueue[0] === prodItem) city.productionQueue.shift();
            } else {
                const itemType = city.currentProduction || city.productionQueue.shift();
                if (UNITS[itemType]) {
                    const ud = UNITS[itemType];
                    units.push({
                        x: city.x, y: city.y,
                        type: itemType,
                        owner: city.owner,
                        selected: false,
                        movesLeft: ud.movement,
                        strength: {attack: ud.attack, defense: ud.defense},
                        veteran: !!(city.buildings && city.buildings.barracks)
                    });
                } else if (BUILDINGS[itemType]) {
                    city.buildings = city.buildings || {};
                    city.buildings[itemType] = true;
                    if (BUILDINGS[itemType].wonder) wondersBuilt.push(itemType);
                }
                city.shields -= prodData.cost;
                city.currentProduction = null;
            }
        }

        // Queue defaults for AI
        if (city.owner !== 'player' && city.productionQueue.length === 0 && !city.currentProduction) {
            city.productionQueue.push(Math.random() < 0.5 ? 'warrior' : 'archer');
        }
    }

    function isPassable(x, y, unit) {
        if (x < 0 || x >= MAP_WIDTH || y < 0 || y >= MAP_HEIGHT) return false;
        const t = map[y][x];
        return t !== 'water' && t !== 'mountain';
    }

    endTurnBtn.addEventListener('click', () => {
        if (gameFrozen) return;
        currentTurn++;

        // Reset researchBonus each turn (recomputed in processCity)
        researchBonus = 0;

        // Reset movement for ALL units (guarded UNITS lookup)
        units.forEach(u => {
            const ud = UNITS[u.type];
            u.movesLeft = ud ? ud.movement : 1;
        });

        // Center camera on a player unit
        const playerUnit = units.find(u => u.owner === 'player');
        if (playerUnit) {
            cameraX = playerUnit.x * tileSize + tileSize / 2 - canvas.width / 2;
            cameraY = playerUnit.y * tileSize + tileSize / 2 - canvas.height / 2;
            clampCamera();
        }

        // City processing (all owners)
        cities.forEach(processCity);

        // Tech advance using TECH_COSTS
        const nextCost = TECH_COSTS[techLevel + 1];
        if (nextCost && research >= nextCost) {
            techLevel++;
            research -= nextCost;
        }

        // AI unit logic — collect deaths and apply once after the loop to avoid mutation-during-forEach
        const dead = new Set();
        units.forEach(unit => {
            if (dead.has(unit)) return;
            if (!unit.owner.startsWith('ai') || unit.movesLeft <= 0) return;

            // AI settler auto-found
            if (unit.type === 'settler') {
                unit.turnsOnLand = (unit.turnsOnLand || 0) + 1;
                if (isPassable(unit.x, unit.y, unit) && unit.turnsOnLand >= 3 + Math.floor(Math.random() * 3)) {
                    foundCity(unit.x, unit.y, unit.owner, `${unit.owner.toUpperCase()} City ${cities.length + 1}`);
                    dead.add(unit);
                    return;
                }
            }

            // Move toward nearest player target, terrain-aware
            const playerTargets = [
                ...units.filter(u => u.owner === 'player' && !dead.has(u)).map(u => ({x: u.x, y: u.y})),
                ...cities.filter(c => c.owner === 'player').map(c => ({x: c.x, y: c.y}))
            ];
            if (playerTargets.length === 0) { unit.movesLeft = 0; return; }
            const target = playerTargets[0];
            const candidates = [];
            const sx = target.x > unit.x ? 1 : target.x < unit.x ? -1 : 0;
            const sy = target.y > unit.y ? 1 : target.y < unit.y ? -1 : 0;
            if (sx !== 0) candidates.push([unit.x + sx, unit.y]);
            if (sy !== 0) candidates.push([unit.x, unit.y + sy]);
            candidates.push([unit.x + 1, unit.y], [unit.x - 1, unit.y], [unit.x, unit.y + 1], [unit.x, unit.y - 1]);
            for (const [cx, cy] of candidates) {
                if (!isPassable(cx, cy, unit)) continue;
                const blocker = units.find(u => !dead.has(u) && u.x === cx && u.y === cy && u.owner !== unit.owner);
                if (blocker) {
                    const ud = UNITS[unit.type];
                    const bd = UNITS[blocker.type];
                    const atk = ((ud && ud.attack) || 1) * (unit.veteran ? 1.5 : 1);
                    const def = ((bd && bd.defense) || 1) * (blocker.veteran ? 1.5 : 1);
                    if (Math.random() < atk / (atk + def)) {
                        dead.add(blocker);
                        logCombat(`${unit.type} (${unit.owner}) defeats ${blocker.type} (${blocker.owner})`);
                        unit.x = cx; unit.y = cy;
                    } else {
                        dead.add(unit);
                        logCombat(`${blocker.type} (${blocker.owner}) defeats ${unit.type} (${unit.owner})`);
                    }
                    return;
                }
                if (units.some(u => !dead.has(u) && u.x === cx && u.y === cy && u !== unit)) continue;
                unit.x = cx; unit.y = cy;
                exploreAround(unit.x, unit.y, 1);
                unit.movesLeft--;
                break;
            }
        });
        if (dead.size) units = units.filter(u => !dead.has(u));

        // Barbarian spawn (on land only)
        if (currentTurn % 8 === 0) {
            for (let tries = 0; tries < 30; tries++) {
                const bx = Math.floor(Math.random() * MAP_WIDTH);
                const by = Math.floor(Math.random() * MAP_HEIGHT);
                if (map[by][bx] !== 'water' && map[by][bx] !== 'mountain') {
                    units.push({
                        x: bx, y: by, type: 'warrior', owner: 'barbarian',
                        selected: false, movesLeft: 1,
                        strength: {attack: 1, defense: 1}, veteran: false
                    });
                    break;
                }
            }
        }

        // Diplomacy decay
        Object.keys(diplomacy).forEach(ai => { diplomacy[ai].relation -= 0.1; });

        // Victory check
        checkVictory();
    });

    // Update showCityMenu to include buildings and wonders
    function showCityMenu(city) {
        document.getElementById('cityName').textContent = city.name;
        document.getElementById('cityPop').textContent = city.size;
        document.getElementById('cityFood').textContent = city.food;
        const foodNeeded = city.size * 10;
        document.getElementById('foodNeeded').textContent = foodNeeded;
        document.getElementById('cityShields').textContent = city.shields;
        document.getElementById('cityRevenue').textContent = city.revenue;

        const surplus = city.food - foodNeeded;
        city.happiness = surplus > 5 ? 'Happy' : surplus > -5 ? 'Content' : 'Unhappy';
        document.getElementById('cityHappiness').textContent = city.happiness;

        // Citizen assignments
        const workers = city.size - city.taxCollectors - city.scientists - city.entertainers;
        document.getElementById('cityWorkers').textContent = workers;
        document.getElementById('cityTaxCollectors').textContent = city.taxCollectors;
        document.getElementById('cityScientists').textContent = city.scientists;
        document.getElementById('cityEntertainers').textContent = city.entertainers;

        // Mayor info
        const mayorDiv = document.getElementById('cityMayor') || document.createElement('div');
        mayorDiv.innerHTML = `<h5>Mayor: ${city.mayorType.charAt(0).toUpperCase() + city.mayorType.slice(1)}</h5>`;
        if (city.happiness.includes('Unhappy')) {
            mayorDiv.innerHTML += '<button id="forceElection">Force Election</button>';
        }
        if (!document.getElementById('cityMayor')) {
            document.getElementById('cityMenu').insertBefore(mayorDiv, document.getElementById('closeCityMenu'));
            mayorDiv.id = 'cityMayor';
        }

        // Calculate productivity bonus
        let productivityBonus = 0;
        for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
                if (dx === 0 && dy === 0) continue;
                const nx = city.x + dx;
                const ny = city.y + dy;
                if (nx >= 0 && nx < MAP_WIDTH && ny >= 0 && ny < MAP_HEIGHT) {
                    const terrain = map[ny][nx];
                    if (terrain === 'water') productivityBonus += 0.1;
                    else if (terrain === 'hills' || terrain === 'mountain') productivityBonus += 0.2;
                    else if (terrain === 'forest') productivityBonus += 0.1;
                    else if (terrain === 'plains') productivityBonus += 0.05;
                }
            }
        }
        productivityBonus = Math.min(productivityBonus, 1.0);

        // Calculate effective yields
        const terrain = map[city.y][city.x];
        const baseYields = YIELDS[terrain];
        let yields = {...baseYields};
        if (city.buildings?.granary) yields.food += city.size;
        if (city.buildings?.marketplace) yields.trade *= 1.5;

        document.getElementById('cityProductivity').textContent = (productivityBonus * 100).toFixed(0) + '%';
        document.getElementById('cityEffectiveShields').textContent = (yields.shields * (workers / city.size) * (1 + productivityBonus)).toFixed(1);
        // Production
        const current = city.currentProduction || city.productionQueue[0] || 'Nothing';
        document.getElementById('currentBuilding').textContent = current;
        
        // Queue
        const queueDiv = document.getElementById('productionQueue');
        queueDiv.innerHTML = '<h5>Queue:</h5>';
        city.productionQueue.slice(1).forEach(item => {
            const p = document.createElement('p');
            p.textContent = item;
            queueDiv.appendChild(p);
        });

        // Add buildings section
        const buildingsDiv = document.getElementById('cityBuildings') || document.createElement('div');
        buildingsDiv.innerHTML = '<h5>Buildings:</h5>';
        if (city.buildings) {
            Object.keys(city.buildings).forEach(b => {
                const p = document.createElement('p');
                p.textContent = BUILDINGS[b].name;
                buildingsDiv.appendChild(p);
            });
        } else {
            buildingsDiv.innerHTML += '<p>None</p>';
        }
        if (!document.getElementById('cityBuildings')) {
            document.getElementById('cityProduction').appendChild(buildingsDiv);
            buildingsDiv.id = 'cityBuildings';
        }

        document.getElementById('cityMenu').style.display = 'block';
    }

    // In-DOM production picker (replaces prompt())
    document.getElementById('changeProduction').addEventListener('click', () => {
        if (!selectedCity) return;
        let picker = document.getElementById('productionPicker');
        if (!picker) {
            picker = document.createElement('div');
            picker.id = 'productionPicker';
            picker.style.marginTop = '8px';
            picker.style.display = 'flex';
            picker.style.flexWrap = 'wrap';
            picker.style.gap = '4px';
            document.getElementById('cityProduction').appendChild(picker);
        }
        picker.innerHTML = '';
        const keys = [
            ...Object.keys(UNITS),
            ...Object.keys(BUILDINGS).filter(b => !BUILDINGS[b].wonder || !wondersBuilt.includes(b))
        ];
        keys.forEach(k => {
            const data = UNITS[k] || BUILDINGS[k];
            const btn = document.createElement('button');
            btn.textContent = `${data.name} (${data.cost})`;
            btn.addEventListener('click', () => {
                selectedCity.currentProduction = k;
                picker.remove();
                showCityMenu(selectedCity);
            });
            picker.appendChild(btn);
        });
    });

    // Citizen management buttons
    document.getElementById('decTax').addEventListener('click', () => {
        if (!selectedCity || selectedCity.taxCollectors <= 0) return;
        selectedCity.taxCollectors--;
        showCityMenu(selectedCity);
    });
    document.getElementById('incTax').addEventListener('click', () => {
        if (!selectedCity) return;
        const workers = selectedCity.size - selectedCity.taxCollectors - selectedCity.scientists - selectedCity.entertainers;
        if (workers > 0) {
            selectedCity.taxCollectors++;
            showCityMenu(selectedCity);
        }
    });
    document.getElementById('decSci').addEventListener('click', () => {
        if (!selectedCity || selectedCity.scientists <= 0) return;
        selectedCity.scientists--;
        showCityMenu(selectedCity);
    });
    document.getElementById('incSci').addEventListener('click', () => {
        if (!selectedCity) return;
        const workers = selectedCity.size - selectedCity.taxCollectors - selectedCity.scientists - selectedCity.entertainers;
        if (workers > 0) {
            selectedCity.scientists++;
            showCityMenu(selectedCity);
        }
    });
    document.getElementById('decEnt').addEventListener('click', () => {
        if (!selectedCity || selectedCity.entertainers <= 0) return;
        selectedCity.entertainers--;
        showCityMenu(selectedCity);
    });
    document.getElementById('incEnt').addEventListener('click', () => {
        if (!selectedCity) return;
        const workers = selectedCity.size - selectedCity.taxCollectors - selectedCity.scientists - selectedCity.entertainers;
        if (workers > 0) {
            selectedCity.entertainers++;
            showCityMenu(selectedCity);
        }
    });

    // Force election button
    document.addEventListener('click', (e) => {
        if (e.target.id === 'forceElection' && selectedCity) {
            selectedCity.mayorType = ['balanced', 'production', 'gold', 'research', 'happiness'][Math.floor(Math.random() * 5)];
            showCityMenu(selectedCity);
        }
    });

    // Close city menu button
    document.getElementById('closeCityMenu').addEventListener('click', () => {
        document.getElementById('cityMenu').style.display = 'none';
        selectedCity = null;
    });

    // ==================== SAVE / LOAD ====================
    const SAVE_KEY = 'civSave';
    function saveGame() {
        try {
            const data = {
                map, units, cities, explored,
                currentTurn, techLevel, research,
                playerGold, wondersBuilt, researchBonus,
                diplomacy, combatLog
            };
            localStorage.setItem(SAVE_KEY, JSON.stringify(data));
            logCombat('Game saved.');
        } catch (e) {
            logCombat('Save failed: ' + e.message);
        }
    }
    function loadGame() {
        try {
            const raw = localStorage.getItem(SAVE_KEY);
            if (!raw) { logCombat('No save found.'); return; }
            const d = JSON.parse(raw);
            map = d.map; units = d.units; cities = d.cities; explored = d.explored;
            currentTurn = d.currentTurn; techLevel = d.techLevel; research = d.research;
            playerGold = d.playerGold; wondersBuilt = d.wondersBuilt || [];
            researchBonus = d.researchBonus || 0;
            diplomacy = d.diplomacy || {};
            combatLog = d.combatLog || [];
            gameFrozen = false;
            const vm = document.getElementById('victoryModal');
            if (vm) vm.remove();
            logCombat('Game loaded.');
        } catch (e) {
            logCombat('Load failed: ' + e.message);
        }
    }
    const saveBtn = document.createElement('button');
    saveBtn.id = 'saveBtn'; saveBtn.textContent = 'Save';
    saveBtn.addEventListener('click', saveGame);
    const loadBtn = document.createElement('button');
    loadBtn.id = 'loadBtn'; loadBtn.textContent = 'Load';
    loadBtn.addEventListener('click', loadGame);
    endTurnBtn.insertAdjacentElement('afterend', loadBtn);
    endTurnBtn.insertAdjacentElement('afterend', saveBtn);

    // ==================== VICTORY ====================
    function checkVictory() {
        const rivalCities = cities.filter(c => c.owner !== 'player').length;
        if (techLevel >= 9) showVictory('Tech Victory! You reached Future Tech.');
        else if (cities.some(c => c.owner === 'player') && rivalCities === 0 && cities.length > 0)
            showVictory('Domination Victory! All rivals eliminated.');
    }
    function showVictory(msg) {
        if (gameFrozen) return;
        gameFrozen = true;
        const overlay = document.createElement('div');
        overlay.id = 'victoryModal';
        overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;z-index:9999;color:#fff;font-family:Arial,sans-serif;';
        overlay.innerHTML = `<div style="background:#222;padding:30px 40px;border:2px solid gold;border-radius:8px;text-align:center;">
            <h1 style="color:gold;margin:0 0 10px;">Victory</h1>
            <p style="margin:0 0 20px;">${msg}</p>
            <button id="victoryClose">Continue Watching</button>
        </div>`;
        document.body.appendChild(overlay);
        document.getElementById('victoryClose').addEventListener('click', () => {
            overlay.remove();
            gameFrozen = false;
        });
    }

    // Start the game
    resizeCanvas();
    generateMap('random');
    render();

    console.log("Civ 1 Better - Square grid version loaded! Use mouse to select/move, press C on settler to found city, End Turn to progress.");
});