import { drawGame } from './render.js';

const canvas = document.querySelector('#game');
const ctx = canvas.getContext('2d');
const preview = globalThis.Twinkle?.preview;
const leaderboards = globalThis.Twinkle?.leaderboards;
const viewerApi = globalThis.Twinkle?.viewer;
const BOARD\_KEY = 'classic-run';

const TAU = Math.PI * 2;
const JUMP\_TIME = 0.76;
const SLIDE\_TIME = 0.58;
const PLAYER\_DEPTH = 0.9;
const keysToBlock = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', ' ', 'Spacebar', 'a', 'A', 'd', 'D', 'w', 'W', 's', 'S']);

const state = {
  width: 960,
  height: 540,
  mode: 'ready',
  time: 0,
  distance: 0,
  score: 0,
  best: 0,
  coins: 0,
  speed: 0.38,
  lane: 0,
  targetLane: 0,
  jump: 0,
  slide: 0,
  hover: 0,
  invuln: 0,
  spawnTimer: 0.35,
  sceneryTimer: 0,
  queue: [],
  obstacles: [],
  particles: [],
  scenery: [],
  shake: 0,
  flash: 0,
  freeze: 0,
  lastTelemetry: 0,
  lastLaneChange: 0,
  lb: { entries: [], personalBest: null, status: 'Loading scores...', busy: false, submitted: false, guestName: '' },
};

const patterns = [
  { level: 0, items: [{ kind: 'coin', lane: 0, gap: 0.16 }, { kind: 'hurdle', lane: 1, gap: 0.42 }, { kind: 'coin', lane: -1, gap: 0.36 }] },
  { level: 0, items: [{ kind: 'train', lane: 1, gap: 0.5 }, { kind: 'coin', lane: 0, gap: 0.16 }, { kind: 'hurdle', lane: -1, gap: 0.46 }] },
  { level: 0, items: [{ kind: 'hurdle', lanes: [-1, 1], gap: 0.54 }, { kind: 'coin', lane: 0, gap: 0.18 }, { kind: 'train', lane: 0, gap: 0.48 }] },
  { level: 1, items: [{ kind: 'coin', lanes: [-1, 0, 1], gap: 0.32 }, { kind: 'hurdle', lane: 1, gap: 0.58 }, { kind: 'coin', lane: -1, gap: 0.4 }] },
  { level: 1, items: [{ kind: 'train', lane: 0, gap: 0.46 }, { kind: 'hurdle', lane: -1, gap: 0.52 }, { kind: 'coin', lane: 1, gap: 0.38 }] },
  { level: 2, items: [{ kind: 'hurdle', lane: -1, gap: 0.42 }, { kind: 'train', lane: 1, gap: 0.52 }, { kind: 'coin', lane: 0, gap: 0.14 }, { kind: 'coin', lane: 0, gap: 0.4 }] },
  { level: 2, items: [{ kind: 'board', lane: 0, gap: 0.5 }, { kind: 'train', lane: 0, gap: 0.54 }, { kind: 'hurdle', lane: 1, gap: 0.44 }] },
  { level: 3, items: [{ kind: 'hurdle', lane: 1, gap: 0.34 }, { kind: 'hurdle', lane: 0, gap: 0.5 }, { kind: 'train', lane: -1, gap: 0.48 }] },
];

let lastTime = 0;
let resizeFrame = 0;
let pendingLayout = null;
let touchStart = null;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function setCanvasSize(layout) {
  const stage = layout?.stage || layout?.viewport || { width: 960, height: 540 };
  const width = Math.max(320, Math.floor(stage.width || 960));
  const height = Math.max(420, Math.floor(stage.height || 540));
  const ratio = globalThis.devicePixelRatio || 1;
  canvas.width = Math.floor(width * ratio);
  canvas.height = Math.floor(height * ratio);
  canvas.style.width = width + 'px';
  canvas.style.height = height + 'px';
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  state.width = width;
  state.height = height;
  preview?.setPlayfield?.({ x: 0, y: 0, width, height });
}

function scheduleResize(layout) {
  pendingLayout = layout;
  if (resizeFrame) return;
  resizeFrame = requestAnimationFrame(() => {
    resizeFrame = 0;
    setCanvasSize(pendingLayout);
  });
}

if (preview?.subscribe) preview.subscribe(scheduleResize, { immediate: true });
else setCanvasSize({ stage: { width: state.width, height: state.height } });

function resetGame() {
  state.mode = 'running';
  state.time = 0;
  state.distance = 0;
  state.score = 0;
  state.coins = 0;
  state.speed = 0.38;
  state.lane = 0;
  state.targetLane = 0;
  state.jump = 0;
  state.slide = 0;
  state.hover = 0;
  state.invuln = 0;
  state.spawnTimer = 0.25;
  state.sceneryTimer = 0;
  state.queue = [];
  state.obstacles = [];
  state.particles = [];
  state.scenery = [];
  state.shake = 0;
  state.flash = 0;
  state.freeze = 0;
  state.lastLaneChange = 0;
  state.lb.submitted = false;
  canvas.focus();
}

function endGame() {
  if (state.mode === 'gameover') return;
  const finalScore = Math.max(0, Math.floor(state.score));
  state.mode = 'gameover';
  state.best = Math.max(state.best, finalScore);
  state.shake = 0.45;
  state.flash = 0.35;
  state.freeze = 0.18;
  burst(state.lane, PLAYER\_DEPTH, '#ff6a4f', 24, 1.6);
  submitFinalScore(finalScore);
}

function isEditableTarget(target) {
  return target?.closest?.('input, textarea, select, [contenteditable="true"]');
}

function jumpLift() {
  if (state.jump <= 0) return 0;
  const progress = clamp(1 - state.jump / JUMP\_TIME, 0, 1);
  return Math.sin(progress * Math.PI);
}

function isAirborne() {
  return jumpLift() > 0.46;
}

function isSliding() {
  return state.slide > 0.1;
}

function handleAction(action) {
  if (state.mode !== 'running') {
    if (action === 'start' || action === 'up') resetGame();
    return;
  }
  if (action === 'left') {
    const nextLane = cl
