<?php

declare(strict_types=1);

namespace App\Twig\Components;

use Symfony\Component\HttpFoundation\RequestStack;
use Symfony\UX\TwigComponent\Attribute\AsTwigComponent;

/**
 * Responsive table with server-side sorting through query-string links.
 */
#[AsTwigComponent]
final class DataTable
{
    /** @var list<array{key: string, label: string, sortable?: bool, format?: string}> */
    public array $columns = [];

    /** @var list<array<string, mixed>> */
    public array $rows = [];

    public ?string $sort = null;

    public string $direction = 'asc';

    public ?string $caption = null;

    public ?string $anchor = null;

    public string $emptyMessage = 'Nenhum registro.';

    public function __construct(private readonly RequestStack $requestStack)
    {
    }

    public function activeSort(): ?string
    {
        foreach ($this->columns as $column) {
            if ($column['key'] === $this->sort && ($column['sortable'] ?? false)) {
                return $this->sort;
            }
        }

        return null;
    }

    public function activeDirection(): string
    {
        return 'desc' === $this->direction ? 'desc' : 'asc';
    }

    /**
     * @return list<array<string, mixed>>
     */
    public function sortedRows(): array
    {
        $key = $this->activeSort();
        if (null === $key) {
            return $this->rows;
        }

        $collator = new \Collator('pt_BR');
        $rows = $this->rows;
        usort($rows, static fn (array $a, array $b): int => self::compare($a[$key] ?? null, $b[$key] ?? null, $collator));

        return 'desc' === $this->activeDirection() ? array_reverse($rows) : $rows;
    }

    public function ariaSort(string $key): string
    {
        if ($key !== $this->activeSort()) {
            return 'none';
        }

        return 'desc' === $this->activeDirection() ? 'descending' : 'ascending';
    }

    public function sortHref(string $key): string
    {
        $direction = $key === $this->activeSort() && 'asc' === $this->activeDirection() ? 'desc' : 'asc';
        $query = [...($this->requestStack->getCurrentRequest()?->query->all() ?? []), 'sort' => $key, 'direction' => $direction];

        return '?'.http_build_query($query).(null !== $this->anchor ? '#'.$this->anchor : '');
    }

    private static function compare(mixed $a, mixed $b, \Collator $collator): int
    {
        if ($a instanceof \DateTimeInterface && $b instanceof \DateTimeInterface) {
            return $a <=> $b;
        }

        if ((\is_int($a) || \is_float($a)) && (\is_int($b) || \is_float($b))) {
            return $a <=> $b;
        }

        $result = $collator->compare(self::text($a), self::text($b));

        return false === $result ? 0 : $result;
    }

    private static function text(mixed $value): string
    {
        return \is_scalar($value) || $value instanceof \Stringable ? (string) $value : '';
    }
}
