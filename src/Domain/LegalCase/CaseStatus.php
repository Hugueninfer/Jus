<?php

declare(strict_types=1);

namespace App\Domain\LegalCase;

enum CaseStatus: string
{
    case Active = 'active';
    case Suspended = 'suspended';
    case Archived = 'archived';
}
