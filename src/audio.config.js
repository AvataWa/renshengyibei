/**
 * 音频配置：所有音量/音调参数集中在此，手动调整即时生效（无需改逻辑代码）
 * 音量说明：微信端支持 >1 的增益；浏览器预览会被钳到 1（真机为准）
 * 音调说明：1 = 原速原调，>1 升调，<1 降调（浏览器/微信基础库≥2.11 生效）
 */
(function (root) {
  var AudioConfig = {
    // ── 音量 ──
    volume: {
      pourLoop: 1.5,   // 倒水循环（陶瓷杯注水声）
      perfect: 5,      // 完美（微波炉叮）
      success: 0.4,    // 普通完成（叮）
      lucky: 0.25,     // 升段 / 免死 / 挡刀（shimmer）
      fail: 0.8,       // 失败（溢出下滑音）
      record: 0.9,     // 破纪录结算庆祝
      tap: 0.7,        // 按钮/抽卡点击（统一）
      bgm: 0.08        // 背景音乐循环
    },
    // ── 音调 ──
    rate: {
      pourLo: 0.8,     // 倒水循环起始音调（空杯）
      pourHi: 1.8,     // 倒水循环满杯音调（随液面线性爬升）
      perfectStep: 0.12, // 完美连击每连升调步长（2 连 1.12、3 连 1.24…）
      perfectCap: 1.5,   // 完美连击升调上限
      success: 1.2,      // 普通完成升调（让叮更亮）
      record: 0.9        // 破纪录庆祝降调版叮
    }
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = AudioConfig;
  else root.AudioConfig = AudioConfig;
})(typeof GameGlobal !== 'undefined' ? GameGlobal : (typeof self !== 'undefined' ? self : this));
