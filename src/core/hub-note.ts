/**
 * La nota generada del hub: año → mes → ligas a las entradas, para leer el journal sin el plugin
 * (en el móvil, en GitHub). Lógica pura; el plugin le pasa cómo armar cada liga.
 *
 * El contenido no lleva fecha de actualización: si las entradas no cambian, la nota queda igual
 * y no se escribe (Obsidian Git no hace commits de más).
 */
import { MONTH_NAMES, MonthLanguage } from './dates';
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
