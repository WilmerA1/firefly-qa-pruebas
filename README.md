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