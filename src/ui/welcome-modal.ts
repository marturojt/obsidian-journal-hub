/**
 * Primera vez: sin carpeta configurada el plugin no hace nada. Esta ventana lo explica, sugiere
 * carpetas que ya parecen un journal (con su organización detectada) y, al elegir una, solo guarda
 * los ajustes: no mueve ni cambia ninguna nota.
 */
import { App, ButtonComponent, Modal } from 'obsidian';
import { formatDate } from '../core/dates';
import { Suggestion, suggestJournalFolders } from '../core/detect';
import { t } from '../i18n';
import type JournalHubPlugin from '../main';
import { resolveHubNotePath } from '../settings';

const SAMPLE = { year: 2026, month: 8, day: 7 };

export class WelcomeModal extends Modal {
	constructor(
		app: App,
		private plugin: JournalHubPlugin,
	) {
		super(app);
	}

	onOpen(): void {
		this.setTitle(t('welcome.title'));
		this.contentEl.addClass('jh-welcome');
		this.renderChoose();
	}

	onClose(): void {
		this.contentEl.empty();
	}

	private renderChoose(): void {
		const el = this.contentEl;
		el.empty();
		el.createEl('p', { text: t('welcome.intro') });
		el.createEl('p', { cls: 'jh-muted', text: t('welcome.nothingYet') });

		const suggestions = suggestJournalFolders(this.app.vault.getMarkdownFiles().map((f) => f.path));
		if (suggestions.length) {
			el.createEl('h3', { text: t('welcome.suggested') });
			const list = el.createDiv({ cls: 'jh-welcome-list' });
			suggestions.forEach((s, i) => this.renderSuggestion(list, s, i === 0));
		} else {
			el.createEl('p', { cls: 'jh-muted', text: t('welcome.noSuggestions') });
		}

		const buttons = el.createDiv({ cls: 'modal-button-container' });
		new ButtonComponent(buttons).setButtonText(t('welcome.later')).onClick(() => this.close());
		new ButtonComponent(buttons).setButtonText(t('welcome.other')).onClick(() => {
			this.close();
			this.plugin.openSettings();
		});
	}

	private renderSuggestion(parent: HTMLElement, s: Suggestion, recommended: boolean): void {
		const card = parent.createDiv({ cls: 'jh-welcome-card' });
		const info = card.createDiv({ cls: 'jh-welcome-info' });
		info.createDiv({ cls: 'jh-welcome-folder', text: s.journalFolder || '/' });
		const sub = s.folderPattern ? formatDate(s.folderPattern, SAMPLE, s) : t('settings.pattern.none');
		const name = formatDate(s.nameDateFormat, SAMPLE, s);
		info.createDiv({ cls: 'jh-muted', text: t('welcome.detail', { count: s.dated, sub, name }) });
		if (s.misplaced) info.createDiv({ cls: 'jh-muted', text: t('welcome.misplaced', { count: s.misplaced }) });
		const button = new ButtonComponent(card).setButtonText(t('welcome.use')).onClick(() => void this.apply(s));
		if (recommended) button.setCta();
	}

	private async apply(s: Suggestion): Promise<void> {
		const settings = this.plugin.settings;
		settings.journalFolder = s.journalFolder || '/';
		settings.folderPattern = s.folderPattern;
		settings.nameDateFormat = s.nameDateFormat;
		settings.monthLanguage = s.monthLanguage;
		settings.monthCase = s.monthCase;
		await this.plugin.saveSettings();
		this.renderDone(s);
	}

	private renderDone(s: Suggestion): void {
		const el = this.contentEl;
		el.empty();
		this.setTitle(t('welcome.doneTitle'));
		el.createEl('p', { text: t('welcome.done', { count: s.dated, folder: s.journalFolder || '/' }) });
		el.createEl('p', { cls: 'jh-muted', text: t('welcome.nothingMoved') });
		if (s.misplaced) el.createEl('p', { cls: 'jh-muted', text: t('welcome.misplaced', { count: s.misplaced }) });
		const hubNote = this.plugin.settings.hubNote ? resolveHubNotePath(this.plugin.settings) : null;
		if (hubNote) el.createEl('p', { cls: 'jh-muted', text: t('welcome.hubNote', { path: hubNote }) });

		const buttons = el.createDiv({ cls: 'modal-button-container' });
		new ButtonComponent(buttons).setButtonText(t('welcome.settings')).onClick(() => {
			this.close();
			this.plugin.openSettings();
		});
		new ButtonComponent(buttons)
			.setButtonText(t('welcome.openHub'))
			.setCta()
			.onClick(() => {
				this.close();
				void this.plugin.openHub();
			});
	}
}
