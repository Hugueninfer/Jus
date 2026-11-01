<?php

declare(strict_types=1);

namespace App\EventListener;

use Symfony\Component\EventDispatcher\Attribute\AsEventListener;
use Symfony\Component\HttpKernel\Event\ResponseEvent;
use Symfony\Component\HttpKernel\KernelEvents;

/**
 * The headers every response of the application carries, whatever the controller did: it may not be sniffed into another
 * type (`X-Content-Type-Options`), it sends the referrer to its own origin only (`Referrer-Policy`), and no other site may
 * frame it (`X-Frame-Options` for the old browsers and the `frame-ancestors` directive for the current ones).
 *
 * The policy has that one directive and nothing about scripts or styles: a full Content-Security-Policy is a decision of
 * its own (the pages and the build would have to be written for it), and this one must never break a page.
 *
 * A header the response already has is left as it is. The download sets its own `X-Content-Type-Options`, for example,
 * and a controller that needs a frame (a preview of a PDF, say) can say so with its own `X-Frame-Options`.
 */
final class SecurityHeadersListener
{
    private const array HEADERS = [
        'X-Content-Type-Options' => 'nosniff',
        'Referrer-Policy' => 'same-origin',
        'X-Frame-Options' => 'DENY',
        'Content-Security-Policy' => "frame-ancestors 'none'",
    ];

    #[AsEventListener(event: KernelEvents::RESPONSE)]
    public function __invoke(ResponseEvent $event): void
    {
        // A sub-request's response ends up inside another one, which is the one that goes out.
        if (!$event->isMainRequest()) {
            return;
        }

        $headers = $event->getResponse()->headers;
        foreach (self::HEADERS as $name => $value) {
            if (!$headers->has($name)) {
                $headers->set($name, $value);
            }
        }
    }
}
