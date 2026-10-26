<?php

declare(strict_types=1);

namespace App\Tests\Integration;

use App\Domain\CnjNumber;
use App\Domain\LegalCase\CaseStatus;
use App\Domain\LegalCase\EventType;
use App\Domain\LegalCase\PartySide;
use App\Entity\Deadline;
use App\Entity\LegalCase;
use App\Entity\User;
use App\Repository\LegalCaseRepository;
use Doctrine\DBAL\Exception\UniqueConstraintViolationException;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\Test\KernelTestCase;

final class LegalCasePersistenceTest extends KernelTestCase
{
    public function testPersistsACaseAndFindsItByItsCnjNumber(): void
    {
        self::bootKernel();
        $em = $this->entityManager();

        $lawyer = User::lawyer('ana@jus.test', 'Ana Ribeiro', 'SP 123.456');
        $case = self::legalCase('0000001-39.2024.8.26.0100');
        $plaintiff = $case->addParty('Maria Oliveira', '123.456.789-00', PartySide::Plaintiff);
        $plaintiff->addLawyer($lawyer);
        $summons = $case->record(EventType::Summons, 'Intimação para manifestação.', new \DateTimeImmutable('2024-03-05 14:30'));
        $summons->attach('Mandado de intimação', 'intimacao.pdf', 'stored-intimacao.pdf', 52_000, $lawyer, new \DateTimeImmutable('2024-03-05 14:31'));

        $em->persist($lawyer);
        $em->persist($case);
        $em->persist(new Deadline($plaintiff, $summons, 15));
        $em->flush();
        $em->clear();

        $repository = self::getContainer()->get(LegalCaseRepository::class);
        $reloaded = $repository->findOneByNumber(CnjNumber::fromString('00000013920248260100'));

        self::assertNotNull($reloaded);
        self::assertNotSame($case, $reloaded);
        self::assertSame('0000001-39.2024.8.26.0100', $reloaded->getNumber()->formatted());
        self::assertSame(CaseStatus::Active, $reloaded->getStatus());
        self::assertTrue($reloaded->isRepresentedBy($lawyer));
        self::assertSame(EventType::Summons, $reloaded->getEvents()[0]->getType());
        self::assertSame('Mandado de intimação', $reloaded->getEvents()[0]->getDocuments()[0]->getTitle());
        self::assertNull($repository->findOneByNumber(CnjNumber::fromString('0000003-09.2024.8.26.0100')));
    }

    public function testTheCnjNumberIsUnique(): void
    {
        self::bootKernel();
        $em = $this->entityManager();

        $em->persist(self::legalCase('0000001-39.2024.8.26.0100'));
        $em->persist(self::legalCase('00000013920248260100'));

        $this->expectException(UniqueConstraintViolationException::class);

        $em->flush();
    }

    private function entityManager(): EntityManagerInterface
    {
        return self::getContainer()->get(EntityManagerInterface::class);
    }

    private static function legalCase(string $number): LegalCase
    {
        return new LegalCase(
            CnjNumber::fromString($number),
            'Procedimento Comum Cível',
            'Indenização por dano moral',
            '1ª Vara Cível',
            CaseStatus::Active,
            false,
            1_500_000,
            new \DateTimeImmutable('2024-03-04 10:00'),
        );
    }
}
