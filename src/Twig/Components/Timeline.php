<?php

declare(strict_types=1);

namespace App\Twig\Components;

use App\Entity\CaseEvent;
use Symfony\UX\TwigComponent\Attribute\AsTwigComponent;

#[AsTwigComponent]
final class Timeline
{
    /** @var list<CaseEvent> */
    public array $events = [];

    public string $emptyMessage = 'Nenhuma movimentação.';

    /**
     * Events grouped by calendar day (Y-m-d), newest day and newest event first.
     *
     * @return array<string, list<CaseEvent>>
     */
    public function days(): array
    {
        $events = $this->events;
        usort($events, static fn (CaseEvent $a, CaseEvent $b): int => $b->getOccurredAt() <=> $a->getOccurredAt());

        $days = [];
        foreach ($events as $event) {
            $days[$event->getOccurredAt()->format('Y-m-d')][] = $event;
        }

        return $days;
    }
}
