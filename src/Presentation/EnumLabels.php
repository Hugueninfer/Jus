<?php

declare(strict_types=1);

namespace App\Presentation;

use App\Domain\LegalCase\CaseStatus;
use App\Domain\LegalCase\EventType;
use App\Domain\LegalCase\FilingType;
use App\Domain\LegalCase\PartySide;

/**
 * Portuguese labels of the legal case enums, shared by templates and forms.
 */
final class EnumLabels
{
    public function label(\BackedEnum $value): string
    {
        return match (true) {
            $value instanceof CaseStatus => match ($value) {
                CaseStatus::Active => 'Em andamento',
                CaseStatus::Suspended => 'Suspenso',
                CaseStatus::Archived => 'Arquivado',
            },
            $value instanceof PartySide => match ($value) {
                PartySide::Plaintiff => 'Polo ativo',
                PartySide::Defendant => 'Polo passivo',
            },
            $value instanceof EventType => match ($value) {
                EventType::Decision => 'Decisão',
                EventType::Order => 'Despacho',
                EventType::Filing => 'Juntada de petição',
                EventType::Summons => 'Intimação',
                EventType::Hearing => 'Audiência',
            },
            $value instanceof FilingType => match ($value) {
                FilingType::InitialPetition => 'Petição inicial',
                FilingType::Statement => 'Manifestação',
                FilingType::Answer => 'Contestação',
                FilingType::Appeal => 'Recurso',
                FilingType::Exhibits => 'Juntada de documentos',
            },
            default => throw new \InvalidArgumentException(\sprintf('There is no label for %s.', $value::class)),
        };
    }
}
