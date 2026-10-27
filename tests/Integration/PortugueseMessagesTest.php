<?php

declare(strict_types=1);

namespace App\Tests\Integration;

use Symfony\Bundle\FrameworkBundle\Test\KernelTestCase;
use Symfony\Component\DomCrawler\Crawler;
use Symfony\Component\Form\Extension\Core\Type\TextType;
use Symfony\Component\Form\FormFactoryInterface;
use Symfony\Component\Form\FormInterface;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\RequestStack;
use Symfony\Component\HttpFoundation\Session\Session;
use Symfony\Component\HttpFoundation\Session\Storage\MockArraySessionStorage;
use Symfony\Component\Validator\Constraints\NotBlank;
use Twig\Environment;

/**
 * Symfony's own messages (constraints without a custom message, the form CSRF check) reach the user in Portuguese.
 */
final class PortugueseMessagesTest extends KernelTestCase
{
    public function testConstraintsWithoutACustomMessageUseSymfonysPortugueseTranslation(): void
    {
        $form = $this->form(csrfProtection: false);
        $form->submit(['parte' => '']);

        $crawler = $this->render($form);

        self::assertSame('Este valor não deve ser vazio.', trim($crawler->filter('#contato_parte_error1')->text()));
    }

    public function testAnInvalidCsrfTokenIsReportedInPortuguese(): void
    {
        $form = $this->form(csrfProtection: true);
        $form->submit(['parte' => 'Maria', '_token' => 'bogus']);

        self::assertFalse($form->isValid());
        // The CSRF error belongs to the form itself, not to a field.
        self::assertSame(
            'O token CSRF é inválido. Por favor, tente reenviar o formulário.',
            trim($this->render($form)->filter('#contato_error1')->text()),
        );
    }

    /**
     * @return FormInterface<mixed>
     */
    private function form(bool $csrfProtection): FormInterface
    {
        self::bootKernel();
        // The CSRF token storage lives in the session.
        $request = new Request();
        $request->setSession(new Session(new MockArraySessionStorage()));
        self::getContainer()->get(RequestStack::class)->push($request);

        return self::getContainer()->get(FormFactoryInterface::class)
            ->createNamedBuilder('contato', options: ['csrf_protection' => $csrfProtection])
            ->add('parte', TextType::class, ['label' => 'Parte', 'constraints' => [new NotBlank()]])
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
