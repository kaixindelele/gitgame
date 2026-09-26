// 录制教学视频 / 宣传视频：node test/record.js tutorial|promo
// 用 Playwright 驱动页面、注入字幕层，录制为 webm，再用 ffmpeg 转成 mp4。
const path = require('path'); const fs = require('fs'); const http = require('http'); const { execFileSync } = require('child_process');
const { chromium } = require('/tmp/pw/node_modules/playwright');
const mode = process.argv[2] || 'tutorial';
const root = path.resolve(__dirname, '..');
const outDir = path.join(root, 'media'); fs.mkdirSync(outDir, { recursive: true });
const tmpDir = path.join(process.env.SCRATCH || '/tmp', 'gitgame-video-' + mode); fs.rmSync(tmpDir, { recursive: true, force: true }); fs.mkdirSync(tmpDir, { recursive: true });
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
const server = http.createServer((req, res) => { let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html'; const f = path.join(root, p); if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res); });
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const PORT = parseInt(process.env.PORT || '8766', 10);
  await new Promise(r => server.listen(PORT, r));
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, recordVideo: { dir: tmpDir, size: { width: 1280, height: 720 } }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  await page.goto(`http://localhost:${PORT}/#c0-1`);
  await page.waitForSelector('#term-input');
  await page.evaluate(() => { try { localStorage.clear(); } catch (e) {} });

  /* 字幕 / 标题卡 */
  const caption = async (text, ms = 0) => { await page.evaluate(t => { let el = document.getElementById('__cap'); if (!el) { el = document.createElement('div'); el.id = '__cap'; el.style.cssText = 'position:fixed;left:50%;bottom:26px;transform:translateX(-50%);max-width:82%;background:rgba(8,12,20,.88);color:#fff;font:600 21px/1.5 -apple-system,"PingFang SC","Microsoft YaHei","Noto Sans CJK SC",sans-serif;padding:12px 22px;border-radius:12px;z-index:9999;border:1px solid rgba(255,255,255,.15);box-shadow:0 8px 30px rgba(0,0,0,.5);text-align:center;transition:opacity .25s'; document.body.appendChild(el); } el.style.opacity = t ? '1' : '0'; el.innerHTML = t; }, text); if (ms) await sleep(ms); };
  const card = async (title, sub, ms = 2500, bg = 'linear-gradient(135deg,#0f1218,#1b2a3a)') => { await caption(''); await page.evaluate(([t, s, b]) => { let el = document.getElementById('__card'); if (!el) { el = document.createElement('div'); el.id = '__card'; document.body.appendChild(el); } el.style.cssText = `position:fixed;inset:0;background:${b};z-index:10000;display:flex;flex-direction:column;align-items:center;justify-content:center;color:#fff;font-family:-apple-system,"PingFang SC","Microsoft YaHei","Noto Sans CJK SC",sans-serif;transition:opacity .4s;opacity:1`; el.innerHTML = `<div style="font-size:64px;margin-bottom:10px">⎇</div><div style="font-size:54px;font-weight:800;letter-spacing:1px;text-align:center;max-width:90%">${t}</div><div style="font-size:24px;color:#9cd1ff;margin-top:18px;text-align:center;max-width:80%;line-height:1.6">${s}</div>`; }, [title, sub, bg]); await sleep(ms); await page.evaluate(() => { const el = document.getElementById('__card'); if (el) { el.style.opacity = '0'; setTimeout(() => el.remove(), 450); } }); await sleep(500); };
  const badge = async (text, ms = 1800) => { await page.evaluate(t => { const el = document.createElement('div'); el.className = '__badge'; el.style.cssText = 'position:fixed;top:64px;left:50%;transform:translateX(-50%) scale(.9);background:#f5a25d;color:#0f1218;font:800 30px/1 -apple-system,"PingFang SC","Microsoft YaHei",sans-serif;padding:14px 26px;border-radius:14px;z-index:9999;box-shadow:0 10px 30px rgba(0,0,0,.5);transition:transform .2s'; el.textContent = t; document.body.appendChild(el); requestAnimationFrame(() => el.style.transform = 'translateX(-50%) scale(1)'); setTimeout(() => el.remove(), 1800); }, text); await sleep(ms); };
  const go = async (id) => { await caption(''); await page.evaluate(i => window.GitGame.loadLevel(i), id); await sleep(400); };
  const type = async (cmd, { delay = 38, pause = 1400 } = {}) => { await page.focus('#term-input'); await page.type('#term-input', cmd, { delay }); await sleep(250); await page.press('#term-input', 'Enter'); await sleep(pause); };
  const tab = async (name, ms = 1800) => { await page.click(`.tab[data-tab="${name}"]`); await sleep(ms); };
  const editFile = async (cmd, content, pause = 1200) => { await type(cmd, { pause: 600 }); await page.waitForSelector('#editor-modal:not(.hidden)'); await page.fill('#editor-text', ''); await page.type('#editor-text', content, { delay: 22 }); await sleep(600); await page.click('#editor-save'); await sleep(pause); };
  const clickTaskGlow = async () => { await page.evaluate(() => { const li = document.querySelector('#task-list'); if (li) { li.style.transition = 'box-shadow .3s'; li.style.boxShadow = '0 0 0 3px #5fd38d55'; setTimeout(() => li.style.boxShadow = '', 1500); } }); };

  if (mode === 'tutorial') {
    await card('Git 沙盒学院', '在浏览器里，用真实的 git 逻辑，从“复制文件夹备份”讲起<br>教学视频 · 约 5 分钟', 3500);
    await caption('第 0 章：没有 git 的日子。先用最原始的办法——整个文件夹复制一份。', 2200);
    await type('ls');
    await type('cp -r project project_v1');
    await caption('改了代码之后再备份一份……每次都是完整复制，没有说明，也不知道先后关系。', 500);
    await type('echo "// 新功能" >> project/app.js');
    await type('cp -r project project_v2');
    await type('diff -r project_v1 project_v2', { pause: 2200 });
    await type('du -sh *', { pause: 2400 });
    await caption('痛点出现了：重复存储、没有说明、没有顺序。git 解决的就是这三件事。', 2600);

    await go('c1-2');
    await caption('第 1 章：三棵树。工作区 → git add → 暂存区 → git commit → 提交历史。', 2600);
    await type('echo "# 项目说明" > README.md');
    await type('git status', { pause: 2600 });
    await caption('git 的输出和真实 git 完全一致：README.md 是 Untracked，还没被跟踪。', 2400);
    await type('git add .');
    await tab('trees', 400);
    await caption('右侧“三棵树”：暂存区那一列已经登记了两个文件的哈希，HEAD 还是空的。', 3000);
    await type('git commit -m "第一次提交"', { pause: 1500 });
    await tab('analogy', 400);
    await caption('“原理对比”面板：git 底层创建了 blob / tree / commit，对照“复制文件夹”的做法，差别在哪。', 4200);
    await page.evaluate(() => document.getElementById('tab-analogy').scrollTo({ top: 600, behavior: 'smooth' }));
    await caption('每个提交被画成一个“备份文件夹”，没变的文件标为“共享”——git 不会重复存储它们。', 3600);
    await tab('graph', 400);
    await caption('任务全部打勾，本关完成。所有判定都基于真实的仓库状态，而不是命令字符串。', 2600);

    await go('c3-3');
    await caption('第 3 章：分支与合并。main 和 feature 各自有新提交，需要三方合并。', 2600);
    await type('git log --oneline --graph --all', { pause: 2600 });
    await type('git merge feature', { pause: 2200 });
    await caption('提交图上出现了有两个父提交的合并提交（空心圆）。点击任何提交可以看它的快照内容。', 1000);
    await page.evaluate(() => { const g = document.querySelector('#graph-svg .g-node'); if (g) g.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    await sleep(3200);

    await go('c4-1');
    await caption('第 4 章：冲突。两条分支改了同一行，git 无法替你决定。', 2400);
    await type('git merge feature', { pause: 2400 });
    await caption('反馈面板解释了冲突标记的含义和解决步骤。先看看文件：', 1000);
    await type('cat greeting.js', { pause: 3000 });
    await caption('用内置编辑器把文件改成最终想要的样子，删掉 <<<<<<< ======= >>>>>>> 标记。', 800);
    await editFile('edit greeting.js', 'export function greet(name) {\n  return "Hi, " + name.trim() + "!";\n}\n', 900);
    await type('git add greeting.js');
    await type('git commit -m "合并 feature，解决冲突"', { pause: 2600 });
    await caption('如果你 add 了一个还带着标记的文件，游戏会立刻警告你——真实 git 可不会。', 3000);

    await go('c5-4');
    await caption('第 5 章：多人协作。同事小明和你同时改代码，他先推送了。', 2600);
    await tab('multi', 400);
    await caption('“多人”面板同时显示你的仓库、服务器上的 origin、以及小明的克隆。', 3200);
    await tab('graph', 300);
    await type('git push', { pause: 3400 });
    await caption('被拒绝了！这就是真实 git 的 non-fast-forward 保护：不允许覆盖别人的提交。', 3000);
    await type('git pull --rebase', { pause: 2600 });
    await type('git log --oneline --graph', { pause: 2400 });
    await type('git push', { pause: 2400 });
    await caption('先拉后推，两个人的提交都在远程上了。', 2200);

    await go('c7-3');
    await caption('第 7 章：定位 bug。测试失败了，但 v1.0 是好的，中间有 15 个提交。用二分查找。', 2800);
    await type('npm test', { pause: 2200 });
    await type('git bisect start');
    await type('git bisect bad');
    await type('git bisect good v1.0', { pause: 2200 });
    for (let i = 0; i < 5; i++) {
      await type('npm test', { pause: 1200 });
      const ok = await page.$eval('#term-output', el => /2 passing\s*$/.test(el.innerText.trim()));
      const r = await type(ok ? 'git bisect good' : 'git bisect bad', { pause: 1600 });
      const found = await page.$eval('#term-output', el => /is the first bad commit/.test(el.innerText));
      if (found) break;
    }
    await caption('4 次测试就找到了肇事提交：日常改动 9。接下来 git bisect reset 回到 main，再 revert 它。', 3400);
    await type('git bisect reset', { pause: 1500 });

    await go('c2-6');
    await caption('第 2 章还有“找回丢失的提交”：手抖 reset --hard 之后，用 reflog 把一切救回来。', 2800);
    await type('git log --oneline', { pause: 1800 });
    await type('git reflog', { pause: 3000 });
    await type('git reset --hard HEAD@{1}', { pause: 2200 });
    await caption('三个“消失”的提交回来了。git 几乎什么都能找回——除了从没 add 过的修改。', 3000);

    await page.click('#btn-levels'); await sleep(600);
    await caption('9 章 42 关：备份的痛 → 基础 → 撤销 → 分支 → 冲突 → 协作 → 恢复 → 定位 bug → 自由沙盒。', 3600);
    await page.click('#levels-close'); await sleep(300);
    await card('开始你的 git 之旅', '纯静态页面，打开 index.html 即可游玩<br>每一步都能试错，每一步都有解释', 4000);
  } else {
    await card('还在用 “项目_最终版2_真的最终.zip”？', '', 2600, 'linear-gradient(135deg,#2a1414,#0f1218)');
    await go('c0-2'); await type('ls', { delay: 20, pause: 1600 });
    await caption('备份地狱。', 1400); await caption('');
    await card('Git 沙盒学院', '在浏览器里，用真实的 git 逻辑学 git', 2600);
    await go('c1-2');
    await type('git add .', { delay: 25, pause: 500 }); await type('git commit -m "第一次提交"', { delay: 25, pause: 900 });
    await tab('analogy', 200);
    await badge('每条命令都告诉你：底层发生了什么', 2200);
    await tab('graph', 200);
    await go('c4-1');
    await type('git merge feature', { delay: 20, pause: 1200 });
    await badge('真实的冲突，真实的报错', 2000);
    await editFile('edit greeting.js', 'export function greet(name) {\n  return "Hi, " + name.trim() + "!";\n}\n', 500);
    await type('git add greeting.js && git commit -m "resolve"', { delay: 20, pause: 1200 });
    await go('c5-4'); await tab('multi', 200);
    await badge('和虚拟同事一起协作', 1800);
    await tab('graph', 200);
    await type('git push', { delay: 20, pause: 1800 });
    await badge('被拒绝？先拉再推', 1600);
    await type('git pull --rebase && git push', { delay: 20, pause: 1800 });
    await go('c2-6'); await type('git reflog', { delay: 15, pause: 1400 });
    await badge('手抖删了？reflog 救回来', 1800);
    await type('git reset --hard HEAD@{1}', { delay: 20, pause: 1400 });
    await go('c7-3'); await type('git bisect start && git bisect bad && git bisect good v1.0', { delay: 12, pause: 1400 });
    await badge('二分定位 bug 提交', 1800);
    await page.click('#btn-levels'); await sleep(300);
    await badge('9 章 · 42 关 · 可试错沙盒', 2200);
    await page.click('#levels-close');
    await card('Git 沙盒学院', '纯静态 · 零依赖 · 打开 index.html 即玩<br><span style="color:#f5a25d">从复制文件夹，到多人协作与 bug 定位</span>', 4000);
  }

  await sleep(300);
  await page.close();
  await context.close(); await browser.close(); server.close();
  const webm = fs.readdirSync(tmpDir).find(f => f.endsWith('.webm'));
  const ffmpeg = require('child_process').execSync('python3 -c "import imageio_ffmpeg;print(imageio_ffmpeg.get_ffmpeg_exe())"').toString().trim();
  const out = path.join(outDir, mode === 'tutorial' ? 'tutorial.mp4' : 'promo.mp4');
  execFileSync(ffmpeg, ['-y', '-ss', '0.6', '-i', path.join(tmpDir, webm), '-c:v', 'libx264', '-preset', 'medium', '-crf', '23', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-r', '25', out], { stdio: 'ignore' });
  console.log('wrote', out, Math.round(fs.statSync(out).size / 1024) + 'KB');
})().catch(e => { console.error(e); process.exit(1); });
