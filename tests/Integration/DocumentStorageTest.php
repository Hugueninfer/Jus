<?php

declare(strict_types=1);

namespace App\Tests\Integration;

use App\Filing\DocumentStorage;
use PHPUnit\Framework\Attributes\DataProvider;
use Symfony\Bundle\FrameworkBundle\Test\KernelTestCase;
use Symfony\Component\Filesystem\Filesystem;
use Symfony\Component\Filesystem\Path;

final class DocumentStorageTest extends KernelTestCase
{
    private const string UUID_PDF = '/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.pdf$/';
    private const string SAMPLE = __DIR__.'/../fixtures/sample.pdf';

    private DocumentStorage $storage;
    private string $directory;

    protected function setUp(): void
    {
        parent::setUp();

        $this->storage = self::getContainer()->get(DocumentStorage::class);
        $this->directory = self::getContainer()->getParameter('app.documents_dir');

        $this->storage->clear();
    }

    protected function tearDown(): void
    {
        (new Filesystem())->remove([$this->canary(), $this->directory]);
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

    public function testTwoStoresDoNotCollide(): void
    {
        $first = $this->storage->store(new \SplFileInfo(self::SAMPLE));
        $second = $this->storage->store(new \SplFileInfo(self::SAMPLE));

        self::assertNotSame($first->name, $second->name);
        self::assertNotNull($this->storage->pathOf($first->name));
        self::assertNotNull($this->storage->pathOf($second->name));
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
     * @return iterable<string, array{string}>
     */
    public static function namesOutsideThePattern(): iterable
    {
        $valid = '0194f1c0-0000-7000-8000-000000000000.pdf';

        yield 'parent directory' => ['../x.pdf'];
        yield 'parent directory with a valid name' => ['../'.$valid];
        yield 'a file that exists one level up' => ['../canary.pdf'];
        yield 'a short name' => ['x.pdf'];
        yield 'a backslash' => ['a\\b.pdf'];
        yield 'a backslash traversal' => ['..\\x.pdf'];
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
        // The canary sits one level above the documents directory: that is what '../canary.pdf' would reach.
        (new Filesystem())->copy(self::SAMPLE, $this->canary(), true);
        $stored = $this->storage->copyFrom(self::SAMPLE);

        $this->storage->delete($name);

        self::assertFileExists($this->canary());
        self::assertNotNull($this->storage->pathOf($stored->name));
    }

    public function testClearEmptiesTheDirectoryOfPdfs(): void
    {
        $first = $this->storage->copyFrom(self::SAMPLE);
        $second = $this->storage->copyFrom(self::SAMPLE);

        $this->storage->clear();

        self::assertNull($this->storage->pathOf($first->name));
        self::assertNull($this->storage->pathOf($second->name));
        self::assertSame([], glob($this->directory.'/*.pdf'));
    }

    public function testClearLeavesOtherFilesAlone(): void
    {
        $this->storage->copyFrom(self::SAMPLE);
        $keep = $this->directory.'/notes.txt';
        (new Filesystem())->dumpFile($keep, 'keep me');

        $this->storage->clear();

        self::assertFileExists($keep);
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

    private function canary(): string
    {
        return Path::join(Path::getDirectory(Path::canonicalize($this->directory)), 'canary.pdf');
    }
}
