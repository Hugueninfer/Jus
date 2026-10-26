<?php

declare(strict_types=1);

namespace App\Domain\Deadline;

final readonly class DeadlineAssessment
{
    public function __construct(
        public \DateTimeImmutable $dueDate,
        public int $businessDaysLeft,
        public Urgency $urgency,
    ) {
    }
}
