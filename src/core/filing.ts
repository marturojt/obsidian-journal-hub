/**
 * Acomodo: qué entradas mover y adónde. Lógica pura; el plugin ejecuta los movimientos con
 * `fileManager.renameFile` (que actualiza las ligas).
 */
import { Entry, JournalConfig, expectedFolderFor, parseEntryName } from './model';
import { baseName, fileName, isInFolder, joinPath, normalizeFolder, parentFolder } from './paths';

export interface Move {
	from: string;
	to: string;
}

export interface Conflict extends Move {
	/** `exists`: ya hay un archivo en el destino; `duplicate`: dos entradas irían al mismo lugar. */
	reason: 'exists' | 'duplicate';
}

export interface MovePlan {
	moves: Move[];
	conflicts: Conflict[];
}

/** Ruta donde debería estar la entrada (misma nota, en su carpeta correcta). */
export function targetPath(entry: Entry): string {
	return joinPath(entry.expectedFolder, fileName(entry.path));
}

/**
 * Plan para acomodar las entradas fuera de lugar. Nunca sobrescribe: si el destino ya existe o dos
 * entradas irían al mismo sitio, la entrada se reporta como conflicto y se deja donde está.
 * `exists` se compara sin distinguir mayúsculas (macOS y Windows no las distinguen).
 */
export function planMoves(entries: Entry[], exists: (path: string) => boolean): MovePlan {
	const plan: MovePlan = { moves: [], conflicts: [] };
	const claimed = new Map<string, number>();
	const candidates = entries.filter((e) => e.misplaced).map((e) => ({ from: e.path, to: targetPath(e) }));
	for (const c of candidates) claimed.set(c.to.toLowerCase(), (claimed.get(c.to.toLowerCase()) ?? 0) + 1);
	for (const c of candidates) {
		if (exists(c.to)) plan.conflicts.push({ ...c, reason: 'exists' });
		else if (claimed.get(c.to.toLowerCase())! > 1) plan.conflicts.push({ ...c, reason: 'duplicate' });
		else plan.moves.push(c);
	}
	return plan;
}

/** Carpetas que hay que crear (de la más externa a la más interna) para que exista `folder`. */
export function foldersToCreate(folder: string, exists: (path: string) => boolean): string[] {
	const parts = normalizeFolder(folder).split('/').filter(Boolean);
	const missing: string[] = [];
	for (let i = 1; i <= parts.length; i++) {
		const path = parts.slice(0, i).join('/');
		if (!exists(path)) missing.push(path);
	}
	return missing;
}

/**
 * Para el acomodo automático (al crear o renombrar una nota): adónde moverla, o null si no hay que
 * tocarla. Solo notas markdown dentro del journal, no excluidas, con la fecha en el nombre y fuera
 * de su carpeta.
 */
export function autoFileTarget(path: string, config: JournalConfig, exclude: string[] = []): string | null {
	if (!/\.md$/i.test(path) || !isInFolder(path, config.journalFolder)) return null;
	if (exclude.map(normalizeFolder).some((e) => e && (path === e || isInFolder(path, e)))) return null;
	const parsed = parseEntryName(baseName(path), config);
	if (!parsed) return null;
	const expected = expectedFolderFor(parsed.date, config);
	return parentFolder(path) === expected ? null : joinPath(expected, fileName(path));
}

/**
 * Carpetas que pudo dejar vacías un movimiento desde `fromFolder`: ella y sus padres, de la más
 * profunda a la más externa, sin llegar a la carpeta del journal (esa nunca se borra) ni salir de ella.
 */
export function cleanupCandidates(fromFolder: string, journalFolder: string): string[] {
	const root = normalizeFolder(journalFolder);
	const out: string[] = [];
	let folder = normalizeFolder(fromFolder);
	while (folder && folder !== root && isInFolder(folder, root)) {
		out.push(folder);
		folder = parentFolder(folder);
	}
	return out;
}
