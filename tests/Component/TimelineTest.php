<?php

declare(strict_types=1);

namespace App\Tests\Component;

use App\Domain\LegalCase\EventType;
use Symfony\Bundle\FrameworkBundle\Test\KernelTestCase;
use Symfony\UX\TwigComponent\Test\InteractsWithTwigComponents;

final class TimelineTest extends KernelTestCase
{
    use InteractsWithTwigComponents;

    public function testGroupsEventsByDayNewestFirst(): void
    {
        $case = Samples::legalCase();
        $case->record(EventType::Order, 'Cite-se a parte ré.', new \DateTimeImmutable('2024-04-02 09:30'));

        $timeline = $this->renderTwigComponent('Timeline', ['events' => $case->getEvents()])->crawler();

        $days = $timeline->filter('ol.jus-timeline > li');
        self::assertCount(2, $days);
        self::assertSame('2024-04-02', $days->eq(0)->filter('time')->attr('datetime'));
        self::assertSame('02/04/2024', trim($days->eq(0)->filter('h3 time')->text()));
        self::assertCount(2, $days->eq(0)->filter('li.jus-timeline-event'));
        self::assertSame('decision', $days->eq(0)->filter('li.jus-timeline-event')->eq(0)->attr('data-event-type'));
        self::assertSame('order', $days->eq(0)->filter('li.jus-timeline-event')->eq(1)->attr('data-event-type'));

        $filing = $days->eq(1)->filter('li.jus-timeline-event');
        self::assertSame('filing', $filing->attr('data-event-type'));
        self::assertStringContainsString('Juntada de petição — Petição inicial', $filing->text());
        self::assertStringContainsString('1 documento', $filing->text());
        self::assertSame('true', $filing->filter('i')->attr('aria-hidden'));
    }

    public function testSaysWhenThereAreNoEvents(): void
    {
        $timeline = $this->renderTwigComponent('Timeline', ['events' => []])->crawler();

        self::assertStringContainsString('Nenhuma movimentação.', $timeline->text());
    }
}
