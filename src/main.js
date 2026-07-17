const canvas = document.querySelector('#game');
const ctx = canvas.getContext('2d');
const statusEl = document.querySelector('#status');

const WORLD_SIZE = 72;
const TILE_W = 54;
const TILE_H = 27;
const HEIGHT_STEP = 15;
const VIEW_RADIUS = 15;
const REACH = 4.5;
const MOVE_REPEAT_MS = 115;

const BLOCKS = {
  grass:  { char: '▓', top: '#65b85e', left: '#3f7e45', right: '#4e9852', solid: true },
  dirt:   { char: '▒', top: '#9a6a43', left: '#70472d', right: '#825637', solid: true },
  stone:  { char: '█', top: '#8a918d', left: '#606763', right: '#747b77', solid: true },
  sand:   { char: '░', top: '#d8c27c', left: '#a99457', right: '#baa762', solid: true },
  water:  { char: '≈', top: '#4c8fc7', left: '#2e668f', right: '#397aa7', solid: false },
  wood:   { char: '║', top: '#a36d38', left: '#704921', right: '#87592b', solid: true },
  leaves: { char: '♣', top: '#3f934b', left: '#286631', right: '#347b3e', solid: true },
  coal:   { char: '◆', top: '#343a37', left: '#202522', right: '#2a302d', solid: true }
};

const HOTBAR = ['grass', 'dirt', 'stone', 'sand', 'wood', 'leaves'];
const keys = new Set();
let seed = Math.floor(Math.random() * 1_000_000);
let world = [];
let selected = 0;
let hovered = null;
let lastMoveAt = 0;

const inventory = {
  grass: 20,
  dirt: 40,
  stone: 32,
  sand: 18,
  wood: 16,
  leaves: 20
};

const player = { x: 36, y: 36, z: 0 };

function mulberry32(value) {
  return function random() {
    value |= 0;
    value = value + 0x6D2B79F5 | 0;
    let t = Math.imul(value ^ value >>> 15, 1 | value);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function hashNoise(x, y, salt = 0) {
  const n = Math.sin(x * 127.1 + y * 311.7 + seed * 0.017 + salt * 91.3) * 43758.5453;
  return n - Math.floor(n);
}

function smoothNoise(x, y, scale, salt = 0) {
  const sx = x / scale;
  const sy = y / scale;
  const x0 = Math.floor(sx);
  const y0 = Math.floor(sy);
  const tx = sx - x0;
  const ty = sy - y0;
  const fade = t => t * t * (3 - 2 * t);
  const a = hashNoise(x0, y0, salt);
  const b = hashNoise(x0 + 1, y0, salt);
  const c = hashNoise(x0, y0 + 1, salt);
  const d = hashNoise(x0 + 1, y0 + 1, salt);
  const ix0 = a + (b - a) * fade(tx);
  const ix1 = c + (d - c) * fade(tx);
  return ix0 + (ix1 - ix0) * fade(ty);
}

function surfaceType(height, moisture) {
  if (height <= 1) return 'water';
  if (height === 2 && moisture < 0.52) return 'sand';
  if (height >= 7) return 'stone';
  return 'grass';
}

function generateWorld() {
  const random = mulberry32(seed);
  world = Array.from({ length: WORLD_SIZE }, (_, y) =>
    Array.from({ length: WORLD_SIZE }, (_, x) => {
      const broad = smoothNoise(x, y, 18, 1);
      const detail = smoothNoise(x, y, 7, 2);
      const ridge = Math.abs(smoothNoise(x, y, 11, 3) - 0.5) * 2;
      const height = Math.max(0, Math.min(9, Math.floor(1 + broad * 5 + detail * 3 - ridge * 1.5)));
      const moisture = smoothNoise(x, y, 13, 4);
      const top = surfaceType(height, moisture);
      const treeChance = top === 'grass' && height >= 3 && height <= 6 && random() < 0.045;
      return {
        height,
        top,
        tree: treeChance,
        ore: top === 'stone' && random() < 0.15 ? 'coal' : null
      };
    })
  );

  player.x = Math.floor(WORLD_SIZE / 2);
  player.y = Math.floor(WORLD_SIZE / 2);
  findSafeSpawn();
  hovered = null;
}

function findSafeSpawn() {
  for (let radius = 0; radius < 16; radius += 1) {
    for (let dy = -radius; dy <= radius; dy += 1) {
      for (let dx = -radius; dx <= radius; dx += 1) {
        const x = Math.floor(WORLD_SIZE / 2) + dx;
        const y = Math.floor(WORLD_SIZE / 2) + dy;
        const tile = getTile(x, y);
        if (tile && tile.top !== 'water' && !tile.tree) {
          player.x = x;
          player.y = y;
          player.z = tile.height;
          return;
        }
      }
    }
  }
}

function getTile(x, y) {
  if (x < 0 || y < 0 || x >= WORLD_SIZE || y >= WORLD_SIZE) return null;
  return world[y][x];
}

function worldToScreen(x, y, z = 0) {
  const relX = x - player.x;
  const relY = y - player.y;
  return {
    x: canvas.width / 2 + (relX - relY) * TILE_W / 2,
    y: canvas.height / 2 + (relX + relY) * TILE_H / 2 - z * HEIGHT_STEP
  };
}

function polygon(points, fill, stroke = null) {
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i += 1) ctx.lineTo(points[i].x, points[i].y);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 1;
    ctx.stroke();
  }
}

function drawBlock(x, y, tile) {
  const p = worldToScreen(x, y, tile.height);
  const def = BLOCKS[tile.ore || tile.top];
  const halfW = TILE_W / 2;
  const halfH = TILE_H / 2;
  const depth = Math.max(8, tile.height * HEIGHT_STEP + 8);

  const top = [
    { x: p.x, y: p.y - halfH },
    { x: p.x + halfW, y: p.y },
    { x: p.x, y: p.y + halfH },
    { x: p.x - halfW, y: p.y }
  ];
  const left = [top[3], top[2], { x: top[2].x, y: top[2].y + depth }, { x: top[3].x, y: top[3].y + depth }];
  const right = [top[2], top[1], { x: top[1].x, y: top[1].y + depth }, { x: top[2].x, y: top[2].y + depth }];

  if (tile.top !== 'water') {
    polygon(left, def.left, '#17221b');
    polygon(right, def.right, '#17221b');
  }
  polygon(top, def.top, '#1a281e');

  ctx.font = '700 18px "Cascadia Mono", Consolas, monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = tile.top === 'water' ? '#d7f0ff' : '#f1f5ef';
  ctx.globalAlpha = tile.top === 'water' ? 0.85 : 0.72;
  ctx.fillText(def.char, p.x, p.y + 1);
  ctx.globalAlpha = 1;

  if (tile.tree) drawTree(p.x, p.y - halfH, tile.height);
}

function drawTree(screenX, screenY) {
  const trunkBase = screenY - 2;
  ctx.font = '700 22px "Cascadia Mono", Consolas, monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.fillStyle = BLOCKS.wood.top;
  ctx.fillText('║', screenX, trunkBase - 4);
  ctx.font = '700 30px "Cascadia Mono", Consolas, monospace';
  ctx.fillStyle = BLOCKS.leaves.top;
  ctx.fillText('♣', screenX, trunkBase - 23);
}

function drawPlayer() {
  const tile = getTile(player.x, player.y);
  if (!tile) return;
  const p = worldToScreen(player.x, player.y, tile.height);
  ctx.font = '900 27px "Cascadia Mono", Consolas, monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.fillStyle = '#fff4c2';
  ctx.strokeStyle = '#142016';
  ctx.lineWidth = 4;
  ctx.strokeText('@', p.x, p.y - TILE_H / 2 + 1);
  ctx.fillText('@', p.x, p.y - TILE_H / 2 + 1);
}

function drawHover() {
  if (!hovered) return;
  const tile = getTile(hovered.x, hovered.y);
  if (!tile) return;
  const p = worldToScreen(hovered.x, hovered.y, tile.height);
  const halfW = TILE_W / 2;
  const halfH = TILE_H / 2;
  const points = [
    { x: p.x, y: p.y - halfH },
    { x: p.x + halfW, y: p.y },
    { x: p.x, y: p.y + halfH },
    { x: p.x - halfW, y: p.y }
  ];
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  points.slice(1).forEach(point => ctx.lineTo(point.x, point.y));
  ctx.closePath();
  ctx.strokeStyle = distanceToPlayer(hovered.x, hovered.y) <= REACH ? '#fff6aa' : '#e06b6b';
  ctx.lineWidth = 3;
  ctx.stroke();
}

function drawHotbar() {
  const slotW = 105;
  const totalW = HOTBAR.length * slotW;
  const x0 = canvas.width / 2 - totalW / 2;
  const y = canvas.height - 55;
  HOTBAR.forEach((type, index) => {
    const x = x0 + index * slotW;
    ctx.fillStyle = index === selected ? '#e9dfaa' : 'rgba(8, 17, 13, 0.88)';
    ctx.fillRect(x + 2, y, slotW - 4, 42);
    ctx.strokeStyle = index === selected ? '#fff7c7' : '#4b6252';
    ctx.lineWidth = index === selected ? 3 : 1;
    ctx.strokeRect(x + 2, y, slotW - 4, 42);
    ctx.font = '700 15px "Cascadia Mono", Consolas, monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = index === selected ? '#142016' : BLOCKS[type].top;
    ctx.fillText(`${index + 1} ${BLOCKS[type].char} ${inventory[type] ?? 0}`, x + 10, y + 21);
  });
}

function render() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
  gradient.addColorStop(0, '#1a3141');
  gradient.addColorStop(0.55, '#203829');
  gradient.addColorStop(1, '#07100b');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const visible = [];
  for (let y = player.y - VIEW_RADIUS; y <= player.y + VIEW_RADIUS; y += 1) {
    for (let x = player.x - VIEW_RADIUS; x <= player.x + VIEW_RADIUS; x += 1) {
      const tile = getTile(x, y);
      if (tile) visible.push({ x, y, tile });
    }
  }
  visible.sort((a, b) => (a.x + a.y) - (b.x + b.y) || a.tile.height - b.tile.height);
  visible.forEach(({ x, y, tile }) => drawBlock(x, y, tile));
  drawHover();
  drawPlayer();
  drawHotbar();

  const tile = getTile(player.x, player.y);
  statusEl.textContent = `seed ${seed} · x ${player.x} y ${player.y} · altura ${tile?.height ?? 0} · ${HOTBAR[selected]}`;
  requestAnimationFrame(render);
}

function canMoveTo(x, y) {
  const from = getTile(player.x, player.y);
  const to = getTile(x, y);
  if (!from || !to || to.top === 'water' || to.tree) return false;
  return Math.abs(to.height - from.height) <= 1;
}

function tryMove(dx, dy) {
  const x = player.x + dx;
  const y = player.y + dy;
  if (!canMoveTo(x, y)) return;
  player.x = x;
  player.y = y;
  player.z = getTile(x, y).height;
}

function updateMovement(now) {
  if (now - lastMoveAt < MOVE_REPEAT_MS) return;
  let dx = 0;
  let dy = 0;
  if (keys.has('w') || keys.has('arrowup')) dy -= 1;
  else if (keys.has('s') || keys.has('arrowdown')) dy += 1;
  else if (keys.has('a') || keys.has('arrowleft')) dx -= 1;
  else if (keys.has('d') || keys.has('arrowright')) dx += 1;
  if (dx || dy) {
    tryMove(dx, dy);
    lastMoveAt = now;
  }
  requestAnimationFrame(updateMovement);
}

function distanceToPlayer(x, y) {
  return Math.hypot(x - player.x, y - player.y);
}

function screenToTile(mouseX, mouseY) {
  let best = null;
  let bestScore = Infinity;
  for (let y = player.y - VIEW_RADIUS; y <= player.y + VIEW_RADIUS; y += 1) {
    for (let x = player.x - VIEW_RADIUS; x <= player.x + VIEW_RADIUS; x += 1) {
      const tile = getTile(x, y);
      if (!tile) continue;
      const p = worldToScreen(x, y, tile.height);
      const nx = Math.abs(mouseX - p.x) / (TILE_W / 2);
      const ny = Math.abs(mouseY - p.y) / (TILE_H / 2);
      const score = nx + ny;
      if (score <= 1.15 && score < bestScore) {
        bestScore = score;
        best = { x, y };
      }
    }
  }
  return best;
}

function mine(tileX, tileY) {
  if (distanceToPlayer(tileX, tileY) > REACH) return;
  if (tileX === player.x && tileY === player.y) return;
  const tile = getTile(tileX, tileY);
  if (!tile) return;
  if (tile.tree) {
    tile.tree = false;
    inventory.wood += 3;
    inventory.leaves += 2;
    return;
  }
  if (tile.top === 'water' || tile.height <= 0) return;
  const drop = tile.ore || tile.top;
  if (inventory[drop] !== undefined) inventory[drop] += 1;
  tile.height -= 1;
  tile.ore = null;
  tile.top = tile.height <= 1 ? 'water' : tile.height >= 7 ? 'stone' : tile.height === 2 ? 'sand' : 'dirt';
}

function place(tileX, tileY) {
  if (distanceToPlayer(tileX, tileY) > REACH) return;
  const tile = getTile(tileX, tileY);
  const type = HOTBAR[selected];
  if (!tile || tile.tree || (inventory[type] ?? 0) <= 0) return;
  if (tileX === player.x && tileY === player.y) return;
  tile.height = Math.min(11, tile.height + 1);
  tile.top = type;
  tile.ore = null;
  inventory[type] -= 1;
}

canvas.addEventListener('mousemove', event => {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  hovered = screenToTile((event.clientX - rect.left) * scaleX, (event.clientY - rect.top) * scaleY);
});

canvas.addEventListener('mouseleave', () => { hovered = null; });
canvas.addEventListener('contextmenu', event => event.preventDefault());
canvas.addEventListener('mousedown', event => {
  if (!hovered) return;
  if (event.button === 0) mine(hovered.x, hovered.y);
  if (event.button === 2) place(hovered.x, hovered.y);
});

window.addEventListener('keydown', event => {
  const key = event.key.toLowerCase();
  keys.add(key);
  if (key >= '1' && key <= '6') selected = Number(key) - 1;
  if (key === 'r') {
    seed = Math.floor(Math.random() * 1_000_000);
    generateWorld();
  }
  if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(key)) {
    event.preventDefault();
  }
});
window.addEventListener('keyup', event => keys.delete(event.key.toLowerCase()));

window.addEventListener('resize', () => {
  const ratio = Math.min(2, window.devicePixelRatio || 1);
  const width = Math.max(900, Math.floor(canvas.clientWidth * ratio));
  const height = Math.floor(width * 9 / 16);
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
});

generateWorld();
window.dispatchEvent(new Event('resize'));
requestAnimationFrame(render);
requestAnimationFrame(updateMovement);
