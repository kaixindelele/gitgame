/* 教学叙事：以“问题”驱动的学习旅程（见 docs/DESIGN.md §5）
 * 关卡的玩法和判定在 js/levels.js，本文件只负责“讲故事”：问题 → 原始做法 → git 做法 → 会经历的事 → 每步为什么 → 总结。
 * 两者通过关卡 id 关联；旅程顺序以 stages[].levels 为准。
 * tasks[i] 与 levels.js 中同一关的 tasks[i] 一一对应；focus 取值：terminal | graph | trees | analogy | multi | editor。
 * 所有文本用 T('中文', 'English') 包装（语言在加载时确定）。 */
(function (global) {
  'use strict';
  const T = global.T || ((zh, en) => zh);

  const FOCUS = ['terminal', 'graph', 'trees', 'analogy', 'multi', 'editor'];

  /* ---------- 旅程：9 个阶段 ---------- */
  const stages = [
    {
      id: 'prologue', icon: '📁',
      title: T('序章：没有 git 的日子', 'Prologue: life without git'),
      question: T('我想给项目“存档”，怎么做？', 'I want to save versions of my project. How?'),
      crude: T('复制整个文件夹，改名 project_v1、最终版2、真的最终版……', 'Copy the whole folder and rename it: project_v1, final2, REALLY_final…'),
      git: T('先不用 git，亲手体验一遍痛点', 'No git yet: feel the pain first-hand'),
      commands: ['cp -r', 'diff -r', 'grep -r', 'du -sh', 'rm -r'],
      expect: [
        T('备份越来越多，很快就分不清哪个是最新版', 'The backups pile up and you soon lose track of which is newest'),
        T('每个备份都是完整一份，磁盘占用成倍增长', 'Every backup is a full copy, so disk usage multiplies'),
      ],
      difficulty: 1,
      levels: ['c0-1', 'c0-2'],
    },
    {
      id: 'save', icon: '💾',
      title: T('第 1 站：存档与记录', 'Stage 1: Save points and history'),
      question: T('想回到昨天的版本；想知道改了什么、为什么改', 'I want to get back to yesterday\'s version, and know what changed and why'),
      crude: T('每次整目录复制一份，改了什么全靠记忆和 notes.txt', 'Copy the whole folder every time and rely on memory and a notes.txt'),
      git: T('每次提交都是一个带说明、带作者、带时间的快照，历史一目了然', 'Each commit is a snapshot with a message, an author and a time, so history is always visible'),
      commands: ['git init', 'git config', 'git add', 'git commit', 'git status', 'git diff', 'git log', '.gitignore', 'git cat-file'],
      expect: [
        T('忘了 add 就提交，git 会提示“nothing added to commit”——没关系，add 之后再提交即可', 'Commit without add and git says "nothing added to commit". That\'s fine: add, then commit'),
        T('暂存区一开始有点抽象，看“三棵树”面板就明白了', 'The staging area feels abstract at first; the Three Trees panel makes it click'),
      ],
      difficulty: 1,
      levels: ['c1-1', 'c1-2', 'c1-3', 'c1-5', 'c1-4'],
    },
    {
      id: 'undo', icon: '⏪',
      title: T('第 2 站：后悔药', 'Stage 2: Undo'),
      question: T('改坏了、存错了、发出去的版本有 bug、删过头了，怎么办？', 'I broke something, committed the wrong thing, shipped a bug or deleted too much. Now what?'),
      crude: T('从备份里翻、手工一行行改回去，没备份就只能认命', 'Dig through backups and fix it line by line; with no backup you\'re out of luck'),
      git: T('按“撤销到哪一层”选工具：restore、amend、reset、revert，最后还有 reflog 兜底', 'Pick a tool by how far to undo: restore, amend, reset, revert, with reflog as the safety net'),
      commands: ['git restore', 'git restore --staged', 'git commit --amend', 'git reset --soft/--hard', 'git revert', 'git reflog'],
      expect: [
        T('reset --hard 之后提交会从 log 里“消失”，别慌，reflog 能找回来', 'After reset --hard, commits "vanish" from the log. Don\'t panic: reflog brings them back'),
        T('已经推送的提交用 revert，而不是 reset', 'Use revert, not reset, for commits you have already pushed'),
      ],
      difficulty: 2,
      levels: ['c2-1', 'c2-2', 'c2-3', 'c2-4', 'c2-5', 'c2-6'],
    },
    {
      id: 'parallel', icon: '🌿',
      title: T('第 3 站：同时做几件事', 'Stage 3: Several things at once'),
      question: T('新功能做到一半，线上要紧急修 bug；想做个试验又不想弄乱主线', 'Halfway through a feature, production needs a hotfix; you want to experiment without messing up main'),
      crude: T('再复制一份项目去改，改完再手工把文件拷回来', 'Copy the project again, work there, then copy files back by hand'),
      git: T('分支只是一个指针，开一个几乎零成本；stash、merge、cherry-pick、rebase 负责搬运改动', 'A branch is just a pointer and costs almost nothing; stash, merge, cherry-pick and rebase move work around'),
      commands: ['git switch -c', 'git stash', 'git merge', 'git cherry-pick', 'git rebase', 'git checkout <commit>', 'git tag'],
      expect: [
        T('有未提交的改动时切分支可能被拒绝，git 在保护你的半成品', 'Switching branches with uncommitted changes may be refused: git is protecting your work in progress'),
        T('会看到 detached HEAD 警告，它只是提醒，不是错误', 'You\'ll see a detached HEAD warning. It\'s a reminder, not an error'),
      ],
      difficulty: 3,
      levels: ['c3-1', 'c3-7', 'c3-2', 'c3-3', 'c3-6', 'c3-5', 'c3-4', 'c3-8'],
    },
    {
      id: 'conflict', icon: '⚔️',
      title: T('第 4 站：改了同一处', 'Stage 4: Same line, two edits'),
      question: T('两个人（或两条分支）改了同一行，听谁的？', 'Two people (or two branches) changed the same line. Whose wins?'),
      crude: T('把两份文件并排打开肉眼对比，搞不清谁改了什么，最后一个保存的人说了算', 'Open both files side by side and compare by eye; whoever saves last silently wins'),
      git: T('git 自动合并不相干的改动，真正冲突的地方用标记圈出来，由你来决定', 'git merges unrelated changes automatically and marks the real clashes for you to decide'),
      commands: ['git merge', 'git merge --abort', 'git checkout --ours/--theirs', 'git rebase --continue', 'git rm', 'git add', 'git commit'],
      expect: [
        T('会看到 CONFLICT 和一堆 <<<<<<< ======= >>>>>>> 标记，其实只是两段文字让你挑', 'You\'ll see CONFLICT and <<<<<<< ======= >>>>>>> markers. They are just two pieces of text to choose from'),
        T('解决不了也没关系，--abort 一键回到合并之前', 'If you get stuck, --abort takes you straight back to before the merge'),
      ],
      difficulty: 3,
      levels: ['c4-1', 'c4-2', 'c4-3', 'c4-4'],
    },
    {
      id: 'remote', icon: '🌐',
      title: T('第 5 站：多台电脑异步协作', 'Stage 5: Working together, asynchronously'),
      question: T('大家怎么拿到同一份代码？版本不一致怎么办？后上传的会不会覆盖先上传的？', 'How does everyone get the same code? What if versions drift apart? Does the last upload overwrite the first?'),
      crude: T('网盘、微信传“最新版.zip”，在群里问谁有最新的，被覆盖了也没人知道', 'Pass "latest.zip" around by cloud drive or chat, ask the group who has the newest, and nobody notices when work gets overwritten'),
      git: T('每个人都有完整历史；push/fetch/pull 同步，服务器拒绝会覆盖别人工作的推送', 'Everyone has the full history; push/fetch/pull keep in sync, and the server refuses pushes that would overwrite others'),
      commands: ['git clone', 'git push', 'git fetch', 'git pull', 'git pull --rebase', 'git push -u', 'git push --force-with-lease'],
      expect: [
        T('push 被拒绝（rejected）是常态：git 在保护同事的提交，先拉再推就好', 'A rejected push is normal: git is protecting your teammate\'s commits. Pull first, then push'),
        T('会看到 ahead / behind / diverged，这三个词就是“版本不一致”的精确描述', 'You\'ll see ahead / behind / diverged: precise words for "our versions don\'t match"'),
        T('协作中的冲突和本地冲突处理方式完全一样', 'Conflicts with teammates are resolved exactly like local ones'),
      ],
      difficulty: 5,
      levels: ['c5-1', 'c5-2', 'c5-3', 'c5-4', 'c5-5', 'c5-6', 'c5-7'],
    },
    {
      id: 'rescue', icon: '🚑',
      title: T('第 6 站：出事故了', 'Stage 6: Disaster recovery'),
      question: T('删了文件、删了分支、远程被强推覆盖、清理过头，还有救吗？', 'Deleted a file or a branch, the remote got force-pushed, cleaned up too much: can it be saved?'),
      crude: T('没有备份就真没了，有备份也得一个个翻', 'No backup means it\'s gone; even with backups you dig through them one by one'),
      git: T('提交过的东西几乎都找得回来：历史、reflog、每个人本地的完整副本都是备份', 'Anything ever committed is almost always recoverable: history, reflog and every local clone are backups'),
      commands: ['git checkout <commit> -- <file>', 'git show <rev>:<file>', 'git reflog', 'git branch <name> <hash>', 'git push', 'git clean -n/-fd'],
      expect: [
        T('大多数“事故”几条命令就能修好', 'Most "disasters" are fixed with a few commands'),
        T('但从未 add 过的文件，git 真的救不回来——所以 clean 之前先 -n 预览', 'But files never added really can\'t be recovered, so preview with -n before clean'),
      ],
      difficulty: 4,
      levels: ['c6-1', 'c6-2', 'c2-7', 'c6-3', 'c6-4'],
    },
    {
      id: 'debug', icon: '🔍',
      title: T('第 7 站：追查 bug', 'Stage 7: Tracking down bugs'),
      question: T('这行是谁改的？这段代码什么时候没的？从哪个版本开始坏的？', 'Who changed this line? When did this code disappear? Which version broke it?'),
      crude: T('把一个个备份打开对比，或在群里挨个问“是不是你改的”', 'Open backup after backup to compare, or ask everyone in the chat "was it you?"'),
      git: T('历史就是可查询的数据库：blame、log -S、版本范围、bisect 二分查找', 'History is a searchable database: blame, log -S, version ranges and bisect'),
      commands: ['git blame', 'git show', 'git log -S', 'git log A..B', 'git diff --stat', 'git bisect'],
      expect: [
        T('bisect 时标反 good/bad 会找错提交，不确定就 git bisect reset 重来', 'Mixing up good/bad in bisect finds the wrong commit; if unsure, git bisect reset and start over'),
        T('找到肇事提交后用 revert 撤销，历史依然完整', 'Once found, revert the culprit and the history stays intact'),
      ],
      difficulty: 4,
      levels: ['c7-1', 'c7-2', 'c7-4', 'c7-3'],
    },
    {
      id: 'finale', icon: '🏖️',
      title: T('终章：自由沙盒', 'Finale: free sandbox'),
      question: T('学会了，想随便折腾一下？', 'Learned it all? Want to play freely?'),
      crude: T('——', '—'),
      git: T('你 + 服务器 + 小明 + 小红，想试什么就试什么', 'You + a server + Xiaoming + Xiaohong: try anything you like'),
      commands: ['git *'],
      expect: [
        T('搞坏了随时“重置本关”，没有任何代价', 'Break something? Hit "Reset level" at any time, no cost at all'),
      ],
      difficulty: 3,
      levels: ['sandbox'],
    },
  ];

  /* ---------- 每一关的叙事 ---------- */
  const levels = {};
  const step = (icon, zh, en) => ({ icon, text: T(zh, en) });
  const task = (focus, zh, en) => ({ focus, why: T(zh, en) });

  /* ===== 序章 ===== */
  levels['c0-1'] = {
    problem: {
      title: T('给项目存个档', 'Save a copy of your project'),
      story: T('你在 ~/project 里写了一个小程序，马上要加新功能，又怕改坏了回不去。还没听说过 git 的你，决定用最朴素的办法：把整个文件夹复制一份。',
        'You\'ve written a small program in ~/project and are about to add a feature, but you\'re scared of breaking it. Never having heard of git, you go for the simplest trick: copy the whole folder.'),
    },
    crude: {
      steps: [
        step('📁', '先整个复制一份：cp -r project project_v1', 'Copy everything first: cp -r project project_v1'),
        step('✏️', '在 project/app.js 里加新功能', 'Add the new feature to project/app.js'),
        step('📁', '改完再复制一份 project_v2', 'Copy it again afterwards as project_v2'),
        step('🔍', '想知道改了什么，只能自己 diff -r 两个文件夹', 'To see what changed, run diff -r on two folders yourself'),
      ],
      pain: T('每存一次就多一整份拷贝；改了什么、为什么改，只能靠文件夹名和记忆', 'Every save is a full copy; what changed and why lives only in folder names and your memory'),
    },
    git: {
      idea: T('本关先不用 git。之后你会看到：git 只存变化过的内容，每次存档都自带说明、时间和先后关系', 'No git in this level. Later you\'ll see git store only what changed, with a message, a time and an order for every save'),
      commands: ['cp -r', 'echo >>', 'diff -r', 'du -sh'],
    },
    expect: [
      T('本关不用 git——就是要你亲手感受“复制文件夹”有多笨', 'No git here: the point is to feel how clumsy "copy the folder" really is'),
      T('du -sh 会显示每个备份都占了一整份空间', 'du -sh will show every backup taking up a full copy\'s worth of space'),
    ],
    tasks: [
      task('terminal', '改动之前，先给当前状态留一份完整备份', 'Before changing anything, keep a full backup of the current state'),
      task('terminal', '模拟一次日常修改', 'Make an everyday change'),
      task('terminal', '改完再存一份，这就是“版本 2”', 'Save another copy: that\'s "version 2"'),
      task('terminal', '想知道两个版本差在哪，只能自己动手比', 'To see how two versions differ, you have to compare them yourself'),
      task('terminal', '看看每多一个备份，磁盘就多出一整份', 'See how each backup adds a whole extra copy on disk'),
    ],
    recap: {
      crude: T('每次存档都复制整个项目，改了什么全靠自己记', 'Every save copies the whole project, and you must remember what changed'),
      git: T('（预告）git 只存变化的部分，并自动记下说明、作者和先后顺序', '(Preview) git stores only what changed and records the message, author and order for you'),
      pitfalls: [
        T('忘了先备份就开始改，改坏了就回不去', 'Starting to edit before backing up, then having nothing to go back to'),
        T('v1、v2 这样的文件夹名说明不了改了什么', 'Folder names like v1 and v2 say nothing about what changed'),
      ],
      next: T('下一关：一年后，备份文件夹堆成了山……', 'Next: a year later, the backup folders have piled up…'),
    },
  };

  levels['c0-2'] = {
    problem: {
      title: T('哪个才是最终版？', 'Which one is the final version?'),
      story: T('一年后，你的目录里躺着 project、project_final、project_final2、project_final_真的最终、project_backup_0103、project_old……老板说：“把端口是 8080 的那个版本恢复回来！”顺便把重复的备份删掉。',
        'A year later your home folder holds project, project_final, project_final2, project_final_REALLY_final, project_backup_0103, project_old… Your boss says: "Bring back the version that uses port 8080!" And please delete the duplicate backup.'),
    },
    crude: {
      steps: [
        step('🔎', '文件名靠不住，只能 grep -r 8080 挨个搜内容', 'File names can\'t be trusted, so grep -r 8080 through everything'),
        step('🗑️', '删掉当前的 project，再把找到的备份复制回来', 'Delete the current project and copy the backup you found back in'),
        step('🧐', '两两 diff -r，找出内容一模一样的备份', 'Run diff -r on pairs to find backups that are identical'),
        step('❓', '到最后还是说不清 final 和 final2 谁更新', 'In the end you still can\'t tell whether final or final2 is newer'),
      ],
      pain: T('找版本靠搜、恢复靠删了再拷、去重靠两两对比；删错一次，当前的工作就没了', 'Finding a version means searching, restoring means delete-and-copy, de-duplicating means comparing pairs, and one wrong delete loses your current work'),
    },
    git: {
      idea: T('本关还是没有 git。有了 git，每个版本都有唯一编号和说明，想回哪个版本、比哪两个版本，都是一条命令', 'Still no git here. With git every version has a unique ID and a message, so going back to or comparing any version is one command'),
      commands: ['grep -r', 'rm -r', 'cp -r', 'diff -r'],
    },
    expect: [
      T('diff -r 没有任何输出，意思是两个目录完全相同', 'If diff -r prints nothing, the two folders are identical'),
      T('你会发现文件名里的“最终”根本不可信', 'You\'ll find that "final" in a folder name means nothing'),
    ],
    tasks: [
      task('terminal', '文件名靠不住，只能按内容搜出想要的版本', 'Names are unreliable, so search by content to find the version'),
      task('terminal', '“恢复”= 删掉现在的、再复制回来，删错就完了', '"Restore" means delete the current one and copy back; one mistake and it\'s gone'),
      task('terminal', '内容一样的备份白占空间，只能两两对比才能发现', 'Identical backups waste space, and only pairwise comparison reveals them'),
    ],
    recap: {
      crude: T('靠搜索找版本、靠删除再复制来恢复、靠两两对比去重', 'Search to find a version, delete-and-copy to restore, compare pairs to de-duplicate'),
      git: T('（预告）git 给每个版本一个唯一哈希和说明，相同内容只存一份', '(Preview) git gives every version a unique hash and a message, and stores identical content only once'),
      pitfalls: [
        T('先 rm -r project 再发现拷错了备份，当前工作就没了', 'Running rm -r project, then realising you copied the wrong backup'),
        T('相信文件名里的“最终版”', 'Trusting "final" in a folder name'),
      ],
      next: T('下一站：给文件夹装上 git，让它自己记住每个版本', 'Next stage: put git in the folder and let it remember every version for you'),
    },
  };

  /* ===== 第 1 站：存档与记录 ===== */
  levels['c1-1'] = {
    problem: {
      title: T('让文件夹自己记住历史', 'Let the folder remember its own history'),
      story: T('受够了复制文件夹，你决定在 ~/project 里用上 git。第一步：让 git 开始管理这个文件夹，并告诉它你是谁。',
        'Fed up with copying folders, you decide to use git in ~/project. Step one: let git start looking after the folder, and tell it who you are.'),
    },
    crude: {
      steps: [
        step('📁', '新建一个“备份”文件夹专门放存档', 'Make a "backups" folder just for saved copies'),
        step('✍️', '在每份备份里放一张纸条：“这是谁改的”', 'Leave a note in each backup: "changed by …"'),
      ],
      pain: T('备份目录和作者纸条全靠手工维护，时间一长就对不上了', 'The backups folder and the author notes are maintained by hand and soon drift out of sync'),
    },
    git: {
      idea: T('git init 在项目里建一个隐藏的 .git 仓库，以后每次存档都放进去，并自动写上作者', 'git init creates a hidden .git repository in the project; every future save goes there, stamped with the author'),
      commands: ['git init', 'git config --global user.name', 'git config --global user.email', 'git status'],
    },
    expect: [
      T('git init 之后项目文件一点没变，只多了一个隐藏的 .git 目录', 'After git init your files are untouched; there\'s just a hidden .git folder'),
      T('git status 会说 No commits yet 和 Untracked files——还没存过档，这很正常', 'git status says "No commits yet" and "Untracked files". Nothing saved yet, which is normal'),
    ],
    tasks: [
      task('analogy', '创建 .git 仓库，对照看看它相当于原始做法里的哪一步', 'Create the .git repository and see which crude-way step it replaces'),
      task('terminal', '每次提交都会记下作者，先告诉 git 你是谁', 'Every commit records its author, so tell git who you are'),
      task('terminal', '邮箱和名字一起标识作者', 'Your email identifies you together with your name'),
      task('trees', '看看 git 眼中的项目：app.js 还是“未跟踪”', 'See the project through git\'s eyes: app.js is still "untracked"'),
    ],
    recap: {
      crude: T('备份目录、作者纸条都靠手工维护', 'Backup folders and author notes all kept by hand'),
      git: T('一个 git init 就有了仓库，作者信息会自动写进每次提交', 'One git init gives you a repository, and the author goes into every commit automatically'),
      pitfalls: [
        T('在错误的目录（比如 ~）里 git init，结果整个家目录都被 git 管了', 'Running git init in the wrong folder (like ~) so git tracks your whole home directory'),
        T('没配置 user.name / user.email 就提交，会报错或署错名', 'Committing without user.name / user.email set: an error or the wrong name'),
      ],
      next: T('下一关：把文件交给 git，拍下第一张快照', 'Next: hand your files to git and take the first snapshot'),
    },
  };


  levels['c1-2'] = {
    problem: {
      title: T('给项目拍第一张快照', 'Take your project\'s first snapshot'),
      story: T('仓库已经建好，app.js 也写了几行，但 git 还什么都没记住。你想再补一个 README.md，然后把这两个文件一起存成第一个版本。',
        'The repository exists and app.js has a few lines, but git hasn\'t remembered anything yet. You want to add a README.md and save both files as version one.'),
    },
    crude: {
      steps: [
        { icon: '📂', text: T('新建一个“待打包”文件夹，把要存的文件挑出来拷进去', 'Make a "to pack" folder and copy the files you want to keep into it') },
        { icon: '🗜️', text: T('压缩成 project_20240101.zip', 'Zip it up as project_20240101.zip') },
        { icon: '📝', text: T('在 notes.txt 里写一句“第一版”', 'Write "first version" in notes.txt') },
      ],
      pain: T('挑文件、压缩、写说明全靠手工，漏拷一个文件也没人提醒你', 'Picking files, zipping and writing notes are all manual, and nobody warns you if you miss a file'),
    },
    git: {
      idea: T('git add 把文件放进“待提交清单”（暂存区），git commit 把清单变成一个带说明的永久快照', 'git add puts files on the "to commit" list (the staging area); git commit turns that list into a permanent snapshot with a message'),
      commands: ['git add', 'git status', 'git commit -m'],
    },
    expect: [
      T('add 之后文件还没“存档”，只是进了暂存区，看“三棵树”面板就清楚了', 'After add, files aren\'t saved yet, just staged. The Three Trees panel shows it clearly'),
      T('commit 之后提交图上会出现第一个圆点', 'After commit, the first dot appears on the commit graph'),
    ],
    tasks: [
      { focus: 'terminal', why: T('先准备好要存档的新文件', 'First create the new file you want to save') },
      { focus: 'trees', why: T('把两个文件放进暂存区，决定这次快照包含什么', 'Stage both files to decide what goes into this snapshot') },
      { focus: 'trees', why: T('提交前先确认清单，避免漏存或多存', 'Check the list before committing so nothing is missing or extra') },
      { focus: 'graph', why: T('正式存档：暂存区变成一个永久快照', 'Save for real: the staging area becomes a permanent snapshot') },
    ],
    recap: {
      crude: T('手工挑文件、压缩、写说明，每一步都可能出错', 'Picking files, zipping and noting by hand: every step can go wrong'),
      git: T('add 选内容、commit 存快照，说明、作者、时间自动记好', 'add chooses the content, commit saves the snapshot; message, author and time are recorded for you'),
      pitfalls: [
        T('忘了 add 就 commit，git 只会提示“nothing added to commit”', 'Committing without add just gets you "nothing added to commit"'),
        T('提交说明写“改了点东西”，将来谁也看不懂', 'A message like "changed stuff" will mean nothing to anyone later'),
      ],
      next: T('下一关：改了代码之后，怎么看清到底改了哪几行？', 'Next: after editing, how do you see exactly which lines changed?'),
    },
  };

  levels['c1-3'] = {
    problem: {
      title: T('我到底改了哪几行？', 'Which lines did I actually change?'),
      story: T('项目已经有了“第一次提交”。现在你要把 app.js 里的 hello 改成 hello, git，再新建一个 utils.js。提交前，你想先看清自己到底改了什么。',
        'The project already has its "First commit". Now you\'ll change hello to hello, git in app.js and add a new utils.js. Before saving, you want to see exactly what you changed.'),
    },
    crude: {
      steps: [
        step('🗂️', '找到上一份备份文件夹', 'Find the previous backup folder'),
        step('🔍', 'diff 备份/app.js project/app.js，一个文件一个文件地比', 'diff backup/app.js project/app.js, one file at a time'),
        step('📁', '确认没问题，再复制一整份新备份', 'If it looks right, copy a whole new backup'),
      ],
      pain: T('得自己记住该和哪份备份比，文件一多就容易漏看', 'You must remember which backup to compare against, and with many files it\'s easy to miss one'),
    },
    git: {
      idea: T('git diff 自动和上一次存档比：不带参数看“还没 add 的”，加 --staged 看“准备提交的”', 'git diff compares with your last save automatically: plain diff shows what isn\'t added yet, --staged shows what you\'re about to commit'),
      commands: ['edit', 'git diff', 'git add', 'git diff --staged', 'git commit'],
    },
    expect: [
      T('diff 里 - 开头是删掉的行，+ 开头是新增的行', 'In a diff, lines starting with - were removed and lines with + were added'),
      T('add 之后再 git diff 会什么都不显示——改动挪到暂存区了，要用 --staged 才看得到', 'After add, git diff shows nothing: the change moved to the staging area, so use --staged to see it'),
    ],
    tasks: [
      task('editor', '先做一次真实的修改', 'First make a real change'),
      task('terminal', '看看工作区里还没 add 的改动', 'Look at the changes in the working tree that aren\'t added yet'),
      task('trees', '改动进了暂存区；--staged 看的正是“下次要提交的”', 'The change is now staged; --staged shows exactly what the next commit will contain'),
      task('graph', '存下这次修改，提交图上多一个点', 'Save this change: one more dot on the commit graph'),
      task('graph', '再走一遍完整循环，历史里有了 3 个提交', 'Run the whole loop again: history now has 3 commits'),
    ],
    recap: {
      crude: T('要自己找对备份，再一个个文件比较', 'Find the right backup yourself, then compare file by file'),
      git: T('diff 自动对比上一次存档，工作区、暂存区各看各的', 'diff compares against your last save automatically, for the working tree and the staging area separately'),
      pitfalls: [
        T('add 之后 git diff 看不到改动，以为改动丢了', 'Seeing nothing in git diff after add and thinking the change is lost'),
        T('新文件没 add 就提交，它不会进快照', 'Committing without adding a new file: it isn\'t in the snapshot'),
      ],
      next: T('下一关：日志、node_modules 这些杂物，怎么让 git 别管它们？', 'Next: how do you make git ignore junk like logs and node_modules?'),
    },
  };

  levels['c1-5'] = {
    problem: {
      title: T('别把垃圾存进去', 'Keep the junk out'),
      story: T('项目里冒出了 debug.log 和一整个 node_modules/，git status 一屏都是它们。你只想提交真正的代码：src/main.js，外加一份 .gitignore。',
        'debug.log and a whole node_modules/ have appeared in the project, filling your git status. You only want to commit real code: src/main.js, plus a .gitignore.'),
    },
    crude: {
      steps: [
        step('📁', '复制整个项目当备份', 'Copy the whole project as a backup'),
        step('🐘', '日志和依赖也一起复制，备份越来越大', 'Logs and dependencies get copied too, and backups keep growing'),
        step('✂️', '每次备份前手动删掉不需要的东西', 'Delete the unwanted stuff by hand before every backup'),
      ],
      pain: T('每次都要手工挑，忘一次就把几百 MB 的依赖和日志也存了进去', 'You pick by hand every time, and forgetting once saves hundreds of MB of dependencies and logs'),
    },
    git: {
      idea: T('在 .gitignore 里写好规则，git 从此对这些文件视而不见，git add . 也不会带上它们', 'Write rules in .gitignore and git ignores those files from then on, even with git add .'),
      commands: ['.gitignore', 'git status', 'git add .', 'git commit'],
    },
    expect: [
      T('写好 .gitignore 后，status 里的 debug.log 和 node_modules/ 会立刻消失', 'Once .gitignore is written, debug.log and node_modules/ vanish from status right away'),
      T('.gitignore 只管还没被跟踪的文件', '.gitignore only affects files that aren\'t tracked yet'),
    ],
    tasks: [
      task('terminal', '写下忽略规则：每行一个模式', 'Write the ignore rules: one pattern per line'),
      task('trees', '确认垃圾文件从未跟踪列表里消失了', 'Check that the junk has left the untracked list'),
      task('graph', '只把有用的文件存进快照', 'Save only the useful files in the snapshot'),
    ],
    recap: {
      crude: T('每次备份前手工剔除日志和依赖，漏一次就白白占空间', 'Weeding out logs and dependencies by hand before every backup; miss once and space is wasted'),
      git: T('一次写好 .gitignore，以后自动忽略', 'Write .gitignore once and junk is ignored from then on'),
      pitfalls: [
        T('已经提交过的文件再写进 .gitignore 不管用，要先 git rm --cached', 'Adding an already committed file to .gitignore does nothing; git rm --cached it first'),
        T('忘了提交 .gitignore 本身，同事那边照样满屏垃圾', 'Forgetting to commit .gitignore itself, so teammates still see the junk'),
      ],
      next: T('下一关：打开 .git 看看，快照到底是怎么存的？', 'Next: open up .git and see how snapshots are really stored'),
    },
  };

  levels['c1-4'] = {
    problem: {
      title: T('快照到底存在哪？', 'Where do snapshots actually live?'),
      story: T('你已经有两次提交：“第一次提交”和“新增 utils”。git 说每次提交都是完整快照，可 .git 并没有变大多少——它是怎么做到的？今天拆开看看。',
        'You have two commits: "First commit" and "Add utils". git says each commit is a full snapshot, yet .git has hardly grown. How? Let\'s take it apart.'),
    },
    crude: {
      steps: [
        step('📁', '每个备份文件夹都是完整的一份', 'Every backup folder is a complete copy'),
        step('📦', '没改过的文件也重复存一遍', 'Unchanged files are stored again and again'),
        step('📝', '哪个版本在前，只写在 notes.txt 里', 'Which version came first is only written in notes.txt'),
      ],
      pain: T('重复内容越存越多，版本之间的先后关系只存在于你的笔记里', 'Duplicate content keeps piling up, and the order of versions exists only in your notes'),
    },
    git: {
      idea: T('commit → tree → blob：提交指向目录快照，目录指向文件内容；一切按内容哈希存储，相同内容只存一份', 'commit → tree → blob: a commit points to a directory snapshot, which points to file contents; everything is stored by content hash, so identical content is kept once'),
      commands: ['git log --oneline', 'git cat-file -p', 'git count-objects'],
    },
    expect: [
      T('你会看到很多 40 位的哈希，复制前几位就够用', 'You\'ll see lots of 40-character hashes; the first few characters are enough'),
      T('这一关偏原理，没完全看懂也不影响后面，但弄懂了 git 就不再神秘', 'This level is about internals. Not getting all of it won\'t block you, but getting it makes git far less mysterious'),
    ],
    tasks: [
      task('graph', '先看看历史，找到最新的提交', 'Look at the history and find the latest commit'),
      task('terminal', '打开提交对象：里面记着 tree、父提交、作者和说明', 'Open the commit object: it holds a tree, a parent, an author and a message'),
      task('terminal', '顺着 tree 哈希，看到“文件名 → blob”的目录', 'Follow the tree hash to see the directory: file name → blob'),
      task('terminal', '再往下一层，就是文件内容本身', 'One level down is the file content itself'),
      task('terminal', '对象总数很少：没变的文件没有被重复保存', 'Very few objects: unchanged files were never stored twice'),
    ],
    recap: {
      crude: T('每个备份都是完整拷贝，版本关系只靠笔记', 'Every backup is a full copy; the version order lives in your notes'),
      git: T('对象按内容哈希存储，没变的文件直接复用，提交用父指针串成一条链', 'Objects are stored by content hash, unchanged files are reused, and commits are chained by parent pointers'),
      pitfalls: [
        T('以为每次提交都复制了所有文件——其实没变的内容只存一份', 'Thinking every commit copies all files; unchanged content is stored once'),
        T('手动去改 .git 里的文件，很容易把仓库弄坏', 'Editing files inside .git by hand, which easily breaks the repository'),
      ],
      next: T('下一站“后悔药”：文件改坏了，怎么一键回到上次存档的样子？', 'Next stage, "Undo": you broke a file. How do you snap it back to the last save?'),
    },
  };

  /* ===== 第 2 站：后悔药 ===== */
  levels['c2-1'] = {
    problem: {
      title: T('改得一团糟，想重来', 'Made a mess, want a do-over'),
      story: T('你在 app.js 里折腾了半天，加了些乱七八糟的注释，还多出一行 throw new Error("oops")，程序直接崩了。你只想让它回到上次提交时能跑的样子。',
        'You\'ve been hacking at app.js: messy comments everywhere and a stray throw new Error("oops") that crashes the program. You just want it back the way it was at your last commit.'),
    },
    crude: {
      steps: [
        step('🗂️', '翻出最近的一份备份', 'Dig out the most recent backup'),
        step('📋', 'cp 备份/app.js 覆盖回来', 'cp backup/app.js over the broken file'),
        step('🤞', '祈祷那份备份足够新', 'Hope that backup is recent enough'),
      ],
      pain: T('备份不一定是最新的，覆盖回去可能连带丢掉有用的改动', 'The backup may be stale, so copying it back can wipe out good changes too'),
    },
    git: {
      idea: T('git restore 用最近一次存进 git 的版本覆盖工作区文件，精确又快', 'git restore overwrites the file with the last version git has, precisely and instantly'),
      commands: ['git diff', 'git restore', 'git status'],
    },
    expect: [
      T('restore 成功时什么都不输出——安静就是成功', 'restore prints nothing on success: silence means it worked'),
      T('被丢弃的修改从没 add 过，git 也找不回来，所以先用 diff 确认', 'Discarded changes that were never added can\'t be recovered, so check with diff first'),
    ],
    tasks: [
      task('terminal', '丢弃之前先看一眼，确认没有想保留的东西', 'Look before you discard, in case there\'s anything worth keeping'),
      task('trees', '用暂存区里的版本替换工作区的 app.js', 'Replace app.js in the working tree with the staged version'),
      task('trees', '确认工作区已经干净', 'Confirm the working tree is clean'),
    ],
    recap: {
      crude: T('翻备份、手工覆盖，还可能拿到旧版本', 'Digging through backups and overwriting by hand, possibly with an old version'),
      git: T('一条 restore，回到上次 add / commit 时的样子', 'One restore takes the file back to the last add or commit'),
      pitfalls: [
        T('restore 前不看 diff，把有用的修改一起丢了', 'Restoring without checking the diff and losing useful edits'),
        T('以为 restore 可以撤销——没 add 过的改动一旦丢弃就回不来', 'Thinking restore can be undone: never-added changes are gone for good'),
      ],
      next: T('下一关：git add . 不小心把密码文件也加进去了', 'Next: git add . accidentally picked up a password file'),
    },
  };

  levels['c2-2'] = {
    problem: {
      title: T('差点把密码提交了', 'Nearly committed a password'),
      story: T('你顺手敲了 git add .，结果把存着数据库密码的 secret.env 也放进了暂存区。还好还没提交——得赶紧把它拿出来，只提交 feature.js。',
        'You typed git add . out of habit and staged secret.env, which holds the database password. Luckily nothing is committed yet: take it out and commit only feature.js.'),
    },
    crude: {
      steps: [
        step('📦', '把项目打包成 zip 发给同事', 'Zip the project and send it to a teammate'),
        step('😱', '发出去才发现压缩包里有 secret.env', 'Only after sending do you notice secret.env inside'),
        step('🔑', '消息撤不回，只能赶紧改密码', 'You can\'t unsend it, so you rush to change the password'),
      ],
      pain: T('打包时没有“检查清单”，敏感文件跟着一起走了，而且收不回来', 'Zipping has no checklist, so sensitive files slip out and can\'t be recalled'),
    },
    git: {
      idea: T('暂存区就是提交前的检查清单：git restore --staged 把文件从清单里拿掉，文件本身不动；再用 .gitignore 防止下次再犯', 'The staging area is your pre-commit checklist: git restore --staged takes a file off it without touching the file, and .gitignore stops it happening again'),
      commands: ['git status', 'git restore --staged', '.gitignore', 'git add', 'git commit'],
    },
    expect: [
      T('restore --staged 之后 secret.env 变回 Untracked，文件内容还在', 'After restore --staged, secret.env is Untracked again and its contents are intact'),
      T('写进 .gitignore 后，它会从 status 里彻底消失', 'Once it\'s in .gitignore, it disappears from status entirely'),
    ],
    tasks: [
      task('trees', '提交前先检查清单：secret.env 混进去了', 'Check the list before committing: secret.env snuck in'),
      task('trees', '把 secret.env 从清单里拿掉，文件本身保留', 'Take secret.env off the list but keep the file'),
      task('terminal', '写进 .gitignore，以后 git add . 也不会再带上它', 'Put it in .gitignore so git add . never picks it up again'),
      task('graph', '只提交该提交的：feature.js 和 .gitignore', 'Commit only what belongs: feature.js and .gitignore'),
    ],
    recap: {
      crude: T('打包没有清单，敏感文件发出去就收不回', 'No checklist when zipping; a leaked secret can\'t be taken back'),
      git: T('提交前有暂存区把关，放错了随时拿出来', 'The staging area guards every commit, and a wrong file can be taken out any time'),
      pitfalls: [
        T('想用 git rm secret.env 取消暂存——git rm 的意思是删除文件（git 会拦住你），取消暂存要用 restore --staged 或 rm --cached', 'Trying git rm secret.env to unstage: git rm means delete the file (git will stop you); to unstage, use restore --staged or rm --cached'),
        T('密码一旦提交并推送，就算后来删掉也还在历史里，必须换密码', 'Once a password is committed and pushed, it stays in history even if deleted later, so change it'),
      ],
      next: T('下一关：刚提交就发现信息打错了，还漏了个文件', 'Next: you just committed, then spot a typo and a missing file'),
    },
  };

  levels['c2-3'] = {
    problem: {
      title: T('提交信息打错，还漏了文件', 'Typo in the message, and a file left out'),
      story: T('你刚提交了“fix bgu”——拼错了，而且忘了把 test.js 一起提交。这个提交还没推送给任何人，你想直接把它改对。',
        'You just committed "fix bgu" (a typo) and forgot to include test.js. Nobody has seen this commit yet, so you want to fix it in place.'),
    },
    crude: {
      steps: [
        step('✏️', '把备份文件夹改个名', 'Rename the backup folder'),
        step('📋', '把漏掉的 test.js 拷进去', 'Copy the missing test.js into it'),
        step('📝', '再改 notes.txt 里那行说明', 'Then fix the line in notes.txt'),
      ],
      pain: T('三处都要手动改，漏改一处，备份和记录就对不上', 'Three places to fix by hand; miss one and the backup and the notes disagree'),
    },
    git: {
      idea: T('git commit --amend 用当前暂存区和新说明替换最后一次提交（其实是新建一个提交，旧的还留在 reflog 里）', 'git commit --amend replaces the last commit with the current staging area and a new message (really a new commit; the old one stays in the reflog)'),
      commands: ['git add', 'git commit --amend -m', 'git reflog'],
    },
    expect: [
      T('amend 之后提交哈希会变——它其实是一个新提交', 'After amend the commit hash changes: it\'s actually a new commit'),
      T('reflog 里还看得到旧的“fix bgu”，没有东西真正丢失', 'The old "fix bgu" is still in the reflog; nothing is truly lost'),
    ],
    tasks: [
      task('trees', '先把漏掉的 test.js 放进暂存区', 'Stage the missing test.js first'),
      task('graph', '用新内容和新说明替换最后一次提交', 'Replace the last commit with the new content and message'),
      task('terminal', 'reflog 证明旧提交没消失，只是不再有分支指向它', 'reflog proves the old commit still exists; no branch points to it any more'),
    ],
    recap: {
      crude: T('改名、补文件、改记录，三处手工同步', 'Rename, add the file, fix the notes: three manual edits'),
      git: T('一条 --amend，内容和说明一起修正', 'One --amend fixes both the content and the message'),
      pitfalls: [
        T('amend 已经推送的提交，会和同事的历史分叉', 'Amending a pushed commit makes your history diverge from your teammates\''),
        T('忘了先 add，amend 只改了说明', 'Forgetting to add first, so amend only changes the message'),
      ],
      next: T('下一关：连续几个提交都想重新整理——reset 的三种模式', 'Next: reorganise several recent commits with the three modes of reset'),
    },
  };

  levels['c2-4'] = {
    problem: {
      title: T('整理最近几次提交', 'Tidy up the last few commits'),
      story: T('历史是 init → 步骤1 → 步骤2 → 调试代码（不该提交）。你想彻底扔掉调试提交，再把步骤1和步骤2合并成一个干净的提交“完成步骤1和2”。',
        'History reads init → Step 1 → Step 2 → Debug code (should not be committed). You want to throw away the debug commit completely, then squash steps 1 and 2 into one clean commit, "Finish steps 1 and 2".'),
    },
    crude: {
      steps: [
        step('🗑️', '删掉最新那份备份文件夹', 'Delete the newest backup folder'),
        step('✂️', '在 notes.txt 里划掉几行', 'Cross out a few lines in notes.txt'),
        step('🧩', '手工把两次改动拼进一份新备份', 'Stitch two changes into a new backup by hand'),
      ],
      pain: T('删错一份就回不来，笔记和文件夹也很容易对不上', 'Delete the wrong one and it\'s gone, and the notes and folders easily drift apart'),
    },
    git: {
      idea: T('reset 把分支指针挪回过去：--soft 让改动留在暂存区，--mixed 留在工作区，--hard 连文件一起回退', 'reset moves the branch pointer back: --soft keeps changes staged, --mixed keeps them in the working tree, --hard rolls the files back too'),
      commands: ['git reset --hard HEAD~1', 'git reset --soft HEAD~2', 'git commit'],
    },
    expect: [
      T('reset --hard 之后 debug.js 会直接从工作区消失——这正是 --hard 的本意', 'After reset --hard, debug.js vanishes from the working tree: that\'s exactly what --hard is for'),
      T('--soft 之后提交图变短了，但改动都还在暂存区等你重新提交', 'After --soft the graph is shorter, but the changes wait in the staging area for a new commit'),
    ],
    tasks: [
      task('graph', '丢掉最后的调试提交，文件也一起回退', 'Drop the debug commit, files included'),
      task('trees', '指针回到 init，两步的改动还留在暂存区', 'The pointer is back at init, with both steps\' changes still staged'),
      task('graph', '把两步改动重新存成一个提交', 'Save both steps again as a single commit'),
    ],
    recap: {
      crude: T('删备份、改笔记、手工拼接，容易出错还不可逆', 'Deleting backups, editing notes and stitching by hand: error-prone and irreversible'),
      git: T('移动指针就能重排历史，三种模式决定改动去哪儿', 'Moving a pointer reshapes history, and the three modes decide where the changes go'),
      pitfalls: [
        T('工作区有没提交的改动时用 --hard，它们会被覆盖且找不回', 'Using --hard with uncommitted changes: they\'re overwritten and unrecoverable'),
        T('reset 已经推送的提交，会和远程分叉', 'Resetting pushed commits makes you diverge from the remote'),
      ],
      next: T('下一关：错误的提交已经推送给同事了，还能用 reset 吗？', 'Next: a bad commit has already been pushed. Can you still use reset?'),
    },
  };

  levels['c2-5'] = {
    problem: {
      title: T('错误已经发给所有人了', 'The mistake is already out there'),
      story: T('“把税率改成 50%”是个错误的提交，而且已经推送到服务器，小明也拉走了。之后你还提交了“打印税率”，那个要保留。',
        '"Change tax rate to 50%" was a mistake, and it\'s already on the server; Xiaoming has pulled it too. You also committed "Print tax rate" after it, which must stay.'),
    },
    crude: {
      steps: [
        step('📢', '在群里喊：“别用昨天那个 zip！”', 'Shout in the group chat: "Don\'t use yesterday\'s zip!"'),
        step('✏️', '手工把 tax.js 改回 0.13', 'Change tax.js back to 0.13 by hand'),
        step('📦', '再发一个“修正版.zip”', 'Send out a "fixed.zip"'),
      ],
      pain: T('总有人没看到消息还在用错的版本，也没人说得清修正版到底改了什么', 'Someone always misses the message and keeps the bad version, and nobody knows what "fixed" actually changed'),
    },
    git: {
      idea: T('git revert 生成一个“反向”的新提交来抵消错误，公开的历史不被改写，同事照常 pull 即可', 'git revert adds a new "opposite" commit that cancels the mistake; shared history isn\'t rewritten, so teammates just pull as usual'),
      commands: ['git log --oneline', 'git revert', 'git push'],
    },
    expect: [
      T('revert 会自动生成一条 Revert "…" 的提交说明', 'revert writes a commit message like Revert "…" for you'),
      T('错误提交还留在历史里，后面紧跟一个撤销它的提交——这正是我们想要的', 'The bad commit stays in history, followed by one that undoes it. That\'s exactly what we want'),
    ],
    tasks: [
      task('graph', '先在历史里找到那个错误提交的哈希', 'Find the bad commit\'s hash in the history'),
      task('graph', '生成反向提交：税率回到 0.13，“打印税率”保留', 'Create the opposite commit: tax is back to 0.13 and "Print tax rate" stays'),
      task('multi', '把撤销推送出去，同事 pull 一下就同步了', 'Push the undo; teammates are in sync after a pull'),
    ],
    recap: {
      crude: T('群里喊话 + 重发压缩包，总有人用着错的版本', 'Chat warnings and re-sent zips: someone always keeps the bad version'),
      git: T('revert 在历史末尾追加一个撤销，公开历史不被改写', 'revert appends an undo to history without rewriting what others already have'),
      pitfalls: [
        T('对已推送的提交用 reset + 强推，同事的历史会乱套', 'Using reset plus a force push on shared commits, which scrambles teammates\' history'),
        T('revert 错了提交——动手前先用 git show 确认', 'Reverting the wrong commit; check it with git show first'),
      ],
      next: T('下一关：手一抖，reset --hard 多退了三个提交', 'Next: a slip of the finger, and reset --hard throws away three commits'),
    },
  };

  levels['c2-6'] = {
    problem: {
      title: T('三个提交凭空消失', 'Three commits vanished'),
      story: T('你本想 git reset --hard HEAD~1，手一抖打成了 HEAD~3。“登录功能”“注册功能”“找回密码”全从 git log 里消失了，工作区也退回到了 init。',
        'You meant git reset --hard HEAD~1 but typed HEAD~3. "Login", "Sign-up" and "Password recovery" are gone from git log, and your files are back at init.'),
    },
    crude: {
      steps: [
        step('🗑️', '删错了一个备份文件夹', 'You deleted the wrong backup folder'),
        step('♻️', '去回收站翻，可惜已经清空了', 'You check the recycle bin, but it was emptied'),
        step('😭', '三天的工作只能重写', 'Three days of work to redo'),
      ],
      pain: T('删了就是删了，没有“操作记录”可以回放', 'Deleted means deleted; there\'s no log of what you did to replay'),
    },
    git: {
      idea: T('提交并没有被删除，只是没人指向它；reflog 记着 HEAD 的每一次移动，照着它指回去就行', 'The commits aren\'t deleted, just unreferenced; reflog records every move of HEAD, so point back to where you were'),
      commands: ['git log', 'git reflog', 'git reset --hard <hash>'],
    },
    expect: [
      T('git log 里只剩 init，看起来全没了——别慌', 'git log shows only init and it looks like everything is gone. Don\'t panic'),
      T('reflog 里 HEAD@{1} 就是 reset 之前的位置', 'In the reflog, HEAD@{1} is where you were before the reset'),
    ],
    tasks: [
      task('graph', '确认灾难现场：log 里只剩 init', 'Survey the damage: only init is left in the log'),
      task('terminal', '在 HEAD 的移动记录里找到“找回密码”那个提交', 'Find the "Password recovery" commit in HEAD\'s movement log'),
      task('graph', '把 main 指回去，三个提交全部回来', 'Point main back and all three commits return'),
    ],
    recap: {
      crude: T('删了就没了，只能重写', 'Deleted is gone; you rewrite it'),
      git: T('reflog 是本地的操作记录，提交过的东西几乎都能找回', 'The reflog is your local action history; almost anything ever committed can be found'),
      pitfalls: [
        T('发现误删后慌忙又做一堆操作——先冷静看清 reflog 再动手', 'Panicking and running more commands after a mistake; read the reflog calmly first'),
        T('以为 reflog 能救没提交过的改动，它不能', 'Expecting reflog to save changes that were never committed; it can\'t'),
      ],
      next: T('下一站：想同时做几件事？先学会开分支', 'Next stage: want to do several things at once? Start with branches'),
    },
  };

  /* ===== 第 3 站：同时做几件事 ===== */
  levels['c3-1'] = {
    problem: {
      title: T('想试新功能，又不想弄乱主线', 'Try a feature without messing up main'),
      story: T('app.js 已经到了 v1，你想做个暗黑模式（theme.css），但还不确定要不要。你希望 main 始终保持干净、能用。',
        'app.js is at v1 and you want to try a dark mode (theme.css), but you\'re not sure it will stay. You want main to remain clean and working.'),
    },
    crude: {
      steps: [
        step('📁', 'cp -r project project_暗黑模式', 'cp -r project project_dark-mode'),
        step('✏️', '在副本里改', 'Work in the copy'),
        step('📋', '满意了再把文件一个个拷回原项目', 'When happy, copy the files back one by one'),
      ],
      pain: T('每个想法都复制一整份项目，合回去全靠手工，还常忘了哪边改过什么', 'Each idea costs a full copy of the project, merging back is manual, and you forget which side changed what'),
    },
    git: {
      idea: T('分支只是一个指向提交的指针，git switch -c 瞬间开一条新线，两条线互不影响', 'A branch is just a pointer to a commit; git switch -c starts a new line instantly and the two lines don\'t interfere'),
      commands: ['git switch -c', 'git add', 'git commit', 'git switch', 'git log --oneline --graph --all'],
    },
    expect: [
      T('切回 main 时 theme.css 会从工作区“消失”——它只是待在另一条分支上', 'When you switch back to main, theme.css "disappears": it simply lives on the other branch'),
      T('提交图上会出现两个分支标签', 'Two branch labels appear on the commit graph'),
    ],
    tasks: [
      task('graph', '开一条新分支并切过去，HEAD 跟着移动', 'Create a new branch and switch to it; HEAD moves with you'),
      task('graph', '在新分支上提交，只有它往前走', 'Commit on the new branch; only it moves forward'),
      task('trees', '回到 main，工作区自动变回 main 的样子', 'Back on main, the working tree turns back into main\'s version'),
      task('graph', '在图上看清两条线', 'See both lines on the graph'),
    ],
    recap: {
      crude: T('开分支 = 复制整个项目，合回去靠手工', 'A "branch" is a full project copy, merged back by hand'),
      git: T('分支几乎零成本，切换时工作区自动换成对应的版本', 'Branches cost almost nothing, and switching swaps the working tree for you'),
      pitfalls: [
        T('忘了切分支，直接在 main 上开发', 'Forgetting to switch and developing straight on main'),
        T('以为文件“丢了”，其实它在另一条分支上', 'Thinking a file is lost when it\'s just on another branch'),
      ],
      next: T('下一关：功能做到一半，线上突然要紧急修 bug', 'Next: halfway through a feature, production needs an urgent fix'),
    },
  };

  levels['c3-7'] = {
    problem: {
      title: T('做到一半，线上出 bug 了', 'Mid-feature, production breaks'),
      story: T('你在 feature 分支上 feature.js 写到一半，还顺手改了 app.js。这时线上告急，要你马上到 main 上修 bug。半成品还不能提交。',
        'You\'re halfway through feature.js on the feature branch and have also touched app.js. Suddenly production is on fire and you must fix a bug on main right now. The half-done work isn\'t ready to commit.'),
    },
    crude: {
      steps: [
        step('📋', '把改到一半的文件拷到“临时”文件夹', 'Copy the half-edited files to a "temp" folder'),
        step('↩️', '把项目恢复成备份的样子', 'Restore the project from a backup'),
        step('🔧', '修 bug', 'Fix the bug'),
        step('📋', '再把半成品拷回来，祈祷没覆盖错', 'Copy the work back and pray nothing gets overwritten'),
      ],
      pain: T('临时文件夹一多就乱，拷回来时很容易把刚修好的 bug 又覆盖掉', 'Temp folders multiply, and copying back can easily undo the fix you just made'),
    },
    git: {
      idea: T('git stash 把没提交的改动打包收起来，工作区立刻变干净；忙完回来 git stash pop 原样取回', 'git stash packs away uncommitted changes and leaves a clean working tree; when you\'re back, git stash pop restores them'),
      commands: ['git switch', 'git stash', 'git commit -am', 'git stash pop'],
    },
    expect: [
      T('直接切分支会被拒绝——git 在保护你的半成品，不让它被覆盖', 'Switching straight away is refused: git is protecting your unfinished work from being overwritten'),
      T('stash pop 之后半成品原样回来', 'After stash pop, your work in progress is back as it was'),
    ],
    tasks: [
      task('trees', '看看 git 为什么拒绝切换，然后把半成品收起来', 'See why git refuses to switch, then put your work away'),
      task('graph', '在干净的 main 上完成紧急修复', 'Make the hotfix on a clean main'),
      task('trees', '回到 feature，把半成品取回来继续写', 'Go back to feature and pick up where you left off'),
    ],
    recap: {
      crude: T('临时拷来拷去，容易互相覆盖', 'Copying to and from temp folders, overwriting things along the way'),
      git: T('stash 一收一放，切换任务不丢半成品', 'stash away, stash pop: switch tasks without losing work in progress'),
      pitfalls: [
        T('stash 之后忘了 pop，以为改动丢了（git stash list 看一看）', 'Forgetting to pop and thinking the changes are lost (check git stash list)'),
        T('在错误的分支上 pop，半成品被放到了别处', 'Popping on the wrong branch, dropping the work in the wrong place'),
      ],
      next: T('下一关：功能做完了，怎么合回 main？', 'Next: the feature is done. How does it get back into main?'),
    },
  };

  levels['c3-2'] = {
    problem: {
      title: T('功能做完了，合回主线', 'Feature done: bring it home'),
      story: T('feature 分支上有“新功能”和“新功能完善”两个提交，而 main 在你开分支后一直没动。现在要把功能合进 main，再清理掉用完的分支。',
        'The feature branch has "New feature" and "Polish new feature", and main hasn\'t moved since you branched. Merge the feature into main, then clean up the branch.'),
    },
    crude: {
      steps: [
        step('📋', '把副本里改过的文件拷回原项目', 'Copy the changed files from the copy back into the project'),
        step('🗑️', '删掉副本文件夹', 'Delete the copy'),
        step('🤔', '心里没底：有没有漏拷的？', 'Nagging doubt: did you miss a file?'),
      ],
      pain: T('得自己记住改过哪些文件，漏拷一个功能就不完整', 'You must remember every changed file; miss one and the feature is incomplete'),
    },
    git: {
      idea: T('main 没有新提交时，合并只需把 main 指针“快进”到 feature 的位置，不产生新提交', 'When main has no new commits, merging just fast-forwards main\'s pointer to feature; no new commit needed'),
      commands: ['git merge', 'git branch -d'],
    },
    expect: [
      T('输出里会出现 Fast-forward', 'You\'ll see Fast-forward in the output'),
      T('git branch -d 只允许删除已合并的分支，这是一层保护', 'git branch -d only deletes merged branches, which is a safety net'),
    ],
    tasks: [
      task('graph', '看 main 指针直接快进到 feature 的顶端', 'Watch main\'s pointer jump straight to the tip of feature'),
      task('graph', '分支用完就删——删的只是指针，提交都还在', 'Delete the branch when done; only the pointer goes, the commits stay'),
    ],
    recap: {
      crude: T('手工拷回，容易漏文件', 'Copying back by hand, easily missing files'),
      git: T('快进合并只挪指针，一个文件都不会漏', 'A fast-forward merge only moves a pointer, so no file can be missed'),
      pitfalls: [
        T('在 feature 上执行 merge（方向反了）——要先切到 main', 'Running merge while on feature (backwards); switch to main first'),
        T('用 -D 强删还没合并的分支', 'Force-deleting an unmerged branch with -D'),
      ],
      next: T('下一关：main 和 feature 都有了新提交，还能快进吗？', 'Next: both main and feature have new commits. Can you still fast-forward?'),
    },
  };

  levels['c3-3'] = {
    problem: {
      title: T('两边都往前走了', 'Both sides moved on'),
      story: T('你在 feature 上做了“新功能”（feature.js），同时 main 上有人提交了“修复 bug”（app.js）。两条线分叉了，现在要把它们合到一起。',
        'You made "New feature" (feature.js) on feature, while someone committed "Fix bug" (app.js) on main. The lines have diverged, and now they need to come together.'),
    },
    crude: {
      steps: [
        step('🗂️', '两个文件夹并排打开', 'Open the two folders side by side'),
        step('🔍', '逐个文件对比，猜哪边改过', 'Compare file by file, guessing which side changed what'),
        step('🧩', '手工把两边的改动拼到一起', 'Stitch both sides\' changes together by hand'),
      ],
      pain: T('没有“共同起点”做参照，分不清是谁改了什么，一不留神就把对方的修复覆盖掉', 'With no common starting point to compare against, you can\'t tell who changed what and may overwrite the other side\'s fix'),
    },
    git: {
      idea: T('git 找到两条分支的共同祖先做三方比较：改的是不同文件就自动合好，并生成一个有两个父提交的合并提交', 'git finds the common ancestor and does a three-way comparison; changes to different files merge automatically into a merge commit with two parents'),
      commands: ['git log --oneline --graph --all', 'git merge', 'git log -1'],
    },
    expect: [
      T('合并会生成一条 Merge branch \'feature\' 的提交说明', 'The merge creates a commit message like Merge branch \'feature\''),
      T('图上会出现一个有两条入线的合并提交', 'A merge commit with two incoming lines appears on the graph'),
    ],
    tasks: [
      task('graph', '先看清分叉：两条线从同一个提交长出来', 'First see the fork: two lines growing from the same commit'),
      task('graph', '合并：两边改的是不同文件，自动完成', 'Merge: the sides changed different files, so it\'s automatic'),
      task('graph', '合并提交有两个父提交，两段历史都被保留', 'The merge commit has two parents, so both histories are kept'),
    ],
    recap: {
      crude: T('肉眼对比、手工拼接，容易覆盖对方', 'Eyeballing and hand-stitching, easily overwriting the other side'),
      git: T('三方合并自动完成，历史完整保留两条线', 'The three-way merge is automatic, and history keeps both lines'),
      pitfalls: [
        T('看到编辑器弹出合并说明就慌了——保存退出即可', 'Panicking when an editor pops up for the merge message: just save and quit'),
        T('以为合并提交是多余的噪音，其实它记录了两条线汇合的时刻', 'Seeing merge commits as noise, when they record the moment two lines joined'),
      ],
      next: T('下一关：dev 分支上只有一个提交是你现在急需的', 'Next: only one commit on the dev branch is what you urgently need'),
    },
  };

  levels['c3-6'] = {
    problem: {
      title: T('只要那一个修复', 'Just that one fix'),
      story: T('同事的 dev 分支上有三个提交：半成品功能 A、修复崩溃、半成品功能 B。线上正因为 core.js 崩溃，main 急需“修复崩溃”，但两个半成品绝不能进来。',
        'A teammate\'s dev branch has three commits: WIP feature A, Fix crash, WIP feature B. Production is crashing in core.js, so main needs "Fix crash" now, but neither WIP may come along.'),
    },
    crude: {
      steps: [
        step('🔍', '在同事的文件夹里找那次修复改了哪几行', 'Hunt through the teammate\'s folder for the lines the fix changed'),
        step('✂️', '手工抄到自己的 core.js', 'Copy them into your core.js by hand'),
        step('🤞', '希望没抄漏、没抄错', 'Hope nothing was missed or mistyped'),
      ],
      pain: T('文件夹里只有最终结果，看不出“某一次修改”具体动了什么，只能靠猜', 'A folder only holds the end result, so you can\'t see what one particular change did; you have to guess'),
    },
    git: {
      idea: T('git cherry-pick 把某一个提交的改动复制到当前分支，生成一个新提交', 'git cherry-pick copies the changes of a single commit onto the current branch as a new commit'),
      commands: ['git log dev --oneline', 'git cherry-pick'],
    },
    expect: [
      T('复制过来的提交内容相同但哈希不同——它是一个新提交', 'The copied commit has the same changes but a different hash: it\'s a new commit'),
      T('main 上不会出现 wip.js，半成品没有混进来', 'wip.js does not show up on main; no WIP sneaks in'),
    ],
    tasks: [
      task('graph', '在 dev 的历史里找到那个修复的哈希', 'Find the fix\'s hash in dev\'s history'),
      task('graph', '只把这一个改动复制到 main', 'Copy just that one change onto main'),
    ],
    recap: {
      crude: T('从别人的文件里手抄几行，容易抄错抄漏', 'Hand-copying lines from someone else\'s files, with slips and gaps'),
      git: T('按提交精确复制一次改动', 'Copy exactly one change, by commit'),
      pitfalls: [
        T('在 dev 分支上执行 cherry-pick（方向反了）', 'Running cherry-pick while on dev (backwards)'),
        T('cherry-pick 之后又整个 merge dev，同一个改动出现两次', 'Cherry-picking, then merging all of dev later, so the same change appears twice'),
      ],
      next: T('下一关：不想要合并提交，想让历史保持一条直线', 'Next: skip the merge commit and keep history in a straight line'),
    },
  };

  levels['c3-5'] = {
    problem: {
      title: T('想要一条直线的历史', 'A straight line of history'),
      story: T('你在 feature 上做了“新功能”和“完善新功能”，main 上又多了“修复 bug”。团队喜欢干净的直线历史，不想看到合并提交。',
        'You have "New feature" and "Polish new feature" on feature, and main has gained "Fix bug". The team likes a clean, straight history without merge commits.'),
    },
    crude: {
      steps: [
        step('📁', '从 main 最新的文件夹重新复制一份', 'Make a fresh copy of main\'s latest folder'),
        step('✏️', '把自己的改动一处处重新做一遍', 'Redo each of your changes, one by one'),
        step('🗑️', '扔掉旧副本', 'Throw away the old copy'),
      ],
      pain: T('等于把自己的工作重做一遍，费时又容易漏', 'It means redoing all your work: slow and easy to get wrong'),
    },
    git: {
      idea: T('git rebase main 把 feature 的提交逐个“重放”到 main 顶端，历史变成一条直线；之后 main 快进合并即可', 'git rebase main replays feature\'s commits one by one on top of main, giving a straight line; then main simply fast-forwards'),
      commands: ['git rebase main', 'git switch main', 'git merge'],
    },
    expect: [
      T('rebase 后 feature 的提交哈希全变了——它们是重放出来的新提交', 'After rebase, feature\'s commit hashes all change: they\'re replayed, new commits'),
      T('最后的合并是 Fast-forward，没有合并提交', 'The final merge is a fast-forward, with no merge commit'),
    ],
    tasks: [
      task('graph', '把 feature 的提交搬到 main 最新提交之后', 'Move feature\'s commits to sit after main\'s latest commit'),
      task('graph', 'main 快进到 feature，历史成为一条直线', 'Fast-forward main to feature: history is now a straight line'),
    ],
    recap: {
      crude: T('从最新版重来，手工重做所有改动', 'Start over from the latest version and redo every change by hand'),
      git: T('rebase 自动重放提交，历史干净笔直', 'rebase replays commits for you, leaving a clean straight history'),
      pitfalls: [
        T('rebase 已经推送给别人的提交', 'Rebasing commits you have already pushed to others'),
        T('在 main 上执行 git rebase feature（方向反了）', 'Running git rebase feature while on main (backwards)'),
      ],
      next: T('下一关：想回到过去某个版本看看，甚至在那里做个试验', 'Next: visit an old version, and even experiment there'),
    },
  };

  levels['c3-4'] = {
    problem: {
      title: T('回到过去做个试验', 'An experiment in the past'),
      story: T('app.js 已经到 v3 了，你想看看 v1 时的样子，并在那个版本上试一个 experiment.js。试完如果有用就留下来，但 main 不能受影响。',
        'app.js is at v3, but you want to see what v1 looked like and try an experiment.js on top of it. If it works you\'ll keep it, but main must stay untouched.'),
    },
    crude: {
      steps: [
        step('📂', '找到 v1 的备份文件夹', 'Find the v1 backup folder'),
        step('✏️', '直接在备份里改', 'Edit right inside the backup'),
        step('😵', '过几天就分不清哪个是原始备份、哪个被改过', 'A few days later you can\'t tell the original backup from the edited one'),
      ],
      pain: T('旧备份一旦被改过就不再可信，试验成果也没有地方安放', 'Once an old backup is edited it can\'t be trusted, and the experiment has nowhere to live'),
    },
    git: {
      idea: T('git checkout <提交> 让 HEAD 直接指向旧提交（detached HEAD）；想保留成果就用 git switch -c 建个分支接住它', 'git checkout <commit> points HEAD straight at an old commit (detached HEAD); to keep what you make, catch it with git switch -c'),
      commands: ['git checkout HEAD~2', 'git commit', 'git switch -c', 'git switch main'],
    },
    expect: [
      T('你会看到 detached HEAD 警告——这只是提醒：这里的提交还不属于任何分支', 'You\'ll see a detached HEAD warning. It\'s only a reminder that commits here don\'t belong to any branch yet'),
      T('建好分支后，试验提交就有了名字，不会丢', 'Once you create a branch, the experiment has a name and won\'t get lost'),
    ],
    tasks: [
      task('graph', 'HEAD 直接指向 v1，不再跟着任何分支', 'HEAD now points straight at v1 and follows no branch'),
      task('graph', '在过去的版本上做一个试验提交', 'Make an experimental commit on the old version'),
      task('graph', '给试验提交挂上分支名，保住它', 'Hang a branch name on the experiment to keep it safe'),
      task('trees', '回到 main，工作区回到 v3', 'Back on main, the working tree returns to v3'),
    ],
    recap: {
      crude: T('在旧备份上直接改，原始版本被污染', 'Editing an old backup in place ruins the original'),
      git: T('随时回到任意版本，试验成果用分支保存', 'Visit any version at any time, and keep experiments on a branch'),
      pitfalls: [
        T('在 detached HEAD 上提交后直接切走，提交就“丢”了（还能用 reflog 找）', 'Committing on a detached HEAD and switching away "loses" it (reflog can still find it)'),
        T('把 detached HEAD 当成错误，吓得不敢动', 'Treating detached HEAD as an error and freezing up'),
      ],
      next: T('下一关：要发布了！给这个版本起个永久的名字', 'Next: release time! Give this version a permanent name'),
    },
  };

  levels['c3-8'] = {
    problem: {
      title: T('给发布版本起个名字', 'Name your release'),
      story: T('“发布准备”完成了，这就是 1.0 正式版。以后你想随时找到它、比较它和下一版的区别，而不是记一串哈希。',
        '"Prepare release" is done: this is version 1.0. From now on you want to find it and compare it with the next version any time, without memorising a hash.'),
    },
    crude: {
      steps: [
        step('📁', '把备份文件夹改名为 release_v1.0', 'Rename the backup folder to release_v1.0'),
        step('🤞', '祈祷没人再往里面改东西', 'Hope nobody edits it later'),
        step('🔍', '比较两个版本时再 diff -r 一遍', 'Run diff -r whenever you compare two versions'),
      ],
      pain: T('文件夹名随时能被改、内容随时能被动，“v1.0”到底是什么谁也不敢保证', 'Folder names and contents can change any time, so nobody can vouch for what "v1.0" really is'),
    },
    git: {
      idea: T('标签是钉在某个提交上的永久名字，不随新提交移动；任何需要写提交的地方都能写 v1.0', 'A tag is a permanent name pinned to one commit; it doesn\'t move with new commits, and v1.0 works anywhere a commit is expected'),
      commands: ['git tag -a v1.0 -m', 'git tag v1.1', 'git diff v1.0 v1.1'],
    },
    expect: [
      T('附注标签（-a）会记录打标签的人和说明，轻量标签只是一个名字', 'An annotated tag (-a) records who tagged it and why; a lightweight tag is just a name'),
      T('提交图上会出现标签徽章', 'Tag badges appear on the commit graph'),
    ],
    tasks: [
      task('graph', '给当前提交钉上 v1.0', 'Pin v1.0 on the current commit'),
      task('graph', '新提交之后打 v1.1，v1.0 留在原地不动', 'Tag v1.1 after a new commit; v1.0 stays where it was'),
      task('terminal', '用版本名直接比较两个版本', 'Compare two versions by name'),
    ],
    recap: {
      crude: T('用改名的文件夹当版本号，不可靠', 'Renamed folders as version numbers: unreliable'),
      git: T('标签永久指向一个提交，用名字就能 show、diff、checkout', 'A tag permanently marks one commit; show, diff and checkout by name'),
      pitfalls: [
        T('以为 git push 会自动推送标签——要 git push --tags 或 git push origin v1.0', 'Thinking git push sends tags too; use git push --tags or git push origin v1.0'),
        T('给错误的提交打了标签：git tag -d 删掉重打', 'Tagging the wrong commit: git tag -d and tag again'),
      ],
      next: T('下一站：如果两条分支改的是同一行呢？——冲突', 'Next stage: what if two branches change the same line? Conflicts'),
    },
  };

  /* ===== 第 4 站：改了同一处 ===== */
  levels['c4-1'] = {
    problem: {
      title: T('两条分支改了同一行', 'Two branches changed the same line'),
      story: T('feature 分支把问候语改成了 "Hi, … !"，main 上有人给名字加了 .trim()。两处改的都是 greeting.js 的同一行，现在要把 feature 合进 main，两边的改动都想要。',
        'The feature branch changed the greeting to "Hi, … !", while someone on main added .trim() to the name. Both edited the same line of greeting.js, and now you need to merge feature into main keeping both changes.'),
    },
    crude: {
      steps: [
        { icon: '🗂️', text: T('把两个版本的 greeting.js 并排打开', 'Open the two versions of greeting.js side by side') },
        { icon: '👀', text: T('逐行肉眼对比，猜哪行是谁改的', 'Compare line by line by eye and guess who changed what') },
        { icon: '💬', text: T('在群里问“这行你改过吗？”', 'Ask in the group chat: "did you touch this line?"') },
        { icon: '💾', text: T('手工拼一个版本，覆盖保存', 'Stitch a version together by hand and save over the old one') },
      ],
      pain: T('很容易漏掉一边的改动，而且拼完之后谁也说不清当初两边各改了什么', 'It\'s easy to drop one side\'s change, and afterwards nobody can tell what each side originally did'),
    },
    git: {
      idea: T('git 把能自动合的都合好，只把真正冲突的那几行用标记圈出来，你改好后 add + commit 即可', 'git merges everything it can and marks only the truly conflicting lines; fix them, then add + commit'),
      commands: ['git merge', 'cat', 'edit', 'git add', 'git status', 'git commit'],
    },
    expect: [
      T('你会看到 CONFLICT——这不是出错，是 git 在请你做决定', 'You\'ll see CONFLICT. It\'s not an error; git is asking you to decide'),
      T('冲突标记看起来吓人，其实只是两段文字：上面是你这边，下面是对方', 'The markers look scary, but they are just two pieces of text: yours on top, theirs below'),
    ],
    tasks: [
      { focus: 'terminal', why: T('发起合并，让 git 找出两边都改了的地方', 'Start the merge so git can find where both sides changed') },
      { focus: 'editor', why: T('读懂标记，写出同时包含两边改动的最终版本', 'Read the markers and write a final version with both changes') },
      { focus: 'trees', why: T('add 就是告诉 git“这个文件我解决好了”', 'add tells git "I\'ve resolved this file"') },
      { focus: 'graph', why: T('生成合并提交，两条分支在图上汇合', 'Create the merge commit; the two branches join on the graph') },
    ],
    recap: {
      crude: T('肉眼比对 + 手工拼接，容易丢改动，也留不下记录', 'Eyeball diffing and hand-stitching loses changes and leaves no record'),
      git: T('自动合并无关改动，只把真冲突交给你，合并过程完整记在历史里', 'Unrelated changes merge automatically, only real clashes reach you, and the merge is recorded in history'),
      pitfalls: [
        T('忘了删掉 <<<<<<< ======= >>>>>>> 标记就提交', 'Committing with <<<<<<< ======= >>>>>>> markers still in the file'),
        T('只保留一边，把另一边的改动悄悄丢了', 'Keeping only one side and silently dropping the other'),
      ],
      next: T('下一关：合并到一半想反悔，或者干脆只要一边的版本？', 'Next: want to back out of a merge halfway, or just take one side?'),
    },
  };

  levels['c4-2'] = {
    problem: {
      title: T('合并到一半想反悔', 'Second thoughts mid-merge'),
      story: T('还是 greeting.js 的那处冲突：feature 改成了 Hi，main 加了 trim。你想先取消合并冷静一下；想清楚后，团队决定直接采用 feature 的版本。',
        'Same clash in greeting.js: feature says Hi, main added trim. First you want to back out and think; then the team decides to simply take feature\'s version.'),
    },
    crude: {
      steps: [
        step('😰', '手工合到一半，发现越合越乱', 'Halfway through a manual merge, it\'s getting messier'),
        step('🔙', '想回到开始之前，可是没留备份', 'You want to go back to before you started, but there\'s no backup'),
        step('📋', '最后干脆拷对方的整份文件覆盖', 'In the end you just overwrite with the other person\'s whole file'),
      ],
      pain: T('合到一半没法撤回，文件卡在半新半旧的状态', 'There\'s no way to undo a half-done merge; the file is stuck half old, half new'),
    },
    git: {
      idea: T('git merge --abort 一键回到合并前；确定要某一边时，git checkout --theirs / --ours 直接取那一边的整份文件', 'git merge --abort takes you straight back to before the merge; when you know which side wins, git checkout --theirs / --ours takes that side\'s whole file'),
      commands: ['git merge', 'git merge --abort', 'git status', 'git checkout --theirs', 'git add', 'git commit'],
    },
    expect: [
      T('abort 之后一切像没发生过，status 显示工作区干净', 'After abort it\'s as if nothing happened; status shows a clean working tree'),
      T('merge 时 --theirs 指“被合并进来的那条分支”（这里是 feature）', 'During a merge, --theirs means the branch being merged in (here, feature)'),
    ],
    tasks: [
      task('terminal', '遇到冲突先别慌，你随时可以退出来', 'Hit a conflict? No panic: you can always back out'),
      task('trees', '确认已经完全回到合并之前', 'Confirm you\'re fully back to before the merge'),
      task('editor', '这次直接采用 feature 的整份版本，再完成合并', 'This time take feature\'s whole version and finish the merge'),
    ],
    recap: {
      crude: T('合到一半无法回头', 'A half-done manual merge can\'t be undone'),
      git: T('--abort 随时反悔，--ours / --theirs 一键选边', '--abort to back out at any time, --ours / --theirs to pick a side in one step'),
      pitfalls: [
        T('用 --theirs 前没想清楚，把自己这边的改动整个丢了', 'Using --theirs without thinking and throwing away your own side entirely'),
        T('rebase 时 ours / theirs 的含义正好反过来', 'During a rebase, ours / theirs mean the opposite'),
      ],
      next: T('下一关：用 rebase 时遇到冲突怎么办？', 'Next: what happens when a rebase hits a conflict?'),
    },
  };

  levels['c4-3'] = {
    problem: {
      title: T('rebase 途中撞上冲突', 'A conflict in the middle of a rebase'),
      story: T('还是 greeting.js 那一行。这次你在 feature 上 rebase 到 main，想让历史保持直线。重放“问候语改成 Hi”时，撞上了 main 上的 trim 改动。',
        'That same line in greeting.js. This time you rebase feature onto main to keep history straight, and replaying "Change greeting to Hi" collides with main\'s trim change.'),
    },
    crude: {
      steps: [
        step('📁', '从 main 最新版复制一份', 'Copy main\'s latest version'),
        step('✏️', '重做自己的改动，发现同一行已经被别人改了', 'Redo your change and find someone already changed that line'),
        step('🤔', '只能自己琢磨怎么拼', 'Work out on your own how to combine them'),
      ],
      pain: T('重做改动时撞上别人的修改，没有任何标记告诉你冲突在哪', 'Redoing work runs into other people\'s edits with nothing marking where the clash is'),
    },
    git: {
      idea: T('rebase 逐个重放提交，哪一步冲突就停在哪一步：解决 → git add → git rebase --continue', 'rebase replays commits one at a time and pauses at the one that conflicts: resolve → git add → git rebase --continue'),
      commands: ['git rebase main', 'edit', 'git add', 'git rebase --continue', 'git log --oneline --graph --all'],
    },
    expect: [
      T('rebase 冲突时 HEAD 那一半是 main，下半部分才是你的提交——和 merge 正好相反', 'In a rebase conflict the HEAD half is main and the lower half is your commit, the reverse of a merge'),
      T('解决后不用 commit，--continue 会替你完成', 'No need to commit after resolving; --continue does it for you'),
    ],
    tasks: [
      task('terminal', '开始重放，在冲突的那一步停下', 'Start replaying; it stops at the conflicting step'),
      task('editor', '写出两边都要的最终版本，标记已解决并继续', 'Write the final version with both changes, mark it resolved and continue'),
      task('graph', '确认历史是一条直线，没有合并提交', 'Check that history is a straight line with no merge commit'),
    ],
    recap: {
      crude: T('重做时撞上别人的修改，全靠自己发现', 'Collisions while redoing work, found only if you notice'),
      git: T('rebase 在冲突处暂停，解决后继续，历史依然笔直', 'rebase pauses at the conflict, continues once resolved, and history stays straight'),
      pitfalls: [
        T('解决冲突后执行了 git commit 而不是 --continue', 'Running git commit instead of --continue after resolving'),
        T('搞乱了不知道怎么办——git rebase --abort 回到起点', 'Getting lost: git rebase --abort takes you back to the start'),
      ],
      next: T('下一关：一边删了文件，另一边却改了它', 'Next: one side deleted a file the other side edited'),
    },
  };

  levels['c4-4'] = {
    problem: {
      title: T('一个删了，一个改了', 'One deleted it, one edited it'),
      story: T('feature 分支把 legacy.js 删了（“删除旧代码”），而 main 上有人还在给它打补丁（“修改旧代码”）。团队讨论后决定：删掉。',
        'The feature branch deleted legacy.js ("Remove old code"), while someone on main was still patching it ("Tweak old code"). The team decides: delete it.'),
    },
    crude: {
      steps: [
        step('💬', '群里问：“legacy.js 还要不要？”', 'Ask the group: "Do we still need legacy.js?"'),
        step('🗂️', '有人的备份里有它，有人的没有', 'Some people\'s copies have it, some don\'t'),
        step('🧟', '过几天它又被谁拷了回来', 'A few days later someone copies it back in'),
      ],
      pain: T('删除没有记录，文件会在不同人的副本之间反复“复活”', 'Deletions aren\'t recorded, so the file keeps coming back to life between people\'s copies'),
    },
    git: {
      idea: T('一边删、一边改时 git 会报 modify/delete 冲突，逼你明确表态：git add 保留，git rm 删除', 'When one side deletes and the other edits, git reports a modify/delete conflict and makes you choose: git add to keep, git rm to delete'),
      commands: ['git merge', 'git rm', 'git commit'],
    },
    expect: [
      T('你会看到 CONFLICT (modify/delete)，文件里没有冲突标记——要决定的是整个文件的去留', 'You\'ll see CONFLICT (modify/delete) with no markers in the file: the decision is about the whole file'),
      T('git status 会提示你用 add 或 rm 来表态', 'git status tells you to use add or rm to decide'),
    ],
    tasks: [
      task('terminal', '合并，看 git 报出 modify/delete 冲突', 'Merge and watch git report a modify/delete conflict'),
      task('trees', '表态：删除 legacy.js', 'Make the call: delete legacy.js'),
      task('graph', '完成合并，main 上不再有 legacy.js', 'Finish the merge; legacy.js is gone from main'),
    ],
    recap: {
      crude: T('删没删全凭口头约定，文件会莫名复活', 'Deletions rely on verbal agreements, and files mysteriously return'),
      git: T('删除也是一种改动，冲突时 git 逼你明确表态', 'A deletion is a change too, and git makes you decide explicitly when it conflicts'),
      pitfalls: [
        T('在文件里找冲突标记却找不到——modify/delete 冲突本来就没有标记', 'Searching the file for markers that aren\'t there: modify/delete conflicts have none'),
        T('随手 git add，保留了本该删除的文件', 'Running git add on autopilot and keeping a file that should be deleted'),
      ],
      next: T('下一站：团队的代码在服务器上，先把它拿到你的电脑上', 'Next stage: the team\'s code lives on a server. First, get it onto your computer'),
    },
  };

  /* ===== 第 5 站：多台电脑异步协作 ===== */
  levels['c5-1'] = {
    problem: {
      title: T('加入团队，拿到代码', 'Join the team, get the code'),
      story: T('你刚加入团队，代码在 https://github.com/team/project.git 上，小明早就 clone 了一份。你需要一份完整、能跟上团队进度的本地副本。',
        'You\'ve just joined the team. The code lives at https://github.com/team/project.git and Xiaoming cloned it long ago. You need a complete local copy that can keep up with the team.'),
    },
    crude: {
      steps: [
        step('💬', '群里问：“谁有最新的代码？”', 'Ask the group: "Who has the latest code?"'),
        step('📦', '小明发来一个 project_最新.zip', 'Xiaoming sends you project_latest.zip'),
        step('❓', '解压后也不知道它比服务器上的新还是旧', 'After unzipping, you still don\'t know if it\'s newer or older than the server'),
      ],
      pain: T('拿到的只是某个人某一刻的文件，没有历史，也不知道和别人是不是同一版', 'You get one person\'s files at one moment, with no history and no idea whether it matches everyone else\'s'),
    },
    git: {
      idea: T('git clone 复制整个仓库（包括全部历史），并自动记住来源 origin，以后随时同步', 'git clone copies the whole repository, full history included, and remembers where it came from (origin) for future syncing'),
      commands: ['git clone', 'git remote -v', 'git branch -a', 'git log --oneline'],
    },
    expect: [
      T('clone 之后会多出 origin/main——它是你对服务器上 main 的“最后一次记忆”', 'After cloning you\'ll have origin/main: your last memory of the server\'s main'),
      T('历史是完整的：2 个提交一个不少', 'The history is complete: both commits are there'),
    ],
    tasks: [
      task('multi', '把服务器上的仓库完整复制到本地', 'Copy the whole repository from the server to your machine'),
      task('multi', '看看你的仓库记住的远程地址', 'Check the remote address your repository remembers'),
      task('graph', '本地 main 和远程跟踪分支 origin/main 都在', 'Both your local main and the remote-tracking origin/main are there'),
      task('graph', '完整历史都下载下来了', 'The full history came down with it'),
    ],
    recap: {
      crude: T('拿到的是一个没有历史的压缩包', 'You get a zip with no history'),
      git: T('clone 拿到完整历史，并知道以后从哪儿同步', 'clone brings the full history and knows where to sync from'),
      pitfalls: [
        T('在已有的 project 目录里再 clone，路径变成 project/project', 'Cloning inside an existing project folder and ending up with project/project'),
        T('以为 origin/main 会自动更新——要 fetch 才会', 'Expecting origin/main to update by itself; it only does on fetch'),
      ],
      next: T('下一关：本地提交了，怎么让大家看到？', 'Next: you\'ve committed locally. How does everyone else see it?'),
    },
  };

  levels['c5-2'] = {
    problem: {
      title: T('把我的提交发给大家', 'Share your commit with everyone'),
      story: T('你新建了 hello.js 并提交了，但这个提交只存在你的电脑上，小明那边什么也看不到。',
        'You created hello.js and committed it, but that commit exists only on your computer. Xiaoming can\'t see a thing.'),
    },
    crude: {
      steps: [
        step('📦', '把项目打包成 zip', 'Zip up the project'),
        step('☁️', '传到网盘，覆盖旧的', 'Upload it to the shared drive over the old one'),
        step('💬', '群里喊一声“我更新了”', 'Post "I updated it" in the group chat'),
      ],
      pain: T('每次都要打包、上传、通知，别人也看不出你具体改了什么', 'Zip, upload, announce, every time, and nobody can see what you actually changed'),
    },
    git: {
      idea: T('git push 把本地的新提交上传到服务器，远程的 main 前移到你的提交', 'git push uploads your new commits to the server and moves the remote main forward to them'),
      commands: ['git add', 'git commit', 'git status', 'git push'],
    },
    expect: [
      T('提交后 status 会显示 ahead by 1：你比服务器多一个提交', 'After committing, status says ahead by 1: you have one commit the server doesn\'t'),
      T('push 之后变成 up to date', 'After pushing it says up to date'),
    ],
    tasks: [
      task('graph', '先在本地提交', 'Commit locally first'),
      task('multi', 'status 告诉你：本地领先远程 1 个提交', 'status tells you: you\'re 1 commit ahead of the remote'),
      task('multi', '推送之后，本地和远程一致', 'After pushing, local and remote match'),
    ],
    recap: {
      crude: T('打包、上传、群里通知三件套', 'The zip, upload, announce routine'),
      git: T('一个 push，服务器和同事都能看到完整的提交', 'One push, and the server and teammates see the whole commit'),
      pitfalls: [
        T('只 commit 不 push，以为同事已经能看到', 'Committing without pushing and assuming teammates can see it'),
        T('搞混 ahead 和 behind：ahead 是你有、服务器没有的提交', 'Mixing up ahead and behind: ahead means commits you have and the server doesn\'t'),
      ],
      next: T('下一关：小明推送了新提交，你怎么拿到？', 'Next: Xiaoming pushed a new commit. How do you get it?'),
    },
  };

  levels['c5-3'] = {
    problem: {
      title: T('同事更新了，我怎么知道？', 'A teammate updated. How would I know?'),
      story: T('小明刚推送了“小明：新增功能”（xiaoming.js）。你的电脑不会自动知道。你想先看看他改了什么，再合进来。',
        'Xiaoming just pushed "Xiaoming: add feature" (xiaoming.js). Your computer doesn\'t know yet. You want to see what he changed before bringing it in.'),
    },
    crude: {
      steps: [
        step('💬', '群里问：“有人更新了吗？”', 'Ask the group: "Did anyone update?"'),
        step('📥', '下载小明传的 zip', 'Download Xiaoming\'s zip'),
        step('🔍', '和自己的文件夹逐个对比', 'Compare it with your folder file by file'),
      ],
      pain: T('不问就不知道有更新，下载后还得自己对比才知道改了什么', 'You only learn of updates by asking, and then must compare by hand to see what changed'),
    },
    git: {
      idea: T('git fetch 只下载、不动你的文件，先看再决定；git pull = fetch + 合并', 'git fetch downloads without touching your files, so you can look first; git pull = fetch + merge'),
      commands: ['git fetch', 'git status', 'git log origin/main', 'git diff main origin/main', 'git pull'],
    },
    expect: [
      T('fetch 后 status 显示 behind by 1：服务器比你多一个提交', 'After fetch, status says behind by 1: the server has one commit you don\'t'),
      T('这次 pull 是快进，因为你本地没有新提交', 'This pull is a fast-forward, since you have no new local commits'),
    ],
    tasks: [
      task('multi', '下载远程的新提交，发现你落后了 1 个', 'Download the new remote commits and see you\'re 1 behind'),
      task('graph', '合并之前，先看看小明改了什么', 'Before merging, look at what Xiaoming changed'),
      task('graph', '把小明的提交合进你的 main', 'Bring Xiaoming\'s commit into your main'),
    ],
    recap: {
      crude: T('靠群聊得知更新，靠肉眼对比变化', 'Learning about updates from the chat and spotting changes by eye'),
      git: T('fetch 安全地看，pull 一步合入', 'fetch to look safely, pull to bring it in'),
      pitfalls: [
        T('以为 fetch 会改你的文件——它只更新 origin/main', 'Thinking fetch changes your files; it only updates origin/main'),
        T('有未提交的改动时直接 pull，可能被拒绝', 'Pulling with uncommitted changes, which may be refused'),
      ],
      next: T('下一关：你和小明同时提交，他先推了……', 'Next: you and Xiaoming both committed, and he pushed first…'),
    },
  };

  levels['c5-4'] = {
    problem: {
      title: T('push 被拒绝了', 'Your push was rejected'),
      story: T('你和小明都从同一个版本出发。小明先推送了“小明：新增功能”，你随后想推送“我：新增功能”，服务器却拒绝了你。',
        'You and Xiaoming started from the same version. Xiaoming pushed "Xiaoming: add feature" first; now you try to push "Me: add feature" and the server says no.'),
    },
    crude: {
      steps: [
        { icon: '📦', text: T('你把项目打包成“最新版.zip”传到网盘', 'You upload the project to the shared drive as "latest.zip"') },
        { icon: '💥', text: T('小明十分钟前传的“最新版.zip”被你直接覆盖', 'The "latest.zip" Xiaoming uploaded ten minutes ago gets overwritten') },
        { icon: '🤷', text: T('第二天小明问：“我的功能怎么没了？”', 'Next day Xiaoming asks: "where did my feature go?"') },
      ],
      pain: T('后上传的悄悄覆盖先上传的，没有任何提示，丢了也不知道是什么时候丢的', 'The last upload silently overwrites the earlier one; no warning, and no idea when the work was lost'),
    },
    git: {
      idea: T('服务器只接受“在它最新版本之上”的推送；先把别人的提交拉下来整合，再推', 'The server only accepts pushes built on top of its latest version; pull others\' commits in first, then push'),
      commands: ['git push', 'git pull --rebase', 'git pull --no-rebase'],
    },
    expect: [
      T('你会看到 push 被拒绝（rejected）——这是 git 在保护小明的提交', 'You\'ll see the push rejected. That\'s git protecting Xiaoming\'s commit'),
      T('pull --rebase 会把你的提交挪到小明的后面，提交哈希会变，这是正常的', 'pull --rebase moves your commit after Xiaoming\'s, so its hash changes. That\'s normal'),
    ],
    tasks: [
      { focus: 'multi', why: T('亲眼看到服务器拒绝覆盖小明的提交', 'See for yourself the server refusing to overwrite Xiaoming\'s commit') },
      { focus: 'graph', why: T('把小明的提交拉下来，你的提交接在它后面', 'Bring in Xiaoming\'s commit and put yours on top of it') },
      { focus: 'multi', why: T('现在是在最新版本之上推送，服务器会接受', 'Now you\'re pushing on top of the latest version, so the server accepts it') },
    ],
    recap: {
      crude: T('网盘上后传的覆盖先传的，丢了工作都没人察觉', 'On a shared drive the last upload wins and lost work goes unnoticed'),
      git: T('服务器拒绝会覆盖别人的推送，先 pull 再 push，两个人的工作都保住', 'The server refuses pushes that would overwrite others; pull then push and both people\'s work survives'),
      pitfalls: [
        T('被拒绝后第一反应用 --force 强推，结果把小明的提交抹掉', 'Reaching for --force after a rejection and wiping out Xiaoming\'s commit'),
        T('只 fetch 不整合就再推，还是会被拒绝', 'Fetching without integrating and pushing again: still rejected'),
      ],
      next: T('下一关：如果你和小明改的恰好是同一行呢？', 'Next: what if you and Xiaoming changed the very same line?'),
    },
  };

  levels['c5-5'] = {
    problem: {
      title: T('我和小明改了同一行', 'Xiaoming and I changed the same line'),
      story: T('config.js 里的 timeout 原本是 1000。小明改成 3000 并先推送了，你在本地改成了 5000。团队讨论后决定用 5000。',
        'timeout in config.js was 1000. Xiaoming changed it to 3000 and pushed first; you changed it to 5000 locally. After discussion the team picks 5000.'),
    },
    crude: {
      steps: [
        step('☁️', '小明把他的 config.js 传上网盘', 'Xiaoming uploads his config.js to the shared drive'),
        step('☁️', '你随后上传，直接覆盖了他的', 'You upload yours afterwards, overwriting his'),
        step('🤷', '谁也没发现 3000 被覆盖了，也没人讨论过该用哪个', 'Nobody notices 3000 was overwritten, and nobody ever discussed which to use'),
      ],
      pain: T('同一行的分歧被“后上传的赢”悄悄决定了', 'The disagreement is silently settled by "last upload wins"'),
    },
    git: {
      idea: T('pull 时同一行的冲突会像本地冲突一样被标出来；你定下最终值，继续 rebase（或提交），再推送', 'On pull, the same-line clash is marked just like a local conflict; decide the final value, continue the rebase (or commit), then push'),
      commands: ['git pull --rebase', 'edit', 'git add', 'git rebase --continue', 'git push'],
    },
    expect: [
      T('pull 会报 CONFLICT——处理方式和本地冲突一模一样', 'pull reports CONFLICT, and you handle it exactly like a local one'),
      T('用 pull --rebase 时，标记上半部分是小明（远程），下半部分是你', 'With pull --rebase, the top half of the markers is Xiaoming\'s (remote) and the bottom half is yours'),
    ],
    tasks: [
      task('multi', '拉取小明的提交，撞上同一行的冲突', 'Pull Xiaoming\'s commit and hit the same-line conflict'),
      task('editor', '定下最终值 5000，标记已解决并继续', 'Settle on 5000, mark it resolved and continue'),
      task('multi', '推送：服务器上两个人的提交都在', 'Push: both people\'s commits are on the server'),
    ],
    recap: {
      crude: T('后上传的悄悄覆盖先上传的，分歧没人知道', 'The last upload silently overwrites the first, and nobody knows there was a disagreement'),
      git: T('冲突被明确标出，由人来决定，两人的修改都记在历史里', 'The conflict is flagged, a human decides, and both edits are recorded in history'),
      pitfalls: [
        T('不和小明沟通，就把他那一边整段删掉', 'Deleting Xiaoming\'s side without talking to him'),
        T('忘了 rebase --continue 就 push，结果被拒绝', 'Pushing before rebase --continue and getting rejected'),
      ],
      next: T('下一关：团队规范——在功能分支上协作，而不是直接改 main', 'Next: team etiquette. Collaborate on a feature branch instead of editing main'),
    },
  };

  levels['c5-6'] = {
    problem: {
      title: T('在功能分支上协作', 'Collaborate on a feature branch'),
      story: T('团队规定不直接在 main 上开发。你要做搜索功能：开 feature/search 分支、推上去请小明 review。他会在你的分支上补一个提交，最后合进 main。',
        'Team rule: no working directly on main. You\'re building search: create feature/search, push it for Xiaoming to review; he\'ll add a commit to your branch, and finally it goes into main.'),
    },
    crude: {
      steps: [
        step('📁', '复制一份“搜索功能”文件夹', 'Copy a "search feature" folder'),
        step('📦', '打包发给小明看', 'Zip it and send it to Xiaoming'),
        step('📦', '小明改完再打包发回来', 'Xiaoming edits and zips it back'),
        step('📋', '最后手工合进正式版', 'Finally merge it into the real version by hand'),
      ],
      pain: T('zip 来回传几轮，很快就搞不清谁的是最新版，合进正式版时还可能漏掉小明的修改', 'After a few rounds of zips nobody knows which is newest, and merging into the real version may drop Xiaoming\'s edits'),
    },
    git: {
      idea: T('功能分支也能推到服务器，大家在同一条分支上协作；完成后合进 main，再删掉分支', 'Feature branches can be pushed too, so everyone works on the same branch; when done, merge into main and delete it'),
      commands: ['git switch -c', 'git push -u origin', 'git pull', 'git merge', 'git push', 'git push origin --delete', 'git branch -d'],
    },
    expect: [
      T('-u 会建立跟踪关系，以后在这个分支上直接 git push / git pull 就行', '-u sets up tracking, so on this branch plain git push / git pull just work'),
      T('小明的 review 提交会出现在你的分支上，pull 一下就能拿到', 'Xiaoming\'s review commit lands on your branch; a pull brings it in'),
    ],
    tasks: [
      task('graph', '在自己的分支上开发，不碰 main', 'Develop on your own branch without touching main'),
      task('multi', '把分支推上服务器，让小明能看到', 'Push the branch to the server so Xiaoming can see it'),
      task('multi', '拿到小明在你分支上补的提交', 'Get the commit Xiaoming added to your branch'),
      task('graph', '功能完成，合进 main 并推送', 'Feature done: merge into main and push'),
      task('multi', '清理用完的分支：本地和远程都删', 'Clean up the finished branch, both local and remote'),
    ],
    recap: {
      crude: T('zip 来回传，版本很快就乱了', 'Zips going back and forth, versions soon in chaos'),
      git: T('分支推到服务器，协作、review、合并都有据可查', 'Branches on the server keep collaboration, review and merging on the record'),
      pitfalls: [
        T('忘了 -u，之后 git push 提示没有上游分支', 'Forgetting -u, so git push later complains about no upstream branch'),
        T('合并完忘了删远程分支，服务器上分支越积越多', 'Not deleting remote branches after merging, so they pile up on the server'),
      ],
      next: T('下一关：改了已经推送的提交，想强推覆盖……小心！', 'Next: you amended a pushed commit and want to force-push. Careful!'),
    },
  };

  levels['c5-7'] = {
    problem: {
      title: T('想强推，差点抹掉同事的工作', 'A force push that nearly erased a teammate\'s work'),
      story: T('你推送了“add feature”，然后发现忘了带测试，就用 amend 改成了“add feature (with tests)”。push 被拒绝，你想干脆 --force——却不知道小明刚刚推送了“小明：重要工作”。',
        'You pushed "add feature", then noticed the missing tests and amended it into "add feature (with tests)". The push is rejected, so you think about --force, not knowing Xiaoming just pushed "Xiaoming: important work".'),
    },
    crude: {
      steps: [
        step('🙋', '你心想：“反正都是我的文件”', 'You think: "they\'re my files anyway"'),
        step('☁️', '直接上传，覆盖网盘上的版本', 'You upload and overwrite the shared copy'),
        step('💥', '小明刚传上去的重要工作被一起覆盖', 'The important work Xiaoming had just uploaded is overwritten too'),
      ],
      pain: T('覆盖之前没有任何检查，别人刚上传的东西说没就没', 'Nothing checks before overwriting, so someone\'s fresh upload simply disappears'),
    },
    git: {
      idea: T('--force-with-lease 只在远程还是“你上次看到的样子”时才覆盖；发现有新提交就拒绝，你 fetch + rebase 后普通 push 即可', '--force-with-lease only overwrites if the remote still looks the way you last saw it; if there\'s something new it refuses, and you fetch + rebase, then push normally'),
      commands: ['git push', 'git push --force-with-lease', 'git fetch', 'git log origin/main', 'git rebase origin/main'],
    },
    expect: [
      T('你会连续被拒绝两次：普通 push 被拒，--force-with-lease 也被拒（stale info）——这次拒绝救了小明', 'You\'ll be rejected twice: the normal push, then --force-with-lease (stale info). That second refusal saves Xiaoming'),
      T('rebase 之后你的提交排在小明后面，普通 push 就能成功', 'After the rebase your commit sits after Xiaoming\'s, and a normal push succeeds'),
    ],
    tasks: [
      task('multi', '普通 push 被拒绝：本地和远程分叉了', 'The normal push is rejected: local and remote have diverged'),
      task('multi', '带保险的强推：远程变了，所以拒绝覆盖', 'The safe force push: the remote changed, so it refuses to overwrite'),
      task('graph', '发现小明的新提交，把你的提交挪到它后面', 'Discover Xiaoming\'s new commit and move yours after it'),
      task('multi', '现在是快进推送，不需要强推，两个人的工作都在', 'Now it\'s a fast-forward push, no force needed, and both people\'s work survives'),
    ],
    recap: {
      crude: T('直接覆盖上传，别人刚传的工作被抹掉', 'Blind overwrites wipe out work others just uploaded'),
      git: T('--force-with-lease 在覆盖前检查，发现新提交就拦住你', '--force-with-lease checks before overwriting and stops you if something new arrived'),
      pitfalls: [
        T('用 --force 而不是 --force-with-lease', 'Using --force instead of --force-with-lease'),
        T('先 fetch 再 --force-with-lease 却不看 origin/main——保护就失效了', 'Fetching and then using --force-with-lease without reading origin/main, which defeats the protection'),
      ],
      next: T('下一站：出事故了——文件删了才发现还要用', 'Next stage: disaster. You deleted a file and then realised you need it'),
    },
  };

  /* ===== 第 6 站：出事故了 ===== */
  levels['c6-1'] = {
    problem: {
      title: T('删了才发现还要用', 'Deleted it, then needed it'),
      story: T('你用 git rm 删掉了 old-module.js，并提交了“移除旧模块”。几分钟后才发现，里面“非常重要的旧逻辑”还得用。',
        'You deleted old-module.js with git rm and committed "Remove old module". Minutes later you realise its "very important old logic" is still needed.'),
    },
    crude: {
      steps: [
        step('🗑️', '删掉文件', 'Delete the file'),
        step('♻️', '去回收站找，已经清空了', 'Check the recycle bin: already emptied'),
        step('📂', '翻备份文件夹，不知道哪一份里还有它', 'Search the backups, not knowing which one still has it'),
      ],
      pain: T('删除就是永久的；备份里有没有、哪一份最新，都得一个个看', 'Deletion is permanent, and you must open every backup to see which has it and which is newest'),
    },
    git: {
      idea: T('删除只是历史里的一次改动，文件永远留在旧提交里：git checkout <旧提交> -- 文件 就能取回', 'A deletion is just one change in history; the file lives on in older commits, and git checkout <old commit> -- <file> brings it back'),
      commands: ['git rm', 'git commit', 'git log --oneline -- <file>', 'git checkout HEAD~1 -- <file>'],
    },
    expect: [
      T('git log -- old-module.js 只列出和这个文件有关的提交', 'git log -- old-module.js lists only the commits that touched that file'),
      T('取回后文件同时回到工作区和暂存区，再提交一次就正式回来了', 'Once restored the file is back in both the working tree and the staging area; commit to make it official'),
    ],
    tasks: [
      task('graph', '删除文件并提交，最新快照里没有它了', 'Delete the file and commit; the latest snapshot no longer has it'),
      task('graph', '在历史里找到还有它的那个提交', 'Find a commit in history that still has it'),
      task('trees', '从旧提交里把文件取回来，再存档', 'Pull the file out of the old commit and save it again'),
    ],
    recap: {
      crude: T('回收站一清就彻底没了', 'Once the recycle bin is emptied, it\'s gone'),
      git: T('提交过的文件永远留在历史里', 'Any committed file lives on in history'),
      pitfalls: [
        T('写成 git checkout HEAD~1（没有 -- 文件），整个项目跳到旧版本', 'Typing git checkout HEAD~1 without -- <file> and moving the whole project to the old version'),
        T('取回后忘了提交，下次又丢了', 'Restoring but forgetting to commit, so it gets lost again'),
      ],
      next: T('下一关：只想要某个文件的旧版本，其余保持最新', 'Next: you want one file\'s old version while everything else stays current'),
    },
  };

  levels['c6-2'] = {
    problem: {
      title: T('只让一个文件回到旧版本', 'Roll back just one file'),
      story: T('v1.0 之后有人提交了“用 eval 提速”，parser.js 变得快但危险；之后还有“其他改动”更新了 app.js。你只想让 parser.js 回到 v1.0 的安全版本，app.js 保持最新。',
        'After v1.0 someone committed "Use eval for speed", making parser.js fast but dangerous; "Other changes" then updated app.js. You want only parser.js back at its safe v1.0 version, with app.js kept up to date.'),
    },
    crude: {
      steps: [
        step('📂', '找到 v1.0 那份备份', 'Find the v1.0 backup'),
        step('📋', '只把 parser.js 拷过来覆盖', 'Copy only parser.js over'),
        step('🤞', '反复确认没把别的文件也拷错', 'Double-check you didn\'t copy anything else by mistake'),
      ],
      pain: T('要从旧备份里精准挑出一个文件，一不小心就把整个项目都退回去了', 'You must pick exactly one file out of an old backup; one slip and the whole project goes back'),
    },
    git: {
      idea: T('git show v1.0:parser.js 查看旧内容，git checkout v1.0 -- parser.js 只取回这一个文件', 'git show v1.0:parser.js shows the old content, and git checkout v1.0 -- parser.js brings back only that file'),
      commands: ['git show v1.0:parser.js', 'git checkout v1.0 -- parser.js', 'git commit'],
    },
    expect: [
      T('show 只是打印，不会改动任何文件', 'show only prints; it changes no files'),
      T('checkout 带上 -- 文件 时只影响那个文件，不会移动 HEAD', 'checkout with -- <file> affects only that file and doesn\'t move HEAD'),
    ],
    tasks: [
      task('terminal', '先看看旧版本长什么样', 'First look at the old version'),
      task('trees', '只把 parser.js 取回来，其他文件不动', 'Bring back only parser.js and leave the rest alone'),
      task('graph', '把回退存成一个新提交', 'Save the rollback as a new commit'),
    ],
    recap: {
      crude: T('从旧备份里挑文件拷，容易拷多拷错', 'Picking files from an old backup, easily copying too much or the wrong thing'),
      git: T('用“版本:路径”精确拿到任意文件的任意版本', '"version:path" gets any version of any file, precisely'),
      pitfalls: [
        T('写成 git checkout v1.0（没有 -- 文件），整个项目进入 detached HEAD', 'Typing git checkout v1.0 without -- <file> and putting the whole project in detached HEAD'),
        T('忘了提交，回退只停留在工作区', 'Forgetting to commit, so the rollback lives only in the working tree'),
      ],
      next: T('下一关：手滑删了一个还没合并的分支', 'Next: you accidentally deleted a branch that was never merged'),
    },
  };

  levels['c2-7'] = {
    problem: {
      title: T('手滑删了还没合并的分支', 'Deleted an unmerged branch by accident'),
      story: T('同事让你删掉没用的 old-experiment 分支，你顺手把 payment 也 -D 了——上面有“支付功能 v1”“支付功能 v2”两个还没合并的提交。',
        'A teammate asked you to delete the unused old-experiment branch, and you -D\'d payment too, along with two unmerged commits: "Payment feature v1" and "Payment feature v2".'),
    },
    crude: {
      steps: [
        step('🗑️', '把“支付功能”文件夹当垃圾删了', 'You trashed the "payment" folder by mistake'),
        step('♻️', '回收站早就清过了', 'The recycle bin was emptied long ago'),
        step('😭', '两天的支付代码只能重写', 'Two days of payment code to rewrite'),
      ],
      pain: T('文件夹一删，里面的工作就彻底没了', 'Delete the folder and the work inside is gone for good'),
    },
    git: {
      idea: T('分支只是指针，删掉的只是名字；用 reflog 找到它最后指向的提交，git branch payment <哈希> 就能复活', 'A branch is just a pointer, so only the name was deleted; find its last commit in the reflog and git branch payment <hash> brings it back'),
      commands: ['git branch', 'git reflog', 'git branch payment <hash>'],
    },
    expect: [
      T('git branch 里看不到 payment，看起来像彻底没了', 'git branch doesn\'t list payment, and it looks gone for good'),
      T('重建之后，payment 上的两个提交原样回来', 'Once recreated, both commits on payment are back as they were'),
    ],
    tasks: [
      task('graph', '确认 payment 分支不见了', 'Confirm the payment branch is gone'),
      task('terminal', '在 reflog 里找到“支付功能 v2”的哈希', 'Find the hash of "Payment feature v2" in the reflog'),
      task('graph', '把名字重新挂到那个提交上', 'Hang the name back on that commit'),
    ],
    recap: {
      crude: T('删文件夹 = 删掉工作', 'Deleting the folder deletes the work'),
      git: T('删分支只是删名字，提交还在，reflog 找得回', 'Deleting a branch only removes a name; the commits remain and reflog finds them'),
      pitfalls: [
        T('用 -D 强删前不看有没有未合并的提交（小写 -d 会提醒你）', 'Force-deleting with -D without checking for unmerged commits (lowercase -d would warn you)'),
        T('拖太久才找——reflog 条目会过期', 'Waiting too long: reflog entries eventually expire'),
      ],
      next: T('下一关：服务器上的提交被同事强推冲掉了', 'Next: a teammate\'s force push wiped your commit off the server'),
    },
  };

  levels['c6-3'] = {
    problem: {
      title: T('服务器被强推覆盖了', 'The server got force-pushed over'),
      story: T('你昨天推送了“重要功能”。今天小明误用 git push --force，把服务器上的 main 退回了老版本，你的提交在服务器上消失了。',
        'Yesterday you pushed "Important feature". Today Xiaoming ran git push --force by mistake and rolled the server\'s main back to an old version. Your commit is gone from the server.'),
    },
    crude: {
      steps: [
        step('💬', '群里喊：“谁有昨天的 zip？”', 'Shout in the chat: "Who has yesterday\'s zip?"'),
        step('📦', '每个人手里的版本都不一样', 'Everyone\'s copy is different'),
        step('🧩', '只能拼凑出一个“大概对”的版本', 'You piece together something "roughly right"'),
      ],
      pain: T('服务器上唯一的一份被覆盖，大家手里的副本又各不相同', 'The only copy on the server is overwritten, and everyone\'s own copies differ'),
    },
    git: {
      idea: T('每个人本地都有完整历史：你的 main 还指着“重要功能”，再 push 一次就把服务器修好了', 'Everyone has the full history locally: your main still points at "Important feature", so one more push repairs the server'),
      commands: ['git fetch', 'git status', 'git log --oneline --all', 'git push'],
    },
    expect: [
      T('fetch 后 status 显示你领先 origin/main——不是你多做了什么，而是服务器被退回去了', 'After fetch, status says you\'re ahead of origin/main. Not because you did more, but because the server went back'),
      T('这次 push 是快进，不需要 force', 'This push is a fast-forward; no force needed'),
    ],
    tasks: [
      task('multi', '同步服务器现状，发现它和你对不上', 'Sync with the server and see it no longer matches you'),
      task('graph', '确认你本地仍有“重要功能”，远程却没有', 'Confirm your local main still has "Important feature" and the remote doesn\'t'),
      task('multi', '重新推送，把服务器修好', 'Push again to repair the server'),
    ],
    recap: {
      crude: T('服务器被覆盖，只能靠大家拼凑', 'The server copy is overwritten and everyone pieces it back together'),
      git: T('每个本地仓库都是完整备份，一个 push 就能恢复', 'Every local repository is a full backup, and one push restores the server'),
      pitfalls: [
        T('看到远程变了就 pull / reset 跟着退回去，把自己本地的也弄丢', 'Seeing the remote change and pulling or resetting to match, losing your local copy too'),
        T('用 --force 去“修”，又覆盖了别人在此期间推送的提交', 'Using --force to "fix" it and overwriting what others pushed in the meantime'),
      ],
      next: T('下一关：清理构建垃圾，却差点把笔记也删了', 'Next: cleaning up build junk, and nearly deleting your notes too'),
    },
  };

  levels['c6-4'] = {
    problem: {
      title: T('大扫除，但别扫掉笔记', 'Clean up, but keep your notes'),
      story: T('构建之后项目里多了 dist/、cache.tmp 和 debug.log，都是没跟踪的杂物。但 notes.md 是你自己的笔记，一定要保留。',
        'After a build the project has dist/, cache.tmp and debug.log: untracked clutter. But notes.md holds your own notes and must survive.'),
    },
    crude: {
      steps: [
        step('🧹', 'rm -rf 一通乱删', 'Go wild with rm -rf'),
        step('😱', '发现 notes.md 也一起删了', 'Realise notes.md went too'),
        step('🤷', '它从没备份过，找不回来了', 'It was never backed up, so it\'s gone'),
      ],
      pain: T('手动清理没有预览，删错了就真没了', 'Manual cleanup has no preview; delete the wrong thing and it\'s gone'),
    },
    git: {
      idea: T('git clean -n 先预览会删哪些未跟踪文件，确认后 -fd 真删；要保留的文件先 add，让 git 跟踪它', 'git clean -n previews which untracked files would go, -fd really deletes them; add anything you want to keep so git tracks it'),
      commands: ['git status', 'git add', 'git clean -n', 'git clean -fd'],
    },
    expect: [
      T('debug.log 被 .gitignore 忽略了，clean 默认不会删它', 'debug.log is ignored by .gitignore, so clean leaves it alone by default'),
      T('clean 删掉的是从没进过 git 的文件——这是少数真正找不回来的情况', 'clean removes files git never saw: one of the few truly unrecoverable cases'),
    ],
    tasks: [
      task('trees', '先看清有哪些未跟踪的文件', 'See which files are untracked'),
      task('trees', '把要保留的 notes.md 交给 git 跟踪', 'Hand notes.md to git so it\'s tracked and safe'),
      task('terminal', '先预览、再删除，只清掉 dist/ 和 cache.tmp', 'Preview first, then delete only dist/ and cache.tmp'),
    ],
    recap: {
      crude: T('rm -rf 没有预览，删错就没了', 'rm -rf has no preview, and mistakes are final'),
      git: T('clean -n 先看后删，被跟踪的文件不受影响', 'clean -n lets you look before deleting, and tracked files are never touched'),
      pitfalls: [
        T('不预览直接 git clean -fd', 'Running git clean -fd without previewing'),
        T('以为 clean 掉的文件能用 reflog 找回——未跟踪文件从没进过 git', 'Expecting reflog to recover cleaned files; untracked files were never in git'),
      ],
      next: T('下一站：线上算错税了，这行是谁改的？', 'Next stage: production is miscalculating tax. Who changed this line?'),
    },
  };

  /* ===== 第 7 站：追查 bug ===== */
  levels['c7-1'] = {
    problem: {
      title: T('这行是谁改的？', 'Who changed this line?'),
      story: T('线上算错税了：tax.js 里的 RATE 变成了 0.31。你和小明都改过这个文件。你要找出是哪次提交改的并撤销它，但小明“税额保留两位小数”的改进必须保留。',
        'Production is getting tax wrong: RATE in tax.js is now 0.31. Both you and Xiaoming have edited that file. Find the commit that did it and undo it, but keep Xiaoming\'s "round tax to 2 decimals" improvement.'),
    },
    crude: {
      steps: [
        step('💬', '群里问：“谁动了 tax.js？”', 'Ask the group: "Who touched tax.js?"'),
        step('📂', '翻好几份备份逐个对比', 'Compare several backups one by one'),
        step('🤔', '找到了也不知道当时为什么要改', 'Even when you find it, there\'s no clue why it was changed'),
      ],
      pain: T('问不出答案，翻备份也只看得到结果，不知道是谁、何时、为什么', 'Asking gets no answer, and backups show only results: not who, when or why'),
    },
    git: {
      idea: T('git blame 逐行标出最后修改它的提交和作者，git show 看完整改动，git revert 精准撤销', 'git blame labels each line with the commit and author that last changed it, git show reveals the full change, git revert undoes it precisely'),
      commands: ['git blame', 'git show', 'git revert', 'git push'],
    },
    expect: [
      T('blame 每一行前面都有提交哈希、作者和时间', 'blame prefixes every line with a commit hash, an author and a time'),
      T('revert 只撤销那一个提交，保留两位小数的逻辑不受影响', 'revert undoes just that one commit; the two-decimal rounding stays'),
    ],
    tasks: [
      task('terminal', '逐行找出 RATE 那一行是哪个提交改的', 'Find which commit changed the RATE line'),
      task('terminal', '看看那个提交完整改了什么、说明是什么', 'See everything that commit changed and what its message says'),
      task('multi', '撤销它并推送，线上恢复正确税率', 'Revert it and push so production gets the right rate again'),
    ],
    recap: {
      crude: T('群里问 + 翻备份，还不知道原因', 'Asking around and digging through backups, still without a reason'),
      git: T('blame 定位到提交和作者，revert 精准撤销', 'blame finds the commit and author, revert undoes it precisely'),
      pitfalls: [
        T('把 blame 当甩锅工具——它是用来找上下文的', 'Using blame to point fingers; it\'s for finding context'),
        T('手工改回 0.13 而不用 revert，历史里看不出这是一次撤销', 'Editing 0.13 back by hand instead of reverting, so history doesn\'t show it was an undo'),
      ],
      next: T('下一关：有段代码不见了，是什么时候没的？', 'Next: some code disappeared. When did it go?'),
    },
  };

  levels['c7-2'] = {
    problem: {
      title: T('输入校验什么时候没的？', 'When did the input validation vanish?'),
      story: T('用户反馈表单能提交空内容。你发现 form.js 里的 validate( 不见了，可最近有好几个提交，不知道是哪一个删的。',
        'Users report the form accepts empty input. validate( has disappeared from form.js, but there are several recent commits and you don\'t know which one removed it.'),
    },
    crude: {
      steps: [
        step('📂', '打开一份份备份', 'Open backup after backup'),
        step('🔍', '在每份里搜 validate', 'Search each one for validate'),
        step('🧐', '找出最后一份还有它的备份', 'Find the last backup that still has it'),
      ],
      pain: T('备份越多越慢，找到了也不知道那次为什么要删', 'The more backups, the slower it gets, and you still don\'t learn why it was removed'),
    },
    git: {
      idea: T('git log -S "validate(" 列出增加或删除了这段文字的提交（pickaxe 搜索），直接定位', 'git log -S "validate(" lists the commits that added or removed that text (a pickaxe search), pinpointing the culprit'),
      commands: ['git log -S', 'git show', 'git revert', 'git checkout <commit>~1 -- <file>'],
    },
    expect: [
      T('log -S 会列出两个提交：加入它的 init 和删除它的“简化表单代码”', 'log -S lists two commits: init, which added it, and "Simplify form code", which removed it'),
      T('恢复时要让 app.js 保持最新（app 4）', 'When restoring, keep app.js at its latest content (app 4)'),
    ],
    tasks: [
      task('terminal', '按内容搜索历史，找出动过 validate( 的提交', 'Search history by content for commits that touched validate('),
      task('terminal', '看看“简化表单代码”到底删了什么', 'See exactly what "Simplify form code" removed'),
      task('graph', '把校验恢复回来并存档，其他文件保持最新', 'Bring the validation back and commit, keeping other files current'),
    ],
    recap: {
      crude: T('一份份备份打开搜', 'Opening and searching backup after backup'),
      git: T('按内容搜历史，一条命令定位', 'Search history by content and find it with one command'),
      pitfalls: [
        T('用 git log --grep 搜——那只搜提交说明，不搜代码', 'Searching with git log --grep, which searches messages, not code'),
        T('为了恢复一个函数把整个项目 reset 回去', 'Resetting the whole project just to get one function back'),
      ],
      next: T('下一关：要发布 v2.0 了，先写发布说明', 'Next: v2.0 is shipping, so write the release notes'),
    },
  };

  levels['c7-4'] = {
    problem: {
      title: T('v1.0 到 v2.0 改了什么？', 'What changed between v1.0 and v2.0?'),
      story: T('v2.0 要发布了，你得写发布说明：这期间有哪些提交、改了哪些文件、小明贡献了什么（他做了搜索功能）。',
        'v2.0 is about to ship and you need release notes: which commits went in, which files changed, and what Xiaoming contributed (he built search).'),
    },
    crude: {
      steps: [
        step('🗂️', '把 v1.0 和 v2.0 的备份并排放好', 'Put the v1.0 and v2.0 backups side by side'),
        step('🔍', '对整个目录 diff -r', 'Run diff -r on the whole folder'),
        step('💬', '在群里挨个问大家都做了什么', 'Ask everyone in the chat what they did'),
      ],
      pain: T('diff 只看得到结果，看不到是谁、分几次、为什么做的', 'diff shows only the end result: not who, in how many steps, or why'),
    },
    git: {
      idea: T('用版本范围查询历史：log v1.0..v2.0 列提交，diff --stat 看文件，--author 按人筛选', 'Query history by version range: log v1.0..v2.0 lists commits, diff --stat shows files, --author filters by person'),
      commands: ['git log v1.0..v2.0 --oneline', 'git diff v1.0 v2.0 --stat', 'git log --author', 'git add', 'git commit'],
    },
    expect: [
      T('A..B 的意思是“在 B 里、但不在 A 里的提交”', 'A..B means "commits in B but not in A"'),
      T('--stat 只列出文件和增删行数，正适合写摘要', '--stat lists only files and line counts, perfect for a summary'),
    ],
    tasks: [
      task('terminal', '列出两个版本之间的所有提交', 'List every commit between the two versions'),
      task('terminal', '看看哪些文件变了、变了多少', 'See which files changed and by how much'),
      task('terminal', '按作者筛出小明的贡献', 'Filter by author to see Xiaoming\'s contributions'),
      task('editor', '把整理好的发布说明写进 RELEASE.md 并提交', 'Write the release notes into RELEASE.md and commit'),
    ],
    recap: {
      crude: T('目录 diff + 群里挨个问', 'Folder diffs plus asking everyone'),
      git: T('版本范围 + 作者筛选，发布说明几分钟搞定', 'Version ranges and author filters: release notes in minutes'),
      pitfalls: [
        T('把 v1.0..v2.0 写反，结果什么都没有', 'Writing the range backwards and getting nothing'),
        T('--author 按名字匹配，名字写错就筛不出来', '--author matches by name, so a misspelt name finds nothing'),
      ],
      next: T('下一关：测试挂了，15 个提交里是哪一个？', 'Next: tests are failing. Which of 15 commits broke them?'),
    },
  };

  levels['c7-3'] = {
    problem: {
      title: T('15 个提交里，哪个把测试搞坏了？', 'Which of 15 commits broke the tests?'),
      story: T('npm test 在最新版本上失败了（mul(2, 3) 算成了 7），但打着 v1.0 标签的版本是好的。中间隔了 15 个“日常改动”，一个个试太慢了。',
        'npm test fails on the latest version (mul(2, 3) gives 7), but the version tagged v1.0 was fine. There are 15 "Routine change" commits in between, far too many to test one by one.'),
    },
    crude: {
      steps: [
        step('📂', '把 15 份备份一个个拷回来', 'Copy 15 backups back one at a time'),
        step('🧪', '每一份都跑一遍测试', 'Run the tests on every single one'),
        step('⏳', '一个下午就这么过去了', 'There goes the afternoon'),
      ],
      pain: T('线性地一个个试，版本越多越绝望', 'Testing versions one by one gets hopeless as the count grows'),
    },
    git: {
      idea: T('git bisect 在“好”和“坏”之间二分查找：每次测中间那个，大约 4 次就能定位', 'git bisect binary-searches between "good" and "bad": test the middle each time, and about 4 rounds find the culprit'),
      commands: ['npm test', 'git bisect start', 'git bisect bad', 'git bisect good v1.0', 'git bisect reset', 'git revert'],
    },
    expect: [
      T('bisect 期间你处于 detached HEAD，这是正常的', 'You\'ll be on a detached HEAD during bisect. That\'s normal'),
      T('标反一次 good/bad 就会找错；不确定就 git bisect reset 重来', 'Mark good/bad the wrong way once and you\'ll get the wrong answer; if unsure, git bisect reset and start over'),
    ],
    tasks: [
      task('terminal', '确认坏了，然后告诉 git 好、坏两个端点', 'Confirm it\'s broken, then tell git the good and bad endpoints'),
      task('graph', '每测一次范围就减半，直到找出第一个坏提交', 'Each test halves the range until the first bad commit is found'),
      task('graph', '回到 main，撤销肇事提交，测试恢复通过', 'Return to main, revert the culprit, and the tests pass again'),
    ],
    recap: {
      crude: T('把 15 份备份逐个试一遍', 'Trying all 15 backups in turn'),
      git: T('二分查找，15 个提交约 4 次就能定位', 'Binary search: about 4 tests for 15 commits'),
      pitfalls: [
        T('不跑测试就凭感觉标 good/bad', 'Marking good/bad on a hunch without running the tests'),
        T('找到后忘了 git bisect reset，还停在旧提交上', 'Forgetting git bisect reset and staying on an old commit'),
      ],
      next: T('终章：你、服务器、小明、小红——自由沙盒随便折腾！', 'Finale: you, the server, Xiaoming and Xiaohong in a free sandbox!'),
    },
  };

  /* ===== 终章：自由沙盒 ===== */
  levels['sandbox'] = {
    problem: {
      title: T('自由练习', 'Free play'),
      story: T('这里有你的 ~/project、服务器上的 origin，还有小明和小红各自的克隆。让同事推送、制造冲突、甚至强推，看看你能不能从容应对。',
        'Here you have ~/project, the origin server, and clones for Xiaoming and Xiaohong. Have your teammates push, cause conflicts, even force-push, and see if you can handle it calmly.'),
    },
    crude: {
      steps: [
        step('📦', '三个人靠 zip 和网盘传代码', 'Three people passing code around as zips on a shared drive'),
        step('💬', '群里天天问“谁有最新版？”', 'Daily "who has the latest?" in the group chat'),
        step('💥', '有人的工作被覆盖了，却没人知道', 'Someone\'s work gets overwritten and nobody notices'),
      ],
      pain: T('多人异步协作靠文件夹和压缩包，几乎注定会乱', 'Asynchronous teamwork with folders and zips is almost bound to end in chaos'),
    },
    git: {
      idea: T('整套工具箱都在你手里：存档、后悔药、分支、冲突、同步、救援、追查', 'The whole toolbox is yours: saving, undo, branches, conflicts, syncing, rescue and bug hunting'),
      commands: ['git status', 'git log --graph --all', 'git pull --rebase', 'git push', 'git merge', 'git reflog'],
    },
    expect: [
      T('用“多人”面板里的按钮，让小明、小红制造各种状况', 'Use the buttons in the Team panel to have Xiaoming and Xiaohong stir things up'),
      T('玩坏了随时“重置本关”，没有任何代价', 'Broke it? "Reset level" at any time, no cost at all'),
    ],
    tasks: [
      task('multi', '想练什么练什么：让同事推送、制造冲突，再自己收拾', 'Practise anything: let teammates push or cause conflicts, then sort it out yourself'),
    ],
    recap: {
      crude: T('没有 git 的团队协作全靠运气', 'Teamwork without git runs on luck'),
      git: T('有了 git，多人异步协作也能有序、可追溯、可恢复', 'With git, asynchronous teamwork is orderly, traceable and recoverable'),
      pitfalls: [
        T('一被拒绝就 --force', 'Reaching for --force at the first rejection'),
        T('不看 git status 就动手', 'Acting without checking git status first'),
      ],
      next: T('旅程结束了——去你自己的真实项目里用起来吧！', 'That\'s the journey. Now go use it on your own real projects!'),
    },
  };

  /* ---------- 导出 ---------- */
  const GitCurriculum = { stages, levels, FOCUS };
  global.GitCurriculum = GitCurriculum;
  if (typeof module !== 'undefined' && module.exports) module.exports = GitCurriculum;
})(typeof window !== 'undefined' ? window : globalThis);
