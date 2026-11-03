<?php

declare(strict_types=1);

namespace App\Tests\Functional;

use App\Entity\User;
use App\Presentation\ThemeResolver;
use App\Tests\Support\QueryRecorder;
use Doctrine\ORM\EntityManagerInterface;
use PHPUnit\Framework\Attributes\DataProvider;
use Symfony\Bundle\FrameworkBundle\KernelBrowser;
use Symfony\Bundle\FrameworkBundle\Test\WebTestCase;
use Symfony\Component\BrowserKit\Cookie as ClientCookie;
use Symfony\Component\DomCrawler\Crawler;
use Symfony\Component\HttpFoundation\Cookie;
use Twig\Environment;

final class ThemeTest extends WebTestCase
{
    private KernelBrowser $client;

    protected function setUp(): void
    {
        // Not in debug: the error pages are the templates of the application, not the page of the debugger.
        $this->client = self::createClient(['debug' => false]);
    }

    /**
     * @return iterable<string, array{string}>
     */
    public static function provideThemes(): iterable
    {
        yield 'system' => ['sistema'];
        yield 'light' => ['claro'];
        yield 'dark' => ['escuro'];
    }

    #[DataProvider('provideThemes')]
    public function testAVisitorSavesTheThemeWithTheSwitcherAndComesBackToThePage(string $theme): void
    {
        $page = $this->client->request('GET', '/design-system');
        $form = $page->filter(\sprintf('form[data-jus-theme-switcher] button[value="%s"]', $theme))->form();
        $before = time();

        $this->client->submit($form);

        // The browser sends the Referer of the page on its own, which is what the token is checked against.
        self::assertResponseRedirects('/design-system', 303);
        $cookie = $this->themeCookie();
        self::assertInstanceOf(Cookie::class, $cookie);
        self::assertSame($theme, $cookie->getValue());
        self::assertTrue($cookie->isHttpOnly());
        self::assertSame(Cookie::SAMESITE_LAX, $cookie->getSameSite());
        self::assertSame('/', $cookie->getPath());
        self::assertNull($cookie->getDomain());
        self::assertFalse($cookie->isSecure(), 'Over plain HTTP the cookie cannot be Secure, or the browser would drop it.');
        // A year: a leap year makes it 365 or 366 days, so compare with what the calendar says.
        self::assertGreaterThanOrEqual(strtotime('+1 year', $before), $cookie->getExpiresTime());
        self::assertLessThanOrEqual(strtotime('+1 year') + 1, $cookie->getExpiresTime());
    }

    public function testTheChosenThemeStaysForTheNextPages(): void
    {
        $page = $this->client->request('GET', '/design-system');
        $this->client->submit($page->filter('button[value="escuro"]')->form());

        $crawler = $this->client->request('GET', '/design-system');

        self::assertSame('dark', $crawler->filter('html')->attr('data-bs-theme'));
        self::assertSame('escuro', $crawler->filter('html')->attr('data-jus-tema'));
    }

    public function testTheCookieIsSecureOverHttps(): void
    {
        $this->post(['tema' => 'escuro'], ['HTTPS' => 'on', 'HTTP_ORIGIN' => 'https://localhost']);

        self::assertResponseStatusCodeSame(303);
        $cookie = $this->themeCookie();
        self::assertInstanceOf(Cookie::class, $cookie);
        self::assertTrue($cookie->isSecure());
        self::assertTrue($cookie->isHttpOnly());
        self::assertSame(Cookie::SAMESITE_LAX, $cookie->getSameSite());
    }

    public function testASignedInUserSavesTheThemeToo(): void
    {
        $user = User::clerk('joao@jus.test', 'João Almeida');
        $em = self::getContainer()->get(EntityManagerInterface::class);
        $em->persist($user);
        $em->flush();
        $this->client->loginUser($user);

        $this->post(['tema' => 'claro', 'voltar' => '/processos?pagina=2']);

        self::assertResponseRedirects('/processos?pagina=2', 303);
        self::assertSame('claro', $this->themeCookie()?->getValue());
    }

    public function testTheRouteAcceptsOnlyPost(): void
    {
        $this->client->request('GET', '/tema');

        self::assertResponseStatusCodeSame(405);
    }

    public function testChoosingAThemeAsksForNeitherASessionNorTheDatabase(): void
    {
        $this->client->request('GET', '/design-system');
        self::assertSame([], $this->client->getResponse()->headers->getCookies(), 'Showing the switcher must not open a session for a visitor.');
        $token = $this->token();

        QueryRecorder::instance()->reset();
        $this->post(['tema' => 'escuro', '_token' => $token]);

        self::assertResponseStatusCodeSame(303);
        self::assertSame([], QueryRecorder::instance()->selects());
        $names = array_map(static fn (Cookie $cookie): string => $cookie->getName(), $this->client->getResponse()->headers->getCookies());
        self::assertSame([ThemeResolver::COOKIE], $names);
    }

    /**
     * @return iterable<string, array{string|null}>
     */
    public static function provideUnsafeReturnPaths(): iterable
    {
        yield 'another host, without a scheme' => ['//evil.test'];
        yield 'another host, with a path' => ['//evil.test/processos'];
        yield 'an absolute URL' => ['https://evil.test/processos'];
        yield 'a script URL' => ['javascript:alert(1)'];
        yield 'a backslash that a browser reads as a slash' => ['\\evil.test'];
        yield 'a slash and a backslash' => ['/\\evil.test'];
        yield 'a tab, which a browser drops from the URL' => ["/\t/evil.test"];
        yield 'a line break' => ["/\n/evil.test"];
        yield 'a space' => ['/ /evil.test'];
        yield 'a relative path' => ['processos'];
        yield 'an empty path' => [''];
        yield 'nothing' => [null];
    }

    #[DataProvider('provideUnsafeReturnPaths')]
    public function testItNeverSendsTheVisitorAnywhereButTheirOwnSite(?string $back): void
    {
        $fields = ['tema' => 'escuro'] + (null === $back ? [] : ['voltar' => $back]);

        $this->post($fields);

        self::assertResponseRedirects('/', 303);
        self::assertSame('escuro', $this->themeCookie()?->getValue(), 'The theme is saved all the same.');
    }

    /**
     * @return iterable<string, array{string}>
     */
    public static function provideSafeReturnPaths(): iterable
    {
        yield 'the home page' => ['/'];
        yield 'a page' => ['/processos'];
        yield 'a page with a query' => ['/processos?q=maria&pagina=2'];
        yield 'a page with accents, as the browser sends them' => ['/processos?q=jos%C3%A9'];
        yield 'a page with a fragment' => ['/design-system#alert'];
    }

    #[DataProvider('provideSafeReturnPaths')]
    public function testItSendsTheVisitorBackToTheirPage(string $back): void
    {
        $this->post(['tema' => 'claro', 'voltar' => $back]);

        self::assertResponseRedirects($back, 303);
    }

    public function testAnUnknownThemeChangesNothing(): void
    {
        $this->client->getCookieJar()->set(new ClientCookie(ThemeResolver::COOKIE, 'escuro'));

        $this->post(['tema' => 'roxo', 'voltar' => '/design-system']);

        self::assertResponseRedirects('/design-system', 303);
        self::assertNull($this->themeCookie(), 'The cookie is not touched.');
        $crawler = $this->client->request('GET', '/design-system');
        self::assertSame('dark', $crawler->filter('html')->attr('data-bs-theme'));
    }

    /**
     * @return iterable<string, array{array<string, mixed>}>
     */
    public static function provideMalformedThemes(): iterable
    {
        yield 'no field' => [[]];
        yield 'an empty field' => [['tema' => '']];
        yield 'a name that is not a value' => [['tema' => 'Dark']];
        yield 'a list' => [['tema' => ['escuro']]];
    }

    /**
     * @param array<string, mixed> $fields
     */
    #[DataProvider('provideMalformedThemes')]
    public function testAMalformedThemeChangesNothingEither(array $fields): void
    {
        $this->post($fields + ['voltar' => '/design-system']);

        self::assertResponseRedirects('/design-system', 303);
        self::assertNull($this->themeCookie());
    }

    /**
     * @return iterable<string, array{array<string, mixed>, array<string, string|null>}>
     */
    public static function provideRequestsTheServerDoesNotTrust(): iterable
    {
        yield 'a wrong token' => [['_token' => 'outro-valor'], []];
        yield 'an empty token' => [['_token' => ''], []];
        yield 'no token' => [['_token' => null], []];
        yield 'a token in a list' => [['_token' => ['csrf-token']], []];
        // A form on another site carries the right token (it is the same for everyone): the browser tells where it comes from.
        yield 'a page of another site (Origin)' => [[], ['HTTP_ORIGIN' => 'https://evil.test']];
        yield 'a page of another site (Referer)' => [[], ['HTTP_ORIGIN' => null, 'HTTP_REFERER' => 'https://evil.test/pagina']];
        yield 'a site with the same start of name' => [[], ['HTTP_ORIGIN' => 'http://localhost.evil.test']];
        yield 'another site, said by Sec-Fetch-Site' => [[], ['HTTP_SEC_FETCH_SITE' => 'cross-site']];
        yield 'a request that says nothing about where it comes from' => [[], ['HTTP_ORIGIN' => null]];
    }

    /**
     * @param array<string, mixed>       $fields
     * @param array<string, string|null> $server
     */
    #[DataProvider('provideRequestsTheServerDoesNotTrust')]
    public function testItRefusesARequestWithoutAValidToken(array $fields, array $server): void
    {
        $this->post(['tema' => 'escuro'] + $fields, $server);

        self::assertResponseStatusCodeSame(403);
        self::assertNull($this->themeCookie());
    }

    public function testTheBrowserMayVouchForTheRequestWithSecFetchSite(): void
    {
        $this->post(['tema' => 'escuro'], ['HTTP_ORIGIN' => null, 'HTTP_SEC_FETCH_SITE' => 'same-origin']);

        self::assertResponseStatusCodeSame(303);
        self::assertSame('escuro', $this->themeCookie()?->getValue());
    }

    public function testTheRefererVouchesForTheRequestWhenThereIsNoOrigin(): void
    {
        $this->post(['tema' => 'escuro'], ['HTTP_ORIGIN' => null, 'HTTP_REFERER' => 'http://localhost/processos?q=1']);

        self::assertResponseStatusCodeSame(303);
        self::assertSame('escuro', $this->themeCookie()?->getValue());
    }

    public function testAScriptGetsNoContentInsteadOfARedirect(): void
    {
        $this->post(['tema' => 'escuro', 'voltar' => '/design-system'], ['HTTP_ACCEPT' => 'application/json']);

        self::assertResponseStatusCodeSame(204);
        self::assertSame('', $this->client->getResponse()->getContent());
        self::assertFalse($this->client->getResponse()->headers->has('Location'));
        self::assertSame('escuro', $this->themeCookie()?->getValue());
    }

    public function testAScriptIsToldWhenTheThemeIsNotOneWeKnow(): void
    {
        $this->post(['tema' => 'roxo'], ['HTTP_ACCEPT' => 'application/json']);

        self::assertResponseStatusCodeSame(400);
        self::assertNull($this->themeCookie());
    }

    public function testAScriptIsRefusedWithoutAValidTokenToo(): void
    {
        $this->post(['tema' => 'escuro', '_token' => 'x'], ['HTTP_ACCEPT' => 'application/json']);

        self::assertResponseStatusCodeSame(403);
        self::assertNull($this->themeCookie());
    }

    public function testABrowserThatAcceptsAnythingGetsTheRedirect(): void
    {
        $this->post(['tema' => 'escuro'], ['HTTP_ACCEPT' => 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8']);

        self::assertResponseStatusCodeSame(303);
    }

    /**
     * @return iterable<string, array{string|null, string, string}>
     */
    public static function provideCookies(): iterable
    {
        yield 'no cookie' => [null, 'light', 'sistema'];
        yield 'system' => ['sistema', 'light', 'sistema'];
        yield 'light' => ['claro', 'light', 'claro'];
        yield 'dark' => ['escuro', 'dark', 'escuro'];
        yield 'a value nobody saved' => ['roxo', 'light', 'sistema'];
    }

    #[DataProvider('provideCookies')]
    public function testThePageComesInTheChosenTheme(?string $cookie, string $bootstrapTheme, string $theme): void
    {
        if (null !== $cookie) {
            $this->client->getCookieJar()->set(new ClientCookie(ThemeResolver::COOKIE, $cookie));
        }

        $crawler = $this->client->request('GET', '/login');

        self::assertSame($bootstrapTheme, $crawler->filter('html')->attr('data-bs-theme'));
        self::assertSame($theme, $crawler->filter('html')->attr('data-jus-tema'));
        self::assertSame('pt-BR', $crawler->filter('html')->attr('lang'));
    }

    public function testEveryPageCarriesTheThemeErrorPagesIncluded(): void
    {
        $this->client->getCookieJar()->set(new ClientCookie(ThemeResolver::COOKIE, 'escuro'));

        $crawler = $this->client->request('GET', '/nao-existe');

        self::assertResponseStatusCodeSame(404);
        self::assertSame('dark', $crawler->filter('html')->attr('data-bs-theme'));
        self::assertCount(1, $crawler->filter('form[data-jus-theme-switcher]'));
    }

    /**
     * @return iterable<string, array{string|null}>
     */
    public static function provideCookieValues(): iterable
    {
        yield 'no cookie' => [null];
        yield 'system' => ['sistema'];
        yield 'dark' => ['escuro'];
    }

    public function testAnErrorPageSendsThePersonHomeAndDoesNotEchoTheAddressThatFailed(): void
    {
        $crawler = $this->client->request('GET', '/nao-existe?q=segredo');

        self::assertResponseStatusCodeSame(404);
        self::assertSame('/', $crawler->filter('form[data-jus-theme-switcher] input[name="voltar"]')->attr('value'));
        self::assertStringNotContainsString('nao-existe', (string) $this->client->getResponse()->getContent());
        self::assertStringNotContainsString('segredo', (string) $this->client->getResponse()->getContent());
    }

    public function testTheSwitcherRendersWithoutARequestToo(): void
    {
        // The page of last resort, for a failure before the request is routed, is rendered with no request at hand.
        $html = self::getContainer()->get(Environment::class)->render('_theme_switcher.html.twig');

        self::assertStringContainsString('name="voltar" value="/"', $html);
        self::assertStringContainsString('name="tema" value="sistema" aria-pressed="true"', $html);
    }

    #[DataProvider('provideCookieValues')]
    public function testTheScriptThatFollowsTheSystemIsInTheHeadBeforeTheStyles(?string $cookie): void
    {
        if (null !== $cookie) {
            $this->client->getCookieJar()->set(new ClientCookie(ThemeResolver::COOKIE, $cookie));
        }

        $this->client->request('GET', '/login');

        $content = (string) $this->client->getResponse()->getContent();
        $head = substr($content, 0, (int) strpos($content, '</head>'));
        // Always there: it acts only while the page says "sistema", and reads that from the attribute, not from the cookie.
        self::assertSame(1, preg_match_all('#<script>\(\(\) => \{ const root = document\.documentElement;[^<]*</script>#', $head, $scripts, \PREG_OFFSET_CAPTURE));
        $script = $scripts[0][0][0];
        self::assertStringContainsString("matchMedia('(prefers-color-scheme: dark)')", $script);
        self::assertStringContainsString("root.dataset.jusTema === 'sistema'", $script);
        self::assertStringContainsString("root.dataset.bsTheme = query.matches ? 'dark' : 'light'", $script);
        self::assertStringContainsString("query.addEventListener('change', apply)", $script);
        self::assertStringNotContainsString('cookie', strtolower($script), 'The script reads the attribute of the page and never the cookie.');
        // Before the first <link> of the head (the icon, then the styles), so the first paint is already in the right theme.
        self::assertLessThan((int) strpos($head, '<link'), $scripts[0][0][1]);
    }

    public function testTheSwitcherIsOneFormInTheMenuForAVisitor(): void
    {
        $crawler = $this->client->request('GET', '/design-system?x=1');

        $forms = $crawler->filter('form[data-jus-theme-switcher]');
        self::assertCount(1, $forms, 'One switcher serves the navbar from md up and the off-canvas menu on a phone.');
        self::assertCount(1, $crawler->filter('header nav #menu-principal ul.navbar-nav form[data-jus-theme-switcher]'));
        self::assertSame('post', $forms->attr('method'));
        self::assertSame('/tema', $forms->attr('action'));
        self::assertNotSame('', (string) $forms->filter('input[name="_token"]')->attr('value'));
        self::assertSame('/design-system?x=1', $forms->filter('input[name="voltar"]')->attr('value'));
        self::assertSame('Tema', $forms->filter('[role="group"]')->attr('aria-label'));
        $status = $forms->filter('p[data-jus-theme-status][aria-live="polite"]');
        self::assertCount(1, $status);
        self::assertSame('', trim($status->text()));
        self::assertStringContainsString('visually-hidden', (string) $status->attr('class'));
    }

    public function testTheSwitcherIsOneFormInTheMenuForASignedInUser(): void
    {
        $user = User::clerk('joao@jus.test', 'João Almeida');
        $em = self::getContainer()->get(EntityManagerInterface::class);
        $em->persist($user);
        $em->flush();
        $this->client->loginUser($user);

        $crawler = $this->client->request('GET', '/processos?q=maria');

        self::assertCount(1, $crawler->filter('form[data-jus-theme-switcher]'));
        self::assertSame('/processos?q=maria', $crawler->filter('form[data-jus-theme-switcher] input[name="voltar"]')->attr('value'));
    }

    public function testTheSwitcherOffersThreeButtonsNamedAfterTheirTheme(): void
    {
        $crawler = $this->client->request('GET', '/login');

        $buttons = $crawler->filter('form[data-jus-theme-switcher] button');
        self::assertCount(3, $buttons);
        $offered = $buttons->each(static fn (Crawler $button): array => [
            $button->attr('type'),
            $button->attr('name'),
            $button->attr('value'),
            trim($button->text()),
            $button->filter('i.bi')->attr('class'),
            $button->filter('i.bi')->attr('aria-hidden'),
            $button->attr('data-jus-theme-announcement'),
        ]);
        self::assertSame([
            ['submit', 'tema', 'sistema', 'Tema: Sistema', 'bi bi-circle-half', 'true', 'Tema do sistema aplicado.'],
            ['submit', 'tema', 'claro', 'Tema: Claro', 'bi bi-sun', 'true', 'Tema claro aplicado.'],
            ['submit', 'tema', 'escuro', 'Tema: Escuro', 'bi bi-moon-stars', 'true', 'Tema escuro aplicado.'],
        ], $offered);
        // The word is on show on wide screens only; on narrow ones the icon stands for it and the text stays for screen readers.
        self::assertCount(3, $buttons->filter('.jus-theme-switcher-label'));
    }

    /**
     * @return iterable<string, array{string|null, string}>
     */
    public static function provideCurrentButtons(): iterable
    {
        yield 'no cookie' => [null, 'sistema'];
        yield 'system' => ['sistema', 'sistema'];
        yield 'light' => ['claro', 'claro'];
        yield 'dark' => ['escuro', 'escuro'];
        yield 'a value nobody saved' => ['roxo', 'sistema'];
    }

    #[DataProvider('provideCurrentButtons')]
    public function testTheSwitcherMarksTheCurrentTheme(?string $cookie, string $pressed): void
    {
        if (null !== $cookie) {
            $this->client->getCookieJar()->set(new ClientCookie(ThemeResolver::COOKIE, $cookie));
        }

        $crawler = $this->client->request('GET', '/login');

        $states = $crawler->filter('form[data-jus-theme-switcher] button')->each(static fn (Crawler $button): array => [$button->attr('value'), $button->attr('aria-pressed')]);
        $expected = array_map(static fn (string $theme): array => [$theme, $theme === $pressed ? 'true' : 'false'], ['sistema', 'claro', 'escuro']);
        self::assertSame($expected, $states);
    }

    /**
     * Posts to the route as a browser on this site would: the token the page gives, and the Origin of the site. A field
     * or a header the test names replaces the default one, and a header named as null is left out.
     *
     * @param array<string, mixed>       $fields
     * @param array<string, string|null> $server
     */
    private function post(array $fields, array $server = []): void
    {
        if (!\array_key_exists('_token', $fields)) {
            $fields['_token'] = $this->token();
        }
        $headers = array_filter($server + ['HTTP_ORIGIN' => 'http://localhost'], static fn (?string $value): bool => null !== $value);

        $this->client->request('POST', '/tema', $fields, [], $headers);
    }

    /**
     * The token of the switcher, as the page gives it. The visit is forgotten afterwards: the next request then comes
     * with no Referer, as one made from nowhere in particular, and says what a test asks it to.
     */
    private function token(): string
    {
        $page = $this->client->request('GET', '/design-system');
        $this->client->getHistory()->clear();

        return (string) $page->filter('form[data-jus-theme-switcher] input[name="_token"]')->attr('value');
    }

    private function themeCookie(): ?Cookie
    {
        foreach ($this->client->getResponse()->headers->getCookies() as $cookie) {
            if (ThemeResolver::COOKIE === $cookie->getName()) {
                return $cookie;
            }
        }

        return null;
    }
}
