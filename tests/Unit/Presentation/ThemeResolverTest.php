<?php

declare(strict_types=1);

namespace App\Tests\Unit\Presentation;

use App\Presentation\ThemePreference;
use App\Presentation\ThemeResolver;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\RequestStack;

final class ThemeResolverTest extends TestCase
{
    /**
     * @return iterable<string, array{mixed, ThemePreference}>
     */
    public static function provideCookies(): iterable
    {
        yield 'system' => ['sistema', ThemePreference::System];
        yield 'light' => ['claro', ThemePreference::Light];
        yield 'dark' => ['escuro', ThemePreference::Dark];
        yield 'an unknown name' => ['roxo', ThemePreference::System];
        yield 'the name of a case instead of its value' => ['Dark', ThemePreference::System];
        yield 'a known value in another case' => ['ESCURO', ThemePreference::System];
        yield 'an empty value' => ['', ThemePreference::System];
        // PHP turns "jus_tema[]=escuro" into an array: not something the browser got from this application.
        yield 'an array' => [['escuro'], ThemePreference::System];
    }

    #[DataProvider('provideCookies')]
    public function testReadsThePreferenceFromTheCookie(mixed $cookie, ThemePreference $expected): void
    {
        $resolver = $this->resolverFor(Request::create('/', cookies: [ThemeResolver::COOKIE => $cookie]));

        self::assertSame($expected, $resolver->current());
    }

    public function testTheSystemThemeIsTheDefaultWithoutTheCookie(): void
    {
        $resolver = $this->resolverFor(Request::create('/', cookies: ['PHPSESSID' => 'abc']));

        self::assertSame(ThemePreference::System, $resolver->current());
    }

    public function testTheSystemThemeIsTheDefaultOutsideARequest(): void
    {
        self::assertSame(ThemePreference::System, new ThemeResolver(new RequestStack())->current());
    }

    public function testReadsTheCookieOfTheMainRequest(): void
    {
        $requests = new RequestStack();
        $requests->push(Request::create('/', cookies: [ThemeResolver::COOKIE => 'escuro']));
        $requests->push(Request::create('/_error'));

        self::assertSame(ThemePreference::Dark, new ThemeResolver($requests)->current());
    }

    private function resolverFor(Request $request): ThemeResolver
    {
        $requests = new RequestStack();
        $requests->push($request);

        return new ThemeResolver($requests);
    }
}
