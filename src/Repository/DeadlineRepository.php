<?php

declare(strict_types=1);

namespace App\Repository;

use App\Entity\Deadline;
use App\Entity\LegalCase;
use App\Entity\User;
use Doctrine\Bundle\DoctrineBundle\Repository\ServiceEntityRepository;
use Doctrine\Persistence\ManagerRegistry;

/**
 * @extends ServiceEntityRepository<Deadline>
 */
class DeadlineRepository extends ServiceEntityRepository
{
    public function __construct(ManagerRegistry $registry)
    {
        parent::__construct($registry, Deadline::class);
    }

    /**
     * Every deadline of the case, in one query, with its party and summons loaded (oldest first; the caller sorts for display).
     *
     * @return list<Deadline>
     */
    public function findForCase(LegalCase $case): array
    {
        /** @var list<Deadline> $deadlines */
        $deadlines = $this->createQueryBuilder('d')
            ->join('d.party', 'p')
            ->addSelect('p', 's')
            ->join('d.summons', 's')
            ->where('p.legalCase = :case')
            ->setParameter('case', $case)
            ->orderBy('d.id', 'ASC')
            ->getQuery()
            ->getResult();

        return $deadlines;
    }

    /**
     * The deadlines of the case that are still open and belong to a party the lawyer represents, oldest first. The
     * lawyer is matched in SQL, so neither the parties nor their lawyers are loaded.
     *
     * @return list<Deadline>
     */
    public function findOpenForLawyer(LegalCase $case, User $lawyer): array
    {
        /** @var list<Deadline> $deadlines */
        $deadlines = $this->createQueryBuilder('d')
            ->join('d.party', 'p')
            ->join('p.lawyers', 'l')
            ->where('p.legalCase = :case')
            ->andWhere('l = :lawyer')
            ->andWhere('d.fulfilledAt IS NULL')
            ->setParameter('case', $case)
            ->setParameter('lawyer', $lawyer)
            ->orderBy('d.id', 'ASC')
            ->getQuery()
            ->getResult();

        return $deadlines;
    }
}
