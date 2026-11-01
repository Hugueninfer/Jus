<?php

declare(strict_types=1);

namespace App\Repository;

use App\Entity\Document;
use Doctrine\Bundle\DoctrineBundle\Repository\ServiceEntityRepository;
use Doctrine\Persistence\ManagerRegistry;

/**
 * @extends ServiceEntityRepository<Document>
 */
class DocumentRepository extends ServiceEntityRepository
{
    public function __construct(ManagerRegistry $registry)
    {
        parent::__construct($registry, Document::class);
    }

    /**
     * The document with its event and its case, and the case's parties and their lawyers (all LegalCaseVoter looks at),
     * in one query. It applies no visibility rule: the caller must ask the voter about the case before serving anything.
     */
    public function findOneWithCase(int $id): ?Document
    {
        /** @var ?Document $document */
        $document = $this->createQueryBuilder('d')
            ->addSelect('e', 'c', 'p', 'l')
            ->join('d.event', 'e')
            ->join('e.legalCase', 'c')
            ->leftJoin('c.parties', 'p')
            ->leftJoin('p.lawyers', 'l')
            ->where('d.id = :id')
            ->setParameter('id', $id)
            ->getQuery()
            ->getOneOrNullResult();

        return $document;
    }
}
