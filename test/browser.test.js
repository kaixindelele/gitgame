// 浏览器冒烟测试：加载页面、执行命令、检查无 JS 错误、截图
const path = require('path');
const { chromium } = require('/tmp/pw/node_modules/playwright');
const http = require('http'); const fs = require('fs');
const root = path.resolve(__dirname, '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png' };
const server = http.createServer((req, res) => { let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html'; const f = path.join(root, p); if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end('nf'); } res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res); });
(async () => {
  await new Promise(r => server.listen(8765, r));
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const page = await browser.newPage({ viewport: { width: 1500, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  const check = (cond, msg) => { if (!cond) errors.push('check failed: ' + msg); console.log((cond ? 'ok   ' : 'FAIL ') + msg); };
  const type = async (cmd) => { await page.fill('#term-input', cmd); await page.press('#term-input', 'Enter'); await page.waitForTimeout(60); };
  const visible = sel => page.$eval(sel, el => !el.classList.contains('hidden')).catch(() => false);
  // 首次访问（无 #hash、localStorage 为空）：先看到旅程总览
  await page.goto('http://localhost:8765/?lang=zh');
  await page.waitForSelector('#term-input');
  check(await visible('#journey'), 'journey overview shown on first visit');
  const stageCount = await page.$$eval('.jv-stage', els => els.length);
  check(stageCount >= 8, `journey lists stages (${stageCount})`);
  await page.click('.jv-head .jv-start');
  check(!(await visible('#journey')), 'journey closes on start');
  check(await visible('#briefing'), 'briefing shown for a fresh level');
  await page.click('.b-skip-link'); await page.waitForTimeout(400);
  check(await page.$('.tour') !== null, 'onboarding tour runs after the journey overview');
  await page.click('.tour .skip');
  // 任务线：每关一个圆点，点击跳关
  const dots = await page.$$eval('.ql-dot', els => els.length);
  const order = await page.evaluate(() => window.GitGame.ORDER.length);
  check(dots === order, `quest line has one dot per level (${dots}/${order})`);
  await page.click('.ql-dot[data-id="c1-2"]'); await page.waitForTimeout(200);
  check(await page.evaluate(() => window.GitGame.app.level.id) === 'c1-2', 'quest line dot jumps to level');
  // 简报：卡片逐张展示，开始动手后收起为一行问题
  check(await visible('#briefing') && await page.$eval('body', b => b.classList.contains('is-briefing')), 'briefing + dimming on new level');
  const cards = await page.$$eval('.b-pill', els => els.length);
  for (let i = 1; i < cards; i++) { await page.click('.b-next'); await page.waitForTimeout(30); }
  await page.click('.b-start');
  check(await visible('#play') && await visible('#problem-bar') && !(await visible('#briefing')), 'start collapses briefing into problem bar');
  check(await page.$('.task-current') !== null, 'current task card shown');
  // 错误命令 → 导师反馈仍然工作
  await type('git comit -m "x"');
  check(/没有这个 git 子命令/.test(await page.$eval('#feedback-box', el => el.innerText)), 'mentor feedback for a wrong command');
  await type('echo "# 项目说明" > README.md');
  check(await page.$eval('.tab[data-tab="trees"]', el => el.classList.contains('glow')), 'focus glow on the Three trees tab');
  await type('git add .');
  await type('git status');
  await type('git commit -m "第一次提交"');
  await page.waitForTimeout(200);
  const doneVisible = await visible('#debrief');
  const tasksDone = await page.$$eval('#task-list li.done', els => els.length);
  console.log('tasks done:', tasksDone, 'debrief shown:', doneVisible);
  check(doneVisible && tasksDone === 4, 'debrief after completing c1-2');
  check(/没有 git/.test(await page.$eval('#debrief', el => el.innerText)), 'debrief has the crude vs git comparison');
  await page.click('.tab[data-tab="analogy"]');
  await page.waitForTimeout(100);
  const analogy = await page.$eval('#analogy-card', el => el.innerText.slice(0, 80));
  console.log('analogy:', analogy.replace(/\n/g, ' '));
  await page.click('.tab[data-tab="graph"]');
  await page.screenshot({ path: '/tmp/claude-0/-home-user-gitgame/9b71a6b9-7f35-59a3-8136-f02b66bef4c1/scratchpad/shot1.png' });
  // 刷新后回放，不再弹简报
  await page.reload(); await page.waitForTimeout(300);
  check(await visible('#debrief') && !(await visible('#briefing')), 'resume after reload skips the briefing');
  // 下一关按旅程顺序
  await page.click('#btn-next-inline'); await page.waitForTimeout(200);
  const expectNext = await page.evaluate(() => { const o = window.GitGame.ORDER; return o[o.indexOf('c1-2') + 1]; });
  check(await page.evaluate(() => window.GitGame.app.level.id) === expectNext, `next level follows journey order (${expectNext})`);
  // 提示：每个任务一条时揭示当前任务的那一条
  await page.click('.b-skip-link');
  const hintInfo = await page.evaluate(() => { const lv = window.GitGame.app.level; return { one: lv.hints.length === lv.tasks.length, first: lv.hints[0] }; });
  await page.click('.task-current .hint-btn');
  const shownHint = await page.$eval('.task-current .hint-list li', el => el.textContent).catch(() => '');
  check(shownHint === hintInfo.first, 'hint button reveals the hint for the current task');
  // 编辑器 + 冲突关
  await page.goto('http://localhost:8765/?lang=zh#c4-1');
  await page.waitForTimeout(200);
  await type('git merge feature');
  await type('edit greeting.js');
  await page.waitForSelector('#editor-modal:not(.hidden)');
  await page.fill('#editor-text', 'export function greet(name) {\n  return "Hi, " + name.trim() + "!";\n}\n');
  await page.click('#editor-save');
  await type('git add greeting.js');
  await type('git commit -m "merge"');
  await page.waitForTimeout(200);
  const cdone = await page.$$eval('#task-list li.done', els => els.length);
  console.log('conflict level tasks done:', cdone);
  check(cdone === 4, 'conflict level completes (typing during the briefing starts play)');
  // 无 -m 的 commit 打开编辑器
  await page.goto('http://localhost:8765/?lang=zh#c1-3');
  await page.waitForTimeout(200);
  await type('echo "x" > utils.js && git add utils.js');
  await type('git commit');
  await page.waitForSelector('#editor-modal:not(.hidden)');
  await page.fill('#editor-text', 'add utils\n');
  await page.click('#editor-save');
  await page.waitForTimeout(100);
  const termText = await page.$eval('#term-output', el => el.innerText);
  check(/\[main [0-9a-f]{7}\] add utils/.test(termText), 'commit via editor');
  // 多人标签 + 沙盒按钮
  await page.goto('http://localhost:8765/?lang=zh#sandbox');
  await page.waitForTimeout(300);
  await page.click('.tab[data-tab="multi"]');
  const btns = await page.$$('#multi-actions button');
  console.log('sandbox actions:', btns.length);
  await btns[0].click(); await page.waitForTimeout(200);
  await type('git pull');
  await page.waitForTimeout(100);
  await page.screenshot({ path: '/tmp/claude-0/-home-user-gitgame/9b71a6b9-7f35-59a3-8136-f02b66bef4c1/scratchpad/shot2.png' });
  const multiText = await page.$eval('#multi-repos', el => el.innerText);
  console.log('multi repos listed:', (multiText.match(/仓库|服务器/g) || []).length);
  console.log('errors:', errors.length ? errors : 'none');
  await browser.close(); server.close();
  process.exit(errors.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
