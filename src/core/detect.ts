/**
 * Primera vez: sugerir carpetas que ya parecen un journal y adivinar cómo están organizadas
 * (subcarpetas, idioma y mayúsculas de los meses, formato de fecha del nombre). Solo mira rutas.
 */
import { MONTH_NAMES, MonthCase, MonthLanguage, parseDatePrefix } from './dates';
import { fold } from './hub';
import { buildIndex, JournalConfig, parseEntryName } from './model';
import { baseName, parentFolder } from './paths';

/** Formatos de fecha al inicio del nombre que se reconocen al sugerir. */
export const NAME_FORMATS = ['YYYY-MM-DD', 'DD-MM-YYYY', 'YYYYMMDD', 'DD.MM.YYYY', 'YYYY.MM.DD', 'MM-DD-YYYY'];
/** Organizaciones de subcarpetas que se prueban (la vacía = sin subcarpetas). */
export const PATTERN_CANDIDATES = ['YYYY/MM - MMMM', 'YYYY/MM', 'YYYY/YYYY-MM', 'YYYY/MMMM', 'YYYY', ''];
const LANGS: MonthLanguage[] = ['en', 'es'];
const CASES: MonthCase[] = ['lower', 'capitalized'];
/** Mínimo de notas con fecha para sugerir una carpeta. */
const MIN_DATED = 3;

export interface Suggestion extends Omit<JournalConfig, 'dateField'> {
	/** Notas con fecha en el nombre dentro de la carpeta. */
	dated: number;
	/** Cuántas quedarían fuera de lugar con la organización detectada (no se mueve nada al elegir). */
	misplaced: number;
}

const month = { monthLanguage: 'en', monthCase: 'lower' } as const;

/** Formato de fecha con el que empieza el nombre, si alguno coincide (y la fecha termina ahí). */
function nameFormatOf(name: string): string | null {
	for (const f of NAME_FORMATS) {
		const parsed = parseDatePrefix(f, name, month);
		if (parsed && (!parsed.rest || /^[\s\-–—_:.,]/.test(parsed.rest))) return f;
	}
	return null;
}

const MONTH_WORDS = [...MONTH_NAMES.en, ...MONTH_NAMES.es, ...MONTH_NAMES.en.map((m) => m.slice(0, 3)), ...MONTH_NAMES.es.map((m) => m.slice(0, 3))];

/** ¿El nombre de una carpeta es de fecha? (2026, 2026-08, 08, 08 - august, Agosto…) */
export function isDateFolderName(name: string): boolean {
	const n = fold(name.trim());
	if (/^\d{4}$/.test(n) || /^\d{4}[-_. ]\d{1,2}$/.test(n) || /^\d{1,2}$/.test(n)) return true;
	const m = /^(?:\d{1,2}\s*[-_.]?\s*)?([a-z]+)$/.exec(n);
	return Boolean(m && MONTH_WORDS.includes(m[1]!));
}

/**
 * Carpetas candidatas, de la más probable a la menos (máx. `limit`). Cada carpeta cuenta solo las
 * notas con fecha que tiene directamente o dentro de subcarpetas con nombre de fecha: así una
 * carpeta que solo agrupa (Personal, la raíz) no le gana a la del journal (Personal/Diario).
 */
export function suggestJournalFolders(paths: string[], limit = 3): Suggestion[] {
	const dated = paths.filter((p) => /\.md$/i.test(p) && nameFormatOf(baseName(p)) !== null);
	const counts = new Map<string, number>();
	for (const p of dated) {
		const segments = parentFolder(p).split('/').filter(Boolean);
		// Subir desde la carpeta de la nota mientras los segmentos sean de fecha.
		let i = segments.length;
		counts.set(segments.join('/'), (counts.get(segments.join('/')) ?? 0) + 1);
		while (i > 0 && isDateFolderName(segments[i - 1]!)) {
			i--;
			const f = segments.slice(0, i).join('/');
			counts.set(f, (counts.get(f) ?? 0) + 1);
		}
	}
	let kept = [...counts.entries()].filter(([, n]) => n >= MIN_DATED).map(([f]) => f);
	// Fuera las subcarpetas de otra candidata (2026 dentro de 03 - JOURNAL).
	kept = kept.filter((f) => !kept.some((o) => o !== f && (o === '' ? f !== '' : f.startsWith(`${o}/`))));

	return kept
		.map((folder) => detectOrganization(folder, dated))
		.sort((a, b) => b.dated - a.dated || a.journalFolder.localeCompare(b.journalFolder))
		.slice(0, limit);
}

/** La organización (formato del nombre y subcarpetas) con la que menos notas quedan fuera de lugar. */
export function detectOrganization(folder: string, paths: string[]): Suggestion {
	const inside = paths.filter((p) => (folder === '' ? true : p.startsWith(`${folder}/`)));
	const formats = new Map<string, number>();
	for (const p of inside) {
		const f = nameFormatOf(baseName(p));
		if (f) formats.set(f, (formats.get(f) ?? 0) + 1);
	}
	const nameDateFormat = [...formats.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'YYYY-MM-DD';
	const notes = inside.map((path) => ({ path }));

	let best: Suggestion | null = null;
	for (const folderPattern of PATTERN_CANDIDATES) {
		const usesNames = folderPattern.includes('MMM');
		for (const monthLanguage of usesNames ? LANGS : (['en'] as MonthLanguage[])) {
			for (const monthCase of usesNames ? CASES : (['capitalized'] as MonthCase[])) {
				const config: JournalConfig = { journalFolder: folder, folderPattern, nameDateFormat, dateField: 'created', monthLanguage, monthCase };
				const entries = buildIndex(notes, config).entries.filter((e) => parseEntryName(e.name, config));
				const misplaced = entries.filter((e) => e.misplaced).length;
				if (!best || misplaced < best.misplaced) {
					best = { journalFolder: folder, folderPattern, nameDateFormat, monthLanguage, monthCase, dated: entries.length, misplaced };
				}
			}
		}
	}
	return best!;
}
