// 修正提交：用仓库 LF 版本的 blob 覆盖 API 推送时误传的 CRLF 内容
const { execSync } = require('child_process');
const https = require('https');

const REPO = 'AvataWa/renshengyibei';
const TOKEN = /x-access-token:([^@]+)@/.exec(execSync('git config --get remote.origin.url').toString())[1];
const FILES = ['project.config.json', 'src/game.js'];

function api(method, apiPath, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const req = https.request({
      host: 'api.github.com', path: '/repos/' + REPO + apiPath, method,
      headers: {
        'Authorization': 'Bearer ' + TOKEN, 'User-Agent': 'kimi-push',
        'Accept': 'application/vnd.github+json',
        ...(data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {})
      }
    }, (res) => {
      let buf = '';
      res.on('data', (c) => buf += c);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) resolve(JSON.parse(buf || '{}'));
        else reject(new Error(method + ' ' + apiPath + ' -> ' + res.statusCode + ' ' + buf.slice(0, 200)));
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

(async () => {
  const ref = await api('GET', '/git/ref/heads/main');
  const headSha = ref.object.sha;
  const headCommit = await api('GET', '/git/commits/' + headSha);

  const entries = [];
  for (const f of FILES) {
    const content = execSync('git cat-file blob HEAD:' + f); // 仓库内 LF 版本
    const blob = await api('POST', '/git/blobs', { content: content.toString('base64'), encoding: 'base64' });
    const want = execSync('git rev-parse HEAD:' + f).toString().trim();
    console.log(f, 'blob:', blob.sha, blob.sha === want ? '(与本地仓库 blob 一致 ✓)' : '(不一致!)');
    entries.push({ path: f, mode: '100644', type: 'blob', sha: blob.sha });
  }

  const tree = await api('POST', '/git/trees', { base_tree: headCommit.tree.sha, tree: entries });
  const commit = await api('POST', '/git/commits', {
    message: 'chore: 修正 CRLF 误传，恢复仓库 LF 规范内容', tree: tree.sha, parents: [headSha]
  });
  await api('PATCH', '/git/refs/heads/main', { sha: commit.sha, force: false });
  console.log('修正提交已推送:', commit.sha.slice(0, 7), ' tree:', tree.sha.slice(0, 7));
  const localTree = execSync('git rev-parse HEAD^{tree}').toString().trim();
  console.log('远端 tree == 本地 tree ?', tree.sha === localTree);
})().catch((e) => { console.error('失败:', e.message); process.exit(1); });
