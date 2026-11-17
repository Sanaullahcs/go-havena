<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Support\ContentFieldRules;
use App\Support\DocumentCategories;
use App\Services\AgreementService;
use App\Services\UserActingContextService;
use App\Support\MediaUrl;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Symfony\Component\HttpFoundation\StreamedResponse;

class AgreementController extends Controller
{
    public function __construct(private readonly AgreementService $agreements) {}

    public function options(Request $request): JsonResponse
    {
        $communityId = $this->communityId($request);

        return response()->json($this->agreements->options($communityId, $request->string('search')->trim()->toString() ?: null));
    }

    public function index(Request $request): JsonResponse
    {
        $communityId = $this->communityId($request);
        $perPage = min(50, max(1, (int) $request->input('per_page', 20)));
        $query = DB::table('community_documents')
            ->where('community_id', $communityId)
            ->where('kind', 'agreement')
            ->whereNull('deleted_at');

        $this->applyAgreementSearch($query, $request);
        $this->applyAgreementCategory($query, $request);
        $counts = $this->agreementCounts(clone $query);

        $status = (string) $request->input('status', 'all');
        if ($status === 'overdue') {
            $this->applyOverdue($query);
        } elseif ($status === 'expired') {
            $this->applyExpired($query);
        } elseif ($status === 'signed') {
            $this->applySigned($query);
        } elseif ($status !== '' && $status !== 'all') {
            $query->where('publication_status', $status);
        }

        $sort = in_array($request->input('sort'), ['title', 'due_at', 'updated_at', 'published_at'], true)
            ? $request->input('sort')
            : 'updated_at';
        $direction = $request->input('direction') === 'asc' ? 'asc' : 'desc';
        $page = $query->orderBy($sort, $direction)->paginate($perPage);
        $data = collect($page->items())->map(fn ($doc) => $this->summary($doc, $request))->values();

        return response()->json([
            'data' => $data,
            'meta' => [
                'current_page' => $page->currentPage(),
                'last_page' => $page->lastPage(),
                'per_page' => $page->perPage(),
                'total' => $page->total(),
                'counts' => $counts,
            ],
        ]);
    }

    private function applyAgreementSearch($query, Request $request): void
    {
        if ($request->filled('search')) {
            $search = $request->string('search')->toString();
            $query->where(function ($inner) use ($search) {
                $inner->where('title', 'like', "%{$search}%")
                    ->orWhere('description', 'like', "%{$search}%")
                    ->orWhere('category', 'like', "%{$search}%");
            });
        }
        if ($request->filled('due_from')) {
            $query->whereDate('due_at', '>=', $request->input('due_from'));
        }
        if ($request->filled('due_to')) {
            $query->whereDate('due_at', '<=', $request->input('due_to'));
        }
    }

    private function applyAgreementCategory($query, Request $request): void
    {
        if (! $request->filled('category')) {
            return;
        }
        $category = trim((string) $request->input('category'));
        if ($category === '' || strcasecmp($category, 'all') === 0) {
            return;
        }
        if (DocumentCategories::isOther($category)) {
            $presets = array_map(static fn (string $name) => mb_strtolower($name), DocumentCategories::PRESETS);
            $placeholders = implode(',', array_fill(0, count($presets), '?'));
            $query->whereRaw('LOWER(category) NOT IN ('.$placeholders.')', $presets);

            return;
        }
        $query->whereRaw('LOWER(category) = ?', [mb_strtolower($category)]);
    }

    private function applyOverdue($query): void
    {
        $query->where('publication_status', 'published')
            ->where(fn ($due) => $this->whereDeadlinePassed($due, 'due_at'))
            ->where(fn ($open) => $this->whereDeadlineOpen($open, 'expires_at'))
            ->where(fn ($open) => $this->whereHasUnsigned($open));
    }

    private function applyExpired($query): void
    {
        $query->whereIn('publication_status', ['published', 'archived'])
            ->where(fn ($expired) => $this->whereDeadlinePassed($expired, 'expires_at'));
    }

    private function whereDeadlinePassed($query, string $column): void
    {
        $today = now()->toDateString();
        $query->whereNotNull($column)
            ->where(function ($passed) use ($column, $today) {
                $passed->whereDate($column, '<', $today)
                    ->orWhere(function ($timed) use ($column, $today) {
                        $timed->whereDate($column, $today)
                            ->whereRaw('TIME('.$column.') <> ?', ['00:00:00'])
                            ->where($column, '<', now());
                    });
            });
    }

    private function whereDeadlineOpen($query, string $column): void
    {
        $today = now()->toDateString();
        $query->where(function ($open) use ($column, $today) {
            $open->whereNull($column)
                ->orWhereDate($column, '>', $today)
                ->orWhere(function ($todayOpen) use ($column, $today) {
                    $todayOpen->whereDate($column, $today)
                        ->where(function ($still) use ($column) {
                            $still->whereRaw('TIME('.$column.') = ?', ['00:00:00'])
                                ->orWhere($column, '>=', now());
                        });
                });
        });
    }

    /**
     * @return array{all: int, draft: int, published: int, archived: int, revoked: int, superseded: int, overdue: int, expired: int, pending: int, signed: int}
     */
    private function agreementCounts($query): array
    {
        return [
            'all' => (clone $query)->count(),
            'draft' => (clone $query)->where('publication_status', 'draft')->count(),
            'published' => (clone $query)->where('publication_status', 'published')->count(),
            'archived' => (clone $query)->where('publication_status', 'archived')->count(),
            'revoked' => (clone $query)->where('publication_status', 'revoked')->count(),
            'superseded' => (clone $query)->where('publication_status', 'superseded')->count(),
            'overdue' => (clone $query)->tap(fn ($overdue) => $this->applyOverdue($overdue))->count(),
            'expired' => (clone $query)->tap(fn ($expired) => $this->applyExpired($expired))->count(),
            'pending' => (clone $query)->tap(fn ($pending) => $this->applyPending($pending))->count(),
            'signed' => (clone $query)->tap(fn ($signed) => $this->applySigned($signed))->count(),
        ];
    }

    private function applyPending($query): void
    {
        $query->where('publication_status', 'published')
            ->where(fn ($open) => $this->whereDeadlineOpen($open, 'expires_at'))
            ->where(fn ($due) => $this->whereDeadlineOpen($due, 'due_at'))
            ->where(fn ($open) => $this->whereHasUnsigned($open));
    }

    private function applySigned($query): void
    {
        $query->where('publication_status', 'published')
            ->where(fn ($open) => $this->whereDeadlineOpen($open, 'expires_at'))
            ->whereExists(function ($sub) {
                $sub->selectRaw('1')
                    ->from('community_document_assignments')
                    ->whereColumn('community_document_assignments.document_id', 'community_documents.id')
                    ->where('status', 'signed');
            })
            ->whereNotExists(function ($sub) {
                $sub->selectRaw('1')
                    ->from('community_document_assignments')
                    ->whereColumn('community_document_assignments.document_id', 'community_documents.id')
                    ->whereIn('status', ['pending', 'viewed']);
            });
    }

    private function whereHasUnsigned($query): void
    {
        $query->whereExists(function ($sub) {
            $sub->selectRaw('1')
                ->from('community_document_assignments')
                ->whereColumn('community_document_assignments.document_id', 'community_documents.id')
                ->whereIn('status', ['pending', 'viewed']);
        });
    }

    public function store(Request $request): JsonResponse
    {
        $communityId = $this->communityId($request);
        $text = ContentFieldRules::rules();
        $data = $request->validate([
            'title' => $text['title'],
            'category' => 'required|string|max:100',
            'description' => $text['description'],
            'due_at' => 'nullable|date',
            'effective_at' => 'nullable|date',
            'expires_at' => 'nullable|date',
            'file' => 'required|file|max:10240',
        ], ContentFieldRules::messages());
        $fileMeta = $this->agreements->storeFile($request->file('file'), $communityId);
        $this->ensureCategory($communityId, $data['category']);
        $id = $this->agreements->createDraft($communityId, (int) $request->user()->id, $data, $fileMeta);

        return response()->json([
            'data' => $this->summary($this->findInCommunity($id, $communityId), $request),
            'message' => 'Agreement draft saved.',
        ], 201);
    }

    public function show(Request $request, int $id): JsonResponse
    {
        $communityId = $this->communityId($request);
        $document = $this->findInCommunity($id, $communityId);
        abort_if(($document->kind ?? '') !== 'agreement', 404, 'Agreement not found.');
        $summary = $this->summary($document, $request);
        $summary['recipients'] = $this->agreements->recipients($id, $request);

        return response()->json(['data' => $summary]);
    }

    public function publish(Request $request, int $id): JsonResponse
    {
        $communityId = $this->communityId($request);
        $document = $this->findInCommunity($id, $communityId);
        $data = $request->validate([
            'scope' => 'required|in:all,residents,units',
            'user_ids' => 'required_if:scope,residents|array',
            'user_ids.*' => 'integer',
            'unit_ids' => 'required_if:scope,units|array',
            'unit_ids.*' => 'integer',
            'notify' => 'sometimes|boolean',
        ]);
        $result = $this->agreements->publish(
            $document,
            (int) $request->user()->id,
            $data['scope'],
            $data['user_ids'] ?? [],
            $data['unit_ids'] ?? [],
            (bool) ($data['notify'] ?? true),
        );

        return response()->json([
            'data' => $this->summary($result['document'], $request),
            'assigned' => $result['assigned'],
            'already_published' => $result['already_published'],
            'message' => $result['already_published']
                ? 'This agreement is already published.'
                : 'Agreement published.',
        ]);
    }

    public function remind(Request $request, int $id): JsonResponse
    {
        $document = $this->findInCommunity($id, $this->communityId($request));
        $data = $request->validate(['assignment_id' => 'nullable|integer']);
        $result = $this->agreements->remind($document, $data['assignment_id'] ?? null, (int) $request->user()->id);

        return response()->json([
            'message' => $result['sent'] === 1 ? 'Reminder sent.' : "Reminders sent: {$result['sent']}.",
            'sent' => $result['sent'],
            'skipped' => $result['skipped'],
        ]);
    }

    public function newVersion(Request $request, int $id): JsonResponse
    {
        $communityId = $this->communityId($request);
        $current = $this->findInCommunity($id, $communityId);
        abort_if(($current->kind ?? '') !== 'agreement', 404, 'Agreement not found.');
        abort_if($current->publication_status === 'draft', 422, 'Publish or delete the current draft before creating a new version.');
        $text = ContentFieldRules::rules(false);
        $data = $request->validate([
            'title' => $text['title'],
            'category' => 'sometimes|string|max:100',
            'description' => $text['description'],
            'due_at' => 'nullable|date',
            'effective_at' => 'nullable|date',
            'expires_at' => 'nullable|date',
            'file' => 'required|file|max:10240',
        ], ContentFieldRules::messages());
        $fileMeta = $this->agreements->storeFile($request->file('file'), $communityId);
        $fields = [
            'title' => $data['title'] ?? $current->title,
            'category' => $data['category'] ?? $current->category,
            'description' => $data['description'] ?? $current->description,
            'due_at' => $data['due_at'] ?? null,
            'effective_at' => $data['effective_at'] ?? null,
            'expires_at' => $data['expires_at'] ?? null,
            'version' => ((int) $current->version) + 1,
            'supersedes_id' => (int) $current->id,
        ];
        $this->ensureCategory($communityId, $fields['category']);
        $newId = $this->agreements->createDraft($communityId, (int) $request->user()->id, $fields, $fileMeta);

        return response()->json([
            'data' => $this->summary($this->findInCommunity($newId, $communityId), $request),
            'message' => 'New agreement version saved as a draft.',
        ], 201);
    }

    public function archive(Request $request, int $id): JsonResponse
    {
        $document = $this->findInCommunity($id, $this->communityId($request));

        return response()->json([
            'data' => $this->summary($this->agreements->archive($document, (int) $request->user()->id), $request),
            'message' => 'Agreement archived.',
        ]);
    }

    public function revoke(Request $request, int $id): JsonResponse
    {
        $document = $this->findInCommunity($id, $this->communityId($request));

        return response()->json([
            'data' => $this->summary($this->agreements->revoke($document, (int) $request->user()->id), $request),
            'message' => 'Agreement revoked. Signed copies are kept.',
        ]);
    }

    public function export(Request $request, int $id): StreamedResponse
    {
        $document = $this->findInCommunity($id, $this->communityId($request));
        $csv = $this->agreements->exportCsv($document, $request);

        return response()->streamDownload(function () use ($csv) {
            echo $csv;
        }, 'agreement-'.$id.'-signatures.csv', ['Content-Type' => 'text/csv']);
    }

    public function sign(Request $request, int $id): JsonResponse
    {
        $document = $this->residentDocument($request, $id);
        $data = $request->validate([
            'version' => 'required|integer',
            'assignment_id' => 'required|integer',
            'method' => 'required|in:draw,type',
            'consent' => 'accepted',
            'typed_name' => 'nullable|string|max:120',
            'strokes' => 'nullable|array',
            'placement' => 'nullable|array',
            'placement.page' => 'required_with:placement|integer|min:1|max:200',
            'placement.x' => 'required_with:placement|numeric|min:0|max:1',
            'placement.y' => 'required_with:placement|numeric|min:0|max:1',
            'placement.width' => 'required_with:placement|numeric|min:0.05|max:1',
            'placement.height' => 'required_with:placement|numeric|min:0.03|max:1',
        ]);
        $result = $this->agreements->sign($document, $request->user(), $data, $request);

        return response()->json([
            'data' => $result,
            'message' => $result['replayed'] ? 'This agreement was already signed.' : 'Agreement signed.',
        ], $result['replayed'] ? 200 : 201);
    }

    public function decline(Request $request, int $id): JsonResponse
    {
        $document = $this->residentDocument($request, $id);
        $data = $request->validate(['assignment_id' => 'required|integer']);
        $assignment = $this->agreements->decline($document, $request->user(), (int) $data['assignment_id']);

        return response()->json([
            'data' => ['assignment_id' => (int) $assignment->id, 'signature_status' => $assignment->status],
            'message' => 'Agreement declined.',
        ]);
    }

    public function signedLink(Request $request, int $id): JsonResponse
    {
        $user = $request->user();
        $communityId = UserActingContextService::requireCurrentCommunityId($user);
        $document = DB::table('community_documents')->where('id', $id)->where('community_id', $communityId)->whereNull('deleted_at')->first();
        abort_if(! $document, 404, 'Document not found.');
        $assignmentId = (int) $request->input('assignment_id');
        $isAdmin = $this->isAdmin($user);
        $path = $this->agreements->ownedSignedPath($assignmentId, (int) $user->id, $isAdmin, $communityId);
        abort_if(! $path, 404, 'Signed agreement not found.');

        return response()->json([
            'url' => $this->agreements->temporaryFileUrl($assignmentId, $request),
            'expires_in' => 900,
        ]);
    }

    public function downloadSigned(Request $request, int $assignment): StreamedResponse
    {
        abort_unless(
            $this->agreements->validFileSignature($assignment, $request->query('expires'), $request->query('signature')),
            403,
            'This download link has expired.',
        );
        $row = DB::table('community_document_assignments')->where('id', $assignment)->where('status', 'signed')->first();
        abort_if(! $row || ! $row->signed_file_path, 404, 'Signed agreement not found.');
        $absolute = $this->agreements->absoluteSignedPath($row->signed_file_path);
        abort_unless(is_file($absolute), 404, 'Signed agreement not found.');
        $document = DB::table('community_documents')->where('id', $row->document_id)->first();
        $name = preg_replace('/[^A-Za-z0-9._-]+/', '-', (string) ($document->title ?? 'agreement')).'-signed.pdf';
        $disposition = $request->boolean('download') ? 'attachment' : 'inline';

        return response()->stream(function () use ($absolute) {
            $handle = fopen($absolute, 'rb');
            if ($handle) {
                fpassthru($handle);
                fclose($handle);
            }
        }, 200, [
            'Content-Type' => 'application/pdf',
            'Content-Disposition' => $disposition.'; filename="'.$name.'"',
            'Cache-Control' => 'private, max-age=60',
        ]);
    }

    private function summary(object $document, Request $request): array
    {
        $stats = ($document->kind ?? '') === 'agreement' ? $this->agreements->stats((int) $document->id) : null;
        $creator = DB::table('users')->where('id', $document->created_by)->value('name');
        $community = DB::table('communities')->where('id', $document->community_id)->value('name');

        return [
            'id' => (int) $document->id,
            'community_id' => (int) $document->community_id,
            'community_name' => $community,
            'title' => $document->title,
            'category' => $document->category,
            'description' => $document->description,
            'file_url' => MediaUrl::toPublic($document->file_path, $request),
            'file_name' => $document->file_name,
            'file_size' => (int) $document->file_size,
            'page_count' => $document->page_count ? (int) $document->page_count : null,
            'kind' => $document->kind,
            'publication_status' => $document->publication_status,
            'signature_required' => (bool) $document->signature_required,
            'due_at' => $document->due_at,
            'effective_at' => $document->effective_at,
            'expires_at' => $document->expires_at,
            'version' => (int) $document->version,
            'supersedes_id' => $document->supersedes_id ? (int) $document->supersedes_id : null,
            'published_at' => $document->published_at,
            'assignment_scope' => $document->assignment_scope,
            'created_by' => (int) $document->created_by,
            'created_by_name' => $creator,
            'created_at' => $document->created_at,
            'updated_at' => $document->updated_at,
            'stats' => $stats,
        ];
    }

    private function residentDocument(Request $request, int $id): object
    {
        $communityId = UserActingContextService::requireCurrentCommunityId($request->user());
        $document = DB::table('community_documents')
            ->where('id', $id)
            ->where('community_id', $communityId)
            ->whereNull('deleted_at')
            ->first();
        $signable = $document
            && (($document->kind ?? '') === 'agreement'
                || (($document->kind ?? 'document') === 'document' && (bool) ($document->signature_required ?? false)));
        abort_if(! $signable, 404, 'Agreement not found.');

        return $document;
    }

    private function findInCommunity(int $id, int $communityId): object
    {
        $document = DB::table('community_documents')
            ->where('id', $id)
            ->where('community_id', $communityId)
            ->whereNull('deleted_at')
            ->first();
        abort_if(! $document, 404, 'Agreement not found.');

        return $document;
    }

    private function communityId(Request $request): int
    {
        $user = $request->user();
        if (($user->role === 'admin' || $user->is_admin) && $request->filled('community_id')) {
            return (int) $request->community_id;
        }

        return UserActingContextService::requireCurrentCommunityId($user);
    }

    private function isAdmin($user): bool
    {
        return $user->role === 'community_admin' || $user->role === 'admin' || $user->is_admin;
    }

    private function ensureCategory(int $communityId, string $name): void
    {
        $name = trim($name);
        if ($name === '') {
            return;
        }
        $exists = DB::table('community_document_categories')
            ->where('community_id', $communityId)
            ->where('name', $name)
            ->exists();
        if ($exists) {
            return;
        }
        DB::table('community_document_categories')->insert([
            'community_id' => $communityId,
            'name' => $name,
            'created_at' => now(),
            'updated_at' => now(),
        ]);
    }
}
