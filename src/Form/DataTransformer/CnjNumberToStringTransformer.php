<?php

declare(strict_types=1);

namespace App\Form\DataTransformer;

use App\Domain\CnjNumber;
use Symfony\Component\Form\DataTransformerInterface;
use Symfony\Component\Form\Exception\TransformationFailedException;

/**
 * @implements DataTransformerInterface<CnjNumber, string>
 */
final class CnjNumberToStringTransformer implements DataTransformerInterface
{
    public function transform(mixed $value): string
    {
        return $value instanceof CnjNumber ? $value->formatted() : '';
    }

    public function reverseTransform(mixed $value): ?CnjNumber
    {
        if (null === $value || '' === $value) {
            return null;
        }

        return CnjNumber::tryFromString($value) ?? throw new TransformationFailedException('Invalid CNJ number.');
    }
}
