import { describe, expect, it } from 'vitest';
import { calendarCells, filterEntries, fold, hubStats, monthSeries, weekdayOf, yearsOf } from '../src/core/hub';
import { buildIndex } from '../src/core/model';
import { readFrontmatter } from '../scripts/frontmatter';
import { CONFIGS } from '../scripts/configs';
import { profileFiles } from '../scripts/make-test-vault';

const entries = buildIndex(
	[...profileFiles('arturo')].map(([path, content]) => ({ path, frontmatter: readFrontmatter(content) })),
	CONFIGS.arturo!,
).entries;

describe('búsqueda', () => {
	it('sin acentos ni mayúsculas, todas las palabras', () => {
		expect(fold('Jardín')).toBe('jardin');
		const jardin = filterEntries(entries, 'JARDIN');
		expect(jardin.length).toBeGreaterThan(0);
		expect(jardin.every((e) => e.keyword.startsWith('Jardín'))).toBe(true);
		expect(filterEntries(entries, '  ')).toBe(entries);
		expect(filterEntries(entries, 'viaje corto').every((e) => fold(e.keyword).includes('viaje corto'))).toBe(true);
		expect(filterEntries(entries, 'no-existe-xyz')).toEqual([]);
	});
	it('también busca por fecha en el nombre', () => {
		expect(filterEntries(entries, '2024-10').every((e) => e.date.year === 2024 && e.date.month === 10)).toBe(true);
	});
});

describe('totales', () => {
	it('bóveda arturo: 95 entradas, meses con entradas y la última', () => {
		const s = hubStats(entries);
		expect(s.total).toBe(95);
		expect(s.months).toBe(18);
		expect(s.last).toEqual(entries[entries.length - 1]!.date);
		expect(hubStats([])).toEqual({ total: 0, months: 0, last: null });
	});
});

describe('serie por mes', () => {
	it('sin huecos, con ceros en los meses vacíos, hasta hoy', () => {
		const series = monthSeries(entries, { year: 2026, month: 11, day: 5 });
		expect(series[0]).toMatchObject({ year: 2024, month: 10 });
		expect(series[series.length - 1]).toMatchObject({ year: 2026, month: 11, count: 0 });
		expect(series).toHaveLength(26); // oct 2024 … nov 2026
		expect(series.find((s) => s.year === 2025 && s.month === 3)!.count).toBe(0);
		expect(series.reduce((n, s) => n + s.count, 0)).toBe(95);
	});
});

describe('calendario', () => {
	it('semana de lunes a domingo', () => {
		// 1 de noviembre de 2026 es domingo: 6 huecos antes
		const nov = calendarCells(2026, 11);
		expect(nov.slice(0, 7)).toEqual([null, null, null, null, null, null, 1]);
		expect(nov.filter((c) => c !== null)).toHaveLength(30);
		// febrero bisiesto
		expect(calendarCells(2028, 2).filter((c) => c !== null)).toHaveLength(29);
		expect(weekdayOf({ year: 2026, month: 11, day: 5 })).toBe(4); // jueves
	});
	it('años con entradas, del más reciente', () => {
		expect(yearsOf(entries)).toEqual([2026, 2025, 2024]);
	});
});
