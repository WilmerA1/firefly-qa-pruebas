# Firefly III 6.6.6 — Suite SU-UN automatizada (QAtlas)

Automatización de la suite **SU-UN Pruebas unitarias de caja blanca** (plan FF3-PLAN-1, proyecto **FF3** en QAtlas).
Un solo comando corre los 19 casos (CP-UN-01 a CP-UN-19) con PHPUnit sobre Firefly III 6.6.6 y **sube la ejecución a QAtlas**:
crea la ejecución, marca los 3 pasos de cada caso, adjunta la evidencia al paso 3 y la completa.

```
correr-y-subir  →  contenedor desechable ff-qa (Firefly 6.6.6 + PHPUnit 13, SQLite en memoria)
                   ├─ PHPUnit: 19 pruebas  → resultados/junit.xml + línea ">>" por caso
                   └─ subir-a-qatlas.php   → POST /test-runs/ingest → POST /attachments (paso 3) → POST /test-runs/{id}/complete
```

## Estructura

| Archivo | Para qué |
| --- | --- |
| `qa/*Test.php` | Las 19 pruebas (IsValidPositiveAmount, IBAN/BIC, GroupValidation, BelongsUser) |
| `qa/QaTestCase.php` | Arranca Firefly y aborta si la conexión no es SQLite en memoria (protección del plan) |
| `qa/casos-qatlas.json` | Relación método PHPUnit → caso QAtlas (`testCPUN01` → `FF3-TC-26`) y títulos de los pasos |
| `qa/ejecutar.php` | Corre PHPUnit y luego sube a QAtlas (se ejecuta dentro del contenedor) |
| `qa/subir-a-qatlas.php` | Cliente de la API de ingesta de QAtlas |
| `qa/Dockerfile` | Imagen `ff-qa`: `fireflyiii/core:version-6.6.6` + dependencias de desarrollo (PHPUnit 13) |
| `correr-y-subir.ps1` | Ejecutar en Windows (VS Code) |
| `correr-y-subir.sh` | Ejecutar en GitHub Actions / Linux |
| `.github/workflows/su-un.yml` | Corre todo en cada push a `main` o con el botón *Run workflow* |
| `.env.example` | Plantilla de configuración (el `.env` real con el token **no** se sube) |

## Cómo se registra cada caso en QAtlas

| Resultado de PHPUnit | Caso | Paso 1 (crear) | Paso 2 (ejecutar) | Paso 3 (comparar) |
| --- | --- | --- | --- | --- |
| ✔ pasa | Aprobado | Aprobado | Aprobado | Aprobado |
| ✘ falla la aserción | Fallido | Aprobado | Aprobado | Fallido, con la línea `>>` como "qué pasó realmente" |
| error de ejecución | Fallido | Aprobado | Fallido, con el error | Bloqueado |

La evidencia de cada caso (archivo `evidencia-CP-UN-xx.txt` con la línea `>>`, la prueba, el entorno y el commit) se adjunta al **paso 3**.

## Uso local (Windows)

1. Docker Desktop abierto ("Engine running").
2. Copiar `.env.example` como `.env` y pegar el token de QAtlas en `QATLAS_TOKEN`.
3. En la terminal de VS Code:

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\correr-y-subir.ps1
```

La primera vez construye la imagen `ff-qa` (unos minutos). Al final imprime el enlace a la ejecución en QAtlas.

## GitHub Actions

En el repositorio: **Settings → Secrets and variables → Actions**

| Nombre | Tipo | Valor |
| --- | --- | --- |
| `QATLAS_TOKEN` | Secret | token `qat_pat_…` (alcance *Solo ingesta (CI)*, proyecto FF3) |
| `QATLAS_URL` | Variable | `https://geotorotur.tail052473.ts.net/qatlas/api` |
| `QATLAS_PROJECT` | Variable (opcional) | `FF3` |

Cada push a `main` crea una ejecución nueva en QAtlas con rama, commit, número de build y enlace al job. También se puede lanzar a mano desde **Actions → SU-UN pruebas unitarias → Run workflow**.

---

## Pruebas de integración por API: PL-API / SU-API (Playwright)

Automatización de la suite **SU-API Pruebas de integración por API REST** (plan FF3-PLAN-2, proyecto **FF3** en QAtlas).
Un solo comando corre los 25 casos (CP-API-01 a CP-API-25) con Playwright y TypeScript sobre la API v1 de Firefly III 6.6.6 y **sube la ejecución a QAtlas**:
crea la ejecución, enlaza cada prueba con su caso (`CP-API-N` → `FF3-TC-N`) y marca el resultado.

```
npm run test:api  →  Playwright (project "api", 25 pruebas)
                     └─ qatlas-reporter.js → POST /test-runs/ingest  (ejecución "EJ-API-02 Ejecución automatizada PL-API")
```

### Estructura

| Archivo | Para qué |
| --- | --- |
| `tests/api/01-transacciones.spec.ts` | CP-API-01 a 19: validación de campos (422), transacción dividida, duplicados y divisa extranjera |
| `tests/api/02-divisas-presupuestos.spec.ts` | CP-API-20 a 25: divisas y presupuestos |
| `tests/api/helpers.ts` | Cuerpos base, datos de prueba, limpieza de lo creado y enlace con el caso de QAtlas |
| `playwright.config.ts` | Project `api`: encabezados `Accept` y `Content-Type` JSON y el token de Firefly III |
| `qatlas-reporter.js` | Reporter de QAtlas para Playwright |

Cada prueba verifica un solo resultado: el código HTTP y el campo con error (o, en los casos válidos, el dato devuelto).

### Requisitos

- Node.js 20 o superior y `npm install`.
- Firefly III 6.6.6 activo en `http://localhost` con un token personal de acceso.
- Una cuenta de activos, una cuenta en **EUR** (distinta de USD, para CP-API-17) y un **segundo usuario** con una cuenta propia (CP-API-07).

### Uso local

1. Copiar `.env.example` como `.env` y completar, sin comillas ni espacios alrededor del `=`:

| Variable | Qué es |
| --- | --- |
| `FF_BASE_URL` | Dirección de Firefly III, por ejemplo `http://localhost` |
| `FF_TOKEN` | Token personal de acceso de Firefly III |
| `ID_CUENTA` | Id de una cuenta de activos |
| `ID_CUENTA_EUR` | Id de una cuenta de activos en EUR |
| `ID_CUENTA_AJENA` | Id de una cuenta del segundo usuario |
| `QATLAS_URL`, `QATLAS_TOKEN`, `QATLAS_PROJECT` | Los mismos de la sección anterior |

2. En la terminal de VS Code:

```powershell
npm run test:api
```

Al final imprime el enlace a la ejecución en QAtlas. Para correr solo la prueba sin subir nada, poner `QATLAS_SUBIR=0` en el `.env`.

### Resultado esperado

**24 pruebas aprobadas y 1 fallida**: CP-API-24 falla porque Firefly III devuelve HTTP 200 en lugar de 422 al recibir una divisa inexistente en un presupuesto automático (defecto D-1, FF3-BUG-1 en QAtlas).

### Notas

- Las pruebas de API necesitan una instancia de Firefly III propia, así que se ejecutan **solo en local** (no en GitHub Actions).
- CP-API-16 debe correr antes que CP-API-06; por eso las pruebas de `01-transacciones.spec.ts` se ejecutan en orden.
- Lo que cada prueba crea (transacciones y presupuestos) se borra al terminar. Los datos de prueba llevan el prefijo `QA-`.

---

## Pruebas de sistema por interfaz web: PL-UI / SU-UI (Playwright)

Automatización de la suite **SU-UI Pruebas de sistema por interfaz web** (plan FF3-PLAN-3, proyecto **FF3** en QAtlas).
Un solo comando corre los 17 casos automatizados (CP-UI-01 a CP-UI-17) con Playwright y TypeScript en el navegador Chromium, sobre los formularios de Divisas y Presupuestos de Firefly III 6.6.6, y **sube la ejecución a QAtlas**:
crea la ejecución, enlaza cada prueba con su caso (`CP-UI-01` → `FF3-TC-45`, …, `CP-UI-17` → `FF3-TC-61`) y marca el resultado.
Los casos CP-UI-18 a CP-UI-22 son manuales y se ejecutan directamente en QAtlas.

```
npm run test:ui  →  Playwright
                    ├─ project "ui-setup": inicia sesión en Firefly III y guarda una sesión por archivo de pruebas en .auth/
                    ├─ project "ui": 17 pruebas; los dos archivos corren en paralelo, cada uno con su sesión y sus pruebas en orden
                    └─ qatlas-reporter.js → POST /test-runs/ingest  (ejecución "EJ-UI-02 Ejecución automatizada PL-UI")
```

### Estructura

| Archivo | Para qué |
| --- | --- |
| `tests/ui/01-divisas.spec.ts` | CP-UI-01 a 10: límites de nombre, código, símbolo y decimales, duplicados y habilitar y deshabilitar una divisa |
| `tests/ui/02-presupuestos.spec.ts` | CP-UI-11 a 17: nombre del presupuesto, duplicados y presupuesto automático según su tipo |
| `tests/ui/auth.setup.ts` | Inicia sesión con `FF_EMAIL` y `FF_PASSWORD` y guarda la sesión de cada archivo de pruebas |
| `tests/ui/sesiones.ts` | Ruta de la sesión de cada archivo, dentro de `.auth/` (no se sube a GitHub: contiene las cookies de Firefly) |
| `tests/ui/helpers.ts` | Llenado de formularios, lectura de errores y listas, creación y borrado de datos de prueba y enlace con el caso de QAtlas |
| `playwright.config.ts` | Projects `ui-setup` y `ui` (Chromium) y reporter de QAtlas de la ejecución EJ-UI-02 |

Cada prueba tiene un solo `expect`, que compara un objeto con todo lo observado (campos marcados en rojo, mensaje de éxito y si el registro aparece en la lista) contra lo esperado. Los mensajes que muestra Firefly quedan como anotación de la prueba en el reporte HTML.

### Requisitos

- Node.js 20 o superior y `npm install`.
- El navegador Chromium de Playwright, una sola vez: `npx playwright install chromium` (SU-API no lo necesita, SU-UI sí).
- Firefly III 6.6.6 activo en `http://localhost`. Puede ser la misma instancia que usa SU-API. No hace falta token de Firefly ni cuentas.
- Un usuario de esa instancia, con su correo y contraseña, que cumpla estas condiciones:
  - **Tiene el rol owner.** Firefly III solo deja crear y borrar divisas al owner; con otro usuario fallan CP-UI-01 a CP-UI-10. El primer usuario que se registró en la instancia es el owner. Para comprobarlo: solo el owner ve **Ajustes del sistema** (*System settings*) en el menú lateral, y a un usuario que no es owner Firefly le muestra en `/currencies` el aviso «Por favor pregunte … por agregar,elimine o edite monedas» (*Please ask … to add, remove or edit currencies*). Si la instancia tiene más de un usuario (SU-API usa un segundo usuario en CP-API-07), poner en `FF_EMAIL` el que es owner.
  - **No tiene activada la verificación en dos pasos**, porque la suite solo escribe el correo y la contraseña.
  - **Tiene el tamaño de página en 50**, el valor por defecto (`/preferences`, campo *Tamaño de pagina*). La suite lee solo la primera página de `/currencies`: una instalación nueva trae 41 divisas y la suite agrega 2, así que caben. Si la instancia tiene muchas divisas más, las de la suite podrían quedar en la segunda página y las pruebas fallarían.
- El idioma del usuario no cambia el resultado: la suite no compara textos de Firefly, sino qué campo queda marcado en rojo, si aparece el mensaje de éxito con el nombre y si el registro está en la lista. Los mensajes que quedan en el reporte sí salen en el idioma del usuario; los defectos FF3-BUG-2 a FF3-BUG-10 se observaron con el usuario en español (`/preferences`, sección *Idiomas*).

### Uso local

1. En el `.env` (copiado de `.env.example`), además de `QATLAS_URL`, `QATLAS_TOKEN` y `QATLAS_PROJECT`, completar sin espacios alrededor del `=`:

| Variable | Qué es |
| --- | --- |
| `FF_BASE_URL` | Dirección de Firefly III, por ejemplo `http://localhost` (la misma variable de SU-API) |
| `FF_EMAIL` | Correo del usuario owner de Firefly III |
| `FF_PASSWORD` | Contraseña de ese usuario |
| `QATLAS_ENVIRONMENT`, `QATLAS_BROWSER` | Opcionales. Ambiente y navegador que se muestran en la ejecución de QAtlas, por ejemplo `Docker local` y `Chromium` |

Si la contraseña tiene espacios, `#` o `$`, escribirla entre comillas simples, por ejemplo `FF_PASSWORD='mi#clave'`. Sin comillas, el `.env` corta el valor en el `#`, y los espacios y el `$` rompen la lectura del `.env` en `correr-y-subir.sh` de SU-UN. Las comillas no afectan a SU-UN, que no usa esa variable.

2. En la terminal de VS Code:

```powershell
npm run test:ui
```

Para correr las pruebas sin subir nada, poner `QATLAS_SUBIR=0` en el `.env` (los valores del `.env` mandan sobre los de la terminal). Para ver el reporte HTML con los mensajes que mostró Firefly: `npx playwright show-report`.

### Resultado esperado

**18 pruebas aprobadas** en unos 15 segundos: el inicio de sesión (`ui-setup`) y los 17 casos. A QAtlas llegan 17 casos, porque el inicio de sesión no es un caso del plan.
Los casos CP-UI-02 a CP-UI-08, CP-UI-13 y CP-UI-14 se aprueban aunque el texto del mensaje de Firefly es defectuoso: el plan verifica el campo marcado en rojo, y esos mensajes están registrados como defectos FF3-BUG-2 a FF3-BUG-10.

### Notas

- Las pruebas de interfaz necesitan una instancia de Firefly III propia, así que se ejecutan **solo en local** (no en GitHub Actions).
- Si falla el inicio de sesión, el error lo indica («Faltan FF_EMAIL o FF_PASSWORD en el .env» o «Firefly no aceptó FF_EMAIL / FF_PASSWORD»): revisar esas variables y que Firefly esté activo en `FF_BASE_URL`.
- Al empezar, cada archivo borra los datos de prueba que hayan quedado de corridas anteriores, y al terminar borra lo que creó. Todos llevan el prefijo `QA-` (divisas con códigos como `QA-01` y `QA-09`, y presupuestos como `QA-Presupuesto-11`), y si la instancia ya tenía datos con esos mismos códigos o nombres, la suite los borra. Las divisas son de toda la instancia, así que mientras corre la suite las ven todos los usuarios. Se conservan `QA-Presupuesto-11` y `QA-Presupuesto-17`, que son precondición de los casos manuales.
- Los datos de prueba no coinciden con los de SU-API (`QA20` y presupuestos con marca de tiempo). `npm test` corre SU-API y SU-UI juntas y sube **dos** ejecuciones a QAtlas, una por suite, y necesita las variables de las dos; para subir solo SU-UI, usar `npm run test:ui`.
- `QATLAS_RUN_ID` y `QATLAS_CREATE_BUG_ON_FAILURE` (opcionales de SU-UN en `.env.example`) también los lee SU-UI. Si `QATLAS_RUN_ID` quedó puesto en el `.env`, SU-UI sube sus resultados a esa misma ejecución: comentarlo antes de correr SU-UI.
- Cada archivo usa su propia sesión de Firefly: Firefly guarda los mensajes de éxito y de error en la sesión, y si dos pruebas en paralelo la compartieran, una podría consumir el mensaje de la otra.
- La ejecución queda **En progreso** en QAtlas: el reporter no la completa. Se completa desde QAtlas después de revisarla.
