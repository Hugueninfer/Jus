<?php

declare(strict_types=1);

namespace App\Twig\Components;

use Symfony\Component\HttpFoundation\RequestStack;
use Symfony\UX\TwigComponent\Attribute\AsTwigComponent;

/**
 * Page links that keep the current query string; nothing is rendered for a single page.
 */
#[AsTwigComponent]
final class Pagination
{
    private const int SHOW_ALL_UP_TO = 7;

    public int $page = 1;

    public int $pages = 1;

    public string $parameter = 'pagina';

    public string $label = 'Paginação';

    public ?string $anchor = null;

    public function __construct(private readonly RequestStack $requestStack)
    {
    }

    /**
     * The number of pages, never less than one.
     */
    public function totalPages(): int
    {
        return max(1, $this->pages);
    }

    /**
     * The page shown as current, kept inside 1..totalPages so no link can point past the ends.
     */
    public function currentPage(): int
    {
        return max(1, min($this->page, $this->totalPages()));
    }

    /**
     * Page numbers to show; null marks a gap of two or more hidden pages.
     *
     * @return list<?int>
     */
    public function items(): array
    {
        $total = $this->totalPages();
        $current = $this->currentPage();
        if ($total <= self::SHOW_ALL_UP_TO) {
            return range(1, $total);
        }

        $pages = array_unique([1, $current - 1, $current, $current + 1, $total]);
        $pages = array_values(array_filter($pages, static fn (int $page): bool => $page >= 1 && $page <= $total));
        sort($pages);

        $items = [];
        foreach ($pages as $index => $page) {
            $jump = $index > 0 ? $page - $pages[$index - 1] : 1;
            if ($jump > 2) {
                $items[] = null;
            } elseif (2 === $jump) {
                // A gap would hide a single page; showing that page takes the same room.
                $items[] = $page - 1;
            }
            $items[] = $page;
        }

        return $items;
    }

    public function pageHref(int $page): string
    {
        $query = [...($this->requestStack->getCurrentRequest()?->query->all() ?? []), $this->parameter => $page];

        return '?'.http_build_query($query, '', '&', \PHP_QUERY_RFC3986).(null !== $this->anchor ? '#'.$this->anchor : '');
    }
}
