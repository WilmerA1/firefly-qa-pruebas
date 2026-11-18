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
