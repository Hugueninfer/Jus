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
     * When anything fails, the stored files are removed again and the failure is rethrown. Every failure inside the
     * transaction (the domain refusing the filing, the database) leaves the entity manager closed, as Doctrine does when
     * it rolls a transaction back: the caller must not use it afterwards. A file that cannot be stored fails before the
     * transaction, so the entity manager stays open.
     *
     * Only the open deadlines that have already started are fulfilled: one whose summons is dated after the filing stays
     * open and never blocks it.
     *
     * @param list<UploadedFile> $files
     *
     * @throws \InvalidArgumentException when the lawyer represents no party of the case, or for a second initial petition
     * @throws IOException               when a file cannot be stored
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
                    // UploadedFile has already cut the client path down to its last segment.
                    $name = $file->getClientOriginalName();
                    $event->attach($this->titleOf($name, $type), mb_substr($name, 0, self::NAME_MAX_LENGTH), $document->name, $document->sizeInBytes, $lawyer, $now);
                }

                foreach ($this->deadlines->findOpenForLawyer($case, $lawyer, $now) as $deadline) {
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
