<?php

declare(strict_types=1);

namespace App\Filing;

use App\Domain\LegalCase\FilingType;
use App\Entity\CaseEvent;
use App\Entity\LegalCase;
use App\Entity\User;
use App\Presentation\EnumLabels;
use App\Repository\DeadlineRepository;
use Doctrine\ORM\EntityManagerInterface;
use Psr\Clock\ClockInterface;
use Symfony\Component\Filesystem\Exception\IOException;
use Symfony\Component\HttpFoundation\File\UploadedFile;

/**
 * A lawyer's filing: the PDFs go to the documents directory, then one transaction records the filing event, attaches
 * the documents to it and fulfils the lawyer's open deadlines in the case.
 *
 * Who may file is decided before this is called (the case authorization); the checks on the files (type, size, number)
 * belong to the form and read FilingLimits.
 */
final readonly class FilingService
{
    // The length of the title and original name columns of the document table.
    private const int NAME_MAX_LENGTH = 255;

    public function __construct(
        private DocumentStorage $storage,
        private EntityManagerInterface $entityManager,
        private DeadlineRepository $deadlines,
        private ClockInterface $clock,
        private EnumLabels $labels,
    ) {
    }

    /**
     * When anything fails, the stored files are removed again and the failure is rethrown. A failure inside the
     * transaction (including the domain refusing the filing) also closes the entity manager, as Doctrine does when a
     * transaction is rolled back: the caller must not use it afterwards.
     *
     * @param list<UploadedFile> $files
     *
     * @throws \InvalidArgumentException when the lawyer represents no party of the case, or for a second initial petition
     */
    public function file(LegalCase $case, User $lawyer, FilingType $type, string $description, array $files): CaseEvent
    {
        $stored = [];

        try {
            foreach ($files as $file) {
                $stored[] = [$file, $this->storage->store($file)];
            }

            $now = $this->clock->now();

            return $this->entityManager->wrapInTransaction(function () use ($case, $lawyer, $type, $description, $stored, $now): CaseEvent {
                $event = $case->file($type, $description, $now, $lawyer);
                foreach ($stored as [$file, $document]) {
                    $name = $this->lastSegment($file->getClientOriginalName());
                    $event->attach($this->titleOf($name, $type), mb_substr($name, 0, self::NAME_MAX_LENGTH), $document->name, $document->sizeInBytes, $lawyer, $now);
                }

                foreach ($this->deadlines->findOpenForLawyer($case, $lawyer) as $deadline) {
                    $deadline->fulfil($now);
                }

                return $event;
            });
        } catch (\Throwable $failure) {
            foreach ($stored as [, $document]) {
                try {
                    $this->storage->delete($document->name);
                } catch (IOException) {
                    // A leftover that cannot be removed must not replace the failure that caused the cleanup.
                }
            }

            throw $failure;
        }
    }

    /**
     * Browsers may send the whole client path ("C:\fakepath\a.pdf"), so only what follows the last separator is a name.
     */
    private function lastSegment(string $clientName): string
    {
        $segments = explode('/', str_replace('\\', '/', $clientName));

        return end($segments);
    }

    /**
     * The name without its ".pdf" extension, or the label of the filing type when nothing is left.
     */
    private function titleOf(string $name, FilingType $type): string
    {
        $title = trim($name);
        if ('.pdf' === strtolower(substr($title, -4))) {
            $title = trim(substr($title, 0, -4));
        }

        return '' === $title ? $this->labels->label($type) : mb_substr($title, 0, self::NAME_MAX_LENGTH);
    }
}
