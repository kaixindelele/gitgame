/* git 子命令实现：把命令行参数翻译成引擎操作，并生成与真实 git 一致风格的输出 */
(function (global) {
  'use strict';
  const { Repo, GitError, parseArgs, now, fmtDate, fmtDateISO, abbrev, plural, unionKeys, setEq } = global.GitCore;
  const { unifiedHunks, diffLines, splitLines } = global.GitDiff;

  const pad = (s, n) => String(s).padEnd(n);
  function joinLines(arr) { return arr.filter(x => x !== null && x !== undefined && x !== '').join('\n'); }

  /* ================= 路径处理 ================= */
  function normPath(p) {
    const parts = [];
    for (const seg of p.split('/')) {
      if (seg === '' || seg === '.') continue;
      if (seg === '..') { parts.pop(); continue; }
      parts.push(seg);
    }
    return parts.join('/');
  }
  function toRepoPath(ctx, arg) {
    if (arg.startsWith('/')) {
      if (!arg.startsWith(ctx.repo.path + '/') && arg !== ctx.repo.path) throw new GitError(`fatal: ${arg}: '${arg}' is outside repository at '${ctx.repo.path}'`);
      return normPath(arg.slice(ctx.repo.path.length));
    }
    return normPath((ctx.cwdRel ? ctx.cwdRel + '/' : '') + arg);
  }
  function globToRe(g) { return new RegExp('^' + g.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*\*/g, '.*').replace(/\*/g, '[^/]*').replace(/\?/g, '.') + '$'); }
  // 展开 pathspec：返回匹配的路径集合（从候选路径中）
  function matchPathspec(spec, candidates) {
    if (spec === '' || spec === '.') return candidates.slice();
    if (/[*?]/.test(spec)) { const re = globToRe(spec); return candidates.filter(p => re.test(p)); }
    return candidates.filter(p => p === spec || p.startsWith(spec + '/'));
  }

  /* ================= 状态输出 ================= */
  function aheadBehind(repo, branch) {
    const up = repo.upstreamOf(branch);
    if (!up || !repo.refs.has(up.ref)) return null;
    const head = repo.headHash(), upH = repo.refs.get(up.ref);
    if (!head) return null;
    return { name: up.name, ahead: repo.revList([head], [upH]).length, behind: repo.revList([upH], [head]).length };
  }
  function statusText(repo) {
    const s = repo.statusData();
    const out = [];
    const head = s.head;
    if (repo.state.rebase) {
      const rb = repo.state.rebase;
      out.push(`rebase in progress; onto ${abbrev(rb.onto)}`);
      out.push(`You are currently rebasing branch '${rb.branch}' on '${abbrev(rb.onto)}'.`);
      if (s.conflicts.length) out.push(`  (fix conflicts and then run "git rebase --continue")\n  (use "git rebase --skip" to skip this patch)\n  (use "git rebase --abort" to check out the original branch)`);
      else out.push(`  (all conflicts fixed: run "git rebase --continue")`);
    } else if (!s.branch) {
      out.push(`HEAD detached at ${abbrev(head)}`);
    } else {
      out.push(`On branch ${s.branch}`);
    }
    if (repo.state.bisect) out.push(`You are currently bisecting, started from branch '${repo.state.bisect.origBranch || abbrev(repo.state.bisect.origHead)}'.\n  (use "git bisect reset" to get back to the original branch)`);
    if (s.branch && !repo.state.rebase) {
      const ab = aheadBehind(repo, s.branch);
      if (ab) {
        if (!ab.ahead && !ab.behind) out.push(`Your branch is up to date with '${ab.name}'.`);
        else if (ab.ahead && !ab.behind) out.push(`Your branch is ahead of '${ab.name}' by ${plural(ab.ahead, 'commit')}.\n  (use "git push" to publish your local commits)`);
        else if (!ab.ahead && ab.behind) out.push(`Your branch is behind '${ab.name}' by ${plural(ab.behind, 'commit')}, and can be fast-forwarded.\n  (use "git pull" to update your local branch)`);
        else out.push(`Your branch and '${ab.name}' have diverged,\nand have ${ab.ahead} and ${ab.behind} different commits each, respectively.\n  (use "git pull" if you want to integrate the remote branch with yours)`);
      }
    }
    if (!head) out.push('\nNo commits yet');
    const infoLines = out.length;
    if (repo.state.merge) {
      out.push('');
      if (s.conflicts.length) out.push(`You have unmerged paths.\n  (fix conflicts and run "git commit")\n  (use "git merge --abort" to abort the merge)`);
      else out.push(`All conflicts fixed but you are still merging.\n  (use "git commit" to conclude merge)`);
    }
    if (repo.state.cherryPick) {
      out.push('');
      out.push(`You are currently cherry-picking commit ${abbrev(repo.state.cherryPick.hash)}.`);
      if (s.conflicts.length) out.push(`  (fix conflicts and run "git cherry-pick --continue")\n  (use "git cherry-pick --skip" to skip this patch)\n  (use "git cherry-pick --abort" to cancel the cherry-pick operation)`);
      else out.push(`  (all conflicts fixed: run "git cherry-pick --continue")\n  (use "git cherry-pick --abort" to cancel the cherry-pick operation)`);
    }
    if (repo.state.revert) {
      out.push('');
      out.push(`You are currently reverting commit ${abbrev(repo.state.revert.hash)}.`);
      if (s.conflicts.length) out.push(`  (fix conflicts and run "git revert --continue")\n  (use "git revert --abort" to cancel the revert operation)`);
      else out.push(`  (all conflicts fixed: run "git revert --continue")\n  (use "git revert --abort" to cancel the revert operation)`);
    }
    if (s.conflicts.length) {
      out.push('');
      out.push(`Unmerged paths:\n  (use "git add <file>..." to mark resolution)`);
      for (const c of s.conflicts) out.push(`\t${pad(c.status + ':', 17)}${c.path}`);
    }
    if (s.staged.length) {
      out.push('');
      out.push(`Changes to be committed:\n  (use "${head ? 'git restore --staged <file>...' : 'git rm --cached <file>...'}" to unstage)`);
      for (const c of s.staged) out.push(`\t${pad(c.status + ':', 12)}${c.path}`);
    }
    if (s.unstaged.length) {
      out.push('');
      const hasDel = s.unstaged.some(c => c.status === 'deleted');
      out.push(`Changes not staged for commit:\n  (use "git add${hasDel ? '/rm' : ''} <file>..." to update what will be committed)\n  (use "git restore <file>..." to discard changes in working directory)`);
      for (const c of s.unstaged) out.push(`\t${pad(c.status + ':', 12)}${c.path}`);
    }
    if (s.untracked.length) {
      out.push('');
      out.push(`Untracked files:\n  (use "git add <file>..." to include in what will be committed)`);
      for (const p of s.untracked) out.push(`\t${p}`);
    }
    out.push('');
    if (out.length === infoLines + 1 && infoLines === 1) out.pop();
    if (s.conflicts.length) { /* 无尾注 */ if (out[out.length - 1] === '') out.pop(); }
    else if (!s.staged.length && !s.unstaged.length) {
      if (repo.state.merge || repo.state.cherryPick || repo.state.revert || repo.state.rebase) out.pop();
      else if (s.untracked.length) out.push(`nothing added to commit but untracked files present (use "git add" to track)`);
      else if (!head) out.push(`nothing to commit (create/copy files and use "git add" to track)`);
      else out.push('nothing to commit, working tree clean');
    } else if (!s.staged.length) out.push(`no changes added to commit (use "git add" and/or "git commit -a")`);
    else if (out[out.length - 1] === '') out.pop();
    return out.join('\n');
  }
  function statusShort(repo) {
    const s = repo.statusData();
    const rows = new Map();
    for (const c of s.staged) rows.set(c.path, [c.status === 'new file' ? 'A' : c.status === 'deleted' ? 'D' : 'M', ' ']);
    for (const c of s.unstaged) { const r = rows.get(c.path) || [' ', ' ']; r[1] = c.status === 'deleted' ? 'D' : 'M'; rows.set(c.path, r); }
    for (const c of s.conflicts) rows.set(c.path, c.status === 'both added' ? ['A', 'A'] : c.status === 'deleted by us' ? ['D', 'U'] : c.status === 'deleted by them' ? ['U', 'D'] : ['U', 'U']);
    for (const p of s.untracked) rows.set(p, ['?', '?']);
    return [...rows].sort().map(([p, r]) => `${r[0]}${r[1]} ${p}`).join('\n');
  }

  /* ================= 提交结果输出 ================= */
  function commitResultText(repo, hash, { label } = {}) {
    const c = repo.getCommit(hash);
    const parentTree = repo.treeOfCommit(c.parents[0] || null);
    const changes = repo.diffTrees(parentTree, repo.treeOfCommit(hash));
    const branch = repo.currentBranch();
    let head = `[${label || (branch ? branch : 'detached HEAD')}${c.parents.length ? '' : ' (root-commit)'} ${abbrev(hash)}] ${repo.subject(hash)}`;
    const lines = [head];
    if (changes.length) {
      lines.push(repo.statSummary(changes));
      for (const ch of changes) if (ch.status === 'A') lines.push(` create mode 100644 ${ch.path}`); else if (ch.status === 'D') lines.push(` delete mode 100644 ${ch.path}`);
    }
    return lines.join('\n');
  }
  function commitHeaderText(repo, hash, { deco = true } = {}) {
    const c = repo.getCommit(hash);
    const lines = [`commit ${hash}${deco ? repo.decoStr(hash) : ''}`];
    if (c.parents.length > 1) lines.push(`Merge: ${c.parents.map(abbrev).join(' ')}`);
    lines.push(`Author: ${c.author.name} <${c.author.email}>`);
    lines.push(`Date:   ${fmtDate(c.authorDate || c.date)}`);
    lines.push('');
    for (const l of c.message.replace(/\n$/, '').split('\n')) lines.push('    ' + l);
    return lines.join('\n');
  }

  /* ================= ASCII 提交图 ================= */
  function renderGraph(repo, hashes, lineFn) {
    let cols = [];
    const out = [];
    const cell = (arr) => arr.join('').replace(/\s+$/, '');
    for (const h of hashes) {
      const c = repo.getCommit(h);
      let col = cols.indexOf(h);
      if (col === -1) { col = cols.length; cols.push(h); }
      const lines = lineFn(h);
      const row = cols.map((_, j) => (j === col ? '*' : '|') + ' ');
      out.push(cell(row) + (lines[0] !== undefined ? ' ' + lines[0] : ''));
      const pipes = cols.map(() => '| ');
      for (let i = 1; i < lines.length; i++) out.push(cell(pipes) + (lines[i] ? ' ' + lines[i] : ''));
      const parents = c.parents;
      const oldLen = cols.length;
      if (parents.length === 0) {
        cols.splice(col, 1);
        if (cols.length) { const conn = []; for (let j = 0; j < oldLen; j++) conn.push(j < col ? '| ' : j === col ? '  ' : '/ '); if (col < oldLen - 1) out.push(cell(conn).replace(/\s\//g, '/').trimEnd()); }
        continue;
      }
      cols[col] = parents[0];
      // 额外的父提交：插入到 col+1
      for (let k = 1; k < parents.length; k++) {
        if (cols.includes(parents[k])) continue;
        cols.splice(col + 1, 0, parents[k]);
        const conn = [];
        for (let j = 0; j <= col; j++) conn.push('|');
        conn.push('\\');
        for (let j = col + 1; j < oldLen; j++) conn.push(' \\');
        out.push(cell([conn.join('')]).replace(/\|\\/, '|\\'));
        // 注意：conn.join 产生 "||\\ \\"，需要用空格分隔前面的竖线
        out[out.length - 1] = (() => { let s = ''; for (let j = 0; j <= col; j++) s += '| '; s = s.slice(0, -1) + '\\'; for (let j = col + 1; j < oldLen; j++) s += ' \\'; return s; })();
      }
      // 合并重复列（分支汇合）
      for (let j = 0; j < cols.length; j++) {
        const first = cols.indexOf(cols[j]);
        if (first !== j) {
          const L = cols.length;
          let s = '';
          for (let k = 0; k < j; k++) s += '| ';
          s = s.slice(0, -1) + '/';
          for (let k = j + 1; k < L; k++) s += ' /';
          out.push(s.trimEnd());
          cols.splice(j, 1); j--;
        }
      }
    }
    return out.join('\n');
  }

  /* ================= 序列器（cherry-pick / revert / rebase 共用） ================= */
  function applyCommitAsPatch(repo, hash, { reverse = false, labels, mainline } = {}) {
    const c = repo.getCommit(hash);
    let baseHash;
    if (c.parents.length > 1) {
      if (!mainline) throw new GitError(`error: commit ${hash} is a merge but no -m option was given.\nfatal: ${reverse ? 'revert' : 'cherry-pick'} failed`);
      baseHash = c.parents[mainline - 1];
      if (!baseHash) throw new GitError(`error: commit ${hash} does not have parent ${mainline}`);
    } else baseHash = c.parents[0] || null;
    const baseTree = repo.treeOfCommit(reverse ? hash : baseHash);
    const theirsTree = repo.treeOfCommit(reverse ? baseHash : hash);
    const oursTree = repo.treeOfCommit(repo.headHash());
    const mr = repo.mergeTrees(baseTree, oursTree, theirsTree, labels);
    repo.applyMergeResult(mr);
    return mr;
  }

  function finishSequencerCommit(repo, opts = {}) {
    // 根据 state 决定提交内容
    const st = repo.state;
    if (repo.conflicts.size) throw new GitError(`error: Committing is not possible because you have unmerged files.\nhint: Fix them up in the work tree, and then use 'git add/rm <file>'\nhint: as appropriate to mark resolution and make a commit.\nfatal: Exiting because of an unresolved conflict.`);
    const tree = repo.writeTreeFromFlat(repo.index);
    const head = repo.headHash();
    if (st.merge) {
      const msg = opts.message || st.merge.msg;
      const h = repo.createCommit({ tree, parents: [head, ...st.merge.heads], message: msg });
      repo.moveHead(h, `commit (merge): ${repo.subject(h)}`);
      repo.state.merge = null;
      return commitResultText(repo, h);
    }
    if (st.cherryPick) {
      const src = repo.getCommit(st.cherryPick.hash);
      if (tree === repo.getCommit(head).tree && !opts.allowEmpty) throw new GitError(`The previous cherry-pick is now empty, possibly due to conflict resolution.\nIf you wish to commit it anyway, use:\n\n    git commit --allow-empty\n\nOtherwise, please use 'git cherry-pick --skip'`);
      const h = repo.createCommit({ tree, parents: [head], message: opts.message || src.message, author: src.author, authorDate: src.authorDate });
      repo.moveHead(h, `cherry-pick: ${repo.subject(h)}`);
      const rest = st.cherryPick.rest || [];
      repo.state.cherryPick = null;
      let out = commitResultText(repo, h);
      if (rest.length) out += '\n' + cherryPickRun(repo, rest, st.cherryPick);
      return out;
    }
    if (st.revert) {
      const src = repo.getCommit(st.revert.hash);
      const h = repo.createCommit({ tree, parents: [head], message: opts.message || `Revert "${src.message.split('\n')[0]}"\n\nThis reverts commit ${src.hash}.` });
      repo.moveHead(h, `revert: ${repo.subject(h)}`);
      repo.state.revert = null;
      return commitResultText(repo, h);
    }
    return null;
  }

  function cherryPickRun(repo, hashes, opts = {}) {
    const outs = [];
    for (let i = 0; i < hashes.length; i++) {
      const h = hashes[i];
      const mr = applyCommitAsPatch(repo, h, { labels: { ours: 'HEAD', theirs: `${abbrev(h)} (${repo.subject(h)})` }, mainline: opts.mainline });
      outs.push(...mr.msgs);
      if (mr.conflicts.length) {
        repo.state.cherryPick = { hash: h, rest: hashes.slice(i + 1), saved: opts.saved, mainline: opts.mainline };
        outs.push(`error: could not apply ${abbrev(h)}... ${repo.subject(h)}\nhint: After resolving the conflicts, mark them with\nhint: "git add/rm <pathspec>", then run\nhint: "git cherry-pick --continue".\nhint: You can instead skip this commit: run "git cherry-pick --skip".\nhint: To abort and get back to the state before "git cherry-pick",\nhint: run "git cherry-pick --abort".`);
        throw new GitError(outs.join('\n'));
      }
      const tree = repo.writeTreeFromFlat(repo.index);
      const head = repo.headHash();
      if (tree === repo.getCommit(head).tree) {
        repo.state.cherryPick = { hash: h, rest: hashes.slice(i + 1), saved: opts.saved };
        outs.push(`The previous cherry-pick is now empty, possibly due to conflict resolution.\nIf you wish to commit it anyway, use:\n\n    git commit --allow-empty\n\nOtherwise, please use 'git cherry-pick --skip'`);
        throw new GitError(outs.join('\n'));
      }
      const c = repo.getCommit(h);
      const nh = repo.createCommit({ tree, parents: [head], message: c.message, author: c.author, authorDate: c.authorDate });
      repo.moveHead(nh, `cherry-pick: ${repo.subject(nh)}`);
      outs.push(commitResultText(repo, nh));
    }
    return outs.join('\n');
  }

  function rebaseContinue(repo, out = []) {
    const rb = repo.state.rebase;
    while (rb.todo.length) {
      const h = rb.todo[0];
      rb.current = h;
      const mr = applyCommitAsPatch(repo, h, { labels: { ours: 'HEAD', theirs: `${abbrev(h)} (${repo.subject(h)})` } });
      out.push(...mr.msgs);
      if (mr.conflicts.length) {
        out.push(`error: could not apply ${abbrev(h)}... ${repo.subject(h)}\nhint: Resolve all conflicts manually, mark them as resolved with\nhint: "git add/rm <conflicted_files>", then run "git rebase --continue".\nhint: You can instead skip this commit: run "git rebase --skip".\nhint: To abort and get back to the state before "git rebase", run "git rebase --abort".\nCould not apply ${abbrev(h)}... ${repo.subject(h)}`);
        throw new GitError(out.join('\n'));
      }
      rebaseCommitCurrent(repo, out);
    }
    return rebaseFinish(repo, out);
  }
  function rebaseCommitCurrent(repo, out) {
    const rb = repo.state.rebase;
    const h = rb.current;
    const tree = repo.writeTreeFromFlat(repo.index);
    const head = repo.headHash();
    if (tree !== repo.getCommit(head).tree) {
      const c = repo.getCommit(h);
      const nh = repo.createCommit({ tree, parents: [head], message: c.message, author: c.author, authorDate: c.authorDate });
      repo.moveHead(nh, `rebase (pick): ${repo.subject(nh)}`);
      rb.done.push({ from: h, to: nh });
    } else {
      out.push(`dropping ${h} ${repo.subject(h)} -- patch contents already upstream`);
      rb.done.push({ from: h, to: null });
    }
    rb.todo.shift();
    rb.current = null;
  }
  function rebaseFinish(repo, out) {
    const rb = repo.state.rebase;
    const newHead = repo.headHash();
    if (rb.branch) {
      repo.updateRef('refs/heads/' + rb.branch, newHead, `rebase (finish): refs/heads/${rb.branch} onto ${abbrev(rb.onto)}`, { reflogHead: false });
      repo.HEAD = { symbolic: 'refs/heads/' + rb.branch };
      repo.logReflog('HEAD', newHead, newHead, `rebase (finish): returning to refs/heads/${rb.branch}`);
    }
    repo.state.rebase = null;
    out.push(`Successfully rebased and updated ${rb.branch ? 'refs/heads/' + rb.branch : 'detached HEAD'}.`);
    return out.join('\n');
  }

  /* ================= 远程传输 ================= */
  function transferObjects(from, to, tips) {
    let count = 0;
    const copyTree = h => {
      if (to.hasObject(h)) return;
      const t = from.getObject(h);
      to.objects.set(h, t); count++;
      for (const e of t.entries || []) { if (e.type === 'blob') { if (!to.hasObject(e.hash)) { to.objects.set(e.hash, from.getObject(e.hash)); count++; } } else copyTree(e.hash); }
    };
    const stack = tips.slice();
    const seen = new Set();
    while (stack.length) {
      const h = stack.pop();
      if (!h || seen.has(h) || to.hasObject(h)) continue;
      seen.add(h);
      const o = from.getObject(h);
      if (o.type === 'tag') { to.objects.set(h, o); count++; stack.push(o.object); continue; }
      to.objects.set(h, o); count++;
      copyTree(o.tree);
      stack.push(...o.parents);
    }
    return count;
  }
  function remoteFor(ctx, name) {
    const repo = ctx.repo;
    let url = repo.config[`remote.${name}.url`];
    let rname = name;
    if (!url) { if (name.includes('/') || name.includes(':')) { url = name; rname = null; } else throw new GitError(`fatal: '${name}' does not appear to be a git repository\nfatal: Could not read from remote repository.\n\nPlease make sure you have the correct access rights\nand the repository exists.`); }
    const target = ctx.world.repoByUrl(url);
    if (!target) throw new GitError(`fatal: '${url}' does not appear to be a git repository\nfatal: Could not read from remote repository.\n\nPlease make sure you have the correct access rights\nand the repository exists.`);
    return { name: rname, url, target };
  }
  function fetchFrom(ctx, rname, { prune = false, quiet = false } = {}) {
    const repo = ctx.repo;
    const { name, url, target } = remoteFor(ctx, rname);
    const lines = [];
    let count = 0;
    const width = Math.max(4, ...target.branches().map(b => b.length));
    for (const b of target.branches()) {
      const rh = target.refs.get('refs/heads/' + b);
      const lref = name ? `refs/remotes/${name}/${b}` : null;
      const old = lref ? repo.refs.get(lref) : null;
      if (old === rh) continue;
      count += transferObjects(target, repo, [rh]);
      if (!lref) { lines.push(` * branch            ${pad(b, width)} -> FETCH_HEAD`); continue; }
      if (!old) lines.push(` * [new branch]      ${pad(b, width)} -> ${name}/${b}`);
      else if (repo.isAncestor(old, rh)) lines.push(`   ${abbrev(old)}..${abbrev(rh)}  ${pad(b, width)} -> ${name}/${b}`);
      else lines.push(` + ${abbrev(old)}...${abbrev(rh)} ${pad(b, width)} -> ${name}/${b}  (forced update)`);
      repo.updateRef(lref, rh, null);
    }
    for (const t of target.tags()) {
      const th = target.refs.get('refs/tags/' + t);
      if (repo.refs.get('refs/tags/' + t) === th) continue;
      if (repo.refs.has('refs/tags/' + t)) { lines.push(` ! [rejected]        ${pad(t, width)} -> ${t}  (would clobber existing tag)`); continue; }
      count += transferObjects(target, repo, [th]);
      lines.push(` * [new tag]         ${pad(t, width)} -> ${t}`);
      repo.updateRef('refs/tags/' + t, th, null);
    }
    if (prune && name) {
      for (const r of repo.remoteRefs()) {
        if (!r.startsWith(name + '/')) continue;
        const b = r.slice(name.length + 1);
        if (!target.refs.has('refs/heads/' + b)) { repo.updateRef('refs/remotes/' + r, null, null); lines.push(` - [deleted]         ${pad('(none)', width)} -> ${r}`); }
      }
    }
    repo.FETCH_HEAD = target.headHash();
    if (!lines.length) return '';
    let out = '';
    if (count) out += `remote: Enumerating objects: ${count}, done.\nUnpacking objects: 100% (${count}/${count}), done.\n`;
    out += `From ${url.replace(/\.git$/, '')}\n` + lines.join('\n');
    return out;
  }

  /* ================= 命令表 ================= */
  const commands = {};

  commands.status = (ctx, args) => {
    const { flags } = parseArgs(args, { s: 'bool', short: 'bool', u: 'bool', b: 'bool', porcelain: 'bool' });
    if (flags.s || flags.short || flags.porcelain) return statusShort(ctx.repo);
    return statusText(ctx.repo);
  };

  commands.add = (ctx, args) => {
    const repo = ctx.repo;
    const { flags, positional, paths } = parseArgs(args, { A: 'bool', all: 'bool', u: 'bool', update: 'bool', f: 'bool', force: 'bool', p: 'bool', patch: 'bool', n: 'bool', 'dry-run': 'bool', v: 'bool' });
    const specs = positional.concat(paths);
    if (flags.p || flags.patch) throw new GitError('本沙盒暂不支持交互式 `git add -p`，请直接 `git add <文件>`。');
    if (!specs.length && !(flags.A || flags.all || flags.u || flags.update)) throw new GitError(`Nothing specified, nothing added.\nhint: Maybe you wanted to say 'git add .'?\nhint: Turn this message off by running\nhint: "git config advice.addEmptyPathspec false"`);
    const allCandidates = unionKeys(repo.workdir, repo.index, repo.conflicts);
    const candidates = allCandidates.filter(p => !repo.isIgnored(p));
    let targets = new Set();
    if (flags.A || flags.all) candidates.forEach(p => targets.add(p));
    else if (flags.u || flags.update) candidates.filter(p => repo.index.has(p) || repo.conflicts.has(p)).forEach(p => targets.add(p));
    for (const s of specs) {
      const rp = toRepoPath(ctx, s);
      let m = matchPathspec(rp, candidates);
      if (!m.length) {
        const ig = matchPathspec(rp, allCandidates).filter(p => repo.isIgnored(p));
        if (ig.length && !(flags.f || flags.force)) throw new GitError(`The following paths are ignored by one of your .gitignore files:\n${ig.join('\n')}\nhint: Use -f if you really want to add them.`);
        if (ig.length) m = ig; else throw new GitError(`fatal: pathspec '${s}' did not match any files`);
      }
      m.forEach(p => targets.add(p));
    }
    const added = [];
    for (const p of targets) {
      if (repo.workdir.has(p)) {
        const h = repo.writeBlob(repo.workdir.get(p));
        if (repo.conflicts.has(p)) { repo.conflicts.delete(p); }
        if (repo.index.get(p) !== h) { repo.index.set(p, h); added.push(p); }
        else if (!repo.index.has(p)) { repo.index.set(p, h); added.push(p); }
      } else if (repo.index.has(p) || repo.conflicts.has(p)) { repo.index.delete(p); repo.conflicts.delete(p); added.push(p); }
    }
    repo.trace.push({ kind: 'index', paths: added });
    return '';
  };

  commands.rm = (ctx, args) => {
    const repo = ctx.repo;
    const { flags, positional, paths } = parseArgs(args, { r: 'bool', cached: 'bool', f: 'bool', force: 'bool', q: 'bool' });
    const specs = positional.concat(paths);
    if (!specs.length) throw new GitError('fatal: No pathspec was given. Which files should I remove?');
    const candidates = unionKeys(repo.index, repo.conflicts);
    const targets = [];
    for (const s of specs) {
      const rp = toRepoPath(ctx, s);
      const m = matchPathspec(rp, candidates);
      if (!m.length) throw new GitError(`fatal: pathspec '${s}' did not match any files`);
      if (m.some(p => p !== rp) && !flags.r) throw new GitError(`fatal: not removing '${s}' recursively without -r`);
      targets.push(...m);
    }
    const headTree = repo.treeOfCommit(repo.headHash());
    if (!flags.f && !flags.force && !flags.cached) {
      const dirty = targets.filter(p => repo.index.has(p) && (repo.workHash(p) !== repo.index.get(p) || headTree.get(p) !== repo.index.get(p)) && repo.workdir.has(p));
      if (dirty.length) throw new GitError(`error: the following file${dirty.length > 1 ? 's have' : ' has'} local modifications:\n${dirty.map(p => '    ' + p).join('\n')}\n(use --cached to keep the file, or -f to force removal)`);
    }
    const out = [];
    for (const p of targets) {
      repo.index.delete(p); repo.conflicts.delete(p);
      if (!flags.cached) repo.workdir.delete(p);
      out.push(`rm '${p}'`);
    }
    repo.trace.push({ kind: 'index', paths: targets });
    return out.join('\n');
  };

  commands.mv = (ctx, args) => {
    const repo = ctx.repo;
    const { positional } = parseArgs(args, { f: 'bool', k: 'bool' });
    if (positional.length !== 2) throw new GitError('usage: git mv <source> <destination>');
    const src = toRepoPath(ctx, positional[0]), dst = toRepoPath(ctx, positional[1]);
    if (!repo.index.has(src)) throw new GitError(`fatal: not under version control, source=${src}, destination=${dst}`);
    if (repo.index.has(dst) || repo.workdir.has(dst)) throw new GitError(`fatal: destination exists, source=${src}, destination=${dst}`);
    repo.index.set(dst, repo.index.get(src)); repo.index.delete(src);
    if (repo.workdir.has(src)) { repo.workdir.set(dst, repo.workdir.get(src)); repo.workdir.delete(src); }
    repo.trace.push({ kind: 'index', paths: [src, dst] });
    return '';
  };

  commands.commit = (ctx, args) => {
    const repo = ctx.repo;
    const { flags, positional, paths } = parseArgs(args, { m: 'value', message: 'value', a: 'bool', all: 'bool', amend: 'bool', 'allow-empty': 'bool', 'no-edit': 'bool', q: 'bool', v: 'bool', 'no-verify': 'bool', F: 'value', file: 'value', author: 'value', 'reset-author': 'bool', 'only': 'bool' });
    if (repo.bare) throw new GitError('fatal: this operation must be run in a work tree');
    let message = flags.m !== undefined ? flags.m : flags.message;
    const onlyPaths = positional.concat(paths);
    let partialTree = null;
    if (onlyPaths.length) {
      const known = unionKeys(repo.index, repo.workdir, repo.treeOfCommit(repo.headHash()));
      partialTree = repo.treeOfCommit(repo.headHash());
      for (const s of onlyPaths) { const rp = toRepoPath(ctx, s); const m = matchPathspec(rp, known); if (!m.length) throw new GitError(`error: pathspec '${s}' did not match any file(s) known to git`); for (const p of m) { if (repo.workdir.has(p)) { const h = repo.writeBlob(repo.workdir.get(p)); partialTree.set(p, h); repo.index.set(p, h); } else { partialTree.delete(p); repo.index.delete(p); } } }
    }
    if (flags.a || flags.all) {
      for (const p of [...repo.index.keys()]) {
        if (!repo.workdir.has(p)) repo.index.delete(p);
        else { const h = repo.writeBlob(repo.workdir.get(p)); if (h !== repo.index.get(p)) repo.index.set(p, h); }
      }
    }
    const seqOut = (() => {
      if (repo.state.merge || repo.state.cherryPick || repo.state.revert) {
        if (repo.conflicts.size) throw new GitError(`error: Committing is not possible because you have unmerged files.\nhint: Fix them up in the work tree, and then use 'git add/rm <file>'\nhint: as appropriate to mark resolution and make a commit.\nfatal: Exiting because of an unresolved conflict.`);
        return finishSequencerCommit(repo, { message, allowEmpty: flags['allow-empty'] });
      }
      return null;
    })();
    if (seqOut !== null) return seqOut;
    if (repo.state.rebase) throw new GitError(`fatal: 正在进行 rebase。请解决冲突后使用 git add，再运行 git rebase --continue（或 git rebase --abort 放弃）。`);
    if (repo.conflicts.size) throw new GitError(`error: Committing is not possible because you have unmerged files.\nfatal: Exiting because of an unresolved conflict.`);
    const head = repo.headHash();
    const tree = repo.writeTreeFromFlat(partialTree || repo.index);
    if (flags.amend) {
      if (!head) throw new GitError('fatal: You have nothing to amend.');
      const old = repo.getCommit(head);
      if (message === undefined) message = old.message;
      const h = repo.createCommit({ tree, parents: old.parents, message, author: flags['reset-author'] ? null : old.author, authorDate: flags['reset-author'] ? null : old.authorDate });
      repo.moveHead(h, `commit (amend): ${repo.subject(h)}`);
      return commitResultText(repo, h);
    }
    const headTree = head ? repo.getCommit(head).tree : null;
    if (tree === headTree && !flags['allow-empty']) {
      throw new GitError(statusText(repo));
    }
    if (message === undefined) {
      if (ctx.editor) {
        const template = `\n# Please enter the commit message for your changes. Lines starting\n# with '#' will be ignored, and an empty message aborts the commit.\n#\n${statusText(repo).split('\n').map(l => '# ' + l).join('\n')}\n`;
        ctx.editor({ kind: 'commit-msg', title: 'COMMIT_EDITMSG（写提交信息，保存后即提交）', content: template, onSave: text => {
          const msg = text.split('\n').filter(l => !l.startsWith('#')).join('\n').trim();
          if (!msg) return 'Aborting commit due to empty commit message.';
          return ctx.rerun(['commit', ...args, '-m', msg]);
        } });
        return `hint: 已打开编辑器，请输入提交信息并保存（真实 git 会打开 vim/nano）。`;
      }
      throw new GitError('Aborting commit due to empty commit message.');
    }
    if (!message.trim()) throw new GitError('Aborting commit due to empty commit message.');
    const h = repo.createCommit({ tree, parents: head ? [head] : [], message });
    repo.moveHead(h, `commit${head ? '' : ' (initial)'}: ${repo.subject(h)}`);
    if (repo.state.bisect) { /* bisect 期间提交，保留 */ }
    return commitResultText(repo, h);
  };

  commands.log = (ctx, args) => {
    const repo = ctx.repo;
    const { flags, positional, paths } = parseArgs(args, { oneline: 'bool', graph: 'bool', all: 'bool', n: 'value', 'max-count': 'value', p: 'bool', patch: 'bool', stat: 'bool', S: 'value', G: 'value', grep: 'value', author: 'value', reverse: 'bool', 'first-parent': 'bool', 'no-merges': 'bool', merges: 'bool', decorate: 'bool', pretty: 'value', format: 'value', 'abbrev-commit': 'bool', follow: 'bool', 'name-only': 'bool', 'name-status': 'bool', branches: 'bool', tags: 'bool', remotes: 'bool', date: 'value', since: 'value', until: 'value' });
    let tips = [], excludes = [];
    const pathFilters = paths.map(p => toRepoPath(ctx, p));
    for (const p of positional) {
      if (p.includes('...')) { const [a, b] = p.split('...'); const A = repo.resolveRev(a || 'HEAD'), B = repo.resolveRev(b || 'HEAD'); tips.push(A, B); excludes.push(repo.mergeBase(A, B)); continue; }
      if (p.includes('..')) { const [a, b] = p.split('..'); excludes.push(repo.resolveRev(a || 'HEAD')); tips.push(repo.resolveRev(b || 'HEAD')); continue; }
      if (p.startsWith('^')) { excludes.push(repo.resolveRev(p.slice(1))); continue; }
      const h = repo.tryResolve(p);
      if (h) tips.push(h);
      else { const rp = toRepoPath(ctx, p); if ([...repo.index.keys(), ...repo.workdir.keys()].some(x => x === rp || x.startsWith(rp + '/')) || repo.headHash() && [...repo.treeOfCommit(repo.headHash()).keys()].some(x => x === rp || x.startsWith(rp + '/'))) pathFilters.push(rp); else throw new GitError(`fatal: ambiguous argument '${p}': unknown revision or path not in the working tree.\nUse '--' to separate paths from revisions, like this:\n'git <command> [<revision>...] -- [<file>...]'`); }
    }
    if (!tips.length) {
      if (flags.all) { tips = [...repo.refs.values()].map(h => repo.peel(h)); if (repo.headHash()) tips.push(repo.headHash()); }
      else if (flags.branches) tips = repo.branches().map(b => repo.branchTip(b));
      else {
        if (!repo.headHash()) throw new GitError(`fatal: your current branch '${repo.currentBranch() || 'HEAD'}' does not have any commits yet`);
        tips = [repo.headHash()];
      }
    }
    if (flags.all && positional.length === 0) { /* 已处理 */ }
    let list = repo.revList([...new Set(tips)], excludes);
    if (flags['first-parent']) { const keep = new Set(); for (const t of tips) { let h = t; while (h && !keep.has(h)) { keep.add(h); h = repo.getCommit(h).parents[0]; } } list = list.filter(h => keep.has(h)); }
    if (flags['no-merges']) list = list.filter(h => repo.getCommit(h).parents.length < 2);
    if (flags.merges) list = list.filter(h => repo.getCommit(h).parents.length > 1);
    if (flags.author) list = list.filter(h => (repo.getCommit(h).author.name + repo.getCommit(h).author.email).includes(flags.author));
    if (flags.grep) list = list.filter(h => repo.getCommit(h).message.includes(flags.grep));
    const changesOf = h => { const c = repo.getCommit(h); return repo.diffTrees(repo.treeOfCommit(c.parents[0] || null), repo.treeOfCommit(h)); };
    if (pathFilters.length) list = list.filter(h => changesOf(h).some(ch => pathFilters.some(p => ch.path === p || ch.path.startsWith(p + '/'))));
    if (flags.S) { const count = (t, s) => t.split(s).length - 1; list = list.filter(h => changesOf(h).some(ch => count(ch.a ? repo.blobContent(ch.a) : '', flags.S) !== count(ch.b ? repo.blobContent(ch.b) : '', flags.S))); }
    if (flags.G) { const re = new RegExp(flags.G); list = list.filter(h => changesOf(h).some(ch => diffLines(ch.a ? repo.blobContent(ch.a) : '', ch.b ? repo.blobContent(ch.b) : '').some(o => o.type !== 'equal' && re.test(o.line)))); }
    const n = flags.n !== undefined ? parseInt(flags.n, 10) : flags['max-count'] !== undefined ? parseInt(flags['max-count'], 10) : Infinity;
    list = list.slice(0, n);
    if (flags.reverse) list.reverse();
    if (!list.length) return '';
    const fmt = flags.format || (flags.pretty && flags.pretty.startsWith('format:') ? flags.pretty.slice(7) : null);
    const oneline = flags.oneline || flags.pretty === 'oneline';
    const lineFn = h => {
      const c = repo.getCommit(h);
      if (fmt) return [fmt.replace(/%h/g, abbrev(h)).replace(/%H/g, h).replace(/%s/g, repo.subject(h)).replace(/%an/g, c.author.name).replace(/%ae/g, c.author.email).replace(/%ad/g, fmtDate(c.authorDate)).replace(/%ar/g, '').replace(/%d/g, repo.decoStr(h)).replace(/%p/g, c.parents.map(abbrev).join(' ')).replace(/%P/g, c.parents.join(' ')).replace(/%n/g, '\n').replace(/%b/g, c.message.split('\n').slice(1).join('\n').trim()).replace(/%B/g, c.message).replace(/%%/g, '%')];
      if (oneline) return [`${abbrev(h)}${repo.decoStr(h)} ${repo.subject(h)}`];
      const lines = commitHeaderText(repo, h).split('\n');
      const extra = [];
      if (flags.stat || flags.p || flags.patch || flags['name-only'] || flags['name-status']) {
        const changes = changesOf(h);
        if (flags['name-only']) { extra.push(''); changes.forEach(ch => extra.push(ch.path)); }
        else if (flags['name-status']) { extra.push(''); changes.forEach(ch => extra.push(`${ch.status}\t${ch.path}`)); }
        if (flags.stat) { extra.push(''); extra.push(...repo.diffStatText(changes).replace(/\n$/, '').split('\n')); }
        if (flags.p || flags.patch) { if (c.parents.length < 2) { extra.push(''); extra.push(...repo.unifiedDiffText(repo.treeOfCommit(c.parents[0] || null), repo.treeOfCommit(h), { paths: pathFilters.length ? pathFilters : null }).replace(/\n$/, '').split('\n')); } }
      }
      return [...lines, ...extra, ''];
    };
    if (flags.graph) return renderGraph(repo, list, lineFn);
    return list.map(h => lineFn(h).join('\n')).join('\n').replace(/\n+$/, '');
  };

  commands.show = (ctx, args) => {
    const repo = ctx.repo;
    const { flags, positional } = parseArgs(args, { stat: 'bool', oneline: 'bool', 'name-only': 'bool', q: 'bool', s: 'bool', pretty: 'value', format: 'value' });
    const rev = positional[0] || 'HEAD';
    if (rev.includes(':') && !rev.startsWith(':')) {
      const [r, p] = rev.split(/:(.*)/s);
      const content = repo.fileAt(r, normPath(p));
      if (content === null) throw new GitError(`fatal: path '${p}' does not exist in '${r}'`);
      return content.replace(/\n$/, '');
    }
    let hash;
    try { hash = repo.resolveRev(rev, { wantCommit: false }); } catch (e) { throw new GitError(`fatal: ambiguous argument '${rev}': unknown revision or path not in the working tree.`); }
    const o = repo.getObject(hash);
    if (o.type === 'blob') return o.content.replace(/\n$/, '');
    if (o.type === 'tree') return (o.entries || []).map(e => `${e.mode} ${e.type} ${e.hash}\t${e.name}`).join('\n');
    if (o.type === 'tag') { const t = o; const out = [`tag ${t.tagName}\nTagger: ${t.tagger.name} <${t.tagger.email}>\nDate:   ${fmtDate(t.date)}\n\n${t.message}\n`]; hash = repo.peel(hash); return out.join('') + '\n' + commands.show(ctx, [hash, ...args.slice(1)]); }
    const c = repo.getCommit(hash);
    const lines = [commitHeaderText(repo, hash)];
    if (flags.oneline) return `${abbrev(hash)}${repo.decoStr(hash)} ${repo.subject(hash)}` + (flags.s ? '' : '\n' + repo.unifiedDiffText(repo.treeOfCommit(c.parents[0] || null), repo.treeOfCommit(hash)).replace(/\n$/, ''));
    if (flags.s || flags.q) return lines.join('\n');
    const changes = repo.diffTrees(repo.treeOfCommit(c.parents[0] || null), repo.treeOfCommit(hash));
    lines.push('');
    if (flags['name-only']) lines.push(changes.map(ch => ch.path).join('\n'));
    else if (flags.stat) lines.push(repo.diffStatText(changes).replace(/\n$/, ''));
    else if (c.parents.length > 1) lines.push(`(合并提交：以下为与第一父提交 ${abbrev(c.parents[0])} 的差异)\n` + repo.unifiedDiffText(repo.treeOfCommit(c.parents[0]), repo.treeOfCommit(hash)).replace(/\n$/, ''));
    else lines.push(repo.unifiedDiffText(repo.treeOfCommit(c.parents[0] || null), repo.treeOfCommit(hash)).replace(/\n$/, ''));
    return lines.join('\n').replace(/\n+$/, '');
  };

  commands.diff = (ctx, args) => {
    const repo = ctx.repo;
    const { flags, positional, paths } = parseArgs(args, { staged: 'bool', cached: 'bool', stat: 'bool', 'name-only': 'bool', 'name-status': 'bool', w: 'bool', color: 'bool', 'no-color': 'bool' });
    const pathFilters = paths.map(p => toRepoPath(ctx, p));
    const revs = [];
    for (const p of positional) {
      if (p.includes('..')) { const [a, b] = p.split(/\.\.\.?/); revs.push(repo.resolveRev(a || 'HEAD'), repo.resolveRev(b || 'HEAD')); continue; }
      const h = repo.tryResolve(p);
      if (h) revs.push(h); else pathFilters.push(toRepoPath(ctx, p));
    }
    let a, b;
    const workFlat = () => { const m = new Map(); for (const p of repo.index.keys()) if (repo.workdir.has(p)) m.set(p, repo.writeBlob(repo.workdir.get(p))); for (const p of repo.conflicts.keys()) if (repo.workdir.has(p)) m.set(p, repo.writeBlob(repo.workdir.get(p))); return m; };
    if (flags.staged || flags.cached) { a = repo.treeOfCommit(revs[0] || repo.headHash()); b = new Map(repo.index); }
    else if (revs.length === 0) { a = new Map(repo.index); b = workFlat(); }
    else if (revs.length === 1) { a = repo.treeOfCommit(revs[0]); b = workFlat(); }
    else { a = repo.treeOfCommit(revs[0]); b = repo.treeOfCommit(revs[1]); }
    const filt = pathFilters.length ? pathFilters : null;
    const changes = repo.diffTrees(a, b).filter(ch => !filt || filt.some(p => ch.path === p || ch.path.startsWith(p + '/')));
    if (flags.stat) return repo.diffStatText(changes).replace(/\n$/, '');
    if (flags['name-only']) return changes.map(c => c.path).join('\n');
    if (flags['name-status']) return changes.map(c => `${c.status}\t${c.path}`).join('\n');
    return repo.unifiedDiffText(a, b, { paths: filt }).replace(/\n$/, '');
  };

  /* ---------- 分支 / 切换 ---------- */
  function validBranchName(n) { return /^[A-Za-z0-9][A-Za-z0-9._\/-]*$/.test(n) && !n.endsWith('/') && !n.includes('..') && !n.endsWith('.lock'); }
  function createBranch(repo, name, startHash, { force = false } = {}) {
    if (!validBranchName(name)) throw new GitError(`fatal: '${name}' is not a valid branch name`);
    if (repo.refs.has('refs/heads/' + name) && !force) throw new GitError(`fatal: a branch named '${name}' already exists`);
    if (!startHash) throw new GitError(`fatal: not a valid object name: '${repo.currentBranch() || 'HEAD'}'`);
    repo.updateRef('refs/heads/' + name, startHash, `branch: Created from ${repo.currentBranch() || 'HEAD'}`, { reflogHead: false });
  }
  function trackingSetupMsg(repo, name, remoteRef) {
    const [remote, ...rest] = remoteRef.split('/');
    repo.config[`branch.${name}.remote`] = remote;
    repo.config[`branch.${name}.merge`] = 'refs/heads/' + rest.join('/');
    return `branch '${name}' set up to track '${remoteRef}'.`;
  }
  function leavingDetachedWarning(repo) {
    if (repo.HEAD.symbolic) return '';
    const head = repo.HEAD.detached;
    const tips = [...repo.refs.values()].map(h => repo.peel(h));
    const orphan = repo.revList([head], tips);
    if (!orphan.length) return '';
    return `Warning: you are leaving ${plural(orphan.length, 'commit')} behind, not connected to\nany of your branches:\n\n${orphan.map(h => `  ${abbrev(h)} ${repo.subject(h)}`).join('\n')}\n\nIf you want to keep ${orphan.length > 1 ? 'them' : 'it'} by creating a new branch, this may be a good time\nto do so with:\n\n git branch <new-branch-name> ${abbrev(head)}\n\n`;
  }
  function switchToBranch(repo, name, { quietIfSame = false } = {}) {
    const cur = repo.currentBranch();
    if (cur === name) return `Already on '${name}'`;
    const target = repo.refs.get('refs/heads/' + name);
    const warn = leavingDetachedWarning(repo);
    repo.switchToTree(repo.treeOfCommit(target), { verb: 'checkout' });
    const from = cur || abbrev(repo.headHash());
    repo.HEAD = { symbolic: 'refs/heads/' + name };
    repo.trace.push({ kind: 'head', to: name, detached: false });
    repo.logReflog('HEAD', null, target, `checkout: moving from ${from} to ${name}`);
    repo.lastBranch = cur;
    let out = warn + `Switched to branch '${name}'`;
    const ab = aheadBehind(repo, name);
    if (ab) {
      if (!ab.ahead && !ab.behind) out += `\nYour branch is up to date with '${ab.name}'.`;
      else if (ab.ahead && !ab.behind) out += `\nYour branch is ahead of '${ab.name}' by ${plural(ab.ahead, 'commit')}.\n  (use "git push" to publish your local commits)`;
      else if (ab.behind && !ab.ahead) out += `\nYour branch is behind '${ab.name}' by ${plural(ab.behind, 'commit')}, and can be fast-forwarded.\n  (use "git pull" to update your local branch)`;
      else out += `\nYour branch and '${ab.name}' have diverged,\nand have ${ab.ahead} and ${ab.behind} different commits each, respectively.\n  (use "git pull" if you want to integrate the remote branch with yours)`;
    }
    return out;
  }
  function detachAt(repo, hash, label, { advice = true } = {}) {
    const cur = repo.currentBranch();
    const warn = leavingDetachedWarning(repo);
    repo.switchToTree(repo.treeOfCommit(hash), { verb: 'checkout' });
    const from = cur || abbrev(repo.headHash());
    repo.HEAD = { detached: hash };
    repo.trace.push({ kind: 'head', to: hash, detached: true });
    repo.logReflog('HEAD', null, hash, `checkout: moving from ${from} to ${label}`);
    repo.lastBranch = cur;
    const note = advice ? `Note: switching to '${label}'.\n\nYou are in 'detached HEAD' state. You can look around, make experimental\nchanges and commit them, and you can discard any commits you make in this\nstate without impacting any branches by switching back to a branch.\n\nIf you want to create a new branch to retain commits you create, you may\ndo so (now or later) by using -c with the switch command. Example:\n\n  git switch -c <new-branch-name>\n\nOr undo this operation with:\n\n  git switch -\n\nTurn off this advice by setting config variable advice.detachedHead to false\n\n` : '';
    return warn + note + `HEAD is now at ${abbrev(hash)} ${repo.subject(hash)}`;
  }
  function checkAllowSwitch(repo) {
    if (repo.state.merge) throw new GitError('fatal: 正在合并中（MERGE_HEAD 存在），请先 git commit 完成合并或 git merge --abort。');
    if (repo.state.rebase) throw new GitError('fatal: 正在 rebase 中，请先 git rebase --continue 或 git rebase --abort。');
    if (repo.conflicts.size) throw new GitError(`error: you need to resolve your current index first\n${[...repo.conflicts.keys()].map(p => p + ': needs merge').join('\n')}`);
  }

  commands.branch = (ctx, args) => {
    const repo = ctx.repo;
    const { flags, positional } = parseArgs(args, { d: 'bool', D: 'bool', delete: 'bool', force: 'bool', f: 'bool', m: 'bool', M: 'bool', move: 'bool', a: 'bool', all: 'bool', r: 'bool', remotes: 'bool', v: 'bool', vv: 'bool', verbose: 'bool', u: 'value', 'set-upstream-to': 'value', 'unset-upstream': 'bool', list: 'bool', 'show-current': 'bool', c: 'bool', copy: 'bool', contains: 'value', merged: 'bool', 'no-merged': 'bool' });
    const cur = repo.currentBranch();
    if (flags['show-current']) return cur || '';
    if (flags.d || flags.D || flags.delete) {
      if (!positional.length) throw new GitError('fatal: branch name required');
      const out = [];
      for (const name of positional) {
        if (flags.r || flags.remotes) {
          if (!repo.refs.has('refs/remotes/' + name)) throw new GitError(`error: remote-tracking branch '${name}' not found.`);
          const h = repo.refs.get('refs/remotes/' + name); repo.updateRef('refs/remotes/' + name, null); out.push(`Deleted remote-tracking branch ${name} (was ${abbrev(h)}).`); continue;
        }
        const ref = 'refs/heads/' + name;
        if (!repo.refs.has(ref)) throw new GitError(`error: branch '${name}' not found.`);
        if (name === cur) throw new GitError(`error: Cannot delete branch '${name}' checked out at '${repo.path}'`);
        const h = repo.refs.get(ref);
        if (!flags.D && !flags.force && !flags.f) {
          const up = repo.upstreamOf(name);
          const mergedInto = up && repo.refs.has(up.ref) ? repo.refs.get(up.ref) : repo.headHash();
          if (!mergedInto || !repo.isAncestor(h, mergedInto)) throw new GitError(`error: the branch '${name}' is not fully merged.\nIf you are sure you want to delete it, run 'git branch -D ${name}'.`);
        }
        repo.updateRef(ref, null);
        delete repo.config[`branch.${name}.remote`]; delete repo.config[`branch.${name}.merge`];
        out.push(`Deleted branch ${name} (was ${abbrev(h)}).`);
      }
      return out.join('\n');
    }
    if (flags.m || flags.M || flags.move) {
      let oldName, newName;
      if (positional.length === 2) [oldName, newName] = positional; else if (positional.length === 1) { oldName = cur; newName = positional[0]; } else throw new GitError('fatal: branch name required');
      if (!oldName || !repo.refs.has('refs/heads/' + oldName)) throw new GitError(`error: refname refs/heads/${oldName} not found\nfatal: Branch rename failed`);
      if (repo.refs.has('refs/heads/' + newName) && !flags.M) throw new GitError(`fatal: a branch named '${newName}' already exists`);
      if (!validBranchName(newName)) throw new GitError(`fatal: '${newName}' is not a valid branch name`);
      const h = repo.refs.get('refs/heads/' + oldName);
      repo.refs.delete('refs/heads/' + oldName); repo.refs.set('refs/heads/' + newName, h);
      repo.trace.push({ kind: 'ref', ref: 'refs/heads/' + newName, old: null, new: h, renamedFrom: oldName });
      if (repo.reflogs.has('refs/heads/' + oldName)) { repo.reflogs.set('refs/heads/' + newName, repo.reflogs.get('refs/heads/' + oldName)); repo.reflogs.delete('refs/heads/' + oldName); }
      for (const k of ['remote', 'merge']) if (repo.config[`branch.${oldName}.${k}`] !== undefined) { repo.config[`branch.${newName}.${k}`] = repo.config[`branch.${oldName}.${k}`]; delete repo.config[`branch.${oldName}.${k}`]; }
      if (repo.HEAD.symbolic === 'refs/heads/' + oldName) repo.HEAD = { symbolic: 'refs/heads/' + newName };
      return '';
    }
    if (flags.u || flags['set-upstream-to']) {
      const up = flags.u || flags['set-upstream-to'];
      const name = positional[0] || cur;
      if (!name) throw new GitError('fatal: could not set upstream of HEAD to ' + up + ' when it does not point to any branch.');
      if (!repo.refs.has('refs/remotes/' + up)) throw new GitError(`error: the requested upstream branch '${up}' does not exist\nhint: If you are planning on basing your work on an upstream\nhint: branch that already exists at the remote, you may need to\nhint: run "git fetch" to retrieve it.`);
      return trackingSetupMsg(repo, name, up);
    }
    if (flags['unset-upstream']) { const name = positional[0] || cur; delete repo.config[`branch.${name}.remote`]; delete repo.config[`branch.${name}.merge`]; return ''; }
    if (positional.length) {
      const name = positional[0];
      const start = positional[1] ? repo.resolveRev(positional[1]) : repo.headHash();
      createBranch(repo, name, start, { force: flags.f || flags.force });
      if (positional[1] && repo.refs.has('refs/remotes/' + positional[1])) return trackingSetupMsg(repo, name, positional[1]);
      return '';
    }
    // 列表
    const lines = [];
    const fmtLine = (name, h, isCur) => {
      let s = (isCur ? '* ' : '  ') + name;
      if (flags.v || flags.vv || flags.verbose) {
        s = pad(s, 2 + Math.max(...repo.branches().map(b => b.length)) + 1);
        s += abbrev(h) + ' ';
        const ab = aheadBehind(repo, name);
        if (ab && flags.vv) { const parts = []; if (ab.ahead) parts.push('ahead ' + ab.ahead); if (ab.behind) parts.push('behind ' + ab.behind); s += `[${ab.name}${parts.length ? ': ' + parts.join(', ') : ''}] `; }
        else if (ab) { const parts = []; if (ab.ahead) parts.push('ahead ' + ab.ahead); if (ab.behind) parts.push('behind ' + ab.behind); if (parts.length) s += `[${parts.join(', ')}] `; }
        s += repo.subject(h);
      }
      return s;
    };
    if (!flags.r && !flags.remotes) {
      if (!cur && repo.headHash()) lines.push(`* (HEAD detached at ${abbrev(repo.headHash())})`);
      for (const b of repo.branches()) {
        if (flags.merged && !repo.isAncestor(repo.branchTip(b), repo.headHash())) continue;
        if (flags['no-merged'] && repo.isAncestor(repo.branchTip(b), repo.headHash())) continue;
        if (flags.contains && !repo.isAncestor(repo.resolveRev(flags.contains), repo.branchTip(b))) continue;
        lines.push(fmtLine(b, repo.branchTip(b), b === cur));
      }
    }
    if (flags.a || flags.all || flags.r || flags.remotes) for (const r of repo.remoteRefs()) lines.push('  ' + (flags.r || flags.remotes ? '' : 'remotes/') + r + ((flags.v || flags.vv) ? ' ' + abbrev(repo.refs.get('refs/remotes/' + r)) + ' ' + repo.subject(repo.refs.get('refs/remotes/' + r)) : ''));
    return lines.join('\n');
  };

  commands.checkout = (ctx, args) => {
    const repo = ctx.repo;
    const { flags, positional, paths } = parseArgs(args, { b: 'value', B: 'value', f: 'bool', force: 'bool', q: 'bool', track: 'bool', detach: 'bool', orphan: 'value', ours: 'bool', theirs: 'bool' });
    if (flags.ours || flags.theirs) {
      const ps = positional.concat(paths).map(p => toRepoPath(ctx, p));
      for (const p of ps) { const c = repo.conflicts.get(p); if (!c) throw new GitError(`error: path '${p}' does not have ${flags.ours ? 'our' : 'their'} version`); const h = flags.ours ? c.ours : c.theirs; if (!h) throw new GitError(`error: path '${p}' does not have ${flags.ours ? 'our' : 'their'} version`); repo.workdir.set(p, repo.blobContent(h)); }
      return '';
    }
    if (flags.b || flags.B) {
      checkAllowSwitch(repo);
      const name = flags.b || flags.B;
      let start = repo.headHash();
      let trackMsg = '';
      if (positional[0]) { start = repo.resolveRev(positional[0]); if (repo.refs.has('refs/remotes/' + positional[0])) trackMsg = positional[0]; }
      if (flags.B && repo.refs.has('refs/heads/' + name)) { repo.updateRef('refs/heads/' + name, start, `branch: Reset to ${positional[0] || 'HEAD'}`, { reflogHead: false }); }
      else createBranch(repo, name, start);
      let out = '';
      if (trackMsg) out += trackingSetupMsg(repo, name, trackMsg) + '\n';
      const warn = leavingDetachedWarning(repo);
      repo.switchToTree(repo.treeOfCommit(start));
      const from = repo.currentBranch() || abbrev(repo.headHash());
      repo.HEAD = { symbolic: 'refs/heads/' + name };
      repo.trace.push({ kind: 'head', to: name, detached: false });
      repo.logReflog('HEAD', null, start, `checkout: moving from ${from} to ${name}`);
      return out + warn + `Switched to a new branch '${name}'`;
    }
    if (flags.orphan) throw new GitError('本沙盒暂不支持 --orphan。');
    // 路径恢复：git checkout -- <paths> / git checkout <rev> -- <paths>
    const restorePaths = (srcFlat, ps, fromIndex) => {
      const candidates = unionKeys(srcFlat);
      for (const s of ps) {
        const rp = toRepoPath(ctx, s);
        const m = matchPathspec(rp, candidates);
        if (!m.length) throw new GitError(`error: pathspec '${s}' did not match any file(s) known to git`);
        for (const p of m) { repo.workdir.set(p, repo.blobContent(srcFlat.get(p))); if (!fromIndex) repo.index.set(p, srcFlat.get(p)); repo.conflicts.delete(p); }
      }
      return `Updated ${ps.length} path${ps.length > 1 ? 's' : ''} from ${fromIndex ? 'the index' : abbrev(repo.headHash())}`;
    };
    if (paths.length) {
      if (positional.length) { const h = repo.resolveRev(positional[0]); return restorePaths(repo.treeOfCommit(h), paths, false); }
      const idx = new Map(repo.index); for (const [p, c] of repo.conflicts) if (c.ours) idx.set(p, c.ours);
      return restorePaths(idx, paths, true);
    }
    if (!positional.length) { if (!repo.headHash()) return ''; return statusShort(repo) ? `M\t...` : ''; }
    const target = positional[0];
    if (target === '-') { if (!repo.lastBranch) throw new GitError('fatal: no previous branch'); checkAllowSwitch(repo); return switchToBranch(repo, repo.lastBranch); }
    if (repo.refs.has('refs/heads/' + target) && !flags.detach) { checkAllowSwitch(repo); return switchToBranch(repo, target); }
    // DWIM：origin/xxx 存在则创建跟踪分支
    if (!repo.tryResolve(target) || (positional.length === 1 && !flags.detach && repo.remoteRefs().some(r => r.split('/').slice(1).join('/') === target) && !repo.refs.has('refs/heads/' + target))) {
      const rr = repo.remoteRefs().filter(r => r.split('/').slice(1).join('/') === target);
      if (rr.length === 1 && !repo.refs.has('refs/heads/' + target)) {
        checkAllowSwitch(repo);
        const start = repo.refs.get('refs/remotes/' + rr[0]);
        createBranch(repo, target, start);
        const msg = trackingSetupMsg(repo, target, rr[0]);
        repo.switchToTree(repo.treeOfCommit(start));
        const from = repo.currentBranch() || abbrev(repo.headHash());
        repo.HEAD = { symbolic: 'refs/heads/' + target };
        repo.logReflog('HEAD', null, start, `checkout: moving from ${from} to ${target}`);
        return `${msg}\nSwitched to a new branch '${target}'`;
      }
      // 也许是文件
      const idx = new Map(repo.index);
      if (positional.every(p => unionKeys(idx).some(x => x === toRepoPath(ctx, p) || x.startsWith(toRepoPath(ctx, p) + '/')))) return restorePaths(idx, positional, true);
      throw new GitError(`error: pathspec '${target}' did not match any file(s) known to git`);
    }
    if (positional.length > 1) { const h = repo.resolveRev(target); return restorePaths(repo.treeOfCommit(h), positional.slice(1), false); }
    checkAllowSwitch(repo);
    const h = repo.resolveRev(target);
    if (repo.HEAD.detached === h) return `HEAD is now at ${abbrev(h)} ${repo.subject(h)}`;
    return detachAt(repo, h, target);
  };

  commands.switch = (ctx, args) => {
    const repo = ctx.repo;
    const { flags, positional } = parseArgs(args, { c: 'value', create: 'value', C: 'value', 'force-create': 'value', detach: 'bool', f: 'bool', force: 'bool', 'discard-changes': 'bool', track: 'bool', 'no-track': 'bool' });
    checkAllowSwitch(repo);
    const create = flags.c || flags.create || flags.C || flags['force-create'];
    if (create) {
      const start = positional[0] ? repo.resolveRev(positional[0]) : repo.headHash();
      if ((flags.C || flags['force-create']) && repo.refs.has('refs/heads/' + create)) repo.updateRef('refs/heads/' + create, start, 'branch: Reset', { reflogHead: false });
      else createBranch(repo, create, start);
      let out = '';
      if (positional[0] && repo.refs.has('refs/remotes/' + positional[0])) out += trackingSetupMsg(repo, create, positional[0]) + '\n';
      const warn = leavingDetachedWarning(repo);
      repo.switchToTree(repo.treeOfCommit(start));
      const from = repo.currentBranch() || abbrev(repo.headHash());
      repo.HEAD = { symbolic: 'refs/heads/' + create };
      repo.trace.push({ kind: 'head', to: create, detached: false });
      repo.logReflog('HEAD', null, start, `checkout: moving from ${from} to ${create}`);
      return out + warn + `Switched to a new branch '${create}'`;
    }
    if (!positional.length) throw new GitError('fatal: missing branch or commit argument');
    const target = positional[0];
    if (target === '-') { if (!repo.lastBranch) throw new GitError('fatal: no previous branch'); return switchToBranch(repo, repo.lastBranch); }
    if (flags.detach) { const h = repo.resolveRev(target); return detachAt(repo, h, target); }
    if (repo.refs.has('refs/heads/' + target)) return switchToBranch(repo, target);
    const rr = repo.remoteRefs().filter(r => r.split('/').slice(1).join('/') === target);
    if (rr.length === 1) return commands.checkout(ctx, [target]);
    if (repo.tryResolve(target)) throw new GitError(`fatal: a branch is expected, got commit '${target}'`);
    throw new GitError(`fatal: invalid reference: ${target}`);
  };

  commands.restore = (ctx, args) => {
    const repo = ctx.repo;
    const { flags, positional, paths } = parseArgs(args, { staged: 'bool', S: 'bool', worktree: 'bool', W: 'bool', source: 'value', s: 'value', ours: 'bool', theirs: 'bool' });
    const ps = positional.concat(paths);
    if (!ps.length) throw new GitError('fatal: you must specify path(s) to restore');
    const staged = flags.staged || flags.S; let worktree = flags.worktree || flags.W || !staged;
    const src = flags.source || flags.s;
    let srcFlat;
    if (src) srcFlat = repo.treeOfCommit(repo.resolveRev(src));
    else if (staged) srcFlat = repo.treeOfCommit(repo.headHash());
    else { srcFlat = new Map(repo.index); for (const [p, c] of repo.conflicts) if (c.ours) srcFlat.set(p, c.ours); }
    const known = unionKeys(srcFlat, repo.index, repo.conflicts, ...(staged ? [] : []));
    for (const s of ps) {
      const rp = toRepoPath(ctx, s);
      const m = matchPathspec(rp, known);
      if (!m.length) throw new GitError(`error: pathspec '${s}' did not match any file(s) known to git`);
      for (const p of m) {
        const h = srcFlat.get(p);
        if (staged) { if (h === undefined) repo.index.delete(p); else repo.index.set(p, h); repo.conflicts.delete(p); }
        if (worktree) { if (h === undefined) { if (!staged) throw new GitError(`error: pathspec '${s}' did not match any file(s) known to git`); } else { repo.workdir.set(p, repo.blobContent(h)); if (src) repo.index.set(p, h); } }
      }
    }
    repo.trace.push({ kind: 'index', paths: ps });
    return '';
  };

  /* ---------- 合并 ---------- */
  function mergeMessageFor(repo, refName) {
    const cur = repo.currentBranch();
    if (refName.includes('/') && repo.refs.has('refs/remotes/' + refName)) return `Merge remote-tracking branch '${refName}'${cur && cur !== 'master' ? ` into ${cur}` : ''}`;
    if (repo.refs.has('refs/heads/' + refName)) return `Merge branch '${refName}'${cur && cur !== 'master' ? ` into ${cur}` : ''}`;
    if (repo.refs.has('refs/tags/' + refName)) return `Merge tag '${refName}'${cur && cur !== 'master' ? ` into ${cur}` : ''}`;
    return `Merge commit '${refName}'${cur && cur !== 'master' ? ` into ${cur}` : ''}`;
  }
  function doMerge(ctx, theirs, refName, { noff = false, ffOnly = false, message = null, squash = false } = {}) {
    const repo = ctx.repo;
    const head = repo.headHash();
    if (!head) { // 空分支：直接指向
      repo.switchToTree(repo.treeOfCommit(theirs));
      repo.moveHead(theirs, `merge ${refName}: Fast-forward`);
      return `Fast-forward`;
    }
    const base = repo.mergeBase(head, theirs);
    if (base === theirs) return 'Already up to date.';
    const theirsTree = repo.treeOfCommit(theirs);
    if (base === head && !noff && !squash) {
      repo.checkDirtyForMerge(theirsTree, 'merge');
      const changes = repo.diffTrees(repo.treeOfCommit(head), theirsTree);
      repo.switchToTree(theirsTree, { verb: 'merge' });
      repo.moveHead(theirs, `merge ${refName}: Fast-forward`);
      return `Updating ${abbrev(head)}..${abbrev(theirs)}\nFast-forward\n${repo.diffStatText(changes)}`.replace(/\n$/, '');
    }
    if (ffOnly) throw new GitError('fatal: Not possible to fast-forward, aborting.');
    if (!base) throw new GitError('fatal: refusing to merge unrelated histories');
    repo.checkDirtyForMerge(theirsTree, 'merge');
    if (!repo.indexTreeEqualsHead()) throw new GitError(`error: Your local changes to the following files would be overwritten by merge:\n${[...repo.index.keys()].filter(p => repo.treeOfCommit(head).get(p) !== repo.index.get(p)).map(p => '\t' + p).join('\n')}\nPlease commit your changes or stash them before you merge.\nAborting`);
    const saved = repo.snapshotWorkState();
    const mr = repo.mergeTrees(repo.treeOfCommit(base), repo.treeOfCommit(head), theirsTree, { ours: 'HEAD', theirs: refName });
    repo.applyMergeResult(mr);
    const msg = message || mergeMessageFor(repo, refName);
    if (mr.conflicts.length) {
      repo.state.merge = { heads: [theirs], name: refName, msg, saved };
      throw new GitError([...mr.msgs, 'Automatic merge failed; fix conflicts and then commit the result.'].join('\n'));
    }
    if (squash) { return [...mr.msgs, `Squash commit -- not updating HEAD`, `Automatic merge went well; stopped before committing as requested`].join('\n'); }
    const tree = repo.writeTreeFromFlat(repo.index);
    const h = repo.createCommit({ tree, parents: [head, theirs], message: msg });
    repo.moveHead(h, `merge ${refName}: Merge made by the 'ort' strategy.`);
    const changes = repo.diffTrees(repo.treeOfCommit(head), repo.treeOfCommit(h));
    return [...mr.msgs, `Merge made by the 'ort' strategy.`, repo.diffStatText(changes).replace(/\n$/, '')].join('\n');
  }
  commands.merge = (ctx, args) => {
    const repo = ctx.repo;
    const { flags, positional } = parseArgs(args, { abort: 'bool', continue: 'bool', 'no-ff': 'bool', 'ff-only': 'bool', ff: 'bool', m: 'value', squash: 'bool', 'no-edit': 'bool', quit: 'bool', 'allow-unrelated-histories': 'bool', s: 'value', strategy: 'value', X: 'value' });
    if (flags.abort) {
      if (!repo.state.merge) throw new GitError('fatal: There is no merge to abort (MERGE_HEAD missing).');
      repo.restoreWorkState(repo.state.merge.saved); repo.state.merge = null; return '';
    }
    if (flags.continue) { if (!repo.state.merge) throw new GitError('fatal: There is no merge in progress (MERGE_HEAD missing).'); return commands.commit(ctx, []); }
    if (repo.state.merge) throw new GitError(`fatal: You have not concluded your merge (MERGE_HEAD exists).\nPlease, commit your changes before you merge.`);
    if (repo.state.rebase) throw new GitError('fatal: 正在 rebase 中，无法合并。');
    if (!positional.length) throw new GitError('fatal: No remote for the current branch.');
    const theirs = repo.resolveRev(positional[0]);
    return doMerge(ctx, theirs, positional[0], { noff: flags['no-ff'], ffOnly: flags['ff-only'], message: flags.m, squash: flags.squash });
  };

  /* ---------- rebase ---------- */
  commands.rebase = (ctx, args) => {
    const repo = ctx.repo;
    const { flags, positional } = parseArgs(args, { continue: 'bool', abort: 'bool', skip: 'bool', i: 'bool', interactive: 'bool', onto: 'value', quit: 'bool', 'no-ff': 'bool' });
    if (flags.i || flags.interactive) throw new GitError('本沙盒暂不支持交互式 rebase（git rebase -i）。可以用 git reset --soft + git commit 来合并提交。');
    const rb = repo.state.rebase;
    if (flags.abort) {
      if (!rb) throw new GitError('fatal: No rebase in progress?');
      repo.conflicts.clear();
      repo.resetHardTo(repo.treeOfCommit(rb.origHead));
      if (rb.branch) repo.HEAD = { symbolic: 'refs/heads/' + rb.branch }; else repo.HEAD = { detached: rb.origHead };
      repo.logReflog('HEAD', repo.headHash(), rb.origHead, `rebase (abort): updating HEAD`);
      repo.state.rebase = null;
      return '';
    }
    if (flags.continue) {
      if (!rb) throw new GitError('fatal: No rebase in progress?');
      if (repo.conflicts.size) throw new GitError(`${[...repo.conflicts.keys()].map(p => p + ': needs merge').join('\n')}\nYou must edit all merge conflicts and then\nmark them as resolved using git add`);
      const out = [];
      if (rb.current) {
        const tree = repo.writeTreeFromFlat(repo.index);
        if (tree === repo.getCommit(repo.headHash()).tree) throw new GitError(`No changes - did you forget to use 'git add'?\nIf there is nothing left to stage, chances are that something else\nalready introduced the same changes; you might want to skip this patch.\n\nhint: 使用 "git rebase --skip" 跳过这个提交。`);
        rebaseCommitCurrent(repo, out);
      }
      return rebaseContinue(repo, out);
    }
    if (flags.skip) {
      if (!rb) throw new GitError('fatal: No rebase in progress?');
      repo.conflicts.clear(); repo.resetHardTo(repo.treeOfCommit(repo.headHash()));
      if (rb.current) { rb.done.push({ from: rb.current, to: null }); rb.todo.shift(); rb.current = null; }
      return rebaseContinue(repo, []);
    }
    if (rb) throw new GitError(`fatal: It seems that there is already a rebase in progress.\nIf that is the case, please try\n\tgit rebase (--continue | --abort | --skip)`);
    if (!positional.length) throw new GitError('fatal: 请指定要 rebase 到的分支，例如 git rebase main');
    checkAllowSwitch(repo);
    const upstream = repo.resolveRev(positional[0]);
    let branch = repo.currentBranch();
    if (positional[1]) { commands.checkout(ctx, [positional[1]]); branch = repo.currentBranch(); }
    const head = repo.headHash();
    const s = repo.statusData();
    if (s.unstaged.length) throw new GitError('error: cannot rebase: You have unstaged changes.\nerror: Please commit or stash them.');
    if (s.staged.length) throw new GitError('error: cannot rebase: Your index contains uncommitted changes.\nerror: Please commit or stash them.');
    const onto = flags.onto ? repo.resolveRev(flags.onto) : upstream;
    if (repo.isAncestor(head, upstream) && !flags.onto) {
      // 快进
      repo.switchToTree(repo.treeOfCommit(upstream));
      repo.moveHead(upstream, `rebase (finish): refs/heads/${branch} onto ${abbrev(upstream)}`);
      return `Successfully rebased and updated refs/heads/${branch}.`;
    }
    if (repo.isAncestor(upstream, head) && !flags.onto) return `Current branch ${branch} is up to date.`;
    const todo = repo.topoOrder(repo.revList([head], [upstream])).filter(h => repo.getCommit(h).parents.length < 2);
    repo.state.rebase = { branch, origHead: head, onto, todo, done: [], current: null, ontoName: positional[0] };
    repo.switchToTree(repo.treeOfCommit(onto));
    repo.HEAD = { detached: onto };
    repo.logReflog('HEAD', head, onto, `rebase (start): checkout ${positional[0]}`);
    return rebaseContinue(repo, []);
  };

  commands['cherry-pick'] = (ctx, args) => {
    const repo = ctx.repo;
    const { flags, positional } = parseArgs(args, { continue: 'bool', abort: 'bool', skip: 'bool', n: 'bool', 'no-commit': 'bool', m: 'value', mainline: 'value', x: 'bool', e: 'bool', quit: 'bool' });
    const st = repo.state.cherryPick;
    if (flags.abort) { if (!st) throw new GitError('error: no cherry-pick or revert in progress\nfatal: cherry-pick failed'); repo.conflicts.clear(); repo.restoreWorkState(st.saved.work); if (st.saved.head !== repo.headHash()) repo.moveHead(st.saved.head, 'cherry-pick: abort'); repo.state.cherryPick = null; return ''; }
    if (flags.continue) { if (!st) throw new GitError('error: no cherry-pick or revert in progress\nfatal: cherry-pick failed'); return commands.commit(ctx, []); }
    if (flags.skip) { if (!st) throw new GitError('error: no cherry-pick or revert in progress'); repo.conflicts.clear(); repo.resetHardTo(repo.treeOfCommit(repo.headHash())); const rest = st.rest || []; repo.state.cherryPick = null; return rest.length ? cherryPickRun(repo, rest, st) : ''; }
    if (st) throw new GitError('error: cherry-pick is already in progress\nhint: try "git cherry-pick (--continue | --abort | --quit)"\nfatal: cherry-pick failed');
    if (!positional.length) throw new GitError('usage: git cherry-pick <commit>...');
    checkAllowSwitch(repo);
    if (!repo.isClean()) throw new GitError(`error: your local changes would be overwritten by cherry-pick.\nhint: commit your changes or stash them to proceed.\nfatal: cherry-pick failed`);
    const hashes = [];
    for (const p of positional) {
      if (p.includes('..')) { const [a, b] = p.split('..'); hashes.push(...repo.topoOrder(repo.revList([repo.resolveRev(b)], [repo.resolveRev(a)]))); }
      else hashes.push(repo.resolveRev(p));
    }
    const saved = { head: repo.headHash(), work: repo.snapshotWorkState() };
    return cherryPickRun(repo, hashes, { saved, mainline: flags.m || flags.mainline ? parseInt(flags.m || flags.mainline, 10) : undefined });
  };

  commands.revert = (ctx, args) => {
    const repo = ctx.repo;
    const { flags, positional } = parseArgs(args, { continue: 'bool', abort: 'bool', skip: 'bool', n: 'bool', 'no-commit': 'bool', m: 'value', mainline: 'value', 'no-edit': 'bool', quit: 'bool' });
    const st = repo.state.revert;
    if (flags.abort) { if (!st) throw new GitError('error: no cherry-pick or revert in progress\nfatal: revert failed'); repo.conflicts.clear(); repo.restoreWorkState(st.saved); repo.state.revert = null; return ''; }
    if (flags.continue) { if (!st) throw new GitError('error: no cherry-pick or revert in progress\nfatal: revert failed'); return commands.commit(ctx, []); }
    if (flags.skip) { if (!st) throw new GitError('error: no cherry-pick or revert in progress'); repo.conflicts.clear(); repo.resetHardTo(repo.treeOfCommit(repo.headHash())); repo.state.revert = null; return ''; }
    if (st) throw new GitError('error: revert is already in progress\nhint: try "git revert (--continue | --abort | --quit)"\nfatal: revert failed');
    if (!positional.length) throw new GitError('usage: git revert <commit>...');
    checkAllowSwitch(repo);
    if (!repo.isClean()) throw new GitError(`error: your local changes would be overwritten by revert.\nhint: commit your changes or stash them to proceed.\nfatal: revert failed`);
    const outs = [];
    for (const p of positional) {
      const h = repo.resolveRev(p);
      const c = repo.getCommit(h);
      const saved = repo.snapshotWorkState();
      const mr = applyCommitAsPatch(repo, h, { reverse: true, labels: { ours: 'HEAD', theirs: `parent of ${abbrev(h)} (${repo.subject(h)})` }, mainline: flags.m || flags.mainline ? parseInt(flags.m || flags.mainline, 10) : undefined });
      outs.push(...mr.msgs);
      if (mr.conflicts.length) {
        repo.state.revert = { hash: h, saved };
        outs.push(`error: could not revert ${abbrev(h)}... ${repo.subject(h)}\nhint: After resolving the conflicts, mark them with\nhint: "git add/rm <pathspec>", then run\nhint: "git revert --continue".\nhint: You can instead skip this commit with "git revert --skip".\nhint: To abort and get back to the state before "git revert",\nhint: run "git revert --abort".`);
        throw new GitError(outs.join('\n'));
      }
      const tree = repo.writeTreeFromFlat(repo.index);
      const nh = repo.createCommit({ tree, parents: [repo.headHash()], message: `Revert "${c.message.split('\n')[0]}"\n\nThis reverts commit ${h}.` });
      repo.moveHead(nh, `revert: ${repo.subject(nh)}`);
      outs.push(commitResultText(repo, nh));
    }
    return outs.join('\n');
  };

  /* ---------- reset ---------- */
  commands.reset = (ctx, args) => {
    const repo = ctx.repo;
    const { flags, positional, paths } = parseArgs(args, { soft: 'bool', mixed: 'bool', hard: 'bool', merge: 'bool', keep: 'bool', q: 'bool', p: 'bool' });
    let rev = null; let ps = paths.slice();
    if (positional.length) {
      const h = repo.tryResolve(positional[0]);
      if (h && !(repo.index.has(positional[0]) || repo.workdir.has(positional[0]))) { rev = positional[0]; ps = positional.slice(1).concat(ps); }
      else ps = positional.concat(ps);
    }
    const head = repo.headHash();
    if (ps.length) {
      if (flags.hard || flags.soft) throw new GitError('fatal: Cannot do hard reset with paths.');
      const src = rev ? repo.treeOfCommit(repo.resolveRev(rev)) : repo.treeOfCommit(head);
      const known = unionKeys(src, repo.index, repo.conflicts);
      const changed = [];
      for (const s of ps) {
        const rp = toRepoPath(ctx, s);
        const m = matchPathspec(rp, known);
        if (!m.length) throw new GitError(`fatal: ambiguous argument '${s}': unknown revision or path not in the working tree.`);
        for (const p of m) { const h = src.get(p); if (h === undefined) repo.index.delete(p); else repo.index.set(p, h); repo.conflicts.delete(p); changed.push(p); }
      }
      repo.trace.push({ kind: 'index', paths: changed });
      const lines = [];
      for (const p of changed) { const w = repo.workHash(p); const i = repo.index.get(p); if (w === null && i !== undefined) lines.push(`D\t${p}`); else if (w !== null && i !== w) lines.push(`M\t${p}`); }
      return lines.length ? 'Unstaged changes after reset:\n' + lines.join('\n') : '';
    }
    const target = rev ? repo.resolveRev(rev) : head;
    if (!target) throw new GitError(`fatal: Failed to resolve 'HEAD' as a valid ref.`);
    const mode = flags.hard ? 'hard' : flags.soft ? 'soft' : 'mixed';
    if (mode !== 'soft' && repo.conflicts.size && mode === 'mixed' && !rev) { /* 允许 */ }
    repo.ORIG_HEAD = head;
    const targetTree = repo.treeOfCommit(target);
    if (mode === 'hard') {
      repo.resetHardTo(targetTree);
      repo.state.merge = null; repo.state.cherryPick = null; repo.state.revert = null;
    } else if (mode === 'mixed') {
      repo.index = new Map(targetTree); repo.conflicts.clear();
      repo.state.merge = null; repo.state.cherryPick = null; repo.state.revert = null;
    }
    if (target !== head || mode !== 'soft') repo.moveHead(target, `reset: moving to ${rev || 'HEAD'}`);
    if (mode === 'hard') return `HEAD is now at ${abbrev(target)} ${repo.subject(target)}`;
    if (mode === 'mixed') {
      const lines = [];
      for (const p of unionKeys(repo.index, repo.workdir)) { if (!repo.index.has(p)) continue; const w = repo.workHash(p); if (w === null) lines.push(`D\t${p}`); else if (w !== repo.index.get(p)) lines.push(`M\t${p}`); }
      return lines.length ? 'Unstaged changes after reset:\n' + lines.join('\n') : '';
    }
    return '';
  };

  /* ---------- stash ---------- */
  commands.stash = (ctx, args) => {
    const repo = ctx.repo;
    let sub = args[0];
    if (!sub || sub.startsWith('-')) sub = 'push'; else args = args.slice(1);
    const { flags, positional } = parseArgs(args, { m: 'value', message: 'value', u: 'bool', 'include-untracked': 'bool', index: 'bool', q: 'bool', p: 'bool', 'keep-index': 'bool', a: 'bool', all: 'bool' });
    const head = repo.headHash();
    const branch = repo.currentBranch();
    const parseStashRef = s => { if (!s) return 0; const m = s.match(/^stash@\{(\d+)\}$/); if (!m) { const n = parseInt(s, 10); if (!isNaN(n)) return n; throw new GitError(`error: ${s} is not a valid reference`); } return parseInt(m[1], 10); };
    if (sub === 'push' || sub === 'save') {
      if (!head) throw new GitError('fatal: You do not have the initial commit yet');
      if (repo.conflicts.size) throw new GitError('error: 有未解决的冲突，无法 stash。');
      const s = repo.statusData();
      const includeUntracked = flags.u || flags['include-untracked'] || flags.a || flags.all;
      if (!s.staged.length && !s.unstaged.length && !(includeUntracked && s.untracked.length)) return 'No local changes to save';
      const msgArg = flags.m || flags.message || (sub === 'save' ? positional.join(' ') : '');
      const label = `${branch || '(no branch)'}: ${abbrev(head)} ${repo.subject(head)}`;
      const msg = msgArg ? `On ${label.split(':')[0]}: ${msgArg}` : `WIP on ${label}`;
      const indexTree = repo.writeTreeFromFlat(repo.index);
      const indexCommit = repo.createCommit({ tree: indexTree, parents: [head], message: `index on ${label}` });
      const wflat = new Map();
      for (const p of repo.index.keys()) if (repo.workdir.has(p)) wflat.set(p, repo.writeBlob(repo.workdir.get(p)));
      const parents = [head, indexCommit];
      let untrackedPaths = [];
      if (includeUntracked) { const uflat = new Map(); for (const p of s.untracked) uflat.set(p, repo.writeBlob(repo.workdir.get(p))); if (uflat.size) { const uc = repo.createCommit({ tree: repo.writeTreeFromFlat(uflat), parents: [], message: `untracked files on ${label}` }); parents.push(uc); untrackedPaths = [...uflat.keys()]; } }
      const stashCommit = repo.createCommit({ tree: repo.writeTreeFromFlat(wflat), parents, message: msg });
      repo.stash.unshift({ hash: stashCommit, msg, untracked: untrackedPaths });
      repo.trace.push({ kind: 'stash', hash: stashCommit });
      repo.resetHardTo(repo.treeOfCommit(head));
      for (const p of untrackedPaths) repo.workdir.delete(p);
      return `Saved working directory and index state ${msg}`;
    }
    if (sub === 'list') return repo.stash.map((s, i) => `stash@{${i}}: ${s.msg}`).join('\n');
    if (sub === 'show') { const n = parseStashRef(positional[0]); const st = repo.stash[n]; if (!st) throw new GitError(`fatal: log for 'stash' only has ${repo.stash.length} entries`); const c = repo.getCommit(st.hash); const changes = repo.diffTrees(repo.treeOfCommit(c.parents[0]), repo.treeOfCommit(st.hash)); return (flags.p ? repo.unifiedDiffText(repo.treeOfCommit(c.parents[0]), repo.treeOfCommit(st.hash)) : repo.diffStatText(changes)).replace(/\n$/, ''); }
    if (sub === 'drop' || sub === 'pop' || sub === 'apply') {
      const n = parseStashRef(positional[0]);
      const st = repo.stash[n];
      if (!st) throw new GitError(repo.stash.length ? `error: refs/stash@{${n}}: stash entry not found` : 'No stash entries found.');
      if (sub === 'drop') { repo.stash.splice(n, 1); return `Dropped refs/stash@{${n}} (${st.hash})`; }
      if (repo.conflicts.size) throw new GitError('error: could not restore untracked files from stash');
      const c = repo.getCommit(st.hash);
      const baseTree = repo.treeOfCommit(c.parents[0]);
      const stashTree = repo.treeOfCommit(st.hash);
      const oursFlat = new Map(repo.index);
      for (const p of repo.index.keys()) if (repo.workdir.has(p)) oursFlat.set(p, repo.writeBlob(repo.workdir.get(p)));
      // 未跟踪文件冲突检查
      if (st.untracked && st.untracked.length) { const clash = st.untracked.filter(p => repo.workdir.has(p)); if (clash.length) throw new GitError(`error: ${clash.join(', ')} already exists, no checkout\nerror: could not restore untracked files from stash`); }
      const mr = repo.mergeTrees(baseTree, oursFlat, stashTree, { ours: 'Updated upstream', theirs: 'Stashed changes' });
      // 应用：工作区 = result；index 仅对新文件更新（真实 git 默认不恢复 index，除非 --index）
      const savedIndex = new Map(repo.index);
      for (const p of unionKeys(oursFlat, mr.result)) {
        const o = oursFlat.get(p), r = mr.result.get(p);
        if (o === r) continue;
        if (r === undefined) { repo.workdir.delete(p); repo.index.delete(p); }
        else { repo.workdir.set(p, repo.blobContent(r)); if (!baseTree.has(p) || flags.index) repo.index.set(p, r); }
      }
      if (flags.index) { const ic = repo.getCommit(c.parents[1]); for (const [p, h] of repo.treeOfCommit(ic.hash)) if (savedIndex.get(p) !== h && baseTree.get(p) !== h) repo.index.set(p, h); }
      for (const p of (st.untracked || [])) { const uc = repo.getCommit(c.parents[2]); const t = repo.treeOfCommit(uc.hash); repo.workdir.set(p, repo.blobContent(t.get(p))); }
      for (const cf of mr.conflicts) { repo.workdir.set(cf.path, cf.content); repo.index.delete(cf.path); repo.conflicts.set(cf.path, { base: cf.base, ours: cf.ours, theirs: cf.theirs }); }
      if (mr.conflicts.length) throw new GitError([...mr.msgs, sub === 'pop' ? 'The stash entry is kept in case you need it again.' : ''].filter(Boolean).join('\n'));
      let out = statusText(repo);
      if (sub === 'pop') { repo.stash.splice(n, 1); out += `\nDropped refs/stash@{${n}} (${st.hash})`; }
      return out;
    }
    if (sub === 'clear') { repo.stash = []; return ''; }
    if (sub === 'branch') { const name = positional[0]; const n = parseStashRef(positional[1]); const st = repo.stash[n]; if (!st) throw new GitError('No stash entries found.'); const c = repo.getCommit(st.hash); let out = commands.checkout(ctx, ['-b', name, c.parents[0]]); out += '\n' + commands.stash(ctx, ['pop', `stash@{${n}}`]); return out; }
    throw new GitError(`error: unknown subcommand: '${sub}'`);
  };

  /* ---------- tag ---------- */
  commands.tag = (ctx, args) => {
    const repo = ctx.repo;
    const { flags, positional } = parseArgs(args, { a: 'bool', annotate: 'bool', m: 'value', message: 'value', d: 'bool', delete: 'bool', l: 'bool', list: 'bool', f: 'bool', force: 'bool', n: 'bool' });
    if (flags.d || flags.delete) { const out = []; for (const t of positional) { if (!repo.refs.has('refs/tags/' + t)) throw new GitError(`error: tag '${t}' not found.`); const h = repo.refs.get('refs/tags/' + t); repo.updateRef('refs/tags/' + t, null); out.push(`Deleted tag '${t}' (was ${abbrev(h)})`); } return out.join('\n'); }
    if (!positional.length || flags.l || flags.list) return repo.tags().join('\n');
    const name = positional[0];
    if (!/^[A-Za-z0-9][A-Za-z0-9._\/-]*$/.test(name)) throw new GitError(`fatal: '${name}' is not a valid tag name.`);
    if (repo.refs.has('refs/tags/' + name) && !flags.f && !flags.force) throw new GitError(`fatal: tag '${name}' already exists`);
    const target = positional[1] ? repo.resolveRev(positional[1]) : repo.headHash();
    if (!target) throw new GitError('fatal: Failed to resolve \'HEAD\' as a valid ref.');
    const msg = flags.m || flags.message;
    if (flags.a || flags.annotate || msg) {
      if (!msg) throw new GitError('fatal: 本沙盒请用 -m 指定标签说明，例如 git tag -a v1.0 -m "release"');
      const nm = repo.getConfig('user.name'), em = repo.getConfig('user.email');
      const ts = now();
      const content = `object ${target}\ntype commit\ntag ${name}\ntagger ${nm} <${em}> ${Math.floor(ts / 1000)} +0800\n\n${msg}\n`;
      const th = repo.putObject({ type: 'tag', content, object: target, tagName: name, tagger: { name: nm, email: em }, date: ts, message: msg });
      repo.updateRef('refs/tags/' + name, th);
    } else repo.updateRef('refs/tags/' + name, target);
    return '';
  };

  /* ---------- reflog ---------- */
  commands.reflog = (ctx, args) => {
    const repo = ctx.repo;
    let sub = 'show'; if (args[0] && !args[0].startsWith('-') && ['show', 'expire', 'delete', 'exists'].includes(args[0])) { sub = args[0]; args = args.slice(1); }
    const { positional } = parseArgs(args, { all: 'bool', n: 'value' });
    if (sub === 'expire' || sub === 'delete') { const ref = positional[0] === undefined ? 'HEAD' : positional[0]; repo.reflogs.set(ref, []); return ''; }
    const ref = positional[0] ? (repo.refs.has('refs/heads/' + positional[0]) ? 'refs/heads/' + positional[0] : positional[0]) : 'HEAD';
    const log = repo.reflogs.get(ref) || [];
    const short = ref.replace('refs/heads/', '');
    return log.map((e, i) => `${abbrev(e.new)}${repo.decoStr(e.new)} ${short}@{${i}}: ${e.msg}`).join('\n');
  };

  /* ---------- blame ---------- */
  commands.blame = (ctx, args) => {
    const repo = ctx.repo;
    const { flags, positional } = parseArgs(args, { L: 'value', s: 'bool', e: 'bool', w: 'bool' });
    if (!positional.length) throw new GitError('usage: git blame <file>');
    const path = toRepoPath(ctx, positional[0]);
    const head = repo.headHash();
    if (!head) throw new GitError(`fatal: no such path '${path}' in HEAD`);
    const headTree = repo.treeOfCommit(head);
    const workContent = repo.workdir.get(path);
    if (workContent === undefined && !headTree.has(path)) throw new GitError(`fatal: no such path '${path}' in HEAD`);
    const curLines = splitLines(workContent !== undefined ? workContent : repo.blobContent(headTree.get(path)));
    const attr = new Array(curLines.length).fill(null);
    // 未提交的修改
    let mapping = curLines.map((_, i) => i); // 当前行 -> 在 HEAD 版本中的行号
    if (workContent !== undefined) {
      const hc = headTree.has(path) ? repo.blobContent(headTree.get(path)) : '';
      const ops = diffLines(hc, workContent);
      const m = new Array(curLines.length).fill(-1);
      for (const o of ops) { if (o.type === 'equal') m[o.bIdx] = o.aIdx; else if (o.type === 'add') attr[o.bIdx] = { hash: '00000000', name: 'Not Committed Yet', date: now() }; }
      mapping = m;
    }
    let commit = head;
    let lineMap = mapping; // 当前行 -> commit 版本行号（-1 表示已归属）
    while (commit) {
      const c = repo.getCommit(commit);
      const t = repo.treeOfCommit(commit);
      const content = t.has(path) ? repo.blobContent(t.get(path)) : '';
      const parent = c.parents[0] || null;
      const pt = repo.treeOfCommit(parent);
      const pcontent = pt.has(path) ? repo.blobContent(pt.get(path)) : '';
      const ops = diffLines(pcontent, content);
      const toParent = new Map();
      const added = new Set();
      for (const o of ops) { if (o.type === 'equal') toParent.set(o.bIdx, o.aIdx); else if (o.type === 'add') added.add(o.bIdx); }
      const next = lineMap.map((li, i) => {
        if (li < 0 || attr[i]) return -1;
        if (added.has(li) || !parent) { attr[i] = { hash: commit, name: c.author.name, date: c.authorDate, root: !parent }; return -1; }
        return toParent.has(li) ? toParent.get(li) : -1;
      });
      lineMap = next;
      if (!lineMap.some(x => x >= 0)) break;
      commit = parent;
    }
    const width = String(curLines.length).length;
    return curLines.map((l, i) => { const a = attr[i] || { hash: '00000000', name: '?', date: now() }; return `${a.root ? '^' + a.hash.slice(0, 7) : a.hash.slice(0, 8)} (${pad(a.name, 12)} ${fmtDateISO(a.date)} ${String(i + 1).padStart(width)}) ${l}`; }).join('\n');
  };

  /* ---------- bisect ---------- */
  function bisectCandidates(repo, st) {
    const list = repo.revList([st.bad], st.good);
    return repo.topoOrder(list.filter(h => h !== st.bad));
  }
  function bisectStep(repo) {
    const st = repo.state.bisect;
    if (!st.bad || !st.good.length) { const need = !st.bad ? 'bad' : 'good'; return `status: waiting for both good and bad commits, ${st.bad ? '1 bad' : '0 bad'} commit${st.good.length ? ', ' + plural(st.good.length, 'good commit') : ''} known\n(请用 git bisect ${need} 标记一个${need === 'bad' ? '有问题' : '正常'}的提交)`; }
    const cands = bisectCandidates(repo, st);
    if (!cands.length) {
      const h = st.bad;
      const c = repo.getCommit(h);
      const changes = repo.diffTrees(repo.treeOfCommit(c.parents[0] || null), repo.treeOfCommit(h));
      st.found = h;
      return `${h} is the first bad commit\n${commitHeaderText(repo, h, { deco: false })}\n\n${repo.diffStatText(changes).replace(/\n$/, '')}`;
    }
    const mid = cands[Math.floor((cands.length - 1) / 2)];
    const left = Math.floor((cands.length - 1) / 2);
    const steps = Math.ceil(Math.log2(left + 1));
    repo.switchToTree(repo.treeOfCommit(mid));
    repo.HEAD = { detached: mid };
    repo.logReflog('HEAD', null, mid, `checkout: moving to ${mid}`);
    return `Bisecting: ${left} revision${left === 1 ? '' : 's'} left to test after this (roughly ${steps} step${steps === 1 ? '' : 's'})\n[${mid}] ${repo.subject(mid)}`;
  }
  commands.bisect = (ctx, args) => {
    const repo = ctx.repo;
    const sub = args[0];
    const rest = args.slice(1);
    if (!sub) throw new GitError('usage: git bisect [help|start|bad|good|new|old|terms|skip|next|reset|visualize|view|replay|log|run]');
    if (sub === 'start') {
      if (repo.state.bisect) throw new GitError('fatal: bisect 已在进行中，先 git bisect reset');
      if (!repo.isClean()) throw new GitError('error: 工作区有未提交的修改，无法开始 bisect。请先提交或 stash。');
      repo.state.bisect = { bad: null, good: [], origHead: repo.headHash(), origBranch: repo.currentBranch(), log: ['git bisect start'] };
      let out = '';
      if (rest[0]) { repo.state.bisect.bad = repo.resolveRev(rest[0]); repo.state.bisect.log.push(`git bisect bad ${repo.state.bisect.bad}`); }
      if (rest[1]) { repo.state.bisect.good.push(repo.resolveRev(rest[1])); repo.state.bisect.log.push(`git bisect good ${repo.state.bisect.good[0]}`); }
      out = bisectStep(repo);
      return out;
    }
    const st = repo.state.bisect;
    if (!st) throw new GitError(`You need to start by "git bisect start"\nDo you want me to do it for you [Y/n]? （请先运行 git bisect start）`);
    if (sub === 'bad' || sub === 'good' || sub === 'new' || sub === 'old') {
      if (st.found) return `${st.found} is the first bad commit`;
      const h = rest[0] ? repo.resolveRev(rest[0]) : repo.headHash();
      if (sub === 'bad' || sub === 'new') {
        if (st.good.some(g => repo.isAncestor(h, g))) throw new GitError(`Some good revs are not ancestors of the bad rev.\ngit bisect cannot work properly in this case.\nMaybe you mistook good and bad revs?`);
        st.bad = h; st.log.push(`git bisect bad ${h}`);
      } else {
        if (st.bad && repo.isAncestor(st.bad, h)) throw new GitError(`Some good revs are not ancestors of the bad rev.\ngit bisect cannot work properly in this case.\nMaybe you mistook good and bad revs?`);
        st.good.push(h); st.log.push(`git bisect good ${h}`);
      }
      return bisectStep(repo);
    }
    if (sub === 'skip') { const h = repo.headHash(); st.good.push(h); st.log.push(`git bisect skip ${h}`); return bisectStep(repo); }
    if (sub === 'reset') {
      const cur = repo.headHash();
      repo.switchToTree(repo.treeOfCommit(st.origHead));
      if (st.origBranch) repo.HEAD = { symbolic: 'refs/heads/' + st.origBranch }; else repo.HEAD = { detached: st.origHead };
      repo.logReflog('HEAD', cur, st.origHead, `checkout: moving from ${abbrev(cur)} to ${st.origBranch || abbrev(st.origHead)}`);
      repo.state.bisect = null;
      return `Previous HEAD position was ${abbrev(cur)} ${repo.subject(cur)}\nSwitched to branch '${st.origBranch || abbrev(st.origHead)}'`;
    }
    if (sub === 'log') return st.log.join('\n');
    if (sub === 'run') throw new GitError('本沙盒暂不支持 git bisect run，请手动运行测试命令后用 git bisect good/bad 标记。');
    throw new GitError(`error: unknown bisect subcommand '${sub}'`);
  };

  /* ---------- 远程 ---------- */
  commands.remote = (ctx, args) => {
    const repo = ctx.repo;
    const sub = args[0];
    if (!sub || sub === '-v' || sub === '--verbose') {
      const names = Object.keys(repo.config).filter(k => /^remote\..*\.url$/.test(k)).map(k => k.slice(7, -4));
      if (!sub) return names.join('\n');
      return names.map(n => `${n}\t${repo.config[`remote.${n}.url`]} (fetch)\n${n}\t${repo.config[`remote.${n}.url`]} (push)`).join('\n');
    }
    if (sub === 'add') {
      const [name, url] = args.slice(1);
      if (!name || !url) throw new GitError('usage: git remote add <name> <url>');
      if (repo.config[`remote.${name}.url`]) throw new GitError(`error: remote ${name} already exists.`);
      repo.config[`remote.${name}.url`] = url;
      repo.config[`remote.${name}.fetch`] = `+refs/heads/*:refs/remotes/${name}/*`;
      return '';
    }
    if (sub === 'remove' || sub === 'rm') {
      const name = args[1];
      if (!repo.config[`remote.${name}.url`]) throw new GitError(`error: No such remote: '${name}'`);
      delete repo.config[`remote.${name}.url`]; delete repo.config[`remote.${name}.fetch`];
      for (const r of repo.remoteRefs()) if (r.startsWith(name + '/')) repo.updateRef('refs/remotes/' + r, null);
      return '';
    }
    if (sub === 'rename') { const [o, n] = args.slice(1); if (!repo.config[`remote.${o}.url`]) throw new GitError(`error: No such remote: '${o}'`); repo.config[`remote.${n}.url`] = repo.config[`remote.${o}.url`]; delete repo.config[`remote.${o}.url`]; for (const r of repo.remoteRefs()) if (r.startsWith(o + '/')) { const h = repo.refs.get('refs/remotes/' + r); repo.refs.delete('refs/remotes/' + r); repo.refs.set(`refs/remotes/${n}/${r.slice(o.length + 1)}`, h); } for (const k of Object.keys(repo.config)) if (k.endsWith('.remote') && repo.config[k] === o) repo.config[k] = n; return ''; }
    if (sub === 'show') { const name = args[1]; const { url, target } = remoteFor(ctx, name); return `* remote ${name}\n  Fetch URL: ${url}\n  Push  URL: ${url}\n  HEAD branch: ${target.currentBranch() || '(unknown)'}\n  Remote branches:\n${target.branches().map(b => `    ${b} ${repo.refs.has(`refs/remotes/${name}/${b}`) ? 'tracked' : 'new (next fetch will store in remotes/' + name + ')'}`).join('\n')}`; }
    if (sub === 'set-url') { const [name, url] = args.slice(1); if (!repo.config[`remote.${name}.url`]) throw new GitError(`error: No such remote '${name}'`); repo.config[`remote.${name}.url`] = url; return ''; }
    throw new GitError(`error: Unknown subcommand: ${sub}`);
  };

  commands.fetch = (ctx, args) => {
    const repo = ctx.repo;
    const { flags, positional } = parseArgs(args, { all: 'bool', p: 'bool', prune: 'bool', tags: 'bool', q: 'bool', v: 'bool' });
    const names = flags.all ? Object.keys(repo.config).filter(k => /^remote\..*\.url$/.test(k)).map(k => k.slice(7, -4)) : [positional[0] || repo.config[`branch.${repo.currentBranch()}.remote`] || 'origin'];
    const outs = [];
    for (const n of names) { if (flags.all) outs.push(`Fetching ${n}`); const o = fetchFrom(ctx, n, { prune: flags.p || flags.prune }); if (o) outs.push(o); }
    return outs.join('\n');
  };

  commands.pull = (ctx, args) => {
    const repo = ctx.repo;
    const { flags, positional } = parseArgs(args, { rebase: 'bool', 'no-rebase': 'bool', 'ff-only': 'bool', ff: 'bool', 'no-ff': 'bool', q: 'bool', v: 'bool', 'no-edit': 'bool', p: 'bool', prune: 'bool', tags: 'bool', autostash: 'bool' });
    if (repo.state.merge || repo.state.rebase || repo.conflicts.size) throw new GitError('error: 有未完成的合并/变基或未解决的冲突，请先处理。');
    const cur = repo.currentBranch();
    const remoteName = positional[0] || repo.config[`branch.${cur}.remote`] || 'origin';
    const fetchOut = fetchFrom(ctx, remoteName);
    let upstreamRef, upstreamLabel;
    const { url, target } = remoteFor(ctx, remoteName);
    if (positional[1]) {
      if (!target.refs.has('refs/heads/' + positional[1])) throw new GitError(`fatal: couldn't find remote ref ${positional[1]}`);
      upstreamRef = `refs/remotes/${remoteName}/${positional[1]}`; upstreamLabel = `branch '${positional[1]}' of ${url}`;
      if (!repo.refs.has(upstreamRef)) { transferObjects(target, repo, [target.refs.get('refs/heads/' + positional[1])]); repo.refs.set(upstreamRef, target.refs.get('refs/heads/' + positional[1])); }
    } else {
      if (!cur) throw new GitError('You are not currently on a branch.\nPlease specify which branch you want to merge with.\nSee git-pull(1) for details.\n\n    git pull <remote> <branch>\n');
      const up = repo.upstreamOf(cur);
      if (!up) throw new GitError(`There is no tracking information for the current branch.\nPlease specify which branch you want to merge with.\nSee git-pull(1) for details.\n\n    git pull <remote> <branch>\n\nIf you wish to set tracking information for this branch you can do so with:\n\n    git branch --set-upstream-to=${remoteName}/<branch> ${cur}\n`);
      upstreamRef = up.ref; upstreamLabel = `branch '${up.branch}' of ${url}`;
      if (!repo.refs.has(upstreamRef)) throw new GitError(`Your configuration specifies to merge with the ref 'refs/heads/${up.branch}'\nfrom the remote, but no such ref was fetched.`);
    }
    const theirs = repo.refs.get(upstreamRef);
    const head = repo.headHash();
    const pre = fetchOut ? fetchOut + '\n' : '';
    if (!head) { repo.switchToTree(repo.treeOfCommit(theirs)); repo.moveHead(theirs, `pull: Fast-forward`); return pre + 'Fast-forward'; }
    const base = repo.mergeBase(head, theirs);
    if (base === theirs) return pre + 'Already up to date.';
    const wantRebase = flags.rebase || (!flags['no-rebase'] && !flags.ff && !flags['no-ff'] && repo.getConfig('pull.rebase') === 'true');
    if (base === head && !flags['no-ff']) {
      const r = doMerge(ctx, theirs, upstreamLabel, {});
      return pre + r;
    }
    if (flags['ff-only'] || repo.getConfig('pull.ff') === 'only') throw new GitError(pre + 'fatal: Not possible to fast-forward, aborting.');
    if (wantRebase) {
      const r = commands.rebase(ctx, [upstreamRef.replace('refs/remotes/', '')]);
      return pre + r;
    }
    if (flags['no-rebase'] || flags.ff || flags['no-ff'] || repo.getConfig('pull.rebase') === 'false') {
      const r = doMerge(ctx, theirs, upstreamLabel, { noff: flags['no-ff'], message: `Merge ${upstreamLabel}` });
      return pre + r;
    }
    throw new GitError(pre + `hint: You have divergent branches and need to specify how to reconcile them.\nhint: You can do so by running one of the following commands sometime before\nhint: your next pull:\nhint:\nhint:   git config pull.rebase false  # merge\nhint:   git config pull.rebase true   # rebase\nhint:   git config pull.ff only       # fast-forward only\nhint:\nhint: You can replace "git config" with "git config --global" to set a default\nhint: preference for all repositories. You can also pass --rebase, --no-rebase,\nhint: or --ff-only on the command line to override the configured default per\nhint: invocation.\nfatal: Need to specify how to reconcile divergent branches.`);
  };

  commands.push = (ctx, args) => {
    const repo = ctx.repo;
    const { flags, positional } = parseArgs(args, { u: 'bool', 'set-upstream': 'bool', f: 'bool', force: 'bool', 'force-with-lease': 'bool', d: 'bool', delete: 'bool', tags: 'bool', all: 'bool', q: 'bool', v: 'bool', 'dry-run': 'bool', n: 'bool' });
    const cur = repo.currentBranch();
    let remoteName = positional[0];
    let specs = positional.slice(1);
    if (!remoteName) remoteName = (cur && repo.config[`branch.${cur}.remote`]) || 'origin';
    const { name, url, target } = remoteFor(ctx, remoteName);
    const force = flags.f || flags.force || flags['force-with-lease'];
    const refspecs = [];
    if (flags.delete || flags.d) { for (const s of specs) refspecs.push({ src: null, dst: s }); }
    else if (flags.all) { for (const b of repo.branches()) refspecs.push({ src: b, dst: b }); }
    else if (!specs.length) {
      if (!cur) throw new GitError(`fatal: You are not currently on a branch.\nTo push the history leading to the current (detached HEAD)\nstate now, use\n\n    git push ${remoteName} HEAD:<name-of-remote-branch>\n`);
      const up = repo.upstreamOf(cur);
      if (!up || up.remote !== remoteName) throw new GitError(`fatal: The current branch ${cur} has no upstream branch.\nTo push the current branch and set the remote as upstream, use\n\n    git push --set-upstream ${remoteName} ${cur}\n\nTo have this happen automatically for branches without a tracking\nupstream, see 'push.autoSetupRemote' in 'git help config'.\n`);
      refspecs.push({ src: cur, dst: up.branch });
    } else {
      for (let s of specs) {
        let f = false;
        if (s.startsWith('+')) { f = true; s = s.slice(1); }
        if (s.startsWith(':')) { refspecs.push({ src: null, dst: s.slice(1) }); continue; }
        const [src, dst] = s.includes(':') ? s.split(':') : [s, s === 'HEAD' ? cur : s];
        if (src === 'HEAD' && !cur && !s.includes(':')) throw new GitError('fatal: You are not currently on a branch.');
        refspecs.push({ src, dst: dst.replace('refs/heads/', ''), force: f });
      }
    }
    if (flags.tags) for (const t of repo.tags()) refspecs.push({ src: 'refs/tags/' + t, dst: 'refs/tags/' + t, tag: t });
    const lines = []; const errors = []; let count = 0; let hintKind = null;
    for (const rs of refspecs) {
      const isTag = rs.tag || rs.dst.startsWith('refs/tags/');
      const dstRef = isTag ? (rs.dst.startsWith('refs/') ? rs.dst : 'refs/tags/' + rs.dst) : 'refs/heads/' + rs.dst;
      const dstShort = dstRef.replace(/^refs\/(heads|tags)\//, '');
      const remoteOld = target.refs.get(dstRef) || null;
      if (rs.src === null) {
        if (!remoteOld) { errors.push(`error: unable to delete '${dstShort}': remote ref does not exist`); lines.push(` ! [remote rejected] ${dstShort} (remote ref does not exist)`); continue; }
        if (!target.bare && target.HEAD.symbolic === dstRef) { lines.push(` ! [remote rejected] ${dstShort} (deletion of the current branch prohibited)`); errors.push('rejected'); continue; }
        if (target.hooks.protected && target.hooks.protected.includes(dstShort)) { lines.push(` ! [remote rejected] ${dstShort} (protected branch hook declined)`); errors.push('rejected'); continue; }
        target.updateRef(dstRef, null);
        repo.updateRef(`refs/remotes/${name}/${dstShort}`, null);
        lines.push(` - [deleted]         ${dstShort}`); continue;
      }
      let local;
      if (isTag) local = repo.refs.get(rs.src) || repo.resolveRev(rs.src, { wantCommit: false });
      else { if (!repo.refs.has('refs/heads/' + rs.src) && rs.src !== 'HEAD' && !repo.tryResolve(rs.src)) throw new GitError(`error: src refspec ${rs.src} does not match any\nerror: failed to push some refs to '${url}'`); local = rs.src === 'HEAD' ? repo.headHash() : (repo.refs.get('refs/heads/' + rs.src) || repo.resolveRev(rs.src)); }
      if (remoteOld === local) continue;
      const localCommit = repo.peel(local);
      if (!target.bare && target.HEAD.symbolic === dstRef && !isTag) { lines.push(` ! [remote rejected] ${rs.src} -> ${dstShort} (branch is currently checked out)`); errors.push('rejected'); hintKind = 'checkedout'; continue; }
      if (remoteOld && !isTag) {
        const ff = repo.hasObject(remoteOld) && repo.isAncestor(repo.peel(remoteOld), localCommit);
        if (!ff && !force && !rs.force) {
          const fetchFirst = !repo.hasObject(remoteOld);
          lines.push(` ! [rejected]        ${rs.src} -> ${dstShort} (${fetchFirst ? 'fetch first' : 'non-fast-forward'})`);
          errors.push('rejected'); hintKind = hintKind || (fetchFirst ? 'fetch-first' : 'non-ff'); continue;
        }
        if (!ff && (force || rs.force) && target.hooks.protected && target.hooks.protected.includes(dstShort)) { lines.push(` ! [remote rejected] ${rs.src} -> ${dstShort} (protected branch hook declined: force push denied)`); errors.push('rejected'); hintKind = 'protected'; continue; }
        if (flags['force-with-lease'] && repo.refs.get(`refs/remotes/${name}/${dstShort}`) !== remoteOld) { lines.push(` ! [rejected]        ${rs.src} -> ${dstShort} (stale info)`); errors.push('rejected'); hintKind = 'stale'; continue; }
        if (flags['dry-run'] || flags.n) { lines.push(ff ? `   ${abbrev(remoteOld)}..${abbrev(local)}  ${rs.src} -> ${dstShort}` : ` + ${abbrev(remoteOld)}...${abbrev(local)} ${rs.src} -> ${dstShort} (forced update)`); continue; }
        count += transferObjects(repo, target, [local]);
        target.updateRef(dstRef, local, `push`);
        lines.push(ff ? `   ${abbrev(remoteOld)}..${abbrev(local)}  ${rs.src} -> ${dstShort}` : ` + ${abbrev(remoteOld)}...${abbrev(local)} ${rs.src} -> ${dstShort} (forced update)`);
      } else if (remoteOld && isTag) {
        if (!force) { lines.push(` ! [rejected]        ${dstShort} -> ${dstShort} (already exists)`); errors.push('rejected'); hintKind = 'tag'; continue; }
        count += transferObjects(repo, target, [local]); target.updateRef(dstRef, local); lines.push(` + ${abbrev(remoteOld)}...${abbrev(local)} ${dstShort} -> ${dstShort} (forced update)`);
      } else {
        if (flags['dry-run'] || flags.n) { lines.push(` * [new ${isTag ? 'tag' : 'branch'}]      ${isTag ? dstShort : rs.src} -> ${dstShort}`); continue; }
        count += transferObjects(repo, target, [local]);
        target.updateRef(dstRef, local, 'push');
        lines.push(` * [new ${isTag ? 'tag' : 'branch'}]      ${isTag ? dstShort : rs.src} -> ${dstShort}`);
      }
      if (name && !isTag) repo.updateRef(`refs/remotes/${name}/${dstShort}`, local);
      if ((flags.u || flags['set-upstream']) && name && !isTag && repo.refs.has('refs/heads/' + rs.src)) { repo.config[`branch.${rs.src}.remote`] = name; repo.config[`branch.${rs.src}.merge`] = 'refs/heads/' + dstShort; lines.push(`branch '${rs.src}' set up to track '${name}/${dstShort}'.`); }
    }
    if (!lines.length) return 'Everything up-to-date';
    let out = '';
    if (count) out += `Enumerating objects: ${count}, done.\nCounting objects: 100% (${count}/${count}), done.\nWriting objects: 100% (${count}/${count}), done.\n`;
    const trackLines = lines.filter(l => l.startsWith('branch '));
    out += `To ${url}\n` + lines.filter(l => !l.startsWith('branch ')).join('\n');
    if (trackLines.length) out += '\n' + trackLines.join('\n');
    if (errors.length) {
      out += `\nerror: failed to push some refs to '${url}'`;
      if (hintKind === 'non-ff') out += `\nhint: Updates were rejected because the tip of your current branch is behind\nhint: its remote counterpart. If you want to integrate the remote changes,\nhint: use 'git pull' before pushing again.\nhint: See the 'Note about fast-forwards' in 'git push --help' for details.`;
      else if (hintKind === 'fetch-first') out += `\nhint: Updates were rejected because the remote contains work that you do not\nhint: have locally. This is usually caused by another repository pushing to\nhint: the same ref. If you want to integrate the remote changes, use\nhint: 'git pull' before pushing again.\nhint: See the 'Note about fast-forwards' in 'git push --help' for details.`;
      else if (hintKind === 'checkedout') out += `\nhint: 远程仓库不是裸仓库（bare），且该分支正被检出。真实 git 默认拒绝这种推送。`;
      else if (hintKind === 'stale') out += `\nhint: --force-with-lease 发现远程分支已被别人更新（与你本地记录的 origin/x 不一致），为保护他人提交而拒绝。先 git fetch 看看发生了什么。`;
      throw new GitError(out);
    }
    return out;
  };

  /* ---------- config ---------- */
  commands.config = (ctx, args) => {
    const repo = ctx.repo;
    const { flags, positional } = parseArgs(args, { global: 'bool', local: 'bool', list: 'bool', l: 'bool', unset: 'bool', get: 'bool', add: 'bool', e: 'bool', edit: 'bool' });
    const store = flags.global ? repo.globalConfig : repo.config;
    if (flags.list || flags.l) { const all = { ...repo.globalConfig, ...repo.config }; return Object.keys(all).sort().map(k => `${k}=${all[k]}`).join('\n'); }
    if (flags.unset) { delete store[positional[0]]; return ''; }
    if (!positional.length) throw new GitError('usage: git config [--global] <key> [<value>]');
    const [key, value] = positional;
    if (value === undefined) { const v = flags.global ? repo.globalConfig[key] : repo.getConfig(key); if (v === undefined) throw new GitError(''); return v; }
    store[key] = value;
    repo.trace.push({ kind: 'config', key, value, global: !!flags.global });
    return '';
  };

  /* ---------- 底层命令 ---------- */
  commands['cat-file'] = (ctx, args) => {
    const repo = ctx.repo;
    const { flags, positional } = parseArgs(args, { t: 'bool', p: 'bool', s: 'bool', e: 'bool' });
    if (!positional.length) throw new GitError('usage: git cat-file (-t | -s | -p) <object>');
    const h = repo.resolveRev(positional[0], { wantCommit: false });
    const o = repo.getObject(h);
    if (flags.t) return o.type;
    if (flags.s) return String(global.GitCore.byteLen(o.content));
    if (flags.e) return '';
    if (o.type === 'tree') return (o.entries || []).map(e => `${e.mode} ${e.type} ${e.hash}\t${e.name}`).join('\n');
    return o.content.replace(/\n$/, '');
  };
  commands['ls-files'] = (ctx, args) => { const { flags } = parseArgs(args, { s: 'bool', stage: 'bool', u: 'bool' }); const repo = ctx.repo; if (flags.s || flags.stage) return [...repo.index].sort().map(([p, h]) => `100644 ${h} 0\t${p}`).concat([...repo.conflicts].map(([p, c]) => [c.base && `100644 ${c.base} 1\t${p}`, c.ours && `100644 ${c.ours} 2\t${p}`, c.theirs && `100644 ${c.theirs} 3\t${p}`].filter(Boolean).join('\n'))).join('\n'); return unionKeys(repo.index, repo.conflicts).join('\n'); };
  commands['ls-tree'] = (ctx, args) => { const { flags, positional } = parseArgs(args, { r: 'bool', 'name-only': 'bool' }); const repo = ctx.repo; const h = repo.resolveRev(positional[0] || 'HEAD', { wantCommit: false }); const o = repo.getObject(h); const tree = o.type === 'commit' ? o.tree : o.type === 'tag' ? repo.getCommit(h).tree : h; if (flags.r) return [...repo.flattenTree(tree)].map(([p, bh]) => flags['name-only'] ? p : `100644 blob ${bh}\t${p}`).join('\n'); return (repo.getObject(tree).entries || []).map(e => flags['name-only'] ? e.name : `${e.mode} ${e.type} ${e.hash}\t${e.name}`).join('\n'); };
  commands['rev-parse'] = (ctx, args) => { const { flags, positional } = parseArgs(args, { short: 'bool', 'abbrev-ref': 'bool', 'show-toplevel': 'bool', 'git-dir': 'bool', verify: 'bool' }); const repo = ctx.repo; if (flags['show-toplevel']) return repo.path; if (flags['git-dir']) return '.git'; return positional.map(p => flags['abbrev-ref'] ? (p === 'HEAD' ? (repo.currentBranch() || 'HEAD') : p) : (flags.short ? abbrev(repo.resolveRev(p, { wantCommit: false })) : repo.resolveRev(p, { wantCommit: false }))).join('\n'); };
  commands['count-objects'] = (ctx, args) => { const repo = ctx.repo; const n = repo.objects.size; const size = [...repo.objects.values()].reduce((s, o) => s + global.GitCore.byteLen(o.content), 0); if (args.includes('-v')) return `count: ${n}\nsize: ${Math.ceil(size / 1024)}\nin-pack: 0\npacks: 0\nsize-pack: 0\nprune-packable: 0\ngarbage: 0\nsize-garbage: 0`; return `${n} objects, ${Math.ceil(size / 1024)} kilobytes`; };
  commands['merge-base'] = (ctx, args) => { const { positional } = parseArgs(args, { a: 'bool', 'is-ancestor': 'bool' }); const repo = ctx.repo; const a = repo.resolveRev(positional[0]), b = repo.resolveRev(positional[1]); return repo.mergeBase(a, b) || ''; };
  commands.fsck = (ctx, args) => { const repo = ctx.repo; const reach = repo.reachableCommits(); const dangling = repo.allCommits().filter(c => !reach.has(c.hash)); return dangling.map(c => `dangling commit ${c.hash}`).join('\n'); };
  commands.gc = (ctx, args) => { const repo = ctx.repo; const { flags } = parseArgs(args, { prune: 'value', aggressive: 'bool' }); if (flags.prune === 'now') { const reach = repo.reachableCommits(); const rl = new Set(); for (const log of repo.reflogs.values()) for (const e of log) { rl.add(e.new); if (e.old) rl.add(e.old); } let removed = 0; for (const c of repo.allCommits()) if (!reach.has(c.hash) && !rl.has(c.hash)) { repo.objects.delete(c.hash); removed++; } return `已清理 ${removed} 个不可达且不在 reflog 中的提交对象。`; } return ''; };
  commands.grep = (ctx, args) => { const { flags, positional } = parseArgs(args, { n: 'bool', i: 'bool', l: 'bool' }); const repo = ctx.repo; if (!positional.length) throw new GitError('usage: git grep <pattern> [<path>...]'); const re = new RegExp(positional[0], flags.i ? 'i' : ''); const paths = positional.slice(1).map(p => toRepoPath(ctx, p)); const out = []; for (const p of unionKeys(repo.index, repo.conflicts)) { if (paths.length && !paths.some(x => p === x || p.startsWith(x + '/'))) continue; const c = repo.workdir.get(p); if (c === undefined) continue; splitLines(c).forEach((l, i) => { if (re.test(l)) out.push(flags.l ? p : `${p}${flags.n ? ':' + (i + 1) : ''}:${l}`); }); } return [...new Set(out)].join('\n'); };
  commands.clean = (ctx, args) => {
    const repo = ctx.repo;
    const { flags, positional } = parseArgs(args, { f: 'bool', force: 'bool', d: 'bool', n: 'bool', 'dry-run': 'bool', x: 'bool', X: 'bool', i: 'bool', q: 'bool' });
    const dry = flags.n || flags['dry-run'];
    if (!flags.f && !flags.force && !dry) throw new GitError('fatal: clean.requireForce defaults to true and neither -i, -n, nor -f given; refusing to clean');
    const s = repo.statusData();
    let targets = flags.X ? s.ignored : flags.x ? s.untracked.concat(s.ignored) : s.untracked;
    if (!flags.d) targets = targets.filter(p => !p.includes('/'));
    if (positional.length) { const ps = positional.map(p => toRepoPath(ctx, p)); targets = targets.filter(t => ps.some(p => t === p || t.startsWith(p + '/'))); }
    const out = [];
    for (const p of targets) { out.push(`${dry ? 'Would remove' : 'Removing'} ${p}`); if (!dry) repo.workdir.delete(p); }
    return out.join('\n');
  };
  commands.version = () => 'git version 2.45.0 (gitgame sandbox)';
  commands['--version'] = commands.version;
  commands.help = (ctx, args) => {
    const lines = ['usage: git <command> [<args>]', '', '本沙盒支持的常用命令：', '', '  开始一个工作区', '    clone      克隆仓库到新目录', '    init       创建一个空的 git 仓库', '', '  处理当前的变更', '    add        添加文件到暂存区', '    mv         移动或重命名文件', '    restore    恢复工作区文件', '    rm         删除文件', '', '  查看历史与状态', '    status     显示工作区状态', '    log        显示提交日志', '    diff       显示差异', '    show       显示对象', '    blame      逐行显示最后修改者', '    bisect     二分查找引入 bug 的提交', '    reflog     引用日志（找回"丢失"的提交）', '', '  分支与合并', '    branch     列出/创建/删除分支', '    checkout   切换分支或恢复文件', '    switch     切换分支', '    merge      合并分支', '    rebase     变基', '    cherry-pick 摘取提交', '    revert     用新提交撤销旧提交', '    reset      重置 HEAD/暂存区/工作区', '    stash      暂存未提交的修改', '    tag        标签', '', '  协作', '    remote     管理远程仓库', '    fetch      拉取远程对象和引用', '    pull       fetch + merge/rebase', '    push       推送', '', '  底层（了解原理）', '    cat-file   查看对象内容 (-t / -p)', '    ls-files   查看暂存区', '    ls-tree    查看树对象', '    count-objects, rev-parse, fsck, gc', '', '输入 help 查看 shell 命令。'];
    return lines.join('\n');
  };

  function runGit(ctx, argv) {
    const repo = ctx.repo;
    if (!argv.length) return commands.help(ctx, []);
    const sub = argv[0];
    const cmd = commands[sub];
    if (!cmd) {
      const near = Object.keys(commands).filter(c => c.startsWith(sub[0]) && Math.abs(c.length - sub.length) <= 2);
      throw new GitError(`git: '${sub}' is not a git command. See 'git --help'.${near.length ? `\n\nThe most similar command${near.length > 1 ? 's are' : ' is'}\n${near.map(n => '\t' + n).join('\n')}` : ''}`);
    }
    if (repo.bare && !['log', 'branch', 'show', 'cat-file', 'ls-tree', 'rev-parse', 'count-objects', 'tag', 'config', 'help', 'version', '--version', 'reflog', 'fsck'].includes(sub)) throw new GitError(`fatal: this operation must be run in a work tree`);
    repo.trace = [];
    return cmd(ctx, argv.slice(1));
  }

  global.GitCmd = { runGit, commands, statusText, statusShort, commitHeaderText, commitResultText, transferObjects, fetchFrom, renderGraph, toRepoPath, normPath, aheadBehind };
})(typeof window !== 'undefined' ? window : globalThis);
