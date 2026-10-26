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
        self::assertSelectorTextContains('h1', 'Olá, Ana Ribeiro');
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
        self::assertSelectorTextContains('[role="alert"]', 'E-mail ou senha inválidos.');

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

        $client->request('GET', '/');
        self::assertResponseIsSuccessful();

        $client->request('GET', '/logout');
        self::assertResponseRedirects('/login');

        $client->request('GET', '/');
        self::assertResponseRedirects('/login');
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
