(() => {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  const $ = (id) => document.getElementById(id);
  const overlay = $('overlay');
  const introCard = $('introCard');
  const endCard = $('endCard');
  const pauseBadge = $('pauseBadge');
  const toast = $('toast');
  const keys = new Set();
  const touchKeys = new Set();

  const state = {
    mode: 'intro',
    score: 0,
    time: 90,
    defeats: 0,
    total: 8,
    last: 0,
    spawnWait: 0,
    shake: 0,
    sound: true,
    toastTimer: 0,
    anim: 0,
  };

  const player = {
    x: 480,
    y: 423,
    vx: 0,
    vy: 0,
    face: 1,
    hp: 100,
    maxHp: 100,
    speed: 210,
    attack: 0,
    dash: 0,
    dashLock: 0,
    invuln: 0,
    anim: 0,
  };

  let enemies = [];
  let snacks = [];
  let particles = [];
  let audioCtx = null;

  const rand = (min, max) => min + Math.random() * (max - min);
  const clamp = (n, min, max) => Math.max(min, Math.min(max, n));

  function sound(freq = 440, duration = 0.08, type = 'square', volume = 0.04) {
    if (!state.sound) return;
    try {
      audioCtx ||= new (window.AudioContext || window.webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
      gain.gain.setValueAtTime(volume, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + duration);
    } catch (error) {
      // ignore audio failures
    }
  }

  function setToast(message) {
    toast.textContent = message;
    toast.classList.add('show');
    state.toastTimer = 1.35;
  }

  function updateHud() {
    const health = clamp(player.hp, 0, 100);
    $('healthFill').style.width = `${health}%`;
    $('score').textContent = String(state.score).padStart(6, '0');
    const seconds = Math.max(0, Math.ceil(state.time));
    const mm = String(Math.floor(seconds / 60)).padStart(2, '0');
    const ss = String(seconds % 60).padStart(2, '0');
    $('timer').textContent = `${mm}:${ss}`;
    $('missionCount').textContent = `${state.defeats} / ${state.total}`;
    $('missionProgress').style.width = `${(state.defeats / state.total) * 100}%`;
    const waveText = state.defeats >= state.total
      ? 'COURTYARD CLEARED'
      : state.mode === 'playing'
        ? `BULLIES LEFT: ${Math.max(0, state.total - state.defeats)}`
        : 'READY WHEN YOU ARE';
    $('waveText').textContent = waveText;
    $('round').textContent = '01';
  }

  function syncOverlay() {
    const playing = state.mode === 'playing';
    overlay.classList.toggle('playing', playing);
    introCard.classList.toggle('hidden', state.mode !== 'intro');
    endCard.classList.toggle('hidden', !(state.mode === 'won' || state.mode === 'lost'));
    pauseBadge.classList.toggle('hidden', state.mode !== 'paused');
  }

  function startGame() {
    state.mode = 'playing';
    state.score = 0;
    state.time = 90;
    state.defeats = 0;
    state.spawnWait = 0.4;
    state.shake = 0;
    state.toastTimer = 0;
    player.x = 480;
    player.y = 423;
    player.vx = 0;
    player.vy = 0;
    player.face = 1;
    player.hp = 100;
    player.attack = 0;
    player.dash = 0;
    player.dashLock = 0;
    player.invuln = 0;
    enemies = [];
    snacks = [];
    particles = [];
    spawnEnemy();
    spawnEnemy();
    toast.classList.remove('show');
    syncOverlay();
    updateHud();
    sound(580, 0.12, 'triangle');
  }

  function finishGame(won) {
    state.mode = won ? 'won' : 'lost';
    syncOverlay();
    $('endKicker').textContent = won ? 'NEIGHBORHOOD REPORT' : 'BACK TO THE BARREL';
    $('endTitle').innerHTML = won ? 'NICE<br><em>WORK!</em>' : 'OH, <em>NO!</em><br>TRY AGAIN';
    $('endText').textContent = won
      ? `You sent the bullies packing and scored ${String(state.score).padStart(6, '0')} points. The courtyard is yours!`
      : 'The bullies took over this round. Catch your breath and give it another go.';
    toast.classList.remove('show');
    sound(won ? 760 : 180, 0.28, 'sawtooth');
    updateHud();
  }

  function pauseGame() {
    if (state.mode === 'playing') {
      state.mode = 'paused';
      syncOverlay();
    } else if (state.mode === 'paused') {
      state.mode = 'playing';
      syncOverlay();
      state.last = performance.now();
    }
  }

  function spawnEnemy() {
    if (state.defeats + enemies.length >= state.total) return;
    let x = rand(120, 840);
    let y = rand(352, 402);
    if (Math.abs(x - player.x) < 110) {
      x = x < 480 ? 120 : 840;
    }
    const types = ['scout', 'brute', 'runner'];
    const type = types[Math.floor(Math.random() * types.length)];
    enemies.push({
      x,
      y,
      hp: type === 'brute' ? 2 : 1,
      face: x < player.x ? 1 : -1,
      speed: type === 'runner' ? 102 : type === 'brute' ? 65 : 78,
      type,
      anim: rand(0, 6),
      flash: 0,
      attack: 0,
      cool: rand(0.5, 1.3),
      mode: 'patrol',
    });
  }

  function burst(x, y, color, count = 8) {
    for (let i = 0; i < count; i += 1) {
      const angle = rand(0, Math.PI * 2);
      const velocity = rand(35, 180);
      particles.push({
        x,
        y,
        vx: Math.cos(angle) * velocity,
        vy: Math.sin(angle) * velocity,
        life: rand(0.25, 0.6),
        max: 0.6,
        color,
        size: rand(2, 5),
      });
    }
  }

  function punch() {
    if (state.mode !== 'playing' || player.attack > 0 || player.dash > 0) return;
    player.attack = 0.25;
    sound(220, 0.07, 'square', 0.03);

    let hit = false;
    for (const enemy of enemies) {
      const dx = enemy.x - player.x;
      const dy = enemy.y - player.y;
      const front = dx * player.face;
      if (front > -18 && front < 90 && Math.abs(dy) < 55) {
        enemy.hp -= 1;
        enemy.flash = 0.18;
        enemy.x += player.face * 18;
        state.score += 100;
        hit = true;
        burst(enemy.x, enemy.y - 35, '#ffd966', 6);
        sound(150, 0.08, 'sawtooth', 0.04);

        if (enemy.hp <= 0) {
          state.defeats += 1;
          state.score += 250;
          burst(enemy.x, enemy.y - 28, '#f26c3a', 12);
          if (Math.random() < 0.7) {
            snacks.push({ x: enemy.x, y: enemy.y, age: 0 });
          }
          setToast(['NICE ONE!', 'THAT\'S THE SPIRIT!', 'BULLY DOWN!'][Math.floor(Math.random() * 3)]);
        }
      }
    }

    enemies = enemies.filter((enemy) => enemy.hp > 0);
    if (!hit) {
      sound(120, 0.06, 'triangle', 0.02);
    }
    updateHud();
  }

  function dash() {
    if (state.mode !== 'playing' || player.dashLock > 0) return;
    let dx = 0;
    let dy = 0;
    if (keys.has('d') || keys.has('arrowright')) dx += 1;
    if (keys.has('a') || keys.has('arrowleft')) dx -= 1;
    if (keys.has('s') || keys.has('arrowdown')) dy += 1;
    if (keys.has('w') || keys.has('arrowup')) dy -= 1;
    if (!dx && !dy) dx = player.face;
    const length = Math.hypot(dx, dy) || 1;
    player.vx = (dx / length) * 520;
    player.vy = (dy / length) * 520;
    player.dash = 0.16;
    player.dashLock = 0.8;
    player.invuln = 0.2;
    burst(player.x, player.y - 18, '#fff1c4', 5);
    sound(320, 0.1, 'triangle');
  }

  function drawBackground() {
    const sky = ctx.createLinearGradient(0, 0, 0, 300);
    sky.addColorStop(0, '#83bdc5');
    sky.addColorStop(0.7, '#aad0c5');
    sky.addColorStop(1, '#e5bf83');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H);

    ctx.fillStyle = '#f9d78e';
    ctx.beginPath();
    ctx.arc(783, 92, 37, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffedb9';
    ctx.beginPath();
    ctx.arc(783, 92, 27, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#6b8580';
    ctx.fillRect(0, 222, W, 82);
    ctx.fillStyle = '#778b81';
    for (let i = 0; i < 12; i += 1) {
      const x = i * 87 - 18;
      const h = rand(18, 45);
      ctx.fillRect(x, 220 - h, 70, h + 85);
      ctx.fillStyle = '#485d5b';
      ctx.fillRect(x + 12, 238 - h, 9, 13);
      ctx.fillRect(x + 38, 238 - h, 9, 13);
      ctx.fillStyle = '#778b81';
    }

    ctx.fillStyle = '#d8754e';
    ctx.fillRect(0, 112, 219, 206);
    ctx.fillStyle = '#e98b5c';
    ctx.fillRect(0, 112, 219, 23);
    ctx.fillStyle = '#a44f43';
    ctx.fillRect(0, 287, 219, 31);
    for (let i = 0; i < 4; i += 1) {
      const x = 22 + i * 49;
      ctx.fillStyle = '#f2c37c';
      ctx.fillRect(x, 153, 29, 53);
      ctx.fillStyle = '#54696a';
      ctx.fillRect(x + 4, 157, 21, 44);
      ctx.fillStyle = '#e7e2c9';
      ctx.fillRect(x + 13, 157, 2, 44);
      ctx.fillRect(x + 4, 177, 21, 2);
    }
    ctx.fillStyle = '#b45843';
    ctx.fillRect(55, 227, 71, 91);
    ctx.fillStyle = '#e7ae68';
    ctx.fillRect(61, 235, 59, 83);
    ctx.fillStyle = '#704c43';
    ctx.fillRect(72, 247, 38, 71);
    ctx.fillStyle = '#d5ad68';
    ctx.fillRect(103, 275, 4, 4);

    ctx.fillStyle = '#557d70';
    ctx.fillRect(741, 99, 219, 219);
    ctx.fillStyle = '#76a189';
    ctx.fillRect(741, 99, 219, 21);
    ctx.fillStyle = '#405e58';
    ctx.fillRect(741, 287, 219, 31);
    for (let i = 0; i < 4; i += 1) {
      const x = 761 + i * 47;
      ctx.fillStyle = '#e3c88a';
      ctx.fillRect(x, 143, 29, 58);
      ctx.fillStyle = '#526c6a';
      ctx.fillRect(x + 4, 147, 21, 49);
      ctx.fillStyle = '#e9e2c7';
      ctx.fillRect(x + 13, 147, 2, 49);
      ctx.fillRect(x + 4, 170, 21, 2);
    }
    ctx.fillStyle = '#dbb775';
    ctx.fillRect(814, 217, 72, 101);
    ctx.fillStyle = '#72574a';
    ctx.fillRect(827, 234, 44, 84);
    ctx.fillStyle = '#d1a96c';
    ctx.fillRect(838, 260, 5, 5);

    ctx.fillStyle = '#34494c';
    ctx.fillRect(21, 126, 180, 13);
    for (let i = 0; i < 9; i += 1) {
      ctx.fillStyle = i % 2 ? '#f2d07f' : '#f26c3a';
      ctx.beginPath();
      ctx.moveTo(21 + i * 20, 139);
      ctx.lineTo(41 + i * 20, 139);
      ctx.lineTo(38 + i * 20, 150);
      ctx.lineTo(24 + i * 20, 150);
      ctx.fill();
    }

    ctx.beginPath();
    ctx.roundRect(331, 146, 295, 58, 8);
    ctx.fillStyle = '#e8dfb6';
    ctx.fill();
    ctx.strokeStyle = '#32464b';
    ctx.lineWidth = 4;
    ctx.stroke();
    ctx.fillStyle = '#3d5554';
    ctx.font = 'bold 20px Space Grotesk, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('VILA DO CHAVES', 478, 171);
    ctx.font = '9px DM Mono, monospace';
    ctx.fillStyle = '#718077';
    ctx.fillText('A RUA É DE TODO MUNDO', 478, 189);

    ctx.strokeStyle = '#394b4b';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(226, 177);
    ctx.quadraticCurveTo(476, 214, 733, 169);
    ctx.stroke();
    const clothes = [
      ['#f5d276', 260, 179], ['#e66e50', 302, 184], ['#82a99a', 344, 189],
      ['#f2eee0', 389, 193], ['#6389a0', 435, 195], ['#d98958', 481, 194],
      ['#f5e1ab', 526, 191], ['#83a888', 572, 185], ['#ef8b67', 619, 179], ['#e7d16e', 665, 174]
    ];
    clothes.forEach(([col, x, y], index) => {
      ctx.fillStyle = '#394b4b';
      ctx.fillRect(x + 8, y - 7, 2, 8);
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + 19, y + 1);
      ctx.lineTo(x + 17, y + 27 + (index % 2) * 5);
      ctx.lineTo(x + 3, y + 26 + (index % 2) * 5);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#fff5d5';
      ctx.fillRect(x + 2, y, 16, 2);
    });

    ctx.fillStyle = '#ded0a7';
    ctx.fillRect(0, 300, W, 31);
    ctx.fillStyle = '#b7a982';
    ctx.fillRect(0, 328, W, 8);
    for (let x = 0; x < W; x += 75) {
      ctx.strokeStyle = '#c2b58f';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, 302);
      ctx.lineTo(x - 3, 328);
      ctx.stroke();
    }

    ctx.fillStyle = '#486553';
    ctx.fillRect(155, 266, 25, 39);
    ctx.fillStyle = '#65906a';
    ctx.beginPath();
    ctx.arc(168, 256, 17, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#78996b';
    ctx.beginPath();
    ctx.arc(150, 264, 11, 0, Math.PI * 2);
    ctx.arc(182, 267, 12, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#597a6b';
    ctx.fillRect(695, 265, 24, 40);
    ctx.fillStyle = '#7fa271';
    ctx.beginPath();
    ctx.arc(708, 255, 17, 0, Math.PI * 2);
    ctx.arc(695, 266, 11, 0, Math.PI * 2);
    ctx.arc(723, 265, 12, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#d39e57';
    ctx.beginPath();
    ctx.roundRect(843, 275, 47, 37, 7);
    ctx.fill();
    ctx.strokeStyle = '#8c603d';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = '#8b603e';
    ctx.fillRect(848, 283, 37, 3);
    ctx.fillRect(848, 299, 37, 3);

    const ground = ctx.createLinearGradient(0, 333, 0, H);
    ground.addColorStop(0, '#cc9f70');
    ground.addColorStop(1, '#b67e58');
    ctx.fillStyle = ground;
    ctx.fillRect(0, 336, W, H - 336);

    ctx.strokeStyle = '#a97054';
    ctx.lineWidth = 1;
    for (let y = 354; y < 550; y += 31) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
      ctx.stroke();
    }
    for (let x = -100; x < 1100; x += 110) {
      ctx.beginPath();
      ctx.moveTo(480 + (x - 480) * 0.35, 336);
      ctx.lineTo(x, 540);
      ctx.stroke();
    }

    ctx.globalAlpha = 0.22;
    ctx.strokeStyle = '#f5dfb9';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(479, 439, 112, Math.PI * 0.08, Math.PI * 0.84);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(405, 386);
    ctx.lineTo(421, 390);
    ctx.moveTo(536, 458);
    ctx.lineTo(557, 454);
    ctx.stroke();
    ctx.globalAlpha = 1;

    ctx.fillStyle = '#61765c';
    [[44, 345], [925, 365], [115, 516], [850, 506]].forEach(([x, y]) => {
      ctx.fillRect(x, y, 3, 7);
      ctx.fillRect(x + 4, y - 3, 2, 10);
    });

    const vignette = ctx.createRadialGradient(480, 275, 180, 480, 275, 600);
    vignette.addColorStop(0.55, '#1c2a2500');
    vignette.addColorStop(1, '#1c2a2533');
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, W, H);
  }

  function drawCharacter(ch, isPlayer = false) {
    const moving = Math.hypot(ch.vx || 0, ch.vy || 0) > 20 || (!isPlayer && ch.mode === 'chase');
    const stride = moving ? Math.sin(state.anim * 13 + (ch.anim || 0)) * 3 : Math.sin(state.anim * 3 + (ch.anim || 0)) * 1.2;
    ctx.save();
    ctx.translate(ch.x, ch.y);
    if (ch.flash > 0 && Math.floor(state.anim * 45) % 2 === 0) {
      ctx.globalAlpha = 0.48;
    }

    ctx.fillStyle = '#59423955';
    ctx.beginPath();
    ctx.ellipse(0, -1, 22, 7, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = isPlayer ? '#386e66' : ch.type === 'brute' ? '#bd6247' : ch.type === 'runner' ? '#554e79' : '#496c83';
    ctx.fillRect(-10, -23 + stride, 9, 21);
    ctx.fillRect(2, -23 - stride, 9, 21);
    ctx.fillStyle = '#423b37';
    ctx.fillRect(-13, -6 + stride, 14, 6);
    ctx.fillRect(0, -6 - stride, 14, 6);

    if (isPlayer) {
      ctx.fillStyle = '#506a49';
      ctx.fillRect(-13, -54, 26, 34);
      ctx.fillStyle = '#e7e2c6';
      ctx.fillRect(-12, -52, 24, 7);
      ctx.fillStyle = '#607c53';
      ctx.fillRect(-12, -45, 24, 8);
      ctx.fillStyle = '#f0e7ca';
      ctx.fillRect(-12, -37, 24, 7);
      ctx.fillStyle = '#607c53';
      ctx.fillRect(-12, -30, 24, 9);
      ctx.fillStyle = '#4b6848';
      ctx.fillRect(-13, -27, 26, 7);
    } else {
      ctx.fillStyle = ch.type === 'brute' ? '#bc593d' : ch.type === 'runner' ? '#655883' : '#dbb64d';
      ctx.fillRect(-14, -53, 28, 34);
      ctx.fillStyle = '#f3dfb0';
      ctx.fillRect(-14, -51, 28, 7);
      ctx.fillStyle = ch.type === 'brute' ? '#bc593d' : ch.type === 'runner' ? '#655883' : '#dbb64d';
      ctx.fillRect(-14, -44, 28, 7);
      ctx.fillStyle = '#f3dfb0';
      ctx.fillRect(-14, -37, 28, 7);
      ctx.fillStyle = ch.type === 'brute' ? '#bc593d' : ch.type === 'runner' ? '#655883' : '#dbb64d';
      ctx.fillRect(-14, -30, 28, 10);
      ctx.fillStyle = '#3f5047';
      ctx.fillRect(-15, -25, 30, 7);
    }

    const swinging = ch.attack > 0;
    const side = ch.face || 1;
    ctx.strokeStyle = isPlayer ? '#cf916a' : '#d99a70';
    ctx.lineWidth = 7;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-11, -48);
    ctx.lineTo(-17, -34);
    ctx.moveTo(11, -48);
    ctx.lineTo(swinging ? 24 * side : 17, swinging ? -42 : -34);
    ctx.stroke();
    if (swinging) {
      ctx.fillStyle = '#fff0c0';
      ctx.beginPath();
      ctx.arc(side * 30, -42, 5 + Math.sin(state.anim * 35) * 2, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.fillStyle = isPlayer ? '#d89b70' : '#dba078';
    ctx.fillRect(-5, -61, 10, 9);
    ctx.beginPath();
    ctx.ellipse(0, -72, 14, 15, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#c98562';
    ctx.beginPath();
    ctx.arc(-14, -72, 3, 0, Math.PI * 2);
    ctx.arc(14, -72, 3, 0, Math.PI * 2);
    ctx.fill();

    if (isPlayer) {
      ctx.fillStyle = '#79563c';
      ctx.beginPath();
      ctx.ellipse(0, -81, 17, 8, 0, Math.PI, Math.PI * 2);
      ctx.fill();
      ctx.fillRect(-16, -82, 32, 5);
      ctx.fillStyle = '#68452f';
      ctx.fillRect(-17, -79, 6, 9);
      ctx.fillRect(11, -79, 6, 9);
      ctx.fillStyle = '#a57b52';
      ctx.fillRect(-11, -86, 22, 3);
    } else {
      ctx.fillStyle = ch.type === 'brute' ? '#394d61' : ch.type === 'runner' ? '#b77242' : '#4e6148';
      ctx.beginPath();
      ctx.ellipse(0, -82, 16, 8, 0, Math.PI, Math.PI * 2);
      ctx.fill();
      ctx.fillRect(-17, -82, 34, 4);
      ctx.fillStyle = '#29383a';
      ctx.fillRect(-10, -74, 4, 3);
    }

    ctx.fillStyle = '#352f2d';
    ctx.fillRect(side * 4 - 1, -73, 3, 3);
    ctx.fillRect(-7, -77, 5, 2);
    ctx.fillRect(side * 1 - 3, -65, 8, 2);
    if (isPlayer) {
      ctx.fillStyle = '#f4d36a';
      ctx.fillRect(-5, -57, 10, 3);
    }
    ctx.restore();
  }

  function drawSnack(snack) {
    ctx.save();
    ctx.translate(snack.x, snack.y - 18 + Math.sin(snack.age * 6) * 4);
    ctx.fillStyle = '#46362e55';
    ctx.beginPath();
    ctx.ellipse(0, 22, 14, 4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#f3d171';
    ctx.beginPath();
    ctx.arc(0, 0, 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ba7045';
    ctx.beginPath();
    ctx.arc(0, 0, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff0b7';
    ctx.beginPath();
    ctx.arc(-3, -3, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawParticles() {
    particles.forEach((particle) => {
      ctx.globalAlpha = clamp(particle.life / particle.max, 0, 1);
      ctx.fillStyle = particle.color;
      ctx.fillRect(particle.x - particle.size / 2, particle.y - particle.size / 2, particle.size, particle.size);
    });
    ctx.globalAlpha = 1;
  }

  function draw() {
    ctx.save();
    if (state.shake > 0) {
      ctx.translate(rand(-state.shake, state.shake), rand(-state.shake, state.shake));
    }
    drawBackground();
    snacks.forEach(drawSnack);
    const actors = [...enemies.map((enemy) => ({ obj: enemy, player: false })), { obj: player, player: true }].sort((a, b) => a.obj.y - b.obj.y);
    actors.forEach(({ obj, player: isPlayer }) => drawCharacter(obj, isPlayer));
    drawParticles();
    ctx.restore();
  }

  function update(dt) {
    state.anim += dt;
    if (state.toastTimer > 0) {
      state.toastTimer -= dt;
      if (state.toastTimer <= 0) {
        toast.classList.remove('show');
      }
    }
    state.shake = Math.max(0, state.shake - dt * 10);
    state.time -= dt;
    if (state.time <= 0) {
      state.time = 0;
      finishGame(state.defeats >= state.total);
      return;
    }

    let playerMoveX = 0;
    let playerMoveY = 0;
    if (keys.has('d') || keys.has('arrowright')) playerMoveX += 1;
    if (keys.has('a') || keys.has('arrowleft')) playerMoveX -= 1;
    if (keys.has('s') || keys.has('arrowdown')) playerMoveY += 1;
    if (keys.has('w') || keys.has('arrowup')) playerMoveY -= 1;

    if (playerMoveX || playerMoveY) {
      const length = Math.hypot(playerMoveX, playerMoveY) || 1;
      const maxSpeed = player.speed + (player.dash > 0 ? 120 : 0);
      player.vx = (playerMoveX / length) * maxSpeed;
      player.vy = (playerMoveY / length) * maxSpeed;
      if (playerMoveX !== 0) player.face = playerMoveX > 0 ? 1 : -1;
    } else {
      player.vx *= 0.7;
      player.vy *= 0.7;
    }

    if (player.attack > 0) player.attack -= dt;
    if (player.dash > 0) {
      player.dash -= dt;
      player.vx *= 0.96;
      player.vy *= 0.96;
    }
    if (player.dashLock > 0) player.dashLock -= dt;
    if (player.invuln > 0) player.invuln -= dt;

    player.x = clamp(player.x + player.vx * dt, 50, W - 50);
    player.y = clamp(player.y + player.vy * dt, 330, 485);

    state.spawnWait -= dt;
    if (state.spawnWait <= 0 && enemies.length < state.total - state.defeats) {
      spawnEnemy();
      state.spawnWait = rand(1.3, 2.4);
    }

    enemies.forEach((enemy) => {
      enemy.flash = Math.max(0, enemy.flash - dt);
      enemy.attack = Math.max(0, enemy.attack - dt);
      enemy.anim += dt;
      const dx = player.x - enemy.x;
      const dy = player.y - enemy.y;
      const dist = Math.hypot(dx, dy) || 1;
      const targetSpeed = enemy.speed * (enemy.type === 'runner' ? 1.15 : 1);

      if (dist > 40) {
        enemy.mode = 'chase';
        const nx = dx / dist;
        const ny = dy / dist;
        enemy.x += nx * targetSpeed * dt;
        enemy.y += ny * targetSpeed * dt;
      } else {
        enemy.mode = 'idle';
      }

      if (dist < 42) {
        enemy.face = dx > 0 ? 1 : -1;
        if (enemy.cool <= 0) {
          enemy.cool = rand(0.8, 1.4);
          enemy.attack = 0.18;
          if (player.invuln <= 0) {
            player.hp -= enemy.type === 'brute' ? 16 : 11;
            player.invuln = 0.6;
            state.shake = 7;
            sound(120, 0.09, 'sawtooth', 0.03);
          }
        }
      }

      enemy.cool -= dt;
      enemy.x = clamp(enemy.x, 46, W - 46);
      enemy.y = clamp(enemy.y, 330, 485);
    });

    snacks = snacks.filter((snack) => {
      const dx = snack.x - player.x;
      const dy = snack.y - player.y;
      const dist = Math.hypot(dx, dy);
      if (dist < 26) {
        player.hp = clamp(player.hp + 18, 0, player.maxHp);
        state.score += 150;
        setToast('TORTA ENERGY!');
        sound(660, 0.09, 'triangle', 0.03);
        return false;
      }
      snack.age += dt;
      return snack.age < 8;
    });

    particles.forEach((particle) => {
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.life -= dt;
      particle.vy += 100 * dt;
    });
    particles = particles.filter((particle) => particle.life > 0);

    if (player.hp <= 0) {
      player.hp = 0;
      finishGame(false);
      return;
    }

    if (state.defeats >= state.total) {
      finishGame(true);
      return;
    }

    updateHud();
  }

  function frame(timestamp) {
    if (!state.last) state.last = timestamp;
    const dt = Math.min((timestamp - state.last) / 1000, 0.033);
    state.last = timestamp;
    if (state.mode === 'playing') {
      update(dt);
    } else {
      state.anim += dt;
      if (state.toastTimer > 0) {
        state.toastTimer -= dt;
        if (state.toastTimer <= 0) toast.classList.remove('show');
      }
    }
    draw();
    requestAnimationFrame(frame);
  }

  function keyForEvent(event) {
    const key = event.key.toLowerCase();
    return key;
  }

  document.addEventListener('keydown', (event) => {
    const key = keyForEvent(event);
    if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(key) || event.code === 'Space') {
      event.preventDefault();
    }
    if (key === 'enter' && (state.mode === 'intro' || state.mode === 'won' || state.mode === 'lost')) {
      startGame();
      return;
    }
    if (event.key === 'Escape') {
      pauseGame();
      return;
    }
    if (event.code === 'Space' && state.mode === 'playing') {
      punch();
      return;
    }
    if (event.key === 'Shift' && state.mode === 'playing') {
      dash();
      return;
    }
    keys.add(key);
    touchKeys.add(key);
  });

  document.addEventListener('keyup', (event) => {
    const key = keyForEvent(event);
    keys.delete(key);
    touchKeys.delete(key);
  });

  $('playButton').addEventListener('click', startGame);
  $('restartButton').addEventListener('click', startGame);
  $('soundToggle').addEventListener('click', () => {
    state.sound = !state.sound;
    $('soundIcon').textContent = state.sound ? '♫' : '♩';
    $('soundLabel').textContent = state.sound ? 'SOUND ON' : 'SOUND OFF';
    if (state.sound) sound(440, 0.06, 'square', 0.025);
  });

  document.querySelectorAll('[data-dir]').forEach((button) => {
    const dir = button.dataset.dir;
    const press = (event) => {
      event.preventDefault();
      if (dir === 'up') keys.add('w');
      if (dir === 'down') keys.add('s');
      if (dir === 'left') keys.add('a');
      if (dir === 'right') keys.add('d');
    };
    const release = () => {
      if (dir === 'up') keys.delete('w');
      if (dir === 'down') keys.delete('s');
      if (dir === 'left') keys.delete('a');
      if (dir === 'right') keys.delete('d');
    };
    button.addEventListener('pointerdown', press);
    button.addEventListener('pointerup', release);
    button.addEventListener('pointerleave', release);
    button.addEventListener('pointercancel', release);
  });

  $('touchDash').addEventListener('pointerdown', (event) => {
    event.preventDefault();
    dash();
  });

  $('touchPunch').addEventListener('pointerdown', (event) => {
    event.preventDefault();
    punch();
  });

  syncOverlay();
  updateHud();
  requestAnimationFrame(frame);
})();
