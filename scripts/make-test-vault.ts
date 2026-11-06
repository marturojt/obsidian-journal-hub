/**
 * Genera bóvedas de prueba con entradas INVENTADAS (nada de la bóveda real).
 *
 *   npm run vault [-- perfil…]     (sin perfiles = todos; la línea de comandos está en scripts/vault.ts)
 *
 * Perfiles (en test-vaults/<perfil>/):
 *   arturo  Imita la forma de la bóveda de Arturo: `03 - JOURNAL/AAAA/MM - month/AAAA-MM-DD - Palabra.md`,
 *           todas bien acomodadas y con los espacios que dejaba Templater. Sirve para comprobar que
 *           instalar el plugin no mueve ni cambia nada.
 *   alt     Otra configuración: `Personal/Diario/AAAA/MM - mes en español/DD-MM-AAAA - Palabra.md`,
 *           campo de fecha `fecha`, y casos difíciles (entradas fuera de lugar, notas sin patrón…).
 *   fresh   Bóveda recién instalada: hay una carpeta que parece journal, pero sin nada configurado.
 *   demo    En inglés, con actividad reciente, para las capturas del README:
 *           `Journal/YYYY/MM - MMMM/YYYY-MM-DD - Keyword.md`.
 *
 * Volver a correrlo regenera las notas y conserva `.obsidian/` (ajustes y estado de Obsidian).
 * Solo borra carpetas que tengan la marca `.journal-hub-test-vault`.
 */
import { existsSync, mkdirSync, readdirSync, rmSync, symlinkSync, writeFileSync, lstatSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const PROFILES = ['arturo', 'alt', 'fresh', 'demo'] as const;
export type Profile = (typeof PROFILES)[number];

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const VAULTS_DIR = join(REPO, 'test-vaults');
const MARKER = '.journal-hub-test-vault';
const PLUGIN_ID = 'journal-hub';
const PLUGIN_FILES = ['main.js', 'manifest.json', 'styles.css'];

const MONTHS_EN = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
const MONTHS_ES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

const KEYWORDS = [
	'Caminata', 'Lluvia', 'Planes', 'Lectura', 'Café', 'Mudanza', 'Reunión', 'Domingo', 'Ideas',
	'Cansancio', 'Viaje corto', 'Cocina', 'Música', 'Ejercicio', 'Pendientes', 'Calma', 'Bicicleta',
	'Jardín', 'Película', 'Aprendizaje', 'Proyecto nuevo', 'Tarde tranquila', 'Mercado', 'Insomnio',
	'Llamada', 'Orden', 'Paseo', 'Cumpleaños', 'Taller', 'Lista', 'Montaña', 'Playa', 'Despedida',
	'Retos', 'Rutina', 'Notas sueltas', 'Concierto', 'Mañana fría', 'Balance', 'Hábitos',
];

const SENTENCES = [
	'Hoy fue un día normal, sin grandes sorpresas.',
	'Salí a caminar un rato por la tarde.',
	'Quiero retomar la lectura que dejé pendiente.',
	'Anoto esto para acordarme después.',
	'El clima estuvo cambiante todo el día.',
	'Terminé dos pendientes que llevaban semanas.',
	'Mañana toca organizar la semana.',
];

/** PRNG determinista (mulberry32): mismas bóvedas en cada corrida. */
function rng(seed: number) {
	let a = seed >>> 0;
	return () => {
		a = (a + 0x6d2b79f5) >>> 0;
		let t = a;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

const pad = (n: number) => String(n).padStart(2, '0');
const iso = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;

interface FakeEntry {
	date: Date;
	keyword: string;
}

/** Fechas entre `from` y `to` (inclusive), con meses vacíos y a veces varias entradas el mismo día. */
function fakeEntries(seed: number, from: string, to: string, count: number, skipMonths: string[]): FakeEntry[] {
	const rand = rng(seed);
	const start = Date.parse(from);
	const end = Date.parse(to);
	const out: FakeEntry[] = [];
	while (out.length < count) {
		const date = new Date(start + Math.floor(rand() * ((end - start) / 86400000 + 1)) * 86400000);
		if (skipMonths.includes(iso(date).slice(0, 7))) continue;
		const keyword = KEYWORDS[Math.floor(rand() * KEYWORDS.length)]!;
		out.push({ date, keyword });
		// ~1 de cada 12: otra entrada el mismo día
		if (rand() < 0.08 && out.length < count) {
			out.push({ date, keyword: KEYWORDS[Math.floor(rand() * KEYWORDS.length)]! });
		}
	}
	// Nombres únicos: mismo día y misma palabra → se agrega un número
	const seen = new Map<string, number>();
	for (const e of out) {
		const k = `${iso(e.date)} ${e.keyword}`;
		const n = (seen.get(k) ?? 0) + 1;
		seen.set(k, n);
		if (n > 1) e.keyword = `${e.keyword} ${n}`;
	}
	return out.sort((a, b) => a.date.getTime() - b.date.getTime());
}

function body(seed: number): string {
	const rand = rng(seed);
	const n = 1 + Math.floor(rand() * 3);
	return Array.from({ length: n }, () => SENTENCES[Math.floor(rand() * SENTENCES.length)]).join('\n\n');
}

/** Entrada con la forma que dejaba Templater en la bóveda de Arturo (espacios al final incluidos). */
function arturoEntry(e: FakeEntry, i: number): string {
	const d = iso(e.date);
	return [
		'---',
		'  ',
		`title: ${d} - ${e.keyword} `,
		`created: ${d} `,
		'kind: Daily Journal ',
		'---',
		`# ${e.keyword} `,
		'',
		body(i),
		'',
		'',
		'---',
		'# Tags:',
		'',
		'#dailyNote #journal #journal/dailyNote ',
	].join('\n');
}

function altEntry(e: FakeEntry, i: number): string {
	return ['---', `fecha: ${iso(e.date)}`, 'tipo: diario', '---', `# ${e.keyword}`, '', body(i), ''].join('\n');
}

/** Nombre `DD-MM-AAAA - Palabra` del perfil alt. */
function altName(e: FakeEntry): string {
	const d = e.date;
	return `${pad(d.getUTCDate())}-${pad(d.getUTCMonth() + 1)}-${d.getUTCFullYear()} - ${e.keyword}.md`;
}

type Files = Map<string, string>;

function profileArturo(): Files {
	const files: Files = new Map();
	for (const dir of ['00 - INBOX', '01 - PROJECTS', '02 - AREAS', '04 - RESOURCES', '05 - ARCHIVE']) {
		files.set(`${dir}/Nota de ejemplo.md`, `# Nota de ejemplo\n\nNota que no es del journal; el plugin no debe tocarla.\n`);
	}
	files.set('✱ Inicio.md', '# Inicio\n\nNota de inicio de ejemplo.\n');
	const entries = fakeEntries(2024, '2024-10-01', '2026-08-31', 95, ['2025-03', '2026-01', '2026-05', '2026-06', '2026-07']);
	entries.forEach((e, i) => {
		const d = iso(e.date);
		const month = e.date.getUTCMonth();
		files.set(`03 - JOURNAL/${d.slice(0, 4)}/${pad(month + 1)} - ${MONTHS_EN[month]}/${d} - ${e.keyword}.md`, arturoEntry(e, i));
	});
	return files;
}

function profileAlt(): Files {
	const files: Files = new Map();
	const root = 'Personal/Diario';
	const entries = fakeEntries(7, '2025-01-01', '2026-10-31', 40, []);
	// Las últimas 5 quedan "fuera de lugar" para probar el acomodo.
	const placed = entries.slice(0, -5);
	const misplaced = entries.slice(-5);
	placed.forEach((e, i) => {
		const month = e.date.getUTCMonth();
		files.set(`${root}/${e.date.getUTCFullYear()}/${pad(month + 1)} - ${MONTHS_ES[month]}/${altName(e)}`, altEntry(e, i));
	});
	misplaced.forEach((e, i) => {
		const where = [
			root, // en la raíz del journal
			root, // otra en la raíz
			`${root}/2025/01 - enero`, // en un mes equivocado
			`${root}/Sueltas`, // en una subcarpeta cualquiera
			`${root}/2024`, // en un año sin carpeta de mes
		][i]!;
		files.set(`${where}/${altName(e)}`, altEntry(e, 100 + i));
	});
	// Casos que nunca deben moverse ni perderse
	files.set(`${root}/Ideas para escribir.md`, '# Ideas\n\nNota sin fecha en el nombre: se lista aparte.\n');
	files.set(`${root}/2025/Resumen del año.md`, '# Resumen\n\nNota sin patrón dentro de una carpeta de año.\n');
	files.set(`${root}/31-02-2025 - Fecha imposible.md`, altEntry({ date: new Date(Date.UTC(2025, 1, 28)), keyword: 'Fecha imposible' }, 200));
	files.set('Trabajo/15-03-2025 - Fuera del journal.md', altEntry({ date: new Date(Date.UTC(2025, 2, 15)), keyword: 'Fuera del journal' }, 201));
	files.set('Personal/Diario.md', '# Diario\n\nNota con el mismo nombre que la carpeta, fuera de ella.\n');
	return files;
}

function profileFresh(): Files {
	const files: Files = new Map();
	files.set('Bienvenida.md', '# Bóveda nueva\n\nSin nada configurado: el plugin no debe crear ni mover nada.\n');
	files.set('Recetas/Pan.md', '# Pan\n\nHarina, agua, sal.\n');
	// Una carpeta que "parece" journal, sin organizar, para la sugerencia de la primera vez
	fakeEntries(99, '2026-01-01', '2026-10-31', 12, []).forEach((e, i) => {
		files.set(`Diario/${iso(e.date)}.md`, `# ${e.keyword}\n\n${body(300 + i)}\n`);
	});
	return files;
}

const DEMO_KEYWORDS = [
	'Morning run', 'Rainy day', 'Planning the week', 'Book notes', 'Coffee with Sam', 'Moving boxes', 'Team retro',
	'Quiet Sunday', 'New ideas', 'Tired but okay', 'Short trip', 'Cooking night', 'Concert', 'Garden', 'Long walk',
	'First snow', 'Market day', 'Gratitude', 'Learning Spanish', 'Bike ride', 'Deep work', 'Family dinner',
];
const DEMO_SENTENCES = [
	'Woke up early and went for a walk before work.',
	'Spent most of the afternoon reading.',
	'Small wins today: finished two things that were pending for weeks.',
	'The weather changed three times.',
	'Writing this down so I remember it later.',
	'Tomorrow I want to plan the week properly.',
];
const MONTHS_EN_CAP = MONTHS_EN.map((m) => m.charAt(0).toUpperCase() + m.slice(1));

function profileDemo(): Files {
	const files: Files = new Map();
	files.set('Home.md', '# Home\n\nAn example vault for Journal Hub screenshots. Every entry is invented.\n');
	files.set('Projects/Garden plan.md', '# Garden plan\n\nNot a journal entry.\n');
	files.set('Journal/Ideas to write about.md', '# Ideas\n\nNo date in the name: listed apart.\n');
	const rand = rng(2026);
	const start = Date.UTC(2025, 8, 1);
	const end = Date.UTC(2026, 10, 6);
	let streak = 0;
	for (let t = start, i = 0; t <= end; t += 86400000, i++) {
		const date = new Date(t);
		// Rachas: si ayer se escribió, es más probable escribir hoy.
		const p = streak ? 0.62 : 0.22;
		if (rand() > p && t !== end) {
			streak = 0;
			continue;
		}
		streak++;
		const n = rand() < 0.12 ? 2 : 1;
		for (let k = 0; k < n; k++) {
			let keyword = DEMO_KEYWORDS[Math.floor(rand() * DEMO_KEYWORDS.length)]!;
			const d = iso(date);
			const month = date.getUTCMonth();
			const folder = `Journal/${d.slice(0, 4)}/${pad(month + 1)} - ${MONTHS_EN_CAP[month]}`;
			if (files.has(`${folder}/${d} - ${keyword}.md`)) keyword = `${keyword} again`;
			const body = Array.from({ length: 1 + Math.floor(rand() * 3) }, () => DEMO_SENTENCES[Math.floor(rand() * DEMO_SENTENCES.length)]).join('\n\n');
			files.set(`${folder}/${d} - ${keyword}.md`, ['---', `created: ${d}`, 'tags: [journal]', '---', `# ${keyword}`, '', body, ''].join('\n'));
		}
		void i;
	}
	return files;
}

export function profileFiles(profile: Profile): Files {
	return { arturo: profileArturo, alt: profileAlt, fresh: profileFresh, demo: profileDemo }[profile]();
}

/** Crea (o regenera) la bóveda del perfil. Devuelve su ruta. */
export function makeVault(profile: Profile, baseDir = VAULTS_DIR): string {
	const vault = join(baseDir, profile);
	if (existsSync(vault)) {
		if (!existsSync(join(vault, MARKER))) {
			throw new Error(`${vault} existe pero no es una bóveda de prueba generada (falta ${MARKER}); no la toco.`);
		}
		for (const name of readdirSync(vault)) {
			if (name !== '.obsidian') rmSync(join(vault, name), { recursive: true, force: true });
		}
	}
	mkdirSync(vault, { recursive: true });
	writeFileSync(join(vault, MARKER), 'Bóveda de prueba generada por scripts/make-test-vault.ts. Entradas inventadas.\n');

	for (const [path, content] of profileFiles(profile)) {
		const full = join(vault, path);
		mkdirSync(dirname(full), { recursive: true });
		writeFileSync(full, content.endsWith('\n') ? content : `${content}\n`);
	}

	// Plugin instalado como ligas simbólicas al build del repo (npm run dev lo mantiene al día).
	const pluginDir = join(vault, '.obsidian', 'plugins', PLUGIN_ID);
	mkdirSync(pluginDir, { recursive: true });
	for (const f of PLUGIN_FILES) {
		const link = join(pluginDir, f);
		if (isLink(link)) continue;
		symlinkSync(join(REPO, f), link);
	}
	const cp = join(vault, '.obsidian', 'community-plugins.json');
	if (!existsSync(cp)) writeFileSync(cp, JSON.stringify([PLUGIN_ID], null, 2));
	return vault;
}

function isLink(p: string): boolean {
	try {
		return lstatSync(p).isSymbolicLink();
	} catch {
		return false;
	}
}
