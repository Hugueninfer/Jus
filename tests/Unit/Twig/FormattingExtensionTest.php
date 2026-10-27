<?php

declare(strict_types=1);

namespace App\Tests\Unit\Twig;

use App\Domain\CnjNumber;
use App\Domain\LegalCase\CaseStatus;
use App\Presentation\EnumLabels;
use App\Twig\Extension\FormattingExtension;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

final class FormattingExtensionTest extends TestCase
{
    private FormattingExtension $extension;

    protected function setUp(): void
    {
        $this->extension = new FormattingExtension(new EnumLabels());
    }

    public function testFormatsCnjNumbers(): void
    {
        self::assertSame('0000001-39.2024.8.26.0100', $this->extension->cnj(CnjNumber::fromString('00000013920248260100')));
        self::assertSame('0000001-39.2024.8.26.0100', $this->extension->cnj('00000013920248260100'));
    }

    public function testFormatsCentsAsBrazilianReais(): void
    {
        self::assertSame("R\$\u{a0}15.000,00", $this->extension->brl(1_500_000));
        self::assertSame("R\$\u{a0}0,99", $this->extension->brl(99));
    }

    /**
     * @return iterable<string, array{int, string}>
     */
    public static function sizes(): iterable
    {
        yield 'zero' => [0, '0 B'];
        yield 'bytes' => [512, '512 B'];
        yield 'just below a kilobyte' => [1023, '1023 B'];
        yield 'kilobytes' => [184_320, '180 KB'];
        yield 'megabytes with a decimal' => [1_572_864, '1,5 MB'];
        yield 'whole megabytes' => [10_485_760, '10 MB'];
        yield 'rounds half up' => [1_280, '1,3 KB'];
        yield 'promotes when rounding reaches the next unit' => [1_048_575, '1 MB'];
        yield 'promotes to gigabytes after rounding' => [1_073_741_823, '1 GB'];
        yield 'gigabytes are the last unit' => [1_099_511_627_776, '1.024 GB'];
    }

    #[DataProvider('sizes')]
    public function testFormatsFileSizes(int $bytes, string $expected): void
    {
        self::assertSame($expected, $this->extension->bytes($bytes));
    }

    public function testLabelsEnums(): void
    {
        self::assertSame('Arquivado', $this->extension->label(CaseStatus::Archived));
    }
}
