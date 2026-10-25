require('./register-typescript.cjs');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { THEME_STORAGE_KEY, themeBootstrapScript, getThemePreference, setThemePreference, subscribeTheme } = require('../src/lib/theme.ts');

function firstPaint(value, systemDark = false, blocked = false) {
  const root = { dataset: {} };
  vm.runInNewContext(themeBootstrapScript, {
    document: { documentElement: root },
    localStorage: { getItem() { if (blocked) throw Error('Storage unavailable'); return value; } },
    window: { matchMedia: () => ({ matches: systemDark }) },
  });
  return root.dataset;
}

test('saved dark mode is applied before hydration, independently of the OS', () => {
  assert.deepEqual(firstPaint('dark', false), { theme: 'dark', themePreference: 'dark' });
  assert.deepEqual(firstPaint('light', true), { theme: 'light', themePreference: 'light' });
});
test('new visitors, corrupt storage and blocked storage keep the existing light default', () => {
  for (const value of [null, '', 'invalid', '<script>', '{}']) assert.equal(firstPaint(value, true).theme, 'light');
  assert.equal(firstPaint('dark', true, true).theme, 'light');
});
test('System resolves the OS preference on the first paint', () => {
  assert.equal(firstPaint('system', true).theme, 'dark');
  assert.equal(firstPaint('system', false).theme, 'light');
});
test('choice persists, OS changes respect explicit choices, tabs sync and listeners are removed', () => {
  const oldWindow = global.window, oldDocument = global.document;
  const media = new EventTarget(); media.matches = false;
  const stored = new Map();
  const win = new EventTarget();
  win.matchMedia = () => media;
  win.localStorage = { setItem: (key, value) => stored.set(key, value) };
  global.window = win;
  global.document = { documentElement: { dataset: { theme: 'light', themePreference: 'light' } } };
  let changes = 0;
  const stop = subscribeTheme(() => changes++);
  const storage = (key, newValue) => {
    const event = new Event('storage'); Object.assign(event, { key, newValue }); win.dispatchEvent(event);
  };
  try {
    setThemePreference('dark');
    assert.equal(stored.get(THEME_STORAGE_KEY), 'dark');
    assert.equal(document.documentElement.dataset.theme, 'dark');
    media.dispatchEvent(new Event('change'));
    assert.equal(document.documentElement.dataset.theme, 'dark');
    setThemePreference('system');
    assert.equal(document.documentElement.dataset.theme, 'light');
    media.matches = true; media.dispatchEvent(new Event('change'));
    assert.equal(document.documentElement.dataset.theme, 'dark');
    storage('unrelated', 'light'); assert.equal(getThemePreference(), 'system');
    storage(THEME_STORAGE_KEY, 'light'); assert.equal(getThemePreference(), 'light');
    assert.equal(document.documentElement.dataset.theme, 'light');
    storage(THEME_STORAGE_KEY, 'dark'); assert.equal(getThemePreference(), 'dark');
    storage(null, null); assert.equal(getThemePreference(), 'light');
    win.localStorage.setItem = () => { throw Error('Storage unavailable'); };
    assert.doesNotThrow(() => setThemePreference('dark'));
    assert.equal(document.documentElement.dataset.theme, 'dark');
    stop(); const before = changes;
    storage(THEME_STORAGE_KEY, 'light');
    assert.equal(changes, before); assert.equal(getThemePreference(), 'dark');
  } finally { stop(); global.window = oldWindow; global.document = oldDocument; }
});
