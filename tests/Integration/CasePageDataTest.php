<?php

declare(strict_types=1);

namespace App\Tests\Integration;

use App\Domain\CnjNumber;
use App\Domain\LegalCase\EventType;
use App\Domain\LegalCase\FilingType;
use App\Entity\CaseEvent;
use App\Entity\Deadline;
use App\Entity\Document;
use App\Entity\LegalCase;
use App\Entity\Party;
use App\Entity\User;
use App\Presentation\CaseDeadlines;
use App\Presentation\CaseDocumentsTable;
use App\Repository\LegalCaseRepository;
use App\Tests\Support\QueryRecorder;
use App\Tests\Support\TestCases;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\Test\KernelTestCase;

final class CasePageDataTest extends KernelTestCase
{
    private TestCases $data;
    private LegalCaseRepository $cases;
    private EntityManagerInterface $em;
    private QueryRecorder $queries;

    protected function setUp(): void
    {
        self::bootKernel();
        $this->em = self::getContainer()->get(EntityManagerInterface::class);
        $this->data = new TestCases($this->em);
        $this->cases = self::getContainer()->get(LegalCaseRepository::class);
        $this->queries = QueryRecorder::instance();
    }

    public function testLoadsTheWholeCaseInOneQuery(): void
    {
        $ana = $this->data->lawyer('ana@jus.test', 'Ana Ribeiro');
        $bruno = $this->data->lawyer('bruno@jus.test', 'Bruno Teixeira');
        $case = $this->data->legalCase('0000001', $bruno);
        $case->getParties()[0]->addLawyer($ana);
        $this->em->flush();
        $number = $case->getNumber();
        $this->em->clear(); // forget what was persisted above: the page must load everything it shows

        $this->queries->reset();
        $loaded = $this->cases->findOneForPage($number);
        self::assertInstanceOf(LegalCase::class, $loaded);

        $parties = $loaded->getParties();
        $lawyers = array_map(static fn (User $lawyer): string => $lawyer->getName(), $parties[0]->getLawyers());
        $events = array_map(static fn (CaseEvent $event): EventType => $event->getType(), $loaded->getEvents());
        $documents = array_map(static fn (Document $document): string => $document->getTitle(), $loaded->getDocuments());

        self::assertSame(['Maria Oliveira', 'Empresa X Ltda.'], array_map(static fn (Party $party): string => $party->getName(), $parties));
        self::assertSame(['Ana Ribeiro', 'Bruno Teixeira'], $lawyers);
        self::assertSame([], $parties[1]->getLawyers());
        self::assertSame([EventType::Decision, EventType::Filing], $events);
        self::assertSame(['Petição inicial'], $documents);
        self::assertCount(1, $this->queries->selects(), 'parties, lawyers, events and documents come with the case, not from lazy loads');
    }

    public function testALoneCaseWithoutEventsStillLoadsInOneQuery(): void
    {
        $ana = $this->data->lawyer('ana@jus.test', 'Ana Ribeiro');
        $number = $this->data->legalCase('0000001', $ana, withEvents: false)->getNumber();
        $this->em->clear();

        $this->queries->reset();
        $loaded = $this->cases->findOneForPage($number);

        self::assertNotNull($loaded);
        self::assertCount(2, $loaded->getParties());
        self::assertSame([], $loaded->getEvents());
        self::assertSame([], $loaded->getDocuments());
        self::assertCount(1, $this->queries->selects());
    }

    public function testAnUnknownNumberIsNotFound(): void
    {
        $ana = $this->data->lawyer('ana@jus.test', 'Ana Ribeiro');
        $this->data->legalCase('0000001', $ana);

        self::assertNull($this->cases->findOneForPage(CnjNumber::compose('0009999', '2024', '8', '26', '0100')));
    }

    public function testListsOpenDeadlinesByDueDateThenFulfilledOnesLatestFirst(): void
    {
        $ana = $this->data->lawyer('ana@jus.test', 'Ana Ribeiro');
        $case = $this->data->legalCase('0000001', $ana);
        [$plaintiff, $defendant] = $case->getParties();

        // Summoned on business days, 5 business days each: due 11/03, 09/03, 03/03 and 04/03 respectively.
        $farthest = $this->deadline($case, $plaintiff, '2026-03-04');
        $nearest = $this->deadline($case, $defendant, '2026-03-02');
        $fulfilledEarly = $this->deadline($case, $plaintiff, '2026-02-24', '2026-02-26 16:00');
        $fulfilledLate = $this->deadline($case, $defendant, '2026-02-25', '2026-03-03 09:00');
        $this->em->flush();
        $ids = array_map(static fn (Deadline $deadline): ?int => $deadline->getId(), [$nearest, $farthest, $fulfilledLate, $fulfilledEarly]);
        $caseId = $case->getId();
        $this->em->clear();

        $reloaded = $this->em->find(LegalCase::class, $caseId);
        self::assertNotNull($reloaded);
        $this->queries->reset();
        $deadlines = $this->caseDeadlines()->forCase($reloaded);
        $names = array_map(static fn (Deadline $deadline): string => $deadline->getParty()->getName().' / '.$deadline->getSummons()->getType()->value, $deadlines);

        self::assertSame($ids, array_map(static fn (Deadline $deadline): ?int => $deadline->getId(), $deadlines));
        self::assertSame(['Empresa X Ltda. / summons', 'Maria Oliveira / summons', 'Empresa X Ltda. / summons', 'Maria Oliveira / summons'], $names);
        self::assertCount(1, $this->queries->selects(), 'each deadline comes with its party and summons');
    }

    public function testACaseWithoutDeadlinesHasNone(): void
    {
        $ana = $this->data->lawyer('ana@jus.test', 'Ana Ribeiro');
        $this->data->legalCase('0000001', $ana);
        $other = $this->data->legalCase('0000002', $ana);
        $this->deadline($other, $other->getParties()[0], '2026-03-04');
        $this->em->flush();

        $first = $this->cases->findOneByNumber(CnjNumber::compose('0000001', '2024', '8', '26', '0100'));
        self::assertNotNull($first);

        self::assertSame([], $this->caseDeadlines()->forCase($first));
    }

    public function testListsTheDocumentsOfTheCaseAsTableRows(): void
    {
        $ana = $this->data->lawyer('ana@jus.test', 'Ana Ribeiro');
        $case = $this->data->legalCase('0000001', $ana);
        $case->record(EventType::Order, 'Despacho com anexo.', new \DateTimeImmutable('2024-03-30 09:00'))
            ->attach('Despacho', 'despacho.pdf', 'stored-despacho.pdf', 2048, $ana, new \DateTimeImmutable('2024-03-30 09:01'));
        $this->em->flush();
        $number = $case->getNumber();
        $this->em->clear();

        $this->queries->reset();
        $loaded = $this->cases->findOneForPage($number);
        self::assertNotNull($loaded);
        $rows = (new CaseDocumentsTable())->rows($loaded);

        self::assertCount(1, $this->queries->selects(), 'the rows come from what the case already loaded, not from lazy loads');
        self::assertCount(2, $rows);
        self::assertSame(['title', 'type', 'uploadedAt', 'size'], array_keys($rows[0]));
        self::assertSame(['Despacho', EventType::Order, 2048], [$rows[0]['title'], $rows[0]['type'], $rows[0]['size']], 'newest event first; a document of any other event shows the event type');
        self::assertEquals(new \DateTimeImmutable('2024-03-30 09:01'), $rows[0]['uploadedAt']);
        self::assertSame(['Petição inicial', FilingType::InitialPetition, 184_320], [$rows[1]['title'], $rows[1]['type'], $rows[1]['size']], 'a filing shows its filing type');
        self::assertEquals(new \DateTimeImmutable('2024-03-04 10:00'), $rows[1]['uploadedAt']);
    }

    public function testSingleDocumentRowOfTheDefaultCase(): void
    {
        $ana = $this->data->lawyer('ana@jus.test', 'Ana Ribeiro');
        $case = $this->data->legalCase('0000001', $ana);

        $rows = (new CaseDocumentsTable())->rows($case);

        self::assertCount(1, $rows);
        self::assertSame('Petição inicial', $rows[0]['title']);
        self::assertSame(FilingType::InitialPetition, $rows[0]['type']);
        self::assertEquals(new \DateTimeImmutable('2024-03-04 10:00'), $rows[0]['uploadedAt']);
        self::assertSame(184_320, $rows[0]['size']);
    }

    public function testDocumentColumnsAreSortableWithTheirFormats(): void
    {
        self::assertSame([
            ['key' => 'title', 'label' => 'Título', 'sortable' => true],
            ['key' => 'type', 'label' => 'Tipo', 'sortable' => true, 'format' => 'label'],
            ['key' => 'uploadedAt', 'label' => 'Data', 'sortable' => true, 'format' => 'date'],
            ['key' => 'size', 'label' => 'Tamanho', 'sortable' => true, 'format' => 'bytes'],
        ], (new CaseDocumentsTable())->columns());
    }

    /**
     * The service as the case page gets it.
     */
    private function caseDeadlines(): CaseDeadlines
    {
        return self::getContainer()->get(CaseDeadlines::class);
    }

    private function deadline(LegalCase $case, Party $party, string $summonedOn, ?string $fulfilledAt = null): Deadline
    {
        $deadline = new Deadline($party, $case->record(EventType::Summons, 'Intimação.', new \DateTimeImmutable($summonedOn.' 08:00')), 5);
        if (null !== $fulfilledAt) {
            $deadline->fulfil(new \DateTimeImmutable($fulfilledAt));
        }
        $this->em->persist($deadline);

        return $deadline;
    }
}
