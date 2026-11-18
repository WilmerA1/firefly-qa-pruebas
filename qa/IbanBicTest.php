<?php

/*
 * CP-UN-10 a CP-UN-15 — Validadores "iban" y "bic" de FireflyValidator (RF-TR-09, RF-TR-10),
 * invocados con Validator::make (contingencia 3 del plan).
 */

declare(strict_types=1);

namespace Tests\qa;

require_once __DIR__ . '/QaTestCase.php';

use Illuminate\Support\Facades\Validator;
use PHPUnit\Framework\Attributes\TestDox;

final class IbanBicTest extends QaTestCase
{
    private function revisar(string $caso, string $campo, string $valor, bool $esperaPasar): void
    {
        $validador = Validator::make([$campo => $valor], [$campo => $campo]);
        $pasa      = $validador->passes();
        $this->evidencia($caso, sprintf(
            '%s=%s | validación: %s%s | esperado: %s',
            $campo,
            $valor,
            $pasa ? 'PASA (se acepta)' : 'FALLA (se rechaza)',
            $pasa ? '' : ' → ' . $validador->errors()->first($campo),
            $esperaPasar ? 'PASA' : 'FALLA'
        ));
        $this->assertSame($esperaPasar, $pasa);
    }

    #[TestDox('CP-UN-10 IBAN con dígito de control correcto es aceptado')]
    public function testCPUN10(): void { $this->revisar('CP-UN-10', 'iban', 'DE89370400440532013000', true); }

    #[TestDox('CP-UN-11 IBAN con dígito de control inválido es rechazado')]
    public function testCPUN11(): void { $this->revisar('CP-UN-11', 'iban', 'DE88370400440532013000', false); }

    #[TestDox('CP-UN-12 IBAN demasiado corto (DE8) es rechazado')]
    public function testCPUN12(): void { $this->revisar('CP-UN-12', 'iban', 'DE8', false); }

    #[TestDox('CP-UN-13 BIC de 8 caracteres (DEUTDEFF) es aceptado')]
    public function testCPUN13(): void { $this->revisar('CP-UN-13', 'bic', 'DEUTDEFF', true); }

    #[TestDox('CP-UN-14 BIC de 11 caracteres (DEUTDEFF500) es aceptado')]
    public function testCPUN14(): void { $this->revisar('CP-UN-14', 'bic', 'DEUTDEFF500', true); }

    #[TestDox('CP-UN-15 BIC con formato inválido (DEUT1) es rechazado')]
    public function testCPUN15(): void { $this->revisar('CP-UN-15', 'bic', 'DEUT1', false); }
}
