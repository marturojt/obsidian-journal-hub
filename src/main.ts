import { debounce, Notice, Plugin, TAbstractFile, TFile, TFolder } from 'obsidian';
import { Entry, JournalConfig } from './core/model';
import { isInFolder, normalizeFolder } from './core/paths';
import { isPlaceholderName } from './core/template';
import { Entries } from './entries';
import { Filer } from './filer';
import { HubNoteWriter } from './hub-note';
import { t } from './i18n';
import { DEFAULT_SETTINGS, JournalHubSettings, resolveHubNotePath, VAULT_ROOT } from './settings';
import { EntryModal } from './ui/entry-modal';
import { FileEntriesModal } from './ui/file-modal';
import { ACTIVITY_VIEW, ActivityView } from './ui/activity-view';
import { HUB_VIEW, HubView } from './ui/hub-view';
import { JournalHubSettingTab } from './ui/settings-tab';
import { WelcomeModal } from './ui/welcome-modal';

/** Espera antes de acomodar una nota: deja terminar renombres o escrituras en curso. */
const AUTO_FILE_DELAY_MS = 400;
/** Cuánto tiempo se recuerda el renombre de una carpeta (sus notas reciben su propio evento `rename`). */
const FOLDER_RENAME_MEMORY_MS = 5000;
/** Espera antes de preguntar por una nota nueva: deja que Obsidian la abra y que el usuario la nombre. */
const ASK_DELAY_MS = 600;

/** Lo que la vista del hub necesita para dibujarse. */
export type HubData =
	| { state: 'unconfigured' }
	| { state: 'missing'; folder: string }
	| { state: 'ok'; folder: string; entries: Entry[]; unmatched: string[] };

/** Si `path` es `oldPath` o está dentro, la ruta equivalente bajo `newPath`; si no, null. */
function rebase(path: string, oldPath: string, newPath: string): string | null {
	if (path === oldPath) return newPath;
	if (path.startsWith(`${oldPath}/`)) return newPath + path.slice(oldPath.length);
	return null;
}

export default class JournalHubPlugin extends Plugin {
	settings!: JournalHubSettings;
	filer!: Filer;
	entries!: Entries;
	hubNote!: HubNoteWriter;
	/** Regenera la nota del hub cuando todo lleva un rato quieto (no una vez por cada tecla). */
	private scheduleHubNote: () => void = () => {};
	private pending = new Map<TFile, number>();
	/** Carpetas renombradas hace poco: los `rename` de sus notas no son renombres de la nota. */
	private renamedFolders: { oldPath: string; at: number }[] = [];

	async onload() {
		await this.loadSettings();
		this.filer = new Filer(this.app, () => this.settings);
		this.entries = new Entries(this.app, () => this.settings, this.filer);
		this.hubNote = new HubNoteWriter(this.app, () => this.settings, this.filer);
		this.scheduleHubNote = debounce(() => void this.hubNote.update(), 2000, true);
		const settingTab = new JournalHubSettingTab(this.app, this);
		this.addSettingTab(settingTab);
		// La lista de plantillas de los ajustes se arma al registrar la pestaña: se rehace si cambian.
		const refreshTemplates = (path: string, oldPath?: string) => {
			const folder = normalizeFolder(this.settings.templatesFolder);
			if (folder && [path, oldPath].some((p) => p && isInFolder(p, folder))) settingTab.update();
		};
		this.registerEvent(this.app.vault.on('create', (f) => refreshTemplates(f.path)));
		this.registerEvent(this.app.vault.on('delete', (f) => refreshTemplates(f.path)));
		this.registerEvent(this.app.vault.on('rename', (f, oldPath) => refreshTemplates(f.path, oldPath)));

		this.registerView(HUB_VIEW, (leaf) => new HubView(leaf, this));
		this.registerHoverLinkSource(HUB_VIEW, { display: 'Journal Hub', defaultMod: true });
		this.registerView(ACTIVITY_VIEW, (leaf) => new ActivityView(leaf, this));
		this.addRibbonIcon('book-open-text', t('ribbon.hub'), () => void this.openHub());
		this.addRibbonIcon('notebook-pen', t('ribbon.new'), () => this.newEntry());
		this.addRibbonIcon('layout-grid', t('ribbon.activity'), () => void this.openActivity());
		this.addCommand({ id: 'open-hub', name: t('command.openHub'), callback: () => void this.openHub() });
		this.addCommand({ id: 'open-activity', name: t('command.openActivity'), callback: () => void this.openActivity() });
		this.addCommand({
			id: 'update-hub-note',
			name: t('command.updateHubNote'),
			callback: () => {
				if (this.requireConfig()) void this.hubNote.update();
			},
		});

		// La vista se redibuja cuando cambian las entradas (con espera, para no hacerlo por cada tecla).
		const refreshView = debounce(() => this.refreshHub(), 300, true);
		const refresh = () => {
			refreshView();
			this.scheduleHubNote();
		};
		this.registerEvent(this.app.vault.on('create', refresh));
		this.registerEvent(this.app.vault.on('delete', refresh));
		this.registerEvent(this.app.vault.on('rename', refresh));
		this.registerEvent(this.app.metadataCache.on('changed', refresh));
		this.addCommand({ id: 'new-entry', name: t('command.new'), callback: () => this.newEntry() });
		this.addCommand({
			id: 'convert-note',
			name: t('command.convert'),
			checkCallback: (checking) => {
				const file = this.app.workspace.getActiveFile();
				if (!file || !this.canConvert(file)) return false;
				if (!checking) this.askConvert(file);
				return true;
			},
		});
		this.addCommand({ id: 'file-entries', name: t('command.file'), callback: () => this.openFileModal() });
		this.addCommand({
			id: 'copy-builtin-template',
			name: t('command.copyTemplate'),
			callback: () => void this.entries.copyBuiltinTemplate(),
		});

		this.registerEvent(
			this.app.workspace.on('file-menu', (menu, file) => {
				if (!(file instanceof TFile) || !this.canConvert(file)) return;
				menu.addItem((item) =>
					item
						.setTitle(t('menu.convert'))
						.setIcon('notebook-pen')
						.onClick(() => this.askConvert(file)),
				);
			}),
		);

		// Los eventos `create` de la carga de la bóveda no cuentan: se registran ya con todo cargado.
		this.addCommand({ id: 'welcome', name: t('command.welcome'), callback: () => this.openWelcome() });

		this.app.workspace.onLayoutReady(() => {
			this.scheduleHubNote();
			// Primera vez: sin carpeta configurada, la bienvenida se muestra una sola vez.
			if (!this.settings.journalFolder && !this.settings.welcomeShown) {
				this.settings.welcomeShown = true;
				void this.saveData(this.settings);
				this.openWelcome();
			}
			this.registerEvent(
				this.app.vault.on('create', (file) => {
					this.queueAutoFile(file);
					this.queueAsk(file);
				}),
			);
			this.registerEvent(
				this.app.vault.on('rename', (file, oldPath) => {
					if (file instanceof TFolder) {
						this.renamedFolders.push({ oldPath, at: Date.now() });
					} else {
						this.queueAutoFile(file, oldPath);
					}
					void this.followRenamedPaths(oldPath, file.path);
				}),
			);
		});
		this.register(() => {
			for (const timer of this.pending.values()) window.clearTimeout(timer);
			this.pending.clear();
		});
	}

	async openHub(): Promise<void> {
		const existing = this.app.workspace.getLeavesOfType(HUB_VIEW)[0];
		const leaf = existing ?? this.app.workspace.getLeaf('tab');
		if (!existing) await leaf.setViewState({ type: HUB_VIEW, active: true });
		await this.app.workspace.revealLeaf(leaf);
	}

	/** La actividad vive en la barra lateral derecha (como el calendario); el usuario puede moverla. */
	async openActivity(): Promise<void> {
		const existing = this.app.workspace.getLeavesOfType(ACTIVITY_VIEW)[0];
		const leaf = existing ?? this.app.workspace.getRightLeaf(false);
		if (!leaf) return;
		if (!existing) await leaf.setViewState({ type: ACTIVITY_VIEW, active: true });
		await this.app.workspace.revealLeaf(leaf);
	}

	/** Redibuja las vistas abiertas (hub y actividad). */
	refreshHub(): void {
		for (const type of [HUB_VIEW, ACTIVITY_VIEW]) {
			for (const leaf of this.app.workspace.getLeavesOfType(type)) {
				if (leaf.view instanceof HubView || leaf.view instanceof ActivityView) leaf.view.refresh();
			}
		}
	}

	hubData(): HubData {
		if (!this.settings.journalFolder) return { state: 'unconfigured' };
		const config = this.filer.config();
		if (!config) return { state: 'missing', folder: normalizeFolder(this.settings.journalFolder) };
		const index = this.filer.index(config);
		return { state: 'ok', folder: config.journalFolder, entries: index.entries, unmatched: index.unmatched };
	}

	openWelcome(): void {
		new WelcomeModal(this.app, this).open();
	}

	openSettings(): void {
		// API no pública pero estable: abrir los ajustes en la pestaña del plugin.
		const setting = (this.app as unknown as { setting?: { open(): void; openTabById(id: string): void } }).setting;
		setting?.open();
		setting?.openTabById(this.manifest.id);
	}

	/** Configuración vigente, avisando si falta; null si el plugin no debe hacer nada. */
	private requireConfig(): JournalConfig | null {
		if (!this.settings.journalFolder) {
			this.openWelcome();
			return null;
		}
		return this.filer.config(); // si la carpeta desapareció, Filer ya avisó
	}

	newEntry(): void {
		const config = this.requireConfig();
		if (!config) return;
		new EntryModal(this.app, {
			mode: 'new',
			initialKeyword: '',
			templates: this.templateChoices(),
			defaultTemplate: this.entries.defaultTemplate(),
			onSubmit: async (keyword, template) => {
				try {
					await this.entries.create(config, keyword, template);
				} catch (error) {
					new Notice(t('notice.error', { error: String(error) }), 10000);
				}
			},
		}).open();
	}

	/** Una nota markdown que no es ya una entrada y no es una plantilla. */
	private canConvert(file: TFile): boolean {
		if (file.extension !== 'md' || !this.settings.journalFolder) return false;
		const config = this.filer.config();
		if (!config || this.entries.isEntry(file, config)) return false;
		return !this.filer.exclusions().some((e) => file.path === e || isInFolder(file.path, e));
	}

	private askConvert(file: TFile): void {
		const config = this.requireConfig();
		if (!config) return;
		new EntryModal(this.app, {
			mode: 'convert',
			noteName: file.basename,
			initialKeyword: isPlaceholderName(file.basename) ? '' : file.basename,
			templates: this.templateChoices(),
			defaultTemplate: this.entries.defaultTemplate(),
			onSubmit: async (keyword, template) => {
				try {
					await this.entries.convert(config, file, keyword, template);
					new Notice(t('notice.converted', { name: file.basename }));
				} catch (error) {
					new Notice(t('notice.error', { error: String(error) }), 10000);
				}
			},
		}).open();
	}

	private templateChoices(): { path: string; name: string }[] {
		return this.entries.templates().map((f) => ({ path: f.path, name: f.basename }));
	}

	/**
	 * Nota vacía creada dentro del journal (botón de nota nueva, explorador, móvil): ofrecer
	 * convertirla. Se revisa un momento después, cuando Obsidian ya la abrió.
	 */
	private queueAsk(file: TAbstractFile): void {
		if (!this.settings.askOnNewNote || !(file instanceof TFile) || file.extension !== 'md') return;
		window.setTimeout(() => {
			void (async () => {
				if (this.app.vault.getFileByPath(file.path) !== file || !this.canConvert(file)) return;
				const config = this.filer.config();
				if (!config || !isInFolder(file.path, config.journalFolder)) return;
				if ((await this.app.vault.read(file)).trim()) return;
				this.askConvert(file);
			})();
		}, ASK_DELAY_MS);
	}

	openFileModal(): void {
		const config = this.requireConfig();
		if (!config) return;
		const plan = this.filer.plan(config);
		if (!plan.moves.length && !plan.conflicts.length) {
			new Notice(t('notice.nothingToFile'));
			return;
		}
		new FileEntriesModal(this.app, this.filer, plan, config.journalFolder).open();
	}

	/**
	 * Acomoda la nota un momento después del evento. Si el `rename` vino de renombrar o mover una
	 * carpeta que la contiene, no se toca: el usuario no renombró la nota (se revisa al vencer la
	 * espera, porque Obsidian puede avisar de la carpeta antes o después que de sus notas).
	 */
	private queueAutoFile(file: TAbstractFile, oldPath?: string): void {
		if (!(file instanceof TFile) || file.extension !== 'md') return;
		window.clearTimeout(this.pending.get(file));
		this.pending.set(
			file,
			window.setTimeout(() => {
				this.pending.delete(file);
				if (oldPath && this.movedWithFolder(oldPath)) return;
				void this.filer.autoFile(file);
			}, AUTO_FILE_DELAY_MS),
		);
	}

	private movedWithFolder(oldPath: string): boolean {
		const now = Date.now();
		this.renamedFolders = this.renamedFolders.filter((r) => now - r.at < FOLDER_RENAME_MEMORY_MS);
		return this.renamedFolders.some((r) => oldPath.startsWith(`${r.oldPath}/`));
	}

	/**
	 * Si el usuario renombra o mueve la carpeta del journal, la de plantillas, una que las contenga o
	 * la plantilla por omisión, los ajustes la siguen.
	 */
	private async followRenamedPaths(oldPath: string, newPath: string): Promise<void> {
		const s = this.settings;
		let changed = false;
		// La nota del hub (o una carpeta que la contiene) se renombró: la ruta la sigue. Se calcula
		// antes de tocar la carpeta del journal, porque la ruta por omisión depende de ella.
		const hubNote = resolveHubNotePath(s);
		const movedHubNote = hubNote ? rebase(hubNote, oldPath, newPath) : null;
		if (movedHubNote !== null) {
			s.hubNotePath = movedHubNote;
			changed = true;
		}
		if (s.journalFolder && s.journalFolder !== VAULT_ROOT) {
			const updated = rebase(normalizeFolder(s.journalFolder), oldPath, newPath);
			if (updated !== null) {
				s.journalFolder = updated;
				changed = true;
				new Notice(t('notice.folderFollowed', { folder: updated }));
			}
		}
		for (const key of ['templatesFolder', 'defaultTemplate'] as const) {
			const updated = s[key] ? rebase(s[key], oldPath, newPath) : null;
			if (updated !== null) {
				s[key] = updated;
				changed = true;
			}
		}
		if (changed) await this.saveSettings();
	}

	async loadSettings() {
		const saved = ((await this.loadData()) ?? {}) as Partial<JournalHubSettings> & { hubMode?: unknown };
		// hubMode vivía aquí en versiones de prueba; ahora va en el almacenamiento local (no genera commits).
		delete saved.hubMode;
		this.settings = Object.assign({}, DEFAULT_SETTINGS, saved);
	}

	async saveSettings() {
		await this.saveData(this.settings);
		this.refreshHub();
		this.scheduleHubNote();
	}
}
