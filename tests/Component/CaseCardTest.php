<?php

declare(strict_types=1);

namespace App\Tests\Component;

use Symfony\Bundle\FrameworkBundle\Test\KernelTestCase;
use Symfony\UX\TwigComponent\Test\InteractsWithTwigComponents;

final class CaseCardTest extends KernelTestCase
{
    use InteractsWithTwigComponents;

    public function testSummarisesTheCase(): void
    {
        $card = $this->renderTwigComponent('CaseCard', ['case' => Samples::legalCase()])->crawler();

        self::assertSame('0000001-39.2024.8.26.0100', trim($card->filter('h3')->text()));
        self::assertCount(0, $card->filter('h3 a'));
        self::assertStringContainsString('Procedimento Comum Cível', $card->text());
        self::assertStringContainsString('Indenização por dano moral', $card->text());
        self::assertStringContainsString('1ª Vara Cível', $card->text());
        self::assertSame('Maria Oliveira', trim($card->filter('dd')->eq(0)->text()));
        self::assertSame('Empresa X Ltda.', trim($card->filter('dd')->eq(1)->text()));
        self::assertStringContainsString('Em andamento', $card->filter('.badge')->text());
        self::assertStringContainsString('02/04/2024', $card->filter('.jus-case-card-last-event')->text());
        self::assertStringContainsString('Decisão', $card->filter('.jus-case-card-last-event')->text());
        self::assertStringNotContainsString('Sigiloso', $card->text());
    }

    public function testLinksTheNumberAndFlagsConfidentialCases(): void
    {
        $card = $this->renderTwigComponent('CaseCard', [
            'case' => Samples::legalCase(confidential: true),
            'href' => '/processos/0000001-39.2024.8.26.0100',
        ])->crawler();

        self::assertSame('/processos/0000001-39.2024.8.26.0100', $card->filter('h3 a')->attr('href'));
        self::assertStringContainsString('Sigiloso', $card->text());
    }
}
