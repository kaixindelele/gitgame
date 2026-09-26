/* GitGame 核心引擎：用真实的 git 对象模型（blob/tree/commit、index、refs、reflog）在浏览器内模拟 git */
(function (global) {
  'use strict';
  const { splitLines, diffStats, unifiedHunks, merge3, diffLines } = global.GitDiff;

  class GitError extends Error {
    constructor(msg) { super(msg); this.name = 'GitError'; }
  }

  const clock = { t: Date.UTC(2026, 0, 5, 1, 0, 0) }; // 逻辑时钟，每次提交递增，保证顺序稳定
  function now() { clock.t += 60 * 1000; return clock.t; }
  function setClock(t) { clock.t = t; }

  const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const pad = n => String(n).padStart(2, '0');
  function fmtDate(ts) {
    const d = new Date(ts + 8 * 3600 * 1000);
    return `${DAYS[d.getUTCDay()]} ${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())} ${d.getUTCFullYear()} +0800`;
  }
  function fmtDateISO(ts) {
    const d = new Date(ts + 8 * 3600 * 1000);
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())} +0800`;
  }
  const abbrev = h => (h ? h.slice(0, 7) : '0000000');
  const byteLen = s => new TextEncoder().encode(s).length;
  const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
  const setEq = (a, b) => a.size === b.size && [...a].every(([k, v]) => b.get(k) === v);
  function unionKeys(...maps) {
    const s = new Set();
    for (const m of maps) for (const k of m.keys()) s.add(k);
    return [...s].sort();
  }

  // 命令行参数解析
  function parseArgs(args, spec = {}) {
    // spec: { m: 'value', message: 'value', a: 'bool', ... , aliases: {msg:'m'} }
    const flags = {}; const positional = []; let afterDashDash = false; const paths = [];
    const takesValue = k => spec[k] === 'value';
    const known = k => spec[k] !== undefined;
    for (let i = 0; i < args.length; i++) {
      const a = args[i];
      if (afterDashDash) { paths.push(a); continue; }
      if (a === '--') { afterDashDash = true; continue; }
      if (a.startsWith('--') && a.length > 2) {
        let [k, v] = a.slice(2).split(/=(.*)/s);
        if (k.startsWith('no-') && known(k.slice(3)) && spec[k.slice(3)] === 'bool' && !known(k)) { flags[k.slice(3)] = false; continue; }
        if (!known(k)) throw new GitError(`error: unknown option \`${k}'`);
        if (takesValue(k)) { if (v === undefined) { v = args[++i]; if (v === undefined) throw new GitError(`error: option \`${k}' requires a value`); } flags[k] = v; }
        else flags[k] = true;
        continue;
      }
      if (a.startsWith('-') && a.length > 1 && !/^-\d+$/.test(a)) {
        const chars = a.slice(1);
        for (let j = 0; j < chars.length; j++) {
          const k = chars[j];
          if (!known(k)) throw new GitError(`error: unknown switch \`${k}'`);
          if (takesValue(k)) {
            let v = chars.slice(j + 1);
            if (v === '') { v = args[++i]; if (v === undefined) throw new GitError(`error: switch \`${k}' requires a value`); }
            flags[k] = v; break;
          } else flags[k] = true;
        }
        continue;
      }
      if (/^-\d+$/.test(a)) { flags.n = a.slice(1); continue; }
      positional.push(a);
    }
    return { flags, positional, paths };
  }

  class Repo {
    constructor(opts = {}) {
      this.path = opts.path || '/repo';
      this.bare = !!opts.bare;
      this.objects = new Map();
      this.refs = new Map();
      this.HEAD = { symbolic: 'refs/heads/' + (opts.defaultBranch || 'main') };
      this.index = new Map();
      this.conflicts = new Map();
      this.workdir = new Map();
      this.stash = [];
      this.reflogs = new Map();
      this.config = {};
      this.globalConfig = opts.globalConfig || {};
      this.state = {};
      this.ORIG_HEAD = null;
      this.trace = [];
      this.hooks = opts.hooks || {}; // 例如 protectedBranches
      this._flatCache = new Map();
    }

    clone() {
      const r = new Repo({ path: this.path, bare: this.bare, globalConfig: this.globalConfig });
      r.objects = new Map(this.objects);
      r.refs = new Map(this.refs);
      r.HEAD = JSON.parse(JSON.stringify(this.HEAD));
      r.index = new Map(this.index);
      r.conflicts = new Map([...this.conflicts].map(([k, v]) => [k, { ...v }]));
      r.workdir = new Map(this.workdir);
      r.stash = this.stash.map(s => ({ ...s }));
      r.reflogs = new Map([...this.reflogs].map(([k, v]) => [k, v.map(e => ({ ...e }))]));
      r.config = { ...this.config };
      r.state = JSON.parse(JSON.stringify(this.state, (k, v) => v instanceof Map ? { __map: [...v] } : v), (k, v) => v && v.__map ? new Map(v.__map) : v);
      r.ORIG_HEAD = this.ORIG_HEAD;
      r.hooks = { ...this.hooks };
      return r;
    }

    /* ---------- 对象库 ---------- */
    putObject(obj) {
      const hash = global.sha1(`${obj.type} ${byteLen(obj.content)}\0${obj.content}`);
      if (!this.objects.has(hash)) {
        this.objects.set(hash, { ...obj, hash });
        this.trace.push({ kind: 'object', type: obj.type, hash });
      }
      return hash;
    }
    hashBlobContent(content) { return global.sha1(`blob ${byteLen(content)}\0${content}`); }
    writeBlob(content) { return this.putObject({ type: 'blob', content }); }
    getObject(hash) {
      const o = this.objects.get(hash);
      if (!o) throw new GitError(`fatal: bad object ${hash}`);
      return o;
    }
    hasObject(hash) { return this.objects.has(hash); }
    blobContent(hash) { return this.getObject(hash).content; }

    writeTreeFromFlat(flat) {
      const root = {};
      for (const [path, hash] of [...flat].sort()) {
        const parts = path.split('/');
        let cur = root;
        for (let i = 0; i < parts.length - 1; i++) {
          if (typeof cur[parts[i]] === 'string') throw new GitError(`fatal: '${path}' conflicts with a file`);
          cur = cur[parts[i]] = cur[parts[i]] || {};
        }
        cur[parts[parts.length - 1]] = hash;
      }
      const write = node => {
        const entries = Object.keys(node).sort().map(name => typeof node[name] === 'string'
          ? { mode: '100644', type: 'blob', hash: node[name], name }
          : { mode: '040000', type: 'tree', hash: write(node[name]), name });
        const content = entries.map(e => `${e.mode} ${e.type} ${e.hash}\t${e.name}`).join('\n') + (entries.length ? '\n' : '');
        const h = this.putObject({ type: 'tree', content, entries });
        if (!this.objects.get(h).entries) this.objects.get(h).entries = entries;
        return h;
      };
      return write(root);
    }
    subtreeHash(treeHash, path) {
      let cur = treeHash;
      for (const seg of path.split('/').filter(Boolean)) { const t = this.getObject(cur); const e = (t.entries || []).find(x => x.name === seg && x.type === 'tree'); if (!e) return null; cur = e.hash; }
      return cur;
    }
    flattenTree(hash, prefix = '') {
      const out = new Map();
      if (!hash) return out;
      const t = this.getObject(hash);
      for (const e of t.entries || []) {
        if (e.type === 'blob') out.set(prefix + e.name, e.hash);
        else for (const [p, h] of this.flattenTree(e.hash, prefix + e.name + '/')) out.set(p, h);
      }
      return out;
    }
    treeOfCommit(commitHash) {
      if (!commitHash) return new Map();
      if (this._flatCache.has(commitHash)) return new Map(this._flatCache.get(commitHash));
      const c = this.getCommit(commitHash);
      const flat = this.flattenTree(c.tree);
      this._flatCache.set(commitHash, new Map(flat));
      return flat;
    }
    getCommit(hash) {
      const o = this.getObject(hash);
      if (o.type === 'tag') return this.getCommit(o.object);
      if (o.type !== 'commit') throw new GitError(`fatal: ${abbrev(hash)} is not a commit`);
      return o;
    }
    peel(hash) {
      let o = this.getObject(hash);
      while (o.type === 'tag') o = this.getObject(o.object);
      return o.hash;
    }
    createCommit({ tree, parents, message, author, authorDate, date }) {
      const name = this.getConfig('user.name'), email = this.getConfig('user.email');
      if (!name || !email) {
        throw new GitError(`Author identity unknown\n\n*** Please tell me who you are.\n\nRun\n\n  git config --global user.email "you@example.com"\n  git config --global user.name "Your Name"\n\nto set your account's default identity.\nOmit --global to set the identity only in this repository.\n\nfatal: unable to auto-detect email address`);
      }
      const ts = date || now();
      author = author || { name, email };
      authorDate = authorDate || ts;
      const committer = { name, email };
      message = message.replace(/\s+$/, '') + '\n';
      const content = `tree ${tree}\n` + parents.map(p => `parent ${p}\n`).join('') +
        `author ${author.name} <${author.email}> ${Math.floor(authorDate / 1000)} +0800\n` +
        `committer ${committer.name} <${committer.email}> ${Math.floor(ts / 1000)} +0800\n\n${message}`;
      return this.putObject({ type: 'commit', content, tree, parents: parents.slice(), author, authorDate, committer, date: ts, message });
    }
    subject(hash) { return this.getCommit(hash).message.split('\n')[0]; }

    /* ---------- 配置 ---------- */
    getConfig(key) { return this.config[key] !== undefined ? this.config[key] : this.globalConfig[key]; }

    /* ---------- 引用 ---------- */
    headHash() { return this.HEAD.symbolic ? (this.refs.get(this.HEAD.symbolic) || null) : this.HEAD.detached; }
    currentBranch() { return this.HEAD.symbolic ? this.HEAD.symbolic.replace('refs/heads/', '') : null; }
    branches() { return [...this.refs.keys()].filter(r => r.startsWith('refs/heads/')).map(r => r.slice(11)).sort(); }
    tags() { return [...this.refs.keys()].filter(r => r.startsWith('refs/tags/')).map(r => r.slice(10)).sort(); }
    remoteRefs() { return [...this.refs.keys()].filter(r => r.startsWith('refs/remotes/')).map(r => r.slice(13)).sort(); }
    logReflog(ref, oldH, newH, msg) {
      if (!this.reflogs.has(ref)) this.reflogs.set(ref, []);
      this.reflogs.get(ref).unshift({ old: oldH || null, new: newH, msg, date: now() });
    }
    updateRef(ref, newHash, msg, { reflogHead = true } = {}) {
      const old = this.refs.get(ref) || null;
      if (newHash) this.refs.set(ref, newHash); else this.refs.delete(ref);
      this.trace.push({ kind: 'ref', ref, old, new: newHash || null });
      if (newHash && msg) {
        this.logReflog(ref, old, newHash, msg);
        if (reflogHead && this.HEAD.symbolic === ref) this.logReflog('HEAD', old, newHash, msg);
      }
    }
    setHeadDetached(hash, msg) {
      const old = this.headHash();
      this.HEAD = { detached: hash };
      this.trace.push({ kind: 'head', to: hash, detached: true });
      if (msg) this.logReflog('HEAD', old, hash, msg);
    }
    setHeadBranch(branch, msg) {
      const old = this.headHash();
      this.HEAD = { symbolic: 'refs/heads/' + branch };
      this.trace.push({ kind: 'head', to: branch, detached: false });
      const nh = this.headHash();
      if (msg && nh) this.logReflog('HEAD', old, nh, msg);
    }
    moveHead(newHash, msg) { // 提交等：移动当前分支或 detached HEAD
      if (this.HEAD.symbolic) this.updateRef(this.HEAD.symbolic, newHash, msg);
      else { const old = this.HEAD.detached; this.HEAD = { detached: newHash }; this.trace.push({ kind: 'head', to: newHash, detached: true }); this.logReflog('HEAD', old, newHash, msg); }
    }
    upstreamOf(branch) {
      const remote = this.config[`branch.${branch}.remote`], merge = this.config[`branch.${branch}.merge`];
      if (!remote || !merge) return null;
      const rb = merge.replace('refs/heads/', '');
      return { remote, branch: rb, ref: `refs/remotes/${remote}/${rb}`, name: `${remote}/${rb}` };
    }

    /* ---------- 版本解析 ---------- */
    resolveRev(rev, { wantCommit = true } = {}) {
      const orig = rev;
      if (!wantCommit) {
        const mPath = rev.match(/^([^:]+):(.+)$/);
        if (mPath && !/^[0-9a-f]{40}$/.test(rev)) { const c = this.resolveRev(mPath[1]); const t = this.treeOfCommit(c); const path = mPath[2].replace(/^\.\//, ''); if (t.has(path)) return t.get(path); const sub = this.subtreeHash(this.getCommit(c).tree, path); if (sub) return sub; throw new GitError(`fatal: path '${mPath[2]}' does not exist in '${mPath[1]}'`); }
        const mPeel = rev.match(/^(.+)\^\{(tree|commit)\}$/);
        if (mPeel) { const c = this.resolveRev(mPeel[1]); return mPeel[2] === 'tree' ? this.getCommit(c).tree : c; }
      }
      const bad = () => new GitError(`fatal: ambiguous argument '${orig}': unknown revision or path not in the working tree.\nUse '--' to separate paths from revisions, like this:\n'git <command> [<revision>...] -- [<file>...]'`);
      const m = rev.match(/^(.*?)((?:[~^]\d*|@\{-?\d+\})*)$/);
      let base = m[1], mods = m[2];
      let hash;
      if (base === '' && mods.startsWith('@{')) base = 'HEAD';
      if (base === 'HEAD' || base === '@') {
        hash = this.headHash();
        if (!hash) throw new GitError(`fatal: ambiguous argument '${orig}': unknown revision or path not in the working tree.`);
      } else if (base === 'ORIG_HEAD') { hash = this.ORIG_HEAD; if (!hash) throw bad(); }
      else if (base === 'MERGE_HEAD') { hash = this.state.merge && this.state.merge.heads[0]; if (!hash) throw bad(); }
      else if (base === 'FETCH_HEAD') { hash = this.FETCH_HEAD; if (!hash) throw bad(); }
      else if (base === 'stash') { if (!this.stash.length) throw bad(); hash = this.stash[0].hash; }
      else if (this.refs.has('refs/heads/' + base)) hash = this.refs.get('refs/heads/' + base);
      else if (this.refs.has('refs/tags/' + base)) hash = this.refs.get('refs/tags/' + base);
      else if (this.refs.has('refs/remotes/' + base)) hash = this.refs.get('refs/remotes/' + base);
      else if (this.refs.has(base)) hash = this.refs.get(base);
      else if (/^[0-9a-f]{4,40}$/.test(base)) {
        const cands = [...this.objects.keys()].filter(h => h.startsWith(base));
        if (cands.length === 1) hash = cands[0];
        else if (cands.length > 1) throw new GitError(`error: short object ID ${base} is ambiguous\nfatal: ambiguous argument '${orig}': unknown revision or path not in the working tree.`);
        else throw bad();
      } else throw bad();
      // 修饰符
      const re = /([~^]\d*|@\{-?\d+\})/g; let mm;
      while ((mm = re.exec(mods))) {
        const tok = mm[1];
        if (tok.startsWith('@{')) {
          const n = parseInt(tok.slice(2, -1), 10);
          if (base === 'stash') { if (!this.stash[n]) throw new GitError(`fatal: Log for 'stash' only has ${this.stash.length} entries`); hash = this.stash[n].hash; continue; }
          const ref = base === 'HEAD' || base === '@' ? 'HEAD' : (this.refs.has('refs/heads/' + base) ? 'refs/heads/' + base : base);
          const log = this.reflogs.get(ref) || [];
          if (!log[n]) throw new GitError(`fatal: log for '${base}' only has ${log.length} entries`);
          hash = log[n].new; continue;
        }
        const c = this.getCommit(this.peel(hash));
        if (tok[0] === '~') {
          const n = tok.length > 1 ? parseInt(tok.slice(1), 10) : 1;
          let cur = c;
          for (let i = 0; i < n; i++) {
            if (!cur.parents.length) throw bad();
            cur = this.getCommit(cur.parents[0]);
          }
          hash = cur.hash;
        } else {
          const n = tok.length > 1 ? parseInt(tok.slice(1), 10) : 1;
          if (n === 0) { hash = c.hash; continue; }
          if (!c.parents[n - 1]) throw bad();
          hash = c.parents[n - 1];
        }
      }
      if (wantCommit) {
        const o = this.getObject(hash);
        if (o.type === 'tag') return this.peel(hash);
        if (o.type !== 'commit') throw new GitError(`fatal: bad revision '${orig}'`);
      }
      return hash;
    }
    tryResolve(rev) { try { return this.resolveRev(rev); } catch (e) { return null; } }

    /* ---------- 祖先关系 ---------- */
    ancestors(hash) {
      const seen = new Set(); const stack = [hash];
      while (stack.length) {
        const h = stack.pop();
        if (!h || seen.has(h)) continue;
        seen.add(h);
        stack.push(...this.getCommit(h).parents);
      }
      return seen;
    }
    isAncestor(a, b) { return a === b || this.ancestors(b).has(a); }
    mergeBase(a, b) {
      const A = this.ancestors(a), B = this.ancestors(b);
      let best = null, bestDate = -1;
      for (const h of A) if (B.has(h)) { const d = this.getCommit(h).date; if (d > bestDate) { best = h; bestDate = d; } }
      return best;
    }
    // rev-list: 从 tips 出发，排除 exclude 的祖先，按时间倒序
    revList(tips, exclude = []) {
      const ex = new Set();
      for (const e of exclude) for (const h of this.ancestors(e)) ex.add(h);
      const seen = new Set(); const out = [];
      const queue = [];
      for (const t of tips) { if (t && !ex.has(t) && !seen.has(t)) { seen.add(t); queue.push(t); } }
      while (queue.length) {
        queue.sort((x, y) => this.getCommit(y).date - this.getCommit(x).date || (x < y ? -1 : 1));
        const h = queue.shift();
        out.push(h);
        for (const p of this.getCommit(h).parents) if (!ex.has(p) && !seen.has(p)) { seen.add(p); queue.push(p); }
      }
      return out;
    }
    // 拓扑排序（父在子前），用于 rebase / bisect
    topoOrder(hashes) {
      const set = new Set(hashes); const out = []; const done = new Set();
      const visit = h => { if (done.has(h) || !set.has(h)) return; done.add(h); for (const p of this.getCommit(h).parents) visit(p); out.push(h); };
      for (const h of [...hashes].sort((a, b) => this.getCommit(a).date - this.getCommit(b).date)) visit(h);
      return out;
    }

    /* ---------- .gitignore ---------- */
    ignorePatterns() {
      const c = this.workdir.get('.gitignore');
      if (!c) return [];
      return c.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'));
    }
    isIgnored(path) {
      if (this.index.has(path)) return false;
      for (let pat of this.ignorePatterns()) {
        let neg = false; if (pat.startsWith('!')) { neg = true; pat = pat.slice(1); }
        let dirOnly = false; if (pat.endsWith('/')) { dirOnly = true; pat = pat.slice(0, -1); }
        const anchored = pat.includes('/'); if (pat.startsWith('/')) pat = pat.slice(1);
        const re = new RegExp('^' + pat.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*\*/g, '\u0000').replace(/\*/g, '[^/]*').replace(/\u0000/g, '.*').replace(/\?/g, '.') + '$');
        const segs = path.split('/');
        let hit = false;
        if (anchored) hit = re.test(path) || (dirOnly ? segs.slice(0, -1).some((_, i) => re.test(segs.slice(0, i + 1).join('/'))) : segs.some((_, i) => i < segs.length - 1 && re.test(segs.slice(0, i + 1).join('/'))));
        else hit = dirOnly ? segs.slice(0, -1).some(sg => re.test(sg)) : segs.some(sg => re.test(sg));
        if (hit) { if (neg) return false; return true; }
      }
      return false;
    }

    /* ---------- 工作区/暂存区状态 ---------- */
    workHash(path) { const c = this.workdir.get(path); return c === undefined ? null : this.hashBlobContent(c); }
    statusData() {
      const head = this.headHash();
      const headTree = this.treeOfCommit(head);
      const staged = [], unstaged = [], untracked = [];
      for (const p of unionKeys(headTree, this.index)) {
        if (this.conflicts.has(p)) continue;
        const h = headTree.get(p), i = this.index.get(p);
        if (h === undefined) staged.push({ path: p, status: 'new file' });
        else if (i === undefined) staged.push({ path: p, status: 'deleted' });
        else if (h !== i) staged.push({ path: p, status: 'modified' });
      }
      for (const p of [...this.index.keys()].sort()) {
        if (this.conflicts.has(p)) continue;
        const w = this.workHash(p);
        if (w === null) unstaged.push({ path: p, status: 'deleted' });
        else if (w !== this.index.get(p)) unstaged.push({ path: p, status: 'modified' });
      }
      const ignored = [];
      const rawUntracked = [];
      for (const p of [...this.workdir.keys()].sort()) if (!this.index.has(p) && !this.conflicts.has(p)) { if (this.isIgnored(p)) ignored.push(p); else rawUntracked.push(p); }
      // 和真实 git 一样：整个目录都未跟踪时折叠显示为 dir/
      const trackedDirs = new Set(); for (const p of [...this.index.keys(), ...this.conflicts.keys()]) { const parts = p.split('/'); for (let i = 1; i < parts.length; i++) trackedDirs.add(parts.slice(0, i).join('/')); }
      const seenDir = new Set();
      for (const p of rawUntracked) {
        const parts = p.split('/'); let shown = p;
        for (let i = 1; i < parts.length; i++) { const d = parts.slice(0, i).join('/'); if (!trackedDirs.has(d)) { shown = d + '/'; break; } }
        if (shown.endsWith('/')) { if (!seenDir.has(shown)) { seenDir.add(shown); untracked.push(shown); } } else untracked.push(shown);
      }
      this._rawUntracked = rawUntracked;
      const conflicts = [...this.conflicts].map(([p, c]) => ({ path: p, status: !c.ours ? 'deleted by us' : !c.theirs ? 'deleted by them' : !c.base ? 'both added' : 'both modified' }));
      return { staged, unstaged, untracked, ignored, conflicts, head, branch: this.currentBranch() };
    }
    isClean() { const s = this.statusData(); return !s.staged.length && !s.unstaged.length && !s.conflicts.length; }
    indexTreeEqualsHead() { const head = this.headHash(); return setEq(this.treeOfCommit(head), this.index) && this.conflicts.size === 0; }
    workTreeFlat() { // 已跟踪文件的工作区内容（不写对象）
      const m = new Map();
      for (const p of this.index.keys()) if (this.workdir.has(p)) m.set(p, this.workHash(p));
      return m;
    }

    /* ---------- 树之间的差异 ---------- */
    diffTrees(a, b) {
      const out = [];
      for (const p of unionKeys(a, b)) {
        const x = a.get(p), y = b.get(p);
        if (x === y) continue;
        const ac = x ? this.blobContent(x) : '', bc = y ? this.blobContent(y) : '';
        const st = diffStats(ac, bc);
        out.push({ path: p, status: x === undefined ? 'A' : y === undefined ? 'D' : 'M', ins: st.ins, del: st.del, a: x, b: y });
      }
      return out;
    }
    statSummary(changes) {
      if (!changes.length) return '';
      const ins = changes.reduce((s, c) => s + c.ins, 0), del = changes.reduce((s, c) => s + c.del, 0);
      let s = ` ${plural(changes.length, 'file')} changed`;
      if (ins) s += `, ${plural(ins, 'insertion')}(+)`;
      if (del) s += `, ${plural(del, 'deletion')}(-)`;
      return s;
    }
    diffStatText(changes) {
      if (!changes.length) return '';
      const w = Math.max(...changes.map(c => c.path.length));
      const lines = changes.map(c => {
        const n = c.ins + c.del;
        return ` ${c.path.padEnd(w)} | ${String(n).padStart(2)} ${'+'.repeat(Math.min(c.ins, 30))}${'-'.repeat(Math.min(c.del, 30))}`;
      });
      return lines.join('\n') + '\n' + this.statSummary(changes) + '\n';
    }
    unifiedDiffText(a, b, { staged = false, paths = null } = {}) {
      let out = '';
      for (const ch of this.diffTrees(a, b)) {
        if (paths && !paths.some(p => ch.path === p || ch.path.startsWith(p + '/'))) continue;
        const ac = ch.a ? this.blobContent(ch.a) : '', bc = ch.b ? this.blobContent(ch.b) : '';
        out += `diff --git a/${ch.path} b/${ch.path}\n`;
        if (ch.status === 'A') out += `new file mode 100644\nindex 0000000..${abbrev(ch.b)}\n--- /dev/null\n+++ b/${ch.path}\n`;
        else if (ch.status === 'D') out += `deleted file mode 100644\nindex ${abbrev(ch.a)}..0000000\n--- a/${ch.path}\n+++ /dev/null\n`;
        else out += `index ${abbrev(ch.a)}..${abbrev(ch.b)} 100644\n--- a/${ch.path}\n+++ b/${ch.path}\n`;
        out += unifiedHunks(ac, bc);
      }
      return out;
    }

    /* ---------- 切换工作区到某棵树 ---------- */
    switchToTree(targetFlat, { verb = 'checkout', force = false } = {}) {
      const headTree = this.treeOfCommit(this.headHash());
      const errs = [], untrackedErrs = [];
      const changes = [];
      for (const p of unionKeys(headTree, targetFlat)) {
        const h = headTree.get(p), t = targetFlat.get(p);
        if (h === t) continue;
        if (!force) {
          const idx = this.index.get(p), wh = this.workHash(p);
          if (h !== undefined) {
            if (idx !== h || wh !== idx) { if (!(wh === t && idx === t)) errs.push(p); }
          } else if (wh !== null && wh !== t) untrackedErrs.push(p);
          else if (idx !== undefined && idx !== t) errs.push(p);
        }
        changes.push(p);
      }
      if (errs.length) throw new GitError(`error: Your local changes to the following files would be overwritten by ${verb}:\n${errs.map(e => '\t' + e).join('\n')}\nPlease commit your changes or stash them before you ${verb === 'checkout' ? 'switch branches' : verb}.\nAborting`);
      if (untrackedErrs.length) throw new GitError(`error: The following untracked working tree files would be overwritten by ${verb}:\n${untrackedErrs.map(e => '\t' + e).join('\n')}\nPlease move or remove them before you ${verb === 'checkout' ? 'switch branches' : verb}.\nAborting`);
      for (const p of changes) {
        const t = targetFlat.get(p);
        if (t === undefined) { this.workdir.delete(p); this.index.delete(p); }
        else { this.workdir.set(p, this.blobContent(t)); this.index.set(p, t); }
      }
      return changes;
    }
    resetHardTo(flat) { // 工作区+暂存区强制等于 flat（不动未跟踪文件）
      for (const p of [...this.index.keys()]) if (!flat.has(p)) { this.index.delete(p); this.workdir.delete(p); }
      for (const [p, h] of flat) { this.index.set(p, h); this.workdir.set(p, this.blobContent(h)); }
      this.conflicts.clear();
    }

    /* ---------- 三方合并（树级） ---------- */
    mergeTrees(baseFlat, oursFlat, theirsFlat, labels) {
      const result = new Map(oursFlat);
      const conflicts = []; const msgs = [];
      for (const p of unionKeys(baseFlat, oursFlat, theirsFlat)) {
        const b = baseFlat.get(p), o = oursFlat.get(p), t = theirsFlat.get(p);
        if (o === t) continue;
        if (b === o) { if (t === undefined) result.delete(p); else result.set(p, t); continue; }
        if (b === t) continue; // 只有我们改了
        if (o !== undefined && t !== undefined) {
          const m = merge3(b ? this.blobContent(b) : '', this.blobContent(o), this.blobContent(t), labels);
          msgs.push(`Auto-merging ${p}`);
          if (m.conflicts === 0) { result.set(p, this.writeBlob(m.text)); }
          else {
            msgs.push(`CONFLICT (${b ? 'content' : 'add/add'}): Merge conflict in ${p}`);
            conflicts.push({ path: p, base: b || null, ours: o, theirs: t, content: m.text });
          }
        } else if (o !== undefined) {
          msgs.push(`CONFLICT (modify/delete): ${p} deleted in ${labels.theirs} and modified in ${labels.ours}.  Version ${labels.ours} of ${p} left in tree.`);
          conflicts.push({ path: p, base: b || null, ours: o, theirs: null, content: this.blobContent(o) });
        } else {
          msgs.push(`CONFLICT (modify/delete): ${p} deleted in ${labels.ours} and modified in ${labels.theirs}.  Version ${labels.theirs} of ${p} left in tree.`);
          conflicts.push({ path: p, base: b || null, ours: null, theirs: t, content: this.blobContent(t) });
        }
      }
      return { result, conflicts, msgs };
    }
    // 把三方合并结果应用到工作区和暂存区
    applyMergeResult(mr) {
      const headTree = this.treeOfCommit(this.headHash());
      for (const p of unionKeys(headTree, mr.result)) {
        const h = headTree.get(p), r = mr.result.get(p);
        if (h === r) continue;
        if (r === undefined) { this.workdir.delete(p); this.index.delete(p); }
        else { this.workdir.set(p, this.blobContent(r)); this.index.set(p, r); }
      }
      for (const c of mr.conflicts) {
        this.workdir.set(c.path, c.content);
        this.index.delete(c.path);
        this.conflicts.set(c.path, { base: c.base, ours: c.ours, theirs: c.theirs });
      }
    }
    snapshotWorkState() {
      return { index: new Map(this.index), workdir: new Map(this.workdir), conflicts: new Map(this.conflicts) };
    }
    restoreWorkState(s) { this.index = new Map(s.index); this.workdir = new Map(s.workdir); this.conflicts = new Map(s.conflicts); }

    // 检查合并前的脏工作区（会被合并改动的文件必须干净）
    checkDirtyForMerge(theirsFlat, verb) {
      const headTree = this.treeOfCommit(this.headHash());
      const errs = [];
      for (const p of unionKeys(headTree, theirsFlat)) {
        if (headTree.get(p) === theirsFlat.get(p)) continue;
        const idx = this.index.get(p), wh = this.workHash(p), h = headTree.get(p);
        if (h !== undefined && (idx !== h || wh !== idx)) errs.push(p);
        else if (h === undefined && wh !== null) errs.push(p);
      }
      if (errs.length) throw new GitError(`error: Your local changes to the following files would be overwritten by ${verb}:\n${errs.map(e => '\t' + e).join('\n')}\nPlease commit your changes or stash them before you ${verb}.\nAborting`);
    }

    /* ---------- 装饰信息 ---------- */
    decorations(hash) {
      const d = [];
      const cur = this.currentBranch();
      const head = this.headHash();
      if (head === hash) d.push(cur ? `HEAD -> ${cur}` : 'HEAD');
      for (const t of this.tags()) if (this.peel(this.refs.get('refs/tags/' + t)) === hash) d.push('tag: ' + t);
      for (const b of this.branches()) if (b !== cur && this.refs.get('refs/heads/' + b) === hash) d.push(b);
      for (const r of this.remoteRefs()) if (this.refs.get('refs/remotes/' + r) === hash) d.push(r);
      return d;
    }
    decoStr(hash) { const d = this.decorations(hash); return d.length ? ` (${d.join(', ')})` : ''; }

    /* ---------- 便捷查询（供关卡判定/界面使用） ---------- */
    fileAt(rev, path) { const h = this.tryResolve(rev); if (!h) return null; const t = this.treeOfCommit(h); return t.has(path) ? this.blobContent(t.get(path)) : null; }
    commitCount(rev = 'HEAD') { const h = this.tryResolve(rev); return h ? this.ancestors(h).size : 0; }
    branchTip(name) { return this.refs.get('refs/heads/' + name) || null; }
    allCommits() { return [...this.objects.values()].filter(o => o.type === 'commit'); }
    reachableCommits() {
      const tips = [...this.refs.values()].map(h => this.peel(h)).concat(this.headHash() ? [this.headHash()] : []).concat(this.stash.map(s => s.hash));
      const seen = new Set();
      for (const t of tips) for (const h of this.ancestors(t)) seen.add(h);
      return seen;
    }
  }

  global.GitCore = { Repo, GitError, parseArgs, now, setClock, clock, fmtDate, fmtDateISO, abbrev, byteLen, plural, unionKeys, setEq };
})(typeof window !== 'undefined' ? window : globalThis);
