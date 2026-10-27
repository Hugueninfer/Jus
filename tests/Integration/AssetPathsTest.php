<?php

declare(strict_types=1);

namespace App\Tests\Integration;

use Symfony\Bundle\FrameworkBundle\Test\KernelTestCase;
use Symfony\Component\Asset\Packages;

final class AssetPathsTest extends KernelTestCase
{
    public function testTheTestsDoNotDependOnAFrontEndBuild(): void
    {
        self::bootKernel();

        // No manifest lookup: the URL is the same whether public/build is fresh, stale or was never built.
        self::assertSame('/build/app.js', self::getContainer()->get(Packages::class)->getUrl('build/app.js'));
    }
}
