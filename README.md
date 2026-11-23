# Registro de migraña

App web para el móvil (PWA) que lleva la cuenta de la medicación para la migraña:

- **Cuántas tomas quedan** de cada medicamento en el periodo (p. ej. 6 de 10 triptanes).
- **Cuándo se puede tomar la siguiente** si se ha llegado al límite, o si hay que esperar unas horas entre tomas.
- **Historial** en calendario, con intensidad del dolor y notas opcionales; se puede corregir o borrar cualquier toma.
- **Exportar para el médico** (CSV que abre Excel) y **copia de seguridad** (JSON) para no perder los datos.
- Funciona **sin conexión** y los datos **se quedan solo en el móvil** (no hay servidor ni cuentas).

## Qué se puede configurar por medicamento

| Ajuste | Opciones |
|---|---|
| Límite | número máximo (p. ej. 10) |
| Qué se cuenta | cada toma, o días con toma (varias el mismo día cuentan como 1) |
| Periodo | últimos 30 días (móvil) o mes natural (se reinicia el día 1) |
| Máx. en 24 h | opcional |
| Horas mínimas entre tomas | opcional |

La configuración inicial de medicamentos está en la función `seed()` de `index.html` y solo se aplica
la primera vez que se abre la app en un móvil. Después se cambia desde **Ajustes**.
Los periodos de «30 días móviles» son la opción más prudente frente al mes natural.

## Publicarla gratis con GitHub Pages

1. Crea un repositorio en GitHub (por ejemplo `registro-migrana`) y sube estos archivos a la rama `main`.
   El repositorio puede ser público: solo contiene el código, los datos de las tomas nunca salen del móvil.
2. En el repositorio: **Settings → Pages → Build and deployment → Source: Deploy from a branch**,
   rama `main`, carpeta `/ (root)` → **Save**.
3. En un par de minutos estará en `https://TU-USUARIO.github.io/registro-migrana/`.

## Instalarla en el móvil

- **Android (Chrome):** abre la dirección → menú ⋮ → **Instalar aplicación** (o «Añadir a pantalla de inicio»).
- **iPhone (Safari):** abre la dirección → botón Compartir → **Añadir a pantalla de inicio**.
  Usa siempre el icono de la pantalla de inicio: en iPhone, los datos de la app instalada son distintos de los de Safari.

Después funciona sin internet.

## Copias de seguridad

Los datos viven en el almacenamiento del navegador del móvil. Si se borran los datos del navegador,
se desinstala la app o se cambia de teléfono, se pierden. En **Ajustes → Guardar copia de seguridad**
se descarga un archivo `.json`; para recuperarlo: **Ajustes → Restaurar una copia**.
La app avisa en «Hoy» si pasan más de 30 días sin copia.

## Desarrollo

- `logic.js`: cálculo de límites (sin DOM). `index.html`: interfaz. `sw.js`: funcionamiento sin conexión.
- Probar en local: `python -m http.server 8000` y abrir `http://localhost:8000`.
- Pruebas de la lógica: `node --test tests/logic.test.js`
- Al publicar cambios, el móvil los recibe la segunda vez que abre la app con conexión.
  Si cambias la lista de archivos, sube también la versión de `CACHE` en `sw.js`.

## Aviso

La app solo lleva la cuenta de lo que se registra. No sustituye las indicaciones del médico:
los límites y la pauta los decide su neurólogo.
