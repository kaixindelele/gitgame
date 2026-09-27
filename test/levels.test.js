// 对每一关执行 setup，然后按 hints 里的命令（去掉中文说明）自动通关，验证任务判定可达
// 中英文都要能通过：GITGAME_LANG=en node test/levels.test.js（setup 造出的提交信息随语言变化，所以查找提交时也用 T()）
require('../js/i18n.js'); require('../js/sha1.js'); require('../js/diff.js'); require('../js/git.js'); require('../js/gitcmd.js'); require('../js/shell.js'); require('../js/analogy.js'); require('../js/levels.js');
const SOLUTIONS = {
  'c0-1': ['cp -r project project_v1', 'echo "// 新功能" >> project/app.js', 'cp -r project project_v2', 'diff -r project_v1 project_v2', 'du -sh *'],
  'c0-2': ['grep -r 8080 .', 'rm -r project && cp -r project_final2 project', 'diff -r project_final project_backup_0103', 'rm -r project_backup_0103'],
  'c1-1': ['cd project', 'git init', T('git config --global user.name "小王"', 'git config --global user.name "Alex"'), 'git config --global user.email "x@example.com"', 'git status'],
  'c1-2': [T('echo "# 项目说明" > README.md', 'echo "# About this project" > README.md'), 'git add .', 'git status', T('git commit -m "第一次提交"', 'git commit -m "First commit"')],
  'c1-3': ['sed -i "s/hello/hello, git/" app.js', 'git diff', 'git add app.js && git diff --staged', 'git commit -m "改问候语"', 'echo "x" > utils.js && git add utils.js && git commit -m "utils"'],
  'c1-4': ['git log --oneline', 'git cat-file -p HEAD', '@tree', '@blob', 'git count-objects'],
  'c1-5': ['printf "*.log\\nnode_modules/\\n" > .gitignore', 'git status', 'git add . && git commit -m "ignore"'],
  'c2-1': ['git diff', 'git restore app.js', 'git status'],
  'c2-2': ['git status', 'git restore --staged secret.env', 'echo "secret.env" >> .gitignore', 'git add . && git commit -m "feat"'],
  'c2-3': ['git add test.js', 'git commit --amend -m "fix bug"', 'git reflog'],
  'c2-4': ['git reset --hard HEAD~1', 'git reset --soft HEAD~2', T('git commit -m "完成步骤1和2"', 'git commit -m "Finish steps 1 and 2"')],
  'c2-5': ['git log --oneline', 'git revert HEAD~1', 'git push'],
  'c2-6': ['git log --oneline', 'git reflog', 'git reset --hard HEAD@{1}'],
  'c2-7': ['git branch', 'git reflog', '@payment'],
  'c3-1': ['git switch -c feature/dark-mode', 'echo "body{}" > theme.css && git add theme.css && git commit -m "dark"', 'git switch main && ls', 'git log --oneline --graph --all'],
  'c3-2': ['git merge feature', 'git branch -d feature'],
  'c3-3': ['git log --oneline --graph --all', 'git merge feature', 'git log --oneline --graph'],
  'c3-4': ['git checkout HEAD~2', T('echo "试验" > experiment.js && git add . && git commit -m "实验"', 'echo "trying things" > experiment.js && git add . && git commit -m "Experiment"'), 'git switch -c experiment', 'git switch main'],
  'c3-5': ['git rebase main', 'git switch main && git merge feature'],
  'c3-6': ['git log dev --oneline', '@pick'],
  'c3-7': ['git switch main', 'git stash', T('git switch main && echo "const app = { fixed: true };" > app.js && git commit -am "紧急修复"', 'git switch main && echo "const app = { fixed: true };" > app.js && git commit -am "Hotfix"'), 'git switch feature && git stash pop'],
  'c3-8': ['git tag -a v1.0 -m "first"', T('echo "v1.1" > app.js && git commit -am "小改动" && git tag v1.1', 'echo "v1.1" > app.js && git commit -am "Small change" && git tag v1.1'), 'git diff v1.0 v1.1'],
  'c4-1': ['git merge feature', 'printf "export function greet(name) {\\n  return \\"Hi, \\" + name.trim() + \\"!\\";\\n}\\n" > greeting.js', 'git add greeting.js && git status', 'git commit -m "merge"'],
  'c4-2': ['git merge feature', 'git merge --abort', 'git status', 'git merge feature', 'git checkout --theirs greeting.js && git add greeting.js && git commit -m "theirs"'],
  'c4-3': ['git rebase main', 'printf "export function greet(name) {\\n  return \\"Hi, \\" + name.trim() + \\"!\\";\\n}\\n" > greeting.js', 'git add greeting.js && git rebase --continue', 'git log --oneline --graph --all'],
  'c4-4': ['git merge feature', 'git rm legacy.js', 'git commit -m "merge"'],
  'c5-1': ['git clone https://github.com/team/project.git', 'cd project && git remote -v', 'git branch -a', 'git log --oneline'],
  'c5-2': ['echo "hello" > hello.js && git add . && git commit -m "hello"', 'git status', 'git push && git status'],
  'c5-3': ['git fetch && git status', 'git log origin/main --oneline', 'git pull'],
  'c5-4': ['git push', 'git pull --rebase', 'git push'],
  'c5-5': ['git pull --rebase', 'printf "module.exports = {\\n  timeout: 5000,\\n  retries: 3,\\n};\\n" > config.js', 'git add config.js && git rebase --continue', 'git push'],
  'c5-6': [T('git switch -c feature/search && echo "search" > search.js && git add . && git commit -m "搜索功能"', 'git switch -c feature/search && echo "search" > search.js && git add . && git commit -m "Search feature"'), 'git push -u origin feature/search', 'git pull', 'git switch main && git merge feature/search && git push', 'git push origin --delete feature/search && git branch -d feature/search'],
  'c5-7': ['git push', 'git push --force-with-lease', 'git fetch && git log origin/main --oneline && git rebase origin/main', 'git push'],
  'c6-1': [T('git rm old-module.js && git commit -m "移除旧模块"', 'git rm old-module.js && git commit -m "Remove old module"'), 'git log --oneline', T('git checkout HEAD~1 -- old-module.js && git commit -m "恢复旧模块"', 'git checkout HEAD~1 -- old-module.js && git commit -m "Restore old module"')],
  'c6-2': ['git show v1.0:parser.js', 'git checkout v1.0 -- parser.js', T('git commit -m "回退 parser"', 'git commit -m "Revert parser"')],
  'c6-3': ['git fetch && git status', 'git log --oneline --all', 'git push'],
  'c6-4': ['git status', 'git add notes.md', 'git clean -n && git clean -fd'],
  'c7-1': ['git blame tax.js', '@show-bad', '@revert-bad', 'git push'],
  'c7-2': ['git log -S "validate(" --oneline', 'git show HEAD~2', 'git revert HEAD~2'],
  'c7-3': ['npm test; git bisect start; git bisect bad; git bisect good v1.0', '@bisect', '@bisect-fix'],
  'c7-4': ['git log v1.0..v2.0 --oneline', 'git diff v1.0 v2.0 --stat', T('git log --author=小明 --oneline', 'git log --author=Xiaoming --oneline'), T('echo "v2.0: 新增搜索功能" > RELEASE.md && git add . && git commit -m "发布说明"', 'echo "v2.0: new search feature" > RELEASE.md && git add . && git commit -m "Release notes"')],
};
let failures = 0;
for (const lv of GitLevels.LEVELS) {
  if (lv.sandbox) continue;
  const world = new GitShell.World();
  GitCore.setClock(Date.UTC(2026, 0, 5, 1, 0, 0));
  const ctx = { world, state: {}, teammate: (who, lines) => { const cwd = who === '小明' ? '/home/xiaoming/project' : '/home/xiaohong/project'; for (const l of lines) world.runAs(who === '小明' ? 'xiaoming' : 'xiaohong', cwd, l); } };
  lv.setup(ctx);
  world.log = [];
  { const pre = lv.tasks.map(t => { try { return !!t.check(ctx); } catch (e) { return false; } }); if (pre.some(Boolean)) { failures++; console.log('FAIL', lv.id, T('开局就已满足的任务:', 'tasks already satisfied at start:'), pre.map((v, i) => v ? i + 1 : null).filter(Boolean).join(',')); } }
  const sol = SOLUTIONS[lv.id];
  if (!sol) { console.log('SKIP', lv.id); continue; }
  const repo = () => world.repoAt(GitLevels.PROJ);
  const sticky = lv.tasks.map(() => false);
  const evalTasks = () => { lv.tasks.forEach((t, i) => { if (!sticky[i]) { try { sticky[i] = !!t.check(ctx); } catch (e) { sticky[i] = 'ERR ' + e.message; } } }); if (lv.tasks.every((t, i) => t.observe || sticky[i] === true)) lv.tasks.forEach((t, i) => { if (t.observe) sticky[i] = true; }); };
  const run = l => { const r = world.exec(l); if (lv.onCommand) lv.onCommand(ctx, l, r); evalTasks(); return r; };
  for (let step of sol) {
    if (step === '@tree') { const r = repo(); step = 'git cat-file -p ' + r.getCommit(r.headHash()).tree; }
    if (step === '@blob') { const r = repo(); step = 'git cat-file -p ' + r.treeOfCommit(r.headHash()).get('app.js'); }
    if (step === '@payment') { const r = repo(); const h = r.reflogs.get('HEAD').find(e => e.msg.includes(T('支付功能 v2', 'Payment feature v2'))).new; step = 'git branch payment ' + h; }
    if (step === '@pick') { const r = repo(); const h = r.revList([r.branchTip('dev')]).find(x => r.subject(x) === T('修复崩溃', 'Fix crash')); step = 'git cherry-pick ' + h; }
    if (step === '@show-bad' || step === '@revert-bad') { const r = repo(); const h = r.revList([r.headHash()]).find(x => r.subject(x) === T('小明：调整常量', 'Xiaoming: tweak constants')); step = (step === '@show-bad' ? 'git show ' : 'git revert ') + h; }
    if (step === '@bisect') { let g = 0; while (g++ < 10) { const t = run('npm test'); const r = run(t.ok ? 'git bisect good' : 'git bisect bad'); if (/first bad commit/.test(r.out)) break; } continue; }
    if (step === '@bisect-fix') { const r = repo(); const h = r.state.bisect.found; run('git bisect reset'); run('git revert ' + h); run('npm test'); continue; }
    const r = run(step);
    if (!r.ok && !/^git (push|pull|merge feature|rebase main|switch main)$/.test(step) && !/^npm test/.test(step)) console.log(`   [${lv.id}] cmd failed: ${step} -> ${r.err}`);
  }
  evalTasks();
  const results = sticky;
  const pass = results.every(x => x === true);
  if (!pass) failures++;
  console.log(pass ? 'ok  ' : 'FAIL', lv.id, lv.title, pass ? '' : JSON.stringify(results));
}
console.log(failures ? `${failures} level failures` : 'ALL LEVELS SOLVABLE');
process.exit(failures ? 1 : 0);
