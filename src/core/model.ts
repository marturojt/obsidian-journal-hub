/**
 * Modelo del journal: de una lista de notas (ruta + frontmatter) saca las entradas, su fecha, su
 * título y la carpeta donde deberían estar. Sin Obsidian: el plugin le pasa lo que lee de
 * `Vault` y `MetadataCache`, y las pruebas le pasan las bóvedas generadas.
 *
 * Nunca lee el cuerpo de las notas.
 */
import { compareDates, DateParts, formatDate, MonthOptions, parseDatePrefix, parseFrontmatterDate } from './dates';
import { baseName, isInFolder, joinPath, normalizeFolder, parentFolder } from './paths';

export interface JournalConfig extends MonthOptions {
	/** Carpeta del journal ('' = raíz de la bóveda). */
	journalFolder: string;
	/** Subcarpetas por fecha dentro del journal, p. ej. `YYYY/MM - MMMM`. '' = sin subcarpetas. */
	folderPattern: string;
	/** Fecha al principio del nombre de la entrada, p. ej. `YYYY-MM-DD`. */
	nameDateFormat: string;
	/** Campo del frontmatter con la fecha, usado si el nombre no la trae. */
	dateField: string;
}

export interface NoteInfo {
	path: string;
	frontmatter?: Record<string, unknown> | null;
}

export interface Entry {
	path: string;
	/** Nombre de la nota sin `.md`. */
	name: string;
	/** Lo que va después de la fecha en el nombre ("Caminata larga"); '' si el nombre es solo la fecha. */
	keyword: string;
	date: DateParts;
	/** De dónde salió la fecha. Solo las fechadas por el nombre se acomodan solas. */
	dateSource: 'name' | 'frontmatter';
	folder: string;
	expectedFolder: string;
	/** Fechada por el nombre y fuera de su carpeta: el acomodo la movería. */
	misplaced: boolean;
}

export interface JournalIndex {
	entries: Entry[];
	/** Notas del journal sin fecha reconocible. Se listan aparte; nunca se mueven. */
	unmatched: string[];
}

/** Lo que separa la fecha de la palabra clave en el nombre (" - ", "_", ": "…). */
const SEPARATOR = /^[\s\-–—_:.,]+/;

/** Carpeta correcta de una entrada con esa fecha. */
export function expectedFolderFor(date: DateParts, config: JournalConfig): string {
	const sub = config.folderPattern.trim() ? formatDate(config.folderPattern, date, config) : '';
	return joinPath(normalizeFolder(config.journalFolder), sub);
}

/** Fecha y palabra clave del nombre de una nota, si empieza con la fecha. */
export function parseEntryName(name: string, config: JournalConfig): { date: DateParts; keyword: string } | null {
	const parsed = parseDatePrefix(config.nameDateFormat, name, config);
	if (!parsed) return null;
	// "2026-08-07" o "2026-08-07 - Palabra" sí; "2026-08-071" no (la fecha tiene que terminar ahí).
	if (parsed.rest && !SEPARATOR.test(parsed.rest)) return null;
	return { date: parsed.date, keyword: parsed.rest.replace(SEPARATOR, '').trim() };
}

/**
 * @param notes  Notas markdown de la bóveda (puede ser toda; se filtra por la carpeta del journal).
 * @param exclude  Rutas de notas o carpetas que no son entradas (la nota generada, las plantillas).
 */
export function buildIndex(notes: NoteInfo[], config: JournalConfig, exclude: string[] = []): JournalIndex {
	const excluded = exclude.map(normalizeFolder).filter(Boolean);
	const isExcluded = (path: string) => excluded.some((e) => path === e || isInFolder(path, e));

	const entries: Entry[] = [];
	const unmatched: string[] = [];

	for (const note of notes) {
		if (!/\.md$/i.test(note.path)) continue;
		if (!isInFolder(note.path, config.journalFolder) || isExcluded(note.path)) continue;

		const name = baseName(note.path);
		const fromName = parseEntryName(name, config);
		const fromFrontmatter = fromName ? null : parseFrontmatterDate(note.frontmatter?.[config.dateField]);
		const date = fromName?.date ?? fromFrontmatter;
		if (!date) {
			unmatched.push(note.path);
			continue;
		}
		const folder = parentFolder(note.path);
		const expectedFolder = expectedFolderFor(date, config);
		entries.push({
			path: note.path,
			name,
			keyword: fromName?.keyword ?? name,
			date,
			dateSource: fromName ? 'name' : 'frontmatter',
			folder,
			expectedFolder,
			misplaced: Boolean(fromName) && folder !== expectedFolder,
		});
	}

	entries.sort((a, b) => compareDates(a.date, b.date) || a.name.localeCompare(b.name));
	unmatched.sort((a, b) => a.localeCompare(b));
	return { entries, unmatched };
}

export interface MonthGroup {
	month: number;
	entries: Entry[];
}

export interface YearGroup {
	year: number;
	count: number;
	months: MonthGroup[];
}

/** Año → mes → entradas. Solo aparecen meses con entradas. */
export function groupByYearMonth(entries: Entry[], order: 'asc' | 'desc' = 'desc'): YearGroup[] {
	const sign = order === 'asc' ? 1 : -1;
	const sorted = [...entries].sort((a, b) => sign * (compareDates(a.date, b.date) || a.name.localeCompare(b.name)));
	const years: YearGroup[] = [];
	for (const entry of sorted) {
		let year = years[years.length - 1];
		if (!year || year.year !== entry.date.year) {
			year = { year: entry.date.year, count: 0, months: [] };
			years.push(year);
		}
		let month = year.months[year.months.length - 1];
		if (!month || month.month !== entry.date.month) {
			month = { month: entry.date.month, entries: [] };
			year.months.push(month);
		}
		month.entries.push(entry);
		year.count++;
	}
	return years;
}
