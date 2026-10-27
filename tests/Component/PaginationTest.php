<?php

declare(strict_types=1);

namespace App\Tests\Component;

use Symfony\Bundle\FrameworkBundle\Test\KernelTestCase;
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
        self::assertSame('true', $items->eq(1)->filter('span')->attr('aria-hidden'));
    }

    public function testKeepsTheOtherQueryParameters(): void
    {
        $stack = self::getContainer()->get(RequestStack::class);
        $stack->push(Request::create('/processos?parte=maria&status=active&pagina=1'));

        $nav = $this->renderTwigComponent('Pagination', ['page' => 1, 'pages' => 2, 'anchor' => 'resultados'])->crawler();

        self::assertSame('?parte=maria&status=active&pagina=2#resultados', $nav->selectLink('Próxima')->attr('href'));
    }
}
