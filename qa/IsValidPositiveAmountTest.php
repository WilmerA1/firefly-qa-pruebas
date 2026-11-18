<?php

/*
 * CP-UN-01 a CP-UN-09 — Regla IsValidPositiveAmount (RF-TR-04).
 * V(G) = 7: arreglo, vacío, no numérico, notación científica, <= 0, >= límite, camino válido.
 */

declare(strict_types=1);

namespace Tests\qa;

require_once __DIR__ . '/QaTestCase.php';

use FireflyIII\Rules\IsValidPositiveAmount;
use Illuminate\Translation\PotentiallyTranslatedString;
use PHPUnit\Framework\Attributes\TestDox;

final class IsValidPositiveAmountTest extends QaTestCase
{
    /**
     * Paso 1 del caso: llama a la regla con el atributo "amount" y una función $fail
     * que marca si fue invocada. Devuelve [fueInvocada, mensaje].
     */
    private function validar(mixed $valor): array
    {
        $invocada = false;
        $mensaje  = '';
        $fail     = function (string $msg) use (&$invocada, &$mensaje): PotentiallyTranslatedString {
            $invocada = true;
            $mensaje  = $msg;

            return new PotentiallyTranslatedString($msg, app('translator'));
        };

        (new IsValidPositiveAmount())->validate('amount', $valor, $fail);

        return [$invocada, $mensaje];
    }

    private function revisar(string $caso, mixed $valor, bool $esperaFail): void
    {
        [$invocada, $mensaje] = $this->validar($valor);
        $this->evidencia($caso, sprintf(
            'valor=%s | $fail invocada: %s%s | esperado: %s',
            json_encode($valor),
            $invocada ? 'SÍ' : 'NO',
            $invocada ? " ({$mensaje})" : '',
            $esperaFail ? 'SÍ (rechaza)' : 'NO (acepta)'
        ));
        $this->assertSame($esperaFail, $invocada);
    }

    #[TestDox('CP-UN-01 Monto entero positivo (10) es aceptado')]
    public function testCPUN01(): void { $this->revisar('CP-UN-01', '10', false); }

    #[TestDox('CP-UN-02 Monto en el límite superior (10019092019) es aceptado')]
    public function testCPUN02(): void { $this->revisar('CP-UN-02', '10019092019', false); }

    #[TestDox('CP-UN-03 Monto sobre el límite (10019092020) es rechazado')]
    public function testCPUN03(): void { $this->revisar('CP-UN-03', '10019092020', true); }

    #[TestDox('CP-UN-04 Monto cero (0) es rechazado')]
    public function testCPUN04(): void { $this->revisar('CP-UN-04', '0', true); }

    #[TestDox('CP-UN-05 Monto negativo (-5) es rechazado')]
    public function testCPUN05(): void { $this->revisar('CP-UN-05', '-5', true); }

    #[TestDox('CP-UN-06 Monto no numérico (abc) es rechazado')]
    public function testCPUN06(): void { $this->revisar('CP-UN-06', 'abc', true); }

    #[TestDox('CP-UN-07 Monto en notación científica (1E3) es rechazado')]
    public function testCPUN07(): void { $this->revisar('CP-UN-07', '1E3', true); }

    #[TestDox('CP-UN-08 Monto vacío ("") es rechazado')]
    public function testCPUN08(): void { $this->revisar('CP-UN-08', '', true); }

    #[TestDox('CP-UN-09 Monto en forma de arreglo (["1"]) es rechazado')]
    public function testCPUN09(): void { $this->revisar('CP-UN-09', ['1'], true); }
}
