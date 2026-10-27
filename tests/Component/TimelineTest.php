<?php

declare(strict_types=1);

namespace App\Tests\Component;

use App\Domain\LegalCase\EventType;
use App\Domain\LegalCase\FilingType;
use PHPUnit\Framework\Attributes\DataProvider;
use Symfony\Bundle\FrameworkBundle\Test\KernelTestCase;
use Symfony\Component\DomCrawler\Crawler;
use Symfony\UX\TwigComponent\Test\InteractsWithTwigComponents;

final class TimelineTest extends KernelTestCase
{
    use InteractsWithTwigComponents;

    public function testGroupsEventsByDayNewestFirst(): void
    {
        $case = Samples::legalCase();
        // Recorded out of chronological order on purpose.
        $case->record(EventType::Order, 'Cite-se a parte ré.', new \DateTimeImmutable('2024-04-02 09:30'));
        $case->record(EventType::Hearing, 'Audiência de conciliação.', new \DateTimeImmutable('2024-03-04 15:00'));

        // Oldest first, so only the component can put the days and events in newest-first order.
        $timeline = $this->renderTwigComponent('Timeline', ['events' => array_reverse($case->getEvents())])->crawler();

        $days = $timeline->filter('ol.jus-timeline > li');
        self::assertCount(2, $days);
        self::assertSame('2024-04-02', $days->eq(0)->filter('time')->attr('datetime'));
        self::assertSame('02/04/2024', trim($days->eq(0)->filter('h3 time')->text()));
        self::assertSame('2024-03-04', $days->eq(1)->filter('time')->attr('datetime'));
        self::assertSame('04/03/2024', trim($days->eq(1)->filter('h3 time')->text()));
        self::assertSame(['decision', 'order'], self::eventTypes($days->eq(0)));
        self::assertSame(['hearing', 'filing'], self::eventTypes($days->eq(1)));

        $filing = $days->eq(1)->filter('li.jus-timeline-event')->eq(1);
        self::assertStringContainsString('Juntada de petição — Petição inicial', $filing->text());
        self::assertStringContainsString('1 documento', $filing->text());
        self::assertSame('true', $filing->filter('i')->attr('aria-hidden'));
    }

    public function testSaysWhenThereAreNoEvents(): void
    {
        $timeline = $this->renderTwigComponent('Timeline', ['events' => []])->crawler();

        self::assertStringContainsString('Nenhuma movimentação.', $timeline->text());
    }

    /**
     * @return iterable<string, array{int, ?string}>
     */
    public static function documentCounts(): iterable
    {
        yield 'no documents' => [0, null];
        yield 'one document' => [1, '1 documento'];
        yield 'two documents' => [2, '2 documentos'];
    }

    #[DataProvider('documentCounts')]
    public function testCountsTheDocumentsOfAnEvent(int $documents, ?string $expected): void
    {
        $case = Samples::legalCase();
        $lawyer = $case->getParties()[0]->getLawyers()[0];
        $at = new \DateTimeImmutable('2024-05-06 11:00');
        $event = $case->file(FilingType::Exhibits, 'Documentos juntados.', $at, $lawyer);
        for ($i = 1; $i <= $documents; ++$i) {
            $event->attach('Anexo '.$i, 'anexo-'.$i.'.pdf', 'sample-'.$i.'.pdf', 1_024, $lawyer, $at);
        }

        $timeline = $this->renderTwigComponent('Timeline', ['events' => [$event]])->crawler();

        $paperclip = $timeline->filterXPath('//li[contains(@class, "jus-timeline-event")]//p[.//i[contains(@class, "bi-paperclip")]]');
        if (null === $expected) {
            self::assertCount(0, $paperclip);

            return;
        }

        self::assertCount(1, $paperclip);
        self::assertSame($expected, trim(preg_replace('/\s+/', ' ', $paperclip->text()) ?? ''));
    }

    public function testShowsAnIconForEveryEventType(): void
    {
        $case = Samples::legalCase();
        $lawyer = $case->getParties()[0]->getLawyers()[0];
        $at = new \DateTimeImmutable('2024-05-06 11:00');
        $events = [];
        foreach (EventType::cases() as $type) {
            if (EventType::Filing === $type) {
                $filing = $case->file(FilingType::Answer, 'Contestação.', $at, $lawyer);
                $filing->attach('Contestação', 'contestacao.pdf', 'sample-2.pdf', 2_048, $lawyer, $at);
                $events[] = $filing;

                continue;
            }

            $events[] = $case->record($type, 'Movimentação.', $at);
        }

        $timeline = $this->renderTwigComponent('Timeline', ['events' => $events])->crawler();

        $items = $timeline->filter('li.jus-timeline-event');
        self::assertCount(\count(EventType::cases()), $items);
        $items->each(static function (Crawler $item): void {
            $icon = $item->filter('i.bi')->first();
            self::assertSame('true', $icon->attr('aria-hidden'));
            $iconClasses = array_diff(preg_split('/\s+/', trim((string) $icon->attr('class'))) ?: [], ['bi']);
            self::assertNotEmpty($iconClasses, \sprintf('The "%s" event has no icon class.', $item->attr('data-event-type')));
            foreach ($iconClasses as $class) {
                self::assertStringStartsWith('bi-', $class);
            }
        });

        self::assertCount(1, $timeline->filter('i.bi-paperclip'));
        self::assertCount(0, $timeline->filter('i:not([aria-hidden="true"])'));
    }

    public function testKeepsListSemanticsAndLineBreaks(): void
    {
        $case = Samples::legalCase();
        $case->record(EventType::Order, "Primeira linha.\nSegunda linha.", new \DateTimeImmutable('2024-04-02 09:30'));

        $timeline = $this->renderTwigComponent('Timeline', ['events' => $case->getEvents()])->crawler();

        $lists = $timeline->filter('ol');
        self::assertCount(3, $lists); // the timeline and one list per day
        self::assertCount(3, $timeline->filter('ol[role="list"]'));
        self::assertSame("Primeira linha.\nSegunda linha.", $timeline->filter('p.jus-timeline-description')->eq(1)->text(null, false));
    }

    /**
     * @return list<string>
     */
    private static function eventTypes(Crawler $day): array
    {
        return $day->filter('li.jus-timeline-event')->each(static fn (Crawler $event): string => (string) $event->attr('data-event-type'));
    }
}
