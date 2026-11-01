<?php

declare(strict_types=1);

namespace App\Tests\Integration;

use App\Domain\LegalCase\EventType;
use App\Domain\LegalCase\FilingType;
use App\Domain\LegalCase\PartySide;
use App\Entity\CaseEvent;
use App\Entity\Deadline;
use App\Entity\Document;
use App\Entity\LegalCase;
use App\Entity\Party;
use App\Entity\User;
use App\Filing\DocumentStorage;
use App\Filing\FilingService;
use App\Presentation\EnumLabels;
use App\Repository\DeadlineRepository;
use App\Tests\Support\TestCases;
use Doctrine\ORM\EntityManagerInterface;
use Doctrine\ORM\Events;
use PHPUnit\Framework\Attributes\DataProvider;
use Psr\Clock\ClockInterface;
use Symfony\Bundle\FrameworkBundle\Test\KernelTestCase;
use Symfony\Component\Clock\Test\ClockSensitiveTrait;
use Symfony\Component\Filesystem\Exception\IOException;
use Symfony\Component\Filesystem\Filesystem;
use Symfony\Component\Filesystem\Path;
use Symfony\Component\HttpFoundation\File\UploadedFile;

final class FilingServiceTest extends KernelTestCase
{
    use ClockSensitiveTrait;

    private const string SAMPLE = __DIR__.'/../fixtures/sample.pdf';
    private const string NOW = '2024-03-20 11:30:00';

    private EntityManagerInterface $em;
    private TestCases $data;
    private FilingService $service;
    private DocumentStorage $storage;
    private string $directory;
    private User $lawyer;
    private LegalCase $case;

    /** @var list<string> */
    private array $temporaryFiles = [];

    protected function setUp(): void
    {
        parent::setUp();

        self::mockTime(self::NOW);
        self::bootKernel();
        $container = self::getContainer();
        $this->em = $container->get(EntityManagerInterface::class);
        $this->service = $container->get(FilingService::class);
        $this->storage = $container->get(DocumentStorage::class);
        $this->directory = $container->getParameter('app.documents_dir');
        $this->data = new TestCases($this->em);

        $this->storage->clear();
        $this->lawyer = $this->data->lawyer('ana@jus.test', 'Ana Ribeiro');
        $this->case = $this->data->legalCase('0000001', $this->lawyer);
    }

    protected function tearDown(): void
    {
        (new Filesystem())->remove([...$this->temporaryFiles, $this->directory]);
        parent::tearDown();
    }

    public function testItRecordsTheFilingWithOneDocumentPerFile(): void
    {
        $event = $this->service->file($this->case, $this->lawyer, FilingType::Answer, 'Contestação e procuração.', [
            $this->upload('contestacao.pdf'),
            $this->upload('Procuração.PDF'),
        ]);
        $this->em->clear();

        $saved = $this->em->find(CaseEvent::class, $event->getId());
        self::assertInstanceOf(CaseEvent::class, $saved);
        self::assertSame(EventType::Filing, $saved->getType());
        self::assertSame(FilingType::Answer, $saved->getFilingType());
        self::assertSame('Contestação e procuração.', $saved->getDescription());
        self::assertSame(self::NOW, $saved->getOccurredAt()->format('Y-m-d H:i:s'));
        self::assertSame('ana@jus.test', $saved->getCreatedBy()?->getEmail());
        self::assertSame($this->case->getId(), $saved->getLegalCase()->getId());

        $documents = $saved->getDocuments();
        self::assertSame(['contestacao', 'Procuração'], array_map(static fn (Document $document): string => $document->getTitle(), $documents));
        self::assertSame(['contestacao.pdf', 'Procuração.PDF'], array_map(static fn (Document $document): string => $document->getOriginalFilename(), $documents));
        foreach ($documents as $document) {
            $path = $this->storage->pathOf($document->getStoredFilename());
            self::assertNotNull($path, 'The stored file must exist on disk.');
            self::assertFileEquals(self::SAMPLE, $path);
            self::assertSame((int) filesize(self::SAMPLE), $document->getSizeInBytes());
            self::assertSame('ana@jus.test', $document->getUploadedBy()->getEmail());
            self::assertSame(self::NOW, $document->getUploadedAt()->format('Y-m-d H:i:s'));
        }
        self::assertCount(2, array_unique(array_map(static fn (Document $document): string => $document->getStoredFilename(), $documents)));
        self::assertCount(2, $this->storedPdfs());
    }

    public function testItFulfilsTheOpenDeadlinesOfThePartiesTheLawyerRepresents(): void
    {
        $this->party(PartySide::Defendant)->addLawyer($this->data->lawyer('bruno@jus.test', 'Bruno Teixeira'));
        $plaintiff = $this->party(PartySide::Plaintiff);
        $firstOpen = $this->data->deadline($plaintiff, '2024-03-05 08:00');
        $secondOpen = $this->data->deadline($plaintiff, '2024-03-12 08:00');
        $alreadyFulfilled = $this->data->deadline($plaintiff, '2024-03-06 08:00', '2024-03-08 15:00');
        $otherSide = $this->data->deadline($this->party(PartySide::Defendant), '2024-03-05 08:00');
        $ofAnotherCase = $this->data->deadline($this->data->legalCase('0000002', $this->lawyer)->getParties()[0], '2024-03-05 08:00');

        $this->service->file($this->case, $this->lawyer, FilingType::Statement, 'Manifestação.', [$this->upload()]);
        $this->em->clear();

        self::assertSame(self::NOW, $this->fulfilledAt($firstOpen));
        self::assertSame(self::NOW, $this->fulfilledAt($secondOpen));
        self::assertSame('2024-03-08 15:00:00', $this->fulfilledAt($alreadyFulfilled), 'A deadline that was fulfilled keeps its date.');
        self::assertNull($this->fulfilledAt($otherSide), 'The other party is represented by someone else.');
        self::assertNull($this->fulfilledAt($ofAnotherCase), 'A filing only answers the deadlines of its own case.');
    }

    public function testItFulfilsNothingWhenThereAreNoOpenDeadlines(): void
    {
        $event = $this->service->file($this->case, $this->lawyer, FilingType::Exhibits, 'Documentos.', [$this->upload()]);

        self::assertNotNull($event->getId());
        self::assertSame(0, $this->scalarCount('SELECT COUNT(*) FROM deadline'));
    }

    public function testALawyerWhoRepresentsNoPartyFilesNothingAndLeavesNoFileBehind(): void
    {
        $stranger = $this->data->lawyer('rui@jus.test', 'Rui Lima');
        $this->data->deadline($this->party(PartySide::Plaintiff));
        $before = $this->rowCounts();

        try {
            $this->service->file($this->case, $stranger, FilingType::Statement, 'Manifestação.', [$this->upload(), $this->upload('anexo.pdf')]);
            self::fail('A lawyer who represents no party cannot file.');
        } catch (\InvalidArgumentException $e) {
            self::assertStringContainsString('does not represent any party', $e->getMessage());
        }

        self::assertSame([], $this->storedPdfs());
        self::assertSame($before, $this->rowCounts());
    }

    /**
     * @return iterable<string, array{string}>
     */
    public static function flushStages(): iterable
    {
        yield 'before the database is touched' => [Events::onFlush];
        // The inserts and updates have run by then, so only the rollback of the transaction can undo them.
        yield 'after the inserts and updates ran' => [Events::postFlush];
    }

    #[DataProvider('flushStages')]
    public function testWhenTheDatabaseFailsNothingIsKeptAndTheErrorIsRethrown(string $stage): void
    {
        $this->data->deadline($this->party(PartySide::Plaintiff));
        $before = $this->rowCounts();
        $failure = new \RuntimeException('The database went away.');
        $this->em->getEventManager()->addEventListener([$stage], new class($failure) {
            public function __construct(private readonly \Throwable $failure)
            {
            }

            public function onFlush(): never
            {
                throw $this->failure;
            }

            public function postFlush(): never
            {
                throw $this->failure;
            }
        });

        try {
            $this->service->file($this->case, $this->lawyer, FilingType::Statement, 'Manifestação.', [$this->upload(), $this->upload('anexo.pdf')]);
            self::fail('The failure of the database must reach the caller.');
        } catch (\RuntimeException $e) {
            self::assertSame($failure, $e);
        }

        self::assertSame([], $this->storedPdfs());
        self::assertSame($before, $this->rowCounts(), 'The event, its documents and the fulfilled deadlines are rolled back.');
    }

    public function testAFileThatCannotBeStoredTakesTheOnesAlreadyStoredWithIt(): void
    {
        $vanished = $this->upload('segundo.pdf');
        (new Filesystem())->remove($vanished->getPathname());
        $before = $this->rowCounts();

        try {
            $this->service->file($this->case, $this->lawyer, FilingType::Statement, 'Manifestação.', [$this->upload('primeiro.pdf'), $vanished]);
            self::fail('A file that cannot be copied must stop the filing.');
        } catch (IOException) {
            // expected: the assertions below check what the failure left behind
        }

        self::assertSame([], $this->storedPdfs());
        self::assertSame($before, $this->rowCounts());
    }

    public function testACleanupThatFailsDoesNotHideTheOriginalError(): void
    {
        $cannotRemove = new class extends Filesystem {
            /** @param string|iterable<string> $files */
            public function remove(string|iterable $files): void
            {
                throw new IOException('The cleanup failed.');
            }
        };
        $container = self::getContainer();
        $service = new FilingService(
            new DocumentStorage($this->directory, $cannotRemove),
            $this->em,
            $container->get(DeadlineRepository::class),
            $container->get(ClockInterface::class),
            $container->get(EnumLabels::class),
        );
        $stranger = $this->data->lawyer('rui@jus.test', 'Rui Lima');

        try {
            $service->file($this->case, $stranger, FilingType::Statement, 'Manifestação.', [$this->upload()]);
            self::fail('A lawyer who represents no party cannot file.');
        } catch (\InvalidArgumentException $e) {
            self::assertStringContainsString('does not represent any party', $e->getMessage());
        }
    }

    /**
     * The name the browser sent, the filing type, and the expected title and original name.
     *
     * @return iterable<string, array{string, FilingType, string, string}>
     */
    public static function clientNames(): iterable
    {
        yield 'an upper case extension' => ['Contestação Final.PDF', FilingType::Answer, 'Contestação Final', 'Contestação Final.PDF'];
        // The three path rows pin Symfony's contract: UploadedFile cuts the client name down to its last segment, and
        // the service relies on that instead of doing it again.
        yield 'a Windows path' => ['C:\\fakepath\\a.pdf', FilingType::Answer, 'a', 'a.pdf'];
        yield 'a Unix path' => ['/home/ana/docs/b.pdf', FilingType::Answer, 'b', 'b.pdf'];
        yield 'both kinds of separator' => ['C:/dir\\sub/c.pdf', FilingType::Answer, 'c', 'c.pdf'];
        yield 'a space before the extension' => ['Réplica .pdf', FilingType::Answer, 'Réplica', 'Réplica .pdf'];
        yield 'padding around the name' => [' Réplica.pdf ', FilingType::Answer, 'Réplica', ' Réplica.pdf '];
        yield 'only the last extension goes' => ['a.pdf.pdf', FilingType::Answer, 'a.pdf', 'a.pdf.pdf'];
        yield 'no extension' => ['sem extensão', FilingType::Answer, 'sem extensão', 'sem extensão'];
        yield 'another extension that starts like it' => ['ata.pdfx', FilingType::Answer, 'ata.pdfx', 'ata.pdfx'];
        yield 'nothing left of the name' => ['.pdf', FilingType::Answer, 'Contestação', '.pdf'];
        yield 'nothing left, other type' => ['  .PDF', FilingType::Exhibits, 'Juntada de documentos', '  .PDF'];
    }

    #[DataProvider('clientNames')]
    public function testTheTitleAndTheOriginalNameComeFromTheNameTheBrowserSent(string $clientName, FilingType $type, string $title, string $originalName): void
    {
        $event = $this->service->file($this->case, $this->lawyer, $type, 'Petição.', [$this->upload($clientName)]);

        $document = $event->getDocuments()[0];
        self::assertSame($title, $document->getTitle());
        self::assertSame($originalName, $document->getOriginalFilename());
    }

    public function testVeryLongNamesAreCutToWhatTheColumnsHold(): void
    {
        $event = $this->service->file($this->case, $this->lawyer, FilingType::Answer, 'Petição.', [$this->upload(str_repeat('ç', 300).'.pdf')]);

        $document = $event->getDocuments()[0];
        self::assertSame(str_repeat('ç', 255), $document->getTitle());
        self::assertSame(255, mb_strlen($document->getOriginalFilename()));
        self::assertStringStartsWith('çç', $document->getOriginalFilename());
    }

    private function party(PartySide $side): Party
    {
        foreach ($this->case->getParties() as $party) {
            if ($side === $party->getSide()) {
                return $party;
            }
        }

        throw new \LogicException(\sprintf('The case has no %s party.', $side->value));
    }

    /**
     * A copy of the sample PDF as the browser would have sent it under $clientName.
     */
    private function upload(string $clientName = 'peticao.pdf'): UploadedFile
    {
        $path = tempnam(sys_get_temp_dir(), 'jus');
        if (false === $path) {
            throw new \RuntimeException('Could not create a temporary file.');
        }

        $this->temporaryFiles[] = $path;
        (new Filesystem())->copy(self::SAMPLE, $path, true);

        return new UploadedFile($path, $clientName, 'application/pdf', null, true);
    }

    /**
     * @return list<string>
     */
    private function storedPdfs(): array
    {
        return glob(Path::join($this->directory, '*.pdf')) ?: [];
    }

    private function fulfilledAt(Deadline $deadline): ?string
    {
        return $this->em->find(Deadline::class, $deadline->getId())?->getFulfilledAt()?->format('Y-m-d H:i:s');
    }

    /**
     * @return array{events: int, documents: int, fulfilled: int}
     */
    private function rowCounts(): array
    {
        return [
            'events' => $this->scalarCount('SELECT COUNT(*) FROM case_event'),
            'documents' => $this->scalarCount('SELECT COUNT(*) FROM document'),
            'fulfilled' => $this->scalarCount('SELECT COUNT(*) FROM deadline WHERE fulfilled_at IS NOT NULL'),
        ];
    }

    /**
     * Reads through the connection, which keeps working after a failed flush has closed the entity manager.
     */
    private function scalarCount(string $sql): int
    {
        $count = $this->em->getConnection()->fetchOne($sql);
        self::assertIsNumeric($count);

        return (int) $count;
    }
}
