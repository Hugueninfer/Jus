<?php

declare(strict_types=1);

namespace App\Tests\Integration;

use Doctrine\DBAL\Connection;
use Doctrine\DBAL\Exception\ForeignKeyConstraintViolationException;
use Symfony\Bundle\FrameworkBundle\Test\KernelTestCase;

/**
 * SQLite ignores foreign keys unless every connection asks for them, so this guards the DBAL middleware.
 */
final class SqliteForeignKeysTest extends KernelTestCase
{
    public function testForeignKeysAreEnforced(): void
    {
        self::bootKernel();
        $connection = self::getContainer()->get(Connection::class);

        self::assertSame(1, $connection->fetchOne('PRAGMA foreign_keys'));
    }

    public function testRejectsARowPointingToAMissingParent(): void
    {
        self::bootKernel();
        $connection = self::getContainer()->get(Connection::class);

        $this->expectException(ForeignKeyConstraintViolationException::class);

        $connection->executeStatement(
            'INSERT INTO party (name, tax_id, side, legal_case_id) VALUES (?, ?, ?, ?)',
            ['Maria Oliveira', '123.456.789-00', 'plaintiff', 999999],
        );
    }
}
