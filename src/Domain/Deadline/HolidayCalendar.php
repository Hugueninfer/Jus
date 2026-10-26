<?php

declare(strict_types=1);

namespace App\Domain\Deadline;

interface HolidayCalendar
{
    public function isHoliday(\DateTimeImmutable $date): bool;
}
