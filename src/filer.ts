/**
 * Acomodo dentro de Obsidian: lee las notas con `Vault` y `MetadataCache`, y mueve con
 * `fileManager.renameFile` (que actualiza las ligas). La lógica de qué mover vive en core/filing.ts.
 */
import { App, Notice, TFile } from 'obsidian';
import { autoFileTarget, cleanupCandidates, foldersToCreate, Move, planMoves, MovePlan } from './core/filing';
import { HUB_NOTE_MARKER, HUB_NOTE_MARKER_VALUE } from './core/hub-note';
import { buildIndex, JournalConfig, JournalIndex } from './core/model';
import { baseName, normalizeFolder, parentFolder } from './core/paths';
import { t } from './i18n';
import { JournalHubSettings, resolveHubNotePath, VAULT_ROOT } from './settings';

export class Filer {
	private warnedMissing = false;

	constructor(
		private app: App,
		private getSettings: () => JournalHubSettings,
	) {}

	/** Configuración vigente, o null si no hay carpeta elegida o ya no existe (el plugin se detiene). */
	config(): JournalConfig | null {
		const s = this.getSettings();
		if (!s.journalFolder) return null;
		const folder = normalizeFolder(s.journalFolder);
		if (folder && !this.app.vault.getFolderByPath(folder)) {
			if (!this.warnedMissing) new Notice(t('notice.folderMissing', { folder }), 10000);
			this.warnedMissing = true;
			return null;
		}
		this.warnedMissing = false;
		return { ...s, journalFolder: folder };
	}

	/** Rutas que nunca son entradas: la carpeta de plantillas y la nota generada del hub. */
	exclusions(): string[] {
		const settings = this.getSettings();
		const templates = normalizeFolder(settings.templatesFolder);
		const hubNote = resolveHubNotePath(settings);
		return [templates, hubNote ?? ''].filter(Boolean);
	}

	/** Crea las carpetas que falten para poder escribir en `path`. */
	async ensureFolders(path: string): Promise<void> {
		for (const folder of foldersToCreate(parentFolder(path), (p) => this.app.vault.getFolderByPath(p) !== null)) {
			await this.app.vault.createFolder(folder);
		}
	}

	index(config: JournalConfig): JournalIndex {
		const notes = this.app.vault
			.getMarkdownFiles()
			.map((file) => ({ path: file.path, frontmatter: this.app.metadataCache.getFileCache(file)?.frontmatter ?? null }))
			// Una nota del hub generada (aunque ya no esté en la ruta configurada) nunca es entrada.
			.filter((n) => n.frontmatter?.[HUB_NOTE_MARKER] !== HUB_NOTE_MARKER_VALUE);
		return buildIndex(notes, config, this.exclusions());
	}

	plan(config: JournalConfig): MovePlan {
		const exists = (path: string) => this.app.vault.getAbstractFileByPath(path) !== null || this.existsIgnoringCase(path);
		return planMoves(this.index(config).entries, exists);
	}

	/** Carpetas que faltan para un conjunto de movimientos (para mostrarlo antes de confirmar). */
	missingFolders(moves: Move[]): string[] {
		const exists = (p: string) => this.app.vault.getFolderByPath(p) !== null;
		return [...new Set(moves.flatMap((m) => foldersToCreate(parentFolder(m.to), exists)))];
	}

	async move(from: string, to: string): Promise<void> {
		const file = this.app.vault.getFileByPath(from);
		if (!file) throw new Error(`${from} not found`);
		await this.ensureFolders(to);
		await this.app.fileManager.renameFile(file, to);
		await this.removeEmptiedFolders(parentFolder(from));
	}

	/**
	 * Borra las carpetas que el movimiento dejó vacías dentro del journal (nunca la carpeta del
	 * journal). Solo si en disco no queda nada, ni archivos ocultos que Obsidian no muestra.
	 */
	private async removeEmptiedFolders(fromFolder: string): Promise<void> {
		const journal = this.getSettings().journalFolder;
		if (!journal) return;
		for (const path of cleanupCandidates(fromFolder, journal === VAULT_ROOT ? '' : journal)) {
			const folder = this.app.vault.getFolderByPath(path);
			if (!folder || folder.children.length) return;
			const listed = await this.app.vault.adapter.list(path);
			if (listed.files.length || listed.folders.length) return;
			await this.app.fileManager.trashFile(folder);
		}
	}

	/** Acomodo automático de una nota recién creada o renombrada. */
	async autoFile(file: TFile): Promise<void> {
		const settings = this.getSettings();
		if (!settings.autoFile) return;
		const config = this.config();
		if (!config) return;
		// Puede haber cambiado entre el evento y ahora
		if (this.app.vault.getFileByPath(file.path) !== file) return;
		const to = autoFileTarget(file.path, config, this.exclusions());
		if (!to) return;
		if (this.app.vault.getAbstractFileByPath(to) || this.existsIgnoringCase(to)) {
			new Notice(t('notice.conflict', { name: baseName(file.path), to }), 10000);
			return;
		}
		try {
			await this.move(file.path, to);
			new Notice(t('notice.filedOne', { name: baseName(to), folder: parentFolder(to) }));
		} catch (error) {
			new Notice(t('notice.failed', { from: file.path, error: String(error) }), 10000);
		}
	}

	/** macOS y Windows no distinguen mayúsculas: «Agosto» y «agosto» son la misma carpeta en disco. */
	private existsIgnoringCase(path: string): boolean {
		const lower = path.toLowerCase();
		return this.app.vault.getAllLoadedFiles().some((f) => f.path.toLowerCase() === lower);
	}
}
