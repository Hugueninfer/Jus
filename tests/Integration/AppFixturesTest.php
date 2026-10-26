<?php

declare(strict_types=1);

namespace App\Tests\Integration;

use App\DataFixtures\AppFixtures;
use App\Domain\Deadline\DeadlineCalculator;
use App\Domain\Deadline\Urgency;
use App\Domain\LegalCase\CaseStatus;
use App\Entity\Deadline;
use App\Entity\LegalCase;
use App\Entity\User;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\Test\KernelTestCase;
use Symfony\Component\Clock\Test\ClockSensitiveTrait;
use Symfony\Component\PasswordHasher\Hasher\UserPasswordHasherInterface;

final class AppFixturesTest extends KernelTestCase
{
    use ClockSensitiveTrait;

    public function testLoadsADemoDataSetCoveringEveryUrgencyState(): void
    {
        self::mockTime('2026-03-04 09:00:00'); // a Wednesday, so "due today" is possible
        self::bootKernel();
        $container = self::getContainer();

        $em = $container->get(EntityManagerInterface::class);
        $fixtures = $container->get(AppFixtures::class);
        $calculator = $container->get(DeadlineCalculator::class);
        $hasher = $container->get(UserPasswordHasherInterface::class);

        $fixtures->load($em);
        $em->clear();

        self::assertSame(3, $em->getRepository(User::class)->count([]));
        self::assertSame(30, $em->getRepository(LegalCase::class)->count([]));
        self::assertGreaterThan(0, $em->getRepository(LegalCase::class)->count(['confidential' => true]));
        foreach (CaseStatus::cases() as $status) {
            self::assertGreaterThan(0, $em->getRepository(LegalCase::class)->count(['status' => $status]), $status->value);
        }

        $lawyer = $em->getRepository(User::class)->findOneBy(['email' => 'advogado@jus.test']);
        self::assertNotNull($lawyer);
        self::assertTrue($hasher->isPasswordValid($lawyer, AppFixtures::DEMO_PASSWORD));

        $today = new \DateTimeImmutable('2026-03-04 09:00:00');
        $states = array_map(
            static fn (Deadline $d): Urgency => $calculator->assess($d->getStartDate(), $d->getBusinessDays(), $today, $d->isFulfilled())->urgency,
            $em->getRepository(Deadline::class)->findAll(),
        );
        foreach (Urgency::cases() as $urgency) {
            self::assertContains($urgency, $states, $urgency->value);
        }
    }
}
