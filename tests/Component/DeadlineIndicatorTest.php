<?php

declare(strict_types=1);

namespace App\Tests\Component;

use App\Domain\LegalCase\EventType;
use App\Entity\Deadline;
use PHPUnit\Framework\Attributes\DataProvider;
use Symfony\Bundle\FrameworkBundle\Test\KernelTestCase;
use Symfony\Component\Clock\Test\ClockSensitiveTrait;
use Symfony\UX\TwigComponent\Test\InteractsWithTwigComponents;

final class DeadlineIndicatorTest extends KernelTestCase
{
    use ClockSensitiveTrait;
    use InteractsWithTwigComponents;

    /**
     * @return iterable<string, array{string, ?string, string, string, string}>
     */
    public static function states(): iterable
    {
        // summons date, fulfilled at, urgency, badge class, text
        yield 'on track' => ['2026-03-04', null, 'on_track', 'text-bg-success', 'Vence em 5 dias úteis (11/03)'];
        yield 'warning' => ['2026-03-02', null, 'warning', 'text-bg-warning', 'Vence em 3 dias úteis (09/03)'];
        yield 'one business day left' => ['2026-02-26', null, 'warning', 'text-bg-warning', 'Vence em 1 dia útil (05/03)'];
        yield 'due today' => ['2026-02-25', null, 'due_today', 'text-bg-danger', 'Vence hoje (04/03)'];
        yield 'overdue' => ['2026-02-24', null, 'overdue', 'text-bg-danger', 'Venceu em 03/03/2026'];
        yield 'fulfilled' => ['2026-02-24', '2026-02-26 16:00', 'fulfilled', 'text-bg-secondary', 'Cumprido em 26/02/2026'];
    }

    #[DataProvider('states')]
    public function testShowsTheDeadlineState(string $summonedOn, ?string $fulfilledAt, string $urgency, string $class, string $text): void
    {
        self::mockTime('2026-03-04 09:00:00');
        $case = Samples::legalCase();
        $party = $case->getParties()[0];
        $deadline = new Deadline($party, $case->record(EventType::Summons, 'Intimação.', new \DateTimeImmutable($summonedOn.' 08:00')), 5);
        if (null !== $fulfilledAt) {
            $deadline->fulfil(new \DateTimeImmutable($fulfilledAt));
        }

        $badge = $this->renderTwigComponent('DeadlineIndicator', ['deadline' => $deadline])->crawler()->filter('span.badge');

        self::assertSame($urgency, $badge->attr('data-urgency'));
        self::assertStringContainsString($class, (string) $badge->attr('class'));
        self::assertSame($text, trim(preg_replace('/\s+/', ' ', $badge->text()) ?? ''));
        self::assertSame('true', $badge->filter('i')->attr('aria-hidden'));
    }
}
