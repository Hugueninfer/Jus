<?php

declare(strict_types=1);

namespace App\Tests\Integration;

use App\Filing\DocumentStorage;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\Attributes\RequiresOperatingSystemFamily;
use Symfony\Bundle\FrameworkBundle\Test\KernelTestCase;
use Symfony\Component\Filesystem\Exception\IOException;
use Symfony\Component\Filesystem\Filesystem;
use Symfony\Component\Filesystem\Path;

final class DocumentStorageTest extends KernelTestCase
{
    private const string UUID_PDF = '/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.pdf$/';
    private const string SAMPLE = __DIR__.'/../fixtures/sample.pdf';

    // Planted one level above the documents directory, where "../<name>" would reach them.
    private const string CANARY = 'canary.pdf';
    private const string UUID_CANARY = '0194f1c0-0000-7000-8000-00000000c0de.pdf';

    private DocumentStorage $storage;
    private string $directory;

    protected function setUp(): void
    {
        parent::setUp();

        $this->storage = self::getContainer()->get(DocumentStorage::class);
        $this->directory = self::getContainer()->getParameter('app.documents_dir');

        $this->storage->clear();

        $filesystem = new Filesystem();
        foreach ([self::CANARY, self::UUID_CANARY] as $canary) {
            $filesystem->copy(self::SAMPLE, $this->outside($canary), true);
            self::assertFileExists(Path::join($this->directory, '..', $canary), 'The traversal names must point at real files.');
        }
    }

    protected function tearDown(): void
    {
        (new Filesystem())->remove([$this->outside(self::CANARY), $this->outside(self::UUID_CANARY), $this->directory]);
        parent::tearDown();
    }

    public function testEachEnvironmentHasItsOwnDirectoryOutsideThePublicOne(): void
    {
        $directory = Path::canonicalize($this->directory);

        self::assertStringEndsWith('/var/uploads/test', $directory);
        self::assertStringNotContainsString('/public', $directory);
    }

    public function testItStoresACopyUnderAUuidName(): void
    {
        $stored = $this->storage->store(new \SplFileInfo(self::SAMPLE));

        self::assertMatchesRegularExpression(self::UUID_PDF, $stored->name);
        self::assertSame(filesize(self::SAMPLE), $stored->sizeInBytes);

        $path = $this->storage->pathOf($stored->name);
        self::assertNotNull($path);
        self::assertFileEquals(self::SAMPLE, $path);
        self::assertSame($stored->sizeInBytes, filesize($path));
    }

    public function testItCopiesFromALocalPath(): void
    {
        $stored = $this->storage->copyFrom(self::SAMPLE);

        self::assertMatchesRegularExpression(self::UUID_PDF, $stored->name);
        self::assertSame(filesize(self::SAMPLE), $stored->sizeInBytes);
        self::assertFileEquals(self::SAMPLE, (string) $this->storage->pathOf($stored->name));
    }

    public function testTheOriginalIsLeftInPlace(): void
    {
        $this->storage->store(new \SplFileInfo(self::SAMPLE));

        self::assertFileExists(self::SAMPLE);
    }

    public function testItCreatesTheDirectoryWhenItIsMissing(): void
    {
        (new Filesystem())->remove($this->directory);
        self::assertDirectoryDoesNotExist($this->directory);

        $stored = $this->storage->copyFrom(self::SAMPLE);

        self::assertNotNull($this->storage->pathOf($stored->name));
    }

    #[RequiresOperatingSystemFamily('Linux')]
    public function testTheDirectoryIsClosedToEveryoneOutsideTheOwnerAndGroup(): void
    {
        (new Filesystem())->remove($this->directory);

        $this->storage->copyFrom(self::SAMPLE);

        self::assertSame(0, fileperms($this->directory) & 0o007);
    }

    public function testTwoStoresDoNotCollide(): void
    {
        $first = $this->storage->store(new \SplFileInfo(self::SAMPLE));
        $second = $this->storage->store(new \SplFileInfo(self::SAMPLE));

        self::assertNotSame($first->name, $second->name);
        self::assertNotNull($this->storage->pathOf($first->name));
        self::assertNotNull($this->storage->pathOf($second->name));
    }

    public function testCopyingAMissingFileThrowsAndLeavesNoPdfBehind(): void
    {
        try {
            $this->storage->copyFrom(Path::join($this->directory, 'missing.pdf'));
            self::fail('Copying a file that does not exist must throw.');
        } catch (IOException) {
            self::assertSame([], glob(Path::join($this->directory, '*.pdf')));
        }
    }

    public function testACopyThatFailsHalfWayLeavesNoPdfBehind(): void
    {
        $failsAfterCopying = new class extends Filesystem {
            public function copy(string $originFile, string $targetFile, bool $overwriteNewerFiles = false): void
            {
                parent::copy($originFile, $targetFile, $overwriteNewerFiles);

                throw new IOException('The disk went away.');
            }
        };

        try {
            (new DocumentStorage($this->directory, $failsAfterCopying))->copyFrom(self::SAMPLE);
            self::fail('The failure of the copy must reach the caller.');
        } catch (IOException $e) {
            self::assertSame('The disk went away.', $e->getMessage());
            self::assertSame([], glob(Path::join($this->directory, '*.pdf')));
        }
    }

    public function testTheCopyErrorSurvivesAFailedCleanup(): void
    {
        $failsAtEverything = new class extends Filesystem {
            public function copy(string $originFile, string $targetFile, bool $overwriteNewerFiles = false): void
            {
                throw new IOException('The copy failed.');
            }

            /** @param string|iterable<string> $files */
            public function remove(string|iterable $files): void
            {
                throw new IOException('The cleanup failed too.');
            }
        };

        try {
            (new DocumentStorage($this->directory, $failsAtEverything))->copyFrom(self::SAMPLE);
            self::fail('The failure of the copy must reach the caller.');
        } catch (IOException $e) {
            self::assertSame('The copy failed.', $e->getMessage());
        }
    }

    /**
     * Runs on every OS, unlike the end-to-end check above (Windows ignores the mode). Filesystem::copy() asks for the
     * parent directory with the default mode too, so it is the first request that has to carry the closed one.
     */
    public function testTheDirectoryIsCreatedWithAModeThatClosesItToOthers(): void
    {
        $recordsMkdir = new class extends Filesystem {
            /** @var list<array{string, int}> */
            public array $requests = [];

            /** @param string|iterable<string> $dirs */
            public function mkdir(string|iterable $dirs, int $mode = 0o777): void
            {
                $dirs = \is_string($dirs) ? [$dirs] : [...$dirs];
                foreach ($dirs as $dir) {
                    $this->requests[] = [$dir, $mode];
                }

                parent::mkdir($dirs, $mode);
            }
        };
        (new Filesystem())->remove($this->directory);

        (new DocumentStorage($this->directory, $recordsMkdir))->copyFrom(self::SAMPLE);

        self::assertSame([$this->directory, 0o750], $recordsMkdir->requests[0] ?? null);
    }

    /**
     * @return iterable<string, array{string}>
     */
    public static function nonLocalSources(): iterable
    {
        // Loopback on the discard port: should the guard ever go missing, nothing leaves the machine.
        yield 'http' => ['http://127.0.0.1:9/sample.pdf'];
        yield 'https' => ['https://127.0.0.1:9/sample.pdf'];
        yield 'ftp' => ['ftp://127.0.0.1:9/sample.pdf'];
    }

    #[DataProvider('nonLocalSources')]
    public function testItOnlyCopiesFromLocalFiles(string $source): void
    {
        try {
            $this->storage->copyFrom($source);
            self::fail('A source that is not a local file must be refused.');
        } catch (\InvalidArgumentException) {
            self::assertSame([], glob(Path::join($this->directory, '*.pdf')));
        }
    }

    public function testPathOfResolvesInsideTheDirectoryOnly(): void
    {
        $stored = $this->storage->copyFrom(self::SAMPLE);

        $path = $this->storage->pathOf($stored->name);

        self::assertNotNull($path);
        self::assertSame(Path::canonicalize($this->directory), Path::getDirectory(Path::canonicalize($path)));
    }

    public function testPathOfIsNullForAValidNameThatDoesNotExist(): void
    {
        self::assertNull($this->storage->pathOf('0194f1c0-0000-7000-8000-000000000000.pdf'));
    }

    /**
     * Names the storage must never turn into a path. The two canaries planted in setUp() are what the first group
     * would reach if the guard went missing (Path::join turns "\" into "/" on every OS, so the backslash variants
     * traverse as well).
     *
     * @return iterable<string, array{string}>
     */
    public static function namesOutsideThePattern(): iterable
    {
        $valid = '0194f1c0-0000-7000-8000-000000000000.pdf';

        yield 'a file one level up' => ['../'.self::CANARY];
        yield 'a file one level up, with a backslash' => ['..\\'.self::CANARY];
        yield 'a UUID-named file one level up' => ['../'.self::UUID_CANARY];
        yield 'a UUID-named file one level up, with a backslash' => ['..\\'.self::UUID_CANARY];
        yield 'parent directory' => ['../x.pdf'];
        yield 'a short name' => ['x.pdf'];
        yield 'a backslash' => ['a\\b.pdf'];
        yield 'a subdirectory' => ['a/'.substr($valid, 2)];
        yield 'another extension' => [substr($valid, 0, -4).'.txt'];
        yield 'no extension' => [substr($valid, 0, -4)];
        yield 'upper case digits' => [strtoupper($valid)];
        yield 'a trailing line feed' => [$valid."\n"];
        yield 'a NUL byte' => [substr($valid, 0, -4)."\0.pdf"];
        yield 'an empty name' => [''];
    }

    #[DataProvider('namesOutsideThePattern')]
    public function testPathOfIsNullForNamesOutsideThePattern(string $name): void
    {
        self::assertNull($this->storage->pathOf($name));
    }

    /**
     * @return iterable<string, array{string}>
     */
    public static function namesThatAreNotUuids(): iterable
    {
        yield 'thirty-six dashes' => [str_repeat('-', 36).'.pdf'];
        yield 'the groups in the wrong places' => ['0194f1c000-00-7000-8000-000000000000.pdf'];
        yield 'not hexadecimal' => ['0194f1c0-0000-7000-8000-00000000000g.pdf'];
    }

    #[DataProvider('namesThatAreNotUuids')]
    public function testFilesWhoseNameIsNotAUuidAreIgnoredEvenWhenTheyExist(string $name): void
    {
        $path = Path::join($this->directory, $name);
        (new Filesystem())->copy(self::SAMPLE, $path, true);

        self::assertNull($this->storage->pathOf($name));

        $this->storage->delete($name);

        self::assertFileExists($path);
    }

    public function testDeleteRemovesTheFile(): void
    {
        $stored = $this->storage->copyFrom(self::SAMPLE);
        $path = (string) $this->storage->pathOf($stored->name);

        $this->storage->delete($stored->name);

        self::assertFileDoesNotExist($path);
        self::assertNull($this->storage->pathOf($stored->name));
    }

    public function testDeleteIgnoresAValidNameThatDoesNotExist(): void
    {
        $other = $this->storage->copyFrom(self::SAMPLE);

        $this->storage->delete('0194f1c0-0000-7000-8000-000000000000.pdf');

        self::assertNotNull($this->storage->pathOf($other->name));
    }

    #[DataProvider('namesOutsideThePattern')]
    public function testDeleteIgnoresNamesOutsideThePattern(string $name): void
    {
        $stored = $this->storage->copyFrom(self::SAMPLE);

        $this->storage->delete($name);

        self::assertFileExists($this->outside(self::CANARY));
        self::assertFileExists($this->outside(self::UUID_CANARY));
        self::assertNotNull($this->storage->pathOf($stored->name));
    }

    public function testClearEmptiesTheDirectoryOfPdfs(): void
    {
        $first = $this->storage->copyFrom(self::SAMPLE);
        $second = $this->storage->copyFrom(self::SAMPLE);

        $this->storage->clear();

        self::assertNull($this->storage->pathOf($first->name));
        self::assertNull($this->storage->pathOf($second->name));
        self::assertSame([], glob(Path::join($this->directory, '*.pdf')));
    }

    public function testClearLeavesOtherFilesAlone(): void
    {
        $this->storage->copyFrom(self::SAMPLE);
        $keep = Path::join($this->directory, 'notes.txt');
        (new Filesystem())->dumpFile($keep, 'keep me');

        $this->storage->clear();

        self::assertFileExists($keep);
    }

    public function testClearLeavesTheFilesOutsideTheDirectoryAlone(): void
    {
        $this->storage->clear();

        self::assertFileExists($this->outside(self::CANARY));
        self::assertFileExists($this->outside(self::UUID_CANARY));
    }

    public function testClearWorksWhenTheDirectoryDoesNotExist(): void
    {
        (new Filesystem())->remove($this->directory);

        $this->storage->clear();

        self::assertDirectoryDoesNotExist($this->directory);
    }

    public function testTheSamplePdfLooksLikeAPdf(): void
    {
        $contents = (string) file_get_contents(self::SAMPLE);

        self::assertStringStartsWith('%PDF-', $contents);
        self::assertStringEndsWith('%%EOF', rtrim($contents));
        self::assertLessThan(2048, \strlen($contents));
    }

    /**
     * A path one level above the documents directory.
     */
    private function outside(string $name): string
    {
        return Path::join(Path::getDirectory(Path::canonicalize($this->directory)), $name);
    }
}
