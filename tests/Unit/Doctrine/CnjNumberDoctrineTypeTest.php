<?php

declare(strict_types=1);

namespace App\Tests\Unit\Doctrine;

use App\Doctrine\Type\CnjNumberDoctrineType;
use App\Domain\CnjNumber;
use Doctrine\DBAL\Platforms\SQLitePlatform;
use Doctrine\DBAL\Types\ConversionException;
use PHPUnit\Framework\TestCase;

final class CnjNumberDoctrineTypeTest extends TestCase
{
    private CnjNumberDoctrineType $type;
    private SQLitePlatform $platform;

    protected function setUp(): void
    {
        $this->type = new CnjNumberDoctrineType();
        $this->platform = new SQLitePlatform();
    }

    public function testStoresOnlyTheTwentyDigits(): void
    {
        $number = CnjNumber::fromString('0000001-39.2024.8.26.0100');

        self::assertSame('00000013920248260100', $this->type->convertToDatabaseValue($number, $this->platform));
    }

    public function testReadsTheDigitsBackAsACnjNumber(): void
    {
        $number = $this->type->convertToPHPValue('00000013920248260100', $this->platform);

        self::assertInstanceOf(CnjNumber::class, $number);
        self::assertSame('0000001-39.2024.8.26.0100', $number->formatted());
    }

    public function testKeepsNull(): void
    {
        self::assertNull($this->type->convertToDatabaseValue(null, $this->platform));
        self::assertNull($this->type->convertToPHPValue(null, $this->platform));
    }

    public function testRejectsACorruptedStoredValue(): void
    {
        $this->expectException(ConversionException::class);

        $this->type->convertToPHPValue('12345', $this->platform);
    }

    public function testRejectsANonStringStoredValue(): void
    {
        $this->expectException(ConversionException::class);

        $this->type->convertToPHPValue(12345, $this->platform);
    }

    public function testOnlyAcceptsCnjNumbersWhenWriting(): void
    {
        $this->expectException(ConversionException::class);

        $this->type->convertToDatabaseValue('0000001-39.2024.8.26.0100', $this->platform);
    }

    public function testDeclaresATwentyCharacterColumn(): void
    {
        self::assertSame('VARCHAR(20)', $this->type->getSQLDeclaration([], $this->platform));
    }
}
