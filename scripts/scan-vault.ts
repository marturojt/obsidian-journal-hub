/**
 * Corre el modelo sobre una bóveda, en SOLO LECTURA, y muestra conteos.
 *
 *   npm run scan -- <ruta-de-la-bóveda> <config> [--paths]
 *
 * <config> es una de scripts/configs.ts (arturo, alt). Sin --paths no imprime nombres ni títulos
 * (pensado para la bóveda real); con --paths lista las entradas fuera de lugar y las notas sin fecha.
 * De cada nota solo usa la ruta y el frontmatter.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { isoDate, parseFrontmatterDate } from '../src/core/dates';
import { buildIndex, groupByYearMonth, NoteInfo } from '../src/core/model';
import { CONFIGS } from './configs';
import { readFrontmatter } from './frontmatter';

const SKIP_DIRS = new Set(['.obsidian', '.git', '.trash', 'node_modules']);

function markdownFiles(root: string, dir = root): string[] {
	return readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
		if (d.isDirectory()) return SKIP_DIRS.has(d.name) ? [] : markdownFiles(root, join(dir, d.name));
		return d.name.endsWith('.md') ? [relative(root, join(dir, d.name)).split(sep).join('/')] : [];
	});
}

const [vault, configName, ...flags] = process.argv.slice(2).filter((a) => a !== '--');
const config = configName ? CONFIGS[configName] : undefined;
if (!vault || !config) {
	console.error(`Uso: npm run scan -- <bóveda> <${Object.keys(CONFIGS).join('|')}> [--paths]`);
	process.exit(1);
}
const showPaths = flags.includes('--paths');

const notes: NoteInfo[] = markdownFiles(vault).map((path) => ({
	path,
	frontmatter: readFrontmatter(readFileSync(join(vault, path), 'utf8')),
}));
const index = buildIndex(notes, config);

const byName = index.entries.filter((e) => e.dateSource === 'name');
const mismatched = byName.filter((e) => {
	const fm = parseFrontmatterDate(notes.find((n) => n.path === e.path)?.frontmatter?.[config.dateField]);
	return fm && isoDate(fm) !== isoDate(e.date);
});
const misplaced = index.entries.filter((e) => e.misplaced);

console.log(`Bóveda: ${vault}`);
console.log(`Carpeta del journal: ${config.journalFolder || '(raíz)'}  ·  patrón ${config.folderPattern}  ·  nombre ${config.nameDateFormat}`);
console.log(`Notas .md en la bóveda: ${notes.length}`);
console.log(`Entradas: ${index.entries.length}  (por nombre: ${byName.length}, por frontmatter: ${index.entries.length - byName.length})`);
console.log(`Fuera de lugar (se moverían): ${misplaced.length}`);
console.log(`Sin fecha (se listan aparte): ${index.unmatched.length}`);
console.log(`Fecha del nombre ≠ ${config.dateField}: ${mismatched.length}`);
console.log('');
for (const y of groupByYearMonth(index.entries, 'asc')) {
	const months = y.months.map((m) => `${String(m.month).padStart(2, '0')}:${m.entries.length}`).join('  ');
	console.log(`${y.year} (${y.count})  ${months}`);
}
if (showPaths) {
	if (misplaced.length) console.log('\nFuera de lugar:\n' + misplaced.map((e) => `  ${e.path}\n    → ${e.expectedFolder}`).join('\n'));
	if (index.unmatched.length) console.log('\nSin fecha:\n' + index.unmatched.map((p) => `  ${p}`).join('\n'));
}
