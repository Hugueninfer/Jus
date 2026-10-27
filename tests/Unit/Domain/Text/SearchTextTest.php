<?php

declare(strict_types=1);

namespace App\Tests\Unit\Domain\Text;

use App\Domain\Text\SearchText;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

final class SearchTextTest extends TestCase
{
    /**
     * @return iterable<string, array{string, string}>
     */
    public static function texts(): iterable
    {
        yield 'accents and case' => ['João ÁLVARO', 'joao alvaro'];
        yield 'cedilla and tilde' => ['Conceição Brandão', 'conceicao brandao'];
        yield 'extra spaces' => ["  Maria \t da   Silva ", 'maria da silva'];
        yield 'already plain' => ['empresa x ltda.', 'empresa x ltda.'];
        yield 'empty' => ['', ''];
        yield 'invalid UTF-8' => ["Jo\xC3\x28o", ''];
    }

    #[DataProvider('texts')]
    public function testNormalizesForSearching(string $text, string $expected): void
    {
        self::assertSame($expected, SearchText::normalize($text));
    }
}
