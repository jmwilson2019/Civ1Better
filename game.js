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
    plains: {food: 2, shields: 0, trade: 1},
    forest: {food: 1, shields: 2, trade: 0},
    hills: {food: 1, shields: 2, trade: 1},
    mountain: {food: 0, shields: 1, trade: 0},
    tundra: {food: 1, shields: 0, trade: 0},
    jungle: {food: 3, shields: 0, trade: 1}
};

let map = [];
let units = [];
let cities = [];
let currentTurn = 1;
let research = 0;
let techLevel = 0;

const TECH_COSTS = [0, 20, 50, 100, 200, 300, 400, 500, 600, 700];
const TECH_NAMES = ['', 'Bronze Working', 'Iron Working', 'Writing', 'Horseback Riding', 
                    'Navigation', 'Flight', 'Industrial Age', 'Modern Age', 'Future Tech'];

let startTime = performance.now();
let totalMoves = 0;
let intrigueLevel = 0;
let wondersBuilt = [];
let researchBonus = 0;

// ==================== CAMERA / VIEWPORT ====================
let cameraX = 0;
let cameraY = 0;
let isDragging = false;
let dragStartX = 0, dragStartY = 0;
let dragStartCamX = 0, dragStartCamY = 0;
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

    // AI starts
    const aiCivs = ['ai1', 'ai2'];
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
                food: 0, shields: 0,
                productionQueue: ['warrior'],
                currentProduction: null
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

        let color = '#ff4444';
        if (unit.owner === 'player') {
            color = unit.type === 'settler' ? '#ffcc00' : '#ff2222';
        } else if (unit.owner.startsWith('ai')) {
            color = '#4488ff';
        } else if (unit.owner === 'barbarian') {
            color = '#bb00bb';
        }

        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(sx, sy, tileSize * 0.38, 0, Math.PI * 2);
        ctx.fill();

        if (unit.selected) {
            ctx.strokeStyle = '#ffff00';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(sx, sy, tileSize * 0.48, 0, Math.PI * 2);
            ctx.stroke();
        }
    });

    // Draw cities (skip off-screen)
    cities.forEach(city => {
        const sx = city.x * tileSize + tileSize / 2 - cameraX;
        const sy = city.y * tileSize + tileSize / 2 - cameraY;
        if (sx < -20 || sx > canvas.width + 20) return;
        if (sy < -20 || sy > canvas.height + 20) return;

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

    // Update UI
    document.getElementById('turnCounter').textContent = `Turn: ${currentTurn}`;
    document.getElementById('techDisplay').textContent =
        `Tech: ${techLevel} (${TECH_NAMES[techLevel] || 'None'}) | Research: ${research}/${TECH_COSTS[techLevel + 1] || 'Max'}`;

    requestAnimationFrame(render);
}

// ==================== MOUSE INTERACTION ====================
canvas.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    isDragging = false;
    dragStartX = e.clientX;
    dragStartY = e.clientY;
    dragStartCamX = cameraX;
    dragStartCamY = cameraY;
});

canvas.addEventListener('mousemove', (e) => {
    const dx = e.clientX - dragStartX;
    const dy = e.clientY - dragStartY;

    // Pan camera when dragging
    if (e.buttons === 1 && (Math.abs(dx) > 3 || Math.abs(dy) > 3)) {
        isDragging = true;
        cameraX = dragStartCamX - dx;
        cameraY = dragStartCamY - dy;
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
        return;
    }

    // Move selected unit one step
    const selectedUnit = units.find(u => u.selected);
    if (selectedUnit && selectedUnit.movesLeft > 0) {
        const dx = Math.abs(tileX - selectedUnit.x);
        const dy = Math.abs(tileY - selectedUnit.y);
        const isWaterTile = map[tileY][tileX] === 'water';
        const canMove = selectedUnit.type === 'battleship'
            ? map[tileY][tileX] !== 'mountain'
            : !isWaterTile && map[tileY][tileX] !== 'mountain';
        if ((dx + dy === 1) && canMove) {
            selectedUnit.x = tileX;
            selectedUnit.y = tileY;
            selectedUnit.movesLeft--;
            totalMoves++;
            if (selectedUnit.movesLeft <= 0) selectedUnit.selected = false;
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
    generateMap(mapModeSelect.value);
});

endTurnBtn.addEventListener('click', () => {
    currentTurn++;

    // Reset player movement
    units.forEach(u => {
        if (u.owner === 'player') u.movesLeft = 2;
    });

    // Process cities (growth + production)
    cities.forEach(city => {
        const terrain = map[city.y][city.x];
        const y = YIELDS[terrain];
        city.food += y.food * city.size;
        city.shields += y.shields * city.size;

        const foodNeeded = city.size * 10;
        if (city.food >= foodNeeded) {
            city.size++;
            city.food -= foodNeeded;
        }

        // Simple production (only warriors for now)
        if (city.shields >= 15) {
            units.push({
                x: city.x,
                y: city.y - 1,
                type: 'warrior',
                owner: city.owner,
                selected: false,
                movesLeft: 2,
                strength: 2
            });
            city.shields -= 15;
        }
    });

    // Research
    const trade = cities.reduce((sum, c) => sum + YIELDS[map[c.y][c.x]].trade * c.size, 0);
    research += trade + researchBonus;
    if (research >= TECH_COSTS[techLevel + 1] && techLevel < TECH_COSTS.length - 1) {
        research -= TECH_COSTS[techLevel + 1];
        techLevel++;
    }

    // Very simple barbarian spawn every 6 turns
    if (currentTurn % 6 === 0) {
        const randCity = cities[Math.floor(Math.random() * cities.length)];
        if (randCity) {
            units.push({
                x: randCity.x + 1,
                y: randCity.y,
                type: 'barbarian',
                owner: 'barbarian',
                selected: false,
                movesLeft: 1,
                strength: 1.5
            });
        }
    }
});

document.addEventListener('keydown', (e) => {
    if (e.key.toLowerCase() === 'c') {
        const settler = units.find(u => u.selected && u.type === 'settler' && u.owner === 'player');
        if (settler) {
            const terrain = map[settler.y][settler.x];
            if (terrain === 'plains' || terrain === 'forest') {
                cities.push({
                    x: settler.x,
                    y: settler.y,
                    size: 1,
                    name: `City ${cities.length + 1}`,
                    owner: 'player',
                    food: 0,
                    shields: 0,
                    productionQueue: ['warrior'],
                    currentProduction: null
                });
                units = units.filter(u => u !== settler);
                console.log('City founded!');
            }
        }
    }
});

// Start the game
resizeCanvas();
generateMap('random');
render();

console.log("Civ 1 Better - Square grid version loaded! Use mouse to select/move, press C on settler to found city, End Turn to progress.");