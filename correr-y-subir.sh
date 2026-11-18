#!/usr/bin/env bash
# Corre la suite SU-UN en el contenedor desechable y sube los resultados a QAtlas.
# Se usa en GitHub Actions (y sirve en Linux/macOS):  bash correr-y-subir.sh
set -u
RAIZ="$(cd "$(dirname "$0")" && pwd)"

# Variables locales opcionales (en CI vienen de los secretos/variables del repositorio)
if [ -f "$RAIZ/.env" ]; then set -a; . "$RAIZ/.env"; set +a; fi

# Contexto de la corrida en GitHub Actions
if [ -n "${GITHUB_RUN_ID:-}" ]; then
  # Un external_id por intento: reintentar el job crea una ejecución nueva en vez de chocar con una ya completada.
  export QATLAS_RUN_ID="${QATLAS_RUN_ID:-gh-${GITHUB_RUN_ID}-${GITHUB_RUN_ATTEMPT:-1}}"
  export QATLAS_RUN_NAME="${QATLAS_RUN_NAME:-EJ-UN-02 Ejecución automatizada PL-UN · GitHub #${GITHUB_RUN_NUMBER:-?}}"
  export QATLAS_ENVIRONMENT="${QATLAS_ENVIRONMENT:-GitHub Actions}"
  export QATLAS_BUILD="${QATLAS_BUILD:-${GITHUB_RUN_NUMBER:-}}"
  export QATLAS_BRANCH="${QATLAS_BRANCH:-${GITHUB_REF_NAME:-}}"
  export QATLAS_COMMIT="${QATLAS_COMMIT:-${GITHUB_SHA:-}}"
  export QATLAS_CI_URL="${QATLAS_CI_URL:-${GITHUB_SERVER_URL:-https://github.com}/${GITHUB_REPOSITORY:-}/actions/runs/${GITHUB_RUN_ID}}"
fi
export QATLAS_PROJECT="${QATLAS_PROJECT:-FF3}"

if ! docker image inspect ff-qa >/dev/null 2>&1; then
  echo "Construyendo la imagen ff-qa..."
  docker build -t ff-qa "$RAIZ/qa" || exit 1
fi

exec docker run --rm \
  -e DB_CONNECTION=sqlite -e DB_DATABASE=":memory:" \
  -e APP_KEY=QaPruebasUnitariasFirefly666Abcd \
  -e TZ=America/Costa_Rica \
  -e QATLAS_URL -e QATLAS_TOKEN -e QATLAS_PROJECT \
  -e QATLAS_RUN_NAME -e QATLAS_RUN_ID -e QATLAS_ENVIRONMENT \
  -e QATLAS_BUILD -e QATLAS_BRANCH -e QATLAS_COMMIT -e QATLAS_CI_URL \
  -e QATLAS_CREATE_BUG_ON_FAILURE -e QATLAS_COMPLETE -e QATLAS_SUBIR \
  -e GITHUB_ACTIONS \
  -v "$RAIZ/qa:/var/www/html/tests/qa" \
  ff-qa php tests/qa/ejecutar.php
