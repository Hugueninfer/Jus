<?php

declare(strict_types=1);

namespace App\DataFixtures;

use App\Domain\CnjNumber;
use App\Domain\Deadline\Urgency;
use App\Domain\LegalCase\CaseStatus;
use App\Domain\LegalCase\EventType;
use App\Domain\LegalCase\PartySide;
use App\Entity\Deadline;
use App\Entity\LegalCase;
use App\Entity\Party;
use App\Entity\User;
use Doctrine\Bundle\FixturesBundle\Fixture;
use Doctrine\Persistence\ObjectManager;
use Faker\Factory;
use Psr\Clock\ClockInterface;
use Symfony\Component\PasswordHasher\Hasher\UserPasswordHasherInterface;

/**
 * Deterministic demo data: 3 users and 30 fictitious cases whose deadlines show every urgency state.
 */
final class AppFixtures extends Fixture
{
    /** Shared password of the local demo accounts (test credential, documented in the README). */
    public const string DEMO_PASSWORD = 'jus-demo';

    private const int CASES = 30;
    private const int DEADLINE_DAYS = 5;

    private const array CASE_CLASSES = ['Procedimento Comum Cível', 'Execução de Título Extrajudicial', 'Mandado de Segurança', 'Ação Monitória', 'Reclamação Trabalhista'];
    private const array SUBJECTS = ['Indenização por dano moral', 'Cobrança de aluguéis', 'Revisão contratual', 'Obrigação de fazer', 'Rescisão indireta'];
    private const array COURTS = ['1ª Vara Cível', '2ª Vara Cível', '3ª Vara da Fazenda Pública', '1ª Vara do Trabalho', 'Juizado Especial Cível'];
    private const array STATUSES = [CaseStatus::Active, CaseStatus::Active, CaseStatus::Active, CaseStatus::Suspended, CaseStatus::Active, CaseStatus::Archived];
    private const array URGENCIES = [Urgency::OnTrack, Urgency::Warning, Urgency::DueToday, Urgency::Overdue, Urgency::Fulfilled];

    public function __construct(
        private readonly UserPasswordHasherInterface $hasher,
        private readonly DeadlineScenario $deadlines,
        private readonly ClockInterface $clock,
    ) {
    }

    public function load(ObjectManager $manager): void
    {
        $faker = Factory::create('pt_BR');
        $faker->seed(2026);
        $today = $this->clock->now();

        $lawyer = $this->withPassword(User::lawyer('advogado@jus.test', 'Ana Ribeiro', 'SP 123.456'));
        $otherLawyer = $this->withPassword(User::lawyer('advogada2@jus.test', 'Carla Mendes', 'SP 654.321'));
        $clerk = $this->withPassword(User::clerk('servidor@jus.test', 'João Almeida'));
        foreach ([$lawyer, $otherLawyer, $clerk] as $user) {
            $manager->persist($user);
        }

        for ($i = 1; $i <= self::CASES; ++$i) {
            $filedAt = $today->setTime(9 + $i % 8, 0)->sub(new \DateInterval(\sprintf('P%dD', 30 + 11 * $i)));
            $case = new LegalCase(
                CnjNumber::compose(\sprintf('%07d', 1000 + $i), $filedAt->format('Y'), '8', '26', \sprintf('%04d', 100 + $i % 5)),
                self::CASE_CLASSES[$i % 5],
                self::SUBJECTS[($i * 3) % 5],
                self::COURTS[($i * 2) % 5],
                self::STATUSES[$i % 6],
                0 === $i % 7,
                $faker->numberBetween(100_000, 50_000_000),
                $filedAt,
            );

            $plaintiff = $case->addParty($faker->name(), $faker->numerify('###.###.###-##'), PartySide::Plaintiff);
            $defendant = $case->addParty($faker->company(), $faker->numerify('##.###.###/####-##'), PartySide::Defendant);
            if (0 !== $i % 3) {
                $plaintiff->addLawyer($lawyer); // the main demo lawyer acts in two out of three cases
            }
            $defendant->addLawyer($otherLawyer);

            $case->record(EventType::Filing, 'Petição inicial distribuída.', $filedAt, $lawyer)
                ->attach('Petição inicial', 'peticao-inicial.pdf', \sprintf('demo-%02d-peticao-inicial.pdf', $i), 184_320, $lawyer, $filedAt);
            $case->record(EventType::Order, 'Despacho: cite-se a parte ré.', $filedAt->add(new \DateInterval('P7D')), $clerk);
            $case->record(EventType::Decision, 'Decisão interlocutória: tutela de urgência indeferida.', $filedAt->add(new \DateInterval('P20D')), $clerk);

            if (CaseStatus::Archived !== $case->getStatus()) {
                $this->openDeadline($manager, $case, $plaintiff, self::URGENCIES[$i % 5], $today, $lawyer);
            }

            $manager->persist($case);
        }

        $manager->flush();
    }

    private function openDeadline(ObjectManager $manager, LegalCase $case, Party $party, Urgency $urgency, \DateTimeImmutable $today, User $lawyer): void
    {
        $fulfilled = Urgency::Fulfilled === $urgency;
        $start = $this->deadlines->startDateFor($fulfilled ? Urgency::Overdue : $urgency, self::DEADLINE_DAYS, $today);
        if (null === $start) {
            return; // e.g. nothing can be "due today" on a weekend
        }

        $summons = $case->record(EventType::Summons, 'Intimação para manifestação no prazo de 5 dias úteis.', $start->setTime(10, 0));
        $deadline = new Deadline($party, $summons, self::DEADLINE_DAYS);
        if ($fulfilled) {
            $answeredAt = $start->add(new \DateInterval('P2D'))->setTime(16, 0);
            $case->record(EventType::Filing, 'Manifestação protocolada.', $answeredAt, $lawyer);
            $deadline->fulfil($answeredAt);
        }

        $manager->persist($deadline);
    }

    private function withPassword(User $user): User
    {
        $user->setPassword($this->hasher->hashPassword($user, self::DEMO_PASSWORD));

        return $user;
    }
}
