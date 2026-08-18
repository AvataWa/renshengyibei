// 段位系统专项测试：win() 本局分升段、跨段、失败重开归零、杯型随段位累计解锁
const Game = require('./src/game.js');
const Cups = require('./src/cups.js');
const assert = require('assert');

function mockCtx() {
  const noop = () => {};
  return new Proxy({}, {
    get(t, k) {
      if (k === 'measureText') return () => ({ width: 50 });
      if (k === 'createLinearGradient') return () => ({ addColorStop: noop });
      if (k === 'getContext') return () => mockCtx();
      return noop;
    },
    set() { return true; }
  });
}

function makeEnv(storage) {
  return {
    canvas: { width: 750, height: 1334, getContext: () => mockCtx() },
    ctx: mockCtx(),
    W: 375, H: 667,
    assets: { containers: [] }, // 无贴图，走空值保护分支
    onTouchStart: () => {}, onTouchEnd: () => {},
    getStorage: (k) => storage[k] || '',
    setStorage: (k, v) => { storage[k] = String(v); },
    vibrate: () => {}, share: () => {}
  };
}

// 首杯固定池 = 最简单的前 3 个杯型
const SIMPLE = Cups.CUPS.slice(0, 3).map((c) => c.name);
const cupIndex = (name) => Cups.CUPS.findIndex((c) => c.name === name);

// 1. 从零开始：连续胜利跨越两个段位
let storage = {};
let game = new Game(makeEnv(storage));
assert.strictEqual(game.tierIdx, 0, '初始段位应为 0');
game.newRound(); // 初始化 cup/drink（游戏中由开局流程调用）
assert.strictEqual(game.drink.name, '牛奶', '初始饮品应为牛奶');
assert.ok(SIMPLE.includes(game.cup.name), '第一杯应为简单杯型');

function winOnce() {
  game.newRound();
  game.win(1, '成功');
  game.update(1 / 60); game.render(); // 让 floats/toast 跑一帧
}

for (let i = 0; i < 20; i++) winOnce(); // 本局 20 分 → 段位1 可乐少年
assert.strictEqual(game.score, 20, '本局分应为 20');
assert.strictEqual(game.tierIdx, 1, '20 分应升到可乐少年');
game.newRound();
assert.strictEqual(game.drink.name, '可乐', '段位1饮品应为可乐');
console.log('跨段 0→1 OK：', Cups.TIERS[game.tierIdx].name, '/', game.drink.name);

for (let i = 0; i < 40; i++) winOnce(); // 本局 60 分 → 段位2 啤酒青年
assert.strictEqual(game.tierIdx, 2, '60 分应升到啤酒青年');
game.newRound();
assert.strictEqual(game.drink.name, '啤酒', '段位2饮品应为啤酒');
console.log('跨段 1→2 OK：', Cups.TIERS[game.tierIdx].name, '/', game.drink.name);

// 1b. 失败后重开 = 回到 0 段倒奶（完全从头开始）
game.startGame();
assert.strictEqual(game.tierIdx, 0, '重开后段位应回到 0（倒奶）');
assert.strictEqual(game.score, 0, '重开后分数应清零');
assert.strictEqual(game.drink.name, '牛奶', '重开后第一杯应为牛奶');
console.log('失败重开回到 0 段倒奶 OK');

// 2. 主界面段位跟随历史最高分（暖奶寿星 500 分）；暖奶寿星回到倒奶杯池（人生闭环）
storage = { best: '500' };
game = new Game(makeEnv(storage));
assert.strictEqual(game.tierIdx, 6, '历史最高 500 分应显示暖奶寿星');
game.newRound();
assert.strictEqual(game.drink.name, '温奶', '暖奶寿星回到奶（人生闭环）');
const seen = new Set();
for (let i = 0; i < 600; i++) {
  const cup = Cups.randomCupTier(6, Cups.TIERS[6].cupCount);
  assert.strictEqual(cup.pool, 0, '暖奶寿星应用倒奶杯池: ' + cup.name);
  seen.add(cup.name);
}
assert.strictEqual(seen.size, 20, '倒奶杯池应有 20 个杯型，实际：' + seen.size);
console.log('暖奶寿星杯池（=倒奶池）覆盖 OK：', seen.size, '个');

// 3. 段位杯池互相独立（段位3 = 红酒池前 cupCount 个，不串池）
storage = { best: '120' };
game = new Game(makeEnv(storage));
assert.strictEqual(game.tierIdx, 3, '历史最高 120 分应显示红酒新秀');
const cupCount = Cups.TIERS[3].cupCount;
for (let i = 0; i < 400; i++) {
  const cup = Cups.randomCupTier(3, cupCount);
  assert.strictEqual(cup.pool, 3, '红酒段位不应抽到别的杯池: ' + cup.name);
  const winePool = Cups.CUPS.filter((c) => c.pool === 3);
  assert.ok(winePool.indexOf(cup) < cupCount, '杯型不应超出杯池前 N 个: ' + cup.name);
}
console.log('段位3独立杯池 OK（红酒池取前', cupCount, '个）');

// 4. 每局第一杯固定从本段杯池最简单 3 个里出
game.newRound();
const tier3Simple = Cups.CUPS.filter((c) => c.pool === 3).slice(0, 3).map((c) => c.name);
assert.ok(tier3Simple.includes(game.cup.name), '每局第一杯应为本段杯池的简单杯型');

// 5. 菜单徽章 + 结算段位行渲染不报错
game.state = 'menu'; game.render();
game.state = 'over'; game.failReason = '测试'; game.render();
game.totalScore = 500; game.tierIdx = 6; game.render(); // 最高段位的"已达最高段位"分支
console.log('菜单徽章 + 结算段位行渲染 OK');

console.log('\n段位系统全部测试通过');
