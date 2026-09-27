# 教学设计：以“问题”驱动的 git 学习旅程

> English summary: the game is organised around the *problems* a developer actually runs into, not around git commands. Every level follows the same loop — **Problem → the crude no-git way → the git way → hands-on practice (mistakes welcome) → debrief** — and the player can always see the whole journey and jump anywhere.

## 1. 设计原则

1. **先有问题，再有命令。** 玩家先遇到一个真实的麻烦（改坏了想回退、同事覆盖了我的文件……），再学解决它的 git 操作。
2. **每个问题都和“原始做法”对照。** 没有 git 时人们会复制文件夹、发压缩包、在群里问“谁有最新版”。先让玩家看到（或亲手做一遍）这种粗糙做法和它的代价，git 的价值才具体。
3. **提前知道全程。** 开始前就能看到整个旅程：一共几个阶段、每个阶段解决什么问题、会经历什么（报错、冲突、被拒绝……）、难度如何。
4. **循序渐进。** 一个人 → 后悔药 → 同时做几件事 → 两人改同一处 → 多台电脑异步协作 → 出事故 → 追查 bug。每阶段只引入少量新概念。
5. **注意力引导。** 同一时刻只突出“当前这一步”；需要看哪个面板，就点亮哪个面板。长篇讲解拆成卡片。
6. **允许犯错。** 沙盒随时可重置；输入错误命令会得到导师的针对性反馈，这是学习的一部分。

## 2. 旅程：8 个阶段

| 阶段 | 玩家遇到的问题 | 没有 git 的粗糙做法 | git 的做法 | 会经历的事 |
| --- | --- | --- | --- | --- |
| 序章 | 我需要存档 | 复制文件夹、改文件名、`最终版2_真的最终` | —— 先体验痛点 | 找不到哪个是最新版 |
| 1 存档与记录 | 想回到昨天的版本；想知道改了什么、为什么改 | 每次整目录复制；靠记忆和 notes.txt | init / add / commit / status / diff / log / .gitignore | “nothing to commit”、忘了 add |
| 2 后悔药 | 改坏了、存错了、发出去的版本有 bug、删过头 | 从备份里翻、手工改回、回收站 | restore / amend / reset / revert / reflog | reset --hard 后提交“消失”，再用 reflog 找回 |
| 3 同时做几件事 | 新功能做到一半，线上要紧急修 bug；想试验但不想弄乱主线 | 再复制一份项目，改完手工拷回 | branch / switch / stash / merge / cherry-pick / rebase / tag | 切分支被拒绝、detached HEAD 警告 |
| 4 改了同一处 | 两个人（或两条分支）改了同一行 | 两份文件肉眼对比，不知道谁改了什么 | 冲突标记、解决、add、commit、--abort、--ours/--theirs | CONFLICT、带标记的文件 |
| 5 多台电脑异步协作 | 大家怎么拿到同一份代码？版本不一致？后上传的覆盖了先上传的？ | 网盘/微信传 `最新版.zip`，覆盖了也没人知道 | clone / push / fetch / pull / pull --rebase / 功能分支 / --force-with-lease | push 被拒绝、分叉、协作冲突 |
| 6 出事故了 | 删了文件、远程被强推覆盖、清理过头 | 没有备份就真没了 | checkout/restore --source、reflog、重新 push、clean -n | 有些东西真的找不回来（从未 add 的文件） |
| 7 追查 bug | 这行是谁改的？什么时候坏的？ | 一个个备份打开对比 | blame / log -S / bisect / diff 版本范围 | bisect 标反 good/bad |
| 终章 | 自由沙盒 | —— | 你 + 服务器 + 两位同事 | 随便折腾 |

## 3. 每一关的固定流程

1. **简报（Briefing）**：四张卡片依次展示
   - 🎯 你遇到的问题（一个情境小故事）
   - 🪵 没有 git 你会怎么做（2–4 步分镜 + 这样做的代价）
   - ⚡ git 的做法（核心思想一句话 + 本关用到的命令）
   - 🧭 本关你可能会经历的事（例如“你会看到 push 被拒绝，这是正常的”）
2. **动手（Play）**：只突出“当前任务”卡片，写明这一步要做什么、为什么；需要观察的面板会被点亮。已完成的任务收起，后面的任务变暗但可见。
3. **反馈（Feedback）**：输错、做错时，导师给出原因和纠正方法。
4. **总结（Debrief）**：原始做法 vs git 做法对照、你刚才用到的命令、常见的坑、下一关要解决的问题预告。

## 4. 界面

- **旅程总览**：首次进入先看全程；之后从顶栏随时打开。按阶段列出问题、粗糙做法、git 做法、难度、进度，点击任意关卡跳转。
- **任务线**：顶栏下方一条常驻进度条，按阶段分段，每关一个圆点（已完成 / 当前 / 未开始），悬停看标题，点击跳转。
- **焦点提示**：当前任务需要看哪个面板（提交图 / 三棵树 / 原理对比 / 多人），对应标签会发光提示。

## 5. 数据结构（`js/curriculum.js`）

```js
window.GitCurriculum = {
  stages: [{ id, icon, title, question, crude, git, commands, expect, difficulty, levels: [levelId...] }],
  levels: {
    [levelId]: {
      problem: { title, story },
      crude: { steps: [{ icon, text }], pain },
      git: { idea, commands },
      expect: [text...],
      tasks: [{ focus, why }],          // 与 levels.js 中的 tasks 一一对应
      recap: { crude, git, pitfalls: [text...], next }
    }
  }
}
```

所有文本用 `T('中文', 'English')` 包装。关卡的玩法和判定仍在 `js/levels.js`，本文件只负责“教学叙事”，两者通过关卡 id 关联。旅程顺序以 `stages[].levels` 为准。

## 6. 视频

- 节奏放慢：每个操作之后留出阅读时间，复杂操作（冲突、多人协作、bisect）逐步讲解。
- 中英文各一套，带配音（本地离线语音合成）和字幕，字幕与配音同步。
- 教学视频按“问题 → 原始做法 → git 做法 → 动手”的结构讲解几个代表性关卡；宣传视频讲清“为什么值得玩”。
