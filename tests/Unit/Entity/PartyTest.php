<?php

declare(strict_types=1);

namespace App\Tests\Unit\Entity;

use App\Domain\CnjNumber;
use App\Domain\LegalCase\CaseStatus;
use App\Domain\LegalCase\PartySide;
use App\Entity\LegalCase;
use App\Entity\Party;
use App\Entity\User;
use PHPUnit\Framework\TestCase;

final class PartyTest extends TestCase
{
    public function testExposesItsData(): void
    {
        $party = self::party();

        self::assertNull($party->getId());
        self::assertSame('Maria Oliveira', $party->getName());
        self::assertSame('123.456.789-00', $party->getTaxId());
        self::assertSame(PartySide::Plaintiff, $party->getSide());
        self::assertSame([], $party->getLawyers());
    }

    public function testDoesNotAddTheSameLawyerTwice(): void
    {
        $party = self::party();
        $lawyer = User::lawyer('ana@jus.test', 'Ana Ribeiro', 'SP 123.456');

        $party->addLawyer($lawyer);
        $party->addLawyer(User::lawyer('ana@jus.test', 'Ana R.', 'SP 123.456'));

        self::assertSame([$lawyer], $party->getLawyers());
        self::assertTrue($party->isRepresentedBy($lawyer));
    }

    public function testOnlyLawyersRepresentAParty(): void
    {
        $this->expectException(\InvalidArgumentException::class);

        self::party()->addLawyer(User::clerk('joao@jus.test', 'João Almeida'));
    }

    private static function party(): Party
    {
        $case = new LegalCase(
            CnjNumber::fromString('0000001-39.2024.8.26.0100'),
            'Procedimento Comum Cível',
            'Cobrança',
            '1ª Vara Cível',
            CaseStatus::Active,
            false,
            100_000,
            new \DateTimeImmutable('2024-03-04'),
        );

        return $case->addParty('Maria Oliveira', '123.456.789-00', PartySide::Plaintiff);
    }
}
