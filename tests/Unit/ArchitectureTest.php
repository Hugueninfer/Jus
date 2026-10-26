<?php

declare(strict_types=1);

namespace App\Tests\Unit;

use PHPUnit\Framework\TestCase;

final class ArchitectureTest extends TestCase
{
    public function testDomainDoesNotDependOnSymfonyOrDoctrine(): void
    {
        $domain = \dirname(__DIR__, 2).'/src/Domain';
        $files = new \RecursiveIteratorIterator(new \RecursiveDirectoryIterator($domain, \FilesystemIterator::SKIP_DOTS));

        $checked = 0;
        $violations = [];
        foreach ($files as $file) {
            if (!$file instanceof \SplFileInfo || 'php' !== $file->getExtension()) {
                continue;
            }

            ++$checked;
            if (1 === preg_match('/\b(?:Symfony|Doctrine)\\\\/', (string) file_get_contents($file->getPathname()))) {
                $violations[] = substr($file->getPathname(), \strlen($domain) + 1);
            }
        }

        self::assertGreaterThan(0, $checked, 'No PHP files found under src/Domain.');
        self::assertSame([], $violations, 'src/Domain must stay framework-free.');
    }
}
