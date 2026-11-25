import { describe, expect, it } from 'vitest';
import { isGeneratedHubNote, renderHubBranches, renderHubNote } from '../src/core/hub-note';
import { buildIndex } from '../src/core/model';
import { readFrontmatter } from '../scripts/frontmatter';
import { CONFIGS } from '../scripts/configs';
import { profileFiles } from '../scripts/make-test-vault';

const texts = {
	title: 'Journal',
	calloutTitle: 'Nota generada por Journal Hub',
	calloutBody: 'El plugin la reescribe sola; lo que edites aquí se pierde.',
	summary: '95 entradas · 18 meses',
	unmatched: 'Sin fecha en el nombre',
};
const wikilink = (path: string, alias: string) => `[[${path.replace(/\.md$/, '')}|${alias}]]`;

function render(profile: 'arturo' | 'alt') {
	const idx = buildIndex(
		[...profileFiles(profile)].map(([path, content]) => ({ path, frontmatter: readFrontmatter(content) })),
		CONFIGS[profile]!,
	);
	return renderHubNote({ entries: idx.entries, unmatched: idx.unmatched, lang: 'es', texts, link: wikilink });
}

describe('nota generada', () => {
	const note = render('arturo');
	const lines = note.split('\n');

	it('lista las 95 entradas, cada una con su liga', () => {
		const items = lines.filter((l) => /^- \d{2} \S+ · \[\[03 - JOURNAL\/.+\|.+\]\]$/.test(l));
		expect(items).toHaveLength(95);
	});

	it('año → mes, del más reciente al más viejo, con conteos que cuadran', () => {
		const years = lines.filter((l) => l.startsWith('## ')).map((l) => l.slice(3));
		expect(years).toEqual(['2026 (23)', '2025 (59)', '2024 (13)']);
		const months = lines.filter((l) => l.startsWith('### '));
		expect(months).toHaveLength(18);
		expect(months[0]).toMatch(/^### Agosto \(\d+\)$/);
		const total = months.reduce((n, l) => n + Number(/\((\d+)\)$/.exec(l)![1]), 0);
		expect(total).toBe(95);
	});

	it('empieza marcada como generada y con el aviso', () => {
		expect(note.startsWith('---\njournal-hub: generated\n---\n# Journal\n\n> [!note] Nota generada por Journal Hub\n')).toBe(true);
		expect(isGeneratedHubNote(note)).toBe(true);
	});

	it('es estable: mismas entradas, mismo texto (no hay fecha de actualización)', () => {
		expect(render('arturo')).toBe(note);
	});

	it('las notas sin fecha van al final, en su sección', () => {
		const alt = render('alt');
		expect(alt).toContain('## Sin fecha en el nombre (2)\n\n- [[Personal/Diario/2025/Resumen del año|Resumen del año]]\n- [[Personal/Diario/Ideas para escribir|Ideas para escribir]]\n');
	});
});

describe('isGeneratedHubNote', () => {
	it('solo reconoce la marca dentro del frontmatter', () => {
		expect(isGeneratedHubNote('# Mi índice hecho a mano\n')).toBe(false);
		expect(isGeneratedHubNote('---\ntitle: x\n---\njournal-hub: generated\n')).toBe(false);
		expect(isGeneratedHubNote('---\ntags: [a]\njournal-hub: generated\n---\n')).toBe(true);
	});
});

describe('nota del hub en ramas (gráfica hub → año → mes → entrada)', () => {
	const idx = buildIndex(
		[...profileFiles('arturo')].map(([path, content]) => ({ path, frontmatter: readFrontmatter(content) })),
		CONFIGS.arturo!,
	);
	const hubPath = '03 - JOURNAL/✱ Journal HUB.md';
	const indexFolder = '03 - JOURNAL/✱ Journal HUB';
	const linkTargets = (text: string) => [...text.matchAll(/\[\[([^|\]]+)\|/g)].map((m) => m[1]!);
	const render = () =>
		renderHubBranches({
			entries: idx.entries,
			unmatched: idx.unmatched,
			lang: 'es',
			texts: { ...texts, entries: (n) => `${n} entradas` },
			link: wikilink,
			hubPath,
			indexFolder,
			fileMonths: { monthLanguage: 'en', monthCase: 'lower' },
		});
	const out = render();

	it('el hub liga solo a las notas de año', () => {
		expect(linkTargets(out.hub)).toEqual([`${indexFolder}/2026`, `${indexFolder}/2025`, `${indexFolder}/2024`]);
		expect(out.hub).toContain('journal-hub: generated');
	});

	it('una nota por año y una por mes con entradas, con nombres como las carpetas del journal', () => {
		const names = [...out.notes.keys()].map((p) => p.slice(indexFolder.length + 1));
		expect(names.filter((n) => /^\d{4}\.md$/.test(n))).toEqual(['2026.md', '2025.md', '2024.md']);
		expect(names.filter((n) => !/^\d{4}\.md$/.test(n))).toHaveLength(18);
		expect(names).toContain('2026-08 - august.md');
		expect(names).not.toContain('2025-03 - march.md'); // mes sin entradas
	});

	it('cada año liga a su hub y a sus meses; cada mes a su año y a sus entradas', () => {
		for (const [path, content] of out.notes) {
			const targets = linkTargets(content);
			if (/\/\d{4}\.md$/.test(path)) {
				expect(targets[0]).toBe(hubPath.replace(/\.md$/, ''));
				expect(targets.slice(1).every((t) => t.startsWith(`${path.replace(/\.md$/, '')}-`))).toBe(true);
			} else {
				const year = /\/(\d{4})-\d{2} - /.exec(path)![1];
				expect(targets[0]).toBe(`${indexFolder}/${year}`);
				expect(targets.slice(1).every((t) => t.startsWith('03 - JOURNAL/'))).toBe(true);
				expect(targets.slice(1).some((t) => t.startsWith(indexFolder))).toBe(false);
			}
			expect(isGeneratedHubNote(content)).toBe(true);
		}
	});

	it('las 95 entradas quedan ligadas exactamente una vez, desde su mes', () => {
		const entryLinks = [...out.notes.values()].flatMap((c) => linkTargets(c)).filter((t) => !t.startsWith(indexFolder) && t !== hubPath.replace(/\.md$/, ''));
		expect(entryLinks).toHaveLength(95);
		expect(new Set(entryLinks).size).toBe(95);
	});

	it('es estable', () => {
		const again = render();
		expect(again.hub).toBe(out.hub);
		expect([...again.notes]).toEqual([...out.notes]);
	});
});
