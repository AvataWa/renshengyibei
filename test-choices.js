// 人生选择系统专项测试：全池效果冒烟 + 触发链路 + 关键效果校验
const Game = require('./src/game.js');
const Choices = require('./src/choices.js');
const Cups = require('./src/cups.js');

function mockCtx() {
  const noop = () => {};
  return new Proxy({}, {
    get(t, k) {
      if (k === 'measureText') return () => ({ width: 50 });
      if (k === 'createLinearGradient') return () => ({ addColorStop: noop });
      return noop;
    },
    set() { return true; }
  });
}
function makeGame() {
  const env = {
    canvas: { width: 750, height: 1334, getContext: () => mockCtx() },
    ctx: mockCtx(), W: 375, H: 667,
    onTouchStart: () => {}, onTouchEnd: () => {},
    getStorage: () => '', setStorage: () => {}, vibrate: () => {}, share: () => {}
  };
  const g = new Game(env);
  g.startGame();
  return g;
}
function step(g, seconds) {
  const dt = 1 / 60;
  for (let t = 0; t < seconds; t += dt) { g.update(dt); g.render(); }
}

let pass = 0, failCount = 0;
function ok(cond, msg) {
  if (cond) { pass++; } else { failCount++; console.log('  ✗', msg); }
}

// 1. 全池冒烟：每个选项都能应用且不抛异常
console.log('1. 全池 94 项效果冒烟');
ok(Choices.POOL.length === 94, '选项池应为 94 项，实际 ' + Choices.POOL.length);
for (const opt of Choices.POOL) {
  try {
    const g = makeGame();
    g.tierIdx = opt.tiers ? opt.tiers[opt.tiers.length - 1] : 3;
    g.score = Cups.TIERS[g.tierIdx].score;
    g.applyChoice(opt);
    step(g, 0.5); // 推进若干帧（含 newRound/绘制）
  } catch (e) {
    failCount++;
    console.log('  ✗ 应用失败', opt.id, opt.name, e.message);
  }
}
console.log('   冒烟完成');

// 2. 触发链路：升段 → pendingChoice → choice 相位 → 点选 → 继续游戏
console.log('2. 触发链路');
{
  const g = makeGame();
  const colaScore = Cups.TIERS[1].score;
  g.score = colaScore - 2; // 差 2 分升段
  g.win(2, '完美!');
  ok(!!g.pendingChoice, '升段后应生成三选一');
  ok(g.pendingChoice.length === 3, '应有 3 张卡，实际 ' + (g.pendingChoice || []).length);
  step(g, 0.6); // next 相位结束
  ok(g.phase === 'choice', '应进入 choice 相位，实际 ' + g.phase);
  step(g, 0.1); // 渲染出 choiceRects
  ok(g.choiceRects && g.choiceRects.length === 3, '应有 3 个卡片热区');
  // 1 秒误触锁：面板刚弹出时点击不生效
  g.onPress(g.choiceRects[1].x + 5, g.choiceRects[1].y + 5);
  ok(g.pendingChoice !== null, '弹出 1 秒内点击应被忽略（防误触）');
  step(g, 1.1); // 锁定期结束
  const before = g.round;
  g.onPress(g.choiceRects[1].x + 5, g.choiceRects[1].y + 5); // 点中间卡
  ok(g.pendingChoice === null, '点选后清空待选');
  ok(g.round === before + 1, '点选后应进入下一杯');
  ok(g.phase === 'aim' || g.phase === 'press', '应回到倒水相位，实际 ' + g.phase);
  ok(g.chosenList.length === 1, '已做选择应记录 1 条，实际 ' + g.chosenList.length);
}

// 3. 关键效果校验
console.log('3. 关键效果校验');
{
  // B1 按时吃饭：目标区变宽（applyChoice 会换新杯，直接校验 mods 倍率避免随机杯型干扰）
  const g = makeGame();
  g.applyChoice(Choices.POOL.find(c => c.id === 'B1'));
  ok(g.mods.completeScale === 1.1, 'B1 合格区倍率应为 1.1，实际 ' + g.mods.completeScale);
  ok(g.mods.perfectScale === 1.1, 'B1 完美区倍率应为 1.1，实际 ' + g.mods.perfectScale);

  // D2 彩票中奖：立即 +40（加分钳制在下段门槛前，选择不再改变段位）
  const g2 = makeGame();
  g2.applyChoice(Choices.POOL.find(c => c.id === 'D2'));
  ok(g2.score === Cups.TIERS[1].score - 1, 'D2 应顶到下段门槛前（' + (Cups.TIERS[1].score - 1) + '），实际 ' + g2.score);
  ok(g2.tierIdx === 0, 'D2 后段位应保持不变');

  // D1 天赐良机：连击上限 5
  const g3 = makeGame();
  g3.applyChoice(Choices.POOL.find(c => c.id === 'D1'));
  g3.perfectStreak = 3;
  const pts0 = g3.score;
  g3.win(2, '完美!'); // 4 连完美
  ok(g3.score - pts0 === 5, 'D1 后 4 连完美应得 5 分，实际 ' + (g3.score - pts0));

  // B5 体检报告正常：失败保护不结算
  const g4 = makeGame();
  g4.applyChoice(Choices.POOL.find(c => c.id === 'B5'));
  g4.fail('倒得太满啦');
  ok(g4.state === 'play' && g4.phase === 'next', 'B5 失败保护应原地续杯，实际 ' + g4.state + '/' + g4.phase);
  ok(g4.mods.failProtect === 0, 'B5 保护次数应消耗');

  // D15 拆迁到账：总分 ×1.5
  const g8 = makeGame();
  g8.tierIdx = 4; g8.score = 100;
  g8.applyChoice(Choices.POOL.find(c => c.id === 'D15'));
  ok(g8.score === 150, 'D15 应 ×1.5，实际 ' + g8.score);

  // D3 贵人相助：2 次失败保护
  const g9 = makeGame();
  g9.applyChoice(Choices.POOL.find(c => c.id === 'D3'));
  ok(g9.mods.failProtect === 2, 'D3 应给 2 次失败保护，实际 ' + g9.mods.failProtect);

  // D8 时间的玫瑰：完美区随连击扩大，上限 +50%
  const g10 = makeGame();
  g10.applyChoice(Choices.POOL.find(c => c.id === 'D8'));
  const baseW = g10.effZones().p; const basePw = baseW[1] - baseW[0];
  g10.perfectStreak = 20; // 20 连 × 5% = +100%，应被钳到 +50%
  const grown = g10.effZones().p;
  ok(Math.abs((grown[1] - grown[0]) - basePw * 1.5) < 1e-9, 'D8 连击扩大应封顶 +50%，实际倍率 ' + ((grown[1] - grown[0]) / basePw));

  // C10 背水一战：完成区关闭（判定 + 渲染标记一致）
  const g11 = makeGame();
  g11.applyChoice(Choices.POOL.find(c => c.id === 'C10'));
  ok(g11.mods.noCompleteZone === true, 'C10 应关闭完成区');
  g11.level = (g11.effZones().q[0] + g11.effZones().q[1]) / 2; // 水位落在原完成区
  const sc0 = g11.score;
  g11.judge();
  ok(g11.score === sc0, 'C10 时落在原完成区不应得分');
}

// 4. 阶段专属过滤：0 段抽卡不会出现职场选项
console.log('4. 阶段专属过滤');
{
  const g = makeGame(); // tierIdx = 0
  for (let i = 0; i < 200; i++) {
    const picks = g.rollChoices();
    for (const p of picks) {
      ok(p.tiers == null || p.tiers.indexOf(0) >= 0, '0 段不应刷出 ' + p.id + ' ' + p.name);
    }
    g.usedChoiceIds = {}; // 重置避免池枯竭
  }
  console.log('   过滤校验完成（200 次抽卡）');
}

// 5. 段位之力效果池：结构校验（段位卡 D21-23 已下架，机制保留）
console.log('5. 段位之力效果池');
{
  ok(Array.isArray(Choices.TIER_FX) && Choices.TIER_FX.length === 7, 'TIER_FX 应有 7 个段位池');
  const expect = [5, 5, 5, 4, 5, 5, 5]; // 葡萄之力已删除「前辈提点」
  Choices.TIER_FX.forEach((p, i) => {
    ok(p.length === expect[i], '段位' + i + '应有 ' + expect[i] + ' 条效果，实际 ' + p.length);
    p.forEach(f => ok(!!(f.id && f.name && f.desc && f.fx), '段位' + i + ' 效果应含 id/name/desc/fx'));
  });
  ok(!Choices.POOL.some(c => c.tierDraw), '池中不应再有段位卡（tierDraw 已下架）');
}

// 6. 选择后保杯：非换杯选项不换杯；换杯选项/段位变化才重抽
console.log('6. 选择后保杯');
{
  const g = makeGame();
  const cupName = g.cup.name;
  g.applyChoice(Choices.POOL.find(c => c.id === 'B1')); // 按时吃饭：与杯子无关
  ok(g.cup.name === cupName, 'B1 后应保留当前杯，实际换成 ' + g.cup.name);

  const g2 = makeGame();
  g2.tierIdx = 0; g2.score = 0; g2.newRound();
  const cup2 = g2.cup.name;
  g2.applyChoice(Choices.POOL.find(c => c.id === 'A11')); // 断奶第一课：杯子变高瘦
  ok(g2.cup.name !== cup2, 'A11（换杯选项）后应重新抽杯');

  const g3 = makeGame();
  g3.score = 10;
  const cup3 = g3.cup.name;
  g3.applyChoice(Choices.POOL.find(c => c.id === 'D2')); // 彩票 +40（钳制不跨段）
  ok(g3.tierIdx === 0, 'D2 后段位应保持 0 段，实际 ' + g3.tierIdx);
  ok(g3.cup.name === cup3, '段位未变应保留当前杯');

  // 下一局恢复默认：startGame 后杯型重新随机、修正清零
  const g4 = makeGame();
  g4.applyChoice(Choices.POOL.find(c => c.id === 'C9')); // 田忌赛马
  g4.startGame();
  ok(g4.mods.invertCups === false && g4._keepCup === false, '重开后杯型修正应恢复默认');
  ok(g4.chosenList.length === 0 && g4.choiceListOpen === false, '重开后已做选择应清空');
}

// 7. 选择不改变段位：池中不得有跨段效果键，且任何选项应用后段位不变
console.log('7. 选择不改变段位');
{
  const BAN = ['jumpNextTier', 'jumpNextStage', 'backTier', 'backStage', 'jumpDownRandom', 'restartMilk'];
  for (const c of Choices.POOL) {
    for (const k of BAN) ok(!(c.fx && c.fx[k] != null), c.id + ' 不应含跨段效果 ' + k);
  }
  // 全池应用一遍：任何选项执行后段位都应保持
  for (const c of Choices.POOL) {
    const g = makeGame();
    g.tierIdx = 2; g.score = Cups.TIERS[2].score + 5;
    const t0 = Cups.tierFor(g.score);
    g.applyChoice(c);
    if (g.phase === 'choice2') { step(g, 1.1); const r0 = g.choice2Rects[0]; g.onPress(r0.x + 5, r0.y + 5); }
    ok(Cups.tierFor(g.score) === t0, c.id + ' 应用后段位不应变化');
  }
  console.log('   跨段效果清理校验完成');
}

// 8. v2 新机制专项
console.log('8. v2 新机制专项');
{
  // U1 断奶的哭声：先苦后甜翻转（0.8 → 1.15）
  const g = makeGame();
  g.applyChoice(Choices.POOL.find(c => c.id === 'U1'));
  ok(Math.abs(g.mods.perfectScale - 0.8) < 1e-9, 'U1 惩罚应立即生效 0.8，实际 ' + g.mods.perfectScale);
  ok(g.curses.length === 1 && g.curses[0].left === 5, 'U1 应挂 5 杯诅咒');
  for (let i = 0; i < 5; i++) g.tickCurses();
  ok(Math.abs(g.mods.perfectScale - 1.15) < 1e-9, 'U1 杯数耗尽应翻转为 1.15，实际 ' + g.mods.perfectScale);
  ok(g.curses.length === 0, 'U1 翻盘后诅咒应移除');

  // C19 挂杯：完美叠层、非完美脱落
  const g2 = makeGame();
  g2.applyChoice(Choices.POOL.find(c => c.id === 'C19'));
  g2.win(2, '完美!');
  ok(g2.foamLayers === 1, 'C19 完美后应有 1 层泡沫，实际 ' + g2.foamLayers);
  g2.win(2, '完美!');
  ok(g2.foamLayers === 2, 'C19 二连完美应有 2 层，实际 ' + g2.foamLayers);
  g2.win(1, '不错!');
  ok(g2.foamLayers === 0, 'C19 非完美应全部脱落');

  // B26 退路基金：≥10 自动抵失败
  const g3 = makeGame();
  g3.applyChoice(Choices.POOL.find(c => c.id === 'B26'));
  g3.fundBal = 10;
  g3.fail('倒得太满啦');
  ok(g3.state === 'play' && g3.phase === 'next', 'B26 基金应挡下失败，实际 ' + g3.state + '/' + g3.phase);
  ok(g3.fundBal === 0, 'B26 基金应扣 10，实际 ' + g3.fundBal);

  // C23 重来一杯：悔棋进入 lastChance 并可回滚
  const g4 = makeGame();
  g4.applyChoice(Choices.POOL.find(c => c.id === 'C23'));
  ok(g4.redoLeft === 2, 'C23 应给 2 次悔棋');
  g4.score = 12; g4.preCup = { score: 10, streak: 1 }; g4.perfectStreak = 0;
  g4.fail('倒得太少啦');
  ok(g4.state === 'play' && g4.phase === 'lastChance', 'C23 失败应进悔棋面板，实际 ' + g4.state + '/' + g4.phase);
  g4.redoCup();
  ok(g4.redoLeft === 1 && g4.score === 10 && g4.perfectStreak === 1, 'C23 悔棋应回滚分数/连击');
  ok(g4.phase === 'aim', 'C23 悔棋后应回到待倒相位，实际 ' + g4.phase);
  // 放弃悔棋 → 真正结算
  g4.redoLeft = 0; g4.score = 12;
  g4.finalizeFail('倒得太满啦');
  ok(g4.phase === 'failed', '放弃悔棋应进入结算相位，实际 ' + g4.phase);

  // B28 茶宠：5 杯养成后每杯 +1
  const g5 = makeGame();
  g5.applyChoice(Choices.POOL.find(c => c.id === 'B28'));
  for (let i = 0; i < 5; i++) g5.win(1, '不错!');
  ok(g5.teapotOn === true && g5.mods.cupBonus === 1, 'B28 养成后 cupBonus 应为 1，实际 ' + g5.mods.cupBonus);

  // D23 茶气通透：完美区宽度免疫缩小
  const g6 = makeGame();
  g6.applyChoice(Choices.POOL.find(c => c.id === 'D23'));
  g6.mods.perfectScale = 0.5;
  const z6 = g6.effZones();
  const base6z = g6.zoneBase || g6.cup.zones;
  const base6 = base6z.p[1] - base6z.p[0];
  ok(Math.abs((z6.p[1] - z6.p[0]) - base6) < 1e-9, 'D23 完美区应锁定基础宽度，实际倍率 ' + ((z6.p[1] - z6.p[0]) / base6));

  // D22 股权池：结算 ×3 兑现
  const g7 = makeGame();
  g7.applyChoice(Choices.POOL.find(c => c.id === 'D22'));
  g7.equityBal = 4;
  const s7 = g7.score;
  g7.finalizeFail('倒得太满啦');
  ok(g7.score === s7 + 12, 'D22 结算应 +12（4 股 ×3），实际 +' + (g7.score - s7));

  // C21 复利账户：每杯存 50%
  const g8 = makeGame();
  g8.applyChoice(Choices.POOL.find(c => c.id === 'C21'));
  g8.win(1, '不错!');
  ok(g8.bankBal > 0, 'C21 账户应有存款，实际 ' + g8.bankBal);

  // A25 汽水洗杯：残量占用
  const g9 = makeGame();
  g9.applyChoice(Choices.POOL.find(c => c.id === 'A25'));
  g9.prevLevel = 0.8;
  g9.newRound();
  ok(Math.abs(g9.level - 0.08) < 1e-9, 'A25 新杯应残留 0.08，实际 ' + g9.level);

  // B23 满杯仪式：2 连完美后第 3 杯完美区 +25%
  const g10 = makeGame();
  g10.applyChoice(Choices.POOL.find(c => c.id === 'B23'));
  const w0 = g10.effZones().p; const pw0 = w0[1] - w0[0];
  g10.perfectStreak = 2;
  const w1 = g10.effZones().p;
  ok(Math.abs((w1[1] - w1[0]) - pw0 * 1.25) < 1e-9, 'B23 第 3 杯完美区应 ×1.25');

  // A22 学饮过渡：松手一次可续倒
  const g11 = makeGame();
  g11.applyChoice(Choices.POOL.find(c => c.id === 'A22'));
  ok(g11.resumeLeft === 1 && g11.mods.resume === true, 'A22 本杯应有 1 次续倒');

  // 目标区随机生成：落在 20%~100% 内，且杯与杯之间有随机变化
  const g12 = makeGame();
  const zA = g12.zoneBase.q[0];
  let differ = false;
  for (let i = 0; i < 10; i++) {
    g12.newRound();
    const zb = g12.zoneBase;
    ok(zb.q[0] >= 0.199 && zb.q[1] <= 0.986, '随机目标区应落在 20%~100% 内，实际 [' + zb.q[0] + ',' + zb.q[1] + ']');
    if (Math.abs(zb.q[0] - zA) > 1e-6) differ = true;
  }
  ok(differ, '连续 10 杯的目标区应有随机变化');

  // 中断保护：按压中切后台 → 撤销按压回到待倒，不判定失败
  const g13 = makeGame();
  g13.onPress(100, 100); // 开始倒水
  ok(g13.phase === 'press' && g13.pressing, '按压后应在倒水中');
  g13.onInterrupt();
  ok(g13.phase === 'aim' && !g13.pressing && !g13.usedPress, '中断后应回到待倒状态，实际 ' + g13.phase);
}

console.log(`\n结果: ${pass} 通过, ${failCount} 失败`);
process.exit(failCount ? 1 : 0);
