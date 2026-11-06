/**
 * Plantillas de entrada: marcadores sencillos, sin ejecutar código.
 *
 *   {{date}}          fecha de la entrada en formato ISO (2026-08-07), el que entienden las propiedades
 *   {{date:FORMATO}}  fecha con tokens (ver dates.ts): {{date:D [de] MMMM}}
 *   {{time}}          hora de creación (HH:mm)
 *   {{keyword}}       palabra clave que escribió el usuario
 *   {{title}}         nombre completo de la nota (2026-08-07 - Palabra)
 *   {{cursor}}        dónde queda el cursor (y el texto existente al convertir una nota)
 */
import { DateParts, formatDate, isoDate, MonthOptions } from './dates';

/** Plantilla preconfigurada: la estructura del journal de Arturo (ver AGENTS.md). */
export const BUILTIN_TEMPLATE = `---
title: {{title}}
created: {{date}}
kind: Daily Journal
---
# {{keyword}}

{{cursor}}


---
# Tags:

#dailyNote #journal #journal/dailyNote
`;

export interface TemplateContext {
	date: DateParts;
	/** HH:mm */
	time: string;
	keyword: string;
	title: string;
	months: MonthOptions;
}

export interface Rendered {
	content: string;
	/** Posición (en caracteres) del cursor, o null si la plantilla no lo marca. */
	cursor: number | null;
}

const CURSOR = '{{cursor}}';

export function renderTemplate(template: string, ctx: TemplateContext): Rendered {
	const filled = template.replace(/\{\{\s*(date|time|keyword|title)(?::([^}]*))?\s*\}\}/g, (match, name: string, format?: string) => {
		switch (name) {
			case 'date':
				return format?.trim() ? formatDate(format.trim(), ctx.date, ctx.months) : isoDate(ctx.date);
			case 'time':
				return ctx.time;
			case 'keyword':
				return ctx.keyword;
			case 'title':
				return ctx.title;
			default:
				return match;
		}
	});
	const index = filled.indexOf(CURSOR);
	return { content: filled.split(CURSOR).join(''), cursor: index === -1 ? null : index };
}

interface Block {
	key: string | null;
	lines: string[];
}

/** Separa el frontmatter (`---` … `---` al principio) del resto. */
export function splitFrontmatter(text: string): { frontmatter: string[] | null; body: string } {
	const lines = text.split('\n');
	if (lines[0]?.trimEnd() !== '---') return { frontmatter: null, body: text };
	const end = lines.findIndex((l, i) => i > 0 && l.trimEnd() === '---');
	if (end === -1) return { frontmatter: null, body: text };
	return { frontmatter: lines.slice(1, end), body: lines.slice(end + 1).join('\n') };
}

/** Propiedades de primer nivel, cada una con sus líneas de continuación (listas, texto en varias líneas). */
function blocks(lines: string[]): Block[] {
	const out: Block[] = [];
	for (const line of lines) {
		const m = /^([^\s:#-][^:]*):/.exec(line);
		if (m) out.push({ key: m[1]!.trim(), lines: [line] });
		else if (out.length) out[out.length - 1]!.lines.push(line);
		else out.push({ key: null, lines: [line] });
	}
	return out;
}

/**
 * Convierte una nota que ya tiene texto: el cuerpo existente va donde la plantilla pone el cursor
 * (o al final), y las propiedades que tenía la nota y que la plantilla no trae se conservan.
 * No se pierde nada.
 */
export function mergeExisting(rendered: Rendered, existing: string): Rendered {
	const old = splitFrontmatter(existing);
	const body = old.body.replace(/^\s*\n/, '').trimEnd();

	let content = rendered.content;
	let cursor = rendered.cursor;
	if (body) {
		const at = cursor ?? content.length;
		const glue = cursor === null && content && !content.endsWith('\n') ? '\n' : '';
		content = content.slice(0, at) + glue + body + content.slice(at);
		cursor = at + glue.length + body.length;
	}

	if (old.frontmatter?.some((l) => l.trim())) {
		const tpl = splitFrontmatter(content);
		if (tpl.frontmatter) {
			const have = new Set(blocks(tpl.frontmatter).map((b) => b.key));
			const extra = blocks(old.frontmatter).filter((b) => b.key && !have.has(b.key)).flatMap((b) => b.lines);
			if (extra.length) {
				const insertAt = content.indexOf('\n---', 3); // cierre del frontmatter de la plantilla
				const added = `\n${extra.join('\n')}`;
				content = content.slice(0, insertAt) + added + content.slice(insertAt);
				if (cursor !== null && cursor > insertAt) cursor += added.length;
			}
		} else {
			const added = `---\n${old.frontmatter.join('\n')}\n---\n`;
			content = added + content;
			if (cursor !== null) cursor += added.length;
		}
	}
	return { content, cursor };
}

/** Caracteres que no pueden ir en un nombre de archivo de Obsidian (o rompen ligas). */
export function sanitizeKeyword(keyword: string): string {
	return keyword
		.replace(/[\\/:*?"<>|#^[\]]/g, ' ')
		.replace(/\s+/g, ' ')
		.replace(/^[\s.]+|[\s.]+$/g, '');
}

/** Nombre de la entrada: fecha + separador + palabra clave (o solo la fecha). */
export function entryName(date: DateParts, keyword: string, nameDateFormat: string, separator: string, months: MonthOptions): string {
	const datePart = formatDate(nameDateFormat, date, months);
	const kw = sanitizeKeyword(keyword);
	return kw ? `${datePart}${separator}${kw}` : datePart;
}

/** Nombres que pone Obsidian a una nota nueva («Untitled», «Sin título 2»…): no son palabra clave. */
export function isPlaceholderName(name: string): boolean {
	return /^(untitled|sin título|sin titulo|sans titre|unbenannt|senza titolo|sem título)( \d+)?$/i.test(name.trim());
}
