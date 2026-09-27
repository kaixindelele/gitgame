/* 界面组件：终端、SVG 提交图、三棵树表、多仓库视图、编辑器 */
(function (global) {
  'use strict';
  const { abbrev } = global.GitCore;
  const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const $ = sel => document.querySelector(sel);
  const COLORS = ['#6cb6ff', '#5fd38d', '#f2c94c', '#c792ea', '#f5a25d', '#ff6b6b', '#4dd0e1', '#ff8fab'];

  /* ---------- 终端输出高亮（模仿真实 git 的配色） ---------- */
  function highlight(text) {
    let section = null;
    return text.split('\n').map(line => {
      const e = esc(line);
      if (/^(Changes to be committed|Changes not staged for commit|Untracked files|Unmerged paths):/.test(line)) { section = line.startsWith('Changes to be') ? 'staged' : line.startsWith('Untracked') ? 'untracked' : line.startsWith('Unmerged') ? 'conflict' : 'unstaged'; return `<span class="hl-section">${e}</span>`; }
      if (/^\t/.test(line) && section) return `<span class="hl-${section === 'conflict' ? 'unstaged' : section}">${e}</span>`;
      if (/^(diff --git|index [0-9a-f]+\.\.|new file mode|deleted file mode)/.test(line)) return `<span class="hl-meta">${e}</span>`;
      if (/^\+\+\+ |^--- /.test(line)) return `<span class="hl-meta">${e}</span>`;
      if (/^@@/.test(line)) return `<span class="hl-hunk">${e}</span>`;
      if (/^\+/.test(line)) return `<span class="hl-add">${e}</span>`;
      if (/^-/.test(line) && !/^- \[deleted\]/.test(line)) return `<span class="hl-del">${e}</span>`;
      if (/^\s*(<<<<<<<|=======|>>>>>>>)/.test(line)) return `<span class="hl-marker">${e}</span>`;
      if (/CONFLICT/.test(line)) return `<span class="hl-conflict">${e}</span>`;
      if (/is the first bad commit/.test(line)) return `<span class="hl-found">${e}</span>`;
      if (/^(error|fatal):/.test(line) || /\[rejected\]|\[remote rejected\]|Aborting|Automatic merge failed/.test(line)) return `<span class="hl-err">${e}</span>`;
      if (/^hint:/.test(line)) return `<span class="hl-hint">${e}</span>`;
      if (/^(warning|Warning):/.test(line)) return `<span class="hl-warn">${e}</span>`;
      if (/^(Fast-forward|Successfully rebased|Merge made by|Switched to|Already up to date|Saved working directory|Deleted branch|Dropped refs)/.test(line) || /\[new branch\]|\[new tag\]/.test(line)) return `<span class="hl-ok">${e}</span>`;
      const deco = e.replace(/\((HEAD[^)]*)\)/, (m, inner) => '(' + inner.split(', ').map(d => d.startsWith('HEAD') ? `<span class="hl-head">${d}</span>` : d.startsWith('tag: ') ? `<span class="hl-tag">${d}</span>` : /\//.test(d) ? `<span class="hl-remote">${d}</span>` : `<span class="hl-branch">${d}</span>`).join(', ') + ')');
      if (/^commit [0-9a-f]{40}/.test(line)) return deco.replace(/^(commit [0-9a-f]{40})/, '<span class="hl-hash">$1</span>');
      if (/^[0-9a-f]{7,8} /.test(line)) return deco.replace(/^([0-9a-f]{7,8})/, '<span class="hl-hash">$1</span>');
      if (/^\[[^\]]+ [0-9a-f]{7}\]/.test(line)) return e.replace(/^(\[[^\]]+\])/, '<span class="hl-ok">$1</span>');
      return deco;
    }).join('\n');
  }

  /* ---------- 终端 ---------- */
  class Terminal {
    constructor(el, opts) {
      this.el = el; this.out = el.querySelector('#term-output'); this.input = el.querySelector('#term-input'); this.promptEl = el.querySelector('#term-prompt');
      this.history = []; this.hIdx = 0; this.opts = opts;
      this.input.addEventListener('keydown', e => this.onKey(e));
      el.addEventListener('click', e => { if (e.target.closest('a,button')) return; if (window.getSelection().toString()) return; this.input.focus(); });
    }
    setPrompt(p) { this.promptEl.textContent = p; }
    append(text, cls = 't-out') { if (text === '' || text == null) return; const d = document.createElement('div'); d.className = cls; if (cls === 't-out' || cls === 't-err') d.innerHTML = highlight(text); else d.textContent = text; this.out.appendChild(d); this.scroll(); }
    mate(avatar, who, prompt, line, output) { const d = document.createElement('div'); d.className = 't-mate'; d.innerHTML = `<span class="avatar">${avatar}</span><div><span class="prompt">${esc(who)} ${esc(prompt)}</span>${esc(line)}${output ? '\n' + highlight(output) : ''}</div>`; this.out.appendChild(d); this.scroll(); }
    appendHtml(html, cls) { const d = document.createElement('div'); d.className = cls || 't-out'; d.innerHTML = html; this.out.appendChild(d); this.scroll(); }
    echoCommand(prompt, line, cls = 't-cmd') { const d = document.createElement('div'); d.className = cls; const p = document.createElement('span'); p.className = 'prompt'; p.textContent = prompt; d.appendChild(p); d.appendChild(document.createTextNode(line)); this.out.appendChild(d); this.scroll(); }
    clear() { this.out.innerHTML = ''; }
    scroll() { this.el.scrollTop = this.el.scrollHeight; }
    onKey(e) {
      if (e.key === 'Enter') { const line = this.input.value; this.input.value = ''; if (line.trim()) { this.history.push(line); } this.hIdx = this.history.length; this.opts.onCommand(line); e.preventDefault(); }
      else if (e.key === 'ArrowUp') { if (this.hIdx > 0) { this.hIdx--; this.input.value = this.history[this.hIdx]; } e.preventDefault(); }
      else if (e.key === 'ArrowDown') { if (this.hIdx < this.history.length - 1) { this.hIdx++; this.input.value = this.history[this.hIdx]; } else { this.hIdx = this.history.length; this.input.value = ''; } e.preventDefault(); }
      else if (e.key === 'Tab') { e.preventDefault(); this.complete(); }
      else if (e.key === 'l' && e.ctrlKey) { e.preventDefault(); this.clear(); }
      else if (e.key === 'c' && e.ctrlKey && !window.getSelection().toString()) { e.preventDefault(); this.input.value = ''; }
    }
    complete() {
      const v = this.input.value; const cands = this.opts.completions(v);
      if (!cands.length) return;
      const parts = v.split(' '); const last = parts[parts.length - 1];
      const matches = cands.filter(c => c.startsWith(last));
      if (!matches.length) return;
      if (matches.length === 1) { parts[parts.length - 1] = matches[0]; this.input.value = parts.join(' ') + (matches[0].endsWith('/') ? '' : ' '); return; }
      let common = matches[0]; for (const m of matches) { let i = 0; while (i < common.length && common[i] === m[i]) i++; common = common.slice(0, i); }
      if (common.length > last.length) { parts[parts.length - 1] = common; this.input.value = parts.join(' '); }
      else this.append(matches.join('  '), 't-info');
    }
  }

  /* ---------- 提交图布局 ---------- */
  function layoutGraph(repo) {
    const tips = [...repo.refs.values()].map(h => repo.peel(h));
    if (repo.headHash()) tips.push(repo.headHash());
    for (const s of repo.stash) tips.push(s.hash);
    if (repo.state.rebase) tips.push(repo.state.rebase.origHead);
    if (repo.state.bisect) tips.push(repo.state.bisect.origHead);
    const order = repo.revList([...new Set(tips)]);
    let cols = [];
    const nodes = new Map();
    order.forEach((h, row) => {
      let col = cols.indexOf(h);
      if (col === -1) { col = cols.length; cols.push(h); }
      const c = repo.getCommit(h);
      nodes.set(h, { hash: h, col, row, parents: c.parents, commit: c });
      if (!c.parents.length) cols.splice(col, 1);
      else {
        cols[col] = c.parents[0];
        for (let k = 1; k < c.parents.length; k++) if (!cols.includes(c.parents[k])) cols.splice(col + 1, 0, c.parents[k]);
        cols = cols.filter((x, i) => cols.indexOf(x) === i);
      }
    });
    return { order, nodes };
  }

  const seenNodes = new WeakMap();
  function renderGraph(svg, repo, opts = {}) {
    const { order, nodes } = layoutGraph(repo);
    const prev = seenNodes.get(svg) || null; const prevRepo = svg.__repo;
    const newSet = new Set(); if (prev && prevRepo === repo) for (const h of order) if (!prev.has(h)) newSet.add(h);
    seenNodes.set(svg, new Set(order)); svg.__repo = repo;
    const X0 = 22, DX = 24, Y0 = 22, DY = opts.compact ? 26 : 34;
    const maxCol = Math.max(0, ...[...nodes.values()].map(n => n.col));
    const labelX = X0 + (maxCol + 1) * DX + 8;
    const width = Math.max(opts.width || 420, labelX + 320);
    const height = Y0 + Math.max(order.length, 1) * DY;
    svg.setAttribute('width', width); svg.setAttribute('height', height); svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    const xy = n => [X0 + n.col * DX, Y0 + n.row * DY];
    let out = '';
    if (!order.length) { svg.innerHTML = `<text x="12" y="24" class="g-label" fill="#8b95a7">${T('（还没有提交）', '(no commits yet)')}</text>`; return; }
    // 边
    for (const n of nodes.values()) {
      const [x1, y1] = xy(n);
      for (const p of n.parents) {
        const pn = nodes.get(p); if (!pn) continue;
        const [x2, y2] = xy(pn);
        const color = COLORS[(x1 === x2 ? n.col : pn.col) % COLORS.length];
        if (x1 === x2) out += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="2"/>`;
        else out += `<path d="M ${x1} ${y1} C ${x1} ${y1 + DY * 0.6}, ${x2} ${y2 - DY * 0.6}, ${x2} ${y2}" fill="none" stroke="${color}" stroke-width="2"/>`;
      }
    }
    // 节点与标签
    const head = repo.headHash();
    const reachableFromHead = head ? repo.ancestors(head) : new Set();
    for (const n of nodes.values()) {
      const [x, y] = xy(n);
      const color = COLORS[n.col % COLORS.length];
      const isHead = n.hash === head;
      const merge = n.parents.length > 1;
      out += `<g class="g-node" data-hash="${n.hash}">`;
      out += `<circle class="${newSet.has(n.hash) ? 'g-new' : ''}" cx="${x}" cy="${y}" r="${merge ? 6.5 : 5.5}" fill="${merge ? '#11151c' : color}" stroke="${isHead ? '#fff' : color}" stroke-width="${isHead ? 3 : 2}"/>`;
      let lx = labelX;
      const decos = repo.decorations(n.hash);
      let pills = '';
      for (const d of decos) {
        const isHeadPill = d.startsWith('HEAD'); const isTag = d.startsWith('tag: '); const isRemote = !isHeadPill && !isTag && d.includes('/') && repo.refs.has('refs/remotes/' + d);
        const bg = isHeadPill ? '#2e6b45' : isTag ? '#5a4a1e' : isRemote ? '#4a3a5a' : '#24384f';
        const fg = isHeadPill ? '#c8ffd9' : isTag ? '#ffe08a' : isRemote ? '#e5c8ff' : '#9cd1ff';
        const w = d.length * 6.6 + 12;
        pills += `<rect x="${lx}" y="${y - 8}" width="${w}" height="16" rx="8" fill="${bg}"/><text x="${lx + 6}" y="${y + 3.5}" class="g-pill" fill="${fg}">${esc(d)}</text>`;
        lx += w + 4;
      }
      for (const s of repo.stash) if (s.hash === n.hash) { const d = 'stash'; const w = d.length * 6.6 + 12; pills += `<rect x="${lx}" y="${y - 8}" width="${w}" height="16" rx="8" fill="#3d3d3d"/><text x="${lx + 6}" y="${y + 3.5}" class="g-pill" fill="#ddd">${d}</text>`; lx += w + 4; }
      const subj = n.commit.message.split('\n')[0];
      const dim = !reachableFromHead.has(n.hash) && !opts.compact;
      out += pills + `<text x="${lx}" y="${y + 4}" class="g-label" opacity="${dim ? 0.75 : 1}"><tspan class="g-hash">${abbrev(n.hash)}</tspan> ${esc(subj.length > 40 ? subj.slice(0, 40) + '…' : subj)}</text>`;
      out += `<title>${esc(n.hash)}\n${esc(n.commit.author.name)}\n${esc(subj)}</title></g>`;
    }
    svg.innerHTML = out;
    if (opts.onSelect) svg.querySelectorAll('.g-node').forEach(g => g.addEventListener('click', () => opts.onSelect(g.dataset.hash)));
  }

  function commitDetailHtml(repo, hash) {
    const c = repo.getCommit(hash);
    const pt = repo.treeOfCommit(c.parents[0] || null);
    const t = repo.treeOfCommit(hash);
    const changes = repo.diffTrees(pt, t);
    const files = [...t.keys()].sort().map(p => { const ch = changes.find(x => x.path === p); const cls = ch ? (ch.status === 'A' ? 'st-staged' : 'st-modified') : 'st-clean'; return `<span class="${cls}" title="${ch ? (ch.status === 'A' ? T('本次新增', 'added in this commit') : T('本次修改', 'modified in this commit')) : T('与父提交相同（共享 blob）', 'same as the parent (shared blob)')}">${ch ? (ch.status === 'A' ? '+' : '~') : '='} ${esc(p)}</span>`; }).join('');
    const del = changes.filter(x => x.status === 'D').map(x => `<span class="st-deleted">− ${esc(x.path)}</span>`).join('');
    return `<div><b>commit</b> <code>${hash}</code></div><div><b>parent</b> ${c.parents.length ? c.parents.map(p => `<code>${abbrev(p)}</code>`).join(' ') : T('（根提交）', '(root commit)')} · <b>tree</b> <code>${abbrev(c.tree)}</code></div><div><b>author</b> ${esc(c.author.name)} · ${global.GitCore.fmtDate(c.authorDate)}</div><div style="margin:4px 0"><b>message</b> ${esc(c.message.trim())}</div><div class="files">${T('<b>快照内容</b>（+ 新增，~ 修改，= 相同）', '<b>Snapshot contents</b> (+ added, ~ modified, = unchanged)')}<br>${files}${del}</div>${changes.length && c.parents.length < 2 ? `<pre>${esc(repo.unifiedDiffText(pt, t)).slice(0, 3000)}</pre>` : ''}`;
  }

  /* ---------- 三棵树 ---------- */
  function renderTrees(repo, container, table, onEdit) {
    if (!repo) { container.innerHTML = `<span class="muted">${T('当前目录不是 git 仓库。', 'The current directory is not a git repository.')}</span>`; table.querySelector('tbody').innerHTML = ''; return; }
    if (repo.bare) { container.innerHTML = `<span class="muted">${T('这是一个裸仓库（服务器端），没有工作区和暂存区，只有 .git 的内容。', 'This is a bare repository (server side): no working tree and no staging area, just what would be inside .git.')}</span>`; table.querySelector('tbody').innerHTML = ''; return; }
    const head = repo.headHash();
    const headTree = repo.treeOfCommit(head);
    const branch = repo.currentBranch();
    const states = [];
    if (repo.state.merge) states.push('MERGING'); if (repo.state.rebase) states.push('REBASING'); if (repo.state.cherryPick) states.push('CHERRY-PICKING'); if (repo.state.revert) states.push('REVERTING'); if (repo.state.bisect) states.push('BISECTING');
    container.innerHTML = `<span class="kv"><b>HEAD</b> → ${branch ? `refs/heads/<b>${esc(branch)}</b>` : '<span class="st-modified">detached</span>'} → ${head ? `<code>${abbrev(head)}</code> ${esc(repo.subject(head))}` : `<span class="muted">${T('（无提交）', '(no commits)')}</span>`}</span>` + (states.length ? `<span class="kv state">${states.join(' ')}</span>` : '') + (repo.stash.length ? `<span class="kv">stash: ${repo.stash.length}</span>` : '') + (repo.currentBranch() && repo.upstreamOf(repo.currentBranch()) ? `<span class="kv muted">upstream: ${esc(repo.upstreamOf(repo.currentBranch()).name)}</span>` : '');
    const paths = global.GitCore.unionKeys(headTree, repo.index, repo.workdir, repo.conflicts);
    const rows = paths.map(p => {
      const h = headTree.get(p), i = repo.index.get(p), w = repo.workHash(p);
      const conflict = repo.conflicts.has(p);
      let st, cls;
      if (conflict) { st = T('冲突（未解决）', 'conflict (unresolved)'); cls = 'st-conflict'; }
      else if (i === undefined && h === undefined) { st = repo.isIgnored(p) ? T('已忽略', 'ignored') : T('未跟踪', 'untracked'); cls = 'st-untracked'; }
      else if (h === undefined && i !== undefined) { st = w === i ? T('新文件，已暂存', 'new file, staged') : w === null ? T('已暂存，工作区被删', 'staged, deleted in working tree') : T('已暂存，又改了', 'staged, then modified again'); cls = 'st-staged'; }
      else if (i === undefined) { st = T('删除，已暂存', 'deleted, staged'); cls = 'st-deleted'; }
      else if (w === null) { st = T('工作区已删除（未暂存）', 'deleted in working tree (not staged)'); cls = 'st-deleted'; }
      else if (h === i && i === w) { st = T('干净', 'clean'); cls = 'st-clean'; }
      else if (h !== i && i === w) { st = T('已暂存', 'staged'); cls = 'st-staged'; }
      else if (h === i && i !== w) { st = T('已修改，未暂存', 'modified, not staged'); cls = 'st-modified'; }
      else { st = T('已暂存，又改了', 'staged, then modified again'); cls = 'st-modified'; }
      const cell = (v, extra) => `<td class="h ${v ? '' : 'none'} ${extra || ''}">${v ? abbrev(v) : '—'}</td>`;
      const idxCell = conflict ? (() => { const c = repo.conflicts.get(p); return `<td class="h conflict" title="${T('冲突时暂存区里有三份：stage1 共同祖先 / stage2 我方 / stage3 对方', 'During a conflict the index holds three versions: stage 1 common ancestor / stage 2 ours / stage 3 theirs')}">1 base ${c.base ? abbrev(c.base) : '—'}<br>2 ours ${c.ours ? abbrev(c.ours) : '—'}<br>3 theirs ${c.theirs ? abbrev(c.theirs) : '—'}</td>`; })() : cell(i, i !== h ? 'diff-ih' : '');
      return `<tr><td class="file" data-path="${esc(p)}">${esc(p)}</td>${cell(w, w !== i ? 'diff-wi' : '')}${idxCell}${cell(h)}<td class="st ${cls}">${st}</td></tr>`;
    });
    table.querySelector('tbody').innerHTML = rows.join('') || `<tr><td colspan="5" class="muted">${T('（没有文件）', '(no files)')}</td></tr>`;
    table.querySelectorAll('td.file').forEach(td => td.addEventListener('click', () => onEdit(td.dataset.path)));
  }

  /* ---------- 多仓库 ---------- */
  function renderMulti(world, container, currentRepo) {
    const repos = world.allRepos();
    const nameOf = p => p.startsWith('/home/you') ? T('👤 你的仓库', '👤 Your repo') : p.startsWith('/home/xiaoming') ? T('🧑‍💻 小明的仓库', '🧑‍💻 Xiaoming\'s repo') : p.startsWith('/home/xiaohong') ? T('👩‍💻 小红的仓库', '👩‍💻 Xiaohong\'s repo') : p.startsWith('/srv') ? T('☁️ 服务器（origin，裸仓库）', '☁️ Server (origin, bare)') : '📁 ' + p;
    const orderKey = p => p.startsWith('/home/you') ? 0 : p.startsWith('/srv') ? 1 : 2;
    repos.sort((a, b) => orderKey(a.path) - orderKey(b.path) || a.path.localeCompare(b.path));
    if (!repos.length) { container.innerHTML = `<p class="muted">${T('还没有任何 git 仓库。', 'No git repositories yet.')}</p>`; return; }
    container.innerHTML = repos.map((r, i) => {
      const refs = [...r.repo.refs].sort().map(([ref, h]) => `<div>${esc(ref.replace('refs/heads/', '').replace('refs/remotes/', '').replace('refs/tags/', 'tag '))}${r.repo.HEAD.symbolic === ref ? ' ←HEAD' : ''} → ${abbrev(r.repo.peel(h))} ${esc(r.repo.subject(r.repo.peel(h)))}</div>`).join('');
      return `<div class="repo-card ${r.repo === currentRepo ? 'current' : ''}"><h4><span>${nameOf(r.path)}</span><span class="path">${esc(r.path)}</span></h4><div class="refs">${refs || `<span class="muted">${T('（空仓库）', '(empty repository)')}</span>`}</div><svg id="multi-svg-${i}" xmlns="http://www.w3.org/2000/svg"></svg></div>`;
    }).join('');
    repos.forEach((r, i) => renderGraph(document.getElementById('multi-svg-' + i), r.repo, { compact: true, width: 380 }));
  }

  global.GitUI = { Terminal, highlight, renderGraph, layoutGraph, commitDetailHtml, renderTrees, renderMulti, esc, $ };
})(typeof window !== 'undefined' ? window : globalThis);
