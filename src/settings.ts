import type { JournalConfig } from './core/model';
import { joinPath, normalizeFolder } from './core/paths';

/**
 * Ajustes del plugin. Los valores por omisión son genéricos (los más comunes para alguien nuevo);
 * la configuración de Arturo es una más (ver scripts/configs.ts y AGENTS.md).
 */
export interface JournalHubSettings extends JournalConfig {
	/** Mover sola una nota del journal cuando recibe un nombre con fecha. */
	autoFile: boolean;
	/** Entre la fecha y la palabra clave al crear una entrada («2026-08-07 - Palabra»). */
	nameSeparator: string;
	/** Carpeta con plantillas propias ('' = solo la preconfigurada). */
	templatesFolder: string;
	/** Plantilla por omisión: ruta de una nota de la carpeta de plantillas, o '' para la preconfigurada. */
	defaultTemplate: string;
	/** Preguntar si convertir en entrada una nota vacía creada dentro del journal. */
	askOnNewNote: boolean;
	/** Mantener la nota generada del hub. */
	hubNote: boolean;
	/** Ruta de la nota generada ('' = «Journal Hub.md» dentro de la carpeta del journal). */
	hubNotePath: string;
	/** Ya se mostró la bienvenida (se muestra una sola vez; después, con el comando). */
	welcomeShown: boolean;
}

export type HubMode = 'timeline' | 'list' | 'calendar';

/** Valor de `journalFolder` para la raíz de la bóveda ('' significa «sin configurar»). */
export const VAULT_ROOT = '/';

export const DEFAULT_SETTINGS: JournalHubSettings = {
	// Vacía = sin configurar: el plugin no hace nada por su cuenta.
	journalFolder: '',
	folderPattern: 'YYYY/MM',
	nameDateFormat: 'YYYY-MM-DD',
	dateField: 'created',
	monthLanguage: 'en',
	monthCase: 'capitalized',
	autoFile: true,
	nameSeparator: ' - ',
	templatesFolder: '',
	defaultTemplate: '',
	askOnNewNote: true,
	hubNote: true,
	hubNotePath: '',
	welcomeShown: false,
};

export const DEFAULT_HUB_NOTE_NAME = 'Journal Hub.md';

/** Ruta efectiva de la nota generada, o null si no hay carpeta configurada. */
export function resolveHubNotePath(s: JournalHubSettings): string | null {
	if (!s.journalFolder) return null;
	const custom = normalizeFolder(s.hubNotePath);
	if (custom) return /\.md$/i.test(custom) ? custom : `${custom}.md`;
	return joinPath(s.journalFolder === VAULT_ROOT ? '' : s.journalFolder, DEFAULT_HUB_NOTE_NAME);
}

/** Organizaciones comunes para las subcarpetas. */
export const FOLDER_PRESETS = ['YYYY/MM', 'YYYY/MM - MMMM', 'YYYY/YYYY-MM', 'YYYY', ''];
