<?php

declare(strict_types=1);

namespace App\Form;

use App\Domain\LegalCase\CaseStatus;
use App\Presentation\EnumLabels;
use App\Repository\CaseSearchCriteria;
use Symfony\Component\Form\AbstractType;
use Symfony\Component\Form\Extension\Core\Type\EnumType;
use Symfony\Component\Form\Extension\Core\Type\TextType;
use Symfony\Component\Form\FormBuilderInterface;
use Symfony\Component\OptionsResolver\OptionsResolver;

/**
 * @extends AbstractType<CaseSearchCriteria>
 */
final class CaseSearchType extends AbstractType
{
    public function __construct(private readonly EnumLabels $labels)
    {
    }

    public function buildForm(FormBuilderInterface $builder, array $options): void
    {
        $builder
            ->add('numero', CnjNumberType::class, [
                'label' => 'Número do processo',
                'property_path' => 'number',
                'required' => false,
            ])
            ->add('parte', TextType::class, [
                'label' => 'Nome da parte',
                'property_path' => 'partyName',
                'required' => false,
                'help' => 'Parte do nome basta; acentos e maiúsculas não importam.',
            ])
            ->add('status', EnumType::class, [
                'class' => CaseStatus::class,
                'label' => 'Status',
                'required' => false,
                'placeholder' => 'Todos os status',
                'choice_label' => fn (CaseStatus $status): string => $this->labels->label($status),
            ]);
    }

    public function configureOptions(OptionsResolver $resolver): void
    {
        $resolver->setDefaults([
            'data_class' => CaseSearchCriteria::class,
            'method' => 'GET',
            'csrf_protection' => false,
            'allow_extra_fields' => true, // pagina, sort, direction
        ]);
    }

    public function getBlockPrefix(): string
    {
        return '';
    }
}
