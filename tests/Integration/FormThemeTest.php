<?php

declare(strict_types=1);

namespace App\Tests\Integration;

use App\Form\CnjNumberType;
use Symfony\Bundle\FrameworkBundle\Test\KernelTestCase;
use Symfony\Component\DomCrawler\Crawler;
use Symfony\Component\Form\Extension\Core\Type\TextType;
use Symfony\Component\Form\FormFactoryInterface;
use Symfony\Component\Form\FormInterface;
use Symfony\Component\Validator\Constraints\NotBlank;
use Twig\Environment;

final class FormThemeTest extends KernelTestCase
{
    public function testInvalidFieldsPointToTheirMessages(): void
    {
        $form = $this->searchForm();
        $form->submit(['numero' => '123', 'parte' => '']);

        $crawler = $this->render($form);

        $numero = $crawler->filter('jus-numero-processo > input#busca_numero');
        self::assertCount(1, $numero);
        self::assertSame('true', $numero->attr('aria-invalid'));
        self::assertSame('busca_numero_error1', $numero->attr('aria-describedby'));
        self::assertStringContainsString('Informe um número de processo válido', $crawler->filter('#busca_numero_error1')->text());

        $parte = $crawler->filter('input#busca_parte');
        self::assertSame('true', $parte->attr('aria-invalid'));
        self::assertSame('busca_parte_help busca_parte_error1', $parte->attr('aria-describedby'));
        self::assertStringContainsString('Informe o nome da parte.', $crawler->filter('#busca_parte_error1')->text());
    }

    public function testValidFieldsAreNotMarkedInvalid(): void
    {
        $form = $this->searchForm();
        $form->submit(['numero' => '0000001-39.2024.8.26.0100', 'parte' => 'Maria']);

        $crawler = $this->render($form);

        $numero = $crawler->filter('input#busca_numero');
        self::assertNull($numero->attr('aria-invalid'));
        self::assertSame('numeric', $numero->attr('inputmode'));
        self::assertSame('off', $numero->attr('autocomplete'));
        self::assertNull($numero->attr('maxlength'));
        self::assertSame('0000000-00.0000.0.00.0000', $numero->attr('placeholder'));
        self::assertSame('0000001-39.2024.8.26.0100', $numero->attr('value'));

        $parte = $crawler->filter('input#busca_parte');
        self::assertNull($parte->attr('aria-invalid'));
        self::assertSame('busca_parte_help', $parte->attr('aria-describedby'));
    }

    public function testPerFieldAttributesOverrideTheCnjDefaults(): void
    {
        self::bootKernel();
        $form = self::getContainer()->get(FormFactoryInterface::class)
            ->createNamedBuilder('busca', options: ['csrf_protection' => false])
            ->add('numero', CnjNumberType::class, ['attr' => ['placeholder' => 'Ex.: 0000001-39.2024.8.26.0100', 'autocomplete' => 'on']])
            ->getForm();

        $numero = $this->render($form)->filter('input#busca_numero');

        self::assertSame('Ex.: 0000001-39.2024.8.26.0100', $numero->attr('placeholder'));
        self::assertSame('on', $numero->attr('autocomplete'));
        self::assertSame('numeric', $numero->attr('inputmode'));
    }

    /**
     * @return FormInterface<mixed>
     */
    private function searchForm(): FormInterface
    {
        self::bootKernel();

        return self::getContainer()->get(FormFactoryInterface::class)
            ->createNamedBuilder('busca', options: ['csrf_protection' => false])
            ->add('numero', CnjNumberType::class, ['label' => 'Número do processo'])
            ->add('parte', TextType::class, [
                'label' => 'Parte',
                'help' => 'Nome completo ou parte dele.',
                'constraints' => [new NotBlank(message: 'Informe o nome da parte.')],
            ])
            ->getForm();
    }

    /**
     * @param FormInterface<mixed> $form
     */
    private function render(FormInterface $form): Crawler
    {
        $twig = self::getContainer()->get(Environment::class);

        return new Crawler($twig->createTemplate('{{ form(form) }}')->render(['form' => $form->createView()]));
    }
}
