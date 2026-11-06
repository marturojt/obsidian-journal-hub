/**
 * Actividad del journal: mosaico tipo GitHub para ver qué tanto se escribe (un registro de hábito).
 * Pensada para la barra lateral, compacta; si se le da más ancho (área principal) muestra más
 * semanas y cuadros más grandes. Un día sin entradas no hace nada al hacer clic.
 */
import { ItemView, Keymap, Menu, setIcon, TFile, WorkspaceLeaf } from 'obsidian';
import { currentStreak, entriesByDay, level, rangeStats, weeksGrid } from '../core/activity';
import { compareDates, DateParts, isoDate, MONTH_NAMES } from '../core/dates';
import { WEEKDAYS_SHORT, weekdayOf } from '../core/hub';
import type { Entry } from '../core/model';
import { t, uiLanguage } from '../i18n';
import type JournalHubPlugin from '../main';

export const ACTIVITY_VIEW = 'journal-hub-activity';

/** A partir de este ancho, la vista usa cuadros grandes y tarjetas (área principal). */
const LARGE_PX = 600;
const SIZES = { compact: { cell: 10, gap: 2 }, large: { cell: 14, gap: 3 } };
const MAX_WEEKS = 53;
const MIN_WEEKS = 8;
/** Filas del mosaico con nombre del día (lunes, miércoles y viernes). */
const LABELED_ROWS = [0, 2, 4];
/** Iniciales de esas filas: en español, miércoles es «X» para no confundirlo con martes. */
const ROW_INITIALS = { es: ['L', 'X', 'V'], en: ['M', 'W', 'F'] };

const short = (m: number) => {
	const name = MONTH_NAMES[uiLanguage][m - 1]!.slice(0, 3);
	return uiLanguage === 'en' ? name.charAt(0).toUpperCase() + name.slice(1) : name;
};
const today = (): DateParts => {
	const d = new Date();
	return { year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate() };
};

export class ActivityView extends ItemView {
	/** Tramos hacia atrás desde la semana actual (0 = el más reciente). */
	private offset = 0;
	private lastLayout = '';

	constructor(
		leaf: WorkspaceLeaf,
		private plugin: JournalHubPlugin,
	) {
		super(leaf);
	}

	getViewType(): string {
		return ACTIVITY_VIEW;
	}

	getDisplayText(): string {
		return t('activity.title');
	}

	getIcon(): string {
		return 'layout-grid';
	}

	async onOpen(): Promise<void> {
		this.contentEl.addClass('jh-activity-view');
		this.refresh();
	}

	async onClose(): Promise<void> {
		this.contentEl.empty();
	}

	/** Obsidian avisa cuando cambia el tamaño del panel: si cambian las semanas que caben, se redibuja. */
	onResize(): void {
		if (this.layout().key !== this.lastLayout) this.refresh();
	}

	refresh(): void {
		const root = this.contentEl;
		root.empty();
		const layout = this.layout();
		this.lastLayout = layout.key;
		const box = root.createDiv({ cls: 'jh-act' });
		box.toggleClass('is-large', layout.large);

		const data = this.plugin.hubData();
		if (data.state !== 'ok') {
			box.createEl('p', { cls: 'jh-act-msg', text: data.state === 'unconfigured' ? t('hub.notConfigured') : t('hub.folderMissing', { folder: data.folder }) });
			if (data.state === 'unconfigured') box.createEl('button', { text: t('hub.chooseFolder') }).addEventListener('click', () => this.plugin.openWelcome());
			return;
		}

		const now = today();
		const byDay = entriesByDay(data.entries);
		const weeks = weeksGrid(now, layout.weeks, this.offset);
		const first = weeks[0]![0]!;
		const last = weeks[weeks.length - 1]![6]!;
		const oldest = data.entries.reduce<DateParts | null>((min, e) => (!min || compareDates(e.date, min) < 0 ? e.date : min), null);

		// Encabezado: título y navegación por tramos
		const head = box.createDiv({ cls: 'jh-act-head' });
		head.createEl(layout.large ? 'h1' : 'h2', { cls: 'jh-act-title', text: t('activity.title') });
		const nav = head.createDiv({ cls: 'jh-act-nav' });
		const prev = nav.createEl('button', { cls: 'clickable-icon', attr: { 'aria-label': t('activity.prev') } });
		setIcon(prev, 'chevron-left');
		prev.disabled = !oldest || compareDates(first, oldest) <= 0;
		prev.addEventListener('click', () => {
			this.offset++;
			this.refresh();
		});
		nav.createSpan({ cls: 'jh-act-range', text: this.rangeLabel(first, compareDates(last, now) > 0 ? now : last) });
		const next = nav.createEl('button', { cls: 'clickable-icon', attr: { 'aria-label': t('activity.next') } });
		setIcon(next, 'chevron-right');
		next.disabled = this.offset === 0;
		next.addEventListener('click', () => {
			this.offset = Math.max(0, this.offset - 1);
			this.refresh();
		});

		// Mosaico
		const grid = box.createDiv({ cls: 'jh-act-grid', attr: { role: 'grid', 'aria-label': t('activity.title') } });
		const labels = grid.createDiv({ cls: 'jh-act-col jh-act-wd' });
		labels.createSpan({ cls: 'jh-act-month' });
		const names = WEEKDAYS_SHORT[uiLanguage];
		const initials = ROW_INITIALS[uiLanguage];
		for (let row = 0; row < 7; row++) {
			// filas de lunes a domingo; WEEKDAYS_SHORT empieza en domingo
			const idx = LABELED_ROWS.indexOf(row);
			labels.createSpan({ cls: 'jh-act-wd-label', text: idx === -1 ? '' : layout.large ? names[(row + 1) % 7]! : initials[idx]! });
		}
		const status = createEl('p', { cls: 'jh-act-status', text: t('activity.hint') });
		let lastLabel = -9;
		weeks.forEach((week, w) => {
			const col = grid.createDiv({ cls: 'jh-act-col' });
			const monday = week[0]!;
			const showMonth = monday.day <= 7 && w - lastLabel > 2;
			if (showMonth) lastLabel = w;
			col.createSpan({ cls: 'jh-act-month', text: showMonth ? short(monday.month) : '' });
			for (const day of week) col.appendChild(this.cell(day, byDay.get(isoDate(day)) ?? [], now, oldest, status));
		});
		box.appendChild(status);

		// Números del tramo
		const stats = rangeStats(byDay, oldest && compareDates(first, oldest) < 0 ? oldest : first, last, now);
		const dl = box.createEl('dl', { cls: 'jh-act-stats' });
		const stat = (value: string, label: string) => {
			const item = dl.createDiv({ cls: 'jh-act-stat' });
			item.createEl('dd', { text: value });
			item.createEl('dt', { text: label });
		};
		stat(String(currentStreak(byDay, now)), t('activity.streak'));
		stat(String(stats.longest), t('activity.longest'));
		stat(String(stats.daysWritten), t('activity.days'));
		stat(stats.perWeek.toLocaleString(uiLanguage, { maximumFractionDigits: 1, minimumFractionDigits: 1 }), t('activity.perWeek'));

		if (layout.large) {
			const legend = box.createDiv({ cls: 'jh-act-legend' });
			legend.createSpan({ text: t('activity.less') });
			for (let l = 0; l <= 3; l++) legend.createSpan({ cls: `jh-act-cell level-${l}` });
			legend.createSpan({ text: t('activity.more') });
		}
	}

	/** Un día del mosaico. Con entradas: clic abre la entrada (o un menú si hay varias). */
	private cell(day: DateParts, entries: Entry[], now: DateParts, oldest: DateParts | null, status: HTMLElement): HTMLElement {
		const future = compareDates(day, now) > 0;
		const el = createSpan({ cls: `jh-act-cell level-${future ? 0 : level(entries.length)}` });
		el.toggleClass('is-future', future);
		el.toggleClass('is-before', !oldest || compareDates(day, oldest) < 0);
		el.toggleClass('is-today', compareDates(day, now) === 0);
		if (future) return el;

		const label = `${WEEKDAYS_SHORT[uiLanguage][weekdayOf(day)]} ${day.day} ${short(day.month)} ${day.year} · ${
			entries.length ? entries.map((e) => e.keyword || e.name).join(', ') : t('activity.none')
		}`;
		el.setAttr('aria-label', label);
		el.addEventListener('mouseenter', () => status.setText(label));
		if (!entries.length) return el;

		el.addClass('has-entries');
		el.setAttr('role', 'button');
		el.setAttr('tabindex', '0');
		const open = (evt: MouseEvent | KeyboardEvent) => {
			if (entries.length === 1) return this.openEntry(entries[0]!, evt);
			const menu = new Menu();
			for (const e of entries) menu.addItem((item) => item.setTitle(e.keyword || e.name).setIcon('file-text').onClick((ev) => this.openEntry(e, ev)));
			if (evt instanceof MouseEvent) menu.showAtMouseEvent(evt);
			else menu.showAtPosition({ x: el.getBoundingClientRect().left, y: el.getBoundingClientRect().bottom });
		};
		el.addEventListener('click', open);
		el.addEventListener('keydown', (evt) => {
			if (evt.key === 'Enter' || evt.key === ' ') {
				evt.preventDefault();
				open(evt);
			}
		});
		el.addEventListener('focus', () => status.setText(label));
		return el;
	}

	private openEntry(entry: Entry, evt: MouseEvent | KeyboardEvent): void {
		const file = this.app.vault.getFileByPath(entry.path);
		if (file instanceof TFile) void this.app.workspace.getLeaf(Keymap.isModEvent(evt)).openFile(file);
	}

	private rangeLabel(from: DateParts, to: DateParts): string {
		const left = from.year === to.year ? short(from.month) : `${short(from.month)} ${from.year}`;
		return `${left} – ${short(to.month)} ${to.year}`;
	}

	/** Cuántas semanas caben según el ancho del panel, y en qué tamaño. */
	private layout(): { large: boolean; weeks: number; key: string } {
		const width = this.contentEl.clientWidth || 280;
		const large = width >= LARGE_PX;
		const { cell, gap } = large ? SIZES.large : SIZES.compact;
		const padding = large ? 64 : 28;
		const labelCol = large ? 30 : 12;
		const weeks = Math.max(MIN_WEEKS, Math.min(MAX_WEEKS, Math.floor((width - padding - labelCol) / (cell + gap))));
		return { large, weeks, key: `${large}-${weeks}` };
	}
}
