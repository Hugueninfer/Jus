<?php

declare(strict_types=1);

namespace App\DesignSystem;

use App\DataFixtures\DeadlineScenario;
use App\Domain\CnjNumber;
use App\Domain\Deadline\Urgency;
use App\Domain\LegalCase\CaseStatus;
use App\Domain\LegalCase\EventType;
use App\Domain\LegalCase\FilingType;
use App\Domain\LegalCase\PartySide;
use App\Entity\Deadline;
use App\Entity\LegalCase;
use App\Entity\User;
use Psr\Clock\ClockInterface;

/**
 * In-memory sample entities for the component catalog (nothing comes from the database).
 */
final readonly class SampleData
{
    private const int DEADLINE_DAYS = 5;

    public function __construct(
        private DeadlineScenario $scenario,
        private ClockInterface $clock,
    ) {
    }

    public function legalCase(): LegalCase
    {
        $ana = User::lawyer('ana@jus.test', 'Ana Ribeiro', 'SP 123.456');
        $case = new LegalCase(
            CnjNumber::compose('0001234', '2024', '8', '26', '0100'),
            'Procedimento Comum Cível',
            'Indenização por dano moral',
            '1ª Vara Cível',
            CaseStatus::Active,
            false,
            1_500_000,
            new \DateTimeImmutable('2024-03-04 10:00'),
        );
        $case->addParty('Maria Oliveira', '123.456.789-00', PartySide::Plaintiff)->addLawyer($ana);
        $case->addParty('Empresa X Ltda.', '12.345.678/0001-90', PartySide::Defendant)
            ->addLawyer(User::lawyer('carla@jus.test', 'Carla Mendes', 'SP 654.321'));
        $case->file(FilingType::InitialPetition, 'Petição inicial distribuída.', new \DateTimeImmutable('2024-03-04 10:00'), $ana)
            ->attach('Petição inicial', 'peticao-inicial.pdf', 'sample-peticao-inicial.pdf', 184_320, $ana, new \DateTimeImmutable('2024-03-04 10:00'));
        $case->record(EventType::Order, 'Despacho: cite-se a parte ré.', new \DateTimeImmutable('2024-03-11 14:00'));
        $case->record(EventType::Decision, 'Decisão interlocutória: tutela de urgência indeferida.', new \DateTimeImmutable('2024-03-25 16:30'));
        $case->record(EventType::Hearing, 'Audiência de conciliação designada.', new \DateTimeImmutable('2024-03-25 17:00'));

        return $case;
    }

    /**
     * One deadline per urgency state the calendar allows today, keyed by the urgency value.
     *
     * @return array<string, Deadline>
     */
    public function deadlines(): array
    {
        $now = $this->clock->now();
        $deadlines = [];
        foreach (Urgency::cases() as $urgency) {
            $fulfilled = Urgency::Fulfilled === $urgency;
            $start = $this->scenario->startDateFor($fulfilled ? Urgency::Overdue : $urgency, self::DEADLINE_DAYS, $now);
            if (null === $start) {
                continue;
            }

            $case = $this->legalCase();
            $party = $case->getParties()[0] ?? throw new \LogicException('The sample case has parties.');
            $deadline = new Deadline($party, $case->record(EventType::Summons, 'Intimação.', $start->setTime(8, 0)), self::DEADLINE_DAYS);
            if ($fulfilled) {
                $deadline->fulfil($start->add(new \DateInterval('P1D'))->setTime(16, 0));
            }

            $deadlines[$urgency->value] = $deadline;
        }

        return $deadlines;
    }

    /**
     * @return list<array{key: string, label: string, sortable?: bool, format?: string}>
     */
    public function documentColumns(): array
    {
        return [
            ['key' => 'title', 'label' => 'Título', 'sortable' => true],
            ['key' => 'type', 'label' => 'Tipo'],
            ['key' => 'uploadedAt', 'label' => 'Data', 'sortable' => true, 'format' => 'date'],
            ['key' => 'size', 'label' => 'Tamanho', 'sortable' => true, 'format' => 'bytes'],
        ];
    }

    /**
     * @return list<array<string, mixed>>
     */
    public function documentRows(): array
    {
        return [
            ['title' => 'Petição inicial', 'type' => 'Petição inicial', 'uploadedAt' => new \DateTimeImmutable('2024-03-04 10:00'), 'size' => 184_320],
            ['title' => 'Procuração', 'type' => 'Juntada de documentos', 'uploadedAt' => new \DateTimeImmutable('2024-03-04 10:02'), 'size' => 52_224],
            ['title' => 'Contestação', 'type' => 'Contestação', 'uploadedAt' => new \DateTimeImmutable('2024-04-15 18:20'), 'size' => 1_572_864],
        ];
    }
}
