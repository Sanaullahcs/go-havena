<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
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
        $membership = DB::table('community_memberships')
            ->where('user_id', $user->id)
            ->where('status', 'approved')
            ->orderByDesc('created_at')
            ->first();

        abort_if(!$membership, 422, 'No approved community membership found.');
        return (int) $membership->community_id;
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
            ->whereNull('deleted_at');

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

        $query = DB::table('community_documents')
            ->where('community_id', $communityId)
            ->where('status', 'active')
            ->whereNull('deleted_at')
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
        $data = $docs->map(fn($d) => $this->formatDocument($d, $request))->values();
        $recent = $data->take(3)->values();

        return response()->json([
            'data'       => $data,
            'recent'     => $recent,
            'categories' => $this->buildCategories($communityId, true),
            'total'      => $docs->count(),
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
            $query->where('status', 'active');
        }

        $doc = $query->first();
        abort_if(!$doc, 404, 'Document not found.');

        return response()->json([
            'data' => $this->formatDocument($doc, $request),
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

        $data = $request->validate([
            'title'       => 'sometimes|string|max:200',
            'category'    => 'sometimes|string|max:100',
            'description' => 'nullable|string',
            'status'      => 'sometimes|in:active,inactive',
            'file'        => 'sometimes|file|max:10240|mimes:pdf,doc,docx,jpg,jpeg,png,webp',
        ]);

        $updates = collect($data)->except('file')->toArray();
        $updates['updated_at'] = now();

        if (isset($updates['category'])) {
            $this->ensureCategory((int) $doc->community_id, $updates['category']);
        }

        if ($request->hasFile('file')) {
            $this->deleteStoredFile($doc->file_path);
            $fileMeta = $this->storeUploadedFile($request->file('file'), (int) $doc->community_id);
            $updates = array_merge($updates, $fileMeta);
        }

        DB::table('community_documents')->where('id', $id)->update($updates);
        $updated = DB::table('community_documents')->find($id);

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

        DB::table('community_documents')->where('id', $id)->update(['deleted_at' => now(), 'updated_at' => now()]);

        return response()->json(['message' => 'Document deleted successfully.']);
    }
}
