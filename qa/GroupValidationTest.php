<?php

/*
 * CP-UN-16 y CP-UN-17 — GroupValidation::validateDescriptions (RF-TR-05).
 * Se usa una clase anónima con el trait, porque el método es protegido.
 */

declare(strict_types=1);

namespace Tests\qa;

require_once __DIR__ . '/QaTestCase.php';

use FireflyIII\Validation\GroupValidation;
use Illuminate\Contracts\Validation\Validator as ValidatorContract;
use Illuminate\Support\Facades\Validator;
use PHPUnit\Framework\Attributes\TestDox;

final class GroupValidationTest extends QaTestCase
{
    private function sujeto(): object
    {
        return new class {
            use GroupValidation;

            protected function getTransactionsArray(ValidatorContract $validator): array
            {
                $datos = $validator->getData();

                return is_array($datos['transactions'] ?? null) ? $datos['transactions'] : [];
            }

            public function ejecutar(ValidatorContract $validator): void
            {
                $this->validateDescriptions($validator);
            }
        };
    }

    private function revisar(string $caso, string $descripcion, bool $esperaError): void
    {
        $validador = Validator::make(['transactions' => [['description' => $descripcion]]], []);
        $this->sujeto()->ejecutar($validador);

        $errores = $validador->errors()->toArray();
        $this->evidencia($caso, sprintf(
            'description=%s | errores del validador: %s | esperado: %s',
            json_encode($descripcion),
            [] === $errores ? 'ninguno' : json_encode($errores, JSON_UNESCAPED_UNICODE),
            $esperaError ? 'error en transactions.0.description' : 'ninguno'
        ));

        if ($esperaError) {
            $this->assertTrue($validador->errors()->has('transactions.0.description'));
        } else {
            $this->assertCount(0, $errores);
        }
    }

    #[TestDox('CP-UN-16 Descripción presente (Compra) no genera error')]
    public function testCPUN16(): void { $this->revisar('CP-UN-16', 'Compra', false); }

    #[TestDox('CP-UN-17 Todas las descripciones vacías generan error')]
    public function testCPUN17(): void { $this->revisar('CP-UN-17', '', true); }
}
