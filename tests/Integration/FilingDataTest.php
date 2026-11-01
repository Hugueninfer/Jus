<?php

declare(strict_types=1);

namespace App\Tests\Integration;

use App\Domain\LegalCase\FilingType;
use App\Form\FilingData;
use PHPUnit\Framework\Attributes\DataProvider;
use Symfony\Bundle\FrameworkBundle\Test\KernelTestCase;
use Symfony\Component\Filesystem\Filesystem;
use Symfony\Component\HttpFoundation\File\UploadedFile;
use Symfony\Component\Validator\ConstraintViolationInterface;
use Symfony\Component\Validator\Validator\ValidatorInterface;

/**
 * What a filing may carry, as the form validates it: the messages and the limits of FilingLimits.
 */
final class FilingDataTest extends KernelTestCase
{
    private const int TEN_MEGABYTES = 10 * 1024 * 1024;

    /** @var list<string> */
    private array $temporaryFiles = [];

    protected function setUp(): void
    {
        self::bootKernel();
    }

    protected function tearDown(): void
    {
        (new Filesystem())->remove($this->temporaryFiles);
        parent::tearDown();
    }

    public function testAFilingWithAllItsPartsIsValid(): void
    {
        self::assertSame([], $this->violations($this->filing()));
    }

    public function testTheTypeIsRequired(): void
    {
        $data = $this->filing();
        $data->type = null;

        self::assertSame(['type' => 'Selecione o tipo da petição.'], $this->violations($data));
    }

    #[DataProvider('provideBlankDescriptions')]
    public function testTheDescriptionIsRequired(?string $description): void
    {
        $data = $this->filing();
        $data->description = $description;

        self::assertSame(['description' => 'Informe a descrição da petição.'], $this->violations($data));
    }

    /**
     * @return iterable<string, array{?string}>
     */
    public static function provideBlankDescriptions(): iterable
    {
        yield 'missing' => [null];
        yield 'empty' => [''];
        yield 'only spaces' => ['   '];
    }

    public function testTheDescriptionHasALimitInCharacters(): void
    {
        $data = $this->filing();

        $data->description = str_repeat('ã', 2000);
        self::assertSame([], $this->violations($data), 'the limit counts characters, not bytes');

        $data->description = str_repeat('ã', 2001);
        self::assertSame(['description' => 'A descrição passa do limite de 2000 caracteres.'], $this->violations($data));
    }

    public function testAtLeastOneFileIsRequired(): void
    {
        $data = $this->filing();
        $data->files = [];

        self::assertSame(['files' => 'Anexe pelo menos um arquivo PDF.'], $this->violations($data));
    }

    public function testNoMoreThanFiveFilesAreAccepted(): void
    {
        $data = $this->filing();

        $data->files = array_map(fn (int $number): UploadedFile => $this->pdf(\sprintf('peca-%d.pdf', $number)), range(1, 5));
        self::assertSame([], $this->violations($data));

        $data->files = array_map(fn (int $number): UploadedFile => $this->pdf(\sprintf('peca-%d.pdf', $number)), range(1, 6));
        self::assertSame(['files' => 'Anexe no máximo 5 arquivos.'], $this->violations($data));
    }

    public function testOnlyPdfFilesAreAccepted(): void
    {
        $data = $this->filing();
        $data->files = [$this->pdf(), $this->upload('notas.txt', "Anotações.\n", 'text/plain')];

        self::assertSame(['files[1]' => 'Envie apenas arquivos PDF.'], $this->violations($data));
    }

    public function testTheKindOfFileIsTakenFromItsContentNotItsName(): void
    {
        $data = $this->filing();
        $data->files = [$this->upload('peticao.pdf', "Anotações.\n", 'application/pdf')];

        self::assertSame(['files[0]' => 'Envie apenas arquivos PDF.'], $this->violations($data));
    }

    public function testAFileHasALimitOfTenMegabytes(): void
    {
        $data = $this->filing();

        $data->files = [$this->upload('limite.pdf', $this->pdfOfSize(self::TEN_MEGABYTES), 'application/pdf')];
        self::assertSame([], $this->violations($data), 'exactly 10 MB is allowed');

        $data->files = [$this->pdf(), $this->upload('grande.pdf', $this->pdfOfSize(self::TEN_MEGABYTES + 1), 'application/pdf')];
        self::assertSame(['files[1]' => 'O arquivo "grande.pdf" passa do limite de 10 MB.'], $this->violations($data));
    }

    /**
     * @return array<string, string> the message of each violation by its property path
     */
    private function violations(FilingData $data): array
    {
        $violations = self::getContainer()->get(ValidatorInterface::class)->validate($data);

        $messages = [];
        /** @var ConstraintViolationInterface $violation */
        foreach ($violations as $violation) {
            $messages[$violation->getPropertyPath()] = (string) $violation->getMessage();
        }

        return $messages;
    }

    private function filing(): FilingData
    {
        $data = new FilingData();
        $data->type = FilingType::Answer;
        $data->description = 'Contestação e procuração.';
        $data->files = [$this->pdf()];

        return $data;
    }

    private function pdf(string $clientName = 'peticao.pdf'): UploadedFile
    {
        return $this->upload($clientName, (string) file_get_contents(__DIR__.'/../fixtures/sample.pdf'), 'application/pdf');
    }

    private function pdfOfSize(int $bytes): string
    {
        $header = '%PDF-1.4';

        return $header.str_repeat(' ', $bytes - \strlen($header));
    }

    private function upload(string $clientName, string $contents, string $clientMimeType): UploadedFile
    {
        $path = tempnam(sys_get_temp_dir(), 'jus');
        if (false === $path) {
            throw new \RuntimeException('Could not create a temporary file.');
        }

        $this->temporaryFiles[] = $path;
        file_put_contents($path, $contents);

        return new UploadedFile($path, $clientName, $clientMimeType, null, true);
    }
}
