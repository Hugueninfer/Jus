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

    public function testStoresTheHashedPassword(): void
    {
        $user = User::clerk('joao@jus.test', 'João Almeida');
        $user->setPassword('$2y$04$hash');

        self::assertSame('$2y$04$hash', $user->getPassword());
    }
}
