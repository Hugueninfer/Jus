<?php

declare(strict_types=1);

namespace App\Tests\Unit\Twig;

use App\Presentation\ThemePreference;
use App\Presentation\ThemeResolver;
use App\Twig\Extension\ThemeExtension;
use PHPUnit\Framework\TestCase;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\RequestStack;

final class ThemeExtensionTest extends TestCase
{
    public function testOffersTheCurrentPreference(): void
    {
        $requests = new RequestStack();
        $requests->push(Request::create('/', cookies: [ThemeResolver::COOKIE => 'escuro']));

        self::assertSame(ThemePreference::Dark, new ThemeExtension(new ThemeResolver($requests))->current());
    }

    public function testOffersEveryChoice(): void
    {
        $extension = new ThemeExtension(new ThemeResolver(new RequestStack()));

        self::assertSame([ThemePreference::System, ThemePreference::Light, ThemePreference::Dark], $extension->choices());
    }
}
