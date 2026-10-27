<?php

declare(strict_types=1);

namespace App\Tests\Component;

use PHPUnit\Framework\Attributes\DataProvider;
use Symfony\Bundle\FrameworkBundle\Test\KernelTestCase;
use Symfony\UX\TwigComponent\Test\InteractsWithTwigComponents;

final class AlertTest extends KernelTestCase
{
    use InteractsWithTwigComponents;

    public function testErrorsAreAnnouncedAsAlerts(): void
    {
        $alert = $this->renderTwigComponent('Alert', ['type' => 'danger'], 'Algo deu errado.')->crawler()->filter('div.alert');

        self::assertSame('alert', $alert->attr('role'));
        self::assertStringContainsString('alert-danger', (string) $alert->attr('class'));
        self::assertStringContainsString('Algo deu errado.', $alert->text());
        self::assertCount(0, $alert->filter('button'));
    }

    public function testTheConventionalErrorFlashTypeIsShownAsDanger(): void
    {
        $alert = $this->renderTwigComponent('Alert', ['type' => 'error'], 'Falhou.')->crawler()->filter('div.alert');

        self::assertStringContainsString('alert-danger', (string) $alert->attr('class'));
        self::assertSame('alert', $alert->attr('role'));
        self::assertSame('Erro:', $alert->filter('.visually-hidden')->text());
    }

    public function testWarningsAreAnnouncedAsAlerts(): void
    {
        $alert = $this->renderTwigComponent('Alert', ['type' => 'warning'], 'Atenção.')->crawler()->filter('div.alert');

        self::assertStringContainsString('alert-warning', (string) $alert->attr('class'));
        self::assertSame('alert', $alert->attr('role'));
    }

    public function testSuccessIsAPoliteStatus(): void
    {
        $alert = $this->renderTwigComponent('Alert', ['type' => 'success'], 'Salvo.')->crawler()->filter('div.alert');

        self::assertSame('status', $alert->attr('role'));
        self::assertStringContainsString('alert-success', (string) $alert->attr('class'));
    }

    public function testUnknownTypesFallBackToInfo(): void
    {
        $alert = $this->renderTwigComponent('Alert', ['type' => 'bogus'], 'Aviso.')->crawler()->filter('div.alert');

        self::assertStringContainsString('alert-info', (string) $alert->attr('class'));
        self::assertSame('status', $alert->attr('role'));
        self::assertSame('Informação:', $alert->filter('.visually-hidden')->text());
    }

    /**
     * @return iterable<string, array{string, string, string}>
     */
    public static function severities(): iterable
    {
        yield 'danger' => ['danger', 'bi-x-octagon-fill', 'Erro:'];
        yield 'warning' => ['warning', 'bi-exclamation-triangle-fill', 'Atenção:'];
        yield 'success' => ['success', 'bi-check-circle-fill', 'Sucesso:'];
        yield 'info' => ['info', 'bi-info-circle-fill', 'Informação:'];
    }

    #[DataProvider('severities')]
    public function testTellsTheSeverityWithoutRelyingOnColour(string $type, string $icon, string $prefix): void
    {
        $alert = $this->renderTwigComponent('Alert', ['type' => $type], 'Mensagem.')->crawler()->filter('div.alert');

        $icons = $alert->filter('i.bi');
        self::assertCount(1, $icons);
        self::assertStringContainsString($icon, (string) $icons->attr('class'));
        self::assertSame('true', $icons->attr('aria-hidden'));
        // Screen readers hear the severity before the message; sighted users see the icon.
        self::assertSame($prefix, $alert->filter('.visually-hidden')->text());
        self::assertSame($prefix.' Mensagem.', trim(preg_replace('/\s+/', ' ', $alert->text()) ?? ''));
    }

    public function testDismissibleAlertsHaveACloseButton(): void
    {
        $alert = $this->renderTwigComponent('Alert', ['type' => 'warning', 'dismissible' => true], 'Atenção.')->crawler()->filter('div.alert');

        self::assertStringContainsString('alert-dismissible', (string) $alert->attr('class'));
        self::assertSame('Fechar', $alert->filter('button.btn-close')->attr('aria-label'));
        self::assertSame('alert', $alert->filter('button.btn-close')->attr('data-bs-dismiss'));
    }
}
