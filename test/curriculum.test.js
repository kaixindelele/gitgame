// 教学叙事（js/curriculum.js）的完整性检查：
// 每一关都在旅程里恰好出现一次；每一关都有完整叙事；tasks 与 levels.js 一一对应；focus 合法；没有空字符串。
// 中英文都要能通过：GITGAME_LANG=en node test/curriculum.test.js（英文模式下任何文本都不能含中文字符）
require('../js/i18n.js'); require('../js/sha1.js'); require('../js/diff.js'); require('../js/git.js'); require('../js/gitcmd.js'); require('../js/shell.js'); require('../js/analogy.js'); require('../js/levels.js'); require('../js/curriculum.js');
const { LEVELS } = globalThis.GitLevels;
const C = globalThis.GitCurriculum;
const EN = globalThis.I18N.lang === 'en';
const FOCUS = ['terminal', 'graph', 'trees', 'analogy', 'multi', 'editor'];
const CJK = /[一-鿿]/;

let fails = 0, checks = 0;
function ok(cond, msg) { checks++; if (!cond) { fails++; console.error('✗ ' + msg); } }
function str(v, where) {
  ok(typeof v === 'string', `${where}: 应为字符串 (got ${typeof v})`);
  if (typeof v !== 'string') return;
  ok(v.trim().length > 0, `${where}: 不能为空`);
  if (EN) ok(!CJK.test(v), `${where}: 英文模式含中文 → ${JSON.stringify(v)}`);
}
function arr(v, where, min = 1) { ok(Array.isArray(v) && v.length >= min, `${where}: 应为至少 ${min} 项的数组`); return Array.isArray(v) ? v : []; }

ok(C && Array.isArray(C.stages) && C.levels && typeof C.levels === 'object', 'GitCurriculum 结构');

/* 阶段 */
const seen = new Map();
ok(C.stages.length === 9, `应有 9 个阶段 (got ${C.stages.length})`);
const stageIds = new Set();
C.stages.forEach((s, i) => {
  const w = `stages[${i}](${s.id})`;
  str(s.id, w + '.id'); ok(!stageIds.has(s.id), w + ': 阶段 id 重复'); stageIds.add(s.id);
  for (const k of ['icon', 'title', 'question', 'crude', 'git']) str(s[k], `${w}.${k}`);
  arr(s.commands, w + '.commands').forEach((c, j) => str(c, `${w}.commands[${j}]`));
  arr(s.expect, w + '.expect').forEach((c, j) => str(c, `${w}.expect[${j}]`));
  ok(Number.isInteger(s.difficulty) && s.difficulty >= 1 && s.difficulty <= 5, `${w}.difficulty 应为 1–5`);
  arr(s.levels, w + '.levels').forEach(id => seen.set(id, (seen.get(id) || 0) + 1));
});
ok(C.stages[0].id === 'prologue' && C.stages[C.stages.length - 1].id === 'finale', '首尾阶段应为 prologue / finale');
ok(C.stages[C.stages.length - 1].levels.includes('sandbox'), '沙盒应在终章');

/* 每个关卡恰好出现一次 */
const ids = LEVELS.map(l => l.id);
for (const id of ids) ok(seen.get(id) === 1, `关卡 ${id} 在旅程中出现 ${seen.get(id) || 0} 次（应为 1）`);
for (const id of seen.keys()) ok(ids.includes(id), `旅程里的 ${id} 不是 levels.js 中的关卡`);

/* 每关叙事 */
for (const L of LEVELS) {
  const c = C.levels[L.id], w = `levels[${L.id}]`;
  ok(!!c, `${w}: 缺少叙事`);
  if (!c) continue;
  ok(c.problem && typeof c.problem === 'object', `${w}.problem`);
  str(c.problem && c.problem.title, `${w}.problem.title`); str(c.problem && c.problem.story, `${w}.problem.story`);
  ok(c.crude && typeof c.crude === 'object', `${w}.crude`);
  const steps = arr(c.crude && c.crude.steps, `${w}.crude.steps`, 2);
  ok(steps.length <= 4, `${w}.crude.steps 应为 2–4 步`);
  steps.forEach((s, j) => { str(s.icon, `${w}.crude.steps[${j}].icon`); str(s.text, `${w}.crude.steps[${j}].text`); });
  str(c.crude && c.crude.pain, `${w}.crude.pain`);
  str(c.git && c.git.idea, `${w}.git.idea`);
  arr(c.git && c.git.commands, `${w}.git.commands`).forEach((x, j) => str(x, `${w}.git.commands[${j}]`));
  const ex = arr(c.expect, `${w}.expect`); ok(ex.length <= 3, `${w}.expect 应为 1–3 条`);
  ex.forEach((x, j) => str(x, `${w}.expect[${j}]`));
  const tasks = arr(c.tasks, `${w}.tasks`);
  ok(tasks.length === L.tasks.length, `${w}.tasks 长度 ${tasks.length} ≠ levels.js 的 ${L.tasks.length}`);
  tasks.forEach((t, j) => { ok(FOCUS.includes(t.focus), `${w}.tasks[${j}].focus 非法: ${t.focus}`); str(t.why, `${w}.tasks[${j}].why`); });
  ok(c.recap && typeof c.recap === 'object', `${w}.recap`);
  str(c.recap && c.recap.crude, `${w}.recap.crude`); str(c.recap && c.recap.git, `${w}.recap.git`); str(c.recap && c.recap.next, `${w}.recap.next`);
  const pf = arr(c.recap && c.recap.pitfalls, `${w}.recap.pitfalls`); ok(pf.length <= 3, `${w}.recap.pitfalls 应为 1–3 条`);
  pf.forEach((x, j) => str(x, `${w}.recap.pitfalls[${j}]`));
}
for (const id of Object.keys(C.levels)) ok(ids.includes(id), `叙事里的 ${id} 不是 levels.js 中的关卡`);

/* 兜底：递归扫描所有字符串，不许有空串；英文模式不许有中文 */
(function walk(v, path) {
  if (typeof v === 'string') { ok(v.trim() !== '', `${path}: 空字符串`); if (EN) ok(!CJK.test(v), `${path}: 英文模式含中文 → ${JSON.stringify(v)}`); }
  else if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${path}[${i}]`));
  else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) walk(x, `${path}.${k}`);
})({ stages: C.stages, levels: C.levels }, 'curriculum');

console.log(`[${globalThis.I18N.lang}] curriculum: ${checks - fails}/${checks} checks passed, ${LEVELS.length} levels, ${C.stages.length} stages`);
if (fails) { console.error(`${fails} failure(s)`); process.exit(1); }
