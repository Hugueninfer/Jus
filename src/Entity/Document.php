<?php

declare(strict_types=1);

namespace App\Entity;

use Doctrine\ORM\Mapping as ORM;

#[ORM\Entity]
class Document
{
    #[ORM\Id]
    #[ORM\GeneratedValue]
    #[ORM\Column]
    private ?int $id = null;

    public function __construct(
        #[ORM\ManyToOne(inversedBy: 'documents')]
        #[ORM\JoinColumn(nullable: false)]
        private CaseEvent $event,
        #[ORM\Column(length: 255)]
        private string $title,
        #[ORM\Column(length: 255)]
        private string $originalFilename,
        #[ORM\Column(length: 64, unique: true)]
        private string $storedFilename,
        #[ORM\Column]
        private int $sizeInBytes,
        #[ORM\ManyToOne]
        #[ORM\JoinColumn(nullable: false)]
        private User $uploadedBy,
        #[ORM\Column]
        private \DateTimeImmutable $uploadedAt,
    ) {
    }

    public function getId(): ?int
    {
        return $this->id;
    }

    public function getEvent(): CaseEvent
    {
        return $this->event;
    }

    public function getTitle(): string
    {
        return $this->title;
    }

    public function getOriginalFilename(): string
    {
        return $this->originalFilename;
    }

    public function getStoredFilename(): string
    {
        return $this->storedFilename;
    }

    public function getSizeInBytes(): int
    {
        return $this->sizeInBytes;
    }

    public function getUploadedBy(): User
    {
        return $this->uploadedBy;
    }

    public function getUploadedAt(): \DateTimeImmutable
    {
        return $this->uploadedAt;
    }
}
