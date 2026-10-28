<?php

declare(strict_types=1);

namespace App\Tests\Integration;

use App\Entity\LegalCase;
use App\Entity\User;
use App\Repository\CaseSearchCriteria;
use App\Repository\LegalCaseRepository;
use App\Security\LegalCaseVoter;
use App\Tests\Support\TestCases;
use Doctrine\ORM\EntityManagerInterface;
use PHPUnit\Framework\Attributes\DataProvider;
use Symfony\Bundle\FrameworkBundle\Test\KernelTestCase;
use Symfony\Component\Security\Core\Authentication\Token\UsernamePasswordToken;
use Symfony\Component\Security\Core\Authorization\AccessDecisionManagerInterface;

/**
 * The search page's only access control is the DQL rule of LegalCaseRepository::onlyVisibleTo(): this keeps it equal to
 * what the voter decides for VIEW, which is what the case page enforces.
 */
final class SearchVisibilityParityTest extends KernelTestCase
{
    private const string PUBLIC_CASE = '0000001';
    private const string CONFIDENTIAL_CASE = '0000002';

    /**
     * @return iterable<string, array{string, string, bool}>
     */
    public static function provideViewersAndCases(): iterable
    {
        // viewer, case, whether the voter grants VIEW (stated here so that a rule that drifted in both places is caught too)
        yield 'clerk, public case' => ['clerk', self::PUBLIC_CASE, true];
        yield 'clerk, confidential case' => ['clerk', self::CONFIDENTIAL_CASE, true];
        yield "plaintiff's lawyer, public case" => ['plaintiff', self::PUBLIC_CASE, true];
        yield "plaintiff's lawyer, confidential case" => ['plaintiff', self::CONFIDENTIAL_CASE, true];
        yield "defendant's lawyer, public case" => ['defendant', self::PUBLIC_CASE, true];
        yield "defendant's lawyer, confidential case" => ['defendant', self::CONFIDENTIAL_CASE, true];
        yield 'unrelated lawyer, public case' => ['unrelated', self::PUBLIC_CASE, true];
        yield 'unrelated lawyer, confidential case' => ['unrelated', self::CONFIDENTIAL_CASE, false];
    }

    #[DataProvider('provideViewersAndCases')]
    public function testTheSearchAndTheCaseLookupAgreeWithTheVoter(string $who, string $sequential, bool $expected): void
    {
        self::bootKernel();
        $container = self::getContainer();
        $em = $container->get(EntityManagerInterface::class);
        $cases = $container->get(LegalCaseRepository::class);
        $decisions = $container->get(AccessDecisionManagerInterface::class);
        $data = new TestCases($em);

        $plaintiffLawyer = $data->lawyer('ana@jus.test', 'Ana Ribeiro');
        $defendantLawyer = $data->lawyer('bruno@jus.test', 'Bruno Teixeira');
        $viewers = [
            'clerk' => $data->clerk('servidor@jus.test', 'Carlos Servidor'),
            'plaintiff' => $plaintiffLawyer,
            'defendant' => $defendantLawyer,
            'unrelated' => $data->lawyer('carla@jus.test', 'Carla Nogueira'),
        ];
        $public = $data->legalCase(self::PUBLIC_CASE, $plaintiffLawyer);
        $confidential = $data->legalCase(self::CONFIDENTIAL_CASE, $plaintiffLawyer, confidential: true);
        foreach ([$public, $confidential] as $case) {
            $case->getParties()[1]->addLawyer($defendantLawyer);
        }
        $em->flush();
        $number = (self::PUBLIC_CASE === $sequential ? $public : $confidential)->getNumber();
        $em->clear(); // the voter and the queries must judge what is stored, not what the test still holds in memory

        $viewer = $em->getRepository(User::class)->findOneBy(['email' => $viewers[$who]->getEmail()]);
        self::assertInstanceOf(User::class, $viewer);
        $loaded = $cases->findOneForPage($number);
        self::assertInstanceOf(LegalCase::class, $loaded);

        $token = new UsernamePasswordToken($viewer, 'main', $viewer->getRoles());
        $voterGrants = $decisions->decide($token, [LegalCaseVoter::VIEW], $loaded);
        $lookupFinds = null !== $cases->findVisibleOneByNumber($number, $viewer);
        $listed = array_map(
            static fn (LegalCase $case): string => $case->getNumber()->formatted(),
            $cases->search(new CaseSearchCriteria(), $viewer, 1)->cases,
        );
        $searchLists = \in_array($number->formatted(), $listed, true);

        self::assertSame($expected, $voterGrants, 'the voter decides as the data provider states');
        self::assertSame($voterGrants, $lookupFinds, 'findVisibleOneByNumber() must equal the voter');
        self::assertSame($voterGrants, $searchLists, 'search() must equal the voter');
    }
}
