<?php

declare(strict_types=1);

namespace App\Domain\LegalCase;

enum EventType: string
{
    case Decision = 'decision';
    case Order = 'order';
    case Filing = 'filing';
    case Summons = 'summons';
    case Hearing = 'hearing';
}
