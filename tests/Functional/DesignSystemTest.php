<?php

declare(strict_types=1);

namespace App\Tests\Functional;

use Symfony\Bundle\FrameworkBundle\Test\WebTestCase;
use Symfony\Component\Clock\Test\ClockSensitiveTrait;

final class DesignSystemTest extends WebTestCase
{
    use ClockSensitiveTrait;

    public function testTheCatalogIsPublicAndShowsEveryComponent(): void
    {
        self::mockTime('2026-03-04 09:00:00');
        $client = self::createClient();

        $crawler = $client->request('GET', '/design-system');

        self::assertResponseIsSuccessful();
        self::assertSelectorTextContains('h1', 'Design System');
        foreach (['tokens', 'alert', 'status-badge', 'case-card', 'timeline', 'deadline-indicator', 'data-table', 'cnj-field'] as $section) {
            self::assertCount(1, $crawler->filter('section#'.$section), $section);
            self::assertCount(1, $crawler->filter('nav a[href="#'.$section.'"]'), $section);
        }
    }

    public function testEachExampleShowsItsOwnSource(): void
    {
        self::mockTime('2026-03-04 09:00:00');
        $client = self::createClient();

        $crawler = $client->request('GET', '/design-system');

        $example = $crawler->filter('section#alert figure')->first();
        self::assertCount(1, $example->filter('.alert-success'));
        self::assertStringContainsString('<twig:Alert type="success"', $crawler->filter('section#alert pre code')->first()->text());
        self::assertCount(5, $crawler->filter('section#deadline-indicator [data-urgency]'));
        self::assertCount(1, $crawler->filter('section#cnj-field jus-numero-processo input'));
        self::assertCount(1, $crawler->filter('section#data-table table.jus-data-table'));
        $firstDocument = $crawler->filter('section#data-table table.jus-data-table tbody tr')->first();
        self::assertSame('#data-table', $firstDocument->filter('td')->eq(0)->filter('a')->attr('href'));
        self::assertSame('Petição inicial', trim($firstDocument->filter('td')->eq(1)->text()));
    }
}
