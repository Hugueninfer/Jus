<?php

declare(strict_types=1);

namespace App\Tests\Unit\Entity;

use App\Domain\CnjNumber;
use App\Domain\LegalCase\CaseStatus;
use App\Domain\LegalCase\EventType;
use App\Entity\LegalCase;
use App\Entity\User;
use PHPUnit\Framework\TestCase;

final class CaseEventTest extends TestCase
{
    public function testAttachesDocuments(): void
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
        $lawyer = User::lawyer('ana@jus.test', 'Ana Ribeiro', 'SP 123.456');
        $event = $case->record(EventType::Filing, 'Petição inicial distribuída.', new \DateTimeImmutable('2024-03-04 10:00'), $lawyer);

        $document = $event->attach('Petição inicial', 'peticao.pdf', 'stored-1.pdf', 184_320, $lawyer, new \DateTimeImmutable('2024-03-04 10:05'));

        self::assertNull($event->getId());
        self::assertSame(EventType::Filing, $event->getType());
        self::assertSame('Petição inicial distribuída.', $event->getDescription());
        self::assertSame('2024-03-04 10:00', $event->getOccurredAt()->format('Y-m-d H:i'));
        self::assertSame([$document], $event->getDocuments());
        self::assertNull($document->getId());
        self::assertSame($event, $document->getEvent());
        self::assertSame('Petição inicial', $document->getTitle());
        self::assertSame('peticao.pdf', $document->getOriginalFilename());
        self::assertSame('stored-1.pdf', $document->getStoredFilename());
        self::assertSame(184_320, $document->getSizeInBytes());
        self::assertSame($lawyer, $document->getUploadedBy());
        self::assertSame('2024-03-04 10:05', $document->getUploadedAt()->format('Y-m-d H:i'));
    }
}
