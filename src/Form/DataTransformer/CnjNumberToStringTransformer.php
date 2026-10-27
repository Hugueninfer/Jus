<?php

declare(strict_types=1);

namespace App\Form\DataTransformer;

use App\Domain\CnjNumber;
use Symfony\Component\Form\DataTransformerInterface;
use Symfony\Component\Form\Exception\TransformationFailedException;

/**
 * The model value is typed as mixed because transform() validates what the form hands it.
 *
 * @implements DataTransformerInterface<mixed, string>
 */
final class CnjNumberToStringTransformer implements DataTransformerInterface
{
    public function transform(mixed $value): string
    {
        if (null === $value) {
            return '';
        }

        if (!$value instanceof CnjNumber) {
            throw new TransformationFailedException('Expected a CnjNumber.');
        }

        return $value->formatted();
    }

    public function reverseTransform(mixed $value): ?CnjNumber
    {
        if (null === $value || '' === $value) {
            return null;
        }

        return CnjNumber::tryFromString($value) ?? throw new TransformationFailedException('Invalid CNJ number.');
    }
}
