let ctx;
let state;
let tools;

export function drawGame(nextCtx, nextState, nextTools) {
  ctx = nextCtx;
  state = nextState;
  tools = nextTools;

  const shakeX = state.shake > 0 ? (Math.random() - 0.5) * state.shake * 18 : 0;
  const shakeY = state.shake > 0 ? (Math.random() - 0.5) * state.shake * 12 : 0;
  ctx.save();
  ctx.translate(shakeX, shakeY);
  ctx.clearRect(-30, -30, state.width + 60, state.height + 60);
  drawSky();
  drawScenery();
  drawRoad();
  drawSpeedLines();
  [...state.obstacles].sort((a, b) => a.depth - b.depth).forEach(drawObstacle);
  drawRunner();
  drawParticles();
  drawHud();
  ctx.restore();

  if (state.flash > 0) {
    ctx.fillStyle = `rgba(255,255,255,${state.flash * 0.65})`;
    ctx.fillRect(0, 0, state.width, state.height);
  }
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function drawSky() {
  const gradient = ctx.createLinearGradient(0, 0, 0, state.height);
  gradient.addColorStop(0, '#78e9ff');
  gradient.addColorStop(0.48, '#315b8a');
  gradient.addColorStop(1, '#101427');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, state.width, state.height);
  ctx.fillStyle = 'rgba(255,255,255,0.86)';
  for (let i = 0; i < 7; i += 1) {
    const x = (i * 181 + state.time * 14) % (state.width + 150) - 75;
    const y = state.height * (0.07 + (i % 4) * 0.04);
    ctx.beginPath();
    ctx.ellipse(x, y, 34, 10, 0, 0, tools.tau);
    ctx.ellipse(x + 28, y + 4, 28, 9, 0, 0, tools.tau);
    ctx.fill();
  }
}

function drawScenery() {
  for (const item of [...state.scenery].sort((a, b) => a.depth - b.depth)) {
    const road = tools.roadAt(item.depth);
    const offset = road.half + lerp(42, 165, item.depth);
    const x = road.x + item.side * offset;
    const base = road.y + 12 * road.scale;
    const w = (item.kind === 'sign' ? 32 : 52) * road.scale;
    const h = (item.kind === 'sign' ? 58 : 95 * item.height) * road.scale;
    ctx.fillStyle = item.kind === 'sign' ? '#ffd35a' : `hsl(${item.hue}, 48%, ${22 + item.depth * 18}%)`;
    ctx.fillRect(x - w * 0.5, base - h, w, h);
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    if (item.kind === 'building') {
      for (let y = base - h + 12 * road.scale; y < base - 12 * road.scale; y += 18 * road.scale) {
        ctx.fillRect(x - w * 0.3, y, w * 0.18, 7 * road.scale);
        ctx.fillRect(x + w * 0.1, y, w * 0.18, 7 * road.scale);
      }
    } else {
      ctx.fillRect(x - w * 0.38, base - h * 0.62, w * 0.76, 8 * road.scale);
    }
  }
}

function drawQuad(a, b, fillStyle) {
  ctx.fillStyle = fillStyle;
  ctx.beginPath();
  ctx.moveTo(a.x - a.half, a.y);
  ctx.lineTo(a.x + a.half, a.y);
  ctx.lineTo(b.x + b.half, b.y);
  ctx.lineTo(b.x - b.half, b.y);
  ctx.closePath();
  ctx.fill();
}

function drawRoad() {
  const far = tools.roadAt(0);
  const near = tools.roadAt(1);
  ctx.fillStyle = '#161d33';
  ctx.beginPath();
  ctx.moveTo(0, state.height);
  ctx.lineTo(far.x - far.half, far.y);
  ctx.lineTo(near.x - near.half, near.y);
  ctx.lineTo(near.x + near.half, near.y);
  ctx.lineTo(far.x + far.half, far.y);
  ctx.lineTo(state.width, state.height);
  ctx.fill();

  const offset = (state.distance * 0.018) % 1;
  for (let i = -1; i < 34; i += 1) {
    const aDepth = (i + offset) / 32;
    const bDepth = (i + 1 + offset) / 32;
    if (bDepth <= 0 || aDepth >= 1) continue;
    drawQuad(tools.roadAt(aDepth), tools.roadAt(bDepth), i % 2 ? '#263149' : '#202940');
  }

  ctx.strokeStyle = 'rgba(89,234,255,0.42)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(far.x - far.half, far.y);
  ctx.lineTo(near.x - near.half, near.y);
  ctx.moveTo(far.x + far.half, far.y);
  ctx.lineTo(near.x + near.half, near.y);
  ctx.stroke();

  for (let i = -1; i < 24; i += 1) {
    const d = (i / 24 + state.distance * 0.018) % 1;
    const a = tools.roadAt(d);
    const b = tools.roadAt(Math.min(1, d + 0.035));
    ctx.strokeStyle = `rgba(255,255,255,${0.15 + d * 0.38})`;
    ctx.lineWidth = Math.max(1, d * 8);
    for (const edge of [-0.24, 0.24]) {
      ctx.beginPath();
      ctx.moveTo(a.x + a.half * edge, a.y);
      ctx.lineTo(b.x + b.half * edge, b.y);
      ctx.stroke();
    }
  }
}

function drawObstacle(obstacle) {
  const p = tools.pointForLane(obstacle.lane, obstacle.depth);
  const size = 34 * p.scale;
  const y = p.y - size * 0.52;
  if (obstacle.kind === 'coin') return drawCoin(obstacle, p, size, y);
  if (obstacle.kind === 'board') return drawBoard(p, size, y);
  if (obstacle.kind === 'hurdle') return drawHurdle(p, size, y);
  drawTrain(p, size, y);
}

function drawCoin(obstacle, p, size, y) {
  const spin = Math.abs(Math.sin(obstacle.wobble));
  ctx.fillStyle = '#ffd95a';
  ctx.beginPath();
  ctx.ellipse(p.x, y - size * 0.35 + Math.sin(obstacle.wobble) * size * 0.1, size * (0.16 + spin * 0.3), size * 0.48, 0, 0, tools.tau);
  ctx.fill();
  ctx.strokeStyle = '#fff3a6';
  ctx.lineWidth = Math.max(2, size * 0.08);
  ctx.str
