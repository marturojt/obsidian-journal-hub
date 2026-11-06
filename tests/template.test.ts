import { describe, expect, it } from 'vitest';
import { BUILTIN_TEMPLATE, entryName, isPlaceholderName, mergeExisting, renderTemplate, sanitizeKeyword } from '../src/core/template';

const en = { monthLanguage: 'en', monthCase: 'lower' } as const;
const nov5 = { year: 2026, month: 11, day: 5 };
const ctx = { date: nov5, time: '21:30', keyword: 'Lluvia', title: '2026-11-05 - Lluvia', months: en };

describe('plantilla preconfigurada', () => {
	it('produce exactamente la estructura del journal de Arturo, sin los espacios de Templater', () => {
		const { content, cursor } = renderTemplate(BUILTIN_TEMPLATE, ctx);
		expect(content).toBe(
			[
				'---',
				'title: 2026-11-05 - Lluvia',
				'created: 2026-11-05',
				'kind: Daily Journal',
				'---',
				'# Lluvia',
				'',
				'',
				'',
				'',
				'---',
				'# Tags:',
				'',
				'#dailyNote #journal #journal/dailyNote',
				'',
			].join('\n'),
		);
		expect(content.split('\n').filter((l) => / $/.test(l))).toEqual([]);
		// El cursor queda en la línea en blanco después del encabezado
		expect(content.slice(0, cursor!)).toBe('---\ntitle: 2026-11-05 - Lluvia\ncreated: 2026-11-05\nkind: Daily Journal\n---\n# Lluvia\n\n');
	});
});

describe('renderTemplate', () => {
	it('marcadores con formato, hora y espacios dentro de las llaves', () => {
		const r = renderTemplate('{{ date:D [de] MMMM }} {{time}} {{keyword}} {{desconocido}}', {
			...ctx,
			months: { monthLanguage: 'es', monthCase: 'lower' },
		});
		expect(r).toEqual({ content: '5 de noviembre 21:30 Lluvia {{desconocido}}', cursor: null });
	});
});

describe('mergeExisting (convertir una nota con texto)', () => {
	const tpl = renderTemplate(BUILTIN_TEMPLATE, ctx);

	it('el texto existente queda donde va el cursor', () => {
		const r = mergeExisting(tpl, 'Hoy llovió.\nMucho.\n');
		expect(r.content).toContain('# Lluvia\n\nHoy llovió.\nMucho.\n\n\n---\n# Tags:');
		expect(r.content.slice(0, r.cursor!)).toMatch(/Mucho\.$/);
	});

	it('conserva las propiedades que la plantilla no trae; las que sí trae mandan', () => {
		const r = mergeExisting(tpl, '---\ntitle: viejo\naliases:\n  - otro\nmood: bien\n---\nTexto');
		const fm = r.content.split('---')[1]!;
		expect(fm).toBe('\ntitle: 2026-11-05 - Lluvia\ncreated: 2026-11-05\nkind: Daily Journal\naliases:\n  - otro\nmood: bien\n');
		expect(r.content).toContain('# Lluvia\n\nTexto\n');
		expect(r.content.slice(0, r.cursor!)).toMatch(/Texto$/);
	});

	it('sin cursor en la plantilla, el texto va al final; plantilla sin frontmatter conserva el de la nota', () => {
		const r = mergeExisting(renderTemplate('# {{keyword}}', ctx), '---\nmood: bien\n---\nTexto');
		expect(r.content).toBe('---\nmood: bien\n---\n# Lluvia\nTexto');
	});

	it('nota vacía: queda la plantilla tal cual', () => {
		expect(mergeExisting(tpl, '')).toEqual(tpl);
	});
});

describe('nombres', () => {
	it('fecha + separador + palabra clave, limpiando caracteres inválidos', () => {
		expect(entryName(nov5, 'Lluvia', 'YYYY-MM-DD', ' - ', en)).toBe('2026-11-05 - Lluvia');
		expect(entryName(nov5, '  ¿Qué / pasó? #hoy ', 'DD-MM-YYYY', ' - ', en)).toBe('05-11-2026 - ¿Qué pasó hoy');
		expect(entryName(nov5, '', 'YYYY-MM-DD', ' - ', en)).toBe('2026-11-05');
		expect(sanitizeKeyword('[[liga]]')).toBe('liga');
	});
	it('reconoce los nombres provisionales de Obsidian', () => {
		expect(isPlaceholderName('Untitled')).toBe(true);
		expect(isPlaceholderName('Sin título 3')).toBe(true);
		expect(isPlaceholderName('Lluvia')).toBe(false);
	});
});
