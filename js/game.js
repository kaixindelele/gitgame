/* 游戏化层：星级、经验与称号、成就、音效、彩带、新手引导（旅程总览见 journey.js） */
(function (global) {
  'use strict';
  const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  /* ---------- 音效（WebAudio 合成，无外部文件） ---------- */
  const Sound = {
    enabled: true, ctx: null,
    init() { try { this.enabled = localStorage.getItem('gitgame.sound') !== 'off'; } catch (e) { } },
    toggle() { this.enabled = !this.enabled; try { localStorage.setItem('gitgame.sound', this.enabled ? 'on' : 'off'); } catch (e) { } return this.enabled; },
    ac() { if (!this.ctx) { const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null; this.ctx = new AC(); } if (this.ctx.state === 'suspended') this.ctx.resume(); return this.ctx; },
    tone(freq, t0, dur, type = 'sine', gain = 0.08) { const ac = this.ac(); if (!ac) return; const o = ac.createOscillator(); const g = ac.createGain(); o.type = type; o.frequency.value = freq; g.gain.setValueAtTime(0, ac.currentTime + t0); g.gain.linearRampToValueAtTime(gain, ac.currentTime + t0 + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + t0 + dur); o.connect(g); g.connect(ac.destination); o.start(ac.currentTime + t0); o.stop(ac.currentTime + t0 + dur + 0.05); },
    task() { if (!this.enabled) return; this.tone(660, 0, 0.12); this.tone(990, 0.09, 0.16); },
    level() { if (!this.enabled) return; [523, 659, 784, 1047].forEach((f, i) => this.tone(f, i * 0.11, 0.35, 'triangle', 0.09)); },
    error() { if (!this.enabled) return; this.tone(180, 0, 0.18, 'sawtooth', 0.04); },
    achievement() { if (!this.enabled) return; [784, 988, 1175, 1568].forEach((f, i) => this.tone(f, i * 0.08, 0.3, 'square', 0.035)); },
  };

  /* ---------- 彩带 ---------- */
  function confetti(duration = 2200) {
    const c = document.createElement('canvas'); c.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:70'; c.width = innerWidth; c.height = innerHeight; document.body.appendChild(c);
    const ctx = c.getContext('2d'); const colors = ['#6cb6ff', '#5fd38d', '#f2c94c', '#c792ea', '#f5a25d', '#ff6b6b'];
    const P = Array.from({ length: 140 }, () => ({ x: innerWidth / 2 + (Math.random() - 0.5) * 200, y: innerHeight * 0.45, vx: (Math.random() - 0.5) * 14, vy: -Math.random() * 14 - 4, r: 4 + Math.random() * 5, c: colors[Math.floor(Math.random() * colors.length)], a: Math.random() * Math.PI, va: (Math.random() - 0.5) * 0.3 }));
    const t0 = performance.now();
    (function frame(t) { const el = t - t0; ctx.clearRect(0, 0, c.width, c.height); for (const p of P) { p.vy += 0.35; p.x += p.vx; p.y += p.vy; p.vx *= 0.99; p.a += p.va; ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.a); ctx.fillStyle = p.c; ctx.globalAlpha = Math.max(0, 1 - el / duration); ctx.fillRect(-p.r / 2, -p.r / 2, p.r, p.r * 0.6); ctx.restore(); } if (el < duration) requestAnimationFrame(frame); else c.remove(); })(t0);
  }

  /* ---------- 星级 / 经验 / 称号 ---------- */
  const RANKS = [[0, T('git 萌新', 'Git newbie')], [300, T('提交学徒', 'Commit apprentice')], [900, T('分支玩家', 'Branch player')], [1800, T('合并能手', 'Merge expert')], [3000, T('协作达人', 'Collaboration pro')], [4500, T('历史考古学家', 'History archaeologist')], [6000, T('Git 大师', 'Git master')]];
  function rankFor(xp) { let r = RANKS[0]; for (const x of RANKS) if (xp >= x[0]) r = x; const next = RANKS.find(x => x[0] > xp); return { title: r[1], next: next ? next[0] : null, cur: r[0] }; }
  function starsFor(hintsUsed) { return hintsUsed === 0 ? 3 : hintsUsed <= 2 ? 2 : 1; }

  /* ---------- 成就 ---------- */
  const ACHIEVEMENTS = [
    { id: 'first_commit', icon: '📸', name: T('第一张快照', 'First snapshot'), desc: T('完成第一次 git commit', 'Make your first git commit'), test: ({ cmd, res }) => /^git commit/.test(cmd) && /\[.*\(root-commit\)/.test(res.out || '') },
    { id: 'backup_survivor', icon: '🗂️', name: T('备份地狱幸存者', 'Backup hell survivor'), desc: T('在一堆 project_final 里找到了正确的版本', 'Found the right version among a pile of project_final folders'), test: ({ levelId, done }) => done && levelId === 'c0-2' },
    { id: 'explorer', icon: '🔬', name: T('对象考古', 'Object archaeologist'), desc: T('用 cat-file 亲手走通 commit → tree → blob', 'Walked commit → tree → blob by hand with cat-file'), test: ({ levelId, done }) => done && levelId === 'c1-4' },
    { id: 'time_traveler', icon: '🕰️', name: T('时间旅行者', 'Time traveler'), desc: T('进入 detached HEAD 并安全返回', 'Entered detached HEAD and made it back safely'), test: ({ levelId, done }) => done && levelId === 'c3-4' },
    { id: 'conflict_solver', icon: '⚔️', name: T('冲突终结者', 'Conflict terminator'), desc: T('手动解决一次合并冲突', 'Resolved a merge conflict by hand'), test: ({ cmd, res, repoBefore }) => /^git (commit|rebase --continue)/.test(cmd) && res.ok && repoBefore && repoBefore.hadConflictMerge },
    { id: 'reflog_rescue', icon: '🛟', name: T('reflog 救援队', 'reflog rescue team'), desc: T('用 reflog 找回“消失”的提交', 'Recovered a “lost” commit with reflog'), test: ({ levelId, done }) => done && (levelId === 'c2-6' || levelId === 'c2-7') },
    { id: 'rejected_calm', icon: '🧘', name: T('被拒绝也不慌', 'Calm when rejected'), desc: T('push 被拒绝后，先拉再推成功', 'After a rejected push, pulled first and then pushed successfully'), test: ({ cmd, res, state }) => /^git push/.test(cmd) && res.ok && state.wasRejected },
    { id: 'stash_master', icon: '🎒', name: T('随身背包', 'Backpack'), desc: T('用 stash 暂存并取回改动', 'Stashed changes and got them back'), test: ({ cmd, res }) => /^git stash pop/.test(cmd) && res.ok },
    { id: 'rebase_pro', icon: '📏', name: T('捋直历史', 'Straight history'), desc: T('成功完成一次 rebase', 'Completed a rebase'), test: ({ res }) => /Successfully rebased/.test(res.out || '') },
    { id: 'bisect_detective', icon: '🕵️', name: T('二分侦探', 'Bisect detective'), desc: T('用 bisect 揪出肇事提交', 'Tracked down the culprit commit with bisect'), test: ({ res }) => /is the first bad commit/.test(res.out || '') },
    { id: 'force_disaster', icon: '💥', name: T('翻车现场', 'Crash scene'), desc: T('强推覆盖了同事的提交……教训深刻', 'Force-pushed over a teammate\'s commits… lesson learned'), test: ({ cmd, res }) => /^git push .*(-f\b|--force\b)/.test(cmd) && !/with-lease/.test(cmd) && /forced update/.test(res.out || '') },
    { id: 'lease', icon: '🛡️', name: T('安全强推', 'Safe force-push'), desc: T('--force-with-lease 保护了同事', '--force-with-lease protected your teammate'), test: ({ cmd, res }) => /--force-with-lease/.test(cmd) && /stale info/.test(res.err || '') },
    { id: 'team_player', icon: '🤝', name: T('团队玩家', 'Team player'), desc: T('完成功能分支协作流程', 'Completed the feature-branch workflow'), test: ({ levelId, done }) => done && levelId === 'c5-6' },
    { id: 'blame_game', icon: '🔍', name: T('真相只有一个', 'One truth prevails'), desc: T('用 blame 找到并撤销错误提交', 'Found and reverted the bad commit with blame'), test: ({ levelId, done }) => done && levelId === 'c7-1' },
    { id: 'no_hints', icon: '🌟', name: T('无提示通关', 'No hints needed'), desc: T('不看提示完成任意 5 关', 'Finish any 5 levels without hints'), test: ({ completed }) => Object.values(completed).filter(c => c && c.stars === 3).length >= 5 },
    { id: 'chapter_all', icon: '🏆', name: T('全章通关', 'All chapters cleared'), desc: T('完成全部 41 个教学关卡', 'Complete all 41 teaching levels'), test: ({ completed, total }) => Object.keys(completed).length >= total },
    { id: 'rm_git', icon: '🪦', name: T('历史湮灭', 'History erased'), desc: T('删掉了 .git 目录（沙盒里没关系，现实里别这么干）', 'Deleted the .git directory (fine in the sandbox, never do it for real)'), test: ({ cmd, res }) => /^rm -rf? .*\.git\b/.test(cmd) && res.ok },
    { id: 'helper', icon: '📖', name: T('会看文档', 'Reads the docs'), desc: T('使用 git help 或速查', 'Used git help or the cheat sheet'), test: ({ cmd }) => /^git help|^help/.test(cmd) },
  ];

  /* ---------- 新手引导（旅程总览之后、第一次进入动手阶段时运行） ---------- */
  const TOUR = [
    { sel: '#questline', title: T('任务线：全程一目了然', 'The quest line: the whole journey at a glance'), text: T('每一段是一个阶段，每个圆点是一关：绿色 ✓ 是完成的，闪烁的是你现在所在的关。悬停（手机上长按）看关卡名，点一下直接跳过去。顶栏的“🧭 旅程”可以随时看全程。', 'Each segment is a stage and each dot a level: green ✓ means done, the pulsing one is where you are. Hover (long-press on a phone) to see a level\'s name; click to jump there. “🧭 Journey” in the top bar shows the full road any time.') },
    { sel: '.task-current', fallback: '#lesson', title: T('当前任务：一次只做一件事', 'Current task: one thing at a time'), text: T('这张卡片写着这一步要做什么、为什么。卡住了点“💡 提示”（不看提示通关得 3 星）。已完成的任务会收起来，后面的任务先变暗。想回顾问题背景，点上面的“重看简报”。', 'This card says what to do now and why. Stuck? Click “💡 Hint” (finish without hints for 3 stars). Finished tasks fold away and later ones stay dimmed. Click “Briefing” above to revisit the problem.') },
    { sel: '#terminal-wrap', title: T('终端 + 导师', 'Terminal + mentor'), text: T('和真实 shell 一样：Tab 补全、↑↓ 历史、<code>edit 文件</code> 打开编辑器。放心输错：终端下方的导师 🧙 会解释报错的原因和改法，随时可以“↺ 重置本关”。', 'Just like a real shell: Tab completion, ↑↓ history, <code>edit &lt;file&gt;</code> opens an editor. Mistakes are welcome: the mentor 🧙 under the terminal explains each error and how to fix it, and “↺ Reset level” is always there.') },
    { sel: '#viz', title: T('右边：看见 git 的内部', 'Right: see inside git'), text: T('提交图、三棵树（工作区 / 暂存区 / HEAD）、原理对比、多人与远程。<b>发光的标签</b>就是这一步最值得看的地方。', 'Commit graph, three trees (working tree / staging area / HEAD), analogy, team & remote. <b>The glowing tab</b> is the one worth watching for this step.') },
  ];
  function runTour(onDone) {
    let i = 0;
    const box = document.createElement('div'); box.className = 'tour';
    const visible = el => { if (!el) return false; const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
    const steps = TOUR.filter(s => visible(document.querySelector(s.sel)) || (s.fallback && visible(document.querySelector(s.fallback))));
    if (!steps.length) { onDone(); return; }
    const finish = () => { box.remove(); window.removeEventListener('resize', render); onDone(); };
    function render() {
      const s = steps[i]; let target = document.querySelector(s.sel); if (!visible(target)) target = document.querySelector(s.fallback);
      if (target.scrollIntoView) target.scrollIntoView({ block: 'nearest' });
      const r = target.getBoundingClientRect(); const pad = 4;
      box.innerHTML = `<div class="tour-mask"></div><div class="tour-spot" style="left:${r.left - pad}px;top:${r.top - pad}px;width:${r.width + pad * 2}px;height:${r.height + pad * 2}px"></div><div class="tour-card"><div class="tour-step">${i + 1} / ${steps.length}</div><h3>${s.title}</h3><p>${s.text}</p><div class="tour-btns"><button class="skip">${T('跳过', 'Skip')}</button><button class="primary next">${i === steps.length - 1 ? T('开始吧 🎮', 'Let\'s go 🎮') : T('下一步 →', 'Next →')}</button></div></div>`;
      const card = box.querySelector('.tour-card'); const cw = Math.min(380, innerWidth - 24); card.style.width = cw + 'px';
      const ch = card.offsetHeight || 200; const gap = 12;
      let left = Math.min(Math.max(r.left + r.width / 2 - cw / 2, 12), innerWidth - cw - 12); let top;
      if (r.bottom + gap + ch < innerHeight) top = r.bottom + gap;
      else if (r.top - gap - ch > 0) top = r.top - gap - ch;
      else if (r.right + gap + cw < innerWidth) { left = r.right + gap; top = Math.min(Math.max(r.top, 12), innerHeight - ch - 12); }
      else if (r.left - gap - cw > 0) { left = r.left - gap - cw; top = Math.min(Math.max(r.top, 12), innerHeight - ch - 12); }
      else top = Math.max(12, innerHeight - ch - 12);
      card.style.left = left + 'px'; card.style.top = top + 'px';
      box.querySelector('.next').onclick = () => { i++; if (i >= steps.length) finish(); else render(); };
      box.querySelector('.skip').onclick = finish;
    }
    document.body.appendChild(box); render();
    window.addEventListener('resize', render);
  }

  global.GitGameFx = { Sound, confetti, RANKS, rankFor, starsFor, ACHIEVEMENTS, runTour };
})(typeof window !== 'undefined' ? window : globalThis);
