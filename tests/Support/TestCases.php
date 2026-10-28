<?php

declare(strict_types=1);

namespace App\Tests\Support;

use App\Domain\CnjNumber;
use App\Domain\LegalCase\CaseStatus;
use App\Domain\LegalCase\EventType;
use App\Domain\LegalCase\FilingType;
use App\Domain\LegalCase\PartySide;
use App\Entity\LegalCase;
use App\Entity\User;
use Doctrine\ORM\EntityManagerInterface;

/**
 * Persists users and cases for integration and functional tests (each test runs in a rolled-back transaction).
 */
final readonly class TestCases
{
    public function __construct(private EntityManagerInterface $em)
    {
    }

    public function lawyer(string $email, string $name): User
    {
        return $this->persist(User::lawyer($email, $name, 'SP '.substr(md5($email), 0, 6)));
    }

    public function clerk(string $email, string $name): User
    {
        return $this->persist(User::clerk($email, $name));
    }

    /**
     * A case whose plaintiff is represented by $counsel, with an initial petition (one document) and a decision, unless
     * $withEvents is false: a case that was just registered has no events at all.
     */
    public function legalCase(
        string $sequential,
        User $counsel,
        string $plaintiff = 'Maria Oliveira',
        bool $confidential = false,
        CaseStatus $status = CaseStatus::Active,
        string $filedAt = '2024-03-04 10:00',
        bool $withEvents = true,
    ): LegalCase {
        $filed = new \DateTimeImmutable($filedAt);
        $case = new LegalCase(
            CnjNumber::compose($sequential, $filed->format('Y'), '8', '26', '0100'),
            'Procedimento Comum Cível',
            'Indenização por dano moral',
            '1ª Vara Cível',
            $status,
            $confidential,
            1_500_000,
            $filed,
        );
        $case->addParty($plaintiff, '123.456.789-00', PartySide::Plaintiff)->addLawyer($counsel);
        $case->addParty('Empresa X Ltda.', '12.345.678/0001-90', PartySide::Defendant);
        if ($withEvents) {
            $case->file(FilingType::InitialPetition, 'Petição inicial distribuída.', $filed, $counsel)
                ->attach('Petição inicial', 'peticao-inicial.pdf', 'stored-'.$sequential.'.pdf', 184_320, $counsel, $filed);
            $case->record(EventType::Decision, 'Decisão interlocutória.', $filed->add(new \DateInterval('P20D')));
        }

        $this->em->persist($case);
        $this->em->flush();

        return $case;
    }

    private function persist(User $user): User
    {
        $this->em->persist($user);
        $this->em->flush();

        return $user;
    }
}
