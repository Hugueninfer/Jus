<?php

declare(strict_types=1);

namespace App\Domain\LegalCase;

enum PartySide: string
{
    case Plaintiff = 'plaintiff';
    case Defendant = 'defendant';
}
