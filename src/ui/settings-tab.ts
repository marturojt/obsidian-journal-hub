import { App, normalizePath, PluginSettingTab, Setting, SettingDefinitionItem, SettingGroupItem } from 'obsidian';
import { formatDate, hasFullDate } from '../core/dates';
import { expectedFolderFor } from '../core/model';
import { normalizeFolder } from '../core/paths';
import { t } from '../i18n';
import type JournalHubPlugin from '../main';
import { DEFAULT_HUB_NOTE_NAME, DEFAULT_SETTINGS, FOLDER_PRESETS, JournalHubSettings, resolveHubNotePath, VAULT_ROOT } from '../settings';
import { isGeneratedHubNote } from '../core/hub-note';

const SAMPLE_DATE = { year: 2026, month: 8, day: 7 };
const CUSTOM = 'custom';

/** Ajustes con la API declarativa de Obsidian (1.13+): aparecen en la búsqueda de ajustes. */
export class JournalHubSettingTab extends PluginSettingTab {
	private exampleEl: HTMLElement | null = null;

	constructor(
		app: App,
		private plugin: JournalHubPlugin,
	) {
		super(app, plugin);
	}

	getSettingDefinitions(): SettingDefinitionItem[] {
		return [
			// El primer grupo va sin encabezado (guías de Obsidian: los ajustes generales arriba).
			{ type: 'group', items: this.filingItems() },
			{ type: 'group', heading: t('settings.group.entries'), items: this.entryItems() },
			{ type: 'group', heading: t('settings.group.hubNote'), items: this.hubNoteItems() },
		];
	}

	private hubNoteItems(): SettingGroupItem[] {
		const defaultPath = resolveHubNotePath({ ...this.plugin.settings, hubNotePath: '' }) ?? DEFAULT_HUB_NOTE_NAME;
		return [
			{
				name: t('settings.hubNote.name'),
				desc: t('settings.hubNote.desc'),
				control: { type: 'toggle', key: 'hubNote' },
			},
			{
				name: t('settings.hubNotePath.name'),
				desc: t('settings.hubNotePath.desc'),
				control: {
					type: 'text',
					key: 'hubNotePath',
					placeholder: defaultPath,
					validate: async (value: string) => {
						const path = resolveHubNotePath({ ...this.plugin.settings, hubNotePath: value });
						const file = path ? this.app.vault.getFileByPath(path) : null;
						if (file && !isGeneratedHubNote(await this.app.vault.cachedRead(file))) return t('settings.hubNotePath.taken');
						return undefined;
					},
				},
			},
		];
	}

	private entryItems(): SettingGroupItem[] {
		const templates = this.plugin.entries.templates();
		const options: Record<string, string> = { '': t('entryModal.builtin') };
		for (const f of templates) options[f.path] = f.basename;
		return [
			{
				name: t('settings.separator.name'),
				desc: t('settings.separator.desc'),
				control: { type: 'text', key: 'nameSeparator', placeholder: DEFAULT_SETTINGS.nameSeparator },
			},
			{
				name: t('settings.templatesFolder.name'),
				desc: t('settings.templatesFolder.desc'),
				control: {
					type: 'folder',
					key: 'templatesFolder',
					validate: (value: string) => {
						const v = normalizeFolder(value);
						if (!v || this.app.vault.getFolderByPath(v)) return;
						return t('settings.folder.missing');
					},
				},
			},
			{
				name: t('settings.defaultTemplate.name'),
				desc: t('settings.defaultTemplate.desc'),
				control: { type: 'dropdown', key: 'defaultTemplate', options },
			},
			{
				name: t('settings.copyTemplate.name'),
				desc: t('settings.copyTemplate.desc'),
				render: (setting: Setting) => {
					setting.addButton((b) =>
						b.setButtonText(t('settings.copyTemplate.name')).onClick(async () => {
							if (await this.plugin.entries.copyBuiltinTemplate()) this.update();
						}),
					);
				},
			},
			{
				name: t('settings.askOnNewNote.name'),
				desc: t('settings.askOnNewNote.desc'),
				control: { type: 'toggle', key: 'askOnNewNote' },
			},
		];
	}

	private filingItems(): SettingGroupItem[] {
		const settings = () => this.plugin.settings;
		return [
			{
				name: t('settings.folder.name'),
				desc: t('settings.folder.desc'),
				control: {
					type: 'folder',
					key: 'journalFolder',
					includeRoot: true,
					placeholder: 'Journal',
					validate: (value: string) => {
						const v = value.trim();
						if (!v || v === VAULT_ROOT || this.app.vault.getFolderByPath(normalizeFolder(v))) return;
						return t('settings.folder.missing');
					},
				},
			},
			{
				name: t('settings.pattern.name'),
				desc: t('settings.pattern.desc'),
				render: (setting: Setting) => {
					let text: { setValue: (v: string) => unknown } | undefined;
					setting.addDropdown((dd) => {
						for (const p of FOLDER_PRESETS) dd.addOption(p, p ? formatDate(p, SAMPLE_DATE, settings()) : t('settings.pattern.none'));
						dd.addOption(CUSTOM, t('settings.pattern.custom'));
						dd.setValue(FOLDER_PRESETS.includes(settings().folderPattern) ? settings().folderPattern : CUSTOM);
						dd.onChange(async (value) => {
							if (value === CUSTOM) return;
							text?.setValue(value);
							await this.setControlValue('folderPattern', value);
						});
					});
					setting.addText((input) => {
						text = input;
						input.setPlaceholder(DEFAULT_SETTINGS.folderPattern).setValue(settings().folderPattern);
						input.onChange((value) => this.setControlValue('folderPattern', value));
					});
				},
			},
			{
				name: t('settings.monthLanguage.name'),
				control: { type: 'dropdown', key: 'monthLanguage', options: { en: 'English', es: 'Español' } },
			},
			{
				name: t('settings.monthCase.name'),
				control: {
					type: 'dropdown',
					key: 'monthCase',
					options: {
						lower: t('settings.monthCase.lower'),
						capitalized: t('settings.monthCase.capitalized'),
						upper: t('settings.monthCase.upper'),
					},
				},
			},
			{
				name: t('settings.nameFormat.name'),
				desc: t('settings.nameFormat.desc'),
				control: {
					type: 'text',
					key: 'nameDateFormat',
					placeholder: 'YYYY-MM-DD',
					validate: (value: string) => (hasFullDate(value.trim()) ? undefined : t('settings.nameFormat.invalid')),
				},
			},
			{
				name: t('settings.dateField.name'),
				desc: t('settings.dateField.desc'),
				control: { type: 'text', key: 'dateField', placeholder: 'created' },
			},
			{
				name: t('settings.autoFile.name'),
				desc: t('settings.autoFile.desc'),
				control: { type: 'toggle', key: 'autoFile' },
			},
			{
				name: t('settings.preview.name'),
				searchable: false,
				render: (setting: Setting) => {
					this.exampleEl = setting.descEl.createDiv({ cls: 'journal-hub-example' });
					this.refreshExample();
					return () => (this.exampleEl = null);
				},
			},
		];
	}

	getControlValue(key: string): unknown {
		return this.plugin.settings[key as keyof JournalHubSettings];
	}

	async setControlValue(key: string, value: unknown): Promise<void> {
		const settings = this.plugin.settings as unknown as Record<string, unknown>;
		// Rutas escritas por el usuario: por normalizePath de Obsidian ('' se queda vacío: «sin configurar»).
		const cleanPath = (v: string) => (normalizeFolder(v) ? normalizeFolder(normalizePath(v)) : '');
		if (key === 'journalFolder' && typeof value === 'string') {
			const v = value.trim();
			value = v === VAULT_ROOT ? VAULT_ROOT : cleanPath(v);
		} else if (key === 'dateField' && typeof value === 'string') {
			value = value.trim() || 'created';
		} else if ((key === 'templatesFolder' || key === 'hubNotePath') && typeof value === 'string') {
			value = cleanPath(value);
		} else if (key === 'nameSeparator' || key === 'defaultTemplate') {
			// Se guardan tal cual: el separador puede llevar espacios a los lados.
		} else if (typeof value === 'string') {
			value = value.trim();
		}
		const hubNoteBefore = resolveHubNotePath(this.plugin.settings);
		settings[key] = value;
		await this.plugin.saveSettings();
		if (key === 'hubNotePath' || key === 'journalFolder') await this.plugin.hubNote.retire(hubNoteBefore);
		// Las etiquetas de las organizaciones comunes muestran nombres de mes: se vuelven a armar.
		if (key === 'monthLanguage' || key === 'monthCase' || key === 'templatesFolder') this.update();
		else this.refreshExample();
	}

	/** Ruta de ejemplo de una entrada con la configuración actual. */
	private refreshExample(): void {
		if (!this.exampleEl) return;
		const s = this.plugin.settings;
		const folder = expectedFolderFor(SAMPLE_DATE, { ...s, journalFolder: normalizeFolder(s.journalFolder) });
		const name = `${formatDate(s.nameDateFormat, SAMPLE_DATE, s)}${s.nameSeparator}${t('settings.preview.keyword')}.md`;
		this.exampleEl.setText(`${folder ? `${folder}/` : ''}${name}`);
	}
}
