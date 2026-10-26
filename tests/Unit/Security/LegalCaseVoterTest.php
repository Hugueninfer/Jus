<?php

declare(strict_types=1);

namespace App\Tests\Unit\Security;

use App\Domain\CnjNumber;
use App\Domain\LegalCase\CaseStatus;
use App\Domain\LegalCase\PartySide;
use App\Entity\LegalCase;
use App\Entity\User;
use App\Security\LegalCaseVoter;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;
use Symfony\Component\Security\Core\Authentication\Token\NullToken;
use Symfony\Component\Security\Core\Authentication\Token\UsernamePasswordToken;
use Symfony\Component\Security\Core\Authorization\Voter\VoterInterface;

final class LegalCaseVoterTest extends TestCase
{
    /**
     * @return iterable<string, array{string, bool, bool, string, int}>
     */
    public static function decisions(): iterable
    {
        $granted = VoterInterface::ACCESS_GRANTED;
        $denied = VoterInterface::ACCESS_DENIED;

        // viewer, confidential, archived, attribute, expected
        yield 'clerk views a public case' => ['clerk', false, false, LegalCaseVoter::VIEW, $granted];
        yield 'clerk views a confidential case' => ['clerk', true, false, LegalCaseVoter::VIEW, $granted];
        yield 'clerk cannot file' => ['clerk', false, false, LegalCaseVoter::FILE, $denied];
        yield 'representing lawyer views a confidential case' => ['representing', true, false, LegalCaseVoter::VIEW, $granted];
        yield 'representing lawyer views an archived case' => ['representing', false, true, LegalCaseVoter::VIEW, $granted];
        yield 'representing lawyer files' => ['representing', false, false, LegalCaseVoter::FILE, $granted];
        yield 'representing lawyer files in a confidential case' => ['representing', true, false, LegalCaseVoter::FILE, $granted];
        yield 'representing lawyer cannot file in an archived case' => ['representing', false, true, LegalCaseVoter::FILE, $denied];
        yield 'other lawyer views a public case' => ['other', false, false, LegalCaseVoter::VIEW, $granted];
        yield 'other lawyer cannot view a confidential case' => ['other', true, false, LegalCaseVoter::VIEW, $denied];
        yield 'other lawyer cannot file' => ['other', false, false, LegalCaseVoter::FILE, $denied];
    }

    #[DataProvider('decisions')]
    public function testDecides(string $viewer, bool $confidential, bool $archived, string $attribute, int $expected): void
    {
        $representing = User::lawyer('ana@jus.test', 'Ana Ribeiro', 'SP 123.456');
        $case = self::legalCase($confidential, $archived);
        $case->addParty('Maria Oliveira', '123.456.789-00', PartySide::Plaintiff)->addLawyer($representing);

        $user = match ($viewer) {
            'clerk' => User::clerk('joao@jus.test', 'João Almeida'),
            'representing' => $representing,
            default => User::lawyer('carla@jus.test', 'Carla Mendes', 'SP 654.321'),
        };

        $token = new UsernamePasswordToken($user, 'main', $user->getRoles());

        self::assertSame($expected, (new LegalCaseVoter())->vote($token, $case, [$attribute]));
    }

    public function testAbstainsOnOtherAttributesAndSubjects(): void
    {
        $voter = new LegalCaseVoter();
        $user = User::clerk('joao@jus.test', 'João Almeida');
        $token = new UsernamePasswordToken($user, 'main', $user->getRoles());

        self::assertSame(VoterInterface::ACCESS_ABSTAIN, $voter->vote($token, self::legalCase(false, false), ['EDIT']));
        self::assertSame(VoterInterface::ACCESS_ABSTAIN, $voter->vote($token, new \stdClass(), [LegalCaseVoter::VIEW]));
    }

    public function testDeniesAnonymousVisitors(): void
    {
        self::assertSame(VoterInterface::ACCESS_DENIED, (new LegalCaseVoter())->vote(new NullToken(), self::legalCase(false, false), [LegalCaseVoter::VIEW]));
    }

    private static function legalCase(bool $confidential, bool $archived): LegalCase
    {
        return new LegalCase(
            CnjNumber::fromString('0000001-39.2024.8.26.0100'),
            'Procedimento Comum Cível',
            'Cobrança',
            '1ª Vara Cível',
            $archived ? CaseStatus::Archived : CaseStatus::Active,
            $confidential,
            100_000,
            new \DateTimeImmutable('2024-03-04'),
        );
    }
}
