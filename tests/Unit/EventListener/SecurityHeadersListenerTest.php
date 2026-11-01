<?php

declare(strict_types=1);

namespace App\Tests\Unit\EventListener;

use App\EventListener\SecurityHeadersListener;
use PHPUnit\Framework\TestCase;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\HttpKernel\Event\ResponseEvent;
use Symfony\Component\HttpKernel\HttpKernelInterface;

final class SecurityHeadersListenerTest extends TestCase
{
    public function testItAddsTheBaselineHeaders(): void
    {
        $response = $this->respond(new Response('<p>Olá</p>'));

        self::assertSame('nosniff', $response->headers->get('X-Content-Type-Options'));
        self::assertSame('same-origin', $response->headers->get('Referrer-Policy'));
        self::assertSame('DENY', $response->headers->get('X-Frame-Options'));
        self::assertSame("frame-ancestors 'none'", $response->headers->get('Content-Security-Policy'));
    }

    public function testItSendsNoScriptOrStyleRules(): void
    {
        // Only the framing rule: a Content-Security-Policy with a script or style source would break the pages.
        $policy = (string) $this->respond(new Response())->headers->get('Content-Security-Policy');

        self::assertSame(["frame-ancestors 'none'"], array_map('trim', explode(';', $policy)));
    }

    public function testItKeepsWhatTheResponseAlreadySet(): void
    {
        $response = new Response();
        $response->headers->set('X-Content-Type-Options', 'nosniff, custom');
        $response->headers->set('Referrer-Policy', 'no-referrer');
        $response->headers->set('X-Frame-Options', 'SAMEORIGIN');
        $response->headers->set('Content-Security-Policy', "default-src 'self'");

        $headers = $this->respond($response)->headers;

        self::assertSame('nosniff, custom', $headers->get('X-Content-Type-Options'));
        self::assertSame('no-referrer', $headers->get('Referrer-Policy'));
        self::assertSame('SAMEORIGIN', $headers->get('X-Frame-Options'));
        self::assertSame("default-src 'self'", $headers->get('Content-Security-Policy'));
    }

    public function testItFillsOnlyTheHeadersThatAreMissing(): void
    {
        $response = new Response();
        $response->headers->set('x-frame-options', 'SAMEORIGIN');

        $headers = $this->respond($response)->headers;

        // The name is matched without regard to case, and the others still come.
        self::assertSame('SAMEORIGIN', $headers->get('X-Frame-Options'));
        self::assertSame(['SAMEORIGIN'], $headers->all('x-frame-options'));
        self::assertSame('nosniff', $headers->get('X-Content-Type-Options'));
        self::assertSame('same-origin', $headers->get('Referrer-Policy'));
        self::assertSame("frame-ancestors 'none'", $headers->get('Content-Security-Policy'));
    }

    public function testItLeavesTheResponseOfASubRequestAlone(): void
    {
        $response = $this->respond(new Response(), HttpKernelInterface::SUB_REQUEST);

        self::assertFalse($response->headers->has('X-Content-Type-Options'));
        self::assertFalse($response->headers->has('Referrer-Policy'));
        self::assertFalse($response->headers->has('X-Frame-Options'));
        self::assertFalse($response->headers->has('Content-Security-Policy'));
    }

    private function respond(Response $response, int $type = HttpKernelInterface::MAIN_REQUEST): Response
    {
        $kernel = $this->createStub(HttpKernelInterface::class);

        (new SecurityHeadersListener())(new ResponseEvent($kernel, new Request(), $type, $response));

        return $response;
    }
}
