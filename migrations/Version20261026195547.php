<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

/**
 * Auto-generated Migration: Please modify to your needs!
 */
final class Version20261026195547 extends AbstractMigration
{
    public function getDescription(): string
    {
        return '';
    }

    public function up(Schema $schema): void
    {
        // this up() migration is auto-generated, please modify it to your needs
        $this->addSql('CREATE TABLE app_user (id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL, password VARCHAR(255) NOT NULL, email VARCHAR(180) NOT NULL, name VARCHAR(120) NOT NULL, roles CLOB NOT NULL, oab_number VARCHAR(20) DEFAULT NULL)');
        $this->addSql('CREATE UNIQUE INDEX UNIQ_88BDF3E9E7927C74 ON app_user (email)');
        $this->addSql('CREATE TABLE case_event (id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL, type VARCHAR(20) NOT NULL, description CLOB NOT NULL, occurred_at DATETIME NOT NULL, legal_case_id INTEGER NOT NULL, created_by_id INTEGER DEFAULT NULL, CONSTRAINT FK_6947F04B82B4A9B FOREIGN KEY (legal_case_id) REFERENCES legal_case (id) NOT DEFERRABLE INITIALLY IMMEDIATE, CONSTRAINT FK_6947F04BB03A8386 FOREIGN KEY (created_by_id) REFERENCES app_user (id) NOT DEFERRABLE INITIALLY IMMEDIATE)');
        $this->addSql('CREATE INDEX IDX_6947F04B82B4A9B ON case_event (legal_case_id)');
        $this->addSql('CREATE INDEX IDX_6947F04BB03A8386 ON case_event (created_by_id)');
        $this->addSql('CREATE TABLE deadline (id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL, start_date DATE NOT NULL, fulfilled_at DATETIME DEFAULT NULL, business_days SMALLINT NOT NULL, party_id INTEGER NOT NULL, summons_id INTEGER NOT NULL, CONSTRAINT FK_B74774F2213C1059 FOREIGN KEY (party_id) REFERENCES party (id) NOT DEFERRABLE INITIALLY IMMEDIATE, CONSTRAINT FK_B74774F2DA652FCB FOREIGN KEY (summons_id) REFERENCES case_event (id) NOT DEFERRABLE INITIALLY IMMEDIATE)');
        $this->addSql('CREATE INDEX IDX_B74774F2213C1059 ON deadline (party_id)');
        $this->addSql('CREATE INDEX IDX_B74774F2DA652FCB ON deadline (summons_id)');
        $this->addSql('CREATE TABLE document (id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL, title VARCHAR(255) NOT NULL, original_filename VARCHAR(255) NOT NULL, stored_filename VARCHAR(64) NOT NULL, size_in_bytes INTEGER NOT NULL, uploaded_at DATETIME NOT NULL, event_id INTEGER NOT NULL, uploaded_by_id INTEGER NOT NULL, CONSTRAINT FK_D8698A7671F7E88B FOREIGN KEY (event_id) REFERENCES case_event (id) NOT DEFERRABLE INITIALLY IMMEDIATE, CONSTRAINT FK_D8698A76A2B28FE8 FOREIGN KEY (uploaded_by_id) REFERENCES app_user (id) NOT DEFERRABLE INITIALLY IMMEDIATE)');
        $this->addSql('CREATE UNIQUE INDEX UNIQ_D8698A76DF8EB9B7 ON document (stored_filename)');
        $this->addSql('CREATE INDEX IDX_D8698A7671F7E88B ON document (event_id)');
        $this->addSql('CREATE INDEX IDX_D8698A76A2B28FE8 ON document (uploaded_by_id)');
        $this->addSql('CREATE TABLE legal_case (id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL, number VARCHAR(20) NOT NULL, case_class VARCHAR(120) NOT NULL, subject VARCHAR(255) NOT NULL, court VARCHAR(120) NOT NULL, status VARCHAR(20) NOT NULL, confidential BOOLEAN NOT NULL, claim_value_in_cents INTEGER NOT NULL, filed_at DATETIME NOT NULL)');
        $this->addSql('CREATE UNIQUE INDEX UNIQ_557377B396901F54 ON legal_case (number)');
        $this->addSql('CREATE TABLE party (id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL, name VARCHAR(160) NOT NULL, tax_id VARCHAR(18) NOT NULL, side VARCHAR(20) NOT NULL, legal_case_id INTEGER NOT NULL, CONSTRAINT FK_89954EE082B4A9B FOREIGN KEY (legal_case_id) REFERENCES legal_case (id) NOT DEFERRABLE INITIALLY IMMEDIATE)');
        $this->addSql('CREATE INDEX IDX_89954EE082B4A9B ON party (legal_case_id)');
        $this->addSql('CREATE TABLE party_lawyer (party_id INTEGER NOT NULL, user_id INTEGER NOT NULL, PRIMARY KEY (party_id, user_id), CONSTRAINT FK_27990F2E213C1059 FOREIGN KEY (party_id) REFERENCES party (id) ON DELETE CASCADE NOT DEFERRABLE INITIALLY IMMEDIATE, CONSTRAINT FK_27990F2EA76ED395 FOREIGN KEY (user_id) REFERENCES app_user (id) ON DELETE CASCADE NOT DEFERRABLE INITIALLY IMMEDIATE)');
        $this->addSql('CREATE INDEX IDX_27990F2E213C1059 ON party_lawyer (party_id)');
        $this->addSql('CREATE INDEX IDX_27990F2EA76ED395 ON party_lawyer (user_id)');
    }

    public function down(Schema $schema): void
    {
        // this down() migration is auto-generated, please modify it to your needs
        $this->addSql('DROP TABLE app_user');
        $this->addSql('DROP TABLE case_event');
        $this->addSql('DROP TABLE deadline');
        $this->addSql('DROP TABLE document');
        $this->addSql('DROP TABLE legal_case');
        $this->addSql('DROP TABLE party');
        $this->addSql('DROP TABLE party_lawyer');
    }
}
