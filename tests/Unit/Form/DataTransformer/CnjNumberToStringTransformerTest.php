<?php

declare(strict_types=1);

namespace App\Tests\Unit\Form\DataTransformer;

use App\Domain\CnjNumber;
use App\Form\DataTransformer\CnjNumberToStringTransformer;
use PHPUnit\Framework\TestCase;
use Symfony\Component\Form\Exception\TransformationFailedException;

final class CnjNumberToStringTransformerTest extends TestCase
{
    private CnjNumberToStringTransformer $transformer;

    protected function setUp(): void
    {
        $this->transformer = new CnjNumberToStringTransformer();
    }

    public function testTransformsNullIntoAnEmptyString(): void
    {
        self::assertSame('', $this->transformer->transform(null));
    }

    public function testTransformsANumberIntoItsMaskedForm(): void
    {
        self::assertSame(
            '0000001-39.2024.8.26.0100',
            $this->transformer->transform(CnjNumber::fromString('00000013920248260100')),
        );
    }

    public function testRejectsAnythingElseWhenTransforming(): void
    {
        $this->expectException(TransformationFailedException::class);

        $this->transformer->transform('not a number');
    }
}
