/** `npm run vault [-- perfil…]`: genera las bóvedas de prueba (ver make-test-vault.ts). */
import { makeVault, profileFiles, PROFILES, type Profile } from './make-test-vault';

const asked = process.argv.slice(2).filter((a) => a !== '--');
const unknown = asked.filter((p) => !(PROFILES as readonly string[]).includes(p));
if (unknown.length) {
	console.error(`Perfil desconocido: ${unknown.join(', ')}. Opciones: ${PROFILES.join(', ')}`);
	process.exit(1);
}
for (const p of (asked.length ? asked : PROFILES) as Profile[]) {
	const vault = makeVault(p);
	console.log(`${p.padEnd(7)} → ${vault} (${profileFiles(p).size} notas)`);
}
