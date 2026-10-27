<?php

declare(strict_types=1);

namespace App\Tests\Component;

use Symfony\Bundle\FrameworkBundle\Test\KernelTestCase;
use Symfony\Component\DomCrawler\Crawler;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\RequestStack;
use Symfony\UX\TwigComponent\Test\InteractsWithTwigComponents;

final class DataTableTest extends KernelTestCase
{
    use InteractsWithTwigComponents;

    private const array COLUMNS = [
        ['key' => 'title', 'label' => 'Título', 'sortable' => true],
        ['key' => 'uploadedAt', 'label' => 'Data', 'sortable' => true, 'format' => 'date'],
        ['key' => 'size', 'label' => 'Tamanho', 'format' => 'bytes'],
    ];

    public function testKeepsTheGivenOrderWithoutASort(): void
    {
        $table = $this->table([]);

        self::assertSame(['Petição inicial', 'Árvore genealógica', 'Contestação'], $this->column($table, 0));
        self::assertSame('none', $table->filter('th')->eq(0)->attr('aria-sort'));
        self::assertSame('?sort=title&direction=asc', $table->filter('th a')->eq(0)->attr('href'));
        self::assertCount(0, $table->filter('th')->eq(2)->filter('a'));
    }

    public function testSortsTextWithPortugueseCollation(): void
    {
        $table = $this->table(['sort' => 'title', 'direction' => 'asc']);

        self::assertSame(['Árvore genealógica', 'Contestação', 'Petição inicial'], $this->column($table, 0));
        self::assertSame('ascending', $table->filter('th')->eq(0)->attr('aria-sort'));
        self::assertSame('?sort=title&direction=desc', $table->filter('th a')->eq(0)->attr('href'));
    }

    public function testSortsDatesByTimeAndFormatsThem(): void
    {
        $table = $this->table(['sort' => 'uploadedAt', 'direction' => 'desc', 'anchor' => 'documentos']);

        self::assertSame(['15/03/2024', '04/03/2024', '28/02/2024'], $this->column($table, 1));
        self::assertSame('descending', $table->filter('th')->eq(1)->attr('aria-sort'));
        self::assertSame('?sort=uploadedAt&direction=asc#documentos', $table->filter('th a')->eq(1)->attr('href'));
    }

    public function testSortsNumbersNumericallyNotAsText(): void
    {
        $columns = [['key' => 'pages', 'label' => 'Páginas', 'sortable' => true]];
        $rows = [['pages' => 10], ['pages' => 9.5], ['pages' => 100], ['pages' => 2]];

        $ascending = $this->table(['columns' => $columns, 'rows' => $rows, 'sort' => 'pages', 'direction' => 'asc']);
        $descending = $this->table(['columns' => $columns, 'rows' => $rows, 'sort' => 'pages', 'direction' => 'desc']);

        self::assertSame(['2', '9.5', '10', '100'], $this->column($ascending, 0));
        self::assertSame(['100', '10', '9.5', '2'], $this->column($descending, 0));
    }

    public function testKeepsTiedRowsInTheirOriginalOrderInBothDirections(): void
    {
        $columns = [['key' => 'code', 'label' => 'Código'], ['key' => 'status', 'label' => 'Situação', 'sortable' => true]];
        $rows = [
            ['code' => 'a', 'status' => 'Pendente'],
            ['code' => 'b', 'status' => 'Concluído'],
            ['code' => 'c', 'status' => 'Pendente'],
            ['code' => 'd', 'status' => 'Concluído'],
        ];

        $ascending = $this->table(['columns' => $columns, 'rows' => $rows, 'sort' => 'status', 'direction' => 'asc']);
        $descending = $this->table(['columns' => $columns, 'rows' => $rows, 'sort' => 'status', 'direction' => 'desc']);

        self::assertSame(['b', 'd', 'a', 'c'], $this->column($ascending, 0));
        self::assertSame(['a', 'c', 'b', 'd'], $this->column($descending, 0));
    }

    public function testTreatsANullDirectionAsAscending(): void
    {
        $table = $this->table(['sort' => 'title', 'direction' => null]);

        self::assertSame(['Árvore genealógica', 'Contestação', 'Petição inicial'], $this->column($table, 0));
        self::assertSame('ascending', $table->filter('th')->eq(0)->attr('aria-sort'));
        self::assertSame('?sort=title&direction=desc', $table->filter('th a')->eq(0)->attr('href'));
    }

    public function testIgnoresUnknownOrUnsortableColumns(): void
    {
        $unsortable = $this->table(['sort' => 'size', 'direction' => 'desc']);
        $unknown = $this->table(['sort' => 'nonexistent', 'direction' => 'desc']);

        foreach ([$unsortable, $unknown] as $table) {
            self::assertSame(['Petição inicial', 'Árvore genealógica', 'Contestação'], $this->column($table, 0));
            self::assertCount(0, $table->filter('[aria-sort="ascending"], [aria-sort="descending"], [aria-current]'));
            self::assertCount(0, $table->filter('th .bi'));
        }
    }

    public function testLabelsEveryCellAndFormatsSizes(): void
    {
        $table = $this->table(['caption' => 'Documentos do processo']);

        self::assertSame('Documentos do processo', trim($table->filter('caption')->text()));
        self::assertSame('Tamanho', $table->filter('tbody tr')->eq(0)->filter('td')->eq(2)->attr('data-label'));
        self::assertSame('180 KB', trim($table->filter('tbody tr')->eq(0)->filter('td')->eq(2)->text()));
        self::assertSame('col', $table->filter('th')->eq(0)->attr('scope'));
    }

    public function testShowsAnEmptyMessage(): void
    {
        $table = $this->renderTwigComponent('DataTable', ['columns' => self::COLUMNS, 'rows' => [], 'emptyMessage' => 'Nenhum documento.'])->crawler();

        self::assertSame('Nenhum documento.', trim($table->filter('tbody td')->text()));
        self::assertSame('3', $table->filter('tbody td')->attr('colspan'));
        self::assertNull($table->filter('tbody td')->attr('data-label'));
    }

    public function testKeepsTheOtherQueryParametersInTheSortLinks(): void
    {
        $this->requestStack()->push(new Request(['page' => '2', 'q' => 'a b', 'sort' => 'old', 'direction' => 'desc']));

        $table = $this->table(['sort' => 'title', 'direction' => 'asc', 'anchor' => 'documentos']);

        self::assertSame('?page=2&q=a+b&sort=title&direction=desc#documentos', $table->filter('th a')->eq(0)->attr('href'));
        self::assertSame('?page=2&q=a+b&sort=uploadedAt&direction=asc#documentos', $table->filter('th a')->eq(1)->attr('href'));
        self::assertSame($table->filter('th a')->eq(1)->attr('href'), $table->filter('nav a')->eq(1)->attr('href'));
    }

    public function testWrapsTheTableAndKeepsTheAttributesOnIt(): void
    {
        $wrapper = $this->table(['class' => 'mb-4', 'id' => 'documentos'])->filter('div.jus-data-table-wrapper');

        self::assertCount(1, $wrapper);
        self::assertNull($wrapper->attr('id'));
        self::assertSame('table align-middle jus-data-table mb-4', $wrapper->children('table')->attr('class'));
        self::assertSame('documentos', $wrapper->children('table')->attr('id'));
    }

    public function testOffersTheSortLinksBelowTheMdBreakpoint(): void
    {
        $nav = $this->table(['sort' => 'title', 'direction' => 'asc'])->filter('div.jus-data-table-wrapper > nav.jus-data-table-sort');

        self::assertCount(1, $nav);
        self::assertStringContainsString('d-md-none', (string) $nav->attr('class'));
        self::assertSame('Ordenar tabela', $nav->attr('aria-label'));
        self::assertStringContainsString('Ordenar por:', $nav->text());

        $links = $nav->filter('a');
        self::assertCount(2, $links);
        self::assertSame('?sort=title&direction=desc', $links->eq(0)->attr('href'));
        self::assertSame('?sort=uploadedAt&direction=asc', $links->eq(1)->attr('href'));
        self::assertSame('true', $links->eq(0)->attr('aria-current'));
        self::assertNull($links->eq(1)->attr('aria-current'));
        self::assertStringContainsString('Título', $links->eq(0)->text());
        self::assertStringContainsString('crescente', $links->eq(0)->filter('[aria-hidden="true"]')->text());
    }

    public function testShowsTheDescendingDirectionInTheSortLinks(): void
    {
        $link = $this->table(['sort' => 'uploadedAt', 'direction' => 'desc'])->filter('nav a[aria-current]');

        self::assertCount(1, $link);
        self::assertStringContainsString('Data', $link->text());
        self::assertSame('(decrescente)', trim($link->filter('[aria-hidden="true"]')->text()));
    }

    public function testOmitsTheSortLinksWhenNoColumnIsSortable(): void
    {
        $table = $this->table(['columns' => [['key' => 'title', 'label' => 'Título'], ['key' => 'size', 'label' => 'Tamanho']]]);

        self::assertCount(0, $table->filter('nav'));
        self::assertCount(1, $table->filter('div.jus-data-table-wrapper > table'));
    }

    public function testDescribesTheSortLinksForScreenReaders(): void
    {
        $table = $this->table(['sort' => 'title', 'direction' => 'asc']);

        foreach (['th a', 'nav a'] as $selector) {
            $links = $table->filter($selector);

            self::assertSame(', ordenado em ordem crescente', $links->eq(0)->filter('.visually-hidden')->text());
            self::assertSame(', ordenar', $links->eq(1)->filter('.visually-hidden')->text());
        }

        $descending = $this->table(['sort' => 'uploadedAt', 'direction' => 'desc']);

        foreach (['th a', 'nav a'] as $selector) {
            self::assertSame(', ordenado em ordem decrescente', $descending->filter($selector)->eq(1)->filter('.visually-hidden')->text());
        }
    }

    /**
     * @param array<string, mixed> $props
     */
    private function table(array $props): Crawler
    {
        return $this->renderTwigComponent('DataTable', [
            'columns' => self::COLUMNS,
            'rows' => [
                ['title' => 'Petição inicial', 'uploadedAt' => new \DateTimeImmutable('2024-03-04 10:00'), 'size' => 184_320],
                ['title' => 'Árvore genealógica', 'uploadedAt' => new \DateTimeImmutable('2024-02-28 15:00'), 'size' => 52_000],
                ['title' => 'Contestação', 'uploadedAt' => new \DateTimeImmutable('2024-03-15 09:00'), 'size' => 1_572_864],
            ],
            ...$props,
        ])->crawler();
    }

    private function requestStack(): RequestStack
    {
        return static::getContainer()->get('request_stack');
    }

    /**
     * @return list<string>
     */
    private function column(Crawler $table, int $index): array
    {
        return $table->filter('tbody tr')->each(static fn (Crawler $row): string => trim($row->filter('td')->eq($index)->text()));
    }
}
