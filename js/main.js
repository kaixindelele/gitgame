/* 应用主逻辑：关卡加载、命令执行、反馈、面板刷新、进度保存 */
(function () {
  'use strict';
  const { LEVELS, CHAPTERS, PROJ } = window.GitLevels;
  const { Terminal, renderGraph, commitDetailHtml, renderTrees, renderMulti, esc, $ } = window.GitUI;
  const STORAGE = 'gitgame.progress.v1';

  const app = {
    world: null, level: null, ctx: null, sticky: [], hintsShown: 0, completed: {}, term: null, lastTrace: [], lastArgv: null, selectedCommit: null,
  };

  function loadProgress() { try { const p = JSON.parse(localStorage.getItem(STORAGE) || '{}'); app.completed = p.completed || {}; return p.current; } catch (e) { return null; } }
  function saveProgress() { try { localStorage.setItem(STORAGE, JSON.stringify({ completed: app.completed, current: app.level && app.level.id })); } catch (e) { } }

  /* ---------- 关卡 ---------- */
  function makeCtx(world) {
    const ctx = { world, state: {}, teammate: null };
    ctx.teammate = (who, lines) => {
      const user = who === '小明' ? 'xiaoming' : who === '小红' ? 'xiaohong' : who;
      const home = '/home/' + user;
      for (const l of lines) {
        const cwd = world.repoAt(home + '/project') ? home + '/project' : home;
        const r = world.runAs(user, cwd, l);
        app.term.echoCommand(`${who} @ ${cwd.replace('/home/' + user, '~')} $ `, l, 't-mate');
        const brief = (r.out || '').split('\n').slice(0, 3).join('\n');
        if (brief) app.term.append(brief + ((r.out || '').split('\n').length > 3 ? '\n…' : ''), 't-mate');
        if (r.err) app.term.append(r.err.split('\n').slice(0, 3).join('\n'), 't-mate');
      }
      refreshPanels();
    };
    return ctx;
  }
  function loadLevel(id) {
    const level = LEVELS.find(l => l.id === id) || LEVELS[0];
    app.level = level;
    window.GitCore.setClock(Date.UTC(2026, 0, 5, 1, 0, 0));
    app.world = new window.GitShell.World();
    app.ctx = makeCtx(app.world);
    level.setup(app.ctx);
    app.world.log = [];
    app.world.cwd = app.world.repoAt(PROJ) ? PROJ : '/home/you';
    if (level.id === 'c1-1' || level.id === 'c0-1' || level.id === 'c0-2' || level.id === 'c5-1') app.world.cwd = '/home/you';
    app.sticky = level.tasks.map(() => false);
    app.hintsShown = 0; app.lastTrace = []; app.lastArgv = null; app.selectedCommit = null;
    app.term.clear();
    app.term.append(`=== ${level.title} ===`, 't-info');
    app.term.append(`当前目录：${app.world.cwd}   （输入 help 查看命令；点右上角 ↺ 可重置本关）`, 't-info');
    renderLesson();
    refreshPanels();
    saveProgress();
    app.term.input.focus();
  }
  function renderLesson() {
    const lv = app.level; const ch = CHAPTERS[lv.chapter];
    $('#chapter-name').textContent = ch.title;
    $('#level-title').textContent = `${LEVELS.indexOf(lv) + 1}. ${lv.title}`;
    $('#level-intro').innerHTML = lv.intro;
    $('#hint-list').innerHTML = '';
    $('#hint-count').textContent = `（${lv.hints.length} 条）`;
    $('#feedback-box').innerHTML = '<span class="muted">执行命令后，这里会给出针对性的提示和纠正。</span>';
    $('#level-done').classList.add('hidden');
    $('#btn-prev').disabled = LEVELS.indexOf(lv) === 0;
    $('#btn-next').disabled = LEVELS.indexOf(lv) === LEVELS.length - 1;
    renderTasks();
    const done = Object.keys(app.completed).filter(k => LEVELS.some(l => l.id === k && !l.sandbox)).length;
    $('#progress-text').textContent = `已完成 ${done} / ${LEVELS.filter(l => !l.sandbox).length} 关`;
    const act = $('#multi-actions');
    act.innerHTML = '';
    if (lv.actions) for (const a of lv.actions) { const b = document.createElement('button'); b.textContent = a.label; b.addEventListener('click', () => { a.run(app.ctx); refreshPanels(); evaluate(''); }); act.appendChild(b); }
  }
  function renderTasks() {
    const ol = $('#task-list');
    ol.innerHTML = app.level.tasks.map((t, i) => `<li class="${app.sticky[i] ? 'done' : ''}">${esc(t.text)}</li>`).join('');
  }
  function evaluate(cmd, res) {
    const lv = app.level;
    let newly = [];
    lv.tasks.forEach((t, i) => { if (!app.sticky[i]) { let ok = false; try { ok = !!t.check(app.ctx); } catch (e) { ok = false; } if (ok) { app.sticky[i] = true; newly.push(i); } } });
    renderTasks();
    if (newly.length && !lv.sandbox) addFeedback(`✅ 完成任务 ${newly.map(i => i + 1).join('、')}`, 'good');
    if (!lv.sandbox && app.sticky.every(Boolean)) {
      if (!app.completed[lv.id]) { app.completed[lv.id] = true; saveProgress(); toast('🎉 本关完成！'); }
      const d = $('#level-done'); d.innerHTML = `<b>🎉 本关完成！</b>${lv.done || ''}<div style="margin-top:8px"><button id="btn-next-inline" class="primary">下一关 →</button></div>`; d.classList.remove('hidden');
      const b = $('#btn-next-inline'); if (b) b.addEventListener('click', nextLevel);
      $('#progress-text').textContent = `已完成 ${Object.keys(app.completed).length} / ${LEVELS.filter(l => !l.sandbox).length} 关`;
    }
  }
  function nextLevel() { const i = LEVELS.indexOf(app.level); if (i < LEVELS.length - 1) loadLevel(LEVELS[i + 1].id); }
  function prevLevel() { const i = LEVELS.indexOf(app.level); if (i > 0) loadLevel(LEVELS[i - 1].id); }

  /* ---------- 反馈（通用纠错） ---------- */
  const GENERAL_FEEDBACK = [
    { test: (c, r) => /not a git repository/.test(r.err), msg: '💡 你不在 git 仓库目录里。用 <code>cd</code> 进入项目目录（例如 <code>cd project</code>）再试。' },
    { test: (c, r) => /Please tell me who you are/.test(r.err), msg: '💡 git 需要知道提交人是谁：<code>git config --global user.name "名字"</code> 和 <code>git config --global user.email "邮箱"</code>。这会写进每一个提交里。' },
    { test: (c, r) => /^git commit/.test(c) && /no changes added to commit/.test(r.err), msg: '💡 改动还在工作区，没进暂存区。先 <code>git add 文件</code>（或 <code>git add .</code>），再 commit。可以看右侧“三棵树”里哪一列不一样。', cls: 'warn' },
    { test: (c, r) => /^git commit/.test(c) && /nothing to commit, working tree clean/.test(r.err), msg: '💡 没有任何改动可提交。工作区、暂存区、HEAD 三者完全一致。' },
    { test: (c, r) => /^git commit/.test(c) && /pathspec '.*' did not match/.test(r.err), msg: '💡 提交信息里有空格时要加引号：<code>git commit -m "fix bug"</code>。不加引号的话 git 会把 <code>bug</code> 当成文件名。', cls: 'warn' },
    { test: (c, r) => /detached HEAD' state/.test(r.out), msg: '💡 你现在处于 <b>detached HEAD</b>：HEAD 直接指向一个提交而不是分支。在这里提交不会推进任何分支；想保留成果就 <code>git switch -c 新分支名</code>，想回去就 <code>git switch main</code>。', cls: 'warn' },
    { test: (c, r) => /Automatic merge failed/.test(r.err), msg: '⚠️ <b>合并冲突</b>。git 已经把能自动合并的都合并了，剩下的写进了文件里，用 <code>&lt;&lt;&lt;&lt;&lt;&lt;&lt;</code>/<code>=======</code>/<code>&gt;&gt;&gt;&gt;&gt;&gt;&gt;</code> 标出两边的版本。步骤：<code>cat 文件</code> 看 → <code>edit 文件</code> 改成最终版本（删掉标记）→ <code>git add 文件</code> → <code>git commit</code>。后悔了就 <code>git merge --abort</code>。', cls: 'warn' },
    { test: (c, r) => /could not apply .* \n?hint: Resolve all conflicts/.test(r.err) || (/^git rebase/.test(c) && /CONFLICT/.test(r.err)), msg: '⚠️ rebase 过程中发生冲突。解决后用 <code>git add 文件</code> + <code>git rebase --continue</code>（不是 commit）。放弃用 <code>git rebase --abort</code>。', cls: 'warn' },
    { test: (c, r) => /\[rejected\].*non-fast-forward/.test(r.err), msg: '⛔ push 被拒绝（non-fast-forward）：远程分支上有你本地没有的提交，直接推会覆盖别人的工作。先 <code>git pull --rebase</code>（或 <code>--no-rebase</code>）把远程合进来，再 push。', cls: 'bad' },
    { test: (c, r) => /\[rejected\].*fetch first/.test(r.err), msg: '⛔ push 被拒绝（fetch first）：远程有新提交，你还没拿到。<code>git fetch</code> 看看，然后 <code>git pull --rebase</code> 再 push。', cls: 'bad' },
    { test: (c, r) => /Need to specify how to reconcile divergent branches/.test(r.err), msg: '💡 历史分叉了，新版 git 要你明确选择：<code>git pull --rebase</code>（你的提交挪到最后，历史是直线）或 <code>git pull --no-rebase</code>（生成合并提交）。想一劳永逸：<code>git config pull.rebase true</code>。', cls: 'warn' },
    { test: (c, r) => /has no upstream branch/.test(r.err), msg: '💡 这个分支还没告诉 git “推到远程的哪个分支”。第一次推用 <code>git push -u origin 分支名</code>，之后就可以直接 <code>git push</code>。' },
    { test: (c, r) => /Your local changes to the following files would be overwritten/.test(r.err), msg: '💡 切换/合并会覆盖你没提交的修改，git 拒绝了。三个选择：<code>git commit</code> 提交它、<code>git stash</code> 先存起来、或 <code>git restore 文件</code> 丢弃它。', cls: 'warn' },
    { test: (c, r) => /not fully merged/.test(r.err), msg: '💡 这个分支上有还没合并进当前分支的提交，<code>-d</code> 拒绝删除以防丢失。确定不要了就用 <code>-D</code>。', cls: 'warn' },
    { test: (c, r) => /is not a git command/.test(r.err), msg: '💡 没有这个 git 子命令，检查拼写。<code>git help</code> 列出沙盒支持的命令。' },
    { test: (c, r) => /command not found/.test(r.err), msg: '💡 这不是沙盒支持的 shell 命令。输入 <code>help</code> 查看列表。' },
    { test: (c, r) => /Warning: you are leaving .* behind/.test(r.out), msg: '⚠️ 你离开了一个不属于任何分支的提交。它还在（reflog 里能找到），但不会出现在 git log 里。想保留就按 git 提示的 <code>git branch 名字 哈希</code>。', cls: 'warn' },
    { test: (c, r) => /^git push .*(-f\b|--force\b)/.test(c) && r.ok && /forced update/.test(r.out), msg: '⚠️ 你强推了。远程分支被你的版本<b>覆盖</b>，如果别人在这期间推过提交，那些提交在远程上就消失了。多人协作时用 <code>--force-with-lease</code> 更安全。', cls: 'bad' },
    { test: (c, r) => /^git reset --hard/.test(c) && r.ok, msg: '💡 <code>reset --hard</code> 丢弃了工作区和暂存区的修改（未提交的部分找不回来）；被甩掉的提交还在 <code>git reflog</code> 里。' },
    { test: (c, r) => /Successfully rebased/.test(r.out), msg: '✅ rebase 完成。注意右侧提交图：被重放的提交<b>哈希变了</b>——它们是新提交。所以已推送的提交不要 rebase。', cls: 'good' },
    { test: (c, r) => /is the first bad commit/.test(r.out), msg: '🎯 bisect 找到了肇事提交！用 <code>git show 哈希</code> 看它改了什么，<code>git bisect reset</code> 回到原分支，再用 <code>git revert</code> 撤销它。', cls: 'good' },
    { test: (c, r) => /Saved working directory/.test(r.out), msg: '💡 改动被存进 stash（本质是一个挂在 refs/stash 上的提交，看提交图里的 stash 标记）。<code>git stash list</code> 查看，<code>git stash pop</code> 取回。' },
    { test: (c, r) => /^rm -rf? .*\.git\b/.test(c) && r.ok, msg: '🚨 你删除了 <code>.git</code> 目录——<b>整个历史没了</b>，只剩当前工作区文件。这是 git 唯一救不回来的操作（除非远程或同事那里有副本）。', cls: 'bad' },
  ];
  function addFeedback(html, cls = '') {
    const box = $('#feedback-box');
    if (box.querySelector('.muted')) box.innerHTML = '';
    const d = document.createElement('div'); d.className = 'fb ' + cls; d.innerHTML = html;
    box.prepend(d);
    while (box.children.length > 4) box.removeChild(box.lastChild);
  }
  function toast(text) { const t = document.createElement('div'); t.className = 'toast'; t.textContent = text; document.body.appendChild(t); setTimeout(() => t.remove(), 2600); }

  /* ---------- 命令执行 ---------- */
  function runCommand(line) {
    const world = app.world;
    app.term.echoCommand(world.prompt(), line);
    if (!line.trim()) return;
    const res = world.exec(line, { editor: openCommitEditor });
    for (const a of (res.actions || [])) {
      if (a.type === 'clear') app.term.clear();
      if (a.type === 'edit') openFileEditor(a.path, a.content);
    }
    if (res.out) app.term.append(res.out, 't-out');
    if (res.err) app.term.append(res.err, 't-err');
    app.lastTrace = res.traces || [];
    const first = line.trim().split(/\s+/);
    app.lastArgv = first;
    // 反馈
    let fbs = [];
    for (const f of GENERAL_FEEDBACK) { try { if (f.test(line.trim(), res)) fbs.push([f.msg, f.cls || '']); } catch (e) { } }
    if (app.level.feedback) { try { const m = app.level.feedback(app.ctx, line.trim(), res); if (m) fbs.push([m, 'warn']); } catch (e) { } }
    if (app.level.onCommand) { try { const m = app.level.onCommand(app.ctx, line.trim(), res); if (m) { app.term.append(m, 't-info'); fbs.push([m, '']); } } catch (e) { console.error(e); } }
    const markerFiles = [];
    const cur = world.currentRepo();
    if (cur && /^git (add|commit|rebase --continue)/.test(line.trim()) && res.ok) for (const [p, c] of cur.repo.workdir) if (cur.repo.index.has(p) && /^(<<<<<<<|=======|>>>>>>>)/m.test(c) && !cur.repo.conflicts.has(p)) markerFiles.push(p);
    if (markerFiles.length && !fbs.some(f => /标记/.test(f[0]))) fbs.push([`🚨 ${markerFiles.join(', ')} 里还有冲突标记（<code>&lt;&lt;&lt;&lt;&lt;&lt;&lt;</code>），git 不会拦你，但提交出去就是坏代码。先编辑文件删掉标记。`, 'bad']);
    for (const [m, c] of fbs.reverse()) addFeedback(m, c);
    evaluate(line.trim(), res);
    refreshPanels();
  }
  function completions(v) {
    const world = app.world;
    const parts = v.split(' ');
    const cur = world.currentRepo();
    if (parts.length === 1) return ['git', 'ls', 'cat', 'cd', 'echo', 'edit', 'cp', 'rm', 'mv', 'mkdir', 'diff', 'du', 'tree', 'grep', 'sed', 'touch', 'help', 'clear', 'npm', 'pwd', 'history'];
    if (parts[0] === 'git' && parts.length === 2) return Object.keys(window.GitCmd.commands).concat(['init', 'clone']).sort();
    const cands = [];
    if (parts[0] === 'git' && cur) { cands.push(...cur.repo.branches(), ...cur.repo.tags(), ...cur.repo.remoteRefs(), 'HEAD', 'origin'); if (parts[1] === 'checkout' || parts[1] === 'restore' || parts[1] === 'add' || parts[1] === 'rm' || parts[1] === 'diff' || parts[1] === 'blame' || parts[1] === 'log' || parts[1] === 'show') cands.push(...cur.repo.workdir.keys(), ...cur.repo.index.keys()); }
    try { for (const e of world.listDir(world.cwd, { all: false })) cands.push(e.name + (e.type === 'dir' ? '/' : '')); } catch (e) { }
    const last = parts[parts.length - 1];
    if (last.includes('/') && !last.startsWith('-')) { const dir = last.slice(0, last.lastIndexOf('/')); try { for (const e of world.listDir(world.resolve(dir))) cands.push(dir + '/' + e.name + (e.type === 'dir' ? '/' : '')); } catch (e) { } }
    return [...new Set(cands)];
  }

  /* ---------- 面板 ---------- */
  function refreshPanels() {
    const world = app.world;
    app.term.setPrompt(world.prompt());
    const cur = world.currentRepo();
    const repo = cur ? cur.repo : (world.repoAt(PROJ) || null);
    // 图
    const legend = $('#graph-legend');
    if (repo) { legend.innerHTML = `<span>仓库：<code>${esc(repo.path)}</code></span><span class="pill" style="background:#2e6b45;color:#c8ffd9">HEAD</span><span class="pill" style="background:#24384f;color:#9cd1ff">分支</span><span class="pill" style="background:#4a3a5a;color:#e5c8ff">远程跟踪</span><span class="pill" style="background:#5a4a1e;color:#ffe08a">标签</span><span>◯ 合并提交 · 点击提交看详情</span>`; renderGraph($('#graph-svg'), repo, { onSelect: h => { app.selectedCommit = h; showCommitDetail(); } }); }
    else { legend.innerHTML = '<span class="muted">当前目录不是 git 仓库（git init 或 cd 进一个仓库后这里会显示提交图）</span>'; $('#graph-svg').innerHTML = ''; }
    showCommitDetail();
    // 三棵树
    renderTrees(repo, $('#trees-summary'), $('#trees-table'), p => openFileEditor(repo.path + '/' + p, repo.workdir.get(p)));
    // 原理对比
    const card = $('#analogy-card');
    const ex = app.lastArgv ? window.GitAnalogy.explain(app.lastArgv, app.lastTrace, repo) : null;
    if (ex) card.innerHTML = `<h4>$ ${esc(app.lastArgv.join(' '))}</h4><div class="row git"><b class="lbl">git 在底层做了什么</b>${ex.git}${ex.trace ? '<div class="muted small" style="margin-top:4px">这次实际发生的：</div>' + ex.trace : ''}</div>${ex.folder ? `<div class="row folder"><b class="lbl">如果用“复制文件夹”的原始办法</b>${ex.folder}</div>` : ''}${ex.diff ? `<div class="row diff"><b class="lbl">差别在哪</b>${ex.diff}</div>` : ''}`;
    $('#snapshots').innerHTML = repo && !repo.bare ? window.GitAnalogy.snapshotsHtml(repo) : '<p class="muted">（没有仓库）</p>';
    // 多人
    renderMulti(world, $('#multi-repos'), repo);
  }
  function showCommitDetail() {
    const box = $('#commit-detail');
    const cur = app.world.currentRepo(); const repo = cur ? cur.repo : app.world.repoAt(PROJ);
    if (!app.selectedCommit || !repo || !repo.hasObject(app.selectedCommit)) { box.classList.add('hidden'); return; }
    box.classList.remove('hidden'); box.innerHTML = commitDetailHtml(repo, app.selectedCommit);
  }

  /* ---------- 编辑器 ---------- */
  let editorState = null;
  function openFileEditor(absPath, content) {
    editorState = { kind: 'file', path: absPath };
    $('#editor-title').textContent = absPath;
    $('#editor-text').value = content == null ? '' : content;
    $('#editor-modal').classList.remove('hidden');
    setTimeout(() => $('#editor-text').focus(), 0);
  }
  function openCommitEditor(opts) {
    editorState = { kind: 'commit', onSave: opts.onSave };
    $('#editor-title').textContent = opts.title;
    $('#editor-text').value = opts.content;
    $('#editor-modal').classList.remove('hidden');
    setTimeout(() => { const t = $('#editor-text'); t.focus(); t.setSelectionRange(0, 0); }, 0);
  }
  function saveEditor() {
    if (!editorState) return;
    const text = $('#editor-text').value;
    $('#editor-modal').classList.add('hidden');
    if (editorState.kind === 'file') {
      try { app.world.writeFile(editorState.path, text); app.term.append(`（已保存 ${editorState.path}）`, 't-info'); } catch (e) { app.term.append(e.message, 't-err'); }
      refreshPanels(); evaluate('', {});
    } else { const out = editorState.onSave(text); if (out) app.term.append(out, /^Aborting|^error|^fatal/.test(out) ? 't-err' : 't-out'); refreshPanels(); evaluate('git commit', { ok: true, out }); }
    editorState = null; app.term.input.focus();
  }
  function cancelEditor() { $('#editor-modal').classList.add('hidden'); if (editorState && editorState.kind === 'commit') app.term.append('Aborting commit due to empty commit message.', 't-err'); editorState = null; app.term.input.focus(); }

  /* ---------- 关卡列表 / 速查 ---------- */
  function renderLevelsModal() {
    const list = $('#levels-list');
    list.innerHTML = CHAPTERS.map(ch => `<div class="lv-chapter">${esc(ch.title)}<span class="desc">${esc(ch.desc)}</span></div>` + LEVELS.filter(l => l.chapter === ch.id).map(l => `<div class="lv-item ${l === app.level ? 'current' : ''}" data-id="${l.id}"><span class="mark">${app.completed[l.id] ? '✓' : ''}</span><span>${LEVELS.indexOf(l) + 1}. ${esc(l.title)}</span></div>`).join('')).join('');
    list.querySelectorAll('.lv-item').forEach(el => el.addEventListener('click', () => { $('#levels-modal').classList.add('hidden'); loadLevel(el.dataset.id); }));
  }
  const CHEAT = `
<h4>三棵树</h4><div><code>git status</code> 状态 · <code>git add 文件</code> 放入暂存区 · <code>git commit -m "说明"</code> 提交 · <code>git diff</code> / <code>git diff --staged</code> 差异 · <code>git log --oneline --graph --all</code> 历史图</div>
<h4>撤销</h4><div><code>git restore 文件</code> 丢弃工作区修改 · <code>git restore --staged 文件</code> 取消暂存 · <code>git commit --amend</code> 改上次提交 · <code>git reset --soft/--mixed/--hard 提交</code> · <code>git revert 提交</code> 反向提交 · <code>git reflog</code> 找回一切</div>
<h4>分支</h4><div><code>git switch -c 名字</code> 建并切 · <code>git switch 名字</code> · <code>git branch -d 名字</code> · <code>git merge 分支</code> · <code>git rebase 分支</code> · <code>git cherry-pick 提交</code> · <code>git stash</code> / <code>git stash pop</code> · <code>git tag -a v1.0 -m "说明"</code></div>
<h4>冲突</h4><div>编辑文件删掉 <code>&lt;&lt;&lt;&lt;&lt;&lt;&lt; ======= &gt;&gt;&gt;&gt;&gt;&gt;&gt;</code> → <code>git add 文件</code> → <code>git commit</code>（merge）或 <code>git rebase --continue</code>（rebase）· 放弃：<code>git merge --abort</code> / <code>git rebase --abort</code> · 直接选一边：<code>git checkout --ours/--theirs 文件</code></div>
<h4>远程</h4><div><code>git clone 地址</code> · <code>git remote -v</code> · <code>git fetch</code> 只下载 · <code>git pull --rebase</code> 下载并整合 · <code>git push -u origin 分支</code> 首次推送 · <code>git push --force-with-lease</code> 安全强推 · <code>git push origin --delete 分支</code></div>
<h4>找 bug</h4><div><code>git blame 文件</code> 每行谁改的 · <code>git log -S "字符串"</code> 谁增删了它 · <code>git bisect start/bad/good/reset</code> 二分定位 · <code>git show 提交</code> · <code>git show 提交:文件</code></div>
<h4>原理</h4><div><code>git cat-file -p 哈希</code> 看对象 · <code>git ls-files -s</code> 看暂存区 · <code>git ls-tree HEAD</code> · <code>git count-objects</code> · <code>git fsck</code> 悬空提交</div>
<h4>shell</h4><div><code>ls -a</code> · <code>cat</code> · <code>echo "x" > f</code> 覆盖写 · <code>echo "x" >> f</code> 追加 · <code>edit f</code> 打开编辑器 · <code>sed -i "s/旧/新/g" f</code> · <code>cp -r</code> · <code>rm -r</code> · <code>diff -r a b</code> · <code>du -sh *</code> · <code>grep -rn 词 .</code> · <code>tree</code></div>`;

  /* ---------- 初始化 ---------- */
  function init() {
    app.term = new Terminal($('#terminal'), { onCommand: runCommand, completions });
    document.querySelectorAll('.tab').forEach(t => t.addEventListener('click', () => { document.querySelectorAll('.tab').forEach(x => x.classList.remove('active')); document.querySelectorAll('.tab-panel').forEach(x => x.classList.remove('active')); t.classList.add('active'); $('#tab-' + t.dataset.tab).classList.add('active'); }));
    $('#btn-hint').addEventListener('click', () => { const lv = app.level; if (app.hintsShown < lv.hints.length) { app.hintsShown++; $('#hint-list').innerHTML = lv.hints.slice(0, app.hintsShown).map(h => `<li>${esc(h)}</li>`).join(''); $('#hint-count').textContent = `（${app.hintsShown}/${lv.hints.length}）`; } });
    $('#btn-reset').addEventListener('click', () => loadLevel(app.level.id));
    $('#btn-next').addEventListener('click', nextLevel);
    $('#btn-prev').addEventListener('click', prevLevel);
    $('#btn-levels').addEventListener('click', () => { renderLevelsModal(); $('#levels-modal').classList.remove('hidden'); });
    $('#levels-close').addEventListener('click', () => $('#levels-modal').classList.add('hidden'));
    $('#btn-cheatsheet').addEventListener('click', () => { $('#cheat-body').innerHTML = CHEAT; $('#cheat-modal').classList.remove('hidden'); });
    $('#cheat-close').addEventListener('click', () => $('#cheat-modal').classList.add('hidden'));
    $('#editor-save').addEventListener('click', saveEditor);
    $('#editor-cancel').addEventListener('click', cancelEditor);
    $('#editor-text').addEventListener('keydown', e => { if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); saveEditor(); } if (e.key === 'Escape') cancelEditor(); if (e.key === 'Tab') { e.preventDefault(); const t = e.target; const s = t.selectionStart; t.value = t.value.slice(0, s) + '  ' + t.value.slice(t.selectionEnd); t.selectionStart = t.selectionEnd = s + 2; } });
    document.querySelectorAll('.modal').forEach(m => m.addEventListener('click', e => { if (e.target === m && m.id !== 'editor-modal') m.classList.add('hidden'); }));
    const hash = location.hash.replace('#', '');
    const saved = loadProgress();
    loadLevel(LEVELS.some(l => l.id === hash) ? hash : (saved || LEVELS[0].id));
    window.addEventListener('hashchange', () => { const h = location.hash.replace('#', ''); if (LEVELS.some(l => l.id === h) && app.level.id !== h) loadLevel(h); });
  }
  window.GitGame = { app, loadLevel, runCommand, LEVELS };
  document.addEventListener('DOMContentLoaded', init);
})();
