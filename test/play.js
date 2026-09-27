#!/usr/bin/env node
// 命令行试玩工具：node test/play.js <关卡id> "命令1" "命令2" ...
// 会打印关卡说明、每条命令的输出、任务完成情况和反馈。加 --list 列出所有关卡。
require('../js/i18n.js'); require('../js/sha1.js'); require('../js/diff.js'); require('../js/git.js'); require('../js/gitcmd.js'); require('../js/shell.js'); require('../js/analogy.js'); require('../js/levels.js');
const { LEVELS, CHAPTERS, PROJ } = GitLevels;
const strip = h => String(h || '').replace(/<[^>]+>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const args = process.argv.slice(2);
if (!args.length || args[0] === '--list') { for (const ch of CHAPTERS) { console.log('\n' + ch.title); for (const l of LEVELS.filter(x => x.chapter === ch.id)) console.log(`  ${l.id.padEnd(8)} ${l.title}`); } process.exit(0); }
const lv = LEVELS.find(l => l.id === args[0]);
if (!lv) { console.error('未知关卡 ' + args[0]); process.exit(1); }
const world = new GitShell.World();
GitCore.setClock(Date.UTC(2026, 0, 5, 1, 0, 0));
const ctx = { world, state: {}, teammate: (who, lines) => { const user = who === '小明' ? 'xiaoming' : 'xiaohong'; const home = '/home/' + user; for (const l of lines) { const cwd = world.repoAt(home + '/project') ? home + '/project' : home; const r = world.runAs(user, cwd, l); console.log(`  [${who} @ ${cwd}] $ ${l}\n  ${(r.out || r.err || '').split('\n').slice(0, 2).join('\n  ')}`); } } };
lv.setup(ctx); world.log = [];
world.cwd = world.repoAt(PROJ) ? PROJ : '/home/you';
if (['c1-1', 'c0-1', 'c0-2', 'c5-1'].includes(lv.id)) world.cwd = '/home/you';
console.log(`=== ${lv.title} ===\n${strip(lv.intro)}\n任务：\n${lv.tasks.map((t, i) => `  ${i + 1}. ${t.text}`).join('\n')}\n提示：\n${lv.hints.map(h => '  - ' + h).join('\n')}\n`);
const sticky = lv.tasks.map(() => false);
const evalTasks = () => lv.tasks.forEach((t, i) => { if (!sticky[i]) { try { sticky[i] = !!t.check(ctx); } catch (e) { sticky[i] = false; } } });
for (const cmd of args.slice(1)) {
  console.log(world.prompt() + cmd);
  const r = world.exec(cmd);
  if (r.out) console.log(r.out);
  if (r.err) console.log('[stderr] ' + r.err);
  if (lv.onCommand) { const m = lv.onCommand(ctx, cmd, r); if (m) console.log('[剧情] ' + strip(m)); }
  if (lv.feedback) { const m = lv.feedback(ctx, cmd, r); if (m) console.log('[关卡反馈] ' + strip(m)); }
  const ex = GitAnalogy.explain(cmd.split(/\s+/), r.traces || [], world.currentRepo() && world.currentRepo().repo);
  if (ex && ex.trace) console.log('[底层] ' + strip(ex.trace.replace(/<li>/g, ' • ').replace(/<\/li>/g, '\n')).trim());
  evalTasks();
}
console.log('\n任务状态：' + lv.tasks.map((t, i) => `${sticky[i] ? '✓' : '✗'} ${i + 1}`).join('  ') + (sticky.every(Boolean) ? '   🎉 通关' : ''));
if (sticky.every(Boolean) && lv.done) console.log(strip(lv.done));
