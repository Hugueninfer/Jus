<?php

declare(strict_types=1);

namespace App\Filing;

use Symfony\Component\DependencyInjection\Attribute\Autowire;
use Symfony\Component\Filesystem\Exception\IOException;
use Symfony\Component\Filesystem\Filesystem;
use Symfony\Component\Filesystem\Path;
use Symfony\Component\Uid\Uuid;

/**
 * The only class that touches the disk for case documents.
 *
 * Files live outside public/ under a generated "<uuid v7>.pdf" name; no path is ever built from user input, so a name
 * that does not match that exact shape is treated as if the file did not exist.
 */
final readonly class DocumentStorage
{
    // The shape of a UUID, 8-4-4-4-12 lower case hex digits. \z, not $: "$" would also accept a trailing line feed.
    private const string NAME_PATTERN = '/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.pdf\z/';

    public function __construct(
        #[Autowire('%app.documents_dir%')]
        private string $directory,
        private Filesystem $filesystem,
    ) {
    }

    public function store(\SplFileInfo $file): StoredDocument
    {
        return $this->copyFrom($file->getPathname());
    }

    /**
     * @throws \InvalidArgumentException when the source is not a local file (Filesystem::copy() would happily download a URL)
     * @throws IOException               when the copy fails; no partial file is left behind
     */
    public function copyFrom(string $sourcePath): StoredDocument
    {
        if (!stream_is_local($sourcePath)) {
            throw new \InvalidArgumentException('Documents can only be copied from a local file.');
        }

        $name = Uuid::v7()->toRfc4122().'.pdf';
        $target = Path::join($this->directory, $name);

        $this->filesystem->mkdir($this->directory, 0o750);

        try {
            $this->filesystem->copy($sourcePath, $target, true);

            return new StoredDocument($name, (new \SplFileInfo($target))->getSize());
        } catch (\Throwable $failure) {
            try {
                $this->filesystem->remove($target);
            } catch (IOException) {
                // The copy's error is the one worth reporting; a leftover that cannot be removed adds nothing to it.
            }

            throw $failure;
        }
    }

    /**
     * The absolute path of a stored document, or null when the name is not one this class generated or the file is gone.
     */
    public function pathOf(string $name): ?string
    {
        if (1 !== preg_match(self::NAME_PATTERN, $name)) {
            return null;
        }

        $path = Path::join($this->directory, $name);

        return is_file($path) ? $path : null;
    }

    public function delete(string $name): void
    {
        if (1 !== preg_match(self::NAME_PATTERN, $name)) {
            return;
        }

        $this->filesystem->remove(Path::join($this->directory, $name));
    }

    /**
     * Removes every PDF in the directory (the fixtures call it before reloading the demo data).
     */
    public function clear(): void
    {
        if (!is_dir($this->directory)) {
            return;
        }

        $pdfs = [];
        foreach (new \DirectoryIterator($this->directory) as $entry) {
            if ($entry->isFile() && 'pdf' === $entry->getExtension()) {
                $pdfs[] = $entry->getPathname();
            }
        }

        $this->filesystem->remove($pdfs);
    }
}
