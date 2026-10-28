<?php

declare(strict_types=1);

namespace App\Twig\Components;

use App\Entity\CaseEvent;
use App\Entity\LegalCase;
use Symfony\UX\TwigComponent\Attribute\AsTwigComponent;

#[AsTwigComponent]
final class CaseCard
{
    public LegalCase $case;

    public ?string $href = null;

    /**
     * The newest event of the case when the caller already has it (the search page fetches those for a whole page at
     * once).
     */
    public ?CaseEvent $latestEvent = null;

    /**
     * True when the caller has already looked the latest event up, so a null $latestEvent means the case has none and
     * the card must not read the case's events to find out (that would be one query per case on a list).
     */
    public bool $latestEventKnown = false;

    public function lastEvent(): ?CaseEvent
    {
        if (null !== $this->latestEvent || $this->latestEventKnown) {
            return $this->latestEvent;
        }

        return $this->case->getEvents()[0] ?? null;
    }
}
