/**
 * La nota generada del hub: año → mes → ligas a las entradas, para leer el journal sin el plugin
 * (en el móvil, en GitHub). Lógica pura; el plugin le pasa cómo armar cada liga.
 *
 * El contenido no lleva fecha de actualización: si las entradas no cambian, la nota queda igual
 * y no se escribe (Obsidian Git no hace commits de más).
 */
import { formatDate, MONTH_NAMES, MonthLanguage, MonthOptions } from './dates';
import { weekdayOf, WEEKDAYS_SHORT } from './hub';
import type { Entry } from './model';

/** Propiedad que marca la nota como generada: sin ella, el plugin nunca la sobrescribe. */
export const HUB_NOTE_MARKER = 'journal-hub';
export const HUB_NOTE_MARKER_VALUE = 'generated';

export interface HubNoteTexts {
	title: string;
	calloutTitle: string;
	calloutBody: string;
	/** «{total} entradas · {months} meses» ya formateado. */
	summary: string;
	unmatched: string;
}

export interface HubNoteInput {
	entries: Entry[];
	unmatched: string[];
	lang: MonthLanguage;
	texts: HubNoteTexts;
	/** Liga a una nota con un texto visible: `[[ruta|texto]]` o lo que use la bóveda. */
	link: (path: string, alias: string) => string;
}

const pad2 = (n: number) => String(n).padStart(2, '0');
const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function renderHubNote({ entries, unmatched, lang, texts, link }: HubNoteInput): string {
	const lines: string[] = ['---', `${HUB_NOTE_MARKER}: ${HUB_NOTE_MARKER_VALUE}`, '---', `# ${texts.title}`, ''];
	lines.push(`> [!note] ${texts.calloutTitle}`, `> ${texts.calloutBody}`, '', texts.summary, '');

	const sorted = [...entries].sort(
		(a, b) => b.date.year - a.date.year || b.date.month - a.date.month || b.date.day - a.date.day || b.name.localeCompare(a.name),
	);
	let year: number | null = null;
	let month: number | null = null;
	for (const e of sorted) {
		if (e.date.year !== year) {
			year = e.date.year;
			month = null;
			const count = sorted.filter((x) => x.date.year === year).length;
			lines.push(`## ${year} (${count})`, '');
		}
		if (e.date.month !== month) {
			if (month !== null) lines.push('');
			month = e.date.month;
			const count = sorted.filter((x) => x.date.year === year && x.date.month === month).length;
			lines.push(`### ${capitalize(MONTH_NAMES[lang][month - 1]!)} (${count})`, '');
		}
		const weekday = WEEKDAYS_SHORT[lang][weekdayOf(e.date)]!;
		lines.push(`- ${pad2(e.date.day)} ${weekday} · ${link(e.path, e.keyword || e.name)}`);
	}
	if (sorted.length) lines.push('');

	if (unmatched.length) {
		lines.push(`## ${texts.unmatched} (${unmatched.length})`, '');
		for (const path of unmatched) {
			const name = path.slice(path.lastIndexOf('/') + 1).replace(/\.md$/i, '');
			lines.push(`- ${link(path, name)}`);
		}
		lines.push('');
	}
	return lines.join('\n');
}

// ── En ramas: hub → año → mes → entrada ─────────────────────────────────────────────────────
//
// La vista de gráfica de Obsidian dibuja ligas. Con una sola nota, todas las entradas cuelgan del
// hub. En ramas, el hub liga solo a notas de año, cada año a sus meses y cada mes a sus entradas;
// cada nota liga también hacia arriba (es la misma arista en la gráfica), así se navega igual.

export interface BranchTexts extends HubNoteTexts {
	/** «29 entradas», ya en el idioma de la interfaz. */
	entries: (count: number) => string;
}

export interface BranchInput extends Omit<HubNoteInput, 'texts'> {
	texts: BranchTexts;
	/** Ruta de la nota del hub. */
	hubPath: string;
	/** Carpeta donde viven las notas de año y mes. */
	indexFolder: string;
	/** Idioma y mayúsculas de los meses en los nombres de archivo (los de las carpetas del journal). */
	fileMonths: MonthOptions;
}

export interface RenderedBranches {
	hub: string;
	/** Ruta → contenido de cada nota de año y de mes. */
	notes: Map<string, string>;
}

const header = (title: string, texts: HubNoteTexts) => [
	'---',
	`${HUB_NOTE_MARKER}: ${HUB_NOTE_MARKER_VALUE}`,
	'---',
	`# ${title}`,
	'',
	`> [!note] ${texts.calloutTitle}`,
	'',
];

/** Ruta de la nota de un año. */
export function yearNotePath(indexFolder: string, year: number): string {
	return `${indexFolder}/${year}.md`;
}

/** Ruta de la nota de un mes: `2026-11 - november.md` (mes como en las carpetas del journal). */
export function monthNotePath(indexFolder: string, year: number, month: number, fileMonths: MonthOptions): string {
	return `${indexFolder}/${formatDate('YYYY-MM - MMMM', { year, month, day: 1 }, fileMonths)}.md`;
}

export function renderHubBranches(input: BranchInput): RenderedBranches {
	const { entries, unmatched, lang, texts, link, hubPath, indexFolder, fileMonths } = input;
	const sorted = [...entries].sort(
		(a, b) => b.date.year - a.date.year || b.date.month - a.date.month || b.date.day - a.date.day || b.name.localeCompare(a.name),
	);
	const years = [...new Set(sorted.map((e) => e.date.year))];
	const monthTitle = (m: number) => capitalize(MONTH_NAMES[lang][m - 1]!);
	const notes = new Map<string, string>();

	// Hub: solo años
	const hub = [...header(texts.title, texts).slice(0, -2), `> [!note] ${texts.calloutTitle}`, `> ${texts.calloutBody}`, '', texts.summary, ''];
	for (const year of years) {
		const count = sorted.filter((e) => e.date.year === year).length;
		hub.push(`- ${link(yearNotePath(indexFolder, year), String(year))} · ${texts.entries(count)}`);
	}
	if (years.length) hub.push('');
	if (unmatched.length) {
		hub.push(`## ${texts.unmatched} (${unmatched.length})`, '');
		for (const path of unmatched) hub.push(`- ${link(path, path.slice(path.lastIndexOf('/') + 1).replace(/\.md$/i, ''))}`);
		hub.push('');
	}

	for (const year of years) {
		const inYear = sorted.filter((e) => e.date.year === year);
		const yearPath = yearNotePath(indexFolder, year);
		const months = [...new Set(inYear.map((e) => e.date.month))];
		// Año: liga al hub y a sus meses
		const y = [...header(String(year), texts), `↑ ${link(hubPath, texts.title)} · ${texts.entries(inYear.length)}`, ''];
		for (const month of months) {
			const count = inYear.filter((e) => e.date.month === month).length;
			y.push(`- ${link(monthNotePath(indexFolder, year, month, fileMonths), monthTitle(month))} · ${texts.entries(count)}`);
		}
		y.push('');
		notes.set(yearPath, y.join('\n'));

		// Mes: liga a su año y a sus entradas
		for (const month of months) {
			const inMonth = inYear.filter((e) => e.date.month === month);
			const m = [...header(`${monthTitle(month)} ${year}`, texts), `↑ ${link(yearPath, String(year))} · ${texts.entries(inMonth.length)}`, ''];
			for (const e of inMonth) m.push(`- ${pad2(e.date.day)} ${WEEKDAYS_SHORT[lang][weekdayOf(e.date)]!} · ${link(e.path, e.keyword || e.name)}`);
			m.push('');
			notes.set(monthNotePath(indexFolder, year, month, fileMonths), m.join('\n'));
		}
	}
	return { hub: hub.join('\n'), notes };
}

/** ¿El texto es una nota generada por el plugin (y por tanto se puede sobrescribir)? */
export function isGeneratedHubNote(content: string): boolean {
	const lines = content.split('\n');
	if (lines[0]?.trimEnd() !== '---') return false;
	for (const line of lines.slice(1)) {
		if (line.trimEnd() === '---') return false;
		if (line.trim() === `${HUB_NOTE_MARKER}: ${HUB_NOTE_MARKER_VALUE}`) return true;
	}
	return false;
}
