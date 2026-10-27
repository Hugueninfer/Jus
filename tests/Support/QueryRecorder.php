<?php

declare(strict_types=1);

namespace App\Tests\Support;

use Psr\Log\AbstractLogger;

/**
 * Collects the SELECT statements the test connection runs (fed by DBAL's logging middleware, see config/services.yaml),
 * so tests can prove a repository method issues a given number of queries and that lazy loading does not kick in.
 */
final class QueryRecorder extends AbstractLogger
{
    private static ?self $instance = null;

    /** @var list<string> */
    private array $selects = [];

    private function __construct()
    {
    }

    /**
     * One recorder per process: the container hands this very instance to the logging middleware, and tests read it here.
     */
    public static function instance(): self
    {
        return self::$instance ??= new self();
    }

    /**
     * @param array<array-key, mixed> $context
     */
    public function log(mixed $level, string|\Stringable $message, array $context = []): void
    {
        $sql = $context['sql'] ?? null;
        if (\is_string($sql) && str_starts_with(ltrim($sql), 'SELECT')) {
            $this->selects[] = $sql;
        }
    }

    /**
     * @return list<string>
     */
    public function selects(): array
    {
        return $this->selects;
    }

    public function reset(): void
    {
        $this->selects = [];
    }
}
