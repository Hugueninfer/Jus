<?php

declare(strict_types=1);

namespace App\Tests\Component;

use App\Domain\LegalCase\CaseStatus;
use App\Domain\LegalCase\EventType;
use App\Domain\LegalCase\PartySide;
use Symfony\Bundle\FrameworkBundle\Test\KernelTestCase;
use Symfony\Component\DomCrawler\Crawler;
use Symfony\UX\TwigComponent\Test\InteractsWithTwigComponents;

final class CaseCardTest extends KernelTestCase
{
    use InteractsWithTwigComponents;

    public function testSummarisesTheCase(): void
    {
        $card = $this->renderTwigComponent('CaseCard', ['case' => Samples::legalCase()])->crawler();

        self::assertSame('0000001-39.2024.8.26.0100', trim($card->filter('h3')->text()));
        self::assertCount(0, $card->filter('h3 a'));
        self::assertSame('Procedimento Comum Cível', trim($card->filter('.card-body > p')->eq(0)->text()));
        self::assertSame('Indenização por dano moral · 1ª Vara Cível', trim($card->filter('.card-body > p')->eq(1)->text()));
        self::assertSame(['Polo ativo', 'Polo passivo'], self::texts($card->filter('dt')));
        self::assertSame(['Maria Oliveira', 'Empresa X Ltda.'], self::texts($card->filter('dd')));
        self::assertSame('Em andamento', trim($this->statusBadge($card)->text()));
        self::assertSame('Última movimentação: 02/04/2024 — Decisão', trim(preg_replace('/\s+/', ' ', $card->filter('.jus-case-card-last-event')->text()) ?? ''));
        self::assertSame('2024-04-02T16:00:00-03:00', $card->filter('.jus-case-card-last-event time')->attr('datetime'));
        self::assertCount(1, $card->filter('.badge'));
    }

    public function testLinksTheNumberAndFlagsConfidentialCases(): void
    {
        $card = $this->renderTwigComponent('CaseCard', [
            'case' => Samples::legalCase(confidential: true),
            'href' => '/processos/0000001-39.2024.8.26.0100',
        ])->crawler();

        self::assertSame('/processos/0000001-39.2024.8.26.0100', $card->filter('h3 a')->attr('href'));
        self::assertSame('0000001-39.2024.8.26.0100', trim($card->filter('h3 a')->text()));
        $confidential = $card->filter('.badge')->first();
        self::assertSame('Sigiloso', trim($confidential->text()));
        self::assertSame('true', $confidential->filter('i')->attr('aria-hidden'));
    }

    public function testPassesTheStatusToTheStatusBadge(): void
    {
        $card = $this->renderTwigComponent('CaseCard', ['case' => Samples::legalCase(status: CaseStatus::Suspended)])->crawler();

        $badge = $this->statusBadge($card);
        self::assertSame('Suspenso', trim($badge->text()));
        self::assertStringContainsString('text-bg-warning', (string) $badge->attr('class'));
    }

    public function testListsEachPartyInItsOwnDescription(): void
    {
        $case = Samples::legalCase();
        $case->addParty('João Souza', '987.654.321-00', PartySide::Plaintiff);
        $case->addParty('Empresa Y S.A.', '98.765.432/0001-10', PartySide::Defendant);

        $card = $this->renderTwigComponent('CaseCard', ['case' => $case])->crawler();

        $list = $card->filter('dl');
        self::assertSame(['dt', 'dd', 'dd', 'dt', 'dd', 'dd'], $list->children()->each(static fn (Crawler $node): string => $node->nodeName()));
        self::assertSame(['Polo ativo', 'Maria Oliveira', 'João Souza', 'Polo passivo', 'Empresa X Ltda.', 'Empresa Y S.A.'], self::texts($list->children()));
    }

    public function testShowsADashForASideWithoutParties(): void
    {
        $case = Samples::bareCase();
        $case->addParty('Maria Oliveira', '123.456.789-00', PartySide::Plaintiff);

        $card = $this->renderTwigComponent('CaseCard', ['case' => $case])->crawler();

        self::assertSame(['Polo ativo', 'Maria Oliveira', 'Polo passivo', '—'], self::texts($card->filter('dl')->children()));
    }

    public function testShowsTheLatestEventItIsGivenInsteadOfLookingItUpInTheCase(): void
    {
        // Not the case's own newest event (a decision on 02/04/2024): the card must show this one, as the search page
        // hands it the events it fetched for the whole page in a single query.
        $hearing = Samples::bareCase()->record(EventType::Hearing, 'Audiência de conciliação.', new \DateTimeImmutable('2024-05-06 14:00'));

        $card = $this->renderTwigComponent('CaseCard', ['case' => Samples::legalCase(), 'latestEvent' => $hearing])->crawler();

        self::assertSame('Última movimentação: 06/05/2024 — Audiência', trim(preg_replace('/\s+/', ' ', $card->filter('.jus-case-card-last-event')->text()) ?? ''));
        self::assertSame('2024-05-06T14:00:00-03:00', $card->filter('.jus-case-card-last-event time')->attr('datetime'));
    }

    public function testTrustsACallerThatSaysTheCaseHasNoLatestEvent(): void
    {
        // The search page looks the latest events up for the whole page; a case missing from that lookup has none, so
        // the card must not fall back to reading the case's own events (one query per case).
        $card = $this->renderTwigComponent('CaseCard', ['case' => Samples::legalCase(), 'latestEvent' => null, 'latestEventKnown' => true])->crawler();

        self::assertCount(1, $card->filter('article.jus-case-card'));
        self::assertCount(0, $card->filter('.jus-case-card-last-event'));
    }

    public function testStillShowsTheGivenLatestEventWhenTheCallerKnowsIt(): void
    {
        $hearing = Samples::bareCase()->record(EventType::Hearing, 'Audiência de conciliação.', new \DateTimeImmutable('2024-05-06 14:00'));

        $card = $this->renderTwigComponent('CaseCard', ['case' => Samples::legalCase(), 'latestEvent' => $hearing, 'latestEventKnown' => true])->crawler();

        self::assertStringContainsString('Audiência', $card->filter('.jus-case-card-last-event')->text());
    }

    public function testLeavesOutTheLastEventWhenThereIsNone(): void
    {
        $card = $this->renderTwigComponent('CaseCard', ['case' => Samples::bareCase()])->crawler();

        self::assertCount(1, $card->filter('article.jus-case-card'));
        self::assertCount(0, $card->filter('.jus-case-card-last-event'));
        self::assertCount(0, $card->filter('time'));
    }

    private function statusBadge(Crawler $card): Crawler
    {
        // The StatusBadge is the last badge of the header; the confidential one, when present, comes first.
        return $card->filter('.card-body > div')->first()->filter('.badge')->last();
    }

    /**
     * @return list<string>
     */
    private static function texts(Crawler $nodes): array
    {
        return $nodes->each(static fn (Crawler $node): string => trim($node->text()));
    }
}
