<?php

declare(strict_types=1);

$finder = (new PhpCsFixer\Finder())
    ->in(__DIR__)
    ->exclude(['var', 'vendor', 'node_modules', 'public/build'])
    ->notPath(['config/bundles.php', 'config/reference.php'])
    // Extension-less executables are not picked up by the finder's default *.php name filter.
    ->append([__DIR__.'/bin/console', __DIR__.'/bin/phpunit'])
;

return (new PhpCsFixer\Config())
    ->setRules([
        '@Symfony' => true,
        '@Symfony:risky' => true,
        'declare_strict_types' => true,
        'strict_comparison' => true,
        'strict_param' => true,
    ])
    ->setRiskyAllowed(true)
    ->setFinder($finder)
;
