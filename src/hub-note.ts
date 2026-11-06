/**
 * Escribe la nota generada del hub. Solo escribe si el contenido cambió y nunca sobrescribe una
 * nota que no generó el plugin (sin la marca `journal-hub: generated` en su frontmatter).
 */
import { App, Notice, TFile } from 'obsidian';
import { isGeneratedHubNote, renderHubNote } from './core/hub-note';
import type { Filer } from './filer';
import { t, uiLanguage } from './i18n';
import { JournalHubSettings, resolveHubNotePath } from './settings';

export class HubNoteWriter {
	/** Ruta de la que ya se avisó que tiene una nota ajena (para no repetir el aviso en cada cambio). */
	private warnedForeign: string | null = null;

	constructor(
		private app: App,
		private getSettings: () => JournalHubSettings,
		private filer: Filer,
	) {}

	/**
	 * La ruta de la nota cambió en los ajustes: la nota generada que quedó en la ruta anterior va a
	 * la papelera (solo si tiene la marca; una nota ajena nunca se toca).
	 */
	async retire(oldPath: string | null): Promise<void> {
		if (!oldPath || oldPath === this.path()) return;
		const file = this.app.vault.getFileByPath(oldPath);
		if (file && isGeneratedHubNote(await this.app.vault.read(file))) await this.app.fileManager.trashFile(file);
	}

	path(): string | null {
		return resolveHubNotePath(this.getSettings());
	}

	/** Regenera la nota. Devuelve true si escribió algo. */
	async update(): Promise<boolean> {
		const settings = this.getSettings();
		const path = this.path();
		if (!settings.hubNote || !path) return false;
		const config = this.filer.config();
		if (!config) return false;

		const index = this.filer.index(config);
		const months = new Set(index.entries.map((e) => `${e.date.year}-${e.date.month}`)).size;
		const content = renderHubNote({
			entries: index.entries,
			unmatched: index.unmatched,
			lang: uiLanguage,
			texts: {
				title: t('hubNote.title'),
				calloutTitle: t('hubNote.calloutTitle'),
				calloutBody: t('hubNote.calloutBody'),
				summary: t('hubNote.summary', { total: index.entries.length, months }),
				unmatched: t('hubNote.unmatched'),
			},
			link: (target, alias) => {
				const file = this.app.vault.getFileByPath(target);
				return file ? this.app.fileManager.generateMarkdownLink(file, path, undefined, alias) : alias;
			},
		});

		const existing = this.app.vault.getAbstractFileByPath(path);
		if (existing && !(existing instanceof TFile)) return false;
		if (existing instanceof TFile) {
			// Atómico: se decide con el contenido que hay en el momento de escribir.
			let wrote = false;
			let foreign = false;
			await this.app.vault.process(existing, (current) => {
				if (current === content) return current;
				if (!isGeneratedHubNote(current)) {
					foreign = true;
					return current;
				}
				wrote = true;
				return content;
			});
			if (foreign && this.warnedForeign !== path) new Notice(t('notice.hubNoteForeign', { path }), 15000);
			if (foreign) this.warnedForeign = path;
			return wrote;
		}
		await this.filer.ensureFolders(path);
		await this.app.vault.create(path, content);
		return true;
	}
}
