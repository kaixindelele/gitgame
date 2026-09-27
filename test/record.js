// 录制带配音的教学视频 / 宣传视频（中英文）。
// 用法: VIDEO_LANG=zh|en node test/record.js tutorial|promo
// 依赖: Playwright + Chromium、ffmpeg（imageio-ffmpeg 自带）、tools/tts_batch.py（sherpa-onnx + Kokoro 离线语音）
// 流程: ① 每个镜头的旁白先合成语音，得到时长 ② 录屏，每个镜头停留到旁白念完，字幕同步 ③ 把语音按镜头起点混进视频
const path = require('path'); const fs = require('fs'); const http = require('http'); const { execFileSync, execSync } = require('child_process');
const { chromium } = require('/tmp/pw/node_modules/playwright');
const LANG = process.env.VIDEO_LANG === 'en' ? 'en' : 'zh';
process.env.GITGAME_LANG = LANG;
const L = (zh, en) => (LANG === 'en' ? en : zh);
const MODE = process.argv[2] || 'tutorial';
const root = path.resolve(__dirname, '..');
const SCRATCH = process.env.SCRATCH || '/tmp';
const work = path.join(SCRATCH, `video-${MODE}-${LANG}`); fs.mkdirSync(work, { recursive: true });
const outFile = path.join(root, 'media', `${MODE}${LANG === 'en' ? '.en' : ''}.mp4`);

// 旁白直接取自教学叙事，保证视频和游戏里说的一致
require('../js/i18n.js'); ['sha1', 'diff', 'git', 'gitcmd', 'shell', 'analogy', 'levels', 'curriculum'].forEach(m => require(`../js/${m}.js`));
const C = globalThis.GitCurriculum;
const lv = id => C.levels[id];
const join = arr => arr.join(L('；', '; '));

const sleep = ms => new Promise(r => setTimeout(r, ms));
const TYPE_DELAY = 70; // 打字速度（毫秒/字），放慢以便观众跟上

/* ---------- 镜头脚本 ---------- */
const SCENES = { tutorial: [], promo: [] };
const S = (mode, say, run, extra = {}) => SCENES[mode].push({ say, run, ...extra });

// ===== 教学视频 =====
S('tutorial', L('欢迎来到 Git 沙盒学院。这是一个在浏览器里学 git 的游戏。它不从命令讲起，而是从你真实会遇到的问题讲起。',
  'Welcome to Git Sandbox Academy, a game for learning git right in your browser. Instead of starting from commands, it starts from the problems you will actually run into.'),
  async h => { await h.card(L('Git 沙盒学院', 'Git Sandbox Academy'), L('从“复制文件夹”到多人协作<br>教学视频', 'From copying folders to teamwork<br>Tutorial')); });
S('tutorial', L('打开游戏，首先看到的是整个旅程。一共九个阶段：从一个人给项目存档，到后悔药、同时做几件事、合并冲突、多人协作、事故恢复，最后是追查 bug。',
  'When you open the game, you first see the whole journey: nine stages, from saving your own work, to undoing mistakes, doing several things at once, merge conflicts, teamwork, accidents, and finally hunting bugs.'),
  async h => { await h.spot('.jv-road', 2500); await h.scroll('#journey', 900, 5000); });
S('tutorial', L('每个阶段都写清楚了：你会遇到什么问题，没有 git 的时候人们会怎么凑合，git 又怎么解决，以及这一阶段你可能会经历什么，比如报错、冲突、被拒绝。',
  'Each stage spells out the problem you will meet, how people muddle through without git, how git solves it, and what you may run into along the way, such as errors, conflicts or rejected pushes.'),
  async h => { await h.scroll('#journey', 0, 1200); await h.spot('.jv-card', 6000); });
S('tutorial', L('每一关都是同一个节奏：先遇到问题，再看看没有 git 的笨办法，然后学习 git 的做法，在沙盒里动手，最后做一个总结。',
  'Every level follows the same rhythm: meet a problem, look at the crude no-git way, learn the git way, practise in the sandbox, and finish with a debrief.'),
  async h => { await h.spot('.jv-loop', 5000); });
S('tutorial', L('关掉总览。顶部这一条是任务线，每个圆点是一关，点一下就能跳过去。我们跳到第一站的“第一次快照”。',
  'Close the overview. The strip at the top is the quest line: every dot is a level, and clicking one takes you there. Let us jump to the first snapshot level.'),
  async h => { await h.page.evaluate(() => window.GitGame.closeJourney()); await sleep(600); await h.spot('#questline', 3500); await h.clickDot('c1-2'); });
S('tutorial', L('每一关先是简报。第一张卡片是问题：', 'Each level starts with a briefing. The first card is the problem: ') + lv('c1-2').problem.story,
  async h => { await h.spot('#briefing', 4000); });
S('tutorial', L('第二张卡片：没有 git 的时候你会怎么做。', 'The second card: what you would do without git. ') + join(lv('c1-2').crude.steps.map(s => s.text)) + L('。代价是：', '. The cost: ') + lv('c1-2').crude.pain,
  async h => { await h.click('.b-next'); await h.spot('.storyboard', 5000); await h.spot('.b-pain', 3000); });
S('tutorial', L('第三张卡片是 git 的做法：', 'The third card is the git way: ') + lv('c1-2').git.idea,
  async h => { await h.click('.b-next'); await h.spot('#briefing', 3000); });
S('tutorial', L('第四张卡片提前告诉你这一关可能会经历什么：', 'The fourth card tells you in advance what you may run into: ') + lv('c1-2').expect[0],
  async h => { await h.click('.b-next'); await h.spot('#briefing', 3000); await h.click('.b-start'); });
S('tutorial', L('开始动手。左边一次只突出一个当前任务：这一步做什么、为什么做、要看哪个面板。',
  'Now the hands-on part. On the left, only the current task is highlighted: what to do, why, and which panel to watch.'),
  async h => { await h.spot('.task-current', 5000); });
S('tutorial', L('先创建一个说明文件，再用 git add 把文件放进暂存区。右边的三棵树面板里，暂存区这一列已经登记了它们。',
  'First we create a README, then use git add to put the files in the staging area. In the Three trees panel on the right, the staging column now lists them.'),
  async h => { await h.type(L('echo "# 项目说明" > README.md', 'echo "# About this project" > README.md')); await h.type('git add .'); await h.tab('trees'); await h.spot('#tab-trees', 3500); });
S('tutorial', L('如果输错命令会怎样？比如把 commit 拼错了。', 'What if you type something wrong? Say, a typo in commit.'),
  async h => { await h.type(L('git comit -m "第一次提交"', 'git comit -m "First commit"')); await h.spot('#feedback-box', 2500); });
S('tutorial', L('终端会给出和真实 git 一样的报错，下面的导师会告诉你哪里错了、该怎么改。输错不扣分，这本来就是学习的一部分。',
  'The terminal shows the same error real git would, and the mentor below explains what went wrong and how to fix it. Mistakes cost nothing; they are part of learning.'),
  async h => { await h.spot('.feedback', 5000); });
S('tutorial', L('改正后，先用 git status 确认，再提交。', 'After fixing it, check with git status, then commit.'),
  async h => { await h.type('git status', { pause: 2500 }); await h.type(L('git commit -m "第一次提交"', 'git commit -m "First commit"')); });
S('tutorial', L('提交图上出现了第一个节点。原理对比面板会解释 git 在底层做了什么：创建了哪些对象、移动了哪个指针，以及如果用复制文件夹的办法要怎么做。',
  'The first node appears in the commit graph. The Analogy panel explains what git did under the hood: which objects it created, which pointer moved, and how you would do the same by copying folders.'),
  async h => { await h.tab('graph'); await h.spot('#tab-graph', 2500); await h.tab('analogy'); await h.spot('#analogy-card', 4500); await h.tab('graph'); });
S('tutorial', L('全部任务完成后是总结：没有 git 和用 git 的对照、你用到的命令、常见的坑，以及下一关要解决的问题。',
  'When all tasks are done you get a debrief: no-git versus git side by side, the commands you used, common pitfalls, and the next problem to solve.'),
  async h => { await h.spot('#debrief', 7000); });

S('tutorial', L('接下来看一个更难的问题：合并冲突。', 'Next, a harder problem: a merge conflict. ') + lv('c4-1').problem.story,
  async h => { await h.go('c4-1'); await h.spot('#briefing', 3500); });
S('tutorial', L('没有 git 的时候：', 'Without git: ') + join(lv('c4-1').crude.steps.map(s => s.text)) + L('。', '. ') + lv('c4-1').crude.pain,
  async h => { await h.click('.b-next'); await h.spot('.storyboard', 6000); });
S('tutorial', L('我们直接动手，先合并 feature 分支。', 'Let us get hands-on and merge the feature branch.'),
  async h => { await h.click('.b-skip-link'); await sleep(400); await h.type('git merge feature', { pause: 2000 }); });
S('tutorial', L('git 报告冲突。简报里已经提前说过，这是正常的。导师也给出了解决步骤。',
  'Git reports a conflict. The briefing warned us this is normal, and the mentor lists the steps to resolve it.'),
  async h => { await h.spot('#terminal', 2500); await h.spot('.feedback', 3500); });
S('tutorial', L('打开文件看看。上半段是你这边的版本，下半段是 feature 分支的版本。git 不替你做决定，你要写出最终想要的样子。',
  'Let us open the file. The top half is your side, the bottom half is the feature branch. Git will not decide for you; you write the final version.'),
  async h => { await h.type('cat greeting.js', { pause: 4500 }); });
S('tutorial', L('我们把两边的改动都保留下来，删掉冲突标记，然后保存。', 'We keep both changes, delete the conflict markers, and save.'),
  async h => { await h.edit('greeting.js', 'export function greet(name) {\n  return "Hi, " + name.trim() + "!";\n}\n'); });
S('tutorial', L('用 git add 告诉 git 冲突已经解决，再提交。提交图上出现了一个有两个父提交的合并提交。',
  'Use git add to tell git the conflict is resolved, then commit. The graph now shows a merge commit with two parents.'),
  async h => { await h.type('git add greeting.js'); await h.type(L('git commit -m "合并 feature，解决冲突"', 'git commit -m "Merge feature, resolve conflict"')); await h.tab('graph'); await h.spot('#tab-graph', 3000); });

S('tutorial', L('再看多人协作里最常见的一幕。', 'Now the most common scene in teamwork. ') + lv('c5-4').problem.story,
  async h => { await h.go('c5-4'); await h.spot('#briefing', 3000); });
S('tutorial', L('没有 git 的时候：', 'Without git: ') + join(lv('c5-4').crude.steps.map(s => s.text)) + L('。', '. ') + lv('c5-4').crude.pain,
  async h => { await h.click('.b-next'); await h.spot('.storyboard', 6000); await h.click('.b-skip-link'); });
S('tutorial', L('多人面板里能同时看到你的仓库、服务器，以及小明的仓库。小明已经先推送了。',
  'The Team panel shows your repository, the server, and Xiaoming\'s repository side by side. Xiaoming has already pushed.'),
  async h => { await h.tab('multi'); await h.spot('#tab-multi', 5000); });
S('tutorial', L('我们试着推送。推送被拒绝了。这不是故障，而是 git 在保护小明的提交：服务器只接受建立在它最新版本之上的推送。',
  'We try to push, and it gets rejected. That is not a failure: git is protecting Xiaoming\'s commit. The server only accepts pushes built on top of its latest version.'),
  async h => { await h.type('git push', { pause: 3000 }); await h.spot('.feedback', 3000); });
S('tutorial', L('先用 git pull --rebase 把小明的提交拉下来，你的提交接在后面，再推送。两个人的工作都保住了。',
  'First pull with rebase: Xiaoming\'s commit comes down and yours goes on top. Then push again, and both people\'s work is safe.'),
  async h => { await h.type('git pull --rebase', { pause: 2000 }); await h.type('git log --oneline --graph', { pause: 2500 }); await h.type('git push', { pause: 2000 }); await h.tab('multi'); await h.spot('#tab-multi', 3000); });

S('tutorial', L('最后是后悔药。', 'Finally, undo. ') + lv('c2-6').problem.story,
  async h => { await h.go('c2-6'); await h.click('.b-skip-link'); await h.type('git log --oneline', { pause: 2500 }); });
S('tutorial', L('git log 里看不到那几个提交了，但它们并没有真的消失。git reflog 记录了 HEAD 的每一次移动。',
  'The commits are gone from git log, but they have not really disappeared. git reflog records every move of HEAD.'),
  async h => { await h.type('git reflog', { pause: 4000 }); });
S('tutorial', L('回到重置之前的位置，三个提交全都回来了。', 'Go back to where HEAD was before the reset, and all three commits are back.'),
  async h => { await h.type('git reset --hard HEAD@{1}', { pause: 1500 }); await h.type('git log --oneline', { pause: 3000 }); });
S('tutorial', L('这就是 Git 沙盒学院：先遇到问题，再学解决问题的 git 操作。一切都在浏览器里，可以随便犯错，随时重来。祝你玩得开心。',
  'That is Git Sandbox Academy: meet the problem first, then learn the git that solves it. Everything runs in your browser, so make mistakes freely and start over any time. Have fun.'),
  async h => { await h.page.evaluate(() => window.GitGame.openJourney()); await sleep(800); await h.card(L('开始你的 git 旅程', 'Start your git journey'), 'github.com/kaixindelele/gitgame'); });

// ===== 宣传视频 =====
S('promo', L('你的电脑里，是不是也有一堆“最终版”、“最终版二”、“真的最终版”？',
  'Does your computer also have a pile of folders called final, final two, and really final?'),
  async h => { await h.page.evaluate(() => window.GitGame.closeJourney()); await h.go('c0-2'); await h.click('.b-skip-link'); await h.type('ls', { pause: 3500 }); });
S('promo', L('没有 git 的时候，我们只能复制文件夹、传压缩包，然后在群里问：谁有最新版？',
  'Without git we copy folders, pass zip files around, and ask the group chat who has the latest version.'),
  async h => { await h.card(L('还在用「最终版2_真的最终.zip」？', 'Still using "final_v2_REALLY_final.zip"?'), '', 'linear-gradient(135deg,#2a1414,#0f1218)'); });
S('promo', L('Git 沙盒学院，用真实的 git 逻辑，在浏览器里一步一步学会 git。',
  'Git Sandbox Academy teaches you git step by step, in your browser, with real git logic.'),
  async h => { await h.card(L('Git 沙盒学院', 'Git Sandbox Academy'), L('在浏览器里，用真实的 git 逻辑学 git', 'Learn git with real git logic, right in your browser')); });
S('promo', L('九个阶段，按你真实会遇到的问题排好：存档、后悔药、分支、冲突、多人协作、事故恢复、追查 bug。',
  'Nine stages, ordered by the problems you will really face: saving, undoing, branching, conflicts, teamwork, accidents and bug hunting.'),
  async h => { await h.page.evaluate(() => window.GitGame.openJourney()); await sleep(600); await h.scroll('#journey', 1400, 6000); });
S('promo', L('每一关先让你看到没有 git 时的笨办法和它的代价，再教你 git 的做法。',
  'Every level first shows you the crude no-git way and what it costs, then teaches you the git way.'),
  async h => { await h.page.evaluate(() => window.GitGame.closeJourney()); await h.go('c5-4'); await h.click('.b-next'); await h.spot('.storyboard', 4500); });
S('promo', L('冲突、被拒绝的推送、找回删掉的提交，都在一个可以随便犯错的沙盒里亲手体验。',
  'Conflicts, rejected pushes, recovering deleted commits: you try them all yourself in a sandbox where mistakes are welcome.'),
  async h => { await h.go('c4-1'); await h.click('.b-skip-link'); await h.type('git merge feature', { pause: 1500 }); await h.type('cat greeting.js', { pause: 2500 }); });
S('promo', L('输错了？导师会告诉你为什么错、怎么改。', 'Typed something wrong? The mentor tells you why and how to fix it.'),
  async h => { await h.type('git comit', { pause: 800 }); await h.spot('.feedback', 3000); });
S('promo', L('虚拟同事会真的提交和推送，你能亲眼看到多人协作里会发生什么。',
  'Virtual teammates really commit and push, so you see exactly what happens when people work together.'),
  async h => { await h.go('c5-4'); await h.click('.b-skip-link'); await h.tab('multi'); await h.type('git push', { pause: 2500 }); });
S('promo', L('中英文双语，打开网页就能玩。现在就开始你的 git 旅程吧。',
  'Chinese and English, nothing to install. Start your git journey today.'),
  async h => { await h.card(L('Git 沙盒学院', 'Git Sandbox Academy'), 'github.com/kaixindelele/gitgame<br><span style="color:#f5a25d">' + L('9 个阶段 · 42 关 · 可以随便犯错', '9 stages · 42 levels · mistakes welcome') + '</span>'); });

/* ---------- 执行 ---------- */
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
const server = http.createServer((req, res) => { let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html'; const f = path.join(root, p); if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res); });

(async () => {
  const scenes = SCENES[MODE];
  // ① 合成旁白
  const jobs = scenes.map((s, i) => ({ id: `s${String(i).padStart(2, '0')}`, lang: LANG, text: s.say.replace(/<[^>]+>/g, '') }));
  fs.writeFileSync(path.join(work, 'jobs.json'), JSON.stringify(jobs, null, 1));
  execFileSync('python3', [path.join(root, 'tools/tts_batch.py'), path.join(work, 'jobs.json'), path.join(work, 'audio')], { stdio: 'inherit' });
  const dur = JSON.parse(fs.readFileSync(path.join(work, 'audio', 'durations.json'), 'utf8'));

  // ② 录屏
  const PORT = parseInt(process.env.PORT || '8766', 10);
  await new Promise(r => server.listen(PORT, r));
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const vdir = path.join(work, 'raw'); fs.rmSync(vdir, { recursive: true, force: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, recordVideo: { dir: vdir, size: { width: 1280, height: 720 } } });
  const page = await context.newPage();
  const t0 = Date.now();
  await page.goto(`http://localhost:${PORT}/?lang=${LANG}`);
  await page.waitForSelector('#term-input');
  await page.evaluate(() => { try { localStorage.setItem('gitgame.tour', 'done'); } catch (e) {} });
  await page.addStyleTag({ content: `
    #__cap{position:fixed;left:50%;bottom:22px;transform:translateX(-50%);max-width:86%;background:rgba(8,12,20,.9);color:#fff;font:600 19px/1.55 -apple-system,"PingFang SC","Microsoft YaHei","Noto Sans CJK SC",sans-serif;padding:10px 20px;border-radius:12px;z-index:99999;border:1px solid rgba(255,255,255,.15);box-shadow:0 8px 30px rgba(0,0,0,.5);text-align:center;transition:opacity .25s;pointer-events:none}
    .__spot{outline:3px solid #f5a25d !important;outline-offset:3px;box-shadow:0 0 0 9999px rgba(0,0,0,.35) !important;position:relative;z-index:9000 !important;border-radius:8px;transition:outline .2s}
    #__card{position:fixed;inset:0;z-index:100000;display:flex;flex-direction:column;align-items:center;justify-content:center;color:#fff;font-family:-apple-system,"PingFang SC","Microsoft YaHei","Noto Sans CJK SC",sans-serif;transition:opacity .5s}` });

  const h = {
    page,
    async caption(text) { await page.evaluate(t => { let el = document.getElementById('__cap'); if (!el) { el = document.createElement('div'); el.id = '__cap'; document.body.appendChild(el); } el.style.opacity = t ? '1' : '0'; el.textContent = t; }, text || ''); },
    async card(title, sub, bg = 'linear-gradient(135deg,#0f1218,#1b2a3a)', ms = 3500) {
      await page.evaluate(([t, s, b]) => { const el = document.createElement('div'); el.id = '__card'; el.style.background = b; el.innerHTML = `<div style="font-size:60px;margin-bottom:12px">⎇</div><div style="font-size:50px;font-weight:800;text-align:center;max-width:90%">${t}</div><div style="font-size:24px;color:#9cd1ff;margin-top:18px;text-align:center;max-width:80%;line-height:1.6">${s}</div>`; document.body.appendChild(el); }, [title, sub, bg]);
      await sleep(ms);
      await page.evaluate(() => { const el = document.getElementById('__card'); if (el) { el.style.opacity = '0'; setTimeout(() => el.remove(), 550); } });
      await sleep(600);
    },
    async spot(sel, ms = 2500) {
      const ok = await page.evaluate(s => { const el = document.querySelector(s); if (!el) return false; el.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); el.classList.add('__spot'); return true; }, sel);
      await sleep(ms);
      if (ok) await page.evaluate(s => { const el = document.querySelector(s); if (el) el.classList.remove('__spot'); }, sel);
    },
    async scroll(sel, top, ms) { await page.evaluate(([s, t]) => { const el = document.querySelector(s); if (el) el.scrollTo({ top: t, behavior: 'smooth' }); }, [sel, top]); await sleep(ms); },
    async click(sel) { const el = await page.$(sel); if (el) { await el.click(); } await sleep(700); },
    async tab(name) { await page.click(`.tab[data-tab="${name}"]`); await sleep(500); },
    async go(id) { await page.evaluate(i => window.GitGame.loadLevel(i), id); await sleep(900); },
    async clickDot(id) { await h.spot(`.ql-dot[data-id="${id}"]`, 1500); await page.click(`.ql-dot[data-id="${id}"]`); await sleep(900); },
    async type(cmd, { pause = 1600 } = {}) { await page.focus('#term-input'); await page.type('#term-input', cmd, { delay: TYPE_DELAY }); await sleep(400); await page.press('#term-input', 'Enter'); await sleep(pause); },
    async edit(file, content) { await h.type(`edit ${file}`, { pause: 800 }); await page.waitForSelector('#editor-modal:not(.hidden)'); await page.fill('#editor-text', ''); await page.type('#editor-text', content, { delay: 45 }); await sleep(1200); await page.click('#editor-save'); await sleep(1000); },
  };

  const timeline = [];
  for (let i = 0; i < scenes.length; i++) {
    const s = scenes[i]; const id = jobs[i].id;
    const start = Date.now();
    timeline.push({ id, t: (start - t0) / 1000 });
    await h.caption(s.say.replace(/<[^>]+>/g, ''));
    await s.run(h);
    const need = (dur[id].sec + 0.8) * 1000 - (Date.now() - start);
    if (need > 0) await sleep(need);
    console.log(`scene ${id} done (${((Date.now() - start) / 1000).toFixed(1)}s, voice ${dur[id].sec}s)`);
  }
  await h.caption(''); await sleep(800);
  await page.close(); await context.close(); await browser.close(); server.close();

  // ③ 合成音轨并封装
  const ffmpeg = execSync('python3 -c "import imageio_ffmpeg;print(imageio_ffmpeg.get_ffmpeg_exe())"').toString().trim();
  const webm = path.join(vdir, fs.readdirSync(vdir).find(f => f.endsWith('.webm')));
  const args = ['-y', '-i', webm];
  timeline.forEach(x => args.push('-i', path.join(work, 'audio', `${x.id}.wav`)));
  const LEAD = 0.35; // 旁白比画面略晚一点开始
  const filters = timeline.map((x, i) => `[${i + 1}:a]adelay=${Math.round((x.t + LEAD) * 1000)}:all=1[a${i}]`);
  filters.push(`${timeline.map((_, i) => `[a${i}]`).join('')}amix=inputs=${timeline.length}:normalize=0:dropout_transition=0,volume=1.6,aresample=48000[aout]`);
  args.push('-filter_complex', filters.join(';'), '-map', '0:v', '-map', '[aout]', '-c:v', 'libx264', '-preset', 'medium', '-crf', '23', '-pix_fmt', 'yuv420p', '-r', '25', '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', '-shortest', outFile);
  execFileSync(ffmpeg, args, { stdio: 'ignore' });
  console.log('wrote', outFile, Math.round(fs.statSync(outFile).size / 1024) + 'KB');
})().catch(e => { console.error(e); process.exit(1); });
