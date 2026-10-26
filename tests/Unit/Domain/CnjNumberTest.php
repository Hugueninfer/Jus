<?php

declare(strict_types=1);

namespace App\Tests\Unit\Domain;

use App\Domain\CnjNumber;
use App\Domain\InvalidCnjNumber;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

final class CnjNumberTest extends TestCase
{
    /**
     * @return iterable<string, array{string, string, string}>
     */
    public static function validNumbers(): iterable
    {
        foreach (self::fixture()['valid'] as $case) {
            yield $case['name'] => [$case['input'], $case['digits'], $case['formatted']];
        }
    }

    /**
     * @return iterable<string, array{string, string}>
     */
    public static function invalidNumbers(): iterable
    {
        foreach (self::fixture()['invalid'] as $case) {
            yield $case['name'] => [$case['input'], $case['reason']];
        }
    }

    #[DataProvider('validNumbers')]
    public function testAcceptsValidNumbers(string $input, string $digits, string $formatted): void
    {
        $number = CnjNumber::fromString($input);

        self::assertSame($digits, $number->digits());
        self::assertSame($formatted, $number->formatted());

        $parsed = CnjNumber::tryFromString($input);
        self::assertNotNull($parsed);
        self::assertTrue($number->equals($parsed));
    }

    #[DataProvider('invalidNumbers')]
    public function testRejectsInvalidNumbers(string $input, string $reason): void
    {
        self::assertNull(CnjNumber::tryFromString($input));

        $this->expectException(InvalidCnjNumber::class);
        $this->expectExceptionMessage('check_digits' === $reason ? 'has invalid check digits' : 'is not in the CNJ format');

        CnjNumber::fromString($input);
    }

    public function testRejectsInvalidUtf8(): void
    {
        $input = "\xFF0000001-39.2024.8.26.0100";

        self::assertNull(CnjNumber::tryFromString($input));

        $this->expectException(InvalidCnjNumber::class);
        $this->expectExceptionMessage('is not in the CNJ format');

        CnjNumber::fromString($input);
    }

    public function testComposeCalculatesCheckDigits(): void
    {
        self::assertSame('0000001-39.2024.8.26.0100', CnjNumber::compose('0000001', '2024', '8', '26', '0100')->formatted());
        self::assertSame('0000003-09.2024.8.26.0100', CnjNumber::compose('0000003', '2024', '8', '26', '0100')->formatted());
        self::assertSame('1234567-44.2023.4.04.7100', CnjNumber::compose('1234567', '2023', '4', '04', '7100')->formatted());
        self::assertSame('0000010-98.2024.8.26.0100', CnjNumber::compose('0000010', '2024', '8', '26', '0100')->formatted());
        self::assertSame('0000094-02.2024.8.26.0100', CnjNumber::compose('0000094', '2024', '8', '26', '0100')->formatted());
    }

    /**
     * @return iterable<string, array{string, string, string, string, string}>
     */
    public static function malformedParts(): iterable
    {
        yield 'sequential too short' => ['123', '2024', '8', '26', '0100'];
        yield 'leading space in sequential' => [' 000001', '2024', '8', '26', '0100'];
        yield 'trailing space in origin' => ['0000001', '2024', '8', '26', '0100 '];
        yield 'letter in court' => ['0000001', '2024', '8', '2A', '0100'];
        yield 'trailing newline in origin' => ['0000001', '2024', '8', '26', "0100\n"];
    }

    #[DataProvider('malformedParts')]
    public function testComposeRejectsMalformedParts(string $sequential, string $year, string $segment, string $court, string $origin): void
    {
        $this->expectException(InvalidCnjNumber::class);
        $this->expectExceptionMessage('is not in the CNJ format');

        CnjNumber::compose($sequential, $year, $segment, $court, $origin);
    }

    public function testEqualsComparesDigits(): void
    {
        $number = CnjNumber::fromString('0000001-39.2024.8.26.0100');

        self::assertTrue($number->equals(CnjNumber::fromString('00000013920248260100')));
        self::assertFalse($number->equals(CnjNumber::fromString('0000003-09.2024.8.26.0100')));
    }

    /**
     * @return array{
     *     valid: list<array{name: string, input: string, digits: string, formatted: string}>,
     *     invalid: list<array{name: string, input: string, reason: string}>
     * }
     */
    private static function fixture(): array
    {
        $json = file_get_contents(__DIR__.'/../../fixtures/cnj-numbers.json');
        if (false === $json) {
            throw new \RuntimeException('Missing tests/fixtures/cnj-numbers.json');
        }

        /** @var array{valid: list<array{name: string, input: string, digits: string, formatted: string}>, invalid: list<array{name: string, input: string, reason: string}>} $data */
        $data = json_decode($json, true, 512, \JSON_THROW_ON_ERROR);

        return $data;
    }
}
