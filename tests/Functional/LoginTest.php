<?php

declare(strict_types=1);

namespace App\Tests\Functional;

use App\Entity\User;
use Doctrine\ORM\EntityManagerInterface;
use PHPUnit\Framework\Attributes\DataProvider;
use Symfony\Bundle\FrameworkBundle\Test\WebTestCase;
use Symfony\Component\DomCrawler\Crawler;
use Symfony\Component\PasswordHasher\Hasher\UserPasswordHasherInterface;

final class LoginTest extends WebTestCase
{
    public function testAnonymousVisitorsAreSentToTheLoginPage(): void
    {
        $client = self::createClient();

        $client->request('GET', '/');

        self::assertResponseRedirects('/login');
    }

    public function testTheLoginPageIsPublic(): void
    {
        $client = self::createClient();

        $client->request('GET', '/login');

        self::assertResponseIsSuccessful();
        self::assertSelectorTextContains('h1', 'Entrar');
    }

    public function testTheLoginPageShowsAPresentationBesideTheFormCard(): void
    {
        $client = self::createClient();

        $crawler = $client->request('GET', '/login');

        $layout = $crawler->filter('main#conteudo .jus-login');
        self::assertCount(1, $layout);
        // The presentation comes first (beside the card from lg up, above it below lg), then the card with the form.
        self::assertCount(1, $layout->filter('.jus-login-hero + .jus-login-card'));

        // The presentation: the brand blue in both themes (an area base/_focus.scss gives the inverse focus ring), the
        // brand, the title as a highlighted paragraph (the page has one heading, the h1 of the form) and the notice.
        $hero = $layout->filter('.jus-login-hero');
        self::assertCount(1, $hero);
        self::assertContains('text-bg-primary', explode(' ', (string) $hero->attr('class')));
        self::assertCount(0, $hero->filter('h1, h2, h3, h4, h5, h6'));
        self::assertSame('true', $hero->filter('.jus-brand-mark')->attr('aria-hidden'));
        self::assertSame('Jus', trim($hero->filter('.jus-brand-name')->text()));
        self::assertSame('Processo eletrônico, do jeito que deveria ser.', trim($hero->filter('p.jus-login-hero-title')->text()));
        self::assertStringContainsString('Consulta, prazos e peticionamento num painel acessível, que funciona até sem JavaScript.', $hero->text());
        self::assertSame('Projeto de demonstração · dados fictícios', trim($hero->filter('.jus-login-hero-note')->text()));

        // The form, on a surface card, under the only h1 of the page.
        $card = $layout->filter('.jus-login-card');
        self::assertContains('jus-surface', explode(' ', (string) $card->attr('class')));
        self::assertCount(1, $crawler->filter('h1'));
        self::assertSame('Entrar', trim($card->filter('h1')->text()));
        self::assertCount(1, $card->filter('form[action="/login"]'));
        self::assertCount(1, $card->filter('form input#username[autofocus]'));

        // The demonstration accounts stand out, after the form: each address and the shared password, as code.
        $accounts = $card->filter('form + .jus-demo-accounts');
        self::assertCount(1, $accounts);
        self::assertStringContainsString('Contas de demonstração', $accounts->text());
        self::assertSame(['advogado@jus.test', 'servidor@jus.test', 'jus-demo'], $accounts->filter('code')->each(static fn (Crawler $code): string => $code->text()));
        self::assertStringContainsString('(advogada)', $accounts->text());
        self::assertStringContainsString('(servidor)', $accounts->text());
    }

    public function testALawyerLogsInWithEmailAndPassword(): void
    {
        $client = self::createClient();
        $this->createUser(User::lawyer('ana@jus.test', 'Ana Ribeiro', 'SP 123.456'), 'senha-correta');

        $client->request('GET', '/login');
        $client->submitForm('Entrar', ['_username' => 'ana@jus.test', '_password' => 'senha-correta']);

        self::assertResponseRedirects('/');
        $client->followRedirect();
        self::assertResponseRedirects('/processos');
        $client->followRedirect();
        self::assertSelectorTextContains('h1', 'Processos');
        self::assertSelectorTextContains('nav', 'Ana Ribeiro');
    }

    #[DataProvider('provideEmailsTypedDifferentlyFromTheStoredOne')]
    public function testTheEmailIsCaseInsensitiveAndIgnoresSurroundingSpaces(string $typed): void
    {
        $client = self::createClient();
        $this->createUser(User::lawyer('advogado@jus.test', 'Ana Ribeiro', 'SP 123.456'), 'jus-demo');

        $client->request('GET', '/login');
        $client->submitForm('Entrar', ['_username' => $typed, '_password' => 'jus-demo']);

        self::assertResponseRedirects('/');
        $client->followRedirect();
        self::assertResponseRedirects('/processos');
        $client->followRedirect();
        self::assertSelectorTextContains('nav', 'Ana Ribeiro');
    }

    /**
     * @return iterable<string, array{string}>
     */
    public static function provideEmailsTypedDifferentlyFromTheStoredOne(): iterable
    {
        yield 'first letter capitalised' => ['Advogado@jus.test'];
        yield 'domain capitalised' => ['advogado@JUS.test'];
        yield 'mixed case' => ['Advogado@JUS.test'];
        yield 'upper case' => ['ADVOGADO@JUS.TEST'];
        yield 'surrounding spaces' => ['  advogado@jus.test  '];
        yield 'mixed case with surrounding spaces' => [' Advogado@JUS.test '];
    }

    public function testAUserCreatedWithACapitalisedEmailSignsInWithTheLowerCaseOne(): void
    {
        $client = self::createClient();
        $this->createUser(User::clerk('Joao.Almeida@JUS.test', 'João Almeida'), 'senha-correta');

        $client->request('GET', '/login');
        $client->submitForm('Entrar', ['_username' => 'joao.almeida@jus.test', '_password' => 'senha-correta']);

        self::assertResponseRedirects('/');
    }

    public function testAWrongPasswordShowsAnError(): void
    {
        $client = self::createClient();
        $this->createUser(User::clerk('joao@jus.test', 'João Almeida'), 'senha-correta');

        $client->request('GET', '/login');
        $client->submitForm('Entrar', ['_username' => 'joao@jus.test', '_password' => 'errada']);

        self::assertResponseRedirects('/login');
        $client->followRedirect();
        self::assertSelectorTextContains('[role="alert"]', 'E-mail ou senha inválidos.');
        self::assertInputValueSame('_username', 'joao@jus.test');
    }

    #[DataProvider('providePasswordsThatDifferFromTheRealOne')]
    public function testThePasswordStaysExact(string $typed): void
    {
        $client = self::createClient();
        $this->createUser(User::clerk('joao@jus.test', 'João Almeida'), 'Senha-Correta');

        $client->request('GET', '/login');
        $client->submitForm('Entrar', ['_username' => 'Joao@JUS.test', '_password' => $typed]);

        self::assertResponseRedirects('/login');
        $client->followRedirect();
        self::assertSelectorTextContains('[role="alert"]', 'E-mail ou senha inválidos.');
        self::assertInputValueSame('_username', 'Joao@JUS.test');
        $client->request('GET', '/');
        self::assertResponseRedirects('/login');
    }

    /**
     * @return iterable<string, array{string}>
     */
    public static function providePasswordsThatDifferFromTheRealOne(): iterable
    {
        yield 'trailing space' => ['Senha-Correta '];
        yield 'leading space' => [' Senha-Correta'];
        yield 'other case' => ['senha-correta'];
    }

    public function testAnUnknownEmailGetsTheSameErrorAsAWrongPassword(): void
    {
        $client = self::createClient();
        $this->createUser(User::clerk('joao@jus.test', 'João Almeida'), 'senha-correta');

        $client->request('GET', '/login');
        $client->submitForm('Entrar', ['_username' => 'ninguem@jus.test', '_password' => 'senha-correta']);

        self::assertResponseRedirects('/login');
        $client->followRedirect();
        self::assertSelectorTextContains('[role="alert"]', 'E-mail ou senha inválidos.');
        self::assertInputValueSame('_username', 'ninguem@jus.test');
    }

    public function testTheEmailFieldIsNotAutocapitalisedOrSpellChecked(): void
    {
        $client = self::createClient();

        $crawler = $client->request('GET', '/login');

        $email = $crawler->filter('input[name="_username"]');
        self::assertSame('none', $email->attr('autocapitalize'));
        self::assertSame('false', $email->attr('spellcheck'));
        self::assertSame('username', $email->attr('autocomplete'));
        self::assertSame('current-password', $crawler->filter('input[name="_password"]')->attr('autocomplete'));
    }

    /**
     * @param array<string, string> $csrfFields
     */
    #[DataProvider('provideMissingOrInvalidCsrfTokens')]
    public function testLoginIsRejectedWithoutAValidCsrfToken(array $csrfFields, bool $visitTheLoginPageFirst): void
    {
        $client = self::createClient();
        $this->createUser(User::clerk('joao@jus.test', 'João Almeida'), 'senha-correta');
        if ($visitTheLoginPageFirst) {
            $client->request('GET', '/login'); // stores a real token in the session, so a bogus one is a mismatch
        }

        $client->request('POST', '/login', ['_username' => 'joao@jus.test', '_password' => 'senha-correta'] + $csrfFields);

        self::assertResponseRedirects('/login');
        $client->followRedirect();
        self::assertSelectorTextContains('[role="alert"]', 'Sua sessão expirou. Tente novamente.');

        $client->request('GET', '/');
        self::assertResponseRedirects('/login');
    }

    /**
     * @return iterable<string, array{array<string, string>, bool}>
     */
    public static function provideMissingOrInvalidCsrfTokens(): iterable
    {
        yield 'no token' => [[], false];
        yield 'bogus token' => [['_csrf_token' => 'bogus'], true];
    }

    public function testLogoutEndsTheSession(): void
    {
        $client = self::createClient();
        $client->loginUser($this->createUser(User::clerk('joao@jus.test', 'João Almeida'), 'senha-correta'));

        $client->request('GET', '/processos');
        self::assertResponseIsSuccessful();

        $client->clickLink('Sair');
        self::assertResponseRedirects('/login');

        $client->request('GET', '/');
        self::assertResponseRedirects('/login');
    }

    public function testLogoutWithoutATokenIsRefused(): void
    {
        $client = self::createClient();
        $client->loginUser($this->createUser(User::clerk('joao@jus.test', 'João Almeida'), 'senha-correta'));

        $client->request('GET', '/logout');
        self::assertResponseStatusCodeSame(403);

        $client->request('GET', '/processos');
        self::assertResponseIsSuccessful();
    }

    public function testSignedInUsersAreSentHomeFromTheLoginPage(): void
    {
        $client = self::createClient();
        $client->loginUser($this->createUser(User::clerk('joao@jus.test', 'João Almeida'), 'senha-correta'));

        $client->request('GET', '/login');

        self::assertResponseRedirects('/');
    }

    private function createUser(User $user, string $plainPassword): User
    {
        $hasher = self::getContainer()->get(UserPasswordHasherInterface::class);
        $user->setPassword($hasher->hashPassword($user, $plainPassword));

        $em = self::getContainer()->get(EntityManagerInterface::class);
        $em->persist($user);
        $em->flush();

        return $user;
    }
}
