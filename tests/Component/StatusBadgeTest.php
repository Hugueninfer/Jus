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
        yield 'active' => [CaseStatus::Active, 'text-bg-success', 'Em andamento'];
        yield 'suspended' => [CaseStatus::Suspended, 'text-bg-warning', 'Suspenso'];
        yield 'archived' => [CaseStatus::Archived, 'text-bg-secondary', 'Arquivado'];
    }

    #[DataProvider('statuses')]
    public function testShowsTheStatusAsTextAndColour(CaseStatus $status, string $class, string $label): void
    {
        $badge = $this->renderTwigComponent('StatusBadge', ['status' => $status])->crawler()->filter('span.badge');

        self::assertStringContainsString($class, (string) $badge->attr('class'));
        self::assertSame($label, trim($badge->text()));
        self::assertSame('true', $badge->filter('i')->attr('aria-hidden'));
    }
}
