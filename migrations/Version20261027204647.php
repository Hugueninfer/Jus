<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use App\Domain\Text\SearchText;
use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

final class Version20261027204647 extends AbstractMigration
{
    public function getDescription(): string
    {
        return 'Store a normalized party name for accent-insensitive search.';
    }

    public function up(Schema $schema): void
    {
        $this->addSql("ALTER TABLE party ADD COLUMN search_name VARCHAR(160) DEFAULT '' NOT NULL");
    }

    public function postUp(Schema $schema): void
    {
        foreach ($this->connection->fetchAllAssociative('SELECT id, name FROM party') as $row) {
            $this->connection->update('party', ['search_name' => SearchText::normalize((string) $row['name'])], ['id' => $row['id']]);
        }
    }

    public function down(Schema $schema): void
    {
        // DROP COLUMN (SQLite 3.35+) instead of the generated table rebuild: dropping and recreating
        // party violates the foreign key of party_lawyer, which SQLite now enforces.
        $this->addSql('ALTER TABLE party DROP COLUMN search_name');
    }
}
