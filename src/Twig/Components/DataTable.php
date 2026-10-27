<?php

declare(strict_types=1);

namespace App\Twig\Components;

use App\Presentation\EnumLabels;
use Symfony\Component\HttpFoundation\RequestStack;
use Symfony\UX\TwigComponent\Attribute\AsTwigComponent;

/**
 * Responsive table with server-side sorting through query-string links.
 */
#[AsTwigComponent]
final class DataTable
{
    /** @var list<array{key: string, label: string, sortable?: bool, format?: string, href?: string}> */
    public array $columns = [];

    /** @var list<array<string, mixed>> */
    public array $rows = [];

    public ?string $sort = null;

    public ?string $direction = 'asc';

    public ?string $caption = null;

    public ?string $anchor = null;

    public string $emptyMessage = 'Nenhum registro.';

    public function __construct(
        private readonly RequestStack $requestStack,
        private readonly EnumLabels $labels,
    ) {
    }

    public function activeSort(): ?string
    {
        return $this->activeColumn()['key'] ?? null;
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
        $column = $this->activeColumn();
        if (null === $column) {
            return $this->rows;
        }

        $key = $column['key'];
        $byLabel = 'label' === ($column['format'] ?? null);
        $collator = new \Collator('pt_BR');
        // "Anexo 2" before "Anexo 10": digit runs compare by their numeric value.
        $collator->setAttribute(\Collator::NUMERIC_COLLATION, \Collator::ON);
        $sign = 'desc' === $this->activeDirection() ? -1 : 1;
        $sortValue = function (array $row) use ($key, $byLabel): mixed {
            $value = $row[$key] ?? null;

            // An enum shown by its label sorts by that label, the text the reader sees.
            return $byLabel && $value instanceof \BackedEnum ? $this->labels->label($value) : $value;
        };
        $rows = $this->rows;
        // Negating the comparison (instead of reversing the result) keeps tied rows in their input order either way.
        usort($rows, static fn (array $a, array $b): int => $sign * self::compare($sortValue($a), $sortValue($b), $collator));

        return $rows;
    }

    public function ariaSort(string $key): string
    {
        if ($key !== $this->activeSort()) {
            return 'none';
        }

        return 'desc' === $this->activeDirection() ? 'descending' : 'ascending';
    }

    /**
     * Screen-reader hint appended to a sort link: the current order for the active column, the action for the others.
     */
    public function sortHint(string $key): string
    {
        if ($key !== $this->activeSort()) {
            return ', ordenar';
        }

        return 'desc' === $this->activeDirection() ? ', ordenado em ordem decrescente' : ', ordenado em ordem crescente';
    }

    public function sortHref(string $key): string
    {
        $direction = $key === $this->activeSort() && 'asc' === $this->activeDirection() ? 'desc' : 'asc';
        $query = [...($this->requestStack->getCurrentRequest()?->query->all() ?? []), 'sort' => $key, 'direction' => $direction];

        return '?'.http_build_query($query).(null !== $this->anchor ? '#'.$this->anchor : '');
    }

    /**
     * @return array{key: string, label: string, sortable?: bool, format?: string, href?: string}|null
     */
    private function activeColumn(): ?array
    {
        foreach ($this->columns as $column) {
            if ($column['key'] === $this->sort && ($column['sortable'] ?? false)) {
                return $column;
            }
        }

        return null;
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
