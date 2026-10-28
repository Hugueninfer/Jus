<?php

declare(strict_types=1);

namespace App\Controller;

use App\Entity\User;
use App\Form\CaseSearchType;
use App\Repository\CaseEventRepository;
use App\Repository\CaseSearchCriteria;
use App\Repository\LegalCaseRepository;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Security\Http\Attribute\CurrentUser;

final class CaseController extends AbstractController
{
    #[Route('/processos', name: 'case_search', methods: ['GET'])]
    public function search(Request $request, #[CurrentUser] User $user, LegalCaseRepository $cases, CaseEventRepository $events): Response
    {
        $criteria = new CaseSearchCriteria();
        $form = $this->createForm(CaseSearchType::class, $criteria);
        $form->handleRequest($request);

        if ($form->isSubmitted() && !$form->isValid()) {
            // A view rather than the form itself: render() would answer 422 for an invalid form, but this is a plain GET
            // page (shareable, safe to reload) that explains the mistake next to the field, like any other result.
            return $this->render('case/search.html.twig', ['form' => $form->createView(), 'result' => null, 'latestEvents' => []]);
        }

        if (null !== $criteria->number) {
            $case = $cases->findVisibleOneByNumber($criteria->number, $user);
            if (null !== $case) {
                return $this->redirect('/processos/'.$case->getNumber()->formatted());
            }
        }

        $result = $cases->search($criteria, $user, $request->query->getInt('pagina', 1));
        if ($result->page > $result->pages) {
            return $this->redirectToRoute('case_search', [...$request->query->all(), 'pagina' => $result->pages]);
        }

        return $this->render('case/search.html.twig', [
            'form' => $form,
            'result' => $result,
            'latestEvents' => $events->latestForCases($result->cases),
        ]);
    }
}
