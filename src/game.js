/**
 * 人生一杯 · 游戏主逻辑（平台无关，依赖 env 抽象层）
 * env = { canvas, ctx, W, H, onTouchStart, onTouchEnd, getStorage, setStorage, vibrate, share }
 */
(function (root, factory) {
  var isNode = (typeof module !== 'undefined' && module.exports);
  var Cups = isNode ? require('./cups.js') : root.Cups;
  var Containers = isNode ? require('./containers.js') : root.Containers;
  var Game = factory(Cups, Containers);
  if (isNode) module.exports = Game;
  else root.Game = Game;
})(typeof GameGlobal !== 'undefined' ? GameGlobal : (typeof self !== 'undefined' ? self : this), function (Cups, Containers) {

  var DEFAULTS = {
    POUR_THRESHOLD: 0.20,  // 水桶倾斜超过该弧度开始出水
    TILT_SPEED: 0.35,      // 按压时倾斜角速度 (rad/s)（配合较低 MAX_TILT，保持按压节奏）
    MAX_TILT: 0.5,         // 最大倾角约 28°，加容器预倾角后恰在垂直线以内
    RETURN_SPEED: 2.6,     // 松手后回正速度
    POUR_RATE: 0.338,      // 出水速度系数（用户要求提速 30%：0.26 × 1.3）
    RATE_ACCEL: 0.8,       // 流速随倾角的加速幅度：rate = POUR_RATE * (1 + RATE_ACCEL * tiltFrac)
    RATE_RAMP: 0.015,      // 单局递增难度：每成功一杯流速 +1.5%（封顶 +50%）
    RATE_RAMP_CAP: 0.5
  };

  // 全局调色板：奶油米底 + 墨黑 + 卡片白 + 强调黄（参考智能家居风）
  var PAL = {
    BG: '#E7E2D3', INK: '#2B2A26', CARD: '#F7F5EE', YEL: '#F2C94C',
    MUTED: '#8E8A7E', TABLE: '#D8CBB2', CARD_DIM: '#C8C4BA', TRACK: '#E4DFD0'
  };

  function Game(env) {
    this.env = env;
    this.canvas = env.canvas;
    this.ctx = env.ctx;
    this.W = env.W;
    this.H = env.H;
    // 难度参数（可用 env.tuning 覆盖，便于标定）
    this.T = {};
    for (var k in DEFAULTS) this.T[k] = (env.tuning && env.tuning[k] !== undefined) ? env.tuning[k] : DEFAULTS[k];
    // 美术素材（未加载完成时回退矢量绘制）
    this.assets = env.assets || {};
    // 水桶贴图锚点：壶嘴尖在贴图内的相对位置（实测 0.987, 0.517）
    this.bucketAnchor = { x: 0.987, y: 0.517 };

    this.state = 'menu';       // menu | play | over
    this.overlay = null;       // shop | rank | settings | null
    this.score = 0;
    this.round = 0;
    this.best = parseInt(env.getStorage('best'), 10) || 0;
    this.totalCups = parseInt(env.getStorage('totalCups'), 10) || 0;
    this.totalScore = parseInt(env.getStorage('totalScore'), 10) || 0;  // 生涯累计分（仅记录）
    this.tierIdx = Cups.tierFor(this.best);   // 主界面段位 = 历史最高单局分对应段位
    this.vibrateOn = env.getStorage('vibrate') !== 'off';
    this.newRecord = false;

    this.time = 0;
    this.lastTs = 0;
    this.pressing = false;
    this.usedPress = false;
    this.phase = 'aim';        // aim | press | settle | next | failed
    this.phaseTimer = 0;
    this.angle = 0;
    this.level = 0;
    this.poured = 0;
    this.lastCup = null;     // 上一杯杯型（避免连续重复）
    this.perfectStreak = 0;  // 连续完美计数（2 连 3 分，3 连起 4 分）
    this.bubb = [];          // 液体内碳酸气泡（可乐/啤酒）
    this.containerIdx = 0;   // 本回合容器索引（newRound 时冻结）
    this.surfaceWave = 0;    // 液面波动强度：倒水时 1，静止后衰减到 0（平静便于读进度）
    this.streamX = 0;        // 水流落点 X（首帧倒水前兜底，避免 NaN 粒子）
    this.failReason = '';

    this.toasts = [];
    this.floats = [];
    this.particles = [];

    this.layoutUI();
    this.bindInput();

    // 调试摆拍姿态（env.pose，仅本地预览）
    if (env.pose) {
      this.startGame();
      this.tierIdx = env.pose.tier;
      this.newRound();
      this.angle = 0.42;
      this.level = 0.45;
      this.poured = 0.45;
      this.phase = 'press';
      this.pressing = true;
    }
  }

  // ---------------- 颜色工具（饮品材质用） ----------------
  function hexRgb(hex) {
    var m = /^#([0-9a-fA-F]{6})$/.exec(hex || '');
    if (!m) return [200, 200, 200];
    var n = parseInt(m[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function mixHex(a, b, t) {
    var ca = hexRgb(a), cb = hexRgb(b);
    return 'rgb(' + Math.round(ca[0] + (cb[0] - ca[0]) * t) + ',' +
      Math.round(ca[1] + (cb[1] - ca[1]) * t) + ',' + Math.round(ca[2] + (cb[2] - ca[2]) * t) + ')';
  }
  function lumOf(hex) {
    var c = hexRgb(hex);
    return (0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]) / 255;
  }

  // ---------------- UI 布局 ----------------
  Game.prototype.layoutUI = function () {
    var W = this.W, H = this.H;
    // 主界面四个按钮
    var r = Math.min(W * 0.095, 46);
    var gap = W / 5;
    var by = H * 0.86;
    this.menuButtons = [
      { key: 'shop', label: '商城', color: '#F6A83C', x: gap * 1, y: by, r: r },
      { key: 'share', label: '分享', color: '#4CC36A', x: gap * 2, y: by, r: r },
      { key: 'rank', label: '排名', color: '#5B8DEF', x: gap * 3, y: by, r: r },
      { key: 'settings', label: '设置', color: '#9B7FD4', x: gap * 4, y: by, r: r }
    ];
    // 结算界面按钮（主按钮黄、次按钮白）
    var bw = W * 0.62, bh = H * 0.068, bx = (W - bw) / 2;
    this.overButtons = [
      { key: 'retry', label: '再来一局', color: '#F2C94C', x: bx, y: H * 0.63, w: bw, h: bh },
      { key: 'home', label: '返回主页', color: '#F7F5EE', x: bx, y: H * 0.63 + bh + 14, w: bw, h: bh },
      { key: 'share', label: '分享战绩', color: '#F7F5EE', x: bx, y: H * 0.63 + (bh + 14) * 2, w: bw, h: bh }
    ];
    // 弹层关闭按钮
    this.overlayClose = { x: W / 2 - W * 0.2, y: H * 0.62, w: W * 0.4, h: H * 0.06 };
  };

  // ---------------- 输入 ----------------
  Game.prototype.bindInput = function () {
    var self = this;
    this.env.onTouchStart(function (x, y) { self.onPress(x, y); });
    this.env.onTouchEnd(function () { self.onRelease(); });
  };

  Game.prototype.onPress = function (x, y) {
    if (this.state === 'menu') {
      if (this.overlay) { this.handleOverlayTap(x, y); return; }
      for (var i = 0; i < this.menuButtons.length; i++) {
        var b = this.menuButtons[i];
        if (Math.hypot(x - b.x, y - b.y) <= b.r + 6) { this.handleMenuButton(b.key); return; }
      }
      this.startGame(); // 策划案：主界面按下屏幕即开始第一杯
      return;
    }
    if (this.state === 'play') {
      // 策划案：每次挑战只识别第一次按压
      if (this.phase === 'aim' && !this.usedPress) {
        this.usedPress = true;
        this.pressing = true;
        this.pressStart = this.time;   // 误触保护计时起点
        this.phase = 'press';
      }
      return;
    }
    if (this.state === 'over') {
      for (var j = 0; j < this.overButtons.length; j++) {
        var ob = this.overButtons[j];
        if (x >= ob.x && x <= ob.x + ob.w && y >= ob.y && y <= ob.y + ob.h) {
          this.handleOverButton(ob.key);
          return;
        }
      }
    }
  };

  Game.prototype.onRelease = function () {
    if (this.state === 'play' && this.phase === 'press') {
      this.pressing = false;
      // 误触保护：按压不足 0.06s 视为误碰，撤销本次按压（此时倾角未到出水阈值，无水量变化）
      if (this.time - this.pressStart < 0.06) {
        this.usedPress = false;
        this.phase = 'aim';
        this.angle = 0;
        return;
      }
      this.phase = 'settle';
      this.phaseTimer = 0.35;
    }
  };

  Game.prototype.handleMenuButton = function (key) {
    if (key === 'share') {
      this.env.share('人生一杯：从小孩倒奶到老人喝奶，看你倒到哪一段！');
      this.toast('已发起分享');
      return;
    }
    this.overlay = key;
  };

  Game.prototype.handleOverlayTap = function (x, y) {
    var c = this.overlayClose;
    if (x >= c.x && x <= c.x + c.w && y >= c.y && y <= c.y + c.h) {
      this.overlay = null;
      return;
    }
    if (this.overlay === 'settings') {
      var t = this.vibrateToggle;
      if (t && x >= t.x && x <= t.x + t.w && y >= t.y && y <= t.y + t.h) {
        this.vibrateOn = !this.vibrateOn;
        this.env.setStorage('vibrate', this.vibrateOn ? 'on' : 'off');
      }
    }
  };

  Game.prototype.handleOverButton = function (key) {
    if (key === 'retry') this.startGame();
    else if (key === 'home') { this.state = 'menu'; this.overlay = null; this.tierIdx = Cups.tierFor(this.best); }
    else if (key === 'share') {
      this.env.share('我在人生一杯倒了 ' + this.score + ' 分，你敢来挑战吗？');
      this.toast('已发起分享');
    }
  };

  // ---------------- 流程 ----------------
  Game.prototype.startGame = function () {
    this.state = 'play';
    this.overlay = null;
    this.score = 0;
    this.round = 0;
    this.newRecord = false;
    this.tierIdx = 0;          // 每局从 0 段（倒奶）重新开始
    this.lastCup = null;       // 跨局不继承杯型记忆
    this.perfectStreak = 0;    // 跨局不继承连击
    this.newRound();
  };

  Game.prototype.newRound = function () {
    this.round++;
    var tier = Cups.TIERS[this.tierIdx];
    this.tier = tier; // 当前段位（倒水速度等按段位配置取值）
    // 每局第一杯从本段杯池最简单的 3 个里出；之后按段位独立杯池随机（pool 字段）
    // 不与上一杯重复（杯池 >1 时重抽，最多 6 次）
    var cup = this.round === 1 ? Cups.randomCupTier(this.tierIdx, 3) : Cups.randomCupTier(this.tierIdx, tier.cupCount);
    var guard = 0;
    while (this.lastCup && cup.name === this.lastCup.name && guard++ < 6) {
      cup = Cups.randomCupTier(this.tierIdx, tier.cupCount);
    }
    this.cup = cup;
    this.lastCup = cup;
    // 饮品绑定段位（容器/颜色/名称随段位切换）
    this.drink = { name: tier.drinkName, color: tier.color, deep: tier.deep,
      alpha: tier.alpha != null ? tier.alpha : 0.92, bubbles: !!tier.bubbles, foam: !!tier.foam,
      gradSoft: tier.gradSoft || 0 };
    this.bubb = []; // 碳酸气泡清空
    this.cupAvgW = Cups.avgWidth(this.cup);
    // 当前容器配置（本回合冻结：升段发生在 win() 时，容器不能即时跳变，等下一回合再换）
    this.containerIdx = this.tierIdx;
    this.containerCfg = (Containers && Containers[this.containerIdx]) || null;

    // 杯型几何：aspect = 杯高 / 杯口最大直径；size = 杯型大小差异（小盅浅快、大杯深慢）
    var cupH = this.H * 0.28 * (this.cup.size || 1);
    var halfW = cupH / (2 * this.cup.aspect);
    var maxHalf = this.W * 0.33; // 宽杯型需要更宽的舞台（原 0.27 会把宽碗压成小杯）
    if (halfW > maxHalf) { halfW = maxHalf; cupH = halfW * 2 * this.cup.aspect; }
    // 杯口最小宽度：保证水流抛物线总能落进杯口，不出现贴壁折返（只拉宽，不改杯高）
    var MOUTH_MIN = 18;
    var rimW = this.cup.profile(1) * halfW;
    if (rimW < MOUTH_MIN) halfW = MOUTH_MIN / this.cup.profile(1);
    this.cupH = cupH;
    this.halfW = halfW;
    this.cx = this.W / 2;
    this.baseY = this.H * 0.74;
    this.stemH = this.cup.stem ? cupH * 0.20 : 0;
    this.cupTop = this.baseY - cupH;

    // 容器：壶嘴为旋转支点，位于杯口上方偏左；尺寸固定，不随杯高缩放
    this.spout = { x: this.cx - this.halfW * 0.18, y: this.cupTop - this.H * 0.10 };
    this.bucketW = this.halfW * 2.3;
    this.bucketH = this.H * 0.1456;

    this.level = 0;
    this.poured = 0;
    this.angle = 0;
    this.pressing = false;
    this.usedPress = false;
    this.phase = 'aim';
    this.failReason = '';
  };

  Game.prototype.win = function (basePts, label) {
    // 连完美加分：完美 2 分，2 连 3 分，3 连及以上 4 分；非完美/失败断连
    var pts = basePts;
    if (basePts === 2) {
      this.perfectStreak++;
      pts = 2 + Math.min(this.perfectStreak - 1, 2);
      if (this.perfectStreak >= 2) label = this.perfectStreak + '连完美!';
    } else {
      this.perfectStreak = 0;
    }
    this.score += pts;
    this.totalCups++;
    this.env.setStorage('totalCups', String(this.totalCups));
    // 本局得分 → 段位晋升检测（失败后重开即从 0 段倒奶重来）
    this.totalScore += pts;
    this.env.setStorage('totalScore', String(this.totalScore));
    var newTier = Cups.tierFor(this.score);
    var didTierUp = newTier > this.tierIdx;
    if (didTierUp) {
      this.tierIdx = newTier;
      var t = Cups.TIERS[newTier];
      this.floats.push({ text: '升段！' + t.name, x: this.W / 2, y: this.H * 0.32, life: 1.8, color: PAL.INK });
      this.toast(t.line);
      if (this.vibrateOn) this.env.vibrate();
    }
    this.floats.push({ text: '+' + pts + ' ' + label, x: this.cx, y: this.cupTop - this.H * 0.075, life: 1.2, color: basePts === 2 ? '#2EA85C' : '#E0861A' });
    // 完美彩蛋文案：升段回合已展示升段寄语，不再叠完美提示
    if (basePts === 2 && !didTierUp) this.toast(Cups.randomLine(Cups.TIERS[this.tierIdx].key));
    this.phase = 'next';
    this.phaseTimer = 0.9;
  };

  Game.prototype.fail = function (reason) {
    this.perfectStreak = 0;
    this.failReason = reason;
    this.phase = 'failed';
    this.phaseTimer = 0.9;
    if (this.vibrateOn) this.env.vibrate();
    if (this.score > this.best) {
      this.best = this.score;
      this.newRecord = true;
      this.env.setStorage('best', String(this.best));
    }
  };

  Game.prototype.judge = function () {
    var z = this.cup.zones, f = this.level;
    if (f >= z.p[0] && f <= z.p[1]) this.win(2, '完美!');
    else if (f >= z.q[0] && f <= z.q[1]) this.win(1, '不错!');
    else this.fail(f < z.q[0] ? '倒得太少啦' : '倒得太满啦');
  };

  Game.prototype.toast = function (text) {
    this.toasts.push({ text: text, life: 1.6 });
    if (this.toasts.length > 2) this.toasts.shift();
  };

  // ---------------- 更新 ----------------
  Game.prototype.update = function (dt) {
    this.time += dt;

    // 提示与浮字
    var i;
    for (i = this.toasts.length - 1; i >= 0; i--) { this.toasts[i].life -= dt; if (this.toasts[i].life <= 0) this.toasts.splice(i, 1); }
    for (i = this.floats.length - 1; i >= 0; i--) { var fl = this.floats[i]; fl.life -= dt; fl.y -= 40 * dt; if (fl.life <= 0) this.floats.splice(i, 1); }

    // 碳酸气泡：在液体内随机生成，缓缓上浮到液面破裂
    for (i = this.bubb.length - 1; i >= 0; i--) {
      var bb = this.bubb[i];
      bb.y -= bb.vy * dt;
      if (this.state !== 'play' || bb.y < this.baseY - Math.min(this.level, 1) * this.cupH + 4) this.bubb.splice(i, 1);
    }
    if (this.state === 'play' && this.drink && this.drink.bubbles && this.level > 0.04 && this.bubb.length < 40) {
      if (Math.random() < dt * 11) {
        var bt = 0.04 + Math.random() * Math.max(0.01, Math.min(this.level, 1) - 0.06);
        var bw2 = this.halfW * this.cup.profile(bt) * 0.8;
        this.bubb.push({ x: this.cx + (Math.random() * 2 - 1) * bw2, y: this.baseY - bt * this.cupH,
          r: 1 + Math.random() * 2.2, vy: 22 + Math.random() * 30 });
      }
    }

    // 粒子
    for (i = this.particles.length - 1; i >= 0; i--) {
      var p = this.particles[i];
      p.vy += 1400 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt;
      if (p.life <= 0 || p.y > this.H * 0.9) this.particles.splice(i, 1);
    }

    if (this.state !== 'play') return;

    var T = this.T;
    var pouring = this.angle > T.POUR_THRESHOLD && this.level < 1;

    // 液面波动：倒水时全幅波动，停倒后平滑恢复平静
    var waveTarget = (pouring && (this.phase === 'press' || this.phase === 'settle')) ? 1 : 0;
    this.surfaceWave += (waveTarget - this.surfaceWave) * Math.min(1, dt * 3.5);

    if (this.phase === 'press' && this.pressing) {
      this.angle = Math.min(this.angle + T.TILT_SPEED * dt, T.MAX_TILT);
    } else if (this.phase === 'settle' || this.phase === 'next' || this.phase === 'failed') {
      this.angle = Math.max(this.angle - T.RETURN_SPEED * dt, 0);
    }

    if (pouring && (this.phase === 'press')) {
      // 窄处水位上升更快：横截面积 ∝ 宽度²，故 df/dt ∝ (平均宽度/当前宽度)²
      // 宽肚杯底部慢、收口处猛冲；收腰杯过腰突然加速 —— 每种杯型手感都不同
      // 流速随倾角温和加速：等得越久倒得越快，贪高分就要冒超出的风险
      // 单局内每成功一杯流速轻微提升，无尽模式不能无限刷分
      var tiltFrac = (this.angle - T.POUR_THRESHOLD) / (T.MAX_TILT - T.POUR_THRESHOLD);
      var ramp = 1 + Math.min(this.round - 1, T.RATE_RAMP_CAP / T.RATE_RAMP) * T.RATE_RAMP;
      var wNow = Math.max(0.12, this.cup.profile(Math.min(this.level, 0.999)));
      var wr = this.cupAvgW / wNow;
      var baseRate = (this.tier && this.tier.pourRate) || T.POUR_RATE;
      var df = baseRate * ramp * (1 + T.RATE_ACCEL * tiltFrac) * wr * wr * dt;
      this.level += df;
      this.poured += df;
      this.spawnSplash();
      this.spawnSpoutMist();
      if (this.level >= 1) { this.level = 1; this.fail('水溢出来啦'); }
    }

    if (this.phase === 'settle') {
      this.phaseTimer -= dt;
      if (this.phaseTimer <= 0 && this.angle <= 0.01) this.judge();
    } else if (this.phase === 'next') {
      this.phaseTimer -= dt;
      if (this.phaseTimer <= 0) this.newRound();
    } else if (this.phase === 'failed') {
      this.phaseTimer -= dt;
      if (this.phaseTimer <= 0) this.state = 'over';
    }
  };

  // 水花/气泡的色差色：比液体本身亮一截（浅饮品则向深色端偏移），水花更有层次
  Game.prototype.splashTint = function () {
    var d = this.drink || {};
    var c = d.color || '#3FA7FF';
    return lumOf(c) > 0.85 ? mixHex(c, d.deep || '#C9B18A', 0.55) : mixHex(c, '#FFFFFF', 0.42);
  };

  Game.prototype.spawnSplash = function () {
    if (this.particles.length > 110) return;
    var surfaceY = this.baseY - Math.min(this.level, 1) * this.cupH;
    var tint = this.splashTint();
    for (var k = 0; k < 2; k++) {
      this.particles.push({
        x: this.streamX + (Math.random() - 0.5) * 14,
        y: surfaceY,
        vx: (Math.random() - 0.5) * 220,
        vy: -Math.random() * 260 - 60,
        r: 2 + Math.random() * 3,
        life: 0.45 + Math.random() * 0.2,
        color: tint
      });
    }
  };

  // 瓶口水雾：出水瞬间的过渡飞溅，让水流出口不突兀
  Game.prototype.spawnSpoutMist = function () {
    if (this.particles.length > 110) return;
    var tip = this.spoutTip();
    var a = this.currentTilt();
    var strength = Math.min(1, (this.angle - this.T.POUR_THRESHOLD) / 0.4);
    var v0 = 40 + 110 * strength;
    var dx = Math.sin(a), dy = -Math.cos(a);
    var tint2 = this.splashTint();
    for (var k = 0; k < 2; k++) {
      this.particles.push({
        x: tip.x + (Math.random() - 0.5) * 6,
        y: tip.y + (Math.random() - 0.5) * 6,
        vx: dx * v0 * 0.5 + (Math.random() - 0.5) * 90,
        vy: dy * v0 * 0.5 + (Math.random() - 0.5) * 70 - 30,
        r: 1 + Math.random() * 2,
        life: 0.18 + Math.random() * 0.15,
        color: tint2
      });
    }
  };

  // 当前容器总倾角（贴图容器带静止预倾角，水桶贴图/矢量为 0）
  Game.prototype.currentTilt = function () {
    var rest = 0;
    var rec0 = this.assets.containers && this.assets.containers[this.containerIdx];
    if (this.containerCfg && rec0 && rec0.ready) {
      rest = this.containerCfg.restTilt;
    }
    return rest + this.angle;
  };

  // 壶嘴出水口世界坐标（含容器自定义支点偏移）
  Game.prototype.spoutTip = function () {
    var a = this.currentTilt();
    var px = this.spout.x, py = this.spout.y;
    var lx = 12, ly = 10; // 壶嘴局部偏移（默认）
    var cfg = this.containerCfg;
    if (cfg && this.assets.containers &&
        this.assets.containers[this.containerIdx] && this.assets.containers[this.containerIdx].ready) {
      px += (cfg.pivotDx || 0) * this.W;
      py += (cfg.pivotDy || 0) * this.H;
      if (cfg.tip) {
        // 出水点 = 精灵上的嘴口点，随容器同步旋转：任何倾角都贴着嘴口
        var tdh = this.bucketH * 2.2 * (cfg.scale || 1);
        var tdw = tdh * (cfg.w / cfg.h);
        lx = (cfg.tip.x - cfg.anchor.x) * tdw;
        ly = (cfg.tip.y - cfg.anchor.y) * tdh;
      }
    }
    return {
      x: px + lx * Math.cos(a) - ly * Math.sin(a),
      y: py + lx * Math.sin(a) + ly * Math.cos(a)
    };
  };

  // ---------------- 绘制 ----------------
  Game.prototype.render = function () {
    var ctx = this.ctx;
    ctx.clearRect(0, 0, this.W, this.H);
    this.drawBackground();

    if (this.state === 'menu') {
      this.drawMenu();
    } else {
      this.drawTable();
      this.drawCup();
      this.drawBucket();
      this.drawStream();
      this.drawParticles();
      this.drawScoreHUD();
      this.drawDrinkTag();
      this.drawFloats();
      if (this.state === 'play' && this.phase === 'aim') this.drawAimHint();
      if (this.state === 'over') this.drawOver();
    }
    this.drawToasts();
  };

  Game.prototype.drawBackground = function () {
    var ctx = this.ctx;
    // 新视觉：纯色奶油米背景（不再使用蓝天背景图）
    ctx.fillStyle = PAL.BG;
    ctx.fillRect(0, 0, this.W, this.H);
    // 极淡装饰圆点
    ctx.fillStyle = 'rgba(43,42,38,0.04)';
    for (var i = 0; i < 5; i++) {
      var x = (i * 173 + 80) % this.W;
      var y = this.H * 0.12 + ((i * 97) % 120);
      ctx.beginPath(); ctx.arc(x, y, 14 + (i % 3) * 8, 0, Math.PI * 2); ctx.fill();
    }
  };

  Game.prototype.drawTable = function () {
    var ctx = this.ctx, y = this.H * 0.86;
    ctx.fillStyle = PAL.TABLE;
    ctx.fillRect(0, y, this.W, this.H - y);
    ctx.strokeStyle = PAL.INK;
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(this.W, y); ctx.stroke();
  };

  // 杯身轮廓路径（inset: 0..1 内缩比例）
  Game.prototype.traceCup = function (inset) {
    var ctx = this.ctx, N = 48, t, w, y;
    ctx.beginPath();
    for (var i = 0; i <= N; i++) {
      t = i / N; w = this.halfW * this.cup.profile(t) * (1 - inset);
      y = this.baseY - t * this.cupH;
      if (i === 0) ctx.moveTo(this.cx - w, y); else ctx.lineTo(this.cx - w, y);
    }
    for (var j = N; j >= 0; j--) {
      t = j / N; w = this.halfW * this.cup.profile(t) * (1 - inset);
      y = this.baseY - t * this.cupH;
      ctx.lineTo(this.cx + w, y);
    }
    ctx.closePath();
  };

  // 杯身开口路径：左壁(顶→底) + 底边 + 右壁(底→顶)，杯口不画线
  Game.prototype.traceCupWall = function (inset) {
    var ctx = this.ctx, N = 24, t, w, y;
    ctx.beginPath();
    for (var i = N; i >= 0; i--) {
      t = i / N; w = this.halfW * this.cup.profile(t) * (1 - inset);
      y = this.baseY - t * this.cupH;
      if (i === N) ctx.moveTo(this.cx - w, y); else ctx.lineTo(this.cx - w, y);
    }
    for (var j = 0; j <= N; j++) {
      t = j / N; w = this.halfW * this.cup.profile(t) * (1 - inset);
      y = this.baseY - t * this.cupH;
      ctx.lineTo(this.cx + w, y);
    }
  };

  Game.prototype.drawCup = function () {
    var ctx = this.ctx, cup = this.cup, z = cup.zones;
    // 每杯装饰配置（缺省 = 全局默认外观）
    var deco = cup.deco || {};
    var wallC = deco.wall || PAL.INK;                       // 杯壁描边色
    var wallW = deco.wallW != null ? deco.wallW : 4.5;      // 杯壁描边粗细
    var glassA = deco.glass != null ? deco.glass : 0.45;    // 玻璃体透明度（0 = 无玻璃填充）
    var dashOn = deco.dash !== false;                       // 合格区分隔虚线
    var ticks = deco.ticks | 0;                             // 内壁刻度线数量（0 = 无）
    var handleOn = !!deco.handle;                           // 右侧杯把

    // 杯脚（高脚杯）
    if (this.stemH > 0) {
      ctx.strokeStyle = wallC;
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(this.cx, this.baseY);
      ctx.lineTo(this.cx, this.baseY + this.stemH);
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.strokeStyle = wallC;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.ellipse(this.cx, this.baseY + this.stemH + 5, this.halfW * 0.55, 9, 0, 0, Math.PI * 2);
      ctx.fill(); ctx.stroke();
    }

    // 精灵杯（如直筒奶瓶）：贴图瓶身，内部镂空透出液面
    var sprRec = this.cup.sprite && this.assets.cups && this.assets.cups[this.cup.sprite];
    var useSpr = !!(sprRec && sprRec.ready);

    // 玻璃质感：左侧一条随杯壁弯曲的白色半透高光带（精灵杯跳过：贴图自带质感）
    if (!useSpr && glassA > 0) {
      var GN = 24, gi, gt, gw, gy;
      ctx.beginPath();
      for (gi = 0; gi <= GN; gi++) {
        gt = 0.06 + 0.88 * (gi / GN);
        gw = this.halfW * cup.profile(gt) * 0.80;
        gy = this.baseY - gt * this.cupH;
        if (gi === 0) ctx.moveTo(this.cx - gw, gy); else ctx.lineTo(this.cx - gw, gy);
      }
      for (gi = GN; gi >= 0; gi--) {
        gt = 0.06 + 0.88 * (gi / GN);
        gw = this.halfW * cup.profile(gt) * 0.52;
        gy = this.baseY - gt * this.cupH;
        ctx.lineTo(this.cx - gw, gy);
      }
      ctx.closePath();
      ctx.fillStyle = 'rgba(255,255,255,' + glassA + ')';
      ctx.fill();
    }

    // 区域：不合格(灰) 合格(淡黄) 完美(淡绿) —— 策划案三色区
    ctx.save();
    this.traceCup(0.04);
    ctx.clip();
    var top = this.cupTop, h = this.cupH;
    ctx.fillStyle = 'rgba(43,42,38,0.06)';
    ctx.fillRect(0, top - 4, this.W, h + 8);
    ctx.fillStyle = 'rgba(242,201,76,0.45)'; // 合格区（主题黄）
    ctx.fillRect(0, this.baseY - z.q[1] * h, this.W, (z.q[1] - z.q[0]) * h);
    ctx.fillStyle = 'rgba(190,222,150,0.80)'; // 完美区（柔和绿）
    ctx.fillRect(0, this.baseY - z.p[1] * h, this.W, (z.p[1] - z.p[0]) * h);

    // 水（带波浪液面）
    if (this.level > 0.001) {
      var f = Math.min(this.level, 1);
      var surfY = this.baseY - f * h;
      var halfAt = this.halfW * cup.profile(f) + 2;
      var steps = 24;
      ctx.beginPath();
      // 左壁：杯底 → 液面（沿杯型轮廓，梯形/收口杯都贴合）
      for (var li = 0; li <= steps; li++) {
        var lt = f * li / steps;
        var lw = this.halfW * cup.profile(lt) + 2;
        var ly = this.baseY - lt * h;
        if (li === 0) ctx.moveTo(this.cx - lw, ly + 2); else ctx.lineTo(this.cx - lw, ly);
      }
      // 波浪液面：左 → 右
      for (var i = 0; i <= steps; i++) {
        var x = this.cx - halfAt + (2 * halfAt) * (i / steps);
        var wave = Math.sin(this.time * 6 + i * 0.9) * 3 * this.surfaceWave;
        ctx.lineTo(x, surfY + wave);
      }
      // 右壁：液面 → 杯底
      for (var ri = steps; ri >= 0; ri--) {
        var rt = f * ri / steps;
        var rw = this.halfW * cup.profile(rt) + 2;
        var ry = this.baseY - rt * h;
        ctx.lineTo(this.cx + rw, ri === 0 ? ry + 2 : ry);
      }
      ctx.closePath();
      // 材质：顶部饮品本色 → 底部深色，纵向渐变出体积感；透明度按饮品（白酒清透、牛奶醇厚）
      var dk = this.drink;
      var lgrad = ctx.createLinearGradient(0, surfY, 0, this.baseY);
      lgrad.addColorStop(0, dk.color);
      var deepC = dk.deep || dk.color;
      if (dk.gradSoft) deepC = mixHex(deepC, '#FFFFFF', dk.gradSoft); // 牛奶系渐变柔化
      lgrad.addColorStop(1, deepC);
      ctx.globalAlpha = dk.alpha != null ? dk.alpha : 0.92;
      ctx.fillStyle = lgrad;
      ctx.fill();
      ctx.globalAlpha = 1;
      // 碳酸气泡：液体内上浮的小气泡圈（可乐/啤酒），颜色比液体亮一截
      if (this.bubb.length) {
        ctx.strokeStyle = this.splashTint();
        ctx.lineWidth = 1.2;
        ctx.globalAlpha = 0.55;
        for (var bi = 0; bi < this.bubb.length; bi++) {
          var b2 = this.bubb[bi];
          ctx.beginPath(); ctx.arc(b2.x, b2.y, b2.r, 0, Math.PI * 2); ctx.stroke();
        }
        ctx.globalAlpha = 1;
      }
      // 啤酒泡沫层：沿波动液面盖一条奶油色泡沫
      if (dk.foam && this.level > 0.02) {
        ctx.strokeStyle = 'rgba(255,246,224,0.92)';
        ctx.lineWidth = 7;
        ctx.lineCap = 'round';
        ctx.beginPath();
        for (var fi = 0; fi <= steps; fi++) {
          var fx = this.cx - halfAt + (2 * halfAt) * (fi / steps);
          var fw2 = Math.sin(this.time * 6 + fi * 0.9) * 3 * this.surfaceWave;
          if (fi === 0) ctx.moveTo(fx, surfY + fw2); else ctx.lineTo(fx, surfY + fw2);
        }
        ctx.stroke();
      }
      // 液面线：仅在液面平静后显示（倒水波动时隐藏，避免直线穿浪）
      var lineA = 1 - this.surfaceWave;
      if (lineA > 0.05) {
        ctx.globalAlpha = lineA;
        ctx.strokeStyle = this.inkFor(this.drink.color) === '#FFFDF5'
          ? 'rgba(255,255,255,0.55)' : 'rgba(43,42,38,0.50)';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(this.cx - halfAt, surfY + 1);
        ctx.lineTo(this.cx + halfAt, surfY + 1);
        ctx.stroke();
        // 液面高光
        ctx.strokeStyle = this.inkFor(this.drink.color) === '#FFFDF5'
          ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.35)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(this.cx - halfAt * 0.7, surfY + 4);
        ctx.lineTo(this.cx + halfAt * 0.7, surfY + 4);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
    }
    ctx.restore();

    if (useSpr) {
      // 精灵杯贴图盖在液体/分区之上（瓶壁+刻度线始终清晰）
      var sdh = this.cupH / this.cup.sprHFrac;
      var sdw = sdh * (sprRec.img.width / sprRec.img.height);
      ctx.drawImage(sprRec.img, this.cx - sdw / 2, this.baseY - sdh * this.cup.sprBFrac, sdw, sdh);
    } else {
      // 杯身描边（杯口不封线：开口杯，视觉更轻、方便读刻度）
      this.traceCupWall(0);
      ctx.strokeStyle = wallC;
      ctx.lineWidth = wallW;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.stroke();
      ctx.lineCap = 'butt';
      // 杯底描边加粗（2 倍边线宽，杯子更有压桌感）
      var bw0 = this.halfW * cup.profile(0);
      ctx.beginPath();
      ctx.moveTo(this.cx - bw0, this.baseY);
      ctx.lineTo(this.cx + bw0, this.baseY);
      ctx.lineWidth = wallW * 2;
      ctx.stroke();
    }

    // 杯把（右侧耳形把手；对象形式可自定义附着位置 t1/t2 与外扩幅度 out）
    if (handleOn && !useSpr) {
      var hcfg = typeof deco.handle === 'object' && deco.handle ? deco.handle : {};
      var ht1 = hcfg.t1 != null ? hcfg.t1 : 0.82;   // 上附着点（杯高比例）
      var ht2 = hcfg.t2 != null ? hcfg.t2 : 0.45;   // 下附着点
      var hOut = this.halfW * (hcfg.out != null ? hcfg.out : 0.62); // 外扩幅度
      var hw1 = this.halfW * cup.profile(ht1), hw2 = this.halfW * cup.profile(ht2);
      var hy1 = this.baseY - ht1 * this.cupH, hy2 = this.baseY - ht2 * this.cupH;
      ctx.beginPath();
      ctx.moveTo(this.cx + hw1 - 2, hy1);
      ctx.bezierCurveTo(this.cx + hw1 + hOut, hy1, this.cx + hw2 + hOut, hy2, this.cx + hw2 - 2, hy2);
      ctx.bezierCurveTo(this.cx + hw2 + hOut * 0.45, hy2 + 8, this.cx + hw1 + hOut * 0.45, hy1 - 8, this.cx + hw1 - 2, hy1);
      ctx.closePath();
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.fill();
      ctx.strokeStyle = wallC;
      ctx.lineWidth = Math.max(3, wallW - 1);
      ctx.stroke();
    }

    // 内壁刻度线（右侧内壁，均匀分布，精灵杯贴图自带刻度故跳过）
    if (ticks > 0 && !useSpr) {
      ctx.strokeStyle = wallC;
      ctx.globalAlpha = 0.5;
      ctx.lineWidth = 2;
      for (var tk = 1; tk <= ticks; tk++) {
        var tt = tk / (ticks + 1);
        var tw = this.halfW * cup.profile(tt) - 3;
        if (tw < 8) continue;
        var ty = this.baseY - tt * this.cupH;
        var tl = Math.max(4, Math.min(14, tw * 0.25));
        ctx.beginPath();
        ctx.moveTo(this.cx + tw, ty);
        ctx.lineTo(this.cx + tw - tl, ty);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }

    // 区域分隔虚线提示（仅合格区外沿；黄绿之间不画线，视觉更干净）
    if (dashOn) {
    ctx.save();
    ctx.setLineDash([6, 6]);
    ctx.strokeStyle = 'rgba(43,42,38,0.30)';
    ctx.lineWidth = 1.5;
    var lines = [z.q[0], z.q[1]];
    for (var li = 0; li < lines.length; li++) {
      var wAt = this.halfW * cup.profile(lines[li]);
      var yy = this.baseY - lines[li] * h;
      ctx.beginPath(); ctx.moveTo(this.cx - wAt, yy); ctx.lineTo(this.cx + wAt, yy); ctx.stroke();
    }
    ctx.restore();
    }
  };

  Game.prototype.drawBucket = function () {
    var ctx = this.ctx;
    var bw = this.bucketW, bh = this.bucketH;

    // 最高优先：当前段位的容器贴图（带静止预倾角 restTilt + 自定义支点偏移）
    var rec = this.assets.containers && this.assets.containers[this.containerIdx];
    if (this.containerCfg && rec && rec.ready) {
      var cfg = this.containerCfg;
      ctx.save();
      ctx.translate(this.spout.x + (cfg.pivotDx || 0) * this.W, this.spout.y + (cfg.pivotDy || 0) * this.H);
      ctx.rotate(cfg.restTilt + this.angle);
      var dh0 = bh * 2.2 * (cfg.scale || 1);
      var dw0 = dh0 * (rec.img.width / rec.img.height);
      ctx.drawImage(rec.img, -dw0 * cfg.anchor.x, -dh0 * cfg.anchor.y, dw0, dh0);
      ctx.restore();
      return;
    }

    ctx.save();
    ctx.translate(this.spout.x, this.spout.y);
    ctx.rotate(this.angle);

    // 次优先：通用水桶贴图：锚点为壶嘴尖（贴图内相对位置 0.987, 0.517）
    var sprite = this.assets.bucket;
    if (sprite && sprite.ready) {
      var iw = sprite.img.width, ih = sprite.img.height;
      var dh = bh * 1.35;                 // 贴图显示高度
      var dw = dh * (iw / ih);            // 保持宽高比
      ctx.drawImage(sprite.img,
        -dw * this.bucketAnchor.x, -dh * this.bucketAnchor.y, dw, dh);
      ctx.restore();
      return;
    }

    // 桶身（圆角梯形，支点在右下角壶嘴处）
    var x0 = -bw, y0 = -bh;
    ctx.beginPath();
    ctx.moveTo(x0 + 10, y0);
    ctx.lineTo(-14, y0);
    ctx.quadraticCurveTo(-4, y0, -6, y0 + 14);
    ctx.lineTo(-2, -8);
    ctx.quadraticCurveTo(0, 0, -8, 0);
    ctx.lineTo(x0 + 4, 0);
    ctx.quadraticCurveTo(x0, 0, x0, -6);
    ctx.lineTo(x0, y0 + 10);
    ctx.quadraticCurveTo(x0, y0, x0 + 10, y0);
    ctx.closePath();
    ctx.fillStyle = '#7FB5D8';
    ctx.fill();
    ctx.strokeStyle = '#3E5C76';
    ctx.lineWidth = 4.5;
    ctx.lineJoin = 'round';
    ctx.stroke();

    // 桶内水面（随已倒量下降）
    var innerLevel = Math.max(0.15, 0.9 - this.poured * 0.35);
    ctx.save();
    ctx.beginPath();
    ctx.rect(x0 + 5, y0 + 5, bw - 20, bh - 10);
    ctx.clip();
    ctx.fillStyle = this.drink ? this.drink.color : '#3FA7FF';
    ctx.globalAlpha = 0.85;
    var wy = -bh * innerLevel;
    ctx.beginPath();
    ctx.moveTo(x0 + 5, 0);
    ctx.lineTo(x0 + 5, wy);
    for (var i = 0; i <= 16; i++) {
      var x = x0 + 5 + (bw - 20) * (i / 16);
      ctx.lineTo(x, wy + Math.sin(this.time * 5 + i) * 2);
    }
    ctx.lineTo(x0 + 5 + bw - 20, 0);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // 把手
    ctx.strokeStyle = '#3E5C76';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.arc(x0 - 2, y0 + bh * 0.5, bh * 0.32, Math.PI * 0.5, Math.PI * 1.5);
    ctx.stroke();

    // 高光
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(x0 + 14, y0 + 10);
    ctx.lineTo(x0 + 14, -14);
    ctx.stroke();

    ctx.restore();
  };

  Game.prototype.drawStream = function () {
    var pouring = this.angle > this.T.POUR_THRESHOLD && this.level < 1 &&
      (this.phase === 'press' || this.phase === 'settle');
    if (!pouring) return;
    var ctx = this.ctx;
    var tip = this.spoutTip();
    var surfaceY = this.baseY - Math.min(this.level, 1) * this.cupH;
    var strength = Math.min(1, (this.angle - this.T.POUR_THRESHOLD) / 0.4);

    // —— 真实抛物线水流：水从瓶口带初速度射出，受重力自然下弯 ——
    var a = this.currentTilt();
    var v0 = 40 + 110 * strength;                 // 出水量越大初速越快
    var vx = Math.sin(a) * v0;                    // 瓶口朝向（随倾角从斜上转到水平）
    var vy = -Math.cos(a) * v0 + 20;
    var g = 950;                                  // 重力加速度 px/s²
    var baseW = 3 + strength * 6;
    var inset = 3 + baseW / 2;                    // 水流中心距内壁的最小距离
    // 落点预解算：若自然抛物线会落到杯口之外，收小水平初速把落点拉回杯口内
    // （相当于瓶口对准了杯子倒，避免水流贴壁折返的不自然形态）
    var drop = Math.max(10, surfaceY - tip.y);
    var tFall = (-vy + Math.sqrt(vy * vy + 2 * g * drop)) / g;
    var mouthHalf = Math.max(8, this.cup.profile(1) * this.halfW - inset);
    var naturalX = tip.x + vx * tFall;
    var targetX = Math.max(this.cx - mouthHalf, Math.min(this.cx + mouthHalf, naturalX));
    if (targetX !== naturalX) vx = (targetX - tip.x) / tFall;
    var pts = [], t = 0, dt = 0.016, lx = tip.x;
    var wallSide = 0;                             // 0=未触壁；±1=已撞上某侧杯壁（兜底，正常不会触发）
    while (t < 1.5) {
      var x = tip.x + vx * t;
      var y = tip.y + vy * t + 0.5 * g * t * t;
      if (y >= this.cupTop) {
        // 杯壁检测：进入杯口高度范围后，水流不能越过内壁
        var tt = Math.max(0, Math.min(1, (this.baseY - y) / this.cupH));
        var wallHalf = Math.max(6, this.cup.profile(tt) * this.halfW - inset);
        if (wallSide === 0 && Math.abs(x - this.cx) > wallHalf) {
          wallSide = x > this.cx ? 1 : -1;        // 撞壁点：之后沿这侧内壁流下
        }
        if (wallSide !== 0) x = this.cx + wallSide * wallHalf; // 贴内壁顺流而下
      }
      pts.push([x, y]);
      if (y >= surfaceY) { lx = x; break; }       // 落到液面为止
      t += dt;
    }
    this.streamX = lx;                            // 落点 X（水花在这里溅起）

    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    // 描边层：浅色饮品（牛奶/白酒）在浅背景上也能看清
    for (var pass = 0; pass < 2; pass++) {
      ctx.strokeStyle = pass === 0 ? 'rgba(43,42,38,0.28)' : this.drink.color;
      ctx.beginPath();
      for (var i = 0; i < pts.length; i++) {
        var w = (baseW + (pass === 0 ? 3 : 0)) * (1 - 0.3 * i / pts.length); // 下落逐渐变细
        // 出水口半透明渐入：遮住水流与瓶口的重叠，减少穿帮感
        var fade = Math.min(1, i / 6);
        ctx.globalAlpha = (pass === 0 ? 0.9 : 0.92) * (0.15 + 0.85 * fade);
        ctx.lineWidth = w;
        if (i === 0) ctx.moveTo(pts[i][0], pts[i][1]);
        else { ctx.lineTo(pts[i][0], pts[i][1]); ctx.stroke(); ctx.beginPath(); ctx.moveTo(pts[i][0], pts[i][1]); }
      }
    }
    ctx.globalAlpha = 1;
  };

  Game.prototype.drawParticles = function () {
    var ctx = this.ctx;
    for (var i = 0; i < this.particles.length; i++) {
      var p = this.particles[i];
      ctx.globalAlpha = Math.max(0, p.life / 0.5);
      ctx.fillStyle = p.color;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(43,42,38,0.32)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  };

  Game.prototype.drawScoreHUD = function () {
    var ctx = this.ctx;
    // 历史最高：右上角纯文本
    ctx.textAlign = 'right';
    ctx.font = Math.round(this.H * 0.02) + 'px sans-serif';
    ctx.fillStyle = PAL.MUTED;
    ctx.fillText('历史最高 ', this.W - 14 - ctx.measureText(String(this.best)).width - 6, this.H * 0.052);
    ctx.fillStyle = PAL.INK;
    ctx.font = 'bold ' + Math.round(this.H * 0.02) + 'px sans-serif';
    ctx.fillText(String(this.best), this.W - 14, this.H * 0.052);
    // 大分数 + 第 X 杯（居中）
    ctx.textAlign = 'center';
    ctx.fillStyle = PAL.INK;
    ctx.font = 'bold ' + Math.round(this.H * 0.062) + 'px sans-serif';
    ctx.fillText(String(this.score), this.W / 2, this.H * 0.075);
    ctx.font = 'bold ' + Math.round(this.H * 0.032) + 'px sans-serif';
    ctx.fillText('第 ' + this.round + ' 杯', this.W / 2, this.H * 0.125);
  };

  Game.prototype.drawDrinkTag = function () {
    var ctx = this.ctx;
    var text = this.drink.name + ' · ' + this.cup.hint;
    ctx.font = 'bold ' + Math.round(this.H * 0.019) + 'px sans-serif';
    var tw = ctx.measureText(text).width + 32;
    var th = this.H * 0.042, x = (this.W - tw) / 2, y = this.H * 0.155;
    ctx.fillStyle = PAL.CARD;
    this.roundRect(x, y, tw, th, th / 2);
    ctx.fill();
    ctx.fillStyle = PAL.INK;
    ctx.textAlign = 'center';
    ctx.fillText(text, this.W / 2, y + th * 0.66);
  };

  Game.prototype.drawAimHint = function () {
    var ctx = this.ctx;
    var a = 0.6 + 0.4 * Math.sin(this.time * 4);
    ctx.globalAlpha = a;
    ctx.fillStyle = PAL.INK;
    ctx.font = 'bold ' + Math.round(this.H * 0.030) + 'px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('按住屏幕倒水', this.W / 2, this.H * 0.925);
    ctx.globalAlpha = 1;
  };

  Game.prototype.drawFloats = function () {
    var ctx = this.ctx;
    for (var i = 0; i < this.floats.length; i++) {
      var f = this.floats[i];
      ctx.globalAlpha = Math.min(1, f.life);
      ctx.fillStyle = f.color;
      ctx.font = 'bold ' + Math.round(this.H * 0.038) + 'px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(f.text, f.x, f.y);
    }
    ctx.globalAlpha = 1;
  };

  Game.prototype.drawToasts = function () {
    var ctx = this.ctx;
    ctx.textAlign = 'center';
    for (var i = 0; i < this.toasts.length; i++) {
      var t = this.toasts[i];
      var a = Math.min(1, t.life);
      ctx.globalAlpha = a * 0.92;
      ctx.font = Math.round(this.H * 0.019) + 'px sans-serif';
      var tw = ctx.measureText(t.text).width + 36;
      var x = (this.W - tw) / 2, y = this.H * 0.40 + i * this.H * 0.05;
      ctx.fillStyle = 'rgba(40,40,40,0.85)';
      this.roundRect(x, y, tw, this.H * 0.036, 16);
      ctx.fill();
      ctx.fillStyle = '#FFF3D6';
      ctx.fillText(t.text, this.W / 2, y + this.H * 0.025);
    }
    ctx.globalAlpha = 1;
  };

  // ---------------- 主界面（卡片化 · 参考智能家居风） ----------------
  Game.prototype.drawMenu = function () {
    var ctx = this.ctx, W = this.W, H = this.H;
    var tier = Cups.TIERS[this.tierIdx];
    var mx = W * 0.09; // 左右边距

    // 标题（左对齐）+ 副标语
    ctx.textAlign = 'left';
    ctx.fillStyle = PAL.INK;
    ctx.font = 'bold ' + Math.round(H * 0.062) + 'px sans-serif';
    ctx.fillText('人生一杯', mx, H * 0.115);
    ctx.font = Math.round(H * 0.022) + 'px sans-serif';
    ctx.fillStyle = PAL.MUTED;
    ctx.fillText('这一杯敬自己', mx, H * 0.152);

    // —— 容器英雄图：奶盒/可乐瓶/啤酒瓶/茶壶 前后错落 ——
    var heroes = this.assets.heroes;
    if (heroes && heroes.ready) {
      var aspect = heroes.img.width / heroes.img.height;
      var hh = Math.min(H * 0.235, W * 0.92 / aspect);
      var hw = hh * aspect;
      var hBottom = H * 0.40;
      ctx.drawImage(heroes.img, (W - hw) / 2, hBottom - hh, hw, hh);
    }

    // —— 黑色段位主卡（带黄色开始键，只显示段位名） ——
    var cw1 = W * 0.50, ch1 = H * 0.155, cx1 = mx, cy1 = H * 0.415;
    ctx.fillStyle = 'rgba(43,42,38,0.12)';
    this.roundRect(cx1, cy1 + 4, cw1, ch1, 24);
    ctx.fill();
    ctx.fillStyle = PAL.INK;
    this.roundRect(cx1, cy1, cw1, ch1, 24);
    ctx.fill();
    ctx.textAlign = 'left';
    ctx.fillStyle = PAL.CARD_DIM;
    ctx.font = Math.round(H * 0.016) + 'px sans-serif';
    ctx.fillText('最高段位', cx1 + W * 0.05, cy1 + ch1 * 0.32);
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold ' + Math.round(H * 0.032) + 'px sans-serif';
    ctx.fillText(tier.name, cx1 + W * 0.05, cy1 + ch1 * 0.72);
    // 黄色开始键（呼吸效果）
    var pulse = 1 + 0.06 * Math.sin(this.time * 4);
    var pr = W * 0.075 * pulse, pxc = cx1 + cw1 - W * 0.10, pyc = cy1 + ch1 / 2;
    ctx.fillStyle = PAL.YEL;
    ctx.beginPath(); ctx.arc(pxc, pyc, pr, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = PAL.INK;
    ctx.beginPath();
    ctx.moveTo(pxc - pr * 0.25, pyc - pr * 0.42);
    ctx.lineTo(pxc - pr * 0.25, pyc + pr * 0.42);
    ctx.lineTo(pxc + pr * 0.48, pyc);
    ctx.closePath(); ctx.fill();

    // —— 白卡：历史最高（与段位卡同高并排） ——
    var cw2 = W - mx * 2 - cw1 - W * 0.04, cx2 = W - mx - cw2, ch2 = ch1, cy2 = cy1;
    ctx.fillStyle = PAL.CARD;
    this.roundRect(cx2, cy2, cw2, ch2, 20);
    ctx.fill();
    ctx.fillStyle = PAL.MUTED;
    ctx.font = Math.round(H * 0.015) + 'px sans-serif';
    ctx.fillText('历史最高', cx2 + W * 0.045, cy2 + ch2 * 0.32);
    ctx.fillStyle = PAL.INK;
    ctx.font = 'bold ' + Math.round(H * 0.038) + 'px sans-serif';
    ctx.fillText(this.best > 0 ? String(this.best) : '—', cx2 + W * 0.045, cy2 + ch2 * 0.74);

    // —— 通栏白卡：操作方式 ——
    var cy4 = cy1 + ch1 + H * 0.025, ch4 = H * 0.105;
    ctx.fillStyle = PAL.CARD;
    this.roundRect(mx, cy4, W - mx * 2, ch4, 22);
    ctx.fill();
    ctx.fillStyle = PAL.MUTED;
    ctx.font = Math.round(H * 0.015) + 'px sans-serif';
    ctx.fillText('操作方式', mx + W * 0.05, cy4 + ch4 * 0.36);
    ctx.fillStyle = PAL.INK;
    ctx.font = 'bold ' + Math.round(H * 0.021) + 'px sans-serif';
    ctx.fillText('按住屏幕倒水 · 松手停止', mx + W * 0.05, cy4 + ch4 * 0.72);

    // 四个按钮：商城 / 分享 / 排名 / 设置（白底圆钮 + 柔影 + 墨色字）
    ctx.textAlign = 'center';
    for (var i = 0; i < this.menuButtons.length; i++) {
      var b = this.menuButtons[i];
      ctx.fillStyle = 'rgba(43,42,38,0.12)';
      ctx.beginPath(); ctx.arc(b.x, b.y + 3, b.r, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
      ctx.fillStyle = PAL.CARD; ctx.fill();
      ctx.fillStyle = PAL.INK;
      ctx.font = 'bold ' + Math.round(b.r * 0.42) + 'px sans-serif';
      ctx.fillText(b.label, b.x, b.y + b.r * 0.15);
    }

    if (this.overlay) this.drawOverlay();
  };

  Game.prototype.drawMenuDeco = function () {
    var ctx = this.ctx, W = this.W, H = this.H;
    var cx = W / 2, baseY = H * 0.55, cupH = H * 0.13;
    // 杯
    ctx.strokeStyle = PAL.INK;
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(cx - cupH * 0.42, baseY - cupH);
    ctx.quadraticCurveTo(cx - cupH * 0.5, baseY, cx, baseY);
    ctx.quadraticCurveTo(cx + cupH * 0.5, baseY, cx + cupH * 0.42, baseY - cupH);
    ctx.stroke();
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(cx - cupH * 0.42, baseY - cupH);
    ctx.quadraticCurveTo(cx - cupH * 0.5, baseY, cx, baseY);
    ctx.quadraticCurveTo(cx + cupH * 0.5, baseY, cx + cupH * 0.42, baseY - cupH);
    ctx.closePath();
    ctx.clip();
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.fillRect(cx - cupH, baseY - cupH, cupH * 2, cupH);
    // 半杯水
    ctx.fillStyle = 'rgba(63,167,255,0.85)';
    ctx.beginPath();
    ctx.moveTo(cx - cupH * 0.48, baseY - cupH * 0.5 + Math.sin(this.time * 3) * 2);
    ctx.quadraticCurveTo(cx, baseY - cupH * 0.44 + Math.cos(this.time * 3) * 2, cx + cupH * 0.48, baseY - cupH * 0.5 + Math.sin(this.time * 3 + 1) * 2);
    ctx.lineTo(cx + cupH * 0.5, baseY + 4);
    ctx.lineTo(cx - cupH * 0.5, baseY + 4);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    // 水滴动画
    var dy = baseY - cupH - 30 + (this.time * 60) % 60;
    ctx.fillStyle = '#3FA7FF';
    ctx.beginPath(); ctx.arc(cx, dy, 6, 0, Math.PI * 2); ctx.fill();
  };

  Game.prototype.drawOverlay = function () {
    var ctx = this.ctx, W = this.W, H = this.H;
    ctx.fillStyle = 'rgba(43,42,38,0.40)';
    ctx.fillRect(0, 0, W, H);
    var px = W * 0.1, py = H * 0.28, pw = W * 0.8, ph = H * 0.34;
    ctx.fillStyle = PAL.CARD;
    this.roundRect(px, py, pw, ph, 18);
    ctx.fill();
    ctx.strokeStyle = PAL.TRACK; ctx.lineWidth = 3; ctx.stroke();

    ctx.textAlign = 'center';
    ctx.fillStyle = PAL.INK;
    ctx.font = 'bold ' + Math.round(H * 0.03) + 'px sans-serif';
    var title = this.overlay === 'shop' ? '商城' : this.overlay === 'rank' ? '排名' : '设置';
    ctx.fillText(title, W / 2, py + H * 0.055);

    ctx.font = Math.round(H * 0.02) + 'px sans-serif';
    ctx.fillStyle = PAL.MUTED;
    if (this.overlay === 'shop') {
      ctx.fillText('水桶皮肤 · 杯型材质 · 去除广告', W / 2, py + H * 0.115);
      ctx.fillText('品牌联名饮品即将上架，敬请期待', W / 2, py + H * 0.155);
    } else if (this.overlay === 'rank') {
      ctx.fillText('本机最高分：' + this.best, W / 2, py + H * 0.115);
      ctx.fillText('累计成功：' + this.totalCups + ' 杯', W / 2, py + H * 0.155);
      ctx.font = Math.round(H * 0.017) + 'px sans-serif';
      ctx.fillStyle = PAL.MUTED;
      ctx.fillText('好友排行接入微信开放数据域后开放', W / 2, py + H * 0.195);
    } else {
      // 震动开关
      var tw = W * 0.34, th = H * 0.05;
      this.vibrateToggle = { x: W / 2 - tw / 2, y: py + H * 0.10, w: tw, h: th };
      this.drawCapsule(this.vibrateToggle.x, this.vibrateToggle.y, tw, th,
        this.vibrateOn ? PAL.YEL : PAL.TRACK, '震动：' + (this.vibrateOn ? '开' : '关'), H * 0.021);
      ctx.font = Math.round(H * 0.017) + 'px sans-serif';
      ctx.fillStyle = PAL.MUTED;
      ctx.fillText('音效与画质选项开发中', W / 2, py + H * 0.22);
    }

    // 关闭按钮
    var c = this.overlayClose;
    this.drawCapsule(c.x, c.y, c.w, c.h, PAL.INK, '关 闭', H * 0.022);
  };

  // ---------------- 结算界面（黑卡化） ----------------
  Game.prototype.drawOver = function () {
    var ctx = this.ctx, W = this.W, H = this.H;
    ctx.fillStyle = 'rgba(43,42,38,0.45)';
    ctx.fillRect(0, 0, W, H);

    // 黑色主卡
    var px = W * 0.08, py = H * 0.20, pw = W * 0.84, ph = H * 0.37;
    ctx.fillStyle = PAL.INK;
    this.roundRect(px, py, pw, ph, 26);
    ctx.fill();

    ctx.textAlign = 'center';
    ctx.fillStyle = PAL.CARD_DIM;
    ctx.font = Math.round(H * 0.018) + 'px sans-serif';
    ctx.fillText('本局结束 · ' + this.failReason, W / 2, py + H * 0.055);

    // 大分数
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold ' + Math.round(H * 0.085) + 'px sans-serif';
    ctx.fillText(String(this.score), W / 2, py + H * 0.16);
    ctx.font = Math.round(H * 0.017) + 'px sans-serif';
    ctx.fillStyle = PAL.CARD_DIM;
    ctx.fillText('历史最高 ' + this.best, W / 2, py + H * 0.195);

    if (this.newRecord) {
      var a = 0.6 + 0.4 * Math.sin(this.time * 6);
      ctx.globalAlpha = a;
      ctx.fillStyle = PAL.YEL;
      ctx.font = 'bold ' + Math.round(H * 0.024) + 'px sans-serif';
      ctx.fillText('★ 新纪录 ★', W / 2, py + H * 0.235);
      ctx.globalAlpha = 1;
    }

    // 段位徽章（黄色胶囊，黑卡上最显眼）
    var oTier = Cups.TIERS[this.tierIdx];
    var oNext = Cups.TIERS[this.tierIdx + 1];
    var capsuleTxt = '段位 · ' + oTier.name;
    ctx.font = 'bold ' + Math.round(H * 0.024) + 'px sans-serif';
    var cw = ctx.measureText(capsuleTxt).width + W * 0.12;
    var ch = H * 0.05, cx0 = W / 2 - cw / 2, cy0 = py + H * 0.26;
    ctx.fillStyle = PAL.YEL;
    this.roundRect(cx0, cy0, cw, ch, ch / 2);
    ctx.fill();
    ctx.fillStyle = PAL.INK;
    ctx.fillText(capsuleTxt, W / 2, cy0 + ch * 0.68);

    // 段位小哲理（替代原「距下一段位还差 X 分」进度行）
    ctx.font = Math.round(H * 0.017) + 'px sans-serif';
    ctx.fillStyle = PAL.CARD_DIM;
    ctx.fillText(oTier.wisdom || '', W / 2, py + H * 0.345);

    for (var i = 0; i < this.overButtons.length; i++) {
      var b = this.overButtons[i];
      this.drawCapsule(b.x, b.y, b.w, b.h, b.color, b.label, H * 0.024);
    }
  };

  Game.prototype.roundRect = function (x, y, w, h, r) {
    var ctx = this.ctx;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  };

  // 按底色亮度返回可读的墨色（深底→米白，浅底→深棕）
  Game.prototype.inkFor = function (bg) {
    var m = /^#([0-9a-fA-F]{6})$/.exec(bg || '');
    if (!m) return '#FFFDF5';
    var n = parseInt(m[1], 16);
    var lum = (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
    return lum > 0.72 ? '#5B4322' : '#FFFDF5';
  };

  // 跳一跳风胶囊按钮：柔和投影 + 平涂 + 底部轻内阴影
  Game.prototype.drawCapsule = function (x, y, w, h, color, label, fontPx) {
    var ctx = this.ctx;
    ctx.fillStyle = 'rgba(43,42,38,0.12)';
    this.roundRect(x, y + Math.max(2, h * 0.07), w, h, h / 2);
    ctx.fill();
    ctx.fillStyle = color;
    this.roundRect(x, y, w, h, h / 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.07)';
    this.roundRect(x + 2, y + h * 0.62, w - 4, h * 0.34, h * 0.17);
    ctx.fill();
    ctx.fillStyle = this.inkFor(color);
    ctx.font = 'bold ' + Math.round(fontPx || h * 0.42) + 'px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(label, x + w / 2, y + h * 0.68);
  };

  // ---------------- 主循环 ----------------
  Game.prototype.start = function () {
    var self = this;
    var raf = (typeof requestAnimationFrame !== 'undefined')
      ? requestAnimationFrame
      : function (cb) { return setTimeout(function () { cb(Date.now()); }, 16); };
    function loop(ts) {
      if (!self.lastTs) self.lastTs = ts;
      var dt = Math.min(0.05, (ts - self.lastTs) / 1000);
      self.lastTs = ts;
      self.update(dt);
      self.render();
      raf(loop);
    }
    raf(loop);
  };

  return Game;
});
