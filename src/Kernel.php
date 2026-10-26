<?php

declare(strict_types=1);

namespace App;

use Symfony\Bundle\FrameworkBundle\Kernel\MicroKernelTrait;
use Symfony\Component\HttpKernel\Kernel as BaseKernel;

class Kernel extends BaseKernel
{
    use MicroKernelTrait;

    /**
     * Procedural deadlines are counted on Brazilian calendar days, whatever the server's php.ini says.
     */
    private const string TIMEZONE = 'America/Sao_Paulo';

    public function boot(): void
    {
        date_default_timezone_set(self::TIMEZONE);

        parent::boot();
    }
}
