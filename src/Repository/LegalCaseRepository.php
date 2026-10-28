<?php

declare(strict_types=1);

namespace App\Repository;

use App\Doctrine\Type\CnjNumberDoctrineType;
use App\Domain\CnjNumber;
use App\Domain\Text\SearchText;
use App\Entity\LegalCase;
use App\Entity\User;
use Doctrine\Bundle\DoctrineBundle\Repository\ServiceEntityRepository;
use Doctrine\ORM\QueryBuilder;
use Doctrine\ORM\Tools\Pagination\Paginator;
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

    public function search(CaseSearchCriteria $criteria, User $viewer, int $page, int $perPage = 10): CaseSearchResult
    {
        $perPage = max(1, $perPage);
        // Capped so the offset ($page - 1) * $perPage stays an integer: a page this far out is empty anyway, and the caller
        // can tell from $page > $pages that it is past the end.
        $page = min(max(1, $page), intdiv(\PHP_INT_MAX, $perPage));
        $term = $criteria->partyName ?? '';
        $name = SearchText::normalize($term);
        if ('' === $name && 1 !== preg_match('/^[\pZ\p{Cc}\p{Cf}]*$/u', $term)) {
            // Typed, but nothing searchable (invalid UTF-8, a lone accent): no party can match, so do not show every case instead.
            return new CaseSearchResult([], 0, $page, 1);
        }

        $qb = $this->createQueryBuilder('c')
            ->addSelect('p')
            ->leftJoin('c.parties', 'p')
            ->orderBy('c.filedAt', 'DESC')
            ->addOrderBy('c.id', 'DESC');
        $this->onlyVisibleTo($qb, $viewer);

        if (null !== $criteria->number) {
            $qb->andWhere('c.number = :number')->setParameter('number', $criteria->number, CnjNumberDoctrineType::NAME);
        }
        if (null !== $criteria->status) {
            $qb->andWhere('c.status = :status')->setParameter('status', $criteria->status);
        }
        if ('' !== $name) {
            // A subquery keeps every party of the matching cases in the fetch join.
            $qb->andWhere("EXISTS (SELECT 1 FROM App\\Entity\\Party sp WHERE sp.legalCase = c AND sp.searchName LIKE :party ESCAPE '!')")
                ->setParameter('party', '%'.str_replace(['!', '%', '_'], ['!!', '!%', '!_'], $name).'%');
        }

        $paginator = new Paginator($qb->getQuery()->setFirstResult(($page - 1) * $perPage)->setMaxResults($perPage), fetchJoinCollection: true);
        $total = \count($paginator);

        /** @var list<LegalCase> $cases */
        $cases = iterator_to_array($paginator, false);

        return new CaseSearchResult($cases, $total, $page, max(1, (int) ceil($total / $perPage)));
    }

    /**
     * The case with this number, or null when it does not exist or the viewer may not see it.
     */
    public function findVisibleOneByNumber(CnjNumber $number, User $viewer): ?LegalCase
    {
        $qb = $this->createQueryBuilder('c')
            ->where('c.number = :number')
            ->setParameter('number', $number, CnjNumberDoctrineType::NAME);
        $this->onlyVisibleTo($qb, $viewer);

        /** @var ?LegalCase $case */
        $case = $qb->getQuery()->getOneOrNullResult();

        return $case;
    }

    /**
     * The whole aggregate the case page shows, in one query.
     */
    public function findOneForPage(CnjNumber $number): ?LegalCase
    {
        /** @var ?LegalCase $case */
        $case = $this->createQueryBuilder('c')
            ->addSelect('p', 'l', 'e', 'd')
            ->leftJoin('c.parties', 'p')
            ->leftJoin('p.lawyers', 'l')
            ->leftJoin('c.events', 'e')
            ->leftJoin('e.documents', 'd')
            ->where('c.number = :number')
            ->setParameter('number', $number, CnjNumberDoctrineType::NAME)
            ->getQuery()
            ->getOneOrNullResult();

        return $case;
    }

    /**
     * Same rule as LegalCaseVoter::VIEW, applied in the query; SearchVisibilityParityTest keeps the two equal.
     */
    private function onlyVisibleTo(QueryBuilder $qb, User $viewer): void
    {
        if ($viewer->isClerk()) {
            return;
        }

        $qb->andWhere($qb->expr()->orX(
            'c.confidential = false',
            'EXISTS (SELECT 1 FROM App\\Entity\\Party vp JOIN vp.lawyers vl WHERE vp.legalCase = c AND vl = :viewer)',
        ))->setParameter('viewer', $viewer);
    }
}
