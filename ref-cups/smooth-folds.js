/**
 * 手改杯型平滑器
 * 找出相对 HEAD 被手改过的杯型(profile 点列), 把单点级锯齿褶子
 * 重建成平滑起伏(保持褶子数量/位置/深度), 就地写回 src/cups.js
 *
 * 用法: node ref-cups/smooth-folds.js [--write]
 *   不加 --write: 只预览(输出 JSON + 控制台报告)
 *   加 --write: 写回 src/cups.js(自动先备份到 src/cups.js.pre-smooth)
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const CUPS_JS = path.join(__dirname, '..', 'src', 'cups.js');
const WRITE = process.argv.includes('--write');

// ---------- 解析: 括号计数找顶层对象 span, 提取 tableProfile 点列 ----------
function parseCups(src) {
  const arrPos = src.indexOf('var CUPS = [');
  const openB = src.indexOf('[', arrPos);
  const closePos = src.indexOf('\n  ];', openB);
  const spans = [];
  let depth = 1, objStart = -1;
  for (let i = openB + 1; i < closePos; i++) {
    const ch = src[i];
    if (ch === '{') { if (depth === 1) objStart = i; depth++; }
    else if (ch === '}') { depth--; if (depth === 1) spans.push([objStart, i + 1]); }
  }
  return spans.map(([s, e]) => {
    const text = src.slice(s, e);
    const nameM = text.match(/name:\s*'([^']+)'/);
    const ptsM = text.match(/tableProfile\(\[([\s\S]*?)\]\)/);
    const pts = ptsM ? ptsM[1].split(',').map(v => parseFloat(v)).filter(v => !isNaN(v)) : null;
    const aspM = text.match(/aspect:\s*([\d.]+)/);
    const sizeM = text.match(/size:\s*([\d.]+)/);
    const qM = text.match(/zones:\s*\{\s*q:\s*\[([\d.]+),\s*([\d.]+)\]/);
    const stemM = text.match(/stem:\s*(true|false)/);
    const handleM = text.match(/handle:\s*(\{[^}]*\}|true)/);
    let handleCfg = null;
    if (handleM) {
      if (handleM[1] === 'true') handleCfg = { t1: 0.82, t2: 0.45, out: 0.62 };
      else {
        const g = k => { const m = handleM[1].match(new RegExp(k + ':\\s*([\\d.]+)')); return m ? parseFloat(m[1]) : undefined; };
        handleCfg = { t1: g('t1') ?? 0.82, t2: g('t2') ?? 0.45, out: g('out') ?? 0.62 };
      }
    }
    return {
      span: [s, e], pts, name: nameM ? nameM[1] : '?',
      aspect: aspM ? parseFloat(aspM[1]) : 1.2,
      size: sizeM ? parseFloat(sizeM[1]) : 1,
      stem: stemM ? stemM[1] === 'true' : false,
      q: qM ? [parseFloat(qM[1]), parseFloat(qM[2])] : [0.6, 0.86],
      handleCfg,
    };
  });
}

// ---------- 与游戏一致的 Catmull-Rom ----------
function catmull(pts, t) {
  const n = pts.length - 1;
  const x = Math.max(0, Math.min(1, t)) * n;
  const i = Math.min(Math.floor(x), n - 1);
  const u = x - i;
  const p0 = pts[Math.max(i - 1, 0)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(i + 2, n)];
  const v = 0.5 * ((2 * p1) + (-p0 + p2) * u +
    (2 * p0 - 5 * p1 + 4 * p2 - p3) * u * u +
    (-p0 + 3 * p1 - 3 * p2 + p3) * u * u * u);
  return Math.max(0.05, Math.min(1, v));
}

// ---------- 高斯平滑(反射边界) ----------
function gauss(arr, sigma) {
  const r = Math.max(1, Math.round(sigma * 3));
  const k = [];
  let sum = 0;
  for (let i = -r; i <= r; i++) { const v = Math.exp(-(i * i) / (2 * sigma * sigma)); k.push(v); sum += v; }
  const n = arr.length, out = new Array(n);
  for (let i = 0; i < n; i++) {
    let acc = 0;
    for (let j = -r; j <= r; j++) {
      let idx = i + j;
      if (idx < 0) idx = -idx;
      if (idx >= n) idx = 2 * n - 2 - idx;
      acc += arr[idx] * k[j + r];
    }
    out[i] = acc / sum;
  }
  return out;
}

// ---------- 褶子平滑: 趋势 + 平滑后按原幅度回缩的波纹 ----------
const STRENGTH = 1.3;                  // 平滑力度倍率(用户可调)
function smoothPts(pts) {
  const N = 161;                       // 密采样(每采样间隔 10 点)
  const dense = [];
  for (let i = 0; i < N; i++) dense.push(catmull(pts, i / (N - 1)));
  const trend = gauss(dense, 12 * STRENGTH);   // 大趋势
  const res = dense.map((v, i) => v - trend[i]);
  const resS = gauss(res, 3.5 * STRENGTH);     // 波纹钝化
  const maxR = Math.max(...res.map(Math.abs));
  const maxRS = Math.max(...resS.map(Math.abs));
  const k = maxRS > 1e-6 ? Math.min(2.0 * STRENGTH, maxR / maxRS) : 1;   // 恢复褶深
  const final = dense.map((_, i) => trend[i] + resS[i] * k);
  const out = [];
  for (let i = 0; i < 17; i++) {
    out.push(Math.round(Math.max(0.05, Math.min(1, final[i * 10])) * 1000) / 1000);
  }
  out[0] = pts[0];                     // 杯底/杯口端点保持原值
  out[16] = pts[16];
  return out;
}

// ---------- 锯齿度: 一阶差分的有效变号次数 ----------
function jagged(pts) {
  let n = 0, prev = 0;
  for (let i = 1; i < pts.length; i++) {
    const d = pts[i] - pts[i - 1];
    if (Math.abs(d) < 0.015) continue;
    const s = Math.sign(d);
    if (prev && s !== prev) n++;
    prev = s;
  }
  return n;
}

function fmtPts(pts) {
  const rows = [];
  for (let i = 0; i < 17; i += 6) rows.push(pts.slice(i, i + 6).join(', '));
  return rows.map(r => '        ' + r).join(',\n');
}

// ---------- 主流程 ----------
// 手改已提交进 HEAD, 无法 diff; 改为直接扫描全部正式杯的锯齿度
const srcCur = fs.readFileSync(CUPS_JS, 'utf8');
const cur = parseCups(srcCur);
console.log(`正式库 ${cur.length} 杯`);

const JAGGED_MIN = 3;                  // 有效变号 ≥3 视为有褶子(自然收腰最多 2)
const changed = [];
cur.forEach((c, i) => {
  if (!c.pts) return;                  // 函数型 profile(直筒奶瓶)跳过
  const j = jagged(c.pts);
  if (j >= JAGGED_MIN) changed.push({ idx: i, name: c.name, pts: c.pts, j });
});
console.log(`检出锯齿褶子杯: ${changed.length} 只`);
changed.forEach(c => console.log(`  #${c.idx} ${c.name}  锯齿度=${c.j}`));

const preview = [];
let out = srcCur;
let delta = 0;
for (const c of changed) {
  const cup = cur[c.idx];
  const newPts = smoothPts(c.pts);
  const oldBlock = srcCur.slice(cup.span[0], cup.span[1]);
  const ptsM = oldBlock.match(/tableProfile\(\[([\s\S]*?)\]\)/);
  const newBlock = oldBlock.slice(0, ptsM.index) +
    `tableProfile([\n${fmtPts(newPts)}])` +
    oldBlock.slice(ptsM.index + ptsM[0].length);
  out = out.slice(0, cup.span[0] + delta) + newBlock + out.slice(cup.span[1] + delta);
  delta += newBlock.length - (cup.span[1] - cup.span[0]);
  preview.push({
    idx: c.idx, name: c.name, aspect: cup.aspect, size: cup.size,
    stem: cup.stem, q: cup.q, handleCfg: cup.handleCfg,
    ptsBefore: c.pts, ptsAfter: newPts, jagged: c.j,
  });
}

fs.writeFileSync(path.join(__dirname, 'smooth-preview.json'), JSON.stringify(preview, null, 2), 'utf8');
console.log('预览数据 -> ref-cups/smooth-preview.json');

if (WRITE) {
  fs.writeFileSync(CUPS_JS + '.pre-smooth', srcCur, 'utf8');
  fs.writeFileSync(CUPS_JS, out, 'utf8');
  delete require.cache[require.resolve('../src/cups.js')];
  const Cups = require('../src/cups.js');
  if (Cups.CUPS.length !== cur.length) throw new Error('写回后杯数校验失败');
  console.log(`已写回 src/cups.js(备份 cups.js.pre-smooth), 加载校验通过: ${Cups.CUPS.length} 杯`);
} else {
  console.log('(预览模式, 未写文件; 确认后加 --write 写回)');
}
