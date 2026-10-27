<?php

declare(strict_types=1);

namespace App\Tests\Functional;

use App\Entity\User;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\Test\WebTestCase;

final class LayoutTest extends WebTestCase
{
    public function testTheLayoutIsAccessible(): void
    {
        $client = self::createClient();

        $crawler = $client->request('GET', '/login');

        self::assertResponseIsSuccessful();
        self::assertSame('pt-BR', $crawler->filter('html')->attr('lang'));
        self::assertSame('Pular para o conteúdo', trim($crawler->filter('a[href="#conteudo"]')->text()));
        self::assertCount(1, $crawler->filter('main#conteudo'));
        self::assertSame('-1', $crawler->filter('main#conteudo')->attr('tabindex'));
        self::assertSame('Navegação principal', $crawler->filter('nav')->attr('aria-label'));
        self::assertSelectorExists('meta[name="viewport"]');
        self::assertSelectorTextContains('title', 'Entrar · Jus');
    }

    public function testTheNavbarOffersTheCatalogAndSignInToVisitors(): void
    {
        $client = self::createClient();

        $crawler = $client->request('GET', '/design-system');

        self::assertResponseIsSuccessful();
        self::assertSame('Design System', trim($crawler->filter('header a[href="/design-system"]')->text()));
        self::assertSame('page', $crawler->filter('header a[href="/design-system"]')->attr('aria-current'));
        self::assertSame('Entrar', trim($crawler->filter('header a[href="/login"]')->text()));
        self::assertCount(0, $crawler->selectLink('Sair'));
        self::assertCount(1, $crawler->filter('header button[data-bs-target="#menu-principal"]'));
    }

    public function testTheNavbarShowsTheSignedInUser(): void
    {
        $client = self::createClient();
        $user = User::clerk('joao@jus.test', 'João Almeida');
        $em = self::getContainer()->get(EntityManagerInterface::class);
        $em->persist($user);
        $em->flush();
        $client->loginUser($user);

        $crawler = $client->request('GET', '/');

        self::assertResponseIsSuccessful();
        self::assertSelectorTextContains('nav', 'João Almeida');
        self::assertCount(1, $crawler->filter('header a[href="/design-system"]'));
        self::assertCount(0, $crawler->filter('header a[href="/login"]'));

        $logoutUrl = (string) $crawler->selectLink('Sair')->attr('href');
        self::assertSame('/logout', parse_url($logoutUrl, \PHP_URL_PATH));
        parse_str((string) parse_url($logoutUrl, \PHP_URL_QUERY), $query);
        self::assertArrayHasKey('_csrf_token', $query);
        self::assertNotSame('', $query['_csrf_token']);
    }
}
