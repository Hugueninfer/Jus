<?php

declare(strict_types=1);

namespace App\Form;

use App\Domain\LegalCase\FilingType;
use App\Filing\FilingLimits;
use App\Presentation\EnumLabels;
use Symfony\Component\Form\AbstractType;
use Symfony\Component\Form\Extension\Core\Type\EnumType;
use Symfony\Component\Form\Extension\Core\Type\TextareaType;
use Symfony\Component\Form\FormBuilderInterface;
use Symfony\Component\OptionsResolver\OptionsResolver;

/**
 * @extends AbstractType<FilingData>
 */
final class FilingFormType extends AbstractType
{
    public function __construct(private readonly EnumLabels $labels)
    {
    }

    public function buildForm(FormBuilderInterface $builder, array $options): void
    {
        $builder
            ->add('type', EnumType::class, [
                'class' => FilingType::class,
                'label' => 'Tipo de petição',
                'placeholder' => 'Selecione o tipo',
                // The initial petition is what opens a case: the domain refuses it once the case has movements, and
                // only cases with movements get this page.
                'choices' => array_values(array_filter(FilingType::cases(), static fn (FilingType $type): bool => FilingType::InitialPetition !== $type)),
                'choice_label' => fn (FilingType $type): string => $this->labels->label($type),
                'invalid_message' => 'Selecione um tipo de petição válido.',
            ])
            ->add('description', TextareaType::class, [
                'label' => 'Descrição',
                'help' => \sprintf('Resuma o conteúdo da petição, em até %d caracteres.', FilingLimits::DESCRIPTION_MAX_LENGTH),
                'attr' => ['rows' => 5],
            ])
            ->add('files', UploadType::class, [
                'label' => 'Petição e anexos (PDF)',
                'help' => \sprintf('Até %d arquivos PDF, de até %d MB cada.', FilingLimits::MAX_FILES, FilingLimits::MAX_FILE_SIZE_IN_MEGABYTES),
                'multiple' => true,
                'max_files' => FilingLimits::MAX_FILES,
                'max_size' => FilingLimits::MAX_FILE_SIZE,
                'attr' => ['accept' => FilingLimits::MIME_TYPE],
            ]);
    }

    public function configureOptions(OptionsResolver $resolver): void
    {
        $resolver->setDefaults(['data_class' => FilingData::class]);
    }

    public function getBlockPrefix(): string
    {
        return 'filing';
    }
}
