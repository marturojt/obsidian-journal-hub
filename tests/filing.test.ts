import { describe, expect, it } from 'vitest';
import { autoFileTarget, cleanupCandidates, foldersToCreate, planMoves } from '../src/core/filing';
import { buildIndex } from '../src/core/model';
import { readFrontmatter } from '../scripts/frontmatter';
import { CONFIGS } from '../scripts/configs';
import { profileFiles } from '../scripts/make-test-vault';

const arturo = CONFIGS.arturo!;
const alt = CONFIGS.alt!;

function index(profile: 'arturo' | 'alt', extra: string[] = []) {
	const files = profileFiles(profile);
	const notes = [...files].map(([path, content]) => ({ path, frontmatter: readFrontmatter(content) }));
	return buildIndex([...notes, ...extra.map((path) => ({ path }))], CONFIGS[profile]!);
}

describe('planMoves', () => {
	it('bóveda arturo: no hay nada que mover', () => {
		const files = profileFiles('arturo');
		expect(planMoves(index('arturo').entries, (p) => files.has(p))).toEqual({ moves: [], conflicts: [] });
	});

	it('bóveda alt: mueve las 5 fuera de lugar a su carpeta', () => {
		const files = profileFiles('alt');
		const plan = planMoves(index('alt').entries, (p) => files.has(p));
		expect(plan.conflicts).toEqual([]);
		expect(plan.moves).toHaveLength(5);
		expect(plan.moves).toContainEqual({
			from: 'Personal/Diario/Sueltas/07-10-2026 - Balance.md',
			to: 'Personal/Diario/2026/10 - octubre/07-10-2026 - Balance.md',
		});
	});

	it('nunca sobrescribe: destino ocupado o dos al mismo lugar = conflicto', () => {
		const files = profileFiles('alt');
		const taken = 'Personal/Diario/2026/10 - octubre/07-10-2026 - Balance.md';
		const dup = 'Personal/Diario/Otra/09-10-2026 - Llamada.md'; // misma entrada que la de Diario/2024/
		const plan = planMoves(index('alt', [dup]).entries, (p) => files.has(p) || p === taken);
		expect(plan.conflicts.map((c) => [c.from, c.reason])).toEqual([
			['Personal/Diario/Sueltas/07-10-2026 - Balance.md', 'exists'],
			['Personal/Diario/2024/09-10-2026 - Llamada.md', 'duplicate'],
			['Personal/Diario/Otra/09-10-2026 - Llamada.md', 'duplicate'],
		]);
		expect(plan.moves).toHaveLength(3);
	});
});

describe('foldersToCreate', () => {
	it('solo las que faltan, de afuera hacia adentro', () => {
		const existing = new Set(['03 - JOURNAL', '03 - JOURNAL/2026']);
		expect(foldersToCreate('03 - JOURNAL/2026/11 - november', (p) => existing.has(p))).toEqual(['03 - JOURNAL/2026/11 - november']);
		expect(foldersToCreate('03 - JOURNAL/2027/01 - january', (p) => existing.has(p))).toEqual([
			'03 - JOURNAL/2027',
			'03 - JOURNAL/2027/01 - january',
		]);
		expect(foldersToCreate('', () => false)).toEqual([]);
	});
});

describe('autoFileTarget', () => {
	it('entrada nueva en la raíz del journal → su carpeta', () => {
		expect(autoFileTarget('03 - JOURNAL/2026-11-05 - Lluvia.md', arturo)).toBe('03 - JOURNAL/2026/11 - november/2026-11-05 - Lluvia.md');
	});
	it('ya acomodada → nada', () => {
		expect(autoFileTarget('03 - JOURNAL/2026/11 - november/2026-11-05 - Lluvia.md', arturo)).toBeNull();
	});
	it('no toca: nombre sin fecha, fuera del journal, excluidas, no markdown', () => {
		expect(autoFileTarget('03 - JOURNAL/Untitled.md', arturo)).toBeNull();
		expect(autoFileTarget('00 - INBOX/2026-11-05 - Lluvia.md', arturo)).toBeNull();
		expect(autoFileTarget('03 - JOURNAL/Plantillas/2026-11-05 - x.md', arturo, ['03 - JOURNAL/Plantillas'])).toBeNull();
		expect(autoFileTarget('03 - JOURNAL/2026-11-05 - foto.png', arturo)).toBeNull();
	});
	it('otra configuración', () => {
		expect(autoFileTarget('Personal/Diario/05-11-2026 - Lluvia.md', alt)).toBe('Personal/Diario/2026/11 - noviembre/05-11-2026 - Lluvia.md');
	});
});

describe('cleanupCandidates', () => {
	it('de la más profunda hacia afuera, sin incluir la carpeta del journal', () => {
		expect(cleanupCandidates('Personal/Diario/2025/01 - enero', 'Personal/Diario')).toEqual([
			'Personal/Diario/2025/01 - enero',
			'Personal/Diario/2025',
		]);
		expect(cleanupCandidates('Personal/Diario', 'Personal/Diario')).toEqual([]);
	});
	it('nunca sale del journal', () => {
		expect(cleanupCandidates('Trabajo/Notas', 'Personal/Diario')).toEqual([]);
		expect(cleanupCandidates('Personal', 'Personal/Diario')).toEqual([]);
	});
	it('journal en la raíz: cualquier carpeta, hasta la raíz sin incluirla', () => {
		expect(cleanupCandidates('2024/10', '')).toEqual(['2024/10', '2024']);
	});
});
