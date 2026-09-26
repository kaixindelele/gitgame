/* 虚拟文件系统 + shell：ls/cat/echo/cp/rm/cd/du/diff… 以及 git 入口；支持多用户/多仓库/远程 */
(function (global) {
  'use strict';
  const { Repo, GitError, abbrev, byteLen, unionKeys, parseArgs } = global.GitCore;
  const { runGit, transferObjects, normPath } = global.GitCmd;
  const { unifiedHunks } = global.GitDiff;

  class ShellError extends Error { constructor(m) { super(m); this.name = 'ShellError'; } }

  function tokenize(line) {
    const tokens = []; let cur = ''; let inS = false, inD = false, has = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inS) { if (ch === "'") inS = false; else cur += ch; continue; }
      if (inD) { if (ch === '"') inD = false; else if (ch === '\\' && i + 1 < line.length && '"\\$'.includes(line[i + 1])) { cur += line[++i]; } else cur += ch; continue; }
      if (ch === "'") { inS = true; has = true; continue; }
      if (ch === '"') { inD = true; has = true; continue; }
      if (ch === '\\' && i + 1 < line.length) { cur += line[++i]; has = true; continue; }
      if (/\s/.test(ch)) { if (cur || has) { tokens.push(cur); cur = ''; has = false; } continue; }
      if (ch === '>' ) { if (cur || has) { tokens.push(cur); cur = ''; has = false; } if (line[i + 1] === '>') { tokens.push('>>'); i++; } else tokens.push('>'); continue; }
      if (ch === '|' && line[i + 1] !== '|') throw new ShellError('本沙盒不支持管道 |（可以用 git log -n 3、grep 文件 等替代）');
      if (ch === '$' && /[A-Za-z_]/.test(line[i + 1] || '')) { let j = i + 1, name = ''; while (j < line.length && /[A-Za-z0-9_]/.test(line[j])) name += line[j++]; const env = { HOME: '/home/' + (tokenize.actor || 'you'), USER: tokenize.actor || 'you', PWD: tokenize.cwd || '' }; cur += env[name] !== undefined ? env[name] : ''; has = true; i = j - 1; continue; }
      if (ch === '&' && line[i + 1] === '&') { if (cur || has) { tokens.push(cur); cur = ''; has = false; } tokens.push('&&'); i++; continue; }
      if (ch === ';') { if (cur || has) { tokens.push(cur); cur = ''; has = false; } tokens.push(';'); continue; }
      if (ch === '|' && line[i + 1] === '|') { if (cur || has) { tokens.push(cur); cur = ''; has = false; } tokens.push('||'); i++; continue; }
      cur += ch;
    }
    if (inS || inD) throw new ShellError('语法错误：引号未闭合');
    if (cur || has) tokens.push(cur);
    return tokens;
  }

  function human(n) { if (n < 1024) return n + 'B'; if (n < 1024 * 1024) return (n / 1024).toFixed(1) + 'K'; return (n / 1024 / 1024).toFixed(1) + 'M'; }

  /* 节点：{type:'dir', children: Map} | {type:'file', content} | {type:'repo', repo} */
  class World {
    constructor() {
      this.root = { type: 'dir', children: new Map() };
      this.home = '/home/you';
      this.cwd = this.home;
      this.mkdirp(this.home);
      this.globalConfigs = {}; // 按 home 路径存 --global 配置
      this.remoteAliases = {};
      this.testRunner = null;
      this.actorName = 'you';
      this.log = []; // 记录执行过的命令
      this.listeners = [];
    }
    globalConfigFor(path) {
      const m = path.match(/^\/home\/([^/]+)/);
      const key = m ? m[1] : '_';
      if (!this.globalConfigs[key]) this.globalConfigs[key] = {};
      return this.globalConfigs[key];
    }
    /* ---- 路径 ---- */
    resolve(p) {
      if (!p) return this.cwd;
      if (p === '~' || p.startsWith('~/')) p = this.home + p.slice(1);
      const abs = p.startsWith('/') ? p : this.cwd + '/' + p;
      const parts = [];
      for (const seg of abs.split('/')) { if (!seg || seg === '.') continue; if (seg === '..') { parts.pop(); continue; } parts.push(seg); }
      return '/' + parts.join('/');
    }
    locate(abs) {
      const parts = abs.split('/').filter(Boolean);
      let node = this.root;
      for (let i = 0; i < parts.length; i++) {
        if (node.type === 'repo') { const rel = parts.slice(i).join('/'); if (parts[i] === '.git' && !node.repo.bare) return { kind: 'gitdir', repo: node.repo, rel: parts.slice(i + 1).join('/'), node }; return { kind: 'repo', repo: node.repo, rel, node }; }
        if (node.type !== 'dir') return null;
        const next = node.children.get(parts[i]);
        if (!next) return null;
        node = next;
      }
      if (node.type === 'repo') return { kind: 'repo', repo: node.repo, rel: '', node };
      if (node.type === 'dir') return { kind: 'dir', node };
      return { kind: 'file', node, name: parts[parts.length - 1] };
    }
    mkdirp(abs) {
      const parts = abs.split('/').filter(Boolean);
      let node = this.root;
      for (const p of parts) {
        if (node.type === 'repo') throw new ShellError('无法在仓库内部创建目录树');
        if (!node.children.has(p)) node.children.set(p, { type: 'dir', children: new Map() });
        node = node.children.get(p);
      }
      return node;
    }
    parentOf(abs) { const parts = abs.split('/').filter(Boolean); const name = parts.pop(); return { parentPath: '/' + parts.join('/'), name }; }
    // 在路径处放置仓库
    placeRepo(abs, opts = {}) {
      const { parentPath, name } = this.parentOf(abs);
      const parent = this.mkdirp(parentPath);
      const repo = new Repo({ path: abs, bare: opts.bare, defaultBranch: opts.defaultBranch, globalConfig: this.globalConfigFor(abs), hooks: opts.hooks });
      parent.children.set(name, { type: 'repo', repo });
      return repo;
    }
    repoAt(abs) { const l = this.locate(abs); return l && l.kind === 'repo' && l.rel === '' ? l.repo : null; }
    repoByUrl(url) {
      if (this.remoteAliases[url]) url = this.remoteAliases[url];
      const abs = this.resolve(url);
      return this.repoAt(abs) || this.repoAt(abs + '.git');
    }
    allRepos() {
      const out = [];
      const walk = (node, path) => { if (node.type === 'repo') { out.push({ path, repo: node.repo }); return; } if (node.type === 'dir') for (const [n, c] of node.children) walk(c, path + '/' + n); };
      walk(this.root, '');
      return out;
    }
    currentRepo() { const l = this.locate(this.cwd); return l && l.kind === 'repo' ? l : null; }

    /* ---- .git 虚拟目录（只读，帮助理解结构） ---- */
    gitDirEntry(repo, rel) {
      const r = repo; const h = r.headHash();
      const entries = (names, types) => ({ type: 'dir', list: names.map((n, i) => ({ name: n, type: types ? types[i] : 'file' })) });
      if (rel === '') return entries(['HEAD', 'ORIG_HEAD', 'config', 'description', 'index', 'logs', 'objects', 'refs'], ['file', 'file', 'file', 'file', 'file', 'dir', 'dir', 'dir']);
      if (rel === 'HEAD') return { type: 'file', content: (r.HEAD.symbolic ? 'ref: ' + r.HEAD.symbolic : r.HEAD.detached) + '\n' };
      if (rel === 'ORIG_HEAD') return r.ORIG_HEAD ? { type: 'file', content: r.ORIG_HEAD + '\n' } : null;
      if (rel === 'description') return { type: 'file', content: "Unnamed repository; edit this file 'description' to name the repository.\n" };
      if (rel === 'config') { const lines = ['[core]', '\trepositoryformatversion = 0', '\tfilemode = true', '\tbare = false']; const groups = {}; for (const [k, v] of Object.entries(r.config)) { const m = k.match(/^([^.]+)\.(.+)\.([^.]+)$/) || k.match(/^([^.]+)\.([^.]+)$/); if (!m) continue; const g = m.length === 4 ? `${m[1]} "${m[2]}"` : m[1]; const key = m.length === 4 ? m[3] : m[2]; (groups[g] = groups[g] || []).push(`\t${key} = ${v}`); } for (const g of Object.keys(groups)) lines.push(`[${g}]`, ...groups[g]); return { type: 'file', content: lines.join('\n') + '\n' }; }
      if (rel === 'index') return { type: 'file', content: `（二进制文件。暂存区当前登记了 ${r.index.size} 个路径，用 git ls-files -s 查看）\n` };
      if (rel === 'refs') return entries(['heads', 'remotes', 'tags'], ['dir', 'dir', 'dir']);
      if (rel === 'refs/heads') return entries(r.branches());
      if (rel === 'refs/tags') return entries(r.tags());
      if (rel === 'refs/remotes') { const names = [...new Set(r.remoteRefs().map(x => x.split('/')[0]))]; return entries(names, names.map(() => 'dir')); }
      if (rel.startsWith('refs/remotes/') && rel.split('/').length === 3) { const rn = rel.split('/')[2]; return entries(r.remoteRefs().filter(x => x.startsWith(rn + '/')).map(x => x.slice(rn.length + 1))); }
      if (rel.startsWith('refs/') && r.refs.has(rel)) return { type: 'file', content: r.refs.get(rel) + '\n' };
      if (rel === 'logs') return entries(['HEAD', 'refs'], ['file', 'dir']);
      if (rel === 'logs/HEAD' || (rel.startsWith('logs/refs/heads/') && r.reflogs.has(rel.slice(5)))) { const log = (r.reflogs.get(rel === 'logs/HEAD' ? 'HEAD' : rel.slice(5)) || []).slice().reverse(); return { type: 'file', content: log.map(e => `${e.old || '0'.repeat(40)} ${e.new} ${r.getConfig('user.name') || 'you'} <${r.getConfig('user.email') || ''}> ${Math.floor(e.date / 1000)} +0800\t${e.msg}`).join('\n') + '\n' }; }
      if (rel === 'logs/refs') return entries(['heads'], ['dir']);
      if (rel === 'logs/refs/heads') return entries(r.branches().filter(b => r.reflogs.has('refs/heads/' + b)));
      if (rel === 'objects') { const dirs = [...new Set([...r.objects.keys()].map(k => k.slice(0, 2)))].sort(); return entries(dirs.concat(['info', 'pack']), dirs.map(() => 'dir').concat(['dir', 'dir'])); }
      if (rel === 'objects/info' || rel === 'objects/pack') return entries([]);
      if (/^objects\/[0-9a-f]{2}$/.test(rel)) { const pre = rel.slice(8); return entries([...r.objects.keys()].filter(k => k.startsWith(pre)).map(k => k.slice(2)).sort()); }
      if (/^objects\/[0-9a-f]{2}\/[0-9a-f]{38}$/.test(rel)) { const h = rel.slice(8, 10) + rel.slice(11); const o = r.objects.get(h); if (!o) return null; return { type: 'file', content: `（zlib 压缩的 ${o.type} 对象，${byteLen(o.content)} 字节。用 git cat-file -p ${h.slice(0, 7)} 查看内容）\n` }; }
      return null;
    }

    /* ---- 文件读写（对仓库和普通目录统一） ---- */
    readFile(abs) {
      const l = this.locate(abs);
      if (!l) return null;
      if (l.kind === 'gitdir') { const e = this.gitDirEntry(l.repo, l.rel); return e && e.type === 'file' ? e.content : null; }
      if (l.kind === 'file') return l.node.content;
      if (l.kind === 'repo' && l.rel && l.repo.workdir.has(l.rel)) return l.repo.workdir.get(l.rel);
      return null;
    }
    writeFile(abs, content) {
      const l = this.locate(abs);
      if (l && l.kind === 'gitdir') throw new ShellError('本沙盒里 .git 目录是只读的，请用 git 命令修改它');
      if (l && l.kind === 'repo') { if (!l.rel) throw new ShellError(`${abs}: Is a directory`); if (l.repo.bare) throw new ShellError('裸仓库没有工作区，不能直接写文件'); if ([...l.repo.workdir.keys()].some(k => k.startsWith(l.rel + '/'))) throw new ShellError(`${abs}: Is a directory`); l.repo.workdir.set(l.rel, content); return; }
      if (l && l.kind === 'dir') throw new ShellError(`${abs}: Is a directory`);
      const { parentPath, name } = this.parentOf(abs);
      const pl = this.locate(parentPath);
      if (!pl) throw new ShellError(`${abs}: No such file or directory`);
      if (pl.kind === 'repo') { pl.repo.workdir.set(pl.rel ? pl.rel + '/' + name : name, content); return; }
      if (pl.kind !== 'dir') throw new ShellError(`${parentPath}: Not a directory`);
      pl.node.children.set(name, { type: 'file', content });
    }
    isDir(abs) { const l = this.locate(abs); if (!l) return false; if (l.kind === 'gitdir') { const e = this.gitDirEntry(l.repo, l.rel); return !!e && e.type === 'dir'; } if (l.kind === 'dir') return true; if (l.kind === 'repo') return l.rel === '' || [...l.repo.workdir.keys()].some(k => k.startsWith(l.rel + '/')); return false; }
    exists(abs) { const l = this.locate(abs); if (!l) return false; if (l.kind === 'gitdir') return !!this.gitDirEntry(l.repo, l.rel); if (l.kind === 'repo') return l.rel === '' || l.repo.workdir.has(l.rel) || this.isDir(abs); return true; }
    listDir(abs, { all = false } = {}) {
      const l = this.locate(abs);
      if (!l) throw new ShellError(`ls: cannot access '${abs}': No such file or directory`);
      if (l.kind === 'gitdir') { const e = this.gitDirEntry(l.repo, l.rel); if (!e) throw new ShellError(`ls: cannot access '${abs}': No such file or directory`); if (e.type === 'file') return [{ name: l.rel.split('/').pop(), type: 'file' }]; return e.list; }
      if (l.kind === 'file') return [{ name: l.name, type: 'file' }];
      if (l.kind === 'dir') return [...l.node.children].map(([n, c]) => ({ name: n, type: c.type === 'file' ? 'file' : 'dir', repo: c.type === 'repo' })).sort((a, b) => a.name.localeCompare(b.name));
      const prefix = l.rel ? l.rel + '/' : '';
      const seen = new Map();
      if (l.repo.bare) return [{ name: 'HEAD', type: 'file' }, { name: 'config', type: 'file' }, { name: 'objects', type: 'dir' }, { name: 'refs', type: 'dir' }];
      for (const k of l.repo.workdir.keys()) { if (!k.startsWith(prefix)) continue; const rest = k.slice(prefix.length); const first = rest.split('/')[0]; seen.set(first, rest.includes('/') ? 'dir' : 'file'); }
      let out = [...seen].map(([name, type]) => ({ name, type })).sort((a, b) => a.name.localeCompare(b.name));
      if (!all) out = out.filter(e => !e.name.startsWith('.'));
      if (all && !l.rel) out.unshift({ name: '.git', type: 'dir', git: true });
      if (!seen.size && !l.rel && !all && this.isDir(abs)) return out;
      if (l.rel && !seen.size) { if (l.repo.workdir.has(l.rel)) return [{ name: l.rel.split('/').pop(), type: 'file' }]; throw new ShellError(`ls: cannot access '${abs}': No such file or directory`); }
      return out;
    }
    removePath(abs, { recursive = false } = {}) {
      const l = this.locate(abs);
      if (!l) throw new ShellError(`rm: cannot remove '${abs}': No such file or directory`);
      if (l.kind === 'gitdir') throw new ShellError('本沙盒里 .git 内部是只读的（rm -rf .git 可以删除整个仓库历史）');
      if (l.kind === 'repo') {
        if (!l.rel) { if (!recursive) throw new ShellError(`rm: cannot remove '${abs}': Is a directory`); const { parentPath, name } = this.parentOf(abs); this.locate(parentPath).node.children.delete(name); return; }
        if (l.repo.workdir.has(l.rel)) { l.repo.workdir.delete(l.rel); return; }
        const keys = [...l.repo.workdir.keys()].filter(k => k.startsWith(l.rel + '/'));
        if (!keys.length) throw new ShellError(`rm: cannot remove '${abs}': No such file or directory`);
        if (!recursive) throw new ShellError(`rm: cannot remove '${abs}': Is a directory`);
        keys.forEach(k => l.repo.workdir.delete(k)); return;
      }
      const { parentPath, name } = this.parentOf(abs);
      if (l.kind === 'dir' && !recursive) throw new ShellError(`rm: cannot remove '${abs}': Is a directory`);
      this.locate(parentPath).node.children.delete(name);
    }
    // 把某路径下的内容作为扁平 map 取出（用于 cp/diff/du）
    flatFiles(abs) {
      const l = this.locate(abs);
      const out = new Map();
      if (!l) return null;
      if (l.kind === 'gitdir') { const e = this.gitDirEntry(l.repo, l.rel); if (e && e.type === 'file') out.set('', e.content); return out; }
      if (l.kind === 'file') { out.set('', l.node.content); return out; }
      if (l.kind === 'repo') { const prefix = l.rel ? l.rel + '/' : ''; if (l.rel && l.repo.workdir.has(l.rel)) { out.set('', l.repo.workdir.get(l.rel)); return out; } for (const [k, v] of l.repo.workdir) if (k.startsWith(prefix)) out.set(k.slice(prefix.length), v); return out; }
      const walk = (node, p) => { for (const [n, c] of node.children) { if (c.type === 'file') out.set(p + n, c.content); else if (c.type === 'dir') walk(c, p + n + '/'); else for (const [k, v] of c.repo.workdir) out.set(p + n + '/' + k, v); } };
      walk(l.node, '');
      return out;
    }
    gitSize(repo) { return [...repo.objects.values()].reduce((s, o) => s + byteLen(o.content), 0); }
    sizeOf(abs) {
      const l = this.locate(abs);
      if (!l) return 0;
      let size = 0;
      const flat = this.flatFiles(abs); for (const v of flat.values()) size += byteLen(v);
      if (l.kind === 'repo' && !l.rel) size += this.gitSize(l.repo);
      if (l.kind === 'dir') { const walk = node => { for (const c of node.children.values()) { if (c.type === 'repo') size += this.gitSize(c.repo); else if (c.type === 'dir') walk(c); } }; walk(l.node); }
      return size;
    }
    copyPath(src, dst, { recursive = false } = {}) {
      const l = this.locate(src);
      if (!l) throw new ShellError(`cp: cannot stat '${src}': No such file or directory`);
      const isFile = l.kind === 'file' || (l.kind === 'repo' && l.rel && l.repo.workdir.has(l.rel));
      if (isFile) { let target = dst; if (this.isDir(dst)) target = dst + '/' + src.split('/').pop(); this.writeFile(target, this.readFile(src)); return; }
      if (!recursive) throw new ShellError(`cp: -r not specified; omitting directory '${src}'`);
      let target = dst; if (this.isDir(dst)) target = dst + '/' + src.split('/').pop();
      if (this.exists(target)) throw new ShellError(`cp: '${target}' already exists`);
      const { parentPath, name } = this.parentOf(target);
      const pl = this.locate(parentPath);
      if (!pl) throw new ShellError(`cp: cannot create directory '${target}': No such file or directory`);
      if (l.kind === 'repo' && !l.rel) {
        if (pl.kind !== 'dir') throw new ShellError('cp: 仓库只能复制到普通目录下');
        const r = l.repo.clone(); r.path = target; r.globalConfig = this.globalConfigFor(target);
        pl.node.children.set(name, { type: 'repo', repo: r }); return;
      }
      const flat = this.flatFiles(src);
      if (pl.kind === 'repo') { for (const [k, v] of flat) pl.repo.workdir.set((pl.rel ? pl.rel + '/' : '') + name + '/' + k, v); return; }
      const dir = { type: 'dir', children: new Map() };
      pl.node.children.set(name, dir);
      const sub = (path, content) => { const parts = path.split('/'); let n = dir; for (let i = 0; i < parts.length - 1; i++) { if (!n.children.has(parts[i])) n.children.set(parts[i], { type: 'dir', children: new Map() }); n = n.children.get(parts[i]); } n.children.set(parts[parts.length - 1], { type: 'file', content }); };
      for (const [k, v] of flat) sub(k, v);
    }

    /* ---- 提示符 ---- */
    prompt() {
      const short = this.cwd.startsWith(this.home) ? '~' + this.cwd.slice(this.home.length) : this.cwd;
      const l = this.currentRepo();
      let gitInfo = '';
      if (l) {
        const r = l.repo;
        if (r.bare) gitInfo = ' (BARE)';
        else {
          const b = r.currentBranch();
          let s = b || `HEAD detached at ${abbrev(r.headHash())}`;
          if (r.state.merge) s += '|MERGING'; if (r.state.rebase) s += '|REBASE'; if (r.state.cherryPick) s += '|CHERRY-PICKING'; if (r.state.revert) s += '|REVERTING'; if (r.state.bisect) s += '|BISECTING';
          gitInfo = ` (${s})`;
        }
      }
      return `${this.actorName}@gitgame:${short}${gitInfo}$ `;
    }

    /* ---- 执行 ---- */
    exec(line, opts = {}) {
      // 返回 { out, err, actions }
      const results = [];
      let tokens;
      tokenize.actor = this.actorName; tokenize.cwd = this.cwd;
      try { tokens = tokenize(line.replace(/\s2>\s*\/dev\/null/g, '').replace(/\s2>&1/g, '')); } catch (e) { return { out: '', err: e.message, ok: false }; }
      const segments = []; let cur = []; let ops = [];
      for (const t of tokens) { if (t === '&&' || t === ';' || t === '||') { segments.push(cur); ops.push(t); cur = []; } else cur.push(t); }
      segments.push(cur);
      let out = '', err = '', ok = true; const actions = []; const traces = [];
      for (let i = 0; i < segments.length; i++) {
        if (i > 0) { const op = ops[i - 1]; if (op === '&&' && !ok) continue; if (op === '||' && ok) continue; }
        const seg = segments[i];
        if (!seg.length) continue;
        const r = this.execOne(seg, opts);
        ok = r.ok;
        this.log.push({ line: seg.join(' '), ok, cwd: this.cwd, actor: this.actorName, segment: true });
        if (r.out) out += (out ? '\n' : '') + r.out;
        if (r.err) err += (err ? '\n' : '') + r.err;
        if (r.actions) actions.push(...r.actions);
        if (r.trace) traces.push(...r.trace);
      }
      return { out, err, ok, actions, traces };
    }
    execOne(tokens, opts) {
      // 重定向
      let redirect = null, append = false;
      const ri = tokens.findIndex(t => t === '>' || t === '>>');
      if (ri >= 0) { append = tokens[ri] === '>>'; redirect = tokens[ri + 1]; if (!redirect) return { ok: false, err: 'bash: syntax error near unexpected token `newline\'' }; tokens = tokens.slice(0, ri); }
      const [cmd, ...args] = tokens;
      let res;
      try {
        res = this.runCommand(cmd, args, opts);
        if (typeof res === 'string') res = { out: res };
        res.ok = res.ok !== false;
      } catch (e) {
        if (e instanceof GitError || e instanceof ShellError) return { ok: false, err: e.message, gitError: e instanceof GitError };
        console.error(e);
        return { ok: false, err: '内部错误: ' + e.message };
      }
      if (redirect !== null) {
        const abs = this.resolve(redirect);
        try {
          const prev = append ? (this.readFile(abs) || '') : '';
          const text = (res.out || '');
          this.writeFile(abs, prev + (text ? text + '\n' : ''));
        } catch (e) { return { ok: false, err: e.message }; }
        return { ok: res.ok, out: '', err: res.err, actions: res.actions };
      }
      return res;
    }
    runCommand(cmd, args, opts) {
      const h = shellCommands[cmd];
      if (h) return h(this, args, opts);
      if (cmd === 'git') return this.runGit(args, opts);
      if (['npm', 'yarn', 'pnpm', 'make', 'pytest', 'python', 'python3', 'node', 'bash', 'sh', 'cargo', 'go', 'mvn'].includes(cmd) || cmd.startsWith('./')) return this.runTests(cmd, args);
      throw new ShellError(`bash: ${cmd}: command not found（输入 help 查看支持的命令）`);
    }
    runTests(cmd, args) {
      const l = this.currentRepo();
      if (!this.testRunner) throw new ShellError(`${cmd}: 本关没有定义测试命令。`);
      const r = this.testRunner(l ? l.repo : null, this, cmd, args);
      if (typeof r === 'string') return r;
      return { out: r.out, ok: r.ok !== false };
    }
    runGit(args, opts = {}) {
      if (args[0] === 'init') return shellCommands.__gitinit(this, args.slice(1));
      if (args[0] === 'clone') return shellCommands.__gitclone(this, args.slice(1));
      if (args[0] === '--version' || args[0] === 'version') return 'git version 2.45.0 (gitgame sandbox)';
      if (args[0] === '--help' || args[0] === 'help') args = ['help'];
      const l = this.currentRepo();
      if (!l) {
        if (args[0] === 'config' && args.includes('--global')) { const r = new Repo({ path: this.cwd, globalConfig: this.globalConfigFor(this.cwd) }); return runGit({ repo: r, world: this, cwdRel: '' }, args); }
        throw new GitError('fatal: not a git repository (or any of the parent directories): .git');
      }
      const ctx = { repo: l.repo, world: this, cwdRel: l.rel, editor: opts.editor || null, rerun: argv => { const r = this.exec('git ' + argv.map(a => /[\s"']/.test(a) ? JSON.stringify(a) : a).join(' '), opts); return r.err ? r.err : r.out; } };
      const out = runGit(ctx, args);
      return { out, trace: l.repo.trace.slice() };
    }
    // 以另一位用户身份在某目录执行（脚本化的同事）
    runAs(actor, cwd, line) {
      const saveCwd = this.cwd, saveActor = this.actorName, saveHome = this.home;
      this.cwd = cwd; this.actorName = actor; this.home = '/home/' + actor;
      try { return this.exec(line, { silentActor: true }); } finally { this.cwd = saveCwd; this.actorName = saveActor; this.home = saveHome; }
    }
  }

  /* ================= shell 命令 ================= */
  const shellCommands = {};
  shellCommands.pwd = w => w.cwd;
  shellCommands.cd = (w, args) => {
    const target = w.resolve(args[0] || '~');
    if (!w.isDir(target)) { if (w.exists(target)) throw new ShellError(`bash: cd: ${args[0]}: Not a directory`); throw new ShellError(`bash: cd: ${args[0]}: No such file or directory`); }
    w.cwd = target; return '';
  };
  shellCommands.ls = (w, args) => {
    const { flags, positional } = parseArgs(args, { a: 'bool', l: 'bool', R: 'bool', A: 'bool', h: 'bool' });
    const targets = positional.length ? positional : ['.'];
    const outs = [];
    for (const t of targets) {
      const abs = w.resolve(t);
      let entries; try { entries = w.listDir(abs, { all: flags.a || flags.A }); } catch (e) { outs.push(e.message); continue; }
      const body = flags.l ? entries.map(e => `${e.type === 'dir' ? 'drwxr-xr-x' : '-rw-r--r--'}  ${w.actorName}  ${String(e.type === 'file' ? byteLen(w.readFile(abs + '/' + e.name) || '') : 4096).padStart(6)}  ${e.name}${e.type === 'dir' ? '/' : ''}`).join('\n') : entries.map(e => e.name + (e.type === 'dir' ? '/' : '')).join('  ');
      outs.push(targets.length > 1 ? `${t}:\n${body}` : body);
    }
    return outs.join('\n\n');
  };
  shellCommands.tree = (w, args) => {
    const { flags, positional } = parseArgs(args, { a: 'bool', L: 'value' });
    const abs = w.resolve(positional[0] || '.');
    const lines = [positional[0] || '.'];
    const walk = (path, prefix, depth) => {
      let entries; try { entries = w.listDir(path, { all: flags.a }); } catch (e) { return; }
      entries.forEach((e, i) => {
        const last = i === entries.length - 1;
        lines.push(`${prefix}${last ? '└── ' : '├── '}${e.name}${e.type === 'dir' ? '/' : ''}${e.repo ? '  (git 仓库)' : ''}`);
        if (e.type === 'dir' && !e.git && !(flags.L && depth + 1 >= parseInt(flags.L, 10))) walk(path + '/' + e.name, prefix + (last ? '    ' : '│   '), depth + 1);
      });
    };
    walk(abs, '', 0);
    return lines.join('\n');
  };
  shellCommands.cat = (w, args) => {
    if (!args.length) throw new ShellError('cat: 请指定文件');
    const outs = [];
    for (const a of args) { const abs = w.resolve(a); if (w.isDir(abs)) throw new ShellError(`cat: ${a}: Is a directory`); const c = w.readFile(abs); if (c === null) throw new ShellError(`cat: ${a}: No such file or directory`); outs.push(c.replace(/\n$/, '')); }
    return outs.join('\n');
  };
  shellCommands.head = (w, args) => { const { flags, positional } = parseArgs(args, { n: 'value' }); const c = w.readFile(w.resolve(positional[0] || '')); if (c === null) throw new ShellError(`head: cannot open '${positional[0]}'`); return c.split('\n').slice(0, parseInt(flags.n || '10', 10)).join('\n'); };
  shellCommands.tail = (w, args) => { const { flags, positional } = parseArgs(args, { n: 'value' }); const c = w.readFile(w.resolve(positional[0] || '')); if (c === null) throw new ShellError(`tail: cannot open '${positional[0]}'`); const ls = c.replace(/\n$/, '').split('\n'); return ls.slice(-parseInt(flags.n || '10', 10)).join('\n'); };
  shellCommands.wc = (w, args) => { const { flags, positional } = parseArgs(args, { l: 'bool', c: 'bool', w: 'bool' }); return positional.map(p => { const c = w.readFile(w.resolve(p)); if (c === null) throw new ShellError(`wc: ${p}: No such file or directory`); const lines = (c.match(/\n/g) || []).length; if (flags.l) return `${lines} ${p}`; return `${lines} ${c.split(/\s+/).filter(Boolean).length} ${byteLen(c)} ${p}`; }).join('\n'); };
  shellCommands.echo = (w, args) => { const { flags, positional } = parseArgs(args, { n: 'bool', e: 'bool' }); let s = positional.join(' '); if (flags.e) s = s.replace(/\\n/g, '\n').replace(/\\t/g, '\t'); return s; };
  shellCommands.printf = (w, args) => args.join(' ').replace(/\\n/g, '\n').replace(/\\t/g, '\t').replace(/\n$/, '');
  shellCommands.touch = (w, args) => { if (!args.length) throw new ShellError('touch: missing file operand'); for (const a of args) { const abs = w.resolve(a); if (!w.exists(abs)) w.writeFile(abs, ''); } return ''; };
  shellCommands.mkdir = (w, args) => {
    const { flags, positional } = parseArgs(args, { p: 'bool' });
    for (const a of positional) {
      const abs = w.resolve(a);
      if (w.exists(abs)) { if (flags.p) continue; throw new ShellError(`mkdir: cannot create directory '${a}': File exists`); }
      const { parentPath, name } = w.parentOf(abs);
      const pl = w.locate(parentPath);
      if (!pl) { if (flags.p) { w.mkdirp(abs); continue; } throw new ShellError(`mkdir: cannot create directory '${a}': No such file or directory`); }
      if (pl.kind === 'repo') { /* git 不跟踪空目录，放一个占位说明 */ return `（提示：git 不会记录空目录。目录会在你往里放文件时自动出现，例如 echo hi > ${a}/file.txt）`; }
      if (pl.kind !== 'dir') throw new ShellError(`mkdir: cannot create directory '${a}': Not a directory`);
      pl.node.children.set(name, { type: 'dir', children: new Map() });
    }
    return '';
  };
  shellCommands.rm = (w, args) => {
    const { flags, positional } = parseArgs(args, { r: 'bool', R: 'bool', f: 'bool', rf: 'bool', fr: 'bool' });
    if (!positional.length) throw new ShellError('rm: missing operand');
    for (const a of positional) {
      const abs = w.resolve(a);
      if (abs === w.home || abs === '/') throw new ShellError('rm: 拒绝删除主目录');
      if (abs.endsWith('/.git')) {
        const l = w.locate(abs.slice(0, -5));
        if (l && l.kind === 'repo' && !l.rel) { if (!(flags.r || flags.R || flags.rf || flags.fr)) throw new ShellError(`rm: cannot remove '${a}': Is a directory`); const files = new Map(l.repo.workdir); const { parentPath, name } = w.parentOf(abs.slice(0, -5)); const dir = { type: 'dir', children: new Map() }; w.locate(parentPath).node.children.set(name, dir); for (const [k, v] of files) { const parts = k.split('/'); let n = dir; for (let i = 0; i < parts.length - 1; i++) { if (!n.children.has(parts[i])) n.children.set(parts[i], { type: 'dir', children: new Map() }); n = n.children.get(parts[i]); } n.children.set(parts[parts.length - 1], { type: 'file', content: v }); } w.lastEvent = { type: 'git-dir-deleted', path: abs }; continue; }
      }
      if (a.includes('*')) { const dir = w.resolve(a.includes('/') ? a.slice(0, a.lastIndexOf('/')) : '.'); const re = new RegExp('^' + a.split('/').pop().replace(/\./g, '\\.').replace(/\*/g, '.*') + '$'); for (const e of w.listDir(dir)) if (re.test(e.name)) w.removePath(dir + '/' + e.name, { recursive: flags.r || flags.R }); continue; }
      try { w.removePath(abs, { recursive: flags.r || flags.R || flags.rf || flags.fr }); } catch (e) { if (!flags.f) throw e; }
      if (w.cwd.startsWith(abs + '/') || w.cwd === abs) w.cwd = w.parentOf(abs).parentPath;
    }
    return '';
  };
  shellCommands.mv = (w, args) => {
    const { positional } = parseArgs(args, { f: 'bool' });
    if (positional.length !== 2) throw new ShellError('usage: mv <source> <dest>');
    const src = w.resolve(positional[0]); let dst = w.resolve(positional[1]);
    if (!w.exists(src)) throw new ShellError(`mv: cannot stat '${positional[0]}': No such file or directory`);
    if (w.isDir(dst)) dst = dst + '/' + src.split('/').pop();
    w.copyPath(src, dst, { recursive: true });
    w.removePath(src, { recursive: true });
    return '';
  };
  shellCommands.cp = (w, args) => {
    const { flags, positional } = parseArgs(args, { r: 'bool', R: 'bool', a: 'bool', f: 'bool' });
    if (positional.length < 2) throw new ShellError('usage: cp [-r] <source> <dest>');
    const dst = w.resolve(positional[positional.length - 1]);
    for (const s of positional.slice(0, -1)) w.copyPath(w.resolve(s), dst, { recursive: flags.r || flags.R || flags.a });
    return '';
  };
  shellCommands.du = (w, args) => {
    const { flags, positional } = parseArgs(args, { s: 'bool', h: 'bool', a: 'bool' });
    let targets = positional.length ? positional : ['.'];
    const expanded = [];
    for (const t of targets) { if (t === '*') { for (const e of w.listDir(w.cwd)) expanded.push(e.name); } else expanded.push(t); }
    return expanded.map(t => { const abs = w.resolve(t); if (!w.exists(abs)) throw new ShellError(`du: cannot access '${t}': No such file or directory`); const l = w.locate(abs); const size = w.sizeOf(abs); const extra = (l && l.kind === 'repo' && !l.rel) ? `   （其中 .git 对象库 ${human(w.gitSize(l.repo))}，${l.repo.objects.size} 个对象）` : ''; return `${human(size).padStart(7)}\t${t}${extra}`; }).join('\n');
  };
  shellCommands.diff = (w, args) => {
    const { flags, positional } = parseArgs(args, { r: 'bool', u: 'bool', q: 'bool', N: 'bool' });
    if (positional.length !== 2) throw new ShellError('usage: diff [-r] <a> <b>');
    const [a, b] = positional.map(p => w.resolve(p));
    for (const [p, o] of [[a, positional[0]], [b, positional[1]]]) if (!w.exists(p)) throw new ShellError(`diff: ${o}: No such file or directory`);
    const fa = w.flatFiles(a), fb = w.flatFiles(b);
    if (fa.has('') && fb.has('')) { const h = unifiedHunks(fa.get(''), fb.get('')); if (!h) return ''; return `--- ${positional[0]}\n+++ ${positional[1]}\n${h}`.replace(/\n$/, ''); }
    if (fa.has('') || fb.has('')) throw new ShellError('diff: 一个是文件，一个是目录');
    const out = [];
    for (const k of unionKeys(fa, fb)) {
      if (!flags.r && k.includes('/')) continue;
      if (!fa.has(k)) { out.push(`Only in ${positional[1]}${k.includes('/') ? '/' + k.split('/').slice(0, -1).join('/') : ''}: ${k.split('/').pop()}`); continue; }
      if (!fb.has(k)) { out.push(`Only in ${positional[0]}${k.includes('/') ? '/' + k.split('/').slice(0, -1).join('/') : ''}: ${k.split('/').pop()}`); continue; }
      if (fa.get(k) !== fb.get(k)) { if (flags.q) out.push(`Files ${positional[0]}/${k} and ${positional[1]}/${k} differ`); else out.push(`diff -r ${positional[0]}/${k} ${positional[1]}/${k}\n${unifiedHunks(fa.get(k), fb.get(k)).replace(/\n$/, '')}`); }
    }
    return out.join('\n');
  };
  shellCommands.grep = (w, args) => {
    const { flags, positional } = parseArgs(args, { n: 'bool', i: 'bool', r: 'bool', l: 'bool', v: 'bool' });
    if (positional.length < 1) throw new ShellError('usage: grep [-n] <pattern> <file>...');
    const re = new RegExp(positional[0], flags.i ? 'i' : '');
    let files = positional.slice(1); if (!files.length) files = ['.'];
    const out = [];
    for (const f of files) {
      const abs = w.resolve(f);
      const flat = w.flatFiles(abs);
      if (!flat) throw new ShellError(`grep: ${f}: No such file or directory`);
      for (const [k, c] of flat) {
        if (k !== '' && !flags.r) continue;
        const name = k === '' ? f : (f === '.' ? k : f + '/' + k);
        c.replace(/\n$/, '').split('\n').forEach((line, i) => { if (re.test(line) !== !!flags.v) out.push(flags.l ? name : `${files.length > 1 || k !== '' ? name + ':' : ''}${flags.n ? (i + 1) + ':' : ''}${line}`); });
      }
    }
    return { out: [...new Set(out)].join('\n'), ok: out.length > 0 };
  };
  shellCommands.sed = (w, args) => {
    const { flags, positional } = parseArgs(args, { i: 'bool', e: 'value' });
    const expr = flags.e || positional.shift();
    const m = expr && expr.match(/^s(.)(.*?)\1(.*?)\1([gi]*)$/);
    if (!m) throw new ShellError('sed: 本沙盒仅支持 s/旧/新/[g] 形式，例如 sed -i "s/foo/bar/g" file.txt');
    const re = new RegExp(m[2], m[4]);
    const outs = [];
    for (const f of positional) { const abs = w.resolve(f); const c = w.readFile(abs); if (c === null) throw new ShellError(`sed: can't read ${f}: No such file or directory`); const n = c.replace(re, m[3]); if (flags.i) w.writeFile(abs, n); else outs.push(n.replace(/\n$/, '')); }
    return outs.join('\n');
  };
  shellCommands.clear = () => ({ out: '', actions: [{ type: 'clear' }] });
  shellCommands.history = w => w.log.map((l, i) => `${String(i + 1).padStart(4)}  ${l.line}`).join('\n');
  shellCommands.whoami = w => w.actorName;
  shellCommands.date = () => new Date(global.GitCore.clock.t + 8 * 3600e3).toUTCString().replace('GMT', '+0800');
  shellCommands.true = () => '';
  shellCommands.false = () => ({ out: '', ok: false });
  shellCommands.exit = () => '（这是浏览器里的沙盒，没法退出～）';
  shellCommands.help = () => [
    '沙盒 shell 支持的命令：',
    '  文件：ls [-a] [-l]  cat  echo "文本" > 文件  echo "文本" >> 文件  touch  rm [-r]  mv  cp [-r]  mkdir  tree  du -sh  diff [-r]  grep [-n]  sed -i "s/旧/新/g" 文件  head  tail  wc',
    '  编辑：edit <文件>（也可以用 vim/nano/code，会打开编辑器面板；在右侧“文件”标签里点击文件也能编辑）',
    '  目录：cd  pwd',
    '  测试：npm test / make test / pytest（部分关卡提供）',
    '  git：git help 查看 git 子命令；git <命令> 与真实 git 用法一致',
    '  其它：clear  history  whoami  date',
  ].join('\n');
  for (const ed of ['edit', 'vim', 'vi', 'nano', 'code', 'open']) shellCommands[ed] = (w, args) => {
    if (!args.length) throw new ShellError(`${ed}: 请指定要编辑的文件`);
    const abs = w.resolve(args[0]);
    if (w.isDir(abs)) throw new ShellError(`${ed}: ${args[0]} 是目录`);
    const l = w.locate(abs);
    if (l && l.kind === 'repo' && l.repo.bare) throw new ShellError('裸仓库没有工作区');
    return { out: '', actions: [{ type: 'edit', path: abs, content: w.readFile(abs) }] };
  };

  shellCommands.__gitinit = (w, args) => {
    const { flags, positional } = parseArgs(args, { bare: 'bool', b: 'value', 'initial-branch': 'value', q: 'bool' });
    const target = w.resolve(positional[0] || '.');
    const l = w.locate(target);
    if (l && l.kind === 'repo') { if (l.rel) throw new GitError(`fatal: 本沙盒不支持嵌套仓库：${l.repo.path} 已经是一个 git 仓库。\nhint: 如果那是误操作，先 rm -rf ${l.repo.path}/.git 撤销，再到正确的目录执行 git init。`); return `Reinitialized existing Git repository in ${target}/.git/`; }
    if (l && l.kind === 'file') throw new GitError(`fatal: cannot mkdir ${positional[0]}: File exists`);
    const defaultBranch = flags.b || flags['initial-branch'] || w.globalConfigFor(target)['init.defaultBranch'] || 'main';
    let files = new Map();
    if (l && l.kind === 'dir') { files = w.flatFiles(target); const { parentPath, name } = w.parentOf(target); w.locate(parentPath).node.children.delete(name); }
    const { parentPath } = w.parentOf(target);
    let pl = w.locate(parentPath);
    if (!pl) { w.mkdirp(parentPath); pl = w.locate(parentPath); }
    if (!pl || pl.kind !== 'dir') throw new GitError(`fatal: cannot create '${target}'`);
    const repo = w.placeRepo(target, { bare: flags.bare, defaultBranch });
    if (!flags.bare) for (const [k, v] of files) repo.workdir.set(k, v);
    repo.trace = [{ kind: 'init', bare: !!flags.bare }];
    return { out: `Initialized empty ${flags.bare ? 'Git' : 'Git'} repository in ${target}${flags.bare ? '' : '/.git'}/`, trace: repo.trace };
  };
  shellCommands.__gitclone = (w, args) => {
    const { flags, positional } = parseArgs(args, { b: 'value', branch: 'value', bare: 'bool', q: 'bool', depth: 'value', o: 'value', origin: 'value' });
    if (!positional.length) throw new GitError('fatal: You must specify a repository to clone.');
    const url = positional[0];
    const src = w.repoByUrl(url);
    if (!src) throw new GitError(`fatal: repository '${url}' does not exist`);
    const name = positional[1] || url.replace(/\/+$/, '').split('/').pop().replace(/\.git$/, '');
    const target = w.resolve(name);
    if (w.exists(target)) throw new GitError(`fatal: destination path '${name}' already exists and is not an empty directory.`);
    const { parentPath } = w.parentOf(target);
    const pl = w.locate(parentPath);
    if (!pl || pl.kind !== 'dir') throw new GitError(`fatal: could not create work tree dir '${name}'`);
    const remoteName = flags.o || flags.origin || 'origin';
    const repo = w.placeRepo(target, { bare: flags.bare });
    repo.config[`remote.${remoteName}.url`] = url;
    repo.config[`remote.${remoteName}.fetch`] = `+refs/heads/*:refs/remotes/${remoteName}/*`;
    let out = `Cloning into '${name}'...\n`;
    const tips = [...src.refs.values()];
    const count = transferObjects(src, repo, tips);
    if (count) out += `remote: Enumerating objects: ${count}, done.\nReceiving objects: 100% (${count}/${count}), done.\n`;
    for (const b of src.branches()) repo.refs.set(`refs/remotes/${remoteName}/${b}`, src.refs.get('refs/heads/' + b));
    for (const t of src.tags()) repo.refs.set('refs/tags/' + t, src.refs.get('refs/tags/' + t));
    let def = flags.b || flags.branch || (src.HEAD.symbolic ? src.HEAD.symbolic.replace('refs/heads/', '') : null);
    if (def && !src.refs.has('refs/heads/' + def)) { if (flags.b) throw new GitError(`fatal: Remote branch ${def} not found in upstream ${remoteName}`); def = src.branches()[0]; }
    if (!def || !src.refs.has('refs/heads/' + def)) { out += 'warning: You appear to have cloned an empty repository.'; repo.HEAD = { symbolic: 'refs/heads/' + (def || 'main') }; repo.trace = [{ kind: 'clone', url }]; return { out: out.replace(/\n$/, ''), trace: repo.trace }; }
    const tip = src.refs.get('refs/heads/' + def);
    repo.refs.set('refs/heads/' + def, tip);
    repo.HEAD = { symbolic: 'refs/heads/' + def };
    repo.config[`branch.${def}.remote`] = remoteName; repo.config[`branch.${def}.merge`] = 'refs/heads/' + def;
    repo.logReflog('HEAD', null, tip, `clone: from ${url}`); repo.logReflog('refs/heads/' + def, null, tip, `clone: from ${url}`);
    if (!flags.bare) repo.resetHardTo(repo.treeOfCommit(tip));
    repo.trace = [{ kind: 'clone', url, objects: count }];
    return { out: out + 'done.', trace: repo.trace };
  };

  global.GitShell = { World, ShellError, tokenize, shellCommands, human };
})(typeof window !== 'undefined' ? window : globalThis);
