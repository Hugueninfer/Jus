<?php

declare(strict_types=1);

namespace App\Entity;

use App\Domain\LegalCase\EventType;
use App\Repository\DeadlineRepository;
use Doctrine\DBAL\Types\Types;
use Doctrine\ORM\Mapping as ORM;

/**
 * A procedural deadline opened by a summons. The due date is never stored: it is always calculated
 * with App\Domain\Deadline\DeadlineCalculator from the start date and the number of business days.
 */
#[ORM\Entity(repositoryClass: DeadlineRepository::class)]
class Deadline
{
    #[ORM\Id]
    #[ORM\GeneratedValue]
    #[ORM\Column]
    private ?int $id = null;

    #[ORM\Column(type: Types::DATE_IMMUTABLE)]
    private \DateTimeImmutable $startDate;

    #[ORM\Column(nullable: true)]
    private ?\DateTimeImmutable $fulfilledAt = null;

    public function __construct(
        #[ORM\ManyToOne]
        #[ORM\JoinColumn(nullable: false)]
        private Party $party,
        #[ORM\ManyToOne]
        #[ORM\JoinColumn(nullable: false)]
        private CaseEvent $summons,
        #[ORM\Column(type: Types::SMALLINT)]
        private int $businessDays,
    ) {
        if (EventType::Summons !== $summons->getType()) {
            throw new \InvalidArgumentException('A deadline starts from a summons.');
        }

        if ($summons->getLegalCase() !== $party->getLegalCase()) {
            throw new \InvalidArgumentException('The party and the summons belong to different cases.');
        }

        if ($businessDays < 1) {
            throw new \InvalidArgumentException(\sprintf('A deadline needs at least one business day, %d given.', $businessDays));
        }

        $this->startDate = $summons->getOccurredAt()->setTime(0, 0);
    }

    public function fulfil(\DateTimeImmutable $at): void
    {
        $this->fulfilledAt ??= $at;
    }

    public function isFulfilled(): bool
    {
        return null !== $this->fulfilledAt;
    }

    public function getId(): ?int
    {
        return $this->id;
    }

    public function getParty(): Party
    {
        return $this->party;
    }

    public function getSummons(): CaseEvent
    {
        return $this->summons;
    }

    public function getStartDate(): \DateTimeImmutable
    {
        return $this->startDate;
    }

    public function getBusinessDays(): int
    {
        return $this->businessDays;
    }

    public function getFulfilledAt(): ?\DateTimeImmutable
    {
        return $this->fulfilledAt;
    }
}
