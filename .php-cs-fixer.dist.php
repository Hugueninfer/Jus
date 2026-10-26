<?php

declare(strict_types=1);

$finder = (new PhpCsFixer\Finder())
    ->in(__DIR__)
    ->exclude(['var', 'vendor', 'node_modules', 'public/build'])
    ->notPath(['config/bundles.php', 'config/reference.php'])
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
