<?php

declare(strict_types=1);

namespace App\Filing;

/**
 * What a filing may carry. The form constraints, the attributes of the upload component and the help text all read
 * these constants, so the three can never disagree.
 */
final class FilingLimits
{
    public const int MAX_FILES = 5;

    /** In bytes, per file. */
    public const int MAX_FILE_SIZE = 10 * 1024 * 1024;

    /**
     * The same limit in megabytes (counted in 1024 * 1024 bytes, as the upload component does), for the texts that name
     * it. PHP refuses to declare it when the limit is not a whole number of megabytes.
     */
    public const int MAX_FILE_SIZE_IN_MEGABYTES = self::MAX_FILE_SIZE / (1024 * 1024);

    public const string MIME_TYPE = 'application/pdf';

    /** In characters. */
    public const int DESCRIPTION_MAX_LENGTH = 2000;
}
