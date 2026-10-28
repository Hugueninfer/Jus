<?php

declare(strict_types=1);

namespace App\Tests\Functional;

use App\Entity\User;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\Test\WebTestCase;
use Symfony\Component\DomCrawler\Crawler;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\RequestStack;
use Symfony\Component\HttpFoundation\Session\Session;
use Symfony\Component\HttpFoundation\Session\Storage\MockArraySessionStorage;
use Symfony\Component\Security\Core\Authentication\Token\Storage\TokenStorageInterface;
use Symfony\Component\Security\Core\Authentication\Token\UsernamePasswordToken;
use Twig\Environment;

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
        self::assertCount(0, $crawler->filter('header a[href="/processos"]'));
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

        $crawler = $client->request('GET', '/processos');

        self::assertResponseIsSuccessful();
        self::assertSelectorTextContains('nav', 'João Almeida');
        self::assertSame('Processos', trim($crawler->filter('header a[href="/processos"]')->text()));
        self::assertSame('page', $crawler->filter('header a[href="/processos"]')->attr('aria-current'));
        self::assertStringContainsString('active', (string) $crawler->filter('header a[href="/processos"]')->attr('class'));
        self::assertCount(1, $crawler->filter('header a[href="/design-system"]'));
        self::assertNull($crawler->filter('header a[href="/design-system"]')->attr('aria-current'));
        self::assertCount(0, $crawler->filter('header a[href="/login"]'));

        $logoutUrl = (string) $crawler->selectLink('Sair')->attr('href');
        self::assertSame('/logout', parse_url($logoutUrl, \PHP_URL_PATH));
        parse_str((string) parse_url($logoutUrl, \PHP_URL_QUERY), $query);
        self::assertArrayHasKey('_csrf_token', $query);
        self::assertNotSame('', $query['_csrf_token']);
    }

    public function testTheCasesLinkOnlyClaimsToBeThePageOnTheSearch(): void
    {
        // Other case_* routes (the case page itself) keep the section highlighted but are not the page the link leads to.
        $link = $this->renderLayoutAt('case_show')->filter('header a[href="/processos"]');
        self::assertStringContainsString('active', (string) $link->attr('class'));
        self::assertSame('true', $link->attr('aria-current'));

        $link = $this->renderLayoutAt('design_system')->filter('header a[href="/processos"]');
        self::assertStringNotContainsString('active', (string) $link->attr('class'));
        self::assertNull($link->attr('aria-current'));
    }

    /**
     * The layout as a signed-in user sees it on a route that has no page of its own yet.
     */
    private function renderLayoutAt(string $route): Crawler
    {
        self::bootKernel();
        $container = self::getContainer();
        $request = new Request(attributes: ['_route' => $route]);
        $request->setSession(new Session(new MockArraySessionStorage()));
        $container->get(RequestStack::class)->push($request);
        $user = User::clerk('joao@jus.test', 'João Almeida');
        $container->get(TokenStorageInterface::class)->setToken(new UsernamePasswordToken($user, 'main', $user->getRoles()));

        return new Crawler($container->get(Environment::class)->render('base.html.twig'));
    }
}
