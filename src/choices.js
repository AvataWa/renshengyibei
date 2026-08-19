/**
 * 人生选择 · 三选一选项池（升阶/升段时触发）
 * ---------------------------------------------------------------
 * 四类：
 *   A 对而艰难的事（橙）：提升难度同时提升收益
 *   B 踏实稳定的事（绿）：降低难度或稳定提升收益
 *   C 出奇制胜的事（蓝）：改变规则
 *   D 可遇不可求的事（金）：低概率、高收益、无负面（抽卡时每格 8%）
 *
 * 每项字段：
 *   id     唯一标识
 *   cat    类别 A/B/C/D
 *   name   选项名
 *   desc   效果说明（卡片第二行）
 *   flavor 感悟小字（卡片第三行）
 *   tiers  可出现段位（null=全阶段通用；数组=仅这些段位，0 人类幼崽 … 6 岁月回甘）
 *   fx     效果描述对象，由 game.js 的 applyChoice 解释执行
 * ---------------------------------------------------------------
 */
(function (root, factory) {
  var isNode = (typeof module !== 'undefined' && module.exports);
  var C = factory();
  if (isNode) module.exports = C; else root.Choices = C;
})(typeof GameGlobal !== 'undefined' ? GameGlobal : (typeof self !== 'undefined' ? self : this), function () {

  var CATS = {
    A: { label: '对而艰难的事', color: '#E0861A', bg: '#FBEBD2' },
    B: { label: '踏实稳定的事', color: '#2EA85C', bg: '#DFF0E4' },
    C: { label: '出奇制胜的事', color: '#5B8DEF', bg: '#DFE8FB' },
    D: { label: '可遇不可求的事', color: '#B07A12', bg: '#F7E9C8' }
  };

  var POOL = [
    // ────────── A 对而艰难的事 ──────────
    { id: 'A1', cat: 'A', name: '寒窗苦读', desc: '完美范围 −20%，每次完美 +1 分', flavor: '把难的事做久一点，分数会替你记得。', tiers: null, fx: { perfectScale: 0.8, perfectBonus: 1 } },
    { id: 'A2', cat: 'A', name: '凌晨四点的闹钟', desc: '出水速度 +15%，每杯 +1 分', flavor: '别人赖床的时候，你在倒自己的人生。', tiers: null, fx: { pourRateScale: 1.15, cupBonus: 1 } },
    { id: 'A3', cat: 'A', name: '戒糖三十天', desc: '完美 −10%、完成 −10%，每杯 +2 分', flavor: '甜头少了，回甘才显出来。', tiers: null, fx: { perfectScale: 0.9, completeScale: 0.9, cupBonus: 2 } },
    { id: 'A4', cat: 'A', name: '存钱买自由', desc: '完成 −20%，每杯 +1 分，完美再 +1', flavor: '自由不贵，贵的是坚持存钱的日子。', tiers: null, fx: { completeScale: 0.8, cupBonus: 1, perfectBonus: 1 } },
    { id: 'A5', cat: 'A', name: '极限冲刺', desc: '接下来 10 杯出水 +30%，每杯 +2 分', flavor: '冲刺的意义，是知道自己能跑多快。', tiers: null, fx: { rushCups: 10 } },
    { id: 'A6', cat: 'A', name: '高压考核', desc: '取消误触保护，每杯 +1 分', flavor: '没有容错的日子，手更稳了。', tiers: null, fx: { tapProtectOff: true, cupBonus: 1 } },
    { id: 'A7', cat: 'A', name: '精准强迫症', desc: '完美范围 −40%，完美得分 ×2', flavor: '要么完美，要么重来。', tiers: null, fx: { perfectScale: 0.6, perfectDouble: true } },
    { id: 'A8', cat: 'A', name: '创业初期', desc: '完美/完成 −15%，之后得分 ×1.25', flavor: '先勒紧裤腰带，再谈估值。', tiers: null, fx: { perfectScale: 0.85, completeScale: 0.85, scoreMult: 1.25 } },
    { id: 'A9', cat: 'A', name: '日更写作', desc: '完美 −10%，每杯 +1，失败额外 −2 分', flavor: '写字的人没有退路，只有更新。', tiers: null, fx: { perfectScale: 0.9, cupBonus: 1, failPenalty: 2 } },
    { id: 'A10', cat: 'A', name: '双线作战', desc: '目标区变窄 15%，每 5 杯额外 +3 分', flavor: '两手都要抓，两手都得硬。', tiers: null, fx: { completeScale: 0.85, everyN: { n: 5, pts: 3 } } },
    { id: 'A11', cat: 'A', name: '断奶第一课', desc: '杯子变高变瘦，每杯 +1 分', flavor: '人生的第一课，总是有点难咽。', tiers: [0], fx: { cupAspectMul: 1.25, cupBonus: 1 } },
    { id: 'A12', cat: 'A', name: '无糖可乐', desc: '气泡翻涌遮挡视线，每次完美 +2 分', flavor: '没糖的快乐水，喝的是自律。', tiers: [1], fx: { bubbleBoost: true, perfectBonus: 2 } },
    { id: 'A13', cat: 'A', name: '考研二战', desc: '完美 −25%，每次完美 +2 分', flavor: '再来一年的勇气，比分数更贵。', tiers: [2], fx: { perfectScale: 0.75, perfectBonus: 2 } },
    { id: 'A14', cat: 'A', name: '深夜改稿', desc: '完美 −30%，完美一次计 2 连', flavor: '改得动的方案，改不动的 Deadline。', tiers: [3], fx: { perfectScale: 0.7, streakGain: 2 } },
    { id: 'A15', cat: 'A', name: '一口干', desc: '杯型更小更窄，每杯 +2 分', flavor: '感情深，一口干；分寸浅，杯中见。', tiers: [4], fx: { cupSizeMul: 0.8, cupBonus: 2 } },
    { id: 'A16', cat: 'A', name: '茶要七分满', desc: '目标区上移更易溢出，每杯 +2 分', flavor: '七分是茶，十分是烫。', tiers: [5], fx: { zoneShift: 0.08, cupBonus: 2 } },
    { id: 'A17', cat: 'A', name: '回甘要慢品', desc: '出水 +20%，每杯 +2 分', flavor: '回甘这杯奶，倒快了就品不出甜。', tiers: [6], fx: { pourRateScale: 1.2, cupBonus: 2 } },
    { id: 'A18', cat: 'A', name: '转行阵痛', desc: '出水 +25%，每杯 +1 分', flavor: '阵痛是成长的入场券。', tiers: [3, 4], fx: { pourRateScale: 1.25, cupBonus: 1 } },
    { id: 'A19', cat: 'A', name: '独立带娃', desc: '目标区缓缓游移，每杯 +2 分', flavor: '娃在动，目标也在动，心不能动。', tiers: [0, 4], fx: { zoneWander: true, cupBonus: 2 } },
    { id: 'A20', cat: 'A', name: '闭关修炼', desc: '隐藏刻度线，每杯 +2 分', flavor: '心中有尺，杯上无度。', tiers: null, fx: { hideMarks: true, cupBonus: 2 } },

    // ────────── B 踏实稳定的事 ──────────
    { id: 'B1', cat: 'B', name: '按时吃饭', desc: '完美 +10%，完成 +10%', flavor: '三餐规律的人，运气都不会太差。', tiers: null, fx: { perfectScale: 1.1, completeScale: 1.1 } },
    { id: 'B2', cat: 'B', name: '睡够八小时', desc: '完美范围 +10%', flavor: '睡饱了，手自然稳。', tiers: null, fx: { perfectScale: 1.1 } },
    { id: 'B3', cat: 'B', name: '五险一金', desc: '完成范围 +15%', flavor: '稳稳的幸福，先有保障。', tiers: null, fx: { completeScale: 1.15 } },
    { id: 'B4', cat: 'B', name: '每天八杯水', desc: '出水速度 −10%', flavor: '慢慢来，水是慢慢喝的。', tiers: null, fx: { pourRateScale: 0.9 } },
    { id: 'B5', cat: 'B', name: '体检报告正常', desc: '获得 1 次失败保护', flavor: '健康是所有 KPI 的前提。', tiers: null, fx: { failProtect: 1 } },
    { id: 'B6', cat: 'B', name: '定期存款', desc: '每 10 杯额外 +2 分', flavor: '时间会奖励按时存钱的人。', tiers: null, fx: { everyN: { n: 10, pts: 2 } } },
    { id: 'B7', cat: 'B', name: '记账习惯', desc: '提前预告下一杯杯型', flavor: '心里有账，手里有数。', tiers: null, fx: { cupPreview: true } },
    { id: 'B8', cat: 'B', name: '老狗陪伴', desc: '首次轻微超线自动记为完成', flavor: '它不会说话，但一直替你守着。', tiers: null, fx: { overflowForgive: true } },
    { id: 'B9', cat: 'B', name: '按时还贷', desc: '每次升阶/升段额外 +2 分', flavor: '信用是一点点还出来的。', tiers: null, fx: { stageUpBonus: 2 } },
    { id: 'B10', cat: 'B', name: '慢慢来比较快', desc: '出水 −15%，完成 +5%', flavor: '慢不是停，是另一种快。', tiers: null, fx: { pourRateScale: 0.85, completeScale: 1.05 } },
    { id: 'B11', cat: 'B', name: '多喝热水', desc: '完美范围 +12%', flavor: '万能的关心，朴素的真理。', tiers: [0, 6], fx: { perfectScale: 1.12 } },
    { id: 'B12', cat: 'B', name: '小卖部部长', desc: '完成 +15%，预告下一杯', flavor: '全校最懂进货的人。', tiers: [1], fx: { completeScale: 1.15, cupPreview: true } },
    { id: 'B13', cat: 'B', name: '楼下早餐店', desc: '完成范围 +20%', flavor: '豆浆油条管够的日子。', tiers: [2], fx: { completeScale: 1.2 } },
    { id: 'B14', cat: 'B', name: '室友带饭', desc: '完美 +8%，完成 +8%', flavor: '中国好室友，干饭好搭档。', tiers: [2], fx: { perfectScale: 1.08, completeScale: 1.08 } },
    { id: 'B15', cat: 'B', name: '带薪年假', desc: '出水速度 −12%', flavor: '休息也是正经事。', tiers: [3], fx: { pourRateScale: 0.88 } },
    { id: 'B16', cat: 'B', name: '保温杯泡枸杞', desc: '完美 +10%，出水 −5%', flavor: '中年人的浪漫，从保温开始。', tiers: [4], fx: { perfectScale: 1.1, pourRateScale: 0.95 } },
    { id: 'B17', cat: 'B', name: '稳定工作', desc: '完成 +10%，每 5 杯额外 +1 分', flavor: '平凡日子，也有稳定进账。', tiers: [3, 4], fx: { completeScale: 1.1, everyN: { n: 5, pts: 1 } } },
    { id: 'B18', cat: 'B', name: '一壶老茶', desc: '完美范围 +15%', flavor: '老茶耐泡，老友耐处。', tiers: [5], fx: { perfectScale: 1.15 } },
    { id: 'B19', cat: 'B', name: '公园遛弯', desc: '出水速度 −18%', flavor: '遛弯的步速，刚好倒出稳当。', tiers: [6], fx: { pourRateScale: 0.82 } },
    { id: 'B20', cat: 'B', name: '儿女的电话', desc: '完美 +10%，完成 +10%', flavor: '常回家看看，常打电话问问。', tiers: [6], fx: { perfectScale: 1.1, completeScale: 1.1 } },

    // ────────── C 出奇制胜的事 ──────────
    { id: 'C1', cat: 'C', name: '破釜沉舟', desc: '完成 −30%，完美 +30%', flavor: '砸了锅，才知道自己能走多远。', tiers: null, fx: { completeScale: 0.7, perfectScale: 1.3 } },
    { id: 'C2', cat: 'C', name: '孤注一掷', desc: '10 杯内只有完美才得分，完美 ×2', flavor: '赌一把大的，输赢都精彩。', tiers: null, fx: { onlyPerfectCups: 10 } },
    { id: 'C3', cat: 'C', name: '时间复利', desc: '出水前快后慢，按压越久越慢', flavor: '把时间拉长，急水也变缓。', tiers: null, fx: { timeSlow: true } },
    { id: 'C4', cat: 'C', name: '反其道而行', desc: '水流自倒，点按定格（5 杯），每杯 +3', flavor: '反过来试试，世界照样转。', tiers: null, fx: { reverseCups: 5, cupBonus: 3 } },
    { id: 'C5', cat: 'C', name: '镜像人生', desc: '目标区整体下移，完美 +20%', flavor: '换个方向倒水，也是人生。', tiers: null, fx: { zoneShift: -0.1, perfectScale: 1.2 } },
    { id: 'C6', cat: 'C', name: '错位竞争', desc: '目标区每杯随机变化，每杯 +2 分', flavor: '不在别人的赛道上卷。', tiers: null, fx: { zoneRandom: true, cupBonus: 2 } },
    { id: 'C7', cat: 'C', name: '大开大合', desc: '杯型大小差异翻倍，每杯 +1 分', flavor: '格局打开，杯子也是。', tiers: null, fx: { sizeVariance: true, cupBonus: 1 } },
    { id: 'C8', cat: 'C', name: '轻装上阵', desc: '接下来 10 杯统一直筒杯', flavor: '行李少了，路就好走了。', tiers: null, fx: { straightCups: 10 } },
    { id: 'C9', cat: 'C', name: '田忌赛马', desc: '宽杯变窄、窄杯变宽，完美 +15%', flavor: '换个排法，劣势变优势。', tiers: null, fx: { invertCups: true, perfectScale: 1.15 } },
    { id: 'C10', cat: 'C', name: '背水一战', desc: '不再显示完成区，完美区 +40%', flavor: '身后是水，只能向前。', tiers: null, fx: { noCompleteZone: true, perfectScale: 1.4 } },
    { id: 'C11', cat: 'C', name: '回炉重造', desc: '完美 +20%，完成 −10%', flavor: '回炉不是认输，是再造。', tiers: [1, 2, 3, 4, 5, 6], fx: { perfectScale: 1.2, completeScale: 0.9 } },
    { id: 'C12', cat: 'C', name: '重启人生', desc: '每杯得分 ×1.5，完美范围 −10%', flavor: '若有重来，仍是少年。', tiers: [3, 4, 5, 6], fx: { scoreMult: 1.5, perfectScale: 0.9 } },
    { id: 'C13', cat: 'C', name: '跳级插班', desc: '立即 +8 分，之后出水 +15%', flavor: '聪明的孩子，总要付点学费。', tiers: [1, 2], fx: { instantScore: 8, pourRateScale: 1.15 } },
    { id: 'C14', cat: 'C', name: '退而不休', desc: '锁定当前段位，每杯 +2 分', flavor: '退了也不闲着，发挥余热。', tiers: [4, 5], fx: { lockTier: true, cupBonus: 2 } },
    { id: 'C15', cat: 'C', name: '弯道超车', desc: '立即 +10 分，完美范围 −15%', flavor: '弯道快，才是真本事。', tiers: [3, 4], fx: { instantScore: 10, perfectScale: 0.85 } },
    { id: 'C16', cat: 'C', name: '以退为进', desc: '完成 +25%，出水 +10%', flavor: '退一步，路更宽。', tiers: [4, 5, 6], fx: { completeScale: 1.25, pourRateScale: 1.1 } },
    { id: 'C17', cat: 'C', name: '降维打击', desc: '下一阶段全用当前杯型，每杯 +1', flavor: '用熟悉的方式，打新的副本。', tiers: [3, 4, 5, 6], fx: { poolOverrideCurrent: true, cupBonus: 1 } },
    { id: 'C18', cat: 'C', name: '破圈跳槽', desc: '完美 +25%，杯型大小随机波动', flavor: '跳出舒适圈，圈外有惊喜。', tiers: [3, 4], fx: { perfectScale: 1.25, sizeVariance: true } },
    { id: 'C19', cat: 'C', name: '可乐换奶瓶', desc: '改用奶杯池，完美 +15%', flavor: '喝回奶瓶，未必是退步。', tiers: [1, 2, 3, 4, 5, 6], fx: { poolOverride: 0, perfectScale: 1.15 } },
    { id: 'C20', cat: 'C', name: '快慢自如', desc: '获得 1 次慢速机会（按住时再点）', flavor: '会快是本事，会慢是境界。', tiers: null, fx: { slowTapCharges: 1 } },

    // ────────── D 可遇不可求的事 ──────────
    { id: 'D1', cat: 'D', name: '天赐良机', desc: '完美连击上限提升至 5 分', flavor: '运气来了，挡都挡不住。', tiers: null, fx: { comboCap: 5 } },
    { id: 'D2', cat: 'D', name: '彩票中奖', desc: '立即 +20 分', flavor: '人生的惊喜，总是不请自来。', tiers: null, fx: { instantScore: 20 } },
    { id: 'D3', cat: 'D', name: '贵人相助', desc: '获得 3 次失败保护', flavor: '关键时候，总有人拉你一把。', tiers: null, fx: { failProtect: 3 } },
    { id: 'D4', cat: 'D', name: '久旱甘霖', desc: '完美范围 +25%', flavor: '盼了很久的雨，下得刚刚好。', tiers: null, fx: { perfectScale: 1.25 } },
    { id: 'D5', cat: 'D', name: '伯乐相马', desc: '本局连击永不中断', flavor: '千里马常有，伯乐不常有。', tiers: null, fx: { comboNeverBreak: true } },
    { id: 'D6', cat: 'D', name: '无心插柳', desc: '轻微超线也算完美', flavor: '不刻意的，往往最完美。', tiers: null, fx: { overflowToPerfect: 0.1 } },
    { id: 'D7', cat: 'D', name: '开挂人生', desc: '出水 −15%，完美 +15%', flavor: '这一局，系统都站在你这边。', tiers: null, fx: { pourRateScale: 0.85, perfectScale: 1.15 } },
    { id: 'D8', cat: 'D', name: '时间的玫瑰', desc: '完美范围随连击扩大（每连 +5%）', flavor: '时间会开花。', tiers: null, fx: { comboZoneGrow: true } },
    { id: 'D9', cat: 'D', name: '一夜爆红', desc: '接下来 20 杯得分 ×2', flavor: '爆红之后，记得继续倒水。', tiers: null, fx: { doubleCups: 20 } },
    { id: 'D10', cat: 'D', name: '春风得意', desc: '完美 +10%、完成 +10%、每杯 +1 分', flavor: '马蹄疾，一日看尽长安花。', tiers: null, fx: { perfectScale: 1.1, completeScale: 1.1, cupBonus: 1 } },
    { id: 'D11', cat: 'D', name: '天生奶量', desc: '立即 +8 分，完美再 +1 分', flavor: '有的娃，天生奶量惊人。', tiers: [0], fx: { instantScore: 8, perfectBonus: 1 } },
    { id: 'D12', cat: 'D', name: '再来一瓶', desc: '白送一次完美分（不计杯数）', flavor: '盖子上写着：再来一瓶！', tiers: [1], fx: { freePerfect: true } },
    { id: 'D13', cat: 'D', name: '金榜题名', desc: '立即 +15 分', flavor: '十年寒窗，一朝题名。', tiers: [2], fx: { instantScore: 15 } },
    { id: 'D14', cat: 'D', name: '天降 offer', desc: '立即 +15 分', flavor: '最好的 offer，总在最不经意时来。', tiers: [3], fx: { instantScore: 15 } },
    { id: 'D15', cat: 'D', name: '拆迁到账', desc: '当前总分立即 ×1.5', flavor: '泼天的富贵，终于轮到你了。', tiers: [4], fx: { scoreMultNow: 1.5 } },
    { id: 'D16', cat: 'D', name: '梦中情杯', desc: '之后只出现最顺手的 3 种杯型', flavor: '杯子顺手了，水都听话。', tiers: null, fx: { cupSimple3: true } },
    { id: 'D17', cat: 'D', name: '祖传茶壶', desc: '每杯基础分 +2', flavor: '传家宝，越用越有味道。', tiers: [5], fx: { cupBonus: 2 } },
    { id: 'D18', cat: 'D', name: '失而复得', desc: '恢复最高连击，按连击 ×2 加分', flavor: '失去的，会以另一种方式回来。', tiers: [5, 6], fx: { restoreStreak: true } },
    { id: 'D19', cat: 'D', name: '儿孙满堂', desc: '每杯 +3 分，文案变金色', flavor: '满堂的热闹，是晚年的糖。', tiers: [6], fx: { cupBonus: 3, goldLines: true } },
    { id: 'D20', cat: 'D', name: '环球机票', desc: '预告下一杯杯型，立即 +8 分', flavor: '世界那么大，先升一段看看。', tiers: [4, 5, 6], fx: { cupPreview: true, instantScore: 8 } },

    // ────────── 段位之力（卡背 ✦ 标记）：抽到后按段位从 TIER_FX 效果池随机生效 ──────────
    { id: 'D21', cat: 'D', name: '赤子之心', desc: '随机一种段位之力生效', flavor: '愿你走过半生，仍记得最初的味道。', tiers: null, tierDraw: true,
      fx: { tierPick: [0, 1, 2] } },
    { id: 'D22', cat: 'D', name: '职场觉醒', desc: '随机一种段位之力生效', flavor: '工位虽小，装得下大梦想。', tiers: [3, 4, 5, 6], tierDraw: true,
      fx: { tierPick: [3, 4, 5] } },
    { id: 'D23', cat: 'D', name: '岁月回甘', desc: '随机一种段位之力生效', flavor: '到最后才发现，回甘都在路上。', tiers: [5, 6], tierDraw: true,
      fx: { tierPick: [4, 5, 6] } }
  ];

  // ────────── 段位效果池：段位之力抽中后，从对应段位随机 1 条（30% 概率 2 条二选一） ──────────
  // 键 = 段位序号（0 人类幼崽 1 元气少年 2 未来可期 3 职场新人 4 职场中坚 5 人间清醒 6 岁月回甘）
  var TIER_FX = [
    [ // 0 人类幼崽 · 奶香之力
      { id: 'T01', name: '奶香之力 · 多喝一口', desc: '完成范围 +15%', fx: { completeScale: 1.15 } },
      { id: 'T02', name: '奶香之力 · 茁壮成长', desc: '每杯基础分 +1', fx: { cupBonus: 1 } },
      { id: 'T03', name: '奶香之力 · 妈妈的温度', desc: '获得 1 次失败保护', fx: { failProtect: 1 } },
      { id: 'T04', name: '奶香之力 · 夜奶时光', desc: '出水速度 −10%', fx: { pourRateScale: 0.9 } },
      { id: 'T05', name: '奶香之力 · 初生手感', desc: '完美范围 +10%', fx: { perfectScale: 1.1 } }
    ],
    [ // 1 元气少年 · 气泡之力
      { id: 'T11', name: '气泡之力 · 碳酸冲刺', desc: '完美范围 +12%', fx: { perfectScale: 1.12 } },
      { id: 'T12', name: '气泡之力 · 冰镇手感', desc: '出水速度 −12%', fx: { pourRateScale: 0.88 } },
      { id: 'T13', name: '气泡之力 · 快乐加倍', desc: '完美额外 +1 分', fx: { perfectBonus: 1 } },
      { id: 'T14', name: '气泡之力 · 再来一瓶', desc: '立即 +6 分', fx: { instantScore: 6 } },
      { id: 'T15', name: '气泡之力 · 气泡护身', desc: '获得 1 次连击保护', fx: { comboProtect: 1 } }
    ],
    [ // 2 未来可期 · 麦芽之力
      { id: 'T21', name: '麦芽之力 · 杯逢知己', desc: '连击额外 +1 分', fx: { comboBonus: 1 } },
      { id: 'T22', name: '麦芽之力 · 泡沫缓冲', desc: '完成范围 +12%', fx: { completeScale: 1.12 } },
      { id: 'T23', name: '麦芽之力 · 千杯不倒', desc: '获得 1 次失败保护', fx: { failProtect: 1 } },
      { id: 'T24', name: '麦芽之力 · 整点毕业', desc: '立即 +8 分', fx: { instantScore: 8 } },
      { id: 'T25', name: '麦芽之力 · 青春无敌', desc: '出水速度 −10%，完美 +8%', fx: { pourRateScale: 0.9, perfectScale: 1.08 } }
    ],
    [ // 3 职场新人 · 葡萄之力
      { id: 'T31', name: '葡萄之力 · 醒杯沉淀', desc: '出水速度 −15%', fx: { pourRateScale: 0.85 } },
      { id: 'T32', name: '葡萄之力 · 轻晃杯脚', desc: '完美范围 +15%', fx: { perfectScale: 1.15 } },
      { id: 'T33', name: '葡萄之力 · 第一笔工资', desc: '每杯基础分 +1', fx: { cupBonus: 1 } },
      { id: 'T34', name: '葡萄之力 · 前辈提点', desc: '预告下一杯杯型', fx: { cupPreview: true } },
      { id: 'T35', name: '葡萄之力 · 转正红包', desc: '升段/升阶额外 +5 分', fx: { stageUpBonus: 5 } }
    ],
    [ // 4 职场中坚 · 玉露之力
      { id: 'T41', name: '玉露之力 · 岁月陈香', desc: '完美范围 +15%', fx: { perfectScale: 1.15 } },
      { id: 'T42', name: '玉露之力 · 一口入魂', desc: '完美额外 +1 分', fx: { perfectBonus: 1 } },
      { id: 'T43', name: '玉露之力 · 年终奖', desc: '立即 +10 分', fx: { instantScore: 10 } },
      { id: 'T44', name: '玉露之力 · 饭局豁免', desc: '获得 2 次连击保护', fx: { comboProtect: 2 } },
      { id: 'T45', name: '玉露之力 · 细水长流', desc: '出水速度 −10%，每杯 +1 分', fx: { pourRateScale: 0.9, cupBonus: 1 } }
    ],
    [ // 5 人间清醒 · 茶香之力
      { id: 'T51', name: '茶香之力 · 清茶慢斟', desc: '出水速度 −15%', fx: { pourRateScale: 0.85 } },
      { id: 'T52', name: '茶香之力 · 回甘悠长', desc: '完美范围 +12%，完美 +1 分', fx: { perfectScale: 1.12, perfectBonus: 1 } },
      { id: 'T53', name: '茶香之力 · 茶满七分', desc: '完成范围 +15%', fx: { completeScale: 1.15 } },
      { id: 'T54', name: '茶香之力 · 禅茶一味', desc: '获得 1 次失败保护', fx: { failProtect: 1 } },
      { id: 'T55', name: '茶香之力 · 壶里乾坤', desc: '立即 +10 分', fx: { instantScore: 10 } }
    ],
    [ // 6 岁月回甘 · 岁月之力
      { id: 'T61', name: '岁月之力 · 老当益壮', desc: '每杯基础分 +2', fx: { cupBonus: 2 } },
      { id: 'T62', name: '岁月之力 · 稳如泰山', desc: '出水速度 −12%', fx: { pourRateScale: 0.88 } },
      { id: 'T63', name: '岁月之力 · 圆满收官', desc: '完美范围 +12%', fx: { perfectScale: 1.12 } },
      { id: 'T64', name: '岁月之力 · 儿孙绕膝', desc: '获得 1 次失败保护', fx: { failProtect: 1 } },
      { id: 'T65', name: '岁月之力 · 人生满堂', desc: '立即 +12 分', fx: { instantScore: 12 } }
    ]
  ];

  return { CATS: CATS, POOL: POOL, TIER_FX: TIER_FX };
});
