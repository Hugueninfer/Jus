<?php

declare(strict_types=1);

namespace App\Repository;

use App\Entity\CaseEvent;
use App\Entity\LegalCase;
use Doctrine\Bundle\DoctrineBundle\Repository\ServiceEntityRepository;
use Doctrine\Persistence\ManagerRegistry;

/**
 * @extends ServiceEntityRepository<CaseEvent>
 */
class CaseEventRepository extends ServiceEntityRepository
{
    public function __construct(ManagerRegistry $registry)
    {
        parent::__construct($registry, CaseEvent::class);
    }

    /**
     * The newest event of each case in one query, keyed by case id (ties broken by the highest id).
     *
     * @param list<LegalCase> $cases
     *
     * @return array<int, CaseEvent>
     */
    public function latestForCases(array $cases): array
    {
        if ([] === $cases) {
            return [];
        }

        /** @var list<CaseEvent> $events */
        $events = $this->createQueryBuilder('e')
            ->where('e.legalCase IN (:cases)')
            ->andWhere('e.occurredAt = (SELECT MAX(e2.occurredAt) FROM App\Entity\CaseEvent e2 WHERE e2.legalCase = e.legalCase)')
            ->setParameter('cases', $cases)
            ->orderBy('e.id', 'ASC')
            ->getQuery()
            ->getResult();

        $latest = [];
        foreach ($events as $event) {
            $latest[(int) $event->getLegalCase()->getId()] = $event; // later ids overwrite earlier ones
        }

        return $latest;
    }
}
