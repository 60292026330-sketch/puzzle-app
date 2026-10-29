// ===== クラッシュパズル - game.js =====

const { Engine, Bodies, Body, World, Events } = Matter;

// ---- キャンバスサイズ ----
const W = 900;
const H = 550;

// ---- 定数 ----
const GROUND_Y         = H - 30;
const BALL_RADIUS      = 14;
const MAX_BALLS        = 5;
const SLING_X          = 130;
const SLING_Y          = GROUND_Y - 80;
const MAX_DRAG         = 100;
const BALL_FORCE_SCALE = 0.007;
const BW               = 44;
const BH               = 28;

// 穴は画面右端に配置
const HOLE_W    = 100;
const HOLE_LEFT = W - HOLE_W;  // = 800

// ブロックを穴の上に置かないための安全X上限
// ブロック中心が HOLE_LEFT - BW/2 より左にあれば穴にかからない
const SAFE_X_MAX = HOLE_LEFT - BW / 2 - 4;  // = 778

// ---- カラーパレット ----
const BLOCK_COLORS = [
  '#e74c3c','#e67e22','#f1c40f','#2ecc71',
  '#3498db','#9b59b6','#1abc9c','#e91e63',
  '#00bcd4','#ff5722'
];

// ---- 障害物カラー ----
const OBS_COLOR  = '#607d8b';  // 鉄板（青みがかった灰色）
const OBS_COLOR2 = '#8d6e63';  // 木の板（茶色）

// ===== ステージ定義 =====
// layout : ブロックの絶対座標配列 { x, y }
// obstacles : 静的障害物の絶対座標・サイズ配列 { x, y, w, h, color? }
const STAGES = [

  // ---- Stage 1: ピラミッド（5段）----
  {
    label: 'ステージ 1',
    hint:  'ピラミッドを崩せ！',
    obstacles: [],
    layout: (() => {
      const list = [];
      const cx = 590;
      [[5,0],[4,1],[3,2],[2,3],[1,4]].forEach(([n, row]) => {
        for (let c = 0; c < n; c++) {
          list.push({
            x: cx - n*(BW+2)/2 + c*(BW+2) + BW/2,
            y: GROUND_Y - BH/2 - row*(BH+2)
          });
        }
      });
      return list;
    })()
  },

  // ---- Stage 2: 二本タワー（6段×2）----
  {
    label: 'ステージ 2',
    hint:  '二本のタワーを倒せ！',
    obstacles: [],
    layout: (() => {
      const list = [];
      [480, 620].forEach(tx => {
        for (let row = 0; row < 6; row++) {
          for (let col = 0; col < 2; col++) {
            list.push({
              x: tx + col*(BW+4) + BW/2,
              y: GROUND_Y - BH/2 - row*(BH+2)
            });
          }
        }
      });
      return list;
    })()
  },

  // ---- Stage 3: 城壁（穴にかからないよう左寄せ）----
  {
    label: 'ステージ 3',
    hint:  '城壁を破壊せよ！',
    obstacles: [],
    layout: (() => {
      const list = [];
      // base を十分左に設定：8ブロック幅 = 8*(44+2)=368px
      // 右端ブロック中心 = base + 7*(BW+2) + BW/2 = base + 344
      // これが SAFE_X_MAX(778) 以下になるよう: base <= 778-344 = 434
      const base = 400;
      // 土台 8個
      for (let c = 0; c < 8; c++)
        list.push({ x: base + c*(BW+2) + BW/2, y: GROUND_Y - BH/2 });
      // 両端の壁 (col 0,1 と col 6,7)
      [[0,1],[1,1],[6,1],[7,1],
       [0,2],[1,2],[6,2],[7,2],
       [0,3],[7,3]].forEach(([c, row]) =>
        list.push({ x: base + c*(BW+2) + BW/2, y: GROUND_Y - BH/2 - row*(BH+2) })
      );
      // 中央の塔 (col 3,4)
      for (let row = 1; row <= 4; row++) {
        [3,4].forEach(c =>
          list.push({ x: base + c*(BW+2) + BW/2, y: GROUND_Y - BH/2 - row*(BH+2) })
        );
      }
      return list;
    })()
  },

  // ---- Stage 4: 縦タワー3本 ＋ 障害物 ----
  // 【必要な打ち角度：高め（上に向けて打つ）】
  // 縦1列タワーを3本並べる。上から落としたボールがタワーを横に倒し穴へ転がる。
  // 低弾道は横板2枚でブロック手前を完全封鎖。
  {
    label: 'ステージ 4',
    hint:  '上に向けて高く打て！低い弾道は塞がれている！',
    obstacles: [
      // 地面すれすれの低弾道を塞ぐ横板①（ブロック左側・低め）
      { x: 300, y: GROUND_Y - 55,  w: 150, h: 16, color: OBS_COLOR },
      // 低弾道を塞ぐ横板②（少し右・少し高め）
      { x: 400, y: GROUND_Y - 105, w: 130, h: 16, color: OBS_COLOR },
    ],
    layout: (() => {
      const list = [];
      // 縦1列タワーを3本（高さ6段）：上から落ちたボールで横倒しになりやすい
      [510, 590, 670].forEach(tx => {
        for (let row = 0; row < 6; row++) {
          list.push({
            x: tx,
            y: GROUND_Y - BH/2 - row*(BH+2)
          });
        }
      });
      return list;
    })()
  },

  // ---- Stage 5: 安定3タワー ＋ 障害物（横板を土台にしてブロックを積む）----
  // 【必要な打ち角度：中程度（斜め45°前後）】
  // 低弾道横板・高弾道横板は空中に浮かせたまま。
  // さらにブロック群を「地面より高い土台（横板）の上」に乗せ、
  // 低弾道ではブロック下の土台に弾かれてブロックに届かない。
  {
    label: 'ステージ 5',
    hint:  '中くらいの角度で狙え！上も下も塞がれている！',
    obstacles: [
      // 低弾道を塞ぐ横板（低め・左側）
      { x: 300, y: GROUND_Y - 65,  w: 130, h: 16, color: OBS_COLOR  },
      // 低弾道を塞ぐ縦板（低め・右側）
      { x: 420, y: GROUND_Y - 65,  w: 16,  h: 60, color: OBS_COLOR  },
      // 高弾道を塞ぐ横板（高め・左側）
      { x: 290, y: GROUND_Y - 310, w: 130, h: 16, color: OBS_COLOR2 },
      // 高弾道を塞ぐ縦板（高め・右側）
      { x: 415, y: GROUND_Y - 280, w: 16,  h: 60, color: OBS_COLOR2 },
      // ブロックの土台となる横板①（地面より50px上・左タワー下）
      { x: 502, y: GROUND_Y - 50,  w: 96,  h: 16, color: OBS_COLOR2 },
      // ブロックの土台となる横板②（中タワー下）
      { x: 602, y: GROUND_Y - 50,  w: 96,  h: 16, color: OBS_COLOR2 },
      // ブロックの土台となる横板③（右タワー下）
      { x: 702, y: GROUND_Y - 50,  w: 96,  h: 16, color: OBS_COLOR2 },
    ],
    layout: (() => {
      const list = [];
      // 土台の上（y = GROUND_Y - 50 - 8 - BH/2 = GROUND_Y - 72）からタワーを積む
      const baseY = GROUND_Y - 50 - 8; // 土台上面のy
      [480, 580, 680].forEach(tx => {
        for (let row = 0; row < 6; row++) {
          for (let col = 0; col < 2; col++) {
            list.push({
              x: tx + col * (BW + 2) + BW / 2,
              y: baseY - BH/2 - row*(BH+2)
            });
          }
        }
      });
      return list;
    })()
  },

  // ---- Stage 6: 最終決戦 ＋ 障害物 ----
  // 【必要な打ち角度：低め（水平に近く打つ）】
  // 中段・高段の弾道をしっかり塞ぎ、地面すれすれの低い弾道だけ通れる隙間を残す。
  // ただし低すぎると地面に当たるため、絶妙な角度が必要。
  {
    label: 'ステージ 6',
    hint:  '水平に近い低い角度で狙え！上は全部塞がれている！',
    obstacles: [
      // 中段を塞ぐ横板（左側・中高め）
      { x: 280, y: GROUND_Y - 180, w: 130, h: 16, color: OBS_COLOR2 },
      // 中段右側を塞ぐ縦板
      { x: 400, y: GROUND_Y - 155, w: 16,  h: 60, color: OBS_COLOR2 },
      // 高段を塞ぐ横板（左寄り）
      { x: 260, y: GROUND_Y - 290, w: 130, h: 16, color: OBS_COLOR  },
      // 高段右側を塞ぐ縦板
      { x: 390, y: GROUND_Y - 265, w: 16,  h: 60, color: OBS_COLOR  },
      // さらに高い弾道を塞ぐ横板
      { x: 270, y: GROUND_Y - 380, w: 130, h: 16, color: OBS_COLOR  },
    ],
    layout: (() => {
      const list = [];
      const base = 460;
      // 中央ピラミッド（7→5→3→1）
      [7, 5, 3, 1].forEach((count, row) => {
        const rowLeft = base + ((7 - count) / 2) * (BW + 2);
        for (let c = 0; c < count; c++) {
          list.push({
            x: rowLeft + c * (BW + 2) + BW / 2,
            y: GROUND_Y - BH / 2 - row * (BH + 2)
          });
        }
      });
      // 中央塔（頂上から4段追加）
      const topX = base + 3 * (BW + 2) + BW / 2;
      for (let row = 4; row <= 7; row++) {
        list.push({ x: topX, y: GROUND_Y - BH / 2 - row * (BH + 2) });
      }
      // 左タワー（幅2×4段）
      for (let row = 0; row < 4; row++) {
        for (let col = 0; col < 2; col++) {
          list.push({
            x: base - 3*(BW+2) + col*(BW+2) + BW/2,
            y: GROUND_Y - BH/2 - row*(BH+2)
          });
        }
      }
      // 右タワー（1列×4段）
      for (let row = 0; row < 4; row++) {
        list.push({
          x: base + 6*(BW+2) + BW/2,
          y: GROUND_Y - BH/2 - row*(BH+2)
        });
      }
      return list;
    })()
  }
];

// ===== Web Audio 効果音 =====
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

function playShotSound() {
  const len = audioCtx.sampleRate * 0.12;
  const buf = audioCtx.createBuffer(1, len, audioCtx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random()*2-1)*(1-i/len);
  const src = audioCtx.createBufferSource(); src.buffer = buf;
  const filt = audioCtx.createBiquadFilter();
  filt.type = 'bandpass'; filt.frequency.value = 1800; filt.Q.value = 0.8;
  const gain = audioCtx.createGain();
  gain.gain.setValueAtTime(0.4, audioCtx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.12);
  src.connect(filt); filt.connect(gain); gain.connect(audioCtx.destination);
  src.start();
}

function playHitSound(speed) {
  const vol = Math.min(speed / 18, 1.0);
  if (vol < 0.06) return;
  const osc = audioCtx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(150, audioCtx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(55, audioCtx.currentTime + 0.15);
  const gOsc = audioCtx.createGain();
  gOsc.gain.setValueAtTime(vol*0.55, audioCtx.currentTime);
  gOsc.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.18);
  osc.connect(gOsc); gOsc.connect(audioCtx.destination);
  osc.start(); osc.stop(audioCtx.currentTime + 0.2);
  const nLen = audioCtx.sampleRate * 0.08;
  const nBuf = audioCtx.createBuffer(1, nLen, audioCtx.sampleRate);
  const nd = nBuf.getChannelData(0);
  for (let i = 0; i < nLen; i++) nd[i] = (Math.random()*2-1)*(1-i/nLen);
  const nSrc = audioCtx.createBufferSource(); nSrc.buffer = nBuf;
  const nFilt = audioCtx.createBiquadFilter();
  nFilt.type = 'lowpass'; nFilt.frequency.value = 900;
  const gN = audioCtx.createGain();
  gN.gain.setValueAtTime(vol*0.45, audioCtx.currentTime);
  gN.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.08);
  nSrc.connect(nFilt); nFilt.connect(gN); gN.connect(audioCtx.destination);
  nSrc.start();
}

// ---- 状態変数 ----
let currentStage = 0;
let totalScore   = 0;
let score        = 0;
let blocksInHole = 0;
let totalBlocks  = 0;
let ballsUsed    = 0;
let gameOver     = false;
let isDragging   = false;
let dragStart    = null;
let currentBall  = null;
let ballFired    = false;
let firedBalls   = [];
let blocks       = [];
let obstacles    = [];   // 障害物ボディ（描画用に保持）

// ---- Matter.js エンジン ----
const engine = Engine.create({ gravity: { x: 0, y: 1.5 } });
const world  = engine.world;

// ---- キャンバス ----
const gameCanvas = document.getElementById('game-canvas');
gameCanvas.width = W; gameCanvas.height = H;
const ctx = gameCanvas.getContext('2d');

const aimCanvas = document.getElementById('aim-line-canvas');
aimCanvas.width = W; aimCanvas.height = H;
const aimCtx = aimCanvas.getContext('2d');

document.getElementById('game-container').style.width  = W + 'px';
document.getElementById('game-container').style.height = H + 'px';

// ===== ワールド初期化 =====
function initWorld() {
  World.clear(world);
  Engine.clear(engine);
  blocks = []; firedBalls = []; obstacles = [];
  currentBall = null; ballFired = false;
  isDragging  = false; dragStart = null;
  ballsUsed = 0; score = 0; blocksInHole = 0; gameOver = false;

  // 地面（穴の左側のみ）
  World.add(world, [
    Bodies.rectangle(HOLE_LEFT/2, GROUND_Y+15, HOLE_LEFT, 30,
      { isStatic:true, label:'ground', friction:0.6 }),
    Bodies.rectangle(-15,   H/2, 30, H*2, { isStatic:true, label:'wall' }),
    Bodies.rectangle(W+15,  H/2, 30, H*2, { isStatic:true, label:'wall' }),
    Bodies.rectangle(W/2,  -15, W+100, 30, { isStatic:true, label:'ceiling' }),
  ]);

  const stage = STAGES[currentStage];

  // 障害物配置
  stage.obstacles.forEach(def => {
    const obs = Bodies.rectangle(def.x, def.y, def.w, def.h, {
      isStatic: true,
      label: 'obstacle',
      friction: 0.3,
      restitution: 0.2,
    });
    obs._color = def.color || OBS_COLOR;
    obs._w = def.w;
    obs._h = def.h;
    obstacles.push(obs);
    World.add(world, obs);
  });

  // ブロック配置（穴の上に乗らないようにクランプ）
  stage.layout.forEach((def, i) => {
    const safeX = Math.min(def.x, SAFE_X_MAX);
    const block = Bodies.rectangle(safeX, def.y, BW, BH, {
      label:'block', restitution:0.3, friction:0.5, density:0.003
    });
    block._colorIndex = i % BLOCK_COLORS.length;
    block._inHole = false;
    blocks.push(block);
    World.add(world, block);
  });

  totalBlocks = blocks.length;
  document.getElementById('block-display').textContent = totalBlocks;

  spawnBall();
  updateUI();
  hideMessage();

  // 衝突音（ボール×ブロック・障害物）
  Events.on(engine, 'collisionStart', (ev) => {
    ev.pairs.forEach(({ bodyA, bodyB }) => {
      const isBall = bodyA.label==='ball' || bodyB.label==='ball';
      const isHit  = bodyA.label==='block' || bodyB.label==='block'
                  || bodyA.label==='obstacle' || bodyB.label==='obstacle';
      if (isBall && isHit) {
        const ball = bodyA.label==='ball' ? bodyA : bodyB;
        playHitSound(Math.hypot(ball.velocity.x, ball.velocity.y));
      }
    });
  });
}

// ===== ボール生成 =====
function spawnBall() {
  if (ballsUsed >= MAX_BALLS) return;
  currentBall = Bodies.circle(SLING_X, SLING_Y, BALL_RADIUS, {
    label:'ball', isStatic:true, restitution:0.4, friction:0.1, density:0.12
  });
  currentBall._fired = false;
  // 速度・角速度を確実にゼロにしてから追加
  Body.setVelocity(currentBall, { x: 0, y: 0 });
  Body.setAngularVelocity(currentBall, 0);
  World.add(world, currentBall);
}

// ===== ボール発射 =====
function fireBall(fromX, fromY, toX, toY) {
  if (!currentBall || ballFired) return;
  const dx = fromX - toX, dy = fromY - toY;
  const dist = Math.hypot(dx, dy);
  if (dist < 5) return;
  const cd = Math.min(dist, MAX_DRAG);

  // 発射前にスリング中心へ位置を強制リセット（ずれ防止）
  Body.setPosition(currentBall, { x: SLING_X, y: SLING_Y });
  Body.setStatic(currentBall, false);
  Body.setVelocity(currentBall, {
    x: (dx/dist)*cd * BALL_FORCE_SCALE*60,
    y: (dy/dist)*cd * BALL_FORCE_SCALE*60
  });
  playShotSound();
  currentBall._fired = true;
  ballFired = true;
  const fired = currentBall;
  firedBalls.push(fired);
  ballsUsed++;
  updateUI();

  setTimeout(() => {
    if (gameOver) return;
    World.remove(world, fired);
    firedBalls = firedBalls.filter(b => b !== fired);
    currentBall = null;
    ballFired   = false;
    if (ballsUsed < MAX_BALLS) {
      spawnBall();
      updateUI();
    } else {
      setTimeout(checkGameEnd, 2000);
    }
  }, 2000);
}

// ===== 穴判定・画面外除去（毎フレーム）=====
function checkHole() {
  blocks.forEach(block => {
    if (block._inHole) return;
    const { x, y } = block.position;

    if (x > HOLE_LEFT && y >= GROUND_Y - BH/2) {
      block._inHole = true;
      blocksInHole++;
      score += 100;
      World.remove(world, block);
      document.getElementById('score-display').textContent = score;
      document.getElementById('block-display').textContent =
        blocks.filter(b => !b._inHole).length;
      if (blocksInHole >= totalBlocks && !gameOver) {
        gameOver = true;
        setTimeout(onStageClear, 400);
      }
      return;
    }

    if (y > H + 60) {
      block._inHole = true;
      World.remove(world, block);
      document.getElementById('block-display').textContent =
        blocks.filter(b => !b._inHole).length;
    }
  });
}

// ===== ステージクリア =====
function onStageClear() {
  totalScore += score;
  if (currentStage < STAGES.length - 1) {
    showMessage('next');
  } else {
    showMessage('allclear');
  }
}

// ===== 球切れ判定 =====
function checkGameEnd() {
  if (gameOver) return;
  gameOver = true;
  if (blocks.filter(b => !b._inHole).length === 0) {
    onStageClear();
  } else {
    showMessage('gameover');
  }
}

// ===== UI =====
function updateUI() {
  const c = document.getElementById('ball-icons');
  c.innerHTML = '';
  for (let i = 0; i < MAX_BALLS; i++) {
    const d = document.createElement('div');
    d.className = 'ball-dot' + (i < ballsUsed ? ' used' : '');
    c.appendChild(d);
  }
  document.getElementById('stage-display').textContent = currentStage + 1;
}

function showMessage(type) {
  const btn = document.getElementById('restart-btn');
  if (type === 'next') {
    document.getElementById('msg-title').textContent = `🎉 ステージ ${currentStage+1} クリア！`;
    document.getElementById('msg-body').textContent  = `スコア: ${score}`;
    btn.textContent = '次のステージへ';
    btn.onclick = () => { currentStage++; initWorld(); };
  } else if (type === 'allclear') {
    document.getElementById('msg-title').textContent = '🏆 全ステージクリア！';
    document.getElementById('msg-body').textContent  = `トータルスコア: ${totalScore}`;
    btn.textContent = 'はじめから';
    btn.onclick = () => { currentStage = 0; totalScore = 0; initWorld(); };
  } else {
    document.getElementById('msg-title').textContent = '💥 ゲームオーバー';
    document.getElementById('msg-body').textContent  =
      `残り ${blocks.filter(b=>!b._inHole).length} ブロック。スコア: ${score}`;
    btn.textContent = 'もう一度';
    btn.onclick = initWorld;
  }
  document.getElementById('message-box').style.display = 'block';
}

function hideMessage() {
  document.getElementById('message-box').style.display = 'none';
}

// ===== マウス操作 =====
gameCanvas.addEventListener('mousedown', e => {
  if (gameOver || !currentBall || ballFired) return;
  const rect = gameCanvas.getBoundingClientRect();
  const mx = (e.clientX - rect.left) * (W/rect.width);
  const my = (e.clientY - rect.top)  * (H/rect.height);
  if (Math.hypot(mx-SLING_X, my-SLING_Y) < 44) {
    isDragging = true; dragStart = { x:SLING_X, y:SLING_Y };
  }
});
gameCanvas.addEventListener('mousemove', e => {
  if (!isDragging || !currentBall) return;
  const rect = gameCanvas.getBoundingClientRect();
  const mx = (e.clientX - rect.left) * (W/rect.width);
  const my = (e.clientY - rect.top)  * (H/rect.height);
  const dx = mx-SLING_X, dy = my-SLING_Y;
  const dist = Math.hypot(dx, dy), cd = Math.min(dist, MAX_DRAG);
  const cx = dist>0 ? SLING_X+(dx/dist)*cd : SLING_X;
  const cy = dist>0 ? SLING_Y+(dy/dist)*cd : SLING_Y;
  Body.setPosition(currentBall, { x:cx, y:cy });
  drawAimLine(cx, cy);
});
gameCanvas.addEventListener('mouseup', e => {
  if (!isDragging || !currentBall) return;
  isDragging = false; aimCtx.clearRect(0,0,W,H);
  const rect = gameCanvas.getBoundingClientRect();
  fireBall(SLING_X, SLING_Y,
    (e.clientX-rect.left)*(W/rect.width),
    (e.clientY-rect.top) *(H/rect.height));
  dragStart = null;
});
gameCanvas.addEventListener('mouseleave', () => {
  if (isDragging && currentBall) {
    isDragging = false; aimCtx.clearRect(0,0,W,H);
    // スリング中心に強制リセット
    Body.setPosition(currentBall, { x:SLING_X, y:SLING_Y });
    Body.setVelocity(currentBall, { x:0, y:0 });
    dragStart = null;
  }
});

// タッチ対応
function getTouchPos(t) {
  const rect = gameCanvas.getBoundingClientRect();
  return { x:(t.clientX-rect.left)*(W/rect.width), y:(t.clientY-rect.top)*(H/rect.height) };
}
gameCanvas.addEventListener('touchstart', e => {
  e.preventDefault();
  if (gameOver || !currentBall || ballFired) return;
  const { x:mx, y:my } = getTouchPos(e.touches[0]);
  if (Math.hypot(mx-SLING_X, my-SLING_Y) < 50) {
    isDragging = true; dragStart = { x:SLING_X, y:SLING_Y };
  }
}, { passive:false });
gameCanvas.addEventListener('touchmove', e => {
  e.preventDefault();
  if (!isDragging || !currentBall) return;
  const { x:mx, y:my } = getTouchPos(e.touches[0]);
  const dx=mx-SLING_X, dy=my-SLING_Y, dist=Math.hypot(dx,dy), cd=Math.min(dist,MAX_DRAG);
  const cx=dist>0?SLING_X+(dx/dist)*cd:SLING_X, cy=dist>0?SLING_Y+(dy/dist)*cd:SLING_Y;
  Body.setPosition(currentBall, { x:cx, y:cy }); drawAimLine(cx, cy);
}, { passive:false });
gameCanvas.addEventListener('touchend', e => {
  e.preventDefault();
  if (!isDragging || !currentBall) return;
  isDragging = false; aimCtx.clearRect(0,0,W,H);
  const { x:mx, y:my } = getTouchPos(e.changedTouches[0]);
  fireBall(SLING_X, SLING_Y, mx, my); dragStart = null;
}, { passive:false });

// ===== エイムライン =====
function drawAimLine(ballX, ballY) {
  aimCtx.clearRect(0, 0, W, H);
  const vx = (SLING_X-ballX)*BALL_FORCE_SCALE*60;
  const vy = (SLING_Y-ballY)*BALL_FORCE_SCALE*60;
  const gs = engine.gravity.scale != null ? engine.gravity.scale : 0.001;
  const gStep = engine.gravity.y * gs * 1000/60;
  aimCtx.save();
  aimCtx.setLineDash([6,8]);
  aimCtx.strokeStyle = 'rgba(255,220,100,0.65)'; aimCtx.lineWidth = 2;
  aimCtx.beginPath();
  let px=SLING_X, py=SLING_Y, pvx=vx, pvy=vy;
  aimCtx.moveTo(px, py);
  for (let i=0; i<40; i++) {
    px+=pvx; py+=pvy; pvy+=gStep;
    if (px>W||px<0||py>H) break;
    aimCtx.lineTo(px, py);
  }
  aimCtx.stroke();
  aimCtx.setLineDash([]);
  aimCtx.strokeStyle = '#a0522d'; aimCtx.lineWidth = 3;
  aimCtx.beginPath(); aimCtx.moveTo(SLING_X-8,SLING_Y-15); aimCtx.lineTo(ballX,ballY); aimCtx.stroke();
  aimCtx.beginPath(); aimCtx.moveTo(SLING_X+8,SLING_Y-15); aimCtx.lineTo(ballX,ballY); aimCtx.stroke();
  aimCtx.restore();
}

// ===== メインループ =====
function gameLoop() {
  Engine.update(engine, 1000/60);
  checkHole();
  draw();
  requestAnimationFrame(gameLoop);
}

// ===== 描画 =====
function draw() {
  const sg = ctx.createLinearGradient(0,0,0,H);
  sg.addColorStop(0,'#0f3460'); sg.addColorStop(0.7,'#16213e'); sg.addColorStop(1,'#1a1a2e');
  ctx.fillStyle = sg; ctx.fillRect(0,0,W,H);
  drawClouds(); drawGround(); drawHole(); drawSlingshot();
  // 障害物（ブロックの後ろに描画）
  obstacles.forEach(obs => drawObstacle(obs));
  blocks.forEach(b => { if (!b._inHole) drawBlock(b); });
  firedBalls.forEach(b => drawBall(b));
  if (currentBall && !currentBall._fired) drawBall(currentBall);
  // ヒント
  const stg = STAGES[currentStage];
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  ctx.font = 'bold 15px sans-serif'; ctx.textAlign = 'left';
  ctx.fillText(stg.hint, 20, H - 10);
}

function drawClouds() {
  ctx.fillStyle = 'rgba(255,255,255,0.06)';
  [{x:200,y:80,r:40},{x:240,y:70,r:55},{x:280,y:80,r:40},
   {x:480,y:100,r:35},{x:520,y:90,r:50},{x:555,y:100,r:35},
   {x:730,y:60,r:30},{x:765,y:50,r:45},{x:800,y:60,r:30}]
  .forEach(c => { ctx.beginPath(); ctx.arc(c.x,c.y,c.r,0,Math.PI*2); ctx.fill(); });
}

function drawGround() {
  ctx.fillStyle = '#2d5a27'; ctx.fillRect(0, GROUND_Y-8, HOLE_LEFT, 8);
  ctx.fillStyle = '#5d4037'; ctx.fillRect(0, GROUND_Y,   HOLE_LEFT, H-GROUND_Y);
}

function drawHole() {
  ctx.fillStyle = '#050505';
  ctx.fillRect(HOLE_LEFT, GROUND_Y-2, HOLE_W+4, H-GROUND_Y+4);
  const hg = ctx.createLinearGradient(HOLE_LEFT, 0, HOLE_LEFT+40, 0);
  hg.addColorStop(0,'rgba(0,0,0,0.85)'); hg.addColorStop(1,'rgba(0,0,0,0)');
  ctx.fillStyle = hg; ctx.fillRect(HOLE_LEFT, GROUND_Y, 40, H-GROUND_Y);
  ctx.strokeStyle='#ff6b35'; ctx.lineWidth=2.5; ctx.setLineDash([5,5]);
  ctx.beginPath(); ctx.moveTo(HOLE_LEFT,GROUND_Y+2); ctx.lineTo(HOLE_LEFT,GROUND_Y-14); ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle='#ff6b35'; ctx.font='bold 13px sans-serif'; ctx.textAlign='center';
  ctx.fillText('▼ 穴', HOLE_LEFT+35, GROUND_Y-18);
}

function drawSlingshot() {
  const sx=SLING_X, sy=SLING_Y;
  ctx.fillStyle='#8B4513'; ctx.fillRect(sx-6,sy+15,12,50);
  ctx.strokeStyle='#A0522D'; ctx.lineWidth=8; ctx.lineCap='round';
  ctx.beginPath(); ctx.moveTo(sx,sy+15); ctx.lineTo(sx-14,sy-20); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(sx,sy+15); ctx.lineTo(sx+14,sy-20); ctx.stroke();
  if (!isDragging && currentBall && !currentBall._fired) {
    ctx.strokeStyle='#a0522d'; ctx.lineWidth=3;
    ctx.beginPath(); ctx.moveTo(sx-8,sy-15); ctx.lineTo(currentBall.position.x,currentBall.position.y); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(sx+8,sy-15); ctx.lineTo(currentBall.position.x,currentBall.position.y); ctx.stroke();
  }
}

function drawObstacle(obs) {
  const { x, y } = obs.position;
  const w = obs._w, h = obs._h;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(obs.angle);
  // 影
  ctx.shadowColor = 'rgba(0,0,0,0.5)'; ctx.shadowBlur = 8;
  ctx.shadowOffsetX = 2; ctx.shadowOffsetY = 3;
  ctx.fillStyle = obs._color;
  ctx.beginPath(); ctx.roundRect(-w/2, -h/2, w, h, 3); ctx.fill();
  // ハイライト
  ctx.shadowColor = 'transparent';
  ctx.fillStyle = 'rgba(255,255,255,0.15)';
  ctx.beginPath(); ctx.roundRect(-w/2, -h/2, w, h/2, [3,3,0,0]); ctx.fill();
  // 枠
  ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.roundRect(-w/2, -h/2, w, h, 3); ctx.stroke();
  // ラベル（横長か縦長かで表示切り替え）
  const isVertical = obs._h > obs._w;
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.font = `bold ${Math.min(Math.min(obs._w, obs._h) * 0.6, 11)}px sans-serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(isVertical ? '┃' : '━', 0, 0);
  ctx.restore();
}

function drawBlock(block) {
  const {x,y}=block.position, color=BLOCK_COLORS[block._colorIndex];
  ctx.save(); ctx.translate(x,y); ctx.rotate(block.angle);
  ctx.shadowColor='rgba(0,0,0,0.4)'; ctx.shadowBlur=6; ctx.shadowOffsetX=2; ctx.shadowOffsetY=3;
  ctx.fillStyle=color; ctx.beginPath(); ctx.roundRect(-BW/2,-BH/2,BW,BH,4); ctx.fill();
  ctx.shadowColor='transparent';
  ctx.fillStyle='rgba(255,255,255,0.2)'; ctx.beginPath(); ctx.roundRect(-BW/2,-BH/2,BW,BH/2,[4,4,0,0]); ctx.fill();
  ctx.strokeStyle='rgba(0,0,0,0.3)'; ctx.lineWidth=1; ctx.beginPath(); ctx.roundRect(-BW/2,-BH/2,BW,BH,4); ctx.stroke();
  ctx.restore();
}

function drawBall(ball) {
  const {x,y}=ball.position, r=BALL_RADIUS;
  ctx.save(); ctx.translate(x,y);
  const g=ctx.createRadialGradient(-r*.3,-r*.3,1,0,0,r);
  g.addColorStop(0,'#ffaa88'); g.addColorStop(.5,'#ff6b35'); g.addColorStop(1,'#c0392b');
  ctx.shadowColor='rgba(255,80,0,0.5)'; ctx.shadowBlur=10;
  ctx.beginPath(); ctx.arc(0,0,r,0,Math.PI*2); ctx.fillStyle=g; ctx.fill();
  ctx.beginPath(); ctx.arc(-r*.3,-r*.3,r*.3,0,Math.PI*2); ctx.fillStyle='rgba(255,255,255,0.4)'; ctx.fill();
  ctx.restore();
}

// ===== 起動 =====
initWorld();
gameLoop();
