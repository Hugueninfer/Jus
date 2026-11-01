<?php

declare(strict_types=1);

namespace App\Tests\Integration;

use App\Domain\LegalCase\PartySide;
use App\Entity\Deadline;
use App\Entity\LegalCase;
use App\Entity\Party;
use App\Entity\User;
use App\Repository\DeadlineRepository;
use App\Tests\Support\QueryRecorder;
use App\Tests\Support\TestCases;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\Test\KernelTestCase;

final class DeadlineRepositoryTest extends KernelTestCase
{
    private EntityManagerInterface $em;
    private TestCases $data;
    private DeadlineRepository $deadlines;
    private User $ana;
    private LegalCase $case;

    protected function setUp(): void
    {
        self::bootKernel();
        $this->em = self::getContainer()->get(EntityManagerInterface::class);
        $this->deadlines = self::getContainer()->get(DeadlineRepository::class);
        $this->data = new TestCases($this->em);
        $this->ana = $this->data->lawyer('ana@jus.test', 'Ana Ribeiro');
        $this->case = $this->data->legalCase('0000001', $this->ana);
    }

    public function testFindsTheOpenDeadlinesOfThePartiesTheLawyerRepresentsInTheCase(): void
    {
        $this->party(PartySide::Defendant)->addLawyer($this->data->lawyer('bruno@jus.test', 'Bruno Teixeira'));
        $plaintiff = $this->party(PartySide::Plaintiff);
        $first = $this->data->deadline($plaintiff, '2024-03-05 08:00');
        $this->data->deadline($plaintiff, '2024-03-06 08:00', '2024-03-08 15:00'); // already fulfilled
        $this->data->deadline($this->party(PartySide::Defendant), '2024-03-05 08:00'); // the other side
        $second = $this->data->deadline($plaintiff, '2024-03-12 08:00');
        $this->data->deadline($this->data->legalCase('0000002', $this->ana)->getParties()[0], '2024-03-05 08:00'); // another case

        $found = $this->deadlines->findOpenForLawyer($this->case, $this->ana, self::now());

        self::assertSame([$first->getId(), $second->getId()], array_map(static fn (Deadline $deadline): ?int => $deadline->getId(), $found));
    }

    public function testFindsNothingForALawyerWhoRepresentsNoPartyOfTheCase(): void
    {
        $this->data->deadline($this->party(PartySide::Plaintiff));
        $this->data->deadline($this->party(PartySide::Defendant));
        $stranger = $this->data->lawyer('rui@jus.test', 'Rui Lima');

        self::assertSame([], $this->deadlines->findOpenForLawyer($this->case, $stranger, self::now()));
    }

    public function testFindsTheDeadlinesOfEverySideTheLawyerRepresents(): void
    {
        $this->party(PartySide::Defendant)->addLawyer($this->ana);
        $this->data->deadline($this->party(PartySide::Plaintiff));
        $this->data->deadline($this->party(PartySide::Defendant));

        self::assertCount(2, $this->deadlines->findOpenForLawyer($this->case, $this->ana, self::now()));
    }

    public function testLeavesOutTheDeadlinesThatHaveNotStartedYet(): void
    {
        $plaintiff = $this->party(PartySide::Plaintiff);
        $earlier = $this->data->deadline($plaintiff, '2024-03-05 08:00');
        $today = $this->data->deadline($plaintiff, '2024-03-20 15:00'); // starts at midnight of the day: already started at 11:30
        $this->data->deadline($plaintiff, '2024-03-21 08:00'); // starts tomorrow: fulfilling it now would be refused
        $this->data->deadline($plaintiff, '2024-06-01 08:00');

        $found = $this->deadlines->findOpenForLawyer($this->case, $this->ana, self::now());

        self::assertSame([$earlier->getId(), $today->getId()], array_map(static fn (Deadline $deadline): ?int => $deadline->getId(), $found));
    }

    public function testRunsASingleQuery(): void
    {
        $this->data->deadline($this->party(PartySide::Plaintiff));
        $this->data->deadline($this->party(PartySide::Plaintiff), '2024-03-12 08:00');
        $caseId = $this->case->getId();
        $anaId = $this->ana->getId();
        $this->em->clear();
        $case = $this->em->find(LegalCase::class, $caseId);
        $ana = $this->em->find(User::class, $anaId);
        self::assertInstanceOf(LegalCase::class, $case);
        self::assertInstanceOf(User::class, $ana);
        $queries = QueryRecorder::instance();
        $queries->reset();

        $found = $this->deadlines->findOpenForLawyer($case, $ana, self::now());
        foreach ($found as $deadline) {
            $deadline->fulfil(self::now());
        }

        self::assertCount(2, $found);
        self::assertCount(1, $queries->selects(), 'the lawyer is matched in SQL, with no lazy load of parties or lawyers');
    }

    /** The moment of the filing the tests look at the deadlines from. */
    private static function now(): \DateTimeImmutable
    {
        return new \DateTimeImmutable('2024-03-20 11:30');
    }

    private function party(PartySide $side): Party
    {
        foreach ($this->case->getParties() as $party) {
            if ($side === $party->getSide()) {
                return $party;
            }
        }

        throw new \LogicException(\sprintf('The case has no %s party.', $side->value));
    }
}
