<?php

declare(strict_types=1);

namespace App\Tests\Unit\Domain\Deadline;

use App\Domain\Deadline\Easter;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

final class EasterTest extends TestCase
{
    /**
     * @return iterable<string, array{int, string}>
     */
    public static function easterSundays(): iterable
    {
        yield 'Easter 2000' => [2000, '2000-04-23'];
        yield 'Easter 2024' => [2024, '2024-03-31'];
        yield 'Easter 2025' => [2025, '2025-04-20'];
        yield 'Easter 2026' => [2026, '2026-04-05'];
        yield 'Easter 2027' => [2027, '2027-03-28'];
        yield 'Easter 2038, latest possible date' => [2038, '2038-04-25'];
        yield 'Easter 2049, exercises the m correction term' => [2049, '2049-04-18'];
    }

    #[DataProvider('easterSundays')]
    public function testSunday(int $year, string $expected): void
    {
        self::assertSame($expected, Easter::sunday($year)->format('Y-m-d'));
    }
}
