<?php

declare(strict_types=1);

namespace App\Presentation;

use Symfony\Component\HttpFoundation\RequestStack;

/**
 * The theme the person chose, as the cookie of the request says. A missing cookie, or one with a value that no choice has
 * (an old value, one made up by hand), means the system theme: the page never fails because of this cookie.
 */
final readonly class ThemeResolver
{
    public const string COOKIE = 'jus_tema';

    public function __construct(private RequestStack $requests)
    {
    }

    public function current(): ThemePreference
    {
        // Through all(), not get(): PHP makes an array of "jus_tema[]=x", which get() refuses with an exception.
        $value = $this->requests->getMainRequest()?->cookies->all()[self::COOKIE] ?? null;

        return \is_string($value) ? (ThemePreference::tryFrom($value) ?? ThemePreference::System) : ThemePreference::System;
    }
}
