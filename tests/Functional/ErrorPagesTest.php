<?php

declare(strict_types=1);

namespace App\Tests\Functional;

use App\Tests\Support\TestCases;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\KernelBrowser;
use Symfony\Bundle\FrameworkBundle\Test\WebTestCase;
use Symfony\Component\DomCrawler\Crawler;
use Twig\Environment;

final class ErrorPagesTest extends WebTestCase
{
    private KernelBrowser $client;
    private TestCases $data;

    protected function setUp(): void
    {
        // With debug on, Symfony shows the exception and the request instead of templates/bundles/TwigBundle/Exception.
        $this->client = self::createClient(['debug' => false]);
        $this->data = new TestCases(self::getContainer()->get(EntityManagerInterface::class));
    }

    public function testUnknownPagesUseTheNotFoundPage(): void
    {
        $crawler = $this->client->request('GET', '/nao-existe');

        self::assertResponseStatusCodeSame(404);
        self::assertSame('pt-BR', $crawler->filter('html')->attr('lang'));
        self::assertCount(1, $crawler->filter('main#conteudo'));
        self::assertCount(1, $crawler->filter('h1'));
        self::assertSame('Página não encontrada', trim($crawler->filter('main#conteudo h1')->text()));
        self::assertSelectorTextContains('title', 'Página não encontrada · Jus');

        // The router answers before the firewall runs, so this page never knows the user: a signed-in user is offered
        // the sign-in page too, which sends them on to the search.
        $action = $crawler->filter('main#conteudo a.btn');
        self::assertCount(1, $action);
        self::assertSame('Entrar', trim($action->text()));
        self::assertSame('/login', $action->attr('href'));
        self::assertStringNotContainsString('/nao-existe', (string) $this->client->getResponse()->getContent());
    }

    public function testAnInvalidCaseNumberUsesTheNotFoundPage(): void
    {
        $ana = $this->data->lawyer('ana@jus.test', 'Ana Ribeiro');
        $this->client->loginUser($ana);

        $crawler = $this->client->request('GET', '/processos/123');

        self::assertResponseStatusCodeSame(404);
        self::assertSame('Página não encontrada', trim($crawler->filter('main#conteudo h1')->text()));
        $action = $crawler->filter('main#conteudo a.btn');
        self::assertSame('Ir para a busca', trim($action->text()));
        self::assertSame('/processos', $action->attr('href'));
        // Neither the input nor the exception's own message ("Processo não encontrado.") reaches the page.
        $body = (string) $this->client->getResponse()->getContent();
        self::assertStringNotContainsString('/processos/123', $body);
        self::assertStringNotContainsString('Processo não encontrado', $body);
        self::assertSelectorTextContains('nav', 'Ana Ribeiro');
    }

    public function testAConfidentialCaseUsesTheNotFoundPageToo(): void
    {
        $ana = $this->data->lawyer('ana@jus.test', 'Ana Ribeiro');
        $bruno = $this->data->lawyer('bruno@jus.test', 'Bruno Teixeira');
        $this->data->legalCase('0000001', $bruno, confidential: true);
        $this->client->loginUser($ana);

        $crawler = $this->client->request('GET', '/processos/0000001-39.2024.8.26.0100');

        // A case the user may not see is answered exactly like one that does not exist, never with a 403.
        self::assertResponseStatusCodeSame(404);
        self::assertSame('Página não encontrada', trim($crawler->filter('main#conteudo h1')->text()));
        self::assertStringNotContainsString('Maria Oliveira', (string) $this->client->getResponse()->getContent());
    }

    public function testRefusedActionsUseTheAccessDeniedPage(): void
    {
        // Leaving without the CSRF token is refused with a 403 (see LoginTest): the one place that answers it today.
        $ana = $this->data->lawyer('ana@jus.test', 'Ana Ribeiro');
        $this->client->loginUser($ana);

        $crawler = $this->client->request('GET', '/logout');

        self::assertResponseStatusCodeSame(403);
        self::assertCount(1, $crawler->filter('h1'));
        self::assertSame('Acesso negado', trim($crawler->filter('main#conteudo h1')->text()));
        self::assertSelectorTextContains('title', 'Acesso negado · Jus');
        self::assertStringContainsString('Você não tem permissão para fazer isso.', $crawler->filter('main#conteudo')->text());
        $action = $crawler->filter('main#conteudo a.btn');
        self::assertSame('Ir para a busca', trim($action->text()));
        self::assertSame('/processos', $action->attr('href'));
        $body = (string) $this->client->getResponse()->getContent();
        self::assertStringNotContainsString('Access Denied', $body);
        self::assertStringNotContainsString('Invalid CSRF token', $body);
        // The exception is raised inside the firewall, so (unlike an unknown route) the page knows who is signed in.
        self::assertSelectorTextContains('nav', 'Ana Ribeiro');
        self::assertSelectorTextNotContains('nav', 'Entrar');

        // Refusing the request did not sign the user out.
        $this->client->request('GET', '/processos');
        self::assertResponseIsSuccessful();
    }

    public function testOtherClientErrorsUseTheGenericPage(): void
    {
        // The search only answers GET: a 405 has no page of its own, so the fallback template is rendered by the kernel.
        $crawler = $this->client->request('POST', '/processos');

        self::assertResponseStatusCodeSame(405);
        self::assertSame('Algo deu errado', trim($crawler->filter('main#conteudo h1')->text()));
        self::assertStringNotContainsString('Method Not Allowed', (string) $this->client->getResponse()->getContent());
    }

    public function testServerErrorsShowNoDetails(): void
    {
        // Without a request, as when the page is rendered for an error raised before routing.
        $html = self::getContainer()->get(Environment::class)->render('@Twig/Exception/error.html.twig', [
            'status_code' => 500,
            'status_text' => 'Internal Server Error',
            'exception' => new \RuntimeException('SQLSTATE[HY000]: no such table: legal_case'),
        ]);

        $crawler = new Crawler($html);
        self::assertSame('pt-BR', $crawler->filter('html')->attr('lang'));
        self::assertCount(1, $crawler->filter('h1'));
        self::assertSame('Algo deu errado', trim($crawler->filter('main#conteudo h1')->text()));
        self::assertSame('Voltar ao início', trim($crawler->filter('main#conteudo a.btn')->text()));
        self::assertSame('/', $crawler->filter('main#conteudo a.btn')->attr('href'));
        self::assertStringNotContainsString('Internal Server Error', $html);
        self::assertStringNotContainsString('SQLSTATE', $html);
        self::assertStringNotContainsString('RuntimeException', $html);
        self::assertStringNotContainsString('Stack trace', $html);
    }
}
