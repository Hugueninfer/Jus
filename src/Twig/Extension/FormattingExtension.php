<?php

declare(strict_types=1);

namespace App\Twig\Extension;

use App\Domain\CnjNumber;
use App\Presentation\EnumLabels;
use Twig\Attribute\AsTwigFilter;

/**
 * Brazilian formats used across the templates.
 */
final readonly class FormattingExtension
{
    private const array SIZE_UNITS = ['KB', 'MB', 'GB'];

    public function __construct(private EnumLabels $labels)
    {
    }

    #[AsTwigFilter('cnj')]
    public function cnj(CnjNumber|string $number): string
    {
        return ($number instanceof CnjNumber ? $number : CnjNumber::fromString($number))->formatted();
    }

    #[AsTwigFilter('brl')]
    public function brl(int $cents): string
    {
        $formatted = (new \NumberFormatter('pt_BR', \NumberFormatter::CURRENCY))->formatCurrency($cents / 100, 'BRL');
        if (false === $formatted) {
            throw new \RuntimeException(\sprintf('Could not format %d cents as BRL.', $cents));
        }

        return $formatted;
    }

    #[AsTwigFilter('bytes')]
    public function bytes(int $bytes): string
    {
        if ($bytes < 1024) {
            return \sprintf('%d B', $bytes);
        }

        $value = $bytes / 1024;
        $unit = 0;
        // Promote on the rounded value, so 1048575 B reads "1 MB" and not "1.024 KB".
        while (round($value, 1) >= 1024 && $unit < \count(self::SIZE_UNITS) - 1) {
            $value /= 1024;
            ++$unit;
        }

        $formatter = new \NumberFormatter('pt_BR', \NumberFormatter::DECIMAL);
        $formatter->setAttribute(\NumberFormatter::MAX_FRACTION_DIGITS, 1);
        $formatter->setAttribute(\NumberFormatter::ROUNDING_MODE, \NumberFormatter::ROUND_HALFUP);

        $formatted = $formatter->format($value);
        if (false === $formatted) {
            throw new \RuntimeException(\sprintf('Could not format %f bytes.', $value));
        }

        return $formatted.' '.self::SIZE_UNITS[$unit];
    }

    #[AsTwigFilter('label')]
    public function label(\BackedEnum $value): string
    {
        return $this->labels->label($value);
    }
}
