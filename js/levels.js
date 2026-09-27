/* 关卡定义：每关有 setup（构造世界）、tasks（判定）、hints、intro（讲解）、feedback（针对性纠正）
 * 中英双语：所有玩家可见文本都写成 T('中文', 'English')。语言在页面加载时就确定，
 * 所以 setup 里造出的提交信息与 check 里比较用的是同一个 T(...) 结果，两边始终一致。 */
(function (global) {
  'use strict';
  const { abbrev } = global.GitCore;
  const T = global.T || ((zh, en) => zh);

  /* ---------- 工具 ---------- */
  const PROJ = '/home/you/project';
  const SRV = '/srv/git/project.git';
  const XM = '/home/xiaoming/project';
  const TEAM_README = T('# 团队项目\n', '# Team project\n');
  function sh(ctx, lines) { for (const l of lines) { const r = ctx.world.exec(l, { silent: true }); if (!r.ok) console.warn('setup failed:', l, r.err); } }
  function asUser(ctx, user, lines) { const home = '/home/' + user; ctx.world.mkdirp(home); for (const l of [].concat(lines)) { const cwd = ctx.world.repoAt(home + '/project') ? home + '/project' : home; const r = ctx.world.runAs(user, cwd, l); if (!r.ok) console.warn(user + ' failed:', l, r.err); } }
  function asXm(ctx, lines) { asUser(ctx, 'xiaoming', lines); }
  function asXh(ctx, lines) { asUser(ctx, 'xiaohong', lines); }
  function identity(ctx) { sh(ctx, [T('git config --global user.name "你"', 'git config --global user.name "You"'), 'git config --global user.email "you@example.com"']); }
  function xmIdentity(ctx) { ctx.world.mkdirp('/home/xiaoming'); ctx.world.globalConfigFor('/home/xiaoming')['user.name'] = T('小明', 'Xiaoming'); ctx.world.globalConfigFor('/home/xiaoming')['user.email'] = 'xiaoming@example.com'; }
  function xhIdentity(ctx) { ctx.world.mkdirp('/home/xiaohong'); ctx.world.globalConfigFor('/home/xiaohong')['user.name'] = T('小红', 'Xiaohong'); ctx.world.globalConfigFor('/home/xiaohong')['user.email'] = 'xiaohong@example.com'; }
  function newProject(ctx, files, msg = 'init') {
    identity(ctx);
    const lines = ['mkdir -p ' + PROJ, 'cd ' + PROJ, 'git init'];
    for (const [p, c] of Object.entries(files)) lines.push(`printf ${JSON.stringify(c)} > ${p}`);
    if (msg) lines.push('git add .', `git commit -m "${msg}"`);
    sh(ctx, lines);
  }
  function write(ctx, path, content) { ctx.world.writeFile(path, content); }
  function commit(ctx, files, msg) { const lines = ['cd ' + PROJ]; for (const [p, c] of Object.entries(files)) { if (c === null) lines.push(`git rm -q ${p}`); else lines.push(`printf ${JSON.stringify(c)} > ${p}`); } lines.push('git add -A', `git commit -m "${msg}"`); sh(ctx, lines); }
  // 用远程服务器 + 小明的克隆构造协作场景
  function collab(ctx, files, msg = 'init') {
    newProject(ctx, files, msg);
    xmIdentity(ctx);
    sh(ctx, ['git init --bare ' + SRV, 'cd ' + PROJ, 'git remote add origin ' + SRV, 'git push -u origin main']);
    ctx.world.remoteAliases['https://github.com/team/project.git'] = SRV;
    ctx.world.remoteAliases['git@github.com:team/project.git'] = SRV;
    asXm(ctx, ['git clone ' + SRV]);
    sh(ctx, ['cd ' + PROJ]);
  }
  const repo = ctx => ctx.world.repoAt(PROJ);
  const srv = ctx => ctx.world.repoAt(SRV);
  const ran = (ctx, re) => ctx.world.log.some(l => l.ok && re.test(l.line));
  const ranAny = (ctx, re) => ctx.world.log.some(l => re.test(l.line));
  const headFile = (ctx, p) => { const r = repo(ctx); return r ? r.fileAt('HEAD', p) : null; };
  const has = (s, sub) => s !== null && s !== undefined && s.includes(sub);
  const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const noMarkers = s => s !== null && !/^(<<<<<<<|=======|>>>>>>>)/m.test(s);
  // 玩家是否用 git <cmd> <rev> 看过/操作过某个提交（rev 可以是 HEAD~2、哈希等任意写法）
  const ranOn = (ctx, cmd, hash) => ctx.world.log.some(l => { if (!l.ok) return false; const m = l.line.match(new RegExp('^git ' + cmd + '\\s+(?:-\\S+\\s+)*([^\\s:]+)')); if (!m) return false; const r = repo(ctx); try { return r.resolveRev(m[1]) === hash; } catch (e) { return false; } });
  const findCommit = (ctx, subject) => { const r = repo(ctx); return r.allCommits().find(c => c.message.split('\n')[0] === subject); };

  /* 在 setup 里造出来、又要在 check 里比对的提交信息：两处用同一个常量 */
  const SUBJ = {
    debugCommit: T('调试代码（不该提交）', 'Debug code (should not be committed)'),
    fixCrash: T('修复崩溃', 'Fix crash'),
    payV2: T('支付功能 v2', 'Payment feature v2'),
    xmTweak: T('小明：调整常量', 'Xiaoming: tweak constants'),
    simplifyForm: T('简化表单代码', 'Simplify form code'),
    dailyChange: i => T('日常改动 ', 'Routine change ') + i,
  };
  /* 玩家自己输入的提交信息：两种语言都接受 */
  const HOTFIX = ['紧急修复', 'Hotfix'];

  const LEVELS = [];
  const CHAPTERS = [
    { id: 0, title: T('第 0 章 · 没有 git 的日子', 'Chapter 0 · Life before git'), desc: T('先用最原始的“复制文件夹”法备份，体会一下痛点。后面每个 git 概念都会和它对照。', 'First, back up the most primitive way — by copying the folder — and feel the pain. Every git concept later is compared against it.') },
    { id: 1, title: T('第 1 章 · 基础三板斧', 'Chapter 1 · The basics'), desc: T('init / add / commit / status / diff / log —— 工作区、暂存区、提交三棵树。', 'init / add / commit / status / diff / log — the three trees: working tree, staging area, commits.') },
    { id: 2, title: T('第 2 章 · 撤销与找回', 'Chapter 2 · Undo and recovery'), desc: T('restore / reset / revert / amend / reflog —— 犯错不可怕，git 几乎什么都能找回来。', 'restore / reset / revert / amend / reflog — mistakes are fine; git can get almost anything back.') },
    { id: 3, title: T('第 3 章 · 分支', 'Chapter 3 · Branches'), desc: T('branch / switch / merge / rebase / cherry-pick / stash / tag —— 分支只是一个指针。', 'branch / switch / merge / rebase / cherry-pick / stash / tag — a branch is just a pointer.') },
    { id: 4, title: T('第 4 章 · 冲突', 'Chapter 4 · Conflicts'), desc: T('同一处各改各的，git 无法替你决定。学会读冲突标记、解决、中止。', 'When both sides change the same spot, git can\'t decide for you. Learn to read conflict markers, resolve, and abort.') },
    { id: 5, title: T('第 5 章 · 多人协作', 'Chapter 5 · Teamwork'), desc: T('clone / push / fetch / pull —— 和同事小明一起改同一个仓库，被拒绝、分叉、冲突、强推。', 'clone / push / fetch / pull — share a repo with your teammate Xiaoming: rejected pushes, diverged history, conflicts, force pushes.') },
    { id: 6, title: T('第 6 章 · 删除与数据恢复', 'Chapter 6 · Deleting and recovering data'), desc: T('删文件、删分支、被覆盖的远程、清理杂物——什么能找回，什么真的没了。', 'Deleted files, deleted branches, an overwritten remote, cleaning up clutter — what can come back, and what is truly gone.') },
    { id: 7, title: T('第 7 章 · 定位 bug', 'Chapter 7 · Hunting bugs'), desc: T('blame / log -S / bisect —— 用历史回答“是谁、什么时候、为什么改坏了”。', 'blame / log -S / bisect — let history answer “who broke it, when, and why”.') },
    { id: 8, title: T('第 8 章 · 自由沙盒', 'Chapter 8 · Free sandbox'), desc: T('一个带远程和两位同事的完整环境，随便折腾。', 'A complete setup with a remote and two teammates. Play around freely.') },
  ];

  /* ================= 第 0 章 ================= */
  LEVELS.push({
    id: 'c0-1', chapter: 0, title: T('手工备份：cp -r 大法', 'Manual backups: the cp -r way'),
    intro: T(`<p>你在 <code>~/project</code> 里写了一个小程序。没有版本控制的年代，人们这样“存档”：<b>整个文件夹复制一份，改个名字</b>。</p>
<p>试一试这个流程，感受一下它哪里不方便。右侧的“原理对比”面板以后会把每个 git 命令和这种做法对照。</p>
<p class="tip">终端支持 <code>ls</code>、<code>cat</code>、<code>cp -r</code>、<code>echo "文本" >> 文件</code>、<code>diff -r</code>、<code>du -sh</code>，输入 <code>help</code> 查看全部。</p>`,
      `<p>You wrote a small program in <code>~/project</code>. Before version control, people “saved” like this: <b>copy the whole folder and give it a new name</b>.</p>
<p>Try this workflow and notice what's awkward about it. From now on, the “Under the hood” panel on the right compares every git command with this approach.</p>
<p class="tip">The terminal supports <code>ls</code>, <code>cat</code>, <code>cp -r</code>, <code>echo "text" >> file</code>, <code>diff -r</code> and <code>du -sh</code>. Type <code>help</code> to see everything.</p>`),
    setup(ctx) { ctx.world.mkdirp('/home/you/project'); write(ctx, '/home/you/project/app.js', 'function hello() {\n  console.log("hello");\n}\nhello();\n'); write(ctx, '/home/you/project/README.md', T('# 我的项目\n', '# My project\n')); },
    tasks: [
      { text: T('把 project 整个复制一份，命名为 project_v1（cp -r project project_v1）', 'Copy the whole project folder to project_v1 (cp -r project project_v1)'), check: ctx => ctx.world.isDir('/home/you/project_v1') },
      { text: T('修改 project/app.js（例如 echo "// 新功能" >> project/app.js）', 'Change project/app.js (e.g. echo "// new feature" >> project/app.js)'), check: ctx => { const c = ctx.world.readFile('/home/you/project/app.js'); return c && c !== 'function hello() {\n  console.log("hello");\n}\nhello();\n'; } },
      { text: T('再备份一份 project_v2', 'Make another backup: project_v2'), check: ctx => ctx.world.isDir('/home/you/project_v2') && ctx.world.readFile('/home/you/project_v2/app.js') !== ctx.world.readFile('/home/you/project_v1/app.js') },
      { text: T('用 diff -r project_v1 project_v2 看看两次备份差在哪', 'Use diff -r project_v1 project_v2 to see how the two backups differ'), check: ctx => ran(ctx, /^diff\s+.*project_v1.*project_v2|^diff\s+.*project_v2.*project_v1/) || ctx.world.log.some(l => /^diff\b/.test(l.line) && l.ok) },
      { text: T('用 du -sh * 看看磁盘占用', 'Check disk usage with du -sh *'), check: ctx => ranAny(ctx, /^du\b/) },
    ],
    hints: ['cp -r project project_v1', T('echo "// 新功能" >> project/app.js', 'echo "// new feature" >> project/app.js'), 'cp -r project project_v2', 'diff -r project_v1 project_v2', 'du -sh *'],
    done: T(`<p>痛点已经出现了：</p><ul><li>每份备份都是<b>完整复制</b>，README.md 一个字没改也被复制了 N 次。</li><li>备份之间<b>没有说明</b>：v2 比 v1 改了什么？为什么改？只能靠 diff 硬看。</li><li>你不知道 v1 和 v2 之间是否还有别的版本，也不知道谁改的。</li></ul><p>git 解决的就是这三件事：<b>相同内容只存一份、每个快照都有说明、快照之间记住先后与分叉</b>。</p>`,
      `<p>The pain points are already showing:</p><ul><li>Every backup is a <b>full copy</b> — README.md didn't change at all, yet it got copied N times.</li><li>Backups come with <b>no description</b>: what changed from v1 to v2, and why? You can only squint at diff.</li><li>You don't know whether there were other versions between v1 and v2, or who made the changes.</li></ul><p>These are exactly the three things git solves: <b>identical content is stored once, every snapshot has a message, and snapshots remember their order and where they branched</b>.</p>`),
  });
  LEVELS.push({
    id: 'c0-2', chapter: 0, title: T('备份地狱：哪个才是最终版？', 'Backup hell: which one is the final version?'),
    intro: T(`<p>一年后，你的目录变成了这样。老板说：“把<b>端口是 8080</b> 的那个版本恢复回来！”</p><p>而且其中有两个备份其实一模一样，浪费空间，请删掉重复的那个。</p>
<p class="tip">可用工具：<code>grep -r "关键字" 目录</code>、<code>diff -r 目录1 目录2</code>（没有输出就表示完全相同）、<code>cp -r</code>、<code>rm -r</code>。</p>`,
      `<p>A year later, your home folder looks like this. Your boss says: “Bring back the version where <b>the port is 8080</b>!”</p><p>Also, two of these backups are actually identical and waste space — delete the duplicate.</p>
<p class="tip">Tools you can use: <code>grep -r "keyword" dir</code>, <code>diff -r dir1 dir2</code> (no output means identical), <code>cp -r</code>, <code>rm -r</code>.</p>`),
    setup(ctx) {
      const mk = (dir, port, extra) => { ctx.world.mkdirp('/home/you/' + dir); write(ctx, `/home/you/${dir}/config.js`, `module.exports = {\n  port: ${port},\n  debug: ${extra},\n};\n`); write(ctx, `/home/you/${dir}/app.js`, 'const cfg = require("./config");\nconsole.log("listening on", cfg.port);\n'); };
      mk('project', 3000, 'true'); mk('project_final', 5000, 'false'); mk('project_final2', 8080, 'false'); mk(T('project_final_真的最终', 'project_final_REALLY_final'), 9000, 'true'); mk('project_backup_0103', 5000, 'false'); mk('project_old', 80, 'true');
    },
    tasks: [
      { text: T('用 grep -r 找到 config.js 里 port 为 8080 的那个备份', 'Use grep -r to find the backup whose config.js has port 8080'), check: ctx => ranAny(ctx, /grep.*8080/) },
      { text: T('把它恢复成 project（先 rm -r project，再 cp -r 那个备份 project）', 'Restore it as project (rm -r project, then cp -r that backup to project)'), check: ctx => has(ctx.world.readFile('/home/you/project/config.js'), '8080') },
      { text: T('找出两个内容完全相同的备份（diff -r），删掉其中一个', 'Find the two identical backups (diff -r) and delete one of them'), check: ctx => { const a = ctx.world.isDir('/home/you/project_final'), b = ctx.world.isDir('/home/you/project_backup_0103'); return (a && !b) || (!a && b); } },
    ],
    hints: ['grep -r 8080 .', 'rm -r project && cp -r project_final2 project', T('diff -r project_final project_backup_0103 （没有输出 = 完全相同）', 'diff -r project_final project_backup_0103  (no output = identical)'), 'rm -r project_backup_0103'],
    done: T(`<p>你刚才做的其实就是 git 内部的两件事：<b>按内容查找版本</b>（git 用哈希，秒查）和<b>内容去重</b>（git 里相同内容的文件天然只存一份）。</p><p>接下来，让我们把这套流程交给 git。</p>`,
      `<p>What you just did is really two things git does internally: <b>finding versions by content</b> (git uses hashes, so it's instant) and <b>deduplicating content</b> (in git, identical files are naturally stored only once).</p><p>Next, let's hand this whole workflow over to git.</p>`),
  });

  /* ================= 第 1 章 ================= */
  LEVELS.push({
    id: 'c1-1', chapter: 1, title: T('git init：给文件夹装上“记忆”', 'git init: give your folder a memory'),
    intro: T(`<p><code>git init</code> 会在目录里创建一个隐藏的 <code>.git</code> 文件夹——这就是你的“备份盒子”，所有历史都存在里面，项目文件本身不受影响。</p>
<p>git 还需要知道<b>你是谁</b>，每次提交都会记下作者。用 <code>git config --global user.name "名字"</code> 和 <code>user.email</code> 设置。</p>`,
      `<p><code>git init</code> creates a hidden <code>.git</code> folder in the directory — that's your “backup box”. All history lives inside it; your project files are untouched.</p>
<p>git also needs to know <b>who you are</b>, because every commit records its author. Set it with <code>git config --global user.name "Name"</code> and <code>user.email</code>.</p>`),
    setup(ctx) { ctx.world.mkdirp('/home/you/project'); write(ctx, '/home/you/project/app.js', 'console.log("hello");\n'); },
    tasks: [
      { text: T('进入 project 目录并执行 git init', 'Go into the project folder and run git init'), check: ctx => !!repo(ctx) },
      { text: T('设置 user.name（git config --global user.name "你的名字"）', 'Set user.name (git config --global user.name "Your Name")'), check: ctx => !!(ctx.world.globalConfigFor(PROJ)['user.name'] || (repo(ctx) && repo(ctx).config['user.name'])) },
      { text: T('设置 user.email', 'Set user.email'), check: ctx => !!(ctx.world.globalConfigFor(PROJ)['user.email'] || (repo(ctx) && repo(ctx).config['user.email'])) },
      { text: T('运行 git status 看看现在的状态', 'Run git status to see where things stand'), check: ctx => !!repo(ctx) && ran(ctx, /^git status/) },
    ],
    hints: ['cd project', 'git init', T('git config --global user.name "小王"', 'git config --global user.name "Alex"'), T('git config --global user.email "xiaowang@example.com"', 'git config --global user.email "alex@example.com"'), 'git status'],
    feedback(ctx, cmd, res) { if (ctx.world.repoAt('/home/you')) return T('⚠️ 你在主目录 <code>~</code> 里执行了 git init，整个主目录都成了仓库（真实世界里这是新手最常见的失误，会把桌面、下载目录全都纳入）。撤销：<code>rm -rf ~/.git</code>，然后 <code>cd project</code> 再 <code>git init</code>。', '⚠️ You ran git init in your home folder <code>~</code>, so the whole home folder became a repository (a classic beginner mistake in real life — it sweeps in your Desktop, Downloads and everything). Undo it: <code>rm -rf ~/.git</code>, then <code>cd project</code> and <code>git init</code> again.'); return null; },
    done: T(`<p>注意 status 里的 <b>Untracked files</b>：app.js 在文件夹里，但 git 还没有“跟踪”它。git 不会自作主张备份任何东西，一切由你用 <code>git add</code> 决定。</p><p>试试 <code>ls -a</code>，能看到 <code>.git/</code>。</p>`,
      `<p>Notice <b>Untracked files</b> in the status: app.js is in the folder, but git isn't “tracking” it yet. git never backs anything up on its own — you decide what goes in with <code>git add</code>.</p><p>Try <code>ls -a</code> and you'll see <code>.git/</code>.</p>`),
  });
  LEVELS.push({
    id: 'c1-2', chapter: 1, title: T('add 与 commit：第一次快照', 'add and commit: your first snapshot'),
    intro: T(`<p>git 有三个区域：</p><ol><li><b>工作区</b>：你看到、编辑的文件。</li><li><b>暂存区（index）</b>：下一次快照“准备包含哪些内容”的清单。<code>git add</code> 把文件放进去。</li><li><b>仓库（提交历史）</b>：<code>git commit</code> 把暂存区变成一个永久快照。</li></ol>
<p>对照原始方案：add = 把文件复制到“待打包”文件夹；commit = 把它压缩成一个带说明、带编号的存档。右侧“三棵树”标签可以实时看到这三个区域。</p>`,
      `<p>git has three areas:</p><ol><li><b>Working tree</b>: the files you see and edit.</li><li><b>Staging area (index)</b>: the list of what the next snapshot is “going to contain”. <code>git add</code> puts files there.</li><li><b>Repository (commit history)</b>: <code>git commit</code> turns the staging area into a permanent snapshot.</li></ol>
<p>Compared with the copy-the-folder approach: add = copying files into a “to be packed” folder; commit = zipping it into a numbered archive with a description. The “Three trees” tab on the right shows all three areas live.</p>`),
    setup(ctx) { identity(ctx); sh(ctx, ['mkdir -p ' + PROJ, 'cd ' + PROJ, 'git init']); write(ctx, PROJ + '/app.js', 'console.log("hello");\n'); },
    tasks: [
      { text: T('创建 README.md（echo "# 项目说明" > README.md）', 'Create README.md (echo "# About this project" > README.md)'), check: ctx => repo(ctx) && repo(ctx).workdir.has('README.md') },
      { text: T('把 app.js 和 README.md 都加入暂存区（git add）', 'Add both app.js and README.md to the staging area (git add)'), check: ctx => !!repo(ctx) && ((repo(ctx).index.has('app.js') && repo(ctx).index.has('README.md')) || (repo(ctx).headHash() && repo(ctx).fileAt('HEAD', 'app.js') !== null && repo(ctx).fileAt('HEAD', 'README.md') !== null)) },
      { text: T('用 git status 确认它们出现在 "Changes to be committed"', 'Use git status to confirm they appear under "Changes to be committed"'), check: ctx => ran(ctx, /^git status/) },
      { text: T('提交，说明写 "第一次提交"（git commit -m "第一次提交"）', 'Commit with the message "First commit" (git commit -m "First commit")'), check: ctx => repo(ctx) && repo(ctx).headHash() && repo(ctx).fileAt('HEAD', 'app.js') !== null && repo(ctx).fileAt('HEAD', 'README.md') !== null },
    ],
    hints: [T('echo "# 项目说明" > README.md', 'echo "# About this project" > README.md'), T('git add app.js README.md  （或 git add .）', 'git add app.js README.md  (or git add .)'), 'git status', T('git commit -m "第一次提交"', 'git commit -m "First commit"')],
    done: T(`<p>看右侧的“原理对比”：<code>git add</code> 时创建了 2 个 blob（文件内容），<code>git commit</code> 时创建了 1 个 tree（目录快照）和 1 个 commit，并把 <code>main</code> 分支指向它。</p><p>试试 <code>git log</code> 和 <code>git cat-file -p HEAD</code>，你会看到 commit 对象的真实内容。</p>`,
      `<p>Look at “Under the hood” on the right: <code>git add</code> created 2 blobs (file contents), and <code>git commit</code> created 1 tree (a directory snapshot) and 1 commit, then pointed the <code>main</code> branch at it.</p><p>Try <code>git log</code> and <code>git cat-file -p HEAD</code> to see the actual contents of the commit object.</p>`),
  });
  LEVELS.push({
    id: 'c1-3', chapter: 1, title: T('修改 → 查看差异 → 暂存 → 提交', 'Edit → diff → stage → commit'),
    intro: T(`<p>日常工作就是这个循环。关键是理解 <code>git diff</code> 的两种用法：</p><ul><li><code>git diff</code>：工作区 vs 暂存区（“我改了什么还没 add”）</li><li><code>git diff --staged</code>：暂存区 vs 上次提交（“我准备提交什么”）</li></ul>
<p>本关请把 app.js 里的 <code>hello</code> 改成 <code>hello, git</code>，并新增一个 utils.js。可以用 <code>edit app.js</code> 打开编辑器，或用 <code>sed -i "s/hello/hello, git/" app.js</code>。</p>`,
      `<p>This loop is everyday work. The key is understanding the two ways to use <code>git diff</code>:</p><ul><li><code>git diff</code>: working tree vs staging area (“what I changed but haven't added yet”)</li><li><code>git diff --staged</code>: staging area vs last commit (“what I'm about to commit”)</li></ul>
<p>In this level, change <code>hello</code> in app.js to <code>hello, git</code>, and add a new utils.js. Use <code>edit app.js</code> to open the editor, or <code>sed -i "s/hello/hello, git/" app.js</code>.</p>`),
    setup(ctx) { newProject(ctx, { 'app.js': 'console.log("hello");\n', 'README.md': T('# 项目说明\n', '# About this project\n') }, T('第一次提交', 'First commit')); },
    tasks: [
      { text: T('修改 app.js，让它包含 hello, git', 'Edit app.js so it contains hello, git'), check: ctx => has(repo(ctx) && repo(ctx).workdir.get('app.js'), 'hello, git') },
      { text: T('运行 git diff 查看未暂存的改动', 'Run git diff to see unstaged changes'), check: ctx => ran(ctx, /^git diff\s*$/) },
      { text: T('git add app.js，然后用 git diff --staged 查看已暂存的改动', 'git add app.js, then use git diff --staged to see staged changes'), check: ctx => ran(ctx, /^git diff (--staged|--cached)/) && has(repo(ctx) && repo(ctx).index.has('app.js') ? repo(ctx).blobContent(repo(ctx).index.get('app.js')) : '', 'hello, git') },
      { text: T('提交这次修改', 'Commit this change'), check: ctx => has(headFile(ctx, 'app.js'), 'hello, git') },
      { text: T('新建 utils.js，add 并提交（现在应该有 3 个提交）', 'Create utils.js, add and commit it (you should now have 3 commits)'), check: ctx => headFile(ctx, 'utils.js') !== null && repo(ctx).commitCount() >= 3 },
    ],
    hints: [T('sed -i "s/hello/hello, git/" app.js   或   edit app.js', 'sed -i "s/hello/hello, git/" app.js   or   edit app.js'), 'git diff', 'git add app.js && git diff --staged', T('git commit -m "问候语改为 hello, git"', 'git commit -m "Change greeting to hello, git"'), T('echo "export const add = (a, b) => a + b;" > utils.js && git add utils.js && git commit -m "新增 utils"', 'echo "export const add = (a, b) => a + b;" > utils.js && git add utils.js && git commit -m "Add utils"')],
    feedback(ctx, cmd, res) { if (/^git commit/.test(cmd) && !res.ok && /no changes added to commit/.test(res.err)) return T('💡 你改了文件但还没 <code>git add</code>。git 只提交暂存区里的内容。想跳过暂存可用 <code>git commit -am "..."</code>（仅对已跟踪的文件有效）。', '💡 You changed the file but haven\'t run <code>git add</code>. git only commits what\'s in the staging area. To skip staging, use <code>git commit -am "..."</code> (works only for files git already tracks).'); return null; },
  });
  LEVELS.push({
    id: 'c1-4', chapter: 1, title: T('看看 .git 里到底有什么', 'What\'s actually inside .git?'),
    intro: T(`<p>git 的“数据库”只有 4 种对象：<b>blob</b>（文件内容）、<b>tree</b>（目录：文件名 → blob）、<b>commit</b>（指向一个 tree 和父提交）、<b>tag</b>。所有对象都用内容的 SHA-1 命名。</p>
<p>用 <code>git cat-file -p &lt;哈希&gt;</code> 可以直接打印任何对象。跟着任务走一遍，你会发现 commit → tree → blob 是一条能亲手走通的链。</p>`,
      `<p>git's “database” has only 4 kinds of objects: <b>blob</b> (file contents), <b>tree</b> (a directory: file name → blob), <b>commit</b> (points to a tree and its parent commits) and <b>tag</b>. Every object is named by the SHA-1 of its content.</p>
<p><code>git cat-file -p &lt;hash&gt;</code> prints any object directly. Follow the tasks and you'll see that commit → tree → blob is a chain you can walk by hand.</p>`),
    setup(ctx) { newProject(ctx, { 'app.js': 'console.log("hello, git");\n', 'README.md': T('# 项目说明\n', '# About this project\n') }, T('第一次提交', 'First commit')); commit(ctx, { 'utils.js': 'export const add = (a, b) => a + b;\n' }, T('新增 utils', 'Add utils')); },
    tasks: [
      { text: T('git log 查看历史（试试 --oneline）', 'View the history with git log (try --oneline)'), check: ctx => ran(ctx, /^git log/) },
      { text: T('git cat-file -p HEAD 打印最新提交对象', 'Print the latest commit object with git cat-file -p HEAD'), check: ctx => ran(ctx, /^git cat-file -p (HEAD|[0-9a-f]{4,})/) },
      { text: T('从 commit 里找到 tree 的哈希，git cat-file -p <tree哈希> 打印目录', 'Find the tree hash in the commit and print the directory with git cat-file -p <tree-hash>'), check: ctx => { const r = repo(ctx); const t = r.getCommit(r.headHash()).tree; return ran(ctx, new RegExp('^git cat-file -p ' + t.slice(0, 4))) || ran(ctx, /^git cat-file -p HEAD\^\{tree\}|^git ls-tree/); } },
      { text: T('再从 tree 里找到 app.js 的 blob 哈希并打印它', 'Then find app.js\'s blob hash in the tree and print it'), check: ctx => { const r = repo(ctx); const b = r.treeOfCommit(r.headHash()).get('app.js'); return ran(ctx, new RegExp('^git cat-file -p ' + b.slice(0, 4))) || ran(ctx, /^git show HEAD:app\.js/); } },
      { text: T('git count-objects 看看对象总数', 'Count the objects with git count-objects'), check: ctx => ran(ctx, /^git count-objects/) },
    ],
    hints: ['git log --oneline', 'git cat-file -p HEAD', T('复制输出第一行 tree 后面的哈希：git cat-file -p <那个哈希>', 'Copy the hash after "tree" on the first line of the output: git cat-file -p <that hash>'), T('复制 app.js 那一行的哈希：git cat-file -p <哈希>', 'Copy the hash on the app.js line: git cat-file -p <hash>'), 'git count-objects'],
    done: T(`<p>这就是 git 的全部秘密：<b>提交是快照，不是差异</b>。每个 commit 指向一整棵 tree；没改过的文件，新旧 tree 指向同一个 blob。右侧“原理对比”里的快照文件夹视图，用“共享”标出了这些没有重复存储的文件。</p>`,
      `<p>That's git's whole secret: <b>commits are snapshots, not diffs</b>. Every commit points to a complete tree; for files that didn't change, the old and new trees point to the same blob. The snapshot-folder view in “Under the hood” on the right marks these non-duplicated files as “shared”.</p>`),
  });
  LEVELS.push({
    id: 'c1-5', chapter: 1, title: T('.gitignore：别把垃圾提交进去', '.gitignore: keep junk out of your commits'),
    intro: T(`<p>编译产物、日志、依赖目录不该进入仓库。在 <code>.gitignore</code> 里写模式（每行一个，如 <code>*.log</code>、<code>node_modules/</code>），git 就会在 status 和 <code>git add .</code> 时忽略它们。</p><p>注意：<b>已经被跟踪的文件不受 .gitignore 影响</b>，需要先 <code>git rm --cached</code>。</p>`,
      `<p>Build output, logs and dependency folders don't belong in the repository. Write patterns in <code>.gitignore</code> (one per line, e.g. <code>*.log</code>, <code>node_modules/</code>) and git will ignore them in status and in <code>git add .</code>.</p><p>Note: <b>files that are already tracked are not affected by .gitignore</b> — you need <code>git rm --cached</code> first.</p>`),
    setup(ctx) { newProject(ctx, { 'app.js': 'console.log("hi");\n' }, 'init'); write(ctx, PROJ + '/debug.log', 'lots of logs\n'); write(ctx, PROJ + '/node_modules/lodash/index.js', 'module.exports = {};\n'); write(ctx, PROJ + '/src/main.js', 'export default 1;\n'); },
    tasks: [
      { text: T('创建 .gitignore，忽略 *.log 和 node_modules/', 'Create .gitignore that ignores *.log and node_modules/'), check: ctx => { const r = repo(ctx); return r.isIgnored('debug.log') && r.isIgnored('node_modules/lodash/index.js'); } },
      { text: T('git status 确认 debug.log 和 node_modules 消失了', 'Run git status to confirm debug.log and node_modules are gone'), check: ctx => ran(ctx, /^git status/) && repo(ctx).isIgnored('debug.log') },
      { text: T('git add . 然后提交（.gitignore 和 src/main.js 应该被提交，日志不应该）', 'git add . and commit (.gitignore and src/main.js should be committed, the log should not)'), check: ctx => headFile(ctx, '.gitignore') !== null && headFile(ctx, 'src/main.js') !== null && headFile(ctx, 'debug.log') === null && headFile(ctx, 'node_modules/lodash/index.js') === null },
    ],
    hints: ['printf "*.log\\nnode_modules/\\n" > .gitignore', 'git status', T('git add . && git commit -m "添加 gitignore"', 'git add . && git commit -m "Add gitignore"')],
    feedback(ctx, cmd, res) { if (headFile(ctx, 'debug.log') !== null) return T('⚠️ debug.log 被提交进历史了。用 <code>git rm --cached debug.log</code> 取消跟踪并重新提交（历史里仍会留下它，这就是为什么要提前写 .gitignore）。', '⚠️ debug.log got committed into history. Use <code>git rm --cached debug.log</code> to stop tracking it and commit again (it will still remain in history — which is why you write .gitignore up front).'); return null; },
  });

  /* ================= 第 2 章 ================= */
  LEVELS.push({
    id: 'c2-1', chapter: 2, title: T('丢弃工作区的修改', 'Discard changes in the working tree'),
    intro: T(`<p>你改了 app.js 改得一团糟，想回到<b>上次 add/commit 时</b>的样子。<code>git restore app.js</code>（老写法 <code>git checkout -- app.js</code>）会用暂存区里的版本覆盖工作区。</p><p class="warn">这个操作<b>不可撤销</b>：从未 add 过的修改没进过对象库，git 也救不回来。这和你手动 <code>cp 备份/app.js ./</code> 覆盖是一回事。</p>`,
      `<p>You made a mess of app.js and want it back the way it was <b>at your last add/commit</b>. <code>git restore app.js</code> (old style: <code>git checkout -- app.js</code>) overwrites the working tree with the version in the staging area.</p><p class="warn">This <b>cannot be undone</b>: changes you never added never made it into the object store, so git can't rescue them. It's the same as overwriting by hand with <code>cp backup/app.js ./</code>.</p>`),
    setup(ctx) { newProject(ctx, { 'app.js': 'function main() {\n  return 42;\n}\n' }, 'init'); write(ctx, PROJ + '/app.js', T('function main() {\n  return 42;\n}\n// 乱七八糟\n// 的改动\nthrow new Error("oops");\n', 'function main() {\n  return 42;\n}\n// messy\n// changes\nthrow new Error("oops");\n')); },
    tasks: [
      { text: T('先 git diff 看看改了什么', 'First, use git diff to see what changed'), check: ctx => ran(ctx, /^git diff/) },
      { text: T('用 git restore app.js 丢弃修改', 'Discard the changes with git restore app.js'), check: ctx => repo(ctx).workdir.get('app.js') === 'function main() {\n  return 42;\n}\n' },
      { text: T('git status 确认工作区干净', 'Run git status to confirm the working tree is clean'), check: ctx => ran(ctx, /^git status/) && repo(ctx).isClean() },
    ],
    hints: ['git diff', 'git restore app.js', 'git status'],
  });
  LEVELS.push({
    id: 'c2-2', chapter: 2, title: T('取消暂存：add 错了文件', 'Unstage: you added the wrong file'),
    intro: T(`<p>你不小心 <code>git add .</code> 把 <code>secret.env</code>（里面有密码）也放进了暂存区。在提交之前把它拿出来：<code>git restore --staged secret.env</code>（或 <code>git reset secret.env</code>）。</p><p>然后把它加进 .gitignore，以免下次再犯。</p>`,
      `<p>You ran <code>git add .</code> and accidentally staged <code>secret.env</code> (which holds a password). Take it out before committing: <code>git restore --staged secret.env</code> (or <code>git reset secret.env</code>).</p><p>Then add it to .gitignore so it doesn't happen again.</p>`),
    setup(ctx) { newProject(ctx, { 'app.js': 'console.log(1);\n' }, 'init'); write(ctx, PROJ + '/feature.js', 'export const f = 1;\n'); write(ctx, PROJ + '/secret.env', 'DB_PASSWORD=hunter2\n'); sh(ctx, ['cd ' + PROJ, 'git add .']); },
    tasks: [
      { text: T('git status 看看暂存区里有什么', 'Run git status to see what\'s staged'), check: ctx => ran(ctx, /^git status/) },
      { text: T('把 secret.env 移出暂存区（文件本身保留）', 'Unstage secret.env (keep the file itself)'), check: ctx => !repo(ctx).index.has('secret.env') && repo(ctx).workdir.has('secret.env') },
      { text: T('把 secret.env 写进 .gitignore', 'Add secret.env to .gitignore'), check: ctx => repo(ctx).isIgnored('secret.env') },
      { text: T('提交 feature.js 和 .gitignore（不能包含 secret.env）', 'Commit feature.js and .gitignore (without secret.env)'), check: ctx => headFile(ctx, 'feature.js') !== null && headFile(ctx, '.gitignore') !== null && headFile(ctx, 'secret.env') === null },
    ],
    hints: ['git status', 'git restore --staged secret.env', 'echo "secret.env" >> .gitignore', T('git add . && git commit -m "新功能"', 'git add . && git commit -m "New feature"')],
    feedback(ctx, cmd, res) { if (headFile(ctx, 'secret.env') !== null) return T('🚨 密码文件被提交了！如果这是真实项目，即使之后删掉，历史里也永远有它。现在可以 <code>git reset --soft HEAD~1</code> 撤回这次提交，再重做。', '🚨 The password file got committed! In a real project it would stay in history forever, even if you deleted it later. For now you can undo the commit with <code>git reset --soft HEAD~1</code> and redo it.'); return null; },
  });
  LEVELS.push({
    id: 'c2-3', chapter: 2, title: T('amend：修改上一次提交', 'amend: fix your last commit'),
    intro: T(`<p>刚提交完就发现：提交信息拼错了（"fix bgu"），而且忘了把 test.js 一起提交。</p><p><code>git commit --amend</code> 会用暂存区的内容 + 新信息<b>替换</b>最后一次提交（其实是创建一个新提交、把分支指针挪过去，旧提交还在 reflog 里）。</p><p class="warn">已经 push 出去的提交不要 amend，因为它改写了历史。</p>`,
      `<p>Right after committing you notice: the message has a typo ("fix bgu"), and you forgot to include test.js.</p><p><code>git commit --amend</code> <b>replaces</b> the last commit with the staging area's contents plus a new message (really, it creates a new commit and moves the branch pointer to it; the old commit stays in the reflog).</p><p class="warn">Don't amend commits you've already pushed — it rewrites history.</p>`),
    setup(ctx) { newProject(ctx, { 'app.js': 'let x = 1;\n' }, 'init'); commit(ctx, { 'app.js': 'let x = 2;\n' }, 'fix bgu'); write(ctx, PROJ + '/test.js', 'assert(x === 2);\n'); },
    tasks: [
      { text: T('把 test.js 加入暂存区', 'Stage test.js'), check: ctx => repo(ctx).index.has('test.js') || headFile(ctx, 'test.js') !== null },
      { text: T('git commit --amend -m "fix bug"，让最后一次提交包含 test.js 且信息正确', 'git commit --amend -m "fix bug" so the last commit includes test.js and has the right message'), check: ctx => { const r = repo(ctx); return r.subject(r.headHash()) === 'fix bug' && headFile(ctx, 'test.js') !== null && r.commitCount() === 2; } },
      { text: T('git reflog 看看旧的那个提交去哪了', 'Use git reflog to see where the old commit went'), check: ctx => ran(ctx, /^git reflog/) },
    ],
    hints: ['git add test.js', 'git commit --amend -m "fix bug"', 'git reflog'],
    feedback(ctx, cmd, res) { const r = repo(ctx); if (r && r.commitCount() > 2) return T('💡 你创建了一个新的提交，而不是修改上一个。要“合并进上一个提交”应该用 <code>--amend</code>。可以 <code>git reset --soft HEAD~1</code> 撤回，再 amend。', '💡 You created a new commit instead of changing the previous one. To “fold into the last commit”, use <code>--amend</code>. Undo with <code>git reset --soft HEAD~1</code>, then amend.'); return null; },
  });
  LEVELS.push({
    id: 'c2-4', chapter: 2, title: T('reset 的三种模式', 'The three modes of reset'),
    intro: T(`<p><code>git reset &lt;提交&gt;</code> 把当前分支指针挪回去。三种模式决定“暂存区和工作区跟不跟着回去”：</p>
<table class="mini"><tr><th></th><th>分支指针</th><th>暂存区</th><th>工作区</th></tr><tr><td>--soft</td><td>回退</td><td>不动</td><td>不动</td></tr><tr><td>--mixed（默认）</td><td>回退</td><td>回退</td><td>不动</td></tr><tr><td>--hard</td><td>回退</td><td>回退</td><td>回退</td></tr></table>
<p>历史现在是：init → "步骤1" → "步骤2" → "调试代码（不该提交）"。任务分两步：先用 <code>--hard</code> 彻底丢掉最后那个调试提交；再用 <code>--soft</code> 回到 init，把"步骤1"和"步骤2"的改动<b>合成一个提交</b>。</p>`,
      `<p><code>git reset &lt;commit&gt;</code> moves the current branch pointer back. The three modes decide whether the staging area and working tree go back with it:</p>
<table class="mini"><tr><th></th><th>Branch pointer</th><th>Staging area</th><th>Working tree</th></tr><tr><td>--soft</td><td>moves back</td><td>unchanged</td><td>unchanged</td></tr><tr><td>--mixed (default)</td><td>moves back</td><td>moves back</td><td>unchanged</td></tr><tr><td>--hard</td><td>moves back</td><td>moves back</td><td>moves back</td></tr></table>
<p>The history is now: init → "Step 1" → "Step 2" → "Debug code (should not be committed)". Two steps: first use <code>--hard</code> to throw away that last debug commit completely; then use <code>--soft</code> to go back to init and <b>squash</b> the "Step 1" and "Step 2" changes <b>into a single commit</b>.</p>`),
    setup(ctx) { newProject(ctx, { 'app.js': 'const app = {};\n' }, 'init'); commit(ctx, { 'step1.js': 'step 1\n' }, T('步骤1', 'Step 1')); commit(ctx, { 'step2.js': 'step 2\n' }, T('步骤2', 'Step 2')); commit(ctx, { 'debug.js': 'console.log("debug")\n' }, SUBJ.debugCommit); },
    tasks: [
      { text: T('用 git reset --hard HEAD~1 丢掉“调试代码”提交（debug.js 应从工作区消失）', 'Drop the “Debug code” commit with git reset --hard HEAD~1 (debug.js should vanish from the working tree)'), check: ctx => { const r = repo(ctx); return !r.workdir.has('debug.js') && r.subject(r.headHash()) !== SUBJ.debugCommit; } },
      { text: T('用 git reset --soft HEAD~2 回到 init，改动保留在暂存区', 'Go back to init with git reset --soft HEAD~2, keeping the changes staged'), check: ctx => { const r = repo(ctx); return (r.subject(r.headHash()) === 'init' && r.index.has('step1.js') && r.index.has('step2.js')) || (r.commitCount() === 2 && headFile(ctx, 'step1.js') !== null && headFile(ctx, 'step2.js') !== null); } },
      { text: T('重新提交为一个提交 "完成步骤1和2"（历史应只有 2 个提交）', 'Commit again as one commit "Finish steps 1 and 2" (history should have only 2 commits)'), check: ctx => { const r = repo(ctx); return r.commitCount() === 2 && headFile(ctx, 'step1.js') !== null && headFile(ctx, 'step2.js') !== null && !r.workdir.has('debug.js'); } },
    ],
    hints: ['git reset --hard HEAD~1', T('git reset --soft HEAD~2 然后 git status 看看暂存区', 'git reset --soft HEAD~2, then git status to look at the staging area'), T('git commit -m "完成步骤1和2"', 'git commit -m "Finish steps 1 and 2"')],
    done: T(`<p>被 reset 掉的提交没有消失，<code>git reflog</code> 里都能看到——下一关就用它救命。</p>`, `<p>The commits you reset away didn't disappear — they all show up in <code>git reflog</code>. The next level uses it to save the day.</p>`),
  });
  LEVELS.push({
    id: 'c2-5', chapter: 2, title: T('revert：安全地撤销一次提交', 'revert: undo a commit safely'),
    intro: T(`<p>历史里有个提交 "把税率改成 50%" 是错的，但它<b>已经推送给同事了</b>。这时不能 reset（会改写公共历史），要用 <code>git revert &lt;提交&gt;</code>：生成一个<b>新的、反向的</b>提交。</p><p>先用 <code>git log --oneline</code> 找到那个提交的哈希。</p>`,
      `<p>The commit "Change tax rate to 50%" in the history is wrong, but it has <b>already been pushed to your teammates</b>. You can't reset now (that rewrites shared history); use <code>git revert &lt;commit&gt;</code> instead, which creates a <b>new commit that does the opposite</b>.</p><p>First find that commit's hash with <code>git log --oneline</code>.</p>`),
    setup(ctx) { collab(ctx, { 'tax.js': 'export const RATE = 0.13;\n', 'app.js': 'import { RATE } from "./tax";\n' }, 'init'); commit(ctx, { 'tax.js': 'export const RATE = 0.5;\n' }, T('把税率改成 50%', 'Change tax rate to 50%')); commit(ctx, { 'app.js': 'import { RATE } from "./tax";\nconsole.log(RATE);\n' }, T('打印税率', 'Print tax rate')); sh(ctx, ['cd ' + PROJ, 'git push']); },
    tasks: [
      { text: T('用 git log 找到 "把税率改成 50%" 的提交', 'Use git log to find the "Change tax rate to 50%" commit'), check: ctx => ran(ctx, /^git log/) },
      { text: T('git revert 它（历史里出现 Revert 提交，tax.js 恢复为 0.13，"打印税率"仍然保留）', 'git revert it (a Revert commit appears, tax.js goes back to 0.13, and "Print tax rate" is kept)'), check: ctx => { const r = repo(ctx); return has(headFile(ctx, 'tax.js'), '0.13') && has(headFile(ctx, 'app.js'), 'console.log') && /^Revert/.test(r.subject(r.headHash())); } },
      { text: T('git push 把撤销推送出去', 'git push to publish the undo'), check: ctx => srv(ctx) && repo(ctx) && srv(ctx).refs.get('refs/heads/main') === repo(ctx).headHash() && /^Revert/.test(repo(ctx).subject(repo(ctx).headHash())) },
    ],
    hints: ['git log --oneline', T('git revert <那个哈希>  （比如 git revert HEAD~1）', 'git revert <that hash>  (e.g. git revert HEAD~1)'), 'git push'],
    feedback(ctx, cmd, res) { const r = repo(ctx); if (/^git reset/.test(cmd) && res.ok && r.headHash() !== srv(ctx).branchTip('main') && !r.isAncestor(srv(ctx).branchTip('main'), r.headHash())) return T('⚠️ reset 把已推送的提交从历史里抹掉了。这样 push 会被拒绝（除非强推，那会坑到同事）。这里应该用 revert。先 <code>git reset --hard origin/main</code> 回到推送过的状态，再重来。', '⚠️ reset wiped pushed commits out of your history. Now push will be rejected (unless you force push, which would hurt your teammates). Use revert here. First go back to the pushed state with <code>git reset --hard origin/main</code>, then try again.'); if (/^git revert/.test(cmd) && res.ok && has(r.fileAt('HEAD', 'tax.js'), '0.5') && /^Revert/.test(r.subject(r.headHash()))) return T('🤔 你 revert 的不是那个改税率的提交（tax.js 里还是 0.5）。用 <code>git reset --hard HEAD~1</code> 撤掉这次 revert（它还没推送，可以 reset），再看 <code>git log --oneline</code> 找对提交。', '🤔 That wasn\'t the commit that changed the tax rate (tax.js still says 0.5). Undo this revert with <code>git reset --hard HEAD~1</code> (it isn\'t pushed yet, so reset is fine), then check <code>git log --oneline</code> for the right commit.'); return null; },
  });
  LEVELS.push({
    id: 'c2-6', chapter: 2, title: T('reflog：找回“消失”的提交', 'reflog: recover “vanished” commits'),
    intro: T(`<p>灾难现场：你本想 <code>git reset --hard HEAD~1</code>，手抖打成了 <code>HEAD~3</code>，三个提交（登录功能、注册功能、找回密码）全没了，<code>git log</code> 里看不到它们。</p>
<p>但它们还在对象库里！<code>git reflog</code> 记录了 HEAD 的每一次移动。找到 reset 之前 HEAD 指向的提交，再 <code>git reset --hard &lt;那个哈希&gt;</code> 即可。</p>`,
      `<p>Disaster: you meant to run <code>git reset --hard HEAD~1</code> but typed <code>HEAD~3</code>. Three commits (Login, Sign-up, Password recovery) are gone — <code>git log</code> doesn't show them.</p>
<p>But they're still in the object store! <code>git reflog</code> records every move of HEAD. Find the commit HEAD pointed to before the reset, then <code>git reset --hard &lt;that hash&gt;</code>.</p>`),
    setup(ctx) { newProject(ctx, { 'app.js': 'const app = {};\n' }, 'init'); commit(ctx, { 'login.js': 'login\n' }, T('登录功能', 'Login')); commit(ctx, { 'signup.js': 'signup\n' }, T('注册功能', 'Sign-up')); commit(ctx, { 'recover.js': 'recover\n' }, T('找回密码', 'Password recovery')); sh(ctx, ['cd ' + PROJ, 'git reset --hard HEAD~3']); },
    tasks: [
      { text: T('git log 确认只剩 init（三个功能不见了）', 'Use git log to confirm only init is left (the three features are gone)'), check: ctx => ran(ctx, /^git log/) },
      { text: T('git reflog 找到 "找回密码" 那个提交的哈希', 'Use git reflog to find the hash of the "Password recovery" commit'), check: ctx => ran(ctx, /^git reflog/) },
      { text: T('把 main 恢复到它（reset --hard 那个哈希）', 'Restore main to it (reset --hard to that hash)'), check: ctx => { const r = repo(ctx); return r.currentBranch() === 'main' && headFile(ctx, 'recover.js') !== null && r.commitCount() === 4; } },
    ],
    hints: ['git log --oneline', T('git reflog  （找 "commit: 找回密码" 那一行前面的哈希）', 'git reflog  (take the hash at the start of the "commit: Password recovery" line)'), T('git reset --hard <哈希>   （或 git reset --hard HEAD@{1}）', 'git reset --hard <hash>   (or git reset --hard HEAD@{1})')],
    done: T(`<p>reflog 只在<b>本地</b>存在（默认 90 天），也只记录提交过的东西。它救不了从未 add 的修改。</p>`, `<p>The reflog exists only <b>locally</b> (90 days by default), and it only knows about things that were committed. It can't save changes you never added.</p>`),
  });
  LEVELS.push({
    id: 'c2-7', chapter: 2, title: T('误删的分支', 'The accidentally deleted branch'),
    intro: T(`<p>同事让你删掉没用的 <code>old-experiment</code> 分支，你顺手把 <code>payment</code> 分支也 <code>-D</code> 了（上面有 2 个没合并的提交）。</p><p>分支只是一个指向提交的指针；指针没了，提交还在。用 reflog 找到 payment 最后指向的提交，<code>git branch payment &lt;哈希&gt;</code> 就能把分支“变回来”。</p>`,
      `<p>A teammate asked you to delete the unused <code>old-experiment</code> branch, and while you were at it you also deleted <code>payment</code> with <code>-D</code> (it had 2 unmerged commits).</p><p>A branch is just a pointer to a commit; the pointer is gone, but the commits are still there. Use the reflog to find the commit payment last pointed to, and <code>git branch payment &lt;hash&gt;</code> brings the branch back.</p>`),
    setup(ctx) { newProject(ctx, { 'app.js': 'app\n' }, 'init'); sh(ctx, ['cd ' + PROJ, 'git checkout -b payment']); commit(ctx, { 'pay.js': 'pay v1\n' }, T('支付功能 v1', 'Payment feature v1')); commit(ctx, { 'pay.js': 'pay v2\n' }, SUBJ.payV2); sh(ctx, ['cd ' + PROJ, 'git checkout main', 'git checkout -b old-experiment', 'git checkout main', 'git branch -D old-experiment', 'git branch -D payment']); },
    tasks: [
      { text: T('git branch 确认 payment 不见了', 'Use git branch to confirm payment is gone'), check: ctx => ran(ctx, /^git branch\s*$/) },
      { text: T('在 git reflog 里找到 "支付功能 v2" 对应的提交', 'Find the "Payment feature v2" commit in git reflog'), check: ctx => ran(ctx, /^git reflog/) },
      { text: T('重建 payment 分支，指向那个提交', 'Recreate the payment branch pointing at that commit'), check: ctx => { const r = repo(ctx); const t = r.branchTip('payment'); return t && r.fileAt(t, 'pay.js') === 'pay v2\n'; } },
    ],
    hints: ['git branch', 'git reflog', T('git branch payment <哈希>', 'git branch payment <hash>')],
  });

  /* ================= 第 3 章 ================= */
  LEVELS.push({
    id: 'c3-1', chapter: 3, title: T('分支：便宜到可以随便开', 'Branches: so cheap you can make them freely'),
    intro: T(`<p>在原始方案里，“开分支”= <code>cp -r project project_新功能</code>。在 git 里，分支只是 <code>.git/refs/heads/</code> 下的一个 41 字节文件，内容是提交哈希。</p>
<p><code>git switch -c 名字</code>（老写法 <code>git checkout -b</code>）创建并切换过去。<code>HEAD</code> 指向“当前分支”，提交时当前分支的指针跟着前进。</p>`,
      `<p>With the copy-the-folder approach, “making a branch” = <code>cp -r project project_new_feature</code>. In git, a branch is just a 41-byte file under <code>.git/refs/heads/</code> containing a commit hash.</p>
<p><code>git switch -c name</code> (old style: <code>git checkout -b</code>) creates a branch and switches to it. <code>HEAD</code> points to the “current branch”, and when you commit, the current branch's pointer moves forward.</p>`),
    setup(ctx) { newProject(ctx, { 'app.js': 'const app = {};\n' }, 'init'); commit(ctx, { 'app.js': 'const app = { version: 1 };\n' }, 'v1'); },
    tasks: [
      { text: T('创建并切换到 feature/dark-mode 分支', 'Create and switch to a feature/dark-mode branch'), check: ctx => repo(ctx).branchTip('feature/dark-mode') !== null },
      { text: T('在该分支上新增 theme.css 并提交', 'Add theme.css on that branch and commit it'), check: ctx => { const r = repo(ctx); const t = r.branchTip('feature/dark-mode'); return t && r.fileAt(t, 'theme.css') !== null; } },
      { text: T('切回 main，确认 theme.css 不在工作区（ls）', 'Switch back to main and confirm theme.css isn\'t in the working tree (ls)'), check: ctx => { const r = repo(ctx); return r.currentBranch() === 'main' && !r.workdir.has('theme.css') && r.fileAt('main', 'theme.css') === null && r.branchTip('feature/dark-mode') && r.fileAt(r.branchTip('feature/dark-mode'), 'theme.css') !== null; } },
      { text: T('用 git log --oneline --graph --all 看两条分支', 'Look at both branches with git log --oneline --graph --all'), check: ctx => ran(ctx, /^git log.*--all/) },
    ],
    hints: ['git switch -c feature/dark-mode', T('echo "body { background: #000 }" > theme.css && git add theme.css && git commit -m "深色主题"', 'echo "body { background: #000 }" > theme.css && git add theme.css && git commit -m "Dark theme"'), 'git switch main && ls', 'git log --oneline --graph --all'],
    feedback(ctx, cmd, res) { const r = repo(ctx); if (/^git commit/.test(cmd) && res.ok && r.currentBranch() === 'main' && r.fileAt('main', 'theme.css') !== null) return T('⚠️ 你把提交做在了 main 上——<code>git branch 名字</code> 只创建分支不切换，<code>git switch -c</code> 或 <code>git checkout -b</code> 才会切过去。补救：<code>git branch -f feature/dark-mode</code>（把分支指到这里）然后 <code>git reset --hard HEAD~1</code> 让 main 退回去。', '⚠️ You committed on main — <code>git branch name</code> only creates a branch without switching; <code>git switch -c</code> or <code>git checkout -b</code> switches to it. To fix: <code>git branch -f feature/dark-mode</code> (point the branch here), then <code>git reset --hard HEAD~1</code> to move main back.'); return null; },
  });
  LEVELS.push({
    id: 'c3-2', chapter: 3, title: T('快进合并（Fast-forward）', 'Fast-forward merge'),
    intro: T(`<p>feature 分支从 main 长出来，而 main 之后<b>没有新提交</b>。这时合并不需要创造任何新提交，git 只要把 main 的指针“快进”到 feature 的位置——这叫 <b>fast-forward</b>。</p><p>合并完记得删掉用完的分支（<code>git branch -d</code>，只有已合并的分支才允许用小写 -d 删）。</p>`,
      `<p>The feature branch grew out of main, and main has had <b>no new commits</b> since. Merging doesn't need a new commit: git just moves main's pointer “forward” to where feature is — that's a <b>fast-forward</b>.</p><p>After merging, delete the branch you're done with (<code>git branch -d</code>; lowercase -d only works on branches that are already merged).</p>`),
    setup(ctx) { newProject(ctx, { 'app.js': 'const app = {};\n' }, 'init'); sh(ctx, ['cd ' + PROJ, 'git switch -c feature']); commit(ctx, { 'feature.js': 'feature\n' }, T('新功能', 'New feature')); commit(ctx, { 'feature.js': 'feature v2\n' }, T('新功能完善', 'Polish new feature')); sh(ctx, ['cd ' + PROJ, 'git switch main']); },
    tasks: [
      { text: T('在 main 上合并 feature（输出应包含 Fast-forward）', 'On main, merge feature (the output should say Fast-forward)'), check: ctx => { const r = repo(ctx); return (r.currentBranch() === 'main' && r.branchTip('main') === r.branchTip('feature') && r.fileAt('main', 'feature.js') === 'feature v2\n') || (r.fileAt('main', 'feature.js') === 'feature v2\n' && r.getCommit(r.branchTip('main')).parents.length === 1); } },
      { text: T('删除 feature 分支', 'Delete the feature branch'), check: ctx => repo(ctx).branchTip('feature') === null && repo(ctx).fileAt('main', 'feature.js') === 'feature v2\n' },
    ],
    hints: ['git merge feature', 'git branch -d feature'],
    feedback(ctx, cmd, res) { if (/^git merge.*--no-ff/.test(cmd) && res.ok) return T('💡 你用了 <code>--no-ff</code>，git 生成了一个合并提交而不是快进。本关想让你看的是快进：<code>git reset --hard ORIG_HEAD</code> 撤销这次合并，再 <code>git merge feature</code>。', '💡 You used <code>--no-ff</code>, so git created a merge commit instead of fast-forwarding. This level wants you to see a fast-forward: undo the merge with <code>git reset --hard ORIG_HEAD</code>, then <code>git merge feature</code>.'); return null; },
    done: T(`<p>快进合并不产生合并提交，历史是一条直线。如果你想保留“这里曾经有个分支”的痕迹，可以用 <code>git merge --no-ff</code>。</p>`, `<p>A fast-forward merge creates no merge commit; the history stays a straight line. If you want to keep a trace that “there was a branch here”, use <code>git merge --no-ff</code>.</p>`),
  });
  LEVELS.push({
    id: 'c3-3', chapter: 3, title: T('三方合并与合并提交', 'Three-way merge and merge commits'),
    intro: T(`<p>这次 main 和 feature <b>各自都有新提交</b>（分叉了），不能快进。git 会找到两者的<b>共同祖先</b>，做三方比较，然后创建一个有<b>两个父提交</b>的合并提交。</p><p>这两条分支改的是不同文件，所以会自动合并成功。</p>`,
      `<p>This time main and feature <b>each have new commits</b> (they've diverged), so a fast-forward is impossible. git finds their <b>common ancestor</b>, does a three-way comparison, and creates a merge commit with <b>two parents</b>.</p><p>The two branches changed different files, so the merge succeeds automatically.</p>`),
    setup(ctx) { newProject(ctx, { 'app.js': 'const app = {};\n' }, 'init'); sh(ctx, ['cd ' + PROJ, 'git switch -c feature']); commit(ctx, { 'feature.js': 'feature\n' }, T('新功能', 'New feature')); sh(ctx, ['cd ' + PROJ, 'git switch main']); commit(ctx, { 'app.js': 'const app = { fixed: true };\n' }, T('修复 bug', 'Fix bug')); },
    tasks: [
      { text: T('先用 git log --oneline --graph --all 观察分叉', 'First look at the fork with git log --oneline --graph --all'), check: ctx => ran(ctx, /^git log.*--graph/) },
      { text: T('在 main 上合并 feature', 'On main, merge feature'), check: ctx => { const r = repo(ctx); const h = r.branchTip('main'); return h && r.getCommit(h).parents.length === 2 && r.fileAt('main', 'feature.js') !== null && has(r.fileAt('main', 'app.js'), 'fixed'); } },
      { text: T('再看一次图，合并提交有两个父提交（git log -1 会显示 Merge: 行）', 'Look at the graph again: the merge commit has two parents (git log -1 shows a Merge: line)'), check: ctx => { const r = repo(ctx); const h = r.branchTip('main'); return h && r.getCommit(h).parents.length === 2 && ctx.world.log.filter(l => l.ok && /^git log/.test(l.line)).length >= 2; } },
    ],
    hints: ['git log --oneline --graph --all', T('git merge feature   （沙盒会自动使用默认合并信息）', 'git merge feature   (the sandbox uses the default merge message automatically)'), 'git log --oneline --graph'],
  });
  LEVELS.push({
    id: 'c3-4', chapter: 3, title: T('detached HEAD：回到过去看看', 'Detached HEAD: a trip to the past'),
    intro: T(`<p><code>git checkout &lt;提交哈希&gt;</code> 让 HEAD 直接指向一个提交而不是分支——“分离头指针”状态。可以随便看、随便试，但<b>在这里做的提交不属于任何分支</b>，切走以后会“丢”（其实能用 reflog 找回）。</p><p>正确做法：如果想保留实验成果，<code>git switch -c 新分支</code>。</p>`,
      `<p><code>git checkout &lt;commit-hash&gt;</code> makes HEAD point directly at a commit instead of a branch — the “detached HEAD” state. You can look around and experiment freely, but <b>commits made here don't belong to any branch</b>, and they get “lost” once you switch away (though the reflog can find them).</p><p>The right move: if you want to keep your experiment, run <code>git switch -c new-branch</code>.</p>`),
    setup(ctx) { newProject(ctx, { 'app.js': 'v1\n' }, 'v1'); commit(ctx, { 'app.js': 'v2\n' }, 'v2'); commit(ctx, { 'app.js': 'v3\n' }, 'v3'); },
    tasks: [
      { text: T('检出 "v1" 那个提交（git checkout <哈希> 或 HEAD~2）', 'Check out the "v1" commit (git checkout <hash> or HEAD~2)'), check: ctx => ranAny(ctx, /^git (checkout|switch --detach)\s+(HEAD~2|[0-9a-f]{4,})/) },
      { text: T('在分离状态下，新建 experiment.js 并提交', 'While detached, create experiment.js and commit it'), check: ctx => { const r = repo(ctx); return r.allCommits().some(c => r.fileAt(c.hash, 'experiment.js') !== null); } },
      { text: T('用 git switch -c experiment 把这个提交保存到新分支', 'Save that commit on a new branch with git switch -c experiment'), check: ctx => { const r = repo(ctx); const t = r.branchTip('experiment'); return t && r.fileAt(t, 'experiment.js') !== null && r.fileAt(t, 'app.js') === 'v1\n'; } },
      { text: T('切回 main（app.js 应该又是 v3）', 'Switch back to main (app.js should be v3 again)'), check: ctx => repo(ctx).currentBranch() === 'main' && repo(ctx).workdir.get('app.js') === 'v3\n' && repo(ctx).branchTip('experiment') !== null },
    ],
    hints: [T('git log --oneline 找到 v1 的哈希，然后 git checkout <哈希>', 'Find v1\'s hash with git log --oneline, then git checkout <hash>'), T('echo "试验" > experiment.js && git add . && git commit -m "实验"', 'echo "trying things" > experiment.js && git add . && git commit -m "Experiment"'), 'git switch -c experiment', 'git switch main'],
    feedback(ctx, cmd, res) { if (/Warning: you are leaving/.test(res.out || '')) return T('⚠️ 看到了吗？git 警告你“正在离开一个不属于任何分支的提交”。它给了你补救命令：<code>git branch &lt;名字&gt; &lt;哈希&gt;</code>。', '⚠️ See that? git warns you that you are “leaving a commit that isn\'t on any branch”, and gives you the rescue command: <code>git branch &lt;name&gt; &lt;hash&gt;</code>.'); return null; },
  });
  LEVELS.push({
    id: 'c3-5', chapter: 3, title: T('rebase：把历史捋直', 'rebase: straighten out history'),
    intro: T(`<p>还是分叉的场景，但这次用 <code>git rebase main</code>（在 feature 上执行）：把 feature 的提交<b>逐个重放</b>到 main 的顶端，得到一条直线历史。然后 main 就可以快进合并 feature。</p>
<p>观察右侧的图：rebase 后 feature 的提交<b>哈希变了</b>——它们是新提交。所以规则是：<b>只 rebase 还没推送给别人的提交</b>。</p>`,
      `<p>Same diverged setup, but this time use <code>git rebase main</code> (run on feature): it <b>replays</b> feature's commits <b>one by one</b> on top of main, giving a straight-line history. Then main can fast-forward to feature.</p>
<p>Watch the graph on the right: after the rebase, feature's commits have <b>new hashes</b> — they are new commits. Hence the rule: <b>only rebase commits you haven't pushed to anyone yet</b>.</p>`),
    setup(ctx) { newProject(ctx, { 'app.js': 'const app = {};\n' }, 'init'); sh(ctx, ['cd ' + PROJ, 'git switch -c feature']); commit(ctx, { 'feature.js': 'feature\n' }, T('新功能', 'New feature')); commit(ctx, { 'feature.js': 'feature v2\n' }, T('完善新功能', 'Polish new feature')); sh(ctx, ['cd ' + PROJ, 'git switch main']); commit(ctx, { 'app.js': 'const app = { fixed: true };\n' }, T('修复 bug', 'Fix bug')); sh(ctx, ['cd ' + PROJ, 'git switch feature']); },
    tasks: [
      { text: T('在 feature 分支上执行 git rebase main', 'On the feature branch, run git rebase main'), check: ctx => { const r = repo(ctx); const f = r.branchTip('feature'), m = r.branchTip('main'); return f && m && r.isAncestor(m, f) && r.fileAt(f, 'feature.js') === 'feature v2\n' && ran(ctx, /^git rebase main/); } },
      { text: T('切到 main，快进合并 feature（历史应为一条直线，没有合并提交）', 'Switch to main and fast-forward merge feature (history should be a straight line with no merge commit)'), check: ctx => { const r = repo(ctx); const m = r.branchTip('main'); return r.currentBranch() === 'main' && m === r.branchTip('feature') && r.fileAt(m, 'feature.js') === 'feature v2\n' && r.revList([m]).every(h => r.getCommit(h).parents.length < 2); } },
    ],
    hints: ['git rebase main', 'git switch main && git merge feature'],
    feedback(ctx, cmd, res) { const r = repo(ctx); if (/^git rebase feature/.test(cmd) && res.ok && r.currentBranch() === 'main') return T('⚠️ 方向反了：你在 main 上 rebase 到 feature，等于把 main 的“修复 bug”挪到了 feature 后面。惯例是<b>在功能分支上 rebase 到主分支</b>。撤销：<code>git reset --hard ORIG_HEAD</code>，然后 <code>git switch feature && git rebase main</code>。', '⚠️ Wrong direction: you rebased main onto feature, which moved main\'s “Fix bug” after feature. The convention is to <b>rebase the feature branch onto the main branch</b>. Undo: <code>git reset --hard ORIG_HEAD</code>, then <code>git switch feature && git rebase main</code>.'); return null; },
  });
  LEVELS.push({
    id: 'c3-6', chapter: 3, title: T('cherry-pick：只要那一个提交', 'cherry-pick: just that one commit'),
    intro: T(`<p>同事在 <code>dev</code> 分支上做了很多还没完成的工作，但其中有一个提交 "修复崩溃" 是紧急补丁，需要马上进 main。不能整个合并 dev。</p><p><code>git cherry-pick &lt;哈希&gt;</code> 会把那个提交的改动“复制”一份到当前分支。</p>`,
      `<p>A teammate has lots of unfinished work on the <code>dev</code> branch, but one commit there, "Fix crash", is an urgent patch that must go into main right now. You can't merge all of dev.</p><p><code>git cherry-pick &lt;hash&gt;</code> “copies” that commit's changes onto the current branch.</p>`),
    setup(ctx) { newProject(ctx, { 'app.js': 'const app = {};\n', 'core.js': 'function run() { crash(); }\n' }, 'init'); sh(ctx, ['cd ' + PROJ, 'git switch -c dev']); commit(ctx, { 'wip.js': 'half done\n' }, T('半成品功能 A', 'WIP feature A')); commit(ctx, { 'core.js': 'function run() { safe(); }\n' }, SUBJ.fixCrash); commit(ctx, { 'wip2.js': 'also half done\n' }, T('半成品功能 B', 'WIP feature B')); sh(ctx, ['cd ' + PROJ, 'git switch main']); },
    tasks: [
      { text: T('用 git log dev --oneline 找到 "修复崩溃" 的哈希', 'Find the hash of "Fix crash" with git log dev --oneline'), check: ctx => ran(ctx, /^git log/) },
      { text: T('在 main 上 cherry-pick 它（core.js 应变为 safe，且 main 上没有 wip.js）', 'Cherry-pick it onto main (core.js should become safe, and main must not get wip.js)'), check: ctx => { const r = repo(ctx); return r.currentBranch() === 'main' && has(r.fileAt('main', 'core.js'), 'safe') && r.fileAt('main', 'wip.js') === null && r.fileAt('main', 'wip2.js') === null; } },
    ],
    hints: ['git log dev --oneline', T('git cherry-pick <哈希>', 'git cherry-pick <hash>')],
    feedback(ctx, cmd, res) { if (repo(ctx).fileAt('main', 'wip.js') !== null) return T('⚠️ 半成品也进 main 了——你大概用了 merge。用 <code>git reset --hard ORIG_HEAD</code>（合并前 git 会把原来的位置记在 ORIG_HEAD）回退，然后只 cherry-pick 那一个提交。', '⚠️ The unfinished work landed in main too — you probably used merge. Go back with <code>git reset --hard ORIG_HEAD</code> (before merging, git saves the old position in ORIG_HEAD), then cherry-pick just that one commit.'); return null; },
  });
  LEVELS.push({
    id: 'c3-7', chapter: 3, title: T('stash：手头的活先放一放', 'stash: set your work aside for a moment'),
    intro: T(`<p>你在 feature 分支上改到一半（还不想提交），突然要切到 main 修一个紧急 bug。直接切换会被拒绝（改动会被覆盖）或把半成品带过去。</p><p><code>git stash</code> 把工作区/暂存区的改动打包存起来，工作区恢复干净；修完 bug 回来 <code>git stash pop</code> 再取出来。</p>`,
      `<p>You're halfway through changes on the feature branch (not ready to commit) when you suddenly need to switch to main for an urgent bug fix. Switching directly is either refused (your changes would be overwritten) or drags your half-done work along.</p><p><code>git stash</code> packs up the changes in the working tree/staging area and leaves the working tree clean; after the fix, come back and <code>git stash pop</code> to take them out again.</p>`),
    setup(ctx) { newProject(ctx, { 'app.js': 'const app = {};\n', 'feature.js': '// todo\n' }, 'init'); sh(ctx, ['cd ' + PROJ, 'git switch -c feature', 'git switch main']); commit(ctx, { 'app.js': T('const app = {};\n// main 上的日常改动\n', 'const app = {};\n// routine change on main\n') }, T('main 上的日常改动', 'Routine change on main')); sh(ctx, ['cd ' + PROJ, 'git switch feature']); write(ctx, PROJ + '/feature.js', T('// todo\nfunction half() {\n  // 写到一半\n', '// todo\nfunction half() {\n  // half written\n')); write(ctx, PROJ + '/app.js', 'const app = {};\nconst bug = true;\n'); },
    tasks: [
      { text: T('试着 git switch main，看看 git 怎么说；然后 git stash', 'Try git switch main and see what git says; then git stash'), check: ctx => repo(ctx).stash.length >= 1 || ran(ctx, /^git stash pop|^git stash apply/) },
      { text: T('切到 main，把 app.js 里的内容改为修复版并提交 "紧急修复"', 'Switch to main, change app.js to the fixed version, and commit it as "Hotfix"'), check: ctx => { const r = repo(ctx); const m = r.branchTip('main'); return m && HOTFIX.includes(r.subject(m)) && r.fileAt(m, 'feature.js') === '// todo\n'; } },
      { text: T('切回 feature，git stash pop 取回半成品（feature.js 应包含 half）', 'Switch back to feature and git stash pop to get your work back (feature.js should contain half)'), check: ctx => { const r = repo(ctx); return ran(ctx, /^git stash (pop|apply)/) && r.currentBranch() === 'feature' && has(r.workdir.get('feature.js'), 'half') && r.stash.length === 0; } },
    ],
    hints: [T('git switch main （会被拒绝，因为 app.js 的改动会被覆盖）→ git stash', 'git switch main  (refused, because your app.js changes would be overwritten) → git stash'), T('git switch main && echo "const app = { fixed: true };" > app.js && git commit -am "紧急修复"', 'git switch main && echo "const app = { fixed: true };" > app.js && git commit -am "Hotfix"'), 'git switch feature && git stash pop'],
    feedback(ctx, cmd, res) { const r = repo(ctx); const m = r.branchTip('main'); if (/^git commit/.test(cmd) && res.ok && r.currentBranch() === 'main' && m && has(r.fileAt(m, 'feature.js'), 'half')) return T('⚠️ 半成品 feature.js 被一起提交进 main 了（<code>-a</code> 会把所有已跟踪文件的修改都提交）。<code>git reset --hard HEAD~1</code> 撤销，回到 feature 先 stash。', '⚠️ Your half-done feature.js got committed to main too (<code>-a</code> commits changes to every tracked file). Undo with <code>git reset --hard HEAD~1</code>, go back to feature and stash first.'); return null; },
  });
  LEVELS.push({
    id: 'c3-8', chapter: 3, title: T('tag：给版本起个名字', 'tag: give a version a name'),
    intro: T(`<p>分支会随提交移动，标签不会。发布版本时打个标签：<code>git tag -a v1.0 -m "第一个正式版"</code>（附注标签，会创建 tag 对象记录打标签的人和说明）。</p><p>之后 <code>git show v1.0</code>、<code>git diff v1.0 v1.1</code>、<code>git checkout v1.0</code> 都可以直接用名字。</p>`,
      `<p>Branches move as you commit; tags don't. When you release a version, tag it: <code>git tag -a v1.0 -m "First release"</code> (an annotated tag, which creates a tag object recording who tagged it and why).</p><p>After that, <code>git show v1.0</code>, <code>git diff v1.0 v1.1</code> and <code>git checkout v1.0</code> all work with the name directly.</p>`),
    setup(ctx) { newProject(ctx, { 'app.js': 'v1\n' }, 'init'); commit(ctx, { 'app.js': 'v1 final\n' }, T('发布准备', 'Prepare release')); },
    tasks: [
      { text: T('给当前提交打附注标签 v1.0', 'Create an annotated tag v1.0 on the current commit'), check: ctx => { const r = repo(ctx); const t = r.refs.get('refs/tags/v1.0'); return t && r.getObject(t).type === 'tag'; } },
      { text: T('再做一次提交，然后打轻量标签 v1.1（不带 -a）', 'Make another commit, then add a lightweight tag v1.1 (no -a)'), check: ctx => { const r = repo(ctx); const t = r.refs.get('refs/tags/v1.1'); return t && r.getObject(t).type === 'commit' && t !== r.peel(r.refs.get('refs/tags/v1.0') || ''); } },
      { text: T('git diff v1.0 v1.1 看看两个版本之间的差异', 'See the difference between the two versions with git diff v1.0 v1.1'), check: ctx => ran(ctx, /^git diff v1\.0 v1\.1|^git diff v1\.1 v1\.0|^git log v1\.0\.\.v1\.1/) },
    ],
    hints: [T('git tag -a v1.0 -m "第一个正式版"', 'git tag -a v1.0 -m "First release"'), T('echo "v1.1" > app.js && git commit -am "小改动" && git tag v1.1', 'echo "v1.1" > app.js && git commit -am "Small change" && git tag v1.1'), 'git diff v1.0 v1.1'],
  });

  /* ================= 第 4 章 ================= */
  const conflictSetup = ctx => { newProject(ctx, { 'greeting.js': 'export function greet(name) {\n  return "Hello, " + name;\n}\n' }, 'init'); sh(ctx, ['cd ' + PROJ, 'git switch -c feature']); commit(ctx, { 'greeting.js': 'export function greet(name) {\n  return "Hi, " + name + "!";\n}\n' }, T('问候语改成 Hi', 'Change greeting to Hi')); sh(ctx, ['cd ' + PROJ, 'git switch main']); commit(ctx, { 'greeting.js': 'export function greet(name) {\n  return "Hello, " + name.trim();\n}\n' }, T('去掉名字两端空格', 'Trim spaces around the name')); };
  LEVELS.push({
    id: 'c4-1', chapter: 4, title: T('第一次冲突', 'Your first conflict'),
    intro: T(`<p>main 和 feature 都改了 greeting.js 的<b>同一行</b>。git 无法决定要哪个，会在文件里留下标记：</p>
<pre>&lt;&lt;&lt;&lt;&lt;&lt;&lt; HEAD
（你这边的版本）
=======
（对方的版本）
&gt;&gt;&gt;&gt;&gt;&gt;&gt; feature</pre>
<p>解决步骤：① 编辑文件，写成你想要的最终样子（删掉标记）；② <code>git add</code> 告诉 git 已解决；③ <code>git commit</code> 完成合并。</p><p>本关要求最终的问候语是 <code>"Hi, " + name.trim() + "!"</code>（两边的改动都要）。</p>`,
      `<p>Both main and feature changed <b>the same line</b> of greeting.js. git can't decide which one to keep, so it leaves markers in the file:</p>
<pre>&lt;&lt;&lt;&lt;&lt;&lt;&lt; HEAD
(your side's version)
=======
(their version)
&gt;&gt;&gt;&gt;&gt;&gt;&gt; feature</pre>
<p>To resolve: ① edit the file into the final form you want (delete the markers); ② <code>git add</code> to tell git it's resolved; ③ <code>git commit</code> to finish the merge.</p><p>In this level the final greeting must be <code>"Hi, " + name.trim() + "!"</code> (keep both sides' changes).</p>`),
    setup: conflictSetup,
    tasks: [
      { text: T('git merge feature，看到 CONFLICT', 'git merge feature and see the CONFLICT'), check: ctx => ranAny(ctx, /^git merge feature/) },
      { text: T('cat greeting.js 观察冲突标记，然后编辑文件解决（edit greeting.js）', 'cat greeting.js to look at the conflict markers, then edit the file to resolve it (edit greeting.js)'), check: ctx => { const c = repo(ctx).workdir.get('greeting.js'); return noMarkers(c) && has(c, 'name.trim()') && has(c, '"Hi, "') && has(c, '"!"'); } },
      { text: T('git add greeting.js 标记已解决，git status 看看提示', 'git add greeting.js to mark it resolved, then check git status'), check: ctx => { const r = repo(ctx); if (!ran(ctx, /^git add/)) return false; const staged = r.index.has('greeting.js') ? r.blobContent(r.index.get('greeting.js')) : null; return !r.conflicts.size && noMarkers(staged) && has(staged, 'name.trim()') && has(staged, '"Hi, "') && (r.state.merge || r.getCommit(r.headHash()).parents.length === 2); } },
      { text: T('git commit 完成合并（会生成合并提交）', 'git commit to finish the merge (this creates a merge commit)'), check: ctx => { const r = repo(ctx); const h = r.branchTip('main'); const c = r.fileAt(h, 'greeting.js'); return r.getCommit(h).parents.length === 2 && noMarkers(c) && has(c, 'name.trim()') && has(c, '"Hi, "'); } },
    ],
    hints: ['git merge feature', T('edit greeting.js，把内容改成：\nexport function greet(name) {\n  return "Hi, " + name.trim() + "!";\n}', 'edit greeting.js and change it to:\nexport function greet(name) {\n  return "Hi, " + name.trim() + "!";\n}'), 'git add greeting.js && git status', T('git commit -m "合并 feature，解决冲突"', 'git commit -m "Merge feature, resolve conflict"')],
    feedback(ctx, cmd, res) { const r = repo(ctx); if (/^git add/.test(cmd) && res.ok) { const c = r.workdir.get('greeting.js'); if (!noMarkers(c)) return T('🚨 你 add 了一个还带着 <code>&lt;&lt;&lt;&lt;&lt;&lt;&lt;</code> 标记的文件！git 不会阻止你（它以为你解决了），但这样提交出去代码就坏了。先 <code>edit greeting.js</code> 把标记删掉。', '🚨 You added a file that still has <code>&lt;&lt;&lt;&lt;&lt;&lt;&lt;</code> markers! git won\'t stop you (it assumes you resolved it), but committing this breaks the code. First <code>edit greeting.js</code> and delete the markers.'); } if (/^git commit/.test(cmd) && res.ok && !noMarkers(r.fileAt('HEAD', 'greeting.js'))) return T('🚨 冲突标记被提交进历史了。补救：<code>edit greeting.js</code> 改好 → <code>git add greeting.js</code> → <code>git commit --amend -m "合并 feature"</code>（amend 会保留两个父提交）。', '🚨 Conflict markers got committed into history. To fix: <code>edit greeting.js</code> → <code>git add greeting.js</code> → <code>git commit --amend -m "Merge feature"</code> (amend keeps both parents).'); return null; },
  });
  LEVELS.push({
    id: 'c4-2', chapter: 4, title: T('中止合并 & 直接选一边', 'Abort a merge & just pick a side'),
    intro: T(`<p>合并到一半发现不对劲？<code>git merge --abort</code> 回到合并前的干净状态。</p><p>有时你确定“就要对方那个版本”：<code>git checkout --theirs 文件</code>（或 <code>--ours</code> 要自己的），再 add。</p><p>本关：先 merge 出冲突，abort 掉；再 merge 一次，这次用 --theirs 直接采用 feature 的版本。</p>`,
      `<p>Halfway through a merge and something feels off? <code>git merge --abort</code> takes you back to the clean state before the merge.</p><p>Sometimes you're sure you “just want their version”: <code>git checkout --theirs file</code> (or <code>--ours</code> for your own), then add.</p><p>In this level: merge to get the conflict, abort it; then merge again, and this time use --theirs to take feature's version outright.</p>`),
    setup: conflictSetup,
    tasks: [
      { text: T('git merge feature 出现冲突后，git merge --abort', 'After git merge feature hits the conflict, run git merge --abort'), check: ctx => ran(ctx, /^git merge --abort/) },
      { text: T('git status 确认工作区干净、不在合并状态', 'Use git status to confirm the working tree is clean and no merge is in progress'), check: ctx => ran(ctx, /^git status/) && !repo(ctx).state.merge },
      { text: T('再次 merge，用 git checkout --theirs greeting.js 采用 feature 的版本，add 并 commit', 'Merge again, take feature\'s version with git checkout --theirs greeting.js, then add and commit'), check: ctx => { const r = repo(ctx); const h = r.branchTip('main'); return r.getCommit(h).parents.length === 2 && r.fileAt(h, 'greeting.js') === r.fileAt('feature', 'greeting.js'); } },
    ],
    hints: [T('git merge feature 然后 git merge --abort', 'git merge feature, then git merge --abort'), 'git status', T('git merge feature && git checkout --theirs greeting.js && git add greeting.js && git commit -m "采用 feature 版本"', 'git merge feature && git checkout --theirs greeting.js && git add greeting.js && git commit -m "Use feature version"')],
  });
  LEVELS.push({
    id: 'c4-3', chapter: 4, title: T('rebase 时的冲突', 'Conflicts during rebase'),
    intro: T(`<p>rebase 是逐个重放提交，所以冲突可能<b>发生好几次</b>。每次：解决 → <code>git add</code> → <code>git rebase --continue</code>。随时可以 <code>git rebase --abort</code> 回到起点。</p><p>注意 rebase 冲突时 <b>HEAD 和 “ours/theirs” 是反的</b>：HEAD 是 main（被 rebase 到的目标），标记下半部分才是你 feature 上的提交。</p><p>要求最终结果同上：<code>"Hi, " + name.trim() + "!"</code>，feature 分支 rebase 到 main 上。</p>`,
      `<p>rebase replays commits one at a time, so conflicts can <b>happen several times</b>. Each time: resolve → <code>git add</code> → <code>git rebase --continue</code>. You can always <code>git rebase --abort</code> to go back to where you started.</p><p>Note that in a rebase conflict <b>HEAD and “ours/theirs” are flipped</b>: HEAD is main (the target you're rebasing onto), and the lower half of the markers is your commit from feature.</p><p>The final result must be the same as before: <code>"Hi, " + name.trim() + "!"</code>, with the feature branch rebased onto main.</p>`),
    setup(ctx) { conflictSetup(ctx); sh(ctx, ['cd ' + PROJ, 'git switch feature']); },
    tasks: [
      { text: T('在 feature 上 git rebase main，遇到冲突', 'On feature, git rebase main and hit the conflict'), check: ctx => ranAny(ctx, /^git rebase main/) },
      { text: T('编辑 greeting.js 解决冲突，git add，git rebase --continue', 'Edit greeting.js to resolve the conflict, git add, git rebase --continue'), check: ctx => { const r = repo(ctx); const f = r.branchTip('feature'), m = r.branchTip('main'); const c = r.fileAt(f, 'greeting.js'); return !r.state.rebase && r.isAncestor(m, f) && f !== m && noMarkers(c) && has(c, 'trim()') && has(c, '"Hi, "'); } },
      { text: T('git log --oneline --graph --all 确认历史是直线', 'Confirm the history is a straight line with git log --oneline --graph --all'), check: ctx => ran(ctx, /^git log.*--graph/) && !repo(ctx).state.rebase && repo(ctx).isAncestor(repo(ctx).branchTip('main'), repo(ctx).branchTip('feature')) },
    ],
    hints: ['git rebase main', T('edit greeting.js 改成最终版本 → git add greeting.js → git rebase --continue', 'edit greeting.js into the final version → git add greeting.js → git rebase --continue'), 'git log --oneline --graph --all'],
    feedback(ctx, cmd, res) { if (/^git commit/.test(cmd) && repo(ctx).state.rebase) return T('💡 rebase 过程中不用 commit，而是 <code>git add</code> 之后 <code>git rebase --continue</code>。', '💡 During a rebase you don\'t commit; run <code>git add</code> and then <code>git rebase --continue</code>.'); if (/^git rebase --skip/.test(cmd) && res.ok) return T('⚠️ <code>--skip</code> 把你 feature 上的那个提交<b>整个丢掉了</b>（“问候语改成 Hi”没了）。这不是解决冲突，是放弃。<code>git reset --hard ORIG_HEAD</code> 回到 rebase 之前重来。', '⚠️ <code>--skip</code> <b>threw away</b> your commit from feature <b>entirely</b> (“Change greeting to Hi” is gone). That isn\'t resolving the conflict, it\'s giving up. Go back to before the rebase with <code>git reset --hard ORIG_HEAD</code> and try again.'); return null; },
  });
  LEVELS.push({
    id: 'c4-4', chapter: 4, title: T('修改/删除冲突', 'Modify/delete conflicts'),
    intro: T(`<p>另一种冲突：一边<b>删除</b>了文件，另一边<b>修改</b>了它。git 会说 <code>CONFLICT (modify/delete)</code>。你必须决定：保留（<code>git add 文件</code>）还是删除（<code>git rm 文件</code>）。</p><p>本关剧情：feature 分支把 legacy.js 删了，main 上有人修改了它。团队决定<b>删除</b>它。</p>`,
      `<p>Another kind of conflict: one side <b>deleted</b> a file and the other <b>modified</b> it. git reports <code>CONFLICT (modify/delete)</code>. You have to decide: keep it (<code>git add file</code>) or delete it (<code>git rm file</code>).</p><p>The story: the feature branch deleted legacy.js, while someone modified it on main. The team decides to <b>delete</b> it.</p>`),
    setup(ctx) { newProject(ctx, { 'app.js': 'app\n', 'legacy.js': 'old code\n' }, 'init'); sh(ctx, ['cd ' + PROJ, 'git switch -c feature']); commit(ctx, { 'legacy.js': null }, T('删除旧代码', 'Remove old code')); sh(ctx, ['cd ' + PROJ, 'git switch main']); commit(ctx, { 'legacy.js': T('old code\n// 小修改\n', 'old code\n// small tweak\n') }, T('修改旧代码', 'Tweak old code')); },
    tasks: [
      { text: T('git merge feature，观察 modify/delete 冲突', 'git merge feature and look at the modify/delete conflict'), check: ctx => ranAny(ctx, /^git merge feature/) },
      { text: T('决定删除：git rm legacy.js', 'Decide to delete it: git rm legacy.js'), check: ctx => !repo(ctx).conflicts.has('legacy.js') && !repo(ctx).index.has('legacy.js') },
      { text: T('git commit 完成合并（main 上不再有 legacy.js）', 'git commit to finish the merge (main no longer has legacy.js)'), check: ctx => { const r = repo(ctx); const h = r.branchTip('main'); return r.getCommit(h).parents.length === 2 && r.fileAt(h, 'legacy.js') === null; } },
    ],
    hints: ['git merge feature', 'git rm legacy.js', T('git commit -m "合并 feature，移除 legacy"', 'git commit -m "Merge feature, remove legacy"')],
  });

  /* ================= 第 5 章 ================= */
  LEVELS.push({
    id: 'c5-1', chapter: 5, title: T('clone：把远程仓库拿到本地', 'clone: bring a remote repository home'),
    intro: T(`<p>团队的仓库在服务器上：<code>https://github.com/team/project.git</code>（沙盒里它其实是 <code>/srv/git/project.git</code>，一个<b>裸仓库</b>——只有 .git 没有工作区）。</p><p><code>git clone &lt;地址&gt;</code> 会把<b>全部历史</b>复制过来，自动配置一个叫 <code>origin</code> 的远程，并创建本地 main 跟踪 <code>origin/main</code>。</p><p>你的同事小明已经 clone 过一份在 <code>/home/xiaoming/project</code>。右侧“多人”标签可以看到所有仓库。</p>`,
      `<p>The team's repository lives on a server: <code>https://github.com/team/project.git</code> (in the sandbox it's really <code>/srv/git/project.git</code>, a <b>bare repository</b> — just .git, no working tree).</p><p><code>git clone &lt;url&gt;</code> copies <b>the entire history</b>, sets up a remote called <code>origin</code>, and creates a local main that tracks <code>origin/main</code>.</p><p>Your teammate Xiaoming has already cloned it to <code>/home/xiaoming/project</code>. The “Team” tab on the right shows every repository.</p>`),
    setup(ctx) { identity(ctx); xmIdentity(ctx); sh(ctx, ['mkdir -p /home/you/seed', 'cd /home/you/seed', 'git init', T('echo "# 团队项目" > README.md', 'echo "# Team project" > README.md'), 'echo "console.log(1)" > app.js', 'git add .', 'git commit -m "init"', 'echo "v2" >> app.js', T('git commit -am "第二次提交"', 'git commit -am "Second commit"'), 'git init --bare ' + SRV, 'git remote add origin ' + SRV, 'git push origin main', 'cd /home/you', 'rm -rf /home/you/seed']); ctx.world.remoteAliases['https://github.com/team/project.git'] = SRV; asXm(ctx, ['git clone ' + SRV]); },
    tasks: [
      { text: T('在 ~ 目录下 git clone https://github.com/team/project.git', 'From ~, run git clone https://github.com/team/project.git'), check: ctx => !!repo(ctx) && repo(ctx).headHash() !== null },
      { text: T('cd project，git remote -v 看远程地址', 'cd project, then git remote -v to see the remote URL'), check: ctx => ran(ctx, /^git remote -v/) },
      { text: T('git branch -a 看本地分支和远程跟踪分支（origin/main）', 'git branch -a to see local and remote-tracking branches (origin/main)'), check: ctx => ran(ctx, /^git branch -a/) },
      { text: T('git log --oneline 确认历史完整（2 个提交）', 'git log --oneline to confirm the full history is there (2 commits)'), check: ctx => ran(ctx, /^git log/) && repo(ctx).commitCount() === 2 },
    ],
    hints: ['git clone https://github.com/team/project.git', 'cd project && git remote -v', 'git branch -a', 'git log --oneline'],
    done: T(`<p><code>origin/main</code> 是“我上次看到远程 main 在哪”的<b>本地记录</b>，不会自动更新，要靠 fetch/pull。</p>`, `<p><code>origin/main</code> is a <b>local record</b> of “where I last saw the remote's main”. It doesn't update by itself — fetch/pull does that.</p>`),
  });
  LEVELS.push({
    id: 'c5-2', chapter: 5, title: T('push：把提交发布出去', 'push: publish your commits'),
    intro: T(`<p>本地提交只在你电脑上。<code>git push</code> 把当前分支的新提交上传，并让远程的 main 指针前移。</p><p>提交前后用 <code>git status</code> 观察 “Your branch is ahead of 'origin/main' by 1 commit” 这句话。</p>`,
      `<p>Local commits exist only on your computer. <code>git push</code> uploads the current branch's new commits and moves the remote's main pointer forward.</p><p>Before and after pushing, use <code>git status</code> and watch for the line “Your branch is ahead of 'origin/main' by 1 commit”.</p>`),
    setup(ctx) { collab(ctx, { 'README.md': TEAM_README, 'app.js': 'console.log(1)\n' }); },
    tasks: [
      { text: T('新建 hello.js 并提交', 'Create hello.js and commit it'), check: ctx => headFile(ctx, 'hello.js') !== null },
      { text: T('git status 看到 ahead by 1', 'git status shows ahead by 1'), check: ctx => ran(ctx, /^git status/) && headFile(ctx, 'hello.js') !== null },
      { text: T('git push，然后 git status 应显示 up to date', 'git push, then git status should say up to date'), check: ctx => srv(ctx).refs.get('refs/heads/main') === repo(ctx).branchTip('main') && headFile(ctx, 'hello.js') !== null },
    ],
    hints: ['echo "hello" > hello.js && git add . && git commit -m "hello"', 'git status', 'git push && git status'],
  });
  LEVELS.push({
    id: 'c5-3', chapter: 5, title: T('fetch 与 pull：拿到别人的提交', 'fetch and pull: get other people\'s commits'),
    intro: T(`<p>小明刚推送了一个提交。你的本地不会自动知道。</p><ul><li><code>git fetch</code>：下载远程的新提交，只更新 <code>origin/main</code>，<b>不碰你的分支和文件</b>。安全，可以先看看。</li><li><code>git pull</code> = fetch + merge（把 origin/main 合进你的 main）。</li></ul>`,
      `<p>Xiaoming just pushed a commit. Your local repo doesn't know about it automatically.</p><ul><li><code>git fetch</code>: downloads new commits from the remote and only updates <code>origin/main</code> — it <b>doesn't touch your branches or files</b>. Safe, so you can look first.</li><li><code>git pull</code> = fetch + merge (merges origin/main into your main).</li></ul>`),
    setup(ctx) { collab(ctx, { 'README.md': TEAM_README, 'app.js': 'console.log(1)\n' }); asXm(ctx, [T('echo "小明的功能" > xiaoming.js', 'echo "feature by Xiaoming" > xiaoming.js'), 'git add .', T('git commit -m "小明：新增功能"', 'git commit -m "Xiaoming: add feature"'), 'git push']); },
    tasks: [
      { text: T('git fetch，然后 git status（应显示 behind by 1）', 'git fetch, then git status (should say behind by 1)'), check: ctx => ran(ctx, /^git fetch/) && repo(ctx).refs.get('refs/remotes/origin/main') === srv(ctx).branchTip('main') },
      { text: T('git log origin/main --oneline 或 git diff main origin/main 看看小明改了什么', 'Use git log origin/main --oneline or git diff main origin/main to see what Xiaoming changed'), check: ctx => ranAny(ctx, /^git (log|diff|show).*origin\/main/) },
      { text: T('git pull 把它合并进来（这次是快进）', 'git pull to merge it in (a fast-forward this time)'), check: ctx => repo(ctx).branchTip('main') === srv(ctx).branchTip('main') && repo(ctx).workdir.has('xiaoming.js') },
    ],
    hints: ['git fetch && git status', 'git log origin/main --oneline', 'git pull'],
  });
  LEVELS.push({
    id: 'c5-4', chapter: 5, title: T('被拒绝的 push：先拉再推', 'Rejected push: pull first, then push'),
    intro: T(`<p>你和小明<b>同时</b>基于同一个提交工作。小明先推送了。你的 push 会被拒绝：远程 main 已经不是你出发时的位置，直接推就会把小明的提交覆盖掉，git 不允许。</p>
<p>解决：<code>git pull</code> 把远程的合进来。因为历史分叉了，新版本 git 会要求你明确策略：<code>git pull --no-rebase</code>（合并，产生合并提交）或 <code>git pull --rebase</code>（把你的提交挪到最后，历史干净）。团队一般偏好 rebase。然后再 push。</p>`,
      `<p>You and Xiaoming worked <b>at the same time</b> from the same commit. Xiaoming pushed first. Your push will be rejected: the remote's main is no longer where it was when you started, and pushing anyway would overwrite Xiaoming's commit — git won't allow it.</p>
<p>The fix: <code>git pull</code> to bring in the remote's work. Because the histories have diverged, newer git makes you pick a strategy: <code>git pull --no-rebase</code> (merge, creating a merge commit) or <code>git pull --rebase</code> (move your commits to the end for a clean history). Teams usually prefer rebase. Then push again.</p>`),
    setup(ctx) { collab(ctx, { 'README.md': TEAM_README, 'app.js': 'console.log(1)\n' }); asXm(ctx, [T('echo "小明的功能" > xiaoming.js', 'echo "feature by Xiaoming" > xiaoming.js'), 'git add .', T('git commit -m "小明：新增功能"', 'git commit -m "Xiaoming: add feature"'), 'git push']); commit(ctx, { 'you.js': T('我的功能\n', 'my feature\n') }, T('我：新增功能', 'Me: add feature')); },
    tasks: [
      { text: T('git push，看到 rejected', 'git push and see it rejected'), observe: true, check: ctx => ctx.world.log.some(l => /^git push/.test(l.line) && !l.ok) },
      { text: T('git pull --rebase（或 --no-rebase）整合小明的提交', 'git pull --rebase (or --no-rebase) to bring in Xiaoming\'s commit'), check: ctx => { const r = repo(ctx); return r.isAncestor(srv(ctx).branchTip('main'), r.branchTip('main')) && r.fileAt('main', 'you.js') !== null && r.fileAt('main', 'xiaoming.js') !== null; } },
      { text: T('再 push，远程应同时包含你和小明的提交', 'Push again; the remote should now have both your commit and Xiaoming\'s'), check: ctx => { const s = srv(ctx); const t = s.branchTip('main'); return s.fileAt(t, 'you.js') !== null && s.fileAt(t, 'xiaoming.js') !== null; } },
    ],
    hints: ['git push', 'git pull --rebase', 'git push'],
    feedback(ctx, cmd, res) { if (/^git push.*(-f|--force)/.test(cmd) && res.ok) return T('🚨 你用了强推！小明的提交在远程上被抹掉了（看右侧“多人”标签里服务器的历史）。真实项目里这会让同事丢工作。请点“重置本关”，这次用 pull。', '🚨 You force pushed! Xiaoming\'s commit was wiped off the remote (check the server\'s history in the “Team” tab on the right). In a real project your teammate would lose work. Click “Reset level” and use pull this time.'); if (/^git pull\s*$/.test(cmd) && !res.ok) return T('💡 这是新版 git 的真实行为：历史分叉时必须选一种策略。<code>git pull --rebase</code> 得到直线历史；<code>git pull --no-rebase</code> 产生合并提交。也可以 <code>git config pull.rebase true</code> 一劳永逸。', '💡 This is how newer git really behaves: when histories diverge, you must pick a strategy. <code>git pull --rebase</code> gives a straight-line history; <code>git pull --no-rebase</code> creates a merge commit. Or set <code>git config pull.rebase true</code> once and for all.'); return null; },
  });
  LEVELS.push({
    id: 'c5-5', chapter: 5, title: T('协作冲突', 'Conflicts with a teammate'),
    intro: T(`<p>这次你和小明改了 <b>config.js 的同一行</b>：小明把超时改成 3000，你改成 5000。pull 时会冲突——和本地分支冲突完全一样的处理方式。</p><p>团队讨论后决定用 <b>5000</b>。解决后 push。</p>`,
      `<p>This time you and Xiaoming changed <b>the same line of config.js</b>: Xiaoming set the timeout to 3000, you set it to 5000. Pulling will conflict — and you handle it exactly like a conflict between local branches.</p><p>After some discussion, the team picks <b>5000</b>. Resolve it and push.</p>`),
    setup(ctx) { collab(ctx, { 'config.js': 'module.exports = {\n  timeout: 1000,\n  retries: 3,\n};\n' }); asXm(ctx, ['printf "module.exports = {\\n  timeout: 3000,\\n  retries: 3,\\n};\\n" > config.js', T('git commit -am "小明：超时改为 3000"', 'git commit -am "Xiaoming: set timeout to 3000"'), 'git push']); commit(ctx, { 'config.js': 'module.exports = {\n  timeout: 5000,\n  retries: 3,\n};\n' }, T('我：超时改为 5000', 'Me: set timeout to 5000')); },
    tasks: [
      { text: T('git pull --rebase 遇到冲突（也可以 --no-rebase）', 'git pull --rebase and hit the conflict (--no-rebase works too)'), check: ctx => ctx.world.log.some(l => /^git pull/.test(l.line) && !l.ok) || repo(ctx).conflicts.size > 0 || repo(ctx).state.rebase || repo(ctx).state.merge },
      { text: T('解决冲突：timeout 为 5000，没有标记；git add 后 git rebase --continue（或 git commit）', 'Resolve it: timeout is 5000, no markers left; git add, then git rebase --continue (or git commit)'), check: ctx => { const r = repo(ctx); if (r.state.rebase || r.state.merge || r.conflicts.size) return false; const c = r.fileAt('main', 'config.js'); return noMarkers(c) && has(c, 'timeout: 5000') && r.isAncestor(srv(ctx).branchTip('main'), r.branchTip('main')) && r.branchTip('main') !== srv(ctx).branchTip('main'); } },
      { text: 'git push', check: ctx => { const s = srv(ctx); const c = s.fileAt(s.branchTip('main'), 'config.js'); return has(c, 'timeout: 5000') && noMarkers(c); } },
    ],
    hints: ['git pull --rebase', T('edit config.js（timeout: 5000，删掉标记）→ git add config.js → git rebase --continue', 'edit config.js (timeout: 5000, delete the markers) → git add config.js → git rebase --continue'), 'git push'],
    feedback(ctx, cmd, res) { if (/^git (add|rebase --continue|commit)/.test(cmd)) { const c = repo(ctx).workdir.get('config.js'); if (!noMarkers(c)) return T('🚨 config.js 里还有冲突标记，这样提交出去程序会直接语法错误。', '🚨 config.js still has conflict markers — commit that and the program won\'t even parse.'); } return null; },
  });
  LEVELS.push({
    id: 'c5-6', chapter: 5, title: T('功能分支协作流程', 'The feature-branch workflow'),
    intro: T(`<p>成熟团队不直接在 main 上干活，而是：</p><ol><li>开功能分支 → 提交 → <code>git push -u origin 分支名</code> 推上去（-u 建立跟踪，以后直接 git push）；</li><li>同事 review（沙盒里小明会在你的分支上追加一个提交）；</li><li><code>git pull</code> 拿到同事的补充；</li><li>合并进 main、推送 main；</li><li>删除远程分支 <code>git push origin --delete 分支名</code> 和本地分支。</li></ol>`,
      `<p>Experienced teams don't work directly on main. Instead they:</p><ol><li>Create a feature branch → commit → push it with <code>git push -u origin branch-name</code> (-u sets up tracking, so plain git push works afterwards);</li><li>Get a teammate review (in the sandbox, Xiaoming adds a commit to your branch);</li><li><code>git pull</code> to get the teammate's additions;</li><li>Merge into main and push main;</li><li>Delete the remote branch with <code>git push origin --delete branch-name</code>, and the local branch too.</li></ol>`),
    setup(ctx) { collab(ctx, { 'app.js': 'const app = {};\n' }); },
    tasks: [
      { text: T('创建 feature/search 分支，新建 search.js 并提交', 'Create a feature/search branch, add search.js and commit it'), check: ctx => { const r = repo(ctx); const t = r.branchTip('feature/search'); return t && r.fileAt(t, 'search.js') !== null; } },
      { text: 'git push -u origin feature/search', check: ctx => srv(ctx).branchTip('feature/search') !== null && repo(ctx).config['branch.feature/search.remote'] === 'origin' },
      { text: T('小明已经在你的分支上加了 review 提交（见终端）。git pull 拿到它', 'Xiaoming has added a review commit to your branch (see the terminal). git pull to get it'), check: ctx => { const r = repo(ctx); const t = r.branchTip('feature/search'); return t && r.fileAt(t, 'search.test.js') !== null; } },
      { text: T('切到 main 合并 feature/search 并 push main', 'Switch to main, merge feature/search and push main'), check: ctx => { const s = srv(ctx); return s.fileAt(s.branchTip('main'), 'search.js') !== null && s.fileAt(s.branchTip('main'), 'search.test.js') !== null; } },
      { text: T('删除远程和本地的 feature/search 分支', 'Delete the feature/search branch both remotely and locally'), check: ctx => srv(ctx).branchTip('feature/search') === null && repo(ctx).branchTip('feature/search') === null && srv(ctx).fileAt(srv(ctx).branchTip('main'), 'search.js') !== null },
    ],
    hints: [T('git switch -c feature/search && echo "search" > search.js && git add . && git commit -m "搜索功能"', 'git switch -c feature/search && echo "search" > search.js && git add . && git commit -m "Search feature"'), 'git push -u origin feature/search', 'git pull', 'git switch main && git merge feature/search && git push', 'git push origin --delete feature/search && git branch -d feature/search'],
    onCommand(ctx, cmd, res) {
      if (/^git push/.test(cmd) && res.ok && srv(ctx).branchTip('feature/search') && !ctx.state.reviewed) {
        ctx.state.reviewed = true;
        // ctx.teammate 的第一个参数是同事的标识（'小明' / '小红'），不是显示文本，由调用方映射成用户与显示名
        ctx.teammate('小明', ['git fetch', 'git switch feature/search', 'echo "test search" > search.test.js', 'git add .', T('git commit -m "小明：补充测试"', 'git commit -m "Xiaoming: add tests"'), 'git push']);
        return T('👀 小明 review 了你的分支，追加了一个提交并推送到 origin/feature/search。', '👀 Xiaoming reviewed your branch, added a commit, and pushed it to origin/feature/search.');
      }
      return null;
    },
  });
  LEVELS.push({
    id: 'c5-7', chapter: 5, title: T('强推的代价与 --force-with-lease', 'The cost of force pushing, and --force-with-lease'),
    intro: T(`<p>你推送了 "add feature" 之后发现忘了带上测试文件，于是 <code>git commit --amend</code> 把 feature.test.js 补进去了。现在本地和远程分叉，push 被拒绝。你想“这是我自己的提交，覆盖就好”，于是打算 <code>--force</code>。</p><p>但你不知道的是：<b>小明刚刚在远程 main 上又推了一个提交</b>。<code>git push --force</code> 会把它抹掉。</p><p>正确姿势：<code>git push --force-with-lease</code>——只有当远程还是“你上次看到的样子”时才允许覆盖。它会拒绝，你就会发现小明的提交，然后 fetch + rebase 再推（rebase 会把你补的测试文件作为新提交放到小明的提交之后）。</p><p class="warn">经典陷阱：<b>先 git fetch 再 --force-with-lease 就不再保护了</b>——fetch 更新了 origin/main，lease 认为你“已经知道”小明的提交。所以 fetch 之后一定要先看 <code>git log origin/main</code>。（新版 git 有 <code>--force-if-includes</code> 进一步补这个洞。）</p>`,
      `<p>After pushing "add feature" you realized you forgot the test file, so you used <code>git commit --amend</code> to add feature.test.js. Now your local branch and the remote have diverged, and push is rejected. You think “it's my own commit, I'll just overwrite it” and reach for <code>--force</code>.</p><p>What you don't know: <b>Xiaoming just pushed another commit to the remote main</b>. <code>git push --force</code> would wipe it out.</p><p>The right way: <code>git push --force-with-lease</code> — it only overwrites if the remote still looks “the way you last saw it”. It will refuse, you'll discover Xiaoming's commit, and then you fetch + rebase and push (the rebase puts your added test file in a new commit after Xiaoming's).</p><p class="warn">A classic trap: <b>running git fetch before --force-with-lease removes the protection</b> — fetch updates origin/main, so the lease thinks you “already know” about Xiaoming's commit. So after fetching, always check <code>git log origin/main</code> first. (Newer git adds <code>--force-if-includes</code> to close this hole.)</p>`),
    setup(ctx) { collab(ctx, { 'app.js': 'const app = {};\n' }); commit(ctx, { 'feature.js': 'feature\n' }, 'add feature'); sh(ctx, ['cd ' + PROJ, 'git push']); write(ctx, PROJ + '/feature.test.js', 'test feature\n'); sh(ctx, ['cd ' + PROJ, 'git add feature.test.js', 'git commit --amend -m "add feature (with tests)"']); asXm(ctx, ['git pull', T('echo "小明的重要工作" > important.js', 'echo "important work by Xiaoming" > important.js'), 'git add .', T('git commit -m "小明：重要工作"', 'git commit -m "Xiaoming: important work"'), 'git push']); },
    tasks: [
      { text: T('git push 看到 rejected', 'git push and see it rejected'), observe: true, check: ctx => ctx.world.log.some(l => /^git push\s*$/.test(l.line) && !l.ok) },
      { text: T('git push --force-with-lease，看它如何保护小明（stale info）', 'git push --force-with-lease and see how it protects Xiaoming (stale info)'), observe: true, check: ctx => ctx.world.log.some(l => /^git push.*--force-with-lease/.test(l.line) && !l.ok) },
      { text: T('git fetch，git log origin/main --oneline 发现小明的提交；然后 git rebase origin/main', 'git fetch, find Xiaoming\'s commit with git log origin/main --oneline, then git rebase origin/main'), check: ctx => { const r = repo(ctx); return r.fileAt('main', 'important.js') !== null && r.fileAt('main', 'feature.test.js') !== null && r.isAncestor(srv(ctx).branchTip('main'), r.branchTip('main')); } },
      { text: T('git push（现在是快进，不需要强推）。远程应同时有小明的提交和你的测试文件', 'git push (a fast-forward now, no force needed). The remote should have both Xiaoming\'s commit and your test file'), check: ctx => { const s = srv(ctx); const t = s.branchTip('main'); return s.fileAt(t, 'important.js') !== null && s.fileAt(t, 'feature.test.js') !== null; } },
    ],
    hints: ['git push', 'git push --force-with-lease', 'git fetch && git log origin/main --oneline && git rebase origin/main', 'git push'],
    feedback(ctx, cmd, res) { if (/^git push (-f|--force)(\s|$)/.test(cmd) && res.ok) return T('🚨 强推成功了——代价是小明的“重要工作”从远程消失了（看“多人”标签）。真实世界里只能指望小明本地还有。点“重置本关”，这次用 <code>--force-with-lease</code>。', '🚨 The force push worked — at the cost of Xiaoming\'s “important work” vanishing from the remote (see the “Team” tab). In real life you\'d have to hope Xiaoming still has it locally. Click “Reset level” and use <code>--force-with-lease</code> this time.'); if (/--force-with-lease/.test(cmd) && res.ok && /forced update/.test(res.out || '') && srv(ctx).fileAt(srv(ctx).branchTip('main'), 'important.js') === null) return T('🚨 中了经典陷阱：你先 fetch 了，origin/main 已经更新成小明的提交，于是 --force-with-lease 认为你“知情”，放行了强推——小明的工作还是没了。fetch 之后要先看 <code>git log origin/main</code>，再决定 rebase 而不是强推。点“重置本关”重来。', '🚨 You fell into the classic trap: you fetched first, so origin/main already pointed at Xiaoming\'s commit, --force-with-lease assumed you “knew about it”, and let the force push through — Xiaoming\'s work is gone anyway. After fetching, check <code>git log origin/main</code> first, then rebase instead of force pushing. Click “Reset level” to try again.'); return null; },
  });

  /* ================= 第 6 章 ================= */
  LEVELS.push({
    id: 'c6-1', chapter: 6, title: T('删除文件，以及把它找回来', 'Deleting a file, and getting it back'),
    intro: T(`<p>删除文件有两种：直接 <code>rm</code>（git 看到“deleted”但还没暂存）和 <code>git rm</code>（删除并暂存）。提交后文件从最新快照消失，但<b>历史里永远有它</b>。</p><p>找回：<code>git checkout &lt;还有它的提交&gt; -- 文件</code> 或 <code>git restore --source=&lt;提交&gt; 文件</code>。</p>`,
      `<p>There are two ways to delete a file: plain <code>rm</code> (git sees it as “deleted” but not staged) and <code>git rm</code> (deletes and stages). After committing, the file is gone from the latest snapshot, but <b>it lives on in history forever</b>.</p><p>To get it back: <code>git checkout &lt;a commit that still has it&gt; -- file</code> or <code>git restore --source=&lt;commit&gt; file</code>.</p>`),
    setup(ctx) { newProject(ctx, { 'app.js': 'app\n', 'old-module.js': 'very important old logic\n', 'README.md': '# readme\n' }, 'init'); commit(ctx, { 'app.js': 'app v2\n' }, 'v2'); },
    tasks: [
      { text: T('用 git rm 删除 old-module.js 并提交 "移除旧模块"', 'Delete old-module.js with git rm and commit "Remove old module"'), check: ctx => headFile(ctx, 'old-module.js') === null && repo(ctx).commitCount() >= 3 },
      { text: T('糟糕，还需要它。用 git log --oneline -- old-module.js 或 git log 找到还有它的提交', 'Oops, you still need it. Use git log --oneline -- old-module.js or git log to find a commit that still has it'), check: ctx => ran(ctx, /^git log/) && headFile(ctx, 'old-module.js') === null },
      { text: T('从那个提交恢复文件（git checkout HEAD~1 -- old-module.js），并提交 "恢复旧模块"', 'Restore the file from that commit (git checkout HEAD~1 -- old-module.js) and commit "Restore old module"'), check: ctx => headFile(ctx, 'old-module.js') === 'very important old logic\n' && repo(ctx).commitCount() >= 4 },
    ],
    hints: [T('git rm old-module.js && git commit -m "移除旧模块"', 'git rm old-module.js && git commit -m "Remove old module"'), 'git log --oneline', T('git checkout HEAD~1 -- old-module.js && git commit -m "恢复旧模块"', 'git checkout HEAD~1 -- old-module.js && git commit -m "Restore old module"')],
  });
  LEVELS.push({
    id: 'c6-2', chapter: 6, title: T('拿回某个文件的旧版本', 'Get back an old version of one file'),
    intro: T(`<p>不用回退整个项目，只想要 <code>parser.js</code> 在“v1.0”时候的样子。</p><p><code>git show v1.0:parser.js</code> 打印那个版本的内容；<code>git checkout v1.0 -- parser.js</code> 直接把它放进工作区和暂存区。</p>`,
      `<p>You don't want to roll back the whole project — just get <code>parser.js</code> the way it was at “v1.0”.</p><p><code>git show v1.0:parser.js</code> prints that version's contents; <code>git checkout v1.0 -- parser.js</code> puts it straight into the working tree and staging area.</p>`),
    setup(ctx) { newProject(ctx, { 'parser.js': 'function parse(s) {\n  return JSON.parse(s);\n}\n', 'app.js': 'app\n' }, 'init'); sh(ctx, ['cd ' + PROJ, 'git tag v1.0']); commit(ctx, { 'parser.js': T('function parse(s) {\n  return eval("(" + s + ")"); // 快但危险\n}\n', 'function parse(s) {\n  return eval("(" + s + ")"); // fast but dangerous\n}\n') }, T('用 eval 提速', 'Use eval for speed')); commit(ctx, { 'app.js': 'app v3\n' }, T('其他改动', 'Other changes')); },
    tasks: [
      { text: T('git show v1.0:parser.js 看看旧版本', 'Look at the old version with git show v1.0:parser.js'), check: ctx => ran(ctx, /^git show v1\.0:parser\.js/) },
      { text: T('把 v1.0 版本的 parser.js 取回工作区（app.js 保持 v3 不动）', 'Bring the v1.0 parser.js back into the working tree (leave app.js at v3)'), check: ctx => has(repo(ctx).workdir.get('parser.js'), 'JSON.parse') && repo(ctx).workdir.get('app.js') === 'app v3\n' },
      { text: T('提交 "回退 parser 到安全版本"', 'Commit "Revert parser to the safe version"'), check: ctx => has(headFile(ctx, 'parser.js'), 'JSON.parse') && headFile(ctx, 'app.js') === 'app v3\n' && repo(ctx).commitCount() >= 4 },
    ],
    hints: ['git show v1.0:parser.js', 'git checkout v1.0 -- parser.js', T('git commit -m "回退 parser 到安全版本"', 'git commit -m "Revert parser to the safe version"')],
  });
  LEVELS.push({
    id: 'c6-3', chapter: 6, title: T('远程被强推覆盖了，怎么救？', 'The remote got force-pushed over — how do you rescue it?'),
    intro: T(`<p>小明误操作 <code>git push --force</code>，把远程 main 回退到了老版本，你昨天推送的提交 "重要功能" 在服务器上没了。</p><p>幸好：<b>你本地的 main 还指着那个提交</b>（git fetch 后 origin/main 会退回去，但你的 main 不会）。只要再 push 一次，就把远程修好了。如果你本地也 pull 过了，还有 reflog。</p>`,
      `<p>Xiaoming accidentally ran <code>git push --force</code> and rolled the remote main back to an old version. The commit you pushed yesterday, "Important feature", is gone from the server.</p><p>Luckily, <b>your local main still points at that commit</b> (after git fetch, origin/main moves back, but your main doesn't). Just push once more and the remote is fixed. And if you had pulled locally too, there's still the reflog.</p>`),
    setup(ctx) { collab(ctx, { 'app.js': 'app\n' }); commit(ctx, { 'feature.js': 'important feature\n' }, T('重要功能', 'Important feature')); sh(ctx, ['cd ' + PROJ, 'git push']); asXm(ctx, ['git push --force origin main']); },
    tasks: [
      { text: T('git fetch 然后 git status，观察 "have diverged" 或 ahead', 'git fetch, then git status, and look for "have diverged" or ahead'), check: ctx => ran(ctx, /^git fetch/) && ran(ctx, /^git status/) },
      { text: T('git log --oneline --all 确认你本地 main 仍有 "重要功能"，而 origin/main 没有', 'git log --oneline --all to confirm your local main still has "Important feature" and origin/main doesn\'t'), check: ctx => ran(ctx, /^git log/) },
      { text: T('git push 把远程修复（这次是快进，不需要 force）', 'git push to repair the remote (a fast-forward this time, no force needed)'), check: ctx => srv(ctx).fileAt(srv(ctx).branchTip('main'), 'feature.js') !== null },
    ],
    hints: ['git fetch && git status', 'git log --oneline --all', 'git push'],
    feedback(ctx, cmd, res) { if (/^git pull/.test(cmd) && res.ok && headFile(ctx, 'feature.js') === null) return T('⚠️ pull 把你本地也“回退”了？其实 git 只会快进，不会丢……如果丢了，<code>git reflog</code> 找回。', '⚠️ Did pull “roll back” your local copy too? git only fast-forwards and shouldn\'t lose anything… but if something is lost, <code>git reflog</code> will find it.'); return null; },
  });
  LEVELS.push({
    id: 'c6-4', chapter: 6, title: T('清理未跟踪的杂物：git clean', 'Clean up untracked clutter: git clean'),
    intro: T(`<p>构建产生了一堆 <code>dist/</code>、<code>*.tmp</code>，没被跟踪。<code>git clean -n</code> 先<b>预览</b>会删什么，<code>git clean -fd</code> 真删（-d 包含目录）。</p><p class="warn">未跟踪文件从没进过对象库，clean 掉就是真没了。所以一定先 -n。</p>`,
      `<p>The build left behind a pile of untracked <code>dist/</code> and <code>*.tmp</code> files. <code>git clean -n</code> <b>previews</b> what would be deleted; <code>git clean -fd</code> really deletes (-d includes directories).</p><p class="warn">Untracked files never made it into the object store, so once cleaned they are truly gone. Always run -n first.</p>`),
    setup(ctx) { newProject(ctx, { 'app.js': 'app\n', '.gitignore': '*.log\n' }, 'init'); write(ctx, PROJ + '/dist/bundle.js', 'bundle\n'); write(ctx, PROJ + '/cache.tmp', 'tmp\n'); write(ctx, PROJ + '/debug.log', 'log\n'); write(ctx, PROJ + '/notes.md', T('我的笔记，要保留！\n', 'My notes, keep these!\n')); },
    tasks: [
      { text: T('git status 看看有哪些未跟踪文件', 'Use git status to see which files are untracked'), check: ctx => ran(ctx, /^git status/) },
      { text: T('notes.md 要保留：先把它 git add 进暂存区', 'notes.md must be kept: git add it to the staging area first'), check: ctx => repo(ctx).index.has('notes.md') || headFile(ctx, 'notes.md') !== null },
      { text: T('git clean -n 预览，再 git clean -fd 删除 dist/ 和 cache.tmp', 'Preview with git clean -n, then delete dist/ and cache.tmp with git clean -fd'), check: ctx => { const r = repo(ctx); return ran(ctx, /^git clean -n|^git clean --dry-run/) && !r.workdir.has('dist/bundle.js') && !r.workdir.has('cache.tmp') && r.workdir.has('notes.md'); } },
    ],
    hints: ['git status', 'git add notes.md', 'git clean -n && git clean -fd'],
    feedback(ctx, cmd, res) { const r = repo(ctx); if (/^git clean/.test(cmd) && res.ok && !r.workdir.has('notes.md') && !r.index.has('notes.md')) return T('🪦 notes.md 没了，而且<b>真的找不回来</b>：它从没 add 过，对象库里没有它的副本，reflog 也帮不上忙。这就是为什么 clean 之前一定要 <code>-n</code> 预览。点“重置本关”重来。', '🪦 notes.md is gone, and <b>there\'s truly no getting it back</b>: it was never added, so the object store has no copy and the reflog can\'t help. That\'s why you always preview with <code>-n</code> before cleaning. Click “Reset level” to try again.'); return null; },
    done: T(`<p>注意 debug.log 没被删：它被 .gitignore 忽略，clean 默认不动忽略文件（加 -x 才会）。</p>`, `<p>Notice that debug.log wasn't deleted: it's ignored by .gitignore, and clean leaves ignored files alone by default (add -x to include them).</p>`),
  });

  /* ================= 第 7 章 ================= */
  LEVELS.push({
    id: 'c7-1', chapter: 7, title: T('blame：这行是谁改的？', 'blame: who changed this line?'),
    intro: T(`<p>线上算错税了：<code>tax.js</code> 里税率变成了 0.31。<code>git blame tax.js</code> 逐行显示最后修改它的提交和作者。找到那个提交后用 <code>git show</code> 看完整改动，再用 <code>git revert</code> 撤销它。</p>`,
      `<p>Production is calculating tax wrong: the rate in <code>tax.js</code> became 0.31. <code>git blame tax.js</code> shows, line by line, the commit and author that last changed it. Once you find that commit, look at the full change with <code>git show</code>, then undo it with <code>git revert</code>.</p>`),
    setup(ctx) { collab(ctx, { 'tax.js': 'export const RATE = 0.13;\nexport function tax(amount) {\n  return amount * RATE;\n}\n', 'app.js': 'app\n' }); asXm(ctx, ['printf "export const RATE = 0.13;\\nexport function tax(amount) {\\n  return Math.round(amount * RATE * 100) / 100;\\n}\\n" > tax.js', T('git commit -am "小明：税额保留两位小数"', 'git commit -am "Xiaoming: round tax to 2 decimals"'), 'git push']); sh(ctx, ['cd ' + PROJ, 'git pull']); commit(ctx, { 'app.js': 'app v2\n' }, T('我：更新 app', 'Me: update app')); asXm(ctx, ['printf "export const RATE = 0.31;\\nexport function tax(amount) {\\n  return Math.round(amount * RATE * 100) / 100;\\n}\\n" > tax.js', `git commit -am "${SUBJ.xmTweak}"`, 'git push']); sh(ctx, ['cd ' + PROJ, 'git pull --rebase']); commit(ctx, { 'app.js': 'app v3\n' }, T('我：再更新 app', 'Me: update app again')); sh(ctx, ['cd ' + PROJ, 'git push']); },
    tasks: [
      { text: T('git blame tax.js 找到把 RATE 改成 0.31 的提交', 'Use git blame tax.js to find the commit that changed RATE to 0.31'), check: ctx => ran(ctx, /^git blame tax\.js/) },
      { text: T('git show <那个提交> 看看它改了什么', 'git show <that commit> to see what it changed'), check: ctx => { const bad = findCommit(ctx, SUBJ.xmTweak); return !!bad && ranOn(ctx, 'show', bad.hash); } },
      { text: T('git revert 它并 push（tax.js 的 RATE 应恢复 0.13，保留两位小数的逻辑不变）', 'git revert it and push (RATE in tax.js should go back to 0.13, keeping the rounding logic)'), check: ctx => { const s = srv(ctx); const c = s.fileAt(s.branchTip('main'), 'tax.js'); return has(c, '0.13') && has(c, 'Math.round'); } },
    ],
    hints: ['git blame tax.js', T('git show <哈希>', 'git show <hash>'), T('git revert <哈希> && git push', 'git revert <hash> && git push')],
  });
  LEVELS.push({
    id: 'c7-2', chapter: 7, title: T('log -S：这段代码什么时候没的？', 'log -S: when did this code disappear?'),
    intro: T(`<p>有人反馈“输入校验没了”。代码里确实找不到 <code>validate(</code> 了。<code>git log -S "validate(" --oneline</code> 会列出<b>增加或删除了这个字符串</b>的提交（pickaxe 搜索）。</p><p>找到删除它的提交后，<code>git show</code> 看细节，再把函数恢复（可以 revert 那个提交，或从它的父提交里取回文件）。</p>`,
      `<p>Someone reports that “input validation is gone”. Sure enough, <code>validate(</code> is nowhere in the code. <code>git log -S "validate(" --oneline</code> lists the commits that <b>added or removed that string</b> (the “pickaxe” search).</p><p>Once you find the commit that removed it, look at the details with <code>git show</code>, then bring the function back (revert that commit, or restore the file from its parent commit).</p>`),
    setup(ctx) { newProject(ctx, { 'form.js': 'function validate(input) {\n  return input.length > 0;\n}\nfunction submit(input) {\n  if (!validate(input)) return;\n  send(input);\n}\n', 'app.js': 'app\n' }, 'init'); commit(ctx, { 'app.js': 'app 2\n' }, T('改动 1', 'Change 1')); commit(ctx, { 'form.js': 'function submit(input) {\n  send(input);\n}\n' }, SUBJ.simplifyForm); commit(ctx, { 'app.js': 'app 3\n' }, T('改动 3', 'Change 3')); commit(ctx, { 'app.js': 'app 4\n' }, T('改动 4', 'Change 4')); },
    tasks: [
      { text: T('git log -S "validate(" --oneline 找到相关提交', 'Find the relevant commits with git log -S "validate(" --oneline'), check: ctx => ran(ctx, /^git log.*-S/) },
      { text: T('git show 那个删除了校验的提交', 'git show the commit that removed the validation'), check: ctx => { const bad = findCommit(ctx, SUBJ.simplifyForm); return !!bad && ranOn(ctx, 'show', bad.hash); } },
      { text: T('恢复校验逻辑并提交（form.js 需重新包含 validate，app.js 保持 "app 4"）', 'Restore the validation and commit (form.js must contain validate again; app.js stays "app 4")'), check: ctx => has(headFile(ctx, 'form.js'), 'validate(input)') && headFile(ctx, 'app.js') === 'app 4\n' },
    ],
    hints: ['git log -S "validate(" --oneline', T('git show <哈希>', 'git show <hash>'), T('git revert <哈希>   或   git checkout <哈希>~1 -- form.js && git commit -m "恢复校验"', 'git revert <hash>   or   git checkout <hash>~1 -- form.js && git commit -m "Restore validation"')],
  });
  LEVELS.push({
    id: 'c7-3', chapter: 7, title: T('bisect：二分查找肇事提交', 'bisect: binary-search for the culprit commit'),
    intro: T(`<p>测试 <code>npm test</code> 在最新版本失败，但 v1.0 标签处是好的。中间有 15 个提交，每个都跑一遍太慢。</p>
<p><code>git bisect start</code> → <code>git bisect bad</code>（当前坏）→ <code>git bisect good v1.0</code>。git 会检出中间的提交，你跑 <code>npm test</code>，根据结果 <code>git bisect good</code> 或 <code>bad</code>，4 次左右就能定位。最后 <code>git bisect reset</code> 回到 main。</p>`,
      `<p><code>npm test</code> fails on the latest version, but it was fine at the v1.0 tag. There are 15 commits in between — testing each one would take forever.</p>
<p><code>git bisect start</code> → <code>git bisect bad</code> (the current one is bad) → <code>git bisect good v1.0</code>. git checks out a commit in the middle; you run <code>npm test</code> and answer <code>git bisect good</code> or <code>bad</code> based on the result. About 4 rounds pin it down. Finally, <code>git bisect reset</code> takes you back to main.</p>`),
    setup(ctx) {
      newProject(ctx, { 'calc.js': 'export function add(a, b) {\n  return a + b;\n}\nexport function mul(a, b) {\n  return a * b;\n}\n', 'changelog.md': '' }, 'init');
      sh(ctx, ['cd ' + PROJ, 'git tag v1.0']);
      let changelog = '';
      const perfNote = T(' + 1; // 性能优化?', ' + 1; // performance tweak?');
      for (let i = 1; i <= 15; i++) {
        const files = {};
        if (i !== 9) { changelog += T(`- 改动 ${i}\n`, `- Change ${i}\n`); files['changelog.md'] = changelog; }
        files['calc.js'] = `// calc v${i === 9 ? 8 : i}\nexport function add(a, b) {\n  return a + b;\n}\nexport function mul(a, b) {\n  return a * b${i >= 9 ? perfNote : ';'}\n}\n`;
        commit(ctx, files, SUBJ.dailyChange(i));
      }
      ctx.world.testRunner = (r) => { if (!r) return { out: T('npm ERR! 不在项目目录', 'npm ERR! not in the project directory'), ok: false }; const c = r.workdir.get('calc.js') || ''; const ok = c.includes('a * b;'); ctx.state.lastTest = ok; return { out: ok ? '> test\n\n  ✓ add(2, 3) === 5\n  ✓ mul(2, 3) === 6\n\n2 passing' : '> test\n\n  ✓ add(2, 3) === 5\n  ✗ mul(2, 3) === 6\n    AssertionError: expected 7 to equal 6\n\n1 passing, 1 failing', ok }; };
    },
    tasks: [
      { text: T('npm test 确认当前失败；git bisect start，标记 bad 和 good v1.0', 'Run npm test to confirm it fails now; git bisect start, then mark bad and good v1.0'), check: ctx => ranAny(ctx, /^npm test|^make test/) && ran(ctx, /^git bisect (good|bad)/) },
      { text: T('反复 npm test + git bisect good/bad，直到 git 报告 "is the first bad commit"（应是 "日常改动 9"）', 'Repeat npm test + git bisect good/bad until git reports "is the first bad commit" (it should be "Routine change 9")'), check: ctx => { const r = repo(ctx); const st = r.state.bisect; const bad = r.revList([r.branchTip('main')]).find(h => r.subject(h) === SUBJ.dailyChange(9)); return (st && st.found === bad) || ctx.state.found === bad; } },
      { text: T('git bisect reset 回到 main，然后 git revert 那个提交，npm test 通过', 'git bisect reset to go back to main, then git revert that commit so npm test passes'), check: ctx => { const r = repo(ctx); return !r.state.bisect && r.currentBranch() === 'main' && has(r.fileAt('main', 'calc.js'), 'a * b;') && r.subject(r.headHash()).startsWith('Revert'); } },
    ],
    feedback(ctx, cmd, res) { const r = repo(ctx); if (/^git bisect (good|bad)\s*$/.test(cmd) && res.ok && ctx.state.lastTest !== undefined) { const saidGood = /good/.test(cmd); if (saidGood !== ctx.state.lastTest) return T(`🤔 刚才 npm test 是${ctx.state.lastTest ? '通过' : '失败'}的，你却标记了 ${saidGood ? 'good' : 'bad'}。标反一次 bisect 就会指向错误的提交。<code>git bisect log</code> 能看记录；实在乱了就 <code>git bisect reset</code> 重来。`, `🤔 npm test just ${ctx.state.lastTest ? 'passed' : 'failed'}, but you marked it ${saidGood ? 'good' : 'bad'}. Mark one step wrong and bisect will point at the wrong commit. <code>git bisect log</code> shows what you've marked; if it's a mess, <code>git bisect reset</code> and start over.`); ctx.state.lastTest = undefined; } if (/^git (revert|commit)/.test(cmd) && r.state.bisect) return T('⚠️ bisect 进行中不要提交——你现在在 detached HEAD 上，提交会挂在半空。先 <code>git bisect reset</code> 回到 main 再修。', '⚠️ Don\'t commit while bisecting — you\'re on a detached HEAD, so the commit would be left dangling. <code>git bisect reset</code> back to main first, then fix it.'); return null; },
    hints: [T('npm test（失败）→ git bisect start → git bisect bad → git bisect good v1.0', 'npm test (fails) → git bisect start → git bisect bad → git bisect good v1.0'), T('每一步：npm test → 通过就 git bisect good，失败就 git bisect bad', 'At each step: npm test → git bisect good if it passes, git bisect bad if it fails'), T('git bisect reset && git revert <肇事提交> && npm test', 'git bisect reset && git revert <culprit commit> && npm test')],
    onCommand(ctx, cmd, res) { const r = repo(ctx); if (r && r.state.bisect && r.state.bisect.found) ctx.state.found = r.state.bisect.found; if (/^npm test|^make test|^pytest/.test(cmd)) ctx.state.lastTest = res.ok; return null; },
  });
  LEVELS.push({
    id: 'c7-4', chapter: 7, title: T('两个版本之间到底改了什么？', 'What exactly changed between two versions?'),
    intro: T(`<p>发布 v2.0 前要写发布说明。用范围语法：<code>git log v1.0..v2.0 --oneline</code> 列出 v1.0 之后到 v2.0 的所有提交；<code>git diff v1.0 v2.0 --stat</code> 看改了哪些文件；<code>git log --author=小明</code> 筛选作者。</p>`,
      `<p>Before releasing v2.0 you need to write release notes. Use range syntax: <code>git log v1.0..v2.0 --oneline</code> lists every commit after v1.0 up to v2.0; <code>git diff v1.0 v2.0 --stat</code> shows which files changed; <code>git log --author=Xiaoming</code> filters by author.</p>`),
    setup(ctx) { collab(ctx, { 'app.js': 'app\n', 'README.md': 'readme\n' }); sh(ctx, ['cd ' + PROJ, 'git tag v1.0']); asXm(ctx, ['echo "search" > search.js', 'git add .', T('git commit -m "小明：搜索功能"', 'git commit -m "Xiaoming: search feature"'), 'git push']); sh(ctx, ['cd ' + PROJ, 'git pull']); commit(ctx, { 'app.js': 'app v2\n' }, T('我：重构 app', 'Me: refactor app')); commit(ctx, { 'README.md': 'readme v2\n' }, T('我：更新文档', 'Me: update docs')); sh(ctx, ['cd ' + PROJ, 'git tag v2.0', 'git push', 'git push --tags']); },
    tasks: [
      { text: 'git log v1.0..v2.0 --oneline', check: ctx => ran(ctx, /^git log v1\.0\.\.v2\.0/) },
      { text: 'git diff v1.0 v2.0 --stat', check: ctx => ran(ctx, /^git diff v1\.0 v2\.0 --stat|^git diff --stat v1\.0 v2\.0/) },
      { text: T('git log --author=小明 --oneline 看小明的贡献', 'git log --author=Xiaoming --oneline to see Xiaoming\'s contributions'), check: ctx => ran(ctx, /^git log.*--author/) },
      // 玩家自己写的内容：中英文关键词都接受
      { text: T('把发布说明写进 RELEASE.md（包含“搜索”二字）并提交', 'Write release notes into RELEASE.md (mention “search”) and commit it'), check: ctx => { const c = headFile(ctx, 'RELEASE.md'); return has(c, '搜索') || /search/i.test(c || ''); } },
    ],
    hints: ['git log v1.0..v2.0 --oneline', 'git diff v1.0 v2.0 --stat', T('git log --author=小明 --oneline', 'git log --author=Xiaoming --oneline'), T('echo "v2.0: 新增搜索功能，重构 app" > RELEASE.md && git add . && git commit -m "发布说明"', 'echo "v2.0: new search feature, refactored app" > RELEASE.md && git add . && git commit -m "Release notes"')],
  });

  /* ================= 第 8 章：沙盒 ================= */
  LEVELS.push({
    id: 'sandbox', chapter: 8, title: T('自由沙盒', 'Free sandbox'),
    intro: T(`<p>这里有：你的仓库 <code>~/project</code>、服务器上的 <code>origin</code>、小明（<code>/home/xiaoming/project</code>）和小红（<code>/home/xiaohong/project</code>）的克隆。</p><p>右侧“多人”标签里的按钮可以让同事做事（推送提交、制造冲突、强推……）。你也可以 <code>cd /home/xiaoming/project</code> 亲自扮演小明。</p><p>随便折腾，随时点“重置本关”。</p>`,
      `<p>Here you have: your repository <code>~/project</code>, <code>origin</code> on the server, and clones for Xiaoming (<code>/home/xiaoming/project</code>) and Xiaohong (<code>/home/xiaohong/project</code>).</p><p>The buttons in the “Team” tab on the right make your teammates do things (push commits, create conflicts, force push…). You can also <code>cd /home/xiaoming/project</code> and play Xiaoming yourself.</p><p>Mess around as much as you like, and click “Reset level” any time.</p>`),
    sandbox: true,
    setup(ctx) { collab(ctx, { 'README.md': TEAM_README, 'app.js': 'const app = {};\n', 'config.js': 'module.exports = { port: 3000 };\n' }); xhIdentity(ctx); asXh(ctx, ['git clone ' + SRV]); ctx.world.testRunner = r => ({ out: r ? T('所有测试通过 ✓', 'All tests passed ✓') : T('不在项目目录', 'Not in the project directory'), ok: !!r }); },
    tasks: [{ text: T('没有固定目标。想练什么练什么。', 'No fixed goal. Practice whatever you like.'), check: () => false }],
    hints: ['git log --oneline --graph --all', T('试试让小明推送后再 git push，看看拒绝信息', 'Have Xiaoming push first, then git push and read the rejection message')],
    // ctx.teammate 的第一个参数是同事标识（'小明' / '小红'），不是显示文本
    actions: [
      { label: T('小明：推送一个新文件', 'Xiaoming: push a new file'), run: ctx => { ctx.state.n = (ctx.state.n || 0) + 1; ctx.teammate('小明', ['git pull --no-rebase', T(`echo "小明的第 ${ctx.state.n} 个文件" > xm${ctx.state.n}.js`, `echo "file ${ctx.state.n} from Xiaoming" > xm${ctx.state.n}.js`), 'git add .', T(`git commit -m "小明：新增 xm${ctx.state.n}.js"`, `git commit -m "Xiaoming: add xm${ctx.state.n}.js"`), 'git push']); } },
      { label: T('小明：修改 config.js 并推送（制造冲突）', 'Xiaoming: change config.js and push (causes a conflict)'), run: ctx => { ctx.state.p = (ctx.state.p || 4000) + 1; ctx.teammate('小明', ['git pull --no-rebase', `echo "module.exports = { port: ${ctx.state.p} };" > config.js`, T(`git commit -am "小明：端口改为 ${ctx.state.p}"`, `git commit -am "Xiaoming: set port to ${ctx.state.p}"`), 'git push']); } },
      { label: T('小红：在 feature/report 分支推送', 'Xiaohong: push on the feature/report branch'), run: ctx => { ctx.teammate('小红', ['git fetch', 'git switch feature/report 2>/dev/null || git switch -c feature/report', 'echo "report" >> report.js', 'git add .', T('git commit -m "小红：报表功能"', 'git commit -m "Xiaohong: report feature"'), 'git push -u origin feature/report']); } },
      { label: T('小明：强推回退远程 main（危险操作）', 'Xiaoming: force push to roll back remote main (dangerous)'), run: ctx => { ctx.teammate('小明', ['git fetch', 'git reset --hard origin/main~1', 'git push --force']); } },
      { label: T('小明：删除远程 feature/report', 'Xiaoming: delete remote feature/report'), run: ctx => { ctx.teammate('小明', ['git push origin --delete feature/report']); } },
    ],
  });

  global.GitLevels = { LEVELS, CHAPTERS, PROJ, SRV, XM };
})(typeof window !== 'undefined' ? window : globalThis);
