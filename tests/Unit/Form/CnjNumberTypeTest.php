<?php

declare(strict_types=1);

namespace App\Tests\Unit\Form;

use App\Domain\CnjNumber;
use App\Form\CnjNumberType;
use PHPUnit\Framework\Attributes\AllowMockObjectsWithoutExpectations;
use PHPUnit\Framework\Attributes\DataProvider;
use Symfony\Component\Form\Test\TypeTestCase;

// TypeTestCase mocks the event dispatcher without expectations, which PHPUnit 13 reports as a notice.
#[AllowMockObjectsWithoutExpectations]
final class CnjNumberTypeTest extends TypeTestCase
{
    /**
     * @return iterable<string, array{string}>
     */
    public static function validInputs(): iterable
    {
        yield 'masked' => ['0000001-39.2024.8.26.0100'];
        yield 'digits only' => ['00000013920248260100'];
        yield 'surrounding spaces' => ['  0000001-39.2024.8.26.0100 '];
    }

    #[DataProvider('validInputs')]
    public function testTurnsValidInputIntoACnjNumber(string $input): void
    {
        $form = $this->factory->create(CnjNumberType::class);

        $form->submit($input);

        self::assertTrue($form->isSynchronized());
        $data = $form->getData();
        self::assertInstanceOf(CnjNumber::class, $data);
        self::assertSame('0000001-39.2024.8.26.0100', $data->formatted());
    }

    public function testAnEmptyFieldMeansNoNumber(): void
    {
        $form = $this->factory->create(CnjNumberType::class);

        $form->submit('');

        self::assertTrue($form->isSynchronized());
        self::assertNull($form->getData());
    }

    public function testClearingAPrefilledFieldMeansNoNumber(): void
    {
        $form = $this->factory->create(CnjNumberType::class, CnjNumber::fromString('00000013920248260100'));

        $form->submit('');

        self::assertTrue($form->isSynchronized());
        self::assertNull($form->getData());
    }

    public function testRejectsAnInvalidNumber(): void
    {
        $form = $this->factory->create(CnjNumberType::class);

        $form->submit('0000001-40.2024.8.26.0100');

        self::assertFalse($form->isSynchronized());
        self::assertNull($form->getData());
    }

    public function testShowsTheMaskedNumber(): void
    {
        $form = $this->factory->create(CnjNumberType::class, CnjNumber::fromString('00000013920248260100'));

        self::assertSame('0000001-39.2024.8.26.0100', $form->createView()->vars['value']);
    }
}
