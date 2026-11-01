<?php

declare(strict_types=1);

namespace App\Tests\Functional;

use App\Domain\LegalCase\EventType;
use App\Entity\Document;
use App\Entity\LegalCase;
use App\Entity\User;
use App\Filing\DocumentStorage;
use App\Tests\Support\QueryRecorder;
use App\Tests\Support\TestCases;
use Doctrine\ORM\EntityManagerInterface;
use PHPUnit\Framework\Attributes\DataProvider;
use Symfony\Bundle\FrameworkBundle\KernelBrowser;
use Symfony\Bundle\FrameworkBundle\Test\WebTestCase;
use Symfony\Component\Filesystem\Filesystem;
use Symfony\Component\HttpFoundation\BinaryFileResponse;

final class DocumentDownloadTest extends WebTestCase
{
    private const string SAMPLE = __DIR__.'/../fixtures/sample.pdf';

    private KernelBrowser $client;
    private EntityManagerInterface $em;
    private TestCases $data;
    private DocumentStorage $storage;
    private string $documentsDirectory;

    protected function setUp(): void
    {
        $this->boot();
    }

    protected function tearDown(): void
    {
        (new Filesystem())->remove($this->documentsDirectory);
        parent::tearDown();
    }

    public function testALawyerOfTheCaseDownloadsTheDocument(): void
    {
        $ana = $this->data->lawyer('ana@jus.test', 'Ana Ribeiro');
        $document = $this->documentOf($this->data->legalCase('0000001', $ana), $ana, 'peticao.pdf');
        $this->client->loginUser($ana);

        $this->client->request('GET', $this->urlOf($document));

        self::assertResponseIsSuccessful();
        self::assertInstanceOf(BinaryFileResponse::class, $this->client->getResponse());
        self::assertResponseHeaderSame('Content-Type', 'application/pdf');
        self::assertResponseHeaderSame('Content-Disposition', 'attachment; filename=peticao.pdf');
        self::assertResponseHeaderSame('X-Content-Type-Options', 'nosniff');
        self::assertResponseHeaderSame('Content-Length', (string) filesize(self::SAMPLE));
        // A confidential PDF is kept by no cache at all: not a shared one, and not the browser's own either, which is
        // still there on a shared machine after the person has logged out.
        $cacheControl = $this->client->getResponse()->headers;
        self::assertTrue($cacheControl->hasCacheControlDirective('private'));
        self::assertTrue($cacheControl->hasCacheControlDirective('no-store'));
        self::assertFalse($cacheControl->hasCacheControlDirective('public'));
        self::assertSame(file_get_contents(self::SAMPLE), $this->client->getInternalResponse()->getContent());
    }

    public function testALawyerWhoDoesNotRepresentAPartyDownloadsFromAPublicCase(): void
    {
        $ana = $this->data->lawyer('ana@jus.test', 'Ana Ribeiro');
        $bruno = $this->data->lawyer('bruno@jus.test', 'Bruno Teixeira');
        $document = $this->documentOf($this->data->legalCase('0000001', $bruno), $bruno, 'peticao.pdf');
        $this->client->loginUser($ana);

        $this->client->request('GET', $this->urlOf($document));

        // Viewing is the only permission a download asks for: filing is another matter.
        self::assertResponseIsSuccessful();
        self::assertSame(file_get_contents(self::SAMPLE), $this->client->getInternalResponse()->getContent());
    }

    public function testTheClerkDownloadsFromAConfidentialCase(): void
    {
        $bruno = $this->data->lawyer('bruno@jus.test', 'Bruno Teixeira');
        $clerk = $this->data->clerk('servidor@jus.test', 'Carlos Servidor');
        $document = $this->documentOf($this->data->legalCase('0000001', $bruno, confidential: true), $bruno, 'sigilo.pdf');
        $this->client->loginUser($clerk);

        $this->client->request('GET', $this->urlOf($document));

        self::assertResponseIsSuccessful();
        self::assertResponseHeaderSame('Content-Disposition', 'attachment; filename=sigilo.pdf');
        self::assertSame(file_get_contents(self::SAMPLE), $this->client->getInternalResponse()->getContent());
    }

    public function testTheLawyerOfAPartyDownloadsFromAConfidentialCase(): void
    {
        $bruno = $this->data->lawyer('bruno@jus.test', 'Bruno Teixeira');
        $document = $this->documentOf($this->data->legalCase('0000001', $bruno, confidential: true), $bruno, 'sigilo.pdf');
        $this->client->loginUser($bruno);

        $this->client->request('GET', $this->urlOf($document));

        self::assertResponseIsSuccessful();
    }

    public function testADocumentOfAConfidentialCaseOfAnotherLawyerLooksLikeAnUnknownOne(): void
    {
        $this->boot(['debug' => false]);
        $ana = $this->data->lawyer('ana@jus.test', 'Ana Ribeiro');
        $bruno = $this->data->lawyer('bruno@jus.test', 'Bruno Teixeira');
        $document = $this->documentOf($this->data->legalCase('0000001', $bruno, confidential: true), $bruno, 'sigilo.pdf');
        $this->client->loginUser($ana);

        $unknown = $this->client->request('GET', '/documentos/'.($document->getId() + 1000));
        self::assertResponseStatusCodeSame(404);
        $unknownContent = trim($unknown->filter('main')->text());
        $unknownType = $this->client->getResponse()->headers->get('Content-Type');

        $crawler = $this->client->request('GET', $this->urlOf($document));

        // The same page as for an id that does not exist (not a 403, and nothing of the file): the response must not reveal it.
        self::assertResponseStatusCodeSame(404);
        self::assertSame('Página não encontrada', trim($crawler->filter('main h1')->text()));
        self::assertSame($unknownContent, trim($crawler->filter('main')->text()));
        self::assertSame($unknownType, $this->client->getResponse()->headers->get('Content-Type'));
        self::assertFalse($this->client->getResponse()->headers->has('Content-Disposition'));
        self::assertStringNotContainsString('Acesso negado', (string) $this->client->getResponse()->getContent());
    }

    public function testAMissingFileLooksLikeAnUnknownDocument(): void
    {
        $this->boot(['debug' => false]);
        $ana = $this->data->lawyer('ana@jus.test', 'Ana Ribeiro');
        $document = $this->documentOf($this->data->legalCase('0000001', $ana), $ana, 'peticao.pdf');
        $this->client->loginUser($ana);

        $unknown = $this->client->request('GET', '/documentos/'.($document->getId() + 1000));
        $unknownContent = trim($unknown->filter('main')->text());

        $this->storage->delete($document->getStoredFilename());
        $crawler = $this->client->request('GET', $this->urlOf($document));

        self::assertResponseStatusCodeSame(404);
        self::assertSame('Página não encontrada', trim($crawler->filter('main h1')->text()));
        self::assertSame($unknownContent, trim($crawler->filter('main')->text()));
        self::assertFalse($this->client->getResponse()->headers->has('Content-Disposition'));
    }

    public function testADocumentWhoseNameIsNotOneOfOursIsNotServed(): void
    {
        $ana = $this->data->lawyer('ana@jus.test', 'Ana Ribeiro');
        // The documents the fixtures build point at a stored name that is not one the storage generates, so it never
        // reaches the disk: the storage answers "no such file".
        $case = $this->data->legalCase('0000001', $ana);
        $document = $case->getDocuments()[0];
        $this->client->loginUser($ana);

        $this->client->request('GET', $this->urlOf($document));

        self::assertResponseStatusCodeSame(404);
    }

    #[DataProvider('provideIdsThatAreNotDocuments')]
    public function testAnIdThatIsNotADocumentIsNotFound(string $id): void
    {
        $this->boot(['debug' => false]);
        $ana = $this->data->lawyer('ana@jus.test', 'Ana Ribeiro');
        $this->documentOf($this->data->legalCase('0000001', $ana), $ana, 'peticao.pdf');
        $this->client->loginUser($ana);

        $crawler = $this->client->request('GET', '/documentos/'.$id);

        self::assertResponseStatusCodeSame(404);
        self::assertSame('Página não encontrada', trim($crawler->filter('main h1')->text()));
    }

    /**
     * @return iterable<string, array{string}>
     */
    public static function provideIdsThatAreNotDocuments(): iterable
    {
        yield 'text' => ['abc'];
        yield 'a decimal' => ['1.5'];
        yield 'negative' => ['-1'];
        yield 'with a suffix' => ['1abc'];
        yield 'encoded text' => ['%31%20OR%201=1'];
        yield 'leading zeros: one address per document' => ['0001'];
        yield 'zero' => ['0'];
        yield 'unknown' => ['999999'];
        yield 'above the largest integer' => ['99999999999999999999'];
        yield 'the largest integer' => ['9223372036854775807'];
    }

    public function testOnlyGetIsAllowed(): void
    {
        $this->boot(['debug' => false]);
        $ana = $this->data->lawyer('ana@jus.test', 'Ana Ribeiro');
        $document = $this->documentOf($this->data->legalCase('0000001', $ana), $ana, 'peticao.pdf');
        $this->client->loginUser($ana);

        $this->client->request('POST', $this->urlOf($document));

        self::assertResponseStatusCodeSame(405);
    }

    public function testHeadIsAnsweredLikeGetWithoutTheBody(): void
    {
        $ana = $this->data->lawyer('ana@jus.test', 'Ana Ribeiro');
        $document = $this->documentOf($this->data->legalCase('0000001', $ana), $ana, 'peticao.pdf');
        $this->client->loginUser($ana);

        // A route that allows GET allows HEAD too, which is how the framework treats it.
        $this->client->request('HEAD', $this->urlOf($document));

        self::assertResponseIsSuccessful();
        self::assertResponseHeaderSame('Content-Type', 'application/pdf');
        self::assertResponseHeaderSame('Content-Disposition', 'attachment; filename=peticao.pdf');
        self::assertTrue($this->client->getResponse()->headers->hasCacheControlDirective('no-store'));
        self::assertSame('', $this->client->getInternalResponse()->getContent());
    }

    public function testAnonymousVisitorsAreSentToTheLoginPage(): void
    {
        $ana = $this->data->lawyer('ana@jus.test', 'Ana Ribeiro');
        $document = $this->documentOf($this->data->legalCase('0000001', $ana), $ana, 'peticao.pdf');

        $this->client->request('GET', $this->urlOf($document));

        self::assertResponseRedirects('/login');
    }

    #[DataProvider('provideOriginalFilenames')]
    public function testTheDownloadKeepsTheOriginalNameWithAPdfExtension(string $original, string $disposition): void
    {
        $ana = $this->data->lawyer('ana@jus.test', 'Ana Ribeiro');
        $document = $this->documentOf($this->data->legalCase('0000001', $ana), $ana, $original);
        $this->client->loginUser($ana);

        $this->client->request('GET', $this->urlOf($document));

        self::assertResponseIsSuccessful();
        self::assertResponseHeaderSame('Content-Disposition', $disposition);
    }

    /**
     * @return iterable<string, array{string, string}>
     */
    public static function provideOriginalFilenames(): iterable
    {
        yield 'plain' => ['peticao.pdf', 'attachment; filename=peticao.pdf'];
        yield 'accents get an ASCII fallback and the real name' => [
            'Procuração.PDF',
            "attachment; filename=Procura__o.PDF; filename*=utf-8''Procura%C3%A7%C3%A3o.PDF",
        ];
        yield 'spaces' => ['razões do recurso.pdf', "attachment; filename=\"raz_es do recurso.pdf\"; filename*=utf-8''raz%C3%B5es%20do%20recurso.pdf"];
        yield 'a percent sign' => ['100%.pdf', "attachment; filename=100_.pdf; filename*=utf-8''100%25.pdf"];
        yield 'a quote' => ['o "mérito".pdf', "attachment; filename=\"o \\\"m_rito\\\".pdf\"; filename*=utf-8''o%20%22m%C3%A9rito%22.pdf"];
        yield 'without the extension' => ['contestacao', 'attachment; filename=contestacao.pdf'];
        yield 'another extension' => ['contestacao.docx', 'attachment; filename=contestacao.docx.pdf'];
        yield 'cut at 255 characters, extension gone' => [str_repeat('a', 255), 'attachment; filename='.str_repeat('a', 255).'.pdf'];
        yield 'path separators' => ['..\\..\\etc/passwd', 'attachment; filename=.._.._etc_passwd.pdf'];
        yield 'control characters' => ["a\r\nX-Injected: 1\0.pdf", 'attachment; filename="a__X-Injected: 1_.pdf"'];
        yield 'empty' => ['', 'attachment; filename=documento.pdf'];
        yield 'only the extension' => ['.pdf', 'attachment; filename=documento.pdf'];
        yield 'only the extension, capitals' => ['.PDF', 'attachment; filename=documento.pdf'];
        yield 'only the extension, with spaces' => ['  .Pdf  ', 'attachment; filename=documento.pdf'];
        yield 'only blanks' => ['   ', 'attachment; filename=documento.pdf'];
    }

    public function testTheDownloadUsesAFixedNumberOfQueries(): void
    {
        $ana = $this->data->lawyer('ana@jus.test', 'Ana Ribeiro');
        $bruno = $this->data->lawyer('bruno@jus.test', 'Bruno Teixeira');
        // A confidential case with a lawyer on each side: what the authorization looks at must come with the document.
        $case = $this->data->legalCase('0000001', $bruno, confidential: true);
        $case->getParties()[0]->addLawyer($ana);
        $case->getParties()[1]->addLawyer($bruno);
        $document = $this->documentOf($case, $bruno, 'peticao.pdf');
        $this->client->loginUser($ana);

        $this->em->clear();
        QueryRecorder::instance()->reset();
        $this->client->request('GET', $this->urlOf($document));

        // user refresh, the document with its event, its case, the parties and their lawyers
        self::assertResponseIsSuccessful();
        self::assertCount(2, QueryRecorder::instance()->selects(), implode(\PHP_EOL, QueryRecorder::instance()->selects()));
    }

    private function urlOf(Document $document): string
    {
        return '/documentos/'.$document->getId();
    }

    /**
     * A document of the case whose PDF is really on disk (the sample, stored under a generated name), as a filing leaves it.
     */
    private function documentOf(LegalCase $case, User $uploader, string $originalFilename): Document
    {
        $stored = $this->storage->store(new \SplFileInfo(self::SAMPLE));
        $uploadedAt = new \DateTimeImmutable('2024-03-30 09:01');
        $document = $case->record(EventType::Order, 'Despacho com anexo.', new \DateTimeImmutable('2024-03-30 09:00'))
            ->attach('Despacho', $originalFilename, $stored->name, $stored->sizeInBytes, $uploader, $uploadedAt);
        $this->em->flush();

        return $document;
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
        $this->storage = $container->get(DocumentStorage::class);
        // Read once, from the first (debug) kernel: a kernel without debug drops the parameters no service needs by name.
        $this->documentsDirectory ??= $container->getParameter('app.documents_dir');
        (new Filesystem())->remove($this->documentsDirectory);
    }
}
