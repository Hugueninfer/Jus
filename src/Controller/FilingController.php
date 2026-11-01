<?php

declare(strict_types=1);

namespace App\Controller;

use App\Domain\CnjNumber;
use App\Entity\User;
use App\Filing\FilingService;
use App\Form\FilingData;
use App\Form\FilingFormType;
use App\Repository\LegalCaseRepository;
use App\Security\LegalCaseVoter;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\Form\FormError;
use Symfony\Component\Form\Util\ServerParams;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\RequestStack;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\HttpKernel\Attribute\ValueResolver;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Security\Http\Attribute\CurrentUser;

final class FilingController extends AbstractController
{
    #[Route('/processos/{numero}/peticionar', name: 'case_file', methods: ['GET', 'POST'])]
    public function __invoke(
        #[ValueResolver('cnj_number')] CnjNumber $numero,
        Request $request,
        #[CurrentUser] User $lawyer,
        LegalCaseRepository $cases,
        FilingService $filing,
        RequestStack $requests,
    ): Response {
        if ($request->attributes->getString('numero') !== $numero->formatted()) {
            // The route value goes last: a "numero" in the query string must not replace it.
            return $this->redirectToRoute('case_file', [...$request->query->all(), 'numero' => $numero->formatted()], Response::HTTP_MOVED_PERMANENTLY);
        }

        $case = $cases->findOneWithParties($numero);
        // Viewing first, filing second, as on the case page: a case the user may not view is answered exactly like one that
        // does not exist (404), and only for a case they may view is the refusal to file a 403. Both before the form is
        // even built, so nothing of a request that is not allowed is read.
        if (null === $case || !$this->isGranted(LegalCaseVoter::VIEW, $case)) {
            throw $this->createNotFoundException('Processo não encontrado.');
        }
        $this->denyAccessUnlessGranted(LegalCaseVoter::FILE, $case);

        $data = new FilingData();
        $form = $this->createForm(FilingFormType::class, $data);
        $form->handleRequest($request);

        if ($form->isSubmitted() && (new ServerParams($requests))->hasPostMaxSizeBeenExceeded()) {
            // PHP dropped the whole body, so the form has only its one error ("the request was too large"); every field
            // being empty is the consequence, not something to report. A new, untouched form carries that error alone.
            $blank = $this->createForm(FilingFormType::class, new FilingData());
            foreach ($form->getErrors() as $error) {
                $blank->addError(new FormError($error->getMessage(), $error->getMessageTemplate(), $error->getMessageParameters()));
            }

            return $this->render('case/file.html.twig', ['case' => $case, 'form' => $blank], new Response(status: Response::HTTP_UNPROCESSABLE_ENTITY));
        }

        if ($form->isSubmitted() && $form->isValid()) {
            \assert(null !== $data->type && null !== $data->description); // the constraints of FilingData

            // Any failure inside the service closes the entity manager (it rolled its transaction back): there is nothing
            // to recover here, so it is left to reach the error page, which does not use it. The PDFs it stored are
            // already removed again.
            $filing->file($case, $lawyer, $data->type, $data->description, $data->files);

            $this->addFlash('success', 'Petição juntada ao processo.');

            return $this->redirectToRoute('case_show', ['numero' => $case->getNumber()->formatted(), 'aba' => 'movimentacoes', '_fragment' => 'andamento'], Response::HTTP_SEE_OTHER);
        }

        // The form itself, not its view: render() answers 422 for a submitted form that is not valid.
        return $this->render('case/file.html.twig', ['case' => $case, 'form' => $form]);
    }
}
