import { describe, expect, it } from 'vitest';
import { addDays, currentStreak, entriesByDay, level, rangeStats, weeksGrid, weekStart } from '../src/core/activity';
import type { Entry } from '../src/core/model';

const entry = (iso: string, keyword = 'x'): Entry => {
	const [year, month, day] = iso.split('-').map(Number) as [number, number, number];
	return { path: `${iso} - ${keyword}.md`, name: `${iso} - ${keyword}`, keyword, date: { year, month, day }, dateSource: 'name', folder: '', expectedFolder: '', misplaced: false };
};
const nov6 = { year: 2026, month: 11, day: 6 };

describe('fechas', () => {
	it('suma días cruzando meses y años', () => {
		expect(addDays({ year: 2026, month: 12, day: 31 }, 1)).toEqual({ year: 2027, month: 1, day: 1 });
		expect(addDays({ year: 2028, month: 3, day: 1 }, -1)).toEqual({ year: 2028, month: 2, day: 29 });
	});
	it('la semana empieza en lunes', () => {
		expect(weekStart(nov6)).toEqual({ year: 2026, month: 11, day: 2 }); // 6 nov 2026 es viernes
	});
	it('mosaico: semanas completas, la última es la de hoy; los tramos se recorren hacia atrás', () => {
		const grid = weeksGrid(nov6, 21);
		expect(grid).toHaveLength(21);
		expect(grid.every((w) => w.length === 7)).toBe(true);
		expect(grid[20]![0]).toEqual({ year: 2026, month: 11, day: 2 });
		expect(grid[20]![6]).toEqual({ year: 2026, month: 11, day: 8 });
		const prev = weeksGrid(nov6, 21, 1);
		expect(addDays(prev[20]![6]!, 1)).toEqual(grid[0]![0]);
	});
});

describe('conteos y rachas', () => {
	const entries = ['2026-11-06', '2026-11-05', '2026-11-05', '2026-11-04', '2026-11-02', '2026-11-01', '2026-10-31', '2026-10-30'].map((d) => entry(d));
	const byDay = entriesByDay(entries);

	it('agrupa por día y da la intensidad', () => {
		expect(byDay.get('2026-11-05')).toHaveLength(2);
		expect([0, 1, 2, 3, 7].map(level)).toEqual([0, 1, 2, 3, 3]);
	});

	it('racha actual: termina hoy, o ayer si hoy no se ha escrito', () => {
		expect(currentStreak(byDay, nov6)).toBe(3); // 4, 5 y 6 (el 3 está vacío)
		expect(currentStreak(byDay, { year: 2026, month: 11, day: 7 })).toBe(3); // hoy vacío: cuenta desde ayer
		expect(currentStreak(byDay, { year: 2026, month: 11, day: 9 })).toBe(0);
	});

	it('estadísticas del tramo: no cuenta días futuros', () => {
		const s = rangeStats(byDay, { year: 2026, month: 10, day: 26 }, { year: 2026, month: 11, day: 8 }, nov6);
		expect(s.daysTotal).toBe(12); // del 26 oct al 6 nov
		expect(s.daysWritten).toBe(7);
		expect(s.entries).toBe(8);
		expect(s.longest).toBe(4); // 30 oct – 2 nov
		expect(s.perWeek).toBeCloseTo(8 / (12 / 7));
	});
});
