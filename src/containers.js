/**
 * 容器精灵配置（由 preview-containers.py 适配生成）
 * anchor: 出水口在贴图内的相对位置；restTilt: 静止预倾角(rad)
 * pivotDx/pivotDy: 出水口支点相对默认位置的偏移（屏幕宽/高的比例）
 * scale: 显示尺寸系数（dh = bucketH * 2.2 * scale）
 */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.Containers = factory();
})(typeof GameGlobal !== 'undefined' ? GameGlobal : (typeof self !== 'undefined' ? self : this), function () {
  return [
  { "file": "assets/containers/c1.png", "anchor": { "x": 0.767, "y": 0.15 }, "tip": { "x": 0.721, "y": 0.120 }, "restTilt": 1.05, "scale": 1.04, "pivotDx": -0.06, "pivotDy": -0.035, "w": 240, "h": 520 },
  { "file": "assets/containers/c2.png", "anchor": { "x": 0.489, "y": 0.005 }, "tip": { "x": 0.731, "y": 0.003 }, "restTilt": 1.1,  "scale": 1.04, "pivotDx": -0.08, "pivotDy": 0, "w": 223, "h": 589 },
  { "file": "assets/containers/c3.png", "anchor": { "x": 0.495, "y": 0.007 }, "tip": { "x": 0.766, "y": 0.01 }, "restTilt": 1.1,  "scale": 1.04, "pivotDx": -0.08, "pivotDy": 0, "w": 175, "h": 574 },
  { "file": "assets/containers/c4.png", "anchor": { "x": 0.507, "y": 0.006 }, "tip": { "x": 0.714, "y": 0.009 }, "restTilt": 1.15, "scale": 1.04, "pivotDx": -0.08, "pivotDy": 0, "w": 189, "h": 692 },
  { "file": "assets/containers/c5.png", "anchor": { "x": 0.989, "y": 0.157 }, "tip": { "x": 0.982, "y": 0.181 }, "restTilt": 0.6,  "scale": 0.96, "pivotDx": 0.03,  "pivotDy": -0.07, "w": 449, "h": 437 },
  { "file": "assets/containers/c6.png", "anchor": { "x": 0.989, "y": 0.331 }, "tip": { "x": 0.983, "y": 0.353 }, "restTilt": 0.6,  "scale": 0.7,  "pivotDx": 0.12,  "pivotDy": -0.07, "w": 476, "h": 326 },
  { "file": "assets/containers/c7.png", "anchor": { "x": 0.99,  "y": 0.459 }, "tip": { "x": 0.948, "y": 0.051 }, "restTilt": 0.55, "scale": 0.44, "pivotDx": 0.16,  "pivotDy": -0.08, "w": 496, "h": 196 }
];
});
