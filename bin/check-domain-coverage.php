<?php

declare(strict_types=1);

/*
 * Fails unless every file under src/Domain/ has 100% statement coverage
 * in the Clover report produced by PHPUnit.
 *
 * Usage: php bin/check-domain-coverage.php var/coverage/clover.xml
 */

$cloverPath = $argv[1] ?? 'var/coverage/clover.xml';
$domainDir = str_replace('\\', '/', dirname(__DIR__)).'/src/Domain/';

$xml = @simplexml_load_file($cloverPath);
if (false === $xml) {
    fwrite(\STDERR, "Could not read the Clover report at {$cloverPath}.\n");
    exit(1);
}

$checked = 0;
$failures = [];
foreach ($xml->xpath('//file') ?: [] as $file) {
    $path = str_replace('\\', '/', (string) $file['name']);
    if (!str_starts_with($path, $domainDir)) {
        continue;
    }

    ++$checked;
    $statements = (int) $file->metrics['statements'];
    $covered = (int) $file->metrics['coveredstatements'];
    if ($covered < $statements) {
        $failures[] = sprintf('  %s: %d/%d statements covered', substr($path, strlen($domainDir)), $covered, $statements);
    }
}

if (0 === $checked) {
    fwrite(\STDERR, "No src/Domain/ files found in {$cloverPath}.\n");
    exit(1);
}

if ([] !== $failures) {
    fwrite(\STDERR, "src/Domain/ must have 100% coverage:\n".implode("\n", $failures)."\n");
    exit(1);
}

echo "src/Domain/: {$checked} files, 100% covered.\n";
