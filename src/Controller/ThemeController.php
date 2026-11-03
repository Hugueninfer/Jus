<?php

declare(strict_types=1);

namespace App\Controller;

use App\Presentation\ThemePreference;
use App\Presentation\ThemeResolver;
use Psr\Clock\ClockInterface;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\Cookie;
use Symfony\Component\HttpFoundation\RedirectResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\HttpKernel\Exception\AccessDeniedHttpException;
use Symfony\Component\Routing\Attribute\Route;

/**
 * Saves the theme the person chose in a cookie. Public, because the switcher is on every page, the sign-in one included.
 *
 * The token is a stateless one (`framework.csrf_protection.stateless_token_ids` lists `theme`): it needs no session, which
 * a visitor does not have, and the request is vouched for by the headers the browser sends (see config/packages/csrf.yaml).
 */
final class ThemeController extends AbstractController
{
    private const string TOKEN_ID = 'theme';

    #[Route('/tema', name: 'app_theme', methods: ['POST'])]
    public function __invoke(Request $request, ClockInterface $clock): Response
    {
        if (!$this->isCsrfTokenValid(self::TOKEN_ID, $this->field($request, '_token'))) {
            throw new AccessDeniedHttpException('Invalid CSRF token.');
        }

        // The script of the switcher asks for no page back: it has the one it is on.
        $fromScript = 'application/json' === ($request->getAcceptableContentTypes()[0] ?? null);
        $theme = ThemePreference::tryFrom($this->field($request, 'tema'));
        if (null === $theme) {
            return $fromScript ? new Response(null, Response::HTTP_BAD_REQUEST) : $this->back($request);
        }

        $response = $fromScript ? new Response(null, Response::HTTP_NO_CONTENT) : $this->back($request);
        $response->headers->setCookie(Cookie::create(
            ThemeResolver::COOKIE,
            $theme->value,
            $clock->now()->modify('+1 year'),
            '/',
            null,
            $request->isSecure(),
            true,
            false,
            Cookie::SAMESITE_LAX,
        ));

        return $response;
    }

    private function back(Request $request): RedirectResponse
    {
        return new RedirectResponse($this->safePath($this->field($request, 'voltar')), Response::HTTP_SEE_OTHER);
    }

    /**
     * Where to send the person back to: a path of this site, or the home page. Anything that a browser could read as another
     * site is refused: a second slash ("//host"), a backslash (read as a slash), and the control characters and spaces that a
     * browser drops from a URL before reading it ("/<tab>/host" becomes "//host").
     */
    private function safePath(string $path): string
    {
        return 1 === preg_match('~^/(?!/)[^\x00-\x20\x7f\\\\]*$~D', $path) ? $path : '/';
    }

    /**
     * A field of the form as text: absent, or sent as a list, it is empty.
     */
    private function field(Request $request, string $name): string
    {
        $value = $request->request->all()[$name] ?? null;

        return \is_string($value) ? $value : '';
    }
}
