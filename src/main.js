import './style.css'

const canvas = document.createElement('canvas');
const ctx = canvas.getContext('2d');
document.querySelector('#app').appendChild(canvas);

// 初始化画布大小
function resize() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
window.addEventListener('resize', resize);
resize();

// --- 1. 游戏状态控制 ---
let config = {
  themeColor: '#00f2ff',
  particleSpeed: 8,
  emitRate: 2,
  gravity: 0.05,
  pulseIntensity: 0,
  isFiring: true,
  fireRate: 0,
  fireRateLevel: 1,
  fireRateThresholds: { 1: 25, 2: 15, 3: 8 },
  isOverdrive: false,
  isFireMode: false, // Mode 1: continuous boss damage
  isIceMode: false, // Mode 2: slow boss bullets
  isDualBullet: false, // Mode 3: two columns of bullets
  isCircleBullet: false, // Mode 5: circle bullets around ship
  shipRotation: 0,
  rainbowHue: 0,
  starSpeedMultiplier: 1,
  isLaser: false,
  laserTimer: 0,
  laserDuration: 300,
  isPaused: false, // Mode 6: pause game
  fireModeTimer: 0, // Timer for fire mode DOT
  circleBulletTimer: 0
};

let particles = [];
let bullets = [];
let enemies = [];
let explosions = [];
let score = 0;
let health = 100;
let maxHealth = 100;
let boss = null;
let level = 1;
let nextBossScore = 30; // Score threshold for next boss
let gameOver = false;

let stars = Array.from({ length: 150 }, () => ({
  x: Math.random() * canvas.width,
  y: Math.random() * canvas.height,
  size: Math.random() * 2,
  speed: Math.random() * 2 + 1
}));

let mouse = { x: canvas.width / 2, y: canvas.height - 150 };
let targetMouse = { x: canvas.width / 2, y: canvas.height - 150 };

// --- Audio System ---
const AudioContext = window.AudioContext || window.webkitAudioContext;
let audioCtx = null;

function initAudio() {
  if (!audioCtx) {
    audioCtx = new AudioContext();
  }
}

function playSound(type) {
  if (!audioCtx) return;

  const oscillator = audioCtx.createOscillator();
  const gainNode = audioCtx.createGain();

  oscillator.connect(gainNode);
  gainNode.connect(audioCtx.destination);

  switch (type) {
    case 'kill':
      // Explosion sound - descending pitch
      oscillator.type = 'sawtooth';
      oscillator.frequency.setValueAtTime(300, audioCtx.currentTime);
      oscillator.frequency.exponentialRampToValueAtTime(50, audioCtx.currentTime + 0.2);
      gainNode.gain.setValueAtTime(0.3, audioCtx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.2);
      oscillator.start(audioCtx.currentTime);
      oscillator.stop(audioCtx.currentTime + 0.2);
      break;

    case 'collision':
      // Hit sound - short beep
      oscillator.type = 'square';
      oscillator.frequency.setValueAtTime(150, audioCtx.currentTime);
      oscillator.frequency.exponentialRampToValueAtTime(100, audioCtx.currentTime + 0.1);
      gainNode.gain.setValueAtTime(0.2, audioCtx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.1);
      oscillator.start(audioCtx.currentTime);
      oscillator.stop(audioCtx.currentTime + 0.1);
      break;

    case 'switch':
      // Mode switch - ascending chime
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(400, audioCtx.currentTime);
      oscillator.frequency.exponentialRampToValueAtTime(800, audioCtx.currentTime + 0.15);
      gainNode.gain.setValueAtTime(0.15, audioCtx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.15);
      oscillator.start(audioCtx.currentTime);
      oscillator.stop(audioCtx.currentTime + 0.15);
      break;

    case 'laserDeactivate':
      // Laser shutdown - descending whoosh
      oscillator.type = 'triangle';
      oscillator.frequency.setValueAtTime(600, audioCtx.currentTime);
      oscillator.frequency.exponentialRampToValueAtTime(100, audioCtx.currentTime + 0.3);
      gainNode.gain.setValueAtTime(0.2, audioCtx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.3);
      oscillator.start(audioCtx.currentTime);
      oscillator.stop(audioCtx.currentTime + 0.3);
      break;
  }
}

// --- 彩虹颜色生成函数 ---
function getRainbowColor(hue) {
  return `hsl(${hue % 360}, 100%, 60%)`;
}

// --- 2. 霓虹战机绘制函数 (替代图片) ---
function drawNeonShip(x, y, color, pulse, rotation) {
  const glowSize = 15 + pulse * 10;
  const shipColor = color;

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rotation);

  // 外发光
  ctx.shadowColor = shipColor;
  ctx.shadowBlur = glowSize;

  // 主体 - 流线型战机
  ctx.strokeStyle = shipColor;
  ctx.lineWidth = 2;
  ctx.fillStyle = 'rgba(0,0,0,0.8)';

  ctx.beginPath();
  // 机头
  ctx.moveTo(0, -25);
  // 右翼前缘
  ctx.lineTo(20, 5);
  // 右翼外缘
  ctx.lineTo(25, 20);
  // 右翼后缘
  ctx.lineTo(10, 15);
  // 引擎右侧
  ctx.lineTo(8, 25);
  // 引擎底部
  ctx.lineTo(-8, 25);
  // 引擎左侧
  ctx.lineTo(-10, 15);
  // 左翼后缘
  ctx.lineTo(-25, 20);
  // 左翼外缘
  ctx.lineTo(-20, 5);
  ctx.closePath();

  ctx.fill();
  ctx.stroke();

  // 驾驶舱发光
  ctx.fillStyle = shipColor;
  ctx.shadowBlur = 8;
  ctx.beginPath();
  ctx.ellipse(0, -5, 4, 8, 0, 0, Math.PI * 2);
  ctx.fill();

  // 引擎火焰
  const flameLength = 15 + Math.random() * 10 + pulse * 5;
  const gradient = ctx.createLinearGradient(0, 25, 0, 25 + flameLength);
  gradient.addColorStop(0, shipColor);
  gradient.addColorStop(1, 'transparent');

  ctx.fillStyle = gradient;
  ctx.shadowBlur = 20;
  ctx.beginPath();
  ctx.moveTo(-6, 25);
  ctx.lineTo(6, 25);
  ctx.lineTo(0, 25 + flameLength);
  ctx.closePath();
  ctx.fill();

  // 能量线装饰
  ctx.strokeStyle = shipColor;
  ctx.lineWidth = 1;
  ctx.shadowBlur = 5;
  ctx.beginPath();
  ctx.moveTo(-18, 10);
  ctx.lineTo(-10, 18);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(18, 10);
  ctx.lineTo(10, 18);
  ctx.stroke();

  ctx.restore();
}

// --- 3. 子弹类 ---
class Bullet {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.vy = -15;
    this.vx = 0;
    this.color = config.themeColor;
    this.scored = false;
    this.isCircular = false;
  }

  update() {
    if (this.isCircular) {
      this.x += this.vx;
      this.y += this.vy;
    } else {
      this.y += this.vy;
    }
  }

  draw() {
    ctx.save();
    ctx.shadowColor = this.color;
    ctx.shadowBlur = 15;
    ctx.strokeStyle = this.color;
    ctx.lineWidth = 3;

    if (this.isCircular) {
      // Circular bullets - draw as dots
      ctx.fillStyle = this.color;
      ctx.beginPath();
      ctx.arc(this.x, this.y, 4, 0, Math.PI * 2);
      ctx.fill();
    } else {
      // Normal bullets - draw as lines
      ctx.beginPath();
      ctx.moveTo(this.x, this.y);
      ctx.lineTo(this.x, this.y + 20);
      ctx.stroke();

      // 子弹核心
      ctx.fillStyle = '#fff';
      ctx.shadowBlur = 5;
      ctx.beginPath();
      ctx.arc(this.x, this.y, 2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  isOffScreen() {
    if (this.isCircular) {
      return this.x < -50 || this.x > canvas.width + 50 || this.y < -50 || this.y > canvas.height + 50;
    }
    return this.y < -30;
  }
}

// --- 4. 敌人类 (Bug) ---
class BugEnemy {
  constructor() {
    this.x = Math.random() * (canvas.width - 60) + 30;
    this.y = -30;
    this.vy = Math.random() * 2 + 1;
    this.vx = (Math.random() - 0.5) * 2;
    this.size = 20;
    this.health = 1;
    this.pulsePhase = Math.random() * Math.PI * 2;
  }

  update() {
    this.y += this.vy;
    this.x += this.vx;

    // 边界反弹
    if (this.x < this.size || this.x > canvas.width - this.size) {
      this.vx *= -1;
    }

    this.pulsePhase += 0.1;
  }

  draw() {
    const pulse = Math.sin(this.pulsePhase) * 0.3 + 1;

    ctx.save();
    ctx.translate(this.x, this.y);

    // Bug 身体 - 发光紫红色
    const bodyColor = '#ff00ff';
    ctx.shadowColor = bodyColor;
    ctx.shadowBlur = 10 * pulse;

    // 身体主体
    ctx.fillStyle = 'rgba(255, 0, 255, 0.3)';
    ctx.strokeStyle = bodyColor;
    ctx.lineWidth = 2;

    ctx.beginPath();
    ctx.ellipse(0, 0, this.size, this.size * 0.7, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // 眼睛
    ctx.fillStyle = '#fff';
    ctx.shadowBlur = 5;
    ctx.beginPath();
    ctx.arc(-6, -4, 3, 0, Math.PI * 2);
    ctx.arc(6, -4, 3, 0, Math.PI * 2);
    ctx.fill();

    // 触角
    ctx.strokeStyle = bodyColor;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-8, -10);
    ctx.lineTo(-15, -18);
    ctx.moveTo(8, -10);
    ctx.lineTo(15, -18);
    ctx.stroke();

    // 腿
    const legOffset = Math.sin(this.pulsePhase * 2) * 3;
    ctx.lineWidth = 1;
    for (let i = -1; i <= 1; i++) {
      ctx.beginPath();
      ctx.moveTo(i * 10, 10);
      ctx.lineTo(i * 15 + legOffset, 20);
      ctx.stroke();
    }

    ctx.restore();
  }

  isOffScreen() {
    return this.y > canvas.height + 30;
  }

  collidesWith(bullet) {
    const dx = this.x - bullet.x;
    const dy = this.y - bullet.y;
    return Math.sqrt(dx * dx + dy * dy) < this.size + 10;
  }
}

// --- Boss敌人类 ---
class BossEnemy {
  constructor(level) {
    this.x = canvas.width / 2;
    this.y = -80;
    this.vy = 0.5;
    this.vx = 2;
    this.size = 50;
    this.maxHealth = 15 + level * 10; // Boss HP scales with level: Lv1=25, Lv2=35, Lv3=45, etc.
    this.health = this.maxHealth;
    this.pulsePhase = 0;
    this.targetY = 120; // Position where boss stops descending
    this.phase = 'entering'; // entering, fighting
    this.attackTimer = 0;
    this.attackInterval = 120; // Slower shooting (2 seconds at 60fps)
    this.level = level;
  }

  update() {
    // Entering phase - move down to target position
    if (this.phase === 'entering') {
      if (this.y < this.targetY) {
        this.y += this.vy;
      } else {
        this.phase = 'fighting';
      }
    }

    // Fighting phase - move side to side
    if (this.phase === 'fighting') {
      this.x += this.vx;
      if (this.x < this.size + 50 || this.x > canvas.width - this.size - 50) {
        this.vx *= -1;
      }

      this.attackTimer++;
      // Shoot back at player
      if (this.attackTimer >= this.attackInterval) {
        this.attackTimer = 0;
        this.shoot();
      }
    }

    this.pulsePhase += 0.05;
  }

  shoot() {
    // Boss shoots single bullet toward player (slower in ice mode)
    const angle = Math.atan2(mouse.y - this.y, mouse.x - this.x);
    const bulletSpeed = config.isIceMode ? 3 : 6; // ice mode子弹减速
    enemies.push({
      x: this.x,
      y: this.y + this.size,
      vx: Math.cos(angle) * bulletSpeed,
      vy: Math.sin(angle) * bulletSpeed,
      size: 6,
      isEnemyBullet: true,
      isOffScreen: function() { return this.y > canvas.height + 30 || this.y < -30 || this.x < -30 || this.x > canvas.width + 30; },
      update: function() { this.x += this.vx; this.y += this.vy; },
      draw: function() {
        ctx.save();
        ctx.shadowColor = '#ff0000';
        ctx.shadowBlur = 10;
        ctx.fillStyle = '#ff0000';
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      },
      collidesWith: function(bullet) {
        const dx = this.x - bullet.x;
        const dy = this.y - bullet.y;
        return Math.sqrt(dx * dx + dy * dy) < this.size + 10;
      }
    });
  }

  draw() {
    const pulse = Math.sin(this.pulsePhase) * 0.2 + 1;
    // Dynamic boss color based on level
    const hue = (30 + this.level * 30) % 360;
    const bossColor = `hsl(${hue}, 100%, 50%)`;

    ctx.save();
    ctx.translate(this.x, this.y);

    // 外发光
    ctx.shadowColor = bossColor;
    ctx.shadowBlur = 25 * pulse;

    // Boss主体 - 大型六边形
    ctx.fillStyle = 'rgba(255, 102, 0, 0.3)';
    ctx.strokeStyle = bossColor;
    ctx.lineWidth = 4;

    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const angle = (Math.PI * 2 / 6) * i - Math.PI / 2;
      const x = Math.cos(angle) * this.size;
      const y = Math.sin(angle) * this.size;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // 内部核心
    ctx.fillStyle = bossColor;
    ctx.shadowBlur = 15;
    ctx.beginPath();
    ctx.arc(0, 0, this.size * 0.4, 0, Math.PI * 2);
    ctx.fill();

    // 眼睛
    ctx.fillStyle = '#fff';
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.arc(-15, -5, 6, 0, Math.PI * 2);
    ctx.arc(15, -5, 6, 0, Math.PI * 2);
    ctx.fill();

    // 瞳孔
    ctx.fillStyle = '#ff0000';
    ctx.beginPath();
    ctx.arc(-15, -5, 3, 0, Math.PI * 2);
    ctx.arc(15, -5, 3, 0, Math.PI * 2);
    ctx.fill();

    // 血条
    const barWidth = 80;
    const barHeight = 8;
    const healthPercent = this.health / this.maxHealth;

    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
    ctx.fillRect(-barWidth / 2, -this.size - 20, barWidth, barHeight);

    ctx.fillStyle = healthPercent > 0.5 ? '#00ff00' : healthPercent > 0.25 ? '#ffff00' : '#ff0000';
    ctx.fillRect(-barWidth / 2, -this.size - 20, barWidth * healthPercent, barHeight);

    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1;
    ctx.strokeRect(-barWidth / 2, -this.size - 20, barWidth, barHeight);

    ctx.restore();
  }

  isOffScreen() {
    return false; // Boss never goes off screen naturally
  }

  collidesWith(bullet) {
    const dx = this.x - bullet.x;
    const dy = this.y - bullet.y;
    return Math.sqrt(dx * dx + dy * dy) < this.size + 10;
  }

  takeDamage() {
    this.health--;
    return this.health <= 0;
  }
}

// --- 5. 爆炸效果 ---
class Explosion {
  constructor(x, y, color) {
    this.x = x;
    this.y = y;
    this.color = color;
    this.particles = [];

    for (let i = 0; i < 20; i++) {
      const angle = (Math.PI * 2 / 20) * i;
      this.particles.push({
        x: 0,
        y: 0,
        vx: Math.cos(angle) * (Math.random() * 5 + 3),
        vy: Math.sin(angle) * (Math.random() * 5 + 3),
        life: 1
      });
    }
  }

  update() {
    this.particles.forEach(p => {
      p.x += p.vx;
      p.y += p.vy;
      p.life -= 0.03;
    });
    this.particles = this.particles.filter(p => p.life > 0);
  }

  draw() {
    ctx.save();
    ctx.translate(this.x, this.y);

    this.particles.forEach(p => {
      ctx.globalAlpha = p.life;
      ctx.shadowColor = this.color;
      ctx.shadowBlur = 10;
      ctx.fillStyle = this.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 3 * p.life, 0, Math.PI * 2);
      ctx.fill();
    });

    ctx.restore();
  }

  isDead() {
    return this.particles.length === 0;
  }
}

// --- 6. 粒子类 ---
class Particle {
  constructor() {
    this.x = mouse.x + (Math.random() - 0.5) * 20;
    this.y = mouse.y + 30;
    this.vx = (Math.random() - 0.5) * 3;
    this.vy = Math.random() * config.particleSpeed;
    this.life = 1.0;
    this.decay = Math.random() * 0.02 + 0.02;
    this.color = config.themeColor;
  }

  update() {
    this.x += this.vx;
    this.y += this.vy;
    this.life -= this.decay;
  }

  draw() {
    ctx.globalAlpha = this.life;
    ctx.shadowColor = this.color;
    ctx.shadowBlur = 10;
    ctx.fillStyle = this.color;
    ctx.beginPath();
    ctx.arc(this.x, this.y, 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
  }
}

// --- 7. 命令状态反馈 ---
function showCommandStatus(command) {
  initAudio();
  playSound('switch');

  const statusEl = document.getElementById('command-status');
  statusEl.textContent = `EXECUTING: ${command.toUpperCase()}`;
  statusEl.style.color = config.themeColor;
  statusEl.style.textShadow = `0 0 15px ${config.themeColor}, 0 0 30px ${config.themeColor}`;
  statusEl.classList.add('show');

  setTimeout(() => {
    statusEl.classList.remove('show');
  }, 1500);
}

// --- 8. 指令引擎 ---
const input = document.getElementById('vibe-input');

input.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    const cmd = e.target.value.toLowerCase().trim();
    console.log("执行指令:", cmd);

    // Map numbers to commands
    let actualCmd = cmd;
    if (cmd === '1') actualCmd = 'fire';
    else if (cmd === '2') actualCmd = 'ice';
    else if (cmd === '3') actualCmd = 'bullet';
    else if (cmd === '4') actualCmd = 'laser';
    else if (cmd === '5') actualCmd = 'overdrive';
    else if (cmd === '6') actualCmd = 'stop';

    showCommandStatus(actualCmd);

    if (actualCmd.includes('fire')) {
      config.isFireMode = !config.isFireMode;
      config.themeColor = config.isFireMode ? '#ff4400' : '#00f2ff';
      config.particleSpeed = config.isFireMode ? 16 : 8;
      config.pulseIntensity = config.isFireMode ? 1 : 0;
      // Disable other modes
      config.isIceMode = false;
      config.isDualBullet = false;
      config.isCircleBullet = false;
      config.isOverdrive = false;
    }
    else if (actualCmd.includes('ice')) {
      config.isIceMode = !config.isIceMode;
      config.themeColor = config.isIceMode ? '#00aaff' : '#00f2ff';
      config.particleSpeed = config.isIceMode ? 4 : 8;
      config.pulseIntensity = 0;
      // Disable other modes
      config.isFireMode = false;
      config.isDualBullet = false;
      config.isCircleBullet = false;
      config.isOverdrive = false;
    }
    else if (actualCmd.includes('bullet') || actualCmd.includes('attack')) {
      config.isDualBullet = !config.isDualBullet;
      config.themeColor = config.isDualBullet ? '#ffff00' : '#00f2ff';
      // Disable other modes
      config.isFireMode = false;
      config.isIceMode = false;
      config.isCircleBullet = false;
      config.isOverdrive = false;
    }
    else if (actualCmd.includes('stop')) {
      config.isPaused = !config.isPaused;
      if (config.isPaused) {
        // Pause game
      }
    }
    else if (actualCmd.includes('laser')) {
      config.isLaser = !config.isLaser;
      if (config.isLaser) {
        config.laserTimer = config.laserDuration;
      }
      config.themeColor = config.isLaser ? '#ff00ff' : '#00f2ff';
      // Disable other modes
      config.isFireMode = false;
      config.isIceMode = false;
      config.isDualBullet = false;
      config.isCircleBullet = false;
      config.isOverdrive = false;
    }
    else if (actualCmd.includes('overdrive')) {
      config.isCircleBullet = !config.isCircleBullet;
      config.themeColor = config.isCircleBullet ? '#ff00ff' : '#00f2ff';
      config.shipRotation = 0;
      // Disable other modes
      config.isFireMode = false;
      config.isIceMode = false;
      config.isDualBullet = false;
      config.isOverdrive = false;
      config.isLaser = false;
    }
    else {
      config.themeColor = '#00f2ff';
      config.particleSpeed = 8;
      config.pulseIntensity = 0;
      config.isFireMode = false;
      config.isIceMode = false;
      config.isDualBullet = false;
      config.isCircleBullet = false;
      config.isOverdrive = false;
      config.isLaser = false;
      config.starSpeedMultiplier = 1;
    }

    e.target.value = '';
  }
});

// --- 9. 鼠标控制 ---
window.addEventListener('mousemove', e => {
  targetMouse.x = e.clientX;
  targetMouse.y = e.clientY;
});

// --- 10. 敌人生成 ---
function spawnEnemy() {
  // Don't spawn normal enemies if boss is active
  if (boss) return;

  // Always spawn enemies after boss is defeated
  if (Math.random() < 0.02 && enemies.length < 10) {
    enemies.push(new BugEnemy());
  }
}

// --- 检查并升级火力 ---
function updateFireRateLevel() {
  const oldLevel = config.fireRateLevel;

  // Fire rate based on game level (bosses defeated)
  if (level >= 3) {
    config.fireRateLevel = 3;
    if (!boss) config.themeColor = '#ff00ff'; // Purple for max level
  } else if (level >= 2) {
    config.fireRateLevel = 2;
    if (!boss) config.themeColor = '#ffff00'; // Yellow for medium level
  } else {
    config.fireRateLevel = 1;
    if (!boss) config.themeColor = '#00f2ff'; // Cyan for base level
  }

  // Play level up sound when fire rate increases
  if (oldLevel < config.fireRateLevel) {
    initAudio();
    playSound('switch');
  }
}

// --- 生成Boss ---
function spawnBoss(level) {
  boss = new BossEnemy(level);
  initAudio();
  playSound('switch');
}

// --- 11. 碰撞检测 ---
function checkCollisions() {
  // 检查是否需要生成Boss (infinite progression)
  if (score >= nextBossScore && !boss) {
    spawnBoss(level);
  }

  // 子弹击中Boss
  if (boss) {
    let bossDefeated = false;
    bullets.forEach((bullet, bi) => {
      if (boss && !bossDefeated && boss.collidesWith(bullet)) {
        initAudio();
        playSound('collision');
        bullet.scored = true;
        bullets.splice(bi, 1);
        if (boss.takeDamage()) {
          // Boss defeated - level up, refill health
          initAudio();
          playSound('kill');
          const hue = (30 + boss.level * 30) % 360;
          explosions.push(new Explosion(boss.x, boss.y, `hsl(${hue}, 100%, 50%)`));
          score += boss.level * 100; // Bonus score for defeating boss
          bossDefeated = true;
          boss = null;
          level++; // Increase level
          nextBossScore = score + 100; // Next boss at current score + 100
          health = maxHealth; // Refill health on level up
          updateFireRateLevel();
          updateHealthBar();
          updateScoreDisplay();
        }
      }
    });

    // Boss collision with player (only if boss still exists)
    if (boss) {
      const dx = boss.x - mouse.x;
      const dy = boss.y - mouse.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < boss.size + 25) {
        initAudio();
        playSound('collision');
        explosions.push(new Explosion(mouse.x, mouse.y, '#ff0000'));
        health -= 30;
        updateHealthBar();
      }
    }
  }

  // 子弹击中普通敌人 - 加分
  bullets.forEach((bullet, bi) => {
    enemies.forEach((enemy, ei) => {
      if (enemy.collidesWith && enemy.collidesWith(bullet)) {
        initAudio();
        playSound('kill');
        bullet.scored = true;
        explosions.push(new Explosion(enemy.x, enemy.y, '#ff00ff'));
        enemies.splice(ei, 1);
        bullets.splice(bi, 1);
        score += 100;
        updateScoreDisplay();
        updateFireRateLevel();
      }
    });
  });

  // 敌人子弹击中玩家 - 扣血 (ice模式下减半)
  enemies.forEach((enemy, ei) => {
    if (enemy.isEnemyBullet) {
      const dx = enemy.x - mouse.x;
      const dy = enemy.y - mouse.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < enemy.size + 25) {
        initAudio();
        playSound('collision');
        explosions.push(new Explosion(enemy.x, enemy.y, '#ff0000'));
        enemies.splice(ei, 1);
        const damage = config.isIceMode ? 7 : 15; // ice模式伤害减半
        health -= damage;
        updateHealthBar();
      }
    }
  });

  // 子弹未击中飞出屏幕 - 扣分
  bullets.forEach((bullet, bi) => {
    if (bullet.isOffScreen() && !bullet.scored) {
      score -= 10;
      updateScoreDisplay();
    }
  });

  // 普通敌人碰撞玩家飞船 - 扣血
  enemies.forEach((enemy, ei) => {
    if (!enemy.isEnemyBullet) {
      const dx = enemy.x - mouse.x;
      const dy = enemy.y - mouse.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < (enemy.size || 20) + 25) {
        initAudio();
        playSound('collision');
        explosions.push(new Explosion(enemy.x, enemy.y, '#ff0000'));
        enemies.splice(ei, 1);
        health -= 25;
        updateHealthBar();
      }
    }
  });
}

// --- 更新血条显示 ---
function updateHealthBar() {
  const healthFill = document.getElementById('health-fill');
  if (healthFill) {
    const percent = Math.max(0, (health / maxHealth) * 100);
    healthFill.style.width = `${percent}%`;
  }

  // Check for game over
  if (health <= 0 && !gameOver) {
    gameOver = true;
    showGameOver();
  }
}

// --- 游戏结束 ---
function showGameOver() {
  const statusEl = document.getElementById('command-status');
  statusEl.textContent = `GAME OVER - FINAL SCORE: ${score}`;
  statusEl.style.color = '#ff0000';
  statusEl.style.textShadow = `0 0 15px #ff0000, 0 0 30px #ff0000`;
  statusEl.classList.add('show');
  config.isFiring = false; // Stop firing
}

// --- 更新分数显示 ---
function updateScoreDisplay() {
  const scoreDisplay = document.getElementById('score-display');
  if (scoreDisplay) {
    scoreDisplay.textContent = `SCORE: ${score}`;
    scoreDisplay.style.color = score >= 0 ? '#fff' : '#ff3333';
  }
}

// --- 初始化显示 ---
function initDisplays() {
  updateHealthBar();
  updateScoreDisplay();
}

// --- 12. 渲染循环 ---
function gameLoop() {
  // 游戏结束则停止更新
  if (gameOver) {
    // 继续渲染但不更新游戏逻辑
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#050505';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#ff0000';
    ctx.font = 'bold 48px "Courier New", monospace';
    ctx.shadowColor = '#ff0000';
    ctx.shadowBlur = 20;
    ctx.textAlign = 'center';
    ctx.fillText('GAME OVER', canvas.width / 2, canvas.height / 2);
    ctx.font = 'bold 24px "Courier New", monospace';
    ctx.fillText(`FINAL SCORE: ${score}`, canvas.width / 2, canvas.height / 2 + 50);
    ctx.textAlign = 'left';
    ctx.shadowBlur = 0;
    requestAnimationFrame(gameLoop);
    return;
  }

  // 暂停检查
  if (config.isPaused) {
    // 渲染暂停画面但不更新游戏逻辑
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#050505';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#ffaa00';
    ctx.font = 'bold 48px "Courier New", monospace';
    ctx.shadowColor = '#ffaa00';
    ctx.shadowBlur = 20;
    ctx.textAlign = 'center';
    ctx.fillText('PAUSED', canvas.width / 2, canvas.height / 2);
    ctx.font = 'bold 18px "Courier New", monospace';
    ctx.fillText('Press 6 to resume', canvas.width / 2, canvas.height / 2 + 40);
    ctx.textAlign = 'left';
    ctx.shadowBlur = 0;
    requestAnimationFrame(gameLoop);
    return;
  }

  // 更新激光计时器
  if (config.isLaser) {
    config.laserTimer--;
    if (config.laserTimer <= 0) {
      config.isLaser = false;
      config.themeColor = '#00f2ff';
      initAudio();
      playSound('laserDeactivate');
    }
  }

  // Fire mode - 对boss持续伤害
  if (config.isFireMode && boss) {
    config.fireModeTimer++;
    if (config.fireModeTimer >= 20) { // 每20帧造成1次伤害 (3次/秒)
      config.fireModeTimer = 0;
      const dist = Math.abs(boss.x - mouse.x) + Math.abs(boss.y - mouse.y);
      if (dist < 300) { // 只要boss在附近就造成伤害
        initAudio();
        playSound('collision');
        if (boss.takeDamage()) {
          // Boss defeated
          initAudio();
          playSound('kill');
          const hue = (30 + boss.level * 30) % 360;
          explosions.push(new Explosion(boss.x, boss.y, `hsl(${hue}, 100%, 50%)`));
          score += boss.level * 100;
          boss = null;
          level++;
          nextBossScore = score + 100;
          health = maxHealth;
          updateFireRateLevel();
          updateHealthBar();
          updateScoreDisplay();
        }
      }
    }
  }

  // 更新 Overdrive 状态
  if (config.isOverdrive) {
    config.rainbowHue = (config.rainbowHue + 5) % 360;
    config.themeColor = getRainbowColor(config.rainbowHue);
    config.shipRotation += 0.05;
  }

  // 平滑移动飞船
  mouse.x += (targetMouse.x - mouse.x) * 0.15;
  mouse.y += (targetMouse.y - mouse.y) * 0.15;

  // 黑色背景 + 拖尾效果
  ctx.globalAlpha = 1;
  ctx.fillStyle = '#050505';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // 画背景星空
  ctx.fillStyle = '#fff';
  stars.forEach(star => {
    ctx.globalAlpha = Math.random() * 0.5 + 0.5;
    ctx.beginPath();
    ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2);
    ctx.fill();
    star.y += star.speed * config.starSpeedMultiplier;
    if (star.y > canvas.height) star.y = 0;
  });
  ctx.globalAlpha = 1;

  // 生成敌人和检测碰撞
  spawnEnemy();
  checkCollisions();

  // 更新并画子弹
  if (config.isFiring || config.isDualBullet || config.isCircleBullet) {
    config.fireRate++;
    const currentFireRateThreshold = config.fireRateThresholds[config.fireRateLevel];
    if (config.fireRate >= currentFireRateThreshold) {
      if (config.isDualBullet) {
        // Dual bullet mode - two columns
        bullets.push(new Bullet(mouse.x - 15, mouse.y - 30));
        bullets.push(new Bullet(mouse.x + 15, mouse.y - 30));
      } else if (config.isCircleBullet) {
        // Circle bullet mode - 8 bullets in a circle
        for (let i = 0; i < 8; i++) {
          const angle = (Math.PI * 2 / 8) * i;
          const bullet = new Bullet(mouse.x, mouse.y);
          bullet.vx = Math.cos(angle) * 8;
          bullet.vy = Math.sin(angle) * 8;
          bullet.isCircular = true;
          bullets.push(bullet);
        }
      } else {
        // Normal single bullet
        bullets.push(new Bullet(mouse.x, mouse.y - 30));
      }
      config.fireRate = 0;
    }
  }

  bullets = bullets.filter(b => !b.isOffScreen());
  bullets.forEach(b => {
    b.update();
    b.draw();
  });

  // 画激光束
  if (config.isLaser) {
    ctx.save();
    ctx.strokeStyle = config.themeColor;
    ctx.shadowColor = config.themeColor;
    ctx.shadowBlur = 30;
    ctx.lineWidth = 8;
    ctx.globalAlpha = 0.8 + Math.random() * 0.2;

    // 主光束
    ctx.beginPath();
    ctx.moveTo(mouse.x, mouse.y - 30);
    ctx.lineTo(mouse.x, 0);
    ctx.stroke();

    // 内核
    ctx.strokeStyle = '#fff';
    ctx.shadowBlur = 10;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(mouse.x, mouse.y - 30);
    ctx.lineTo(mouse.x, 0);
    ctx.stroke();

    ctx.restore();

    // 激光碰撞检测
    enemies.forEach((enemy, ei) => {
      if (Math.abs(enemy.x - mouse.x) < enemy.size && enemy.y < mouse.y - 30) {
        initAudio();
        playSound('kill');
        explosions.push(new Explosion(enemy.x, enemy.y, '#ff00ff'));
        enemies.splice(ei, 1);
        score += 100;
        updateScoreDisplay();
      }
    });

    // 激光对Boss的伤害 (每15帧造成1次伤害，约4次/秒)
    if (boss && Math.abs(boss.x - mouse.x) < boss.size + 20) {
      if (!boss.laserDamageCooldown) {
        boss.laserDamageCooldown = 0;
      }
      boss.laserDamageCooldown++;
      if (boss.laserDamageCooldown >= 15) {
        boss.laserDamageCooldown = 0;
        initAudio();
        playSound('collision');
        if (boss.takeDamage()) {
          // Boss defeated
          initAudio();
          playSound('kill');
          const hue = (30 + boss.level * 30) % 360;
          explosions.push(new Explosion(boss.x, boss.y, `hsl(${hue}, 100%, 50%)`));
          score += boss.level * 100;
          boss = null;
          level++;
          nextBossScore = score + 100;
          health = maxHealth;
          updateFireRateLevel();
          updateHealthBar();
          updateScoreDisplay();
        }
      }
    }
  }

  // 更新并画敌人
  enemies = enemies.filter(e => !e.isOffScreen());
  enemies.forEach(e => {
    if (e.update) e.update();
    e.draw();
  });

  // 更新并画Boss
  if (boss) {
    boss.update();
    boss.draw();
  }

  // 更新并画爆炸
  explosions = explosions.filter(ex => !ex.isDead());
  explosions.forEach(ex => {
    ex.update();
    ex.draw();
  });

  // 生成粒子
  for (let i = 0; i < config.emitRate; i++) {
    particles.push(new Particle());
  }

  // 更新并画粒子
  particles = particles.filter(p => p.life > 0);
  particles.forEach(p => {
    p.update();
    p.draw();
  });

  // 脉冲效果衰减
  config.pulseIntensity *= 0.95;

  // 画霓虹战机
  drawNeonShip(mouse.x, mouse.y, config.themeColor, config.pulseIntensity, config.shipRotation);

  // 分数显示
  ctx.fillStyle = score >= 0 ? '#fff' : '#ff3333';
  ctx.font = 'bold 24px "Courier New", monospace';
  ctx.shadowColor = score >= 0 ? config.themeColor : '#ff0000';
  ctx.shadowBlur = 10;
  ctx.fillText(`SCORE: ${score}`, 20, 40);

  // Level显示
  ctx.fillStyle = '#ffaa00';
  ctx.font = 'bold 18px "Courier New", monospace';
  ctx.shadowColor = '#ffaa00';
  ctx.fillText(`FIRE RATE: LV${config.fireRateLevel}  |  GAME LV: ${level}`, 20, 70);

  // 血量显示
  ctx.fillStyle = health > 30 ? '#00ff00' : '#ff0000';
  ctx.font = 'bold 18px "Courier New", monospace';
  ctx.shadowColor = health > 30 ? '#00ff00' : '#ff0000';
  ctx.fillText(`HP: ${Math.max(0, health)}/${maxHealth}`, 20, 100);

  // Boss警告
  if (boss) {
    ctx.fillStyle = '#ff0000';
    ctx.font = 'bold 28px "Courier New", monospace';
    ctx.shadowColor = '#ff0000';
    ctx.shadowBlur = 20;
    ctx.textAlign = 'center';
    ctx.fillText(`⚠ BOSS Lv${boss.level} ⚠`, canvas.width / 2, 100);
    ctx.textAlign = 'left';
  }

  ctx.shadowBlur = 0;

  requestAnimationFrame(gameLoop);
}

// 初始化显示
initDisplays();
gameLoop();
