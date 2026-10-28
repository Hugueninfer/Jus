<?php

declare(strict_types=1);

namespace App\Domain\Text;

/**
 * Search form of a name: lower case, no accents, single spaces ("  João  ÁLVARO " → "joao alvaro").
 *
 * SQLite only folds ASCII letters in LIKE and lower(), so names are stored and searched in this form.
 */
final class SearchText
{
    public static function normalize(string $text): string
    {
        $decomposed = \Normalizer::normalize($text, \Normalizer::FORM_D);
        if (!\is_string($decomposed)) {
            return ''; // not valid UTF-8
        }

        $withoutMarks = preg_replace('/\p{Mn}+/u', '', $decomposed) ?? '';
        $singleSpaced = preg_replace('/\s+/u', ' ', $withoutMarks) ?? '';

        return mb_strtolower(trim($singleSpaced));
    }
}
