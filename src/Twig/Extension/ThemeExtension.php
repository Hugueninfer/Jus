<?php

declare(strict_types=1);

namespace App\Twig\Extension;

use App\Presentation\ThemePreference;
use App\Presentation\ThemeResolver;
use Twig\Attribute\AsTwigFunction;

/**
 * The theme of the request, for the layout and the switcher.
 */
final readonly class ThemeExtension
{
    public function __construct(private ThemeResolver $resolver)
    {
    }

    #[AsTwigFunction('jus_theme')]
    public function current(): ThemePreference
    {
        return $this->resolver->current();
    }

    /**
     * @return list<ThemePreference>
     */
    #[AsTwigFunction('jus_themes')]
    public function choices(): array
    {
        return ThemePreference::cases();
    }
}
