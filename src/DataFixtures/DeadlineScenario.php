<?php

declare(strict_types=1);

namespace App\DataFixtures;

use App\Domain\Deadline\DeadlineCalculator;
use App\Domain\Deadline\Urgency;

/**
 * Picks summons dates so that the demo shows each urgency state relative to "today".
 */
final readonly class DeadlineScenario
{
    private const int MAX_DAYS_BACK = 90;

    public function __construct(private DeadlineCalculator $calculator)
    {
    }

    /**
     * Latest business-day start date (counting back from today; summonses are issued on court working days)
     * whose deadline has the wanted urgency, or null when the calendar makes it impossible today
     * (e.g. "due today" on a weekend).
     */
    public function startDateFor(Urgency $wanted, int $businessDays, \DateTimeImmutable $today): ?\DateTimeImmutable
    {
        if (Urgency::Fulfilled === $wanted) {
            throw new \InvalidArgumentException('Fulfilment is recorded on the deadline, not derived from its dates.');
        }

        $midnight = $today->setTime(0, 0);
        for ($daysBack = 0; $daysBack <= self::MAX_DAYS_BACK; ++$daysBack) {
            $start = $midnight->sub(new \DateInterval(\sprintf('P%dD', $daysBack)));
            if (!$this->calculator->isBusinessDay($start)) {
                continue;
            }

            if ($wanted === $this->calculator->assess($start, $businessDays, $today, false)->urgency) {
                return $start;
            }
        }

        return null;
    }
}
