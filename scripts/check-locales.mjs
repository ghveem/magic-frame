// Locale regression checks use the existing esbuild dependency, without a test framework.
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const temp = await mkdtemp(join(tmpdir(), 'mf-locales-'));
try {
  const outfile = join(temp, 'locales.mjs');
  await build({
    stdin: { contents: `
      export * from './src/lib/i18n/locales';
      export * from './src/lib/i18n/date-locale';
      export { PT_BR } from './src/lib/i18n/pt-BR';
      export { format, formatDistance } from 'date-fns';
      export { formatNotifAge } from './src/components/widgets/_shared/notifTimeFormat';
      export { wmoToText } from './src/lib/weather/wmo';
      export { WIDGET_CONFIG_SCHEMAS } from './src/lib/widgets/schemas';
    `, resolveDir: root, loader: 'ts' },
    outfile, bundle: true, platform: 'node', format: 'esm', jsx: 'automatic',
  });
  const m = await import(pathToFileURL(outfile).href);
  assert.equal(m.isLocale('pt-BR'), true);
  for (const invalid of ['pt', 'pt-br', '', null, 123]) assert.equal(m.isLocale(invalid), false);
  const date = new Date(2026, 9, 13, 16, 5);
  assert.equal(m.format(date, 'eee, d MMMM yyyy', { locale: m.dateFnsLocale('pt-BR') }), 'terça, 13 outubro 2026');
  assert.equal(m.format(new Date(2027, 0, 1), 'eeee, d MMMM yyyy', { locale: m.dateFnsLocale('pt-BR') }), 'sexta-feira, 1 janeiro 2027');
  assert.equal(m.formatDistance(new Date(2026, 9, 13, 16, 0), date, { locale: m.dateFnsLocale('pt-BR'), addSuffix: true }), 'há 5 minutos');
  assert.equal(m.forecastWeekday('2026-10-13', 'pt-BR'), 'ter.');
  assert.equal(m.forecastWeekday('2027-01-01', 'pt-BR'), 'sex.');
  assert.equal(m.calendarWeekStartsOn('pt-BR'), 0);
  assert.equal(m.uses12HourClock('pt-BR'), false);
  assert.equal(m.uses12HourClock('pt-BR', '12h'), true);
  assert.equal(m.uses12HourClock('en', '24h'), false);
  assert.equal(m.clockDateLocale('pt-BR', 'en-GB'), 'en-GB');
  assert.equal(m.clockDateLocale('en', 'pt-BR'), 'pt-BR');
  assert.equal(new Intl.DateTimeFormat(m.intlDateLocale('pt-BR'), { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' }).format(new Date('2026-10-13T19:05:00Z')), '16:05');
  assert.equal(m.WIDGET_CONFIG_SCHEMAS['ClockWidget.tsx'].safeParse({ dateFormat: 'pt-BR' }).success, true);
  for (const [locale, intl, weekStart, hour12, weekday] of [
    ['en', 'en-US', 0, true, 'Tue'], ['de', 'de-DE', 1, false, 'Di.'],
    ['nb', 'de-DE', 1, false, 'Di.'], ['nn', 'de-DE', 1, false, 'Di.'],
  ]) {
    assert.equal(m.intlDateLocale(locale), intl);
    assert.equal(m.calendarWeekStartsOn(locale), weekStart);
    assert.equal(m.uses12HourClock(locale), hour12);
    assert.equal(m.format(date, 'eee', { locale: m.dateFnsLocale(locale) }), weekday);
  }
  const now = date.getTime();
  const ago = minutes => new Date(now - minutes * 60_000);
  assert.equal(m.formatNotifAge(ago(5), 'minutes', now, 'pt-BR'), 'há 5 min');
  assert.equal(m.formatNotifAge(ago(125), 'hours', now, 'pt-BR'), 'há 2 h');
  assert.equal(m.formatNotifAge(ago(1440), 'days', now, 'pt-BR'), 'há 1 dia');
  assert.equal(m.formatNotifAge(ago(2880), 'days', now, 'pt-BR'), 'há 2 dias');
  assert.equal(m.formatNotifAge(ago(125), 'combined', now, 'pt-BR'), 'há 2h 5m');
  assert.equal(m.formatNotifAge(ago(-1), 'minutes', now, 'pt-BR'), 'agora mesmo');
  const realNow = Date.now;
  try {
    Date.now = () => now;
    assert.equal(m.formatNotifAge(ago(5), 'auto', now, 'pt-BR'), 'há 5 minutos');
    assert.equal(m.formatNotifAge(ago(5), 'auto', now, 'en'), '5 minutes ago');
    assert.equal(m.formatNotifAge(ago(5), 'auto', now, 'de'), 'vor 5 Minuten');
    assert.equal(m.formatNotifAge(ago(5), 'auto', now, 'nb'), '5 minutes ago');
  } finally { Date.now = realNow; }
  assert.equal(m.wmoToText(3, 'pt-BR'), 'Encoberto');
  assert.equal(m.wmoToText(61, 'pt-BR'), 'Chuva');
  assert.equal(m.wmoToText(95, 'pt-BR'), 'Trovoadas');
  assert.equal(m.wmoToText(3, 'en'), 'Overcast');
  assert.equal(m.wmoToText(3, 'de'), 'Stark bewölkt');
  assert.equal(m.PT_BR['Heute'], 'Hoje');
  assert.equal(m.PT_BR['Morgen'], 'Amanhã');
  console.log('Locale regression checks passed (pt-BR, manual overrides, existing locales).');
} finally { await rm(temp, { recursive: true, force: true }); }
