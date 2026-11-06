import type { JournalConfig } from '../src/core/model';

/** Configuraciones de ejemplo para scripts y pruebas. La de Arturo es una más, no un valor por omisión. */
export const CONFIGS: Record<string, JournalConfig> = {
	arturo: {
		journalFolder: '03 - JOURNAL',
		folderPattern: 'YYYY/MM - MMMM',
		nameDateFormat: 'YYYY-MM-DD',
		dateField: 'created',
		monthLanguage: 'en',
		monthCase: 'lower',
	},
	alt: {
		journalFolder: 'Personal/Diario',
		folderPattern: 'YYYY/MM - MMMM',
		nameDateFormat: 'DD-MM-YYYY',
		dateField: 'fecha',
		monthLanguage: 'es',
		monthCase: 'lower',
	},
};
