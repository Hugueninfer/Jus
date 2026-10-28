<?php

declare(strict_types=1);

namespace App\Domain;

/**
 * Unique court case number defined by CNJ Resolution 65/2008: NNNNNNN-DD.AAAA.J.TR.OOOO.
 *
 * DD are the check digits of ISO 7064 MOD 97-10: DD = 98 - (NNNNNNN AAAA J TR OOOO 00 mod 97).
 * Only that canonical value is accepted. The values 00, 01 and 99 also give "remainder 1 mod 97"
 * when DD is moved to the end, but the formula never produces them (it yields 02 to 98).
 */
final readonly class CnjNumber
{
    // The D modifier keeps "$" from also matching before a final line break, as JavaScript's "$" never does.
    private const string MASKED = '/^\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}$/D';
    private const string UNMASKED = '/^\d{20}$/D';

    /**
     * Same characters JavaScript's String.prototype.trim() removes, so a TypeScript port agrees on every input.
     * The vertical tab is spelled \x{000B} because PCRE's \v would also match U+0085, which JavaScript keeps.
     */
    private const string JS_TRIM = '/^[\t\n\x{000B}\f\r \x{00A0}\x{1680}\x{2000}-\x{200A}\x{2028}\x{2029}\x{202F}\x{205F}\x{3000}\x{FEFF}]+|[\t\n\x{000B}\f\r \x{00A0}\x{1680}\x{2000}-\x{200A}\x{2028}\x{2029}\x{202F}\x{205F}\x{3000}\x{FEFF}]+$/u';

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
        // null when $value is not valid UTF-8.
        $trimmed = preg_replace(self::JS_TRIM, '', $value);
        if (null === $trimmed || (1 !== preg_match(self::MASKED, $trimmed) && 1 !== preg_match(self::UNMASKED, $trimmed))) {
            throw InvalidCnjNumber::malformed($value);
        }

        $digits = str_replace(['-', '.'], '', $trimmed);

        // The given DD must equal the one computed from the other 18 digits: "remainder 1" alone would accept 00, 01 and 99.
        if (self::checkDigitsFor(substr($digits, 0, 7).substr($digits, 9)) !== substr($digits, 7, 2)) {
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
        if (
            1 !== preg_match('/^\d{7}$/D', $sequential)
            || 1 !== preg_match('/^\d{4}$/D', $year)
            || 1 !== preg_match('/^\d$/D', $segment)
            || 1 !== preg_match('/^\d{2}$/D', $court)
            || 1 !== preg_match('/^\d{4}$/D', $origin)
        ) {
            throw InvalidCnjNumber::malformed(implode('.', [$sequential, $year, $segment, $court, $origin]));
        }

        $rest = $year.$segment.$court.$origin;

        return new self($sequential.self::checkDigitsFor($sequential.$rest).$rest);
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
     * Canonical check digits (02 to 98) for the 18 digits NNNNNNN AAAA J TR OOOO, without DD.
     */
    private static function checkDigitsFor(string $eighteenDigits): string
    {
        return \sprintf('%02d', 98 - self::mod97($eighteenDigits.'00'));
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
