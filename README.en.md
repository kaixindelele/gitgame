[中文](README.md) | [English](README.en.md)

# Git Sandbox Academy · Learn git in your browser, with real git logic

A **purely static, zero-dependency** web game: open `index.html` and play. It ships an engine that follows real git semantics inside the browser (blob / tree / commit objects, SHA-1 hashes, the staging area, refs, reflog, three-way merges, remotes and bare repositories). It starts from the most primitive approach, "copy the folder as a backup", and takes you all the way through branching, conflicts, teamwork, data recovery and bug hunting.

- 🎬 Tutorial video: [`media/tutorial.en.mp4`](media/tutorial.en.mp4) (about 3 minutes) · Chinese version: [`media/tutorial.mp4`](media/tutorial.mp4)
- 📣 Promo video: [`media/promo.en.mp4`](media/promo.en.mp4) (about 1 minute) · Chinese version: [`media/promo.mp4`](media/promo.mp4)
- 🌐 Bilingual (English / Chinese): switch with the language button in the top bar (EN / 中文), or add `?lang=en` / `?lang=zh` to the URL (the button remembers your choice).

## Play it like a game

- **Stars and XP**: each level earns 1–3 stars depending on whether you used hints; stars turn into XP, and XP unlocks ranks (git newbie → Commit apprentice → Branch player → … → Git master).
- **Achievements**: 18 of them, such as "Conflict terminator", "reflog rescue team" and "Bisect detective", plus a cautionary one, "Crash scene" (you force-pushed over a teammate's commits).
- **Level map**: a road map of 9 chapters and 42 levels that shows your progress, your stars and the recommended next level. You can jump to any level directly.
- **Mentor and teammates**: the mentor 🧙 below the terminal gives targeted corrections; your teammates Xiaoming 🧑‍💻 and Xiaohong 👩‍💻 really commit and push from their own clones.
- **Instant feedback**: tasks tick off with an animation and a sound, finishing a level throws confetti, and terminal output is colored like real git. Click any command in a lesson to paste it into the terminal.
- **Safe to experiment**: reloading the page replays your moves in the current level, so nothing is lost; "Reset level" returns to the starting state in one click; the "🔬 Show internals" switch prints, inline in the terminal, which objects each command created and which pointer it moved.

## Three design principles

1. **Real git logic, real output.** Every command tries to behave and fail exactly like real git 2.4x: the wording of `git status`, the `non-fast-forward` rejection, the long `detached HEAD` notice, `Need to specify how to reconcile divergent branches`, conflict markers, reflog entries… The hashes are real SHA-1 (the empty blob is `e69de29…`, the empty tree is `4b825dc…`).
2. **A sandbox where mistakes are safe, with instant feedback.** Every level is an isolated world you can reset at any time. After each command, the mentor corrects common mistakes (forgetting `git add`, an unquoted commit message, adding a file that still has conflict markers, force-pushing over a teammate's commits…). Tasks are checked against the **real state of the repository**, not against the text you typed.
3. **Compared with the most primitive approach.** For every command, the "Analogy" panel on the right answers three questions: what git did under the hood (which objects it created, which pointer it moved); how you would do the same thing by copying folders; and what the difference is. The "snapshots as folders" view draws each commit as a backup folder, marks which files are shared, and shows how much git actually stores.

## How to play

```bash
# Option 1: just double-click index.html
# Option 2: any static file server
python3 -m http.server 8000
# then open http://localhost:8000
```

The game follows your browser language by default (Chinese or English). Switch at any time with the language button in the top bar, or open `index.html?lang=en` (English) / `index.html?lang=zh` (Chinese) directly.

The screen has three columns. **Left**: chapters, the lesson, the task list, hints and feedback. **Middle**: the terminal (Tab completion, ↑↓ history, `edit <file>` opens the editor). **Right**: commit graph / three trees / analogy / team and remotes.

Shell commands supported by the terminal: `ls cat echo > >> touch rm mv cp -r mkdir tree du -sh diff -r grep sed -i head tail wc cd pwd edit clear history`, plus test commands such as `npm test` (in some levels). Type `help` or `git help` to see them.

## Syllabus (9 chapters, 42 levels)

| Chapter | Content | Levels |
| --- | --- | --- |
| 0 Life before git | Backing up with `cp -r`, comparing with `diff -r`, backup hell | Manual backups; which one is the final version? |
| 1 The basics | init / config / add / commit / status / diff / log / cat-file / .gitignore | 5 levels, including walking commit → tree → blob by hand |
| 2 Undo and recovery | restore / restore --staged / amend / the three reset modes / revert / reflog / recovering a deleted branch | 7 levels |
| 3 Branches | switch / merge (fast-forward and three-way) / detached HEAD / rebase / cherry-pick / stash / tag | 8 levels |
| 4 Conflicts | Content conflicts, `--abort`, `--ours/--theirs`, rebase conflicts, modify/delete conflicts | 4 levels |
| 5 Teamwork | clone / push / fetch / pull / rejected pushes / conflicts with teammates / feature-branch workflow / `--force-with-lease` | 7 levels; your teammate Xiaoming really pushes commits |
| 6 Deletion and data recovery | git rm and getting files back, restoring old versions of a file, repairing a remote after a force-push, git clean | 4 levels |
| 7 Hunting bugs | blame / `log -S` / bisect (with `npm test`) / diffs between versions and release notes | 4 levels |
| 8 Free sandbox | You + the server + Xiaoming + Xiaohong; buttons make teammates push, cause conflicts or force-push | 1 level |

## Git commands supported by the engine

`init clone config status add rm mv commit log show diff branch checkout switch restore merge rebase cherry-pick revert reset stash tag reflog blame bisect remote fetch pull push clean grep cat-file ls-files ls-tree rev-parse count-objects merge-base fsck gc help`

Including these real-world details: fast-forward / three-way merges and merge commits, diff3 conflict markers, `rebase --continue/--abort/--skip`, `stash push/pop/apply/list/drop` (including `-u`), annotated tags, `reset --soft/--mixed/--hard` and `ORIG_HEAD`, the `HEAD~n / HEAD^ / HEAD@{n} / stash@{n} / rev:path` syntax, the stale-info rejection of `--force-with-lease`, refusing to push to the checked-out branch of a non-bare repository, tracking branches with ahead/behind counts, `pull` asking for a strategy when branches have diverged, `.gitignore`, and the ASCII graph of `log --graph`.

## Project structure

```
index.html        the page
css/style.css     styles
js/i18n.js        bilingual support: T('中文', 'English') and language detection (loaded first)
js/sha1.js        SHA-1
js/diff.js        line diff, unified diff, diff3 three-way merge
js/git.js         engine core: object store, trees, refs, reflog, ancestry, status, tree-level three-way merge
js/gitcmd.js      subcommand implementations and git-style output
js/shell.js       virtual file system + shell + multiple users / remotes
js/analogy.js     "Analogy" panel text and the snapshots-as-folders view
js/levels.js      chapters and levels (setup / tasks / hints / feedback)
js/ui.js          terminal (with output highlighting), SVG commit graph, three-trees table, multi-repo view
js/game.js        stars / XP / achievements / sounds / confetti / level map / onboarding
js/main.js        level loading, command execution, feedback, progress and level replay (localStorage)
test/engine.test.js   engine regression tests (node test/engine.test.js)
test/levels.test.js   checks that every level can be solved by following its hints
test/browser.test.js  Playwright browser smoke test
test/play.js          play from the command line: node test/play.js c3-2 "git merge feature"
test/record.js        records the tutorial / promo videos (VIDEO_LANG=en records the English versions)
media/                videos (tutorial / promo: Chinese .mp4 and English .en.mp4)
```

## Tests

```bash
node test/engine.test.js     # engine: commits, merges, conflicts, stash, reset, rebase, remote collaboration, bisect…
node test/levels.test.js     # all 42 levels can be solved by following the hints
GITGAME_LANG=en node test/levels.test.js   # the same, in English mode
node test/browser.test.js    # needs Playwright + Chromium
```

## Known limitations

- Interactive commands are not supported (`git add -p`, `git rebase -i`); `git commit` without `-m` opens the in-page editor.
- Tree and commit objects are serialized as text, so tree and commit hashes differ from real git (blob hashes are identical; you can check them against `git hash-object`).
- Remotes are simulated with local paths (`/srv/git/project.git`), and `https://github.com/team/project.git` is an alias for it. There is no network and no permission system (only a protected-branch hook is simulated).
- Empty directories are not tracked (just like git); inside a repository, `mkdir` only prints a note.
- Time is a logical clock: dates start at 2026-01-05 and advance with every step, so commit order is always stable.

## Adding a level

Call `LEVELS.push({...})` in `js/levels.js`. `setup(ctx)` builds the world with helpers such as `newProject / commit / collab / asXm`. Each entry in `tasks` is `{ text, check(ctx) }` and is checked against repository state (`repo(ctx).fileAt('HEAD', 'a.txt')`, `branchTip`, `isAncestor`, `conflicts`, …). `hints` are revealed one at a time. The optional `feedback(ctx, cmd, res)` gives targeted corrections, `onCommand` drives the story (for example, a teammate pushing), and `actions` adds sandbox buttons. For English text, wrap every user-visible string as `T('中文', 'English')`. Run `node test/levels.test.js` (and `GITGAME_LANG=en node test/levels.test.js`) to make sure the level can be solved.
