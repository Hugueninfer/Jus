<?php

declare(strict_types=1);

namespace App\Tests\Unit\Entity;

use App\Domain\CnjNumber;
use App\Domain\LegalCase\CaseStatus;
use App\Domain\LegalCase\EventType;
use App\Domain\LegalCase\PartySide;
use App\Entity\Deadline;
use App\Entity\LegalCase;
use PHPUnit\Framework\TestCase;

final class DeadlineTest extends TestCase
{
    public function testStartsOnTheSummonsCalendarDay(): void
    {
        $case = self::legalCase('0000001-39.2024.8.26.0100');
        $party = $case->addParty('Maria Oliveira', '123.456.789-00', PartySide::Plaintiff);
        $summons = $case->record(EventType::Summons, 'Intimação para manifestação.', new \DateTimeImmutable('2024-03-05 14:30'));

        $deadline = new Deadline($party, $summons, 15);

        self::assertNull($deadline->getId());
        self::assertSame($party, $deadline->getParty());
        self::assertSame($summons, $deadline->getSummons());
        self::assertSame('2024-03-05 00:00', $deadline->getStartDate()->format('Y-m-d H:i'));
        self::assertSame(15, $deadline->getBusinessDays());
        self::assertFalse($deadline->isFulfilled());
        self::assertNull($deadline->getFulfilledAt());
    }

    public function testKeepsTheFirstFulfilmentDate(): void
    {
        $case = self::legalCase('0000001-39.2024.8.26.0100');
        $party = $case->addParty('Maria Oliveira', '123.456.789-00', PartySide::Plaintiff);
        $deadline = new Deadline($party, $case->record(EventType::Summons, 'Intimação.', new \DateTimeImmutable('2024-03-05')), 5);

        $deadline->fulfil(new \DateTimeImmutable('2024-03-07 11:00'));
        $deadline->fulfil(new \DateTimeImmutable('2024-03-08 09:00'));

        self::assertTrue($deadline->isFulfilled());
        self::assertSame('2024-03-07 11:00', $deadline->getFulfilledAt()?->format('Y-m-d H:i'));
    }

    public function testStartsOnlyFromASummons(): void
    {
        $case = self::legalCase('0000001-39.2024.8.26.0100');
        $party = $case->addParty('Maria Oliveira', '123.456.789-00', PartySide::Plaintiff);

        $this->expectException(\InvalidArgumentException::class);

        new Deadline($party, $case->record(EventType::Order, 'Cite-se.', new \DateTimeImmutable('2024-03-05')), 5);
    }

    public function testThePartyAndTheSummonsBelongToTheSameCase(): void
    {
        $party = self::legalCase('0000001-39.2024.8.26.0100')->addParty('Maria Oliveira', '123.456.789-00', PartySide::Plaintiff);
        $summons = self::legalCase('0000003-09.2024.8.26.0100')->record(EventType::Summons, 'Intimação.', new \DateTimeImmutable('2024-03-05'));

        $this->expectException(\InvalidArgumentException::class);

        new Deadline($party, $summons, 5);
    }

    public function testNeedsAtLeastOneBusinessDay(): void
    {
        $case = self::legalCase('0000001-39.2024.8.26.0100');
        $party = $case->addParty('Maria Oliveira', '123.456.789-00', PartySide::Plaintiff);

        $this->expectException(\InvalidArgumentException::class);

        new Deadline($party, $case->record(EventType::Summons, 'Intimação.', new \DateTimeImmutable('2024-03-05')), 0);
    }

    private static function legalCase(string $number): LegalCase
    {
        return new LegalCase(
            CnjNumber::fromString($number),
            'Procedimento Comum Cível',
            'Cobrança',
            '1ª Vara Cível',
            CaseStatus::Active,
            false,
            100_000,
            new \DateTimeImmutable('2024-03-04'),
        );
    }
}
