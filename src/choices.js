/**
 * 人生选择 · 三选一选项池（升阶/升段时触发）
 * ---------------------------------------------------------------
 * 五类：
 *   A 对而艰难的事（橙）：提升难度同时提升收益
 *   B 踏实稳定的事（绿）：降低难度或稳定提升收益
 *   C 出奇制胜的事（蓝）：改变规则
 *   D 可遇不可求的事（金）：低概率、高收益、无负面（抽卡时每格 8%）
 *   U 先苦后甜的事（紫·咒）：先承受若干杯的惩罚，之后获得永久奖励
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
    D: { label: '可遇不可求的事', color: '#B07A12', bg: '#F7E9C8' },
    U: { label: '先苦后甜的事', color: '#8E5BC0', bg: '#EDE4F6' }
  };

  var POOL = [
    // ────────── A 对而艰难的事 ──────────
    { id: 'A1', cat: 'A', name: '寒窗苦读', desc: '完美范围 −20%，每次完美 +1 分', flavor: '把难的事做久一点，分数会替你记得。', tiers: null, fx: { perfectScale: 0.8, perfectBonus: 1 } },
    { id: 'A2', cat: 'A', name: '凌晨四点的闹钟', desc: '出水速度 +15%，每杯 +1 分', flavor: '别人赖床的时候，你在倒自己的人生。', tiers: null, fx: { pourRateScale: 1.15, cupBonus: 1 } },
    { id: 'A3', cat: 'A', name: '戒糖三十天', desc: '完美 −10%、完成 −10%，每杯 +1 分', flavor: '甜头少了，回甘才显出来。', tiers: null, fx: { perfectScale: 0.9, completeScale: 0.9, cupBonus: 1 } },
    { id: 'A4', cat: 'A', name: '存钱买自由', desc: '完成 −20%，每杯 +1 分，完美再 +1', flavor: '自由不贵，贵的是坚持存钱的日子。', tiers: null, fx: { completeScale: 0.8, cupBonus: 1, perfectBonus: 1 } },
    { id: 'A5', cat: 'A', name: '极限冲刺', desc: '接下来 10 杯出水 +30%，每杯 +2 分', flavor: '冲刺的意义，是知道自己能跑多快。', tiers: null, fx: { rushCups: 10 } },
    { id: 'A7', cat: 'A', name: '精准强迫症', desc: '完美范围 −40%，完美得分 ×2', flavor: '要么完美，要么重来。', tiers: null, fx: { perfectScale: 0.6, perfectDouble: true } },
    { id: 'A10', cat: 'A', name: '双线作战', desc: '目标区变窄 15%，每 5 杯额外 +3 分', flavor: '两手都要抓，两手都得硬。', tiers: null, fx: { completeScale: 0.85, everyN: { n: 5, pts: 3 } } },
    { id: 'A11', cat: 'A', name: '断奶第一课', desc: '杯子变高变瘦，每杯 +1 分', flavor: '人生的第一课，总是有点难咽。', tiers: [0], fx: { cupAspectMul: 1.25, cupBonus: 1 } },
    { id: 'A12', cat: 'A', name: '无糖可乐', desc: '气泡翻涌遮挡视线，每次完美 +2 分', flavor: '没糖的快乐水，喝的是自律。', tiers: [1], fx: { bubbleBoost: true, perfectBonus: 2 } },
    { id: 'A13', cat: 'A', name: '考研二战', desc: '完美 −25%，每次完美 +2 分', flavor: '再来一年的勇气，比分数更贵。', tiers: [2], fx: { perfectScale: 0.75, perfectBonus: 2 } },
    { id: 'A14', cat: 'A', name: '深夜改稿', desc: '完美 −30%，完美一次计 2 连', flavor: '改得动的方案，改不动的 Deadline。', tiers: [3], fx: { perfectScale: 0.7, streakGain: 2 } },
    { id: 'A15', cat: 'A', name: '一口干', desc: '杯型更小更窄，每杯 +2 分', flavor: '感情深，一口干；分寸浅，杯中见。', tiers: [4], fx: { cupSizeMul: 0.8, cupBonus: 2 } },
    { id: 'A16', cat: 'A', name: '茶要七分满', desc: '目标区上移更易溢出，每杯 +2 分', flavor: '七分是茶，十分是烫。', tiers: [5], fx: { zoneShift: 0.08, cupBonus: 2 } },
    { id: 'A17', cat: 'A', name: '回甘要慢品', desc: '出水 +20%，每杯 +2 分', flavor: '回甘这杯奶，倒快了就品不出甜。', tiers: [6], fx: { pourRateScale: 1.2, cupBonus: 2 } },
    { id: 'A18', cat: 'A', name: '转行阵痛', desc: '出水 +25%，每杯 +1 分', flavor: '阵痛是成长的入场券。', tiers: [3, 4], fx: { pourRateScale: 1.25, cupBonus: 1 } },
    { id: 'A19', cat: 'A', name: '独立带娃', desc: '目标区缓缓游移，每杯 +1 分', flavor: '娃在动，目标也在动，心不能动。', tiers: [0, 4], fx: { zoneWander: true, cupBonus: 1 } },

    // ────────── B 踏实稳定的事 ──────────
    { id: 'B1', cat: 'B', name: '按时吃饭', desc: '完美 +10%，完成 +10%', flavor: '三餐规律的人，运气都不会太差。', tiers: null, fx: { perfectScale: 1.1, completeScale: 1.1 } },
    { id: 'B2', cat: 'B', name: '睡够八小时', desc: '完美范围 +10%', flavor: '睡饱了，手自然稳。', tiers: null, fx: { perfectScale: 1.1 } },
    { id: 'B3', cat: 'B', name: '五险一金', desc: '完成范围 +15%', flavor: '稳稳的幸福，先有保障。', tiers: null, fx: { completeScale: 1.15 } },
    { id: 'B4', cat: 'B', name: '每天八杯水', desc: '出水速度 −10%', flavor: '慢慢来，水是慢慢喝的。', tiers: null, fx: { pourRateScale: 0.9 } },
    { id: 'B5', cat: 'B', name: '体检报告正常', desc: '获得 1 次失败保护', flavor: '健康是所有 KPI 的前提。', tiers: null, fx: { failProtect: 1 } },
    { id: 'B6', cat: 'B', name: '定期存款', desc: '每 10 杯额外 +2 分', flavor: '时间会奖励按时存钱的人。', tiers: null, fx: { everyN: { n: 10, pts: 2 } } },
    { id: 'B8', cat: 'B', name: '老狗陪伴', desc: '首次轻微超线自动记为完成', flavor: '它不会说话，但一直替你守着。', tiers: null, fx: { overflowForgive: true } },
    { id: 'B9', cat: 'B', name: '按时还贷', desc: '每次升阶/升段额外 +2 分', flavor: '信用是一点点还出来的。', tiers: null, fx: { stageUpBonus: 2 } },
    { id: 'B10', cat: 'B', name: '慢慢来比较快', desc: '出水 −15%，完成 +5%', flavor: '慢不是停，是另一种快。', tiers: null, fx: { pourRateScale: 0.85, completeScale: 1.05 } },
    { id: 'B11', cat: 'B', name: '多喝热水', desc: '完美范围 +12%', flavor: '万能的关心，朴素的真理。', tiers: [0, 6], fx: { perfectScale: 1.12 } },
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
    { id: 'C5', cat: 'C', name: '镜像人生', desc: '目标区整体下移，完美 +20%', flavor: '换个方向倒水，也是人生。', tiers: null, fx: { zoneShift: -0.1, perfectScale: 1.2 } },
    { id: 'C6', cat: 'C', name: '错位竞争', desc: '目标区每杯随机变化，每杯 +1 分', flavor: '不在别人的赛道上卷。', tiers: null, fx: { zoneRandom: true, cupBonus: 1 } },
    { id: 'C7', cat: 'C', name: '大开大合', desc: '杯型大小差异翻倍，每杯 +1 分', flavor: '格局打开，杯子也是。', tiers: null, fx: { sizeVariance: true, cupBonus: 1 } },
    { id: 'C8', cat: 'C', name: '轻装上阵', desc: '接下来 10 杯统一直筒杯', flavor: '行李少了，路就好走了。', tiers: null, fx: { straightCups: 10 } },
    { id: 'C9', cat: 'C', name: '田忌赛马', desc: '宽杯变窄、窄杯变宽，完美 +15%', flavor: '换个排法，劣势变优势。', tiers: null, fx: { invertCups: true, perfectScale: 1.15 } },
    { id: 'C10', cat: 'C', name: '背水一战', desc: '不再显示完成区，完美区 +40%', flavor: '身后是水，只能向前。', tiers: null, fx: { noCompleteZone: true, perfectScale: 1.4 } },
    { id: 'C11', cat: 'C', name: '回炉重造', desc: '完美 +20%，完成 −10%', flavor: '回炉不是认输，是再造。', tiers: [1, 2, 3, 4, 5, 6], fx: { perfectScale: 1.2, completeScale: 0.9 } },
    { id: 'C13', cat: 'C', name: '跳级插班', desc: '立即 +8 分，之后出水 +15%', flavor: '聪明的孩子，总要付点学费。', tiers: [1, 2], fx: { instantScore: 8, pourRateScale: 1.15 } },
    { id: 'C15', cat: 'C', name: '弯道超车', desc: '立即 +10 分，完美范围 −15%', flavor: '弯道快，才是真本事。', tiers: [3, 4], fx: { instantScore: 10, perfectScale: 0.85 } },
    { id: 'C16', cat: 'C', name: '以退为进', desc: '完成 +25%，出水 +10%', flavor: '退一步，路更宽。', tiers: [4, 5, 6], fx: { completeScale: 1.25, pourRateScale: 1.1 } },
    { id: 'C17', cat: 'C', name: '降维打击', desc: '下一阶段全用当前杯型，每杯 +1', flavor: '用熟悉的方式，打新的副本。', tiers: [3, 4, 5, 6], fx: { poolOverrideCurrent: true, cupBonus: 1 } },
    { id: 'C18', cat: 'C', name: '破圈跳槽', desc: '完美 +25%，杯型大小随机波动', flavor: '跳出舒适圈，圈外有惊喜。', tiers: [3, 4], fx: { perfectScale: 1.25, sizeVariance: true } },

    // ────────── D 可遇不可求的事 ──────────
    { id: 'D1', cat: 'D', name: '天赐良机', desc: '完美连击上限提升至 5 分', flavor: '运气来了，挡都挡不住。', tiers: null, fx: { comboCap: 5 } },
    { id: 'D2', cat: 'D', name: '彩票中奖', desc: '立即 +40 分', flavor: '人生的惊喜，总是不请自来。', tiers: null, fx: { instantScore: 40 } },
    { id: 'D3', cat: 'D', name: '贵人相助', desc: '获得 2 次失败保护', flavor: '关键时候，总有人拉你一把。', tiers: null, fx: { failProtect: 2 } },
    { id: 'D4', cat: 'D', name: '久旱甘霖', desc: '完美范围 +25%', flavor: '盼了很久的雨，下得刚刚好。', tiers: null, fx: { perfectScale: 1.25 } },
    { id: 'D5', cat: 'D', name: '伯乐相马', desc: '本局连击永不中断', flavor: '千里马常有，伯乐不常有。', tiers: null, fx: { comboNeverBreak: true } },
    { id: 'D6', cat: 'D', name: '无心插柳', desc: '轻微超线也算完美', flavor: '不刻意的，往往最完美。', tiers: null, fx: { overflowToPerfect: 0.1 } },
    { id: 'D7', cat: 'D', name: '开挂人生', desc: '出水 −15%，完美 +15%', flavor: '这一局，系统都站在你这边。', tiers: null, fx: { pourRateScale: 0.85, perfectScale: 1.15 } },
    { id: 'D8', cat: 'D', name: '时间的玫瑰', desc: '完美范围随连击扩大（每连 +5%，最多 +50%）', flavor: '时间会开花。', tiers: null, fx: { comboZoneGrow: true } },
    { id: 'D9', cat: 'D', name: '一夜爆红', desc: '接下来 20 杯得分 ×2', flavor: '爆红之后，记得继续倒水。', tiers: null, fx: { doubleCups: 20 } },
    { id: 'D10', cat: 'D', name: '春风得意', desc: '完美 +10%、完成 +10%、每杯 +1 分', flavor: '马蹄疾，一日看尽长安花。', tiers: null, fx: { perfectScale: 1.1, completeScale: 1.1, cupBonus: 1 } },
    { id: 'D11', cat: 'D', name: '天生奶量', desc: '立即 +20 分，完美再 +1 分', flavor: '有的娃，天生奶量惊人。', tiers: [0], fx: { instantScore: 20, perfectBonus: 1 } },
    { id: 'D12', cat: 'D', name: '再来一瓶', desc: '白送一次完美分（不计杯数）', flavor: '盖子上写着：再来一瓶！', tiers: [1], fx: { freePerfect: true } },
    { id: 'D15', cat: 'D', name: '拆迁到账', desc: '当前总分立即 ×1.5', flavor: '泼天的富贵，终于轮到你了。', tiers: [4], fx: { scoreMultNow: 1.5 } },
    { id: 'D16', cat: 'D', name: '梦中情杯', desc: '之后只出现最顺手的 3 种杯型', flavor: '杯子顺手了，水都听话。', tiers: null, fx: { cupSimple3: true } },
    { id: 'D17', cat: 'D', name: '祖传茶壶', desc: '每杯基础分 +2', flavor: '传家宝，越用越有味道。', tiers: [5], fx: { cupBonus: 2 } },
    { id: 'D18', cat: 'D', name: '失而复得', desc: '恢复最高连击，按连击 ×2 加分', flavor: '失去的，会以另一种方式回来。', tiers: [5, 6], fx: { restoreStreak: true } },
    { id: 'D19', cat: 'D', name: '儿孙满堂', desc: '每杯 +3 分，文案变金色', flavor: '满堂的热闹，是晚年的糖。', tiers: [6], fx: { cupBonus: 3, goldLines: true } },

    // ────────── v2 · 哈迪斯式提案（玩家标记「加入」的 29 条） ──────────
    // 人类幼崽 · 奶
    { id: 'A21', cat: 'A', name: '厌食拉锯', desc: '目标区每 0.8 秒在 ±4% 内脉冲缩放，每次完美 +2 分', flavor: '吃一口躲三口，斗智斗勇。', tiers: [0], fx: { zonePulse: { amp: 0.04, period: 0.8 }, perfectBonus: 2 } },
    { id: 'A22', cat: 'A', name: '学饮过渡', desc: '每杯允许松手一次再续按（断点续倒），完美 −10%', flavor: '呛一口，歇一下，接着来。', tiers: [0], fx: { resume: 1, perfectScale: 0.9 } },
    { id: 'U1', cat: 'U', name: '断奶的哭声', desc: '接下来 5 杯完美 −20%，之后完美 +15%', flavor: '哭过这一阵，就长大了。', tiers: [0], fx: { curse: { cups: 5, pen: { perfectScale: 0.8 }, reward: { perfectScale: 1.15 } } } },
    { id: 'U2', cat: 'U', name: '疫苗接种日', desc: '接下来 3 杯出水 +25%，之后完成 +15%', flavor: '一针下去，免疫力 +1。', tiers: [0], fx: { curse: { cups: 3, pen: { pourRateScale: 1.25 }, reward: { completeScale: 1.15 } } } },
    { id: 'B21', cat: 'B', name: '拍嗝手法', desc: '每 3 杯额外 +1 分', flavor: '拍拍背，顺顺气。', tiers: [0], fx: { everyN: { n: 3, pts: 1 } } },
    // 元气少年 · 可乐
    { id: 'A23', cat: 'A', name: '摇过的汽水', desc: '每次完美后，下一杯出水初速 +40%（逐帧衰减），每次完美 +1 分', flavor: '摇得越狠，开盖越冲。', tiers: [1], fx: { nextCupBoost: 1.4, perfectBonus: 1 } },
    { id: 'A24', cat: 'A', name: '跑气的可乐', desc: '目标区从 +20% 开始随时间缩小（8 秒后缩到 −10%），越早判定越宽', flavor: '汽水要趁有气的时候喝。', tiers: [1], fx: { zoneDecay: { from: 1.2, to: 0.9, secs: 8 } } },
    { id: 'A25', cat: 'A', name: '汽水洗杯', desc: '每杯开始杯内残留上杯 10% 水位（占用容量），每杯 +1 分', flavor: '没洗的杯子，泡着昨天的味道。', tiers: [1], fx: { residue: 0.1, cupBonus: 1 } },
    { id: 'U3', cat: 'U', name: '禁带零食', desc: '接下来 5 杯完成 −20%，之后每杯 +2 分', flavor: '小卖部的门，终将再开。', tiers: [1], fx: { curse: { cups: 5, pen: { completeScale: 0.8 }, reward: { cupBonus: 2 } } } },
    { id: 'B22', cat: 'B', name: '气泡垫', desc: '水位进入目标区时出水自动减速 50%（每杯一次）', flavor: '气泡托你一把。', tiers: [1], fx: { zoneCushion: 0.5 } },
    // 未来可期 · 麦芽
    { id: 'U4', cat: 'U', name: '挂科重修', desc: '接下来 5 杯完美 −25%，之后完美 +20%', flavor: '重修的教室，坐着更认真的你。', tiers: [2], fx: { curse: { cups: 5, pen: { perfectScale: 0.75 }, reward: { perfectScale: 1.2 } } } },
    { id: 'U5', cat: 'U', name: '异地恋', desc: '接下来 8 杯出水 +15%，之后每杯 +2 分', flavor: '隔着屏幕的日子，都在攒见面。', tiers: [2], fx: { curse: { cups: 8, pen: { pourRateScale: 1.15 }, reward: { cupBonus: 2 } } } },
    { id: 'B23', cat: 'B', name: '满杯仪式', desc: '连续 2 杯完美后，第 3 杯完美区 +25%', flavor: '好事不过三，三杯刚刚好。', tiers: [2], fx: { fullRite: 1.25 } },
    { id: 'B24', cat: 'B', name: '学长传位', desc: '连击 ≥3 时每杯 +2 分', flavor: '位置传给你了，别掉链子。', tiers: [2], fx: { streakMin3: 2 } },
    { id: 'C19', cat: 'C', name: '挂杯', desc: '每次完美在杯壁挂一层泡沫（可见），每层 +1 分；出现非完美全部脱落', flavor: '泡沫挂得住，才算好麦芽。', tiers: [2], fx: { foamCup: true } },
    { id: 'C20', cat: 'C', name: '碰杯约定', desc: '每局随机一个「约定水位」，停在该水位 ±3% 额外 +3 分', flavor: '说好了，就在这里碰杯。', tiers: [2], fx: { toastTarget: true } },
    { id: 'D20', cat: 'D', name: '整层楼一起', desc: '接下来 5 杯，每次完美计 2 连', flavor: '一个人喝是闷，一层楼喝是青春。', tiers: [2], fx: { streakGain2Cups: 5 } },
    // 职场新人 · 葡萄汁
    { id: 'A26', cat: 'A', name: '考证大军', desc: '完美 −10%，每 5 杯 +3 分', flavor: '教材厚度，决定工资厚度。', tiers: [3], fx: { perfectScale: 0.9, everyN: { n: 5, pts: 3 } } },
    { id: 'U6', cat: 'U', name: '试用期', desc: '接下来 6 杯完成 −15%，之后完成 +20%', flavor: '三个月的低头，换转正后的抬头。', tiers: [3], fx: { curse: { cups: 6, pen: { completeScale: 0.85 }, reward: { completeScale: 1.2 } } } },
    { id: 'B25', cat: 'B', name: '周报模板', desc: '连续 3 杯同一结果（全完美或全完成），额外 +4 分', flavor: '模板用熟了，周报五分钟。', tiers: [3], fx: { sameStreak3: 4 } },
    { id: 'C21', cat: 'C', name: '复利账户', desc: '每杯得分 50% 存入账户，账户每杯生息 10%，升段时可取出', flavor: '钱生钱的道理，一杯就懂。', tiers: [3], fx: { bank: { rate: 0.5, interest: 0.1 } } },
    { id: 'C22', cat: 'C', name: '跳槽窗口期', desc: '立即 +5 分，且下一段位的第一杯不计失败', flavor: 'offer 到手的那天，走路带风。', tiers: [3], fx: { instantScore: 5, tierGrace: true } },
    { id: 'D21', cat: 'D', name: '股票分红', desc: '当前总分 +30%', flavor: '意外的收益，犒赏认真的人。', tiers: [3], fx: { scoreMultNow: 1.3 } },
    { id: 'D22', cat: 'D', name: '股权池', desc: '之后每杯 +1 分存入股权，结算时股权 ×3 兑现', flavor: '熬到兑现那天，都值了。', tiers: [3], fx: { equity: true } },
    // 职场中坚 · 玉露
    { id: 'B26', cat: 'B', name: '退路基金', desc: '每杯 +1 分存入基金（最多存 20），基金满 20 分时自动抵消一次失败', flavor: '留一手的人，输得起。', tiers: [4], fx: { fund: true } },
    { id: 'C23', cat: 'C', name: '重来一杯', desc: '每局 2 次：判定失败后可选择重倒该杯（放弃原结果）', flavor: '中年的奢侈，是重来一次的机会。', tiers: [4], fx: { redo: 2 } },
    // 人间清醒 · 茶
    { id: 'B27', cat: 'B', name: '回甘', desc: '每次完美后，下一杯前 1 秒出水 −20%', flavor: '回甘来时，急不得。', tiers: [5], fx: { afterPerfectSlow: { dur: 1, scale: 0.8 } } },
    { id: 'B28', cat: 'B', name: '茶宠', desc: '连续 5 杯不失败养成茶宠：之后每杯 +1 分', flavor: '茶宠是泡出来的，人是熬出来的。', tiers: [5], fx: { teapot: { need: 5, bonus: 1 } } },
    { id: 'D23', cat: 'D', name: '茶气通透', desc: '此后完美区宽度不再被任何效果缩小（状态免疫）', flavor: '一通百通，百毒不侵。', tiers: [5], fx: { perfectLockWidth: true } },
    { id: 'D24', cat: 'D', name: '饮的文化', desc: '每种饮品出现比完美区更小的文化契合区，达成则完美 ×2 分', flavor: '浅茶满杯，各有分寸。', tiers: null, fx: { cultureZones: true } }
  ];

  // ────────── 段位效果池（当前池内无段位卡，机制保留在 game.js，随时可挂回卡片） ──────────
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
