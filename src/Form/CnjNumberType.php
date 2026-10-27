<?php

declare(strict_types=1);

namespace App\Form;

use App\Domain\CnjNumber;
use App\Form\DataTransformer\CnjNumberToStringTransformer;
use Symfony\Component\Form\AbstractType;
use Symfony\Component\Form\Extension\Core\Type\TextType;
use Symfony\Component\Form\FormBuilderInterface;
use Symfony\Component\OptionsResolver\OptionsResolver;

/**
 * Court case number field: accepts the number with or without the mask and yields a CnjNumber.
 *
 * @extends AbstractType<CnjNumber|null>
 */
final class CnjNumberType extends AbstractType
{
    public function buildForm(FormBuilderInterface $builder, array $options): void
    {
        $builder->addModelTransformer(new CnjNumberToStringTransformer());
    }

    public function configureOptions(OptionsResolver $resolver): void
    {
        $resolver->setDefaults([
            // The view data is a string; without this Symfony infers CnjNumber from the initial data.
            'data_class' => null,
            'invalid_message' => 'Informe um número de processo válido (NNNNNNN-DD.AAAA.J.TR.OOOO).',
        ]);
    }

    public function getParent(): string
    {
        return TextType::class;
    }
}
