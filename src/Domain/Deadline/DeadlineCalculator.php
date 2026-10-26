<?php

declare(strict_types=1);

namespace App\Domain\Deadline;

/**
 * Procedural deadlines counted in business days (Brazilian Code of Civil Procedure, arts. 219, 220 and 224):
 * the start day is excluded; weekends, holidays and the court recess (Dec 20 to Jan 20) are skipped.
 */
final readonly class DeadlineCalculator
{
    public function __construct(private HolidayCalendar $holidays)
    {
    }

    public function dueDate(\DateTimeImmutable $start, int $businessDays): \DateTimeImmutable
    {
        if ($businessDays < 1) {
            throw new \InvalidArgumentException(\sprintf('A deadline needs at least one business day, %d given.', $businessDays));
        }

        $day = $start->setTime(0, 0);
        $counted = 0;
        while ($counted < $businessDays) {
            $day = self::nextDay($day);
            if ($this->isBusinessDay($day)) {
                ++$counted;
            }
        }

        return $day;
    }

    private function isBusinessDay(\DateTimeImmutable $day): bool
    {
        return (int) $day->format('N') <= 5
            && !self::isCourtRecess($day)
            && !$this->holidays->isHoliday($day);
    }

    private static function isCourtRecess(\DateTimeImmutable $day): bool
    {
        $monthDay = $day->format('m-d');

        return $monthDay >= '12-20' || $monthDay <= '01-20';
    }

    private static function nextDay(\DateTimeImmutable $day): \DateTimeImmutable
    {
        return $day->add(new \DateInterval('P1D'));
    }
}
