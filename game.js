/* BLOCKDROP — GAME ENGINE + THEMES + EFFECTS
   Plain JavaScript, no framework required.
*/
(() => {
  "use strict";
  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => [...document.querySelectorAll(selector)];
  const canvas = $("#gameCanvas");
  const ctx = canvas.getContext("2d");
  const nextCanvas = $("#nextCanvas");
  const nextCtx = nextCanvas.getContext("2d");
  const COLS = 10, ROWS = 20, CELL = 30;
  const SHAPES = {
    I: [[1,1,1,1]],
    O: [[1,1],[1,1]],
    T: [[0,1,0],[1,1,1]],
    S: [[0,1,1],[1,1,0]],
    Z: [[1,1,0],[0,1,1]],
    J: [[1,0,0],[1,1,1]],
    L: [[0,0,1],[1,1,1]]
  };
  const PALETTE = {
    I: ["#fb7185","#be123c"], O: ["#facc15","#a16207"],
    T: ["#c084fc","#7e22ce"], S: ["#4ade80","#15803d"],
    Z: ["#f87171","#b91c1c"], J: ["#60a5fa","#1d4ed8"], L: ["#fb923c","#c2410c"]
  };
  const state = {
    board: emptyBoard(), piece: null, next: null, score: 0, lines: 0, level: 1,
    combo: 0, running: false, paused: false, over: false, lastTime: 0, dropCounter: 0,
    sound: true, audio: null, particles: [], flashUntil: 0, games: 0, best: 0,
    totalLines: 0, topLevel: 1, difficulty: "classic"
  };
  let toastTimer;
  function emptyBoard() { return Array.from({length: ROWS}, () => Array(COLS).fill(null)); }
  function cloneMatrix(matrix) { return matrix.map(row => [...row]); }
  function randomPiece() {
    const types = Object.keys(SHAPES), type = types[Math.floor(Math.random() * types.length)];
    return { type, matrix: cloneMatrix(SHAPES[type]), x: Math.floor((COLS - SHAPES[type][0].length) / 2), y: 0 };
  }
  function readStats() {
    try {
      const saved = JSON.parse(localStorage.getItem("blockdrop_final_stats_v1") || "{}");
      state.best = Number(saved.best) || 0; state.games = Number(saved.games) || 0;
      state.totalLines = Number(saved.totalLines) || 0; state.topLevel = Number(saved.topLevel) || 1;
    } catch {}
    renderStats();
  }
  function saveStats() {
    try { localStorage.setItem("blockdrop_final_stats_v1", JSON.stringify({
      best: state.best, games: state.games, totalLines: state.totalLines, topLevel: state.topLevel
    })); } catch {}
    renderStats();
  }
  function renderStats() {
    $("#bestScore").textContent = String(state.best).padStart(6,"0");
    $("#gamesPlayed").textContent = String(state.games).padStart(2,"0");
    $("#totalLines").textContent = String(state.totalLines).padStart(3,"0");
    $("#topLevel").textContent = String(state.topLevel).padStart(2,"0");
    $("#xpLabel").textContent = `${state.score % 500} / 500 XP`;
    $("#xpBar").style.width = `${(state.score % 500) / 5}%`;
  }
  function formatNum(n) { return String(n).padStart(6,"0"); }
  function collision(piece, offsetX=0, offsetY=0, matrix=piece.matrix) {
    for (let y=0;y<matrix.length;y++) for (let x=0;x<matrix[y].length;x++) {
      if (!matrix[y][x]) continue;
      const bx = piece.x+x+offsetX, by = piece.y+y+offsetY;
      if (bx < 0 || bx >= COLS || by >= ROWS) return true;
      if (by >= 0 && state.board[by][bx]) return true;
    }
    return false;
  }
  function rotate(matrix) {
    return matrix[0].map((_, i) => matrix.map(row => row[i]).reverse());
  }
  function spawnPiece() {
    state.piece = state.next || randomPiece();
    state.next = randomPiece();
    drawNext();
    if (collision(state.piece)) endGame();
  }
  function mergePiece() {
    const p = state.piece;
    p.matrix.forEach((row,y) => row.forEach((v,x) => {
      if (v && p.y+y >= 0) state.board[p.y+y][p.x+x] = p.type;
    }));
    clearLines();
    spawnPiece();
  }
  function clearLines() {
    let count = 0;
    for (let y=ROWS-1;y>=0;y--) {
      if (state.board[y].every(Boolean)) {
        state.board.splice(y,1); state.board.unshift(Array(COLS).fill(null)); count++; y++;
      }
    }
    if (count) {
      state.combo++;
      const points = [0,100,300,500,800][count] || count*250;
      state.score += points * state.level;
      state.lines += count; state.totalLines += count;
      state.level = Math.floor(state.lines/10)+1;
      state.topLevel = Math.max(state.topLevel,state.level);
      state.flashUntil = performance.now()+250;
      $("#gameStage").classList.remove("shake","flash"); void $("#gameStage").offsetWidth;
      $("#gameStage").classList.add("shake","flash");
      addParticles(canvas.width/2,canvas.height*.45,24);
      showToast(`${count === 4 ? "TETRIS!" : "LINE CLEAR!"} +${points*state.level}`);
    } else state.combo = 0;
    updateHUD();
    if (state.score > state.best) state.best = state.score;
    saveStats();
  }
  function updateHUD() {
    $("#score").textContent = formatNum(state.score);
    $("#level").textContent = String(state.level).padStart(2,"0");
    $("#lines").textContent = String(state.lines).padStart(3,"0");
    $("#combo").textContent = `x${state.combo}`;
    $("#comboBar").style.width = `${Math.min(100,state.combo*25)}%`;
    renderStats();
  }
  function drawCell(context,x,y,size,type,ghost=false) {
    const colors = PALETTE[type] || ["#ff304f","#8f142c"];
    const grad = context.createLinearGradient(x,y,x+size,y+size);
    grad.addColorStop(0,colors[0]); grad.addColorStop(1,colors[1]);
    context.fillStyle = ghost ? `${colors[0]}44` : grad;
    context.fillRect(x+1,y+1,size-2,size-2);
    context.strokeStyle = ghost ? `${colors[0]}88` : "rgba(255,255,255,.28)";
    context.lineWidth = 1;
    context.strokeRect(x+1.5,y+1.5,size-3,size-3);
    if (!ghost) {
      context.fillStyle = "rgba(255,255,255,.24)";
      context.fillRect(x+4,y+4,size-8,2);
      context.fillStyle = "rgba(0,0,0,.12)";
      context.fillRect(x+4,y+size-5,size-8,2);
      context.fillStyle = "rgba(255,255,255,.08)";
      context.fillRect(x+4,y+4,2,size-8);
    }
  }
  function drawPiece(context,piece,cellSize,ghost=false,offsetY=0) {
    piece.matrix.forEach((row,y)=>row.forEach((v,x)=>{
      if(v) drawCell(context,(piece.x+x)*cellSize,(piece.y+y)*cellSize+offsetY,cellSize,piece.type,ghost);
    }));
  }
  function drawBoard() {
    const theme = document.documentElement.dataset.theme;
    const bg = theme === "royal" ? "#fff5ee" : "#0a0b12";
    const grid = theme === "royal" ? "rgba(90,56,74,.10)" : "rgba(255,255,255,.055)";
    ctx.clearRect(0,0,canvas.width,canvas.height);
    ctx.fillStyle=bg; ctx.fillRect(0,0,canvas.width,canvas.height);
    ctx.strokeStyle=grid; ctx.lineWidth=1;
    for(let x=0;x<=COLS;x++){ctx.beginPath();ctx.moveTo(x*CELL+.5,0);ctx.lineTo(x*CELL+.5,canvas.height);ctx.stroke();}
    for(let y=0;y<=ROWS;y++){ctx.beginPath();ctx.moveTo(0,y*CELL+.5);ctx.lineTo(canvas.width,y*CELL+.5);ctx.stroke();}
    state.board.forEach((row,y)=>row.forEach((type,x)=>{if(type)drawCell(ctx,x*CELL,y*CELL,CELL,type);}));
    if(state.piece){
      const ghost={...state.piece,y:state.piece.y};
      while(!collision(ghost,0,1)) ghost.y++;
      drawPiece(ctx,ghost,CELL,true);
      drawPiece(ctx,state.piece,CELL,false);
    }
    drawParticles();
  }
  function drawNext() {
    nextCtx.clearRect(0,0,nextCanvas.width,nextCanvas.height);
    const royal=document.documentElement.dataset.theme==="royal";
    nextCtx.fillStyle=royal?"#fff5ee":"#0a0b12";nextCtx.fillRect(0,0,nextCanvas.width,nextCanvas.height);
    if(!state.next)return;
    const m=state.next.matrix, cell=22;
    const w=m[0].length*cell,h=m.length*cell;
    const ox=(nextCanvas.width-w)/2,oy=(nextCanvas.height-h)/2;
    m.forEach((row,y)=>row.forEach((v,x)=>{if(v)drawCell(nextCtx,ox+x*cell,oy+y*cell,cell,state.next.type);}));
  }
  function move(dx) { if(!state.running||state.paused||state.over)return; if(!collision(state.piece,dx,0))state.piece.x+=dx; }
  function softDrop() { if(!state.running||state.paused||state.over)return; if(!collision(state.piece,0,1)){state.piece.y++;state.score+=1;}else mergePiece(); updateHUD(); }
  function hardDrop() {
    if(!state.running||state.paused||state.over)return;
    let distance=0; while(!collision(state.piece,0,1)){state.piece.y++;distance++;}
    state.score+=distance*2; addParticles(canvas.width/2,Math.min(canvas.height-20,(state.piece.y+1)*CELL),12);
    playTone(130,.06,"sawtooth",.035); mergePiece(); updateHUD();
  }
  function rotatePiece() {
    if(!state.running||state.paused||state.over)return;
    const rotated=rotate(state.piece.matrix);
    if(!collision(state.piece,0,0,rotated))state.piece.matrix=rotated;
    else if(!collision(state.piece,-1,0,rotated)){state.piece.x--;state.piece.matrix=rotated;}
    else if(!collision(state.piece,1,0,rotated)){state.piece.x++;state.piece.matrix=rotated;}
  }
  function startGame() {
    state.board=emptyBoard();state.score=0;state.lines=0;state.level=1;state.combo=0;
    state.running=true;state.paused=false;state.over=false;state.dropCounter=0;state.lastTime=0;
    state.next=randomPiece();spawnPiece();state.games++;saveStats();updateHUD();
    $("#gameOverlay").classList.add("hidden");$("#gameState").textContent="LIVE";
    $("#pauseButton").innerHTML="<span>Ⅱ</span> PAUSE GAME <kbd>P</kbd>";
    showToast("Arena online. Good luck!");
    playTone(420,.08,"triangle",.035);
  }
  function endGame() {
    state.running=false;state.over=true;
    if(state.score>state.best)state.best=state.score;
    saveStats();$("#gameState").textContent="RUN COMPLETE";
    $("#overlayTitle").innerHTML="RUN<br><span>COMPLETE.</span>";
    $("#overlayText").textContent=`Final score: ${state.score.toLocaleString()}. Ready for another run?`;
    $("#startButton").textContent="PLAY AGAIN ↗";
    $("#gameOverlay").classList.remove("hidden");
    playTone(110,.25,"triangle",.04);showToast("Run complete — reset and go again.");
  }
  function togglePause() {
    if(!state.running||state.over)return;
    state.paused=!state.paused;
    $("#gameState").textContent=state.paused?"PAUSED":"LIVE";
    $("#pauseButton").innerHTML=state.paused?"<span>▶</span> RESUME GAME <kbd>P</kbd>":"<span>Ⅱ</span> PAUSE GAME <kbd>P</kbd>";
    if(state.paused){$("#overlayTitle").innerHTML="TAKE A<br><span>BREATHER.</span>";$("#overlayText").textContent="Your board is frozen. Resume when you're ready." ;$("#startButton").textContent="RESUME GAME";$("#gameOverlay").classList.remove("hidden");}
    else {$("#gameOverlay").classList.add("hidden");state.lastTime=0;}
  }
  function loop(time=0) {
    const delta=state.lastTime?time-state.lastTime:0;state.lastTime=time;
    if(state.running&&!state.paused&&!state.over){
      state.dropCounter+=delta;
      const speed=Math.max(90,800-(state.level-1)*60)*(state.difficulty==="chill"?1.4:state.difficulty==="intense"?.65:1);
      if(state.dropCounter>speed){if(!collision(state.piece,0,1))state.piece.y++;else mergePiece();state.dropCounter=0;}
    }
    drawBoard();
    requestAnimationFrame(loop);
  }
  function addParticles(x,y,count) {
    const colors=["#ff304f","#f4c86a","#ff6f9c","#ffffff"];
    for(let i=0;i<count;i++)state.particles.push({x,y,vx:(Math.random()-.5)*5,vy:(Math.random()-.8)*5,life:25+Math.random()*20,color:colors[Math.floor(Math.random()*colors.length)],size:2+Math.random()*3});
  }
  function drawParticles() {
    state.particles=state.particles.filter(p=>p.life>0);
    state.particles.forEach(p=>{p.x+=p.vx;p.y+=p.vy;p.vy+=.08;p.life--;ctx.globalAlpha=Math.max(0,p.life/45);ctx.fillStyle=p.color;ctx.fillRect(p.x,p.y,p.size,p.size);});
    ctx.globalAlpha=1;
  }
  function playTone(freq,duration,type="sine",volume=.025) {
    if(!state.sound)return;
    try {
      state.audio=state.audio||new(window.AudioContext||window.webkitAudioContext)();
      if(state.audio.state==="suspended")state.audio.resume();
      const osc=state.audio.createOscillator(),gain=state.audio.createGain();
      osc.type=type;osc.frequency.value=freq;gain.gain.value=volume;
      gain.gain.exponentialRampToValueAtTime(.001,state.audio.currentTime+duration);
      osc.connect(gain);gain.connect(state.audio.destination);osc.start();osc.stop(state.audio.currentTime+duration);
    } catch {}
  }
  function toggleSound() {
    state.sound=!state.sound;
    $("#soundToggle").textContent=state.sound?"♫":"×";
    $("#soundGameButton").innerHTML=`<span>♫</span> SOUND ${state.sound?"ON":"OFF"} <kbd>M</kbd>`;
    try{localStorage.setItem("blockdrop_sound_v1",state.sound?"on":"off");}catch{}
    showToast(state.sound?"Sound enabled":"Sound muted");
    if(state.sound)playTone(520,.08);
  }
  function setTheme(theme) {
    document.documentElement.dataset.theme=theme;
    try{localStorage.setItem("blockdrop_theme_v1",theme);}catch{}
    $("#themeToggle").textContent=theme==="royal"?"◑":"◐";
    document.querySelector('meta[name="theme-color"]').content=theme==="royal"?"#fff9f3":"#09090d";
    drawNext();drawBoard();
    showToast(theme==="royal"?"Royal Gold & Pink theme":"Crimson Noir theme");
  }
  function showToast(message) {
    const toast=$("#toast");toast.textContent=message;toast.classList.add("show");
    clearTimeout(toastTimer);toastTimer=setTimeout(()=>toast.classList.remove("show"),2200);
  }
  function bootLoader() {
    const loader=$("#loader"),percent=$("#loadPercent"),bar=$(".loader-track i");
    let n=0;
    const timer=setInterval(()=>{n=Math.min(100,n+Math.floor(Math.random()*18)+7);percent.textContent=String(n).padStart(2,"0");bar.style.width=`${n}%`;if(n>=100){clearInterval(timer);setTimeout(()=>loader.classList.add("loaded"),250);}},90);
  }
  $("#startButton").addEventListener("click",()=>{if(state.paused){state.paused=false;$("#gameOverlay").classList.add("hidden");$("#gameState").textContent="LIVE";$("#pauseButton").innerHTML="<span>Ⅱ</span> PAUSE GAME <kbd>P</kbd>";}else startGame();});
  $("#heroPlay").addEventListener("click",()=>{if(!state.running||state.over)startGame();});
  $("#pauseButton").addEventListener("click",togglePause);
  $("#restartButton").addEventListener("click",startGame);
  $("#soundToggle").addEventListener("click",toggleSound);
  $("#soundGameButton").addEventListener("click",toggleSound);
  $("#themeToggle").addEventListener("click",()=>setTheme(document.documentElement.dataset.theme==="crimson"?"royal":"crimson"));
  $("#difficulty").addEventListener("change",e=>{state.difficulty=e.target.value;const hints={chill:"Relaxed pace. Make room to think.",classic:"The classic balance. Start stacking.",intense:"Faster drops. Stay sharp."};$("#difficultyHint").textContent=hints[state.difficulty];showToast(`${e.target.options[e.target.selectedIndex].text} mode selected`);});
  $("#mobileMenu").addEventListener("click",()=>{$(".topbar").classList.toggle("menu-open");});
  $$(".nav-links a").forEach(a=>a.addEventListener("click",()=>$(".topbar").classList.remove("menu-open")));
  $$("[data-control]").forEach(button=>button.addEventListener("pointerdown",e=>{e.preventDefault();const c=button.dataset.control;if(c==="left")move(-1);if(c==="right")move(1);if(c==="rotate")rotatePiece();if(c==="down")softDrop();if(c==="drop")hardDrop();}));
  document.addEventListener("keydown",e=>{
    if(["ArrowLeft","ArrowRight","ArrowDown","ArrowUp"," "].includes(e.key)&&!e.repeat)e.preventDefault();
    if(e.key==="ArrowLeft"||e.key.toLowerCase()==="a")move(-1);
    else if(e.key==="ArrowRight"||e.key.toLowerCase()==="d")move(1);
    else if(e.key==="ArrowDown"||e.key.toLowerCase()==="s")softDrop();
    else if(e.key==="ArrowUp"||e.key.toLowerCase()==="w")rotatePiece();
    else if(e.code==="Space")hardDrop();
    else if(e.key.toLowerCase()==="p")togglePause();
    else if(e.key.toLowerCase()==="r")startGame();
    else if(e.key.toLowerCase()==="m")toggleSound();
  });
  document.addEventListener("visibilitychange",()=>{if(document.hidden&&state.running&&!state.paused)togglePause();});
  try {
    const savedTheme=localStorage.getItem("blockdrop_theme_v1");
    if(savedTheme==="royal"||savedTheme==="crimson")document.documentElement.dataset.theme=savedTheme;
    state.sound=localStorage.getItem("blockdrop_sound_v1")!=="off";
  } catch {}
  $("#soundToggle").textContent=state.sound?"♫":"×";
  $("#soundGameButton").innerHTML=`<span>♫</span> SOUND ${state.sound?"ON":"OFF"} <kbd>M</kbd>`;
  $("#year").textContent=new Date().getFullYear();
  readStats();updateHUD();state.next=randomPiece();drawNext();drawBoard();bootLoader();requestAnimationFrame(loop);
})();
