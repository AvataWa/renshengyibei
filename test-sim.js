// 无头模拟：用桩 ctx 驱动游戏主循环，覆盖 菜单→游玩→判定→失败→结算→重开 全流程
const Game = require('./src/game.js');

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

function makeEnv() {
  let startCb = () => {}, endCb = () => {};
  return {
    canvas: { width: 750, height: 1334, getContext: () => mockCtx() },
    ctx: mockCtx(),
    W: 375, H: 667,
    onTouchStart: (cb) => { startCb = cb; },
    onTouchEnd: (cb) => { endCb = cb; },
    getStorage: () => '',
    setStorage: () => {},
    vibrate: () => {},
    share: () => {},
    _press: (x, y) => startCb(x, y),
    _release: () => endCb()
  };
}

const env = makeEnv();
const game = new Game(env);

// 手动驱动 update/render（不走 requestAnimationFrame）
function step(seconds) {
  const dt = 1 / 60;
  for (let t = 0; t < seconds; t += dt) { game.update(dt); game.render(); }
}

// 1. 主界面渲染 + 按钮（商城已隐藏：0=分享 1=排名 2=设置）
step(1);
env._press(game.menuButtons[1].x, game.menuButtons[1].y); // 排名
step(0.2);
env._press(game.W / 2, game.overlayClose.y + 5); // 关闭
step(0.2);
env._press(game.menuButtons[2].x, game.menuButtons[2].y); // 设置
step(0.2);
if (game.vibrateToggle) env._press(game.vibrateToggle.x + 5, game.vibrateToggle.y + 5); // 切换震动
step(0.2);
env._press(game.W / 2, game.overlayClose.y + 5);
env._press(game.menuButtons[0].x, game.menuButtons[0].y); // 分享
step(0.2);
console.log('菜单流程 OK, overlay =', game.overlay);

// 2. 多轮游玩：随机按住不同时长，覆盖 成功(+1/+2)/失败/溢出
let wins = 0, fails = 0, choices = 0;
env._press(10, 10); // 菜单任意位置开始游戏
for (let round = 0; round < 200 && game.state !== 'menu'; round++) {
  if (game.state === 'over') {
    fails++;
    env._press(game.overButtons[0].x + 5, game.overButtons[0].y + 5); // 再来一局
    step(0.2);
    continue;
  }
  // 等到 aim 阶段（途中遇到人生选择：自动点第一张卡；反转模式：按住即定格）
  let guard = 0;
  while (game.phase !== 'aim' && guard++ < 600) {
    if (game.phase === 'choice' && game.choiceRects && game.choiceRects.length) {
      const r = game.choiceRects[0];
      env._press(r.x + 5, r.y + 5); // 点选第一张卡（1 秒误触锁内会被忽略，下帧再点）
      choices++;
      step(0.3);
    } else if (game.phase === 'choice2' && game.choice2Rects && game.choice2Rects.length) {
      const r2 = game.choice2Rects[0];
      env._press(r2.x + 5, r2.y + 5);
      choices++;
      step(0.3);
    } else if (game.phase === 'press' && game.reverseCups > 0) {
      step(0.6);
      env._press(10, 10); // 反转模式：点按定格
      step(1.2);
    } else {
      step(1 / 60);
    }
  }
  if (game.phase !== 'aim') break;
  const holdTime = 0.3 + Math.random() * 2.2;
  env._press(10, 10); // 按住
  step(holdTime);
  env._release(); // 松手
  step(1.5); // 等判定
  if (game.state === 'over') { fails++; env._press(game.overButtons[0].x + 5, game.overButtons[0].y + 5); step(0.2); }
  else if (game.phase === 'next') { wins++; step(1.0); }
}
console.log(`游玩模拟 OK: 成功 ${wins} 杯, 失败 ${fails} 次, 抽卡 ${choices} 次, 当前分数 ${game.score}, 最高 ${game.best}`);

// 3. 结算界面按钮
if (game.state !== 'over') {
  // 制造一次失败
  let guard = 0;
  while (game.phase !== 'aim' && guard++ < 600) {
    if (game.phase === 'choice' && game.choiceRects && game.choiceRects.length) {
      const r = game.choiceRects[0];
      env._press(r.x + 5, r.y + 5);
      step(0.3);
    } else if (game.phase === 'choice2' && game.choice2Rects && game.choice2Rects.length) {
      const r2 = game.choice2Rects[0];
      env._press(r2.x + 5, r2.y + 5);
      step(0.3);
    } else if (game.phase === 'press' && game.reverseCups > 0) {
      step(3.0); // 反转模式：不定格，等水溢出
    } else {
      step(1 / 60);
    }
  }
  if (game.phase === 'aim') { env._press(10, 10); step(3.0); env._release(); step(1.5); } // 必然溢出
  else step(3.0);
}
if (game.state === 'over') {
  env._press(game.overButtons[2].x + 5, game.overButtons[2].y + 5); // 分享战绩
  step(0.2);
  env._press(game.overButtons[1].x + 5, game.overButtons[1].y + 5); // 返回主页
  step(0.2);
  console.log('结算流程 OK, state =', game.state);
} else {
  console.log('注意：未进入结算，state =', game.state, 'phase =', game.phase);
}
console.log('全部模拟通过，无运行时错误');
