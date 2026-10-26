<?php

declare(strict_types=1);

namespace App\Tests\Unit\DataFixtures;

use App\DataFixtures\DeadlineScenario;
use App\Domain\Deadline\DeadlineCalculator;
use App\Domain\Deadline\NationalHolidayCalendar;
use App\Domain\Deadline\Urgency;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

final class DeadlineScenarioTest extends TestCase
{
    /**
     * @return iterable<string, array{Urgency, string}>
     */
    public static function reachableStates(): iterable
    {
        yield 'on track' => [Urgency::OnTrack, '2026-03-04 00:00'];
        yield 'warning' => [Urgency::Warning, '2026-03-02 00:00'];
        yield 'due today' => [Urgency::DueToday, '2026-02-25 00:00'];
        yield 'overdue' => [Urgency::Overdue, '2026-02-24 00:00'];
    }

    #[DataProvider('reachableStates')]
    public function testFindsAStartDateForEachState(Urgency $wanted, string $expected): void
    {
        $calculator = new DeadlineCalculator(new NationalHolidayCalendar());
        $today = new \DateTimeImmutable('2026-03-04 09:00');

        $start = (new DeadlineScenario($calculator))->startDateFor($wanted, 5, $today);

        self::assertNotNull($start);
        self::assertSame($expected, $start->format('Y-m-d H:i'));
        self::assertSame($wanted, $calculator->assess($start, 5, $today, false)->urgency);
    }

    public function testNothingIsDueOnAWeekend(): void
    {
        $scenario = new DeadlineScenario(new DeadlineCalculator(new NationalHolidayCalendar()));

        self::assertNull($scenario->startDateFor(Urgency::DueToday, 5, new \DateTimeImmutable('2026-03-07 09:00')));
    }

    public function testCourtRecessImpactsDeadline(): void
    {
        $calculator = new DeadlineCalculator(new NationalHolidayCalendar());
        $scenario = new DeadlineScenario($calculator);
        $today = new \DateTimeImmutable('2026-12-23 09:00');

        $dueToday = $scenario->startDateFor(Urgency::DueToday, 5, $today);
        $overdue = $scenario->startDateFor(Urgency::Overdue, 5, $today);

        self::assertNull($dueToday);
        self::assertNotNull($overdue);
        self::assertSame('2026-12-13 00:00', $overdue->format('Y-m-d H:i'));
        self::assertSame(Urgency::Overdue, $calculator->assess($overdue, 5, $today, false)->urgency);
    }

    public function testFulfilmentIsNotADate(): void
    {
        $scenario = new DeadlineScenario(new DeadlineCalculator(new NationalHolidayCalendar()));

        $this->expectException(\InvalidArgumentException::class);

        $scenario->startDateFor(Urgency::Fulfilled, 5, new \DateTimeImmutable('2026-03-04'));
    }
}
