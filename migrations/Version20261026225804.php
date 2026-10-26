<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

final class Version20261026225804 extends AbstractMigration
{
    public function getDescription(): string
    {
        return 'Filing type of filing events (null on every other event).';
    }

    public function up(Schema $schema): void
    {
        $this->addSql('ALTER TABLE case_event ADD COLUMN filing_type VARCHAR(20) DEFAULT NULL');
    }

    public function down(Schema $schema): void
    {
        // DROP COLUMN (SQLite 3.35+) instead of the generated table rebuild: dropping and recreating
        // case_event violates the foreign keys of document and deadline, which SQLite now enforces.
        $this->addSql('ALTER TABLE case_event DROP COLUMN filing_type');
    }
}
