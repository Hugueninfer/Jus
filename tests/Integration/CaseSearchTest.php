<?php

declare(strict_types=1);

namespace App\Tests\Integration;

use App\Domain\CnjNumber;
use App\Domain\LegalCase\CaseStatus;
use App\Domain\LegalCase\EventType;
use App\Entity\LegalCase;
use App\Repository\CaseEventRepository;
use App\Repository\CaseSearchCriteria;
use App\Repository\LegalCaseRepository;
use App\Tests\Support\TestCases;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\Test\KernelTestCase;

final class CaseSearchTest extends KernelTestCase
{
    private TestCases $data;
    private LegalCaseRepository $cases;
    private EntityManagerInterface $em;

    protected function setUp(): void
    {
        self::bootKernel();
        $this->em = self::getContainer()->get(EntityManagerInterface::class);
        $this->data = new TestCases($this->em);
        $this->cases = self::getContainer()->get(LegalCaseRepository::class);
    }

    public function testLawyersSeePublicCasesAndTheConfidentialOnesTheyActIn(): void
    {
        $ana = $this->data->lawyer('ana@jus.test', 'Ana Ribeiro');
        $bruno = $this->data->lawyer('bruno@jus.test', 'Bruno Teixeira');
        $this->data->legalCase('0000001', $ana);
        $this->data->legalCase('0000002', $ana, confidential: true);
        $this->data->legalCase('0000003', $bruno, confidential: true);

        self::assertSame(['0000002', '0000001'], $this->sequentials($this->cases->search(new CaseSearchCriteria(), $ana, 1)->cases));
        self::assertSame(['0000003', '0000001'], $this->sequentials($this->cases->search(new CaseSearchCriteria(), $bruno, 1)->cases));
    }

    public function testVisibilityStillAppliesWhenOtherFiltersAreSet(): void
    {
        $ana = $this->data->lawyer('ana@jus.test', 'Ana Ribeiro');
        $bruno = $this->data->lawyer('bruno@jus.test', 'Bruno Teixeira');
        $this->data->legalCase('0000001', $bruno, plaintiff: 'Maria Oliveira', confidential: true, status: CaseStatus::Archived);

        $criteria = new CaseSearchCriteria();
        $criteria->status = CaseStatus::Archived;
        $criteria->partyName = 'maria';
        self::assertSame(0, $this->cases->search($criteria, $ana, 1)->total, 'filters narrow the visible cases, they never widen them');
        self::assertSame(1, $this->cases->search($criteria, $bruno, 1)->total);
    }

    public function testClerksSeeEveryCase(): void
    {
        $ana = $this->data->lawyer('ana@jus.test', 'Ana Ribeiro');
        $clerk = $this->data->clerk('joao@jus.test', 'João Almeida');
        $this->data->legalCase('0000001', $ana);
        $this->data->legalCase('0000002', $ana, confidential: true);

        self::assertSame(2, $this->cases->search(new CaseSearchCriteria(), $clerk, 1)->total);
    }

    public function testFindsPartiesIgnoringAccentsAndCase(): void
    {
        $ana = $this->data->lawyer('ana@jus.test', 'Ana Ribeiro');
        $this->data->legalCase('0000001', $ana, plaintiff: 'João Álvaro Conceição');
        $this->data->legalCase('0000002', $ana, plaintiff: 'Maria Oliveira');

        $this->em->clear(); // prove the fetch join, not the identity map, fills the parties

        $criteria = new CaseSearchCriteria();
        $criteria->partyName = '  ALVARO conceicao ';
        $result = $this->cases->search($criteria, $ana, 1);

        self::assertSame(['0000001'], $this->sequentials($result->cases));
        self::assertCount(2, $result->cases[0]->getParties(), 'the matching case still carries all its parties');
    }

    public function testTreatsLikeWildcardsAsText(): void
    {
        $ana = $this->data->lawyer('ana@jus.test', 'Ana Ribeiro');
        $this->data->legalCase('0000001', $ana, plaintiff: 'Maria Oliveira');

        $criteria = new CaseSearchCriteria();
        $criteria->partyName = '%';

        self::assertSame(0, $this->cases->search($criteria, $ana, 1)->total);
    }

    public function testFiltersByStatusAndNumber(): void
    {
        $ana = $this->data->lawyer('ana@jus.test', 'Ana Ribeiro');
        $this->data->legalCase('0000001', $ana, status: CaseStatus::Archived);
        $second = $this->data->legalCase('0000002', $ana);

        $byStatus = new CaseSearchCriteria();
        $byStatus->status = CaseStatus::Archived;
        self::assertSame(['0000001'], $this->sequentials($this->cases->search($byStatus, $ana, 1)->cases));

        $byNumber = new CaseSearchCriteria();
        $byNumber->number = $second->getNumber();
        self::assertSame(['0000002'], $this->sequentials($this->cases->search($byNumber, $ana, 1)->cases));
    }

    public function testPagesNewestFirst(): void
    {
        $ana = $this->data->lawyer('ana@jus.test', 'Ana Ribeiro');
        for ($i = 1; $i <= 12; ++$i) {
            $this->data->legalCase(\sprintf('%07d', $i), $ana, filedAt: \sprintf('2024-01-%02d 10:00', $i));
        }

        $first = $this->cases->search(new CaseSearchCriteria(), $ana, 1);
        $second = $this->cases->search(new CaseSearchCriteria(), $ana, 2);

        self::assertSame([12, 2, 1], [$first->total, $first->pages, $first->page]);
        self::assertCount(10, $first->cases);
        self::assertSame('0000012', substr($first->cases[0]->getNumber()->digits(), 0, 7));
        self::assertSame(['0000002', '0000001'], $this->sequentials($second->cases));
    }

    public function testFindsAVisibleCaseByNumberOnly(): void
    {
        $ana = $this->data->lawyer('ana@jus.test', 'Ana Ribeiro');
        $bruno = $this->data->lawyer('bruno@jus.test', 'Bruno Teixeira');
        $secret = $this->data->legalCase('0000003', $bruno, confidential: true);

        self::assertNull($this->cases->findVisibleOneByNumber($secret->getNumber(), $ana));
        self::assertSame($secret, $this->cases->findVisibleOneByNumber($secret->getNumber(), $bruno));
        self::assertNull($this->cases->findVisibleOneByNumber(CnjNumber::compose('0009999', '2024', '8', '26', '0100'), $bruno));
    }

    public function testFetchesTheLatestEventOfEachCaseInOneQuery(): void
    {
        $ana = $this->data->lawyer('ana@jus.test', 'Ana Ribeiro');
        $first = $this->data->legalCase('0000001', $ana);
        $second = $this->data->legalCase('0000002', $ana);
        $sameTime = $second->record(EventType::Order, 'Mesmo horário.', new \DateTimeImmutable('2024-03-24 10:00'));
        $this->em->flush();

        $latest = self::getContainer()->get(CaseEventRepository::class)->latestForCases([$first, $second]);

        $firstId = $first->getId();
        $secondId = $second->getId();
        self::assertNotNull($firstId);
        self::assertNotNull($secondId);
        self::assertSame(EventType::Decision, $latest[$firstId]->getType());
        self::assertSame($sameTime, $latest[$secondId], 'ties are broken by the highest id');
    }

    /**
     * @param list<LegalCase> $cases
     *
     * @return list<string>
     */
    private function sequentials(array $cases): array
    {
        return array_map(static fn (LegalCase $case): string => substr($case->getNumber()->digits(), 0, 7), $cases);
    }
}
