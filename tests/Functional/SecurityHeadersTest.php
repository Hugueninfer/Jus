<?php

declare(strict_types=1);

namespace App\Tests\Functional;

use App\Entity\User;
use Doctrine\ORM\EntityManagerInterface;
use PHPUnit\Framework\Attributes\DataProvider;
use Symfony\Bundle\FrameworkBundle\Test\WebTestCase;

final class SecurityHeadersTest extends WebTestCase
{
    /**
     * @return iterable<string, array{string, int, bool}>
     */
    public static function providePages(): iterable
    {
        yield 'the sign-in page' => ['/login', 200, false];
        yield 'the catalogue' => ['/design-system', 200, false];
        yield 'the search, for someone signed in' => ['/processos', 200, true];
        yield 'a redirect' => ['/', 302, true];
        yield 'the redirect to the sign-in page' => ['/processos', 302, false];
        yield 'the not found page' => ['/nao-existe', 404, false];
        yield 'the access denied page (leaving without the CSRF token)' => ['/logout', 403, true];
    }

    #[DataProvider('providePages')]
    public function testEveryPageCarriesTheBaselineSecurityHeaders(string $path, int $status, bool $signedIn): void
    {
        $client = self::createClient(['debug' => false]);
        if ($signedIn) {
            $user = User::clerk('joao@jus.test', 'João Almeida');
            $em = self::getContainer()->get(EntityManagerInterface::class);
            $em->persist($user);
            $em->flush();
            $client->loginUser($user);
        }

        $client->request('GET', $path);

        self::assertResponseStatusCodeSame($status);
        self::assertResponseHeaderSame('X-Content-Type-Options', 'nosniff');
        self::assertResponseHeaderSame('Referrer-Policy', 'same-origin');
        self::assertResponseHeaderSame('X-Frame-Options', 'DENY');
        self::assertResponseHeaderSame('Content-Security-Policy', "frame-ancestors 'none'");
    }

    public function testThePagesCarryNoScriptOrStylePolicyYet(): void
    {
        $client = self::createClient();

        $client->request('GET', '/login');

        $policy = (string) $client->getResponse()->headers->get('Content-Security-Policy');
        self::assertStringNotContainsString('script-src', $policy);
        self::assertStringNotContainsString('style-src', $policy);
        self::assertStringNotContainsString('default-src', $policy);
    }
}
