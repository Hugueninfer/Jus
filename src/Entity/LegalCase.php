<?php

declare(strict_types=1);

namespace App\Entity;

use App\Doctrine\Type\CnjNumberDoctrineType;
use App\Domain\CnjNumber;
use App\Domain\LegalCase\CaseStatus;
use App\Domain\LegalCase\EventType;
use App\Domain\LegalCase\FilingType;
use App\Domain\LegalCase\PartySide;
use App\Repository\LegalCaseRepository;
use Doctrine\Common\Collections\ArrayCollection;
use Doctrine\Common\Collections\Collection;
use Doctrine\ORM\Mapping as ORM;

#[ORM\Entity(repositoryClass: LegalCaseRepository::class)]
class LegalCase
{
    #[ORM\Id]
    #[ORM\GeneratedValue]
    #[ORM\Column]
    private ?int $id = null;

    /** @var Collection<int, Party> */
    #[ORM\OneToMany(targetEntity: Party::class, mappedBy: 'legalCase', cascade: ['persist'], orphanRemoval: true)]
    private Collection $parties;

    /** @var Collection<int, CaseEvent> */
    #[ORM\OneToMany(targetEntity: CaseEvent::class, mappedBy: 'legalCase', cascade: ['persist'], orphanRemoval: true)]
    private Collection $events;

    public function __construct(
        #[ORM\Column(type: CnjNumberDoctrineType::NAME, length: 20, unique: true)]
        private CnjNumber $number,
        #[ORM\Column(length: 120)]
        private string $caseClass,
        #[ORM\Column(length: 255)]
        private string $subject,
        #[ORM\Column(length: 120)]
        private string $court,
        #[ORM\Column(length: 20, enumType: CaseStatus::class)]
        private CaseStatus $status,
        #[ORM\Column]
        private bool $confidential,
        #[ORM\Column]
        private int $claimValueInCents,
        #[ORM\Column]
        private \DateTimeImmutable $filedAt,
    ) {
        $this->parties = new ArrayCollection();
        $this->events = new ArrayCollection();
    }

    public function addParty(string $name, string $taxId, PartySide $side): Party
    {
        $party = new Party($this, $name, $taxId, $side);
        $this->parties->add($party);

        return $party;
    }

    /**
     * Records an event of the case. Filings go through file().
     */
    public function record(EventType $type, string $description, \DateTimeImmutable $occurredAt, ?User $createdBy = null): CaseEvent
    {
        $event = new CaseEvent($this, $type, $description, $occurredAt, $createdBy);
        $this->events->add($event);

        return $event;
    }

    /**
     * Records a filing made by a lawyer on behalf of a party they represent.
     */
    public function file(FilingType $filingType, string $description, \DateTimeImmutable $filedAt, User $lawyer): CaseEvent
    {
        if (!$this->isRepresentedBy($lawyer)) {
            throw new \InvalidArgumentException(\sprintf('"%s" does not represent any party in case %s.', $lawyer->getEmail(), $this->number->formatted()));
        }

        $event = new CaseEvent($this, EventType::Filing, $description, $filedAt, $lawyer, $filingType);
        $this->events->add($event);

        return $event;
    }

    public function isRepresentedBy(User $user): bool
    {
        return $this->parties->exists(static fn (int $key, Party $party): bool => $party->isRepresentedBy($user));
    }

    public function getId(): ?int
    {
        return $this->id;
    }

    public function getNumber(): CnjNumber
    {
        return $this->number;
    }

    public function getCaseClass(): string
    {
        return $this->caseClass;
    }

    public function getSubject(): string
    {
        return $this->subject;
    }

    public function getCourt(): string
    {
        return $this->court;
    }

    public function getStatus(): CaseStatus
    {
        return $this->status;
    }

    public function isArchived(): bool
    {
        return CaseStatus::Archived === $this->status;
    }

    public function isConfidential(): bool
    {
        return $this->confidential;
    }

    public function getClaimValueInCents(): int
    {
        return $this->claimValueInCents;
    }

    public function getFiledAt(): \DateTimeImmutable
    {
        return $this->filedAt;
    }

    /**
     * @return list<Party>
     */
    public function getParties(): array
    {
        return array_values($this->parties->toArray());
    }

    /**
     * @return list<CaseEvent> newest first
     */
    public function getEvents(): array
    {
        $events = array_values($this->events->toArray());
        usort($events, static fn (CaseEvent $a, CaseEvent $b): int => $b->getOccurredAt() <=> $a->getOccurredAt());

        return $events;
    }
}
