<?php

declare(strict_types=1);

namespace App\Tests\Integration;

use Symfony\Bundle\FrameworkBundle\Test\KernelTestCase;

final class KernelTimezoneTest extends KernelTestCase
{
    private string $timezone;

    protected function setUp(): void
    {
        parent::setUp();
        $this->timezone = date_default_timezone_get();
    }

    protected function tearDown(): void
    {
        date_default_timezone_set($this->timezone); // even when the test fails, UTC must not leak into later tests
        parent::tearDown();
    }

    public function testTheApplicationRunsOnBrazilianTime(): void
    {
        date_default_timezone_set('UTC');

        self::bootKernel();

        self::assertSame('America/Sao_Paulo', date_default_timezone_get());
    }
}
