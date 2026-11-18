# Corre la suite SU-UN en el contenedor desechable y sube los resultados a QAtlas.
#   .\correr-y-subir.ps1            → corre los 19 casos y crea una ejecución en QAtlas
#   .\correr-y-subir.ps1 -Rebuild   → reconstruye la imagen ff-qa antes de correr

param([switch]$Rebuild)

$raiz = $PSScriptRoot
if (-not (Test-Path "$raiz\.env")) {
    Write-Host "Falta el archivo .env. Copiá .env.example como .env y pegá tu token de QAtlas." -ForegroundColor Red
    exit 1
}

docker info *> $null
if ($LASTEXITCODE -ne 0) {
    Write-Host "Docker no está corriendo. Abrí Docker Desktop y esperá 'Engine running'." -ForegroundColor Red
    exit 1
}

docker image inspect ff-qa *> $null
if ($Rebuild -or $LASTEXITCODE -ne 0) {
    Write-Host "Construyendo la imagen ff-qa (solo la primera vez, tarda unos minutos)..."
    docker build -t ff-qa "$raiz\qa"
    if ($LASTEXITCODE -ne 0) { exit 1 }
}

$commit = (git -C $raiz rev-parse --short HEAD 2>$null)
$rama   = (git -C $raiz rev-parse --abbrev-ref HEAD 2>$null)

docker run --rm `
  --env-file "$raiz\.env" `
  -e DB_CONNECTION=sqlite -e DB_DATABASE=":memory:" `
  -e APP_KEY=QaPruebasUnitariasFirefly666Abcd `
  -e TZ=America/Costa_Rica `
  -e "QATLAS_COMMIT=$commit" -e "QATLAS_BRANCH=$rama" `
  -v "${raiz}\qa:/var/www/html/tests/qa" `
  ff-qa php tests/qa/ejecutar.php

exit $LASTEXITCODE
