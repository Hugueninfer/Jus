<?php

declare(strict_types=1);

use Symfony\Component\Dotenv\Dotenv;

require dirname(__DIR__).'/vendor/autoload.php';

(new Dotenv())->bootEnv(dirname(__DIR__).'/.env');

// Rebuild the SQLite test database from the migrations once per run;
// DAMA DoctrineTestBundle then wraps every test in a transaction that is rolled back.
// No --if-exists on the drop: it needs listDatabases(), which SQLite does not support,
// and without it the command simply deletes the database file when there is one.
$console = escapeshellarg(\PHP_BINARY).' '.escapeshellarg(dirname(__DIR__).'/bin/console');
foreach (['doctrine:database:drop --force', 'doctrine:migrations:migrate --no-interaction'] as $command) {
    passthru($console.' '.$command.' --env=test --quiet', $exitCode);
    if (0 !== $exitCode) {
        throw new RuntimeException(sprintf('"%s" failed while preparing the test database.', $command));
    }
}
