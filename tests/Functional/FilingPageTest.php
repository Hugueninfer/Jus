<?php

declare(strict_types=1);

namespace App\Tests\Functional;

use App\Domain\CnjNumber;
use App\Domain\LegalCase\CaseStatus;
use App\Domain\LegalCase\EventType;
use App\Entity\CaseEvent;
use App\Entity\Document;
use App\Tests\Support\QueryRecorder;
use App\Tests\Support\TestCases;
use Doctrine\ORM\EntityManagerInterface;
use Doctrine\ORM\Events;
use PHPUnit\Framework\Attributes\DataProvider;
use Symfony\Bundle\FrameworkBundle\KernelBrowser;
use Symfony\Bundle\FrameworkBundle\Test\WebTestCase;
use Symfony\Component\DomCrawler\Crawler;
use Symfony\Component\Filesystem\Filesystem;
use Symfony\Component\Filesystem\Path;
use Symfony\Component\HttpFoundation\File\UploadedFile;
use Symfony\Component\HttpFoundation\Session\FlashBagAwareSessionInterface;

final class FilingPageTest extends WebTestCase
{
    private const string CASE_URL = '/processos/0000001-39.2024.8.26.0100';
    private const string URL = self::CASE_URL.'/peticionar';
    private const string SAMPLE = __DIR__.'/../fixtures/sample.pdf';
    private const string SUBMIT = 'Juntar petição';

    private KernelBrowser $client;
    private EntityManagerInterface $em;
    private TestCases $data;
    private string $documentsDirectory;

    /** @var list<string> */
    private array $temporaryFiles = [];

    protected function setUp(): void
    {
        $this->boot();
    }

    protected function tearDown(): void
    {
        (new Filesystem())->remove([...$this->temporaryFiles, $this->documentsDirectory]);
        parent::tearDown();
    }

    public function testShowsTheFilingForm(): void
    {
        $ana = $this->data->lawyer('ana@jus.test', 'Ana Ribeiro');
        $this->data->legalCase('0000001', $ana);
        $this->client->loginUser($ana);

        $crawler = $this->client->request('GET', self::URL);

        self::assertResponseIsSuccessful();
        self::assertSelectorTextContains('title', 'Peticionar · Processo 0000001-39.2024.8.26.0100 · Jus');
        self::assertCount(1, $crawler->filter('h1'));
        self::assertSame('Peticionar', trim($crawler->filter('h1')->text()));
        $header = $crawler->filter('main header')->text();
        self::assertStringContainsString('0000001-39.2024.8.26.0100', $header);
        self::assertStringContainsString('Procedimento Comum Cível', $header);
        $back = $crawler->filter('main > p a');
        self::assertSame('Voltar para o processo', trim($back->text()));
        self::assertSame(self::CASE_URL, $back->attr('href'));

        $form = $crawler->filter('main form');
        self::assertCount(1, $form);
        self::assertSame('post', strtolower((string) $form->attr('method')));
        self::assertSame('multipart/form-data', $form->attr('enctype'));
        self::assertCount(1, $crawler->filter('input[type="hidden"][name="filing[_token]"]'));
        // With JavaScript, a second click cannot send the petition again while the first is on its way.
        self::assertNotNull($form->attr('data-jus-submit-once'));

        // The type: every kind of filing but the initial petition, which only opens a case.
        self::assertSame('Tipo de petição', trim($crawler->filter('label[for="filing_type"]')->text()));
        self::assertSame(
            ['Selecione o tipo', 'Manifestação', 'Contestação', 'Recurso', 'Juntada de documentos'],
            $crawler->filter('select#filing_type option')->each(static fn (Crawler $option): string => trim($option->text())),
        );
        self::assertSame('', $crawler->filter('select#filing_type option')->first()->attr('value'));
        self::assertStringNotContainsString('initial_petition', (string) $crawler->filter('select#filing_type')->html());

        self::assertSame('Descrição', trim($crawler->filter('label[for="filing_description"]')->text()));
        self::assertCount(1, $crawler->filter('textarea#filing_description[name="filing[description]"]'));
        self::assertSame('filing_description_help', $crawler->filter('textarea#filing_description')->attr('aria-describedby'));
        self::assertStringContainsString('2000 caracteres', $crawler->filter('#filing_description_help')->text());
        // The browser stops at the limit as well; the server's check stays.
        self::assertSame('2000', $crawler->filter('textarea#filing_description')->attr('maxlength'));

        // The files: the native input inside the upload element, with the limits as attributes and in the help text.
        $input = $crawler->filter('jus-upload[max-files="5"][max-size="10485760"] > input#filing_files');
        self::assertCount(1, $input);
        self::assertSame('file', $input->attr('type'));
        self::assertSame('filing[files][]', $input->attr('name'));
        self::assertNotNull($input->attr('multiple'));
        self::assertSame('application/pdf', $input->attr('accept'));
        self::assertStringContainsString('form-control', (string) $input->attr('class'));
        self::assertSame('filing_files_help', $input->attr('aria-describedby'));
        self::assertSame('Petição e anexos (PDF)', trim($crawler->filter('label[for="filing_files"]')->text()));
        self::assertSame('Até 5 arquivos PDF, de até 10 MB cada.', trim($crawler->filter('#filing_files_help')->text()));

        $button = $crawler->selectButton(self::SUBMIT);
        self::assertCount(1, $button);
        self::assertStringContainsString('btn-primary', (string) $button->attr('class'));
        self::assertCount(0, $crawler->filter('[aria-invalid], .is-invalid, .invalid-feedback, main .alert'));
    }

    public function testTheNavbarMarksTheCasesSectionOnTheFilingPage(): void
    {
        $ana = $this->data->lawyer('ana@jus.test', 'Ana Ribeiro');
        $this->data->legalCase('0000001', $ana);
        $this->client->loginUser($ana);

        $crawler = $this->client->request('GET', self::URL);

        self::assertSame('true', $crawler->filter('header a[href="/processos"]')->attr('aria-current'));
    }

    public function testFilesTheDocumentsAndFulfilsTheLawyersDeadlinesWithoutJavaScript(): void
    {
        $ana = $this->data->lawyer('ana@jus.test', 'Ana Ribeiro');
        $case = $this->data->legalCase('0000001', $ana);
        [$plaintiff, $defendant] = $case->getParties();
        $this->data->deadline($plaintiff);
        $this->data->deadline($defendant);
        $this->client->loginUser($ana);

        // A plain multipart POST built from the form, as a browser without JavaScript sends it.
        $this->submit(['type' => 'answer', 'description' => 'Contestação e procuração.'], [$this->pdf('contestacao.pdf'), $this->pdf('Procuração.PDF')]);

        self::assertResponseRedirects(self::CASE_URL.'?aba=movimentacoes#andamento', 303);
        $crawler = $this->client->followRedirect();

        self::assertResponseIsSuccessful();
        $this->assertConfirmedInTheAndamento($crawler);
        $filing = $crawler->filter('[data-event-type="filing"]')->first()->text();
        self::assertStringContainsString('Juntada de petição — Contestação', $filing);
        self::assertStringContainsString('Contestação e procuração.', $filing);
        self::assertStringContainsString('2 documentos', $filing);

        // The deadline of the party the lawyer represents is fulfilled; the other party's stays open.
        self::assertCount(1, $crawler->filter('section[aria-labelledby="prazos"] [data-urgency="fulfilled"]'));
        self::assertCount(1, $crawler->filter('section[aria-labelledby="prazos"] [data-urgency]:not([data-urgency="fulfilled"])'));

        $documents = $this->client->request('GET', self::CASE_URL.'?aba=documentos');
        $titles = $documents->filter('table tbody tr th, table tbody tr td:first-child')->each(static fn (Crawler $cell): string => trim($cell->text()));
        self::assertContains('contestacao', $titles);
        self::assertContains('Procuração', $titles);
        self::assertContains('Petição inicial', $titles);

        $this->em->clear();
        $stored = $this->em->getRepository(Document::class)->findBy([], ['id' => 'DESC'], 2);
        self::assertCount(2, $stored);
        foreach ($stored as $document) {
            self::assertFileExists(Path::join($this->documentsDirectory, $document->getStoredFilename()));
            self::assertSame($ana->getId(), $document->getUploadedBy()->getId());
        }
    }

    public function testTheConfirmationIsShownWhereTheRedirectLands(): void
    {
        $this->signIn();

        $this->submit();
        $crawler = $this->client->followRedirect();

        // The redirect lands on #andamento, far below the top of the case page: the confirmation is there, between the tabs
        // and the panel, and not in the area at the top of the page that the other pages use for their messages.
        $this->assertConfirmedInTheAndamento($crawler);
        self::assertCount(0, $crawler->filter('main > .alert'));

        // It is shown once: the next visit has no trace of it.
        $again = $this->client->request('GET', self::CASE_URL.'?aba=movimentacoes');
        self::assertCount(0, $again->filter('main .alert'));
        self::assertStringNotContainsString('Petição juntada ao processo.', (string) $this->client->getResponse()->getContent());
    }

    public function testTheOtherMessagesKeepTheAreaAtTheTopOfThePage(): void
    {
        $this->signIn();
        $this->flash('warning', 'Aviso para a página.');

        $crawler = $this->client->request('GET', self::CASE_URL);

        $notice = $crawler->filter('main > .alert-warning');
        self::assertCount(1, $notice);
        self::assertStringContainsString('Aviso para a página.', $notice->text());
        // The confirmation of a filing has a place of its own: it is not waiting for the page of a filing.
        self::assertCount(0, $crawler->filter('#andamento ~ .alert'));
    }

    public function testTheConfirmationOfAFilingWaitsForTheCasePageWhateverOtherMessagesCameFirst(): void
    {
        $this->signIn();
        $this->flash('filing', 'Petição juntada ao processo.');
        $this->flash('info', 'Outro aviso.');

        $crawler = $this->client->request('GET', self::CASE_URL.'?aba=movimentacoes');

        self::assertCount(1, $crawler->filter('main > .alert-info'));
        $this->assertConfirmedInTheAndamento($crawler);
    }

    public function testEveryFilingTypeButTheInitialPetitionIsAccepted(): void
    {
        $ana = $this->data->lawyer('ana@jus.test', 'Ana Ribeiro');
        $this->data->legalCase('0000001', $ana);
        $this->client->loginUser($ana);

        foreach (['statement', 'answer', 'appeal', 'exhibits'] as $type) {
            $this->submit(['type' => $type]);
            self::assertResponseRedirects(self::CASE_URL.'?aba=movimentacoes#andamento', 303, $type);
        }
    }

    public function testRefusesTheInitialPetitionOfACaseThatAlreadyHasMovements(): void
    {
        $ana = $this->data->lawyer('ana@jus.test', 'Ana Ribeiro');
        $this->data->legalCase('0000001', $ana);
        $this->client->loginUser($ana);

        // Not offered by the form, but a hand-made request must meet the form's refusal, not the domain's exception.
        $crawler = $this->submit(['type' => 'initial_petition']);

        self::assertResponseStatusCodeSame(422);
        $this->assertFieldRefused($crawler, 'type', 'Selecione um tipo de petição válido.');
        $this->assertNothingWasFiled();
    }

    public function testRefusesAFilingWithoutFiles(): void
    {
        $this->signIn();

        $crawler = $this->submit(files: []);

        self::assertResponseStatusCodeSame(422);
        $this->assertFieldRefused($crawler, 'files', 'Anexe pelo menos um arquivo PDF.');
        $this->assertNothingWasFiled();
    }

    public function testRefusesMoreThanFiveFiles(): void
    {
        $this->signIn();

        $crawler = $this->submit(files: array_map(fn (int $number): UploadedFile => $this->pdf(\sprintf('peca-%d.pdf', $number)), range(1, 6)));

        self::assertResponseStatusCodeSame(422);
        $this->assertFieldRefused($crawler, 'files', 'Envie no máximo 5 arquivos.');
        $this->assertNothingWasFiled();
    }

    public function testAcceptsExactlyFiveFiles(): void
    {
        $this->signIn();

        $this->submit(files: array_map(fn (int $number): UploadedFile => $this->pdf(\sprintf('peca-%d.pdf', $number)), range(1, 5)));

        self::assertResponseRedirects(self::CASE_URL.'?aba=movimentacoes#andamento', 303);
    }

    public function testRefusesFilesThatAreNotPdfs(): void
    {
        $this->signIn();

        $notes = $this->temporary('notas.txt', "Anotações.\n");
        $crawler = $this->submit(files: [$this->pdf(), new UploadedFile($notes, 'notas.txt', 'text/plain', null, true)]);

        self::assertResponseStatusCodeSame(422);
        $this->assertFieldRefused($crawler, 'files', 'Envie apenas arquivos PDF.');
        $this->assertNothingWasFiled();
    }

    public function testRefusesAFileThatIsTooLarge(): void
    {
        $this->signIn();

        // The test client turns a file over the PHP upload limit into an upload error, as the server does; whichever limit is
        // lower speaks (the wording depends on this machine's php.ini, so the text is checked in FilingDataTest).
        $big = $this->temporary('grande.pdf', '%PDF-1.4'.str_repeat(' ', 11 * 1024 * 1024));
        $crawler = $this->submit(files: [new UploadedFile($big, 'grande.pdf', 'application/pdf', null, true)]);

        self::assertResponseStatusCodeSame(422);
        self::assertSame('true', $crawler->filter('#filing_files')->attr('aria-invalid'));
        self::assertCount(1, $crawler->filter('#filing_files_error1'));
        $this->assertNothingWasFiled();
    }

    public function testRefusesAnEmptyDescription(): void
    {
        $this->signIn();

        $crawler = $this->submit(['description' => "  \n "]);

        self::assertResponseStatusCodeSame(422);
        $this->assertFieldRefused($crawler, 'description', 'Informe a descrição da petição.');
        $this->assertNothingWasFiled();
    }

    public function testRefusesADescriptionOverTheLimit(): void
    {
        $this->signIn();

        $crawler = $this->submit(['description' => str_repeat('a', 2001)]);

        self::assertResponseStatusCodeSame(422);
        $this->assertFieldRefused($crawler, 'description', 'A descrição passa do limite de 2000 caracteres.');
        $this->assertNothingWasFiled();
    }

    public function testAcceptsADescriptionAtTheLimit(): void
    {
        $this->signIn();

        $this->submit(['description' => str_repeat('a', 2000)]);

        self::assertResponseRedirects(self::CASE_URL.'?aba=movimentacoes#andamento', 303);
    }

    public function testTheLimitOfTheDescriptionCountsALineBreakAsOneCharacter(): void
    {
        $this->signIn();

        // A browser counts a line break as one character against maxlength, and sends it as two (CR LF). Symfony's
        // textarea turns it into one (LF) before the length is checked; without that, a text the page let someone type would
        // be refused.
        $crawler = $this->submit(['description' => str_repeat('a', 1000)."\r\n".str_repeat('b', 1000)]);
        self::assertResponseStatusCodeSame(422);
        $this->assertFieldRefused($crawler, 'description', 'A descrição passa do limite de 2000 caracteres.');

        // 2000 characters for the browser, 2001 as sent.
        $this->submit(['description' => str_repeat('a', 1000)."\r\n".str_repeat('b', 999)]);
        self::assertResponseRedirects(self::CASE_URL.'?aba=movimentacoes#andamento', 303);
        $this->em->clear();
        $filing = $this->em->getRepository(CaseEvent::class)->findOneBy(['type' => EventType::Filing], ['id' => 'DESC']);
        self::assertNotNull($filing);
        self::assertSame(str_repeat('a', 1000)."\n".str_repeat('b', 999), $filing->getDescription());
    }

    public function testRefusesAFilingWithoutAType(): void
    {
        $this->signIn();

        $crawler = $this->submit(['type' => '']);

        self::assertResponseStatusCodeSame(422);
        $this->assertFieldRefused($crawler, 'type', 'Selecione o tipo da petição.');
        $this->assertNothingWasFiled();
    }

    public function testAnInvalidFilingKeepsWhatWasTyped(): void
    {
        $this->signIn();

        $crawler = $this->submit(['type' => 'appeal', 'description' => 'Razões do recurso.'], files: []);

        self::assertResponseStatusCodeSame(422);
        self::assertSame('appeal', $crawler->filter('select#filing_type option[selected]')->attr('value'));
        self::assertSame('Razões do recurso.', trim($crawler->filter('textarea#filing_description')->text()));
        // The valid fields are not marked.
        self::assertNull($crawler->filter('#filing_type')->attr('aria-invalid'));
        self::assertNull($crawler->filter('#filing_description')->attr('aria-invalid'));
        self::assertSame('filing_description_help', $crawler->filter('#filing_description')->attr('aria-describedby'));
    }

    public function testTheSummaryListsEveryInvalidFieldAsALinkToIt(): void
    {
        $this->signIn();

        $crawler = $this->submit(['type' => '', 'description' => ''], files: []);

        self::assertResponseStatusCodeSame(422);
        $summary = $crawler->filter('main #resumo-erros');
        self::assertCount(1, $summary);
        self::assertStringContainsString('Corrija os campos indicados', $summary->text());
        // Text to read, not an announcement that interrupts: no alert role on load.
        self::assertNull($summary->attr('role'));
        self::assertCount(0, $crawler->filter('main [role="alert"]'));

        $links = $summary->filter('a');
        self::assertSame(
            [['Tipo de petição', '#filing_type'], ['Descrição', '#filing_description'], ['Petição e anexos (PDF)', '#filing_files']],
            $links->each(static fn (Crawler $link): array => [trim($link->text()), $link->attr('href')]),
        );
        // Each link leads to an element of the page: the field itself.
        foreach (['filing_type', 'filing_description', 'filing_files'] as $id) {
            self::assertCount(1, $crawler->filter('main form #'.$id), $id);
        }
        // Nothing was sent, so there is nothing to select again.
        self::assertStringNotContainsString('Selecione os arquivos novamente', $summary->text());
    }

    public function testTheSummaryOnlyListsTheFieldsThatFailed(): void
    {
        $this->signIn();

        $crawler = $this->submit(['description' => ''], files: [$this->pdf()]);

        $links = $crawler->filter('main #resumo-erros a');
        self::assertSame(['Descrição'], $links->each(static fn (Crawler $link): string => trim($link->text())));
        self::assertSame('#filing_description', $links->attr('href'));
    }

    public function testTheSummaryAsksForTheFilesAgainWhenTheyWereSentButTheFormFailedForAnotherReason(): void
    {
        $this->signIn();

        // The browser never gives a file input its files back: they have to be chosen again, which the page must say.
        $crawler = $this->submit(['description' => ''], files: [$this->pdf()]);

        self::assertResponseStatusCodeSame(422);
        self::assertStringContainsString('Selecione os arquivos novamente.', $crawler->filter('main #resumo-erros')->text());
        $this->assertNothingWasFiled();
    }

    public function testTheSummaryDoesNotAskForTheFilesAgainWhenTheyAreWhatFailed(): void
    {
        $this->signIn();

        $notes = $this->temporary('notas.txt', "Anotações.\n");
        $crawler = $this->submit(files: [new UploadedFile($notes, 'notas.txt', 'text/plain', null, true)]);

        self::assertResponseStatusCodeSame(422);
        $summary = $crawler->filter('main #resumo-erros');
        self::assertSame(['Petição e anexos (PDF)'], $summary->filter('a')->each(static fn (Crawler $link): string => trim($link->text())));
        self::assertStringNotContainsString('Selecione os arquivos novamente', $summary->text());
    }

    public function testTheTitleStartsWithErrorWhenTheFormWasRefused(): void
    {
        $this->signIn();

        $this->client->request('GET', self::URL);
        self::assertSelectorTextSame('title', 'Peticionar · Processo 0000001-39.2024.8.26.0100 · Jus');

        $this->submit(['description' => '']);

        self::assertResponseStatusCodeSame(422);
        self::assertSelectorTextSame('title', 'Erro: Peticionar · Processo 0000001-39.2024.8.26.0100 · Jus');
    }

    public function testRefusesAnInvalidCsrfToken(): void
    {
        $this->signIn();

        $crawler = $this->submit(['_token' => 'invalid']);

        self::assertResponseStatusCodeSame(422);
        $this->assertRootError($crawler, 'O token CSRF é inválido. Por favor, tente reenviar o formulário.');
        self::assertSelectorTextContains('title', 'Erro: Peticionar');
        $this->assertNothingWasFiled();
    }

    public function testTheFilesAreAskedForAgainWhenOnlyTheTokenWasRefused(): void
    {
        $this->signIn();

        // Every field is fine, so there is no summary of fields; the files still arrived and are gone from the form.
        $crawler = $this->submit(['_token' => 'invalid'], files: [$this->pdf()]);

        self::assertResponseStatusCodeSame(422);
        $this->assertRootError($crawler, 'O token CSRF é inválido. Por favor, tente reenviar o formulário.');
        self::assertCount(0, $crawler->filter('main #resumo-erros'));
        $note = $crawler->filter('main #arquivos-novamente');
        self::assertCount(1, $note);
        self::assertSame('Selecione os arquivos novamente.', trim($note->text()));
        $this->assertNothingWasFiled();
    }

    public function testNoFilesAreAskedForOnTheFormOrAfterAFiling(): void
    {
        $this->signIn();

        $crawler = $this->client->request('GET', self::URL);
        self::assertCount(0, $crawler->filter('#arquivos-novamente'));

        $crawler = $this->submit(['description' => ''], files: []);
        self::assertCount(0, $crawler->filter('#arquivos-novamente'));
    }

    public function testARequestOverThePostLimitSaysSoInPortuguese(): void
    {
        if (\in_array(strtolower(trim((string) \ini_get('post_max_size'))), ['', '0'], true)) {
            self::markTestSkipped('post_max_size is unlimited here.');
        }

        $this->signIn();
        $this->client->request('GET', self::URL);

        // PHP discards the whole body of a request over post_max_size: only the declared length tells the form.
        $crawler = $this->client->request('POST', self::URL, server: ['CONTENT_LENGTH' => '999999999999']);

        self::assertResponseStatusCodeSame(422);
        // One error that says what happened and the limit, and nothing else: the fields are empty because the body was
        // dropped, so an error on each of them would only bury it.
        $max = strtoupper(trim((string) \ini_get('post_max_size')));
        $this->assertRootError(
            $crawler,
            \sprintf('O envio passou do limite de %s e não foi recebido. Escolha arquivos menores ou menos arquivos.', $max),
        );
        self::assertCount(0, $crawler->filter('main .invalid-feedback, main [aria-invalid], main .is-invalid, main #resumo-erros'));
        self::assertSelectorTextContains('title', 'Erro: Peticionar');
        // The form comes back blank and usable.
        self::assertSame('', $crawler->filter('select#filing_type option[selected]')->attr('value'));
        self::assertCount(1, $crawler->selectButton(self::SUBMIT));
        self::assertCount(1, $crawler->filter('input[name="filing[_token]"]'));
        $this->assertNothingWasFiled();
    }

    public function testAFailureWhileFilingGivesTheErrorPageAndKeepsNothing(): void
    {
        // The error page of a production kernel: with debug on, Symfony shows the exception instead.
        $this->boot(['debug' => false]);
        $ana = $this->data->lawyer('ana@jus.test', 'Ana Ribeiro');
        $this->data->legalCase('0000001', $ana);
        $this->client->loginUser($ana);
        // The database fails when the filing is written, after the PDFs were stored: the transaction is rolled back and the
        // entity manager is closed. Nothing may touch it after that. (The same kernel serves the page and the filing, so
        // that the failure planted here is still in place for the second request.)
        $this->client->disableReboot();
        $this->em->getEventManager()->addEventListener([Events::onFlush], new class {
            public function onFlush(): never
            {
                throw new \RuntimeException('The database went away.');
            }
        });

        // The kernel logs the failure through PHP's error log; a file keeps it out of the test output, and shows it was logged.
        $log = $this->temporary('log', '');
        $previousLog = ini_set('error_log', $log);
        try {
            $crawler = $this->submit();
        } finally {
            ini_set('error_log', false === $previousLog ? '' : $previousLog);
        }

        self::assertResponseStatusCodeSame(500);
        self::assertSame('Algo deu errado', trim($crawler->filter('main h1')->text()));
        $body = (string) $this->client->getResponse()->getContent();
        self::assertStringNotContainsString('The database went away', $body);
        self::assertStringNotContainsString('Exception', $body);
        self::assertStringContainsString('The database went away.', (string) file_get_contents($log));
        // Neither the event nor the documents were kept, and the stored PDFs were removed again.
        $this->assertNothingWasFiled();
    }

    public function testAnonymousVisitorsAreSentToTheLoginPage(): void
    {
        $ana = $this->data->lawyer('ana@jus.test', 'Ana Ribeiro');
        $this->data->legalCase('0000001', $ana);

        $this->client->request('GET', self::URL);

        self::assertResponseRedirects('/login');
    }

    public function testAConfidentialCaseOfAnotherLawyerLooksLikeAnUnknownOne(): void
    {
        $this->boot(['debug' => false]);
        $ana = $this->data->lawyer('ana@jus.test', 'Ana Ribeiro');
        $bruno = $this->data->lawyer('bruno@jus.test', 'Bruno Teixeira');
        $this->data->legalCase('0000001', $bruno, confidential: true);
        $this->client->loginUser($ana);

        $unknown = $this->client->request('GET', '/processos/'.CnjNumber::compose('0009999', '2024', '8', '26', '0100')->formatted().'/peticionar');
        self::assertResponseStatusCodeSame(404);
        $unknownContent = trim($unknown->filter('main')->text());

        foreach (['GET', 'POST'] as $method) {
            $crawler = $this->client->request($method, self::URL);

            // The same page as for a number that does not exist, on a GET and on a POST alike: viewing is checked first.
            self::assertResponseStatusCodeSame(404, $method);
            self::assertSame('Página não encontrada', trim($crawler->filter('main h1')->text()));
            self::assertSame($unknownContent, trim($crawler->filter('main')->text()));
            self::assertStringNotContainsString('Acesso negado', (string) $this->client->getResponse()->getContent());
        }
        $this->assertNothingWasFiled();
    }

    #[DataProvider('provideMethods')]
    public function testTheClerkSeesTheCaseButMayNotFile(string $method): void
    {
        $this->boot(['debug' => false]);
        $ana = $this->data->lawyer('ana@jus.test', 'Ana Ribeiro');
        $clerk = $this->data->clerk('servidor@jus.test', 'Carlos Servidor');
        $this->data->legalCase('0000001', $ana);
        $this->client->loginUser($clerk);

        $crawler = $this->client->request($method, self::URL);

        self::assertResponseStatusCodeSame(403);
        self::assertSame('Acesso negado', trim($crawler->filter('main h1')->text()));
        $this->assertNothingWasFiled();
    }

    #[DataProvider('provideMethods')]
    public function testALawyerWithoutAPartyMaySeeAPublicCaseButNotFileInIt(string $method): void
    {
        $this->boot(['debug' => false]);
        $ana = $this->data->lawyer('ana@jus.test', 'Ana Ribeiro');
        $bruno = $this->data->lawyer('bruno@jus.test', 'Bruno Teixeira');
        $this->data->legalCase('0000001', $bruno);
        $this->client->loginUser($ana);

        $this->client->request('GET', self::CASE_URL);
        self::assertResponseIsSuccessful();

        $crawler = $this->client->request($method, self::URL);

        self::assertResponseStatusCodeSame(403);
        self::assertSame('Acesso negado', trim($crawler->filter('main h1')->text()));
        $this->assertNothingWasFiled();
    }

    #[DataProvider('provideMethods')]
    public function testNobodyFilesInAnArchivedCase(string $method): void
    {
        $this->boot(['debug' => false]);
        $ana = $this->data->lawyer('ana@jus.test', 'Ana Ribeiro');
        $this->data->legalCase('0000001', $ana, status: CaseStatus::Archived);
        $this->client->loginUser($ana);

        $crawler = $this->client->request($method, self::URL);

        self::assertResponseStatusCodeSame(403);
        self::assertSame('Acesso negado', trim($crawler->filter('main h1')->text()));
        $this->assertNothingWasFiled();
    }

    /**
     * @return iterable<string, array{string}>
     */
    public static function provideMethods(): iterable
    {
        yield 'viewing the form' => ['GET'];
        yield 'sending a filing' => ['POST'];
    }

    public function testRedirectsPlainNumbersToTheMaskedUrl(): void
    {
        $ana = $this->data->lawyer('ana@jus.test', 'Ana Ribeiro');
        $this->data->legalCase('0000001', $ana);
        $this->client->loginUser($ana);

        $this->client->request('GET', '/processos/00000013920248260100/peticionar');

        self::assertResponseRedirects(self::URL, 301);
    }

    public function testInvalidNumbersAreNotFound(): void
    {
        $this->boot(['debug' => false]);
        $ana = $this->data->lawyer('ana@jus.test', 'Ana Ribeiro');
        $this->client->loginUser($ana);

        $crawler = $this->client->request('GET', '/processos/123/peticionar');

        self::assertResponseStatusCodeSame(404);
        self::assertSame('Página não encontrada', trim($crawler->filter('main h1')->text()));
    }

    public function testTheFilingButtonIsOnTheCasePageOnlyForTheLawyerOfAParty(): void
    {
        $ana = $this->data->lawyer('ana@jus.test', 'Ana Ribeiro');
        $bruno = $this->data->lawyer('bruno@jus.test', 'Bruno Teixeira');
        $clerk = $this->data->clerk('servidor@jus.test', 'Carlos Servidor');
        $this->data->legalCase('0000001', $ana);

        $this->client->loginUser($ana);
        $crawler = $this->client->request('GET', self::CASE_URL);
        $button = $crawler->filter('main header a.btn.btn-primary');
        self::assertCount(1, $button);
        self::assertSame('Peticionar', trim($button->text()));
        self::assertSame(self::URL, $button->attr('href'));

        foreach ([$bruno, $clerk] as $viewer) {
            $this->client->loginUser($viewer);
            $crawler = $this->client->request('GET', self::CASE_URL);

            self::assertResponseIsSuccessful();
            self::assertCount(0, $crawler->filter('a[href$="/peticionar"]'), $viewer->getName());
        }
    }

    public function testTheFilingButtonIsNotOnTheCasePageOfAnArchivedCase(): void
    {
        $ana = $this->data->lawyer('ana@jus.test', 'Ana Ribeiro');
        $this->data->legalCase('0000001', $ana, status: CaseStatus::Archived);
        $this->client->loginUser($ana);

        $crawler = $this->client->request('GET', self::CASE_URL);

        self::assertResponseIsSuccessful();
        self::assertCount(0, $crawler->filter('a[href$="/peticionar"]'));
    }

    public function testTheCasePageKeepsItsQueryCountForTheLawyerWithTheButton(): void
    {
        $ana = $this->data->lawyer('ana@jus.test', 'Ana Ribeiro');
        $this->data->legalCase('0000001', $ana);
        $this->client->loginUser($ana);

        $this->em->clear();
        QueryRecorder::instance()->reset();
        $crawler = $this->client->request('GET', self::CASE_URL);

        // user refresh, the case with everything it owns, the deadlines: asking whether the lawyer may file adds none
        self::assertCount(3, QueryRecorder::instance()->selects(), implode(\PHP_EOL, QueryRecorder::instance()->selects()));
        self::assertCount(1, $crawler->filter('a[href$="/peticionar"]'));
    }

    public function testUsesAFixedNumberOfQueries(): void
    {
        $ana = $this->data->lawyer('ana@jus.test', 'Ana Ribeiro');
        $bruno = $this->data->lawyer('bruno@jus.test', 'Bruno Teixeira');
        $case = $this->data->legalCase('0000001', $ana);
        $case->getParties()[0]->addLawyer($bruno);
        $case->getParties()[1]->addLawyer($bruno);
        $this->em->flush();
        $this->client->loginUser($ana);

        $this->em->clear();
        QueryRecorder::instance()->reset();
        $crawler = $this->client->request('GET', self::URL);

        // user refresh, the case with its parties and their lawyers: not its movements and documents, which the form does not show
        self::assertCount(2, QueryRecorder::instance()->selects(), implode(\PHP_EOL, QueryRecorder::instance()->selects()));
        self::assertCount(1, $crawler->filter('main form'));
    }

    /**
     * @param array<string, string> $fields overrides of the "filing[...]" form values
     * @param ?list<UploadedFile>   $files  the PDFs sent (one by default)
     */
    private function submit(array $fields = [], ?array $files = null): Crawler
    {
        // The page as it renders the form, with its hidden CSRF token; then what a person would have filled in.
        $page = $this->client->request('GET', self::URL);
        $token = $page->filter('input[name="filing[_token]"]')->attr('value');
        $values = array_replace(['_token' => $token, 'type' => 'answer', 'description' => 'Contestação e procuração.'], $fields);

        return $this->client->request('POST', self::URL, ['filing' => $values], ['filing' => ['files' => $files ?? [$this->pdf()]]]);
    }

    /**
     * Leaves a flash message in the session of the signed-in user, for the next page to show.
     */
    private function flash(string $type, string $message): void
    {
        $session = self::getContainer()->get('session.factory')->createSession();
        self::assertInstanceOf(FlashBagAwareSessionInterface::class, $session);
        $cookie = $this->client->getCookieJar()->get($session->getName());
        self::assertNotNull($cookie, 'Sign in first: the session is the one the login created.');

        $session->setId($cookie->getValue());
        $session->start();
        $session->getFlashBag()->add($type, $message);
        $session->save();
    }

    /**
     * The confirmation of a filing is inside the Andamento section, right after the tabs and before the panel they open,
     * once, and nowhere else on the page.
     */
    private function assertConfirmedInTheAndamento(Crawler $page): void
    {
        $message = 'Petição juntada ao processo.';

        $confirmation = $page->filter('section[aria-labelledby="andamento-titulo"] > #andamento + .alert-success');
        self::assertCount(1, $confirmation);
        self::assertStringContainsString($message, $confirmation->text());
        self::assertSame('Sucesso: '.$message, trim($confirmation->text()));
        self::assertSame(1, substr_count($page->filter('main')->text(), $message));
        self::assertCount(1, $page->filter('main .alert-success'));
    }

    /**
     * The one error of the form itself (the token, a request that was too large): the same alert as everywhere, with its
     * icon and the "Erro:" that screen readers hear, and the only one on the page.
     */
    private function assertRootError(Crawler $page, string $message): void
    {
        $alert = $page->filter('main form .alert-danger');

        self::assertCount(1, $alert);
        self::assertSame('Erro: '.$message, trim($alert->text()));
        self::assertSame('Erro:', trim($alert->filter('.visually-hidden')->text()));
        self::assertCount(1, $alert->filter('i.bi-x-octagon-fill[aria-hidden="true"]'));
        self::assertSame('alert', $alert->attr('role'));
        self::assertSame('filing_error1', $alert->attr('id'));
    }

    private function signIn(): void
    {
        $ana = $this->data->lawyer('ana@jus.test', 'Ana Ribeiro');
        $this->data->legalCase('0000001', $ana);
        $this->client->loginUser($ana);
    }

    private function assertFieldRefused(Crawler $page, string $field, string $message): void
    {
        $input = $page->filter('#filing_'.$field);
        self::assertSame('true', $input->attr('aria-invalid'), $field);
        self::assertStringContainsString('is-invalid', (string) $input->attr('class'));
        self::assertSame($message, trim($page->filter('#filing_'.$field.'_error1')->text()));
        self::assertStringContainsString('filing_'.$field.'_error1', (string) $input->attr('aria-describedby'));
    }

    /**
     * Besides the initial petition and its document, which the fixture case starts with, no filing event or document was
     * recorded and no PDF was kept.
     */
    private function assertNothingWasFiled(): void
    {
        $this->em->clear();

        self::assertSame(1, $this->em->getRepository(CaseEvent::class)->count(['type' => EventType::Filing]));
        self::assertSame(1, $this->em->getRepository(Document::class)->count([]));
        self::assertSame([], glob(Path::join($this->documentsDirectory, '*.pdf')) ?: []);
    }

    /**
     * A copy of the sample PDF as the browser would have sent it under $clientName.
     */
    private function pdf(string $clientName = 'peticao.pdf'): UploadedFile
    {
        $path = $this->temporary($clientName, (string) file_get_contents(self::SAMPLE));

        return new UploadedFile($path, $clientName, 'application/pdf', null, true);
    }

    private function temporary(string $name, string $contents): string
    {
        $path = tempnam(sys_get_temp_dir(), 'jus');
        if (false === $path) {
            throw new \RuntimeException('Could not create a temporary file.');
        }

        $this->temporaryFiles[] = $path;
        file_put_contents($path, $contents);

        return $path;
    }

    /**
     * @param array<string, mixed> $options
     */
    private function boot(array $options = []): void
    {
        self::ensureKernelShutdown();
        $this->client = self::createClient($options);
        $container = self::getContainer();
        $this->em = $container->get(EntityManagerInterface::class);
        $this->data = new TestCases($this->em);
        // Read once, from the first (debug) kernel: a kernel without debug drops the parameters no service needs by name.
        $this->documentsDirectory ??= $container->getParameter('app.documents_dir');
        (new Filesystem())->remove($this->documentsDirectory);
    }
}
