<?php

declare(strict_types=1);

namespace App\Filing;

/**
 * A document that now lives in the documents directory: its generated file name and its size.
 */
final readonly class StoredDocument
{
    public function __construct(
        public string $name,
        public int $sizeInBytes,
    ) {
    }
}
