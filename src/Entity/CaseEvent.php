<?php

declare(strict_types=1);

namespace App\Entity;

use App\Domain\LegalCase\EventType;
use Doctrine\Common\Collections\ArrayCollection;
use Doctrine\Common\Collections\Collection;
use Doctrine\DBAL\Types\Types;
use Doctrine\ORM\Mapping as ORM;

#[ORM\Entity]
class CaseEvent
{
    #[ORM\Id]
    #[ORM\GeneratedValue]
    #[ORM\Column]
    private ?int $id = null;

    /** @var Collection<int, Document> */
    #[ORM\OneToMany(targetEntity: Document::class, mappedBy: 'event', cascade: ['persist'], orphanRemoval: true)]
    private Collection $documents;

    public function __construct(
        #[ORM\ManyToOne(inversedBy: 'events')]
        #[ORM\JoinColumn(nullable: false)]
        private LegalCase $legalCase,
        #[ORM\Column(length: 20, enumType: EventType::class)]
        private EventType $type,
        #[ORM\Column(type: Types::TEXT)]
        private string $description,
        #[ORM\Column]
        private \DateTimeImmutable $occurredAt,
        #[ORM\ManyToOne]
        private ?User $createdBy = null,
    ) {
        $this->documents = new ArrayCollection();
    }

    public function attach(string $title, string $originalFilename, string $storedFilename, int $sizeInBytes, User $uploadedBy, \DateTimeImmutable $uploadedAt): Document
    {
        $document = new Document($this, $title, $originalFilename, $storedFilename, $sizeInBytes, $uploadedBy, $uploadedAt);
        $this->documents->add($document);

        return $document;
    }

    public function getId(): ?int
    {
        return $this->id;
    }

    public function getLegalCase(): LegalCase
    {
        return $this->legalCase;
    }

    public function getType(): EventType
    {
        return $this->type;
    }

    public function getDescription(): string
    {
        return $this->description;
    }

    public function getOccurredAt(): \DateTimeImmutable
    {
        return $this->occurredAt;
    }

    public function getCreatedBy(): ?User
    {
        return $this->createdBy;
    }

    /**
     * @return list<Document>
     */
    public function getDocuments(): array
    {
        return array_values($this->documents->toArray());
    }
}
