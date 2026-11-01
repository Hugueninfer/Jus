<?php

declare(strict_types=1);

namespace App\Presentation;

use App\Entity\Document;
use App\Entity\LegalCase;
use Symfony\Component\Routing\Generator\UrlGeneratorInterface;

/**
 * Columns and rows of the "Documentos" table of the case page.
 */
final readonly class CaseDocumentsTable
{
    public function __construct(private UrlGeneratorInterface $urls)
    {
    }

    /**
     * @return list<array{key: string, label: string, sortable?: bool, format?: string, href?: string}>
     */
    public function columns(): array
    {
        return [
            ['key' => 'title', 'label' => 'Título', 'sortable' => true, 'href' => 'url'],
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
        return array_map(function (Document $document): array {
            $id = $document->getId();

            return [
                'title' => $document->getTitle(),
                'type' => $document->getEvent()->getFilingType() ?? $document->getEvent()->getType(),
                'uploadedAt' => $document->getUploadedAt(),
                'size' => $document->getSizeInBytes(),
                // From the id the case already loaded, so the link costs no query. A document that is not saved yet has no
                // address (the table shows its title as plain text).
                'url' => null === $id ? null : $this->urls->generate('document_download', ['id' => $id]),
            ];
        }, $case->getDocuments());
    }
}
