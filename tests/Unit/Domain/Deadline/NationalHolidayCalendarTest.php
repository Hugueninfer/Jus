<?php

declare(strict_types=1);

namespace App\Tests\Unit\Domain\Deadline;

use App\Domain\Deadline\NationalHolidayCalendar;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

final class NationalHolidayCalendarTest extends TestCase
{
    /**
     * @return iterable<string, array{string}>
     */
    public static function holidays(): iterable
    {
        yield 'New Year' => ['2026-01-01'];
        yield 'Tiradentes' => ['2026-04-21'];
        yield 'Labour Day' => ['2026-05-01'];
        yield 'Independence Day' => ['2026-09-07'];
        yield 'Our Lady of Aparecida' => ['2026-10-12'];
        yield 'All Souls Day' => ['2026-11-02'];
        yield 'Republic Day' => ['2026-11-15'];
        yield 'Black Consciousness Day' => ['2026-11-20'];
        yield 'Christmas' => ['2026-12-25'];
        yield 'Carnival Monday 2026' => ['2026-02-16'];
        yield 'Carnival Tuesday 2026' => ['2026-02-17'];
        yield 'Good Friday 2026' => ['2026-04-03'];
        yield 'Corpus Christi 2026' => ['2026-06-04'];
        yield 'Corpus Christi 2027' => ['2027-05-27'];
    }

    /**
     * @return iterable<string, array{string}>
     */
    public static function regularDays(): iterable
    {
        yield 'Ash Wednesday' => ['2026-02-18'];
        yield 'Easter Monday' => ['2026-04-06'];
        yield 'ordinary Tuesday' => ['2026-03-10'];
        yield '2026 Carnival date in 2027' => ['2027-02-16'];
    }

    #[DataProvider('holidays')]
    public function testRecognisesHolidays(string $date): void
    {
        self::assertTrue((new NationalHolidayCalendar())->isHoliday(new \DateTimeImmutable($date)));
    }

    #[DataProvider('regularDays')]
    public function testRegularDaysAreNotHolidays(string $date): void
    {
        self::assertFalse((new NationalHolidayCalendar())->isHoliday(new \DateTimeImmutable($date)));
    }
}
