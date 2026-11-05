<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Services\ActivityLogService;
use App\Services\AgreementService;
use App\Services\UserActingContextService;
use App\Support\MediaUrl;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;

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
            'supersedes_id'    => isset($doc->supersedes_id) && $doc->supersedes_id ? (int) $doc->supersedes_id : null,
            'published_at'     => $doc->published_at ?? null,
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

    private function storeUploadedFile(UploadedFile $file, int $communityId): array
    {
        $path = $file->store("documents/{$communityId}", 'public');
        $relative = '/storage/' . ltrim(str_replace('\\', '/', $path), '/');

        return [
            'file_path'  => $relative,
            'file_name'  => $file->getClientOriginalName(),
            'file_size'  => (int) $file->getSize(),
            'mime_type'  => $file->getClientMimeType(),
        ];
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
                $outer->where(function ($docs) {
                    $docs->where('status', 'active')
                        ->where(function ($kind) {
                            $kind->where('kind', 'document')->orWhereNull('kind');
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
            'categories' => $this->buildCategories($communityId, true),
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
        if (($doc->kind ?? 'document') === 'agreement' && $isAdmin) {
            $payload['stats'] = $agreements->stats((int) $doc->id);
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
        $data = $docs->map(fn($d) => $this->formatDocument($d, $request))->values();

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

        $data = $request->validate([
            'title'       => 'required|string|max:200',
            'category'    => 'required|string|max:100',
            'description' => 'nullable|string',
            'status'      => 'in:active,inactive',
            'file'        => 'required|file|max:10240|mimes:pdf,doc,docx,jpg,jpeg,png,webp',
        ]);

        $fileMeta = $this->storeUploadedFile($request->file('file'), $communityId);
        $this->ensureCategory($communityId, $data['category']);

        $id = DB::table('community_documents')->insertGetId([
            'community_id' => $communityId,
            'created_by'   => $user->id,
            'title'        => $data['title'],
            'category'     => $data['category'],
            'description'  => $data['description'] ?? null,
            'file_path'    => $fileMeta['file_path'],
            'file_name'    => $fileMeta['file_name'],
            'file_size'    => $fileMeta['file_size'],
            'mime_type'    => $fileMeta['mime_type'],
            'status'       => $data['status'] ?? 'active',
            'kind'         => 'document',
            'publication_status' => 'published',
            'created_at'   => now(),
            'updated_at'   => now(),
        ]);

        $doc = DB::table('community_documents')->find($id);

        return response()->json([
            'data'    => $this->formatDocument($doc, $request),
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

        $data = $request->validate([
            'title'       => 'sometimes|string|max:200',
            'category'    => 'sometimes|string|max:100',
            'description' => 'nullable|string',
            'status'      => 'sometimes|in:active,inactive',
            'file'        => 'sometimes|file|max:10240|mimes:pdf,doc,docx,jpg,jpeg,png,webp',
        ]);

        $updates = collect($data)->except('file')->toArray();
        $updates['updated_at'] = now();
        $isAgreement = ($doc->kind ?? 'document') === 'agreement';
        if ($isAgreement) {
            unset($updates['status']);
            $dates = $request->validate([
                'due_at' => 'nullable|date',
                'effective_at' => 'nullable|date',
                'expires_at' => 'nullable|date',
            ]);
            $updates = array_merge($updates, $dates);
        }

        if (isset($updates['category'])) {
            $this->ensureCategory((int) $doc->community_id, $updates['category']);
        }

        if ($request->hasFile('file')) {
            if ($isAgreement) {
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
            'data'    => $this->formatDocument($updated, $request),
            'message' => 'Document updated successfully.',
        ]);
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
