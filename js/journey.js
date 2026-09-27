/* 旅程层：阶段与关卡顺序、旅程总览、任务线、简报卡片、总结卡片。
 * 叙事数据来自 js/curriculum.js（window.GitCurriculum，可能缺失或不完整），
 * 缺什么就回退到 js/levels.js 里的章节 / intro / done。这里只产出 HTML，事件在 main.js 里绑定。 */
(function (global) {
  'use strict';
  const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const { LEVELS, CHAPTERS } = global.GitLevels;
  const CH_ICONS = ['📁', '💾', '⏪', '🌿', '⚔️', '🌐', '🚑', '🔍', '🏖️'];
  const cur = () => (global.GitCurriculum && typeof global.GitCurriculum === 'object') ? global.GitCurriculum : null;
  const arr = v => Array.isArray(v) ? v.filter(x => x != null && x !== '') : (v == null || v === '') ? [] : [v];
  const byId = id => LEVELS.find(l => l.id === id);
  /* 课程文本按纯文本处理（里面可能有 <<<<<<< 或 <file> 这样的字面量），`反引号` 变成代码 */
  const txt = v => { if (v == null) return ''; if (typeof v === 'object') return txt(v.text || v.pain || v.idea || ''); return esc(v).replace(/`([^`]+)`/g, '<code>$1</code>'); };
  const cmdList = v => Array.isArray(v) ? v.filter(Boolean) : typeof v === 'string' && v.trim() ? v.split(/\s*[\/,，、]\s*(?=git\b|\.|[a-z])/i) : [];
  const chips = (cmds, used) => cmdList(cmds).map(c => `<code class="chip${used && used(c) ? ' used' : ''}">${esc(c)}</code>`).join('');

  /* ---------- 阶段与顺序 ---------- */
  let cache = null;
  function stages() {
    if (cache) return cache;
    const C = cur();
    let st;
    if (C && Array.isArray(C.stages) && C.stages.length) {
      st = C.stages.filter(Boolean).map((s, i) => ({ ...s, id: s.id != null ? String(s.id) : 'stage' + i, icon: s.icon || '🧭', title: s.title || T(`第 ${i} 站`, `Stage ${i}`), levels: arr(s.levels).filter(id => byId(id)) }));
    } else {
      st = CHAPTERS.map(ch => ({ id: 'ch' + ch.id, icon: CH_ICONS[ch.id] || '🧭', title: ch.title, question: ch.desc, levels: LEVELS.filter(l => l.chapter === ch.id).map(l => l.id), fallback: true }));
    }
    const seen = new Set();
    for (const s of st) s.levels = s.levels.filter(id => (seen.has(id) ? false : (seen.add(id), true)));
    const missing = LEVELS.filter(l => !seen.has(l.id)).map(l => l.id);
    if (missing.length) st.push({ id: 'more', icon: '➕', title: T('更多关卡', 'More levels'), levels: missing });
    cache = st.filter(s => s.levels.length);
    return cache;
  }
  const order = () => stages().flatMap(s => s.levels);
  const stageOf = id => stages().find(s => s.levels.includes(id)) || null;
  const shortTitle = s => s.short || String(s.title || '').split(/\s*[:：·]\s*/).pop();
  function levelCur(id) { const C = cur(); const c = C && C.levels && C.levels[id]; return c && typeof c === 'object' ? c : null; }
  function taskCur(id, i) { const c = levelCur(id); const t = c && Array.isArray(c.tasks) ? c.tasks[i] : null; return t && typeof t === 'object' ? t : null; }
  const maxDiff = () => Math.max(3, ...stages().map(s => +s.difficulty || 0));
  const diffStars = d => { d = Math.max(0, Math.min(maxDiff(), Math.round(+d || 0))); return d ? '★'.repeat(d) + '☆'.repeat(maxDiff() - d) : ''; };
  const numberOf = id => order().indexOf(id) + 1;
  const isPlayable = id => { const l = byId(id); return l && !l.sandbox; };
  function nextRecommended(completed) { return order().find(id => isPlayable(id) && !completed[id]) || null; }
  const starStr = c => c ? '★'.repeat(c.stars || 1) + '☆'.repeat(3 - (c.stars || 1)) : '';

  /* ---------- 旅程总览 ---------- */
  const LOOP = () => `<span>🎯 ${T('遇到问题', 'Hit a problem')}</span><i>→</i><span>🪵 ${T('没有 git 的笨办法', 'The crude no-git way')}</span><i>→</i><span>⚡ ${T('git 的做法', 'The git way')}</span><i>→</i><span>🛠️ ${T('动手（错了也没关系）', 'Practice (mistakes welcome)')}</span><i>→</i><span>📋 ${T('总结', 'Debrief')}</span>`;
  function overviewHtml({ completed, currentId, startLabel }) {
    const rec = nextRecommended(completed);
    const playable = order().filter(isPlayable);
    const doneAll = playable.filter(id => completed[id]).length;
    const road = stages().map((s, si) => {
      const ls = s.levels; const pl = ls.filter(isPlayable); const d = pl.filter(id => completed[id]).length;
      const state = pl.length && d === pl.length ? 'done' : ls.includes(currentId) ? 'current' : '';
      const expect = arr(s.expect);
      const nodes = ls.map(id => { const l = byId(id); const c = completed[id]; return `<button class="jv-node ${c ? 'done' : ''} ${id === currentId ? 'current' : ''} ${id === rec ? 'next' : ''}" data-id="${esc(id)}" title="${esc(l.title)}"><span class="dot">${l.sandbox ? '🎮' : c ? '✓' : numberOf(id)}</span><span class="t">${esc(l.title)}</span>${c ? `<span class="st">${starStr(c)}</span>` : id === rec ? `<span class="rec">${T('推荐', 'next')}</span>` : ''}</button>`; }).join('');
      return `<li class="jv-stage ${state}" data-stage="${esc(s.id)}">
<div class="jv-rail"><span class="jv-icon">${s.icon}</span></div>
<div class="jv-card">
  <div class="jv-top"><h2>${esc(s.title)}</h2>${s.difficulty ? `<span class="jv-diff" title="${T('难度', 'Difficulty')}">${T('难度', 'Difficulty')} <b>${diffStars(s.difficulty)}</b></span>` : ''}<span class="jv-prog">${pl.length ? `<span class="bar"><i style="width:${Math.round(d / pl.length * 100)}%"></i></span>${d}/${pl.length}` : T('自由玩', 'free play')}</span></div>
  <div class="jv-body">
    <div class="jv-story">
      ${s.question ? `<p class="jv-q">${txt(s.question)}</p>` : ''}
      ${s.crude || s.git ? `<div class="jv-cmp">${s.crude ? `<div class="crude"><b>🪵 ${T('没有 git：', 'Without git: ')}</b>${txt(s.crude)}</div>` : ''}${s.git ? `<div class="git"><b>⚡ git：</b>${txt(s.git)}${cmdList(s.commands).length ? `<div class="chips">${chips(s.commands)}</div>` : ''}</div>` : ''}</div>` : ''}
      ${expect.length ? `<div class="jv-expect"><b>🧭 ${T('你会经历', 'What you\'ll run into')}</b><ul>${expect.map(e => `<li>${txt(e)}</li>`).join('')}</ul></div>` : ''}
    </div>
    <div class="jv-levels">${nodes}</div>
  </div>
</div></li>`;
    }).join('');
    return `<div class="jv-inner">
<header class="jv-head">
  <div class="jv-title"><h1>🧭 ${T('你的 git 旅程', 'Your git journey')}</h1><p class="jv-sub">${T(`${stages().length} 个阶段 · ${playable.length} 关 · 已完成 ${doneAll} 关`, `${stages().length} stages · ${playable.length} levels · ${doneAll} done`)}</p></div>
  <div class="jv-actions"><button class="primary big jv-start">${startLabel}</button><button id="levels-close" class="jv-close" title="${T('关闭', 'Close')}">✕</button></div>
</header>
<div class="jv-loop"><b>${T('每一关都是同一个节奏：', 'Every level follows the same loop:')}</b> ${LOOP()}</div>
<ol class="jv-road">${road}</ol>
<footer class="jv-foot"><button class="primary big jv-start">${startLabel}</button><p class="muted small">${T('随时可以从顶栏的“🧭 旅程”回到这里，也可以点任意关卡直接跳过去。', 'Come back any time with “🧭 Journey” in the top bar, or click any level to jump straight to it.')}</p></footer>
</div>`;
  }

  /* ---------- 任务线 ---------- */
  function questLineHtml({ completed, currentId }) {
    const rec = nextRecommended(completed);
    return stages().map(s => {
      const pl = s.levels.filter(isPlayable); const d = pl.filter(id => completed[id]).length;
      const here = s.levels.includes(currentId);
      return `<div class="ql-seg ${here ? 'here' : ''} ${pl.length && d === pl.length ? 'done' : ''}" ><span class="ql-stage" data-tip="${esc(s.icon + ' ' + s.title + (pl.length ? ` · ${d}/${pl.length}` : ''))}"><span class="ql-icon">${s.icon}</span><span class="ql-name">${esc(shortTitle(s))}</span></span><span class="ql-dots">${s.levels.map(id => { const l = byId(id); const c = completed[id]; const tip = `${numberOf(id)}. ${l.title}${c ? '  ✓ ' + starStr(c) : id === rec ? T('  · 推荐下一关', '  · recommended next') : ''}`; return `<button class="ql-dot ${c ? 'done' : ''} ${id === currentId ? 'current' : ''} ${id === rec && id !== currentId ? 'next' : ''} ${l.sandbox ? 'sandbox' : ''}" data-id="${esc(id)}" data-tip="${esc(tip)}" aria-label="${esc(tip)}"></button>`; }).join('')}</span></div>`;
    }).join('');
  }

  /* ---------- 简报 ---------- */
  function briefSteps(lv) {
    const c = levelCur(lv.id);
    const steps = [];
    const detail = lv.intro ? `<details class="b-detail"><summary>📖 ${T('详细讲解', 'Full explanation')}</summary><div class="intro">${lv.intro}</div></details>` : '';
    if (c && c.problem && (c.problem.title || c.problem.story)) steps.push({ key: 'problem', icon: '🎯', label: T('问题', 'Problem'), html: `<div class="b-kicker">🎯 ${T('你遇到的问题', 'The problem you hit')}</div>${c.problem.title ? `<h3>${txt(c.problem.title)}</h3>` : ''}${c.problem.story ? `<p class="b-story">${txt(c.problem.story)}</p>` : ''}` });
    if (c && c.crude && (arr(c.crude.steps).length || c.crude.pain)) {
      const st = arr(c.crude.steps);
      steps.push({ key: 'crude', icon: '🪵', label: T('没有 git', 'Without git'), html: `<div class="b-kicker">🪵 ${T('没有 git，你会怎么做', 'Without git, you would…')}</div>${st.length ? `<div class="storyboard">${st.map((s, i) => `${i ? '<span class="sb-arrow">→</span>' : ''}<div class="sb-frame"><div class="sb-icon">${esc(typeof s === 'object' ? s.icon || '•' : '•')}</div><div class="sb-text">${txt(typeof s === 'object' ? s.text : s)}</div></div>`).join('')}</div>` : ''}${c.crude.pain ? `<div class="b-pain"><b>😣 ${T('代价', 'The cost')}</b>${txt(c.crude.pain)}</div>` : ''}` });
    }
    if (c && c.git && (c.git.idea || cmdList(c.git.commands).length)) steps.push({ key: 'git', icon: '⚡', label: T('git 的做法', 'With git'), html: `<div class="b-kicker">⚡ ${T('git 的做法', 'The git way')}</div>${c.git.idea ? `<p class="b-idea">${txt(c.git.idea)}</p>` : ''}${cmdList(c.git.commands).length ? `<div class="b-sub">${T('本关会用到（点一下填进终端）', 'Used in this level (click to put it in the terminal)')}</div><div class="chips">${chips(c.git.commands)}</div>` : ''}` });
    const ex = c ? arr(c.expect) : [];
    if (ex.length) steps.push({ key: 'expect', icon: '🧭', label: T('会经历', 'Expect'), html: `<div class="b-kicker">🧭 ${T('本关你可能会经历', 'What you may run into')}</div><ul class="b-expect">${ex.map(e => `<li>${txt(e)}</li>`).join('')}</ul><p class="muted small">${T('输错命令也没关系：终端下方的导师 🧙 会告诉你原因。', 'Typing a wrong command is fine: the mentor 🧙 under the terminal explains what happened.')}</p>` });
    if (!steps.length) steps.push({ key: 'intro', icon: '📖', label: T('讲解', 'Lesson'), html: `<div class="intro">${lv.intro || ''}</div>` });
    else if (detail) { const g = steps.find(s => s.key === 'git') || steps[steps.length - 1]; g.html += detail; }
    return steps;
  }
  function briefingHtml(lv, step, { started }) {
    const steps = briefSteps(lv); step = Math.max(0, Math.min(step, steps.length - 1));
    const last = step === steps.length - 1;
    const stepper = steps.length > 1 ? `<div class="b-stepper">${steps.map((s, i) => `<button class="b-pill ${i === step ? 'on' : ''} ${i < step ? 'past' : ''}" data-step="${i}"><span>${s.icon}</span>${esc(s.label)}</button>`).join('')}</div>` : '';
    return { count: steps.length, step, html: `${stepper}<div class="b-card" data-key="${steps[step].key}">${steps[step].html}</div>
<div class="b-nav"><button class="b-prev" ${step === 0 ? 'disabled' : ''}>← ${T('上一步', 'Back')}</button><span class="b-count muted small">${steps.length > 1 ? `${step + 1} / ${steps.length}` : ''}</span>${last ? `<button class="primary b-start">${started ? T('回到任务 ▶', 'Back to tasks ▶') : T('开始动手 ▶', 'Start practising ▶')}</button>` : `<button class="primary b-next">${T('下一步 →', 'Next →')}</button>`}</div>
${last ? '' : `<div class="b-skip"><a href="#" class="b-skip-link">${started ? T('回到任务 →', 'Back to tasks →') : T('跳过简报，直接动手 →', 'Skip the briefing →')}</a></div>`}` };
  }
  function problemBarHtml(lv) {
    const c = levelCur(lv.id);
    const title = c && c.problem && c.problem.title ? txt(c.problem.title) : esc(lv.title);
    return `<span class="pb-icon">🎯</span><span class="pb-text" title="${esc(c && c.problem && c.problem.title || lv.title)}">${title}</span><button class="pb-rebrief">${T('重看简报', 'Briefing')}</button>`;
  }

  /* ---------- 总结 ---------- */
  function debriefHtml(lv, { stars, xp, nextId, usedCmd, justDone }) {
    const c = levelCur(lv.id); const r = c && c.recap ? c.recap : null;
    const cmds = c && c.git ? cmdList(c.git.commands) : [];
    const nl = nextId ? byId(nextId) : null;
    const pit = r ? arr(r.pitfalls) : [];
    return `<div class="db-head ${justDone ? 'fresh' : ''}"><div class="db-title">🎉 ${T('本关完成！', 'Level complete!')}</div><div class="stars-big">${'★'.repeat(stars)}${'☆'.repeat(3 - stars)}</div><div class="muted small">${stars === 3 ? T('没有看提示，满星！', 'No hints used: full stars!') : T('不看提示重玩可以拿到 3 星。', 'Replay without hints to earn 3 stars.')} <span class="xp-gain">+${xp} XP</span></div></div>
${r && (r.crude || r.git) ? `<div class="db-compare"><div class="col crude"><b>🪵 ${T('没有 git', 'Without git')}</b><p>${txt(r.crude)}</p></div><div class="col git"><b>⚡ ${T('用 git', 'With git')}</b><p>${txt(r.git)}</p></div></div>` : ''}
${cmds.length ? `<div class="db-sec"><b>🧰 ${T('本关用到的命令', 'Commands in this level')}</b><div class="chips">${chips(cmds, usedCmd)}</div></div>` : ''}
${pit.length ? `<div class="db-sec"><b>⚠️ ${T('常见的坑', 'Common pitfalls')}</b><ul class="db-pit">${pit.map(p => `<li>${txt(p)}</li>`).join('')}</ul></div>` : ''}
${lv.done ? (r ? `<details class="db-more"><summary>🔎 ${T('再探索一下', 'Explore a bit more')}</summary><div class="intro">${lv.done}</div></details>` : `<div class="db-sec intro">${lv.done}</div>`) : ''}
<div class="db-next">${r && r.next ? `<div class="db-teaser">${txt(r.next)}</div>` : nl ? `<div class="db-teaser">${T('下一关：', 'Next: ')}${esc(nl.title)}</div>` : ''}
<div class="db-btns">${nl ? `<button id="btn-next-inline" class="primary">${T('下一关', 'Next level')}：${numberOf(nextId)}. ${esc(nl.title)} →</button>` : `<button id="btn-journey-inline" class="primary">🧭 ${T('查看旅程', 'View the journey')}</button>`}<button id="btn-replay-inline">${T('重玩本关', 'Replay level')}</button></div></div>`;
  }

  global.GitJourney = { stages, order, stageOf, shortTitle, levelCur, taskCur, numberOf, nextRecommended, isPlayable, diffStars, overviewHtml, questLineHtml, briefSteps, briefingHtml, problemBarHtml, debriefHtml, esc, txt, cmdList };
})(typeof window !== 'undefined' ? window : globalThis);
