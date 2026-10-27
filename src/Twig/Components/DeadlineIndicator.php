<?php

declare(strict_types=1);

namespace App\Twig\Components;

use App\Domain\Deadline\DeadlineAssessment;
use App\Domain\Deadline\DeadlineCalculator;
use App\Entity\Deadline;
use Psr\Clock\ClockInterface;
use Symfony\UX\TwigComponent\Attribute\AsTwigComponent;

#[AsTwigComponent]
final class DeadlineIndicator
{
    public Deadline $deadline;

    public function __construct(
        private readonly DeadlineCalculator $calculator,
        private readonly ClockInterface $clock,
    ) {
    }

    public function assessment(): DeadlineAssessment
    {
        $startDate = $this->deadline->getStartDate();

        return $this->calculator->assess(
            $startDate,
            $this->deadline->getBusinessDays(),
            // "Today" is the calendar day where the deadline runs, not where the clock happens to be set.
            $this->clock->now()->setTimezone($startDate->getTimezone()),
            $this->deadline->isFulfilled(),
        );
    }
}
