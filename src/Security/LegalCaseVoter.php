<?php

declare(strict_types=1);

namespace App\Security;

use App\Entity\LegalCase;
use App\Entity\User;
use Symfony\Component\Security\Core\Authentication\Token\TokenInterface;
use Symfony\Component\Security\Core\Authorization\Voter\Vote;
use Symfony\Component\Security\Core\Authorization\Voter\Voter;

/**
 * VIEW: clerks always; lawyers when the case is public or they represent one of its parties.
 * FILE: only a lawyer who represents one of the parties, and never in an archived case.
 *
 * @extends Voter<string, LegalCase>
 */
final class LegalCaseVoter extends Voter
{
    public const string VIEW = 'VIEW';
    public const string FILE = 'FILE';

    protected function supports(string $attribute, mixed $subject): bool
    {
        return \in_array($attribute, [self::VIEW, self::FILE], true) && $subject instanceof LegalCase;
    }

    protected function voteOnAttribute(string $attribute, mixed $subject, TokenInterface $token, ?Vote $vote = null): bool
    {
        $user = $token->getUser();
        if (!$user instanceof User) {
            return false;
        }

        return match ($attribute) {
            self::VIEW => $user->isClerk() || !$subject->isConfidential() || $subject->isRepresentedBy($user),
            self::FILE => $user->isLawyer() && $subject->isRepresentedBy($user) && !$subject->isArchived(),
            default => false,
        };
    }
}
