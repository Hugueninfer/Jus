<?php

declare(strict_types=1);

namespace App\Tests\Unit\Presentation;

use App\Presentation\ThemePreference;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

final class ThemePreferenceTest extends TestCase
{
    /**
     * @return iterable<string, array{ThemePreference, string, string, string}>
     */
    public static function provideThemes(): iterable
    {
        yield 'system' => [ThemePreference::System, 'sistema', 'light', 'Sistema'];
        yield 'light' => [ThemePreference::Light, 'claro', 'light', 'Claro'];
        yield 'dark' => [ThemePreference::Dark, 'escuro', 'dark', 'Escuro'];
    }

    #[DataProvider('provideThemes')]
    public function testDescribesItself(ThemePreference $theme, string $value, string $bootstrapTheme, string $label): void
    {
        self::assertSame($value, $theme->value);
        // "System" renders light: a small script in the page switches it to dark when the system asks for it.
        self::assertSame($bootstrapTheme, $theme->bootstrapTheme());
        self::assertSame($label, $theme->label());
    }
}
