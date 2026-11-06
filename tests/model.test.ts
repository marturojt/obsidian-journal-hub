import { describe, expect, it } from 'vitest';
import { buildIndex, groupByYearMonth, NoteInfo, parseEntryName } from '../src/core/model';
import { DEFAULT_SETTINGS } from '../src/settings';
import { readFrontmatter } from '../scripts/frontmatter';
import { profileFiles, type Profile } from '../scripts/make-test-vault';
import { CONFIGS } from '../scripts/configs';

const ARTURO_CONFIG = CONFIGS.arturo!;
const ALT_CONFIG = CONFIGS.alt!;

function notesOf(profile: Profile): NoteInfo[] {
	return [...profileFiles(profile)].map(([path, content]) => ({ path, frontmatter: readFrontmatter(content) }));
}

describe('parseEntryName', () => {
	it('separa fecha y palabra clave', () => {
		expect(parseEntryName('2026-08-07 - Caminata larga', ARTURO_CONFIG)).toEqual({
			date: { year: 2026, month: 8, day: 7 },
			keyword: 'Caminata larga',
		});
		expect(parseEntryName('2026-08-07', ARTURO_CONFIG)?.keyword).toBe('');
		expect(parseEntryName('2026-08-07_viaje', ARTURO_CONFIG)?.keyword).toBe('viaje');
	});
	it('la fecha tiene que terminar donde termina el patrón', () => {
		expect(parseEntryName('2026-08-071', ARTURO_CONFIG)).toBeNull();
		expect(parseEntryName('2026-08-07abc', ARTURO_CONFIG)).toBeNull();
	});
});

describe('bóveda arturo (misma forma que la real)', () => {
	const index = buildIndex(notesOf('arturo'), ARTURO_CONFIG);

	it('95 entradas, todas fechadas por el nombre y ninguna fuera de lugar', () => {
		expect(index.entries).toHaveLength(95);
		expect(index.entries.every((e) => e.dateSource === 'name')).toBe(true);
		expect(index.entries.filter((e) => e.misplaced)).toEqual([]);
		expect(index.unmatched).toEqual([]);
	});

	it('las notas de fuera del journal no cuentan', () => {
		expect(index.entries.some((e) => !e.path.startsWith('03 - JOURNAL/'))).toBe(false);
	});

	it('la fecha del nombre coincide con created (que trae espacio al final)', () => {
		const notes = new Map(notesOf('arturo').map((n) => [n.path, n]));
		for (const e of index.entries) {
			const created = String(notes.get(e.path)!.frontmatter!.created).trim();
			expect(created).toBe(`${e.date.year}-${String(e.date.month).padStart(2, '0')}-${String(e.date.day).padStart(2, '0')}`);
		}
	});

	it('la nota generada y la carpeta de plantillas se excluyen', () => {
		const notes = [
			...notesOf('arturo'),
			{ path: '03 - JOURNAL/✱ Journal HUB.md' },
			{ path: '03 - JOURNAL/Plantillas/2026-01-01 - Ejemplo.md' },
		];
		const idx = buildIndex(notes, ARTURO_CONFIG, ['03 - JOURNAL/✱ Journal HUB.md', '03 - JOURNAL/Plantillas']);
		expect(idx.entries).toHaveLength(95);
		expect(idx.unmatched).toEqual([]);
	});
});

describe('bóveda alt (otra carpeta, meses en español, DD-MM-AAAA, campo fecha)', () => {
	const index = buildIndex(notesOf('alt'), ALT_CONFIG);
	const byPath = new Map(index.entries.map((e) => [e.path, e]));

	it('encuentra las 5 entradas fuera de lugar y dice adónde van', () => {
		const misplaced = index.entries.filter((e) => e.misplaced).map((e) => `${e.path} → ${e.expectedFolder}`);
		expect(misplaced).toEqual([
			'Personal/Diario/11-08-2026 - Domingo.md → Personal/Diario/2026/08 - agosto',
			'Personal/Diario/09-09-2026 - Tarde tranquila.md → Personal/Diario/2026/09 - septiembre',
			'Personal/Diario/2025/01 - enero/05-10-2026 - Retos.md → Personal/Diario/2026/10 - octubre',
			'Personal/Diario/Sueltas/07-10-2026 - Balance.md → Personal/Diario/2026/10 - octubre',
			'Personal/Diario/2024/09-10-2026 - Llamada.md → Personal/Diario/2026/10 - octubre',
		]);
	});

	it('la fecha imposible del nombre no se usa; se fecha por el frontmatter y no se mueve', () => {
		const e = byPath.get('Personal/Diario/31-02-2025 - Fecha imposible.md')!;
		expect(e.dateSource).toBe('frontmatter');
		expect(e.date).toEqual({ year: 2025, month: 2, day: 28 });
		expect(e.misplaced).toBe(false);
	});

	it('las notas sin fecha se listan aparte', () => {
		expect(index.unmatched).toEqual(['Personal/Diario/2025/Resumen del año.md', 'Personal/Diario/Ideas para escribir.md']);
	});

	it('lo de fuera del journal no se toca (ni una nota hermana con el mismo nombre que la carpeta)', () => {
		const all = [...index.entries.map((e) => e.path), ...index.unmatched];
		expect(all.some((p) => p.startsWith('Trabajo/'))).toBe(false);
		expect(all).not.toContain('Personal/Diario.md');
	});

	it('cuadran las cuentas: 40 con fecha en el nombre + 1 por frontmatter + 2 sin fecha', () => {
		expect(index.entries.filter((e) => e.dateSource === 'name')).toHaveLength(40);
		expect(index.entries).toHaveLength(41);
		expect(index.unmatched).toHaveLength(2);
	});
});

describe('otras configuraciones', () => {
	it('journal en la raíz de la bóveda y sin subcarpetas', () => {
		const cfg = { ...DEFAULT_SETTINGS, journalFolder: '', folderPattern: '' };
		const idx = buildIndex([{ path: '2026-01-02.md' }, { path: 'x/2026-01-03.md' }, { path: 'Recetas.md' }], cfg);
		expect(idx.entries.map((e) => [e.path, e.misplaced])).toEqual([
			['2026-01-02.md', false],
			['x/2026-01-03.md', true],
		]);
		expect(idx.unmatched).toEqual(['Recetas.md']);
	});

	it('valores por omisión: YYYY/MM y nombre YYYY-MM-DD', () => {
		const cfg = { ...DEFAULT_SETTINGS, journalFolder: 'Journal' };
		const [e] = buildIndex([{ path: 'Journal/2026-03-04.md' }], cfg).entries;
		expect(e!.expectedFolder).toBe('Journal/2026/03');
		expect(e!.misplaced).toBe(true);
	});
});

describe('groupByYearMonth', () => {
	it('agrupa año → mes, del más reciente al más viejo, solo meses con entradas', () => {
		const groups = groupByYearMonth(buildIndex(notesOf('arturo'), ARTURO_CONFIG).entries);
		expect(groups.map((g) => g.year)).toEqual([2026, 2025, 2024]);
		expect(groups.reduce((n, g) => n + g.count, 0)).toBe(95);
		const months2025 = groups.find((g) => g.year === 2025)!.months.map((m) => m.month);
		expect(months2025).not.toContain(3); // marzo de 2025 no tiene entradas
		expect(months2025).toEqual([...months2025].sort((a, b) => b - a));
	});
});
