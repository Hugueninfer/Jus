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
     * Page numbers to show; null marks a gap.
     *
     * @return list<?int>
     */
    public function items(): array
    {
        if ($this->pages <= self::SHOW_ALL_UP_TO) {
            return range(1, $this->pages);
        }

        $pages = array_unique([1, $this->page - 1, $this->page, $this->page + 1, $this->pages]);
        $pages = array_values(array_filter($pages, fn (int $page): bool => $page >= 1 && $page <= $this->pages));
        sort($pages);

        $items = [];
        foreach ($pages as $index => $page) {
            if ($index > 0 && $page - $pages[$index - 1] > 1) {
                $items[] = null;
            }
            $items[] = $page;
        }

        return $items;
    }

    public function pageHref(int $page): string
    {
        $query = [...($this->requestStack->getCurrentRequest()?->query->all() ?? []), $this->parameter => $page];

        return '?'.http_build_query($query).(null !== $this->anchor ? '#'.$this->anchor : '');
    }
}
