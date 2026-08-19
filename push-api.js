// GitHub Git Data API 推送通道（直连被重置时的备用方案）
// 用法: node push-api.js  （在仓库根目录运行）
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const https = require('https');

const REPO = 'AvataWa/renshengyibei';
const BRANCH = 'main';
const url = execSync('git config --get remote.origin.url').toString().trim();
const TOKEN = /x-access-token:([^@]+)@/.exec(url)[1];
const LOCAL_HEAD = execSync('git rev-parse HEAD').toString().trim();
const REMOTE_REF = execSync('git rev-parse origin/main').toString().trim();

function api(method, apiPath, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const req = https.request({
      host: 'api.github.com',
      path: '/repos/' + REPO + apiPath,
      method,
      headers: {
        'Authorization': 'Bearer ' + TOKEN,
        'User-Agent': 'kimi-push',
        'Accept': 'application/vnd.github+json',
        ...(data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {})
      }
    }, (res) => {
      let buf = '';
      res.on('data', (c) => buf += c);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) resolve(JSON.parse(buf || '{}'));
        else reject(new Error(method + ' ' + apiPath + ' -> ' + res.statusCode + ' ' + buf.slice(0, 300)));
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

(async () => {
  // 1. 远端当前 ref（以 API 实时值为准）
  const ref = await api('GET', '/git/ref/heads/' + BRANCH);
  const remoteSha = ref.object.sha;
  console.log('远端 main:', remoteSha.slice(0, 7), ' 本地 origin/main:', REMOTE_REF.slice(0, 7));
  if (remoteSha === LOCAL_HEAD) { console.log('远端已是最新，无需推送'); return; }

  // 2. 远端 commit 的 base tree
  const remoteCommit = await api('GET', '/git/commits/' + remoteSha);

  // 3. 计算差异文件（远端树 -> 本地 HEAD）
  const diffOut = execSync('git diff --name-status ' + remoteSha + ' ' + LOCAL_HEAD).toString();
  const entries = [];
  for (const line of diffOut.split('\n')) {
    if (!line.trim()) continue;
    const [status, file] = line.split('\t');
    if (status.startsWith('D')) {
      entries.push({ path: file, mode: '100644', type: 'blob', sha: null }); // 删除
    } else {
      const content = fs.readFileSync(path.join(process.cwd(), file));
      const blob = await api('POST', '/git/blobs', { content: content.toString('base64'), encoding: 'base64' });
      entries.push({ path: file, mode: '100644', type: 'blob', sha: blob.sha });
      console.log('blob:', file);
    }
  }
  if (!entries.length) { console.log('无文件差异'); return; }

  // 4. 建 tree -> commit -> 更新 ref
  const tree = await api('POST', '/git/trees', { base_tree: remoteCommit.tree.sha, tree: entries });
  const msg = execSync('git log -1 --pretty=%B ' + LOCAL_HEAD).toString().trim()
    + '\n\n[api-push] 收敛本地 ' + execSync('git rev-list --count ' + remoteSha + '..' + LOCAL_HEAD).toString().trim() + ' 个提交至 ' + LOCAL_HEAD.slice(0, 7);
  const commit = await api('POST', '/git/commits', { message: msg, tree: tree.sha, parents: [remoteSha] });
  await api('PATCH', '/git/refs/heads/' + BRANCH, { sha: commit.sha, force: false });
  console.log('已推送:', commit.sha.slice(0, 7));

  // 5. 收敛本地 remote-tracking ref（合成提交包含相同内容，直接指过去）
  execSync('git update-ref refs/remotes/origin/main ' + commit.sha);
  console.log('origin/main 已更新。远端与本地内容一致（提交历史以合成 commit 收敛）。');
})().catch((e) => { console.error('推送失败:', e.message); process.exit(1); });
