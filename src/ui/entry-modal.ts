import { App, ButtonComponent, DropdownComponent, Modal, Setting, TextComponent } from 'obsidian';
import { t } from '../i18n';

export interface EntryModalOptions {
	mode: 'new' | 'convert';
	/** Para «convert»: nombre actual de la nota. */
	noteName?: string;
	initialKeyword: string;
	/** Rutas de plantillas propias; '' es la preconfigurada. */
	templates: { path: string; name: string }[];
	defaultTemplate: string;
	onSubmit: (keyword: string, templatePath: string) => Promise<void> | void;
}

/**
 * Pide la palabra clave (y la plantilla, si hay más de una). Sirve para crear una entrada nueva y
 * para preguntar si convertir una nota recién creada.
 */
export class EntryModal extends Modal {
	private submitting = false;

	constructor(
		app: App,
		private options: EntryModalOptions,
	) {
		super(app);
	}

	onOpen(): void {
		const { contentEl, options } = this;
		const isNew = options.mode === 'new';
		this.setTitle(isNew ? t('entryModal.newTitle') : t('entryModal.convertTitle'));
		contentEl.addClass('journal-hub-entry-modal');
		if (!isNew) contentEl.createEl('p', { text: t('entryModal.convertIntro', { name: options.noteName ?? '' }) });

		let keyword: TextComponent | undefined;
		new Setting(contentEl).setName(t('entryModal.keyword')).addText((text) => {
			keyword = text;
			text.setPlaceholder(t('entryModal.keywordPlaceholder')).setValue(options.initialKeyword);
			text.inputEl.addEventListener('keydown', (e) => {
				if (e.key === 'Enter' && !e.isComposing) {
					e.preventDefault();
					void submit();
				}
			});
		});

		let template = options.defaultTemplate;
		if (options.templates.length) {
			new Setting(contentEl).setName(t('entryModal.template')).addDropdown((dd: DropdownComponent) => {
				dd.addOption('', t('entryModal.builtin'));
				for (const tpl of options.templates) dd.addOption(tpl.path, tpl.name);
				dd.setValue(template).onChange((v) => (template = v));
			});
		}

		const buttons = contentEl.createDiv({ cls: 'modal-button-container' });
		new ButtonComponent(buttons).setButtonText(isNew ? t('modal.cancel') : t('entryModal.notNow')).onClick(() => this.close());
		new ButtonComponent(buttons)
			.setButtonText(isNew ? t('entryModal.create') : t('entryModal.convert'))
			.setCta()
			.onClick(() => void submit());

		const submit = async () => {
			if (this.submitting) return;
			this.submitting = true;
			this.close();
			await options.onSubmit(keyword?.getValue() ?? '', template);
		};

		window.setTimeout(() => keyword?.inputEl.focus(), 0);
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
