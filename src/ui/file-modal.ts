import { App, ButtonComponent, Modal, Notice } from 'obsidian';
import type { MovePlan } from '../core/filing';
import { parentFolder } from '../core/paths';
import type { Filer } from '../filer';
import { t } from '../i18n';

/** Muestra qué se movería y pide confirmación antes de tocar nada. */
export class FileEntriesModal extends Modal {
	constructor(
		app: App,
		private filer: Filer,
		private plan: MovePlan,
		private journalFolder: string,
	) {
		super(app);
	}

	onOpen(): void {
		const { contentEl, plan } = this;
		this.setTitle(t('modal.title'));
		contentEl.addClass('journal-hub-file-modal');

		if (plan.moves.length) {
			contentEl.createEl('p', { text: t('modal.intro', { count: plan.moves.length }) });
			const list = contentEl.createEl('ul', { cls: 'journal-hub-move-list' });
			for (const move of plan.moves) {
				const li = list.createEl('li');
				li.createDiv({ cls: 'journal-hub-move-from', text: this.short(move.from) });
				li.createDiv({ cls: 'journal-hub-move-to', text: `→ ${this.short(parentFolder(move.to)) || '/'}` });
			}
			const newFolders = this.filer.missingFolders(plan.moves);
			if (newFolders.length) {
				contentEl.createEl('p', { cls: 'journal-hub-muted', text: t('modal.newFolders', { count: newFolders.length }) });
			}
		}

		if (plan.conflicts.length) {
			contentEl.createEl('p', { text: t('modal.conflicts') });
			const list = contentEl.createEl('ul', { cls: 'journal-hub-move-list' });
			for (const c of plan.conflicts) {
				const li = list.createEl('li');
				li.createDiv({ cls: 'journal-hub-move-from', text: this.short(c.from) });
				li.createDiv({
					cls: 'journal-hub-move-to journal-hub-muted',
					text: c.reason === 'duplicate' ? t('modal.duplicate') : `≠ ${this.short(c.to)}`,
				});
			}
		}

		const buttons = contentEl.createDiv({ cls: 'modal-button-container' });
		const status = buttons.createSpan({ cls: 'journal-hub-muted' });
		const cancel = new ButtonComponent(buttons).setButtonText(t('modal.cancel')).onClick(() => this.close());
		if (plan.moves.length) {
			const confirm = new ButtonComponent(buttons)
				.setButtonText(t('modal.confirm', { count: plan.moves.length }))
				.setCta()
				.onClick(async () => {
					confirm.setDisabled(true);
					cancel.setDisabled(true);
					await this.run(status);
					this.close();
				});
		}
	}

	private async run(status: HTMLElement): Promise<void> {
		let done = 0;
		for (const move of this.plan.moves) {
			status.setText(t('modal.working', { done, count: this.plan.moves.length }));
			try {
				await this.filer.move(move.from, move.to);
				done++;
			} catch (error) {
				new Notice(t('notice.failed', { from: move.from, error: String(error) }), 10000);
			}
		}
		new Notice(t('notice.filed', { count: done }));
	}

	/** Rutas relativas a la carpeta del journal, para que se lean mejor. */
	private short(path: string): string {
		const prefix = this.journalFolder ? `${this.journalFolder}/` : '';
		return prefix && path.startsWith(prefix) ? path.slice(prefix.length) : path;
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
