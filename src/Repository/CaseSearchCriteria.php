<?php

declare(strict_types=1);

namespace App\Repository;

use App\Domain\CnjNumber;
use App\Domain\LegalCase\CaseStatus;

/**
 * Filters of the case search, filled by the search form.
 */
final class CaseSearchCriteria
{
    public ?CnjNumber $number = null;

    public ?string $partyName = null;

    public ?CaseStatus $status = null;
}
