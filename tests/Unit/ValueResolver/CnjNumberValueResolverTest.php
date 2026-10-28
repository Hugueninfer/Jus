<?php

declare(strict_types=1);

namespace App\Tests\Unit\ValueResolver;

use App\Domain\CnjNumber;
use App\ValueResolver\CnjNumberValueResolver;
use PHPUnit\Framework\TestCase;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpKernel\ControllerMetadata\ArgumentMetadata;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;

final class CnjNumberValueResolverTest extends TestCase
{
    public function testResolvesMaskedAndPlainNumbers(): void
    {
        foreach (['0000001-39.2024.8.26.0100', '00000013920248260100'] as $value) {
            $resolved = [...(new CnjNumberValueResolver())->resolve(new Request(attributes: ['numero' => $value]), $this->argument())];

            self::assertCount(1, $resolved);
            self::assertSame('0000001-39.2024.8.26.0100', $resolved[0]->formatted());
        }
    }

    public function testAnInvalidNumberIsNotFound(): void
    {
        try {
            [...(new CnjNumberValueResolver())->resolve(new Request(attributes: ['numero' => '<script>']), $this->argument())];
            self::fail('An invalid number must be a 404.');
        } catch (NotFoundHttpException $e) {
            // The whole message, not a part of it: it ends up on an error page and must never echo the input.
            self::assertSame('Processo não encontrado.', $e->getMessage());
        }
    }

    public function testIgnoresArgumentsWithoutARouteValue(): void
    {
        self::assertSame([], [...(new CnjNumberValueResolver())->resolve(new Request(), $this->argument())]);
    }

    private function argument(): ArgumentMetadata
    {
        return new ArgumentMetadata('numero', CnjNumber::class, false, false, null);
    }
}
