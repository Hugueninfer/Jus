<?php

declare(strict_types=1);

namespace App\Domain\Deadline;

enum Urgency: string
{
    case OnTrack = 'on_track';
    case Warning = 'warning';
    case DueToday = 'due_today';
    case Overdue = 'overdue';
    case Fulfilled = 'fulfilled';
}
