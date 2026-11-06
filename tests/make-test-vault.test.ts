import { mkdtempSync, readFileSync, readdirSync, writeFileSync, mkdirSync, existsSync, lstatSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { makeVault, profileFiles } from '../scripts/make-test-vault';

const MONTHS_EN = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];

function walk(dir: string, base = dir): string[] {
	return readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
		const p = join(dir, d.name);
		if (d.name === '.obsidian') return [];
		return d.isDirectory() ? walk(p, base) : [relative(base, p)];
	});
}

describe('perfil arturo', () => {
	const files = profileFiles('arturo');
	const entries = [...files.keys()].filter((p) => p.startsWith('03 - JOURNAL/'));

	it('tiene 95 entradas, todas en su carpeta AAAA/MM - month', () => {
		expect(entries).toHaveLength(95);
		for (const p of entries) {
			const m = /^03 - JOURNAL\/(\d{4})\/(\d{2}) - ([a-z]+)\/(\d{4})-(\d{2})-\d{2} - .+\.md$/.exec(p);
			expect(m, p).not.toBeNull();
			const [, y, mm, name, y2, mm2] = m!;
			expect(y2).toBe(y);
			expect(mm2).toBe(mm);
			expect(name).toBe(MONTHS_EN[Number(mm) - 1]);
		}
	});

	it('el frontmatter imita a Templater: created = fecha del nombre, con espacio al final', () => {
		for (const p of entries) {
			const date = /(\d{4}-\d{2}-\d{2}) - /.exec(p)![1];
			const content = files.get(p)!;
			expect(content).toContain(`created: ${date} \n`);
			expect(content).toContain('#dailyNote #journal #journal/dailyNote ');
		}
	});

	it('es determinista', () => {
		expect([...profileFiles('arturo')]).toEqual([...files]);
	});
});

describe('perfil alt', () => {
	it('tiene entradas fuera de lugar y notas sin patrón', () => {
		const paths = [...profileFiles('alt').keys()];
		expect(paths).toContain('Personal/Diario/Ideas para escribir.md');
		expect(paths.filter((p) => /^Personal\/Diario\/\d{2}-\d{2}-\d{4} - /.test(p)).length).toBeGreaterThanOrEqual(2);
		expect(paths.some((p) => p.startsWith('Trabajo/'))).toBe(true);
	});
});

describe('makeVault', () => {
	it('escribe las notas, liga el plugin y conserva .obsidian al regenerar', () => {
		const base = mkdtempSync(join(tmpdir(), 'jh-'));
		const vault = makeVault('alt', base);
		expect(walk(vault).filter((p) => p.endsWith('.md'))).toHaveLength(profileFiles('alt').size);
		expect(lstatSync(join(vault, '.obsidian/plugins/journal-hub/manifest.json')).isSymbolicLink()).toBe(true);
		expect(JSON.parse(readFileSync(join(vault, '.obsidian/community-plugins.json'), 'utf8'))).toEqual(['journal-hub']);

		writeFileSync(join(vault, '.obsidian/workspace.json'), '{}');
		writeFileSync(join(vault, 'sobrante.md'), 'x');
		makeVault('alt', base);
		expect(existsSync(join(vault, '.obsidian/workspace.json'))).toBe(true);
		expect(existsSync(join(vault, 'sobrante.md'))).toBe(false);
	});

	it('se niega a tocar una carpeta que no generó', () => {
		const base = mkdtempSync(join(tmpdir(), 'jh-'));
		mkdirSync(join(base, 'fresh'));
		writeFileSync(join(base, 'fresh', 'mio.md'), 'no borrar');
		expect(() => makeVault('fresh', base)).toThrow(/no es una bóveda de prueba/);
		expect(readFileSync(join(base, 'fresh', 'mio.md'), 'utf8')).toBe('no borrar');
	});
});
