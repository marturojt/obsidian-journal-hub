/**
 * Crear y convertir entradas con plantillas. La lógica de plantillas y nombres vive en
 * core/template.ts; aquí solo se lee y escribe con la API de Obsidian.
 */
import { App, MarkdownView, Notice, TFile } from 'obsidian';
import { DateParts, parseFrontmatterDate } from './core/dates';
import { expectedFolderFor, JournalConfig, parseEntryName } from './core/model';
import { baseName, isInFolder, joinPath, normalizeFolder } from './core/paths';
import { BUILTIN_TEMPLATE, entryName, mergeExisting, renderTemplate, Rendered } from './core/template';
import type { Filer } from './filer';
import { t } from './i18n';
import type { JournalHubSettings } from './settings';

/** Nombre del archivo cuando se copia la plantilla preconfigurada a la carpeta de plantillas. */
export const BUILTIN_TEMPLATE_NAME = 'Daily Journal';

const pad = (n: number) => String(n).padStart(2, '0');

function localDate(d: Date): DateParts {
	return { year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate() };
}

export class Entries {
	constructor(
		private app: App,
		private getSettings: () => JournalHubSettings,
		private filer: Filer,
	) {}

	/** Notas de la carpeta de plantillas, por nombre. */
	templates(): TFile[] {
		const folder = normalizeFolder(this.getSettings().templatesFolder);
		if (!folder) return [];
		return this.app.vault
			.getMarkdownFiles()
			.filter((f) => isInFolder(f.path, folder))
			.sort((a, b) => a.basename.localeCompare(b.basename));
	}

	/** Plantilla elegida por omisión, si sigue existiendo; si no, la preconfigurada (''). */
	defaultTemplate(): string {
		const path = this.getSettings().defaultTemplate;
		return path && this.app.vault.getFileByPath(path) ? path : '';
	}

	private async templateText(path: string): Promise<string> {
		if (!path) return BUILTIN_TEMPLATE;
		const file = this.app.vault.getFileByPath(path);
		if (!file) {
			new Notice(t('notice.templateMissing', { path }));
			return BUILTIN_TEMPLATE;
		}
		return this.app.vault.cachedRead(file);
	}

	/** ¿La nota ya es una entrada (fecha en el nombre)? */
	isEntry(file: TFile, config: JournalConfig): boolean {
		return parseEntryName(file.basename, config) !== null;
	}

	/** Nueva entrada de hoy: nace en su carpeta, con la plantilla, y se abre con el cursor en su lugar. */
	async create(config: JournalConfig, keyword: string, templatePath: string): Promise<TFile> {
		const now = new Date();
		const date = localDate(now);
		const name = entryName(date, keyword, config.nameDateFormat, this.getSettings().nameSeparator, config);
		const path = this.uniquePath(expectedFolderFor(date, config), name);
		const rendered = this.render(await this.templateText(templatePath), date, now, keyword, baseName(path), config);
		await this.filer.ensureFolders(path);
		const file = await this.app.vault.create(path, rendered.content);
		await this.open(file, rendered.cursor);
		return file;
	}

	/**
	 * Convierte una nota en entrada: la renombra con la fecha (la de su propiedad de fecha o, si no
	 * tiene, la de creación del archivo), le aplica la plantilla sin perder su texto y la acomoda.
	 */
	async convert(config: JournalConfig, file: TFile, keyword: string, templatePath: string): Promise<void> {
		const frontmatter = this.app.metadataCache.getFileCache(file)?.frontmatter;
		const created = new Date(file.stat.ctime);
		const date = parseFrontmatterDate(frontmatter?.[config.dateField]) ?? localDate(created);
		const name = entryName(date, keyword, config.nameDateFormat, this.getSettings().nameSeparator, config);
		const target = this.uniquePath(expectedFolderFor(date, config), name, file.path);
		const template = await this.templateText(templatePath);

		let cursor: number | null = null;
		await this.app.vault.process(file, (existing) => {
			const merged = mergeExisting(this.render(template, date, created, keyword, baseName(target), config), existing);
			cursor = merged.cursor;
			return merged.content;
		});
		if (target !== file.path) await this.filer.move(file.path, target);
		const view = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (view?.file === file && cursor !== null) this.placeCursor(view, cursor);
	}

	/** Copia la plantilla preconfigurada a la carpeta de plantillas para usarla de punto de partida. */
	async copyBuiltinTemplate(): Promise<TFile | null> {
		const folder = normalizeFolder(this.getSettings().templatesFolder);
		if (!folder) {
			new Notice(t('notice.noTemplatesFolder'));
			return null;
		}
		const path = this.uniquePath(folder, BUILTIN_TEMPLATE_NAME);
		await this.filer.ensureFolders(path);
		const file = await this.app.vault.create(path, BUILTIN_TEMPLATE);
		await this.open(file, null);
		return file;
	}

	private render(template: string, date: DateParts, time: Date, keyword: string, title: string, config: JournalConfig): Rendered {
		return renderTemplate(template, {
			date,
			time: `${pad(time.getHours())}:${pad(time.getMinutes())}`,
			keyword: keyword.trim(),
			title,
			months: config,
		});
	}

	/** `carpeta/nombre.md`, o `nombre 2.md`, `nombre 3.md`… si ya existe (salvo que sea la nota misma). */
	private uniquePath(folder: string, name: string, self?: string): string {
		for (let n = 1; ; n++) {
			const path = joinPath(folder, `${n === 1 ? name : `${name} ${n}`}.md`);
			const taken = this.app.vault.getAbstractFileByPath(path);
			if (!taken || path === self) return path;
		}
	}

	private async open(file: TFile, cursor: number | null): Promise<void> {
		const leaf = this.app.workspace.getLeaf(false);
		await leaf.openFile(file);
		if (cursor !== null && leaf.view instanceof MarkdownView) this.placeCursor(leaf.view, cursor);
	}

	private placeCursor(view: MarkdownView, offset: number): void {
		const editor = view.editor;
		editor.setCursor(editor.offsetToPos(offset));
		editor.focus();
	}
}
