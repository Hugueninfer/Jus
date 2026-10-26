<?php

declare(strict_types=1);

namespace App\Repository;

use App\Domain\CnjNumber;
use App\Entity\LegalCase;
use Doctrine\Bundle\DoctrineBundle\Repository\ServiceEntityRepository;
use Doctrine\Persistence\ManagerRegistry;

/**
 * @extends ServiceEntityRepository<LegalCase>
 */
class LegalCaseRepository extends ServiceEntityRepository
{
    public function __construct(ManagerRegistry $registry)
    {
        parent::__construct($registry, LegalCase::class);
    }

    public function findOneByNumber(CnjNumber $number): ?LegalCase
    {
        return $this->findOneBy(['number' => $number]);
    }
}
