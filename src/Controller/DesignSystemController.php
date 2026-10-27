<?php

declare(strict_types=1);

namespace App\Controller;

use App\DesignSystem\SampleData;
use App\Form\CnjNumberType;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Routing\Attribute\Route;

final class DesignSystemController extends AbstractController
{
    #[Route('/design-system', name: 'design_system', methods: ['GET'])]
    public function index(Request $request, SampleData $samples): Response
    {
        $cnjForm = $this->createFormBuilder(options: ['csrf_protection' => false])
            ->add('numero', CnjNumberType::class, ['label' => 'Número do processo', 'help' => 'Com ou sem máscara.', 'required' => false])
            ->getForm();

        return $this->render('design_system/index.html.twig', [
            'samples' => [
                'case' => $samples->legalCase(),
                'confidentialCase' => $samples->confidentialCase(),
                'deadlines' => $samples->deadlines(),
                'columns' => $samples->documentColumns(),
                'rows' => $samples->documentRows(),
            ],
            'sort' => $request->query->getString('sort') ?: null,
            'direction' => $request->query->getString('direction', 'asc'),
            'cnjForm' => $cnjForm->createView(),
        ]);
    }
}
