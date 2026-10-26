<?php

declare(strict_types=1);

namespace App\Tests\Unit\Entity;

use App\Domain\CnjNumber;
use App\Domain\LegalCase\CaseStatus;
use App\Domain\LegalCase\EventType;
use App\Domain\LegalCase\FilingType;
use App\Domain\LegalCase\PartySide;
use App\Entity\LegalCase;
use App\Entity\User;
use PHPUnit\Framework\TestCase;

final class LegalCaseTest extends TestCase
{
    public function testExposesItsData(): void
    {
        $case = self::legalCase(CaseStatus::Archived, true);

        self::assertNull($case->getId());
        self::assertSame('0000001-39.2024.8.26.0100', $case->getNumber()->formatted());
        self::assertSame('Procedimento Comum Cível', $case->getCaseClass());
        self::assertSame('Indenização por dano moral', $case->getSubject());
        self::assertSame('1ª Vara Cível', $case->getCourt());
        self::assertSame(CaseStatus::Archived, $case->getStatus());
        self::assertTrue($case->isArchived());
        self::assertTrue($case->isConfidential());
        self::assertSame(1_500_000, $case->getClaimValueInCents());
        self::assertSame('2024-03-04 10:00', $case->getFiledAt()->format('Y-m-d H:i'));
        self::assertFalse(self::legalCase()->isArchived());
    }

    public function testAddsPartiesAndKnowsWhoRepresentsThem(): void
    {
        $case = self::legalCase();
        $lawyer = User::lawyer('ana@jus.test', 'Ana Ribeiro', 'SP 123.456');

        $plaintiff = $case->addParty('Maria Oliveira', '123.456.789-00', PartySide::Plaintiff);
        $plaintiff->addLawyer($lawyer);
        $case->addParty('Empresa X Ltda.', '12.345.678/0001-90', PartySide::Defendant);

        self::assertCount(2, $case->getParties());
        self::assertSame($plaintiff, $case->getParties()[0]);
        self::assertSame($case, $plaintiff->getLegalCase());
        self::assertTrue($case->isRepresentedBy($lawyer));
        self::assertTrue($case->isRepresentedBy(User::lawyer('ana@jus.test', 'Ana R.', 'SP 123.456')));
        self::assertFalse($case->isRepresentedBy(User::lawyer('carla@jus.test', 'Carla Mendes', 'SP 654.321')));
    }

    public function testListsEventsNewestFirst(): void
    {
        $case = self::legalCase();
        $clerk = User::clerk('joao@jus.test', 'João Almeida');

        $older = $case->record(EventType::Order, 'Cite-se a parte ré.', new \DateTimeImmutable('2024-03-10 09:00'), $clerk);
        $newer = $case->record(EventType::Decision, 'Tutela de urgência deferida.', new \DateTimeImmutable('2024-04-02 16:00'));

        self::assertSame([$newer, $older], $case->getEvents());
        self::assertSame($case, $older->getLegalCase());
        self::assertSame($clerk, $older->getCreatedBy());
        self::assertNull($newer->getCreatedBy());
        self::assertNull($older->getFilingType());
    }

    public function testFilesOnBehalfOfARepresentedParty(): void
    {
        $case = self::legalCase();
        $lawyer = User::lawyer('ana@jus.test', 'Ana Ribeiro', 'SP 123.456');
        $case->addParty('Maria Oliveira', '123.456.789-00', PartySide::Plaintiff)->addLawyer($lawyer);
        $at = new \DateTimeImmutable('2024-03-15 16:00');

        $filing = $case->file(FilingType::Statement, 'Manifestação.', $at, $lawyer);

        self::assertSame(EventType::Filing, $filing->getType());
        self::assertSame(FilingType::Statement, $filing->getFilingType());
        self::assertSame('Manifestação.', $filing->getDescription());
        self::assertSame($at, $filing->getOccurredAt());
        self::assertSame($lawyer, $filing->getCreatedBy());
        self::assertSame($case, $filing->getLegalCase());
        self::assertSame([$filing], $case->getEvents());
    }

    public function testOnlyCounselOfAPartyCanFile(): void
    {
        $case = self::legalCase();
        $case->addParty('Maria Oliveira', '123.456.789-00', PartySide::Plaintiff)
            ->addLawyer(User::lawyer('ana@jus.test', 'Ana Ribeiro', 'SP 123.456'));

        $this->expectException(\InvalidArgumentException::class);
        $this->expectExceptionMessage('"carla@jus.test" does not represent any party in case 0000001-39.2024.8.26.0100.');

        $case->file(FilingType::Statement, 'Manifestação.', new \DateTimeImmutable('2024-03-15 16:00'), User::lawyer('carla@jus.test', 'Carla Mendes', 'SP 654.321'));
    }

    private static function legalCase(CaseStatus $status = CaseStatus::Active, bool $confidential = false): LegalCase
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
