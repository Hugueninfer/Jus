<?php

declare(strict_types=1);

namespace App\Presentation;

use App\Entity\Document;
use App\Entity\LegalCase;

/**
 * Columns and rows of the "Documentos" table of the case page.
 */
final class CaseDocumentsTable
{
    /**
     * @return list<array{key: string, label: string, sortable?: bool, format?: string, href?: string}>
     */
    public function columns(): array
    {
        return [
            ['key' => 'title', 'label' => 'Título', 'sortable' => true],
            ['key' => 'type', 'label' => 'Tipo', 'sortable' => true, 'format' => 'label'],
            ['key' => 'uploadedAt', 'label' => 'Data', 'sortable' => true, 'format' => 'date'],
            ['key' => 'size', 'label' => 'Tamanho', 'sortable' => true, 'format' => 'bytes'],
        ];
    }

    /**
     * @return list<array<string, mixed>>
     */
    public function rows(LegalCase $case): array
    {
        return array_map(static fn (Document $document): array => [
            'title' => $document->getTitle(),
            'type' => $document->getEvent()->getFilingType() ?? $document->getEvent()->getType(),
            'uploadedAt' => $document->getUploadedAt(),
            'size' => $document->getSizeInBytes(),
        ], $case->getDocuments());
    }
}
