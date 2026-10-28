<?php

declare(strict_types=1);

namespace App\Tests\Functional;

use App\Domain\LegalCase\CaseStatus;
use App\Entity\User;
use App\Tests\Support\QueryRecorder;
use App\Tests\Support\TestCases;
use Doctrine\ORM\EntityManagerInterface;
use PHPUnit\Framework\Attributes\DataProvider;
use Symfony\Bundle\FrameworkBundle\KernelBrowser;
use Symfony\Bundle\FrameworkBundle\Test\WebTestCase;

final class CaseSearchPageTest extends WebTestCase
{
    private KernelBrowser $client;
    private TestCases $data;

    protected function setUp(): void
    {
        $this->client = self::createClient();
        $this->data = new TestCases(self::getContainer()->get(EntityManagerInterface::class));
    }

    public function testTheHomePageLeadsToTheSearch(): void
    {
        $this->signIn($this->data->lawyer('ana@jus.test', 'Ana Ribeiro'));

        $this->client->request('GET', '/');

        self::assertResponseRedirects('/processos');
    }

    public function testListsTheVisibleCasesAsCards(): void
    {
        $ana = $this->data->lawyer('ana@jus.test', 'Ana Ribeiro');
        $bruno = $this->data->lawyer('bruno@jus.test', 'Bruno Teixeira');
        $this->data->legalCase('0000001', $ana);
        $this->data->legalCase('0000003', $bruno, confidential: true);
        $this->signIn($ana);

        $crawler = $this->client->request('GET', '/processos');

        self::assertResponseIsSuccessful();
        self::assertSelectorTextContains('h1', 'Processos');
        self::assertSelectorTextContains('h2#resultados', '1 processo encontrado');
        $cards = $crawler->filter('ul.jus-case-list > li article.jus-case-card');
        self::assertCount(1, $cards);
        self::assertSame('/processos/0000001-39.2024.8.26.0100', $cards->filter('h3 a')->attr('href'));
        self::assertStringContainsString('Decisão', $cards->filter('.jus-case-card-last-event')->text());
    }

    public function testFiltersByPartyIgnoringAccents(): void
    {
        $ana = $this->data->lawyer('ana@jus.test', 'Ana Ribeiro');
        $this->data->legalCase('0000001', $ana, plaintiff: 'João Álvaro');
        $this->data->legalCase('0000003', $ana, plaintiff: 'Maria Oliveira');
        $this->signIn($ana);

        $crawler = $this->client->request('GET', '/processos?parte=joao');

        self::assertCount(1, $crawler->filter('article.jus-case-card'));
        self::assertSame('joao', $crawler->filter('input#parte')->attr('value'));
    }

    public function testGoesStraightToACaseFoundByItsNumber(): void
    {
        $ana = $this->data->lawyer('ana@jus.test', 'Ana Ribeiro');
        $this->data->legalCase('0000001', $ana);
        $this->signIn($ana);

        $this->client->request('GET', '/processos?numero=00000013920248260100');

        self::assertResponseRedirects('/processos/0000001-39.2024.8.26.0100');
    }

    public function testDoesNotRevealConfidentialCasesThroughTheNumber(): void
    {
        $ana = $this->data->lawyer('ana@jus.test', 'Ana Ribeiro');
        $secret = $this->data->legalCase('0000003', $this->data->lawyer('bruno@jus.test', 'Bruno Teixeira'), confidential: true);
        $this->signIn($ana);

        $this->client->request('GET', '/processos?numero='.$secret->getNumber()->formatted());

        self::assertResponseIsSuccessful();
        self::assertSelectorTextContains('[role="status"]', 'Nenhum processo encontrado.');
    }

    public function testExplainsAnInvalidNumberWithoutListingCases(): void
    {
        $ana = $this->data->lawyer('ana@jus.test', 'Ana Ribeiro');
        $this->data->legalCase('0000001', $ana);
        $this->signIn($ana);

        $crawler = $this->client->request('GET', '/processos?numero=123');

        self::assertResponseIsSuccessful();
        self::assertSame('true', $crawler->filter('input#numero')->attr('aria-invalid'));
        self::assertStringContainsString('Informe um número de processo válido', $crawler->filter('#numero_error1')->text());
        self::assertCount(0, $crawler->filter('article.jus-case-card'));
    }

    public function testFiltersByStatusWithPortugueseLabels(): void
    {
        $ana = $this->data->lawyer('ana@jus.test', 'Ana Ribeiro');
        $this->data->legalCase('0000001', $ana, status: CaseStatus::Archived);
        $this->data->legalCase('0000003', $ana);
        $this->signIn($ana);

        $crawler = $this->client->request('GET', '/processos?status=archived');

        self::assertSame(['Todos os status', 'Em andamento', 'Suspenso', 'Arquivado'], $crawler->filter('select#status option')->each(static fn ($o): string => trim($o->text())));
        self::assertCount(1, $crawler->filter('article.jus-case-card'));
    }

    public function testPagesTheResultsKeepingTheFilters(): void
    {
        $ana = $this->data->lawyer('ana@jus.test', 'Ana Ribeiro');
        for ($i = 1; $i <= 12; ++$i) {
            $this->data->legalCase(\sprintf('%07d', $i), $ana, filedAt: \sprintf('2024-01-%02d 10:00', $i));
        }
        $this->signIn($ana);

        $crawler = $this->client->request('GET', '/processos?parte=maria');

        self::assertCount(10, $crawler->filter('article.jus-case-card'));
        self::assertSame('?parte=maria&pagina=2#resultados', $crawler->filter('nav[aria-label="Paginação dos resultados"]')->selectLink('Próxima')->attr('href'));

        $crawler = $this->client->request('GET', '/processos?parte=maria&pagina=2');
        self::assertCount(2, $crawler->filter('article.jus-case-card'));

        $this->client->request('GET', '/processos?parte=maria&pagina=9');
        self::assertResponseRedirects('/processos?parte=maria&pagina=2');
    }

    public function testAnonymousVisitorsAreSentToTheLoginPage(): void
    {
        $this->client->request('GET', '/processos');

        self::assertResponseRedirects('/login');
    }

    public function testRejectsAnUnknownStatusWithoutListingCases(): void
    {
        $ana = $this->data->lawyer('ana@jus.test', 'Ana Ribeiro');
        $this->data->legalCase('0000001', $ana);
        $this->signIn($ana);

        $crawler = $this->client->request('GET', '/processos?status=bogus');

        self::assertResponseIsSuccessful();
        self::assertSame('A escolha selecionada é inválida.', trim($crawler->filter('#status_error1')->text()));
        self::assertCount(0, $crawler->filter('article.jus-case-card'));
        self::assertCount(0, $crawler->filter('#resultados'));
    }

    #[DataProvider('provideValuesThatAreNotAPageNumber')]
    public function testTreatsAPageThatIsNotAnIntegerAsTheFirst(string $query): void
    {
        $ana = $this->data->lawyer('ana@jus.test', 'Ana Ribeiro');
        for ($i = 1; $i <= 12; ++$i) {
            $this->data->legalCase(\sprintf('%07d', $i), $ana);
        }
        $this->signIn($ana);

        $crawler = $this->client->request('GET', '/processos?'.$query);

        self::assertResponseIsSuccessful();
        self::assertCount(10, $crawler->filter('article.jus-case-card'));
        self::assertSame('1', trim($crawler->filter('nav[aria-label="Paginação dos resultados"] [aria-current="page"]')->text()));
    }

    /**
     * @return iterable<string, array{string}>
     */
    public static function provideValuesThatAreNotAPageNumber(): iterable
    {
        yield 'text' => ['pagina=abc'];
        yield 'empty' => ['pagina='];
        yield 'decimal' => ['pagina=1.5'];
        yield 'list' => ['pagina[]=1'];
        yield 'beyond the integer range' => ['pagina=99999999999999999999'];
    }

    public function testUsesAFixedNumberOfQueriesForAFullPage(): void
    {
        $ana = $this->data->lawyer('ana@jus.test', 'Ana Ribeiro');
        for ($i = 1; $i <= 10; ++$i) {
            // Every other case has no events: the card must not go looking for them one case at a time.
            $this->data->legalCase(\sprintf('%07d', $i), $ana, withEvents: 0 === $i % 2);
        }
        $this->signIn($ana);
        self::getContainer()->get(EntityManagerInterface::class)->clear();

        QueryRecorder::instance()->reset();
        $crawler = $this->client->request('GET', '/processos');

        // user refresh, paginator count, paginator ids, cases + parties, latest events
        self::assertCount(5, QueryRecorder::instance()->selects(), implode(\PHP_EOL, QueryRecorder::instance()->selects()));
        self::assertCount(10, $crawler->filter('article.jus-case-card'));
        self::assertCount(5, $crawler->filter('.jus-case-card-last-event'));
    }

    private function signIn(User $user): void
    {
        $this->client->loginUser($user);
    }
}
