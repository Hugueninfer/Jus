<?php

declare(strict_types=1);

namespace App\Presentation;

/**
 * The colour theme a person asks for. "System" is the default: the page follows the colour scheme of the device.
 */
enum ThemePreference: string
{
    case System = 'sistema';
    case Light = 'claro';
    case Dark = 'escuro';

    /**
     * The data-bs-theme the server renders: "system" renders light and the inline script of the layout switches it.
     */
    public function bootstrapTheme(): string
    {
        return self::Dark === $this ? 'dark' : 'light';
    }

    public function label(): string
    {
        return match ($this) {
            self::System => 'Sistema',
            self::Light => 'Claro',
            self::Dark => 'Escuro',
        };
    }
}
