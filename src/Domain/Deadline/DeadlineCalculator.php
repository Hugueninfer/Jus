<?php

declare(strict_types=1);

namespace App\Domain\Deadline;

/**
 * Procedural deadlines counted in business days (Brazilian Code of Civil Procedure, arts. 219, 220 and 224):
 * the start day is excluded; weekends, holidays and the court recess (Dec 20 to Jan 20) are skipped.
 */
final readonly class DeadlineCalculator
{
    private const int WARNING_THRESHOLD = 3;

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

    public function assess(\DateTimeImmutable $start, int $businessDays, \DateTimeImmutable $today, bool $fulfilled): DeadlineAssessment
    {
        $dueDate = $this->dueDate($start, $businessDays);
        $today = $today->setTime(0, 0);
        $daysLeft = $this->businessDaysBetween($today, $dueDate);

        $todayKey = $today->format('Y-m-d');
        $dueKey = $dueDate->format('Y-m-d');

        $urgency = match (true) {
            $fulfilled => Urgency::Fulfilled,
            $todayKey > $dueKey => Urgency::Overdue,
            $todayKey === $dueKey => Urgency::DueToday,
            $daysLeft <= self::WARNING_THRESHOLD => Urgency::Warning,
            default => Urgency::OnTrack,
        };

        return new DeadlineAssessment($dueDate, $daysLeft, $urgency);
    }

    /**
     * Business days after $from up to and including $to; zero when $to is not after $from.
     */
    private function businessDaysBetween(\DateTimeImmutable $from, \DateTimeImmutable $to): int
    {
        $count = 0;
        for ($day = self::nextDay($from); $day <= $to; $day = self::nextDay($day)) {
            if ($this->isBusinessDay($day)) {
                ++$count;
            }
        }

        return $count;
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
