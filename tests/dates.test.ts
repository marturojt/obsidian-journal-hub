import { describe, expect, it } from 'vitest';
import { formatDate, hasFullDate, parseDatePrefix, parseFrontmatterDate, tokenize } from '../src/core/dates';

const en = { monthLanguage: 'en', monthCase: 'lower' } as const;
const es = { monthLanguage: 'es', monthCase: 'capitalized' } as const;
const aug7 = { year: 2026, month: 8, day: 7 };

describe('formatDate', () => {
	it.each([
		['YYYY/MM - MMMM', en, '2026/08 - august'],
		['YYYY/MM - MMMM', es, '2026/08 - Agosto'],
		['YYYY/MM', en, '2026/08'],
		['YYYY/YYYY-MM', en, '2026/2026-08'],
		['YYYY', en, '2026'],
		['YYYY-MM-DD', en, '2026-08-07'],
		['DD-MM-YYYY', en, '07-08-2026'],
		['D.M.YY', en, '7.8.26'],
		['MMM YYYY', { monthLanguage: 'es', monthCase: 'upper' } as const, 'AGO 2026'],
		['[Diario] YYYY', en, 'Diario 2026'],
	])('%s → %s', (pattern, opts, expected) => {
		expect(formatDate(pattern, aug7, opts)).toBe(expected);
	});

	it('las letras sueltas que no son tokens quedan como texto', () => {
		expect(tokenize('YYYY/month')).toEqual([{ token: 'YYYY' }, { literal: '/month' }]);
	});
});

describe('parseDatePrefix', () => {
	it('lee la fecha al principio y devuelve el resto', () => {
		expect(parseDatePrefix('YYYY-MM-DD', '2026-08-07 - Formas', en)).toEqual({ date: aug7, rest: ' - Formas' });
		expect(parseDatePrefix('DD-MM-YYYY', '07-08-2026', en)).toEqual({ date: aug7, rest: '' });
	});

	it('nombres de mes sin importar mayúsculas', () => {
		expect(parseDatePrefix('D MMMM YYYY', '7 Agosto 2026 x', es)?.date).toEqual(aug7);
	});

	it('rechaza fechas que no existen o que no coinciden', () => {
		expect(parseDatePrefix('YYYY-MM-DD', '2025-02-29', en)).toBeNull();
		expect(parseDatePrefix('DD-MM-YYYY', '31-02-2025 - x', en)).toBeNull();
		expect(parseDatePrefix('YYYY-MM-DD', '2026-13-01', en)).toBeNull();
		expect(parseDatePrefix('YYYY-MM-DD', 'Notas 2026-08-07', en)).toBeNull();
		expect(parseDatePrefix('YYYY-MM-DD', '07-08-2026', en)).toBeNull();
	});

	it('acepta el 29 de febrero en año bisiesto', () => {
		expect(parseDatePrefix('YYYY-MM-DD', '2028-02-29', en)?.date).toEqual({ year: 2028, month: 2, day: 29 });
	});
});

describe('hasFullDate', () => {
	it.each([
		['YYYY-MM-DD', true],
		['DD-MM-YYYY', true],
		['D MMMM YY', true],
		['YYYY-MM', false],
		['MM-DD', false],
	])('%s → %s', (p, ok) => expect(hasFullDate(p)).toBe(ok));
});

describe('parseFrontmatterDate', () => {
	it('tolera el espacio final de Templater y la hora', () => {
		expect(parseFrontmatterDate('2026-08-07 ')).toEqual(aug7);
		expect(parseFrontmatterDate('2026-08-07T10:30')).toEqual(aug7);
	});
	it('no adivina otros formatos', () => {
		expect(parseFrontmatterDate('07/08/2026')).toBeNull();
		expect(parseFrontmatterDate('2026-02-30')).toBeNull();
		expect(parseFrontmatterDate(20260807)).toBeNull();
		expect(parseFrontmatterDate(undefined)).toBeNull();
	});
});
