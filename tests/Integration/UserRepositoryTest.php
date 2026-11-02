<?php

declare(strict_types=1);

namespace App\Tests\Integration;

use App\Entity\User;
use App\Repository\UserRepository;
use App\Tests\Support\TestCases;
use Doctrine\ORM\EntityManagerInterface;
use PHPUnit\Framework\Attributes\DataProvider;
use Symfony\Bundle\FrameworkBundle\Test\KernelTestCase;

final class UserRepositoryTest extends KernelTestCase
{
    private UserRepository $users;
    private User $ana;

    protected function setUp(): void
    {
        self::bootKernel();
        $this->users = self::getContainer()->get(UserRepository::class);
        $this->ana = (new TestCases(self::getContainer()->get(EntityManagerInterface::class)))->lawyer('ana@jus.test', 'Ana Ribeiro');
    }

    #[DataProvider('provideWaysToTypeTheSameEmail')]
    public function testLoadsTheUserWhateverTheCaseOrSurroundingSpacesOfTheEmail(string $identifier): void
    {
        self::assertSame($this->ana, $this->users->loadUserByIdentifier($identifier));
    }

    /**
     * @return iterable<string, array{string}>
     */
    public static function provideWaysToTypeTheSameEmail(): iterable
    {
        yield 'as stored' => ['ana@jus.test'];
        yield 'capitalised' => ['Ana@Jus.Test'];
        yield 'upper case' => ['ANA@JUS.TEST'];
        yield 'surrounding spaces' => ['  ana@jus.test'];
        yield 'surrounding whitespace and case' => ["\tAna@JUS.test \n"];
    }

    public function testLoadsNobodyForAnUnknownEmail(): void
    {
        self::assertNull($this->users->loadUserByIdentifier('ninguem@jus.test'));
        self::assertNull($this->users->loadUserByIdentifier(''));
    }
}
