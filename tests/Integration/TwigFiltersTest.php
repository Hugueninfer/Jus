<?php

declare(strict_types=1);

namespace App\Tests\Integration;

use App\Domain\CnjNumber;
use App\Domain\LegalCase\CaseStatus;
use Symfony\Bundle\FrameworkBundle\Test\KernelTestCase;
use Twig\Environment;

final class TwigFiltersTest extends KernelTestCase
{
    public function testTheFiltersAreRegistered(): void
    {
        self::bootKernel();
        $twig = self::getContainer()->get(Environment::class);

        $html = $twig->createTemplate('{{ number|cnj }}|{{ 1500000|brl }}|{{ 184320|bytes }}|{{ status|label }}')->render([
            'number' => CnjNumber::fromString('0000001-39.2024.8.26.0100'),
            'status' => CaseStatus::Active,
        ]);

        self::assertSame("0000001-39.2024.8.26.0100|R\$\u{a0}15.000,00|180 KB|Em andamento", $html);
    }
}
