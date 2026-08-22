// 极简静态服务器：npm run dev -- --port 7100 --host 127.0.0.1
const http = require('http');
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
function arg(name, fallback) {
  const i = args.indexOf('--' + name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
}
const port = parseInt(arg('port', process.env.PORT || '7100'), 10);
const host = arg('host', process.env.HOST || '127.0.0.1');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml'
};

// 杯型编辑器保存接口：替换/追加 src/cups.js 中 CUPS 数组的某个杯型
// body: { index: number|null, code: string }  index 越界或为 null 时追加到末尾
function saveCup(req, res) {
  let body = '';
  req.on('data', c => { body += c; if (body.length > 64 * 1024) req.destroy(); });
  req.on('end', () => {
    const fail = (msg) => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: false, error: msg })); };
    try {
      const payload = JSON.parse(body);
      if (typeof payload.code !== 'string') return fail('缺少 code 字段');
      // 编辑器生成的代码已带正确缩进，原样保留，只校验首尾
      const code = payload.code.replace(/\s+$/, '');
      if (!/^\s*\{/.test(code) || !code.endsWith('}')) return fail('code 必须是杯型对象字面量');
      if (/require\s*\(|process\.|fs\.|eval\s*\(/.test(code)) return fail('code 含非法内容');

      const file = path.join(__dirname, 'src', 'cups.js');
      const src = fs.readFileSync(file, 'utf8');
      const arrPos = src.indexOf('var CUPS = [');
      if (arrPos < 0) return fail('cups.js 中未找到 var CUPS = [');
      const openB = src.indexOf('[', arrPos);
      const closePos = src.indexOf('\n  ];', openB);
      if (closePos < 0) return fail('未找到 CUPS 数组结束标记');

      // 括号计数找出所有顶层对象 span（字符串内无花括号，安全）
      const spans = [];
      let depth = 1, objStart = -1;
      for (let i = openB + 1; i < closePos; i++) {
        const ch = src[i];
        if (ch === '{') { if (depth === 1) objStart = i; depth++; }
        else if (ch === '}') { depth--; if (depth === 1) spans.push([objStart, i + 1]); }
      }
      if (!spans.length) return fail('未解析到任何杯型对象');

      // 缩进成 4 空格的对象块（首行统一为 4 空格，其余行保持编辑器原缩进）
      const codeLines = code.split('\n');
      const block = '    {' + (codeLines.length > 1 ? '\n' + codeLines.slice(1).join('\n') : '');

      let out, count = spans.length;
      const idx = payload.index;
      if (typeof idx === 'number' && idx >= 0 && idx < spans.length) {
        out = src.slice(0, spans[idx][0]) + block + src.slice(spans[idx][1]);
      } else {
        // 追加：给最后一个对象补逗号，再插到数组末尾
        out = src.slice(0, spans[spans.length - 1][1]) + ',' +
              src.slice(spans[spans.length - 1][1], closePos) + '\n' + block + src.slice(closePos);
        count = spans.length + 1;
      }

      fs.writeFileSync(file + '.bak', src, 'utf8'); // 先备份
      fs.writeFileSync(file, out, 'utf8');
      // 写后验证：能否正常加载
      try {
        delete require.cache[require.resolve('./src/cups.js')];
        const Cups = require('./src/cups.js');
        if (!Cups.CUPS || Cups.CUPS.length !== count) throw new Error('杯型数量校验失败');
      } catch (e) {
        fs.writeFileSync(file, src, 'utf8'); // 回滚
        return fail('写入后校验失败，已回滚：' + e.message);
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, count }));
    } catch (e) { fail(e.message); }
  });
}

http.createServer((req, res) => {
  let urlPath = decodeURIComponent(req.url.split('?')[0]);
  if (req.method === 'POST' && urlPath === '/save-cup') { saveCup(req, res); return; }
  if (urlPath === '/') urlPath = '/index.html';
  const file = path.join(__dirname, path.normalize(urlPath));
  if (!file.startsWith(__dirname)) { res.writeHead(403); res.end(); return; }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not Found'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(data);
  });
}).listen(port, host, () => {
  console.log(`人生一杯预览: http://${host}:${port}/`);
});
