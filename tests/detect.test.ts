import { describe, expect, it } from 'vitest';
import { isDateFolderName, suggestJournalFolders } from '../src/core/detect';
import { profileFiles } from '../scripts/make-test-vault';

const paths = (profile: 'arturo' | 'alt' | 'fresh') => [...profileFiles(profile).keys()];

describe('nombres de carpeta de fecha', () => {
	it('reconoce años, meses y combinaciones; no confunde «03 - JOURNAL» con un mes', () => {
		for (const n of ['2026', '2026-08', '08', '08 - august', '11 - noviembre', 'Agosto', 'ago']) expect(isDateFolderName(n), n).toBe(true);
		for (const n of ['03 - JOURNAL', 'Diario', 'Personal', 'Sueltas', '2026 notas']) expect(isDateFolderName(n), n).toBe(false);
	});
});

describe('sugerir carpeta de journal', () => {
	it('bóveda arturo: 03 - JOURNAL, YYYY/MM - MMMM en inglés y minúsculas, YYYY-MM-DD, nada fuera de lugar', () => {
		const [first, ...rest] = suggestJournalFolders(paths('arturo'));
		expect(first).toEqual({
			journalFolder: '03 - JOURNAL',
			folderPattern: 'YYYY/MM - MMMM',
			nameDateFormat: 'YYYY-MM-DD',
			monthLanguage: 'en',
			monthCase: 'lower',
			dated: 95,
			misplaced: 0,
		});
		expect(rest).toEqual([]); // ni la raíz ni las carpetas de año
	});

	it('bóveda alt: Personal/Diario (no Personal), meses en español, DD-MM-YYYY; reporta las 5 fuera de lugar', () => {
		const [first] = suggestJournalFolders(paths('alt'));
		expect(first).toMatchObject({
			journalFolder: 'Personal/Diario',
			folderPattern: 'YYYY/MM - MMMM',
			nameDateFormat: 'DD-MM-YYYY',
			monthLanguage: 'es',
			monthCase: 'lower',
			misplaced: 5,
		});
	});

	it('bóveda nueva: una carpeta plana con fechas → sin subcarpetas', () => {
		const dated = paths('fresh').filter((p) => p.startsWith('Diario/')).length;
		expect(suggestJournalFolders(paths('fresh'))).toEqual([
			{ journalFolder: 'Diario', folderPattern: '', nameDateFormat: 'YYYY-MM-DD', monthLanguage: 'en', monthCase: 'capitalized', dated, misplaced: 0 },
		]);
	});

	it('sin notas con fecha, no sugiere nada', () => {
		expect(suggestJournalFolders(['Recetas/Pan.md', 'Notas/Idea.md', 'Bienvenida.md'])).toEqual([]);
	});

	it('varias candidatas, ordenadas por cuántas notas con fecha tienen', () => {
		const p = [
			...Array.from({ length: 5 }, (_, i) => `Diario/2026-01-0${i + 1}.md`),
			...Array.from({ length: 3 }, (_, i) => `Trabajo/Reuniones/0${i + 1}-02-2026 - Junta.md`),
		];
		expect(suggestJournalFolders(p).map((s) => [s.journalFolder, s.dated, s.nameDateFormat])).toEqual([
			['Diario', 5, 'YYYY-MM-DD'],
			['Trabajo/Reuniones', 3, 'DD-MM-YYYY'],
		]);
	});
});
