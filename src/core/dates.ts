/**
 * Patrones de fecha con tokens, sin depender de Obsidian ni de moment (se prueba con vitest).
 *
 * Tokens: YYYY, YY, MMMM (nombre del mes), MMM (nombre corto), MM, M, DD, D.
 * Texto literal entre corchetes: `[Semana] YYYY`. Cualquier otro carácter es literal.
 */

export type MonthLanguage = 'en' | 'es';
export type MonthCase = 'lower' | 'capitalized' | 'upper';

export interface MonthOptions {
	monthLanguage: MonthLanguage;
	monthCase: MonthCase;
}

/** Fecha de calendario, sin hora ni zona. `month` va de 1 a 12. */
export interface DateParts {
	year: number;
	month: number;
	day: number;
}

export const MONTH_NAMES: Record<MonthLanguage, string[]> = {
	en: ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'],
	es: ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'],
};

const SHORT_MONTH_NAMES: Record<MonthLanguage, string[]> = {
	en: ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'],
	es: ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'],
};

const TOKENS = ['YYYY', 'YY', 'MMMM', 'MMM', 'MM', 'M', 'DD', 'D'] as const;
type Token = (typeof TOKENS)[number];

type Part = { token: Token } | { literal: string };

export function tokenize(pattern: string): Part[] {
	const parts: Part[] = [];
	let literal = '';
	const flush = () => {
		if (literal) parts.push({ literal });
		literal = '';
	};
	for (let i = 0; i < pattern.length; ) {
		if (pattern[i] === '[') {
			const end = pattern.indexOf(']', i + 1);
			if (end !== -1) {
				literal += pattern.slice(i + 1, end);
				i = end + 1;
				continue;
			}
		}
		const token = TOKENS.find((t) => pattern.startsWith(t, i));
		if (token) {
			flush();
			parts.push({ token });
			i += token.length;
		} else {
			literal += pattern[i];
			i++;
		}
	}
	flush();
	return parts;
}

const pad2 = (n: number) => String(n).padStart(2, '0');

function applyCase(name: string, monthCase: MonthCase): string {
	if (monthCase === 'upper') return name.toUpperCase();
	if (monthCase === 'capitalized') return name.charAt(0).toUpperCase() + name.slice(1);
	return name;
}

export function formatDate(pattern: string, date: DateParts, opts: MonthOptions): string {
	return tokenize(pattern)
		.map((p) => {
			if ('literal' in p) return p.literal;
			switch (p.token) {
				case 'YYYY':
					return String(date.year).padStart(4, '0');
				case 'YY':
					return pad2(date.year % 100);
				case 'MMMM':
					return applyCase(MONTH_NAMES[opts.monthLanguage][date.month - 1]!, opts.monthCase);
				case 'MMM':
					return applyCase(SHORT_MONTH_NAMES[opts.monthLanguage][date.month - 1]!, opts.monthCase);
				case 'MM':
					return pad2(date.month);
				case 'M':
					return String(date.month);
				case 'DD':
					return pad2(date.day);
				case 'D':
					return String(date.day);
			}
		})
		.join('');
}

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** ¿El patrón tiene año, mes y día? Un nombre de entrada los necesita para fechar la nota. */
export function hasFullDate(pattern: string): boolean {
	const tokens = tokenize(pattern).flatMap((p) => ('token' in p ? [p.token] : []));
	const has = (...ts: Token[]) => ts.some((t) => tokens.includes(t));
	return has('YYYY', 'YY') && has('MMMM', 'MMM', 'MM', 'M') && has('DD', 'D');
}

export function isValidDate({ year, month, day }: DateParts): boolean {
	if (month < 1 || month > 12 || day < 1) return false;
	const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
	return day <= daysInMonth;
}

/**
 * Lee una fecha al **principio** de `text` según `pattern`. Devuelve la fecha y el texto que sigue,
 * o null si no coincide o la fecha no existe (31 de febrero).
 */
export function parseDatePrefix(pattern: string, text: string, opts: MonthOptions): { date: DateParts; rest: string } | null {
	const parts = tokenize(pattern);
	const groups: Token[] = [];
	let source = '^';
	for (const p of parts) {
		if ('literal' in p) {
			source += escapeRegex(p.literal);
			continue;
		}
		groups.push(p.token);
		switch (p.token) {
			case 'YYYY':
				source += '(\\d{4})';
				break;
			case 'YY':
			case 'MM':
			case 'DD':
				source += '(\\d{2})';
				break;
			case 'M':
			case 'D':
				source += '(\\d{1,2})';
				break;
			case 'MMMM':
				source += `(${MONTH_NAMES[opts.monthLanguage].map(escapeRegex).join('|')})`;
				break;
			case 'MMM':
				source += `(${SHORT_MONTH_NAMES[opts.monthLanguage].map(escapeRegex).join('|')})`;
				break;
		}
	}
	const match = new RegExp(source, 'i').exec(text);
	if (!match) return null;

	const date: DateParts = { year: NaN, month: NaN, day: NaN };
	groups.forEach((token, i) => {
		const raw = match[i + 1]!;
		switch (token) {
			case 'YYYY':
				date.year = Number(raw);
				break;
			case 'YY':
				date.year = 2000 + Number(raw);
				break;
			case 'MMMM':
				date.month = MONTH_NAMES[opts.monthLanguage].indexOf(raw.toLowerCase()) + 1;
				break;
			case 'MMM':
				date.month = SHORT_MONTH_NAMES[opts.monthLanguage].indexOf(raw.toLowerCase()) + 1;
				break;
			case 'MM':
			case 'M':
				date.month = Number(raw);
				break;
			case 'DD':
			case 'D':
				date.day = Number(raw);
				break;
		}
	});
	if (!isValidDate(date)) return null;
	return { date, rest: text.slice(match[0].length) };
}

/**
 * Fecha de un valor del frontmatter: `2026-08-07`, `2026-08-07 ` (con espacio, como dejaba
 * Templater) o `2026-08-07T10:00`. Otros formatos no se adivinan.
 */
export function parseFrontmatterDate(value: unknown): DateParts | null {
	if (typeof value !== 'string') return null;
	const m = /^(\d{4})-(\d{2})-(\d{2})(?:$|[T\s])/.exec(value.trim());
	if (!m) return null;
	const date = { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) };
	return isValidDate(date) ? date : null;
}

export function compareDates(a: DateParts, b: DateParts): number {
	return a.year - b.year || a.month - b.month || a.day - b.day;
}

export function isoDate(d: DateParts): string {
	return `${String(d.year).padStart(4, '0')}-${pad2(d.month)}-${pad2(d.day)}`;
}
