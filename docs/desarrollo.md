# Desarrollo

Notas internas (en español). El README público está en inglés.

```bash
npm install
npm run dev     # compila main.js y lo vuelve a compilar al guardar
npm run build   # revisión de tipos + build de producción
npm run lint    # reglas de eslint-plugin-obsidianmd (las mismas de la revisión del directorio)
npm test        # pruebas (vitest)
npm run vault   # genera las bóvedas de prueba en test-vaults/ (entradas inventadas)
npm run scan -- <bóveda> <arturo|alt> [--paths]   # corre el modelo en solo lectura y muestra conteos
```

Bóvedas de prueba (`test-vaults/`, fuera de git; ver `scripts/make-test-vault.ts`):

| Perfil | Para qué |
|---|---|
| `arturo` | Misma forma que la bóveda real (`03 - JOURNAL/AAAA/MM - month/AAAA-MM-DD - …`), 95 entradas bien acomodadas. Instalar el plugin no debe mover nada. |
| `alt` | `Personal/Diario`, meses en español, nombres `DD-MM-AAAA - …`, campo `fecha`, y casos difíciles (entradas fuera de lugar, notas sin patrón, fecha imposible, nota fuera del journal). |
| `fresh` | Bóveda sin configurar, con una carpeta que parece journal. El plugin no debe crear ni mover nada. |
| `demo` | En inglés, `Journal/YYYY/MM - Month/YYYY-MM-DD - Keyword`, ~170 entradas con rachas: para las capturas del README. |

Los patrones de fecha usan tokens `YYYY`, `YY`, `MMMM` (nombre del mes), `MMM`, `MM`, `M`, `DD`, `D`;
el texto literal va entre corchetes (`[Semana] YYYY`). Código en `src/core/` (sin dependencias de Obsidian).

Cada bóveda trae el plugin instalado como ligas simbólicas a `main.js`, `manifest.json` y `styles.css` del repo.
Se abre en Obsidian con *Abrir carpeta como bóveda* y, la primera vez, aceptando los plugins de la comunidad.

## Capturas del README

Se toman con la bóveda `demo` y Obsidian en inglés, con el CLI de Obsidian activado
(*Ajustes › General › Avanzado*):

1. `npm run vault -- demo`. Si la bóveda no está registrada en Obsidian, se abre desde otra ventana con
   `require('electron').ipcRenderer.sendSync('vault-open', '<ruta absoluta>', false)` (eval del CLI).
2. Idioma: `localStorage.setItem('language', 'en')` y `obsidian-cli vault=demo reload`. Al terminar,
   regresar el valor que tenía (`localStorage.removeItem('language')` si estaba vacío) y recargar.
3. Ventana de 1360 × 860 y `webContents.setBackgroundThrottling(false)`; captura con
   `webContents.capturePage()` (con un límite de tiempo: si la ventana no se pinta, no responde).
4. Reducir a 1600 px de ancho: `sips -Z 1600 docs/images/*.png`.
