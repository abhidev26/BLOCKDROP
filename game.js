
"use strict";

/* BLOCKDROP - COMMIT 12 */

const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");
const nextCanvas = document.getElementById("nextCanvas");
const nextCtx = nextCanvas.getContext("2d");

const COLS = 10;
const ROWS = 20;
const SIZE = 30;

const COLORS = [
  "#67e8f9", "#60a5fa", "#a78bfa",
  "#f472b6", "#fbbf24", "#34d399", "#fb7185"
];

const SHAPES = [
  [[1, 1, 1, 1]],
  [[1, 0, 0], [1, 1, 1]],
  [[0, 0, 1], [1, 1, 1]],
  [[1, 1], [1, 1]],
  [[0, 1, 1], [1, 1, 0]],
  [[0, 1, 0], [1, 1, 1]],
  [[1, 1, 0], [0, 1, 1]]
];

const $ = id => document.getElementById(id);

let board;
let piece;
let nextPiece;
let score = 0;
let lines = 0;
let level = 1;
let running = false;
let paused = false;
let gameEnded = true;
let dropCounter = 0;
let lastTime = 0;
let startTime = 0;
let elapsedBeforePause = 0;
let timerInterval = null;

let audioContext = null;
let masterGain = null;
let musicTimer = null;
let musicIndex = 0;

let audioSettings = { soundEnabled: true, musicEnabled: false };
try {
  const stored = JSON.parse(localStorage.getItem("blockdrop_audio_settings") || "{}");
  audioSettings.soundEnabled = stored.soundEnabled !== false;
  audioSettings.musicEnabled = stored.musicEnabled === true;
} catch (_) {}

const melody = [261.63, 329.63, 392, 329.63, 293.66, 349.23, 440, 349.23];

function saveAudioSettings() {
  try {
    localStorage.setItem("blockdrop_audio_settings", JSON.stringify(audioSettings));
  } catch (_) {}
}

function initAudio() {
  if (!audioContext) {
    const AudioClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioClass) return false;

    audioContext = new AudioClass();
    masterGain = audioContext.createGain();
    masterGain.gain.value = audioSettings.soundEnabled ? 0.7 : 0;
    masterGain.connect(audioContext.destination);
  }

  if (audioContext.state === "suspended") audioContext.resume();
  return true;
}

function playTone(frequency, duration = 0.09, type = "sine", volume = 0.12) {
  if (!audioSettings.soundEnabled || !initAudio()) return;

  const oscillator = audioContext.createOscillator();
  const gain = audioContext.createGain();
  const now = audioContext.currentTime;

  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, now);
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(volume, now + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

  oscillator.connect(gain);
  gain.connect(masterGain);
  oscillator.start(now);
  oscillator.stop(now + duration + 0.02);
}

function playEffect(name) {
  const sounds = {
    move: [220, 0.045, "sine"],
    rotate: [520, 0.08, "triangle"],
    drop: [145, 0.15, "triangle"],
    clear: [680, 0.16, "sine"],
    start: [440, 0.1, "sine"],
    pause: [300, 0.1, "sine"],
    gameOver: [180, 0.28, "sawtooth"]
  };

  if (sounds[name]) playTone(...sounds[name]);
}

function stopMusic() {
  if (musicTimer !== null) clearInterval(musicTimer);
  musicTimer = null;
}

function playMusicNote(frequency) {
  if (!audioSettings.musicEnabled || !initAudio()) return;

  const oscillator = audioContext.createOscillator();
  const gain = audioContext.createGain();
  const now = audioContext.currentTime;

  oscillator.type = "sine";
  oscillator.frequency.value = frequency;
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.linearRampToValueAtTime(0.025, now + 0.04);
  gain.gain.linearRampToValueAtTime(0.0001, now + 0.3);

  oscillator.connect(gain);
  gain.connect(masterGain);
  oscillator.start(now);
  oscillator.stop(now + 0.32);
}

function startMusic() {
  stopMusic();
  if (!audioSettings.musicEnabled) return;

  playMusicNote(melody[musicIndex++ % melody.length]);
  musicTimer = setInterval(() => {
    playMusicNote(melody[musicIndex++ % melody.length]);
  }, 380);
}

function updateAudioUI(message = "") {
  $("soundToggle").textContent = audioSettings.soundEnabled ? "🔊 Sound: ON" : "🔇 Sound: OFF";
  $("musicToggle").textContent = audioSettings.musicEnabled ? "🎵 Music: ON" : "🎵 Music: OFF";
  $("audioStatus").textContent = message ||
    `${audioSettings.soundEnabled ? "Sound effects enabled." : "Sound effects muted."} ${audioSettings.musicEnabled ? "Background music enabled." : "Music is off."}`;
}

$("soundToggle").addEventListener("click", () => {
  audioSettings.soundEnabled = !audioSettings.soundEnabled;
  if (initAudio()) {
    masterGain.gain.setTargetAtTime(
      audioSettings.soundEnabled ? 0.7 : 0,
      audioContext.currentTime,
      0.03
    );
  }
  saveAudioSettings();
  updateAudioUI();
  if (audioSettings.soundEnabled) playTone(440);
});

$("musicToggle").addEventListener("click", () => {
  audioSettings.musicEnabled = !audioSettings.musicEnabled;

  if (audioSettings.musicEnabled) {
    if (initAudio()) {
      startMusic();
      updateAudioUI("Background music enabled.");
    } else {
      audioSettings.musicEnabled = false;
      updateAudioUI("Audio is not supported in this browser.");
    }
  } else {
    stopMusic();
    updateAudioUI("Background music disabled.");
  }

  saveAudioSettings();
});

function emptyBoard() {
  return Array.from({ length: ROWS }, () => Array(COLS).fill(0));
}

function randomPiece() {
  const index = Math.floor(Math.random() * SHAPES.length);
  return {
    shape: SHAPES[index].map(row => [...row]),
    color: COLORS[index],
    x: Math.floor((COLS - SHAPES[index][0].length) / 2),
    y: 0
  };
}

function rotateMatrix(matrix) {
  return matrix[0].map((_, i) => matrix.map(row => row[i]).reverse());
}

function collides(testPiece, dx = 0, dy = 0, testShape = testPiece.shape) {
  for (let y = 0; y < testShape.length; y++) {
    for (let x = 0; x < testShape[y].length; x++) {
      if (!testShape[y][x]) continue;

      const bx = testPiece.x + x + dx;
      const by = testPiece.y + y + dy;

      if (bx < 0 || bx >= COLS || by >= ROWS) return true;
      if (by >= 0 && board[by][bx]) return true;
    }
  }

  return false;
}

function drawBlock(context, x, y, size, color) {
  context.fillStyle = color;
  context.fillRect(x + 1, y + 1, size - 2, size - 2);

  context.fillStyle = "rgba(255,255,255,.18)";
  context.fillRect(x + 3, y + 3, size - 6, 3);

  context.strokeStyle = "rgba(255,255,255,.12)";
  context.strokeRect(x + 1.5, y + 1.5, size - 3, size - 3);
}

function drawBoard() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#080d1b";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.strokeStyle = "rgba(148,163,184,.09)";
  ctx.lineWidth = 1;

  for (let x = 0; x <= COLS; x++) {
    ctx.beginPath();
    ctx.moveTo(x * SIZE, 0);
    ctx.lineTo(x * SIZE, ROWS * SIZE);
    ctx.stroke();
  }

  for (let y = 0; y <= ROWS; y++) {
    ctx.beginPath();
    ctx.moveTo(0, y * SIZE);
    ctx.lineTo(COLS * SIZE, y * SIZE);
    ctx.stroke();
  }

  board.forEach((row, y) => row.forEach((cell, x) => {
    if (cell) drawBlock(ctx, x * SIZE, y * SIZE, SIZE, cell);
  }));

  if (piece) {
    piece.shape.forEach((row, y) => row.forEach((cell, x) => {
      if (cell) drawBlock(ctx, (piece.x + x) * SIZE, (piece.y + y) * SIZE, SIZE, piece.color);
    }));
  }
}

function drawNext() {
  nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
  nextCtx.fillStyle = "#080d1b";
  nextCtx.fillRect(0, 0, nextCanvas.width, nextCanvas.height);

  if (!nextPiece) return;

  const size = 25;
  const shape = nextPiece.shape;
  const width = shape[0].length * size;
  const height = shape.length * size;
  const offsetX = (nextCanvas.width - width) / 2;
  const offsetY = (nextCanvas.height - height) / 2;

  shape.forEach((row, y) => row.forEach((cell, x) => {
    if (cell) drawBlock(nextCtx, offsetX + x * size, offsetY + y * size, size, nextPiece.color);
  }));
}

function updateStats() {
  $("score").textContent = score.toLocaleString();
  $("lines").textContent = lines;
  $("level").textContent = level;
  $("bestScore").textContent = getBestScore().toLocaleString();
  renderAchievements();
  renderLeaderboard();
}

function currentKey() {
  return `blockdrop_best_${$("gameMode").value}_${$("difficulty").value}`;
}

function getBestScore() {
  return Number(localStorage.getItem(currentKey()) || 0);
}

function saveBestScore() {
  if (score > getBestScore()) localStorage.setItem(currentKey(), String(score));
}

function setOverlay(title, message, buttonText, showButton = true) {
  $("overlayTitle").textContent = title;
  $("overlayMessage").textContent = message;
  $("startBtn").textContent = buttonText;
  $("startBtn").style.display = showButton ? "" : "none";
  $("overlay").classList.remove("hidden");
}

function hideOverlay() {
  $("overlay").classList.add("hidden");
}

function getElapsed() {
  return elapsedBeforePause + (running && !paused ? Date.now() - startTime : 0);
}

function updateTime() {
  const mode = $("gameMode").value;
  const elapsed = getElapsed();

  if (mode === "time" && running && !paused && elapsed >= 120000) {
    endGame("Time's up!");
    return;
  }

  const seconds = mode === "time"
    ? Math.max(0, 120 - Math.floor(elapsed / 1000))
    : Math.floor(elapsed / 1000);

  $("time").textContent =
    `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

function lockPiece() {
  piece.shape.forEach((row, y) => row.forEach((cell, x) => {
    if (cell && piece.y + y >= 0) {
      board[piece.y + y][piece.x + x] = piece.color;
    }
  }));

  let cleared = 0;

  for (let y = ROWS - 1; y >= 0; y--) {
    if (board[y].every(Boolean)) {
      board.splice(y, 1);
      board.unshift(Array(COLS).fill(0));
      cleared++;
      y++;
    }
  }

  if (cleared > 0) {
    lines += cleared;
    const multipliers = [0, 100, 300, 500, 800];
    score += (multipliers[cleared] || cleared * 250) * level;
    level = Math.floor(lines / 10) + 1;
    playEffect("clear");
  }

  piece = nextPiece;
  nextPiece = randomPiece();
  drawNext();
  updateStats();

  if (collides(piece)) endGame("Game over!");
}

function movePiece(dx, dy) {
  if (!running || paused || gameEnded) return;

  if (!collides(piece, dx, dy)) {
    piece.x += dx;
    piece.y += dy;
    if (dx !== 0 || dy !== 0) playEffect("move");
  } else if (dy > 0) {
    lockPiece();
  }

  drawBoard();
}

function rotatePiece() {
  if (!running || paused || gameEnded) return;

  const rotated = rotateMatrix(piece.shape);

  if (!collides(piece, 0, 0, rotated)) {
    piece.shape = rotated;
    playEffect("rotate");
  } else {
    for (const shift of [-1, 1, -2, 2]) {
      if (!collides(piece, shift, 0, rotated)) {
        piece.x += shift;
        piece.shape = rotated;
        playEffect("rotate");
        break;
      }
    }
  }

  drawBoard();
}

function hardDrop() {
  if (!running || paused || gameEnded) return;

  let distance = 0;
  while (!collides(piece, 0, 1)) {
    piece.y++;
    distance++;
  }

  score += distance * 2;
  playEffect("drop");
  lockPiece();
  updateStats();
  drawBoard();
}

function dropSpeed() {
  const difficulty = $("difficulty").value;
  const base = difficulty === "insane" ? 250 : difficulty === "hard" ? 550 : 850;
  return Math.max(90, base - (level - 1) * 55);
}

function loop(time = 0) {
  const delta = time - lastTime;
  lastTime = time;

  if (running && !paused && !gameEnded) {
    dropCounter += delta;

    if (dropCounter > dropSpeed()) {
      movePiece(0, 1);
      dropCounter = 0;
    }

    updateTime();
  }

  requestAnimationFrame(loop);
}

function getLifetimeStats() {
  try {
    return JSON.parse(localStorage.getItem("blockdrop_lifetime") ||
      '{"games":0,"lines":0,"best":0}');
  } catch (_) {
    return { games: 0, lines: 0, best: 0 };
  }
}

function setLifetimeStats(stats) {
  localStorage.setItem("blockdrop_lifetime", JSON.stringify(stats));
}

function endGame(message = "Game over!") {
  if (gameEnded) return;

  running = false;
  paused = false;
  gameEnded = true;

  stopMusic();
  playEffect("gameOver");
  clearInterval(timerInterval);

  saveBestScore();

  const lifetime = getLifetimeStats();
  lifetime.games++;
  lifetime.lines += lines;
  lifetime.best = Math.max(lifetime.best, score);
  setLifetimeStats(lifetime);

  const leaderboard = getLeaderboard();
  leaderboard.push({
    name: getPlayerName(),
    score,
    mode: $("gameMode").value,
    date: new Date().toLocaleDateString()
  });

  leaderboard.sort((a, b) => b.score - a.score);
  localStorage.setItem("blockdrop_leaderboard", JSON.stringify(leaderboard.slice(0, 10)));

  updateStats();
  $("gameStatus").textContent = "GAME OVER";
  setOverlay(message, `Final score: ${score.toLocaleString()} · Lines: ${lines}`, "PLAY AGAIN");
}

function startGame() {
  board = emptyBoard();
  piece = randomPiece();
  nextPiece = randomPiece();

  score = 0;
  lines = 0;
  level = 1;
  dropCounter = 0;
  elapsedBeforePause = 0;
  startTime = Date.now();
  lastTime = 0;

  running = true;
  paused = false;
  gameEnded = false;

  $("gameStatus").textContent = "PLAYING";
  $("pauseBtn").textContent = "Ⅱ Pause";

  hideOverlay();
  playEffect("start");
  drawNext();
  drawBoard();
  updateStats();
  updateTime();
}

function togglePause() {
  if (gameEnded || !running) return;

  paused = !paused;

  if (paused) {
    elapsedBeforePause += Date.now() - startTime;
    $("gameStatus").textContent = "PAUSED";
    $("pauseBtn").textContent = "▶ Resume";
    setOverlay("Game paused", "Take a breath. Your blocks are waiting.", "RESUME");
  } else {
    startTime = Date.now();
    $("gameStatus").textContent = "PLAYING";
    $("pauseBtn").textContent = "Ⅱ Pause";
    hideOverlay();
  }

  playEffect("pause");
}

$("startBtn").addEventListener("click", () => {
  if (paused && !gameEnded) {
    togglePause();
    return;
  }
  startGame();
});

$("restartBtn").addEventListener("click", startGame);
$("pauseBtn").addEventListener("click", togglePause);

$("leftBtn").addEventListener("click", () => movePiece(-1, 0));
$("rightBtn").addEventListener("click", () => movePiece(1, 0));
$("downBtn").addEventListener("click", () => movePiece(0, 1));
$("rotateBtn").addEventListener("click", rotatePiece);
$("dropBtn").addEventListener("click", hardDrop);

document.addEventListener("keydown", event => {
  if (event.target.matches("input, select, textarea")) return;

  if (event.code === "Space") {
    event.preventDefault();
    hardDrop();
  } else if (event.key === "ArrowLeft") {
    event.preventDefault();
    movePiece(-1, 0);
  } else if (event.key === "ArrowRight") {
    event.preventDefault();
    movePiece(1, 0);
  } else if (event.key === "ArrowDown") {
    event.preventDefault();
    movePiece(0, 1);
  } else if (event.key === "ArrowUp" || event.key.toLowerCase() === "x") {
    event.preventDefault();
    rotatePiece();
  } else if (event.key.toLowerCase() === "p") {
    togglePause();
  }
});

$("gameMode").addEventListener("change", () => {
  updateStats();
  if (!gameEnded) endGame("Mode changed");
});

$("difficulty").addEventListener("change", updateStats);

function getPlayerName() {
  return (localStorage.getItem("blockdrop_player") || "Player").slice(0, 18);
}

$("playerName").value = getPlayerName() === "Player" ? "" : getPlayerName();

$("saveNameBtn").addEventListener("click", () => {
  const name = $("playerName").value.trim() || "Player";
  localStorage.setItem("blockdrop_player", name.slice(0, 18));
  renderLeaderboard();
});

function getLeaderboard() {
  try {
    return JSON.parse(localStorage.getItem("blockdrop_leaderboard") || "[]");
  } catch (_) {
    return [];
  }
}

$("clearLeaderboardBtn").addEventListener("click", () => {
  if (confirm("Clear your local leaderboard?")) {
    localStorage.removeItem("blockdrop_leaderboard");
    renderLeaderboard();
  }
});

function renderLeaderboard() {
  const container = $("leaderboard");
  container.innerHTML = "";

  const scores = getLeaderboard();

  if (!scores.length) {
    container.textContent = "Finish a game to record your score.";
    container.className = "leaderboard-list muted";
    return;
  }

  container.className = "leaderboard-list";

  scores.forEach((entry, index) => {
    const row = document.createElement("div");
    row.className = "leaderboard-item";

    const name = document.createElement("span");
    name.textContent = `${index + 1}. ${entry.name} · ${entry.mode}`;

    const value = document.createElement("strong");
    value.textContent = Number(entry.score).toLocaleString();

    row.append(name, value);
    container.appendChild(row);
  });
}

const ACHIEVEMENTS = [
  { id: "first", title: "First Run", desc: "Finish your first game", check: s => s.games >= 1 },
  { id: "score1k", title: "Score Hunter", desc: "Reach 1,000 points", check: s => s.best >= 1000 },
  { id: "score5k", title: "Block Master", desc: "Reach 5,000 points", check: s => s.best >= 5000 },
  { id: "lines10", title: "Line Breaker", desc: "Clear 10 total lines", check: s => s.lines >= 10 },
  { id: "lines50", title: "Combo Legend", desc: "Clear 50 total lines", check: s => s.lines >= 50 },
  { id: "games10", title: "Dedicated Player", desc: "Finish 10 games", check: s => s.games >= 10 }
];

function renderAchievements() {
  const container = $("achievements");
  if (!container) return;

  const stats = getLifetimeStats();
  container.innerHTML = "";

  ACHIEVEMENTS.forEach(achievement => {
    const unlocked = achievement.check(stats);
    const row = document.createElement("div");
    row.className = `achievement-item ${unlocked ? "unlocked" : "locked"}`;

    const detail = document.createElement("div");
    const title = document.createElement("strong");
    title.textContent = achievement.title;
    const desc = document.createElement("small");
    desc.textContent = achievement.desc;

    detail.append(title, desc);

    const status = document.createElement("span");
    status.textContent = unlocked ? "✓" : "🔒";

    row.append(detail, status);
    container.appendChild(row);
  });
}

function initializeGame() {
  board = emptyBoard();
  piece = null;
  nextPiece = randomPiece();

  drawBoard();
  drawNext();
  updateStats();
  updateAudioUI();
  $("gameStatus").textContent = "READY";

  setOverlay("Ready to drop?", "Stack the blocks. Clear the lines.", "START GAME");
}

initializeGame();
requestAnimationFrame(loop);

console.log("BLOCKDROP Commit 12 loaded successfully.");

/* ==========================================
   COMMIT 13 — PLAYER STATISTICS DASHBOARD
========================================== */

(() => {
  "use strict";

  const STORAGE_KEY = "blockdrop_lifetime";
  const HISTORY_KEY = "blockdrop_game_history";

  const get = id => document.getElementById(id);

  function readJSON(key, fallback) {
    try {
      const value = JSON.parse(localStorage.getItem(key));
      return value ?? fallback;
    } catch {
      return fallback;
    }
  }

  function getHistory() {
    const history = readJSON(HISTORY_KEY, []);
    return Array.isArray(history) ? history : [];
  }

  function getLifetime() {
    const stats = readJSON(STORAGE_KEY, {});
    return {
      games: Number(stats.games) || 0,
      lines: Number(stats.lines) || 0,
      best: Number(stats.best) || 0
    };
  }

  function renderStatistics() {
    const history = getHistory();
    const lifetime = getLifetime();

    const totalGames = Math.max(lifetime.games, history.length);
    const totalLines = lifetime.lines;
    const historicalBest = Math.max(
      lifetime.best,
      ...history.map(game => Number(game.score) || 0),
      0
    );

    const historyTotal = history.reduce(
      (sum, game) => sum + (Number(game.score) || 0),
      0
    );

    // Lifetime best is retained even when older games have no history.
    const averageScore = totalGames > 0
      ? Math.round(
          (historyTotal +
            Math.max(0, totalGames - history.length) * 0) /
          totalGames
        )
      : 0;

    if (get("totalGames")) {
      get("totalGames").textContent = totalGames.toLocaleString();
    }

    if (get("lifetimeBest")) {
      get("lifetimeBest").textContent = historicalBest.toLocaleString();
    }

    if (get("totalLines")) {
      get("totalLines").textContent = totalLines.toLocaleString();
    }

    if (get("averageScore")) {
      get("averageScore").textContent = averageScore.toLocaleString();
    }

    updateMilestone(historicalBest);
  }

  function updateMilestone(bestScore) {
    const milestones = [
      { score: 1000, title: "Score Hunter" },
      { score: 5000, title: "Block Master" },
      { score: 10000, title: "Arcade Legend" },
      { score: 25000, title: "BLOCKDROP Champion" }
    ];

    const next = milestones.find(item => bestScore < item.score);

    const title = get("milestoneTitle");
    const progress = get("milestoneProgress");
    const bar = get("milestoneBar");
    const message = get("milestoneMessage");

    if (!next) {
      if (title) title.textContent = "BLOCKDROP Champion";
      if (progress) progress.textContent = "MAX LEVEL";
      if (bar) bar.style.width = "100%";
      if (message) message.textContent = "Amazing! You have reached the highest displayed milestone.";
      return;
    }

    const previous = milestones[milestones.indexOf(next) - 1]?.score || 0;
    const progressAmount = Math.max(
      0,
      Math.min(100, ((bestScore - previous) / (next.score - previous)) * 100)
    );

    if (title) title.textContent = next.title;
    if (progress) {
      progress.textContent =
        `${bestScore.toLocaleString()} / ${next.score.toLocaleString()}`;
    }
    if (bar) bar.style.width = `${progressAmount}%`;
    if (message) {
      message.textContent =
        `${Math.max(0, next.score - bestScore).toLocaleString()} more points to reach your next milestone.`;
    }
  }

  function recordStatistics(score, lines) {
    const lifetime = getLifetime();

    lifetime.games += 1;
    lifetime.lines += Number(lines) || 0;
    lifetime.best = Math.max(lifetime.best, Number(score) || 0);

    localStorage.setItem(STORAGE_KEY, JSON.stringify(lifetime));

    const history = getHistory();
    history.push({
      score: Number(score) || 0,
      lines: Number(lines) || 0,
      date: new Date().toISOString()
    });

    // Keep the latest 500 games to prevent unlimited storage growth.
    localStorage.setItem(
      HISTORY_KEY,
      JSON.stringify(history.slice(-500))
    );

    renderStatistics();
  }

  // Public hook for the actual game-over function to call.
  window.blockdropRecordStatistics = recordStatistics;
  window.blockdropRefreshStatistics = renderStatistics;

  const refreshButton = get("refreshStatsBtn");
  if (refreshButton) {
    refreshButton.addEventListener("click", renderStatistics);
  }

  renderStatistics();

  console.log("BLOCKDROP Commit 13 statistics dashboard loaded.");
})();

/* COMMIT 14 — DAILY CHALLENGES SYSTEM */

(() => {
  "use strict";

  const STORAGE_KEY = "blockdrop_daily_challenges_v1";
  const XP_KEY = "blockdrop_daily_challenge_xp_v1";

  const challenges = [
    {
      id: "score",
      goal: 2500,
      reward: 100,
      bar: "scoreProgressBar",
      text: "scoreProgressText",
      button: "claimScoreReward",
      card: "challengeScore",
      label: "points"
    },
    {
      id: "lines",
      goal: 10,
      reward: 150,
      bar: "linesProgressBar",
      text: "linesProgressText",
      button: "claimLinesReward",
      card: "challengeLines",
      label: "lines"
    },
    {
      id: "games",
      goal: 3,
      reward: 200,
      bar: "gamesProgressBar",
      text: "gamesProgressText",
      button: "claimGamesReward",
      card: "challengeGames",
      label: "games"
    }
  ];

  function todayKey() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function freshState() {
    return {
      date: todayKey(),
      totalScore: 0,
      totalLines: 0,
      games: 0,
      claimed: []
    };
  }

  function readState() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));

      if (!saved || saved.date !== todayKey()) {
        return freshState();
      }

      return {
        ...freshState(),
        ...saved,
        claimed: Array.isArray(saved.claimed) ? saved.claimed : []
      };
    } catch {
      return freshState();
    }
  }

  function saveState(state) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function getProgress(state, challenge) {
    if (challenge.id === "score") return state.totalScore;
    if (challenge.id === "lines") return state.totalLines;
    return state.games;
  }

  function getTotalXP() {
    return Number(localStorage.getItem(XP_KEY)) || 0;
  }

  function render() {
    const state = readState();
    const dateElement = document.getElementById("dailyDate");
    const xpElement = document.getElementById("dailyTotalXP");

    if (!dateElement || !xpElement) return;

    dateElement.textContent = state.date;
    xpElement.textContent = `${getTotalXP()} XP`;

    challenges.forEach((challenge) => {
      const progress = getProgress(state, challenge);
      const completed = progress >= challenge.goal;
      const claimed = state.claimed.includes(challenge.id);

      const bar = document.getElementById(challenge.bar);
      const text = document.getElementById(challenge.text);
      const button = document.getElementById(challenge.button);
      const card = document.getElementById(challenge.card);

      if (!bar || !text || !button || !card) return;

      const percentage = Math.min(
        100,
        (progress / challenge.goal) * 100
      );

      bar.style.width = `${percentage}%`;
      text.textContent =
        `${Math.min(progress, challenge.goal).toLocaleString()} / ` +
        `${challenge.goal.toLocaleString()} ${challenge.label}`;

      card.classList.toggle("completed", completed);

      button.disabled = !completed || claimed;
      button.classList.toggle("claimed", claimed);

      button.textContent = claimed
        ? "Claimed ✓"
        : completed
          ? "Claim XP"
          : "Locked";
    });
  }

  function recordResult(score, lines, message) {
    // Do not count games ended by switching modes or restarting.
    const reason = String(message || "").toLowerCase();

    if (
      reason.includes("mode changed") ||
      reason.includes("restart") ||
      reason.includes("reset")
    ) {
      return;
    }

    const state = readState();

    state.totalScore += Math.max(0, Number(score) || 0);
    state.totalLines += Math.max(0, Number(lines) || 0);
    state.games += 1;

    saveState(state);
    render();
  }

  challenges.forEach((challenge) => {
    const button = document.getElementById(challenge.button);

    if (!button) return;

    button.addEventListener("click", () => {
      const state = readState();
      const progress = getProgress(state, challenge);

      if (
        progress < challenge.goal ||
        state.claimed.includes(challenge.id)
      ) {
        return;
      }

      state.claimed.push(challenge.id);
      localStorage.setItem(
        XP_KEY,
        String(getTotalXP() + challenge.reward)
      );

      saveState(state);
      render();
    });
  });

  window.blockdropRecordDailyChallenge = recordResult;
  window.blockdropRefreshDailyChallenges = render;

  render();
  
/* COMMIT 15 — POWER-UP SYSTEM */

(() => {
  "use strict";

  const powers = {
    bomb: 2,
    line: 2,
    freeze: 2
  };

  const buttons = {
    bomb: document.getElementById("bombPower"),
    line: document.getElementById("linePower"),
    freeze: document.getElementById("freezePower")
  };

  const countElements = {
    bomb: document.getElementById("bombCount"),
    line: document.getElementById("lineCount"),
    freeze: document.getElementById("freezeCount")
  };

  const status = document.getElementById("powerupStatus");

  if (!status || Object.values(buttons).some((button) => !button)) {
    return;
  }

  let freezeTimeout = null;
  let freezeActive = false;

  function announce(message, type = "success") {
    status.textContent = message;
    status.className = "powerup-status";

    if (type === "success") {
      status.classList.add("powerup-success");
    } else if (type === "error") {
      status.classList.add("powerup-error");
    }
  }

  function updateUI() {
    Object.keys(powers).forEach((key) => {
      countElements[key].textContent =
        `${powers[key]} available`;

      buttons[key].disabled = powers[key] <= 0;
    });
  }

  function spendPower(key) {
    if (powers[key] <= 0) {
      announce("No uses left for this power-up.", "error");
      return false;
    }

    powers[key] -= 1;
    updateUI();
    return true;
  }

  function getBoard() {
    const board = window.board;
    const cols = Number(window.COLS);
    const rows = Number(window.ROWS);

    if (
      !Array.isArray(board) ||
      !Number.isInteger(cols) ||
      !Number.isInteger(rows) ||
      cols <= 0 ||
      rows <= 0 ||
      board.length !== rows ||
      board.some((row) => !Array.isArray(row) || row.length !== cols)
    ) {
      return null;
    }

    return { board, cols, rows };
  }

  function getOccupied(value) {
    return value !== null &&
      value !== undefined &&
      value !== 0 &&
      value !== false &&
      value !== "";
  }

  function isPlaying() {
    if (window.gameEnded === true) return false;
    if (window.gameRunning === false) return false;
    return true;
  }

  function bombBlast() {
    const data = getBoard();

    if (!data) {
      announce(
        "Bomb needs to be connected to your game's board variables.",
        "error"
      );
      return;
    }

    const { board, cols, rows } = data;

    // Find the highest occupied cell in the board.
    let targetRow = -1;
    let targetCol = -1;

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (getOccupied(board[r][c])) {
          targetRow = r;
          targetCol = c;
          break;
        }
      }

      if (targetRow !== -1) break;
    }

    if (targetRow === -1) {
      announce("There are no placed blocks to blast.", "error");
      return;
    }

    if (!spendPower("bomb")) return;

    let cleared = 0;

    for (let r = Math.max(0, targetRow - 1);
      r <= Math.min(rows - 1, targetRow + 1); r++) {
      for (let c = Math.max(0, targetCol - 1);
        c <= Math.min(cols - 1, targetCol + 1); c++) {
        if (getOccupied(board[r][c])) {
          board[r][c] = 0;
          cleared++;
        }
      }
    }

    if (typeof window.drawBoard === "function") {
      window.drawBoard();
    } else if (typeof window.draw === "function") {
      window.draw();
    }

    announce(`Bomb blast activated! ${cleared} cells cleared.`);
  }

  function clearBottomLine() {
    const data = getBoard();

    if (!data) {
      announce(
        "Line Clear needs to be connected to your game's board variables.",
        "error"
      );
      return;
    }

    const { board, cols, rows } = data;
    let targetRow = -1;

    for (let r = rows - 1; r >= 0; r--) {
      if (board[r].some(getOccupied)) {
        targetRow = r;
        break;
      }
    }

    if (targetRow === -1) {
      announce("There are no blocks on the board to clear.", "error");
      return;
    }

    if (!spendPower("line")) return;

    // Clear the lowest occupied row and move the rows above down.
    board.splice(targetRow, 1);
    board.unshift(Array(cols).fill(0));

    if (typeof window.drawBoard === "function") {
      window.drawBoard();
    } else if (typeof window.draw === "function") {
      window.draw();
    }

    announce("Line Clear activated! One row removed.");
  }

  function freezeTime() {
    if (freezeActive) {
      announce("Freeze Time is already active.", "error");
      return;
    }

    if (typeof window.dropInterval !== "number") {
      announce(
        "Freeze needs to be connected to your game's falling-speed variable.",
        "error"
      );
      return;
    }

    if (!spendPower("freeze")) return;

    freezeActive = true;

    const originalInterval = window.dropInterval;
    window.dropInterval = Math.min(originalInterval * 2, 5000);

    announce("Freeze Time activated! Blocks are falling slower.");

    freezeTimeout = setTimeout(() => {
      window.dropInterval = originalInterval;
      freezeActive = false;
      freezeTimeout = null;
      announce("Freeze Time ended. Normal speed restored.");
    }, 5000);
  }

  buttons.bomb.addEventListener("click", () => {
    if (!isPlaying()) {
      announce("Start a game before using power-ups.", "error");
      return;
    }

    bombBlast();
  });

  buttons.line.addEventListener("click", () => {
    if (!isPlaying()) {
      announce("Start a game before using power-ups.", "error");
      return;
    }

    clearBottomLine();
  });

  buttons.freeze.addEventListener("click", () => {
    if (!isPlaying()) {
      announce("Start a game before using power-ups.", "error");
      return;
    }

    freezeTime();
  });

  updateUI();

  window.blockdropPowerUps = {
    reset() {
      powers.bomb = 2;
      powers.line = 2;
      powers.freeze = 2;

      if (freezeTimeout !== null) {
        clearTimeout(freezeTimeout);
        freezeTimeout = null;
      }

      freezeActive = false;
      updateUI();
      announce("Power-ups reset. Two uses of each ability available.");
    },

    getRemaining() {
      return { ...powers };
    }
  };
})();
})();


