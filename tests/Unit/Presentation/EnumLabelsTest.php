<?php

declare(strict_types=1);

namespace App\Tests\Unit\Presentation;

use App\Domain\Deadline\Urgency;
use App\Domain\LegalCase\CaseStatus;
use App\Domain\LegalCase\EventType;
use App\Domain\LegalCase\FilingType;
use App\Domain\LegalCase\PartySide;
use App\Presentation\EnumLabels;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

final class EnumLabelsTest extends TestCase
{
    /**
     * @return iterable<string, array{\BackedEnum, string}>
     */
    public static function labels(): iterable
    {
        yield 'active' => [CaseStatus::Active, 'Em andamento'];
        yield 'suspended' => [CaseStatus::Suspended, 'Suspenso'];
        yield 'archived' => [CaseStatus::Archived, 'Arquivado'];
        yield 'plaintiff' => [PartySide::Plaintiff, 'Polo ativo'];
        yield 'defendant' => [PartySide::Defendant, 'Polo passivo'];
        yield 'decision' => [EventType::Decision, 'Decisão'];
        yield 'order' => [EventType::Order, 'Despacho'];
        yield 'filing' => [EventType::Filing, 'Juntada de petição'];
        yield 'summons' => [EventType::Summons, 'Intimação'];
        yield 'hearing' => [EventType::Hearing, 'Audiência'];
        yield 'initial petition' => [FilingType::InitialPetition, 'Petição inicial'];
        yield 'statement' => [FilingType::Statement, 'Manifestação'];
        yield 'answer' => [FilingType::Answer, 'Contestação'];
        yield 'appeal' => [FilingType::Appeal, 'Recurso'];
        yield 'exhibits' => [FilingType::Exhibits, 'Juntada de documentos'];
    }

    #[DataProvider('labels')]
    public function testLabelsInPortuguese(\BackedEnum $value, string $expected): void
    {
        self::assertSame($expected, (new EnumLabels())->label($value));
    }

    public function testRejectsEnumsWithoutLabels(): void
    {
        $this->expectException(\InvalidArgumentException::class);

        (new EnumLabels())->label(Urgency::OnTrack);
    }
}
