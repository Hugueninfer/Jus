<?php

declare(strict_types=1);

namespace App\Entity;

use App\Domain\LegalCase\PartySide;
use Doctrine\Common\Collections\ArrayCollection;
use Doctrine\Common\Collections\Collection;
use Doctrine\ORM\Mapping as ORM;

#[ORM\Entity]
class Party
{
    #[ORM\Id]
    #[ORM\GeneratedValue]
    #[ORM\Column]
    private ?int $id = null;

    /** @var Collection<int, User> */
    #[ORM\ManyToMany(targetEntity: User::class)]
    #[ORM\JoinTable(name: 'party_lawyer')]
    private Collection $lawyers;

    public function __construct(
        #[ORM\ManyToOne(inversedBy: 'parties')]
        #[ORM\JoinColumn(nullable: false)]
        private LegalCase $legalCase,
        #[ORM\Column(length: 160)]
        private string $name,
        #[ORM\Column(length: 18)]
        private string $taxId,
        #[ORM\Column(length: 20, enumType: PartySide::class)]
        private PartySide $side,
    ) {
        $this->lawyers = new ArrayCollection();
    }

    public function addLawyer(User $lawyer): void
    {
        if (!$lawyer->isLawyer()) {
            throw new \InvalidArgumentException(\sprintf('"%s" is not a lawyer.', $lawyer->getEmail()));
        }

        if (!$this->isRepresentedBy($lawyer)) {
            $this->lawyers->add($lawyer);
        }
    }

    public function isRepresentedBy(User $user): bool
    {
        return $this->lawyers->exists(static fn (int $key, User $lawyer): bool => $lawyer->isSameAs($user));
    }

    public function getId(): ?int
    {
        return $this->id;
    }

    public function getLegalCase(): LegalCase
    {
        return $this->legalCase;
    }

    public function getName(): string
    {
        return $this->name;
    }

    public function getTaxId(): string
    {
        return $this->taxId;
    }

    public function getSide(): PartySide
    {
        return $this->side;
    }

    /**
     * @return list<User>
     */
    public function getLawyers(): array
    {
        return array_values($this->lawyers->toArray());
    }
}
