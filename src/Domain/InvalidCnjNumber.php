<?php

declare(strict_types=1);

namespace App\Domain;

final class InvalidCnjNumber extends \InvalidArgumentException
{
    public static function malformed(string $value): self
    {
        return new self(\sprintf('"%s" is not in the CNJ format NNNNNNN-DD.AAAA.J.TR.OOOO.', $value));
    }

    public static function wrongCheckDigits(string $value): self
    {
        return new self(\sprintf('"%s" has invalid check digits.', $value));
    }
}
