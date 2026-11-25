/**
 * Escribe la nota generada del hub y, en modo «en ramas», sus notas de año y mes. Solo escribe lo
 * que cambió y nunca sobrescribe una nota que no generó el plugin (sin la marca
 * `journal-hub: generated` en su frontmatter).
 */
import { App, Notice, TFile, TFolder } from 'obsidian';
import { HUB_NOTE_MARKER, HUB_NOTE_MARKER_VALUE, isGeneratedHubNote, renderHubBranches, renderHubNote } from './core/hub-note';
import { isInFolder } from './core/paths';
import type { Filer } from './filer';
import { t, uiLanguage } from './i18n';
import { hubIndexFolder, JournalHubSettings, resolveHubNotePath } from './settings';

/** Contenido mínimo de una nota de rama recién creada (se llena en la misma pasada). */
const PLACEHOLDER = `---\n${HUB_NOTE_MARKER}: ${HUB_NOTE_MARKER_VALUE}\n---\n`;

export class HubNoteWriter {
	/** Rutas de las que ya se avisó que tienen una nota ajena (para no repetir el aviso en cada cambio). */
	private warnedForeign = new Set<string>();

	constructor(
		private app: App,
		private getSettings: () => JournalHubSettings,
		private filer: Filer,
	) {}

	path(): string | null {
		return resolveHubNotePath(this.getSettings());
	}

	/**
	 * La ruta de la nota cambió en los ajustes: la nota generada que quedó en la ruta anterior y sus
	 * notas de año y mes van a la papelera (solo las que tienen la marca; una nota ajena nunca se toca).
	 */
	async retire(oldPath: string | null): Promise<void> {
		if (!oldPath || oldPath === this.path()) return;
		const file = this.app.vault.getFileByPath(oldPath);
		if (file && isGeneratedHubNote(await this.app.vault.read(file))) await this.app.fileManager.trashFile(file);
		await this.retireIndex(hubIndexFolder(oldPath));
	}

	/** Manda a la papelera las notas generadas de una carpeta de ramas (y la carpeta, si queda vacía). */
	async retireIndex(folderPath: string | null, keep: Set<string> = new Set()): Promise<void> {
		const folder = folderPath ? this.app.vault.getFolderByPath(folderPath) : null;
		if (!folder) return;
		let removed = 0;
		for (const file of this.generatedIn(folder)) {
			if (!keep.has(file.path) && isGeneratedHubNote(await this.app.vault.read(file))) {
				await this.app.fileManager.trashFile(file);
				removed++;
			}
		}
		// La carpeta solo se va si la vaciamos nosotros (nunca una carpeta vacía del usuario).
		if (removed && !folder.children.length && !(await this.app.vault.adapter.list(folder.path)).files.length) {
			await this.app.fileManager.trashFile(folder);
		}
	}

	/** Regenera la nota (y sus ramas). Devuelve cuántos archivos escribió. */
	async update(): Promise<number> {
		const settings = this.getSettings();
		const hubPath = this.path();
		if (!settings.hubNote || !hubPath) return 0;
		const config = this.filer.config();
		if (!config) return 0;

		const index = this.filer.index(config);
		const months = new Set(index.entries.map((e) => `${e.date.year}-${e.date.month}`)).size;
		const texts = {
			title: t('hubNote.title'),
			calloutTitle: t('hubNote.calloutTitle'),
			calloutBody: t('hubNote.calloutBody'),
			summary: t('hubNote.summary', { total: index.entries.length, months }),
			unmatched: t('hubNote.unmatched'),
		};
		const indexFolder = hubIndexFolder(hubPath)!;

		if (settings.hubNoteStyle !== 'branches') {
			const content = renderHubNote({ entries: index.entries, unmatched: index.unmatched, lang: uiLanguage, texts, link: this.linker(hubPath) });
			const wrote = (await this.write(hubPath, content)) ? 1 : 0;
			await this.retireIndex(indexFolder); // si antes estaba en ramas
			return wrote;
		}

		const args = {
			entries: index.entries,
			unmatched: index.unmatched,
			lang: uiLanguage,
			texts: { ...texts, entries: (n: number) => (n === 1 ? t('hub.entry') : t('hub.entries', { count: n })) },
			hubPath,
			indexFolder,
			fileMonths: config,
		};
		const plan = renderHubBranches({ ...args, link: () => '' });

		// 1. Que existan todas las notas, para que las ligas salgan con el formato de la bóveda.
		for (const path of [hubPath, ...plan.notes.keys()]) {
			if (!this.app.vault.getAbstractFileByPath(path)) {
				await this.filer.ensureFolders(path);
				await this.app.vault.create(path, PLACEHOLDER);
			}
		}

		// 2. Escribir cada una con ligas armadas desde ella misma.
		let wrote = 0;
		if (await this.write(hubPath, renderHubBranches({ ...args, link: this.linker(hubPath) }).hub)) wrote++;
		for (const path of plan.notes.keys()) {
			const content = renderHubBranches({ ...args, link: this.linker(path) }).notes.get(path)!;
			if (await this.write(path, content)) wrote++;
		}

		// 3. Las que sobran (un mes que se quedó sin entradas) van a la papelera.
		await this.retireIndex(indexFolder, new Set(plan.notes.keys()));
		return wrote;
	}

	/** Liga desde `source` hacia una nota, con el formato de ligas de la bóveda. */
	private linker(source: string): (target: string, alias: string) => string {
		return (target, alias) => {
			const file = this.app.vault.getFileByPath(target);
			return file ? this.app.fileManager.generateMarkdownLink(file, source, undefined, alias) : alias;
		};
	}

	/** Escribe si cambió y si la nota es nuestra (o no existe). Devuelve true si escribió. */
	private async write(path: string, content: string): Promise<boolean> {
		const existing = this.app.vault.getAbstractFileByPath(path);
		if (existing && !(existing instanceof TFile)) return false;
		if (!existing) {
			await this.filer.ensureFolders(path);
			await this.app.vault.create(path, content);
			return true;
		}
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
		if (foreign && !this.warnedForeign.has(path)) new Notice(t('notice.hubNoteForeign', { path }), 15000);
		if (foreign) this.warnedForeign.add(path);
		return wrote;
	}

	/** Notas markdown dentro de una carpeta (a cualquier profundidad). */
	private generatedIn(folder: TFolder): TFile[] {
		return this.app.vault.getMarkdownFiles().filter((f) => isInFolder(f.path, folder.path));
	}
}
