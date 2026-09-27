[中文](README.md) | [English](README.en.md)

# Git 沙盒学院 · 在浏览器里用真实的 git 逻辑学 git

一个**纯静态、零依赖**的网页游戏：打开 `index.html` 就能玩。它在浏览器里实现了一个遵循真实 git 逻辑的引擎（blob / tree / commit 对象、SHA-1 哈希、暂存区、引用、reflog、三方合并、远程与裸仓库），从最原始的“复制文件夹备份”讲起，一路带你走到分支、冲突、多人协作、数据恢复和 bug 定位。

- 🎬 教学视频：[`media/tutorial.mp4`](media/tutorial.mp4)（约 3 分钟）· 英文版 [`media/tutorial.en.mp4`](media/tutorial.en.mp4)
- 📣 宣传视频：[`media/promo.mp4`](media/promo.mp4)（约 1 分钟）· 英文版 [`media/promo.en.mp4`](media/promo.en.mp4)
- 🌐 中英双语：点顶栏的语言按钮（EN / 中文）切换，或在网址后加 `?lang=en` / `?lang=zh`（按钮的选择会被记住）。

## 以“问题”驱动的学习旅程

游戏不是按命令排的，而是按你在真实开发中**会遇到的问题**排的。完整设计见 [docs/DESIGN.md](docs/DESIGN.md)。

**每一关都是同一个节奏：**

1. 🎯 **遇到问题**：一个具体情境，比如“同事先推送了，你的 push 被拒绝了”。
2. 🪵 **没有 git 的笨办法**：复制文件夹、网盘传 `最新版.zip`、群里问谁有最新版……以及这样做的代价。
3. ⚡ **git 的做法**：核心思想一句话，加上本关要用的命令。
4. 🧭 **你可能会经历**：提前告诉你会看到什么，比如报错、冲突、被拒绝，让你不慌。
5. 🛠️ **动手**：一次只突出一个任务，并点亮你该看的面板。输错命令没关系，导师会告诉你为什么错、怎么改。
6. 📋 **总结**：没有 git 和用 git 的对照、你用到的命令、常见的坑，以及下一关要解决的问题。

**9 个阶段，循序渐进：**

| 阶段 | 你会遇到的问题 |
| --- | --- |
| 📁 序章 | 想给项目“存档”——先用复制文件夹的办法体验痛点 |
| 💾 存档与记录 | 想回到昨天的版本；想知道改了什么、为什么改 |
| ⏪ 后悔药 | 改坏了、存错了、发出去的版本有 bug |
| 🌿 同时做几件事 | 新功能做到一半，要紧急修线上 bug；想试验又怕弄乱主线 |
| ⚔️ 改了同一处 | 两个人或两条分支改了同一行：合并冲突 |
| 🌐 多台电脑异步协作 | 版本不一致、后上传的覆盖先上传的、push 被拒绝 |
| 🚑 出事故了 | 删了文件或分支、远程被强推覆盖、清理过头 |
| 🔍 追查 bug | 这行是谁改的？什么时候坏的？哪个提交引入的？ |
| 🏖️ 终章 | 自由沙盒：你、服务器和两位同事 |

一打开游戏就能看到这张**旅程总览**，之后可以从顶栏的“🧭 旅程”随时打开。顶栏下方的**任务线**显示全部关卡和你的进度，点任意圆点直接跳转。

## 像游戏一样玩

- **星级与经验**：每关按是否看提示评 1–3 星，星星换 XP，XP 换称号（git 萌新 → 提交学徒 → 分支玩家 → … → Git 大师）。
- **成就**：18 个成就，例如“冲突终结者”“reflog 救援队”“二分侦探”，也有反面教材“翻车现场”（强推覆盖了同事的提交）。
- **导师与同事**：导师 🧙 在终端下方给出针对性纠错；同事小明 🧑‍💻 / 小红 👩‍💻 会真的在他们的克隆里提交并推送。
- **即时反馈**：任务打勾有动画和音效，通关有彩带；终端输出按真实 git 的配色高亮；点击讲解里的任何命令即可填入终端。
- **随时试错**：刷新页面会回放本关的操作，进度不丢；“重置本关”一键回到初始状态；“🔬 显示底层”开关在终端里内联显示每条命令创建了哪些对象、移动了哪个指针。

## 三个设计原则

1. **真实的 git 逻辑，真实的输出。** 每条命令的行为和报错都尽量与真实 git 2.4x 一致：`git status` 的措辞、`non-fast-forward` 的拒绝、`detached HEAD` 的长篇提示、`Need to specify how to reconcile divergent branches`、冲突标记、reflog 记录……哈希是真的 SHA-1（空 blob 就是 `e69de29…`，空 tree 就是 `4b825dc…`）。
2. **沙盒可试错，反馈即时。** 每一关都是一个独立的世界，随时“重置本关”。执行命令后，左侧“反馈”面板会针对错误给出纠正（忘了 `git add`、提交信息没加引号、add 了带冲突标记的文件、强推覆盖了同事的提交……），任务判定基于**仓库的真实状态**而不是你输入了什么字符串。
3. **和最原始的方案对照。** 右侧“原理对比”面板对每条命令回答三个问题：git 底层做了什么（创建了哪些对象、移动了哪个指针）；如果用“复制文件夹”的办法要怎么做；差别在哪。“快照文件夹视图”把每个提交画成一个备份文件夹，标出哪些文件是共享的、git 实际存了多少。

## 怎么玩

```bash
# 方式一：直接双击 index.html
# 方式二：任意静态服务器
python3 -m http.server 8000
# 然后打开 http://localhost:8000
```

默认按浏览器语言显示中文或英文，可随时用顶栏的语言按钮切换，或直接打开 `index.html?lang=en`（英文）/ `index.html?lang=zh`（中文）。

界面分三栏：**左**：关卡简报、当前任务、提示、总结；**中**：终端（Tab 补全、↑↓ 历史、`edit 文件` 打开编辑器）；**右**：提交图 / 三棵树 / 原理对比 / 多人与远程。

终端支持的 shell 命令：`ls cat echo > >> touch rm mv cp -r mkdir tree du -sh diff -r grep sed -i head tail wc cd pwd edit clear history`，以及 `npm test` 等测试命令（部分关卡）。输入 `help` 或 `git help` 查看。

## 课程大纲（9 章 42 关）

| 章 | 内容 | 关卡 |
| --- | --- | --- |
| 0 没有 git 的日子 | 用 `cp -r` 备份、`diff -r` 比较、备份地狱 | 手工备份、哪个才是最终版 |
| 1 基础三板斧 | init / config / add / commit / status / diff / log / cat-file / .gitignore | 5 关，含亲手走通 commit → tree → blob |
| 2 撤销与找回 | restore / restore --staged / amend / reset 三模式 / revert / reflog / 找回误删分支 | 7 关 |
| 3 分支 | switch / merge（快进与三方）/ detached HEAD / rebase / cherry-pick / stash / tag | 8 关 |
| 4 冲突 | 内容冲突、`--abort`、`--ours/--theirs`、rebase 冲突、modify/delete 冲突 | 4 关 |
| 5 多人协作 | clone / push / fetch / pull / 被拒绝的 push / 协作冲突 / 功能分支流程 / `--force-with-lease` | 7 关，同事“小明”会真的推送提交 |
| 6 删除与数据恢复 | git rm 与找回、取回旧版本文件、远程被强推覆盖后修复、git clean | 4 关 |
| 7 定位 bug | blame / `log -S` / bisect（配合 `npm test`）/ 版本间差异与发布说明 | 4 关 |
| 8 自由沙盒 | 你 + 服务器 + 小明 + 小红，按钮触发同事推送/制造冲突/强推 | 1 关 |

## 引擎支持的 git 命令

`init clone config status add rm mv commit log show diff branch checkout switch restore merge rebase cherry-pick revert reset stash tag reflog blame bisect remote fetch pull push clean grep cat-file ls-files ls-tree rev-parse count-objects merge-base fsck gc help`

包括这些真实细节：快进 / 三方合并 / 合并提交、diff3 冲突标记、`rebase --continue/--abort/--skip`、`stash push/pop/apply/list/drop`（含 `-u`）、附注标签、`reset --soft/--mixed/--hard` 与 `ORIG_HEAD`、`HEAD~n / HEAD^ / HEAD@{n} / stash@{n} / rev:path` 语法、`--force-with-lease` 的 stale-info 拒绝、非裸仓库当前分支拒绝推送、跟踪分支与 ahead/behind、`pull` 分叉时要求指定策略、`.gitignore`、`log --graph` 的 ASCII 图。

## 项目结构

```
index.html        页面
css/style.css     样式
js/i18n.js        中英双语：T('中文', 'English') 与语言检测（最先加载）
js/sha1.js        SHA-1
js/diff.js        行级 diff、unified diff、diff3 三方合并
js/git.js         引擎核心：对象库、树、引用、reflog、祖先关系、状态、树级三方合并
js/gitcmd.js      各子命令实现与 git 风格输出
js/shell.js       虚拟文件系统 + shell + 多用户/远程
js/analogy.js     “原理对比”文案与快照文件夹视图
js/levels.js      章节与关卡（setup / tasks / hints / feedback）
js/ui.js          终端（含输出高亮）、SVG 提交图、三棵树表、多仓库视图
js/game.js        星级 / 经验 / 成就 / 音效 / 彩带 / 新手引导
js/journey.js     旅程总览、任务线、关卡简报 / 当前任务 / 总结
js/curriculum.js  教学叙事：9 个阶段，每关的问题、原始做法、git 做法、可能经历、总结
docs/DESIGN.md    以问题驱动的教学设计
js/main.js        关卡加载、命令执行、反馈、进度与本关回放（localStorage）
test/engine.test.js   引擎回归测试（node test/engine.test.js）
test/levels.test.js   每一关按提示自动通关的可解性测试
test/browser.test.js  Playwright 浏览器冒烟测试
test/play.js          命令行试玩：node test/play.js c3-2 "git merge feature"
test/record.js        录制教学/宣传视频
deploy/server-setup.sh 服务器部署脚本（配合 .github/workflows/server.yml）（VIDEO_LANG=en 录英文版）
media/                视频（tutorial / promo 的中文版 .mp4 与英文版 .en.mp4）
```

## 部署到自己的服务器

`deploy/server-setup.sh` 会在服务器上拉取代码，并用 systemd 常驻一个静态网页服务（80 端口空闲就用 80，否则用 8000）。脚本可以反复运行。

想让每次推送自动部署：在仓库 Settings → Secrets and variables → Actions 里添加两个 Secret：

- `SERVER_SSH`：例如 `ubuntu@1.2.3.4`
- `SERVER_PASSWORD`：SSH 密码（之后建议改用 SSH key）

之后每次推送到 `claude/git-learning-game-hnytni`，`server` 工作流都会通过 SSH 更新服务器。也可以在 Actions 页面手动运行它，并填入一条要在服务器上执行的命令。没有配置 Secrets 时该工作流会自动跳过。

> 注意：公开仓库的 Actions 日志任何人都能看到。Secrets 会被自动打码，但命令的输出不会。

## 测试

```bash
node test/engine.test.js     # 引擎：提交、合并、冲突、stash、reset、rebase、远程协作、bisect…
node test/levels.test.js     # 42 关全部可按提示通关
GITGAME_LANG=en node test/levels.test.js   # 英文模式下同样全部可通关
node test/browser.test.js    # 需要 Playwright + Chromium
```

## 已知限制

- 不支持交互式命令（`git add -p`、`git rebase -i`）；`git commit` 不带 `-m` 会打开页面内编辑器。
- tree / commit 对象按文本序列化，所以 tree 和 commit 的哈希与真实 git 不同（blob 哈希完全一致，可以用 `git hash-object` 核对）。
- 远程仓库用本地路径模拟（`/srv/git/project.git`），`https://github.com/team/project.git` 是它的别名；没有网络、没有权限系统（只模拟了保护分支钩子）。
- 空目录不被记录（和 git 一样），`mkdir` 在仓库内只是提示。
- 时间是逻辑时钟，日期从 2026-01-05 起每步递增，保证提交顺序稳定。

## 添加新关卡

在 `js/levels.js` 里 `LEVELS.push({...})`：`setup(ctx)` 用 `newProject / commit / collab / asXm` 等辅助函数构造世界；`tasks` 里每项是 `{ text, check(ctx) }`，判定基于仓库状态（`repo(ctx).fileAt('HEAD', 'a.txt')`、`branchTip`、`isAncestor`、`conflicts` 等）；`hints` 逐条揭示；可选 `feedback(ctx, cmd, res)` 做针对性纠正，`onCommand` 触发剧情（例如同事推送），`actions` 提供沙盒按钮。所有面向玩家的文字写成 `T('中文', 'English')`。跑一下 `node test/levels.test.js`（以及 `GITGAME_LANG=en node test/levels.test.js`）确认可通关。
