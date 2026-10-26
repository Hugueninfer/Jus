<?php

declare(strict_types=1);

namespace App\Tests\Unit\Domain\Deadline;

use App\Domain\Deadline\DeadlineCalculator;
use App\Domain\Deadline\NationalHolidayCalendar;
use App\Domain\Deadline\Urgency;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

final class DeadlineCalculatorTest extends TestCase
{
    private DeadlineCalculator $calculator;

    protected function setUp(): void
    {
        $this->calculator = new DeadlineCalculator(new NationalHolidayCalendar());
    }

    /**
     * @return iterable<string, array{string, int, string}>
     */
    public static function dueDates(): iterable
    {
        yield 'weekdays only' => ['2026-03-02', 5, '2026-03-09'];
        yield 'start day is excluded, Friday start' => ['2026-03-06', 1, '2026-03-09'];
        yield 'start on a Saturday' => ['2026-03-07', 1, '2026-03-09'];
        yield 'fixed holiday (Tiradentes)' => ['2026-04-20', 2, '2026-04-23'];
        yield 'Carnival Monday and Tuesday' => ['2026-02-13', 1, '2026-02-18'];
        yield 'Good Friday' => ['2026-04-02', 1, '2026-04-06'];
        yield 'Corpus Christi' => ['2026-06-03', 1, '2026-06-05'];
        yield 'court recess, Dec 20 to Jan 20' => ['2026-12-18', 1, '2027-01-21'];
        yield 'counting resumes after the recess' => ['2026-12-14', 5, '2027-01-21'];
    }

    #[DataProvider('dueDates')]
    public function testDueDate(string $start, int $businessDays, string $expected): void
    {
        $due = $this->calculator->dueDate(new \DateTimeImmutable($start), $businessDays);

        self::assertSame($expected, $due->format('Y-m-d'));
    }

    public function testDueDateIgnoresTimeOfDay(): void
    {
        $due = $this->calculator->dueDate(new \DateTimeImmutable('2026-03-06 18:45'), 1);

        self::assertSame('2026-03-09 00:00', $due->format('Y-m-d H:i'));
    }

    public function testRejectsNonPositiveBusinessDays(): void
    {
        $this->expectException(\InvalidArgumentException::class);

        $this->calculator->dueDate(new \DateTimeImmutable('2026-03-02'), 0);
    }

    /**
     * Deadline used by every case: 5 business days from Monday 2026-03-02, due Monday 2026-03-09.
     *
     * @return iterable<string, array{string, bool, int, Urgency}>
     */
    public static function assessments(): iterable
    {
        yield 'more than 3 business days left' => ['2026-03-02', false, 5, Urgency::OnTrack];
        yield '4 business days left' => ['2026-03-03', false, 4, Urgency::OnTrack];
        yield '3 business days left' => ['2026-03-04', false, 3, Urgency::Warning];
        yield '1 business day left, weekend in between' => ['2026-03-06', false, 1, Urgency::Warning];
        yield 'today is a Saturday' => ['2026-03-07', false, 1, Urgency::Warning];
        yield 'due today' => ['2026-03-09', false, 0, Urgency::DueToday];
        yield 'overdue' => ['2026-03-10', false, 0, Urgency::Overdue];
        yield 'fulfilled wins over overdue' => ['2026-03-10', true, 0, Urgency::Fulfilled];
    }

    #[DataProvider('assessments')]
    public function testAssess(string $today, bool $fulfilled, int $expectedDaysLeft, Urgency $expectedUrgency): void
    {
        $assessment = $this->calculator->assess(new \DateTimeImmutable('2026-03-02'), 5, new \DateTimeImmutable($today), $fulfilled);

        self::assertSame('2026-03-09', $assessment->dueDate->format('Y-m-d'));
        self::assertSame($expectedDaysLeft, $assessment->businessDaysLeft);
        self::assertSame($expectedUrgency, $assessment->urgency);
    }

    public function testAssessIgnoresTimeOfDayOfToday(): void
    {
        $assessment = $this->calculator->assess(new \DateTimeImmutable('2026-03-02'), 5, new \DateTimeImmutable('2026-03-09 23:59'), false);

        self::assertSame(Urgency::DueToday, $assessment->urgency);
    }
}
