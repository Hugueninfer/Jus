<?php

declare(strict_types=1);

namespace App\Entity;

use App\Repository\UserRepository;
use Doctrine\DBAL\Types\Types;
use Doctrine\ORM\Mapping as ORM;
use Symfony\Component\Security\Core\User\PasswordAuthenticatedUserInterface;
use Symfony\Component\Security\Core\User\UserInterface;

#[ORM\Entity(repositoryClass: UserRepository::class)]
#[ORM\Table(name: 'app_user')]
class User implements UserInterface, PasswordAuthenticatedUserInterface
{
    public const string ROLE_LAWYER = 'ROLE_LAWYER';
    public const string ROLE_CLERK = 'ROLE_CLERK';

    #[ORM\Id]
    #[ORM\GeneratedValue]
    #[ORM\Column]
    private ?int $id = null;

    #[ORM\Column]
    private string $password = '';

    /**
     * @param list<string> $roles
     */
    private function __construct(
        #[ORM\Column(length: 180, unique: true)]
        private string $email,
        #[ORM\Column(length: 120)]
        private string $name,
        #[ORM\Column(type: Types::JSON)]
        private array $roles,
        #[ORM\Column(length: 20, nullable: true)]
        private ?string $oabNumber,
    ) {
    }

    public static function lawyer(string $email, string $name, string $oabNumber): self
    {
        return new self($email, $name, [self::ROLE_LAWYER], $oabNumber);
    }

    public static function clerk(string $email, string $name): self
    {
        return new self($email, $name, [self::ROLE_CLERK], null);
    }

    public function getId(): ?int
    {
        return $this->id;
    }

    public function getEmail(): string
    {
        return $this->email;
    }

    public function getName(): string
    {
        return $this->name;
    }

    public function getOabNumber(): ?string
    {
        return $this->oabNumber;
    }

    public function getUserIdentifier(): string
    {
        \assert('' !== $this->email);

        return $this->email;
    }

    /**
     * @return list<string>
     */
    public function getRoles(): array
    {
        return array_values(array_unique([...$this->roles, 'ROLE_USER']));
    }

    public function isLawyer(): bool
    {
        return \in_array(self::ROLE_LAWYER, $this->roles, true);
    }

    public function isClerk(): bool
    {
        return \in_array(self::ROLE_CLERK, $this->roles, true);
    }

    /**
     * Same person, even across different object instances (e.g. a session copy and a Doctrine entity).
     */
    public function isSameAs(self $other): bool
    {
        return $this->email === $other->email;
    }

    public function getPassword(): string
    {
        return $this->password;
    }

    public function setPassword(string $hashedPassword): void
    {
        $this->password = $hashedPassword;
    }

    #[\Deprecated]
    public function eraseCredentials(): void
    {
    }
}
