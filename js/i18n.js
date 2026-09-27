/* 中英双语：T('中文', 'English') 按当前语言返回对应文本。
 * 语言在页面加载时确定（?lang=en / localStorage / 浏览器语言），切换语言会刷新页面，
 * 因此模块加载时求值的 T() 也始终与当前语言一致。Node 下用环境变量 GITGAME_LANG。 */
(function (global) {
  'use strict';
  function detect() {
    try {
      // Node（测试/录制脚本）：默认中文，只认环境变量；Node 22 自带的 navigator.language 不作数
      if (typeof process !== 'undefined' && process.versions && process.versions.node) return process.env.GITGAME_LANG === 'en' ? 'en' : 'zh';
      if (typeof location !== 'undefined') {
        const q = new URLSearchParams(location.search).get('lang');
        if (q === 'en' || q === 'zh') return q;
      }
      if (typeof localStorage !== 'undefined') {
        const s = localStorage.getItem('gitgame.lang');
        if (s === 'en' || s === 'zh') return s;
      }
      if (typeof navigator !== 'undefined' && navigator.language) return /^zh/i.test(navigator.language) ? 'zh' : 'en';
    } catch (e) { }
    return 'zh';
  }
  const I18N = {
    lang: detect(),
    t(zh, en) { return I18N.lang === 'en' && en !== undefined ? en : zh; },
    set(lang) {
      try { localStorage.setItem('gitgame.lang', lang); } catch (e) { }
      try { const u = new URL(location.href); u.searchParams.delete('lang'); const next = u.toString(); if (next === location.href) location.reload(); else location.replace(next); } catch (e) { location.reload(); }
    },
    /* 把带 data-en 属性的静态 HTML 元素切成英文（data-en-title / data-en-placeholder 同理） */
    applyStatic(root) {
      if (I18N.lang !== 'en' || !root || !root.querySelectorAll) return;
      root.querySelectorAll('[data-en]').forEach(el => { el.innerHTML = el.getAttribute('data-en'); });
      root.querySelectorAll('[data-en-title]').forEach(el => { el.title = el.getAttribute('data-en-title'); });
      root.querySelectorAll('[data-en-placeholder]').forEach(el => { el.placeholder = el.getAttribute('data-en-placeholder'); });
    },
  };
  global.I18N = I18N;
  global.T = I18N.t;
  if (typeof document !== 'undefined') document.documentElement.lang = I18N.lang === 'en' ? 'en' : 'zh-CN';
})(typeof window !== 'undefined' ? window : globalThis);
