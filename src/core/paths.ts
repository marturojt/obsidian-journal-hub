/** Rutas de la bóveda (siempre con `/`, relativas a la raíz; '' es la raíz). */

/** Quita barras sobrantes y espacios en los extremos: ' /a//b/ ' → 'a/b'; '/' → ''. */
export function normalizeFolder(folder: string): string {
	return folder
		.split('/')
		.map((s) => s.trim())
		.filter(Boolean)
		.join('/');
}

export function joinPath(...parts: string[]): string {
	return normalizeFolder(parts.join('/'));
}

export function parentFolder(path: string): string {
	const i = path.lastIndexOf('/');
	return i === -1 ? '' : path.slice(0, i);
}

export function fileName(path: string): string {
	return path.slice(path.lastIndexOf('/') + 1);
}

/** Nombre sin la extensión `.md`. */
export function baseName(path: string): string {
	return fileName(path).replace(/\.md$/i, '');
}

/** ¿`path` está dentro de `folder` (a cualquier profundidad)? La raíz ('') lo contiene todo. */
export function isInFolder(path: string, folder: string): boolean {
	const f = normalizeFolder(folder);
	return f === '' || path.startsWith(`${f}/`);
}
