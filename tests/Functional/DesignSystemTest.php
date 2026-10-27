<?php

declare(strict_types=1);

namespace App\Tests\Functional;

use Symfony\Bundle\FrameworkBundle\Test\WebTestCase;
use Symfony\Component\Clock\Test\ClockSensitiveTrait;
use Symfony\Component\DomCrawler\Crawler;

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
        self::assertCount(2, $crawler->filter('section#data-table table.jus-data-table')); // the documents and the empty table
        $firstDocument = $crawler->filter('section#data-table table.jus-data-table tbody tr')->first();
        self::assertSame('#data-table', $firstDocument->filter('td')->eq(0)->filter('a')->attr('href'));
        self::assertSame('Petição inicial', trim($firstDocument->filter('td')->eq(1)->text()));
    }

    public function testEveryExampleIsNamedAndShowsItsCode(): void
    {
        self::mockTime('2026-03-04 09:00:00');
        $client = self::createClient();

        $crawler = $client->request('GET', '/design-system');

        $figures = $crawler->filter('figure');
        $summaries = $crawler->filter('details > summary')->each(static fn (Crawler $summary): string => trim($summary->text()));
        self::assertCount($figures->count(), $crawler->filter('details pre code'));
        self::assertCount($figures->count(), $summaries);
        self::assertSame($summaries, array_values(array_unique($summaries)), 'Each "Código do exemplo" summary has its own name.');
        foreach ($summaries as $summary) {
            self::assertMatchesRegularExpression('/^Código do exemplo: \S/u', $summary);
        }
        $figures->each(static function (Crawler $figure): void {
            self::assertCount(1, $figure->filter('figcaption'));
            self::assertNotSame('', trim($figure->filter('figcaption')->text()));
        });
    }

    public function testShowsTheVariantsOfEachComponent(): void
    {
        self::mockTime('2026-03-04 09:00:00');
        $client = self::createClient();

        $crawler = $client->request('GET', '/design-system');

        self::assertCount(1, $crawler->filter('section#alert figure .alert-info'));
        $confidential = $crawler->filter('section#case-card figure article.jus-case-card')->reduce(static fn (Crawler $card): bool => str_contains($card->text(), 'Sigiloso'));
        self::assertCount(1, $confidential);
        self::assertCount(0, $confidential->filter('h3 a'));
        self::assertContains('Nenhuma movimentação neste processo.', $crawler->filter('section#timeline ol.jus-timeline > li')->each(static fn (Crawler $item): string => trim($item->text())));
        self::assertContains('Nenhum documento juntado.', $crawler->filter('section#data-table table.jus-data-table tbody td')->each(static fn (Crawler $cell): string => trim($cell->text())));
    }

    public function testTheReferenceTablesScrollInsideANamedRegion(): void
    {
        self::mockTime('2026-03-04 09:00:00');
        $client = self::createClient();

        $crawler = $client->request('GET', '/design-system');

        $tables = $crawler->filter('section table.table-sm');
        self::assertGreaterThan(0, $tables->count());
        $tables->each(static function (Crawler $table): void {
            $region = $table->ancestors()->first();
            self::assertStringContainsString('table-responsive', (string) $region->attr('class'));
            // Keyboard users can scroll it, and screen readers announce which table it holds.
            self::assertSame('region', $region->attr('role'));
            self::assertSame('0', $region->attr('tabindex'));
            self::assertSame(trim($table->filter('caption')->text()), $region->attr('aria-label'));
        });
    }

    public function testTheDocumentsTableIsSortedFromTheQueryString(): void
    {
        self::mockTime('2026-03-04 09:00:00');
        $client = self::createClient();

        $crawler = $client->request('GET', '/design-system?sort=size&direction=desc');

        self::assertResponseIsSuccessful();
        $table = $crawler->filter('section#data-table table.jus-data-table')->first();
        self::assertSame(
            ['Contestação', 'Petição inicial', 'Procuração'],
            $table->filter('tbody tr')->each(static fn (Crawler $row): string => trim($row->filter('td')->eq(0)->text())),
        );
        $header = $table->filter('th[aria-sort="descending"]');
        self::assertCount(1, $header);
        self::assertSame('Tamanho', trim($header->text()));
    }

    public function testShowsOnlyTheDeadlineStatesTheCalendarAllowsOnAWeekend(): void
    {
        // A Saturday: no deadline can fall due today.
        self::mockTime('2026-03-07 09:00:00');
        $client = self::createClient();

        $crawler = $client->request('GET', '/design-system');

        self::assertSame(
            ['on_track', 'warning', 'overdue', 'fulfilled'],
            $crawler->filter('section#deadline-indicator [data-urgency]')->each(static fn (Crawler $badge): string => (string) $badge->attr('data-urgency')),
        );
    }
}
