<?php

declare(strict_types=1);

namespace App\Doctrine\Type;

use App\Domain\CnjNumber;
use Doctrine\DBAL\Platforms\AbstractPlatform;
use Doctrine\DBAL\Types\Exception\InvalidType;
use Doctrine\DBAL\Types\Exception\ValueNotConvertible;
use Doctrine\DBAL\Types\Type;

/**
 * Stores a CnjNumber as its 20 digits, without the mask.
 */
final class CnjNumberDoctrineType extends Type
{
    public const string NAME = 'cnj_number';

    private const int LENGTH = 20;

    public function getSQLDeclaration(array $column, AbstractPlatform $platform): string
    {
        return $platform->getStringTypeDeclarationSQL(['length' => self::LENGTH] + $column);
    }

    public function convertToDatabaseValue(mixed $value, AbstractPlatform $platform): ?string
    {
        if (null === $value) {
            return null;
        }

        if ($value instanceof CnjNumber) {
            return $value->digits();
        }

        throw InvalidType::new($value, self::NAME, ['null', CnjNumber::class]);
    }

    public function convertToPHPValue(mixed $value, AbstractPlatform $platform): ?CnjNumber
    {
        if (null === $value) {
            return null;
        }

        if (!\is_string($value)) {
            throw InvalidType::new($value, self::NAME, ['null', 'string']);
        }

        return CnjNumber::tryFromString($value) ?? throw ValueNotConvertible::new($value, self::NAME);
    }
}
