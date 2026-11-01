<?php

declare(strict_types=1);

namespace App\Controller;

use App\Filing\DocumentStorage;
use App\Repository\DocumentRepository;
use App\Security\LegalCaseVoter;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\BinaryFileResponse;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\HttpFoundation\ResponseHeaderBag;
use Symfony\Component\Routing\Attribute\Route;

final class DocumentController extends AbstractController
{
    private const string NOT_FOUND = 'Documento não encontrado.';

    #[Route('/documentos/{id}', name: 'document_download', requirements: ['id' => '\d+'], methods: ['GET'])]
    public function __invoke(string $id, DocumentRepository $documents, DocumentStorage $storage): Response
    {
        // Not "int $id": PHP answers a number too large for an integer with a TypeError (a 500). What is not a plain integer
        // (too large, or with leading zeros) is no document's address.
        $key = filter_var($id, \FILTER_VALIDATE_INT);
        $document = false === $key ? null : $documents->findOneWithCase($key);

        // The rule of every route of a case (the page, the filing and this one; design.md 5.5): a document of a case the
        // user may not view is answered exactly like one that does not exist, so the response never reveals that it is there.
        // Downloading asks for VIEW only, never FILE. Viewing is settled before the disk is touched, and a PDF that is gone
        // from the disk gets the same answer as well.
        if (null === $document || !$this->isGranted(LegalCaseVoter::VIEW, $document->getEvent()->getLegalCase())) {
            throw $this->createNotFoundException(self::NOT_FOUND);
        }

        $path = $storage->pathOf($document->getStoredFilename());
        if (null === $path) {
            throw $this->createNotFoundException(self::NOT_FOUND);
        }

        // Not public: the constructor makes the response cacheable by shared caches unless told otherwise.
        $response = new BinaryFileResponse($path, public: false);
        $response->setPrivate();
        // Always a PDF, never what the bytes look like to the browser: it is saved, not shown.
        $response->headers->set('Content-Type', 'application/pdf');
        $response->headers->set('X-Content-Type-Options', 'nosniff');
        // The name has an ASCII fallback for the old clients (the real one goes in filename*).
        $response->setContentDisposition(ResponseHeaderBag::DISPOSITION_ATTACHMENT, self::downloadName($document->getOriginalFilename()));

        return $response;
    }

    /**
     * The name the file is saved under: the one it was sent with, made safe for a header and with its ".pdf" extension.
     * The stored name was cut to 255 characters (which can drop the extension) and comes from the sender, so a path
     * separator or a control character (a line break would split the header) becomes an underscore.
     */
    private static function downloadName(string $originalFilename): string
    {
        $name = trim(preg_replace('/[\x00-\x1f\x7f\/\\\\]/', '_', $originalFilename) ?? '');

        if ('' === $name) {
            return 'documento.pdf';
        }

        return str_ends_with(strtolower($name), '.pdf') ? $name : $name.'.pdf';
    }
}
