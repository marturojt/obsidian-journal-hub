/**
 * Actividad del journal (mosaico tipo GitHub): cuántas entradas hay cada día, semanas para el
 * mosaico y rachas. Solo cuenta entradas por día; nunca lee el texto (no hay «palabras escritas»).
 */
import { compareDates, DateParts, isoDate } from './dates';
import type { Entry } from './model';

/** Entradas por día, con clave ISO (2026-11-05). */
export function entriesByDay(entries: Entry[]): Map<string, Entry[]> {
	const map = new Map<string, Entry[]>();
	for (const e of entries) {
		const key = isoDate(e.date);
		const list = map.get(key);
		if (list) list.push(e);
		else map.set(key, [e]);
	}
	return map;
}

/** Intensidad del color: 0 (nada), 1, 2, 3 (3 o más entradas ese día). */
export function level(count: number): 0 | 1 | 2 | 3 {
	return count <= 0 ? 0 : count >= 3 ? 3 : (count as 1 | 2);
}

const toDate = (d: DateParts) => new Date(d.year, d.month - 1, d.day);
const fromDate = (d: Date): DateParts => ({ year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate() });

export function addDays(d: DateParts, days: number): DateParts {
	const x = toDate(d);
	x.setDate(x.getDate() + days);
	return fromDate(x);
}

/** Lunes de la semana de `d`. */
export function weekStart(d: DateParts): DateParts {
	return addDays(d, -((toDate(d).getDay() + 6) % 7));
}

/**
 * `count` semanas (lunes a domingo), de la más vieja a la más reciente. La última es la semana de
 * `today` corrida `offset` tramos hacia atrás (un tramo = `count` semanas).
 */
export function weeksGrid(today: DateParts, count: number, offset = 0): DateParts[][] {
	const lastMonday = addDays(weekStart(today), -offset * count * 7);
	const first = addDays(lastMonday, -(count - 1) * 7);
	return Array.from({ length: count }, (_, w) => Array.from({ length: 7 }, (_, d) => addDays(first, w * 7 + d)));
}

/** Días seguidos con entradas que terminan hoy (o ayer, si hoy todavía no se escribe). */
export function currentStreak(byDay: Map<string, unknown[]>, today: DateParts): number {
	let day = byDay.has(isoDate(today)) ? today : addDays(today, -1);
	let streak = 0;
	while (byDay.has(isoDate(day))) {
		streak++;
		day = addDays(day, -1);
	}
	return streak;
}

export interface RangeStats {
	/** Días con al menos una entrada en el tramo (sin contar días futuros). */
	daysWritten: number;
	/** Días transcurridos del tramo (hasta hoy). */
	daysTotal: number;
	entries: number;
	/** Racha más larga dentro del tramo. */
	longest: number;
	perWeek: number;
}

export function rangeStats(byDay: Map<string, Entry[]>, from: DateParts, to: DateParts, today: DateParts): RangeStats {
	const stop = compareDates(to, today) > 0 ? today : to;
	const stats: RangeStats = { daysWritten: 0, daysTotal: 0, entries: 0, longest: 0, perWeek: 0 };
	let run = 0;
	for (let d = from; compareDates(d, stop) <= 0; d = addDays(d, 1)) {
		stats.daysTotal++;
		const n = byDay.get(isoDate(d))?.length ?? 0;
		stats.entries += n;
		if (n) {
			stats.daysWritten++;
			run++;
			stats.longest = Math.max(stats.longest, run);
		} else run = 0;
	}
	stats.perWeek = stats.daysTotal ? stats.entries / (stats.daysTotal / 7) : 0;
	return stats;
}
