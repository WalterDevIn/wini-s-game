const canvas = document.querySelector('#game');
const ctx = canvas.getContext('2d');
const statusEl = document.querySelector('#status');

const TILE = 24;
const WORLD_W = 360;
const WORLD_H = 120;
const GRAVITY = 32;
const REACH = 5.5;
const FONT = '700 20px "Cascadia Mono", Consolas, monospace';

const BLOCKS = {
  air:    { char: ' ', solid: false, color: '#000000', drop: null },
  grass:  { char: '▓', solid: true,  color: '#65b85e', drop: 'dirt' },
  dirt:   { char: '▒', solid: true,  color: '#9a6a43', drop: 'dirt' },
  stone:  { char: '█', solid: true,  color: '#87908b', drop: 'stone' },
  coal:   { char: '◆', solid: true,  color: '#303735', drop: 'coal' },
  iron:   { char: '¤', solid: true,  color: '#c78f69', drop: 'iron' },
  wood:   { char: '║', solid: true,  color: '#a36d38', drop: 'wood' },
  leaves: { char: '♣', solid: true,  color: '#3f934b', drop: 'leaves' },
  sand:   { char: '░', solid: true,  color: '#d8c27c', drop: 'sand' },
  water:  { char: '≈', solid: false, color: '#4c8fc7', drop: null },
  bedrock:{ char: '▓', solid: true,  color: '#3e4442', drop: null }
};

const HOTBAR = ['dirt', 'stone', 'wood', 'leaves', 'sand', 'coal'];
const keys = new Set();
let world = [];
let surface = [];
let selected = 0;
let seed = Math.floor(Math.random() * 1_000_000);
let camera = { x: 0, y: 0 };
let mouse = { x: 0, y: 0, tileX: 0, tileY: 0 };
let lastTime = performance.now();

const player = {
  x: 12,
  y: 20,
  w: 0.72,
  h: 1.8,
  vx: 0,
  vy: 0,
  grounded: false,
  facing: 1,
  inventory: { dirt: 24, stone: 8, wood: 10, leaves: 4, sand: 6, coal: 0, iron: 0 }
};

function hash(x, y = 0, s = seed) {
  let n = x * 374761393 + y * 668265263 + s * 69069;
  n = (n ^ (n >> 13)) * 1274126177;
  return ((n ^ (n >> 16)) >>> 0) / 4294967295;
}

function smoothNoise(x, scale, offset = 0) {
  const p = x / scale;
  const i = Math.floor(p);
  const t = p - i;
  const a = hash(i, offset);
  const b = hash(i + 1, offset);
  const ease = t * t * (3 - 2 * t);
  return a + (b - a) * ease;
}

function makeWorld() {
  world = Array.from({ length: WORLD_H }, () => Array(WORLD_W).fill('air'));
  surface = Array(WORLD_W).fill(0);

  for (let x = 0; x < WORLD_W; x++) {
    const continental = smoothNoise(x, 52, 11) * 11;
    const hills = smoothNoise(x, 17, 23) * 8;
    const detail = smoothNoise(x, 6, 47) * 3;
    const ground = Math.floor(31 + continental + hills + detail);
    surface[x] = ground;

    const desert = smoothNoise(x, 60, 101) > 0.72;
    for (let y = ground; y < WORLD_H; y++) {
      let type = y === WORLD_H - 1 ? 'bedrock' : y === ground ? (desert ? 'sand' : 'grass') : y < ground + 4 ? (desert ? 'sand' : 'dirt') : 'stone';
      if (type === 'stone') {
        const cave = hash(x, y, seed + 400) > 0.81 && smoothNoise(x + y * 0.35, 9, 71) > 0.48;
        if (cave && y > ground + 5 && y < WORLD_H - 2) type = 'air';
        else if (hash(x, y, seed + 900) > 0.965) type = 'iron';
        else if (hash(x, y, seed + 700) > 0.925) type = 'coal';
      }
      world[y][x] = type;
    }
  }

  addWater();
  addTrees();
  spawnPlayer();
}

function addWater() {
  const seaLevel = 39;
  for (let x = 1; x < WORLD_W - 1; x++) {
    if (surface[x] > seaLevel) {
      for (let y = seaLevel; y < surface[x]; y++) world[y][x] = 'water';
      if (world[surface[x]][x] === 'grass') world[surface[x]][x] = 'sand';
    }
  }
}

function addTrees() {
  for (let x = 5; x < WORLD_W - 5; x++) {
    const y = surface[x];
    if (world[y][x] !== 'grass' || hash(x, 0, seed + 1200) < 0.87) continue;
    const height = 3 + Math.floor(hash(x, 1, seed + 1200) * 3);
    for (let i = 1; i <= height; i++) world[y - i][x] = 'wood';
    const crownY = y - height;
    for (let oy = -2; oy <= 1; oy++) {
      for (let ox = -2; ox <= 2; ox++) {
        if (Math.abs(ox) + Math.abs(oy) > 3) continue;
        const tx = x + ox;
        const ty = crownY + oy;
        if (world[ty]?.[tx] === 'air') world[ty][tx] = 'leaves';
      }
    }
    x += 3;
  }
}

function spawnPlayer() {
  let x = 12;
  while (x < WORLD_W - 12 && (world[surface[x]][x] === 'water' || world[surface[x] - 1][x] !== 'air')) x++;
  player.x = x + 0.15;
  player.y = surface[x] - player.h - 0.1;
  player.vx = 0;
  player.vy = 0;
}

function tileAt(x, y) {
  if (x < 0 || x >= WORLD_W || y < 0 || y >= WORLD_H) return 'bedrock';
  return world[y][x];
}

function isSolid(x, y) {
  return BLOCKS[tileAt(x, y)].solid;
}

function collides(x, y) {
  const left = Math.floor(x + 0.05);
  const right = Math.floor(x + player.w - 0.05);
  const top = Math.floor(y + 0.05);
  const bottom = Math.floor(y + player.h - 0.05);
  return isSolid(left, top) || isSolid(right, top) || isSolid(left, bottom) || isSolid(right, bottom);
}

function update(dt) {
  const move = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0);
  player.vx += move * 36 * dt;
  player.vx *= Math.pow(player.grounded ? 0.0008 : 0.05, dt);
  player.vx = Math.max(-7, Math.min(7, player.vx));
  if (move) player.facing = move;

  player.vy += GRAVITY * dt;
  player.vy = Math.min(player.vy, 18);

  moveAxis('x', player.vx * dt);
  player.grounded = false;
  moveAxis('y', player.vy * dt);

  if (player.y > WORLD_H + 5) spawnPlayer();
  updateCamera(dt);
}

function moveAxis(axis, amount) {
  const steps = Math.max(1, Math.ceil(Math.abs(amount) / 0.08));
  const delta = amount / steps;
  for (let i = 0; i < steps; i++) {
    const nx = axis === 'x' ? player.x + delta : player.x;
    const ny = axis === 'y' ? player.y + delta : player.y;
    if (!collides(nx, ny)) {
      player[axis] += delta;
    } else {
      if (axis === 'y' && delta > 0) player.grounded = true;
      player[axis === 'x' ? 'vx' : 'vy'] = 0;
      break;
    }
  }
}

function jump() {
  if (player.grounded) {
    player.vy = -11.5;
    player.grounded = false;
  }
}

function updateCamera(dt) {
  const visibleW = canvas.width / TILE;
  const visibleH = canvas.height / TILE;
  const targetX = player.x + player.w / 2 - visibleW / 2;
  const targetY = player.y + player.h / 2 - visibleH / 2;
  camera.x += (targetX - camera.x) * Math.min(1, dt * 7);
  camera.y += (targetY - camera.y) * Math.min(1, dt * 7);
  camera.x = Math.max(0, Math.min(WORLD_W - visibleW, camera.x));
  camera.y = Math.max(0, Math.min(WORLD_H - visibleH, camera.y));
}

function inReach(tx, ty) {
  const px = player.x + player.w / 2;
  const py = player.y + player.h / 2;
  return Math.hypot(tx + 0.5 - px, ty + 0.5 - py) <= REACH;
}

function mine(tx, ty) {
  if (!inReach(tx, ty)) return;
  const type = tileAt(tx, ty);
  const block = BLOCKS[type];
  if (type === 'air' || type === 'water' || type === 'bedrock') return;
  world[ty][tx] = 'air';
  if (block.drop) player.inventory[block.drop] = (player.inventory[block.drop] || 0) + 1;
}

function place(tx, ty) {
  if (!inReach(tx, ty) || tileAt(tx, ty) !== 'air') return;
  const type = HOTBAR[selected];
  if ((player.inventory[type] || 0) <= 0) return;
  world[ty][tx] = type;
  if (collides(player.x, player.y)) {
    world[ty][tx] = 'air';
    return;
  }
  player.inventory[type]--;
}

function render() {
  ctx.fillStyle = '#102331';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  drawSky();
  ctx.font = FONT;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const startX = Math.max(0, Math.floor(camera.x) - 1);
  const endX = Math.min(WORLD_W, Math.ceil(camera.x + canvas.width / TILE) + 1);
  const startY = Math.max(0, Math.floor(camera.y) - 1);
  const endY = Math.min(WORLD_H, Math.ceil(camera.y + canvas.height / TILE) + 1);

  for (let y = startY; y < endY; y++) {
    for (let x = startX; x < endX; x++) {
      const type = world[y][x];
      if (type === 'air') continue;
      const block = BLOCKS[type];
      const sx = (x - camera.x) * TILE;
      const sy = (y - camera.y) * TILE;
      if (type === 'water') {
        ctx.fillStyle = 'rgba(56, 125, 181, .28)';
        ctx.fillRect(sx, sy, TILE, TILE);
      }
      ctx.fillStyle = block.color;
      ctx.fillText(block.char, sx + TILE / 2, sy + TILE / 2 + 1);
    }
  }

  drawPlayer();
  drawTarget();
  drawHud();
  statusEl.textContent = `Seed ${seed} · x ${Math.floor(player.x)} · y ${Math.floor(player.y)} · Overworld`;
}

function drawSky() {
  const horizon = Math.max(0, (41 - camera.y) * TILE);
  const gradient = ctx.createLinearGradient(0, 0, 0, Math.min(canvas.height, horizon + 250));
  gradient.addColorStop(0, '#143956');
  gradient.addColorStop(1, '#6a99a2');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, Math.max(canvas.height, horizon));
  ctx.fillStyle = '#f0df87';
  ctx.font = '32px monospace';
  ctx.fillText('☼', canvas.width - 90, 70);
}

function drawPlayer() {
  const x = (player.x + player.w / 2 - camera.x) * TILE;
  const y = (player.y + player.h / 2 - camera.y) * TILE;
  ctx.font = '700 34px "Cascadia Mono", Consolas, monospace';
  ctx.fillStyle = '#fff3c4';
  ctx.fillText('@', x, y);
  ctx.font = FONT;
}

function drawTarget() {
  const sx = (mouse.tileX - camera.x) * TILE;
  const sy = (mouse.tileY - camera.y) * TILE;
  ctx.strokeStyle = inReach(mouse.tileX, mouse.tileY) ? '#fff5a5' : '#d85b5b';
  ctx.lineWidth = 2;
  ctx.strokeRect(sx + 1, sy + 1, TILE - 2, TILE - 2);
}

function drawHud() {
  const boxW = 86;
  const totalW = HOTBAR.length * boxW;
  const startX = (canvas.width - totalW) / 2;
  const y = canvas.height - 72;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.font = '14px "Cascadia Mono", Consolas, monospace';

  HOTBAR.forEach((type, i) => {
    ctx.fillStyle = i === selected ? 'rgba(238, 225, 147, .24)' : 'rgba(5, 12, 8, .78)';
    ctx.fillRect(startX + i * boxW, y, boxW - 4, 54);
    ctx.strokeStyle = i === selected ? '#efe092' : '#52645a';
    ctx.strokeRect(startX + i * boxW, y, boxW - 4, 54);
    ctx.fillStyle = BLOCKS[type].color;
    ctx.font = '700 20px monospace';
    ctx.fillText(BLOCKS[type].char, startX + i * boxW + 9, y + 23);
    ctx.fillStyle = '#e8f1e9';
    ctx.font = '13px monospace';
    ctx.fillText(`${i + 1} ${type}`, startX + i * boxW + 31, y + 20);
    ctx.fillText(`x${player.inventory[type] || 0}`, startX + i * boxW + 31, y + 40);
  });

  ctx.fillStyle = 'rgba(5, 12, 8, .72)';
  ctx.fillRect(14, 14, 235, 62);
  ctx.fillStyle = '#e8f1e9';
  ctx.font = '14px monospace';
  ctx.fillText('OVERWORLD', 26, 38);
  ctx.fillStyle = '#9eb3a1';
  ctx.fillText(`carbón ${player.inventory.coal || 0} · hierro ${player.inventory.iron || 0}`, 26, 61);
}

function resizeCanvas() {
  const ratio = 16 / 9;
  const width = Math.min(1280, Math.max(640, window.innerWidth - 40));
  canvas.width = width;
  canvas.height = Math.round(width / ratio);
  ctx.imageSmoothingEnabled = false;
}

window.addEventListener('keydown', (event) => {
  keys.add(event.code);
  if (['Space', 'ArrowUp'].includes(event.code)) event.preventDefault();
  if (event.code === 'Space' || event.code === 'KeyW' || event.code === 'ArrowUp') jump();
  if (/^Digit[1-6]$/.test(event.code)) selected = Number(event.code.at(-1)) - 1;
  if (event.code === 'KeyR') {
    seed = Math.floor(Math.random() * 1_000_000);
    makeWorld();
  }
});
window.addEventListener('keyup', (event) => keys.delete(event.code));
window.addEventListener('resize', resizeCanvas);
canvas.addEventListener('contextmenu', (event) => event.preventDefault());
canvas.addEventListener('mousemove', (event) => {
  const rect = canvas.getBoundingClientRect();
  mouse.x = (event.clientX - rect.left) * canvas.width / rect.width;
  mouse.y = (event.clientY - rect.top) * canvas.height / rect.height;
  mouse.tileX = Math.floor(mouse.x / TILE + camera.x);
  mouse.tileY = Math.floor(mouse.y / TILE + camera.y);
});
canvas.addEventListener('mousedown', (event) => {
  if (event.button === 0) mine(mouse.tileX, mouse.tileY);
  if (event.button === 2) place(mouse.tileX, mouse.tileY);
});
canvas.addEventListener('wheel', (event) => {
  selected = (selected + Math.sign(event.deltaY) + HOTBAR.length) % HOTBAR.length;
  event.preventDefault();
}, { passive: false });

function loop(now) {
  const dt = Math.min(0.033, (now - lastTime) / 1000);
  lastTime = now;
  update(dt);
  render();
  requestAnimationFrame(loop);
}

resizeCanvas();
makeWorld();
requestAnimationFrame(loop);
