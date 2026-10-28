<?php

declare(strict_types=1);

namespace App\ValueResolver;

use App\Domain\CnjNumber;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpKernel\Attribute\AsTargetedValueResolver;
use Symfony\Component\HttpKernel\Controller\ValueResolverInterface;
use Symfony\Component\HttpKernel\ControllerMetadata\ArgumentMetadata;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;

/**
 * Turns the {numero} route value into a CnjNumber; an invalid number is a 404 before any query.
 */
#[AsTargetedValueResolver('cnj_number')]
final class CnjNumberValueResolver implements ValueResolverInterface
{
    /**
     * @return iterable<CnjNumber>
     */
    public function resolve(Request $request, ArgumentMetadata $argument): iterable
    {
        $value = $request->attributes->get($argument->getName());
        if (!\is_string($value)) {
            return [];
        }

        return [CnjNumber::tryFromString($value) ?? throw new NotFoundHttpException('Processo não encontrado.')];
    }
}
