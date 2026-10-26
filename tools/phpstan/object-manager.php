<?php

declare(strict_types=1);

/*
 * Gives phpstan-doctrine the real entity metadata (column types, DQL validation).
 * Kept outside the analysed paths on purpose.
 */

use App\Kernel;
use Doctrine\Persistence\ManagerRegistry;
use Symfony\Component\Dotenv\Dotenv;

require dirname(__DIR__, 2).'/vendor/autoload.php';

(new Dotenv())->bootEnv(dirname(__DIR__, 2).'/.env');

$kernel = new Kernel('dev', true);
$kernel->boot();

$doctrine = $kernel->getContainer()->get('doctrine');
assert($doctrine instanceof ManagerRegistry);

return $doctrine->getManager();
