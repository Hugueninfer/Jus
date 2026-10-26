<?php

declare(strict_types=1);

namespace App\Domain\Deadline;

interface HolidayCalendar
{
    /**
     * Works on the calendar date of $date: the time of day and the timezone are ignored.
     */
    public function isHoliday(\DateTimeImmutable $date): bool;
}
