/* 应用主逻辑：关卡加载、命令执行、反馈、面板刷新、进度保存 */
(function () {
  'use strict';
  const { LEVELS, CHAPTERS, PROJ } = window.GitLevels;
  const { Terminal, renderGraph, commitDetailHtml, renderTrees, renderMulti, esc, $ } = window.GitUI;
  const STORAGE = 'gitgame.progress.v1';

  const Fx = window.GitGameFx;
  const app = {
    world: null, level: null, ctx: null, sticky: [], hintsShown: 0, completed: {}, achievements: {}, xp: 0, term: null, lastTrace: [], lastArgv: null, selectedCommit: null, levelState: {},
  };

  function loadProgress() { try { const p = JSON.parse(localStorage.getItem(STORAGE) || '{}'); app.completed = p.completed || {}; for (const k of Object.keys(app.completed)) if (app.completed[k] === true) app.completed[k] = { stars: 2 }; app.achievements = p.achievements || {}; app.xp = p.xp || 0; return p.current; } catch (e) { return null; } }
  function saveProgress() { try { localStorage.setItem(STORAGE, JSON.stringify({ completed: app.completed, achievements: app.achievements, xp: app.xp, current: app.level && app.level.id })); } catch (e) { } }
  function renderXp() {
    const r = Fx.rankFor(app.xp);
    $('#rank-title').textContent = r.title;
    const span = r.next ? r.next - r.cur : 1; const pct = r.next ? Math.round((app.xp - r.cur) / span * 100) : 100;
    $('#xp-fill').style.width = pct + '%';
    $('#xp-text').textContent = `${app.xp} XP`;
    $('#achv-count').textContent = Object.keys(app.achievements).length;
  }
  function gainXp(n) { app.xp += n; renderXp(); saveProgress(); }
  function checkAchievements(info) {
    const total = LEVELS.filter(l => !l.sandbox).length;
    for (const a of Fx.ACHIEVEMENTS) {
      if (app.achievements[a.id]) continue;
      let hit = false; try { hit = !!a.test({ ...info, completed: app.completed, total }); } catch (e) { }
      if (hit) { app.achievements[a.id] = Date.now(); gainXp(50); showAchievement(a); }
    }
  }
  function showAchievement(a) {
    Fx.Sound.achievement();
    const t = document.createElement('div'); t.className = 'achv-toast'; t.innerHTML = `<span class="icon">${a.icon}</span><div><div class="name">${T('成就解锁：', 'Achievement unlocked: ')}${esc(a.name)}</div><div class="desc">${esc(a.desc)} · +50 XP</div></div>`; document.body.appendChild(t); setTimeout(() => t.remove(), 4200);
    renderXp();
  }
  function renderAchievements() {
    $('#achv-list').innerHTML = Fx.ACHIEVEMENTS.map(a => `<div class="achv ${app.achievements[a.id] ? '' : 'locked'}"><span class="icon">${a.icon}</span><div><div class="name">${esc(a.name)}</div><div class="desc">${esc(a.desc)}</div></div></div>`).join('');
  }

  /* ---------- 本关进度持久化（刷新后回放命令） ---------- */
  const SESSION = 'gitgame.session.v1';
  function saveSession() { try { localStorage.setItem(SESSION, JSON.stringify({ level: app.level.id, hints: app.hintsShown, log: app.session })); } catch (e) { } }
  function loadSession() { try { return JSON.parse(localStorage.getItem(SESSION) || 'null'); } catch (e) { return null; } }
  function replaySession(sess) {
    app.replaying = true;
    for (const e of sess.log) {
      if (e.cmd) { const res = app.world.exec(e.cmd, { editor: null }); if (app.level.onCommand) { try { app.level.onCommand(app.ctx, e.cmd.trim(), res); } catch (x) { } } }
      else if (e.edit) { try { app.world.writeFile(e.edit.path, e.edit.content); } catch (x) { } }
      else if (e.commitMsg) { try { app.world.exec(`git commit -m ${JSON.stringify(e.commitMsg)}`); } catch (x) { } }
      else if (e.action !== undefined && app.level.actions && app.level.actions[e.action]) { try { app.level.actions[e.action].run(app.ctx); } catch (x) { } }
    }
    app.replaying = false;
    app.hintsShown = sess.hints || 0;
    if (app.hintsShown) $('#hint-list').innerHTML = app.level.hints.slice(0, app.hintsShown).map(h => `<li>${esc(h)}</li>`).join('');
    app.term.append(T(`（已恢复本关进度：回放了 ${sess.log.length} 步。想从头来点“重置本关”）`, `(Restored your progress on this level: replayed ${sess.log.length} step${sess.log.length === 1 ? '' : 's'}. Click “Reset level” to start over.)`), 't-info');
    evaluate('', {});
  }

  /* ---------- 关卡 ---------- */
  function makeCtx(world) {
    const ctx = { world, state: {}, teammate: null };
    ctx.teammate = (who, lines) => {
      const user = /^(小明|xiaoming)$/i.test(who) ? 'xiaoming' : /^(小红|xiaohong)$/i.test(who) ? 'xiaohong' : who;
      const shown = user === 'xiaoming' ? T('小明', 'Xiaoming') : user === 'xiaohong' ? T('小红', 'Xiaohong') : who;
      const home = '/home/' + user;
      for (const l of lines) {
        const cwd = world.repoAt(home + '/project') ? home + '/project' : home;
        const r = world.runAs(user, cwd, l);
        const all = ((r.out || '') + (r.err ? '\n' + r.err : '')).trim().split('\n');
        app.term.mate(user === 'xiaoming' ? '🧑‍💻' : '👩‍💻', shown, `@ ${cwd.replace('/home/' + user, '~')} $`, l, all.slice(0, 3).join('\n') + (all.length > 3 ? '\n…' : ''));
      }
      refreshPanels();
    };
    return ctx;
  }
  function loadLevel(id, { resume = false } = {}) {
    const level = LEVELS.find(l => l.id === id) || LEVELS[0];
    app.session = [];
    app.level = level;
    window.GitCore.setClock(Date.UTC(2026, 0, 5, 1, 0, 0));
    app.world = new window.GitShell.World();
    app.ctx = makeCtx(app.world);
    level.setup(app.ctx);
    app.world.log = [];
    app.world.cwd = app.world.repoAt(PROJ) ? PROJ : '/home/you';
    if (level.id === 'c1-1' || level.id === 'c0-1' || level.id === 'c0-2' || level.id === 'c5-1') app.world.cwd = '/home/you';
    app.sticky = level.tasks.map(() => false);
    app.hintsShown = 0; app.lastTrace = []; app.lastArgv = null; app.selectedCommit = null; app.levelState = { wasRejected: false, cmds: 0 };
    app.term.clear();
    app.term.append(`=== ${level.title} ===`, 't-info');
    app.term.append(T(`当前目录：${app.world.cwd}   （输入 help 查看命令；点右上角 ↺ 可重置本关）`, `Current directory: ${app.world.cwd}   (type help for commands; ↺ resets the level)`), 't-info');
    renderLesson();
    const sess = resume ? loadSession() : null;
    if (sess && sess.level === level.id && sess.log && sess.log.length) replaySession(sess); else saveSession();
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
    $('#hint-count').textContent = T(`（${lv.hints.length} 条）`, `(${lv.hints.length} available)`);
    $('#feedback-box').innerHTML = `<div class="fb mentor"><span class="avatar">🧙</span><span>${lv.sandbox ? T('这里没有任务，随便玩。右边“多人”标签的按钮可以让同事搞事情。', 'No tasks here: play freely. The buttons in the “Team” tab on the right make your teammates stir things up.') : T('我是导师。执行命令后，我会在这里指出问题、解释原因。遇到困难点“💡 提示”，但不看提示通关能拿 3 星。', 'I\'m your mentor. After you run a command, I\'ll point out problems here and explain why. Stuck? Click “💡 Hint”, but finishing without hints earns 3 stars.')}</span></div>`;
    $('#level-done').classList.add('hidden');
    $('#btn-prev').disabled = LEVELS.indexOf(lv) === 0;
    $('#btn-next').disabled = LEVELS.indexOf(lv) === LEVELS.length - 1;
    renderTasks();
    const done = Object.keys(app.completed).filter(k => LEVELS.some(l => l.id === k && !l.sandbox)).length;
    $('#progress-text').textContent = T(`${done} / ${LEVELS.filter(l => !l.sandbox).length} 关`, `${done} / ${LEVELS.filter(l => !l.sandbox).length} levels`);
    renderXp();
    const act = $('#multi-actions');
    act.innerHTML = '';
    if (lv.actions) lv.actions.forEach((a, idx) => { const b = document.createElement('button'); b.textContent = a.label; b.addEventListener('click', () => { a.run(app.ctx); app.session.push({ action: idx }); saveSession(); refreshPanels(); evaluate(''); }); act.appendChild(b); });
  }
  function renderTasks() {
    const ol = $('#task-list');
    ol.innerHTML = app.level.tasks.map((t, i) => `<li class="${app.sticky[i] ? 'done' : ''} ${t.observe ? 'observe' : ''}" title="${t.observe ? T('观察类任务：完成后面的任务后会自动打勾', 'Observation task: ticked automatically once you finish the tasks after it') : ''}">${esc(t.text)}</li>`).join('');
  }
  function evaluate(cmd, res) {
    const lv = app.level;
    let newly = [];
    lv.tasks.forEach((t, i) => { if (!app.sticky[i]) { let ok = false; try { ok = !!t.check(app.ctx); } catch (e) { ok = false; } if (ok) { app.sticky[i] = true; newly.push(i); } } });
    if (lv.tasks.every((t, i) => t.observe || app.sticky[i])) lv.tasks.forEach((t, i) => { if (t.observe && !app.sticky[i]) { app.sticky[i] = true; } });
    renderTasks();
    if (newly.length && !lv.sandbox) { addFeedback(T(`✅ 完成任务 ${newly.map(i => i + 1).join('、')}${newly.length === 1 ? '：' + lv.tasks[newly[0]].text : ''}`, `✅ Task${newly.length === 1 ? '' : 's'} ${newly.map(i => i + 1).join(', ')} done${newly.length === 1 ? ': ' + lv.tasks[newly[0]].text : ''}`), 'good'); if (!app.sticky.every(Boolean)) Fx.Sound.task(); }
    let justDone = false;
    if (!lv.sandbox && app.sticky.every(Boolean)) {
      const stars = Fx.starsFor(app.hintsShown);
      if (!app.completed[lv.id]) { app.completed[lv.id] = { stars, hints: app.hintsShown, cmds: app.levelState.cmds }; justDone = true; gainXp(stars * 100); saveProgress(); Fx.Sound.level(); Fx.confetti(); toast(T(`🎉 本关完成！ ${'★'.repeat(stars)} +${stars * 100} XP`, `🎉 Level complete! ${'★'.repeat(stars)} +${stars * 100} XP`)); }
      else if (stars > (app.completed[lv.id].stars || 0)) { const gain = (stars - app.completed[lv.id].stars) * 100; app.completed[lv.id].stars = stars; gainXp(gain); saveProgress(); toast(T(`⭐ 星级提升到 ${stars} 星！ +${gain} XP`, `⭐ Upgraded to ${stars} stars! +${gain} XP`)); }
      const d = $('#level-done'); const st = app.completed[lv.id].stars;
      d.innerHTML = `<b>${T('🎉 本关完成！', '🎉 Level complete!')}</b><div class="stars-big">${'★'.repeat(st)}${'☆'.repeat(3 - st)}</div><div class="muted small">${st === 3 ? T('没有看提示，满星！', 'No hints used: full stars!') : T('不看提示重玩可以拿到 3 星。', 'Replay without hints to earn 3 stars.')} <span class="xp-gain">+${st * 100} XP</span></div>${lv.done || ''}<div style="margin-top:8px"><button id="btn-next-inline" class="primary">${T('下一关 →', 'Next level →')}</button> <button id="btn-replay-inline">${T('重玩本关', 'Replay level')}</button></div>`; d.classList.remove('hidden');
      const b = $('#btn-next-inline'); if (b) b.addEventListener('click', nextLevel);
      const rp = $('#btn-replay-inline'); if (rp) rp.addEventListener('click', () => loadLevel(lv.id));
      $('#progress-text').textContent = T(`${Object.keys(app.completed).length} / ${LEVELS.filter(l => !l.sandbox).length} 关`, `${Object.keys(app.completed).length} / ${LEVELS.filter(l => !l.sandbox).length} levels`);
    }
    checkAchievements({ cmd: cmd || '', res: res || {}, levelId: lv.id, done: justDone, state: app.levelState, repoBefore: app.levelState.repoBefore });
  }
  function nextLevel() { const i = LEVELS.indexOf(app.level); if (i < LEVELS.length - 1) loadLevel(LEVELS[i + 1].id); }
  function prevLevel() { const i = LEVELS.indexOf(app.level); if (i > 0) loadLevel(LEVELS[i - 1].id); }

  /* ---------- 反馈（通用纠错） ---------- */
  const GENERAL_FEEDBACK = [
    { test: (c, r) => /not a git repository/.test(r.err), msg: T('💡 你不在 git 仓库目录里。用 <code>cd</code> 进入项目目录（例如 <code>cd project</code>）再试。', '💡 You\'re not inside a git repository. <code>cd</code> into the project folder (e.g. <code>cd project</code>) and try again.') },
    { test: (c, r) => /Please tell me who you are/.test(r.err), msg: T('💡 git 需要知道提交人是谁：<code>git config --global user.name "名字"</code> 和 <code>git config --global user.email "邮箱"</code>。这会写进每一个提交里。', '💡 git needs to know who is committing: <code>git config --global user.name "Your Name"</code> and <code>git config --global user.email "you@example.com"</code>. This gets recorded in every commit.') },
    { test: (c, r) => /^git commit/.test(c) && /no changes added to commit/.test(r.err), msg: T('💡 改动还在工作区，没进暂存区。先 <code>git add 文件</code>（或 <code>git add .</code>），再 commit。可以看右侧“三棵树”里哪一列不一样。', '💡 Your changes are still in the working tree, not in the staging area. Run <code>git add &lt;file&gt;</code> (or <code>git add .</code>) first, then commit. The “Three trees” tab on the right shows which column differs.'), cls: 'warn' },
    { test: (c, r) => /^git commit/.test(c) && /nothing to commit, working tree clean/.test(r.err), msg: T('💡 没有任何改动可提交。工作区、暂存区、HEAD 三者完全一致。', '💡 Nothing to commit: the working tree, the staging area and HEAD are all identical.') },
    { test: (c, r) => /^git commit/.test(c) && /pathspec '.*' did not match/.test(r.err), msg: T('💡 提交信息里有空格时要加引号：<code>git commit -m "fix bug"</code>。不加引号的话 git 会把 <code>bug</code> 当成文件名。', '💡 Quote the commit message when it contains spaces: <code>git commit -m "fix bug"</code>. Without quotes, git treats <code>bug</code> as a file name.'), cls: 'warn' },
    { test: (c, r) => /detached HEAD' state/.test(r.out), msg: T('💡 你现在处于 <b>detached HEAD</b>：HEAD 直接指向一个提交而不是分支。在这里提交不会推进任何分支；想保留成果就 <code>git switch -c 新分支名</code>，想回去就 <code>git switch main</code>。', '💡 You\'re now in <b>detached HEAD</b>: HEAD points straight at a commit instead of a branch. Commits made here don\'t advance any branch. To keep your work, <code>git switch -c new-branch</code>; to go back, <code>git switch main</code>.'), cls: 'warn' },
    { test: (c, r) => /Automatic merge failed/.test(r.err), msg: T('⚠️ <b>合并冲突</b>。git 已经把能自动合并的都合并了，剩下的写进了文件里，用 <code>&lt;&lt;&lt;&lt;&lt;&lt;&lt;</code>/<code>=======</code>/<code>&gt;&gt;&gt;&gt;&gt;&gt;&gt;</code> 标出两边的版本。步骤：<code>cat 文件</code> 看 → <code>edit 文件</code> 改成最终版本（删掉标记）→ <code>git add 文件</code> → <code>git commit</code>。后悔了就 <code>git merge --abort</code>。', '⚠️ <b>Merge conflict</b>. git merged everything it could automatically; the rest is written into the files, with both sides marked by <code>&lt;&lt;&lt;&lt;&lt;&lt;&lt;</code>/<code>=======</code>/<code>&gt;&gt;&gt;&gt;&gt;&gt;&gt;</code>. Steps: <code>cat &lt;file&gt;</code> to look → <code>edit &lt;file&gt;</code> to write the final version (delete the markers) → <code>git add &lt;file&gt;</code> → <code>git commit</code>. Changed your mind? <code>git merge --abort</code>.'), cls: 'warn' },
    { test: (c, r) => /could not apply .* \n?hint: Resolve all conflicts/.test(r.err) || (/^git rebase/.test(c) && /CONFLICT/.test(r.err)), msg: T('⚠️ rebase 过程中发生冲突。解决后用 <code>git add 文件</code> + <code>git rebase --continue</code>（不是 commit）。放弃用 <code>git rebase --abort</code>。', '⚠️ Conflict during rebase. After resolving it, run <code>git add &lt;file&gt;</code> + <code>git rebase --continue</code> (not commit). To give up, <code>git rebase --abort</code>.'), cls: 'warn' },
    { test: (c, r) => /\[rejected\].*non-fast-forward/.test(r.err), msg: T('⛔ push 被拒绝（non-fast-forward）：远程分支上有你本地没有的提交，直接推会覆盖别人的工作。先 <code>git pull --rebase</code>（或 <code>--no-rebase</code>）把远程合进来，再 push。', '⛔ Push rejected (non-fast-forward): the remote branch has commits you don\'t have locally, and pushing would overwrite someone else\'s work. First <code>git pull --rebase</code> (or <code>--no-rebase</code>) to bring the remote in, then push.'), cls: 'bad' },
    { test: (c, r) => /\[rejected\].*fetch first/.test(r.err), msg: T('⛔ push 被拒绝（fetch first）：远程有新提交，你还没拿到。<code>git fetch</code> 看看，然后 <code>git pull --rebase</code> 再 push。', '⛔ Push rejected (fetch first): the remote has new commits you haven\'t fetched yet. <code>git fetch</code> to take a look, then <code>git pull --rebase</code> and push again.'), cls: 'bad' },
    { test: (c, r) => /Need to specify how to reconcile divergent branches/.test(r.err), msg: T('💡 历史分叉了，新版 git 要你明确选择：<code>git pull --rebase</code>（你的提交挪到最后，历史是直线）或 <code>git pull --no-rebase</code>（生成合并提交）。想一劳永逸：<code>git config pull.rebase true</code>。', '💡 The histories have diverged, and modern git wants you to choose explicitly: <code>git pull --rebase</code> (your commits move to the end, history stays linear) or <code>git pull --no-rebase</code> (creates a merge commit). To set it once and for all: <code>git config pull.rebase true</code>.'), cls: 'warn' },
    { test: (c, r) => /has no upstream branch/.test(r.err), msg: T('💡 这个分支还没告诉 git “推到远程的哪个分支”。第一次推用 <code>git push -u origin 分支名</code>，之后就可以直接 <code>git push</code>。', '💡 This branch hasn\'t told git which remote branch to push to. The first time, use <code>git push -u origin &lt;branch&gt;</code>; after that a plain <code>git push</code> works.') },
    { test: (c, r) => /Your local changes to the following files would be overwritten/.test(r.err), msg: T('💡 切换/合并会覆盖你没提交的修改，git 拒绝了。三个选择：<code>git commit</code> 提交它、<code>git stash</code> 先存起来、或 <code>git restore 文件</code> 丢弃它。', '💡 Switching/merging would overwrite your uncommitted changes, so git refused. Three options: <code>git commit</code> them, <code>git stash</code> them for later, or <code>git restore &lt;file&gt;</code> to throw them away.'), cls: 'warn' },
    { test: (c, r) => /not fully merged/.test(r.err), msg: T('💡 这个分支上有还没合并进当前分支的提交，<code>-d</code> 拒绝删除以防丢失。确定不要了就用 <code>-D</code>。', '💡 This branch has commits that aren\'t merged into the current branch, so <code>-d</code> refuses to delete it to avoid losing them. If you\'re sure you don\'t need them, use <code>-D</code>.'), cls: 'warn' },
    { test: (c, r) => /is not a git command/.test(r.err), msg: T('💡 没有这个 git 子命令，检查拼写。<code>git help</code> 列出沙盒支持的命令。', '💡 There\'s no such git subcommand; check the spelling. <code>git help</code> lists the commands this sandbox supports.') },
    { test: (c, r) => /command not found/.test(r.err), msg: T('💡 这不是沙盒支持的 shell 命令。输入 <code>help</code> 查看列表。', '💡 That\'s not a shell command this sandbox supports. Type <code>help</code> for the list.') },
    { test: (c, r) => /Warning: you are leaving .* behind/.test(r.out), msg: T('⚠️ 你离开了一个不属于任何分支的提交。它还在（reflog 里能找到），但不会出现在 git log 里。想保留就按 git 提示的 <code>git branch 名字 哈希</code>。', '⚠️ You left behind a commit that isn\'t on any branch. It still exists (reflog can find it), but it won\'t show up in git log. To keep it, do what git suggests: <code>git branch &lt;name&gt; &lt;hash&gt;</code>.'), cls: 'warn' },
    { test: (c, r) => /^git push .*(-f\b|--force\b)/.test(c) && r.ok && /forced update/.test(r.out), msg: T('⚠️ 你强推了。远程分支被你的版本<b>覆盖</b>，如果别人在这期间推过提交，那些提交在远程上就消失了。多人协作时用 <code>--force-with-lease</code> 更安全。', '⚠️ You force-pushed. The remote branch was <b>overwritten</b> with your version: if anyone pushed commits in the meantime, they\'re now gone from the remote. When working with others, <code>--force-with-lease</code> is safer.'), cls: 'bad' },
    { test: (c, r) => /^git reset --hard/.test(c) && r.ok, msg: T('💡 <code>reset --hard</code> 丢弃了工作区和暂存区的修改（未提交的部分找不回来）；被甩掉的提交还在 <code>git reflog</code> 里。', '💡 <code>reset --hard</code> threw away the changes in your working tree and staging area (uncommitted work can\'t be recovered); the commits you moved away from are still in <code>git reflog</code>.') },
    { test: (c, r) => /Successfully rebased/.test(r.out), msg: T('✅ rebase 完成。注意右侧提交图：被重放的提交<b>哈希变了</b>——它们是新提交。所以已推送的提交不要 rebase。', '✅ Rebase done. Look at the commit graph on the right: the replayed commits have <b>new hashes</b>, because they are new commits. That\'s why you shouldn\'t rebase commits you\'ve already pushed.'), cls: 'good' },
    { test: (c, r) => /is the first bad commit/.test(r.out), msg: T('🎯 bisect 找到了肇事提交！用 <code>git show 哈希</code> 看它改了什么，<code>git bisect reset</code> 回到原分支，再用 <code>git revert</code> 撤销它。', '🎯 bisect found the culprit! Use <code>git show &lt;hash&gt;</code> to see what it changed, <code>git bisect reset</code> to return to your branch, then <code>git revert</code> to undo it.'), cls: 'good' },
    { test: (c, r) => /Saved working directory/.test(r.out), msg: T('💡 改动被存进 stash（本质是一个挂在 refs/stash 上的提交，看提交图里的 stash 标记）。<code>git stash list</code> 查看，<code>git stash pop</code> 取回。', '💡 Your changes went into the stash (really just a commit hanging off refs/stash; look for the stash label in the commit graph). <code>git stash list</code> to view it, <code>git stash pop</code> to get the changes back.') },
    { test: (c, r) => /^rm -rf? .*\.git\b/.test(c) && r.ok, msg: T('🚨 你删除了 <code>.git</code> 目录——<b>整个历史没了</b>，只剩当前工作区文件。这是 git 唯一救不回来的操作（除非远程或同事那里有副本）。', '🚨 You deleted the <code>.git</code> directory: <b>the entire history is gone</b>, only the current working files remain. This is the one thing git can\'t rescue you from (unless a remote or a teammate has a copy).'), cls: 'bad' },
  ];
  function addFeedback(html, cls = '') {
    const box = $('#feedback-box');
    const m = box.querySelector('.fb.mentor'); if (m) m.remove();
    const d = document.createElement('div'); d.className = 'fb ' + cls; d.innerHTML = `<span class="avatar">${cls === 'good' ? '🎯' : cls === 'bad' ? '🚨' : '🧙'}</span><div>${html}</div>`;
    box.prepend(d);
    while (box.children.length > 4) box.removeChild(box.lastChild);
  }
  function toast(text) { const t = document.createElement('div'); t.className = 'toast'; t.textContent = text; document.body.appendChild(t); setTimeout(() => t.remove(), 2600); }

  /* ---------- 命令执行 ---------- */
  function runCommand(line) {
    const world = app.world;
    app.term.echoCommand(world.prompt(), line);
    if (!line.trim()) return;
    app.levelState.cmds++;
    const curBefore = world.currentRepo();
    app.levelState.repoBefore = curBefore ? { hadConflictMerge: !!(curBefore.repo.state.merge || curBefore.repo.state.rebase || curBefore.repo.state.cherryPick) && curBefore.repo.conflicts.size === 0 && (curBefore.repo.state.merge ? true : true) && curBefore.repo.reflogs && (curBefore.repo._hadConflict || false) } : null;
    const res = world.exec(line, { editor: openCommitEditor });
    if (!app.replaying) { app.session.push({ cmd: line }); saveSession(); }
    if (!res.ok) Fx.Sound.error();
    if (/\[rejected\]/.test(res.err || '')) app.levelState.wasRejected = true;
    const curAfter = world.currentRepo();
    if (curAfter && curAfter.repo.conflicts.size) curAfter.repo._hadConflict = true;
    if (curAfter && !curAfter.repo.state.merge && !curAfter.repo.state.rebase && !curAfter.repo.state.cherryPick && !curAfter.repo.conflicts.size && res.ok && /^git (commit|rebase --continue|merge --continue|cherry-pick --continue)/.test(line.trim())) { /* 冲突解决后完成提交 */ if (curAfter.repo._hadConflict) { app.levelState.repoBefore = { hadConflictMerge: true }; curAfter.repo._hadConflict = false; } }
    for (const a of (res.actions || [])) {
      if (a.type === 'clear') app.term.clear();
      if (a.type === 'edit') openFileEditor(a.path, a.content);
    }
    if (res.out) app.term.append(res.out, 't-out');
    if (res.err) app.term.append(res.err, 't-err');
    app.lastTrace = res.traces || [];
    const first = line.trim().split(/\s+/);
    app.lastArgv = first;
    if ($('#trace-toggle').checked && first[0] === 'git' && app.lastTrace.length) { const html = window.GitAnalogy.traceHtml(app.lastTrace, world.currentRepo() && world.currentRepo().repo); if (html) app.term.appendHtml('<b>' + T('底层：', 'Under the hood: ') + '</b>' + html.replace(/<ul class="trace">/, '').replace(/<\/ul>/, '').replace(/<li>/g, '• ').replace(/<\/li>/g, '<br>'), 't-trace'); }
    // 反馈
    let fbs = [];
    for (const f of GENERAL_FEEDBACK) { try { if (f.test(line.trim(), res)) fbs.push([f.msg, f.cls || '']); } catch (e) { } }
    if (app.level.feedback) { try { const m = app.level.feedback(app.ctx, line.trim(), res); if (m) fbs.push([m, 'warn']); } catch (e) { } }
    if (app.level.onCommand) { try { const m = app.level.onCommand(app.ctx, line.trim(), res); if (m) { app.term.append(m, 't-info'); fbs.push([m, '']); } } catch (e) { console.error(e); } }
    const markerFiles = [];
    const cur = world.currentRepo();
    if (cur && /^git (add|commit|rebase --continue)/.test(line.trim()) && res.ok) for (const [p, c] of cur.repo.workdir) if (cur.repo.index.has(p) && /^(<<<<<<<|=======|>>>>>>>)/m.test(c) && !cur.repo.conflicts.has(p)) markerFiles.push(p);
    if (markerFiles.length && !fbs.some(f => /标记|marker/i.test(f[0]))) fbs.push([T(`🚨 ${markerFiles.join(', ')} 里还有冲突标记（<code>&lt;&lt;&lt;&lt;&lt;&lt;&lt;</code>），git 不会拦你，但提交出去就是坏代码。先编辑文件删掉标记。`, `🚨 ${markerFiles.join(', ')} still contain${markerFiles.length === 1 ? 's' : ''} conflict markers (<code>&lt;&lt;&lt;&lt;&lt;&lt;&lt;</code>). git won't stop you, but committing them means shipping broken code. Edit the file and delete the markers first.`), 'bad']);
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
    if (repo) { legend.innerHTML = `<span>${T('仓库：', 'Repo: ')}<code>${esc(repo.path)}</code></span><span class="pill" style="background:#2e6b45;color:#c8ffd9">HEAD</span><span class="pill" style="background:#24384f;color:#9cd1ff">${T('分支', 'branch')}</span><span class="pill" style="background:#4a3a5a;color:#e5c8ff">${T('远程跟踪', 'remote-tracking')}</span><span class="pill" style="background:#5a4a1e;color:#ffe08a">${T('标签', 'tag')}</span><span>${T('◯ 合并提交 · 点击提交看详情', '◯ merge commit · click a commit for details')}</span>`; renderGraph($('#graph-svg'), repo, { onSelect: h => { app.selectedCommit = h; showCommitDetail(); } }); }
    else { legend.innerHTML = `<span class="muted">${T('当前目录不是 git 仓库', 'The current directory is not a git repository')}</span>`; const svg = $('#graph-svg'); svg.setAttribute('width', 400); svg.setAttribute('height', 120); svg.setAttribute('viewBox', '0 0 400 120'); svg.innerHTML = '<text x="200" y="50" text-anchor="middle" fill="#4a5364" font-size="34">📁</text>' + T('<text x="200" y="88" text-anchor="middle" fill="#8b95a7" font-size="12" font-family="sans-serif">还没有 git 仓库。git init 或 cd 进一个仓库后，这里会画出提交图。</text>', '<text x="200" y="84" text-anchor="middle" fill="#8b95a7" font-size="12" font-family="sans-serif">No git repository yet.</text><text x="200" y="102" text-anchor="middle" fill="#8b95a7" font-size="12" font-family="sans-serif">Run git init (or cd into a repo) to see the graph here.</text>'); }
    showCommitDetail();
    // 三棵树
    renderTrees(repo, $('#trees-summary'), $('#trees-table'), p => openFileEditor(repo.path + '/' + p, repo.workdir.get(p)));
    // 原理对比
    const card = $('#analogy-card');
    const ex = app.lastArgv ? window.GitAnalogy.explain(app.lastArgv, app.lastTrace, repo) : null;
    if (ex) card.innerHTML = `<h4>$ ${esc(app.lastArgv.join(' '))}</h4><div class="row git"><b class="lbl">${T('git 在底层做了什么', 'What git does under the hood')}</b>${ex.git}${ex.trace ? '<div class="muted small" style="margin-top:4px">' + T('这次实际发生的：', 'What actually happened this time:') + '</div>' + ex.trace : ''}</div>${ex.folder ? `<div class="row folder"><b class="lbl">${T('如果用“复制文件夹”的原始办法', 'The old-school “copy the folder” way')}</b>${ex.folder}</div>` : ''}${ex.diff ? `<div class="row diff"><b class="lbl">${T('差别在哪', 'What\'s the difference')}</b>${ex.diff}</div>` : ''}`;
    else card.innerHTML = `<p class="muted">${T('执行一条 git 命令，这里会解释：git 在底层做了什么、如果用“复制文件夹”的原始办法要怎么做、差别在哪。', 'Run a git command and this card explains what git did under the hood, how you would do it with the copy-the-folder approach, and what the difference is.')}</p>`;
    $('#snapshots').innerHTML = repo && !repo.bare ? window.GitAnalogy.snapshotsHtml(repo) : folderViewHtml(world);
    // 多人
    renderMulti(world, $('#multi-repos'), repo);
  }
  function folderViewHtml(world) {
    let entries; try { entries = world.listDir('/home/you'); } catch (e) { return ''; }
    const human = n => n < 1024 ? n + ' B' : (n / 1024).toFixed(1) + ' KB';
    const dirs = entries.filter(e => e.type === 'dir');
    if (!dirs.length) return `<p class="muted">${T('主目录里还没有文件夹。', 'No folders in your home directory yet.')}</p>`;
    const total = dirs.reduce((s, e) => s + world.sizeOf('/home/you/' + e.name), 0);
    const files = new Map(); for (const e of dirs) for (const [k, v] of world.flatFiles('/home/you/' + e.name)) files.set(v, (files.get(v) || 0) + 1);
    const dup = [...files.values()].filter(n => n > 1).length;
    return `<div class="size-compare"><div><span>${T(`主目录下 ${dirs.length} 个文件夹，总占用：`, `${dirs.length} folder${dirs.length === 1 ? '' : 's'} in your home directory, total size:`)}</span><b>${human(total)}</b></div><div><span>${T('内容完全相同却被重复存储的文件：', 'Identical files stored more than once:')}</span><b>${T(`${dup} 种`, `${dup}`)}</b></div><div class="muted">${T('这就是“复制文件夹”备份法的代价。git 会把相同内容只存一份。', 'That\'s the cost of backing up by copying folders. git stores identical content only once.')}</div></div><div class="snaps">${dirs.map(e => { const flat = world.flatFiles('/home/you/' + e.name); return `<div class="snap"><div class="snap-title">📁 ${esc(e.name)}/</div><ul>${[...flat].map(([k, v]) => `<li class="${files.get(v) > 1 ? 'shared' : 'changed'}"><span class="fname">${esc(k)}</span><span class="fhash">${human(window.GitCore.byteLen(v))}</span>${files.get(v) > 1 ? '<span class="tag-shared">' + T('重复 ×', 'duplicate ×') + files.get(v) + '</span>' : ''}</li>`).join('')}</ul></div>`; }).join('')}</div>`;
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
      try { app.world.writeFile(editorState.path, text); app.term.append(T(`（已保存 ${editorState.path}）`, `(Saved ${editorState.path})`), 't-info'); app.session.push({ edit: { path: editorState.path, content: text } }); saveSession(); } catch (e) { app.term.append(e.message, 't-err'); }
      refreshPanels(); evaluate('', {});
    } else { const out = editorState.onSave(text); if (out) app.term.append(out, /^Aborting|^error|^fatal/.test(out) ? 't-err' : 't-out'); const msg = text.split('\n').filter(l => !l.startsWith('#')).join('\n').trim(); if (msg) { app.session.push({ commitMsg: msg }); saveSession(); } refreshPanels(); evaluate('git commit', { ok: true, out }); }
    editorState = null; app.term.input.focus();
  }
  function cancelEditor() { $('#editor-modal').classList.add('hidden'); if (editorState && editorState.kind === 'commit') app.term.append('Aborting commit due to empty commit message.', 't-err'); editorState = null; app.term.input.focus(); }

  /* ---------- 关卡列表 / 速查 ---------- */
  function renderLevelsModal() {
    Fx.renderMap($('#levels-list'), LEVELS, CHAPTERS, app.completed, app.level.id, id => { $('#levels-modal').classList.add('hidden'); loadLevel(id); });
  }
  const CHEAT = T(`
<h4>三棵树</h4><div><code>git status</code> 状态 · <code>git add 文件</code> 放入暂存区 · <code>git commit -m "说明"</code> 提交 · <code>git diff</code> / <code>git diff --staged</code> 差异 · <code>git log --oneline --graph --all</code> 历史图</div>
<h4>撤销</h4><div><code>git restore 文件</code> 丢弃工作区修改 · <code>git restore --staged 文件</code> 取消暂存 · <code>git commit --amend</code> 改上次提交 · <code>git reset --soft/--mixed/--hard 提交</code> · <code>git revert 提交</code> 反向提交 · <code>git reflog</code> 找回一切</div>
<h4>分支</h4><div><code>git switch -c 名字</code> 建并切 · <code>git switch 名字</code> · <code>git branch -d 名字</code> · <code>git merge 分支</code> · <code>git rebase 分支</code> · <code>git cherry-pick 提交</code> · <code>git stash</code> / <code>git stash pop</code> · <code>git tag -a v1.0 -m "说明"</code></div>
<h4>冲突</h4><div>编辑文件删掉 <code>&lt;&lt;&lt;&lt;&lt;&lt;&lt; ======= &gt;&gt;&gt;&gt;&gt;&gt;&gt;</code> → <code>git add 文件</code> → <code>git commit</code>（merge）或 <code>git rebase --continue</code>（rebase）· 放弃：<code>git merge --abort</code> / <code>git rebase --abort</code> · 直接选一边：<code>git checkout --ours/--theirs 文件</code></div>
<h4>远程</h4><div><code>git clone 地址</code> · <code>git remote -v</code> · <code>git fetch</code> 只下载 · <code>git pull --rebase</code> 下载并整合 · <code>git push -u origin 分支</code> 首次推送 · <code>git push --force-with-lease</code> 安全强推 · <code>git push origin --delete 分支</code></div>
<h4>找 bug</h4><div><code>git blame 文件</code> 每行谁改的 · <code>git log -S "字符串"</code> 谁增删了它 · <code>git bisect start/bad/good/reset</code> 二分定位 · <code>git show 提交</code> · <code>git show 提交:文件</code></div>
<h4>原理</h4><div><code>git cat-file -p 哈希</code> 看对象 · <code>git ls-files -s</code> 看暂存区 · <code>git ls-tree HEAD</code> · <code>git count-objects</code> · <code>git fsck</code> 悬空提交</div>
<h4>shell</h4><div><code>ls -a</code> · <code>cat</code> · <code>echo "x" > f</code> 覆盖写 · <code>echo "x" >> f</code> 追加 · <code>edit f</code> 打开编辑器 · <code>sed -i "s/旧/新/g" f</code> · <code>cp -r</code> · <code>rm -r</code> · <code>diff -r a b</code> · <code>du -sh *</code> · <code>grep -rn 词 .</code> · <code>tree</code></div>`, `
<h4>The three trees</h4><div><code>git status</code> status · <code>git add &lt;file&gt;</code> stage it · <code>git commit -m "message"</code> commit · <code>git diff</code> / <code>git diff --staged</code> differences · <code>git log --oneline --graph --all</code> history graph</div>
<h4>Undo</h4><div><code>git restore &lt;file&gt;</code> discard working-tree changes · <code>git restore --staged &lt;file&gt;</code> unstage · <code>git commit --amend</code> fix the last commit · <code>git reset --soft/--mixed/--hard &lt;commit&gt;</code> · <code>git revert &lt;commit&gt;</code> make an inverse commit · <code>git reflog</code> find anything again</div>
<h4>Branches</h4><div><code>git switch -c &lt;name&gt;</code> create and switch · <code>git switch &lt;name&gt;</code> · <code>git branch -d &lt;name&gt;</code> · <code>git merge &lt;branch&gt;</code> · <code>git rebase &lt;branch&gt;</code> · <code>git cherry-pick &lt;commit&gt;</code> · <code>git stash</code> / <code>git stash pop</code> · <code>git tag -a v1.0 -m "message"</code></div>
<h4>Conflicts</h4><div>Edit the file and delete <code>&lt;&lt;&lt;&lt;&lt;&lt;&lt; ======= &gt;&gt;&gt;&gt;&gt;&gt;&gt;</code> → <code>git add &lt;file&gt;</code> → <code>git commit</code> (merge) or <code>git rebase --continue</code> (rebase) · give up: <code>git merge --abort</code> / <code>git rebase --abort</code> · take one side wholesale: <code>git checkout --ours/--theirs &lt;file&gt;</code></div>
<h4>Remotes</h4><div><code>git clone &lt;url&gt;</code> · <code>git remote -v</code> · <code>git fetch</code> download only · <code>git pull --rebase</code> download and integrate · <code>git push -u origin &lt;branch&gt;</code> first push · <code>git push --force-with-lease</code> safe force-push · <code>git push origin --delete &lt;branch&gt;</code></div>
<h4>Finding bugs</h4><div><code>git blame &lt;file&gt;</code> who changed each line · <code>git log -S "text"</code> who added/removed it · <code>git bisect start/bad/good/reset</code> binary search · <code>git show &lt;commit&gt;</code> · <code>git show &lt;commit&gt;:&lt;file&gt;</code></div>
<h4>Internals</h4><div><code>git cat-file -p &lt;hash&gt;</code> inspect an object · <code>git ls-files -s</code> inspect the index · <code>git ls-tree HEAD</code> · <code>git count-objects</code> · <code>git fsck</code> dangling commits</div>
<h4>Shell</h4><div><code>ls -a</code> · <code>cat</code> · <code>echo "x" > f</code> overwrite · <code>echo "x" >> f</code> append · <code>edit f</code> open the editor · <code>sed -i "s/old/new/g" f</code> · <code>cp -r</code> · <code>rm -r</code> · <code>diff -r a b</code> · <code>du -sh *</code> · <code>grep -rn word .</code> · <code>tree</code></div>`);

  /* ---------- 初始化 ---------- */
  function init() {
    window.I18N.applyStatic(document);
    document.title = T('Git 沙盒学院 · 在浏览器里用真实逻辑学 git', 'Git Sandbox Academy · Learn git with real git logic, in your browser');
    $('#btn-lang').addEventListener('click', () => { const hadParam = /[?&]lang=/.test(location.search); window.I18N.set(window.I18N.lang === 'en' ? 'zh' : 'en'); if (!hadParam) location.reload(); /* 同 URL 带 #hash 时 location.replace 只是锚点跳转，不会刷新 */ });
    app.term = new Terminal($('#terminal'), { onCommand: runCommand, completions });
    document.querySelectorAll('.tab').forEach(t => t.addEventListener('click', () => { document.querySelectorAll('.tab').forEach(x => x.classList.remove('active')); document.querySelectorAll('.tab-panel').forEach(x => x.classList.remove('active')); t.classList.add('active'); $('#tab-' + t.dataset.tab).classList.add('active'); }));
    $('#btn-hint').addEventListener('click', () => { const lv = app.level; if (app.hintsShown < lv.hints.length) { app.hintsShown++; $('#hint-list').innerHTML = lv.hints.slice(0, app.hintsShown).map(h => `<li>${esc(h)}</li>`).join(''); $('#hint-count').textContent = T(`（${app.hintsShown}/${lv.hints.length}）`, `(${app.hintsShown}/${lv.hints.length})`); saveSession(); } });
    $('#btn-reset').addEventListener('click', () => loadLevel(app.level.id));
    $('#btn-next').addEventListener('click', nextLevel);
    $('#btn-prev').addEventListener('click', prevLevel);
    $('#btn-levels').addEventListener('click', () => { renderLevelsModal(); $('#levels-modal').classList.remove('hidden'); });
    $('#btn-achv').addEventListener('click', () => { renderAchievements(); $('#achv-modal').classList.remove('hidden'); });
    $('#achv-close').addEventListener('click', () => $('#achv-modal').classList.add('hidden'));
    Fx.Sound.init(); $('#btn-sound').textContent = Fx.Sound.enabled ? '🔊' : '🔇';
    $('#btn-sound').addEventListener('click', () => { $('#btn-sound').textContent = Fx.Sound.toggle() ? '🔊' : '🔇'; });
    // 点击讲解/提示里的命令直接填入终端
    const insert = text => { app.term.input.value = text.trim(); app.term.input.focus(); };
    $('#lesson').addEventListener('click', e => { const code = e.target.closest('code'); if (code && !e.target.closest('pre')) { insert(code.textContent); return; } const li = e.target.closest('#hint-list li'); if (li) { let cmd = li.textContent.split('\n')[0].replace(/\s*（.*$/, '').replace(/\s+或\s+.*$/, ''); if (window.I18N.lang === 'en') cmd = cmd.replace(/\s+\([^"'`]*\)?\s*$/, '').replace(/\s{2,}or\s{2,}.*$/, '').replace(/\s+or\s+(?=(git|edit|echo|sed|cat|cp|rm)\b).*$/, ''); insert(cmd); } });
    $('#levels-close').addEventListener('click', () => $('#levels-modal').classList.add('hidden'));
    $('#btn-cheatsheet').addEventListener('click', () => { $('#cheat-body').innerHTML = CHEAT; $('#cheat-modal').classList.remove('hidden'); });
    $('#cheat-close').addEventListener('click', () => $('#cheat-modal').classList.add('hidden'));
    $('#editor-save').addEventListener('click', saveEditor);
    $('#editor-cancel').addEventListener('click', cancelEditor);
    $('#editor-text').addEventListener('keydown', e => { if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); saveEditor(); } if (e.key === 'Escape') cancelEditor(); if (e.key === 'Tab') { e.preventDefault(); const t = e.target; const s = t.selectionStart; t.value = t.value.slice(0, s) + '  ' + t.value.slice(t.selectionEnd); t.selectionStart = t.selectionEnd = s + 2; } });
    document.querySelectorAll('.modal').forEach(m => m.addEventListener('click', e => { if (e.target === m && m.id !== 'editor-modal') m.classList.add('hidden'); }));
    const hash = location.hash.replace('#', '');
    const saved = loadProgress();
    if (hash && !LEVELS.some(l => l.id === hash)) toast(T(`没有叫 "${hash}" 的关卡，已打开上次的关卡`, `There's no level called "${hash}"; opened your last level instead`));
    loadLevel(LEVELS.some(l => l.id === hash) ? hash : (saved || LEVELS[0].id), { resume: true });
    let toured = false; try { toured = localStorage.getItem('gitgame.tour') === 'done'; } catch (e) { }
    if (!toured && !hash) Fx.runTour(() => { try { localStorage.setItem('gitgame.tour', 'done'); } catch (e) { } app.term.input.focus(); });
    window.addEventListener('hashchange', () => { const h = location.hash.replace('#', ''); if (LEVELS.some(l => l.id === h) && app.level.id !== h) loadLevel(h); });
  }
  window.GitGame = { app, loadLevel, runCommand, LEVELS };
  document.addEventListener('DOMContentLoaded', init);
})();
