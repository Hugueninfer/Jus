<?php

declare(strict_types=1);

namespace App\Domain\LegalCase;

enum FilingType: string
{
    case Statement = 'statement';
    case Answer = 'answer';
    case Appeal = 'appeal';
    case Exhibits = 'exhibits';
}
