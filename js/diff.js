/* 行级 diff、unified diff 输出、三方合并（diff3 算法） */
(function (global) {
  function splitLines(text) {
    if (text === '' || text == null) return [];
    const lines = text.split('\n');
    if (lines[lines.length - 1] === '') lines.pop();
    return lines;
  }

  // LCS 匹配：返回 match[i] = j 或 -1
  function lcsMatch(a, b) {
    const n = a.length, m = b.length;
    const match = new Array(n).fill(-1);
    if (n === 0 || m === 0) return match;
    // 去掉公共前缀/后缀，加速
    let pre = 0;
    while (pre < n && pre < m && a[pre] === b[pre]) { match[pre] = pre; pre++; }
    let suf = 0;
    while (suf < n - pre && suf < m - pre && a[n - 1 - suf] === b[m - 1 - suf]) { match[n - 1 - suf] = m - 1 - suf; suf++; }
    const a2 = a.slice(pre, n - suf), b2 = b.slice(pre, m - suf);
    const n2 = a2.length, m2 = b2.length;
    if (n2 === 0 || m2 === 0) return match;
    const dp = [];
    for (let i = 0; i <= n2; i++) dp.push(new Uint16Array(m2 + 1));
    for (let i = n2 - 1; i >= 0; i--) {
      for (let j = m2 - 1; j >= 0; j--) {
        dp[i][j] = a2[i] === b2[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }
    let i = 0, j = 0;
    while (i < n2 && j < m2) {
      if (a2[i] === b2[j]) { match[pre + i] = pre + j; i++; j++; }
      else if (dp[i + 1][j] >= dp[i][j + 1]) i++;
      else j++;
    }
    return match;
  }

  // 返回操作序列 [{type:'equal'|'del'|'add', line, aIdx, bIdx}]
  function diffLines(aText, bText) {
    const a = splitLines(aText), b = splitLines(bText);
    const match = lcsMatch(a, b);
    const ops = [];
    let j = 0;
    for (let i = 0; i < a.length; i++) {
      if (match[i] === -1) { ops.push({ type: 'del', line: a[i], aIdx: i }); continue; }
      while (j < match[i]) { ops.push({ type: 'add', line: b[j], bIdx: j }); j++; }
      ops.push({ type: 'equal', line: a[i], aIdx: i, bIdx: j }); j++;
    }
    while (j < b.length) { ops.push({ type: 'add', line: b[j], bIdx: j }); j++; }
    return ops;
  }

  function diffStats(aText, bText) {
    const ops = diffLines(aText, bText);
    let ins = 0, del = 0;
    for (const o of ops) { if (o.type === 'add') ins++; else if (o.type === 'del') del++; }
    return { ins, del };
  }

  // unified diff 主体（不含 diff --git 头）
  function unifiedHunks(aText, bText, context = 3) {
    const ops = diffLines(aText, bText);
    if (!ops.some(o => o.type !== 'equal')) return '';
    const out = [];
    let i = 0;
    while (i < ops.length) {
      if (ops[i].type === 'equal') { i++; continue; }
      let start = Math.max(0, i - context);
      let end = i;
      let lastChange = i;
      while (end < ops.length) {
        if (ops[end].type !== 'equal') { lastChange = end; end++; continue; }
        if (end - lastChange > context * 2) break;
        end++;
      }
      end = Math.min(ops.length, lastChange + context + 1);
      let aStart = null, bStart = null, aCount = 0, bCount = 0;
      for (let k = start; k < end; k++) {
        const o = ops[k];
        if (o.type !== 'add') { if (aStart === null) aStart = o.aIdx; aCount++; }
        if (o.type !== 'del') { if (bStart === null) bStart = o.bIdx; bCount++; }
      }
      if (aStart === null) aStart = (ops[start].bIdx !== undefined ? ops[start].bIdx : 0);
      if (bStart === null) bStart = (ops[start].aIdx !== undefined ? ops[start].aIdx : 0);
      const aS = aCount === 0 ? aStart : aStart + 1;
      const bS = bCount === 0 ? bStart : bStart + 1;
      out.push(`@@ -${aS}${aCount === 1 ? '' : ',' + aCount} +${bS}${bCount === 1 ? '' : ',' + bCount} @@`);
      for (let k = start; k < end; k++) {
        const o = ops[k];
        out.push((o.type === 'equal' ? ' ' : o.type === 'add' ? '+' : '-') + o.line);
      }
      i = end;
    }
    return out.join('\n') + '\n';
  }

  // diff3 三方合并
  function merge3(baseText, oursText, theirsText, labels) {
    labels = labels || { ours: 'HEAD', theirs: 'theirs' };
    const base = splitLines(baseText), ours = splitLines(oursText), theirs = splitLines(theirsText);
    const mo = lcsMatch(base, ours), mt = lcsMatch(base, theirs);
    const out = [];
    let conflicts = 0;
    let bi = 0, oi = 0, ti = 0; // 已处理到的位置
    const n = base.length;
    const eq = (x, y) => x.length === y.length && x.every((v, i) => v === y[i]);
    function emitChunk(bs, be, os, oe, ts, te) {
      const b = base.slice(bs, be), o = ours.slice(os, oe), t = theirs.slice(ts, te);
      if (eq(o, t)) { out.push(...o); return; }
      if (eq(b, o)) { out.push(...t); return; }
      if (eq(b, t)) { out.push(...o); return; }
      if (labels.favor === 'ours') { out.push(...o); return; }
      if (labels.favor === 'theirs') { out.push(...t); return; }
      conflicts++;
      out.push(`<<<<<<< ${labels.ours}`);
      out.push(...o);
      out.push('=======');
      out.push(...t);
      out.push(`>>>>>>> ${labels.theirs}`);
    }
    let i = 0;
    while (i <= n) {
      // 找下一个稳定行（在两侧都匹配的 base 行）
      let s = i;
      while (s < n && !(mo[s] >= 0 && mt[s] >= 0)) s++;
      const oEnd = s < n ? mo[s] : ours.length;
      const tEnd = s < n ? mt[s] : theirs.length;
      if (s > bi || oEnd > oi || tEnd > ti) emitChunk(bi, s, oi, oEnd, ti, tEnd);
      if (s >= n) break;
      out.push(base[s]);
      bi = s + 1; oi = mo[s] + 1; ti = mt[s] + 1;
      i = s + 1;
    }
    const text = out.length ? out.join('\n') + '\n' : '';
    return { text, conflicts };
  }

  global.GitDiff = { splitLines, diffLines, diffStats, unifiedHunks, merge3, lcsMatch };
})(typeof window !== 'undefined' ? window : globalThis);
