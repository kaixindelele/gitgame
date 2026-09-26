# Git 沙盒学院 · 在浏览器里用真实的 git 逻辑学 git

一个**纯静态、零依赖**的网页游戏：打开 `index.html` 就能玩。它在浏览器里实现了一个遵循真实 git 逻辑的引擎（blob / tree / commit 对象、SHA-1 哈希、暂存区、引用、reflog、三方合并、远程与裸仓库），从最原始的“复制文件夹备份”讲起，一路带你走到分支、冲突、多人协作、数据恢复和 bug 定位。

- 🎬 教学视频：[`media/tutorial.mp4`](media/tutorial.mp4)（约 3 分钟）
- 📣 宣传视频：[`media/promo.mp4`](media/promo.mp4)（约 1 分钟）

## 像游戏一样玩

- **星级与经验**：每关按是否看提示评 1–3 星，星星换 XP，XP 换称号（git 萌新 → 提交学徒 → 分支玩家 → … → Git 大师）。
- **成就**：18 个成就，例如“冲突终结者”“reflog 救援队”“二分侦探”，也有反面教材“翻车现场”（强推覆盖了同事的提交）。
- **关卡地图**：9 章 42 关的路线图，显示完成度、星级和推荐的下一关；所有关卡都可以直接跳。
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

界面分三栏：**左**：章节、关卡讲解、任务清单、提示、反馈；**中**：终端（Tab 补全、↑↓ 历史、`edit 文件` 打开编辑器）；**右**：提交图 / 三棵树 / 原理对比 / 多人与远程。

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
js/sha1.js        SHA-1
js/diff.js        行级 diff、unified diff、diff3 三方合并
js/git.js         引擎核心：对象库、树、引用、reflog、祖先关系、状态、树级三方合并
js/gitcmd.js      各子命令实现与 git 风格输出
js/shell.js       虚拟文件系统 + shell + 多用户/远程
js/analogy.js     “原理对比”文案与快照文件夹视图
js/levels.js      章节与关卡（setup / tasks / hints / feedback）
js/ui.js          终端（含输出高亮）、SVG 提交图、三棵树表、多仓库视图
js/game.js        星级 / 经验 / 成就 / 音效 / 彩带 / 关卡地图 / 新手引导
js/main.js        关卡加载、命令执行、反馈、进度与本关回放（localStorage）
test/engine.test.js   引擎回归测试（node test/engine.test.js）
test/levels.test.js   每一关按提示自动通关的可解性测试
test/browser.test.js  Playwright 浏览器冒烟测试
test/play.js          命令行试玩：node test/play.js c3-2 "git merge feature"
test/record.js        录制教学/宣传视频
media/                视频
```

## 测试

```bash
node test/engine.test.js     # 引擎：提交、合并、冲突、stash、reset、rebase、远程协作、bisect…
node test/levels.test.js     # 42 关全部可按提示通关
node test/browser.test.js    # 需要 Playwright + Chromium
```

## 已知限制

- 不支持交互式命令（`git add -p`、`git rebase -i`）；`git commit` 不带 `-m` 会打开页面内编辑器。
- tree / commit 对象按文本序列化，所以 tree 和 commit 的哈希与真实 git 不同（blob 哈希完全一致，可以用 `git hash-object` 核对）。
- 远程仓库用本地路径模拟（`/srv/git/project.git`），`https://github.com/team/project.git` 是它的别名；没有网络、没有权限系统（只模拟了保护分支钩子）。
- 空目录不被记录（和 git 一样），`mkdir` 在仓库内只是提示。
- 时间是逻辑时钟，日期从 2026-01-05 起每步递增，保证提交顺序稳定。

## 添加新关卡

在 `js/levels.js` 里 `LEVELS.push({...})`：`setup(ctx)` 用 `newProject / commit / collab / asXm` 等辅助函数构造世界；`tasks` 里每项是 `{ text, check(ctx) }`，判定基于仓库状态（`repo(ctx).fileAt('HEAD', 'a.txt')`、`branchTip`、`isAncestor`、`conflicts` 等）；`hints` 逐条揭示；可选 `feedback(ctx, cmd, res)` 做针对性纠正，`onCommand` 触发剧情（例如同事推送），`actions` 提供沙盒按钮。跑一下 `node test/levels.test.js` 确认可通关。
