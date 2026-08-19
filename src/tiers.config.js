/**
 * 段位配置脚本（可调）
 * ---------------------------------------------------------------
 * 修改本文件即可调整每个段位的数值，无需改游戏代码。
 * 浏览器端：由 index.html 在 cups.js 之前加载（挂 window.TierConfig）
 * 微信端 / Node 端：由 cups.js 自动 require('./tiers.config.js')
 *
 * 每项字段说明：
 *   key       段位标识（勿改，对应饮品/容器/杯型绑定）
 *   name      段位名（主界面/局内/结算展示）
 *   stage     人生阶段名（目前仅存档用，结算不再展示）
 *   score     需要达到的【本局分数】，达到即晋升该段位（= steps[0]）
 *   steps     段内 3 阶的分数门槛 [一阶, 二阶, 三阶]，如 [55,65,75]
 *   stages    段内 3 阶的后缀名，展示为「段位名·后缀」，如 职场新人·初入
 *   pourRate  按压后倒水速度系数（默认 0.338，越大倒得越快越难）
 *   cupCount  该段位杯池取前 N 个杯型（每段独立 20 杯池，N 最大 20）
 *   line      晋升该段位时的提示文案
 *   wisdom    结算页显示的该段位人生小哲理（50 字以内）
 * ---------------------------------------------------------------
 * 2026-08-19 人生选择版本：引入三选一加成后整体得分变快，
 * 段位门槛整体上调约 1.6~1.8 倍，保持「岁月回甘」的可达性与含金量。
 * ---------------------------------------------------------------
 */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.TierConfig = factory();
})(typeof GameGlobal !== 'undefined' ? GameGlobal : (typeof self !== 'undefined' ? self : this), function () {
  return [
    {
      key: 'milk', name: '人类幼崽', stage: '小孩',
      score: 0,
      pourRate: 0.3, cupCount: 20,
      line: '人生的第一杯，要稳稳的。',
      wisdom: '小时候嫌奶淡，长大后才懂：最纯的甜，都在第一杯里。'
    },
    {
      key: 'cola', name: '元气少年', stage: '上学',
      score: 15,
      pourRate: 0.45, cupCount: 12,
      line: '快乐水配暑假，倒多少都是自由。',
      wisdom: '气泡再欢腾也会散去，快乐水教我的事：趁有气，大口喝。'
    },
    {
      key: 'beer', name: '未来可期', stage: '大学/毕业',
      score: 40,
      pourRate: 0.5, cupCount: 14,
      line: '泡沫升起来的时候，青春也是。',
      wisdom: '泡沫是啤酒的皇冠，也是青春的——看着满，抿一口才知真假。'
    },
    {
      key: 'wine', name: '职场新人', stage: '职场新人',
      score: 90, steps: [90, 105, 120], stages: ['初入', '上手', '转正'],
      pourRate: 0.55, cupCount: 16,
      line: '只倒三分之一——职场第一课：留余地。',
      wisdom: '红酒只倒三分满。杯留余地，人也留余地，香气才进得来。'
    },
    {
      key: 'baijiu', name: '职场中坚', stage: '职场中坚',
      score: 150, steps: [150, 170, 190], stages: ['扛事', '带队', '掌局'],
      pourRate: 0.6, cupCount: 18,
      line: '这一杯，敬客户，也敬自己。',
      wisdom: '酒满敬人，话满误事。这一杯的分寸，是二十年饭局换的。'
    },
    {
      key: 'tea', name: '人间清醒', stage: '职场老人',
      score: 230, steps: [230, 255, 280], stages: ['观局', '知止', '不惑'],
      pourRate: 0.65, cupCount: 10,
      line: '七分是茶，三分是分寸。',
      wisdom: '茶倒七分满，剩下三分是情谊。倒得太满，烫的是端杯的人。'
    },
    {
      key: 'warmmilk', name: '岁月回甘', stage: '老人',
      score: 330, steps: [330, 365, 400], stages: ['回甘', '归简', '圆满'],
      pourRate: 0.7, cupCount: 22,
      line: '转了一大圈，又回到一杯奶。这一杯，敬岁月。',
      wisdom: '从奶瓶到酒杯又回到奶瓶。人生闭环，暖的都是同一个胃。'
    }
  ];
});
