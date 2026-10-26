<?php

declare(strict_types=1);

namespace App\Domain;

/**
 * Unique court case number defined by CNJ Resolution 65/2008: NNNNNNN-DD.AAAA.J.TR.OOOO.
 *
 * DD are check digits computed with ISO 7064 MOD 97-10 over the other 18 digits.
 */
final readonly class CnjNumber
{
    private const string MASKED = '/^\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}$/';
    private const string UNMASKED = '/^\d{20}$/';

    private function __construct(private string $digits)
    {
    }

    /**
     * Accepts the number with or without the mask.
     *
     * @throws InvalidCnjNumber
     */
    public static function fromString(string $value): self
    {
        $trimmed = trim($value);
        if (1 !== preg_match(self::MASKED, $trimmed) && 1 !== preg_match(self::UNMASKED, $trimmed)) {
            throw InvalidCnjNumber::malformed($value);
        }

        $digits = str_replace(['-', '.'], '', $trimmed);

        // With the check digits moved to the end (NNNNNNN AAAA J TR OOOO DD) the remainder must be 1.
        if (1 !== self::mod97(substr($digits, 0, 7).substr($digits, 9).substr($digits, 7, 2))) {
            throw InvalidCnjNumber::wrongCheckDigits($value);
        }

        return new self($digits);
    }

    public static function tryFromString(string $value): ?self
    {
        try {
            return self::fromString($value);
        } catch (InvalidCnjNumber) {
            return null;
        }
    }

    /**
     * Builds a valid number from its parts, computing the check digits.
     *
     * @throws InvalidCnjNumber when a part has the wrong length or is not numeric
     */
    public static function compose(string $sequential, string $year, string $segment, string $court, string $origin): self
    {
        $checkDigits = 98 - self::mod97($sequential.$year.$segment.$court.$origin.'00');

        return self::fromString(\sprintf('%s-%02d.%s.%s.%s.%s', $sequential, $checkDigits, $year, $segment, $court, $origin));
    }

    public function digits(): string
    {
        return $this->digits;
    }

    public function formatted(): string
    {
        return \sprintf(
            '%s-%s.%s.%s.%s.%s',
            substr($this->digits, 0, 7),
            substr($this->digits, 7, 2),
            substr($this->digits, 9, 4),
            substr($this->digits, 13, 1),
            substr($this->digits, 14, 2),
            substr($this->digits, 16, 4),
        );
    }

    public function equals(self $other): bool
    {
        return $this->digits === $other->digits;
    }

    /**
     * Remainder of a digit string divided by 97, computed digit by digit:
     * 20 digits overflow PHP's 64-bit integers.
     */
    private static function mod97(string $digits): int
    {
        $remainder = 0;
        foreach (str_split($digits) as $digit) {
            $remainder = ($remainder * 10 + (int) $digit) % 97;
        }

        return $remainder;
    }
}
