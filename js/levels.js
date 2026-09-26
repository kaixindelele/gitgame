/* 关卡定义：每关有 setup（构造世界）、tasks（判定）、hints、intro（讲解）、feedback（针对性纠正） */
(function (global) {
  'use strict';
  const { abbrev } = global.GitCore;

  /* ---------- 工具 ---------- */
  const PROJ = '/home/you/project';
  const SRV = '/srv/git/project.git';
  const XM = '/home/xiaoming/project';
  function sh(ctx, lines) { for (const l of lines) { const r = ctx.world.exec(l, { silent: true }); if (!r.ok) console.warn('setup failed:', l, r.err); } }
  function asUser(ctx, user, lines) { const home = '/home/' + user; ctx.world.mkdirp(home); for (const l of [].concat(lines)) { const cwd = ctx.world.repoAt(home + '/project') ? home + '/project' : home; const r = ctx.world.runAs(user, cwd, l); if (!r.ok) console.warn(user + ' failed:', l, r.err); } }
  function asXm(ctx, lines) { asUser(ctx, 'xiaoming', lines); }
  function asXh(ctx, lines) { asUser(ctx, 'xiaohong', lines); }
  function identity(ctx) { sh(ctx, ['git config --global user.name "你"', 'git config --global user.email "you@example.com"']); }
  function xmIdentity(ctx) { ctx.world.mkdirp('/home/xiaoming'); ctx.world.globalConfigFor('/home/xiaoming')['user.name'] = '小明'; ctx.world.globalConfigFor('/home/xiaoming')['user.email'] = 'xiaoming@example.com'; }
  function xhIdentity(ctx) { ctx.world.mkdirp('/home/xiaohong'); ctx.world.globalConfigFor('/home/xiaohong')['user.name'] = '小红'; ctx.world.globalConfigFor('/home/xiaohong')['user.email'] = 'xiaohong@example.com'; }
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

  const LEVELS = [];
  const CHAPTERS = [
    { id: 0, title: '第 0 章 · 没有 git 的日子', desc: '先用最原始的“复制文件夹”法备份，体会一下痛点。后面每个 git 概念都会和它对照。' },
    { id: 1, title: '第 1 章 · 基础三板斧', desc: 'init / add / commit / status / diff / log —— 工作区、暂存区、提交三棵树。' },
    { id: 2, title: '第 2 章 · 撤销与找回', desc: 'restore / reset / revert / amend / reflog —— 犯错不可怕，git 几乎什么都能找回来。' },
    { id: 3, title: '第 3 章 · 分支', desc: 'branch / switch / merge / rebase / cherry-pick / stash / tag —— 分支只是一个指针。' },
    { id: 4, title: '第 4 章 · 冲突', desc: '同一处各改各的，git 无法替你决定。学会读冲突标记、解决、中止。' },
    { id: 5, title: '第 5 章 · 多人协作', desc: 'clone / push / fetch / pull —— 和同事小明一起改同一个仓库，被拒绝、分叉、冲突、强推。' },
    { id: 6, title: '第 6 章 · 删除与数据恢复', desc: '删文件、删分支、被覆盖的远程、清理杂物——什么能找回，什么真的没了。' },
    { id: 7, title: '第 7 章 · 定位 bug', desc: 'blame / log -S / bisect —— 用历史回答“是谁、什么时候、为什么改坏了”。' },
    { id: 8, title: '第 8 章 · 自由沙盒', desc: '一个带远程和两位同事的完整环境，随便折腾。' },
  ];

  /* ================= 第 0 章 ================= */
  LEVELS.push({
    id: 'c0-1', chapter: 0, title: '手工备份：cp -r 大法',
    intro: `<p>你在 <code>~/project</code> 里写了一个小程序。没有版本控制的年代，人们这样“存档”：<b>整个文件夹复制一份，改个名字</b>。</p>
<p>试一试这个流程，感受一下它哪里不方便。右侧的“原理对比”面板以后会把每个 git 命令和这种做法对照。</p>
<p class="tip">终端支持 <code>ls</code>、<code>cat</code>、<code>cp -r</code>、<code>echo "文本" >> 文件</code>、<code>diff -r</code>、<code>du -sh</code>，输入 <code>help</code> 查看全部。</p>`,
    setup(ctx) { ctx.world.mkdirp('/home/you/project'); write(ctx, '/home/you/project/app.js', 'function hello() {\n  console.log("hello");\n}\nhello();\n'); write(ctx, '/home/you/project/README.md', '# 我的项目\n'); },
    tasks: [
      { text: '把 project 整个复制一份，命名为 project_v1（cp -r project project_v1）', check: ctx => ctx.world.isDir('/home/you/project_v1') },
      { text: '修改 project/app.js（例如 echo "// 新功能" >> project/app.js）', check: ctx => { const c = ctx.world.readFile('/home/you/project/app.js'); return c && c !== 'function hello() {\n  console.log("hello");\n}\nhello();\n'; } },
      { text: '再备份一份 project_v2', check: ctx => ctx.world.isDir('/home/you/project_v2') && ctx.world.readFile('/home/you/project_v2/app.js') !== ctx.world.readFile('/home/you/project_v1/app.js') },
      { text: '用 diff -r project_v1 project_v2 看看两次备份差在哪', check: ctx => ran(ctx, /^diff\s+.*project_v1.*project_v2|^diff\s+.*project_v2.*project_v1/) || ctx.world.log.some(l => /^diff\b/.test(l.line) && l.ok) },
      { text: '用 du -sh * 看看磁盘占用', check: ctx => ranAny(ctx, /^du\b/) },
    ],
    hints: ['cp -r project project_v1', 'echo "// 新功能" >> project/app.js', 'cp -r project project_v2', 'diff -r project_v1 project_v2', 'du -sh *'],
    done: `<p>痛点已经出现了：</p><ul><li>每份备份都是<b>完整复制</b>，README.md 一个字没改也被复制了 N 次。</li><li>备份之间<b>没有说明</b>：v2 比 v1 改了什么？为什么改？只能靠 diff 硬看。</li><li>你不知道 v1 和 v2 之间是否还有别的版本，也不知道谁改的。</li></ul><p>git 解决的就是这三件事：<b>只存变化、记录说明、记住顺序</b>。</p>`,
  });
  LEVELS.push({
    id: 'c0-2', chapter: 0, title: '备份地狱：哪个才是最终版？',
    intro: `<p>一年后，你的目录变成了这样。老板说：“把<b>端口是 8080</b> 的那个版本恢复回来！”</p><p>而且其中有两个备份其实一模一样，浪费空间，请删掉重复的那个。</p>
<p class="tip">可用工具：<code>grep -r "关键字" 目录</code>、<code>diff -r 目录1 目录2</code>（没有输出就表示完全相同）、<code>cp -r</code>、<code>rm -r</code>。</p>`,
    setup(ctx) {
      const mk = (dir, port, extra) => { ctx.world.mkdirp('/home/you/' + dir); write(ctx, `/home/you/${dir}/config.js`, `module.exports = {\n  port: ${port},\n  debug: ${extra},\n};\n`); write(ctx, `/home/you/${dir}/app.js`, 'const cfg = require("./config");\nconsole.log("listening on", cfg.port);\n'); };
      mk('project', 3000, 'true'); mk('project_final', 5000, 'false'); mk('project_final2', 8080, 'false'); mk('project_final_真的最终', 9000, 'true'); mk('project_backup_0103', 5000, 'false'); mk('project_old', 80, 'true');
    },
    tasks: [
      { text: '用 grep -r 找到 config.js 里 port 为 8080 的那个备份', check: ctx => ranAny(ctx, /grep.*8080/) },
      { text: '把它恢复成 project（先 rm -r project，再 cp -r 那个备份 project）', check: ctx => has(ctx.world.readFile('/home/you/project/config.js'), '8080') },
      { text: '找出两个内容完全相同的备份（diff -r），删掉其中一个', check: ctx => { const a = ctx.world.isDir('/home/you/project_final'), b = ctx.world.isDir('/home/you/project_backup_0103'); return (a && !b) || (!a && b); } },
    ],
    hints: ['grep -r 8080 .', 'rm -r project && cp -r project_final2 project', 'diff -r project_final project_backup_0103 （没有输出 = 完全相同）', 'rm -r project_backup_0103'],
    done: `<p>你刚才做的其实就是 git 内部的两件事：<b>按内容查找版本</b>（git 用哈希，秒查）和<b>内容去重</b>（git 里相同内容的文件天然只存一份）。</p><p>接下来，让我们把这套流程交给 git。</p>`,
  });

  /* ================= 第 1 章 ================= */
  LEVELS.push({
    id: 'c1-1', chapter: 1, title: 'git init：给文件夹装上“记忆”',
    intro: `<p><code>git init</code> 会在目录里创建一个隐藏的 <code>.git</code> 文件夹——这就是你的“备份盒子”，所有历史都存在里面，项目文件本身不受影响。</p>
<p>git 还需要知道<b>你是谁</b>，每次提交都会记下作者。用 <code>git config --global user.name "名字"</code> 和 <code>user.email</code> 设置。</p>`,
    setup(ctx) { ctx.world.mkdirp('/home/you/project'); write(ctx, '/home/you/project/app.js', 'console.log("hello");\n'); },
    tasks: [
      { text: '进入 project 目录并执行 git init', check: ctx => !!repo(ctx) },
      { text: '设置 user.name（git config --global user.name "你的名字"）', check: ctx => !!(ctx.world.globalConfigFor(PROJ)['user.name'] || (repo(ctx) && repo(ctx).config['user.name'])) },
      { text: '设置 user.email', check: ctx => !!(ctx.world.globalConfigFor(PROJ)['user.email'] || (repo(ctx) && repo(ctx).config['user.email'])) },
      { text: '运行 git status 看看现在的状态', check: ctx => !!repo(ctx) && ran(ctx, /^git status/) },
    ],
    hints: ['cd project', 'git init', 'git config --global user.name "小王"', 'git config --global user.email "xiaowang@example.com"', 'git status'],
    done: `<p>注意 status 里的 <b>Untracked files</b>：app.js 在文件夹里，但 git 还没有“跟踪”它。git 不会自作主张备份任何东西，一切由你用 <code>git add</code> 决定。</p><p>试试 <code>ls -a</code>，能看到 <code>.git/</code>。</p>`,
  });
  LEVELS.push({
    id: 'c1-2', chapter: 1, title: 'add 与 commit：第一次快照',
    intro: `<p>git 有三个区域：</p><ol><li><b>工作区</b>：你看到、编辑的文件。</li><li><b>暂存区（index）</b>：下一次快照“准备包含哪些内容”的清单。<code>git add</code> 把文件放进去。</li><li><b>仓库（提交历史）</b>：<code>git commit</code> 把暂存区变成一个永久快照。</li></ol>
<p>对照原始方案：add = 把文件复制到“待打包”文件夹；commit = 把它压缩成一个带说明、带编号的存档。右侧“三棵树”标签可以实时看到这三个区域。</p>`,
    setup(ctx) { identity(ctx); sh(ctx, ['mkdir -p ' + PROJ, 'cd ' + PROJ, 'git init']); write(ctx, PROJ + '/app.js', 'console.log("hello");\n'); },
    tasks: [
      { text: '创建 README.md（echo "# 项目说明" > README.md）', check: ctx => repo(ctx) && repo(ctx).workdir.has('README.md') },
      { text: '把 app.js 和 README.md 都加入暂存区（git add）', check: ctx => !!repo(ctx) && ((repo(ctx).index.has('app.js') && repo(ctx).index.has('README.md')) || (repo(ctx).headHash() && repo(ctx).fileAt('HEAD', 'app.js') !== null && repo(ctx).fileAt('HEAD', 'README.md') !== null)) },
      { text: '用 git status 确认它们出现在 "Changes to be committed"', check: ctx => ran(ctx, /^git status/) },
      { text: '提交，说明写 "第一次提交"（git commit -m "第一次提交"）', check: ctx => repo(ctx) && repo(ctx).headHash() && repo(ctx).fileAt('HEAD', 'app.js') !== null && repo(ctx).fileAt('HEAD', 'README.md') !== null },
    ],
    hints: ['echo "# 项目说明" > README.md', 'git add app.js README.md  （或 git add .）', 'git status', 'git commit -m "第一次提交"'],
    done: `<p>看右侧的“原理对比”：这次提交创建了 2 个 blob（文件内容）、1 个 tree（目录快照）、1 个 commit，并把 <code>main</code> 分支指向它。</p><p>试试 <code>git log</code> 和 <code>git cat-file -p HEAD</code>，你会看到 commit 对象的真实内容。</p>`,
  });
  LEVELS.push({
    id: 'c1-3', chapter: 1, title: '修改 → 查看差异 → 暂存 → 提交',
    intro: `<p>日常工作就是这个循环。关键是理解 <code>git diff</code> 的两种用法：</p><ul><li><code>git diff</code>：工作区 vs 暂存区（“我改了什么还没 add”）</li><li><code>git diff --staged</code>：暂存区 vs 上次提交（“我准备提交什么”）</li></ul>
<p>本关请把 app.js 里的 <code>hello</code> 改成 <code>hello, git</code>，并新增一个 utils.js。可以用 <code>edit app.js</code> 打开编辑器，或用 <code>sed -i "s/hello/hello, git/" app.js</code>。</p>`,
    setup(ctx) { newProject(ctx, { 'app.js': 'console.log("hello");\n', 'README.md': '# 项目说明\n' }, '第一次提交'); },
    tasks: [
      { text: '修改 app.js，让它包含 hello, git', check: ctx => has(repo(ctx) && repo(ctx).workdir.get('app.js'), 'hello, git') },
      { text: '运行 git diff 查看未暂存的改动', check: ctx => ran(ctx, /^git diff\s*$/) },
      { text: 'git add app.js，然后用 git diff --staged 查看已暂存的改动', check: ctx => ran(ctx, /^git diff (--staged|--cached)/) && has(repo(ctx) && repo(ctx).index.has('app.js') ? repo(ctx).blobContent(repo(ctx).index.get('app.js')) : '', 'hello, git') },
      { text: '提交这次修改', check: ctx => has(headFile(ctx, 'app.js'), 'hello, git') },
      { text: '新建 utils.js，add 并提交（现在应该有 3 个提交）', check: ctx => headFile(ctx, 'utils.js') !== null && repo(ctx).commitCount() >= 3 },
    ],
    hints: ['sed -i "s/hello/hello, git/" app.js   或   edit app.js', 'git diff', 'git add app.js && git diff --staged', 'git commit -m "问候语改为 hello, git"', 'echo "export const add = (a, b) => a + b;" > utils.js && git add utils.js && git commit -m "新增 utils"'],
    feedback(ctx, cmd, res) { if (/^git commit/.test(cmd) && !res.ok && /no changes added to commit/.test(res.err)) return '💡 你改了文件但还没 <code>git add</code>。git 只提交暂存区里的内容。想跳过暂存可用 <code>git commit -am "..."</code>（仅对已跟踪的文件有效）。'; return null; },
  });
  LEVELS.push({
    id: 'c1-4', chapter: 1, title: '看看 .git 里到底有什么',
    intro: `<p>git 的“数据库”只有 4 种对象：<b>blob</b>（文件内容）、<b>tree</b>（目录：文件名 → blob）、<b>commit</b>（指向一个 tree 和父提交）、<b>tag</b>。所有对象都用内容的 SHA-1 命名。</p>
<p>用 <code>git cat-file -p &lt;哈希&gt;</code> 可以直接打印任何对象。跟着任务走一遍，你会发现 commit → tree → blob 是一条能亲手走通的链。</p>`,
    setup(ctx) { newProject(ctx, { 'app.js': 'console.log("hello, git");\n', 'README.md': '# 项目说明\n' }, '第一次提交'); commit(ctx, { 'utils.js': 'export const add = (a, b) => a + b;\n' }, '新增 utils'); },
    tasks: [
      { text: 'git log 查看历史（试试 --oneline）', check: ctx => ran(ctx, /^git log/) },
      { text: 'git cat-file -p HEAD 打印最新提交对象', check: ctx => ran(ctx, /^git cat-file -p (HEAD|[0-9a-f]{4,})/) },
      { text: '从 commit 里找到 tree 的哈希，git cat-file -p <tree哈希> 打印目录', check: ctx => { const r = repo(ctx); const t = r.getCommit(r.headHash()).tree; return ran(ctx, new RegExp('^git cat-file -p ' + t.slice(0, 4))) || ran(ctx, /^git cat-file -p HEAD\^\{tree\}|^git ls-tree/); } },
      { text: '再从 tree 里找到 app.js 的 blob 哈希并打印它', check: ctx => { const r = repo(ctx); const b = r.treeOfCommit(r.headHash()).get('app.js'); return ran(ctx, new RegExp('^git cat-file -p ' + b.slice(0, 4))) || ran(ctx, /^git show HEAD:app\.js/); } },
      { text: 'git count-objects 看看对象总数', check: ctx => ran(ctx, /^git count-objects/) },
    ],
    hints: ['git log --oneline', 'git cat-file -p HEAD', '复制输出第一行 tree 后面的哈希：git cat-file -p <那个哈希>', '复制 app.js 那一行的哈希：git cat-file -p <哈希>', 'git count-objects'],
    done: `<p>这就是 git 的全部秘密：<b>提交是快照，不是差异</b>。每个 commit 指向一整棵 tree；没改过的文件，新旧 tree 指向同一个 blob。右侧“原理对比”里的快照文件夹视图，用“共享”标出了这些没有重复存储的文件。</p>`,
  });
  LEVELS.push({
    id: 'c1-5', chapter: 1, title: '.gitignore：别把垃圾提交进去',
    intro: `<p>编译产物、日志、依赖目录不该进入仓库。在 <code>.gitignore</code> 里写模式（每行一个，如 <code>*.log</code>、<code>node_modules/</code>），git 就会在 status 和 <code>git add .</code> 时忽略它们。</p><p>注意：<b>已经被跟踪的文件不受 .gitignore 影响</b>，需要先 <code>git rm --cached</code>。</p>`,
    setup(ctx) { newProject(ctx, { 'app.js': 'console.log("hi");\n' }, 'init'); write(ctx, PROJ + '/debug.log', 'lots of logs\n'); write(ctx, PROJ + '/node_modules/lodash/index.js', 'module.exports = {};\n'); write(ctx, PROJ + '/src/main.js', 'export default 1;\n'); },
    tasks: [
      { text: '创建 .gitignore，忽略 *.log 和 node_modules/', check: ctx => { const r = repo(ctx); return r.isIgnored('debug.log') && r.isIgnored('node_modules/lodash/index.js'); } },
      { text: 'git status 确认 debug.log 和 node_modules 消失了', check: ctx => ran(ctx, /^git status/) && repo(ctx).isIgnored('debug.log') },
      { text: 'git add . 然后提交（.gitignore 和 src/main.js 应该被提交，日志不应该）', check: ctx => headFile(ctx, '.gitignore') !== null && headFile(ctx, 'src/main.js') !== null && headFile(ctx, 'debug.log') === null && headFile(ctx, 'node_modules/lodash/index.js') === null },
    ],
    hints: ['printf "*.log\\nnode_modules/\\n" > .gitignore', 'git status', 'git add . && git commit -m "添加 gitignore"'],
    feedback(ctx, cmd, res) { if (headFile(ctx, 'debug.log') !== null) return '⚠️ debug.log 被提交进历史了。用 <code>git rm --cached debug.log</code> 取消跟踪并重新提交（历史里仍会留下它，这就是为什么要提前写 .gitignore）。'; return null; },
  });

  /* ================= 第 2 章 ================= */
  LEVELS.push({
    id: 'c2-1', chapter: 2, title: '丢弃工作区的修改',
    intro: `<p>你改了 app.js 改得一团糟，想回到<b>上次 add/commit 时</b>的样子。<code>git restore app.js</code>（老写法 <code>git checkout -- app.js</code>）会用暂存区里的版本覆盖工作区。</p><p class="warn">这个操作<b>不可撤销</b>：从未 add 过的修改没进过对象库，git 也救不回来。这和你手动 <code>cp 备份/app.js ./</code> 覆盖是一回事。</p>`,
    setup(ctx) { newProject(ctx, { 'app.js': 'function main() {\n  return 42;\n}\n' }, 'init'); write(ctx, PROJ + '/app.js', 'function main() {\n  return 42;\n}\n// 乱七八糟\n// 的改动\nthrow new Error("oops");\n'); },
    tasks: [
      { text: '先 git diff 看看改了什么', check: ctx => ran(ctx, /^git diff/) },
      { text: '用 git restore app.js 丢弃修改', check: ctx => repo(ctx).workdir.get('app.js') === 'function main() {\n  return 42;\n}\n' },
      { text: 'git status 确认工作区干净', check: ctx => ran(ctx, /^git status/) && repo(ctx).isClean() },
    ],
    hints: ['git diff', 'git restore app.js', 'git status'],
  });
  LEVELS.push({
    id: 'c2-2', chapter: 2, title: '取消暂存：add 错了文件',
    intro: `<p>你不小心 <code>git add .</code> 把 <code>secret.env</code>（里面有密码）也放进了暂存区。在提交之前把它拿出来：<code>git restore --staged secret.env</code>（或 <code>git reset secret.env</code>）。</p><p>然后把它加进 .gitignore，以免下次再犯。</p>`,
    setup(ctx) { newProject(ctx, { 'app.js': 'console.log(1);\n' }, 'init'); write(ctx, PROJ + '/feature.js', 'export const f = 1;\n'); write(ctx, PROJ + '/secret.env', 'DB_PASSWORD=hunter2\n'); sh(ctx, ['cd ' + PROJ, 'git add .']); },
    tasks: [
      { text: 'git status 看看暂存区里有什么', check: ctx => ran(ctx, /^git status/) },
      { text: '把 secret.env 移出暂存区（文件本身保留）', check: ctx => !repo(ctx).index.has('secret.env') && repo(ctx).workdir.has('secret.env') },
      { text: '把 secret.env 写进 .gitignore', check: ctx => repo(ctx).isIgnored('secret.env') },
      { text: '提交 feature.js 和 .gitignore（不能包含 secret.env）', check: ctx => headFile(ctx, 'feature.js') !== null && headFile(ctx, '.gitignore') !== null && headFile(ctx, 'secret.env') === null },
    ],
    hints: ['git status', 'git restore --staged secret.env', 'echo "secret.env" >> .gitignore', 'git add . && git commit -m "新功能"'],
    feedback(ctx, cmd, res) { if (headFile(ctx, 'secret.env') !== null) return '🚨 密码文件被提交了！如果这是真实项目，即使之后删掉，历史里也永远有它。现在可以 <code>git reset --soft HEAD~1</code> 撤回这次提交，再重做。'; return null; },
  });
  LEVELS.push({
    id: 'c2-3', chapter: 2, title: 'amend：修改上一次提交',
    intro: `<p>刚提交完就发现：提交信息拼错了（"fix bgu"），而且忘了把 test.js 一起提交。</p><p><code>git commit --amend</code> 会用暂存区的内容 + 新信息<b>替换</b>最后一次提交（其实是创建一个新提交、把分支指针挪过去，旧提交还在 reflog 里）。</p><p class="warn">已经 push 出去的提交不要 amend，因为它改写了历史。</p>`,
    setup(ctx) { newProject(ctx, { 'app.js': 'let x = 1;\n' }, 'init'); commit(ctx, { 'app.js': 'let x = 2;\n' }, 'fix bgu'); write(ctx, PROJ + '/test.js', 'assert(x === 2);\n'); },
    tasks: [
      { text: '把 test.js 加入暂存区', check: ctx => repo(ctx).index.has('test.js') || headFile(ctx, 'test.js') !== null },
      { text: 'git commit --amend -m "fix bug"，让最后一次提交包含 test.js 且信息正确', check: ctx => { const r = repo(ctx); return r.subject(r.headHash()) === 'fix bug' && headFile(ctx, 'test.js') !== null && r.commitCount() === 2; } },
      { text: 'git reflog 看看旧的那个提交去哪了', check: ctx => ran(ctx, /^git reflog/) },
    ],
    hints: ['git add test.js', 'git commit --amend -m "fix bug"', 'git reflog'],
    feedback(ctx, cmd, res) { const r = repo(ctx); if (r && r.commitCount() > 2) return '💡 你创建了一个新的提交，而不是修改上一个。要“合并进上一个提交”应该用 <code>--amend</code>。可以 <code>git reset --soft HEAD~1</code> 撤回，再 amend。'; return null; },
  });
  LEVELS.push({
    id: 'c2-4', chapter: 2, title: 'reset 的三种模式',
    intro: `<p><code>git reset &lt;提交&gt;</code> 把当前分支指针挪回去。三种模式决定“暂存区和工作区跟不跟着回去”：</p>
<table class="mini"><tr><th></th><th>分支指针</th><th>暂存区</th><th>工作区</th></tr><tr><td>--soft</td><td>回退</td><td>不动</td><td>不动</td></tr><tr><td>--mixed（默认）</td><td>回退</td><td>回退</td><td>不动</td></tr><tr><td>--hard</td><td>回退</td><td>回退</td><td>回退</td></tr></table>
<p>历史现在是：init → "步骤1" → "步骤2" → "调试代码（不该提交）"。任务：先把"步骤1"和"步骤2"<b>合成一个提交</b>（用 --soft），再用 --hard 彻底丢掉最后那个调试提交。注意顺序：先丢掉调试提交更方便。</p>`,
    setup(ctx) { newProject(ctx, { 'app.js': 'const app = {};\n' }, 'init'); commit(ctx, { 'step1.js': 'step 1\n' }, '步骤1'); commit(ctx, { 'step2.js': 'step 2\n' }, '步骤2'); commit(ctx, { 'debug.js': 'console.log("debug")\n' }, '调试代码（不该提交）'); },
    tasks: [
      { text: '用 git reset --hard HEAD~1 丢掉“调试代码”提交（debug.js 应从工作区消失）', check: ctx => { const r = repo(ctx); return !r.workdir.has('debug.js') && r.subject(r.headHash()) !== '调试代码（不该提交）'; } },
      { text: '用 git reset --soft HEAD~2 回到 init，改动保留在暂存区', check: ctx => { const r = repo(ctx); return (r.subject(r.headHash()) === 'init' && r.index.has('step1.js') && r.index.has('step2.js')) || (r.commitCount() === 2 && headFile(ctx, 'step1.js') !== null && headFile(ctx, 'step2.js') !== null); } },
      { text: '重新提交为一个提交 "完成步骤1和2"（历史应只有 2 个提交）', check: ctx => { const r = repo(ctx); return r.commitCount() === 2 && headFile(ctx, 'step1.js') !== null && headFile(ctx, 'step2.js') !== null && !r.workdir.has('debug.js'); } },
    ],
    hints: ['git reset --hard HEAD~1', 'git reset --soft HEAD~2 然后 git status 看看暂存区', 'git commit -m "完成步骤1和2"'],
    done: `<p>被 reset 掉的提交没有消失，<code>git reflog</code> 里都能看到——下一关就用它救命。</p>`,
  });
  LEVELS.push({
    id: 'c2-5', chapter: 2, title: 'revert：安全地撤销一次提交',
    intro: `<p>历史里有个提交 "把税率改成 50%" 是错的，但它<b>已经推送给同事了</b>。这时不能 reset（会改写公共历史），要用 <code>git revert &lt;提交&gt;</code>：生成一个<b>新的、反向的</b>提交。</p><p>先用 <code>git log --oneline</code> 找到那个提交的哈希。</p>`,
    setup(ctx) { collab(ctx, { 'tax.js': 'export const RATE = 0.13;\n', 'app.js': 'import { RATE } from "./tax";\n' }, 'init'); commit(ctx, { 'tax.js': 'export const RATE = 0.5;\n' }, '把税率改成 50%'); commit(ctx, { 'app.js': 'import { RATE } from "./tax";\nconsole.log(RATE);\n' }, '打印税率'); sh(ctx, ['cd ' + PROJ, 'git push']); },
    tasks: [
      { text: '用 git log 找到 "把税率改成 50%" 的提交', check: ctx => ran(ctx, /^git log/) },
      { text: 'git revert 它（历史里出现 Revert 提交，tax.js 恢复为 0.13，"打印税率"仍然保留）', check: ctx => { const r = repo(ctx); return has(headFile(ctx, 'tax.js'), '0.13') && has(headFile(ctx, 'app.js'), 'console.log') && /^Revert/.test(r.subject(r.headHash())); } },
      { text: 'git push 把撤销推送出去', check: ctx => srv(ctx) && repo(ctx) && srv(ctx).refs.get('refs/heads/main') === repo(ctx).headHash() && /^Revert/.test(repo(ctx).subject(repo(ctx).headHash())) },
    ],
    hints: ['git log --oneline', 'git revert <那个哈希>  （比如 git revert HEAD~1）', 'git push'],
    feedback(ctx, cmd, res) { if (/^git reset/.test(cmd) && res.ok) return '⚠️ reset 改写了历史。因为这个提交已经 push 了，push 会被拒绝（除非强推，那会坑到同事）。这里应该用 revert。你可以 <code>git reset --hard origin/main</code> 回到推送过的状态重来。'; return null; },
  });
  LEVELS.push({
    id: 'c2-6', chapter: 2, title: 'reflog：找回“消失”的提交',
    intro: `<p>灾难现场：你本想 <code>git reset --hard HEAD~1</code>，手抖打成了 <code>HEAD~3</code>，三个提交（登录功能、注册功能、找回密码）全没了，<code>git log</code> 里看不到它们。</p>
<p>但它们还在对象库里！<code>git reflog</code> 记录了 HEAD 的每一次移动。找到 reset 之前 HEAD 指向的提交，再 <code>git reset --hard &lt;那个哈希&gt;</code> 即可。</p>`,
    setup(ctx) { newProject(ctx, { 'app.js': 'const app = {};\n' }, 'init'); commit(ctx, { 'login.js': 'login\n' }, '登录功能'); commit(ctx, { 'signup.js': 'signup\n' }, '注册功能'); commit(ctx, { 'recover.js': 'recover\n' }, '找回密码'); sh(ctx, ['cd ' + PROJ, 'git reset --hard HEAD~3']); },
    tasks: [
      { text: 'git log 确认只剩 init（三个功能不见了）', check: ctx => ran(ctx, /^git log/) },
      { text: 'git reflog 找到 "找回密码" 那个提交的哈希', check: ctx => ran(ctx, /^git reflog/) },
      { text: '把 main 恢复到它（reset --hard 那个哈希）', check: ctx => { const r = repo(ctx); return r.currentBranch() === 'main' && headFile(ctx, 'recover.js') !== null && r.commitCount() === 4; } },
    ],
    hints: ['git log --oneline', 'git reflog  （找 "commit: 找回密码" 那一行前面的哈希）', 'git reset --hard <哈希>   （或 git reset --hard HEAD@{1}）'],
    done: `<p>reflog 只在<b>本地</b>存在（默认 90 天），也只记录提交过的东西。它救不了从未 add 的修改。</p>`,
  });
  LEVELS.push({
    id: 'c2-7', chapter: 2, title: '误删的分支',
    intro: `<p>同事让你删掉没用的 <code>old-experiment</code> 分支，你顺手把 <code>payment</code> 分支也 <code>-D</code> 了（上面有 2 个没合并的提交）。</p><p>分支只是一个指向提交的指针；指针没了，提交还在。用 reflog 找到 payment 最后指向的提交，<code>git branch payment &lt;哈希&gt;</code> 就能把分支“变回来”。</p>`,
    setup(ctx) { newProject(ctx, { 'app.js': 'app\n' }, 'init'); sh(ctx, ['cd ' + PROJ, 'git checkout -b payment']); commit(ctx, { 'pay.js': 'pay v1\n' }, '支付功能 v1'); commit(ctx, { 'pay.js': 'pay v2\n' }, '支付功能 v2'); sh(ctx, ['cd ' + PROJ, 'git checkout -b old-experiment', 'git checkout main', 'git branch -D old-experiment', 'git branch -D payment']); },
    tasks: [
      { text: 'git branch 确认 payment 不见了', check: ctx => ran(ctx, /^git branch\s*$/) },
      { text: '在 git reflog 里找到 "支付功能 v2" 对应的提交', check: ctx => ran(ctx, /^git reflog/) },
      { text: '重建 payment 分支，指向那个提交', check: ctx => { const r = repo(ctx); const t = r.branchTip('payment'); return t && r.fileAt(t, 'pay.js') === 'pay v2\n'; } },
    ],
    hints: ['git branch', 'git reflog', 'git branch payment <哈希>'],
  });

  /* ================= 第 3 章 ================= */
  LEVELS.push({
    id: 'c3-1', chapter: 3, title: '分支：便宜到可以随便开',
    intro: `<p>在原始方案里，“开分支”= <code>cp -r project project_新功能</code>。在 git 里，分支只是 <code>.git/refs/heads/</code> 下的一个 41 字节文件，内容是提交哈希。</p>
<p><code>git switch -c 名字</code>（老写法 <code>git checkout -b</code>）创建并切换过去。<code>HEAD</code> 指向“当前分支”，提交时当前分支的指针跟着前进。</p>`,
    setup(ctx) { newProject(ctx, { 'app.js': 'const app = {};\n' }, 'init'); commit(ctx, { 'app.js': 'const app = { version: 1 };\n' }, 'v1'); },
    tasks: [
      { text: '创建并切换到 feature/dark-mode 分支', check: ctx => repo(ctx).branchTip('feature/dark-mode') !== null },
      { text: '在该分支上新增 theme.css 并提交', check: ctx => { const r = repo(ctx); const t = r.branchTip('feature/dark-mode'); return t && r.fileAt(t, 'theme.css') !== null; } },
      { text: '切回 main，确认 theme.css 不在工作区（ls）', check: ctx => { const r = repo(ctx); return r.currentBranch() === 'main' && !r.workdir.has('theme.css') && r.fileAt('main', 'theme.css') === null && r.branchTip('feature/dark-mode') && r.fileAt(r.branchTip('feature/dark-mode'), 'theme.css') !== null; } },
      { text: '用 git log --oneline --graph --all 看两条分支', check: ctx => ran(ctx, /^git log.*--all/) },
    ],
    hints: ['git switch -c feature/dark-mode', 'echo "body { background: #000 }" > theme.css && git add theme.css && git commit -m "深色主题"', 'git switch main && ls', 'git log --oneline --graph --all'],
  });
  LEVELS.push({
    id: 'c3-2', chapter: 3, title: '快进合并（Fast-forward）',
    intro: `<p>feature 分支从 main 长出来，而 main 之后<b>没有新提交</b>。这时合并不需要创造任何新提交，git 只要把 main 的指针“快进”到 feature 的位置——这叫 <b>fast-forward</b>。</p><p>合并完记得删掉用完的分支（<code>git branch -d</code>，只有已合并的分支才允许用小写 -d 删）。</p>`,
    setup(ctx) { newProject(ctx, { 'app.js': 'const app = {};\n' }, 'init'); sh(ctx, ['cd ' + PROJ, 'git switch -c feature']); commit(ctx, { 'feature.js': 'feature\n' }, '新功能'); commit(ctx, { 'feature.js': 'feature v2\n' }, '新功能完善'); sh(ctx, ['cd ' + PROJ, 'git switch main']); },
    tasks: [
      { text: '在 main 上合并 feature（输出应包含 Fast-forward）', check: ctx => { const r = repo(ctx); return (r.currentBranch() === 'main' && r.branchTip('main') === r.branchTip('feature') && r.fileAt('main', 'feature.js') === 'feature v2\n') || (r.fileAt('main', 'feature.js') === 'feature v2\n' && r.getCommit(r.branchTip('main')).parents.length === 1); } },
      { text: '删除 feature 分支', check: ctx => repo(ctx).branchTip('feature') === null && repo(ctx).fileAt('main', 'feature.js') === 'feature v2\n' },
    ],
    hints: ['git merge feature', 'git branch -d feature'],
    done: `<p>快进合并不产生合并提交，历史是一条直线。如果你想保留“这里曾经有个分支”的痕迹，可以用 <code>git merge --no-ff</code>。</p>`,
  });
  LEVELS.push({
    id: 'c3-3', chapter: 3, title: '三方合并与合并提交',
    intro: `<p>这次 main 和 feature <b>各自都有新提交</b>（分叉了），不能快进。git 会找到两者的<b>共同祖先</b>，做三方比较，然后创建一个有<b>两个父提交</b>的合并提交。</p><p>这两条分支改的是不同文件，所以会自动合并成功。</p>`,
    setup(ctx) { newProject(ctx, { 'app.js': 'const app = {};\n' }, 'init'); sh(ctx, ['cd ' + PROJ, 'git switch -c feature']); commit(ctx, { 'feature.js': 'feature\n' }, '新功能'); sh(ctx, ['cd ' + PROJ, 'git switch main']); commit(ctx, { 'app.js': 'const app = { fixed: true };\n' }, '修复 bug'); },
    tasks: [
      { text: '先用 git log --oneline --graph --all 观察分叉', check: ctx => ran(ctx, /^git log.*--graph/) },
      { text: '在 main 上合并 feature', check: ctx => { const r = repo(ctx); const h = r.branchTip('main'); return h && r.getCommit(h).parents.length === 2 && r.fileAt('main', 'feature.js') !== null && has(r.fileAt('main', 'app.js'), 'fixed'); } },
      { text: '再看一次图，合并提交有两个父提交（git log -1 会显示 Merge: 行）', check: ctx => { const r = repo(ctx); const h = r.branchTip('main'); return h && r.getCommit(h).parents.length === 2 && ctx.world.log.filter(l => l.ok && /^git log/.test(l.line)).length >= 2; } },
    ],
    hints: ['git log --oneline --graph --all', 'git merge feature   （沙盒会自动使用默认合并信息）', 'git log --oneline --graph'],
  });
  LEVELS.push({
    id: 'c3-4', chapter: 3, title: 'detached HEAD：回到过去看看',
    intro: `<p><code>git checkout &lt;提交哈希&gt;</code> 让 HEAD 直接指向一个提交而不是分支——“分离头指针”状态。可以随便看、随便试，但<b>在这里做的提交不属于任何分支</b>，切走以后会“丢”（其实能用 reflog 找回）。</p><p>正确做法：如果想保留实验成果，<code>git switch -c 新分支</code>。</p>`,
    setup(ctx) { newProject(ctx, { 'app.js': 'v1\n' }, 'v1'); commit(ctx, { 'app.js': 'v2\n' }, 'v2'); commit(ctx, { 'app.js': 'v3\n' }, 'v3'); },
    tasks: [
      { text: '检出 "v1" 那个提交（git checkout <哈希> 或 HEAD~2）', check: ctx => ranAny(ctx, /^git (checkout|switch --detach)\s+(HEAD~2|[0-9a-f]{4,})/) },
      { text: '在分离状态下，新建 experiment.js 并提交', check: ctx => { const r = repo(ctx); return r.allCommits().some(c => r.fileAt(c.hash, 'experiment.js') !== null); } },
      { text: '用 git switch -c experiment 把这个提交保存到新分支', check: ctx => { const r = repo(ctx); const t = r.branchTip('experiment'); return t && r.fileAt(t, 'experiment.js') !== null && r.fileAt(t, 'app.js') === 'v1\n'; } },
      { text: '切回 main（app.js 应该又是 v3）', check: ctx => repo(ctx).currentBranch() === 'main' && repo(ctx).workdir.get('app.js') === 'v3\n' && repo(ctx).branchTip('experiment') !== null },
    ],
    hints: ['git log --oneline 找到 v1 的哈希，然后 git checkout <哈希>', 'echo "试验" > experiment.js && git add . && git commit -m "实验"', 'git switch -c experiment', 'git switch main'],
    feedback(ctx, cmd, res) { if (/Warning: you are leaving/.test(res.out || '')) return '⚠️ 看到了吗？git 警告你“正在离开一个不属于任何分支的提交”。它给了你补救命令：<code>git branch &lt;名字&gt; &lt;哈希&gt;</code>。'; return null; },
  });
  LEVELS.push({
    id: 'c3-5', chapter: 3, title: 'rebase：把历史捋直',
    intro: `<p>还是分叉的场景，但这次用 <code>git rebase main</code>（在 feature 上执行）：把 feature 的提交<b>逐个重放</b>到 main 的顶端，得到一条直线历史。然后 main 就可以快进合并 feature。</p>
<p>观察右侧的图：rebase 后 feature 的提交<b>哈希变了</b>——它们是新提交。所以规则是：<b>只 rebase 还没推送给别人的提交</b>。</p>`,
    setup(ctx) { newProject(ctx, { 'app.js': 'const app = {};\n' }, 'init'); sh(ctx, ['cd ' + PROJ, 'git switch -c feature']); commit(ctx, { 'feature.js': 'feature\n' }, '新功能'); commit(ctx, { 'feature.js': 'feature v2\n' }, '完善新功能'); sh(ctx, ['cd ' + PROJ, 'git switch main']); commit(ctx, { 'app.js': 'const app = { fixed: true };\n' }, '修复 bug'); sh(ctx, ['cd ' + PROJ, 'git switch feature']); },
    tasks: [
      { text: '在 feature 分支上执行 git rebase main', check: ctx => { const r = repo(ctx); const f = r.branchTip('feature'), m = r.branchTip('main'); return f && m && r.isAncestor(m, f) && r.fileAt(f, 'feature.js') === 'feature v2\n' && ran(ctx, /^git rebase main/); } },
      { text: '切到 main，快进合并 feature（历史应为一条直线，没有合并提交）', check: ctx => { const r = repo(ctx); const m = r.branchTip('main'); return r.currentBranch() === 'main' && m === r.branchTip('feature') && r.fileAt(m, 'feature.js') === 'feature v2\n' && r.revList([m]).every(h => r.getCommit(h).parents.length < 2); } },
    ],
    hints: ['git rebase main', 'git switch main && git merge feature'],
  });
  LEVELS.push({
    id: 'c3-6', chapter: 3, title: 'cherry-pick：只要那一个提交',
    intro: `<p>同事在 <code>dev</code> 分支上做了很多还没完成的工作，但其中有一个提交 "修复崩溃" 是紧急补丁，需要马上进 main。不能整个合并 dev。</p><p><code>git cherry-pick &lt;哈希&gt;</code> 会把那个提交的改动“复制”一份到当前分支。</p>`,
    setup(ctx) { newProject(ctx, { 'app.js': 'const app = {};\n', 'core.js': 'function run() { crash(); }\n' }, 'init'); sh(ctx, ['cd ' + PROJ, 'git switch -c dev']); commit(ctx, { 'wip.js': 'half done\n' }, '半成品功能 A'); commit(ctx, { 'core.js': 'function run() { safe(); }\n' }, '修复崩溃'); commit(ctx, { 'wip2.js': 'also half done\n' }, '半成品功能 B'); sh(ctx, ['cd ' + PROJ, 'git switch main']); },
    tasks: [
      { text: '用 git log dev --oneline 找到 "修复崩溃" 的哈希', check: ctx => ran(ctx, /^git log/) },
      { text: '在 main 上 cherry-pick 它（core.js 应变为 safe，且 main 上没有 wip.js）', check: ctx => { const r = repo(ctx); return r.currentBranch() === 'main' && has(r.fileAt('main', 'core.js'), 'safe') && r.fileAt('main', 'wip.js') === null && r.fileAt('main', 'wip2.js') === null; } },
    ],
    hints: ['git log dev --oneline', 'git cherry-pick <哈希>'],
    feedback(ctx, cmd, res) { if (repo(ctx).fileAt('main', 'wip.js') !== null) return '⚠️ 半成品也进 main 了——你大概用了 merge。用 <code>git reset --hard HEAD~1</code>（或 reflog）回退，然后只 cherry-pick 那一个提交。'; return null; },
  });
  LEVELS.push({
    id: 'c3-7', chapter: 3, title: 'stash：手头的活先放一放',
    intro: `<p>你在 feature 分支上改到一半（还不想提交），突然要切到 main 修一个紧急 bug。直接切换会被拒绝（改动会被覆盖）或把半成品带过去。</p><p><code>git stash</code> 把工作区/暂存区的改动打包存起来，工作区恢复干净；修完 bug 回来 <code>git stash pop</code> 再取出来。</p>`,
    setup(ctx) { newProject(ctx, { 'app.js': 'const app = {};\n', 'feature.js': '// todo\n' }, 'init'); sh(ctx, ['cd ' + PROJ, 'git switch -c feature']); write(ctx, PROJ + '/feature.js', '// todo\nfunction half() {\n  // 写到一半\n'); write(ctx, PROJ + '/app.js', 'const app = {};\nconst bug = true;\n'); },
    tasks: [
      { text: '试着 git switch main，看看 git 怎么说；然后 git stash', check: ctx => repo(ctx).stash.length >= 1 || ran(ctx, /^git stash pop|^git stash apply/) },
      { text: '切到 main，把 app.js 里的内容改为修复版并提交 "紧急修复"', check: ctx => { const r = repo(ctx); const m = r.branchTip('main'); return m && r.subject(m) === '紧急修复'; } },
      { text: '切回 feature，git stash pop 取回半成品（feature.js 应包含 half）', check: ctx => { const r = repo(ctx); return r.currentBranch() === 'feature' && has(r.workdir.get('feature.js'), 'half') && r.stash.length === 0; } },
    ],
    hints: ['git switch main （注意报错）→ git stash', 'git switch main && echo "const app = { fixed: true };" > app.js && git commit -am "紧急修复"', 'git switch feature && git stash pop'],
  });
  LEVELS.push({
    id: 'c3-8', chapter: 3, title: 'tag：给版本起个名字',
    intro: `<p>分支会随提交移动，标签不会。发布版本时打个标签：<code>git tag -a v1.0 -m "第一个正式版"</code>（附注标签，会创建 tag 对象记录打标签的人和说明）。</p><p>之后 <code>git show v1.0</code>、<code>git diff v1.0 v1.1</code>、<code>git checkout v1.0</code> 都可以直接用名字。</p>`,
    setup(ctx) { newProject(ctx, { 'app.js': 'v1\n' }, 'init'); commit(ctx, { 'app.js': 'v1 final\n' }, '发布准备'); },
    tasks: [
      { text: '给当前提交打附注标签 v1.0', check: ctx => { const r = repo(ctx); const t = r.refs.get('refs/tags/v1.0'); return t && r.getObject(t).type === 'tag'; } },
      { text: '再做一次提交，然后打轻量标签 v1.1（不带 -a）', check: ctx => { const r = repo(ctx); const t = r.refs.get('refs/tags/v1.1'); return t && r.getObject(t).type === 'commit' && t !== r.peel(r.refs.get('refs/tags/v1.0') || ''); } },
      { text: 'git diff v1.0 v1.1 看看两个版本之间的差异', check: ctx => ran(ctx, /^git diff v1\.0 v1\.1|^git diff v1\.1 v1\.0|^git log v1\.0\.\.v1\.1/) },
    ],
    hints: ['git tag -a v1.0 -m "第一个正式版"', 'echo "v1.1" > app.js && git commit -am "小改动" && git tag v1.1', 'git diff v1.0 v1.1'],
  });

  /* ================= 第 4 章 ================= */
  const conflictSetup = ctx => { newProject(ctx, { 'greeting.js': 'export function greet(name) {\n  return "Hello, " + name;\n}\n' }, 'init'); sh(ctx, ['cd ' + PROJ, 'git switch -c feature']); commit(ctx, { 'greeting.js': 'export function greet(name) {\n  return "Hi, " + name + "!";\n}\n' }, '问候语改成 Hi'); sh(ctx, ['cd ' + PROJ, 'git switch main']); commit(ctx, { 'greeting.js': 'export function greet(name) {\n  return "Hello, " + name.trim();\n}\n' }, '去掉名字两端空格'); };
  LEVELS.push({
    id: 'c4-1', chapter: 4, title: '第一次冲突',
    intro: `<p>main 和 feature 都改了 greeting.js 的<b>同一行</b>。git 无法决定要哪个，会在文件里留下标记：</p>
<pre>&lt;&lt;&lt;&lt;&lt;&lt;&lt; HEAD
（你这边的版本）
=======
（对方的版本）
&gt;&gt;&gt;&gt;&gt;&gt;&gt; feature</pre>
<p>解决步骤：① 编辑文件，写成你想要的最终样子（删掉标记）；② <code>git add</code> 告诉 git 已解决；③ <code>git commit</code> 完成合并。</p><p>本关要求最终的问候语是 <code>"Hi, " + name.trim() + "!"</code>（两边的改动都要）。</p>`,
    setup: conflictSetup,
    tasks: [
      { text: 'git merge feature，看到 CONFLICT', check: ctx => ranAny(ctx, /^git merge feature/) },
      { text: 'cat greeting.js 观察冲突标记，然后编辑文件解决（edit greeting.js）', check: ctx => { const c = repo(ctx).workdir.get('greeting.js'); return noMarkers(c) && has(c, 'name.trim()') && has(c, '"Hi, "') && has(c, '"!"'); } },
      { text: 'git add greeting.js 标记已解决，git status 看看提示', check: ctx => !repo(ctx).conflicts.size && repo(ctx).index.has('greeting.js') && (has(repo(ctx).blobContent(repo(ctx).index.get('greeting.js')), 'trim') || repo(ctx).getCommit(repo(ctx).headHash()).parents.length === 2) },
      { text: 'git commit 完成合并（会生成合并提交）', check: ctx => { const r = repo(ctx); const h = r.branchTip('main'); const c = r.fileAt(h, 'greeting.js'); return r.getCommit(h).parents.length === 2 && noMarkers(c) && has(c, 'name.trim()') && has(c, '"Hi, "'); } },
    ],
    hints: ['git merge feature', 'edit greeting.js，把内容改成：\nexport function greet(name) {\n  return "Hi, " + name.trim() + "!";\n}', 'git add greeting.js && git status', 'git commit -m "合并 feature，解决冲突"'],
    feedback(ctx, cmd, res) { if (/^git add/.test(cmd) && res.ok) { const c = repo(ctx).workdir.get('greeting.js'); if (!noMarkers(c)) return '🚨 你 add 了一个还带着 <code>&lt;&lt;&lt;&lt;&lt;&lt;&lt;</code> 标记的文件！git 不会阻止你（它以为你解决了），但这样提交出去代码就坏了。先 <code>edit greeting.js</code> 把标记删掉。'; } return null; },
  });
  LEVELS.push({
    id: 'c4-2', chapter: 4, title: '中止合并 & 直接选一边',
    intro: `<p>合并到一半发现不对劲？<code>git merge --abort</code> 回到合并前的干净状态。</p><p>有时你确定“就要对方那个版本”：<code>git checkout --theirs 文件</code>（或 <code>--ours</code> 要自己的），再 add。</p><p>本关：先 merge 出冲突，abort 掉；再 merge 一次，这次用 --theirs 直接采用 feature 的版本。</p>`,
    setup: conflictSetup,
    tasks: [
      { text: 'git merge feature 出现冲突后，git merge --abort', check: ctx => ran(ctx, /^git merge --abort/) },
      { text: 'git status 确认工作区干净、不在合并状态', check: ctx => ran(ctx, /^git status/) && !repo(ctx).state.merge },
      { text: '再次 merge，用 git checkout --theirs greeting.js 采用 feature 的版本，add 并 commit', check: ctx => { const r = repo(ctx); const h = r.branchTip('main'); return r.getCommit(h).parents.length === 2 && r.fileAt(h, 'greeting.js') === r.fileAt('feature', 'greeting.js'); } },
    ],
    hints: ['git merge feature 然后 git merge --abort', 'git status', 'git merge feature && git checkout --theirs greeting.js && git add greeting.js && git commit -m "采用 feature 版本"'],
  });
  LEVELS.push({
    id: 'c4-3', chapter: 4, title: 'rebase 时的冲突',
    intro: `<p>rebase 是逐个重放提交，所以冲突可能<b>发生好几次</b>。每次：解决 → <code>git add</code> → <code>git rebase --continue</code>。随时可以 <code>git rebase --abort</code> 回到起点。</p><p>注意 rebase 冲突时 <b>HEAD 和 “ours/theirs” 是反的</b>：HEAD 是 main（被 rebase 到的目标），标记下半部分才是你 feature 上的提交。</p><p>要求最终结果同上：<code>"Hi, " + name.trim() + "!"</code>，feature 分支 rebase 到 main 上。</p>`,
    setup(ctx) { conflictSetup(ctx); sh(ctx, ['cd ' + PROJ, 'git switch feature']); },
    tasks: [
      { text: '在 feature 上 git rebase main，遇到冲突', check: ctx => ranAny(ctx, /^git rebase main/) },
      { text: '编辑 greeting.js 解决冲突，git add，git rebase --continue', check: ctx => { const r = repo(ctx); const f = r.branchTip('feature'), m = r.branchTip('main'); const c = r.fileAt(f, 'greeting.js'); return !r.state.rebase && r.isAncestor(m, f) && f !== m && noMarkers(c) && has(c, 'trim()') && has(c, '"Hi, "'); } },
      { text: 'git log --oneline --graph --all 确认历史是直线', check: ctx => ran(ctx, /^git log.*--graph/) && !repo(ctx).state.rebase && repo(ctx).isAncestor(repo(ctx).branchTip('main'), repo(ctx).branchTip('feature')) },
    ],
    hints: ['git rebase main', 'edit greeting.js 改成最终版本 → git add greeting.js → git rebase --continue', 'git log --oneline --graph --all'],
    feedback(ctx, cmd, res) { if (/^git commit/.test(cmd) && repo(ctx).state.rebase) return '💡 rebase 过程中不用 commit，而是 <code>git add</code> 之后 <code>git rebase --continue</code>。'; return null; },
  });
  LEVELS.push({
    id: 'c4-4', chapter: 4, title: '修改/删除冲突',
    intro: `<p>另一种冲突：一边<b>删除</b>了文件，另一边<b>修改</b>了它。git 会说 <code>CONFLICT (modify/delete)</code>。你必须决定：保留（<code>git add 文件</code>）还是删除（<code>git rm 文件</code>）。</p><p>本关剧情：feature 分支把 legacy.js 删了，main 上有人修改了它。团队决定<b>删除</b>它。</p>`,
    setup(ctx) { newProject(ctx, { 'app.js': 'app\n', 'legacy.js': 'old code\n' }, 'init'); sh(ctx, ['cd ' + PROJ, 'git switch -c feature']); commit(ctx, { 'legacy.js': null }, '删除旧代码'); sh(ctx, ['cd ' + PROJ, 'git switch main']); commit(ctx, { 'legacy.js': 'old code\n// 小修改\n' }, '修改旧代码'); },
    tasks: [
      { text: 'git merge feature，观察 modify/delete 冲突', check: ctx => ranAny(ctx, /^git merge feature/) },
      { text: '决定删除：git rm legacy.js', check: ctx => !repo(ctx).conflicts.has('legacy.js') && !repo(ctx).index.has('legacy.js') },
      { text: 'git commit 完成合并（main 上不再有 legacy.js）', check: ctx => { const r = repo(ctx); const h = r.branchTip('main'); return r.getCommit(h).parents.length === 2 && r.fileAt(h, 'legacy.js') === null; } },
    ],
    hints: ['git merge feature', 'git rm legacy.js', 'git commit -m "合并 feature，移除 legacy"'],
  });

  /* ================= 第 5 章 ================= */
  LEVELS.push({
    id: 'c5-1', chapter: 5, title: 'clone：把远程仓库拿到本地',
    intro: `<p>团队的仓库在服务器上：<code>https://github.com/team/project.git</code>（沙盒里它其实是 <code>/srv/git/project.git</code>，一个<b>裸仓库</b>——只有 .git 没有工作区）。</p><p><code>git clone &lt;地址&gt;</code> 会把<b>全部历史</b>复制过来，自动配置一个叫 <code>origin</code> 的远程，并创建本地 main 跟踪 <code>origin/main</code>。</p><p>你的同事小明已经 clone 过一份在 <code>/home/xiaoming/project</code>。右侧“多人”标签可以看到所有仓库。</p>`,
    setup(ctx) { identity(ctx); xmIdentity(ctx); sh(ctx, ['mkdir -p /home/you/seed', 'cd /home/you/seed', 'git init', 'echo "# 团队项目" > README.md', 'echo "console.log(1)" > app.js', 'git add .', 'git commit -m "init"', 'echo "v2" >> app.js', 'git commit -am "第二次提交"', 'git init --bare ' + SRV, 'git remote add origin ' + SRV, 'git push origin main', 'cd /home/you', 'rm -rf /home/you/seed']); ctx.world.remoteAliases['https://github.com/team/project.git'] = SRV; asXm(ctx, ['git clone ' + SRV]); },
    tasks: [
      { text: '在 ~ 目录下 git clone https://github.com/team/project.git', check: ctx => !!repo(ctx) && repo(ctx).headHash() !== null },
      { text: 'cd project，git remote -v 看远程地址', check: ctx => ran(ctx, /^git remote -v/) },
      { text: 'git branch -a 看本地分支和远程跟踪分支（origin/main）', check: ctx => ran(ctx, /^git branch -a/) },
      { text: 'git log --oneline 确认历史完整（2 个提交）', check: ctx => ran(ctx, /^git log/) && repo(ctx).commitCount() === 2 },
    ],
    hints: ['git clone https://github.com/team/project.git', 'cd project && git remote -v', 'git branch -a', 'git log --oneline'],
    done: `<p><code>origin/main</code> 是“我上次看到远程 main 在哪”的<b>本地记录</b>，不会自动更新，要靠 fetch/pull。</p>`,
  });
  LEVELS.push({
    id: 'c5-2', chapter: 5, title: 'push：把提交发布出去',
    intro: `<p>本地提交只在你电脑上。<code>git push</code> 把当前分支的新提交上传，并让远程的 main 指针前移。</p><p>提交前后用 <code>git status</code> 观察 “Your branch is ahead of 'origin/main' by 1 commit” 这句话。</p>`,
    setup(ctx) { collab(ctx, { 'README.md': '# 团队项目\n', 'app.js': 'console.log(1)\n' }); },
    tasks: [
      { text: '新建 hello.js 并提交', check: ctx => headFile(ctx, 'hello.js') !== null },
      { text: 'git status 看到 ahead by 1', check: ctx => ran(ctx, /^git status/) && headFile(ctx, 'hello.js') !== null },
      { text: 'git push，然后 git status 应显示 up to date', check: ctx => srv(ctx).refs.get('refs/heads/main') === repo(ctx).branchTip('main') && headFile(ctx, 'hello.js') !== null },
    ],
    hints: ['echo "hello" > hello.js && git add . && git commit -m "hello"', 'git status', 'git push && git status'],
  });
  LEVELS.push({
    id: 'c5-3', chapter: 5, title: 'fetch 与 pull：拿到别人的提交',
    intro: `<p>小明刚推送了一个提交。你的本地不会自动知道。</p><ul><li><code>git fetch</code>：下载远程的新提交，只更新 <code>origin/main</code>，<b>不碰你的分支和文件</b>。安全，可以先看看。</li><li><code>git pull</code> = fetch + merge（把 origin/main 合进你的 main）。</li></ul>`,
    setup(ctx) { collab(ctx, { 'README.md': '# 团队项目\n', 'app.js': 'console.log(1)\n' }); asXm(ctx, ['echo "小明的功能" > xiaoming.js', 'git add .', 'git commit -m "小明：新增功能"', 'git push']); },
    tasks: [
      { text: 'git fetch，然后 git status（应显示 behind by 1）', check: ctx => ran(ctx, /^git fetch/) && repo(ctx).refs.get('refs/remotes/origin/main') === srv(ctx).branchTip('main') },
      { text: 'git log origin/main --oneline 或 git diff main origin/main 看看小明改了什么', check: ctx => ranAny(ctx, /^git (log|diff|show).*origin\/main/) },
      { text: 'git pull 把它合并进来（这次是快进）', check: ctx => repo(ctx).branchTip('main') === srv(ctx).branchTip('main') && repo(ctx).workdir.has('xiaoming.js') },
    ],
    hints: ['git fetch && git status', 'git log origin/main --oneline', 'git pull'],
  });
  LEVELS.push({
    id: 'c5-4', chapter: 5, title: '被拒绝的 push：先拉再推',
    intro: `<p>你和小明<b>同时</b>基于同一个提交工作。小明先推送了。你的 push 会被拒绝：远程 main 已经不是你出发时的位置，直接推就会把小明的提交覆盖掉，git 不允许。</p>
<p>解决：<code>git pull</code> 把远程的合进来。因为历史分叉了，新版本 git 会要求你明确策略：<code>git pull --no-rebase</code>（合并，产生合并提交）或 <code>git pull --rebase</code>（把你的提交挪到最后，历史干净）。团队一般偏好 rebase。然后再 push。</p>`,
    setup(ctx) { collab(ctx, { 'README.md': '# 团队项目\n', 'app.js': 'console.log(1)\n' }); asXm(ctx, ['echo "小明的功能" > xiaoming.js', 'git add .', 'git commit -m "小明：新增功能"', 'git push']); commit(ctx, { 'you.js': '我的功能\n' }, '我：新增功能'); },
    tasks: [
      { text: 'git push，看到 rejected', check: ctx => ctx.world.log.some(l => /^git push/.test(l.line) && !l.ok) },
      { text: 'git pull --rebase（或 --no-rebase）整合小明的提交', check: ctx => { const r = repo(ctx); return r.isAncestor(srv(ctx).branchTip('main'), r.branchTip('main')) && r.fileAt('main', 'you.js') !== null && r.fileAt('main', 'xiaoming.js') !== null; } },
      { text: '再 push，远程应同时包含你和小明的提交', check: ctx => { const s = srv(ctx); const t = s.branchTip('main'); return s.fileAt(t, 'you.js') !== null && s.fileAt(t, 'xiaoming.js') !== null; } },
    ],
    hints: ['git push', 'git pull --rebase', 'git push'],
    feedback(ctx, cmd, res) { if (/^git push.*(-f|--force)/.test(cmd) && res.ok) return '🚨 你用了强推！小明的提交在远程上被抹掉了（看右侧“多人”标签里服务器的历史）。真实项目里这会让同事丢工作。请点“重置本关”，这次用 pull。'; if (/^git pull\s*$/.test(cmd) && !res.ok) return '💡 这是新版 git 的真实行为：历史分叉时必须选一种策略。<code>git pull --rebase</code> 得到直线历史；<code>git pull --no-rebase</code> 产生合并提交。也可以 <code>git config pull.rebase true</code> 一劳永逸。'; return null; },
  });
  LEVELS.push({
    id: 'c5-5', chapter: 5, title: '协作冲突',
    intro: `<p>这次你和小明改了 <b>config.js 的同一行</b>：小明把超时改成 3000，你改成 5000。pull 时会冲突——和本地分支冲突完全一样的处理方式。</p><p>团队讨论后决定用 <b>5000</b>。解决后 push。</p>`,
    setup(ctx) { collab(ctx, { 'config.js': 'module.exports = {\n  timeout: 1000,\n  retries: 3,\n};\n' }); asXm(ctx, ['printf "module.exports = {\\n  timeout: 3000,\\n  retries: 3,\\n};\\n" > config.js', 'git commit -am "小明：超时改为 3000"', 'git push']); commit(ctx, { 'config.js': 'module.exports = {\n  timeout: 5000,\n  retries: 3,\n};\n' }, '我：超时改为 5000'); },
    tasks: [
      { text: 'git pull --rebase 遇到冲突（也可以 --no-rebase）', check: ctx => ctx.world.log.some(l => /^git pull/.test(l.line) && !l.ok) || repo(ctx).conflicts.size > 0 || repo(ctx).state.rebase || repo(ctx).state.merge },
      { text: '解决冲突：timeout 为 5000，没有标记；git add 后 git rebase --continue（或 git commit）', check: ctx => { const r = repo(ctx); if (r.state.rebase || r.state.merge || r.conflicts.size) return false; const c = r.fileAt('main', 'config.js'); return noMarkers(c) && has(c, 'timeout: 5000') && r.isAncestor(srv(ctx).branchTip('main'), r.branchTip('main')) && r.branchTip('main') !== srv(ctx).branchTip('main'); } },
      { text: 'git push', check: ctx => { const s = srv(ctx); const c = s.fileAt(s.branchTip('main'), 'config.js'); return has(c, 'timeout: 5000') && noMarkers(c); } },
    ],
    hints: ['git pull --rebase', 'edit config.js（timeout: 5000，删掉标记）→ git add config.js → git rebase --continue', 'git push'],
    feedback(ctx, cmd, res) { if (/^git (add|rebase --continue|commit)/.test(cmd)) { const c = repo(ctx).workdir.get('config.js'); if (!noMarkers(c)) return '🚨 config.js 里还有冲突标记，这样提交出去程序会直接语法错误。'; } return null; },
  });
  LEVELS.push({
    id: 'c5-6', chapter: 5, title: '功能分支协作流程',
    intro: `<p>成熟团队不直接在 main 上干活，而是：</p><ol><li>开功能分支 → 提交 → <code>git push -u origin 分支名</code> 推上去（-u 建立跟踪，以后直接 git push）；</li><li>同事 review（沙盒里小明会在你的分支上追加一个提交）；</li><li><code>git pull</code> 拿到同事的补充；</li><li>合并进 main、推送 main；</li><li>删除远程分支 <code>git push origin --delete 分支名</code> 和本地分支。</li></ol>`,
    setup(ctx) { collab(ctx, { 'app.js': 'const app = {};\n' }); },
    tasks: [
      { text: '创建 feature/search 分支，新建 search.js 并提交', check: ctx => { const r = repo(ctx); const t = r.branchTip('feature/search'); return t && r.fileAt(t, 'search.js') !== null; } },
      { text: 'git push -u origin feature/search', check: ctx => srv(ctx).branchTip('feature/search') !== null && repo(ctx).config['branch.feature/search.remote'] === 'origin' },
      { text: '小明已经在你的分支上加了 review 提交（见终端）。git pull 拿到它', check: ctx => { const r = repo(ctx); const t = r.branchTip('feature/search'); return t && r.fileAt(t, 'search.test.js') !== null; } },
      { text: '切到 main 合并 feature/search 并 push main', check: ctx => { const s = srv(ctx); return s.fileAt(s.branchTip('main'), 'search.js') !== null && s.fileAt(s.branchTip('main'), 'search.test.js') !== null; } },
      { text: '删除远程和本地的 feature/search 分支', check: ctx => srv(ctx).branchTip('feature/search') === null && repo(ctx).branchTip('feature/search') === null && srv(ctx).fileAt(srv(ctx).branchTip('main'), 'search.js') !== null },
    ],
    hints: ['git switch -c feature/search && echo "search" > search.js && git add . && git commit -m "搜索功能"', 'git push -u origin feature/search', 'git pull', 'git switch main && git merge feature/search && git push', 'git push origin --delete feature/search && git branch -d feature/search'],
    onCommand(ctx, cmd, res) {
      if (/^git push/.test(cmd) && res.ok && srv(ctx).branchTip('feature/search') && !ctx.state.reviewed) {
        ctx.state.reviewed = true;
        ctx.teammate('小明', ['git fetch', 'git switch feature/search', 'echo "test search" > search.test.js', 'git add .', 'git commit -m "小明：补充测试"', 'git push']);
        return '👀 小明 review 了你的分支，追加了一个提交并推送到 origin/feature/search。';
      }
      return null;
    },
  });
  LEVELS.push({
    id: 'c5-7', chapter: 5, title: '强推的代价与 --force-with-lease',
    intro: `<p>你推送了 "add feature" 之后发现忘了带上测试文件，于是 <code>git commit --amend</code> 把 feature.test.js 补进去了。现在本地和远程分叉，push 被拒绝。你想“这是我自己的提交，覆盖就好”，于是打算 <code>--force</code>。</p><p>但你不知道的是：<b>小明刚刚在远程 main 上又推了一个提交</b>。<code>git push --force</code> 会把它抹掉。</p><p>正确姿势：<code>git push --force-with-lease</code>——只有当远程还是“你上次看到的样子”时才允许覆盖。它会拒绝，你就会发现小明的提交，然后 fetch + rebase 再推（rebase 会把你补的测试文件作为新提交放到小明的提交之后）。</p>`,
    setup(ctx) { collab(ctx, { 'app.js': 'const app = {};\n' }); commit(ctx, { 'feature.js': 'feature\n' }, 'add feature'); sh(ctx, ['cd ' + PROJ, 'git push']); write(ctx, PROJ + '/feature.test.js', 'test feature\n'); sh(ctx, ['cd ' + PROJ, 'git add feature.test.js', 'git commit --amend -m "add feature (with tests)"']); asXm(ctx, ['git pull', 'echo "小明的重要工作" > important.js', 'git add .', 'git commit -m "小明：重要工作"', 'git push']); },
    tasks: [
      { text: 'git push 看到 rejected', check: ctx => ctx.world.log.some(l => /^git push\s*$/.test(l.line) && !l.ok) },
      { text: 'git push --force-with-lease，看它如何保护小明（stale info）', check: ctx => ctx.world.log.some(l => /^git push.*--force-with-lease/.test(l.line) && !l.ok) },
      { text: 'git fetch，git log origin/main --oneline 发现小明的提交；然后 git rebase origin/main', check: ctx => { const r = repo(ctx); return r.fileAt('main', 'important.js') !== null && r.fileAt('main', 'feature.test.js') !== null && r.isAncestor(srv(ctx).branchTip('main'), r.branchTip('main')); } },
      { text: 'git push（现在是快进，不需要强推）。远程应同时有小明的提交和你的测试文件', check: ctx => { const s = srv(ctx); const t = s.branchTip('main'); return s.fileAt(t, 'important.js') !== null && s.fileAt(t, 'feature.test.js') !== null; } },
    ],
    hints: ['git push', 'git push --force-with-lease', 'git fetch && git log origin/main --oneline && git rebase origin/main', 'git push'],
    feedback(ctx, cmd, res) { if (/^git push (-f|--force)(\s|$)/.test(cmd) && res.ok) return '🚨 强推成功了——代价是小明的“重要工作”从远程消失了（看“多人”标签）。真实世界里只能指望小明本地还有。点“重置本关”，这次用 <code>--force-with-lease</code>。'; return null; },
  });

  /* ================= 第 6 章 ================= */
  LEVELS.push({
    id: 'c6-1', chapter: 6, title: '删除文件，以及把它找回来',
    intro: `<p>删除文件有两种：直接 <code>rm</code>（git 看到“deleted”但还没暂存）和 <code>git rm</code>（删除并暂存）。提交后文件从最新快照消失，但<b>历史里永远有它</b>。</p><p>找回：<code>git checkout &lt;还有它的提交&gt; -- 文件</code> 或 <code>git restore --source=&lt;提交&gt; 文件</code>。</p>`,
    setup(ctx) { newProject(ctx, { 'app.js': 'app\n', 'old-module.js': 'very important old logic\n', 'README.md': '# readme\n' }, 'init'); commit(ctx, { 'app.js': 'app v2\n' }, 'v2'); },
    tasks: [
      { text: '用 git rm 删除 old-module.js 并提交 "移除旧模块"', check: ctx => headFile(ctx, 'old-module.js') === null && repo(ctx).commitCount() >= 3 },
      { text: '糟糕，还需要它。用 git log --oneline -- old-module.js 或 git log 找到还有它的提交', check: ctx => ran(ctx, /^git log/) && headFile(ctx, 'old-module.js') === null },
      { text: '从那个提交恢复文件（git checkout HEAD~1 -- old-module.js），并提交 "恢复旧模块"', check: ctx => headFile(ctx, 'old-module.js') === 'very important old logic\n' && repo(ctx).commitCount() >= 4 },
    ],
    hints: ['git rm old-module.js && git commit -m "移除旧模块"', 'git log --oneline', 'git checkout HEAD~1 -- old-module.js && git commit -m "恢复旧模块"'],
  });
  LEVELS.push({
    id: 'c6-2', chapter: 6, title: '拿回某个文件的旧版本',
    intro: `<p>不用回退整个项目，只想要 <code>parser.js</code> 在“v1.0”时候的样子。</p><p><code>git show v1.0:parser.js</code> 打印那个版本的内容；<code>git checkout v1.0 -- parser.js</code> 直接把它放进工作区和暂存区。</p>`,
    setup(ctx) { newProject(ctx, { 'parser.js': 'function parse(s) {\n  return JSON.parse(s);\n}\n', 'app.js': 'app\n' }, 'init'); sh(ctx, ['cd ' + PROJ, 'git tag v1.0']); commit(ctx, { 'parser.js': 'function parse(s) {\n  return eval("(" + s + ")"); // 快但危险\n}\n' }, '用 eval 提速'); commit(ctx, { 'app.js': 'app v3\n' }, '其他改动'); },
    tasks: [
      { text: 'git show v1.0:parser.js 看看旧版本', check: ctx => ran(ctx, /^git show v1\.0:parser\.js/) },
      { text: '把 v1.0 版本的 parser.js 取回工作区（app.js 保持 v3 不动）', check: ctx => has(repo(ctx).workdir.get('parser.js'), 'JSON.parse') && repo(ctx).workdir.get('app.js') === 'app v3\n' },
      { text: '提交 "回退 parser 到安全版本"', check: ctx => has(headFile(ctx, 'parser.js'), 'JSON.parse') && headFile(ctx, 'app.js') === 'app v3\n' && repo(ctx).commitCount() >= 4 },
    ],
    hints: ['git show v1.0:parser.js', 'git checkout v1.0 -- parser.js', 'git commit -m "回退 parser 到安全版本"'],
  });
  LEVELS.push({
    id: 'c6-3', chapter: 6, title: '远程被强推覆盖了，怎么救？',
    intro: `<p>小明误操作 <code>git push --force</code>，把远程 main 回退到了老版本，你昨天推送的提交 "重要功能" 在服务器上没了。</p><p>幸好：<b>你本地的 main 还指着那个提交</b>（git fetch 后 origin/main 会退回去，但你的 main 不会）。只要再 push 一次，就把远程修好了。如果你本地也 pull 过了，还有 reflog。</p>`,
    setup(ctx) { collab(ctx, { 'app.js': 'app\n' }); commit(ctx, { 'feature.js': 'important feature\n' }, '重要功能'); sh(ctx, ['cd ' + PROJ, 'git push']); asXm(ctx, ['git push --force origin main']); },
    tasks: [
      { text: 'git fetch 然后 git status，观察 "have diverged" 或 ahead', check: ctx => ran(ctx, /^git fetch/) && ran(ctx, /^git status/) },
      { text: 'git log --oneline --all 确认你本地 main 仍有 "重要功能"，而 origin/main 没有', check: ctx => ran(ctx, /^git log/) },
      { text: 'git push 把远程修复（这次是快进，不需要 force）', check: ctx => srv(ctx).fileAt(srv(ctx).branchTip('main'), 'feature.js') !== null },
    ],
    hints: ['git fetch && git status', 'git log --oneline --all', 'git push'],
    feedback(ctx, cmd, res) { if (/^git pull/.test(cmd) && res.ok && headFile(ctx, 'feature.js') === null) return '⚠️ pull 把你本地也“回退”了？其实 git 只会快进，不会丢……如果丢了，<code>git reflog</code> 找回。'; return null; },
  });
  LEVELS.push({
    id: 'c6-4', chapter: 6, title: '清理未跟踪的杂物：git clean',
    intro: `<p>构建产生了一堆 <code>dist/</code>、<code>*.tmp</code>，没被跟踪。<code>git clean -n</code> 先<b>预览</b>会删什么，<code>git clean -fd</code> 真删（-d 包含目录）。</p><p class="warn">未跟踪文件从没进过对象库，clean 掉就是真没了。所以一定先 -n。</p>`,
    setup(ctx) { newProject(ctx, { 'app.js': 'app\n', '.gitignore': '*.log\n' }, 'init'); write(ctx, PROJ + '/dist/bundle.js', 'bundle\n'); write(ctx, PROJ + '/cache.tmp', 'tmp\n'); write(ctx, PROJ + '/debug.log', 'log\n'); write(ctx, PROJ + '/notes.md', '我的笔记，要保留！\n'); },
    tasks: [
      { text: 'git status 看看有哪些未跟踪文件', check: ctx => ran(ctx, /^git status/) },
      { text: 'notes.md 要保留：先把它 git add 进暂存区', check: ctx => repo(ctx).index.has('notes.md') || headFile(ctx, 'notes.md') !== null },
      { text: 'git clean -n 预览，再 git clean -fd 删除 dist/ 和 cache.tmp', check: ctx => { const r = repo(ctx); return ran(ctx, /^git clean -n|^git clean --dry-run/) && !r.workdir.has('dist/bundle.js') && !r.workdir.has('cache.tmp') && r.workdir.has('notes.md'); } },
    ],
    hints: ['git status', 'git add notes.md', 'git clean -n && git clean -fd'],
    done: `<p>注意 debug.log 没被删：它被 .gitignore 忽略，clean 默认不动忽略文件（加 -x 才会）。</p>`,
  });

  /* ================= 第 7 章 ================= */
  LEVELS.push({
    id: 'c7-1', chapter: 7, title: 'blame：这行是谁改的？',
    intro: `<p>线上算错税了：<code>tax.js</code> 里税率变成了 0.31。<code>git blame tax.js</code> 逐行显示最后修改它的提交和作者。找到那个提交后用 <code>git show</code> 看完整改动，再用 <code>git revert</code> 撤销它。</p>`,
    setup(ctx) { collab(ctx, { 'tax.js': 'export const RATE = 0.13;\nexport function tax(amount) {\n  return amount * RATE;\n}\n', 'app.js': 'app\n' }); asXm(ctx, ['printf "export const RATE = 0.13;\\nexport function tax(amount) {\\n  return Math.round(amount * RATE * 100) / 100;\\n}\\n" > tax.js', 'git commit -am "小明：税额保留两位小数"', 'git push']); sh(ctx, ['cd ' + PROJ, 'git pull']); commit(ctx, { 'app.js': 'app v2\n' }, '我：更新 app'); asXm(ctx, ['printf "export const RATE = 0.31;\\nexport function tax(amount) {\\n  return Math.round(amount * RATE * 100) / 100;\\n}\\n" > tax.js', 'git commit -am "小明：调整常量"', 'git push']); sh(ctx, ['cd ' + PROJ, 'git pull --rebase']); commit(ctx, { 'app.js': 'app v3\n' }, '我：再更新 app'); sh(ctx, ['cd ' + PROJ, 'git push']); },
    tasks: [
      { text: 'git blame tax.js 找到把 RATE 改成 0.31 的提交', check: ctx => ran(ctx, /^git blame tax\.js/) },
      { text: 'git show <那个提交> 看看它改了什么', check: ctx => { const r = repo(ctx); const bad = r.revList([r.headHash()]).find(h => r.subject(h) === '小明：调整常量'); return ctx.world.log.some(l => l.ok && new RegExp('^git show ' + bad.slice(0, 4)).test(l.line)); } },
      { text: 'git revert 它并 push（tax.js 的 RATE 应恢复 0.13，保留两位小数的逻辑不变）', check: ctx => { const s = srv(ctx); const c = s.fileAt(s.branchTip('main'), 'tax.js'); return has(c, '0.13') && has(c, 'Math.round'); } },
    ],
    hints: ['git blame tax.js', 'git show <哈希>', 'git revert <哈希> && git push'],
  });
  LEVELS.push({
    id: 'c7-2', chapter: 7, title: 'log -S：这段代码什么时候没的？',
    intro: `<p>有人反馈“输入校验没了”。代码里确实找不到 <code>validate(</code> 了。<code>git log -S "validate(" --oneline</code> 会列出<b>增加或删除了这个字符串</b>的提交（pickaxe 搜索）。</p><p>找到删除它的提交后，<code>git show</code> 看细节，再把函数恢复（可以 revert 那个提交，或从它的父提交里取回文件）。</p>`,
    setup(ctx) { newProject(ctx, { 'form.js': 'function validate(input) {\n  return input.length > 0;\n}\nfunction submit(input) {\n  if (!validate(input)) return;\n  send(input);\n}\n', 'app.js': 'app\n' }, 'init'); commit(ctx, { 'app.js': 'app 2\n' }, '改动 1'); commit(ctx, { 'form.js': 'function submit(input) {\n  send(input);\n}\n' }, '简化表单代码'); commit(ctx, { 'app.js': 'app 3\n' }, '改动 3'); commit(ctx, { 'app.js': 'app 4\n' }, '改动 4'); },
    tasks: [
      { text: 'git log -S "validate(" --oneline 找到相关提交', check: ctx => ran(ctx, /^git log.*-S/) },
      { text: 'git show 那个删除了校验的提交', check: ctx => { const r = repo(ctx); const bad = r.revList([r.headHash()]).find(h => r.subject(h) === '简化表单代码'); return ctx.world.log.some(l => l.ok && (new RegExp('^git show ' + bad.slice(0, 4)).test(l.line) || /^git show HEAD~2/.test(l.line))); } },
      { text: '恢复校验逻辑并提交（form.js 需重新包含 validate，app.js 保持 "app 4"）', check: ctx => has(headFile(ctx, 'form.js'), 'validate(input)') && headFile(ctx, 'app.js') === 'app 4\n' },
    ],
    hints: ['git log -S "validate(" --oneline', 'git show <哈希>', 'git revert <哈希>   或   git checkout <哈希>~1 -- form.js && git commit -m "恢复校验"'],
  });
  LEVELS.push({
    id: 'c7-3', chapter: 7, title: 'bisect：二分查找肇事提交',
    intro: `<p>测试 <code>npm test</code> 在最新版本失败，但 v1.0 标签处是好的。中间有 15 个提交，每个都跑一遍太慢。</p>
<p><code>git bisect start</code> → <code>git bisect bad</code>（当前坏）→ <code>git bisect good v1.0</code>。git 会检出中间的提交，你跑 <code>npm test</code>，根据结果 <code>git bisect good</code> 或 <code>bad</code>，4 次左右就能定位。最后 <code>git bisect reset</code> 回到 main。</p>`,
    setup(ctx) {
      newProject(ctx, { 'calc.js': 'export function add(a, b) {\n  return a + b;\n}\nexport function mul(a, b) {\n  return a * b;\n}\n', 'changelog.md': '' }, 'init');
      sh(ctx, ['cd ' + PROJ, 'git tag v1.0']);
      let changelog = '';
      for (let i = 1; i <= 15; i++) {
        const files = {};
        if (i !== 9) { changelog += `- 改动 ${i}\n`; files['changelog.md'] = changelog; }
        if (i === 9) files['calc.js'] = 'export function add(a, b) {\n  return a + b;\n}\nexport function mul(a, b) {\n  return a * b + 1; // 性能优化?\n}\n';
        commit(ctx, files, `日常改动 ${i}`);
      }
      ctx.world.testRunner = (r) => { if (!r) return { out: 'npm ERR! 不在项目目录', ok: false }; const c = r.workdir.get('calc.js') || ''; const ok = c.includes('a * b;'); return { out: ok ? '> test\n\n  ✓ add(2, 3) === 5\n  ✓ mul(2, 3) === 6\n\n2 passing' : '> test\n\n  ✓ add(2, 3) === 5\n  ✗ mul(2, 3) === 6\n    AssertionError: expected 7 to equal 6\n\n1 passing, 1 failing', ok }; };
    },
    tasks: [
      { text: 'npm test 确认当前失败；git bisect start，标记 bad 和 good v1.0', check: ctx => ranAny(ctx, /^npm test|^make test/) && ran(ctx, /^git bisect (good|bad)/) },
      { text: '反复 npm test + git bisect good/bad，直到 git 报告 "is the first bad commit"（应是 "日常改动 9"）', check: ctx => { const r = repo(ctx); const st = r.state.bisect; const bad = r.revList([r.branchTip('main')]).find(h => r.subject(h) === '日常改动 9'); return (st && st.found === bad) || ctx.state.found === bad; } },
      { text: 'git bisect reset 回到 main，然后 git revert 那个提交，npm test 通过', check: ctx => { const r = repo(ctx); return !r.state.bisect && r.currentBranch() === 'main' && has(r.fileAt('main', 'calc.js'), 'a * b;') && r.subject(r.headHash()).startsWith('Revert'); } },
    ],
    hints: ['npm test（失败）→ git bisect start → git bisect bad → git bisect good v1.0', '每一步：npm test → 通过就 git bisect good，失败就 git bisect bad', 'git bisect reset && git revert <肇事提交> && npm test'],
    onCommand(ctx, cmd, res) { const r = repo(ctx); if (r && r.state.bisect && r.state.bisect.found) ctx.state.found = r.state.bisect.found; return null; },
  });
  LEVELS.push({
    id: 'c7-4', chapter: 7, title: '两个版本之间到底改了什么？',
    intro: `<p>发布 v2.0 前要写发布说明。用范围语法：<code>git log v1.0..v2.0 --oneline</code> 列出 v1.0 之后到 v2.0 的所有提交；<code>git diff v1.0 v2.0 --stat</code> 看改了哪些文件；<code>git log --author=小明</code> 筛选作者。</p>`,
    setup(ctx) { collab(ctx, { 'app.js': 'app\n', 'README.md': 'readme\n' }); sh(ctx, ['cd ' + PROJ, 'git tag v1.0']); asXm(ctx, ['echo "search" > search.js', 'git add .', 'git commit -m "小明：搜索功能"', 'git push']); sh(ctx, ['cd ' + PROJ, 'git pull']); commit(ctx, { 'app.js': 'app v2\n' }, '我：重构 app'); commit(ctx, { 'README.md': 'readme v2\n' }, '我：更新文档'); sh(ctx, ['cd ' + PROJ, 'git tag v2.0', 'git push', 'git push --tags']); },
    tasks: [
      { text: 'git log v1.0..v2.0 --oneline', check: ctx => ran(ctx, /^git log v1\.0\.\.v2\.0/) },
      { text: 'git diff v1.0 v2.0 --stat', check: ctx => ran(ctx, /^git diff v1\.0 v2\.0 --stat|^git diff --stat v1\.0 v2\.0/) },
      { text: 'git log --author=小明 --oneline 看小明的贡献', check: ctx => ran(ctx, /^git log.*--author/) },
      { text: '把发布说明写进 RELEASE.md（包含“搜索”二字）并提交', check: ctx => has(headFile(ctx, 'RELEASE.md'), '搜索') },
    ],
    hints: ['git log v1.0..v2.0 --oneline', 'git diff v1.0 v2.0 --stat', 'git log --author=小明 --oneline', 'echo "v2.0: 新增搜索功能，重构 app" > RELEASE.md && git add . && git commit -m "发布说明"'],
  });

  /* ================= 第 8 章：沙盒 ================= */
  LEVELS.push({
    id: 'sandbox', chapter: 8, title: '自由沙盒',
    intro: `<p>这里有：你的仓库 <code>~/project</code>、服务器上的 <code>origin</code>、小明（<code>/home/xiaoming/project</code>）和小红（<code>/home/xiaohong/project</code>）的克隆。</p><p>右侧“多人”标签里的按钮可以让同事做事（推送提交、制造冲突、强推……）。你也可以 <code>cd /home/xiaoming/project</code> 亲自扮演小明。</p><p>随便折腾，随时点“重置本关”。</p>`,
    sandbox: true,
    setup(ctx) { collab(ctx, { 'README.md': '# 团队项目\n', 'app.js': 'const app = {};\n', 'config.js': 'module.exports = { port: 3000 };\n' }); xhIdentity(ctx); asXh(ctx, ['git clone ' + SRV]); ctx.world.testRunner = r => ({ out: r ? '所有测试通过 ✓' : '不在项目目录', ok: !!r }); },
    tasks: [{ text: '没有固定目标。想练什么练什么。', check: () => false }],
    hints: ['git log --oneline --graph --all', '试试让小明推送后再 git push，看看拒绝信息'],
    actions: [
      { label: '小明：推送一个新文件', run: ctx => { ctx.state.n = (ctx.state.n || 0) + 1; ctx.teammate('小明', ['git pull --no-rebase', `echo "小明的第 ${ctx.state.n} 个文件" > xm${ctx.state.n}.js`, 'git add .', `git commit -m "小明：新增 xm${ctx.state.n}.js"`, 'git push']); } },
      { label: '小明：修改 config.js 并推送（制造冲突）', run: ctx => { ctx.state.p = (ctx.state.p || 4000) + 1; ctx.teammate('小明', ['git pull --no-rebase', `echo "module.exports = { port: ${ctx.state.p} };" > config.js`, `git commit -am "小明：端口改为 ${ctx.state.p}"`, 'git push']); } },
      { label: '小红：在 feature/report 分支推送', run: ctx => { ctx.teammate('小红', ['git fetch', 'git switch feature/report 2>/dev/null || git switch -c feature/report', 'echo "report" >> report.js', 'git add .', 'git commit -m "小红：报表功能"', 'git push -u origin feature/report']); } },
      { label: '小明：强推回退远程 main（危险操作）', run: ctx => { ctx.teammate('小明', ['git fetch', 'git reset --hard origin/main~1', 'git push --force']); } },
      { label: '小明：删除远程 feature/report', run: ctx => { ctx.teammate('小明', ['git push origin --delete feature/report']); } },
    ],
  });

  global.GitLevels = { LEVELS, CHAPTERS, PROJ, SRV, XM };
})(typeof window !== 'undefined' ? window : globalThis);
