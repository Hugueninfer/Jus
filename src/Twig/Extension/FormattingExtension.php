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

    /**
     * The initials of a person's name for an avatar: the first letter of the first and of the last word, in capitals
     * ("Maria da Silva" reads "MS"; a single name gives one letter).
     */
    #[AsTwigFilter('initials')]
    public function initials(string $name): string
    {
        $words = preg_split('/\s+/u', trim($name), -1, \PREG_SPLIT_NO_EMPTY);
        if (false === $words || [] === $words) {
            return '';
        }

        $initials = mb_substr($words[0], 0, 1);
        $last = array_key_last($words);
        if ($last > 0) {
            $initials .= mb_substr($words[$last], 0, 1);
        }

        return mb_strtoupper($initials);
    }
}
