<?php

declare(strict_types=1);

namespace App\Presentation;

use App\Domain\Deadline\DeadlineCalculator;
use App\Entity\Deadline;
use App\Entity\LegalCase;
use App\Repository\DeadlineRepository;

/**
 * Deadlines of a case in reading order: open ones by due date, then fulfilled ones, latest first.
 */
final readonly class CaseDeadlines
{
    public function __construct(
        private DeadlineRepository $deadlines,
        private DeadlineCalculator $calculator,
    ) {
    }

    /**
     * @return list<Deadline>
     */
    public function forCase(LegalCase $case): array
    {
        $deadlines = $this->deadlines->findForCase($case);
        usort($deadlines, fn (Deadline $a, Deadline $b): int => $this->sortKey($a) <=> $this->sortKey($b));

        return $deadlines;
    }

    /**
     * @return array{int, int}
     */
    private function sortKey(Deadline $deadline): array
    {
        $fulfilledAt = $deadline->getFulfilledAt();
        if (null !== $fulfilledAt) {
            return [1, -$fulfilledAt->getTimestamp()];
        }

        return [0, $this->calculator->dueDate($deadline->getStartDate(), $deadline->getBusinessDays())->getTimestamp()];
    }
}
