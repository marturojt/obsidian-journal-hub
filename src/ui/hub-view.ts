/**
 * Vista del hub: una pestaña con tres modos (línea de tiempo, lista y calendario) sobre las mismas
 * entradas. Solo muestra nombre, fecha y palabra clave; nunca el texto de las entradas.
 * Todo se dibuja con la API de elementos de Obsidian (sin innerHTML).
 */
import { ItemView, Keymap, SearchComponent, setIcon, TFile, WorkspaceLeaf } from 'obsidian';
import { DateParts, MONTH_NAMES } from '../core/dates';
import { calendarCells, filterEntries, hubStats, monthSeries, WEEKDAY_INITIALS, WEEKDAYS_SHORT, weekdayOf, yearsOf } from '../core/hub';
import type { Entry } from '../core/model';
import { t, uiLanguage } from '../i18n';
import type JournalHubPlugin from '../main';
import type { HubMode } from '../settings';

export const HUB_VIEW = 'journal-hub-view';
const MODE_KEY = 'journal-hub-mode';

const MODES: { mode: HubMode; icon: string; label: () => string }[] = [
	{ mode: 'timeline', icon: 'git-commit-vertical', label: () => t('hub.mode.timeline') },
	{ mode: 'list', icon: 'list', label: () => t('hub.mode.list') },
	{ mode: 'calendar', icon: 'calendar-days', label: () => t('hub.mode.calendar') },
];

/** Ancho por debajo del cual el calendario muestra un mes a la vez (móvil, panel angosto). */
const NARROW_PX = 560;

const pad2 = (n: number) => String(n).padStart(2, '0');
/** Nombre del mes en el idioma de la interfaz: «noviembre» en español, «November» en inglés. */
const monthName = (m: number) => {
	const name = MONTH_NAMES[uiLanguage][m - 1]!;
	return uiLanguage === 'en' ? name.charAt(0).toUpperCase() + name.slice(1) : name;
};
const today = (): DateParts => {
	const d = new Date();
	return { year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate() };
};

function formatLong(d: DateParts): string {
	return uiLanguage === 'es' ? `${d.day} de ${monthName(d.month)} de ${d.year}` : `${monthName(d.month)} ${d.day}, ${d.year}`;
}

export class HubView extends ItemView {
	private query = '';
	private statsEl!: HTMLElement;
	private bodyEl!: HTMLElement;
	private modeButtons = new Map<HubMode, HTMLButtonElement>();

	// Línea de tiempo: qué años y meses están abiertos (se inicializa con lo más reciente).
	private openYears = new Set<number>();
	private openMonths = new Set<string>();
	private timelineReady = false;
	// Lista: filtro por año o por mes.
	private listYear: number | null = null;
	private listMonth: { year: number; month: number } | null = null;
	// Calendario: año, mes y día elegidos.
	private calYear: number | null = null;
	private calMonth: number | null = null;
	private calDay: number | null = null;

	constructor(
		leaf: WorkspaceLeaf,
		private plugin: JournalHubPlugin,
	) {
		super(leaf);
	}

	getViewType(): string {
		return HUB_VIEW;
	}

	getDisplayText(): string {
		return t('hub.tab');
	}

	getIcon(): string {
		return 'book-open-text';
	}

	async onOpen(): Promise<void> {
		const root = this.contentEl;
		root.empty();
		root.addClass('jh-hub');
		const wrap = root.createDiv({ cls: 'jh-wrap' });

		const header = wrap.createDiv({ cls: 'jh-header' });
		const titles = header.createDiv({ cls: 'jh-titles' });
		titles.createEl('h1', { cls: 'jh-title', text: t('hub.title') });
		this.statsEl = titles.createEl('p', { cls: 'jh-stats' });
		const actions = header.createDiv({ cls: 'jh-actions' });
		actions.createEl('button', { text: t('hub.file') }).addEventListener('click', () => this.plugin.openFileModal());
		const newBtn = actions.createEl('button', { cls: 'mod-cta' });
		setIcon(newBtn.createSpan({ cls: 'jh-btn-icon' }), 'plus');
		newBtn.createSpan({ text: t('hub.new') });
		newBtn.addEventListener('click', () => this.plugin.newEntry());

		const tools = wrap.createDiv({ cls: 'jh-tools' });
		const modes = tools.createDiv({ cls: 'jh-modes', attr: { role: 'group' } });
		for (const m of MODES) {
			const b = modes.createEl('button', { cls: 'jh-mode', attr: { 'aria-label': m.label(), 'aria-pressed': 'false' } });
			setIcon(b.createSpan({ cls: 'jh-btn-icon' }), m.icon);
			b.createSpan({ cls: 'jh-mode-label', text: m.label() });
			b.addEventListener('click', () => this.setMode(m.mode));
			this.modeButtons.set(m.mode, b);
		}
		const search = new SearchComponent(tools.createDiv({ cls: 'jh-search' }));
		search.setPlaceholder(t('hub.search')).onChange((value) => {
			this.query = value;
			this.renderBody();
		});

		this.bodyEl = wrap.createDiv({ cls: 'jh-body' });
		this.refresh();
	}

	async onClose(): Promise<void> {
		this.contentEl.empty();
	}

	/**
	 * Último modo usado. Se guarda en el almacenamiento local de Obsidian (por bóveda y por
	 * dispositivo), no en data.json: cambiar de modo no toca archivos de la bóveda ni genera commits
	 * en bóvedas sincronizadas con git.
	 */
	private get mode(): HubMode {
		const saved: unknown = this.app.loadLocalStorage(MODE_KEY);
		return MODES.some((m) => m.mode === saved) ? (saved as HubMode) : 'timeline';
	}

	private setMode(mode: HubMode): void {
		if (this.mode === mode) return;
		this.app.saveLocalStorage(MODE_KEY, mode);
		this.renderBody();
	}

	/** Lo llama el plugin cuando cambian las entradas (crear, renombrar, borrar, propiedades). */
	refresh(): void {
		if (!this.bodyEl) return;
		this.renderBody();
	}

	private renderBody(): void {
		const mode = this.mode;
		for (const [m, b] of this.modeButtons) {
			b.toggleClass('is-active', m === mode);
			b.setAttr('aria-pressed', String(m === mode));
		}
		const body = this.bodyEl;
		body.empty();
		this.statsEl.setText('');

		const data = this.plugin.hubData();
		if (data.state === 'unconfigured') {
			body.createEl('p', { cls: 'jh-empty', text: t('hub.notConfigured') });
			body.createEl('button', { cls: 'mod-cta', text: t('hub.chooseFolder') }).addEventListener('click', () => this.plugin.openWelcome());
			return;
		}
		if (data.state === 'missing') {
			body.createEl('p', { cls: 'jh-empty', text: t('hub.folderMissing', { folder: data.folder }) });
			body.createEl('button', { text: t('hub.openSettings') }).addEventListener('click', () => this.plugin.openSettings());
			return;
		}

		const all = data.entries;
		const stats = hubStats(all);
		this.statsEl.setText(stats.last ? t('hub.stats', { total: stats.total, months: stats.months, last: formatLong(stats.last) }) : t('hub.statsEmpty'));
		if (!all.length && !data.unmatched.length) {
			body.createEl('p', { cls: 'jh-empty', text: t('hub.empty') });
			return;
		}

		const shown = filterEntries(all, this.query);
		if (this.query.trim() && !shown.length) body.createEl('p', { cls: 'jh-empty', text: t('hub.noResults', { query: this.query.trim() }) });

		if (mode === 'timeline') this.renderTimeline(body, shown);
		else if (mode === 'list') this.renderList(body, all, shown);
		else this.renderCalendar(body, all, shown);

		this.renderUnmatched(body, data.unmatched, data.folder);
	}

	// ── Línea de tiempo ────────────────────────────────────────────────────────────────

	private renderTimeline(body: HTMLElement, entries: Entry[]): void {
		const searching = Boolean(this.query.trim());
		const years = this.groupDesc(entries);
		if (!this.timelineReady && years.length) {
			const latest = years[0]!;
			this.openYears.add(latest.year);
			for (const m of latest.months.slice(0, 2)) this.openMonths.add(`${latest.year}-${m.month}`);
			this.timelineReady = true;
		}
		const line = body.createDiv({ cls: 'jh-timeline' });
		for (const y of years) {
			const yOpen = searching || this.openYears.has(y.year);
			const section = line.createDiv({ cls: 'jh-tl-year' });
			const head = section.createEl('button', { cls: 'jh-tl-year-head', attr: { 'aria-expanded': String(yOpen) } });
			head.createSpan({ cls: 'jh-tl-dot' });
			this.chevron(head, yOpen);
			head.createSpan({ cls: 'jh-tl-year-label', text: String(y.year) });
			head.createSpan({ cls: 'jh-pill', text: String(y.count) });
			head.addEventListener('click', () => {
				this.toggle(this.openYears, y.year);
				this.renderBody();
			});
			if (!yOpen) continue;
			for (const m of y.months) {
				const key = `${y.year}-${m.month}`;
				const mOpen = searching || this.openMonths.has(key);
				const month = section.createDiv({ cls: 'jh-tl-month' });
				const mHead = month.createEl('button', { cls: 'jh-tl-month-head', attr: { 'aria-expanded': String(mOpen) } });
				mHead.createSpan({ cls: 'jh-tl-month-dot' });
				this.chevron(mHead, mOpen);
				mHead.createSpan({ cls: 'jh-tl-month-label', text: monthName(m.month) });
				mHead.createSpan({ cls: 'jh-count', text: String(m.entries.length) });
				mHead.addEventListener('click', () => {
					this.toggle(this.openMonths, key);
					this.renderBody();
				});
				if (mOpen) this.entryList(month, m.entries, 'jh-tl-entries');
			}
		}
	}

	// ── Lista ──────────────────────────────────────────────────────────────────────────

	private renderList(body: HTMLElement, all: Entry[], matching: Entry[]): void {
		const bar = body.createDiv({ cls: 'jh-list-top' });

		const chips = bar.createDiv({ cls: 'jh-chips' });
		for (const year of yearsOf(all)) {
			const on = this.listYear === year;
			const chip = chips.createEl('button', { cls: 'jh-chip', attr: { 'aria-pressed': String(on) } });
			chip.toggleClass('is-active', on);
			chip.createSpan({ text: String(year) });
			chip.createSpan({ cls: 'jh-count', text: String(matching.filter((e) => e.date.year === year).length) });
			chip.addEventListener('click', () => {
				this.listYear = on ? null : year;
				this.listMonth = null;
				this.renderBody();
			});
		}

		const series = monthSeries(all, today());
		const counts = new Map<string, number>();
		for (const e of matching) counts.set(`${e.date.year}-${e.date.month}`, (counts.get(`${e.date.year}-${e.date.month}`) ?? 0) + 1);
		const max = Math.max(1, ...counts.values());
		const histo = bar.createDiv({ cls: 'jh-histo' });
		const bars = histo.createDiv({ cls: 'jh-bars' });
		const ticks = histo.createDiv({ cls: 'jh-ticks' });
		for (const s of series) {
			const n = counts.get(`${s.year}-${s.month}`) ?? 0;
			const on = this.listMonth?.year === s.year && this.listMonth.month === s.month;
			const dim = (this.listYear !== null && this.listYear !== s.year) || (this.listMonth !== null && !on);
			const b = bars.createEl('button', {
				cls: 'jh-bar',
				attr: { 'aria-label': `${monthName(s.month)} ${s.year}: ${n}`, 'aria-pressed': String(on) },
			});
			const fill = b.createSpan({ cls: 'jh-bar-fill' });
			fill.setCssProps({ '--jh-bar-height': n ? `${Math.max(12, Math.round((n / max) * 100))}%` : '3px' });
			fill.toggleClass('is-empty', n === 0);
			b.toggleClass('is-active', on);
			b.toggleClass('is-dim', dim);
			b.addEventListener('click', () => {
				this.listMonth = on ? null : { year: s.year, month: s.month };
				this.listYear = null;
				this.renderBody();
			});
			ticks.createSpan({ text: s.month === 1 || s === series[0] ? String(s.year) : monthName(s.month).charAt(0).toUpperCase() });
		}

		const rows = matching.filter(
			(e) =>
				(this.listYear === null || e.date.year === this.listYear) &&
				(this.listMonth === null || (e.date.year === this.listMonth.year && e.date.month === this.listMonth.month)),
		);
		let hint = t('hub.list.filter', { shown: rows.length, total: all.length });
		if (this.listMonth) hint += ` · ${monthName(this.listMonth.month)} ${this.listMonth.year} (${t('hub.list.clear')})`;
		else if (this.listYear !== null) hint += ` · ${this.listYear}`;
		else hint += ` · ${t('hub.list.hint')}`;
		histo.createEl('p', { cls: 'jh-hint', text: hint });

		const list = body.createDiv({ cls: 'jh-list' });
		for (const y of this.groupDesc(rows)) {
			for (const m of y.months) {
				const group = list.createEl('section', { cls: 'jh-list-group' });
				const h = group.createEl('h2', { cls: 'jh-list-head' });
				h.createSpan({ text: `${monthName(m.month)} ${y.year}` });
				h.createSpan({ cls: 'jh-count', text: String(m.entries.length) });
				this.entryList(group, m.entries, 'jh-list-entries');
			}
		}
	}

	// ── Calendario ─────────────────────────────────────────────────────────────────────

	private renderCalendar(body: HTMLElement, all: Entry[], matching: Entry[]): void {
		const now = today();
		const years = yearsOf(all);
		const minYear = Math.min(...years, now.year);
		const maxYear = Math.max(...years, now.year);
		if (this.calYear === null) this.calYear = years[0] ?? now.year;
		const year = this.calYear;
		const inYear = all.filter((e) => e.date.year === year);
		if (this.calMonth === null) this.calMonth = inYear.length ? Math.max(...inYear.map((e) => e.date.month)) : now.month;
		const searching = Boolean(this.query.trim());
		const hits = new Set(matching.map((e) => e.path));
		const narrow = this.contentEl.clientWidth > 0 && this.contentEl.clientWidth < NARROW_PX;

		const nav = body.createDiv({ cls: 'jh-cal-nav' });
		const prev = nav.createEl('button', { cls: 'clickable-icon', attr: { 'aria-label': narrow ? t('hub.cal.prevMonth') : t('hub.cal.prevYear') } });
		setIcon(prev, 'chevron-left');
		nav.createEl('h2', { cls: 'jh-cal-year', text: narrow ? `${monthName(this.calMonth)} ${year}` : String(year) });
		const next = nav.createEl('button', { cls: 'clickable-icon', attr: { 'aria-label': narrow ? t('hub.cal.nextMonth') : t('hub.cal.nextYear') } });
		setIcon(next, 'chevron-right');
		nav.createSpan({ cls: 'jh-hint', text: t('hub.cal.yearCount', { count: inYear.length }) });
		if (narrow) {
			const atStart = year === minYear && this.calMonth === 1;
			const atEnd = year === maxYear && this.calMonth === 12;
			prev.disabled = atStart;
			next.disabled = atEnd;
			prev.addEventListener('click', () => this.shiftMonth(-1));
			next.addEventListener('click', () => this.shiftMonth(1));
		} else {
			prev.disabled = year <= minYear;
			next.disabled = year >= maxYear;
			prev.addEventListener('click', () => this.shiftYear(-1, all));
			next.addEventListener('click', () => this.shiftYear(1, all));
		}

		const layout = body.createDiv({ cls: 'jh-cal' });
		const grid = layout.createDiv({ cls: 'jh-cal-grid' });
		grid.toggleClass('is-narrow', narrow);
		const months = narrow ? [this.calMonth] : Array.from({ length: 12 }, (_, i) => i + 1);
		for (const m of months) {
			const entries = inYear.filter((e) => e.date.month === m);
			const box = grid.createEl('section', { cls: 'jh-cal-month' });
			box.toggleClass('is-active', m === this.calMonth);
			const head = box.createDiv({ cls: 'jh-cal-month-head' });
			head.createEl('h3', { text: monthName(m) });
			head.createSpan({ cls: 'jh-count', text: entries.length ? String(entries.length) : '—' });
			const days = box.createDiv({ cls: 'jh-cal-days' });
			for (const initial of WEEKDAY_INITIALS[uiLanguage]) days.createSpan({ cls: 'jh-cal-wd', text: initial });
			for (const day of calendarCells(year, m)) {
				if (day === null) {
					days.createSpan();
					continue;
				}
				const list = entries.filter((e) => e.date.day === day);
				const isToday = year === now.year && m === now.month && day === now.day;
				if (!list.length) {
					const cell = days.createSpan({ cls: 'jh-cal-day', text: String(day) });
					cell.toggleClass('is-today', isToday);
					continue;
				}
				const cell = days.createEl('button', {
					cls: 'jh-cal-day has-entries',
					text: String(day),
					attr: { 'aria-label': `${formatLong({ year, month: m, day })}: ${list.map((e) => e.keyword || e.name).join(', ')}` },
				});
				cell.toggleClass('has-many', list.length > 1);
				cell.toggleClass('is-today', isToday);
				cell.toggleClass('is-selected', m === this.calMonth && day === this.calDay);
				const hit = list.some((e) => hits.has(e.path));
				cell.toggleClass('is-hit', searching && hit);
				cell.toggleClass('is-dim', searching && !hit);
				cell.addEventListener('click', () => {
					this.calMonth = m;
					this.calDay = day;
					this.renderBody();
				});
			}
		}

		const panel = layout.createEl('aside', { cls: 'jh-cal-panel' });
		panel.createEl('h2', { text: `${monthName(this.calMonth)} ${year}` });
		const monthEntries = inYear.filter((e) => e.date.month === this.calMonth).sort((a, b) => a.date.day - b.date.day);
		if (!monthEntries.length) panel.createEl('p', { cls: 'jh-empty', text: t('hub.cal.monthEmpty') });
		const ul = this.entryList(panel, monthEntries, 'jh-cal-entries');
		ul.querySelectorAll<HTMLElement>('[data-day]').forEach((li) => li.toggleClass('is-selected', li.dataset.day === String(this.calDay)));
	}

	private shiftYear(delta: number, all: Entry[]): void {
		this.calYear = (this.calYear ?? today().year) + delta;
		const inYear = all.filter((e) => e.date.year === this.calYear);
		this.calMonth = inYear.length ? Math.max(...inYear.map((e) => e.date.month)) : 1;
		this.calDay = null;
		this.renderBody();
	}

	private shiftMonth(delta: number): void {
		let m = (this.calMonth ?? 1) + delta;
		let y = this.calYear ?? today().year;
		if (m < 1) {
			m = 12;
			y--;
		} else if (m > 12) {
			m = 1;
			y++;
		}
		this.calYear = y;
		this.calMonth = m;
		this.calDay = null;
		this.renderBody();
	}

	// ── Piezas comunes ─────────────────────────────────────────────────────────────────

	private renderUnmatched(body: HTMLElement, paths: string[], folder: string): void {
		if (!paths.length) return;
		const box = body.createEl('section', { cls: 'jh-unmatched' });
		box.createEl('h2', { text: t('hub.unmatched', { count: paths.length }) });
		box.createEl('p', { cls: 'jh-hint', text: t('hub.unmatchedDesc') });
		const row = box.createDiv({ cls: 'jh-unmatched-list' });
		const prefix = folder ? `${folder}/` : '';
		for (const path of paths) {
			const label = (path.startsWith(prefix) ? path.slice(prefix.length) : path).replace(/\.md$/i, '');
			this.link(row.createEl('a', { cls: 'jh-chip', text: label, href: '#' }), path);
		}
	}

	/** Lista de entradas: día, día de la semana y palabra clave. Devuelve el `<ul>`. */
	private entryList(parent: HTMLElement, entries: Entry[], cls: string): HTMLElement {
		const ul = parent.createEl('ul', { cls: `jh-entries ${cls}` });
		for (const e of entries) {
			const li = ul.createEl('li', { attr: { 'data-day': String(e.date.day) } });
			const a = li.createEl('a', { cls: 'jh-entry', href: '#' });
			a.createSpan({ cls: 'jh-entry-day', text: pad2(e.date.day) });
			a.createSpan({ cls: 'jh-entry-wd', text: WEEKDAYS_SHORT[uiLanguage][weekdayOf(e.date)]! });
			a.createSpan({ cls: 'jh-entry-kw', text: e.keyword || e.name });
			this.link(a, e.path);
		}
		return ul;
	}

	/** Abre la nota al hacer clic (Ctrl/Cmd: en otra pestaña) y muestra la vista previa al pasar el ratón. */
	private link(el: HTMLElement, path: string): void {
		el.addEventListener('click', (evt) => {
			evt.preventDefault();
			const file = this.app.vault.getFileByPath(path);
			if (file instanceof TFile) void this.app.workspace.getLeaf(Keymap.isModEvent(evt)).openFile(file);
		});
		el.addEventListener('mouseover', (event) => {
			this.app.workspace.trigger('hover-link', { event, source: HUB_VIEW, hoverParent: this, targetEl: el, linktext: path });
		});
	}

	private chevron(parent: HTMLElement, open: boolean): void {
		const c = parent.createSpan({ cls: 'jh-chevron' });
		setIcon(c, 'chevron-right');
		c.toggleClass('is-open', open);
	}

	private toggle<T>(set: Set<T>, value: T): void {
		if (set.has(value)) set.delete(value);
		else set.add(value);
	}

	/** Año → mes → entradas, de lo más reciente a lo más viejo. */
	private groupDesc(entries: Entry[]): { year: number; count: number; months: { month: number; entries: Entry[] }[] }[] {
		const sorted = [...entries].sort((a, b) => b.date.year - a.date.year || b.date.month - a.date.month || b.date.day - a.date.day || b.name.localeCompare(a.name));
		const years: { year: number; count: number; months: { month: number; entries: Entry[] }[] }[] = [];
		for (const e of sorted) {
			let y = years[years.length - 1];
			if (!y || y.year !== e.date.year) years.push((y = { year: e.date.year, count: 0, months: [] }));
			let m = y.months[y.months.length - 1];
			if (!m || m.month !== e.date.month) y.months.push((m = { month: e.date.month, entries: [] }));
			m.entries.push(e);
			y.count++;
		}
		return years;
	}
}
