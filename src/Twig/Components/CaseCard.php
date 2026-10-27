<?php

declare(strict_types=1);

namespace App\Twig\Components;

use App\Domain\LegalCase\PartySide;
use App\Entity\CaseEvent;
use App\Entity\LegalCase;
use App\Entity\Party;
use Symfony\UX\TwigComponent\Attribute\AsTwigComponent;

#[AsTwigComponent]
final class CaseCard
{
    public LegalCase $case;

    public ?string $href = null;

    /**
     * Every side of the case, plaintiffs first, with its parties (possibly none).
     *
     * @return list<array{side: PartySide, parties: list<Party>}>
     */
    public function sides(): array
    {
        return array_map(fn (PartySide $side): array => ['side' => $side, 'parties' => $this->partiesOn($side)], PartySide::cases());
    }

    public function lastEvent(): ?CaseEvent
    {
        return $this->case->getEvents()[0] ?? null;
    }

    /**
     * @return list<Party>
     */
    private function partiesOn(PartySide $side): array
    {
        return array_values(array_filter($this->case->getParties(), static fn (Party $party): bool => $side === $party->getSide()));
    }
}
