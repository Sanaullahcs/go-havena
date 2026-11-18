<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Support\AgreementDates;
use App\Support\ContentFieldRules;
use App\Support\DocumentCategories;
use App\Services\ActivityLogService;
use App\Services\AgreementService;
use App\Services\UserActingContextService;
use App\Support\MediaUrl;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\UploadedFile;
use Carbon\Carbon;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class CommunityDocumentController extends Controller
{
    private const ALLOWED_MIMES = [
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'image/jpeg',
        'image/png',
        'image/webp',
    ];

    /* ─── helpers ─────────────────────────────────────────────── */

    private function resolveCommunityId(Request $request, $user): int
    {
        if ($this->isPlatformAdmin($user) && $request->filled('community_id')) {
            return (int) $request->community_id;
        }
        return UserActingContextService::requireCurrentCommunityId($user);
    }

    private function isCommunityAdmin($user): bool
    {
        return $user->role === 'community_admin' || $user->role === 'admin' || $user->is_admin;
    }

    private function isPlatformAdmin($user): bool
    {
        return $user->role === 'admin' || $user->is_admin;
    }

    private function formatBytes(int $bytes): string
    {
        if ($bytes >= 1048576) {
            return round($bytes / 1048576, 1) . ' MB';
        }
        if ($bytes >= 1024) {
            return round($bytes / 1024) . ' KB';
        }

        return $bytes . ' B';
    }

    private function formatDocument(object $doc, Request $request): array
    {
        return [
            'id'               => (int) $doc->id,
            'community_id'     => (int) $doc->community_id,
            'title'            => $doc->title,
            'category'         => $doc->category,
            'description'      => $doc->description,
            'file_url'         => MediaUrl::toPublic($doc->file_path, $request),
            'file_name'        => $doc->file_name,
            'file_size'        => (int) $doc->file_size,
            'file_size_label'  => $this->formatBytes((int) $doc->file_size),
            'mime_type'        => $doc->mime_type,
            'download_count'   => (int) $doc->download_count,
            'status'           => $doc->status,
            'kind'             => $doc->kind ?? 'document',
            'publication_status' => $doc->publication_status ?? 'published',
            'signature_required' => (bool) ($doc->signature_required ?? false),
            'allow_late_signing' => (bool) ($doc->allow_late_signing ?? false),
            'due_at'           => $doc->due_at ?? null,
            'effective_at'     => $doc->effective_at ?? null,
            'expires_at'       => $doc->expires_at ?? null,
            'version'          => (int) ($doc->version ?? 1),
            'version_root_id'  => isset($doc->version_root_id) && $doc->version_root_id ? (int) $doc->version_root_id : (int) $doc->id,
            'supersedes_id'    => isset($doc->supersedes_id) && $doc->supersedes_id ? (int) $doc->supersedes_id : null,
            'published_at'     => $doc->published_at ?? null,
            'modified_after_publish' => $this->modifiedAfterPublish($doc),
            'assignment_scope' => $doc->assignment_scope ?? null,
            'page_count'       => isset($doc->page_count) && $doc->page_count ? (int) $doc->page_count : null,
            'created_by'       => (int) $doc->created_by,
            'created_at'       => $doc->created_at,
            'updated_at'       => $doc->updated_at,
        ];
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
            'name'         => $name,
            'created_at'   => now(),
            'updated_at'   => now(),
        ]);
    }

    /** Managed categories + any category still present on documents (with counts). */
    private function buildCategories(int $communityId, bool $activeOnly = false): array
    {
        $countsQuery = DB::table('community_documents')
            ->where('community_id', $communityId)
            ->whereNull('deleted_at')
            ->where(function ($query) {
                $query->where('kind', 'document')->orWhereNull('kind');
            });

        if ($activeOnly) {
            $countsQuery->where('status', 'active');
        }

        $counts = $countsQuery
            ->selectRaw('category, COUNT(*) as count')
            ->groupBy('category')
            ->pluck('count', 'category');

        $managed = DB::table('community_document_categories')
            ->where('community_id', $communityId)
            ->orderBy('name')
            ->pluck('name');

        $names = $managed
            ->merge($counts->keys())
            ->map(fn ($n) => trim((string) $n))
            ->filter()
            ->unique(fn ($n) => mb_strtolower($n))
            ->sort(SORT_NATURAL | SORT_FLAG_CASE)
            ->values();

        return $names->map(fn ($name) => [
            'name'  => $name,
            'count' => (int) ($counts[$name] ?? 0),
        ])->values()->all();
    }

    /** The five dashboard categories, counted only from documents this resident can open. */
    private function residentDocumentCategories(iterable $documents): array
    {
        $counts = array_fill_keys(DocumentCategories::PRESETS, 0);
        $others = 0;

        foreach ($documents as $document) {
            if (($document['kind'] ?? 'document') === 'agreement') {
                continue;
            }
            $name = trim((string) ($document['category'] ?? ''));
            $matched = null;
            foreach (DocumentCategories::PRESETS as $preset) {
                if (mb_strtolower($preset) === mb_strtolower($name)) {
                    $matched = $preset;
                    break;
                }
            }
            if ($matched) {
                $counts[$matched]++;
            } else {
                $others++;
            }
        }

        $rows = [];
        foreach (DocumentCategories::PRESETS as $preset) {
            $rows[] = ['name' => $preset, 'count' => $counts[$preset], 'match' => 'exact'];
        }
        $rows[] = ['name' => 'Others', 'count' => $others, 'match' => 'other'];

        return $rows;
    }

    private function modifiedAfterPublish(object $doc): bool
    {
        $published = $doc->published_at ?: $doc->created_at;
        $updated = $doc->updated_at ?? null;
        if (! $published || ! $updated) {
            return false;
        }

        return Carbon::parse($updated)->greaterThan(Carbon::parse($published)->addSeconds(5));
    }

    private function storeUploadedFile(UploadedFile $file, int $communityId): array
    {
        $path = $file->store("documents/{$communityId}", 'public');
        $relative = '/storage/' . ltrim(str_replace('\\', '/', $path), '/');

        return [
            'file_path'  => $relative,
            'file_name'  => $file->getClientOriginalName(),
            'file_size'  => (int) $file->getSize(),
            'mime_type'  => $file->getClientMimeType(),
            'page_count' => null,
            'original_checksum' => null,
        ];
    }

    /** Copy the stored file so a new version can be deleted without removing the original. */
    private function duplicateStoredFile(object $source): array
    {
        $normalized = MediaUrl::normalize($source->file_path);
        abort_if(! $normalized || ! str_starts_with($normalized, '/storage/'), 422, 'The original file could not be copied.');
        $diskPath = ltrim(substr($normalized, strlen('/storage/')), '/');
        abort_if($diskPath === '' || ! Storage::disk('public')->exists($diskPath), 422, 'The original file could not be copied.');

        $extension = pathinfo($diskPath, PATHINFO_EXTENSION);
        $target = 'documents/'.$source->community_id.'/'.Str::uuid()->toString().($extension !== '' ? '.'.$extension : '');
        Storage::disk('public')->copy($diskPath, $target);

        return [
            'file_path' => '/storage/'.ltrim(str_replace('\\', '/', $target), '/'),
            'file_name' => $source->file_name,
            'file_size' => (int) $source->file_size,
            'mime_type' => $source->mime_type,
            'page_count' => $source->page_count ?? null,
            'original_checksum' => $source->original_checksum ?? null,
        ];
    }

    private function isDuplicateVersion(QueryException $exception): bool
    {
        $message = $exception->getMessage();

        return str_contains($message, 'community_documents_version_unique')
            || str_contains($message, 'version_root_id');
    }

    private function deleteStoredFile(?string $filePath): void
    {
        if (!$filePath) {
            return;
        }
        $normalized = MediaUrl::normalize($filePath);
        if (!$normalized || !str_starts_with($normalized, '/storage/')) {
            return;
        }
        $diskPath = ltrim(substr($normalized, strlen('/storage/')), '/');
        if ($diskPath) {
            Storage::disk('public')->delete($diskPath);
        }
    }

    /* ─── GET /v1/documents ───────────────────────────────────── */
    public function index(Request $request): JsonResponse
    {
        $user        = $request->user();
        $communityId = $this->resolveCommunityId($request, $user);

        $userId = (int) $user->id;
        $query = DB::table('community_documents')
            ->where('community_id', $communityId)
            ->whereNull('deleted_at')
            ->where(function ($outer) use ($userId) {
                $outer->where(function ($docs) use ($userId) {
                    $docs->where('status', 'active')
                        ->where(function ($kind) {
                            $kind->where('kind', 'document')->orWhereNull('kind');
                        })
                        ->where(function ($published) {
                            $published->whereNull('publication_status')
                                ->orWhere('publication_status', 'published');
                        })
                        ->where(function ($access) use ($userId) {
                            $access->whereNull('assignment_scope')
                                ->orWhere('assignment_scope', '')
                                ->orWhereIn('id', function ($sub) use ($userId) {
                                    $sub->select('document_id')
                                        ->from('community_document_assignments')
                                        ->where('user_id', $userId)
                                        ->whereNotIn('status', ['revoked', 'draft']);
                                });
                        });
                })->orWhere(function ($agreements) use ($userId) {
                    $agreements->where('kind', 'agreement')
                        ->whereIn('id', function ($sub) use ($userId) {
                            $sub->select('document_id')
                                ->from('community_document_assignments')
                                ->where('user_id', $userId)
                                ->where('status', '!=', 'revoked');
                        });
                });
            })
            ->orderByDesc('updated_at');

        if ($request->filled('category')) {
            $query->where('category', $request->category);
        }
        if ($request->filled('search')) {
            $s = $request->search;
            $query->where(fn($q) => $q->where('title', 'like', "%{$s}%")
                ->orWhere('description', 'like', "%{$s}%")
                ->orWhere('category', 'like', "%{$s}%")
            );
        }

        $docs = $query->get();
        $formatted = $docs->map(fn ($d) => $this->formatDocument($d, $request))->all();
        $data = collect(app(AgreementService::class)->expandForResident($formatted, $userId))->values();
        $recent = $data->where('kind', '!=', 'agreement')->take(3)->values();

        return response()->json([
            'data'       => $data,
            'recent'     => $recent,
            'categories' => $this->isCommunityAdmin($user)
                ? $this->buildCategories($communityId, true)
                : $this->residentDocumentCategories($data),
            'total'      => $data->count(),
        ]);
    }

    /* ─── GET /v1/documents/{id} ────────────────────────────── */
    public function show(Request $request, int $id): JsonResponse
    {
        $user        = $request->user();
        $communityId = $this->resolveCommunityId($request, $user);
        $isAdmin     = $this->isCommunityAdmin($user);

        $query = DB::table('community_documents')
            ->where('id', $id)
            ->where('community_id', $communityId)
            ->whereNull('deleted_at');

        if (!$isAdmin) {
            $query->where(function ($visible) use ($user) {
                $visible->where('status', 'active')
                    ->orWhereIn('id', function ($sub) use ($user) {
                        $sub->select('document_id')
                            ->from('community_document_assignments')
                            ->where('user_id', $user->id)
                            ->where('status', 'signed');
                    });
            });
        }

        $doc = $query->first();
        abort_if(!$doc, 404, 'Document not found.');
        $agreements = app(AgreementService::class);
        abort_if(! $agreements->residentCanView($doc, (int) $user->id, $isAdmin), 404, 'Document not found.');
        if (! $isAdmin) {
            $agreements->recordView($doc, (int) $user->id);
        }
        $payload = $this->formatDocument($doc, $request);
        $payload['community_name'] = DB::table('communities')->where('id', $doc->community_id)->value('name');
        $payload['assignments'] = $agreements->assignmentsFor((int) $doc->id, (int) $user->id, $request);
        if ($isAdmin) {
            $presented = $this->presentAdminDocuments(collect([$doc]), $request)->first();
            $payload = array_merge($payload, is_array($presented) ? $presented : []);
            $payload['activity'] = $agreements->documentActivity((int) $doc->id);
            if (
                ($doc->kind ?? 'document') === 'agreement'
                || filled($doc->assignment_scope ?? null)
                || (bool) ($doc->signature_required ?? false)
            ) {
                $payload['stats'] = $agreements->stats((int) $doc->id);
                $payload['recipients'] = $agreements->recipients((int) $doc->id, $request);
            }
        }

        return response()->json([
            'data' => $payload,
        ]);
    }

    /* ─── POST /v1/documents/{id}/download ────────────────────── */
    public function recordDownload(Request $request, int $id): JsonResponse
    {
        $user        = $request->user();
        $communityId = $this->resolveCommunityId($request, $user);

        $doc = DB::table('community_documents')
            ->where('id', $id)
            ->where('community_id', $communityId)
            ->where('status', 'active')
            ->whereNull('deleted_at')
            ->first();

        abort_if(!$doc, 404, 'Document not found.');
        abort_if(
            ! app(AgreementService::class)->residentCanView($doc, (int) $user->id, $this->isCommunityAdmin($user)),
            404,
            'Document not found.',
        );

        DB::table('community_documents')->where('id', $id)->increment('download_count');
        $updated = DB::table('community_documents')->find($id);

        return response()->json([
            'data'    => $this->formatDocument($updated, $request),
            'message' => 'Download recorded.',
        ]);
    }

    /* ─── GET /v1/admin/documents ───────────────────────────── */
    public function adminIndex(Request $request): JsonResponse
    {
        $communityId = $this->resolveCommunityId($request, $request->user());

        $query = DB::table('community_documents')
            ->where('community_id', $communityId)
            ->whereNull('deleted_at')
            ->orderByDesc('updated_at');

        $kind = $request->input('kind', 'document');
        if ($kind === 'agreement') {
            $query->where('kind', 'agreement');
        } elseif ($kind !== 'all') {
            $query->where(function ($inner) {
                $inner->where('kind', 'document')->orWhereNull('kind');
            });
        }

        if ($request->filled('status') && $request->status !== 'all') {
            $query->where('status', $request->status);
        }
        if ($request->filled('category')) {
            $query->where('category', $request->category);
        }
        if ($request->filled('search')) {
            $s = $request->search;
            $query->where(fn($q) => $q->where('title', 'like', "%{$s}%")
                ->orWhere('description', 'like', "%{$s}%")
                ->orWhere('category', 'like', "%{$s}%")
            );
        }

        $docs = $query->get();
        $data = $this->presentAdminDocuments($docs, $request);

        return response()->json([
            'data'       => $data,
            'categories' => $this->buildCategories($communityId),
            'total'      => $docs->count(),
        ]);
    }

    /* ─── POST /v1/admin/documents/categories ───────────────── */
    public function storeCategory(Request $request): JsonResponse
    {
        $user        = $request->user();
        $communityId = $this->resolveCommunityId($request, $user);

        $data = $request->validate([
            'name' => 'required|string|max:100',
        ]);

        $name = trim($data['name']);
        abort_if($name === '', 422, 'Category name is required.');
        abort_if(DocumentCategories::isOther($name), 422, 'Enter a custom category name.');

        $exists = DB::table('community_document_categories')
            ->where('community_id', $communityId)
            ->whereRaw('LOWER(name) = ?', [mb_strtolower($name)])
            ->exists();

        abort_if($exists, 422, 'That category already exists.');

        $id = DB::table('community_document_categories')->insertGetId([
            'community_id' => $communityId,
            'name'         => $name,
            'created_at'   => now(),
            'updated_at'   => now(),
        ]);

        return response()->json([
            'data' => [
                'id'    => $id,
                'name'  => $name,
                'count' => 0,
            ],
            'message' => 'Category created successfully.',
        ], 201);
    }

    /* ─── DELETE /v1/admin/documents/categories ─────────────── */
    public function destroyCategory(Request $request): JsonResponse
    {
        $user        = $request->user();
        $communityId = $this->resolveCommunityId($request, $user);

        $data = $request->validate([
            'name' => 'required|string|max:100',
        ]);

        $name = trim($data['name']);
        abort_if(DocumentCategories::isPreset($name), 422, 'Predefined categories cannot be deleted.');

        $inUse = DB::table('community_documents')
            ->where('community_id', $communityId)
            ->whereNull('deleted_at')
            ->where('category', $name)
            ->exists();

        abort_if($inUse, 422, 'Remove or reassign documents in this category before deleting it.');

        $deleted = DB::table('community_document_categories')
            ->where('community_id', $communityId)
            ->where('name', $name)
            ->delete();

        abort_if(!$deleted, 404, 'Category not found.');

        return response()->json(['message' => 'Category deleted successfully.']);
    }

    /* ─── POST /v1/admin/documents ──────────────────────────── */
    public function store(Request $request): JsonResponse
    {
        $user        = $request->user();
        $communityId = $this->resolveCommunityId($request, $user);

        $data = $this->validateDocumentPayload($request, true);
        $publishing = $this->wantsPublish($request);
        $signature = $request->boolean('signature_required');
        $scope = $request->input('assignment_scope');
        $this->assertPublishRules($request, $publishing, $signature, $scope);

        $agreements = app(AgreementService::class);
        $fileMeta = $signature
            ? $agreements->storeFile($request->file('file'), $communityId)
            : $this->storeUploadedFile($request->file('file'), $communityId);
        $this->ensureCategory($communityId, $data['category']);

        $managed = $request->exists('assignment_scope') || $request->exists('publication_status');
        $id = DB::transaction(function () use ($communityId, $user, $data, $fileMeta, $managed, $signature, $scope) {
            $createdId = DB::table('community_documents')->insertGetId([
            'version'      => 1,
            'community_id' => $communityId,
            'created_by'   => $user->id,
            'title'        => $data['title'],
            'category'     => $data['category'],
            'description'  => $this->blankToNull($data['description'] ?? null),
            'file_path'    => $fileMeta['file_path'],
            'file_name'    => $fileMeta['file_name'],
            'file_size'    => $fileMeta['file_size'],
            'mime_type'    => $fileMeta['mime_type'],
            'status'       => $managed ? 'inactive' : ($data['status'] ?? 'active'),
            'kind'         => 'document',
            'publication_status' => $managed ? 'draft' : 'published',
            'signature_required' => $signature,
            'due_at'       => $signature ? $this->normalizeDueAt($data['due_at'] ?? null) : null,
            'expires_at'   => $this->normalizeExpiresAt($data['expires_at'] ?? null),
            'assignment_scope' => $managed ? $scope : null,
            'page_count'   => $fileMeta['page_count'] ?? null,
            'original_checksum' => $fileMeta['original_checksum'] ?? null,
            'created_at'   => now(),
            'updated_at'   => now(),
            ]);
            DB::table('community_documents')->where('id', $createdId)->update(['version_root_id' => $createdId]);

            return $createdId;
        });

        $doc = DB::table('community_documents')->find($id);
        if ($managed && ! $publishing) {
            $agreements->replaceDraftRecipients($doc, (string) $scope, $request->input('user_ids', []));
        }
        if ($managed && $publishing) {
            $result = $agreements->publish(
                $doc,
                (int) $user->id,
                (string) $scope,
                array_map('intval', $request->input('user_ids', [])),
                [],
                $request->boolean('notify'),
            );
            $doc = $result['document'];
        }

        return response()->json([
            'data'    => $this->presentAdminDocuments(collect([$doc]), $request)->first(),
            'message' => 'Document uploaded successfully.',
        ], 201);
    }

    /* ─── PATCH /v1/admin/documents/{id} ────────────────────── */
    public function update(Request $request, int $id): JsonResponse
    {
        $user = $request->user();
        $doc  = DB::table('community_documents')->whereNull('deleted_at')->where('id', $id)->first();
        abort_if(!$doc, 404, 'Document not found.');
        if (($doc->kind ?? 'document') === 'agreement' && ($doc->publication_status ?? 'draft') !== 'draft') {
            abort(422, 'Published agreements cannot be edited. Create a new version.');
        }
        $rewritesDocument = $request->exists('title')
            || $request->exists('category')
            || $request->exists('description')
            || $request->exists('assignment_scope')
            || $request->hasFile('file')
            || $request->boolean('remove_file');
        if (
            ($doc->kind ?? 'document') !== 'agreement'
            && ($doc->publication_status ?? 'published') !== 'draft'
            && $rewritesDocument
        ) {
            abort(422, 'Create a new version to update a published document.');
        }

        if ($request->input('expires_at') === '') {
            $request->merge(['expires_at' => null]);
        }
        $text = ContentFieldRules::rules(false);
        $data = $request->validate([
            'title'       => $text['title'],
            'category'    => 'sometimes|string|max:100',
            'description' => ['sometimes', 'nullable', 'string', 'max:5000'],
            'status'      => 'sometimes|in:active,inactive',
            'file'        => 'sometimes|file|max:10240|mimes:pdf,doc,docx,jpg,jpeg,png,webp',
            'due_at'      => 'nullable|date',
            'expires_at'  => 'nullable|date',
            'assignment_scope' => 'sometimes|in:all,residents',
            'signature_required' => 'sometimes|boolean',
            'user_ids'    => 'sometimes|array',
            'user_ids.*'  => 'integer',
            'notify'      => 'sometimes|boolean',
            'publication_status' => 'sometimes|in:draft,published',
        ], ContentFieldRules::messages());
        if (array_key_exists('description', $data)) {
            $this->assertDescription($data['description']);
            $data['description'] = $this->blankToNull($data['description']);
        }

        $updates = collect($data)->except(['file', 'user_ids', 'notify', 'publication_status'])->toArray();
        $updates['updated_at'] = now();
        $draftDocument = ($doc->kind ?? 'document') === 'document'
            && ($doc->publication_status ?? '') === 'draft';
        if (! $draftDocument) {
            unset($updates['assignment_scope'], $updates['signature_required'], $updates['due_at']);
        } elseif (array_key_exists('signature_required', $updates) && ! $request->boolean('signature_required')) {
            $updates['due_at'] = null;
        } elseif (array_key_exists('due_at', $updates)) {
            $updates['due_at'] = $this->normalizeDueAt($updates['due_at']);
        }
        $isAgreement = ($doc->kind ?? 'document') === 'agreement';
        if (! $isAgreement && $request->exists('expires_at')) {
            $updates['expires_at'] = $this->normalizeExpiresAt($request->input('expires_at'));
        }
        if ($isAgreement) {
            unset($updates['status']);
            $dates = $request->validate([
                'due_at' => 'nullable|date',
                'effective_at' => 'nullable|date',
                'expires_at' => 'nullable|date',
            ]);
            $schedule = [];
            foreach (['due_at', 'effective_at', 'expires_at'] as $field) {
                if ($request->exists($field)) {
                    $schedule[$field] = $request->input($field);
                }
            }
            AgreementDates::assertSchedule($schedule, (int) $doc->community_id);
            $updates = array_merge($updates, AgreementDates::normalize($dates));
        }

        if (isset($updates['category'])) {
            $this->ensureCategory((int) $doc->community_id, $updates['category']);
        }

        if (! $isAgreement && $request->boolean('remove_file') && ! $request->hasFile('file')) {
            throw ValidationException::withMessages([
                'file' => 'Choose a file to upload.',
            ]);
        }

        if ($request->hasFile('file')) {
            $signatureFile = $isAgreement || $request->boolean('signature_required') || (bool) ($doc->signature_required ?? false);
            if ($signatureFile) {
                $fileMeta = app(AgreementService::class)->storeFile($request->file('file'), (int) $doc->community_id);
            } else {
                $fileMeta = $this->storeUploadedFile($request->file('file'), (int) $doc->community_id);
            }
            $this->deleteStoredFile($doc->file_path);
            $updates = array_merge($updates, $fileMeta);
        }

        $fields = ['title', 'category', 'description', 'status', 'file_path'];
        $before = ActivityLogService::snapshot($doc, $fields);
        DB::table('community_documents')->where('id', $id)->update($updates);
        $updated = DB::table('community_documents')->find($id);
        $agreements = app(AgreementService::class);
        if (($updated->kind ?? 'document') === 'document' && ($updated->publication_status ?? 'published') === 'draft') {
            if ($request->exists('assignment_scope')) {
                $agreements->replaceDraftRecipients($updated, (string) $updated->assignment_scope, $request->input('user_ids', []));
            }
            if ($this->wantsPublish($request)) {
                $this->assertPublishRules(
                    $request,
                    true,
                    (bool) $updated->signature_required,
                    $updated->assignment_scope,
                );
                $result = $agreements->publish(
                    $updated,
                    (int) $user->id,
                    (string) $updated->assignment_scope,
                    array_map('intval', $request->input('user_ids', [])),
                    [],
                    $request->boolean('notify'),
                );
                $updated = $result['document'];
            }
        }
        ActivityLogService::recordUpdate(
            'community_document_updated',
            'CommunityDocument',
            $id,
            $before,
            ActivityLogService::snapshot($updated, $fields),
            [],
            null,
            null,
            ['related_item' => $updated->title ?? $doc->title],
        );

        return response()->json([
            'data'    => $this->presentAdminDocuments(collect([$updated]), $request)->first(),
            'message' => 'Document updated successfully.',
        ]);
    }

    /* ─── POST /v1/admin/documents/{id}/versions ────────────── */
    public function storeVersion(Request $request, int $id): JsonResponse
    {
        $user = $request->user();
        $source = $this->communityDocument($request, $id);
        abort_if(($source->kind ?? 'document') === 'agreement', 422, 'Agreements are versioned separately.');

        $data = $this->validateDocumentPayload($request, false);
        if (! $request->hasFile('file') && ! $source->file_path) {
            throw ValidationException::withMessages(['file' => 'Choose a file to upload.']);
        }

        $publishing = $this->wantsPublish($request);
        $scope = $request->input('assignment_scope', $source->assignment_scope);
        $this->assertPublishRules($request, $publishing, false, $scope);
        $this->ensureCategory((int) $source->community_id, $data['category']);

        $newId = null;
        try {
            $newId = DB::transaction(function () use ($request, $source, $data, $user, $scope) {
                $locked = DB::table('community_documents')->where('id', $source->id)->lockForUpdate()->first();
                abort_if(! $locked || $locked->deleted_at, 404, 'Document not found.');

                $rootId = (int) ($locked->version_root_id ?: $locked->id);
                if (! $locked->version_root_id) {
                    DB::table('community_documents')->where('id', $rootId)->update(['version_root_id' => $rootId]);
                }
                DB::table('community_documents')->where('id', $rootId)->lockForUpdate()->first();

                $max = (int) DB::table('community_documents')->where('version_root_id', $rootId)->max('version');
                $nextVersion = max($max, (int) $locked->version) + 1;
                $fileMeta = $request->hasFile('file')
                    ? $this->storeUploadedFile($request->file('file'), (int) $locked->community_id)
                    : $this->duplicateStoredFile($locked);

                $createdId = DB::table('community_documents')->insertGetId([
                    'community_id' => $locked->community_id,
                    'created_by' => $user->id,
                    'title' => $data['title'],
                    'category' => $data['category'],
                    'description' => $this->blankToNull($data['description'] ?? null),
                    'file_path' => $fileMeta['file_path'],
                    'file_name' => $fileMeta['file_name'],
                    'file_size' => $fileMeta['file_size'],
                    'mime_type' => $fileMeta['mime_type'],
                    'status' => 'inactive',
                    'kind' => 'document',
                    'publication_status' => 'draft',
                    'signature_required' => false,
                    'due_at' => null,
                    'expires_at' => null,
                    'assignment_scope' => $scope,
                    'version' => $nextVersion,
                    'version_root_id' => $rootId,
                    'supersedes_id' => null,
                    'page_count' => $fileMeta['page_count'] ?? null,
                    'original_checksum' => $fileMeta['original_checksum'] ?? null,
                    'created_at' => now(),
                    'updated_at' => now(),
                ]);

                return $createdId;
            });
        } catch (QueryException $exception) {
            if ($this->isDuplicateVersion($exception)) {
                abort(409, 'This document was updated at the same time. Try again.');
            }
            throw $exception;
        }

        $created = DB::table('community_documents')->find($newId);
        try {
            if ($publishing) {
                $result = app(AgreementService::class)->publish(
                    $created,
                    (int) $user->id,
                    (string) $scope,
                    array_map('intval', $request->input('user_ids', [])),
                    [],
                    $request->boolean('notify'),
                );
                $created = $result['document'];
            }
            DB::table('community_documents')->where('id', $newId)->update([
                'supersedes_id' => (int) $source->id,
                'updated_at' => now(),
            ]);
            $created = DB::table('community_documents')->find($newId);
        } catch (\Throwable $exception) {
            $orphan = DB::table('community_documents')->find($newId);
            if ($orphan && ($orphan->publication_status ?? '') === 'draft') {
                $this->deleteStoredFile($orphan->file_path);
                DB::table('community_documents')->where('id', $newId)->delete();
            }
            throw $exception;
        }

        ActivityLogService::recordUpdate(
            'community_document_version_created',
            'CommunityDocument',
            (int) $created->id,
            [],
            ActivityLogService::snapshot($created, ['title', 'category', 'description', 'file_path', 'version']),
            [],
            null,
            null,
            [
                'related_item' => $created->title,
                'source_document_id' => (int) $source->id,
                'version' => (int) $created->version,
            ],
        );

        return response()->json([
            'data' => $this->presentAdminDocuments(collect([$created]), $request)->first(),
            'message' => 'Document version created.',
        ], 201);
    }

    public function signatureTracking(Request $request): JsonResponse
    {
        $communityId = $this->resolveCommunityId($request, $request->user());
        $docs = DB::table('community_documents')
            ->where('community_id', $communityId)
            ->whereNull('deleted_at')
            ->where(function ($query) {
                $query->where('kind', 'document')->orWhereNull('kind');
            })
            ->where('signature_required', true)
            ->where('publication_status', 'published')
            ->orderByDesc('updated_at')
            ->get(['id', 'title', 'due_at', 'expires_at', 'signature_required']);

        $grouped = $this->signatureAssignments($docs->pluck('id')->all());
        $required = 0;
        $signed = 0;
        $pending = 0;
        $overdue = 0;
        $rows = [];
        foreach ($docs as $doc) {
            $summary = $this->summarizeSignatures($doc, $grouped->get($doc->id, collect()));
            $required += $summary['required'];
            $signed += $summary['signed'];
            $pending += $summary['pending'];
            $overdue += $summary['overdue'];
            $rows[] = [
                'id' => (int) $doc->id,
                'title' => $doc->title,
                'due_at' => $doc->due_at,
                'expires_at' => $doc->expires_at,
                'required' => $summary['required'],
                'signed' => $summary['signed'],
                'pending' => $summary['pending'],
                'overdue' => $summary['overdue'],
                'signature_status' => $this->signatureState($doc, $summary),
            ];
        }

        return response()->json([
            'required' => $required,
            'signed' => $signed,
            'pending' => $pending,
            'overdue' => $overdue,
            'documents' => $rows,
        ]);
    }

    public function archive(Request $request, int $id): JsonResponse
    {
        $doc = $this->communityDocument($request, $id);
        $updated = app(AgreementService::class)->archiveCommunityDocument($doc, (int) $request->user()->id);

        return response()->json([
            'data' => $this->presentAdminDocuments(collect([$updated]), $request)->first(),
            'message' => 'Document archived.',
        ]);
    }

    public function restore(Request $request, int $id): JsonResponse
    {
        $doc = $this->communityDocument($request, $id);
        $updated = app(AgreementService::class)->restoreCommunityDocument($doc, (int) $request->user()->id);

        return response()->json([
            'data' => $this->presentAdminDocuments(collect([$updated]), $request)->first(),
            'message' => 'Document restored.',
        ]);
    }

    public function extendDeadline(Request $request, int $id): JsonResponse
    {
        $doc = $this->communityDocument($request, $id);
        $data = $request->validate(['due_at' => 'required|date']);
        $updated = app(AgreementService::class)->extendDocumentDeadline($doc, $data['due_at'], (int) $request->user()->id);

        return response()->json([
            'data' => $this->presentAdminDocuments(collect([$updated]), $request)->first(),
            'message' => 'Signature deadline updated.',
        ]);
    }

    public function remind(Request $request, int $id): JsonResponse
    {
        $communityId = $this->resolveCommunityId($request, $request->user());
        $doc = DB::table('community_documents')
            ->where('id', $id)
            ->where('community_id', $communityId)
            ->whereNull('deleted_at')
            ->first();
        abort_if(! $doc, 404, 'Document not found.');
        $data = $request->validate(['assignment_id' => 'nullable|integer']);
        $result = app(AgreementService::class)->remind($doc, $data['assignment_id'] ?? null, (int) $request->user()->id);

        return response()->json([
            'message' => $result['sent'] === 1 ? 'Reminder sent.' : "Reminders sent: {$result['sent']}.",
            'sent' => $result['sent'],
            'skipped' => $result['skipped'],
        ]);
    }

    private function validateDocumentPayload(Request $request, bool $fileRequired): array
    {
        if ($request->input('expires_at') === '') {
            $request->merge(['expires_at' => null]);
        }
        $data = $request->validate([
            'title'       => ContentFieldRules::rules()['title'],
            'category'    => 'required|string|max:100',
            'description' => ['nullable', 'string', 'max:5000'],
            'status'      => 'sometimes|in:active,inactive',
            'file'        => ($fileRequired ? 'required' : 'sometimes').'|file|max:10240|mimes:pdf,doc,docx,jpg,jpeg,png,webp',
            'due_at'      => 'nullable|date',
            'expires_at'  => 'nullable|date',
            'assignment_scope' => 'sometimes|in:all,residents',
            'signature_required' => 'sometimes|boolean',
            'user_ids'    => 'sometimes|array',
            'user_ids.*'  => 'integer',
            'notify'      => 'sometimes|boolean',
            'publication_status' => 'sometimes|in:draft,published',
        ], ContentFieldRules::messages());
        $this->assertDescription($data['description'] ?? null);

        return $data;
    }

    private function assertDescription(mixed $description): void
    {
        $text = trim((string) $description);
        if ($text !== '' && mb_strlen($text) < 10) {
            throw ValidationException::withMessages([
                'description' => 'Description must be at least 10 characters.',
            ]);
        }
    }

    private function wantsPublish(Request $request): bool
    {
        if (! $request->exists('publication_status') && ! $request->exists('assignment_scope')) {
            return false;
        }

        return $request->input('publication_status', 'published') === 'published';
    }

    private function assertPublishRules(Request $request, bool $publishing, bool $signature, mixed $scope): void
    {
        if (! $publishing) {
            return;
        }
        if (! in_array($scope, ['all', 'residents'], true)) {
            throw ValidationException::withMessages(['assignment_scope' => 'Choose who should receive this document.']);
        }
        $userIds = array_filter(array_map('intval', $request->input('user_ids', [])));
        if ($scope === 'residents' && $userIds === []) {
            throw ValidationException::withMessages(['user_ids' => 'Choose at least one resident.']);
        }
        if ($signature) {
            $due = $request->input('due_at');
            if (! $due || Carbon::parse($due)->lessThanOrEqualTo(now())) {
                throw ValidationException::withMessages(['due_at' => 'Choose a future signature deadline.']);
            }
        }
    }

    private function normalizeDueAt(mixed $value): ?string
    {
        if ($value === null || $value === '') {
            return null;
        }

        return Carbon::parse($value)->utc()->format('Y-m-d H:i:s');
    }

    private function normalizeExpiresAt(mixed $value): ?string
    {
        if ($value === null || $value === '') {
            return null;
        }
        if (is_string($value) && preg_match('/^\d{4}-\d{2}-\d{2}$/', $value)) {
            return Carbon::parse($value.' 23:59:59', config('app.timezone'))->utc()->format('Y-m-d H:i:s');
        }

        return Carbon::parse($value)->utc()->format('Y-m-d H:i:s');
    }

    private function communityDocument(Request $request, int $id): object
    {
        $communityId = $this->resolveCommunityId($request, $request->user());
        $doc = DB::table('community_documents')
            ->where('id', $id)
            ->where('community_id', $communityId)
            ->whereNull('deleted_at')
            ->where(function ($query) {
                $query->where('kind', 'document')->orWhereNull('kind');
            })
            ->first();
        abort_if(! $doc, 404, 'Document not found.');

        return $doc;
    }

    private function presentAdminDocuments($docs, Request $request)
    {
        $grouped = $this->signatureAssignments($docs->pluck('id')->all());
        $assigned = $docs->pluck('id')->all() === []
            ? collect()
            : DB::table('community_document_assignments')
                ->whereIn('document_id', $docs->pluck('id')->all())
                ->whereNotIn('status', ['draft', 'revoked'])
                ->selectRaw('document_id, COUNT(*) as assigned_count')
                ->groupBy('document_id')
                ->pluck('assigned_count', 'document_id');

        return $docs->map(function ($doc) use ($request, $grouped, $assigned) {
            $payload = $this->formatDocument($doc, $request);
            $summary = $this->summarizeSignatures($doc, $grouped->get($doc->id, collect()));
            $payload['signature_summary'] = $summary;
            $payload['signature_status'] = $this->signatureState($doc, $summary);
            $payload['lifecycle'] = $this->documentLifecycle($doc);
            $payload['assigned_count'] = (int) ($assigned[$doc->id] ?? 0);

            return $payload;
        })->values();
    }

    private function signatureAssignments(array $ids)
    {
        if ($ids === []) {
            return collect();
        }

        return DB::table('community_document_assignments')
            ->whereIn('document_id', $ids)
            ->whereNotIn('status', ['draft', 'revoked'])
            ->get(['document_id', 'status'])
            ->groupBy('document_id');
    }

    private function summarizeSignatures(object $doc, $rows): array
    {
        if (! (bool) ($doc->signature_required ?? false)) {
            return ['required' => 0, 'signed' => 0, 'pending' => 0, 'overdue' => 0];
        }
        $signed = $rows->where('status', 'signed')->count();
        $open = $rows->whereIn('status', ['pending', 'viewed'])->count();
        $deadlinePassed = filled($doc->due_at ?? null) && Carbon::parse($doc->due_at)->lessThanOrEqualTo(now());

        return [
            'required' => $rows->count(),
            'signed' => $signed,
            'pending' => $deadlinePassed ? 0 : $open,
            'overdue' => $deadlinePassed ? $open : 0,
        ];
    }

    private function signatureState(object $doc, array $summary): ?string
    {
        if (! (bool) ($doc->signature_required ?? false)) {
            return null;
        }
        if ($summary['required'] > 0 && $summary['signed'] === $summary['required']) {
            return 'signed';
        }
        if ($summary['overdue'] > 0) {
            return 'overdue';
        }

        return 'pending';
    }

    private function documentLifecycle(object $doc): string
    {
        $publication = $doc->publication_status ?? 'published';
        if ($publication === 'draft') {
            return 'draft';
        }
        if ($publication === 'archived') {
            return 'archived';
        }
        if (filled($doc->expires_at ?? null) && Carbon::parse($doc->expires_at)->lessThanOrEqualTo(now())) {
            return 'overdue';
        }

        return 'published';
    }

    private function blankToNull(mixed $value): ?string
    {
        $text = trim((string) $value);

        return $text === '' ? null : $text;
    }

    /* ─── DELETE /v1/admin/documents/{id} ───────────────────── */
    public function destroy(int $id): JsonResponse
    {
        $doc = DB::table('community_documents')->whereNull('deleted_at')->where('id', $id)->first();
        abort_if(!$doc, 404, 'Document not found.');
        if (($doc->kind ?? '') === 'agreement' && ($doc->publication_status ?? '') !== 'draft') {
            abort(422, 'Published agreements are archived instead of deleted.');
        }

        DB::table('community_documents')->where('id', $id)->update(['deleted_at' => now(), 'updated_at' => now()]);

        return response()->json(['message' => 'Document deleted successfully.']);
    }
}
