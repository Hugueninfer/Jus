<?php

declare(strict_types=1);

namespace App\Controller;

use App\Domain\CnjNumber;
use App\Entity\User;
use App\Form\CaseSearchType;
use App\Presentation\CaseDeadlines;
use App\Presentation\CaseDocumentsTable;
use App\Repository\CaseEventRepository;
use App\Repository\CaseSearchCriteria;
use App\Repository\LegalCaseRepository;
use App\Security\LegalCaseVoter;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\HttpKernel\Attribute\ValueResolver;
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
                return $this->redirectToRoute('case_show', ['numero' => $case->getNumber()->formatted()]);
            }
        }

        $result = $cases->search($criteria, $user, self::pageNumber($request));
        if ($result->page > $result->pages) {
            return $this->redirectToRoute('case_search', [...$request->query->all(), 'pagina' => $result->pages]);
        }

        return $this->render('case/search.html.twig', [
            'form' => $form,
            'result' => $result,
            'latestEvents' => $events->latestForCases($result->cases),
        ]);
    }

    #[Route('/processos/{numero}', name: 'case_show', methods: ['GET'])]
    public function show(
        #[ValueResolver('cnj_number')] CnjNumber $numero,
        Request $request,
        LegalCaseRepository $cases,
        CaseDeadlines $deadlines,
        CaseDocumentsTable $documents,
    ): Response {
        if ($request->attributes->getString('numero') !== $numero->formatted()) {
            // The route value goes last: a "numero" in the query string must not replace it.
            return $this->redirectToRoute('case_show', [...$request->query->all(), 'numero' => $numero->formatted()], Response::HTTP_MOVED_PERMANENTLY);
        }

        $case = $cases->findOneForPage($numero) ?? throw $this->createNotFoundException('Processo não encontrado.');
        // findOneForPage() applies no visibility rule: this is the only thing keeping a confidential case away from other lawyers.
        $this->denyAccessUnlessGranted(LegalCaseVoter::VIEW, $case);

        $tab = 'documentos' === self::queryString($request, 'aba') ? 'documentos' : 'movimentacoes';

        return $this->render('case/show.html.twig', [
            'case' => $case,
            'deadlines' => $deadlines->forCase($case),
            'tab' => $tab,
            'documentColumns' => $documents->columns(),
            'documentRows' => 'documentos' === $tab ? $documents->rows($case) : [],
            'sort' => self::queryString($request, 'sort'),
            'direction' => self::queryString($request, 'direction'),
        ]);
    }

    /**
     * A query value that is a non-empty string; anything else (missing, empty, a list) counts as not given, so a
     * malformed link shows the default view instead of an error.
     */
    private static function queryString(Request $request, string $key): ?string
    {
        $value = $request->query->all()[$key] ?? null;

        return \is_string($value) && '' !== $value ? $value : null;
    }

    /**
     * The requested page; anything that is not an integer (text, empty, decimal, a list) is the first page.
     */
    private static function pageNumber(Request $request): int
    {
        $page = $request->query->all()['pagina'] ?? null;

        if (!\is_string($page)) {
            return 1;
        }

        $number = filter_var($page, \FILTER_VALIDATE_INT);

        return false === $number ? 1 : $number;
    }
}
