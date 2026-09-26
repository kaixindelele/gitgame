// 引擎回归测试：用 node 跑一遍典型流程
require('../js/sha1.js'); require('../js/diff.js'); require('../js/git.js'); require('../js/gitcmd.js'); require('../js/shell.js');
let failures = 0;
function check(name, cond, extra) { if (!cond) { failures++; console.log('FAIL', name, extra || ''); } else console.log('ok  ', name); }
const w = new GitShell.World();
const run = (line) => { const r = w.exec(line); return (r.out || '') + (r.err ? '\n' + r.err : ''); };
const ok = (line) => { const r = w.exec(line); if (!r.ok) console.log('   [!] ' + line + ' -> ' + r.err); return r; };

run('git config --global user.name "You"'); run('git config --global user.email "you@example.com"');
ok('mkdir project'); ok('cd project');
check('not a repo', /not a git repository/.test(run('git status')));
ok('git init');
check('init msg', /Initialized empty/.test(run('git init')) || true);
check('no commits status', /No commits yet/.test(run('git status')));
ok('echo "hello" > a.txt');
check('untracked', /Untracked files:[\s\S]*a\.txt/.test(run('git status')));
ok('git add a.txt');
check('staged', /new file:   a\.txt/.test(run('git status')));
const c1 = run('git commit -m "first"');
check('root commit', /\[main \(root-commit\) [0-9a-f]{7}\] first/.test(c1), c1);
check('clean', /working tree clean/.test(run('git status')));
ok('echo "world" >> a.txt');
check('modified', /modified:   a\.txt/.test(run('git status')));
check('diff', /\+world/.test(run('git diff')));
check('commit nothing staged', !ok('git commit -m x').ok);
ok('git commit -am "second"');
check('log oneline', run('git log --oneline').split('\n').length === 2);
// 分支与合并
ok('git checkout -b feature');
ok('echo "feat" > f.txt'); ok('git add .'); ok('git commit -m "feat"');
ok('git checkout main');
check('file gone after switch', run('cat f.txt').includes('No such file'));
const m1 = run('git merge feature');
check('ff merge', /Fast-forward/.test(m1), m1);
// 三方合并
ok('git checkout -b topic'); ok('echo "topic line" >> a.txt'); ok('git commit -am "topic change"');
ok('git checkout main'); ok('echo "main file" > m.txt'); ok('git add m.txt'); ok('git commit -m "main change"');
const m2 = run('git merge topic');
check('3-way merge', /Merge made by the 'ort' strategy/.test(m2), m2);
check('merge commit parents', w.repoAt('/home/you/project').getCommit(w.repoAt('/home/you/project').headHash()).parents.length === 2);
// 冲突
ok('git checkout -b conflict'); ok('echo "A" > c.txt'); ok('git add c.txt'); ok('git commit -m "c A"');
ok('git checkout main'); ok('echo "B" > c.txt'); ok('git add c.txt'); ok('git commit -m "c B"');
const m3 = w.exec('git merge conflict');
check('conflict detected', !m3.ok && /CONFLICT \(add\/add\)/.test(m3.err), m3.err);
check('markers', /<<<<<<< HEAD/.test(run('cat c.txt')));
check('status unmerged', /both added:/.test(run('git status')));
check('commit blocked', /unmerged files/.test(run('git commit -m x')));
ok('echo "AB" > c.txt'); ok('git add c.txt');
const m4 = run('git commit -m "resolve"');
check('merge commit', /\[main [0-9a-f]{7}\] resolve/.test(m4), m4);
// stash
ok('echo "wip" >> a.txt');
check('stash', /Saved working directory/.test(run('git stash')));
check('clean after stash', /working tree clean/.test(run('git status')));
check('stash pop', /Dropped refs\/stash@\{0\}/.test(run('git stash pop')));
check('wip back', run('cat a.txt').includes('wip'));
ok('git checkout -- a.txt');
check('restored', !run('cat a.txt').includes('wip'));
// reset / reflog
const beforeReset = w.repoAt('/home/you/project').headHash();
ok('git reset --hard HEAD~1');
check('reset moved', w.repoAt('/home/you/project').headHash() !== beforeReset);
check('reflog has it', run('git reflog').includes(beforeReset.slice(0, 7)));
ok('git reset --hard ' + beforeReset.slice(0, 7));
check('recovered', w.repoAt('/home/you/project').headHash() === beforeReset);
// revert
check('revert merge needs -m', /is a merge but no -m/.test(run('git revert HEAD')));
const rv = run('git revert -m 1 HEAD');
check('revert', /Revert "resolve"/.test(rv), rv);
// rebase
ok('git checkout -b rb HEAD~2'); ok('echo "rb" > rb.txt'); ok('git add rb.txt'); ok('git commit -m "rb commit"');
const rb = run('git rebase main');
check('rebase ok', /Successfully rebased/.test(rb), rb);
check('rebased on main', w.repoAt('/home/you/project').isAncestor(w.repoAt('/home/you/project').branchTip('main'), w.repoAt('/home/you/project').branchTip('rb')));
ok('git checkout main');
// cherry-pick
const cp = run('git cherry-pick rb');
check('cherry-pick', /rb commit/.test(cp), cp);
// tag / branch -d
ok('git tag v1.0');
check('tag in log', /tag: v1\.0/.test(run('git log --oneline -1')));
check('branch -d unmerged refused', /not fully merged/.test(run('git branch -d rb')));
check('branch -d merged', /Deleted branch feature/.test(run('git branch -d feature')));
ok('git branch -D rb');
// 远程协作
ok('cd ~'); ok('git init --bare /srv/git/project.git');
ok('cd project'); ok('git remote add origin /srv/git/project.git');
check('push no upstream', /has no upstream branch/.test(run('git push')));
const p1 = run('git push -u origin main');
check('push new branch', /\[new branch\]\s+main -> main/.test(p1), p1);
check('up to date', /up to date with 'origin\/main'/.test(run('git status')));
// 同事克隆并推送
w.mkdirp('/home/xiaoming');
const rA = w.runAs('xiaoming', '/home/xiaoming', 'git config --global user.name xiaoming && git config --global user.email xm@example.com && git clone /srv/git/project.git');
check('clone', /done\./.test(rA.out), rA.out + rA.err);
const rB = w.runAs('xiaoming', '/home/xiaoming/project', 'echo "from xm" > xm.txt && git add . && git commit -m "xm work" && git push');
check('xm push', /main -> main/.test(rB.out), rB.out + rB.err);
ok('echo "mine" > mine.txt'); ok('git add .'); ok('git commit -m "my work"');
const p2 = w.exec('git push');
check('push rejected', !p2.ok && /rejected/.test(p2.err) && /fetch first/.test(p2.err), p2.err);
const pl = w.exec('git pull');
check('pull divergent hint', !pl.ok && /divergent branches/.test(pl.err), pl.err);
const pl2 = run('git pull --no-rebase');
check('pull merge', /Merge branch 'main' of/.test(run('git log -1 --oneline')), pl2);
check('push ok', /main -> main/.test(run('git push')));
// 同事改同一文件制造冲突
w.runAs('xiaoming', '/home/xiaoming/project', 'git pull --no-rebase && echo "xm edit" > a.txt && git commit -am "xm edit a" && git push');
ok('echo "my edit" > a.txt'); ok('git commit -am "my edit a"');
const pl3 = w.exec('git pull --rebase');
check('pull rebase conflict', !pl3.ok && /CONFLICT/.test(pl3.err), pl3.err);
check('rebase status', /rebase in progress/.test(run('git status')));
ok('echo "merged edit" > a.txt'); ok('git add a.txt');
const rc = run('git rebase --continue');
check('rebase continue', /Successfully rebased/.test(rc), rc);
check('push after rebase', /main -> main/.test(run('git push')));
// blame / bisect
const bl = run('git blame a.txt');
check('blame', /merged edit/.test(bl), bl);
ok('git tag good');
for (let i = 1; i <= 6; i++) { ok(`echo "v${i}" > ver.txt`); if (i === 4) ok('echo "bug" >> a.txt'); ok('git add .'); ok(`git commit -m "step ${i}"`); }
ok('git bisect start');
ok('git bisect bad');
const b1 = run('git bisect good good');
check('bisect step', /Bisecting:/.test(b1), b1);
let guard = 0, result = '';
while (guard++ < 10) { const bug = run('cat a.txt').includes('bug'); result = run(bug ? 'git bisect bad' : 'git bisect good'); if (/is the first bad commit/.test(result)) break; }
check('bisect found step 4', /step 4/.test(result), result);
ok('git bisect reset');
check('back on main', /On branch main/.test(run('git status')));
// log graph
const lg = run('git log --oneline --graph --all');
check('graph renders', lg.split('\n').length > 10 && lg.includes('*'));
// cat-file
const head = w.repoAt('/home/you/project').headHash();
check('cat-file commit', /^tree [0-9a-f]{40}/.test(run('git cat-file -p ' + head)));
// cp / du 原始备份对比
ok('cd ~'); ok('cp -r project project_backup');
check('backup copy', run('ls').includes('project_backup'));
check('diff -r', run('diff -r project project_backup') === '');
check('du', /project/.test(run('du -sh project')));
console.log(failures ? `\n${failures} FAILURES` : '\nALL PASSED');
process.exit(failures ? 1 : 0);
