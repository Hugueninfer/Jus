<?php

declare(strict_types=1);

namespace App\Tests\Integration;

use Symfony\Bundle\FrameworkBundle\Test\KernelTestCase;

final class KernelTimezoneTest extends KernelTestCase
{
    public function testTheApplicationRunsOnBrazilianTime(): void
    {
        date_default_timezone_set('UTC');

        self::bootKernel();

        self::assertSame('America/Sao_Paulo', date_default_timezone_get());
    }
}
