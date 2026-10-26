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
     * @return iterable<string, array{Urgency}>
     */
    public static function reachableStates(): iterable
    {
        yield 'on track' => [Urgency::OnTrack];
        yield 'warning' => [Urgency::Warning];
        yield 'due today' => [Urgency::DueToday];
        yield 'overdue' => [Urgency::Overdue];
    }

    #[DataProvider('reachableStates')]
    public function testFindsAStartDateForEachState(Urgency $wanted): void
    {
        $calculator = new DeadlineCalculator(new NationalHolidayCalendar());
        $today = new \DateTimeImmutable('2026-03-04 09:00');

        $start = (new DeadlineScenario($calculator))->startDateFor($wanted, 5, $today);

        self::assertNotNull($start);
        self::assertSame($wanted, $calculator->assess($start, 5, $today, false)->urgency);
        self::assertLessThanOrEqual($today, $start);
    }

    public function testNothingIsDueOnAWeekend(): void
    {
        $scenario = new DeadlineScenario(new DeadlineCalculator(new NationalHolidayCalendar()));

        self::assertNull($scenario->startDateFor(Urgency::DueToday, 5, new \DateTimeImmutable('2026-03-07 09:00')));
    }

    public function testFulfilmentIsNotADate(): void
    {
        $scenario = new DeadlineScenario(new DeadlineCalculator(new NationalHolidayCalendar()));

        $this->expectException(\InvalidArgumentException::class);

        $scenario->startDateFor(Urgency::Fulfilled, 5, new \DateTimeImmutable('2026-03-04'));
    }
}
