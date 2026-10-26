<?php

declare(strict_types=1);

namespace App\Tests\Integration;

use App\DataFixtures\AppFixtures;
use App\Domain\Deadline\DeadlineCalculator;
use App\Domain\Deadline\Urgency;
use App\Domain\LegalCase\CaseStatus;
use App\Domain\LegalCase\EventType;
use App\Domain\LegalCase\FilingType;
use App\Entity\CaseEvent;
use App\Entity\Deadline;
use App\Entity\LegalCase;
use App\Entity\User;
use Doctrine\ORM\EntityManagerInterface;
use PHPUnit\Framework\Attributes\DataProvider;
use Symfony\Bundle\FrameworkBundle\Test\KernelTestCase;
use Symfony\Component\Clock\Test\ClockSensitiveTrait;
use Symfony\Component\PasswordHasher\Hasher\UserPasswordHasherInterface;

/**
 * The demo data must stay coherent whatever day it is loaded on.
 */
final class AppFixturesTest extends KernelTestCase
{
    use ClockSensitiveTrait;

    /**
     * @return iterable<string, array{string}>
     */
    public static function todays(): iterable
    {
        yield 'a Wednesday' => ['2026-03-04 09:00'];
        yield 'a Saturday' => ['2026-03-07 09:00'];
        yield 'inside the court recess' => ['2026-12-23 09:00'];
        yield 'the first business day after the recess' => ['2027-01-21 09:00'];
    }

    #[DataProvider('todays')]
    public function testCreatesTheDemoAccountsAndCases(string $today): void
    {
        $em = $this->loadFixtures($today);
        $cases = $em->getRepository(LegalCase::class);

        self::assertSame(4, $em->getRepository(User::class)->count([]));
        self::assertSame(30, $cases->count([]));
        foreach (CaseStatus::cases() as $status) {
            self::assertGreaterThan(0, $cases->count(['status' => $status]), $status->value);
        }
        self::assertSame(3, $cases->count(['confidential' => true]));

        $lawyer = $em->getRepository(User::class)->findOneBy(['email' => 'advogado@jus.test']);
        self::assertNotNull($lawyer);
        self::assertTrue(self::getContainer()->get(UserPasswordHasherInterface::class)->isPasswordValid($lawyer, AppFixtures::DEMO_PASSWORD));
    }

    #[DataProvider('todays')]
    public function testEveryPartyHasCounselWhoMakesItsFilings(string $today): void
    {
        $em = $this->loadFixtures($today);

        foreach ($em->getRepository(LegalCase::class)->findAll() as $case) {
            $number = $case->getNumber()->formatted();
            foreach ($case->getParties() as $party) {
                self::assertNotSame([], $party->getLawyers(), \sprintf('%s: %s has no lawyer.', $number, $party->getName()));
            }

            foreach ($case->getEvents() as $event) {
                if (EventType::Filing === $event->getType()) {
                    $author = $event->getCreatedBy();
                    self::assertNotNull($event->getFilingType(), $number);
                    self::assertNotNull($author, $number);
                    self::assertTrue($case->isRepresentedBy($author), \sprintf('%s: filed by %s.', $number, $author->getEmail()));
                }

                foreach ($event->getDocuments() as $document) {
                    self::assertTrue($case->isRepresentedBy($document->getUploadedBy()), \sprintf('%s: uploaded by %s.', $number, $document->getUploadedBy()->getEmail()));
                }
            }
        }
    }

    #[DataProvider('todays')]
    public function testEventsFollowTheCourtCalendar(string $today): void
    {
        $em = $this->loadFixtures($today);
        $calculator = self::getContainer()->get(DeadlineCalculator::class);
        $now = new \DateTimeImmutable($today);

        foreach ($em->getRepository(LegalCase::class)->findAll() as $case) {
            $number = $case->getNumber()->formatted();
            $events = $case->getEvents();
            $petitions = array_values(array_filter($events, static fn (CaseEvent $e): bool => FilingType::InitialPetition === $e->getFilingType()));
            $orders = array_values(array_filter($events, static fn (CaseEvent $e): bool => EventType::Order === $e->getType()));
            $decisions = array_values(array_filter($events, static fn (CaseEvent $e): bool => EventType::Decision === $e->getType()));
            self::assertCount(1, $petitions, $number);
            self::assertCount(1, $orders, $number);
            self::assertCount(1, $decisions, $number);
            self::assertGreaterThan($orders[0]->getOccurredAt(), $decisions[0]->getOccurredAt(), $number.': the decision does not follow the order.');

            foreach ($events as $event) {
                $at = $event->getOccurredAt();
                $label = \sprintf('%s: %s on %s', $number, $event->getType()->value, $at->format('Y-m-d H:i'));
                self::assertTrue($calculator->isBusinessDay($at), $label.' is not a business day.');
                self::assertLessThanOrEqual($now, $at, $label.' is in the future.');
                if ($event !== $petitions[0]) {
                    self::assertGreaterThan($petitions[0]->getOccurredAt(), $at, $label.' precedes the initial petition.');
                }
                if (EventType::Summons === $event->getType()) {
                    self::assertGreaterThan($decisions[0]->getOccurredAt(), $at, $label.' precedes the decision.');
                }
            }
        }
    }

    #[DataProvider('todays')]
    public function testActiveCasesShowEveryUrgencyTheCalendarAllows(string $today): void
    {
        $em = $this->loadFixtures($today);
        $calculator = self::getContainer()->get(DeadlineCalculator::class);
        $now = new \DateTimeImmutable($today);

        $states = [];
        foreach ($em->getRepository(Deadline::class)->findAll() as $deadline) {
            $case = $deadline->getParty()->getLegalCase();
            self::assertSame(CaseStatus::Active, $case->getStatus(), $case->getNumber()->formatted());
            $states[] = $calculator->assess($deadline->getStartDate(), $deadline->getBusinessDays(), $now, $deadline->isFulfilled())->urgency->value;
        }

        $expected = array_map(static fn (Urgency $u): string => $u->value, Urgency::cases());
        if (!$calculator->isBusinessDay($now)) {
            $expected = array_values(array_diff($expected, [Urgency::DueToday->value]));
        }
        self::assertEqualsCanonicalizing($expected, array_values(array_unique($states)));
    }

    private function loadFixtures(string $today): EntityManagerInterface
    {
        self::mockTime($today);
        self::bootKernel();
        $container = self::getContainer();
        $em = $container->get(EntityManagerInterface::class);

        $container->get(AppFixtures::class)->load($em);
        $em->clear();

        return $em;
    }
}
