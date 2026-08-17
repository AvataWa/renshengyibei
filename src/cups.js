/**
 * 杯型库 + 饮品库
 * 杯型 profile(t): t 从 0(杯底) 到 1(杯口)，返回半宽（0..1 相对单位）
 * 解锁规则：杯型按难度从易到难排序，倒奶段位（0 段）开放前 10 个，
 * 之后每升 1 段多解锁 2 个（N 段 = 前 10+2N 个内均匀随机）
 */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.Cups = factory();
})(typeof GameGlobal !== 'undefined' ? GameGlobal : (typeof self !== 'undefined' ? self : this), function () {

  // ---------- 工具 ----------
  function gauss(t, c, s) { return Math.exp(-Math.pow((t - c) / s, 2)); }
  function clamp01(v) { return Math.max(0, Math.min(1, v)); }

  // ---------- 杯型库（按难度排序，累计解锁） ----------
  // zones: q=合格区[lo,hi]（淡黄）, p=完美区[lo,hi]（淡绿），其余为不合格区
  // 粗细变化越大，水位上升速度随液面高度变化越剧烈（df/dt ∝ 1/宽度²）
  var CUPS = [
    // ── 段位0 · 倒奶（10 个杯型）──
    {
      name: '直筒奶瓶', hint: '八分满', aspect: 1.63, stem: false, size: 0.95,
      sprite: 'cup-milk', sprHFrac: 0.857, sprBFrac: 0.965, // 精灵杯：蓝边镂空奶瓶，刻度线留在瓶壁上
      profile: function (t) { return t < 0.08 ? 0.82 + 0.18 * (t / 0.08) : 1; }, // 直筒 + 瓶底圆角
      zones: { q: [0.70, 0.94] }
    },
    {
      name: '功夫茶杯', hint: '七分满', aspect: 1.1, stem: false, size: 0.85,
      profile: function (t) { return 0.55 + 0.30 * t; },
      zones: { q: [0.58, 0.84] }
    },
    {
      name: '小茶碗', hint: '七分满', aspect: 0.55, stem: false, size: 0.72,
      profile: function (t) { return 0.30 + 0.65 * Math.sin(t * Math.PI / 2); },
      zones: { q: [0.56, 0.82] } // 底窄口阔：起步快、越倒越慢
    },
    {
      name: '白酒小盅', hint: '满杯为宜', aspect: 1.0, stem: false, size: 0.72,
      profile: function (t) { return 0.58; },
      zones: { q: [0.74, 0.98] }
    },
    {
      name: '收口杯', hint: '八分满', aspect: 1.2, stem: false, size: 0.92,
      profile: function (t) { return 0.88 - 0.28 * t; },
      zones: { q: [0.66, 0.90] } // 底阔口窄：越接近目标越快，容易冲过
    },
    {
      name: '宽口汤碗', hint: '七分满', aspect: 0.5, stem: false, size: 1.20,
      profile: function (t) { return 0.42 + 0.58 * Math.pow(Math.sin(t * Math.PI / 2), 0.7); },
      zones: { q: [0.54, 0.78] } // 极宽浅碗：液面爬得极慢，耐心局
    },
    {
      name: 'S曲线杯', hint: '过波峰', aspect: 1.6, stem: false, size: 1.0,
      profile: function (t) { return 0.58 + 0.30 * Math.sin(2 * Math.PI * t); },
      zones: { q: [0.58, 0.82] } // S 型杯壁：下鼓-中收-上张，速度两快两慢
    },
    {
      name: '波浪壁杯', hint: '八分满', aspect: 1.3, stem: false, size: 1.12,
      profile: function (t) { return 0.62 + 0.16 * Math.sin(3 * Math.PI * t); },
      zones: { q: [0.62, 0.86] } // 三段波浪：节奏细碎
    },
    {
      name: '折纸棱杯', hint: '八分满', aspect: 1.4, stem: false, size: 1.0,
      profile: function (t) {
        if (t < 0.33) return 0.78 - 0.30 * (t / 0.33);
        if (t < 0.66) return 0.48 + 0.32 * ((t - 0.33) / 0.33);
        return 0.80 - 0.30 * ((t - 0.66) / 0.34);
      },
      zones: { q: [0.60, 0.84] } // 折线棱角：每过一条棱速度突变
    },
    {
      name: '细高试管杯', hint: '九分满', aspect: 2.8, stem: false, size: 1.35,
      profile: function (t) { return t < 0.06 ? 0.24 + 0.10 * (t / 0.06) : 0.34; },
      zones: { q: [0.72, 0.96] } // 极细直管：液面蹿得快
    },
    // ── 段位1 · 可乐少年 +2 ──
    {
      name: '可乐高挑杯', hint: '八分满', aspect: 1.7, stem: false, size: 1.05,
      profile: function (t) { return 0.50 + 0.18 * Math.sin(Math.PI * clamp01(t * 1.05)) + 0.06 * t; },
      zones: { q: [0.64, 0.88] } // 中段微鼓：过半后先慢后快
    },
    {
      name: '反S细腰杯', hint: '过半腰', aspect: 1.85, stem: false, size: 0.98,
      profile: function (t) { return 0.58 - 0.28 * Math.sin(2 * Math.PI * t); },
      zones: { q: [0.56, 0.80] } // 反向 S：下收-中鼓-上收，与 S 杯手感相反
    },
    // ── 段位2 · 啤酒青年 +2 ──
    {
      name: '扎啤杯', hint: '九分满', aspect: 1.5, stem: false, size: 1.1,
      profile: function (t) { return 0.58 + 0.14 * t - 0.05 * Math.sin(2 * Math.PI * t); },
      zones: { q: [0.72, 0.96] } // 带轻微波浪壁：速度有细碎起伏
    },
    {
      name: '大肚矮坛', hint: '过半', aspect: 0.78, stem: false, size: 1.30,
      profile: function (t) { return 0.40 + 0.58 * gauss(t, 0.38, 0.26); },
      zones: { q: [0.44, 0.68] } // 矮胖大肚：中段极慢，易早停
    },
    // ── 段位3 · 红酒新秀 +2 ──
    {
      name: '红葡萄酒杯', hint: '1/3 杯', aspect: 1.5, stem: true, size: 1.08,
      profile: function (t) { return 0.16 + 0.74 * Math.pow(Math.sin(Math.PI * clamp01(t * 1.02)), 0.7); },
      zones: { q: [0.22, 0.46] } // 大肚收口：目标区在低处，起步冲得猛
    },
    {
      name: '高脚浅碟杯', hint: '七分满', aspect: 0.9, stem: true, size: 1.0,
      profile: function (t) { return 0.30 + 0.62 * Math.pow(Math.sin(t * Math.PI / 2), 0.55); },
      zones: { q: [0.50, 0.74] } // 宽浅碟配高脚：超慢爬升
    },
    // ── 段位4 · 白酒骨干 +2 ──
    {
      name: '笛型香槟杯', hint: '3/4 杯', aspect: 2.2, stem: true, size: 1.25,
      profile: function (t) { return 0.27 + 0.12 * t; },
      zones: { q: [0.62, 0.88] } // 细长杯：整体偏快，余量小
    },
    {
      name: '细颈胆瓶', hint: '过肚一半', aspect: 1.9, stem: false, size: 1.06,
      profile: function (t) { return 0.24 + 0.70 * gauss(t, 0.30, 0.22); },
      zones: { q: [0.40, 0.64] } // 低肚细颈：过颈后猛地加速
    },
    // ── 段位5 · 茶道宗师 +2 ──
    {
      name: '收腰美人杯', hint: '过半腰', aspect: 1.9, stem: false, size: 1.06,
      profile: function (t) { return 0.40 + 0.36 * Math.abs(Math.cos(Math.PI * t)); },
      zones: { q: [0.50, 0.76] } // 中部收腰：过腰时突然加速
    },
    {
      name: '火箭细杯', hint: '满杯为宜', aspect: 3.0, stem: false, size: 0.65,
      profile: function (t) { return 0.24 + 0.10 * t; },
      zones: { q: [0.74, 0.98] } // 全库最细：手一抖就溢出
    },
    // ── 段位6 · 暖奶寿星 +2 ──
    {
      name: '葫芦杯', hint: '适量', aspect: 1.7, stem: false, size: 1.0,
      profile: function (t) { return 0.14 + 0.66 * gauss(t, 0.26, 0.20) + 0.46 * gauss(t, 0.80, 0.15); },
      zones: { q: [0.40, 0.68] } // 双肚异型：两段慢速平台夹着快喉
    },
    {
      name: '宽口巨缸', hint: '八分满', aspect: 0.55, stem: false, size: 1.35,
      profile: function (t) { return t < 0.07 ? 0.80 + 0.15 * (t / 0.07) : 0.95; },
      zones: { q: [0.68, 0.92] } // 全库最宽：倒半天不见涨
    }
  ];

  // 统一难度规则：绿色完美区贴合格带顶部，宽为总带的 1/3（下方黄色可见区 = 绿的 2 倍）
  // 合格带总宽至少 0.24，保证绿区 ≥0.08 —— 反应 overshoot 有落点，难但不至于无解
  CUPS.forEach(function (cup) {
    var q = cup.zones.q;
    var qw = Math.max(q[1] - q[0], 0.24);
    q[0] = Math.round(Math.max(0.15, q[1] - qw) * 1000) / 1000;
    var pw = (q[1] - q[0]) / 3;
    cup.zones.p = [Math.round((q[1] - pw) * 1000) / 1000, q[1]];
  });

  // ---------- 饮品库 ----------
  var DRINKS = [
    { name: '清水', color: '#3FA7FF', deep: '#1E7FD9' },
    { name: '绿茶', color: '#B8D97A', deep: '#8FB84E' },
    { name: '红茶', color: '#B4692E', deep: '#8A4A1C' },
    { name: '红酒', color: '#8E2434', deep: '#6B1424' },
    { name: '白酒', color: '#EDF5FB', deep: '#C7DCEC' },
    { name: '橙汁', color: '#F6A83C', deep: '#E0861A' },
    { name: '可乐', color: '#40251A', deep: '#241209' } // 品牌植入预留位：可替换为合作品牌色
  ];

  // ---------- 饮品专属文案 ----------
  // 按段位饮品 key 预设多句，完美一杯（+2）时随机弹出，保证文与饮相符
  var LINES = {
    milk: [
      '奶要温，手要稳，心要静。',
      '咕咚咕咚，是长高高的声音。',
      '奶瓶在手，天下我有。',
      '满满一杯，是童年的安全感。'
    ],
    cola: [
      '气泡冲上来的瞬间，快乐也是。',
      '快乐水不洒，才是真本事。',
      '冰镇可乐，倒满才算尊重夏天。',
      '手抖一下，气泡就少一分。'
    ],
    beer: [
      '啤酒九分满，泡沫不越位。',
      '干杯之前，先别洒。',
      '麦芽的香气，值得稳稳一倒。',
      '泡沫是啤酒的皇冠，别碰掉了。'
    ],
    wine: [
      '红酒只倒三分之一，留余地也留香气。',
      '晃杯之前，先学会倒杯。',
      '三分之一杯，是红酒的礼仪。',
      '深红的液体里，住着一整片葡萄园。'
    ],
    baijiu: [
      '白酒满杯，代表对敬酒之人的尊敬。',
      '酒满敬人，茶满欺人。',
      '分酒器里见功夫。',
      '一杯白酒，一份担当。'
    ],
    tea: [
      '茶倒七分满，留得三分是情谊。',
      '壶嘴低一分，茶香多一分。',
      '好茶不怕细水慢斟。',
      '茶桌上见人品，水线里见功夫。'
    ],
    warmmilk: [
      '睡前一杯温奶，补钙也补梦。',
      '转了一大圈，还是这杯奶最暖。',
      '慢慢倒，岁月不着急。',
      '奶还是那个奶，手更稳了。'
    ]
  };

  function randomLine(key) {
    var arr = LINES[key] || LINES.milk;
    return arr[Math.floor(Math.random() * arr.length)];
  }

  // 首杯固定从最简单的 3 个里出；不带参数则全池均匀随机
  function randomCup(forceSimple) {
    var n = typeof forceSimple === 'number' ? 3 : CUPS.length;
    return CUPS[Math.floor(Math.random() * n)];
  }

  // 按段位解锁数量随机：前 cupCount 个杯型内均匀随机
  function randomCupRange(cupCount) {
    var n = Math.max(3, Math.min(CUPS.length, cupCount));
    return CUPS[Math.floor(Math.random() * n)];
  }

  // ---------- 段位体系 · 倒水人生 ----------
  // 人生阶段 × 饮品：小孩→上学→毕业→职场新人→中坚→老人→寿星（喝奶补钙，人生闭环）
  // cupCount = 该段位解锁的杯型数量（10 + 2 × 段位索引，共 22 种杯型）
  var TIERS = [
    { key: 'milk',     name: '奶瓶萌新', stage: '小孩',     drinkName: '牛奶', score: 0,   cupCount: 10, pourRate: 0.338, alpha: 1.0, bubbles: false, gradSoft: 0.55,
      line: '人生的第一杯，要稳稳的。', wisdom: '小时候嫌奶淡，长大后才懂：最纯的甜，都在第一杯里。', color: '#FFFFFF', deep: '#E3D5B5', foam: false },
    { key: 'cola',     name: '可乐少年', stage: '上学',     drinkName: '可乐', score: 20,  cupCount: 12, pourRate: 0.338, alpha: 0.90, bubbles: true,
      line: '快乐水配暑假，倒多少都是自由。', wisdom: '气泡再欢腾也会散去，快乐水教我的事：趁有气，大口喝。', color: '#40251A', deep: '#241209', foam: false },
    { key: 'beer',     name: '啤酒青年', stage: '大学/毕业', drinkName: '啤酒', score: 60,  cupCount: 14, pourRate: 0.338, alpha: 0.85, bubbles: true,
      line: '泡沫升起来的时候，青春也是。', wisdom: '泡沫是啤酒的皇冠，也是青春的——看着满，抿一口才知真假。', color: '#F2B33D', deep: '#D98E1B', foam: true },
    { key: 'wine',     name: '红酒新秀', stage: '职场新人', drinkName: '红酒', score: 120, cupCount: 16, pourRate: 0.338, alpha: 0.82, bubbles: false,
      line: '只倒三分之一——职场第一课：留余地。', wisdom: '红酒只倒三分满。杯留余地，人也留余地，香气才进得来。', color: '#8E2434', deep: '#6B1424', foam: false },
    { key: 'baijiu',   name: '白酒骨干', stage: '职场中坚', drinkName: '白酒', score: 200, cupCount: 18, pourRate: 0.338, alpha: 0.50, bubbles: false,
      line: '这一杯，敬客户，也敬自己。', wisdom: '酒满敬人，话满误事。这一杯的分寸，是二十年饭局换的。', color: '#EDF5FB', deep: '#C7DCEC', foam: false },
    { key: 'tea',      name: '茶道宗师', stage: '职场老人', drinkName: '茶',   score: 300, cupCount: 20, pourRate: 0.338, alpha: 0.85, bubbles: false,
      line: '七分是茶，三分是分寸。', wisdom: '茶倒七分满，剩下三分是情谊。倒得太满，烫的是端杯的人。', color: '#B4692E', deep: '#8A4A1C', foam: false },
    { key: 'warmmilk', name: '暖奶寿星', stage: '老人',     drinkName: '温奶', score: 500, cupCount: 22, pourRate: 0.338, alpha: 1.0, bubbles: false, gradSoft: 0.55,
      line: '转了一大圈，又回到一杯奶。这一杯，敬岁月。', wisdom: '从奶瓶到酒杯又回到奶瓶。人生闭环，暖的都是同一个胃。', color: '#FFFFFF', deep: '#E3D5B5', foam: false }
  ];

  // ---------- 段位配置覆盖（src/tiers.config.js 可调脚本） ----------
  // 浏览器：window.TierConfig（index.html 先于 cups.js 加载）
  // 微信端 / Node：自动 require('./tiers.config.js')
  // 仅覆盖出现的字段；未写字段回落上方默认值。配错（空数组等）自动忽略。
  (function applyTierConfig() {
    var cfg = null;
    try {
      if (typeof module !== 'undefined' && module.exports) cfg = require('./tiers.config.js');
      else if (typeof GameGlobal !== 'undefined' && GameGlobal.TierConfig) cfg = GameGlobal.TierConfig;
      else if (typeof self !== 'undefined' && self.TierConfig) cfg = self.TierConfig;
      else if (typeof this !== 'undefined' && this && this.TierConfig) cfg = this.TierConfig;
    } catch (e) { cfg = null; }
    if (!cfg || !cfg.length) return;
    var FIELDS = ['name', 'stage', 'score', 'pourRate', 'cupCount', 'line', 'wisdom'];
    for (var i = 0; i < cfg.length; i++) {
      var c = cfg[i];
      if (!c || !c.key) continue;
      for (var j = 0; j < TIERS.length; j++) {
        if (TIERS[j].key !== c.key) continue;
        for (var k = 0; k < FIELDS.length; k++) {
          var f = FIELDS[k];
          if (c[f] !== undefined && c[f] !== null) TIERS[j][f] = c[f];
        }
        break;
      }
    }
  })();

  // 按累计得分计算段位索引
  function tierFor(totalScore) {
    var idx = 0;
    for (var i = 0; i < TIERS.length; i++) {
      if (totalScore >= TIERS[i].score) idx = i;
    }
    return idx;
  }

  function randomDrink() {
    return DRINKS[Math.floor(Math.random() * DRINKS.length)];
  }

  // 预计算杯型平均半宽（用于水位上升速度归一化）
  function avgWidth(cup) {
    var s = 0, N = 40;
    for (var i = 0; i <= N; i++) s += cup.profile(i / N);
    return s / (N + 1);
  }

  return {
    randomCup: randomCup,
    randomCupRange: randomCupRange,
    randomDrink: randomDrink,
    randomLine: randomLine,
    avgWidth: avgWidth,
    TIERS: TIERS,
    tierFor: tierFor,
    LINES: LINES,
    CUPS: CUPS
  };
});
