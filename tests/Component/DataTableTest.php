<?php

declare(strict_types=1);

namespace App\Tests\Component;

use Symfony\Bundle\FrameworkBundle\Test\KernelTestCase;
use Symfony\Component\DomCrawler\Crawler;
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

    public function testIgnoresUnknownOrUnsortableColumns(): void
    {
        $table = $this->table(['sort' => 'size', 'direction' => 'desc']);

        self::assertSame(['Petição inicial', 'Árvore genealógica', 'Contestação'], $this->column($table, 0));
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
    }

    /**
     * @param array<string, string> $props
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

    /**
     * @return list<string>
     */
    private function column(Crawler $table, int $index): array
    {
        return $table->filter('tbody tr')->each(static fn (Crawler $row): string => trim($row->filter('td')->eq($index)->text()));
    }
}
