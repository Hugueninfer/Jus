<?php

declare(strict_types=1);

namespace App\Form;

use Symfony\Component\Form\AbstractType;
use Symfony\Component\Form\Extension\Core\Type\FileType;
use Symfony\Component\Form\FormInterface;
use Symfony\Component\Form\FormView;
use Symfony\Component\OptionsResolver\OptionsResolver;

/**
 * A file field the theme draws inside the <jus-upload> element, which adds drag and drop, the list of the chosen files
 * and the check against the limits before the form is sent. Without JavaScript it stays the plain native input.
 *
 * "max_files" and "max_size" (in bytes) become the attributes of the same name on the element; the server's own check
 * (the form constraints) is still the one that counts, so the caller passes both from the same constants.
 *
 * @extends AbstractType<mixed>
 */
final class UploadType extends AbstractType
{
    public function buildView(FormView $view, FormInterface $form, array $options): void
    {
        $view->vars['max_files'] = $options['max_files'];
        $view->vars['max_size'] = $options['max_size'];
    }

    public function configureOptions(OptionsResolver $resolver): void
    {
        $resolver->setDefaults([
            'max_files' => null,
            'max_size' => null,
        ]);
        $resolver->setAllowedTypes('max_files', ['null', 'int']);
        $resolver->setAllowedTypes('max_size', ['null', 'int']);
    }

    public function getParent(): string
    {
        return FileType::class;
    }
}
