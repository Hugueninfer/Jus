<?php

declare(strict_types=1);

namespace App\Tests\Component;

use App\Twig\Components\Pagination;
use PHPUnit\Framework\Attributes\DataProvider;
use Symfony\Bundle\FrameworkBundle\Test\KernelTestCase;
use Symfony\Component\DomCrawler\Crawler;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\RequestStack;
use Symfony\UX\TwigComponent\Test\InteractsWithTwigComponents;

final class PaginationTest extends KernelTestCase
{
    use InteractsWithTwigComponents;

    public function testRendersNothingForASinglePage(): void
    {
        self::assertSame('', trim((string) $this->renderTwigComponent('Pagination', ['page' => 1, 'pages' => 1])));
    }

    public function testMarksTheCurrentPageAndLinksTheOthers(): void
    {
        $nav = $this->renderTwigComponent('Pagination', ['page' => 2, 'pages' => 3, 'label' => 'Paginação dos resultados'])->crawler()->filter('nav');

        self::assertSame('Paginação dos resultados', $nav->attr('aria-label'));
        self::assertSame('2', trim($nav->filter('[aria-current="page"]')->text()));
        self::assertCount(0, $nav->filter('a[aria-current]'));
        self::assertSame('?pagina=1', $nav->selectLink('Anterior')->attr('href'));
        self::assertSame('?pagina=3', $nav->selectLink('Próxima')->attr('href'));
        self::assertSame('?pagina=3', $nav->selectLink('3')->attr('href'));
    }

    public function testHidesPreviousOnTheFirstPageAndNextOnTheLast(): void
    {
        $first = $this->renderTwigComponent('Pagination', ['page' => 1, 'pages' => 2])->crawler();
        $last = $this->renderTwigComponent('Pagination', ['page' => 2, 'pages' => 2])->crawler();

        self::assertCount(0, $first->selectLink('Anterior'));
        self::assertCount(0, $last->selectLink('Próxima'));
    }

    public function testCollapsesLongRanges(): void
    {
        $items = $this->renderTwigComponent('Pagination', ['page' => 6, 'pages' => 12])->crawler()->filter('li.page-item:not(.jus-pagination-step)');

        self::assertSame(['1', '…', '5', '6', '7', '…', '12'], $items->each(static fn ($item): string => trim($item->text())));
        self::assertSame('true', $items->eq(1)->attr('aria-hidden'));
        self::assertSame('true', $items->eq(1)->filter('span')->attr('aria-hidden'));
    }

    /**
     * @return iterable<string, array{int, int, list<string>}>
     */
    public static function windows(): iterable
    {
        yield 'seven pages show them all' => [4, 7, ['1', '2', '3', '4', '5', '6', '7']];
        yield 'eight pages start collapsing' => [1, 8, ['1', '2', '…', '8']];
        yield 'eight pages, window near the start' => [4, 8, ['1', '2', '3', '4', '5', '…', '8']];
        yield 'eight pages, one page skipped at the end is shown' => [5, 8, ['1', '…', '4', '5', '6', '7', '8']];
        yield 'one skipped page is shown, not hidden behind a gap' => [4, 12, ['1', '2', '3', '4', '5', '…', '12']];
        yield 'one skipped page before the last is shown' => [9, 12, ['1', '…', '8', '9', '10', '11', '12']];
        yield 'first page of a long range' => [1, 12, ['1', '2', '…', '12']];
        yield 'second page of a long range' => [2, 12, ['1', '2', '3', '…', '12']];
        yield 'last page of a long range' => [12, 12, ['1', '…', '11', '12']];
        yield 'middle of a long range' => [6, 12, ['1', '…', '5', '6', '7', '…', '12']];
    }

    /**
     * @param list<string> $expected
     */
    #[DataProvider('windows')]
    public function testShowsAWindowAroundTheCurrentPage(int $page, int $pages, array $expected): void
    {
        $items = $this->renderTwigComponent('Pagination', ['page' => $page, 'pages' => $pages])->crawler()->filter('li.page-item:not(.jus-pagination-step)');

        self::assertSame($expected, $items->each(static fn (Crawler $item): string => trim($item->text())));
        self::assertSame((string) $page, trim($items->filter('[aria-current="page"]')->text()));
    }

    public function testShowsEveryPageUpToTheThresholdAndCollapsesBeyondIt(): void
    {
        $seven = $this->renderTwigComponent('Pagination', ['page' => 1, 'pages' => 7])->crawler();
        $eight = $this->renderTwigComponent('Pagination', ['page' => 1, 'pages' => 8])->crawler();

        self::assertCount(0, $seven->filter('li[aria-hidden="true"]'));
        self::assertCount(7, $seven->filter('li.page-item:not(.jus-pagination-step)'));
        self::assertCount(1, $eight->filter('li[aria-hidden="true"]'));
        self::assertCount(4, $eight->filter('li.page-item:not(.jus-pagination-step)'));
    }

    public function testClampsAPageBeyondTheLastToTheLast(): void
    {
        $nav = $this->renderTwigComponent('Pagination', ['page' => 20, 'pages' => 12])->crawler()->filter('nav');

        self::assertSame('12', trim($nav->filter('[aria-current="page"]')->text()));
        self::assertSame('?pagina=11', $nav->selectLink('Anterior')->attr('href'));
        self::assertCount(0, $nav->selectLink('Próxima'));
        // "Anterior", then "1" and "11": nothing links past the last page.
        self::assertSame(['?pagina=11', '?pagina=1', '?pagina=11'], $nav->filter('a')->each(static fn (Crawler $link): string => (string) $link->attr('href')));
    }

    public function testClampsAPageBeforeTheFirstToTheFirst(): void
    {
        $nav = $this->renderTwigComponent('Pagination', ['page' => -3, 'pages' => 5])->crawler()->filter('nav');

        self::assertSame('1', trim($nav->filter('[aria-current="page"]')->text()));
        self::assertCount(0, $nav->selectLink('Anterior'));
        self::assertSame('?pagina=2', $nav->selectLink('Próxima')->attr('href'));
    }

    public function testTreatsFewerThanOnePageAsOne(): void
    {
        self::assertSame('', trim((string) $this->renderTwigComponent('Pagination', ['page' => 1, 'pages' => 0])));
        self::assertSame('', trim((string) $this->renderTwigComponent('Pagination', ['page' => 3, 'pages' => -2])));

        $pagination = new Pagination(new RequestStack());
        $pagination->pages = 0;
        $pagination->page = 5;
        self::assertSame([1], $pagination->items());
        self::assertSame(1, $pagination->currentPage());
        self::assertSame(1, $pagination->totalPages());
    }

    public function testUsesTheGivenParameterName(): void
    {
        $this->requestStack()->push(Request::create('/processos?pagina=9&p=1&status=active'));

        $nav = $this->renderTwigComponent('Pagination', ['page' => 1, 'pages' => 3, 'parameter' => 'p'])->crawler();

        // Only the configured parameter is replaced; "pagina" is just another query parameter here.
        self::assertSame('?pagina=9&p=2&status=active', $nav->selectLink('Próxima')->attr('href'));
        self::assertSame('?pagina=9&p=3&status=active', $nav->selectLink('3')->attr('href'));
    }

    public function testEncodesTheQueryStringTheSameWayEveryTime(): void
    {
        $this->requestStack()->push(Request::create('/processos?parte=Maria%20da%20Silva&ano=2024'));

        $nav = $this->renderTwigComponent('Pagination', ['page' => 1, 'pages' => 2])->crawler();

        // RFC 3986: a space is %20, never "+".
        self::assertSame('?parte=Maria%20da%20Silva&ano=2024&pagina=2', $nav->selectLink('Próxima')->attr('href'));
    }

    public function testKeepsTheOtherQueryParameters(): void
    {
        $stack = self::getContainer()->get(RequestStack::class);
        $stack->push(Request::create('/processos?parte=maria&status=active&pagina=1'));

        $nav = $this->renderTwigComponent('Pagination', ['page' => 1, 'pages' => 2, 'anchor' => 'resultados'])->crawler();

        self::assertSame('?parte=maria&status=active&pagina=2#resultados', $nav->selectLink('Próxima')->attr('href'));
    }

    private function requestStack(): RequestStack
    {
        return self::getContainer()->get(RequestStack::class);
    }
}
