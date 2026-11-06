/**
 * Datos de la vista del hub, sin Obsidian: búsqueda, totales, serie por mes y calendario.
 * La vista (ui/hub-view.ts) solo dibuja lo que esto calcula.
 */
import { compareDates, DateParts, MonthLanguage } from './dates';
import type { Entry } from './model';

export const WEEKDAYS_SHORT: Record<MonthLanguage, string[]> = {
	en: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
	es: ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'],
};

/** Iniciales de lunes a domingo, para el encabezado del calendario. */
export const WEEKDAY_INITIALS: Record<MonthLanguage, string[]> = {
	en: ['M', 'T', 'W', 'T', 'F', 'S', 'S'],
	es: ['L', 'M', 'M', 'J', 'V', 'S', 'D'],
};

/** Sin acentos ni mayúsculas: «Jardín» se encuentra con «jardin». */
export function fold(text: string): string {
	return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/** Entradas cuya palabra clave o nombre contienen todas las palabras de la búsqueda. */
export function filterEntries(entries: Entry[], query: string): Entry[] {
	const words = fold(query).split(/\s+/).filter(Boolean);
	if (!words.length) return entries;
	return entries.filter((e) => {
		const hay = fold(`${e.keyword} ${e.name}`);
		return words.every((w) => hay.includes(w));
	});
}

export interface HubStats {
	total: number;
	/** Meses distintos con al menos una entrada. */
	months: number;
	last: DateParts | null;
}

export function hubStats(entries: Entry[]): HubStats {
	const months = new Set(entries.map((e) => `${e.date.year}-${e.date.month}`));
	const last = entries.reduce<DateParts | null>((max, e) => (!max || compareDates(e.date, max) > 0 ? e.date : max), null);
	return { total: entries.length, months: months.size, last };
}

export interface MonthCount {
	year: number;
	month: number;
	count: number;
}

/**
 * Un elemento por mes, sin huecos, desde el mes de la primera entrada hasta `until` (o el de la
 * última entrada, si es posterior). Los meses sin entradas cuentan 0.
 */
export function monthSeries(entries: Entry[], until?: DateParts): MonthCount[] {
	if (!entries.length) return [];
	const counts = new Map<string, number>();
	let first = entries[0]!.date;
	let last = entries[0]!.date;
	for (const e of entries) {
		const key = `${e.date.year}-${e.date.month}`;
		counts.set(key, (counts.get(key) ?? 0) + 1);
		if (compareDates(e.date, first) < 0) first = e.date;
		if (compareDates(e.date, last) > 0) last = e.date;
	}
	if (until && compareDates(until, last) > 0) last = until;
	const out: MonthCount[] = [];
	for (let y = first.year, m = first.month; y < last.year || (y === last.year && m <= last.month); m === 12 ? (y++, (m = 1)) : m++) {
		out.push({ year: y, month: m, count: counts.get(`${y}-${m}`) ?? 0 });
	}
	return out;
}

/** Celdas de un mes con la semana empezando en lunes: null para los huecos antes del día 1. */
export function calendarCells(year: number, month: number): (number | null)[] {
	const lead = (new Date(year, month - 1, 1).getDay() + 6) % 7;
	const days = new Date(year, month, 0).getDate();
	return [...Array<null>(lead).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];
}

export function weekdayOf(date: DateParts): number {
	return new Date(date.year, date.month - 1, date.day).getDay();
}

/** Años con entradas, del más reciente al más viejo. */
export function yearsOf(entries: Entry[]): number[] {
	return [...new Set(entries.map((e) => e.date.year))].sort((a, b) => b - a);
}
