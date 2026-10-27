<?php

declare(strict_types=1);

namespace App\Tests\Component;

use App\Domain\CnjNumber;
use App\Domain\LegalCase\CaseStatus;
use App\Domain\LegalCase\EventType;
use App\Domain\LegalCase\FilingType;
use App\Domain\LegalCase\PartySide;
use App\Entity\LegalCase;
use App\Entity\User;

/**
 * In-memory entities for component tests.
 */
final class Samples
{
    public static function legalCase(bool $confidential = false, CaseStatus $status = CaseStatus::Active): LegalCase
    {
        $ana = User::lawyer('ana@jus.test', 'Ana Ribeiro', 'SP 123.456');
        $case = self::bareCase($confidential, $status);
        $case->addParty('Maria Oliveira', '123.456.789-00', PartySide::Plaintiff)->addLawyer($ana);
        $case->addParty('Empresa X Ltda.', '12.345.678/0001-90', PartySide::Defendant)
            ->addLawyer(User::lawyer('carla@jus.test', 'Carla Mendes', 'SP 654.321'));
        $case->file(FilingType::InitialPetition, 'Petição inicial distribuída.', new \DateTimeImmutable('2024-03-04 10:00'), $ana)
            ->attach('Petição inicial', 'peticao-inicial.pdf', 'sample-1.pdf', 184_320, $ana, new \DateTimeImmutable('2024-03-04 10:00'));
        $case->record(EventType::Decision, 'Tutela de urgência indeferida.', new \DateTimeImmutable('2024-04-02 16:00'));

        return $case;
    }

    /**
     * The same case without parties or events.
     */
    public static function bareCase(bool $confidential = false, CaseStatus $status = CaseStatus::Active): LegalCase
    {
        return new LegalCase(
            CnjNumber::fromString('0000001-39.2024.8.26.0100'),
            'Procedimento Comum Cível',
            'Indenização por dano moral',
            '1ª Vara Cível',
            $status,
            $confidential,
            1_500_000,
            new \DateTimeImmutable('2024-03-04 10:00'),
        );
    }
}
