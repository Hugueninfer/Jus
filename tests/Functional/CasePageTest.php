<?php

declare(strict_types=1);

namespace App\Tests\Functional;

use App\Domain\CnjNumber;
use App\Domain\LegalCase\CaseStatus;
use App\Domain\LegalCase\EventType;
use App\Domain\LegalCase\PartySide;
use App\Entity\Deadline;
use App\Entity\LegalCase;
use App\Entity\Party;
use App\Tests\Support\QueryRecorder;
use App\Tests\Support\TestCases;
use Doctrine\ORM\EntityManagerInterface;
use PHPUnit\Framework\Attributes\DataProvider;
use Symfony\Bundle\FrameworkBundle\KernelBrowser;
use Symfony\Bundle\FrameworkBundle\Test\WebTestCase;
use Symfony\Component\DomCrawler\Crawler;

final class CasePageTest extends WebTestCase
{
    private const string URL = '/processos/0000001-39.2024.8.26.0100';

    private KernelBrowser $client;
    private EntityManagerInterface $em;
    private TestCases $data;

    protected function setUp(): void
    {
        $this->boot();
    }

    public function testShowsTheCaseCover(): void
    {
        $ana = $this->data->lawyer('ana@jus.test', 'Ana Ribeiro');
        $this->data->legalCase('0000001', $ana);
        $this->client->loginUser($ana);

        $crawler = $this->client->request('GET', self::URL);

        self::assertResponseIsSuccessful();
        self::assertSelectorTextContains('title', 'Processo 0000001-39.2024.8.26.0100 · Jus');
        self::assertCount(1, $crawler->filter('h1'));
        self::assertSame('0000001-39.2024.8.26.0100', trim($crawler->filter('h1')->text()));
        self::assertSame('Voltar para a busca', trim($crawler->filter('main > p a')->text()));
        self::assertSame('/processos', $crawler->filter('main > p a')->attr('href'));
        self::assertSelectorTextContains('main header .badge', 'Em andamento');
        self::assertSelectorTextNotContains('main', 'Sigiloso');

        $cover = $crawler->filter('main dl')->text(null, false); // the no-break space of the currency is not whitespace to collapse
        self::assertStringContainsString('Procedimento Comum Cível', $cover);
        self::assertStringContainsString('Indenização por dano moral', $cover);
        self::assertStringContainsString('1ª Vara Cível', $cover);
        self::assertStringContainsString("R\$\u{00A0}15.000,00", $cover);
        self::assertSame('2024-03-04', $crawler->filter('main dl time')->attr('datetime'));
        self::assertSame('04/03/2024', $crawler->filter('main dl time')->text());

        self::assertSame(['Partes', 'Prazos', 'Andamento'], $crawler->filter('main h2')->each(static fn (Crawler $h): string => trim($h->text())));
        self::assertSame(['Polo ativo', 'Polo passivo'], $crawler->filter('section[aria-labelledby="partes"] h3')->each(static fn (Crawler $h): string => trim($h->text())));
        $parties = $crawler->filter('section[aria-labelledby="partes"] .card');
        self::assertCount(2, $parties);
        self::assertSame('Maria Oliveira', trim($parties->eq(0)->filter('h4')->text()));
        self::assertNotNull($ana->getOabNumber());
        self::assertStringContainsString('Ana Ribeiro ('.$ana->getOabNumber().')', $parties->eq(0)->text());
        self::assertSame('Empresa X Ltda.', trim($parties->eq(1)->filter('h4')->text()));
        self::assertStringContainsString('Sem advogado constituído.', $parties->eq(1)->text());
    }

    public function testGroupsThePartiesBySideWhateverTheOrderTheyWereAdded(): void
    {
        $ana = $this->data->lawyer('ana@jus.test', 'Ana Ribeiro');
        $case = new LegalCase(
            CnjNumber::compose('0000001', '2024', '8', '26', '0100'),
            'Procedimento Comum Cível',
            'Indenização por dano moral',
            '1ª Vara Cível',
            CaseStatus::Active,
            false,
            1_500_000,
            new \DateTimeImmutable('2024-03-04 10:00'),
        );
        // The defendant goes in first, so the stored (id) order is the opposite of the reading order.
        $case->addParty('Empresa X Ltda.', '12.345.678/0001-90', PartySide::Defendant);
        $case->addParty('Maria Oliveira', '123.456.789-00', PartySide::Plaintiff)->addLawyer($ana);
        $case->addParty('Empresa Y S.A.', '98.765.432/0001-10', PartySide::Defendant);
        $case->addParty('João Souza', '987.654.321-00', PartySide::Plaintiff);
        $this->em->persist($case);
        $this->em->flush();
        $this->client->loginUser($ana);

        $crawler = $this->client->request('GET', self::URL);

        self::assertResponseIsSuccessful();
        $section = $crawler->filter('section[aria-labelledby="partes"]');
        // Heading order: Partes (h2) > side (h3) > party (h4), each party under its own side.
        self::assertSame(
            ['h2:Partes', 'h3:Polo ativo', 'h4:Maria Oliveira', 'h4:João Souza', 'h3:Polo passivo', 'h4:Empresa X Ltda.', 'h4:Empresa Y S.A.'],
            $section->filter('h2, h3, h4')->each(static fn (Crawler $h): string => $h->nodeName().':'.trim($h->text())),
        );
        $sides = $crawler->filter('section[aria-labelledby="partes"] > div');
        self::assertCount(2, $sides);
        self::assertSame(['Maria Oliveira', 'João Souza'], $sides->eq(0)->filter('h4')->each(static fn (Crawler $h): string => trim($h->text())));
        self::assertSame(['Empresa X Ltda.', 'Empresa Y S.A.'], $sides->eq(1)->filter('h4')->each(static fn (Crawler $h): string => trim($h->text())));
        self::assertStringContainsString('Ana Ribeiro', $sides->eq(0)->filter('.card')->eq(0)->text());
        self::assertStringContainsString('Sem advogado constituído.', $sides->eq(0)->filter('.card')->eq(1)->text());
    }

    public function testASideWithoutPartiesShowsADash(): void
    {
        $ana = $this->data->lawyer('ana@jus.test', 'Ana Ribeiro');
        $case = new LegalCase(
            CnjNumber::compose('0000001', '2024', '8', '26', '0100'),
            'Procedimento Comum Cível',
            'Indenização por dano moral',
            '1ª Vara Cível',
            CaseStatus::Active,
            false,
            1_500_000,
            new \DateTimeImmutable('2024-03-04 10:00'),
        );
        $case->addParty('Maria Oliveira', '123.456.789-00', PartySide::Plaintiff)->addLawyer($ana);
        $this->em->persist($case);
        $this->em->flush();
        $this->client->loginUser($ana);

        $crawler = $this->client->request('GET', self::URL);

        self::assertResponseIsSuccessful();
        $section = $crawler->filter('section[aria-labelledby="partes"]');
        self::assertSame(['Polo ativo', 'Polo passivo'], $section->filter('h3')->each(static fn (Crawler $h): string => trim($h->text())));
        self::assertSame(['Maria Oliveira'], $section->filter('h4')->each(static fn (Crawler $h): string => trim($h->text())));
        $empty = $crawler->filter('section[aria-labelledby="partes"] > div')->eq(1);
        self::assertSame('—', trim($empty->filter('p')->filter('[aria-hidden="true"]')->text()));
        self::assertSame('Nenhuma parte.', trim($empty->filter('p .visually-hidden')->text()));
        self::assertCount(0, $empty->filter('.card'));
    }

    public function testRedirectsPlainNumbersToTheMaskedUrl(): void
    {
        $ana = $this->data->lawyer('ana@jus.test', 'Ana Ribeiro');
        $this->data->legalCase('0000001', $ana);
        $this->client->loginUser($ana);

        $this->client->request('GET', '/processos/00000013920248260100?aba=documentos');

        self::assertResponseRedirects(self::URL.'?aba=documentos', 301);
    }

    public function testTheRedirectKeepsTheNumberOfTheRouteWhateverTheQueryHolds(): void
    {
        $ana = $this->data->lawyer('ana@jus.test', 'Ana Ribeiro');
        $this->data->legalCase('0000001', $ana);
        $this->client->loginUser($ana);

        // A "numero" in the query must not take the place of the one in the path (nor send the visitor to another case).
        $this->client->request('GET', '/processos/00000013920248260100?numero=0000002-54.2024.8.26.0100&aba=documentos');

        self::assertResponseRedirects(self::URL.'?aba=documentos', 301);
    }

    #[DataProvider('provideNumbersThatAreNotFound')]
    public function testInvalidOrUnknownNumbersAreNotFound(string $path): void
    {
        $ana = $this->data->lawyer('ana@jus.test', 'Ana Ribeiro');
        $this->data->legalCase('0000001', $ana);
        $this->client->loginUser($ana);

        $this->client->request('GET', $path);

        self::assertResponseStatusCodeSame(404);
    }

    /**
     * @return iterable<string, array{string}>
     */
    public static function provideNumbersThatAreNotFound(): iterable
    {
        yield 'too short' => ['/processos/123'];
        yield 'wrong check digits' => ['/processos/0000001-40.2024.8.26.0100'];
        yield 'valid but unknown' => ['/processos/'.CnjNumber::compose('0009999', '2024', '8', '26', '0100')->formatted()];
    }

    public function testAnUnknownNumberWithoutTheMaskIsRedirectedBeforeItIsLookedUp(): void
    {
        $ana = $this->data->lawyer('ana@jus.test', 'Ana Ribeiro');
        $this->client->loginUser($ana);
        $unknown = CnjNumber::compose('0009999', '2024', '8', '26', '0100');

        $this->client->request('GET', '/processos/'.$unknown->digits());
        self::assertResponseRedirects('/processos/'.$unknown->formatted(), 301);

        $this->client->followRedirect();
        self::assertResponseStatusCodeSame(404);
    }

    public function testTheNotFoundPageDoesNotEchoTheNumber(): void
    {
        // Debug pages dump the whole request: only the error page of a production kernel says what a visitor would see.
        $this->boot(['debug' => false]);
        $ana = $this->data->lawyer('ana@jus.test', 'Ana Ribeiro');
        $this->client->loginUser($ana);

        $crawler = $this->client->request('GET', '/processos/'.rawurlencode('<script>alert(1)'));

        self::assertResponseStatusCodeSame(404);
        // The application's own page, not a bare error: nothing of the request but the way back to the search.
        self::assertSame('Página não encontrada', trim($crawler->filter('main h1')->text()));
        self::assertSame('/processos', $crawler->filter('main a.btn')->attr('href'));
        $body = (string) $this->client->getResponse()->getContent();
        // The raw input must be absent from the content (the layout's own scripts are not the request's input).
        self::assertStringNotContainsString('<script>', $crawler->filter('main')->html());
        self::assertStringNotContainsString('alert(1)', $body);
        self::assertStringNotContainsString('&lt;script', $body);
        self::assertStringNotContainsString('alert%281%29', $body);
    }

    public function testAValidButUnknownNumberShowsTheNotFoundPage(): void
    {
        $this->boot(['debug' => false]);
        $ana = $this->data->lawyer('ana@jus.test', 'Ana Ribeiro');
        $this->data->legalCase('0000001', $ana);
        $this->client->loginUser($ana);

        $crawler = $this->client->request('GET', '/processos/'.CnjNumber::compose('0009999', '2024', '8', '26', '0100')->formatted());

        self::assertResponseStatusCodeSame(404);
        self::assertSame('Página não encontrada', trim($crawler->filter('main h1')->text()));
        self::assertSame('/processos', $crawler->filter('main a.btn')->attr('href'));
        self::assertStringNotContainsString('0009999', (string) $this->client->getResponse()->getContent());
    }

    public function testAConfidentialCaseLooksLikeAnUnknownOneToOtherLawyers(): void
    {
        $this->boot(['debug' => false]);
        $ana = $this->data->lawyer('ana@jus.test', 'Ana Ribeiro');
        $bruno = $this->data->lawyer('bruno@jus.test', 'Bruno Teixeira');
        $this->data->legalCase('0000001', $bruno, confidential: true);
        $this->client->loginUser($ana);

        $unknown = $this->client->request('GET', '/processos/'.CnjNumber::compose('0009999', '2024', '8', '26', '0100')->formatted());
        self::assertResponseStatusCodeSame(404);
        $unknownHeading = trim($unknown->filter('main h1')->text());
        $unknownContent = trim($unknown->filter('main')->text());

        $crawler = $this->client->request('GET', self::URL);

        // The same page as for a number that does not exist: nothing tells the lawyer that the case is there.
        self::assertResponseStatusCodeSame(404);
        self::assertSame('Página não encontrada', trim($crawler->filter('main h1')->text()));
        self::assertSame($unknownHeading, trim($crawler->filter('main h1')->text()));
        self::assertSame($unknownContent, trim($crawler->filter('main')->text()));
        $body = (string) $this->client->getResponse()->getContent();
        self::assertStringNotContainsString('Maria Oliveira', $body);
        self::assertStringNotContainsString('Procedimento Comum Cível', $body);
        self::assertStringNotContainsString('Sigiloso', $body);
        self::assertStringNotContainsString('Acesso negado', $body);
    }

    public function testConfidentialCasesAreOnlyVisibleToTheClerkAndTheRepresentingLawyers(): void
    {
        $ana = $this->data->lawyer('ana@jus.test', 'Ana Ribeiro');
        $bruno = $this->data->lawyer('bruno@jus.test', 'Bruno Teixeira');
        $clerk = $this->data->clerk('servidor@jus.test', 'Carlos Servidor');
        $this->data->legalCase('0000001', $bruno, confidential: true);

        $this->client->loginUser($ana);
        $this->client->request('GET', self::URL);
        self::assertResponseStatusCodeSame(404);

        $this->client->loginUser($bruno);
        $this->client->request('GET', self::URL);
        self::assertResponseIsSuccessful();

        $this->client->loginUser($clerk);
        $crawler = $this->client->request('GET', self::URL);
        self::assertResponseIsSuccessful();
        self::assertStringContainsString('Sigiloso', $crawler->filter('main header')->text());
    }

    public function testAnonymousVisitorsAreSentToTheLoginPage(): void
    {
        $ana = $this->data->lawyer('ana@jus.test', 'Ana Ribeiro');
        $this->data->legalCase('0000001', $ana);

        $this->client->request('GET', self::URL);

        self::assertResponseRedirects('/login');
    }

    public function testShowsTheTimelineByDefault(): void
    {
        $ana = $this->data->lawyer('ana@jus.test', 'Ana Ribeiro');
        $this->data->legalCase('0000001', $ana);
        $this->client->loginUser($ana);

        $crawler = $this->client->request('GET', self::URL);

        self::assertResponseIsSuccessful();
        $tabs = $crawler->filter('nav[aria-label="Andamento do processo"]');
        self::assertCount(1, $tabs);
        self::assertSame('andamento', $tabs->attr('id'));
        self::assertCount(2, $tabs->filter('ul.nav.nav-tabs > li.nav-item > a.nav-link'));
        self::assertSame(['?aba=movimentacoes#andamento', '?aba=documentos#andamento'], $tabs->filter('a')->each(static fn (Crawler $a): ?string => $a->attr('href')));
        $current = $tabs->filter('[aria-current]');
        self::assertCount(1, $current);
        self::assertSame('Movimentações', trim($current->text()));
        self::assertSame('page', $current->attr('aria-current'));
        self::assertStringContainsString('active', (string) $current->attr('class'));

        self::assertCount(1, $crawler->filter('ol.jus-timeline'));
        self::assertCount(2, $crawler->filter('li.jus-timeline-event'));
        self::assertCount(0, $crawler->filter('table.jus-data-table'));
    }

    public function testShowsTheDocumentsTabWithoutJavaScript(): void
    {
        $ana = $this->data->lawyer('ana@jus.test', 'Ana Ribeiro');
        $this->data->legalCase('0000001', $ana);
        $this->client->loginUser($ana);

        $crawler = $this->client->request('GET', self::URL.'?aba=documentos');

        self::assertResponseIsSuccessful();
        $current = $crawler->filter('nav[aria-label="Andamento do processo"] [aria-current]');
        self::assertCount(1, $current);
        self::assertSame('Documentos', trim($current->text()));
        self::assertSame('page', $current->attr('aria-current'));

        self::assertCount(0, $crawler->filter('ol.jus-timeline'));
        self::assertCount(1, $crawler->filter('table.jus-data-table'));
        self::assertSame('Documentos do processo', trim($crawler->filter('table.jus-data-table caption')->text()));
        $cells = $crawler->filter('table.jus-data-table tbody tr')->eq(0)->filter('td')->each(static fn (Crawler $td): string => trim($td->text()));
        self::assertSame(['Petição inicial', 'Petição inicial', '04/03/2024', '180 KB'], $cells);

        $href = (string) $crawler->filter('table.jus-data-table thead')->selectLink('Título')->attr('href');
        self::assertStringContainsString('aba=documentos', $href);
        self::assertStringEndsWith('#andamento', $href);
    }

    public function testSortingTheDocumentsKeepsTheTab(): void
    {
        $ana = $this->data->lawyer('ana@jus.test', 'Ana Ribeiro');
        $case = $this->data->legalCase('0000001', $ana);
        $case->record(EventType::Order, 'Despacho com anexo.', new \DateTimeImmutable('2024-03-30 09:00'))
            ->attach('Despacho', 'despacho.pdf', 'stored-despacho.pdf', 2048, $ana, new \DateTimeImmutable('2024-03-30 09:01'));
        $this->em->flush();
        $this->client->loginUser($ana);

        $crawler = $this->client->request('GET', self::URL.'?aba=documentos&sort=size&direction=desc');

        self::assertResponseIsSuccessful();
        self::assertSame(['Petição inicial', 'Despacho'], $crawler->filter('table.jus-data-table tbody tr td:first-child')->each(static fn (Crawler $td): string => trim($td->text())));
        self::assertSame('Tamanho', trim($crawler->filter('table.jus-data-table th[aria-sort="descending"]')->text()));
        self::assertSame('Documentos', trim($crawler->filter('nav[aria-label="Andamento do processo"] [aria-current="page"]')->text()));
        $href = (string) $crawler->filter('table.jus-data-table thead')->selectLink('Tamanho')->attr('href');
        self::assertSame('?aba=documentos&sort=size&direction=asc#andamento', $href);

        $crawler = $this->client->request('GET', self::URL.'?aba=documentos&sort=size&direction=asc');
        self::assertSame(['Despacho', 'Petição inicial'], $crawler->filter('table.jus-data-table tbody tr td:first-child')->each(static fn (Crawler $td): string => trim($td->text())));
    }

    public function testTheDocumentsTabOfACaseWithoutDocumentsSaysSo(): void
    {
        $ana = $this->data->lawyer('ana@jus.test', 'Ana Ribeiro');
        $this->data->legalCase('0000001', $ana, withEvents: false);
        $this->client->loginUser($ana);

        $crawler = $this->client->request('GET', self::URL.'?aba=documentos');

        self::assertResponseIsSuccessful();
        self::assertSame('Nenhum documento.', trim($crawler->filter('table.jus-data-table tbody td')->text()));

        $crawler = $this->client->request('GET', self::URL);
        self::assertSame('Nenhuma movimentação.', trim($crawler->filter('ol.jus-timeline')->text()));
    }

    public function testAnUnknownTabIsTheTimeline(): void
    {
        $ana = $this->data->lawyer('ana@jus.test', 'Ana Ribeiro');
        $this->data->legalCase('0000001', $ana);
        $this->client->loginUser($ana);

        $crawler = $this->client->request('GET', self::URL.'?aba=bogus');

        self::assertResponseIsSuccessful();
        self::assertSame('Movimentações', trim($crawler->filter('nav[aria-label="Andamento do processo"] [aria-current]')->text()));
        self::assertCount(1, $crawler->filter('ol.jus-timeline'));
    }

    #[DataProvider('provideValuesThatAreNotText')]
    public function testAMalformedTabOrSortFallsBackToTheDefaults(string $query, string $tab, ?string $ascendingColumn): void
    {
        $ana = $this->data->lawyer('ana@jus.test', 'Ana Ribeiro');
        $this->data->legalCase('0000001', $ana);
        $this->client->loginUser($ana);

        $crawler = $this->client->request('GET', self::URL.'?'.$query);

        self::assertResponseIsSuccessful();
        self::assertSame($tab, trim($crawler->filter('nav[aria-label="Andamento do processo"] [aria-current="page"]')->text()));
        $sorted = $crawler->filter('table.jus-data-table th[aria-sort="ascending"], table.jus-data-table th[aria-sort="descending"]');
        if (null === $ascendingColumn) {
            self::assertCount(0, $sorted);

            return;
        }
        self::assertCount(1, $sorted);
        self::assertSame($ascendingColumn, trim($sorted->text()));
        self::assertSame('ascending', $sorted->attr('aria-sort'));
    }

    /**
     * @return iterable<string, array{string, string, ?string}>
     */
    public static function provideValuesThatAreNotText(): iterable
    {
        yield 'tab as a list' => ['aba[]=documentos', 'Movimentações', null];
        yield 'empty tab' => ['aba=', 'Movimentações', null];
        yield 'sort as a list' => ['aba=documentos&sort[]=title', 'Documentos', null];
        yield 'empty sort' => ['aba=documentos&sort=&direction=desc', 'Documentos', null];
        yield 'direction as a list' => ['aba=documentos&sort=title&direction[]=desc', 'Documentos', 'Título'];
        yield 'tab as a map' => ['aba[x]=documentos&sort=title', 'Movimentações', null];
    }

    public function testListsDeadlinesOpenFirst(): void
    {
        $ana = $this->data->lawyer('ana@jus.test', 'Ana Ribeiro');
        $case = $this->data->legalCase('0000001', $ana);
        [$plaintiff, $defendant] = $case->getParties();
        $this->deadline($case, $defendant, '2026-02-24', fulfilledAt: '2026-02-26 16:00');
        $this->deadline($case, $plaintiff, '2026-03-04');
        $this->client->loginUser($ana);

        $crawler = $this->client->request('GET', self::URL);

        self::assertResponseIsSuccessful();
        $deadlines = $crawler->filter('section[aria-labelledby="prazos"] li');
        self::assertCount(2, $deadlines);
        $urgencies = $crawler->filter('section[aria-labelledby="prazos"] [data-urgency]')->each(static fn (Crawler $badge): ?string => $badge->attr('data-urgency'));
        self::assertCount(2, $urgencies);
        self::assertNotSame('fulfilled', $urgencies[0]);
        self::assertSame('fulfilled', $urgencies[1]);
        self::assertStringContainsString('Maria Oliveira — intimação em 04/03/2026', $deadlines->eq(0)->text());
        self::assertStringContainsString('Empresa X Ltda. — intimação em 24/02/2026', $deadlines->eq(1)->text());
        self::assertSelectorTextNotContains('section[aria-labelledby="prazos"]', 'Nenhum prazo.');
    }

    public function testSaysWhenThereAreNoDeadlines(): void
    {
        $ana = $this->data->lawyer('ana@jus.test', 'Ana Ribeiro');
        $this->data->legalCase('0000001', $ana);
        $this->client->loginUser($ana);

        $crawler = $this->client->request('GET', self::URL);

        self::assertSame('Nenhum prazo.', trim($crawler->filter('section[aria-labelledby="prazos"] p')->text()));
        self::assertCount(0, $crawler->filter('[data-urgency]'));
    }

    public function testUsesAFixedNumberOfQueries(): void
    {
        $ana = $this->data->lawyer('ana@jus.test', 'Ana Ribeiro');
        $case = $this->data->legalCase('0000001', $ana);
        [$plaintiff, $defendant] = $case->getParties();
        $this->deadline($case, $plaintiff, '2026-03-04');
        $this->deadline($case, $defendant, '2026-02-24', fulfilledAt: '2026-02-26 16:00');
        $this->client->loginUser($ana);

        foreach (['', '?aba=documentos', '?aba=documentos&sort=size&direction=desc'] as $query) {
            $this->em->clear();

            QueryRecorder::instance()->reset();
            $crawler = $this->client->request('GET', self::URL.$query);

            // user refresh, the case with everything it owns, the deadlines
            self::assertCount(3, QueryRecorder::instance()->selects(), $query.\PHP_EOL.implode(\PHP_EOL, QueryRecorder::instance()->selects()));
            self::assertCount(2, $crawler->filter('section[aria-labelledby="prazos"] [data-urgency]'));
        }
    }

    public function testTheNavbarMarksTheSearchSectionOnTheCasePage(): void
    {
        $ana = $this->data->lawyer('ana@jus.test', 'Ana Ribeiro');
        $this->data->legalCase('0000001', $ana);
        $this->client->loginUser($ana);

        $crawler = $this->client->request('GET', self::URL);

        self::assertResponseIsSuccessful();
        $link = $crawler->filter('header a[href="/processos"]');
        self::assertSame('Processos', trim($link->text()));
        self::assertStringContainsString('active', (string) $link->attr('class'));
        // Not "page": the link leads to the search, which is not the page being shown.
        self::assertSame('true', $link->attr('aria-current'));
    }

    /**
     * A fresh kernel, client and test data; a test calls it again to change the kernel options.
     *
     * @param array<string, mixed> $options
     */
    private function boot(array $options = []): void
    {
        self::ensureKernelShutdown();
        $this->client = self::createClient($options);
        $this->em = self::getContainer()->get(EntityManagerInterface::class);
        $this->data = new TestCases($this->em);
    }

    private function deadline(LegalCase $case, Party $party, string $summonedOn, ?string $fulfilledAt = null): void
    {
        $deadline = new Deadline($party, $case->record(EventType::Summons, 'Intimação.', new \DateTimeImmutable($summonedOn.' 08:00')), 5);
        if (null !== $fulfilledAt) {
            $deadline->fulfil(new \DateTimeImmutable($fulfilledAt));
        }
        $this->em->persist($deadline);
        $this->em->flush();
    }
}
