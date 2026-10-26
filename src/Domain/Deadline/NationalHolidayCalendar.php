<?php

declare(strict_types=1);

namespace App\Domain\Deadline;

/**
 * Brazilian national holidays, fixed and Easter-based.
 *
 * Illustrative calendar: every court publishes its own, so this implementation is meant to be replaceable.
 */
final readonly class NationalHolidayCalendar implements HolidayCalendar
{
    /** Month-day of fixed holidays. */
    private const array FIXED = ['01-01', '04-21', '05-01', '09-07', '10-12', '11-02', '11-15', '11-20', '12-25'];

    /** Days relative to Easter Sunday: Carnival Monday and Tuesday, Good Friday, Corpus Christi. */
    private const array EASTER_OFFSETS = [-48, -47, -2, 60];

    public function isHoliday(\DateTimeImmutable $date): bool
    {
        if (\in_array($date->format('m-d'), self::FIXED, true)) {
            return true;
        }

        $easter = Easter::sunday((int) $date->format('Y'));
        foreach (self::EASTER_OFFSETS as $offset) {
            if (self::shift($easter, $offset)->format('Y-m-d') === $date->format('Y-m-d')) {
                return true;
            }
        }

        return false;
    }

    private static function shift(\DateTimeImmutable $date, int $days): \DateTimeImmutable
    {
        $interval = new \DateInterval(\sprintf('P%dD', abs($days)));

        return $days < 0 ? $date->sub($interval) : $date->add($interval);
    }
}
