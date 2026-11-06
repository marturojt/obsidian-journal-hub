/**
 * Lector mínimo de frontmatter para scripts y pruebas (en el plugin lo da MetadataCache).
 * Solo `clave: valor` de primer nivel; devuelve los valores como texto, sin recortar.
 */
export function readFrontmatter(content: string): Record<string, string> | null {
	const lines = content.split('\n');
	if (lines[0]?.trimEnd() !== '---') return null;
	const out: Record<string, string> = {};
	for (const line of lines.slice(1)) {
		if (line.trimEnd() === '---') return out;
		const m = /^([^\s:#][^:]*):\s?(.*)$/.exec(line);
		if (m) out[m[1]!.trim()] = m[2]!;
	}
	return null;
}
