<?php

declare(strict_types=1);

namespace App\Tests\Functional;

use App\Entity\User;
use Doctrine\ORM\EntityManagerInterface;
use PHPUnit\Framework\Attributes\DataProvider;
use Symfony\Bundle\FrameworkBundle\Test\WebTestCase;
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
