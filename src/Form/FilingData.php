<?php

declare(strict_types=1);

namespace App\Form;

use App\Domain\LegalCase\FilingType;
use App\Filing\FilingLimits;
use Symfony\Component\HttpFoundation\File\UploadedFile;
use Symfony\Component\Validator\Constraints as Assert;

/**
 * What the filing form collects. The limits are FilingLimits', the same ones the form help and the upload component show.
 */
final class FilingData
{
    #[Assert\NotNull(message: 'Selecione o tipo da petição.')]
    public ?FilingType $type = null;

    #[Assert\NotBlank(message: 'Informe a descrição da petição.', normalizer: 'trim')]
    #[Assert\Length(max: FilingLimits::DESCRIPTION_MAX_LENGTH, maxMessage: 'A descrição passa do limite de {{ limit }} caracteres.')]
    public ?string $description = null;

    /** @var list<UploadedFile> */
    #[Assert\Count(
        min: 1,
        max: FilingLimits::MAX_FILES,
        minMessage: 'Anexe pelo menos um arquivo PDF.',
        maxMessage: 'Envie no máximo {{ limit }} arquivos.',
    )]
    #[Assert\All([
        new Assert\File(
            maxSize: FilingLimits::MAX_FILE_SIZE,
            // Sizes in 1024-based units ("10 MiB"), as the limit above is counted; this shows in the message about PHP's own
            // upload limit, which the page cannot word itself (the limit is whatever php.ini says).
            binaryFormat: true,
            mimeTypes: [FilingLimits::MIME_TYPE],
            maxSizeMessage: 'O arquivo {{ name }} passa do limite de '.FilingLimits::MAX_FILE_SIZE_IN_MEGABYTES.' MB.',
            mimeTypesMessage: 'Envie apenas arquivos PDF.',
        ),
    ])]
    public array $files = [];
}
