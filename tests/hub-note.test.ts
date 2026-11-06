import { describe, expect, it } from 'vitest';
import { isGeneratedHubNote, renderHubNote } from '../src/core/hub-note';
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
