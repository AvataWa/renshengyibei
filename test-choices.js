// 人生选择系统专项测试：全池 80 项效果冒烟 + 触发链路 + 关键效果校验
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
console.log('1. 全池 83 项效果冒烟');
ok(Choices.POOL.length === 83, '选项池应为 83 项，实际 ' + Choices.POOL.length);
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

  // D2 彩票中奖：立即 +20（加分钳制在下段门槛前，选择不再改变段位）
  const g2 = makeGame();
  const s2 = g2.score;
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

  // C12 重启人生：得分 ×1.5、完美 −10%（已改为不跨段效果）
  const g5 = makeGame();
  g5.tierIdx = 4; g5.score = Cups.TIERS[4].score;
  g5.applyChoice(Choices.POOL.find(c => c.id === 'C12'));
  ok(g5.tierIdx === 4 && g5.score === Cups.TIERS[4].score, 'C12 不应再改变段位/当前分，实际 ' + g5.tierIdx + '/' + g5.score);
  ok(g5.mods.scoreMult === 1.5, 'C12 得分应 ×1.5，实际 ' + g5.mods.scoreMult);

  // C14 退而不休：锁定段位
  const g6 = makeGame();
  g6.tierIdx = 4; g6.score = Cups.TIERS[4].score;
  g6.applyChoice(Choices.POOL.find(c => c.id === 'C14'));
  g6.win(2, '完美!');
  ok(g6.score <= Cups.TIERS[5].score - 1, 'C14 分数应被锁在下段门槛前，实际 ' + g6.score);

  // A6 高压考核：误触保护关闭
  const g7 = makeGame();
  g7.applyChoice(Choices.POOL.find(c => c.id === 'A6'));
  ok(g7.mods.tapProtect === false, 'A6 应关闭误触保护');

  // D15 拆迁到账：总分 ×1.5
  const g8 = makeGame();
  g8.tierIdx = 4; g8.score = 100;
  g8.applyChoice(Choices.POOL.find(c => c.id === 'D15'));
  ok(g8.score === 150, 'D15 应 ×1.5，实际 ' + g8.score);
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

// 5. 段位之力抽屉：抽段位 → 随机效果生效 / 30% 二选一
console.log('5. 段位之力抽屉');
{
  ok(Array.isArray(Choices.TIER_FX) && Choices.TIER_FX.length === 7, 'TIER_FX 应有 7 个段位池');
  ok(Choices.TIER_FX.every(p => p.length === 5), '每个段位池应有 5 条效果');

  const d21 = Choices.POOL.find(c => c.id === 'D21');
  const d22 = Choices.POOL.find(c => c.id === 'D22');
  const d23 = Choices.POOL.find(c => c.id === 'D23');
  ok(!!(d21 && d21.tierDraw && d22 && d23), 'D21-D23 应为段位卡（tierDraw）');

  // 直接生效路径（反复抽，覆盖 1 条/2 条两种随机结果）
  let single = 0, dual = 0;
  for (let i = 0; i < 120; i++) {
    const g = makeGame();
    g.tierIdx = 2; g.score = Cups.TIERS[2].score;
    g.applyChoice(d21); // tierPick [0,1,2]
    if (g.phase === 'choice2') {
      dual++;
      ok(g.pendingTierFx.length === 2, '二选一应抽出 2 条效果');
      ok(g.pendingTierFx[0].id !== g.pendingTierFx[1].id, '二选一两条不应重复');
      step(g, 1.1); // 渲染 choice2Rects + 度过 1 秒误触锁
      ok(g.choice2Rects && g.choice2Rects.length === 2, '应有 2 个二选一热区');
      const r0 = g.choice2Rects[0];
      g.onPress(r0.x + 5, r0.y + 5);
      ok(g.phase === 'aim' || g.phase === 'press', '选定后应回到倒水相位，实际 ' + g.phase);
      ok(g.usedChoiceIds[g.choice2Rects[0].opt.id] === true, '选定的段位效果应标记已用');
    } else {
      single++;
      ok(g.phase === 'aim' || g.phase === 'press', '单条生效后应回到倒水相位，实际 ' + g.phase);
    }
    step(g, 0.3);
  }
  ok(single > 30, '120 次抽屉应有单条直接生效，实际 ' + single);
  ok(dual > 5, '120 次抽屉应出现二选一（30% 概率），实际 ' + dual);

  // D22 在 3 段抽取：效果必须来自 3/4/5 段池（id 前缀 T3/T4/T5）
  for (let i = 0; i < 60; i++) {
    const g = makeGame();
    g.tierIdx = 3; g.score = Cups.TIERS[3].score;
    const usedBefore = Object.keys(g.usedChoiceIds).length;
    g.applyChoice(d22);
    if (g.phase === 'choice2') {
      for (const f of g.pendingTierFx) ok(/^T[345]/.test(f.id), 'D22 效果应来自 3/4/5 段池: ' + f.id);
      step(g, 1.1); // 渲染 + 度过误触锁
      const r0 = g.choice2Rects[0];
      g.onPress(r0.x + 5, r0.y + 5);
    } else {
      const newIds = Object.keys(g.usedChoiceIds);
      ok(newIds.length === usedBefore + 2, '单条路径应标记抽屉卡+效果卡');
      const fxId = newIds.find(id => /^T/.test(id));
      ok(/^T[345]/.test(fxId || ''), 'D22 单条效果应来自 3/4 段池: ' + fxId);
    }
  }

  // D23 在 6 段抽取：4/5/6 段池都有效
  const g9 = makeGame();
  g9.tierIdx = 6; g9.score = Cups.TIERS[6].score;
  g9.applyChoice(d23);
  ok(g9.phase === 'choice2' || g9.phase === 'aim' || g9.phase === 'press', 'D23 在 6 段应正常生效');
  step(g9, 0.3);
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
  g3.applyChoice(Choices.POOL.find(c => c.id === 'D2')); // 彩票 +20（钳制不跨段）
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

console.log(`\n结果: ${pass} 通过, ${failCount} 失败`);
process.exit(failCount ? 1 : 0);
