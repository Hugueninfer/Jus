<?php

declare(strict_types=1);

namespace App\Tests\Unit\Entity;

use App\Entity\User;
use PHPUnit\Framework\TestCase;

final class UserTest extends TestCase
{
    public function testALawyer(): void
    {
        $user = User::lawyer('ana@jus.test', 'Ana Ribeiro', 'SP 123.456');

        self::assertSame(['ROLE_LAWYER', 'ROLE_USER'], $user->getRoles());
        self::assertTrue($user->isLawyer());
        self::assertFalse($user->isClerk());
        self::assertSame('ana@jus.test', $user->getEmail());
        self::assertSame('ana@jus.test', $user->getUserIdentifier());
        self::assertSame('Ana Ribeiro', $user->getName());
        self::assertSame('SP 123.456', $user->getOabNumber());
        self::assertNull($user->getId());
    }

    public function testAClerk(): void
    {
        $user = User::clerk('joao@jus.test', 'João Almeida');

        self::assertSame(['ROLE_CLERK', 'ROLE_USER'], $user->getRoles());
        self::assertTrue($user->isClerk());
        self::assertFalse($user->isLawyer());
        self::assertNull($user->getOabNumber());
    }

    public function testIsSameAsComparesEmails(): void
    {
        $user = User::lawyer('ana@jus.test', 'Ana Ribeiro', 'SP 123.456');

        self::assertTrue($user->isSameAs(User::lawyer('ana@jus.test', 'Ana R.', 'SP 123.456')));
        self::assertFalse($user->isSameAs(User::clerk('joao@jus.test', 'João Almeida')));
    }

    public function testAlwaysStoresTheEmailInLowerCaseWithoutSurroundingSpaces(): void
    {
        $lawyer = User::lawyer(' Ana.Ribeiro@JUS.Test ', 'Ana Ribeiro', 'SP 123.456');
        $clerk = User::clerk('João@Jus.Test', 'João Almeida');

        self::assertSame('ana.ribeiro@jus.test', $lawyer->getEmail());
        self::assertSame('ana.ribeiro@jus.test', $lawyer->getUserIdentifier());
        self::assertSame('joão@jus.test', $clerk->getEmail());
    }

    public function testIsSameAsIgnoresTheCaseOfTheEmail(): void
    {
        $user = User::lawyer('Ana@JUS.test', 'Ana Ribeiro', 'SP 123.456');

        self::assertTrue($user->isSameAs(User::clerk('ana@jus.test', 'Ana R.')));
        self::assertFalse($user->isSameAs(User::clerk('joao@jus.test', 'João Almeida')));
    }

    public function testNormalisesAnEmailTheSameWayEverywhere(): void
    {
        self::assertSame('ana@jus.test', User::normalizeEmail("\t Ana@JUS.test \n"));
        self::assertSame('émile@jus.test', User::normalizeEmail('ÉMILE@Jus.test'));
        self::assertSame('', User::normalizeEmail('   '));
    }

    public function testStoresTheHashedPassword(): void
    {
        $user = User::clerk('joao@jus.test', 'João Almeida');
        $user->setPassword('$2y$04$hash');

        self::assertSame('$2y$04$hash', $user->getPassword());
    }

    public function testKeepsThePasswordHashOutOfTheSession(): void
    {
        $hash = '$2y$13$cLpU5gS6wVq3kQ0zZ9r1me4Xb8nT2yH7aJ6dF5sR3vW1xC0pL9oKu';
        $user = User::lawyer('ana@jus.test', 'Ana Ribeiro', 'SP 123.456');
        $user->setPassword($hash);

        $serialized = serialize($user);
        $restored = unserialize($serialized);

        self::assertStringNotContainsString($hash, $serialized);
        self::assertInstanceOf(User::class, $restored);
        self::assertSame('ana@jus.test', $restored->getEmail());
        self::assertSame(hash('crc32c', $hash), $restored->getPassword());
    }
}
