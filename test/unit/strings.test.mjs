import test from 'node:test';
import assert from 'node:assert/strict';
import { STRINGS, LOCALES, setLocale, t } from '../../src/strings.js';

test('zh and en expose identical keys', () => {
  assert.deepEqual(Object.keys(STRINGS['zh-CN']).sort(), Object.keys(STRINGS.en).sort());
  assert.ok(Object.keys(STRINGS['zh-CN']).length >= 70);
});

test('every locale has non-empty copy', () => {
  for (const locale of LOCALES) {
    for (const [key, value] of Object.entries(STRINGS[locale])) {
      assert.ok(value.trim().length > 0, `${locale}:${key}`);
    }
  }
});

test('interpolation and switching', () => {
  setLocale('zh-CN');
  assert.equal(t('hud.score'), '得分');
  assert.equal(t('over.delta', { n: 118 }), '差 118 分');
  setLocale('en');
  assert.equal(t('hud.score'), 'SCORE');
  assert.equal(t('over.delta', { n: 118 }), '118 points short');
  setLocale('zh-CN');
});
