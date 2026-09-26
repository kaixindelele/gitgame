/* 原理对比：每个 git 命令 = 底层做了什么 + 用“复制文件夹”的原始备份法怎么做 + 差别在哪 */
(function (global) {
  'use strict';
  const { abbrev } = global.GitCore;
  const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  const A = {
    init: { git: '在当前目录创建隐藏的 <code>.git</code> 目录：一个空的<b>对象库</b>（objects）、一个<b>引用目录</b>（refs）和一个指向 <code>main</code> 分支的 <code>HEAD</code>。此时还没有任何提交。', folder: '<code>mkdir 备份/</code> —— 先建一个放备份的文件夹。', diff: '.git 就是那个“备份文件夹”，只不过它按内容哈希存储，而不是按文件名。' },
    config: { git: '把键值对写进 <code>.git/config</code>（或 <code>--global</code> 时写进 <code>~/.gitconfig</code>）。提交时会把 user.name / user.email 写进每个 commit 对象。', folder: '在每个备份文件夹里手写一张纸条：“这是谁改的”。', diff: 'git 把作者信息固化在提交里，永远可查（git log / git blame）。' },
    add: { git: '读取文件内容，算出 SHA-1，把内容存成 <b>blob 对象</b>（<code>.git/objects/xx/yyyy…</code>，相同内容只存一份），并在<b>暂存区（index）</b>里登记“路径 → blob 哈希”。此时还没有提交。', folder: '把要备份的文件先复制到一个“待打包”文件夹里。', diff: '暂存区让你可以<b>只挑一部分修改</b>进入下一次快照；而且内容一旦 add 就进了对象库，即使你之后改坏了工作区，add 过的版本也还能找回。' },
    commit: { git: '① 把暂存区打包成 <b>tree 对象</b>（目录快照）；② 创建 <b>commit 对象</b>：指向这棵 tree、指向父提交、记录作者/时间/说明；③ 把当前分支指针（<code>refs/heads/main</code>）前移到新提交；④ 在 reflog 里记一笔。', folder: '<code>cp -r project 备份/2026-01-05_v3/</code>，再在 notes.txt 里写一行“v3：修了登录 bug”。', diff: '<b>没变的文件不会被再复制一次</b>：新 tree 直接引用旧 blob。每个快照有唯一哈希（内容变一个字节哈希就变），并且记住了“上一个快照是谁”，所以历史是一条链而不是一堆散乱的文件夹。' },
    status: { git: '同时对比三棵树：<b>HEAD 提交的 tree</b> ↔ <b>暂存区</b>（得到“Changes to be committed”）、<b>暂存区</b> ↔ <b>工作区</b>（得到“Changes not staged”），工作区里暂存区没登记的就是 Untracked。', folder: '<code>diff -r project 备份/最新的那个/</code>，逐个文件看有没有变。', diff: '因为有哈希，git 对比时只比 40 位哈希，不用逐字节读文件；而且能区分“改了但还没决定要不要备份”（未暂存）和“决定了要备份”（已暂存）。' },
    diff: { git: '对两个版本的 blob 做逐行比较（最长公共子序列），输出统一 diff 格式：<code>-</code> 是删掉的行，<code>+</code> 是新增的行。不带参数比较工作区 ↔ 暂存区，<code>--staged</code> 比较暂存区 ↔ HEAD。', folder: '<code>diff 备份/v2/app.js 备份/v3/app.js</code>', diff: '一样的算法！只是 git 知道“该和哪个版本比”，不用你去翻文件夹。' },
    log: { git: '从 HEAD 指向的提交出发，顺着每个 commit 里的 <code>parent</code> 指针一路往回走，按时间排序输出。<code>--graph</code> 把多个父指针画成分叉。', folder: '<code>ls -t 备份/</code> 再打开 notes.txt 一条条看说明。', diff: '备份文件夹之间没有“谁是谁的上一版”的信息，分支/合并的关系完全靠人记；git 的历史是一张有向无环图。' },
    show: { git: '找到对象，按类型打印：commit 打印元信息 + 与父提交的 diff；<code>rev:path</code> 形式则直接读出那个版本里的文件内容。', folder: '打开某个备份文件夹看看里面的文件。', diff: '不用解压/复制，直接从对象库读。' },
    branch: { git: '<b>分支只是一个 41 字节的文件</b>：<code>.git/refs/heads/&lt;名字&gt;</code>，内容是一个提交哈希。创建分支 = 写这个文件，删除分支 = 删这个文件。提交内容一个字节都不复制。', folder: '<code>cp -r project project_新功能/</code> —— 整个项目复制一份，在副本里改。', diff: '文件夹方案分支越多磁盘越炸，而且两份文件夹之后很难合回去；git 的分支创建/切换是 O(1) 的，“便宜到可以随便开”。' },
    checkout: { git: '① 把 HEAD 改成指向目标分支（或直接指向某个提交 = detached HEAD）；② 把工作区和暂存区里<b>在两个提交之间有差异的文件</b>替换成目标版本（没差异的文件和你未提交的修改保持不动；会被覆盖的修改则拒绝切换）。', folder: '<code>cd ../project_新功能/</code>，在不同的文件夹之间跳来跳去。', diff: 'git 让所有分支共用同一个工作目录，切换时只改动“有差异”的文件；代价是切换前要处理好未提交的修改（提交或 stash）。' },
    switch: 'checkout', restore: { git: '<code>git restore 文件</code>：用暂存区里的 blob 覆盖工作区文件；<code>--staged</code>：用 HEAD 里的版本覆盖暂存区登记（工作区不动）。', folder: '<code>cp 备份/最新/app.js project/app.js</code> 把备份里的版本抄回来。', diff: '本质相同，只是 git 精确知道“最近一次登记的版本”在哪。注意：<b>未 add 过的修改被 restore 后无法找回</b>，因为它从未进过对象库。' },
    merge: { git: '① 找两条分支的<b>共同祖先</b>（merge base）；② 若当前分支就是祖先 → <b>快进</b>（只把指针挪过去）；③ 否则对每个文件做<b>三方比较</b>（祖先/我方/对方）：只有一方改过的直接采用，两方都改了不同区域的自动拼接，改了同一区域的标记为冲突；④ 生成一个有<b>两个父提交</b>的合并提交。', folder: '把两个人各自的文件夹摆在一起，逐个文件肉眼比较，把对方改的地方手抄过来。没有“祖先版本”作参照，根本分不清“是他改了还是我改了”。', diff: '三方合并的关键是<b>知道共同起点</b>。有了它，绝大多数合并可以自动完成，只有真正“同一处各改各的”才需要人来决定。' },
    rebase: { git: '① 找到当前分支相对目标分支的“独有提交”；② 把 HEAD 移到目标分支顶端；③ 把独有提交<b>逐个重放</b>（等价于依次 cherry-pick），每次生成<b>新的提交</b>（哈希会变，因为父提交变了）；④ 最后把分支指针指向新的顶端。', folder: '从对方最新的文件夹重新复制一份，然后把自己改过的地方一处一处手工再抄一遍。', diff: '结果是<b>一条直线的历史</b>，没有合并提交。代价：历史被改写，所以<b>已经推送给别人的提交不要 rebase</b>。' },
    'cherry-pick': { git: '取出目标提交与其父提交的差异（一个补丁），三方合并到当前 HEAD 上，生成一个内容相同但哈希不同的新提交。', folder: '从别人的文件夹里，只把某一次修改涉及的几行手抄到自己的文件里。', diff: 'git 知道“那一次修改”具体动了哪些行，而文件夹备份只有整体文件，看不出单次改动。' },
    revert: { git: '把目标提交的差异<b>反过来</b>应用（相当于打一个反向补丁），生成一个新提交。原提交仍在历史里。', folder: '把那次改动的行手工改回去，再备份一份新的。', diff: '因为历史没有被改写，<b>已经推送的提交也可以安全地 revert</b>；这是撤销“公共历史”的正确方式。' },
    reset: { git: '<code>--soft</code>：只移动分支指针；<code>--mixed</code>（默认）：再把暂存区重置成目标提交的 tree；<code>--hard</code>：连工作区也覆盖。被“甩掉”的提交并不会被删除，仍在对象库里，reflog 记得它们。', folder: '把 notes.txt 的最后几行划掉，假装那几次备份不存在（--hard 相当于顺手把文件夹也删了）。', diff: 'reset 移动的是指针，对象还在，30 天内通过 reflog 都能找回。真删文件夹就真没了。' },
    stash: { git: '把当前暂存区和工作区分别打包成两个临时提交，挂在 <code>refs/stash</code> 上，然后把工作区恢复成 HEAD 的样子。<code>pop</code> 时做一次三方合并把改动放回来。', folder: '把改了一半的文件复制到“临时”文件夹，再把项目还原成备份的样子；回头再抄回来。', diff: '本质就是一次临时快照，stash 就是提交，只是不挂在任何分支上。' },
    tag: { git: '在 <code>refs/tags/</code> 下写一个指向提交的引用（轻量标签），<code>-a</code> 时再多创建一个带说明/签名者的 tag 对象。标签不会随提交移动。', folder: '把某个备份文件夹改名成 <code>release_v1.0</code>。', diff: '标签是给某个快照起的“永久名字”，分支则是会随提交移动的“指针”。' },
    reflog: { git: 'HEAD 和每个分支每次移动都会追加一行到 <code>.git/logs/</code> 里。reflog 就是打印这份日志，所以“不小心 reset 掉/删掉分支”的提交都能顺着它找回。', folder: '回收站——但回收站只对“删除”有效，对“改坏了”无能为力。', diff: 'reflog 是本地的安全网（默认保留 90 天），不会被推送到远程。' },
    rm: { git: '从暂存区删除登记（<code>--cached</code> 时保留工作区文件），这样下一次提交的 tree 就不再包含它。历史提交里文件仍然存在。', folder: '从项目文件夹删掉文件，旧备份里当然还在。', diff: 'git 的删除也是一次可追溯的变更；用 <code>git checkout &lt;旧提交&gt; -- 文件</code> 随时拿回来。' },
    mv: { git: '暂存区里把旧路径的登记换成新路径（blob 不变），工作区改名。git 是通过内容相同推断出“这是重命名”的。', folder: '改文件名，然后备份时又整个复制一份。', diff: '内容没变就不会重复存储，重命名的成本是零。' },
    blame: { git: '对文件逐行倒着追溯：从 HEAD 开始比较每个提交与其父提交，某一行第一次出现的那个提交就是它的“作者”。', folder: '打开一个个备份文件夹逐行对比，直到找到这一行第一次出现的那份。', diff: 'git 有了 diff 和父链，这个过程可以自动完成。' },
    bisect: { git: '在“已知好”和“已知坏”之间的提交里<b>二分查找</b>：每次检出中间的提交让你测试，根据 good/bad 缩小范围，log2(N) 次就能定位引入 bug 的提交。', folder: '把几十个备份文件夹一个个拷回去跑测试。', diff: '因为提交是有序的链，git 可以二分；100 个提交只要 7 次测试。' },
    remote: { git: '在 <code>.git/config</code> 里记一条 <code>[remote "origin"] url = …</code>，仅仅是个地址别名。', folder: '记下服务器地址：“备份放在 192.168.1.5:/backups/”。', diff: '远程仓库就是另一台机器上的 .git，结构完全一样（裸仓库连工作区都没有）。' },
    clone: { git: '创建一个新的 .git，把远程的<b>全部对象</b>和分支复制过来（分支存成 <code>refs/remotes/origin/*</code>），创建本地 <code>main</code> 跟踪 <code>origin/main</code>，然后检出工作区。', folder: '<code>scp -r 服务器:/backups/project ./</code> 把整个备份文件夹拖下来。', diff: 'clone 之后你拥有<b>完整历史</b>，不联网也能查看每个版本、提交、开分支，这就是“分布式”的含义。' },
    fetch: { git: '和远程比较引用，把本地没有的对象下载下来，只更新 <code>refs/remotes/origin/*</code>（远程跟踪分支）。你自己的分支和工作区<b>纹丝不动</b>。', folder: '把服务器上的最新备份文件夹下载到本地，但先不动自己的项目。', diff: 'fetch 是安全的“先看看别人做了什么”，之后再决定 merge 还是 rebase。' },
    pull: { git: '= <code>git fetch</code> + <code>git merge origin/main</code>（或 <code>--rebase</code> 时 + <code>git rebase origin/main</code>）。历史分叉时 git 会要求你明确选择合并策略。', folder: '下载别人的文件夹，然后人肉把差异合进自己的。', diff: '合并逻辑和本地分支合并完全一样，远程并不特殊。' },
    push: { git: '把本地分支指向的提交及其对象上传，然后请求远程把 <code>refs/heads/main</code> 挪到新提交。远程<b>只接受快进</b>（新提交必须包含远程当前的提交），否则拒绝——这是防止你覆盖别人工作的保护机制。', folder: '把自己的文件夹上传覆盖服务器上的。两个人同时传，后传的直接把先传的覆盖掉，没人知道。', diff: '“非快进即拒绝”让并发协作变得安全；<code>--force</code> 就是关掉这个保护。' },
    'cat-file': { git: '直接读对象库：<code>-t</code> 看类型（blob/tree/commit/tag），<code>-p</code> 打印内容。这就是 git 的全部“数据库”。', folder: '打开备份文件夹看文件。', diff: '看到 tree 里一行行的“模式 类型 哈希 文件名”，就理解了快照是怎么组成的。' },
    'ls-files': { git: '打印暂存区（index）里登记的所有路径（<code>-s</code> 连哈希一起）。', folder: '看“待打包”文件夹里有什么。', diff: '' },
    clean: { git: '删除工作区中未跟踪（且未被 .gitignore 忽略）的文件。因为它们从未进过对象库，<b>删了就真没了</b>。', folder: '手动删掉编译产物之类的杂物。', diff: '' },
    gc: { git: '清理不可达且不在 reflog 里的对象，把松散对象打包压缩。', folder: '清空回收站。', diff: '' },
    fsck: { git: '检查对象库完整性，列出“悬空”（没有任何引用指向）的提交。', folder: '找出没记在 notes.txt 里的备份文件夹。', diff: '' },
  };

  function explain(argv, trace, repo) {
    if (!argv || argv[0] !== 'git') return null;
    let sub = argv[1];
    if (!sub) return null;
    let a = A[sub];
    if (typeof a === 'string') a = A[a];
    if (!a) return { title: 'git ' + sub, git: '（这个命令暂无原理说明）', folder: '', diff: '', trace: traceHtml(trace, repo) };
    return { title: argv.slice(0, 2).join(' '), git: a.git, folder: a.folder, diff: a.diff, trace: traceHtml(trace, repo) };
  }

  function traceHtml(trace, repo) {
    if (!trace || !trace.length) return '';
    const items = [];
    const objs = trace.filter(t => t.kind === 'object');
    const counts = {};
    for (const o of objs) counts[o.type] = (counts[o.type] || 0) + 1;
    if (objs.length) items.push(`新建对象：${Object.entries(counts).map(([t, n]) => `<b>${n}</b> 个 ${t}`).join('，')}` + `<div class="trace-objs">${objs.slice(0, 8).map(o => `<span class="obj obj-${o.type}" title="${o.hash}">${o.type} ${abbrev(o.hash)}</span>`).join(' ')}${objs.length > 8 ? ' …' : ''}</div>`);
    for (const t of trace) {
      if (t.kind === 'ref') {
        const name = t.ref.replace('refs/heads/', '分支 ').replace('refs/tags/', '标签 ').replace('refs/remotes/', '远程跟踪分支 ');
        if (t.renamedFrom) items.push(`引用重命名：${esc(t.renamedFrom)} → ${esc(t.ref.replace('refs/heads/', ''))}`);
        else if (!t.new) items.push(`删除引用 <b>${esc(name)}</b>（原指向 ${abbrev(t.old)}）`);
        else if (!t.old) items.push(`创建引用 <b>${esc(name)}</b> → ${abbrev(t.new)}`);
        else items.push(`移动引用 <b>${esc(name)}</b>：${abbrev(t.old)} → ${abbrev(t.new)}`);
      } else if (t.kind === 'head') items.push(t.detached ? `HEAD 直接指向提交 ${abbrev(t.to)}（detached）` : `HEAD → refs/heads/${esc(t.to)}`);
      else if (t.kind === 'index' && t.paths && t.paths.length) items.push(`暂存区更新：${t.paths.slice(0, 6).map(esc).join(', ')}${t.paths.length > 6 ? ' …' : ''}`);
      else if (t.kind === 'init') items.push(`创建 ${t.bare ? '裸仓库' : '.git 目录'}：objects/、refs/heads/、HEAD → refs/heads/main`);
      else if (t.kind === 'clone') items.push(`从 ${esc(t.url)} 复制了 ${t.objects || 0} 个对象，创建 refs/remotes/origin/*`);
      else if (t.kind === 'config') items.push(`写入配置 ${esc(t.key)} = ${esc(t.value)}${t.global ? '（全局 ~/.gitconfig）' : '（.git/config）'}`);
      else if (t.kind === 'stash') items.push(`创建 stash 提交 ${abbrev(t.hash)}，挂到 refs/stash`);
    }
    if (!items.length) return '';
    return `<ul class="trace">${items.map(i => `<li>${i}</li>`).join('')}</ul>`;
  }

  // 快照文件夹视图：把每个提交画成“一个备份文件夹”，标出哪些文件是共享的（没有重复存储）
  function snapshotsHtml(repo, limit = 8) {
    const head = repo.headHash();
    if (!head) return '<p class="muted">还没有提交。提交之后，这里会把每个提交画成一个“备份文件夹”。</p>';
    const list = repo.revList([head]).slice(0, limit);
    let fullCopyBytes = 0; const blobs = new Set();
    const all = repo.revList([...repo.refs.values()].map(h => repo.peel(h)).concat([head]));
    for (const h of all) { const t = repo.treeOfCommit(h); for (const [, bh] of t) { fullCopyBytes += global.GitCore.byteLen(repo.blobContent(bh)); blobs.add(bh); } }
    let uniqueBytes = 0; for (const b of blobs) uniqueBytes += global.GitCore.byteLen(repo.blobContent(b));
    const cards = list.map((h, i) => {
      const c = repo.getCommit(h);
      const t = repo.treeOfCommit(h);
      const pt = repo.treeOfCommit(c.parents[0] || null);
      const files = [...t].sort().map(([p, bh]) => {
        const same = pt.get(bh === undefined ? '' : p) === bh;
        return `<li class="${same ? 'shared' : 'changed'}"><span class="fname">${esc(p)}</span><span class="fhash">${abbrev(bh)}</span>${same ? '<span class="tag-shared">共享</span>' : '<span class="tag-new">新 blob</span>'}</li>`;
      }).join('');
      const deleted = [...pt.keys()].filter(p => !t.has(p)).map(p => `<li class="deleted"><span class="fname">${esc(p)}</span><span class="tag-del">已删</span></li>`).join('');
      return `<div class="snap"><div class="snap-title">📁 快照 ${abbrev(h)}${repo.decoStr(h) ? '<span class="deco">' + esc(repo.decoStr(h)) + '</span>' : ''}</div><div class="snap-msg">${esc(c.message.split('\n')[0])}</div><ul>${files}${deleted}</ul></div>`;
    }).join('');
    const human = n => n < 1024 ? n + ' B' : (n / 1024).toFixed(1) + ' KB';
    return `<div class="size-compare"><div><span>若每次提交都整个复制文件夹：</span><b>${human(fullCopyBytes)}</b></div><div><span>git 对象库实际存储的文件内容：</span><b>${human(uniqueBytes)}</b></div><div class="muted">共 ${all.length} 个提交，${blobs.size} 个不同的 blob。相同内容的文件只存一份，这就是“共享”的意思。</div></div><div class="snaps">${cards}</div>`;
  }

  global.GitAnalogy = { explain, snapshotsHtml, traceHtml, table: A };
})(typeof window !== 'undefined' ? window : globalThis);
