/**
 * 试制杯型库（仅杯型编辑器 cup-editor.html 加载，游戏不引用本文件）
 * 按参考剪影图制作的 13 个高脚/无脚杯型，pool=9 隔离：
 * 游戏 randomCupTier 只取 pool 0~5，即使误保存进 cups.js 也不会进局内。
 */
(function () {
  if (typeof Cups === 'undefined') return;
  var tableProfile = Cups.tableProfile;

  var LAB = [
    // ── 第一排 ──
    {
      name: '试制·宽圆肚杯', hint: '1/3 杯', aspect: 1.15, stem: true, size: 1.15, pool: 9,
      profile: tableProfile([
        0.24, 0.42, 0.59, 0.73, 0.84, 0.91,
        0.95, 0.96, 0.94, 0.90, 0.85, 0.81,
        0.78, 0.76, 0.75, 0.745, 0.74]),
      zones: { q: [0.26, 0.50] }
    },
    {
      name: '试制·郁金香杯', hint: '1/3 杯', aspect: 1.5, stem: true, size: 1.05, pool: 9,
      profile: tableProfile([
        0.22, 0.33, 0.45, 0.56, 0.66, 0.74,
        0.80, 0.83, 0.83, 0.81, 0.78, 0.74,
        0.70, 0.67, 0.65, 0.645, 0.64]),
      zones: { q: [0.28, 0.52] }
    },
    {
      name: '试制·圆球矮脚杯', hint: '1/3 杯', aspect: 1.05, stem: true, size: 1.1, pool: 9,
      profile: tableProfile([
        0.26, 0.46, 0.64, 0.79, 0.90, 0.96,
        0.98, 0.96, 0.90, 0.82, 0.73, 0.65,
        0.58, 0.53, 0.50, 0.49, 0.48]),
      zones: { q: [0.26, 0.50] }
    },
    {
      name: '试制·喇叭笛杯', hint: '3/4 杯', aspect: 2.2, stem: true, size: 1.1, pool: 9,
      profile: tableProfile([
        0.24, 0.27, 0.30, 0.33, 0.37, 0.41,
        0.46, 0.51, 0.57, 0.63, 0.69, 0.75,
        0.81, 0.87, 0.92, 0.96, 0.98]),
      zones: { q: [0.62, 0.92] }
    },
    {
      name: '试制·收腰矮脚杯', hint: '过半收腰', aspect: 1.1, stem: true, size: 0.7, pool: 9,
      profile: tableProfile([
        0.30, 0.44, 0.56, 0.65, 0.70, 0.70,
        0.66, 0.60, 0.55, 0.52, 0.55, 0.62,
        0.70, 0.78, 0.85, 0.90, 0.92]),
      zones: { q: [0.50, 0.78] }
    },
    {
      name: '试制·敞口高脚杯', hint: '3/4 杯', aspect: 1.7, stem: true, size: 1.0, pool: 9,
      profile: tableProfile([
        0.26, 0.30, 0.34, 0.38, 0.43, 0.48,
        0.54, 0.60, 0.66, 0.72, 0.78, 0.83,
        0.88, 0.92, 0.95, 0.97, 0.98]),
      zones: { q: [0.60, 0.90] }
    },
    {
      name: '试制·高笛杯', hint: '3/4 杯', aspect: 2.6, stem: true, size: 1.1, pool: 9,
      profile: tableProfile([
        0.28, 0.32, 0.345, 0.36, 0.37, 0.375,
        0.38, 0.385, 0.39, 0.395, 0.40, 0.405,
        0.41, 0.415, 0.42, 0.425, 0.43]),
      zones: { q: [0.64, 0.94] }
    },
    // ── 第二排 ──
    {
      name: '试制·马天尼杯', hint: '半杯正好', aspect: 1.0, stem: true, size: 1.1, pool: 9,
      profile: tableProfile([
        0.12, 0.17, 0.23, 0.30, 0.37, 0.44,
        0.51, 0.58, 0.65, 0.72, 0.79, 0.85,
        0.90, 0.94, 0.97, 0.99, 1.0]),
      zones: { q: [0.30, 0.56] }
    },
    {
      name: '试制·小郁金香杯', hint: '1/3 杯', aspect: 1.3, stem: true, size: 0.75, pool: 9,
      profile: tableProfile([
        0.24, 0.36, 0.48, 0.59, 0.68, 0.75,
        0.79, 0.80, 0.79, 0.76, 0.72, 0.68,
        0.64, 0.61, 0.59, 0.58, 0.58]),
      zones: { q: [0.28, 0.52] }
    },
    {
      name: '试制·方底直口杯', hint: '八分满', aspect: 1.3, stem: false, size: 1.0, pool: 9,
      profile: tableProfile([
        0.62, 0.68, 0.71, 0.73, 0.75, 0.77,
        0.79, 0.81, 0.83, 0.85, 0.87, 0.89,
        0.91, 0.93, 0.95, 0.97, 0.98]),
      zones: { q: [0.66, 0.94] }
    },
    {
      name: '试制·白兰地矮脚杯', hint: '1/4 杯', aspect: 1.0, stem: true, size: 1.15, pool: 9,
      profile: tableProfile([
        0.24, 0.44, 0.62, 0.77, 0.88, 0.95,
        0.98, 0.97, 0.92, 0.85, 0.76, 0.67,
        0.59, 0.53, 0.49, 0.47, 0.46]),
      zones: { q: [0.22, 0.46] }
    },
    {
      name: '试制·细长喇叭杯', hint: '3/4 杯', aspect: 2.3, stem: true, size: 1.0, pool: 9,
      profile: tableProfile([
        0.22, 0.25, 0.28, 0.31, 0.345, 0.38,
        0.42, 0.46, 0.50, 0.55, 0.60, 0.65,
        0.70, 0.75, 0.80, 0.85, 0.89]),
      zones: { q: [0.62, 0.92] }
    },
    {
      name: '试制·碟形阔口杯', hint: '半杯正好', aspect: 0.7, stem: true, size: 1.1, pool: 9,
      profile: tableProfile([
        0.30, 0.48, 0.63, 0.76, 0.86, 0.93,
        0.97, 0.99, 1.0, 1.0, 1.0, 1.0,
        1.0, 1.0, 1.0, 1.0, 1.0]),
      zones: { q: [0.34, 0.60] }
    }
  ];

  for (var i = 0; i < LAB.length; i++) Cups.CUPS.push(LAB[i]);
})();
