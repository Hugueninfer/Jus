<?php

declare(strict_types=1);

namespace App\Tests\Component;

use App\Domain\LegalCase\CaseStatus;
use PHPUnit\Framework\Attributes\DataProvider;
use Symfony\Bundle\FrameworkBundle\Test\KernelTestCase;
use Symfony\UX\TwigComponent\Test\InteractsWithTwigComponents;

final class StatusBadgeTest extends KernelTestCase
{
    use InteractsWithTwigComponents;

    /**
     * @return iterable<string, array{CaseStatus, string, string}>
     */
    public static function statuses(): iterable
    {
        yield 'active' => [CaseStatus::Active, 'jus-badge-success', 'Em andamento'];
        yield 'suspended' => [CaseStatus::Suspended, 'jus-badge-warning', 'Suspenso'];
        yield 'archived' => [CaseStatus::Archived, 'jus-badge-neutral', 'Arquivado'];
    }

    #[DataProvider('statuses')]
    public function testShowsTheStatusAsTextAndColour(CaseStatus $status, string $tone, string $label): void
    {
        $badge = $this->renderTwigComponent('StatusBadge', ['status' => $status])->crawler()->filter('span.badge');

        // A pill in the tinted tone of the status (the fill and the label come from the theme's tokens), never a solid
        // Bootstrap colour.
        self::assertSame(['badge', 'rounded-pill', 'jus-badge', $tone], explode(' ', (string) $badge->attr('class')));
        self::assertSame($label, trim($badge->text()));
        self::assertSame('true', $badge->filter('i')->attr('aria-hidden'));
    }
}
