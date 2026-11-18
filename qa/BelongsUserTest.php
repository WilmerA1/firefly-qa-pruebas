<?php

/*
 * CP-UN-18 y CP-UN-19 — Regla BelongsUser (RF-TR-08).
 * Necesitan base de datos (riesgo 2 del plan): usan SQLite EN MEMORIA, dentro del
 * contenedor desechable. La protección de QaTestCase aborta si no es así.
 */

declare(strict_types=1);

namespace Tests\qa;

require_once __DIR__ . '/QaTestCase.php';

use FireflyIII\Models\Account;
use FireflyIII\Models\AccountType;
use FireflyIII\Models\GroupMembership;
use FireflyIII\Models\UserGroup;
use FireflyIII\Models\UserRole;
use FireflyIII\Rules\BelongsUser;
use FireflyIII\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Validator;
use PHPUnit\Framework\Attributes\TestDox;

final class BelongsUserTest extends QaTestCase
{
    use RefreshDatabase;

    protected $seed = true;

    private User    $usuario1;
    private Account $cuenta1;
    private Account $cuenta2;

    protected function setUp(): void
    {
        parent::setUp();

        $tipoActivo     = AccountType::query()->where('type', 'Asset account')->firstOrFail();
        [$this->usuario1, $grupo1] = $this->crearUsuario('primero@qa.test');
        [$usuario2, $grupo2]       = $this->crearUsuario('segundo@qa.test');

        $this->cuenta1 = Account::create([
            'user_id' => $this->usuario1->id, 'user_group_id' => $grupo1->id,
            'account_type_id' => $tipoActivo->id, 'name' => 'Cuenta del primer usuario', 'active' => true,
        ]);
        $this->cuenta2 = Account::create([
            'user_id' => $usuario2->id, 'user_group_id' => $grupo2->id,
            'account_type_id' => $tipoActivo->id, 'name' => 'Cuenta del segundo usuario', 'active' => true,
        ]);

        // La sesión es SIEMPRE la del primer usuario.
        $this->actingAs($this->usuario1);
    }

    private function crearUsuario(string $correo): array
    {
        $grupo   = UserGroup::create(['title' => $correo]);
        $rol     = UserRole::query()->where('title', 'owner')->firstOrFail();
        $usuario = User::create(['email' => $correo, 'password' => 'password-de-prueba', 'user_group_id' => $grupo->id]);
        GroupMembership::create(['user_id' => $usuario->id, 'user_group_id' => $grupo->id, 'user_role_id' => $rol->id]);

        return [$usuario, $grupo];
    }

    private function revisar(string $caso, Account $cuenta, bool $esperaPasar): void
    {
        // Los datos van ANIDADOS (transactions[0][source_id]), igual que en una petición real.
        // Con la clave plana 'transactions.0.source_id' Laravel no encuentra el valor y se salta la regla.
        $campo     = 'transactions.0.source_id';
        $datos     = ['transactions' => [['source_id' => $cuenta->id]]];
        $validador = Validator::make($datos, [$campo => ['required', new BelongsUser()]]);
        $pasa      = $validador->passes();

        $this->evidencia($caso, sprintf(
            'sesión=%s | cuenta id=%d (%s, dueño user_id=%d) | validación: %s%s | esperado: %s',
            $this->usuario1->email,
            $cuenta->id,
            $cuenta->name,
            $cuenta->user_id,
            $pasa ? 'PASA (se acepta)' : 'FALLA (se rechaza)',
            $pasa ? '' : ' → ' . $validador->errors()->first($campo),
            $esperaPasar ? 'PASA' : 'FALLA'
        ));
        $this->assertSame($esperaPasar, $pasa);
    }

    #[TestDox('CP-UN-18 Cuenta propia es aceptada')]
    public function testCPUN18(): void { $this->revisar('CP-UN-18', $this->cuenta1, true); }

    #[TestDox('CP-UN-19 Cuenta de otro usuario es rechazada')]
    public function testCPUN19(): void { $this->revisar('CP-UN-19', $this->cuenta2, false); }
}
