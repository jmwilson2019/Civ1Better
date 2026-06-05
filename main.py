"""
Civ 1 Better — Python/Pygame Edition
Large tile map (200x120 = 24,000 tiles), drag-to-pan viewport,
Civ 1-style continent generation, units, cities, research, barbarians.

Controls:
  Click + drag   — scroll/pan the map
  Mouse wheel    — scroll vertically
  Click unit     — select it
  Click adj tile — move selected unit one step
  C key          — found city on selected settler (plains/forest)
  End Turn btn   — process turn, growth, research, barbarians
  Escape         — quit
"""
import pygame
import sys
import random
import math
import noise  # type: ignore
from typing import Any, Dict

# ==================== CONSTANTS ====================
view_size   = 42        # ← Screen pixels per logical tile (increased for bigger tiles/units)
MAP_WIDTH   = 200
MAP_HEIGHT  = 120
FPS         = 60
UI_H        = 70        # height of bottom UI bar in pixels

TERRAIN_COLORS = {
    'water':    (  0, 102, 204),
    'plains':   ( 76, 175,  80),
    'forest':   ( 46, 125,  50),
    'hills':    (141, 110,  99),
    'mountain': ( 85,  85,  85),
    'tundra':   (160, 160, 160),
    'jungle':   ( 30, 107,  30),
}

YIELDS = {
    'water':    {'food': 0, 'shields': 0, 'trade': 1},
    'plains':   {'food': 2, 'shields': 0, 'trade': 1},
    'forest':   {'food': 1, 'shields': 2, 'trade': 0},
    'hills':    {'food': 1, 'shields': 2, 'trade': 1},
    'mountain': {'food': 0, 'shields': 1, 'trade': 0},
    'tundra':   {'food': 1, 'shields': 0, 'trade': 0},
    'jungle':   {'food': 3, 'shields': 0, 'trade': 1},
}

TECH_COSTS = [0, 20, 50, 100, 200, 300, 400, 500, 600, 700]
TECH_NAMES = [
    '', 'Bronze Working', 'Iron Working', 'Writing', 'Horseback Riding',
    'Navigation', 'Flight', 'Industrial Age', 'Modern Age', 'Future Tech',
]

MAP_MODES = ['random', 'continents', 'islands', 'landlocked']

# ==================== GAME STATE ====================
from typing import Dict, Any, Tuple

GameState = Dict[str, Any]
Unit = Dict[str, Any]
City = Dict[str, Any]

g: GameState = {
    'map':            [],
    'units':          [],
    'cities':         [],
    'current_turn':   1,
    'research':       0,
    'tech_level':     0,
    'total_moves':    0,
    'wonders_built':  [],
    'research_bonus': 0,
    'camera_x':       0.0,
    'camera_y':       0.0,
}

# ==================== MAP GENERATION ====================
def generate_map(mode: str = 'random') -> None:
    # Start with heightmap using multi-octave noise (this is the key upgrade)
    height = [[0.0 for _ in range(MAP_WIDTH)] for _ in range(MAP_HEIGHT)]
    
    # Multiple noise layers for organic continents (upgraded to Perlin)
    for octave in range(6):  # more octaves = more detail
        freq = 2 ** octave
        amp = 1.0 / (2 ** octave)
        offset_x = random.random() * 10
        offset_y = random.random() * 10
        
        for y in range(MAP_HEIGHT):
            for x in range(MAP_WIDTH):
                nx = (x / MAP_WIDTH - 0.5) * freq + offset_x
                ny = (y / MAP_HEIGHT - 0.5) * freq + offset_y
                # Perlin noise (smoother, more natural continents)
                val: float = noise.pnoise2(nx, ny, octaves=octave+1, persistence=0.5, lacunarity=2.0, repeatx=MAP_WIDTH, repeaty=MAP_HEIGHT)  # type: ignore
                val = (val + 1.0) / 2.0  # Normalize to 0-1
                height[y][x] += val * amp

    # Normalize height
    max_h = max(max(row) for row in height)
    min_h = min(min(row) for row in height)
    for y in range(MAP_HEIGHT):
        for x in range(MAP_WIDTH):
            height[y][x] = (height[y][x] - min_h) / (max_h - min_h)

    # Create final map from height + mode parameters
    game_map = [['water'] * MAP_WIDTH for _ in range(MAP_HEIGHT)]
    land_target = {'random': 0.38, 'continents': 0.45, 'islands': 0.25, 'landlocked': 0.55}.get(mode, 0.38)

    for y in range(MAP_HEIGHT):
        lat = abs(y - MAP_HEIGHT / 2) / (MAP_HEIGHT / 2)  # 0 = equator, 1 = pole
        for x in range(MAP_WIDTH):
            h = height[y][x]
            
            # Base land/ocean
            if h < land_target:
                game_map[y][x] = 'water'
                continue

            # Terrain variety
            if lat > 0.78 and random.random() < 0.7:
                game_map[y][x] = 'tundra'
            elif h > 0.92:
                game_map[y][x] = 'mountain'
            elif h > 0.78:
                game_map[y][x] = 'hills'
            elif h > 0.65 and lat < 0.45 and random.random() < 0.6:
                game_map[y][x] = 'jungle'
            elif h > 0.55:
                game_map[y][x] = 'forest'
            else:
                game_map[y][x] = 'plains'

    # Optional light smoothing pass (removes tiny lakes)
    for _ in range(2):
        for y in range(1, MAP_HEIGHT-1):
            for x in range(1, MAP_WIDTH-1):
                if game_map[y][x] == 'water':
                    land_neighbors = sum(1 for dy in [-1,0,1] for dx in [-1,0,1] 
                                       if game_map[y+dy][x+dx] != 'water')
                    if land_neighbors >= 5:
                        game_map[y][x] = 'plains'

    # Player start
    px, py = MAP_WIDTH // 2, MAP_HEIGHT // 2
    if game_map[py][px] == 'water':
        game_map[py][px] = 'plains'

    g['map'] = game_map
    g['cities'] = []
    g['units'] = [{
        'x': px, 'y': py,
        'type': 'settler', 'owner': 'player',
        'selected': True, 'moves_left': 2, 'strength': 1,
    }]

    # AI starts (same as before)
    for ai_id in ['ai1', 'ai2']:
        for _ in range(200):
            ax = random.randint(5, MAP_WIDTH-6)
            ay = random.randint(5, MAP_HEIGHT-6)
            if game_map[ay][ax] != 'water' and game_map[ay][ax] != 'mountain':
                game_map[ay][ax] = 'plains'
                g['cities'].append({  # type: ignore
                    'x': ax, 'y': ay, 'size': 1,
                    'name': f'{ai_id.upper()} City',
                    'owner': ai_id,
                    'food': 0, 'shields': 0,
                    'production_queue': ['warrior'],
                    'current_production': None,
                })
                g['units'].append({  # type: ignore
                    'x': ax, 'y': ay,
                    'type': 'settler', 'owner': ai_id,
                    'selected': False, 'moves_left': 2, 'strength': 1,
                })
                break

    # Center camera on player
    g['camera_x'] = float(max(0, px * view_size - 640))
    g['camera_y'] = float(max(0, py * view_size - 365))

# ==================== END TURN ====================
def end_turn() -> None:
    g['current_turn'] += 1

    # Restore player movement
    for u in g['units']:
        if u['owner'] == 'player':
            u['moves_left'] = 2

    # City growth + production
    for city in g['cities']:
        terr   = g['map'][city['y']][city['x']]
        y_data = YIELDS.get(terr, {'food': 0, 'shields': 0, 'trade': 0})
        city['food']    += y_data['food']    * city['size']
        city['shields'] += y_data['shields'] * city['size']

        food_need = city['size'] * 10
        if city['food'] >= food_need:
            city['size'] += 1
            city['food'] -= food_need

        if city['shields'] >= 15:
            spawn_y = max(0, city['y'] - 1)
            g['units'].append({
                'x': city['x'], 'y': spawn_y,
                'type': 'warrior', 'owner': city['owner'],
                'selected': False, 'moves_left': 2, 'strength': 2,
            })
            city['shields'] -= 15

    # Research
    trade = sum(
        YIELDS.get(g['map'][c['y']][c['x']], {'trade': 0})['trade'] * c['size']
        for c in g['cities']
    )
    g['research'] += trade + g['research_bonus']
    tl = g['tech_level']
    if tl + 1 < len(TECH_COSTS) and g['research'] >= TECH_COSTS[tl + 1]:
        g['research'] -= TECH_COSTS[tl + 1]
        g['tech_level'] += 1

    # Barbarian spawn every 6 turns
    if g['current_turn'] % 6 == 0 and g['cities']:
        city = random.choice(g['cities'])
        bx = min(city['x'] + 1, MAP_WIDTH - 1)
        by = city['y']
        if g['map'][by][bx] not in ('water', 'mountain'):
            g['units'].append({
                'x': bx, 'y': by,
                'type': 'barbarian', 'owner': 'barbarian',
                'selected': False, 'moves_left': 1, 'strength': 1.5,
            })

# ==================== BUTTON CLASS ====================
class Button:
    def __init__(self, x: int, y: int, w: int, h: int, text: str, font: pygame.font.Font,
                 bg: Tuple[int, int, int] = (68, 68, 68), hov: Tuple[int, int, int] = (100, 100, 100),
                 fg: Tuple[int, int, int] = (255, 255, 255), border: Tuple[int, int, int] = (130, 130, 130)) -> None:
        self.rect   = pygame.Rect(x, y, w, h)
        self.text   = text
        self.font   = font
        self.bg     = bg
        self.hov    = hov
        self.fg     = fg
        self.border = border
        self._hot   = False

    def update(self, mpos: Tuple[int, int]) -> None:
        self._hot = self.rect.collidepoint(mpos)

    def clicked(self, mpos: Tuple[int, int]) -> bool:
        return self.rect.collidepoint(mpos)

    def draw(self, surf: pygame.Surface) -> None:
        c = self.hov if self._hot else self.bg
        pygame.draw.rect(surf, c,          self.rect, border_radius=4)
        pygame.draw.rect(surf, self.border, self.rect, 1, border_radius=4)
        lbl = self.font.render(self.text, True, self.fg)
        surf.blit(lbl, lbl.get_rect(center=self.rect.center))

# ==================== HELPERS ====================
def clamp_camera(sw: int, sh: int) -> None:
    vw = sw
    vh = sh - UI_H
    g['camera_x'] = max(0.0, min(g['camera_x'], MAP_WIDTH  * view_size - vw))
    g['camera_y'] = max(0.0, min(g['camera_y'], MAP_HEIGHT * view_size - vh))

def tile_at(mx: int, my: int) -> Tuple[int, int]:
    return (
        int((mx + g['camera_x']) // view_size),
        int((my + g['camera_y']) // view_size),
    )

def draw_procedural_flag(screen: pygame.Surface, owner: str, x: int, y: int, size: int) -> None:
    if owner == 'player':
        col = (255, 220, 0)  # Yellow
    elif owner.startswith('ai'):
        col = (68, 136, 255)  # Blue
    elif owner == 'barbarian':
        col = (187, 0, 187)  # Purple
    else:
        col = (200, 200, 200)
    # Rect base
    pygame.draw.rect(screen, col, (x, y, size, size//2))
    # Triangle emblem
    pygame.draw.polygon(screen, (0, 0, 0), [(x+2, y+2), (x+size-2, y+2), (x+size//2, y+size//2 - 2)])

def draw_procedural_unit(screen: pygame.Surface, u_type: str, owner: str, sx: int, sy: int, size: int) -> None:
    col = {'player': (255, 204, 0), 'ai': (68, 136, 255), 'barbarian': (187, 0, 187)}.get(owner, (200, 200, 200))
    half = size // 2
    if u_type == 'settler':
        # Simple cart: rect body + circle wheels
        pygame.draw.rect(screen, col, (sx - half + 4, sy - half + 8, half - 8, 12))  # Body
        pygame.draw.circle(screen, (0, 0, 0), (sx - half + 8, sy + half - 8), 4)  # Wheels
        pygame.draw.circle(screen, (0, 0, 0), (sx + half - 8, sy + half - 8), 4)
    elif u_type == 'warrior':
        # Stick figure with sword (fallback if no tank)
        pygame.draw.circle(screen, col, (sx, sy - 8), 6)  # Head
        pygame.draw.line(screen, col, (sx, sy - 2), (sx, sy + 10), 4)  # Body
        pygame.draw.line(screen, col, (sx - 8, sy), (sx + 8, sy), 3)  # Arms
        pygame.draw.line(screen, col, (sx, sy + 10), (sx, sy + half), 4)  # Legs
        # Sword
        pygame.draw.line(screen, (169, 169, 169), (sx + 8, sy), (sx + 16, sy - 8), 2)
    elif u_type == 'archer':
        # Figure with bow
        pygame.draw.circle(screen, col, (sx, sy - 8), 6)  # Head
        pygame.draw.line(screen, col, (sx, sy - 2), (sx, sy + 10), 4)  # Body
        # Bow: arc
        pygame.draw.arc(screen, col, (sx - 12, sy - 4, 24, 16), 0, math.pi * 2, 3)
        # Arrow
        pygame.draw.line(screen, (139, 69, 19), (sx, sy + 2), (sx + 12, sy + 2), 2)

# ==================== MAIN ====================
def main() -> None:
    global view_size
    pygame.init()
    screen: pygame.Surface = pygame.display.set_mode((1280, 800), pygame.RESIZABLE)
    pygame.display.set_caption('Civ 1 Better  —  Python/Pygame Edition')
    clock = pygame.time.Clock()

    font_s = pygame.font.SysFont('Arial', 11)
    font_m = pygame.font.SysFont('Arial', 13, bold=True)
    font_l = pygame.font.SysFont('Arial', 16, bold=True)

    mode_idx = 0

    # Show loading screen while map generates
    screen.fill((20, 20, 20))
    msg = font_l.render('Generating world…', True, (200, 200, 200))
    screen.blit(msg, msg.get_rect(center=(screen.get_width() // 2, screen.get_height() // 2)))
    pygame.display.flip()

    generate_map(MAP_MODES[mode_idx])

    # ---- Asset Loading ----
    flags: Dict[str, pygame.Surface] = {}
    unit_surfs: Dict[str, pygame.Surface] = {}
    city_surf = None

    # ---- Build buttons ----
    def make_buttons(sh: int) -> Dict[str, Button]:
        by = sh - UI_H + 14
        btns = {
            'new_game': Button(10,  by, 110, 36, 'New Game',  font_m),
            'new_map':  Button(130, by, 100, 36, 'New Map',   font_m),
            'end_turn': Button(240, by, 110, 36, 'End Turn',  font_m),
            'map_mode': Button(360, by, 145, 36,
                               f'Mode: {MAP_MODES[mode_idx]}', font_m,
                               bg=(40, 70, 40), hov=(60, 100, 60),
                               border=(90, 140, 90)),
        }
        return btns

    buttons = make_buttons(screen.get_height())

    # ---- Pan state ----
    pan_active   = False
    pan_start    = (0, 0)
    pan_cam_orig = (0.0, 0.0)
    did_pan      = False

    # ---- Tooltip ----
    tip_lines = []
    tip_pos   = (0, 0)
    tip_vis   = False

    # ---- Directional arrows state ----
    hovered_dir = None  # 'up', 'down', 'left', 'right' or None

    running = True
    while running:
        sw, sh = screen.get_size()
        vw, vh = sw, sh - UI_H
        mpos = pygame.mouse.get_pos()
        mx, my = mpos

        # Update button hover
        for btn in buttons.values():
            btn.update(mpos)

        hovered_dir = None  # Reset each frame

        # ---- EVENTS ----
        for ev in pygame.event.get():
            if ev.type == pygame.QUIT:
                running = False

            elif ev.type == pygame.VIDEORESIZE:
                screen = pygame.display.set_mode(ev.size, pygame.RESIZABLE)
                sw, sh = screen.get_size()
                vw, vh = sw, sh - UI_H
                buttons = make_buttons(sh)
                clamp_camera(sw, sh)

            elif ev.type == pygame.KEYDOWN:
                if ev.key == pygame.K_ESCAPE:
                    running = False

                elif ev.key == pygame.K_c:
                    settler = next(
                        (u for u in g['units']
                         if u['selected'] and u['type'] == 'settler'
                         and u['owner'] == 'player'),
                        None
                    )
                    if settler:
                        t = g['map'][settler['y']][settler['x']]
                        if t in ('plains', 'forest'):
                            g['cities'].append({
                                'x': settler['x'], 'y': settler['y'],
                                'size': 1,
                                'name': f'City {len(g["cities"]) + 1}',
                                'owner': 'player',
                                'food': 0, 'shields': 0,
                                'production_queue': ['warrior'],
                                'current_production': None,
                            })
                            g['units'] = [u for u in g['units'] if u is not settler]

                # Pan controls with arrow keys
                pan_speed = view_size  # 1 tile per press
                if ev.key == pygame.K_LEFT:
                    g['camera_x'] = max(0, g['camera_x'] - pan_speed)
                elif ev.key == pygame.K_RIGHT:
                    g['camera_x'] = min(MAP_WIDTH * view_size - sw, g['camera_x'] + pan_speed)
                elif ev.key == pygame.K_UP:
                    g['camera_y'] = max(0, g['camera_y'] - pan_speed)
                elif ev.key == pygame.K_DOWN:
                    g['camera_y'] = min(MAP_HEIGHT * view_size - vh, g['camera_y'] + pan_speed)
                clamp_camera(sw, sh)  # Ensure bounds after pan

            elif ev.type == pygame.MOUSEWHEEL:
                old_vs: int = view_size
                new_vs: int = max(6, min(80, view_size + ev.y * 3))
                if new_vs != old_vs:
                    cx_tile = (g['camera_x'] + mx) / old_vs
                    cy_tile = (g['camera_y'] + my) / old_vs
                    g['camera_x'] = cx_tile * new_vs - mx
                    g['camera_y'] = cy_tile * new_vs - my
                    clamp_camera(sw, sh)
                    view_size = new_vs

            elif ev.type == pygame.MOUSEMOTION:
                if pan_active and pygame.mouse.get_pressed()[0]:
                    ddx = mx - pan_start[0]
                    ddy = my - pan_start[1]
                    if abs(ddx) > 10 or abs(ddy) > 10:  # Increased threshold to avoid wheel conflict
                        did_pan = True
                        g['camera_x'] = pan_cam_orig[0] - ddx
                        g['camera_y'] = pan_cam_orig[1] - ddy
                        clamp_camera(sw, sh)
                        tip_vis = False
                elif my < sh - UI_H:
                    tx, ty = tile_at(mx, my)
                    if 0 <= tx < MAP_WIDTH and 0 <= ty < MAP_HEIGHT:
                        # Check for directional hover if unit selected
                        sel = next((u for u in g['units'] if u['selected']), None)
                        if sel and sel['moves_left'] > 0:
                            ddx = tx - sel['x']
                            ddy = ty - sel['y']
                            wt = g['map'][ty][tx]
                            can_move = (ddx + abs(ddy) == 1) and wt not in ('water', 'mountain')  # Adjacent and valid terrain
                            if can_move:
                                if ddx == 1 and ddy == 0:
                                    hovered_dir = 'right'
                                elif ddx == -1 and ddy == 0:
                                    hovered_dir = 'left'
                                elif ddx == 0 and ddy == 1:
                                    hovered_dir = 'down'
                                elif ddx == 0 and ddy == -1:
                                    hovered_dir = 'up'

                        terr   = g['map'][ty][tx]
                        yd     = YIELDS.get(terr, {'food': 0, 'shields': 0, 'trade': 0})
                        tip_lines = [
                            f'({tx}, {ty})  {terr.upper()}',
                            f'Food: {yd["food"]}   Shields: {yd["shields"]}   Trade: {yd["trade"]}',
                        ]
                        city = next((c for c in g['cities'] if c['x'] == tx and c['y'] == ty), None)
                        unit = next((u for u in g['units']  if u['x'] == tx and u['y'] == ty), None)
                        if city:
                            tip_lines.append(f'City: {city["name"]}  Pop: {city["size"]}  ({city["owner"]})')
                        if unit:
                            tip_lines.append(f'Unit: {unit["type"]}  ({unit["owner"]})  MP: {unit["moves_left"]}')
                        if hovered_dir:
                            tip_lines.append(f'Move {hovered_dir.upper()}?')
                        tip_pos = (mx, my)
                        tip_vis = True
                    else:
                        tip_vis = False
                else:
                    tip_vis = False

            elif ev.type == pygame.MOUSEBUTTONDOWN:
                if ev.button == 1 and my < sh - UI_H and not pan_active:
                    pan_active = True
                    pan_start = mpos
                    pan_cam_orig = (g['camera_x'], g['camera_y'])
                    did_pan = False

            elif ev.type == pygame.MOUSEBUTTONUP:
                if ev.button == 1:
                    pan_active = False

                    if my >= sh - UI_H:
                        # UI button clicks
                        if buttons['new_game'].clicked(mpos):
                            g.update({
                                'current_turn': 1, 'research': 0, 'tech_level': 0,
                                'wonders_built': [], 'research_bonus': 0, 'total_moves': 0,
                            })
                            generate_map(MAP_MODES[mode_idx])

                        elif buttons['new_map'].clicked(mpos):
                            generate_map(MAP_MODES[mode_idx])

                        elif buttons['end_turn'].clicked(mpos):
                            end_turn()

                        elif buttons['map_mode'].clicked(mpos):
                            mode_idx = (mode_idx + 1) % len(MAP_MODES)
                            buttons['map_mode'].text = f'Mode: {MAP_MODES[mode_idx]}'

                    elif not did_pan:
                        # Map click — select or move
                        tx, ty = tile_at(mx, my)
                        if 0 <= tx < MAP_WIDTH and 0 <= ty < MAP_HEIGHT:
                            clicked_u = next((u for u in g['units']
                                      if u['x'] == tx and u['y'] == ty), None)
                            if clicked_u:
                                for u in g['units']:
                                    u['selected'] = False
                                clicked_u['selected'] = True
                            else:
                                sel = next((u for u in g['units'] if u['selected']), None)
                                if sel and sel['moves_left'] > 0:
                                    ddx = abs(tx - sel['x'])
                                    ddy = abs(ty - sel['y'])
                                    wt  = g['map'][ty][tx]
                                    if sel['type'] == 'battleship':
                                        can = wt != 'mountain'
                                    else:
                                        can = wt not in ('water', 'mountain')
                                    if ddx + ddy == 1 and can:
                                        sel['x'] = tx
                                        sel['y'] = ty
                                        sel['moves_left'] -= 1
                                        g['total_moves'] += 1
                                        if sel['moves_left'] <= 0:
                                            sel['selected'] = False

        # ---- RENDER ----
        cam_ix = int(g['camera_x'])
        cam_iy = int(g['camera_y'])

        screen.fill((8, 35, 110))  # deep ocean background

        # Viewport-culled direct tile drawing
        start_x = max(0, cam_ix // view_size - 1)
        start_y = max(0, cam_iy // view_size - 1)
        end_x   = min(MAP_WIDTH,  (cam_ix + vw) // view_size + 2)
        end_y   = min(MAP_HEIGHT, (cam_iy + vh) // view_size + 2)
        grid_col = (35, 45, 55)

        for ty2 in range(start_y, end_y):
            for tx2 in range(start_x, end_x):
                color = TERRAIN_COLORS.get(g['map'][ty2][tx2], (80, 80, 80))
                sx = tx2 * view_size - cam_ix
                sy = ty2 * view_size - cam_iy
                # Add subtle terrain details for more visual depth
                if g['map'][ty2][tx2] == 'water':
                    # Waves: lighter horizontal lines
                    for wave_y in range(0, view_size, 4):
                        wave_alpha = 0.3 if wave_y % 8 < 4 else 0.1
                        wave_col = tuple(int(c * (1 - wave_alpha)) for c in color)
                        pygame.draw.line(screen, wave_col, (sx, sy + wave_y), (sx + view_size, sy + wave_y))
                elif g['map'][ty2][tx2] == 'plains':
                    # Grass patches: small green dots
                    for _ in range(5):
                        px = sx + random.randint(2, view_size - 2)
                        py = sy + random.randint(2, view_size - 2)
                        pygame.draw.circle(screen, (34, 139, 34), (int(px), int(py)), 1)
                elif g['map'][ty2][tx2] == 'forest':
                    # Tree trunks/leaves: vertical lines + green tops
                    trunk_h = view_size // 3
                    leaf_h = view_size - trunk_h
                    trunk_col = (101, 67, 33)
                    leaf_col = (0, 100, 0)
                    trunk_w = 2
                    # Trunk
                    pygame.draw.rect(screen, trunk_col, (sx + view_size//2 - trunk_w//2, sy + leaf_h, trunk_w, trunk_h))
                    # Leaves
                    pygame.draw.circle(screen, leaf_col, (sx + view_size//2, sy + leaf_h//2), view_size//3)
                elif g['map'][ty2][tx2] == 'hills':
                    # Hill contour: gradient circle
                    hill_surf = pygame.Surface((view_size, view_size), pygame.SRCALPHA)
                    for r in range(view_size//2, 0, -1):
                        alpha = int(255 * (r / (view_size//2)))
                        col = (*color, alpha)
                        pygame.draw.circle(hill_surf, col, (view_size//2, view_size//2), r)
                    screen.blit(hill_surf, (sx, sy))
                elif g['map'][ty2][tx2] == 'mountain':
                    # Peaks: gray triangles
                    peak_h = view_size * 2 // 3
                    peak_col = (169, 169, 169)
                    pygame.draw.polygon(screen, peak_col, [
                        (sx + view_size//2, sy + view_size - peak_h),
                        (sx, sy + view_size),
                        (sx + view_size, sy + view_size)
                    ])
                elif g['map'][ty2][tx2] == 'tundra':
                    # Snow patches: white dots
                    for _ in range(3):
                        px = sx + random.randint(2, view_size - 2)
                        py = sy + random.randint(2, view_size - 2)
                        pygame.draw.circle(screen, (255, 255, 255), (int(px), int(py)), 2)
                elif g['map'][ty2][tx2] == 'jungle':
                    # Dense leaves: overlapping green circles
                    for _ in range(8):
                        cx = sx + random.randint(0, view_size)
                        cy = sy + random.randint(0, view_size)
                        r = random.randint(2, 5)
                        pygame.draw.circle(screen, (0, 128, 0), (cx, cy), r)
                
                # Base tile fill (behind details)
                pygame.draw.rect(screen, color, (sx, sy, view_size, view_size))
                if view_size >= 8:
                    pygame.draw.rect(screen, grid_col, (sx, sy, view_size, view_size), 1)

        # Draw directional arrows for moves (if unit selected and hovering adjacent)
        sel = next((u for u in g['units'] if u['selected']), None)
        if sel and hovered_dir:
            # Calculate target tile position
            ddx, ddy = {'right': (1, 0), 'left': (-1, 0), 'down': (0, 1), 'up': (0, -1)}[hovered_dir]
            tx, ty = sel['x'] + ddx, sel['y'] + ddy
            tsx = tx * view_size - cam_ix
            tsy = ty * view_size - cam_iy
            arrow_size = view_size // 4
            arrow_col = (0, 255, 0)  # Green for valid move
            # Simple arrow polygon (pointing toward direction)
            arrow_points = []
            if hovered_dir == 'right':
                arrow_points = [(tsx + 5, tsy + view_size//2 - arrow_size//2), (tsx + 5 + arrow_size, tsy + view_size//2), (tsx + 5, tsy + view_size//2 + arrow_size//2)]
            elif hovered_dir == 'left':
                arrow_points = [(tsx + view_size - 5, tsy + view_size//2 - arrow_size//2), (tsx + view_size - 5 - arrow_size, tsy + view_size//2), (tsx + view_size - 5, tsy + view_size//2 + arrow_size//2)]
            elif hovered_dir == 'down':
                arrow_points = [(tsx + view_size//2 - arrow_size//2, tsy + view_size - 5), (tsx + view_size//2, tsy + view_size - 5 - arrow_size), (tsx + view_size//2 + arrow_size//2, tsy + view_size - 5)]
            elif hovered_dir == 'up':
                arrow_points = [(tsx + view_size//2 - arrow_size//2, tsy + 5), (tsx + view_size//2, tsy + 5 + arrow_size), (tsx + view_size//2 + arrow_size//2, tsy + 5)]
            pygame.draw.polygon(screen, arrow_col, arrow_points)
            # Outline for visibility
            pygame.draw.polygon(screen, (0, 0, 0), arrow_points, 1)

        # Draw units (viewport-culled)
        for u in g['units']:
            sx = u['x'] * view_size + view_size // 2 - cam_ix
            sy = u['y'] * view_size + view_size // 2 - cam_iy
            if not (-view_size < sx < vw + view_size and
                    -view_size < sy < vh + view_size):
                continue
            key = f"{u['owner']}_{u['type']}"
            if key in unit_surfs:
                screen.blit(unit_surfs[key], (sx - view_size//2, sy - view_size//2))
                size = view_size
            else:
                # Fallback circle
                if u['owner'] == 'player':
                    col = (255, 204,   0) if u['type'] == 'settler' else (255, 50, 50)
                elif u['owner'].startswith('ai'):
                    col = ( 68, 136, 255)
                elif u['owner'] == 'barbarian':
                    col = (187,   0, 187)
                else:
                    col = (200, 200, 200)
                r = max(2, int(view_size * 0.38))
                pygame.draw.circle(screen, col, (sx, sy), r)
                size = r * 2

            if u['selected']:
                pygame.draw.circle(screen, (255, 255, 0), (sx, sy), size // 2 + 2, 2)

            # Flag overlay
            if u['owner'] in flags:
                screen.blit(flags[u['owner']], (sx - 8, sy - size//2 - 18))
            else:
                draw_procedural_flag(screen, u['owner'], sx - 8, sy - size//2 - 18, 16)

        flag_size = 16
        # Draw cities (viewport-culled)
        for c in g['cities']:
            cx = c['x'] * view_size + view_size // 2 - cam_ix
            cy = c['y'] * view_size + view_size // 2 - cam_iy
            if not (-20 < cx < vw + 20 and -20 < cy < vh + 20):
                continue
            if city_surf:
                # Blit building icon, tint by owner
                icon = city_surf.copy()
                tint = (255, 220, 100) if c['owner'] == 'player' else (130, 180, 255)
                icon.fill(tint, special_flags=pygame.BLEND_MULT)
                screen.blit(icon, (cx - view_size//2, cy - view_size//2))
            else:
                # Fallback rect
                bg_col = (255, 220, 100) if c['owner'] == 'player' else (130, 180, 255)
                pygame.draw.rect(screen, bg_col, (cx - 7, cy - 5, 14, 10))
                pygame.draw.rect(screen, (0, 0, 0), (cx - 7, cy - 5, 14, 10), 1)
            lbl = font_s.render(str(c['size']), True, (0, 0, 0))
            screen.blit(lbl, lbl.get_rect(center=(cx, cy)))

            # Flag overlay for city
            if c['owner'] in flags:
                screen.blit(flags[c['owner']], (cx - flag_size//2, cy - 12))
            else:
                draw_procedural_flag(screen, c['owner'], cx - flag_size//2, cy - 12, flag_size)

        # ---- UI BAR ----
        pygame.draw.rect(screen, (28, 28, 28), (0, sh - UI_H, sw, UI_H))
        pygame.draw.line(screen, (70, 70, 70), (0, sh - UI_H), (sw, sh - UI_H))

        # Reposition buttons in case window was resized
        for btn in buttons.values():
            btn.rect.y = sh - UI_H + 14
        buttons['new_game'].rect.x  = 10
        buttons['new_map'].rect.x   = 130
        buttons['end_turn'].rect.x  = 240
        buttons['map_mode'].rect.x  = 360
        for btn in buttons.values():
            btn.draw(screen)

        # Stat text
        tl: int = g['tech_level']
        tech_name: str = TECH_NAMES[tl] if tl < len(TECH_NAMES) else 'Max'
        next_cost: str = str(TECH_COSTS[tl + 1]) if tl + 1 < len(TECH_COSTS) else '—'

        t_turn = font_l.render(f'Turn {g["current_turn"]}',  True, (255, 255, 255))
        t_tech = font_s.render(
            f'Tech {tl}: {tech_name}    Research {g["research"]} / {next_cost}',
            True, (180, 205, 255))
        t_stat = font_s.render(
            f'Cities: {len(g["cities"])}   Units: {len(g["units"])}   Moves: {g["total_moves"]}',
            True, (175, 230, 175))

        screen.blit(t_turn, (520, sh - UI_H +  8))
        screen.blit(t_tech, (520, sh - UI_H + 30))
        screen.blit(t_stat, (520, sh - UI_H + 50))

        # Map coord display (bottom right)
        tx, ty = tile_at(mx, my)
        if 0 <= tx < MAP_WIDTH and 0 <= ty < MAP_HEIGHT and my < sh - UI_H:
            coord = font_s.render(f'({tx}, {ty})', True, (160, 160, 160))
            screen.blit(coord, (sw - coord.get_width() - 10, sh - UI_H - 18))

        # ---- TOOLTIP ----
        if tip_vis and tip_lines:
            pad = 6
            lh  = font_s.get_linesize()
            tw  = max(font_s.size(ln)[0] for ln in tip_lines) + pad * 2
            th  = len(tip_lines) * lh + pad * 2
            tx2 = min(tip_pos[0] + 14, sw - tw - 2)
            ty2 = min(tip_pos[1] + 14, sh - UI_H - th - 2)
            tip_surf = pygame.Surface((tw, th), pygame.SRCALPHA)
            tip_surf.fill((20, 20, 20, 215))
            screen.blit(tip_surf, (tx2, ty2))
            pygame.draw.rect(screen, (100, 100, 100), (tx2, ty2, tw, th), 1)
            for i, ln in enumerate(tip_lines):
                ls = font_s.render(ln, True,
                    (255, 230, 130) if i == 0 else (230, 230, 230))
                screen.blit(ls, (tx2 + pad, ty2 + pad + i * lh))

        pygame.display.flip()
        clock.tick(FPS)

    pygame.quit()
    sys.exit()


if __name__ == '__main__':
    main()
