# Imagen DESECHABLE para la suite SU-UN: misma imagen de la instancia + PHPUnit.
FROM fireflyiii/core:version-6.6.6
USER root
WORKDIR /var/www/html
# Sin config cacheada (criterio de entrada del plan) e instala las dependencias de desarrollo
# EXACTAS del composer.lock de la 6.6.6 (incluye PHPUnit 13.2).
RUN rm -f bootstrap/cache/config.php \
 && (composer install --no-interaction --no-scripts --prefer-dist \
     || composer require --dev "phpunit/phpunit:^13" --no-interaction --no-scripts) \
 && composer dump-autoload --no-scripts \
 && vendor/bin/phpunit --version
ENTRYPOINT []
