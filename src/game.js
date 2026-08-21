/**
 * 人生一杯 · 游戏主逻辑（平台无关，依赖 env 抽象层）
 * env = { canvas, ctx, W, H, onTouchStart, onTouchEnd, getStorage, setStorage, vibrate, share }
 */
(function (root, factory) {
  var isNode = (typeof module !== 'undefined' && module.exports);
  var Cups = isNode ? require('./cups.js') : root.Cups;
  var Containers = isNode ? require('./containers.js') : root.Containers;
  var Choices = isNode ? require('./choices.js') : root.Choices;
  var Game = factory(Cups, Containers, Choices);
  if (isNode) module.exports = Game;
  else root.Game = Game;
})(typeof GameGlobal !== 'undefined' ? GameGlobal : (typeof self !== 'undefined' ? self : this), function (Cups, Containers, Choices) {

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
    this.bubb = [];          // 液体内碳酸气泡（可乐/麦芽）
    this.roundFade = 1;      // 新杯淡入过渡（1 = 完全显示）
    this.containerIdx = 0;   // 本回合容器索引（newRound 时冻结）
    this.surfaceWave = 0;    // 液面波动强度：倒水时 1，静止后衰减到 0（平静便于读进度）
    this.streamX = 0;        // 水流落点 X（首帧倒水前兜底，避免 NaN 粒子）
    this.failReason = '';

    this.toasts = [];
    this.floats = [];
    this.particles = [];

    this.resetMods();      // 人生选择效果系统（每局重置）
    this.easyTierFor = -1; // 锦鲤附体：只出简单杯型的段位
    this.nextCupPre = null; // 记账习惯：预抽的下一杯
    this.straightCupRef = null;

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

  // ---------------- 人生选择 · 效果系统 ----------------
  Game.prototype.resetMods = function () {
    this.mods = {
      perfectScale: 1, completeScale: 1, pourRateScale: 1, scoreMult: 1,
      cupBonus: 0, perfectBonus: 0, comboBonus: 0, comboCap: 4,
      streakGain: 1, stageUpBonus: 0, failPenalty: 0,
      tapProtect: true, zoneShift: 0, zoneRandom: false, noCompleteZone: false,
      failProtect: 0, overflowForgive: false, overflowToPerfect: 0,
      comboProtect: 0, comboNeverBreak: false, perfectDouble: false,
      cupPreview: false, cupSimple3: false, lockTier: false,
      goldLines: false, hideMarks: false, zoneWander: false,
      timeSlow: false, bubbleBoost: false, invertCups: false,
      sizeVariance: false, comboZoneGrow: false,
      cupSizeMul: 1, cupAspectMul: 1, poolOverride: null,
      zonePulse: null, zoneDecay: null, residue: 0, zoneCushion: 0,
      nextCupBoost: 0, fullRite: 0, streakMin3: 0, sameStreak3: 0,
      foamCup: false, toastTarget: false, bank: null, equity: false,
      fund: false, afterPerfectSlow: null, teapot: null,
      perfectLockWidth: false, resume: false
    };
    // 计数型效果（随杯数消耗）
    this.rushCups = 0;        // 极限冲刺
    this.onlyPerfectCups = 0; // 孤注一掷
    this.reverseCups = 0;     // 反其道而行
    this.straightCups = 0;    // 轻装上阵
    this.doubleCups = 0;      // 一夜爆红
    this.slowTapCharges = 0;  // 快慢自如
    this.everyNs = [];        // 定期存款/稳定工作/双线作战
    this.usedChoiceIds = {};  // 本局已选过的选项（不重复出现）
    this.pendingChoice = null;
    this.pendingTierFx = null;  // 段位之力二选一（choice2 相位）
    this.forgiveUsed = false;   // 老狗陪伴（每局一次）
    this.bestStreakRun = 0;     // 本局最高连击（失而复得用）
    this.zoneShiftRound = 0;    // 错位竞争（每杯随机）
    this.zoneWanderT = 0;
    this.slowTapOn = false;
    this.reverseLock = false;
    this._keepCup = false;    // 人生选择后保杯标记（newRound 消费）
    this.chosenList = [];     // 本局已做的人生选择（「已做选择」面板数据）
    this.choiceOpenT = -10;   // 抽卡面板打开时刻（1 秒误触保护）
    this.choiceListOpen = false; // 「已做选择」面板开关
    this.listScroll = 0;      // 面板滚动偏移
    this._listDrag = null;    // 面板拖动状态
    this.choiceIsOpening = false; // 开局天赋三选一（出生前的选择）标记
    this._noIncRound = false; // 开局天赋选完不跳杯标记
    // ── v2 新机制状态 ──
    this.curses = [];         // 先苦后甜：{left, pen, reward, name}
    this.roundStartT = 0;     // 本杯开始时刻（区域脉冲/衰减用）
    this.prevLevel = 0;       // 上一杯最终水位（汽水洗杯残量用）
    this.cushionArmed = false;// 气泡垫：本杯进区缓冲是否还可用
    this.boostLeft = 0;       // 摇过的汽水：下一杯初速加成剩余秒数
    this.streakGain2Left = 0; // 整层楼一起：完美计 2 连的剩余杯数
    this.foamLayers = 0;      // 挂杯：当前杯壁泡沫层数
    this.toastLevel = 0;      // 碰杯约定：本局约定水位（0=未启用）
    this.bankBal = 0;         // 复利账户余额
    this.graceTier = -1;      // 跳槽窗口期：免失败的段位序号
    this.graceArmed = false;  // 跳槽窗口期：当前杯是否带免死
    this.equityBal = 0;       // 股权池股数
    this.fundBal = 0;         // 退路基金余额
    this.redoLeft = 0;        // 重来一杯：剩余悔棋次数
    this.slowStartArm = false;// 回甘：下一杯前 1 秒减速（跨杯传递标记）
    this.slowStartOn = false; // 回甘：本杯是否生效
    this.teapotN = 0;         // 茶宠：连续不失败杯数
    this.teapotOn = false;    // 茶宠：是否已养成
    this.sameType = '';       // 周报模板：上一杯结果类型 P/C
    this.sameN = 0;           // 周报模板：同结果连续杯数
    this.resumeLeft = 0;      // 学饮过渡：本杯剩余续倒次数
    this.preCup = null;       // 悔棋快照 {score, streak}
    this.lastChanceRects = null; // 悔棋面板按钮热区
    this.rankPulseT = 0;      // 阶段提升动画剩余时长（0.6s 放大回弹）
  };

  // 生效目标区：杯型基础区 × 选择修正（完美区始终贴合合格区顶部）
  Game.prototype.effZones = function () {
    var m = this.mods, z = this.zoneBase || this.cup.zones; // 目标区：每杯随机生成（zoneBase），兜底用杯型自带
    var qc = (z.q[0] + z.q[1]) / 2;
    var qw = (z.q[1] - z.q[0]) * m.completeScale;
    var basePw = z.p[1] - z.p[0];
    var pw = basePw * m.perfectScale;
    var cupT = this.time - (this.roundStartT || 0); // 本杯进行时长
    if (m.zoneDecay) { // 跑气的可乐：目标区随时间从 from 缩到 to
      var dt01 = Math.max(0, Math.min(1, cupT / m.zoneDecay.secs));
      var df = m.zoneDecay.from + (m.zoneDecay.to - m.zoneDecay.from) * dt01;
      qw *= df; pw *= df;
    }
    if (m.zonePulse) { // 厌食拉锯：目标区周期性脉冲缩放
      var pf = 1 + m.zonePulse.amp * Math.sin(cupT * Math.PI * 2 / m.zonePulse.period);
      qw *= pf; pw *= pf;
    }
    if (m.comboZoneGrow) pw *= 1 + Math.min(0.5, 0.05 * this.perfectStreak); // 时间的玫瑰（上限 +50%）
    if (m.fullRite && this.perfectStreak > 0 && this.perfectStreak % 3 === 2) pw *= m.fullRite; // 满杯仪式：第 3 杯蓄能
    if (m.perfectLockWidth) pw = Math.max(pw, basePw); // 茶气通透：完美区宽度免疫缩小
    var shift = m.zoneShift + this.zoneShiftRound;
    if (m.zoneWander) shift += Math.sin(this.time * 0.9) * 0.03; // 独立带娃
    var qLo = qc - qw / 2 + shift, qHi = qc + qw / 2 + shift;
    if (qHi > 0.985) { qLo -= qHi - 0.985; qHi = 0.985; }
    if (qLo < 0.12) { qHi += 0.12 - qLo; qLo = 0.12; }
    return { q: [qLo, qHi], p: [qHi - pw, qHi] };
  };

  // 抽一杯（含所有杯型类修正）
  Game.prototype.pickCup = function () {
    var m = this.mods, tier = Cups.TIERS[this.tierIdx];
    if (this.straightCups > 0) { // 轻装上阵
      if (!this.straightCupRef) {
        this.straightCupRef = Cups.CUPS.filter(function (c) { return c.name === '标准直筒杯'; })[0];
      }
      if (this.straightCupRef) return this.straightCupRef;
    }
    var poolTier = (m.poolOverride != null) ? m.poolOverride : this.tierIdx;
    var count = (tier && tier.cupCount) || 20;
    if (this.round === 1 || m.cupSimple3 || this.easyTierFor === this.tierIdx) count = 3;
    return Cups.randomCupTier(poolTier, count);
  };

  // 三选一抽卡：A/B/C/U 各一张（洗牌取三），每格 8% 概率替换为稀有 D
  // genericOnly=true 时只抽全阶段通用选项（开局「人生起点」用）
  Game.prototype.rollChoices = function (genericOnly) {
    var self = this;
    var eligible = Choices.POOL.filter(function (c) {
      if (self.usedChoiceIds[c.id]) return false;
      if (genericOnly && c.tiers != null) return false;
      return c.tiers == null || c.tiers.indexOf(self.tierIdx) >= 0;
    });
    var cats = ['A', 'B', 'C', 'U']; // 先苦后甜（咒）与 A/B/C 一起洗牌，三格取其三
    for (var i = cats.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1)), t = cats[i]; cats[i] = cats[j]; cats[j] = t;
    }
    var picks = [];
    for (var s = 0; s < 3 && eligible.length; s++) {
      var cat = Math.random() < 0.08 ? 'D' : cats[s];
      var sub = eligible.filter(function (c) { return c.cat === cat && picks.indexOf(c) < 0; });
      if (!sub.length) sub = eligible.filter(function (c) { return picks.indexOf(c) < 0; });
      if (!sub.length) continue;
      picks.push(sub[Math.floor(Math.random() * sub.length)]);
    }
    return picks.length ? picks : null;
  };

  // 应用选项效果
  Game.prototype.applyChoice = function (opt) {
    var fx0 = opt.fx || {};
    // 段位之力：先抽段位，再从该段位效果池随机 1 条（30% 概率 2 条进入二选一）
    if (fx0.tierPick || fx0.tierPickNext) { this.applyTierDraw(opt, fx0); return; }
    this.usedChoiceIds[opt.id] = true;
    var m = this.mods, fx = opt.fx || {};
    // 杯型类效果（这些选项的说明里明确提到换/变杯子，选后需要重新抽杯）
    var CUP_FX = { poolOverride: 1, poolOverrideCurrent: 1, cupSimple3: 1, straightCups: 1,
      cupSizeMul: 1, cupAspectMul: 1, invertCups: 1, sizeVariance: 1, easyNextTier: 1 };
    var affectsCup = false;
    var tierBefore = this.tierIdx;
    for (var k in fx) {
      if (CUP_FX[k]) affectsCup = true;
      var v = fx[k];
      switch (k) {
        case 'perfectScale': case 'completeScale': case 'pourRateScale': case 'scoreMult':
        case 'cupSizeMul': case 'cupAspectMul':
          m[k] *= v; break;
        case 'cupBonus': case 'perfectBonus': case 'comboBonus': case 'failProtect':
        case 'comboProtect': case 'stageUpBonus': case 'failPenalty':
          m[k] += v; break;
        case 'comboCap': m.comboCap = Math.max(m.comboCap, v); break;
        case 'streakGain': m.streakGain = v; break;
        case 'zoneShift': m.zoneShift += v; break;
        case 'overflowToPerfect': m.overflowToPerfect = Math.max(m.overflowToPerfect, v); break;
        case 'tapProtectOff': m.tapProtect = false; break;
        case 'zoneRandom': case 'noCompleteZone': case 'overflowForgive': case 'comboNeverBreak':
        case 'cupPreview': case 'cupSimple3': case 'lockTier': case 'goldLines': case 'hideMarks':
        case 'zoneWander': case 'timeSlow': case 'bubbleBoost': case 'perfectDouble':
        case 'invertCups': case 'sizeVariance': case 'comboZoneGrow':
          m[k] = true; break;
        case 'poolOverride': m.poolOverride = v; break;
        case 'poolOverrideCurrent': m.poolOverride = this.tierIdx; break;
        case 'easyNextTier': this.easyTierFor = this.tierIdx + 1; break;
        case 'everyN': this.everyNs.push(v); break;
        case 'rushCups': this.rushCups += v; break;
        case 'onlyPerfectCups': this.onlyPerfectCups += v; break;
        case 'reverseCups': this.reverseCups += v; break;
        case 'straightCups': this.straightCups += v; break;
        case 'doubleCups': this.doubleCups += v; break;
        case 'slowTapCharges': this.slowTapCharges += v; break;
        case 'instantScore':
          this.score += v;
          this.floats.push({ text: '+' + v, x: this.W / 2, y: this.H * 0.3, life: 1.6, color: '#E8A33D', size: 0.05 });
          break;
        case 'scoreMultNow': this.score = Math.round(this.score * v); break;
        case 'freePerfect':
          this.score += 2 + Math.min(this.perfectStreak, m.comboCap - 2); break;
        case 'restoreStreak':
          this.perfectStreak = this.bestStreakRun;
          this.score += this.bestStreakRun * 2; break;
        case 'jumpNextTier':
          this.score = Cups.TIERS[Math.min(this.tierIdx + 1, Cups.TIERS.length - 1)].score; break;
        case 'jumpNextStage': {
          var r = Cups.rankFor(this.score), steps = Cups.TIERS[r.tierIdx].steps;
          this.score = (steps && steps[r.stageIdx + 1] != null)
            ? steps[r.stageIdx + 1]
            : Cups.TIERS[Math.min(r.tierIdx + 1, Cups.TIERS.length - 1)].score;
          break;
        }
        case 'jumpDownRandom':
          if (this.tierIdx > 0) this.score = Cups.TIERS[Math.floor(Math.random() * this.tierIdx)].score;
          break;
        case 'backTier':
          if (this.tierIdx > 0) this.score = Cups.TIERS[this.tierIdx - 1].score; break;
        case 'backStage': {
          var r2 = Cups.rankFor(this.score), st2 = Cups.TIERS[r2.tierIdx].steps;
          if (r2.stageIdx > 0 && st2) this.score = st2[r2.stageIdx - 1];
          else if (r2.tierIdx > 0) this.score = Cups.TIERS[r2.tierIdx - 1].score;
          break;
        }
        case 'restartMilk': this.score = 0; break;
        // ── v2 新效果键 ──
        case 'zonePulse': m.zonePulse = v; break;
        case 'zoneDecay': m.zoneDecay = v; break;
        case 'residue': m.residue = Math.max(m.residue, v); break;
        case 'zoneCushion': m.zoneCushion = v; break;
        case 'nextCupBoost': m.nextCupBoost = Math.max(m.nextCupBoost, v); break;
        case 'fullRite': m.fullRite = v; break;
        case 'streakMin3': m.streakMin3 += v; break;
        case 'sameStreak3': m.sameStreak3 += v; break;
        case 'foamCup': m.foamCup = true; break;
        case 'toastTarget':
          m.toastTarget = true;
          this.toastLevel = 0.35 + Math.random() * 0.5; // 约定水位：每局一次
          break;
        case 'streakGain2Cups': this.streakGain2Left += v; break;
        case 'bank': m.bank = v; break;
        case 'tierGrace': this.graceTier = Math.min(this.tierIdx + 1, Cups.TIERS.length - 1); break;
        case 'equity': m.equity = true; break;
        case 'fund': m.fund = true; break;
        case 'redo': this.redoLeft += v; break;
        case 'afterPerfectSlow': m.afterPerfectSlow = v; break;
        case 'teapot': m.teapot = v; break;
        case 'perfectLockWidth': m.perfectLockWidth = true; break;
        case 'resume': m.resume = true; break;
        case 'curse': // 先苦后甜：惩罚立即生效，杯数耗尽后移除并发放奖励
          this.applyFxMap(v.pen, 1);
          this.curses.push({ left: v.cups, pen: v.pen, reward: v.reward, name: opt.name });
          break;
      }
    }
    // 人生选择不再改变段位/瓶子：任何加分最多顶到下一段门槛前，段位只能靠倒水来升
    if (this.tierIdx + 1 < Cups.TIERS.length) {
      var capScore = Cups.TIERS[this.tierIdx + 1].score - 1;
      if (this.score > capScore) this.score = capScore;
    }
    this.tierIdx = Cups.tierFor(this.score);
    // 非换杯类选项且段位未变：下一杯继续用当前杯（杯子不该因为无关选择而变化）
    this._keepCup = !affectsCup && this.tierIdx === tierBefore;
    // 记入「已做选择」
    this.chosenList.push({ name: opt.name + (opt.tierDraw ? ' ◆' : ''), desc: opt.desc, cat: opt.cat });
    this.toast('「' + opt.name + '」已生效');
    this.pendingChoice = null;
    this.pendingTierFx = null;
    if (this.choiceIsOpening) { this.choiceIsOpening = false; this._noIncRound = true; } // 开局天赋：仍是第 1 杯
    this.newRound();
  };

  // 通用修正表套用/撤销（先苦后甜的惩罚与奖励用）：sign=1 套用，-1 撤销
  Game.prototype.applyFxMap = function (fx, sign) {
    var m = this.mods;
    for (var k in fx) {
      var v = fx[k];
      if (k === 'perfectScale' || k === 'completeScale' || k === 'pourRateScale' || k === 'scoreMult') {
        m[k] *= sign > 0 ? v : 1 / v;
      } else if (k === 'cupBonus' || k === 'perfectBonus' || k === 'comboBonus') {
        m[k] += sign * v;
      }
    }
  };

  // 每杯判定后推进先苦后甜：杯数耗尽 → 撤销惩罚、发放奖励
  Game.prototype.tickCurses = function () {
    for (var i = this.curses.length - 1; i >= 0; i--) {
      var c = this.curses[i];
      c.left--;
      if (c.left <= 0) {
        this.applyFxMap(c.pen, -1);
        this.applyFxMap(c.reward, 1);
        this.curses.splice(i, 1);
        this.toast('苦尽甘来：「' + c.name + '」的回甘到了');
      }
    }
  };

  // 段位之力抽屉：随机抽一个段位 → 从该段位效果池随机 1 条直接生效，
  // 30% 概率抽出 2 条进入二选一（choice2 相位，由 drawChoice2 展示）
  Game.prototype.applyTierDraw = function (opt, fx0) {
    this.usedChoiceIds[opt.id] = true;
    var self = this;
    var idxs = fx0.tierPickNext
      ? [Math.min(this.tierIdx + 1, Cups.TIERS.length - 1)]
      : (fx0.tierPick || []).slice();
    idxs = idxs.filter(function (i) { return Choices.TIER_FX[i] && Choices.TIER_FX[i].length; });
    if (!idxs.length) { this.pendingChoice = null; this.newRound(); return; }
    var tIdx = idxs[Math.floor(Math.random() * idxs.length)];
    var pool = Choices.TIER_FX[tIdx].filter(function (f) { return !self.usedChoiceIds[f.id]; });
    if (!pool.length) pool = Choices.TIER_FX[tIdx];
    var bag = pool.slice();
    for (var i = bag.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1)), t = bag[i]; bag[i] = bag[j]; bag[j] = t;
    }
    var n = Math.min(bag.length, Math.random() < 0.3 ? 2 : 1);
    var tierName = Cups.TIERS[tIdx].name;
    var picks = bag.slice(0, n).map(function (f) {
      return { id: f.id, cat: 'D', name: f.name, desc: f.desc, flavor: tierName + '之力注入了这一杯。', fx: f.fx };
    });
    if (picks.length === 1) {
      this.chosenList.push({ name: opt.name + ' ◆', desc: '抽中' + tierName + '之力 · ' + picks[0].name, cat: 'D' });
      this.toast('抽到' + tierName + '之力');
      this.applyChoice(picks[0]);
    } else {
      this.pendingTierFx = picks;
      this.phase = 'choice2';
      this.choiceOpenT = this.time; // 1 秒误触保护
      this.chosenList.push({ name: opt.name + ' ◆', desc: '抽中' + tierName + '之力（二选一）', cat: 'D' });
      this.toast('抽到' + tierName + '之力：二选一');
    }
  };

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
    // 主界面三个按钮（商城暂时隐藏，避免备案/审核期误会）
    var r = Math.min(W * 0.095, 46);
    var gap = W / 4;
    var by = H * 0.86;
    this.menuButtons = [
      { key: 'share', label: '分享', color: '#4CC36A', x: gap * 1, y: by, r: r },
      { key: 'rank', label: '排名', color: '#5B8DEF', x: gap * 2, y: by, r: r },
      { key: 'settings', label: '设置', color: '#9B7FD4', x: gap * 3, y: by, r: r }
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
    if (this.env.onTouchMove) this.env.onTouchMove(function (x, y) { self.onMove(x, y); });
    if (this.env.onInterrupt) this.env.onInterrupt(function () { self.onInterrupt(); });
  };

  // 切后台/来电/触摸被取消：撤销进行中的按压，避免回来时仍在倒水导致误判失败
  Game.prototype.onInterrupt = function () {
    if (this.state !== 'play' || this.phase !== 'press') return;
    this.pressing = false;
    if (this.reverseCups > 0) this.angle = 0; // 反转自倒模式：同时收角度暂停出水
    this.usedPress = false;
    this.phase = 'aim';
    this.toast('已暂停，再按继续');
  };

  // 拖动（「已做选择」面板列表滚动）
  Game.prototype.onMove = function (x, y) {
    if (this.choiceListOpen && this._listDrag) {
      var P = this._listPanel || {};
      var maxS = P.maxScroll || 0;
      this.listScroll = Math.max(0, Math.min(maxS, this._listDrag.scroll + (this._listDrag.y - y)));
    }
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
      // 「已做选择」面板打开时：只响应面板操作（关闭/拖动列表），不触发倒水
      if (this.choiceListOpen) {
        var P = this._listPanel || {};
        if (P.close && x >= P.close.x && x <= P.close.x + P.close.w && y >= P.close.y && y <= P.close.y + P.close.h) {
          this.choiceListOpen = false;
          return;
        }
        if (P.list && x >= P.list.x && x <= P.list.x + P.list.w && y >= P.list.y && y <= P.list.y + P.list.h) {
          this._listDrag = { y: y, scroll: this.listScroll };
        }
        return;
      }
      // 右下角「已做选择」按钮（抽卡界面也可点开，便于基于已做选择做决策）
      var cb = this.choicesBtnRect();
      if (x >= cb.x && x <= cb.x + cb.w && y >= cb.y && y <= cb.y + cb.h) {
        this.choiceListOpen = true;
        this._listDrag = null;
        return;
      }
      // 悔棋面板：重来一杯 / 接受结局（面板打开时吞掉其它点击）
      if (this.phase === 'lastChance') {
        var lcs = this.lastChanceRects || [];
        for (var li = 0; li < lcs.length; li++) {
          var lr = lcs[li];
          if (x >= lr.x && x <= lr.x + lr.w && y >= lr.y && y <= lr.y + lr.h) {
            if (lr.key === 'redo') this.redoCup();
            else { this.redoLeft = 0; this.finalizeFail(this.failReason); }
            return;
          }
        }
        return;
      }
      // 人生选择：点选三张卡之一（弹出 1 秒内不响应，防误触）
      if (this.phase === 'choice') {
        if (this.time - this.choiceOpenT < 1) return;
        var rs = this.choiceRects || [];
        for (var ci = 0; ci < rs.length; ci++) {
          var r = rs[ci];
          if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) { this.applyChoice(r.opt); return; }
        }
        return;
      }
      // 段位之力二选一：点选两张效果卡之一（同样 1 秒误触保护）
      if (this.phase === 'choice2') {
        if (this.time - this.choiceOpenT < 1) return;
        var rs2 = this.choice2Rects || [];
        for (var cj = 0; cj < rs2.length; cj++) {
          var r2 = rs2[cj];
          if (x >= r2.x && x <= r2.x + r2.w && y >= r2.y && y <= r2.y + r2.h) { this.applyChoice(r2.opt); return; }
        }
        return;
      }
      // 反其道而行：水流自倒中，点按定格判定
      if (this.phase === 'press' && this.reverseCups > 0) {
        if (!this.reverseLock && this.level > 0.01) {
          this.reverseLock = true;
          this.pressing = false;
          this.phase = 'settle';
          this.phaseTimer = 0.35;
        }
        return;
      }
      // 快慢自如：按住中再点 → 切换慢速
      if (this.phase === 'press' && this.slowTapCharges > 0 && !this.slowTapOn) {
        this.slowTapOn = true;
        this.slowTapCharges--;
        this.toast('慢速模式');
        return;
      }
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
    this._listDrag = null;
    // 反转模式：松手不触发判定（定格由点按完成）
    if (this.state === 'play' && this.reverseCups > 0 && !this.reverseLock) return;
    if (this.state === 'play' && this.phase === 'press') {
      this.pressing = false;
      // 误触保护：按压不足 0.06s 视为误碰，撤销本次按压（高压考核选项可关闭保护）
      if (this.mods.tapProtect && this.time - this.pressStart < 0.06) {
        this.usedPress = false;
        this.phase = 'aim';
        this.angle = 0;
        return;
      }
      this.phase = 'settle';
      this.phaseTimer = 0.35;
      // 学饮过渡：松手后不判定，回到待按状态可续倒一次
      if (this.mods.resume && this.resumeLeft > 0) {
        this.resumeLeft--;
        this.usedPress = false;
        this.phase = 'aim';
        this.toast('歇一口，再按继续倒');
      }
    }
  };

  Game.prototype.handleMenuButton = function (key) {
    if (key === 'share') {
      this.env.share('这一杯敬给自己：从小孩倒奶到老人喝奶，看你倒到哪一段！');
      this.toast('已发起分享');
      return;
    }
    this.overlay = key;
    if (key === 'rank' && this.env.showRank) this.env.showRank(this.rankContentRect());
  };

  // 排行榜内容区（drawOverlay 面板内部），主屏与开放数据域共用同一几何
  Game.prototype.rankContentRect = function () {
    var W = this.W, H = this.H;
    var px = W * 0.1, py = H * 0.28, pw = W * 0.8, ph = H * 0.34;
    return { x: px + W * 0.05, y: py + H * 0.085, w: pw - W * 0.10, h: ph - H * 0.135 };
  };

  Game.prototype.handleOverlayTap = function (x, y) {
    var c = this.overlayClose;
    if (x >= c.x && x <= c.x + c.w && y >= c.y && y <= c.y + c.h) {
      this.overlay = null;
      if (this.env.hideRank) this.env.hideRank();
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
      this.env.share('我在「这一杯敬给自己」倒了 ' + this.score + ' 分，你敢来挑战吗？');
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
    this.resetMods();          // 跨局不继承人生选择
    this.easyTierFor = -1;
    this.nextCupPre = null;
    if (this.best > 0 && this.env.uploadScore) this.env.uploadScore(this.best); // 兜底上报历史最高（幂等）
    this.newRound();
    // 开局天赋三选一（出生前的选择）：只从通用选项抽；选完不跳杯，仍是第 1 杯
    this.choiceIsOpening = true;
    this.pendingChoice = this.rollChoices(true);
    if (this.pendingChoice) {
      this.phase = 'choice';
      this.choiceOpenT = this.time; // 1 秒误触保护
    } else {
      this.choiceIsOpening = false; // 通用池枯竭的极端兜底：直接开局
    }
  };

  Game.prototype.newRound = function () {
    if (this._noIncRound) this._noIncRound = false; // 开局天赋选完不跳杯
    else this.round++;
    var tier = Cups.TIERS[this.tierIdx];
    this.tier = tier; // 当前段位（倒水速度等按段位配置取值）
    // 杯型选择：人生选择后的保杯（选项未涉及杯型且段位未变时沿用当前杯），
    // 否则预抽（记账习惯预告）或现抽，含轻装上阵/降维打击/梦中情杯等修正
    var keepCup = this._keepCup && this.cup;
    this._keepCup = false;
    var cup;
    if (keepCup) {
      cup = this.cup;
    } else {
      cup = this.nextCupPre || this.pickCup();
      var guard = 0;
      while (this.lastCup && cup.name === this.lastCup.name && guard++ < 6) {
        cup = this.pickCup();
      }
      // 预抽下一杯（预告显示用；不与本杯重复）
      this.nextCupPre = this.pickCup();
      var g2 = 0;
      while (this.nextCupPre && this.nextCupPre.name === cup.name && g2++ < 6) {
        this.nextCupPre = this.pickCup();
      }
    }
    this.cup = cup;
    this.lastCup = cup;
    // 计数型效果随杯消耗（本杯已生效一次）
    if (this.rushCups > 0) this.rushCups--;
    if (this.onlyPerfectCups > 0) this.onlyPerfectCups--;
    if (this.straightCups > 0) this.straightCups--;
    if (this.doubleCups > 0) this.doubleCups--;
    this.slowTapOn = false;
    this.reverseLock = false;
    // v2 每杯状态重置
    this.roundStartT = this.time;                      // 区域脉冲/衰减计时起点
    this.cushionArmed = this.mods.zoneCushion > 0;     // 气泡垫：本杯一次进区缓冲
    this.resumeLeft = this.mods.resume ? 1 : 0;        // 学饮过渡：本杯一次断点续倒
    this.slowStartOn = !!this.slowStartArm;            // 回甘：上杯完美 → 本杯前 1 秒减速
    this.slowStartArm = false;
    this.graceArmed = this.graceTier >= 0 && this.graceTier === this.tierIdx; // 跳槽窗口期
    // 错位竞争：目标区每杯随机平移
    this.zoneShiftRound = this.mods.zoneRandom ? (Math.random() - 0.5) * 0.12 : 0;
    // 目标区随机生成：合格区落在杯高 20%~100% 内的随机位置，宽度 0.24~0.36 随机；
    // 完美区贴合格区顶部、宽为其 1/3（与杯库统一难度规则一致）
    var rqw = 0.24 + Math.random() * 0.12;
    var rqLo = 0.20 + Math.random() * Math.max(0.01, 0.985 - rqw - 0.20);
    var rpW = rqw / 3;
    this.zoneBase = { q: [rqLo, rqLo + rqw], p: [rqLo + rqw - rpW, rqLo + rqw] };
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
    // 人生选择修正：断奶第一课(高瘦)/一口干(小)/田忌赛马(宽窄互换)/大开大合(差异翻倍)
    var m = this.mods;
    var aspect = this.cup.aspect * m.cupAspectMul;
    if (m.invertCups) aspect *= Math.max(0.7, Math.min(1.5, 1.4 / this.cup.aspect));
    var size = (this.cup.size || 1) * m.cupSizeMul;
    if (m.sizeVariance) size *= 0.7 + Math.random() * 0.7;
    var cupH = this.H * 0.28 * size;
    var halfW = cupH / (2 * aspect);
    var maxHalf = this.W * 0.33; // 宽杯型需要更宽的舞台（原 0.27 会把宽碗压成小杯）
    if (halfW > maxHalf) { halfW = maxHalf; cupH = halfW * 2 * aspect; }
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

    // 汽水洗杯：杯内残留上杯 10% 水位（占用容量）
    this.level = (this.mods.residue > 0 && this.prevLevel > 0)
      ? Math.min(0.95, this.prevLevel * this.mods.residue) : 0;
    this.poured = 0;
    this.angle = 0;
    this.pressing = false;
    this.usedPress = false;
    this.phase = 'aim';
    this.failReason = '';
    this.roundFade = 0; // 新杯淡入过渡进度（update 中推进到 1）
    // 悔棋快照：本杯开始前的分数/连击（重来一杯回滚用）
    this.preCup = { score: this.score, streak: this.perfectStreak };

    // 反其道而行：水流自倒（满倾角待机），点按定格；计数消耗在判定后
    if (this.reverseCups > 0) {
      this.phase = 'press';
      this.usedPress = true;
      this.pressStart = this.time;
      this.angle = this.T.MAX_TILT;
    }
  };

  Game.prototype.win = function (basePts, label) {
    var m = this.mods;
    if (this.reverseCups > 0) this.reverseCups--; // 反转模式消耗一杯
    if (this.graceArmed) this.graceArmed = false; // 跳槽窗口期：新段第一杯已平安落地
    var sg2 = this.streakGain2Left > 0;           // 整层楼一起：完美计 2 连（限杯数）
    if (this.streakGain2Left > 0) this.streakGain2Left--;
    // 连完美加分：完美 2 分，2 连 3 分，3 连起 4 分（天赐良机可提至 5 分）；非完美/失败断连
    var pts = basePts;
    if (basePts === 2) {
      this.perfectStreak += sg2 ? Math.max(m.streakGain, 2) : m.streakGain; // 深夜改稿：一次计 2 连
      pts = 2 + Math.min(this.perfectStreak - 1, m.comboCap - 2) + m.comboBonus;
      if (m.perfectDouble || this.onlyPerfectCups > 0) pts *= 2; // 精准强迫症 / 孤注一掷
      if (m.foamCup) this.foamLayers++; // 挂杯：完美挂一层泡沫
      if (m.nextCupBoost > 1) this.boostLeft = 1.2; // 摇过的汽水：下一杯初速加成
      if (m.afterPerfectSlow) this.slowStartArm = true; // 回甘：下一杯前 1 秒减速
      if (this.perfectStreak >= 2) label = this.perfectStreak + '连完美!';
      if (this.perfectStreak > this.bestStreakRun) this.bestStreakRun = this.perfectStreak;
    } else {
      // 断连判定：伯乐相马不断；私教课消耗连击保护
      if (!m.comboNeverBreak) {
        if (m.comboProtect > 0 && this.perfectStreak > 0) { m.comboProtect--; this.toast('连击保护 −1'); }
        else this.perfectStreak = 0;
      }
      if (m.foamCup && this.foamLayers > 0) { this.foamLayers = 0; this.toast('泡沫全脱落了'); } // 挂杯：非完美脱落
    }
    // 周报模板：连续同结果计数
    var resType = basePts === 2 ? 'P' : 'C';
    if (resType === this.sameType) this.sameN++; else { this.sameType = resType; this.sameN = 1; }
    if (this.onlyPerfectCups > 0 && basePts < 2) {
      pts = 0; // 孤注一掷：非完美不得分
      label = '只差一步';
    } else {
      pts += m.cupBonus;
      if (basePts === 2) pts += m.perfectBonus;
      if (this.rushCups > 0) pts += 2; // 极限冲刺
      if (m.streakMin3 > 0 && this.perfectStreak >= 3) pts += m.streakMin3; // 学长传位
      if (m.foamCup && this.foamLayers > 0) pts += this.foamLayers; // 挂杯：每层 +1
      if (m.sameStreak3 > 0 && this.sameN > 0 && this.sameN % 3 === 0) { // 周报模板
        pts += m.sameStreak3;
        this.floats.push({ text: '周报模板 +' + m.sameStreak3, x: this.W / 2, y: this.H * 0.3, life: 1.4, color: '#2EA85C', size: 0.03 });
      }
      if (m.toastTarget && this.toastLevel > 0 && Math.abs(this.level - this.toastLevel) <= 0.03) { // 碰杯约定
        pts += 3;
        this.floats.push({ text: '碰杯约定 +3', x: this.W / 2, y: this.H * 0.26, life: 1.4, color: '#B07A12', size: 0.03 });
      }
      if (this.doubleCups > 0) pts *= 2; // 一夜爆红
      pts = Math.round(pts * m.scoreMult); // 创业初期 / 重启人生
      for (var ei = 0; ei < this.everyNs.length; ei++) { // 定期存款/稳定工作/双线作战/拍嗝手法/考证大军
        var en = this.everyNs[ei];
        if (this.round % en.n === 0) pts += en.pts;
      }
      if (m.bank) { // 复利账户：先生息，再把本杯得分 50% 存入
        this.bankBal *= (1 + m.bank.interest);
        var dep = Math.round(pts * m.bank.rate);
        pts -= dep;
        this.bankBal += dep;
      }
    }
    this.score += pts;
    if (m.equity) this.equityBal += 1; // 股权池：每杯 1 股，结算 ×3 兑现
    if (m.fund) this.fundBal += 1;     // 退路基金：每杯存 1
    if (m.teapot && !this.teapotOn) {  // 茶宠：连续不失败养成
      this.teapotN++;
      if (this.teapotN >= m.teapot.need) {
        this.teapotOn = true;
        m.cupBonus += m.teapot.bonus;
        this.toast('茶宠养成了！之后每杯 +' + m.teapot.bonus);
      }
    }
    this.totalCups++;
    this.env.setStorage('totalCups', String(this.totalCups));
    // 本局得分 → 段位/阶晋升检测（失败后重开即从 0 段倒奶重来）
    this.totalScore += pts;
    this.env.setStorage('totalScore', String(this.totalScore));
    // 退而不休：锁定当前段位，分数顶到下一段门槛前
    if (m.lockTier && this.tierIdx + 1 < Cups.TIERS.length) {
      var cap = Cups.TIERS[this.tierIdx + 1].score - 1;
      if (this.score > cap) this.score = cap;
    }
    var prevRank = Cups.rankFor(this.score - pts);
    var newRank = Cups.rankFor(this.score);
    var newTier = newRank.tierIdx;
    var didTierUp = newTier > this.tierIdx;
    var didStageUp = !didTierUp && newRank.stageIdx > prevRank.stageIdx;
    if (didTierUp || didStageUp) {
      if (m.stageUpBonus > 0) { // 按时还贷：升阶/升段额外加分
        this.score += m.stageUpBonus;
        newRank = Cups.rankFor(this.score);
        newTier = newRank.tierIdx;
      }
    }
    if (didTierUp || didStageUp) this.rankPulseT = 0.6; // 阶段标签放大回弹
    if (didTierUp) {
      this.tierIdx = newTier;
      // 复利账户：升段时取出全部本息
      if (m.bank && this.bankBal > 0) {
        var cashIn = Math.round(this.bankBal);
        this.bankBal = 0;
        this.score += cashIn;
        newRank = Cups.rankFor(this.score);
        newTier = newRank.tierIdx;
        this.tierIdx = newTier;
        this.floats.push({ text: '复利到账 +' + cashIn, x: this.W / 2, y: this.hudShift() + this.H * 0.31, life: 1.8, color: '#B07A12' });
      }
      var t = Cups.TIERS[newTier];
      this.floats.push({ text: '成长！' + newRank.label, x: this.W / 2, y: this.hudShift() + this.H * 0.265, life: 1.8, color: PAL.INK });
      this.toast(t.line);
      if (this.vibrateOn) this.env.vibrate();
    } else if (didStageUp) {
      // 段内进阶：同段位饮品/容器不变，只弹进步提示
      this.floats.push({ text: '进步！' + newRank.label, x: this.W / 2, y: this.hudShift() + this.H * 0.265, life: 1.5, color: PAL.INK });
    }
    // 人生选择：升段/升阶后触发三选一（选完再进入下一杯）
    if (didTierUp || didStageUp) {
      this.pendingChoice = this.rollChoices();
      this.choiceIsOpening = false; // 晋升抽卡覆盖开局天赋（实际对局不会同时发生，防御测试直调）
    }
    // 示意图：+N 绿色/橙色大字居中于杯上方，连击/评价黑色小字紧随其下
    var ptsY = this.cupTop - this.H * 0.10;
    this.floats.push({ text: '+' + pts, x: this.W / 2, y: ptsY, life: 1.4, color: basePts === 2 ? '#2EA85C' : '#E0861A', size: 0.042 });
    this.floats.push({ text: label, x: this.W / 2, y: ptsY + this.H * 0.042, life: 1.4, color: PAL.INK, size: 0.024 });
    // 完美彩蛋文案：升段/进阶回合已展示晋升提示，不再叠完美提示
    if (basePts === 2 && !didTierUp && !didStageUp) this.toast(Cups.randomLine(Cups.TIERS[this.tierIdx].key));
    this.tickCurses(); // 先苦后甜：本杯计入惩罚杯数
    this.phase = 'next';
    // 先原样停留看清结果（最后 0.18s 淡出）；有人生路口待选时多停 0.5s，让阶段提升的放大回弹/浮字先展示完
    this.phaseTimer = this.pendingChoice ? 0.98 : 0.48;
  };

  Game.prototype.fail = function (reason) {
    this.perfectStreak = 0;
    this.prevLevel = this.level; // 汽水洗杯：溢出失败也记下最终水位
    var m = this.mods;
    if (m.foamCup && this.foamLayers > 0) this.foamLayers = 0; // 挂杯：失败泡沫全脱落
    // 日更写作：失败额外扣分（不会因此掉段——段位只随倒水前进）
    if (m.failPenalty > 0) {
      var floor = Cups.TIERS[this.tierIdx].score;
      this.score = Math.max(floor, this.score - m.failPenalty);
      this.floats.push({ text: '-' + m.failPenalty, x: this.W / 2, y: this.cupTop - this.H * 0.10, life: 1.2, color: '#C0392B', size: 0.036 });
    }
    // 体检报告正常 / 贵人相助：失败保护，原地续杯
    if (m.failProtect > 0) {
      m.failProtect--;
      this.toast('失败保护：原地续命（剩 ' + m.failProtect + ' 次）');
      this.failReason = '';
      this.phase = 'next';
      this.phaseTimer = 0.6;
      if (this.vibrateOn) this.env.vibrate();
      this.tickCurses();
      return;
    }
    // 退路基金：攒够 10 自动抵一次失败
    if (m.fund && this.fundBal >= 10) {
      this.fundBal -= 10;
      this.toast('退路基金 −10：替你挡下这次失败');
      this.failReason = '';
      this.phase = 'next';
      this.phaseTimer = 0.6;
      if (this.vibrateOn) this.env.vibrate();
      this.tickCurses();
      return;
    }
    // 跳槽窗口期：新段位第一杯不计失败，按完成计
    if (this.graceArmed) {
      this.graceArmed = false;
      this.toast('跳槽窗口期：第一杯有惊无险');
      this.win(1, '有惊无险！');
      return;
    }
    // 重来一杯：还有悔棋次数时，进入选择面板而非直接结算
    if (this.redoLeft > 0) {
      this.failReason = reason;
      this.phase = 'lastChance';
      if (this.vibrateOn) this.env.vibrate();
      return;
    }
    this.finalizeFail(reason);
  };

  // 真正的结算：股权池兑现 → 落幕 → 更新最高分
  Game.prototype.finalizeFail = function (reason) {
    this.failReason = reason;
    if (this.mods.equity && this.equityBal > 0) {
      var cash = this.equityBal * 3;
      this.equityBal = 0;
      this.score += cash;
      this.toast('股权池兑现 +' + cash);
    }
    this.phase = 'failed';
    this.phaseTimer = 0.9;
    if (this.vibrateOn) this.env.vibrate();
    if (this.score > this.best) {
      this.best = this.score;
      this.newRecord = true;
      this.env.setStorage('best', String(this.best));
      if (this.env.uploadScore) this.env.uploadScore(this.best); // 新纪录上报微信好友排行
    }
  };

  // 悔棋「重来一杯」：回滚本杯得分/连击，用同一只杯子重倒
  Game.prototype.redoCup = function () {
    this.redoLeft--;
    if (this.preCup) {
      this.score = this.preCup.score;
      this.perfectStreak = this.preCup.streak;
    }
    this._keepCup = true;
    this.failReason = '';
    this.toast('重来一杯（剩 ' + this.redoLeft + ' 次）');
    this.newRound();
  };

  Game.prototype.judge = function () {
    var z = this.effZones(), f = this.level, m = this.mods;
    this.prevLevel = this.level; // 汽水洗杯：记下本杯最终水位
    if (f >= z.p[0] && f <= z.p[1]) { this.win(2, '完美!'); return; }
    // 无心插柳：轻微超完美线也算完美
    if (m.overflowToPerfect > 0 && f > z.p[1] && f <= z.p[1] + m.overflowToPerfect) { this.win(2, '完美!'); return; }
    // 背水一战：完成区关闭，只有完美才得分
    if (!m.noCompleteZone && f >= z.q[0] && f <= z.q[1]) { this.win(1, '不错!'); return; }
    // 老狗陪伴：每局首次轻微超线记为完成
    if (m.overflowForgive && !this.forgiveUsed && f > z.q[1] && f <= z.q[1] + 0.06) {
      this.forgiveUsed = true;
      this.toast('老狗帮你挡了一下');
      this.win(1, '不错!');
      return;
    }
    this.fail(f < z.q[0] ? '倒得太少啦' : '倒得太满啦');
  };

  Game.prototype.toast = function (text) {
    this.toasts.push({ text: text, life: 2.1 }); // 显示时长 1.6 + 0.5
    if (this.toasts.length > 2) this.toasts.shift();
  };

  // ---------------- 更新 ----------------
  Game.prototype.update = function (dt) {
    this.time += dt;
    if (this.roundFade < 1) this.roundFade = Math.min(1, this.roundFade + dt / 0.22); // 新杯淡入
    if (this.rankPulseT > 0) this.rankPulseT -= dt; // 阶段提升放大回弹

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
      // 无糖可乐：气泡翻倍变大，遮挡视线
      var boost = this.mods.bubbleBoost;
      if (Math.random() < dt * (boost ? 26 : 11)) {
        var bt = 0.04 + Math.random() * Math.max(0.01, Math.min(this.level, 1) - 0.06);
        var bw2 = this.halfW * this.cup.profile(bt) * 0.8;
        this.bubb.push({ x: this.cx + (Math.random() * 2 - 1) * bw2, y: this.baseY - bt * this.cupH,
          r: (1 + Math.random() * 2.2) * (boost ? 1.6 : 1), vy: 22 + Math.random() * 30 });
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
    } else if (this.phase === 'settle' || this.phase === 'next' || this.phase === 'failed' || this.phase === 'lastChance') {
      this.angle = Math.max(this.angle - T.RETURN_SPEED * dt, 0);
    }

    if (pouring && (this.phase === 'press')) {
      // 窄处水位上升更快：横截面积 ∝ 宽度²，故 df/dt ∝ (平均宽度/当前宽度)²
      // 宽肚杯底部慢、收口处猛冲；收腰杯过腰突然加速 —— 每种杯型手感都不同
      // 流速随倾角温和加速：等得越久倒得越快，贪高分就要冒超出的风险
      // 单局内每成功一杯流速轻微提升，无尽模式不能无限刷分
      var m = this.mods;
      var tiltFrac = (this.angle - T.POUR_THRESHOLD) / (T.MAX_TILT - T.POUR_THRESHOLD);
      var ramp = 1 + Math.min(this.round - 1, T.RATE_RAMP_CAP / T.RATE_RAMP) * T.RATE_RAMP;
      var wNow = Math.max(0.12, this.cup.profile(Math.min(this.level, 0.999)));
      var wr = this.cupAvgW / wNow;
      var baseRate = (this.tier && this.tier.pourRate) || T.POUR_RATE;
      // 人生选择流速修正：基础倍率 × 极限冲刺 × 慢速模式 × 时间复利（前快后慢）
      var rateMul = m.pourRateScale;
      if (this.rushCups > 0) rateMul *= 1.3;
      if (this.slowTapOn) rateMul *= 0.4;
      if (m.timeSlow) rateMul *= Math.max(0.4, 1.5 - (this.time - this.pressStart) * 0.8);
      // 摇过的汽水：上杯完美 → 本杯初速 +40%，随时间衰减回 1
      if (this.boostLeft > 0 && m.nextCupBoost > 1) {
        rateMul *= 1 + (m.nextCupBoost - 1) * Math.max(0, this.boostLeft / 1.2);
        this.boostLeft -= dt;
      }
      // 回甘：本杯前 1 秒出水 −20%
      if (this.slowStartOn && m.afterPerfectSlow &&
          (this.time - this.pressStart) < m.afterPerfectSlow.dur) {
        rateMul *= m.afterPerfectSlow.scale;
      }
      // 气泡垫：水位进入目标区后出水减半（每杯一次，出区即消耗）
      if (this.cushionArmed && m.zoneCushion > 0) {
        var cz = this.effZones();
        if (this.level >= cz.q[0] && this.level <= cz.q[1]) rateMul *= (1 - m.zoneCushion);
        else if (this.level > cz.q[1]) this.cushionArmed = false;
      }
      var df = baseRate * ramp * rateMul * (1 + T.RATE_ACCEL * tiltFrac) * wr * wr * dt;
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
      if (this.phaseTimer <= 0) {
        // 有人生选择待选：进入抽卡相位（冻结，等待点选；1 秒误触保护）
        if (this.pendingChoice) { this.phase = 'choice'; this.choiceOpenT = this.time; }
        else this.newRound();
      }
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
    // 出水点局部偏移：通用水桶贴图的支点就在壶嘴尖（0,0）；
    // 矢量兜底瓶支点在瓶身右下角，壶嘴沿在瓶身右上角（-6, -瓶高+14）
    var lx = 0, ly = 0;
    if (!(this.assets.bucket && this.assets.bucket.ready)) {
      lx = -6; ly = -this.bucketH + 14;
    }
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
      // 换杯过渡：纯淡入淡出——先停留 0.3s 看清结果，旧杯再用 0.18s 淡出，新杯 0.22s 淡入
      var fr;
      if (this.state === 'play' && this.phase === 'next') fr = Math.min(1, Math.max(0, this.phaseTimer / 0.18));
      else if (this.state === 'play') fr = this.roundFade != null ? this.roundFade : 1;
      else fr = 1;
      ctx.save();
      ctx.globalAlpha = fr;
      this.drawCup();
      this.drawBucket();
      ctx.restore();
      this.drawStream();
      this.drawParticles();
      this.drawScoreHUD();
      this.drawDrinkTag();
      this.drawFloats();
      if (this.state === 'play' && this.phase === 'aim') this.drawAimHint();
      if (this.state === 'over') this.drawOver();
    }
    this.drawToasts();
    // 人生选择三选一（局内最顶层，半透压暗背景）
    if (this.state === 'play' && this.phase === 'choice') this.drawChoice();
    if (this.state === 'play' && this.phase === 'choice2') this.drawChoice2();
    if (this.state === 'play' && this.phase === 'lastChance') this.drawLastChance();
    if (this.state === 'play') this.drawChoicesBtn(); // 「已做选择」按钮常显（含抽卡界面，便于决策参考）
    if (this.state === 'play' && this.choiceListOpen) this.drawChoicesList();
  };

  // 右侧「已做选择」按钮热区（桌面上沿，避开底部操作提示）
  Game.prototype.choicesBtnRect = function () {
    var w = this.W * 0.26, h = this.H * 0.05;
    return { x: this.W * 0.97 - w, y: this.H * 0.795, w: w, h: h };
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
    var ctx = this.ctx, cup = this.cup, z = this.effZones();
    // 每杯装饰配置（缺省 = 全局默认外观）
    var deco = cup.deco || {};
    var wallC = deco.wall || PAL.INK;                       // 杯壁描边色
    var wallW = deco.wallW != null ? deco.wallW : 4.5;      // 杯壁描边粗细
    var glassA = deco.glass != null ? deco.glass : 0.45;    // 玻璃体透明度（0 = 无玻璃填充）
    var dashOn = deco.dash !== false;                       // 合格区分隔虚线
    var ticks = deco.ticks | 0;                             // 内壁刻度线数量（0 = 无）
    var handleOn = !!deco.handle;                           // 右侧杯把
    if (this.mods.hideMarks) { ticks = 0; dashOn = false; } // 闭关修炼：隐藏刻度

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
    // 按杯壁轮廓描带填充，不依赖 clip（微信端 clip 可能失效导致色带溢出杯壁）
    ctx.save();
    this.traceCup(0.04);
    ctx.clip();
    var h = this.cupH;
    var band = function (t0, t1, color) {
      if (t1 <= t0) return;
      var BN = 16, bi, bt, bw2, by;
      ctx.beginPath();
      for (bi = 0; bi <= BN; bi++) {
        bt = t0 + (t1 - t0) * bi / BN;
        bw2 = this.halfW * cup.profile(bt) * 0.96;
        by = this.baseY - bt * h;
        if (bi === 0) ctx.moveTo(this.cx - bw2, by); else ctx.lineTo(this.cx - bw2, by);
      }
      for (bi = BN; bi >= 0; bi--) {
        bt = t0 + (t1 - t0) * bi / BN;
        bw2 = this.halfW * cup.profile(bt) * 0.96;
        by = this.baseY - bt * h;
        ctx.lineTo(this.cx + bw2, by);
      }
      ctx.closePath();
      ctx.fillStyle = color;
      ctx.fill();
    }.bind(this);
    band(0, 1, 'rgba(43,42,38,0.06)');            // 不合格区（整杯灰底）
    if (!this.mods.noCompleteZone) band(z.q[0], z.q[1], 'rgba(242,201,76,0.45)'); // 合格区（背水一战时关闭）
    band(z.p[0], z.p[1], 'rgba(190,222,150,0.80)'); // 完美区（柔和绿）

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
      // 材质：顶部饮品本色 → 底部深色，纵向渐变出体积感；透明度按饮品（玉露清透、牛奶醇厚）
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
      // 碳酸气泡：液体内上浮的小气泡圈（可乐/麦芽），颜色比液体亮一截
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
      // 麦芽泡沫层：沿波动液面盖一条奶油色泡沫
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
    // 挂杯：每次完美在杯壁挂一层泡沫（液面上方依次叠加；非完美全部脱落）
    if (this.mods.foamCup && this.foamLayers > 0) {
      var f0 = Math.min(this.level, 1);
      ctx.strokeStyle = 'rgba(255,246,224,0.95)';
      ctx.lineCap = 'round';
      ctx.lineWidth = 5;
      for (var fli = 0; fli < Math.min(this.foamLayers, 8); fli++) {
        var ft = Math.min(0.97, f0 + 0.035 + fli * 0.035);
        var fw3 = this.halfW * cup.profile(ft) * 0.9;
        var fy3 = this.baseY - ft * h;
        ctx.beginPath();
        ctx.moveTo(this.cx - fw3, fy3);
        ctx.lineTo(this.cx + fw3, fy3);
        ctx.stroke();
      }
      ctx.lineCap = 'butt';
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

    // 杯把（右侧方 D 形马克杯柄：外侧直边+圆角；对象形式可自定义附着位置 t1/t2 与外扩幅度 out）
    if (handleOn && !useSpr) {
      var hcfg = typeof deco.handle === 'object' && deco.handle ? deco.handle : {};
      var ht1 = hcfg.t1 != null ? hcfg.t1 : 0.82;   // 上附着点（杯高比例）
      var ht2 = hcfg.t2 != null ? hcfg.t2 : 0.45;   // 下附着点
      var hOut = this.halfW * (hcfg.out != null ? hcfg.out : 0.62); // 外扩幅度
      var hw1 = this.halfW * cup.profile(ht1), hw2 = this.halfW * cup.profile(ht2);
      var hy1 = this.baseY - ht1 * this.cupH, hy2 = this.baseY - ht2 * this.cupH;
      var hTh = Math.max(wallW * 2.2, (hy2 - hy1) * 0.30);          // 柄厚
      var xA1 = this.cx + hw1 - 2, xA2 = this.cx + hw2 - 2;         // 上下附着点
      var xL = this.cx + Math.max(hw1, hw2) - 2;                    // 内孔左缘（贴杯壁）
      var xOut = this.cx + Math.max(hw1, hw2) + hOut;               // 外侧直边
      var rO = Math.min(hTh * 0.55, (xOut - xL) * 0.45);            // 外圆角
      var iy1 = hy1 + hTh, iy2 = hy2 - hTh, ixO = xOut - hTh;       // 内孔（外轮廓内缩柄厚）
      var rI = Math.max(2, rO - hTh * 0.4);                         // 内孔圆角
      ctx.beginPath();
      // 外轮廓：上横边 → 右直边 → 下横边（右两角圆角），左缘斜回上附着点
      ctx.moveTo(xA1, hy1);
      ctx.lineTo(xOut - rO, hy1);
      ctx.quadraticCurveTo(xOut, hy1, xOut, hy1 + rO);
      ctx.lineTo(xOut, hy2 - rO);
      ctx.quadraticCurveTo(xOut, hy2, xOut - rO, hy2);
      ctx.lineTo(xA2, hy2);
      ctx.closePath();
      // 内孔：反向环绕（nonzero 填充规则下自动镂空，兼容微信 2d canvas）
      ctx.moveTo(xL, iy1);
      ctx.lineTo(xL, iy2);
      ctx.lineTo(ixO - rI, iy2);
      ctx.quadraticCurveTo(ixO, iy2, ixO, iy2 - rI);
      ctx.lineTo(ixO, iy1 + rI);
      ctx.quadraticCurveTo(ixO, iy1, ixO - rI, iy1);
      ctx.closePath();
      // 填充随饮品色（玻璃透出的饮品质感，柄内视作始终满杯，不随液面变化）
      var hdk = this.drink;
      var hgrad = ctx.createLinearGradient(0, hy1, 0, hy2);
      hgrad.addColorStop(0, hdk.color);
      var hdeep = hdk.deep || hdk.color;
      if (hdk.gradSoft) hdeep = mixHex(hdeep, '#FFFFFF', hdk.gradSoft);
      hgrad.addColorStop(1, hdeep);
      ctx.save();
      ctx.globalAlpha = hdk.alpha != null ? hdk.alpha : 0.92;
      ctx.fillStyle = hgrad;
      ctx.fill();
      ctx.restore();
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
    var lines = this.mods.noCompleteZone ? [z.p[0], z.p[1]] : [z.q[0], z.q[1]]; // 背水一战时标注完美区边界
    for (var li = 0; li < lines.length; li++) {
      var wAt = this.halfW * cup.profile(lines[li]);
      var yy = this.baseY - lines[li] * h;
      ctx.beginPath(); ctx.moveTo(this.cx - wAt, yy); ctx.lineTo(this.cx + wAt, yy); ctx.stroke();
    }
    ctx.restore();
    }

    // 碰杯约定：淡金色虚线标出本局约定水位（停在 ±3% 内 +3 分）
    if (this.mods.toastTarget && this.toastLevel > 0) {
      ctx.save();
      ctx.setLineDash([4, 5]);
      ctx.strokeStyle = 'rgba(176,122,18,0.50)';
      ctx.lineWidth = 2;
      var tw2 = this.halfW * cup.profile(this.toastLevel);
      var ty2 = this.baseY - this.toastLevel * h;
      ctx.beginPath(); ctx.moveTo(this.cx - tw2, ty2); ctx.lineTo(this.cx + tw2, ty2); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(176,122,18,0.65)';
      ctx.font = Math.round(this.H * 0.015) + 'px sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText('约定', this.cx + tw2 + 5, ty2 + 5);
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

    // 桶内水面（随已倒量下降）：液面始终水平——先在瓶身局部坐标系裁剪内部区域，
    // 再把坐标系转回世界方向画水平液面，这样瓶子倾斜时水面依然保持水平
    var innerLevel = Math.max(0.15, 0.9 - this.poured * 0.35);
    ctx.save();
    ctx.beginPath();
    ctx.rect(x0 + 5, y0 + 5, bw - 20, bh - 10);
    ctx.clip();
    ctx.rotate(-this.angle); // 回到世界方向（原点仍是支点）
    ctx.fillStyle = this.drink ? this.drink.color : '#3FA7FF';
    ctx.globalAlpha = 0.85;
    var wy = -bh * innerLevel; // 液面世界高度（相对支点）
    var wx0 = -bw * 2, wx1 = bw * 2;
    ctx.beginPath();
    ctx.moveTo(wx0, bh * 2);
    ctx.lineTo(wx0, wy);
    for (var i = 0; i <= 24; i++) {
      var wx2 = wx0 + (wx1 - wx0) * (i / 24);
      ctx.lineTo(wx2, wy + Math.sin(this.time * 5 + i) * 2);
    }
    ctx.lineTo(wx1, bh * 2);
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
    // 描边层：浅色饮品（牛奶/玉露）在浅背景上也能看清
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

  // 刘海让位偏移：safeTop 超出普通状态栏基础高度(0.02H)的部分才下移，非刘海机几乎不变
  Game.prototype.hudShift = function () {
    var st = (this.env.safeTop || 0);
    return Math.max(0, Math.min(st - this.H * 0.02, this.H * 0.04));
  };

  Game.prototype.drawScoreHUD = function () {
    var ctx = this.ctx;
    var dy = this.hudShift();
    // 历史最高：左上角纯文本（避开右上角微信胶囊按钮；局内不显示段位，保持专注）
    ctx.textAlign = 'left';
    ctx.font = Math.round(this.H * 0.02) + 'px sans-serif';
    ctx.fillStyle = PAL.MUTED;
    var bestLabel = '历史最高 ';
    ctx.fillText(bestLabel, 14, dy + this.H * 0.052);
    var blw = ctx.measureText(bestLabel).width;
    ctx.fillStyle = PAL.INK;
    ctx.font = 'bold ' + Math.round(this.H * 0.02) + 'px sans-serif';
    ctx.fillText(String(this.best), 14 + blw + 4, dy + this.H * 0.052);
    // 大分数 + 第 X 杯（居中）
    ctx.textAlign = 'center';
    ctx.fillStyle = PAL.INK;
    ctx.font = 'bold ' + Math.round(this.H * 0.062) + 'px sans-serif';
    ctx.fillText(String(this.score), this.W / 2, dy + this.H * 0.075);
    ctx.font = 'bold ' + Math.round(this.H * 0.032) + 'px sans-serif';
    ctx.fillText('第 ' + this.round + ' 杯', this.W / 2, dy + this.H * 0.125);
    // 记账习惯：预告下一杯杯型（下移到阶段行之下，避免重叠）
    if (this.mods.cupPreview && this.nextCupPre) {
      ctx.font = Math.round(this.H * 0.014) + 'px sans-serif';
      ctx.fillStyle = PAL.MUTED;
      ctx.fillText('下一杯 · ' + this.nextCupPre.name, this.W / 2, dy + this.H * 0.208);
    }
    // 资金池/诅咒状态条（仅在有相关选择时显示）
    var chips = [];
    if (this.mods.bank) chips.push('复利 ¥' + Math.round(this.bankBal));
    if (this.mods.fund) chips.push('基金 ' + this.fundBal + '/10');
    if (this.mods.equity) chips.push('股权 ' + this.equityBal + ' 股');
    if (this.curses.length) chips.push('「' + this.curses[0].name + '」剩 ' + this.curses[0].left + ' 杯');
    if (this.redoLeft > 0) chips.push('悔棋 ×' + this.redoLeft);
    if (chips.length) {
      ctx.font = Math.round(this.H * 0.015) + 'px sans-serif';
      ctx.fillStyle = PAL.MUTED;
      ctx.textAlign = 'center';
      ctx.fillText(chips.join(' · '), this.W / 2, dy + this.H * 0.232);
    }
  };

  Game.prototype.drawDrinkTag = function () {
    var ctx = this.ctx, W = this.W, H = this.H;
    var rank = Cups.rankFor(this.score);
    var curLabel = rank.label; // 当前阶段
    // 下一阶段目标：段内下一阶，或下一段位门槛
    var tier = Cups.TIERS[rank.tierIdx];
    var nextLabel = null, gap = 0;
    if (tier.steps && rank.stageIdx + 1 < tier.steps.length) {
      var t1 = tier.steps[rank.stageIdx + 1];
      nextLabel = Cups.rankFor(t1).label;
      gap = t1 - this.score;
    } else if (rank.tierIdx + 1 < Cups.TIERS.length) {
      var t2 = Cups.TIERS[rank.tierIdx + 1].score;
      nextLabel = Cups.rankFor(t2).label;
      gap = t2 - this.score;
    }
    var dy = this.hudShift();
    var y = dy + H * 0.155, th = H * 0.046;
    // 提升动画：升到新阶段时两个标签整体放大再缩回
    var sc = 1;
    if (this.rankPulseT > 0) sc = 1 + 0.35 * Math.sin((1 - this.rankPulseT / 0.6) * Math.PI);
    ctx.save();
    ctx.translate(W / 2, y + th / 2);
    ctx.scale(sc, sc);
    ctx.translate(-W / 2, -(y + th / 2));
    ctx.textAlign = 'center';
    ctx.font = 'bold ' + Math.round(H * 0.019) + 'px sans-serif';
    if (!nextLabel) {
      // 已是最高阶段：只显示当前阶段胶囊
      var tw0 = ctx.measureText(curLabel).width + 32;
      ctx.fillStyle = PAL.CARD;
      this.roundRect((W - tw0) / 2, y, tw0, th, th / 2);
      ctx.fill();
      ctx.fillStyle = PAL.INK;
      ctx.fillText(curLabel, W / 2, y + th * 0.68);
    } else {
      var cwL = ctx.measureText(curLabel).width + 30;
      var cwR = ctx.measureText(nextLabel).width + 30;
      var midW = W * 0.17;
      var total = cwL + midW + cwR;
      var x0 = (W - total) / 2;
      // 左：当前阶段（白底黑字）
      ctx.fillStyle = PAL.CARD;
      this.roundRect(x0, y, cwL, th, th / 2);
      ctx.fill();
      ctx.fillStyle = PAL.INK;
      ctx.fillText(curLabel, x0 + cwL / 2, y + th * 0.68);
      // 中：差分 + 小箭头（指向未达成的下一阶段）
      var gapTxt = String(gap);
      ctx.font = 'bold ' + Math.round(H * 0.020) + 'px sans-serif';
      var gw = ctx.measureText(gapTxt).width;
      var gx = x0 + cwL + midW / 2;
      ctx.fillStyle = PAL.INK;
      ctx.fillText(gapTxt, gx - H * 0.008, y + th * 0.68);
      var ay = y + th / 2, asz = th * 0.20;
      var ax0 = gx - H * 0.008 + gw / 2 + H * 0.008;
      ctx.beginPath();
      ctx.moveTo(ax0, ay - asz);
      ctx.lineTo(ax0 + asz * 1.5, ay);
      ctx.lineTo(ax0, ay + asz);
      ctx.closePath();
      ctx.fill();
      // 右：下一阶段（半透灰化 = 未达成）
      var xr = x0 + cwL + midW;
      ctx.font = 'bold ' + Math.round(H * 0.019) + 'px sans-serif';
      ctx.fillStyle = 'rgba(247,245,238,0.55)';
      this.roundRect(xr, y, cwR, th, th / 2);
      ctx.fill();
      ctx.fillStyle = PAL.MUTED;
      ctx.fillText(nextLabel, xr + cwR / 2, y + th * 0.68);
    }
    ctx.restore();
  };

  Game.prototype.drawAimHint = function () {
    var ctx = this.ctx;
    var a = 0.6 + 0.4 * Math.sin(this.time * 4);
    ctx.globalAlpha = a;
    ctx.fillStyle = PAL.INK;
    ctx.font = 'bold ' + Math.round(this.H * 0.030) + 'px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('按住屏幕倒水', this.W / 2, this.H * 0.905);
    // 副提示：目标区说明（黄/绿关键词带颜色，对应杯上色带）
    ctx.font = Math.round(this.H * 0.018) + 'px sans-serif';
    var segs = [
      ['倒水至', PAL.MUTED], ['黄色', '#D9A62E'], ['区域完成，', PAL.MUTED],
      ['绿色', '#2EA85C'], ['区域完美', PAL.MUTED]
    ];
    var totW = 0, si;
    for (si = 0; si < segs.length; si++) totW += ctx.measureText(segs[si][0]).width;
    var sx = (this.W - totW) / 2;
    ctx.textAlign = 'left';
    for (si = 0; si < segs.length; si++) {
      ctx.fillStyle = segs[si][1];
      ctx.fillText(segs[si][0], sx, this.H * 0.94);
      sx += ctx.measureText(segs[si][0]).width;
    }
    ctx.globalAlpha = 1;
  };

  Game.prototype.drawFloats = function () {
    var ctx = this.ctx;
    for (var i = 0; i < this.floats.length; i++) {
      var f = this.floats[i];
      ctx.globalAlpha = Math.min(1, f.life);
      ctx.fillStyle = f.color;
      ctx.font = 'bold ' + Math.round(this.H * (f.size || 0.038)) + 'px sans-serif';
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
      var x = (this.W - tw) / 2, y = this.hudShift() + this.H * 0.21 + i * this.H * 0.05; // 示意图：段位 pill 正下方
      // 儿孙满堂：文案变金色
      ctx.fillStyle = this.mods.goldLines ? 'rgba(120,90,20,0.88)' : 'rgba(40,40,40,0.85)';
      this.roundRect(x, y, tw, this.H * 0.036, 16);
      ctx.fill();
      ctx.fillStyle = this.mods.goldLines ? '#FFE9A8' : '#FFF3D6';
      ctx.fillText(t.text, this.W / 2, y + this.H * 0.025);
    }
    ctx.globalAlpha = 1;
  };

  // 文本按宽度折行（逐字累积测量）
  Game.prototype.wrapLines = function (text, maxW) {
    var ctx = this.ctx, lines = [], cur = '';
    for (var i = 0; i < text.length; i++) {
      var ch = text[i];
      if (cur && ctx.measureText(cur + ch).width > maxW) { lines.push(cur); cur = ch; }
      else cur += ch;
    }
    if (cur) lines.push(cur);
    return lines;
  };

  // 抽卡竖卡绘制（三选一/二选一共用）：横排、内容折行、锁定期半透明
  Game.prototype.drawChoiceCards = function (cards, rects, cw, ch, y0, px, side, gap, locked) {
    var ctx = this.ctx, H = this.H;
    for (var i = 0; i < cards.length; i++) {
      var c = cards[i];
      var cx = px + side + i * (cw + gap);
      rects.push({ x: cx, y: y0, w: cw, h: ch, opt: c });
      var meta = Choices.CATS[c.cat] || Choices.CATS.A;
      var rare = c.cat === 'D';
      ctx.save();
      ctx.fillStyle = '#FFFFFF';
      this.roundRect(cx, y0, cw, ch, 14);
      ctx.fill();
      ctx.strokeStyle = rare ? '#E8A33D' : PAL.TRACK;
      ctx.lineWidth = rare ? 4 : 2;
      ctx.stroke();
      var mid = cx + cw / 2;
      // 分类 chip（居中，稀有卡带 ◆）
      ctx.font = 'bold ' + Math.round(H * 0.0135) + 'px sans-serif';
      var chipTxt = (rare ? '◆ ' : '') + meta.label;
      var chipTw = ctx.measureText(chipTxt).width;
      var chipH = H * 0.026, chipY = y0 + ch * 0.055;
      ctx.fillStyle = meta.bg;
      this.roundRect(mid - chipTw / 2 - 10, chipY, chipTw + 20, chipH, chipH / 2);
      ctx.fill();
      ctx.fillStyle = meta.color;
      ctx.fillText(chipTxt, mid, chipY + chipH * 0.72);
      // 选项名（最多 2 行）
      ctx.fillStyle = PAL.INK;
      ctx.font = 'bold ' + Math.round(H * 0.023) + 'px sans-serif';
      var nameTxt = c.name + (c.tierDraw ? ' ◆' : '');
      var nLines = this.wrapLines(nameTxt, cw - 12).slice(0, 2);
      for (var nl = 0; nl < nLines.length; nl++) {
        ctx.fillText(nLines[nl], mid, y0 + ch * 0.25 + nl * H * 0.030);
      }
      // 效果说明（最多 5 行）
      ctx.font = Math.round(H * 0.0155) + 'px sans-serif';
      ctx.fillStyle = '#3A3833';
      var dTxt = c.tierDraw ? '抽出后随机选定段位生效' : c.desc;
      var dLines = this.wrapLines(dTxt, cw - 14).slice(0, 5);
      for (var dl = 0; dl < dLines.length; dl++) {
        ctx.fillText(dLines[dl], mid, y0 + ch * 0.44 + dl * H * 0.024);
      }
      // 感悟小字（最多 4 行）
      ctx.font = Math.round(H * 0.0125) + 'px sans-serif';
      ctx.fillStyle = PAL.MUTED;
      var fLines = this.wrapLines(c.flavor || '', cw - 14).slice(0, 4);
      for (var fl = 0; fl < fLines.length; fl++) {
        ctx.fillText(fLines[fl], mid, y0 + ch * 0.75 + fl * H * 0.019);
      }
      ctx.restore();
    }
  };

  // 三选一用竖排三行卡（整行宽，从左到右：分类 chip → 名称/效果/感悟）
  Game.prototype.drawChoiceRows = function (cards, rects, y0, rowH, gap, px, pw) {
    var ctx = this.ctx, W = this.W, H = this.H;
    var cx = px + W * 0.032, cw = pw - W * 0.064;
    // 单行自适应缩字号（minPx 仍超宽则交给调用方换行）
    function fitFont(text, maxW, basePx, minPx, bold) {
      var px2 = basePx;
      while (px2 > minPx) {
        ctx.font = (bold ? 'bold ' : '') + Math.round(px2) + 'px sans-serif';
        if (ctx.measureText(text).width <= maxW) return px2;
        px2 -= 1;
      }
      ctx.font = (bold ? 'bold ' : '') + Math.round(minPx) + 'px sans-serif';
      return minPx;
    }
    for (var i = 0; i < cards.length; i++) {
      var c = cards[i], cy = y0 + i * (rowH + gap);
      rects.push({ x: cx, y: cy, w: cw, h: rowH, opt: c });
      var meta = Choices.CATS[c.cat] || Choices.CATS.A;
      var rare = c.cat === 'D';
      ctx.save();
      ctx.fillStyle = '#FFFFFF';
      this.roundRect(cx, cy, cw, rowH, 14);
      ctx.fill();
      ctx.strokeStyle = rare ? '#E8A33D' : PAL.TRACK;
      ctx.lineWidth = rare ? 4 : 2;
      ctx.stroke();
      // 左侧分类 chip（垂直居中）
      ctx.textAlign = 'center';
      ctx.font = 'bold ' + Math.round(H * 0.0145) + 'px sans-serif';
      var chipTxt = (rare ? '◆ ' : '') + meta.label;
      var chipTw = ctx.measureText(chipTxt).width;
      var chipH = H * 0.03, chipW = chipTw + 22;
      var chipX = cx + W * 0.02, chipY = cy + rowH / 2 - chipH / 2;
      ctx.fillStyle = meta.bg;
      this.roundRect(chipX, chipY, chipW, chipH, chipH / 2);
      ctx.fill();
      ctx.fillStyle = meta.color;
      ctx.fillText(chipTxt, chipX + chipW / 2, chipY + chipH * 0.72);
      // 右侧文字区：名称（1 行）/ 效果（1~2 行）/ 感悟（1 行）
      var tx = chipX + chipW + W * 0.026;
      var tw = cx + cw - tx - W * 0.018;
      ctx.textAlign = 'left';
      ctx.fillStyle = PAL.INK;
      var nameTxt = c.name + (c.tierDraw ? ' ◆' : '');
      fitFont(nameTxt, tw, H * 0.021, H * 0.016, true);
      ctx.fillText(nameTxt, tx, cy + rowH * 0.30);
      var dTxt = c.tierDraw ? '抽出后随机选定段位生效' : c.desc;
      ctx.fillStyle = '#3A3833';
      // 效果文案：固定字号不缩放，超宽时折成 2 行（2 行时感悟小字让位）
      ctx.font = Math.round(H * 0.015) + 'px sans-serif';
      var oneLine = ctx.measureText(dTxt).width <= tw;
      if (oneLine) {
        ctx.fillText(dTxt, tx, cy + rowH * 0.60);
        ctx.fillStyle = PAL.MUTED;
        fitFont(c.flavor || '', tw, H * 0.0125, H * 0.01, false);
        ctx.fillText(c.flavor || '', tx, cy + rowH * 0.85);
      } else {
        var dLines = this.wrapLines(dTxt, tw);
        if (dLines.length > 2) { // 兜底：第二行末尾省略
          var tail = dLines[1];
          while (tail.length && ctx.measureText(tail + '…').width > tw) tail = tail.slice(0, -1);
          dLines = [dLines[0], tail + '…'];
        }
        for (var dl = 0; dl < dLines.length; dl++) {
          ctx.fillText(dLines[dl], tx, cy + rowH * (0.56 + dl * 0.24));
        }
      }
      ctx.restore();
    }
  };

  // ---------------- 人生选择 · 三选一抽卡界面（升段/升阶触发，不可跳过） ----------------
  // 竖排三行卡，面板位于屏幕上半部不遮杯子；弹出 1 秒内不响应点击（防误触）
  Game.prototype.drawChoice = function () {
    var ctx = this.ctx, W = this.W, H = this.H;
    var cards = this.pendingChoice || [];
    var locked = (this.time - this.choiceOpenT) < 1;
    // 半透压暗背景（保留局内画面）
    ctx.fillStyle = 'rgba(43,42,38,0.45)';
    ctx.fillRect(0, 0, W, H);
    // 主面板
    var px = W * 0.045, py = H * 0.115, pw = W * 0.91, ph = H * 0.575;
    ctx.fillStyle = PAL.CARD;
    this.roundRect(px, py, pw, ph, 20);
    ctx.fill();
    ctx.strokeStyle = PAL.TRACK; ctx.lineWidth = 3; ctx.stroke();

    ctx.textAlign = 'center';
    ctx.fillStyle = PAL.INK;
    ctx.font = 'bold ' + Math.round(H * 0.038) + 'px sans-serif';
    ctx.fillText(this.choiceIsOpening ? '人生起点' : '人生路口', W / 2, py + H * 0.058);
    ctx.font = Math.round(H * 0.017) + 'px sans-serif';
    ctx.fillStyle = PAL.MUTED;
    ctx.fillText(this.choiceIsOpening ? '出生之前 · 选择一种天赋' : (Cups.rankFor(this.score).label + ' · 选择一种际遇'), W / 2, py + H * 0.098);

    // 三行整宽卡片
    var y0 = py + H * 0.125, gap = H * 0.012;
    var rowH = (ph - H * 0.125 - H * 0.05 - gap * 2) / 3;
    this.choiceRects = [];
    this.drawChoiceRows(cards, this.choiceRects, y0, rowH, gap, px, pw);

    ctx.font = Math.round(H * 0.014) + 'px sans-serif';
    ctx.fillStyle = PAL.MUTED;
    ctx.fillText(locked ? '请稍候…' : '选择后本局生效 · 点击卡片做出选择', W / 2, py + ph - H * 0.022);
  };

  // 段位之力 · 二选一（抽中 2 条效果时展示；同款横排布局 + 1 秒锁）
  Game.prototype.drawChoice2 = function () {
    var ctx = this.ctx, W = this.W, H = this.H;
    var cards = this.pendingTierFx || [];
    var locked = (this.time - this.choiceOpenT) < 1;
    ctx.fillStyle = 'rgba(43,42,38,0.45)';
    ctx.fillRect(0, 0, W, H);
    var px = W * 0.045, py = H * 0.115, pw = W * 0.91, ph = H * 0.575;
    ctx.fillStyle = PAL.CARD;
    this.roundRect(px, py, pw, ph, 20);
    ctx.fill();
    ctx.strokeStyle = PAL.TRACK; ctx.lineWidth = 3; ctx.stroke();

    ctx.textAlign = 'center';
    ctx.fillStyle = PAL.INK;
    ctx.font = 'bold ' + Math.round(H * 0.038) + 'px sans-serif';
    ctx.fillText('段位之力 ◆', W / 2, py + H * 0.058);
    ctx.font = Math.round(H * 0.017) + 'px sans-serif';
    ctx.fillStyle = PAL.MUTED;
    ctx.fillText('两种力量同时涌现 · 选择其一', W / 2, py + H * 0.098);

    // 两张竖卡横排
    var side = W * 0.05, gap = W * 0.024;
    var cw = (pw - side * 2 - gap) / 2;
    var ch = H * 0.38, y0 = py + H * 0.135;
    this.choice2Rects = [];
    this.drawChoiceCards(cards, this.choice2Rects, cw, ch, y0, px, side, gap, locked);

    ctx.font = Math.round(H * 0.014) + 'px sans-serif';
    ctx.fillStyle = PAL.MUTED;
    ctx.fillText(locked ? '请稍候…' : '点击卡片做出选择', W / 2, py + ph - H * 0.022);
  };

  // ---------------- 悔棋面板（重来一杯） ----------------
  Game.prototype.drawLastChance = function () {
    var ctx = this.ctx, W = this.W, H = this.H;
    ctx.fillStyle = 'rgba(43,42,38,0.45)';
    ctx.fillRect(0, 0, W, H);
    var pw = W * 0.80, ph = H * 0.32, px = (W - pw) / 2, py = H * 0.29;
    ctx.fillStyle = PAL.CARD;
    this.roundRect(px, py, pw, ph, 20);
    ctx.fill();
    ctx.strokeStyle = PAL.TRACK; ctx.lineWidth = 3; ctx.stroke();

    ctx.textAlign = 'center';
    ctx.fillStyle = PAL.INK;
    ctx.font = 'bold ' + Math.round(H * 0.034) + 'px sans-serif';
    ctx.fillText(this.failReason || '这杯没倒好', W / 2, py + ph * 0.22);
    ctx.font = Math.round(H * 0.019) + 'px sans-serif';
    ctx.fillStyle = PAL.MUTED;
    ctx.fillText('人生中场，可以重来这一杯（剩 ' + this.redoLeft + ' 次）', W / 2, py + ph * 0.38);

    var bw = pw * 0.72, bh = H * 0.056, bx = (W - bw) / 2;
    var b1 = { key: 'redo', x: bx, y: py + ph * 0.50, w: bw, h: bh };
    var b2 = { key: 'giveup', x: bx, y: py + ph * 0.50 + bh + H * 0.018, w: bw, h: bh };
    this.lastChanceRects = [b1, b2];
    this.drawCapsule(b1.x, b1.y, b1.w, b1.h, PAL.YEL, '重来一杯');
    this.drawCapsule(b2.x, b2.y, b2.w, b2.h, PAL.CARD_DIM, '接受结局');
  };

  // ---------------- 「已做选择」按钮 + 可滑动列表面板 ----------------
  Game.prototype.drawChoicesBtn = function () {
    var ctx = this.ctx, r = this.choicesBtnRect();
    ctx.fillStyle = 'rgba(43,42,38,0.12)';
    this.roundRect(r.x, r.y + 3, r.w, r.h, r.h / 2);
    ctx.fill();
    ctx.fillStyle = PAL.CARD;
    this.roundRect(r.x, r.y, r.w, r.h, r.h / 2);
    ctx.fill();
    ctx.strokeStyle = PAL.TRACK; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = PAL.INK;
    ctx.font = 'bold ' + Math.round(r.h * 0.36) + 'px sans-serif';
    ctx.textAlign = 'center';
    var n = this.chosenList ? this.chosenList.length : 0;
    ctx.fillText('已做选择' + (n ? ' ' + n : ''), r.x + r.w / 2, r.y + r.h * 0.66);
  };

  Game.prototype.drawChoicesList = function () {
    var ctx = this.ctx, W = this.W, H = this.H;
    ctx.fillStyle = 'rgba(43,42,38,0.45)';
    ctx.fillRect(0, 0, W, H);
    var px = W * 0.08, py = H * 0.15, pw = W * 0.84, ph = H * 0.64;
    ctx.fillStyle = PAL.CARD;
    this.roundRect(px, py, pw, ph, 20);
    ctx.fill();
    ctx.strokeStyle = PAL.TRACK; ctx.lineWidth = 3; ctx.stroke();

    ctx.textAlign = 'center';
    ctx.fillStyle = PAL.INK;
    ctx.font = 'bold ' + Math.round(H * 0.034) + 'px sans-serif';
    ctx.fillText('本局际遇（' + this.chosenList.length + '）', W / 2, py + H * 0.058);

    // 列表区域（裁剪 + 滚动）
    var lx = px + W * 0.05, lw = pw - W * 0.10;
    var ly = py + H * 0.095, lh = ph - H * 0.095 - H * 0.085;
    var itemH = H * 0.072;
    var maxScroll = Math.max(0, this.chosenList.length * itemH - lh);
    this.listScroll = Math.max(0, Math.min(maxScroll, this.listScroll));
    this._listPanel = { list: { x: lx, y: ly, w: lw, h: lh }, close: null, maxScroll: maxScroll };

    ctx.save();
    ctx.beginPath(); ctx.rect(lx, ly, lw, lh); ctx.clip();
    if (!this.chosenList.length) {
      ctx.fillStyle = PAL.MUTED;
      ctx.font = Math.round(H * 0.02) + 'px sans-serif';
      ctx.fillText('这一局还没有做过选择', W / 2, ly + lh / 2);
    }
    for (var i = 0; i < this.chosenList.length; i++) {
      var c = this.chosenList[i];
      var iy = ly + i * itemH - this.listScroll;
      if (iy + itemH < ly || iy > ly + lh) continue;
      var meta = Choices.CATS[c.cat] || Choices.CATS.A;
      ctx.fillStyle = '#FFFFFF';
      this.roundRect(lx, iy + 4, lw, itemH - 8, 12);
      ctx.fill();
      ctx.fillStyle = meta.color;
      ctx.beginPath(); ctx.arc(lx + 16, iy + itemH / 2, 5, 0, Math.PI * 2); ctx.fill();
      ctx.textAlign = 'left';
      ctx.fillStyle = PAL.INK;
      ctx.font = 'bold ' + Math.round(H * 0.019) + 'px sans-serif';
      ctx.fillText(c.name, lx + 30, iy + itemH * 0.42);
      ctx.fillStyle = PAL.MUTED;
      ctx.font = Math.round(H * 0.015) + 'px sans-serif';
      var dsc = c.desc;
      while (dsc.length > 1 && ctx.measureText(dsc).width > lw - 44) dsc = dsc.slice(0, -1);
      if (dsc !== c.desc) dsc = dsc.slice(0, -1) + '…';
      ctx.fillText(dsc, lx + 30, iy + itemH * 0.76);
      ctx.textAlign = 'center';
    }
    ctx.restore();

    // 滚动条指示
    if (maxScroll > 0) {
      var total = this.chosenList.length * itemH;
      var barH = Math.max(H * 0.03, lh * lh / total);
      var barY = ly + (this.listScroll / maxScroll) * (lh - barH);
      ctx.fillStyle = 'rgba(43,42,38,0.18)';
      this.roundRect(lx + lw + 3, barY, 4, barH, 2);
      ctx.fill();
    }

    // 关闭按钮
    var cw2 = W * 0.4, ch2 = H * 0.05;
    var cx2 = W / 2 - cw2 / 2, cy2 = py + ph - H * 0.068;
    ctx.fillStyle = PAL.INK;
    this.roundRect(cx2, cy2, cw2, ch2, ch2 / 2);
    ctx.fill();
    ctx.fillStyle = PAL.CARD;
    ctx.font = 'bold ' + Math.round(ch2 * 0.38) + 'px sans-serif';
    ctx.fillText('关闭', W / 2, cy2 + ch2 * 0.66);
    this._listPanel.close = { x: cx2, y: cy2, w: cw2, h: ch2 };
  };

  // ---------------- 主界面（极简 · 点击屏幕开始） ----------------
  Game.prototype.drawMenu = function () {
    var ctx = this.ctx, W = this.W, H = this.H;
    var mx = W * 0.09; // 左右边距

    // 标题（左对齐，7字标题自适应缩字号防溢出）+ 副标语（刘海让位）
    var dy = this.hudShift();
    ctx.textAlign = 'left';
    ctx.fillStyle = PAL.INK;
    var title = '这一杯敬给自己';
    var tSize = Math.round(H * 0.062);
    ctx.font = 'bold ' + tSize + 'px sans-serif';
    while (tSize > 12 && ctx.measureText(title).width > W - mx * 2) {
      tSize -= 2;
      ctx.font = 'bold ' + tSize + 'px sans-serif';
    }
    ctx.fillText(title, mx, dy + H * 0.115);
    ctx.font = Math.round(H * 0.022) + 'px sans-serif';
    ctx.fillStyle = PAL.MUTED;
    ctx.fillText('人生一杯', mx, dy + H * 0.152);

    // —— 容器英雄图：奶盒/可乐瓶/麦芽瓶/茶壶 前后错落 ——
    var heroes = this.assets.heroes;
    if (heroes && heroes.ready) {
      var aspect = heroes.img.width / heroes.img.height;
      var hh = Math.min(H * 0.235, W * 0.92 / aspect);
      var hw = hh * aspect;
      var hBottom = H * 0.44;
      ctx.drawImage(heroes.img, (W - hw) / 2, hBottom - hh, hw, hh);
    } else {
      // 素材未加载时的矢量兜底：奶盒/可乐瓶/麦芽瓶/茶壶/玉露瓶前后错落
      var base2 = H * 0.44;
      var specs = [
        { dx: -0.31, w: 0.115, h: 0.150, c: '#A9CFE8', e: '#3E5C76', kind: 'carton' },
        { dx: -0.155, w: 0.085, h: 0.190, c: '#4A2C1A', e: '#2E1B10', kind: 'cola' },
        { dx: 0, w: 0.075, h: 0.172, c: '#C97B2D', e: '#7A4A18', kind: 'bottle' },
        { dx: 0.155, w: 0.150, h: 0.115, c: '#8A5A3B', e: '#5B3A24', kind: 'teapot' },
        { dx: 0.31, w: 0.075, h: 0.162, c: '#EFEAE0', e: '#9A9488', kind: 'bottle' }
      ];
      for (var hi = 0; hi < specs.length; hi++) {
        var s = specs[hi];
        var bx = W / 2 + s.dx * W, bw2 = s.w * W, bh2 = s.h * H;
        var by2 = base2 - bh2 - (hi % 2 ? H * 0.014 : 0);
        ctx.fillStyle = s.c; ctx.strokeStyle = s.e; ctx.lineWidth = 3;
        if (s.kind === 'carton') {
          this.roundRect(bx - bw2 / 2, by2 + bh2 * 0.28, bw2, bh2 * 0.72, 4);
          ctx.fill(); ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(bx - bw2 / 2, by2 + bh2 * 0.28);
          ctx.lineTo(bx, by2);
          ctx.lineTo(bx + bw2 / 2, by2 + bh2 * 0.28);
          ctx.closePath(); ctx.fill(); ctx.stroke();
          ctx.fillStyle = 'rgba(255,255,255,0.85)';
          ctx.fillRect(bx - bw2 * 0.32, by2 + bh2 * 0.48, bw2 * 0.64, bh2 * 0.16);
        } else if (s.kind === 'teapot') {
          ctx.beginPath();
          ctx.ellipse(bx, by2 + bh2 * 0.60, bw2 * 0.44, bh2 * 0.38, 0, 0, Math.PI * 2);
          ctx.fill(); ctx.stroke();
          ctx.beginPath(); // 壶嘴
          ctx.moveTo(bx + bw2 * 0.36, by2 + bh2 * 0.48);
          ctx.lineTo(bx + bw2 * 0.60, by2 + bh2 * 0.20);
          ctx.lineTo(bx + bw2 * 0.66, by2 + bh2 * 0.32);
          ctx.lineTo(bx + bw2 * 0.45, by2 + bh2 * 0.60);
          ctx.closePath(); ctx.fill(); ctx.stroke();
          ctx.beginPath(); // 把手
          ctx.arc(bx - bw2 * 0.44, by2 + bh2 * 0.52, bh2 * 0.22, Math.PI * 0.45, Math.PI * 1.55);
          ctx.stroke();
          ctx.beginPath(); // 盖钮
          ctx.arc(bx, by2 + bh2 * 0.16, bh2 * 0.07, 0, Math.PI * 2);
          ctx.fill(); ctx.stroke();
        } else {
          this.roundRect(bx - bw2 / 2, by2 + bh2 * 0.30, bw2, bh2 * 0.70, bw2 * 0.3);
          ctx.fill(); ctx.stroke();
          ctx.fillRect(bx - bw2 * 0.16, by2 + bh2 * 0.08, bw2 * 0.32, bh2 * 0.26);
          ctx.strokeRect(bx - bw2 * 0.16, by2 + bh2 * 0.08, bw2 * 0.32, bh2 * 0.26);
          ctx.fillRect(bx - bw2 * 0.20, by2, bw2 * 0.40, bh2 * 0.10);
          ctx.strokeRect(bx - bw2 * 0.20, by2, bw2 * 0.40, bh2 * 0.10);
          if (s.kind === 'cola') { // 可乐红标
            ctx.fillStyle = '#D43D2A';
            ctx.fillRect(bx - bw2 / 2, by2 + bh2 * 0.50, bw2, bh2 * 0.16);
          }
        }
      }
    }

    // —— 点击屏幕开始（呼吸感） ——
    ctx.textAlign = 'center';
    ctx.globalAlpha = 0.75 + 0.25 * Math.sin(this.time * 3);
    ctx.fillStyle = PAL.INK;
    ctx.font = 'bold ' + Math.round(H * 0.032) + 'px sans-serif';
    ctx.fillText('点击屏幕开始', W / 2, H * 0.56);
    ctx.globalAlpha = 1;

    // —— 历史最高 + 当前段位（一行，居中） ——
    ctx.font = 'bold ' + Math.round(H * 0.022) + 'px sans-serif';
    var bestTxt = this.best > 0 ? String(this.best) : '—';
    ctx.fillStyle = PAL.INK;
    ctx.fillText('历史最高 ' + bestTxt + '　' + Cups.rankFor(this.best).label, W / 2, H * 0.755);

    // 四个按钮：商城 / 分享 / 排名 / 设置（白底圆钮 + 柔影 + 墨色字）
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
      var rc = this.env.rankCanvas && this.env.rankCanvas();
      if (rc) {
        // 微信：开放数据域好友排行榜（共享画布）
        var r = this.rankContentRect();
        ctx.drawImage(rc, r.x, r.y, r.w, r.h);
        ctx.font = Math.round(H * 0.015) + 'px sans-serif';
        ctx.fillStyle = PAL.MUTED;
        ctx.fillText('好友排行 · 每破纪录自动更新', W / 2, py + ph - H * 0.02);
      } else {
        // 排行榜不可用（非微信环境/未同意隐私协议/加载中）：本机成绩兜底
        var rankErr = this.env.rankError ? this.env.rankError() : '';
        ctx.fillText('本机最高分：' + this.best, W / 2, py + H * 0.115);
        ctx.fillText('累计成功：' + this.totalCups + ' 杯', W / 2, py + H * 0.155);
        ctx.font = Math.round(H * 0.016) + 'px sans-serif';
        ctx.fillStyle = PAL.MUTED;
        ctx.fillText(rankErr === '未同意隐私协议，好友排行不可用' ? rankErr : '好友排行加载中…', W / 2, py + H * 0.195);
      }
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
    var px = W * 0.08, py = H * 0.20, pw = W * 0.84, ph = H * 0.40;
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
    var capsuleTxt = '段位 · ' + Cups.rankFor(this.score).label;
    ctx.font = 'bold ' + Math.round(H * 0.024) + 'px sans-serif';
    var cw = ctx.measureText(capsuleTxt).width + W * 0.12;
    var ch = H * 0.05, cx0 = W / 2 - cw / 2, cy0 = py + H * 0.26;
    ctx.fillStyle = PAL.YEL;
    this.roundRect(cx0, cy0, cw, ch, ch / 2);
    ctx.fill();
    ctx.fillStyle = PAL.INK;
    ctx.fillText(capsuleTxt, W / 2, cy0 + ch * 0.68);

    // 段位小哲理（替代原「距下一段位还差 X 分」进度行）：卡宽内折行，最多 2 行
    ctx.font = Math.round(H * 0.017) + 'px sans-serif';
    ctx.fillStyle = PAL.CARD_DIM;
    var wLines = this.wrapLines(oTier.wisdom || '', pw * 0.86);
    if (wLines.length > 2) { // 兜底：超出 2 行时第二行末尾省略
      var tail = wLines[1];
      while (tail.length && ctx.measureText(tail + '…').width > pw * 0.86) tail = tail.slice(0, -1);
      wLines = [wLines[0], tail + '…'];
    }
    for (var wi = 0; wi < wLines.length; wi++) {
      ctx.fillText(wLines[wi], W / 2, py + H * (0.335 + wi * 0.026));
    }

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
