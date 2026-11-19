/**
 * Una sesión de Firefly por archivo de pruebas UI.
 *
 * Firefly (Laravel) guarda en la sesión los mensajes de éxito y los errores de validación de la
 * petición siguiente. Si dos archivos corren en paralelo con la MISMA sesión, una petición de un
 * archivo puede "consumir" el mensaje del otro y la prueba ve una pantalla sin mensaje. Por eso el
 * project ui-setup inicia sesión una vez por archivo y cada archivo usa la suya con test.use().
 * Las rutas están en .auth/ (no se sube: está en .gitignore).
 */
export const SESIONES = {
  divisas: '.auth/sesion-divisas.json',
  presupuestos: '.auth/sesion-presupuestos.json',
} as const;
