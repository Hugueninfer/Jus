<?php

declare(strict_types=1);

use Symfony\Component\Dotenv\Dotenv;

require dirname(__DIR__).'/vendor/autoload.php';

(new Dotenv())->bootEnv(dirname(__DIR__).'/.env');

// Rebuild the SQLite test database from the migrations once per run, then check that the mapping
// matches the migrated schema; DAMA DoctrineTestBundle then wraps every test in a transaction that is rolled back.
// No --if-exists on the drop: it needs listDatabases(), which SQLite does not support,
// and without it the command simply deletes the database file when there is one.
$console = escapeshellarg(\PHP_BINARY).' '.escapeshellarg(dirname(__DIR__).'/bin/console');
foreach (['doctrine:database:drop --force', 'doctrine:migrations:migrate --no-interaction', 'doctrine:schema:validate'] as $command) {
    $output = [];
    exec($console.' '.$command.' --env=test 2>&1', $output, $exitCode);
    if (0 !== $exitCode) {
        throw new RuntimeException(sprintf("\"%s\" failed while preparing the test database:\n%s", $command, implode("\n", $output)));
    }
}
