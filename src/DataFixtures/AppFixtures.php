<?php

declare(strict_types=1);

namespace App\DataFixtures;

use App\Domain\CnjNumber;
use App\Domain\Deadline\DeadlineCalculator;
use App\Domain\Deadline\Urgency;
use App\Domain\LegalCase\CaseStatus;
use App\Domain\LegalCase\EventType;
use App\Domain\LegalCase\FilingType;
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
 * Deterministic demo data: 4 users and 30 fictitious cases. Every party has a lawyer, and filings and documents come
 * from the counsel of a party (Ana does not act in every third case). Events fall on court working days, in order and
 * never after now; only active cases have deadlines, cycling through every urgency state the calendar allows today.
 */
final class AppFixtures extends Fixture
{
    /** Shared password of the local demo accounts (test credential). */
    public const string DEMO_PASSWORD = 'jus-demo';

    private const int CASES = 30;
    private const int DEADLINE_DAYS = 5;

    /** Each entry: [class, subject, court, CNJ segment (J), CNJ tribunal (TR)]. */
    private const array CASE_TYPES = [
        ['Procedimento Comum Cível', 'Indenização por dano moral', '1ª Vara Cível', '8', '26'],
        ['Execução de Título Extrajudicial', 'Cobrança de aluguéis', '2ª Vara Cível', '8', '26'],
        ['Mandado de Segurança', 'Anulação de ato administrativo', '3ª Vara da Fazenda Pública', '8', '26'],
        ['Ação Monitória', 'Cobrança de nota promissória', '4ª Vara Cível', '8', '26'],
        ['Reclamação Trabalhista', 'Rescisão indireta', '1ª Vara do Trabalho', '5', '02'],
        ['Procedimento do Juizado Especial Cível', 'Obrigação de fazer', 'Juizado Especial Cível', '8', '26'],
        ['Ação de Despejo', 'Despejo por falta de pagamento', '5ª Vara Cível', '8', '26'],
    ];
    private const array STATUSES = [CaseStatus::Active, CaseStatus::Active, CaseStatus::Active, CaseStatus::Suspended, CaseStatus::Active, CaseStatus::Archived];
    private const array URGENCIES = [Urgency::OnTrack, Urgency::Warning, Urgency::DueToday, Urgency::Overdue, Urgency::Fulfilled];

    public function __construct(
        private readonly UserPasswordHasherInterface $hasher,
        private readonly DeadlineScenario $deadlines,
        private readonly DeadlineCalculator $calendar,
        private readonly ClockInterface $clock,
    ) {
    }

    public function load(ObjectManager $manager): void
    {
        $faker = Factory::create('pt_BR');
        $faker->seed(2026);
        $now = $this->clock->now();

        $ana = $this->withPassword(User::lawyer('advogado@jus.test', 'Ana Ribeiro', 'SP 123.456'));
        $carla = $this->withPassword(User::lawyer('advogada2@jus.test', 'Carla Mendes', 'SP 654.321'));
        $bruno = $this->withPassword(User::lawyer('advogado3@jus.test', 'Bruno Teixeira', 'SP 345.678'));
        $clerk = $this->withPassword(User::clerk('servidor@jus.test', 'João Almeida'));
        foreach ([$ana, $carla, $bruno, $clerk] as $user) {
            $manager->persist($user);
        }

        $active = 0;
        for ($i = 1; $i <= self::CASES; ++$i) {
            [$class, $subject, $court, $segment, $tribunal] = self::CASE_TYPES[$i % 7];
            $filedAt = $this->onOrBefore($now->sub(new \DateInterval(\sprintf('P%dD', 60 + 11 * $i))))->setTime(9 + $i % 8, 0);
            $case = new LegalCase(
                CnjNumber::compose(\sprintf('%07d', 1000 + $i), $filedAt->format('Y'), $segment, $tribunal, \sprintf('%04d', 100 + $i % 5)),
                $class,
                $subject,
                $court,
                self::STATUSES[$i % 6],
                0 === $i % 8,
                $faker->numberBetween(100_000, 50_000_000),
                $filedAt,
            );

            $plaintiffCounsel = 0 === $i % 3 ? $bruno : $ana;
            $plaintiff = $case->addParty($faker->name(), $faker->numerify('###.###.###-##'), PartySide::Plaintiff);
            $plaintiff->addLawyer($plaintiffCounsel);
            $case->addParty($faker->company(), $faker->numerify('##.###.###/####-##'), PartySide::Defendant)->addLawyer($carla);

            $case->file(FilingType::InitialPetition, 'Petição inicial distribuída.', $filedAt, $plaintiffCounsel)
                ->attach('Petição inicial', 'peticao-inicial.pdf', \sprintf('demo-%02d-peticao-inicial.pdf', $i), 184_320, $plaintiffCounsel, $filedAt);
            $orderedAt = $this->onOrAfter($filedAt->add(new \DateInterval('P7D')));
            // The court recess can push both to the same day; the decision then comes on the next working day.
            $decidedAt = $this->onOrAfter(max($filedAt->add(new \DateInterval('P20D')), $orderedAt->add(new \DateInterval('P1D'))));
            $case->record(EventType::Order, 'Despacho: cite-se a parte ré.', $orderedAt, $clerk);
            $case->record(EventType::Decision, 'Decisão interlocutória: tutela de urgência indeferida.', $decidedAt, $clerk);

            if (CaseStatus::Active === $case->getStatus()) {
                $this->openDeadline($manager, $case, $plaintiff, $plaintiffCounsel, self::URGENCIES[$active++ % 5], $now);
            }

            $manager->persist($case);
        }

        $manager->flush();
    }

    private function openDeadline(ObjectManager $manager, LegalCase $case, Party $party, User $counsel, Urgency $urgency, \DateTimeImmutable $now): void
    {
        $fulfilled = Urgency::Fulfilled === $urgency;
        $start = $this->deadlines->startDateFor($fulfilled ? Urgency::Overdue : $urgency, self::DEADLINE_DAYS, $now);
        if (null === $start) {
            return; // e.g. nothing can be "due today" on a weekend
        }

        $description = \sprintf('Intimação para manifestação no prazo de %d dias úteis.', self::DEADLINE_DAYS);
        $summons = $case->record(EventType::Summons, $description, min($start->setTime(8, 0), $now));
        $deadline = new Deadline($party, $summons, self::DEADLINE_DAYS);
        if ($fulfilled) {
            $answeredAt = min($this->onOrAfter($start->add(new \DateInterval('P2D')))->setTime(16, 0), $now);
            $case->file(FilingType::Statement, 'Manifestação protocolada.', $answeredAt, $counsel);
            $deadline->fulfil($answeredAt);
        }

        $manager->persist($deadline);
    }

    /**
     * Latest court working day on or before $day.
     */
    private function onOrBefore(\DateTimeImmutable $day): \DateTimeImmutable
    {
        while (!$this->calendar->isBusinessDay($day)) {
            $day = $day->sub(new \DateInterval('P1D'));
        }

        return $day;
    }

    /**
     * First court working day on or after $day.
     */
    private function onOrAfter(\DateTimeImmutable $day): \DateTimeImmutable
    {
        while (!$this->calendar->isBusinessDay($day)) {
            $day = $day->add(new \DateInterval('P1D'));
        }

        return $day;
    }

    private function withPassword(User $user): User
    {
        $user->setPassword($this->hasher->hashPassword($user, self::DEMO_PASSWORD));

        return $user;
    }
}
