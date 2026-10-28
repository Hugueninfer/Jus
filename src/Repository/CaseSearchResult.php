<?php

declare(strict_types=1);

namespace App\Repository;

use App\Entity\LegalCase;

final readonly class CaseSearchResult
{
    /**
     * @param list<LegalCase> $cases
     */
    public function __construct(
        public array $cases,
        public int $total,
        public int $page,
        public int $pages,
    ) {
    }
}
