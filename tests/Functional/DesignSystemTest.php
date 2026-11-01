<?php

declare(strict_types=1);

namespace App\Tests\Functional;

use App\Twig\Components\CaseCard;
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
        foreach (['tokens', 'alert', 'status-badge', 'case-card', 'timeline', 'deadline-indicator', 'data-table', 'pagination', 'cnj-field', 'upload'] as $section) {
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
        // The filter example wraps a timeline with several event types, so its buttons have something to choose between.
        $filtered = $crawler->filter('section#timeline figure jus-filtro-timeline > ol.jus-timeline');
        self::assertCount(1, $filtered);
        $types = $filtered->filter('li.jus-timeline-event')->each(static fn (Crawler $event): string => (string) $event->attr('data-event-type'));
        self::assertGreaterThanOrEqual(2, \count(array_unique($types)));
        self::assertStringContainsString('<jus-filtro-timeline>', $crawler->filter('section#timeline pre code')->reduce(static fn (Crawler $code): bool => str_contains($code->text(), 'jus-filtro-timeline'))->text());
        self::assertContains('Filtro por tipo: jus-filtro-timeline', $crawler->filter('section#timeline h3')->each(static fn (Crawler $heading): string => trim($heading->text())));
        self::assertCount(2, $crawler->filter('section#data-table table.jus-data-table')); // the documents and the empty table
        $firstDocument = $crawler->filter('section#data-table table.jus-data-table tbody tr')->first();
        self::assertSame('#data-table', $firstDocument->filter('td')->eq(0)->filter('a')->attr('href'));
        self::assertSame('Petição inicial', trim($firstDocument->filter('td')->eq(1)->text()));
        self::assertCount(1, $crawler->filter('section#pagination figure nav[aria-label="Paginação de exemplo"]'));
        // The upload example is the plain file input inside the element, with its label and without a form to submit it.
        $upload = $crawler->filter('section#upload figure jus-upload');
        self::assertCount(1, $upload);
        self::assertSame('10485760', $upload->attr('max-size'));
        self::assertSame('5', $upload->attr('max-files'));
        $input = $crawler->filter('section#upload figure jus-upload > input[type="file"]');
        self::assertCount(1, $input);
        self::assertSame('exemplo-upload', $input->attr('id'));
        self::assertSame('arquivos[]', $input->attr('name'));
        self::assertSame('application/pdf', $input->attr('accept'));
        self::assertNotNull($input->attr('multiple'));
        self::assertStringContainsString('form-control', (string) $input->attr('class'));
        // The limits are stated for everyone, and tied to the input.
        self::assertSame('exemplo-upload-ajuda', $input->attr('aria-describedby'));
        $help = $crawler->filter('section#upload figure #exemplo-upload-ajuda');
        self::assertCount(1, $help);
        self::assertStringContainsString('5 arquivos', $help->text());
        self::assertStringContainsString('10 MB', $help->text());
        self::assertCount(1, $crawler->filter('section#upload figure label[for="exemplo-upload"]'));
        self::assertCount(0, $crawler->filter('section#upload figure form'));
        self::assertStringContainsString('<jus-upload max-size="10485760" max-files="5">', $crawler->filter('section#upload pre code')->text());
        self::assertSame(['max-size', 'max-files'], $crawler->filter('section#upload table tbody tr')->each(static fn (Crawler $row): string => trim($row->filter('th')->text())));
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

    public function testTheCaseCardTableDocumentsEveryPublicProp(): void
    {
        self::mockTime('2026-03-04 09:00:00');
        $client = self::createClient();

        $crawler = $client->request('GET', '/design-system');

        $props = array_map(
            static fn (\ReflectionProperty $property): string => $property->getName(),
            (new \ReflectionClass(CaseCard::class))->getProperties(\ReflectionProperty::IS_PUBLIC),
        );
        $table = $crawler->filter('section#case-card table')->first();
        $documented = $table->filter('tbody tr')->each(static fn (Crawler $row): string => trim($row->filter('th')->text()));
        self::assertSame([...$props, '(atributos)'], $documented, 'The props table lists the props of CaseCard.');

        $rows = [];
        $table->filter('tbody tr')->each(static function (Crawler $row) use (&$rows): void {
            $rows[trim($row->filter('th')->text())] = $row->filter('td')->each(static fn (Crawler $cell): string => trim($cell->text()));
        });
        self::assertSame(['?CaseEvent', 'null'], \array_slice($rows['latestEvent'], 0, 2));
        self::assertSame(['bool', 'false'], \array_slice($rows['latestEventKnown'], 0, 2));
        self::assertStringContainsString('nunca carrega os eventos do processo', $rows['latestEventKnown'][2]);
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

    public function testThePaginationExampleKeepsTheQueryStringAndReturnsToItsSection(): void
    {
        self::mockTime('2026-03-04 09:00:00');
        $client = self::createClient();

        $crawler = $client->request('GET', '/design-system?sort=size&direction=desc');

        $nav = $crawler->filter('section#pagination figure nav');
        self::assertSame('6', trim($nav->filter('[aria-current="page"]')->text()));
        self::assertSame('?sort=size&direction=desc&pagina=7#pagination', $nav->selectLink('Próxima')->attr('href'));
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
