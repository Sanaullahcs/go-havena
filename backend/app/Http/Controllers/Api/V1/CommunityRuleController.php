<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Services\ActivityLogService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class CommunityRuleController extends Controller
{
    private const SEVERITIES = ['important', 'standard', 'info'];

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

    private function formatRule(object $rule, int $userId, bool $isAdmin): array
    {
        $acknowledged = DB::table('rule_acknowledgments')
            ->where('rule_id', $rule->id)
            ->where('user_id', $userId)
            ->exists();

        return [
            'id'                      => (int) $rule->id,
            'community_id'            => (int) $rule->community_id,
            'title'                   => $rule->title,
            'category'                => $rule->category,
            'description'             => $rule->description,
            'severity'                => $rule->severity,
            'requires_acknowledgment' => (bool) $rule->requires_acknowledgment,
            'status'                  => $rule->status,
            'acknowledged'            => $acknowledged,
            'needs_action'            => !$isAdmin && (bool) $rule->requires_acknowledgment && !$acknowledged,
            'created_by'              => (int) $rule->created_by,
            'created_at'              => $rule->created_at,
            'updated_at'              => $rule->updated_at,
        ];
    }

    private function ensureCategory(int $communityId, string $name): void
    {
        $name = trim($name);
        if ($name === '') {
            return;
        }

        $exists = DB::table('community_rule_categories')
            ->where('community_id', $communityId)
            ->where('name', $name)
            ->exists();

        if ($exists) {
            return;
        }

        DB::table('community_rule_categories')->insert([
            'community_id' => $communityId,
            'name'         => $name,
            'created_at'   => now(),
            'updated_at'   => now(),
        ]);
    }

    /** Managed categories + any category still present on rules (with counts). */
    private function buildCategories(int $communityId, bool $activeOnly = false): array
    {
        $countsQuery = DB::table('community_rules')
            ->where('community_id', $communityId)
            ->whereNull('deleted_at');

        if ($activeOnly) {
            $countsQuery->where('status', 'active');
        }

        $counts = $countsQuery
            ->selectRaw('category, COUNT(*) as count')
            ->groupBy('category')
            ->pluck('count', 'category');

        $managed = DB::table('community_rule_categories')
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

    /* ─── GET /v1/community-rules ──────────────────────────────── */
    public function index(Request $request): JsonResponse
    {
        $user        = $request->user();
        $communityId = $this->resolveCommunityId($request, $user);
        $isAdmin     = $this->isCommunityAdmin($user);

        $query = DB::table('community_rules')
            ->where('community_id', $communityId)
            ->where('status', 'active')
            ->whereNull('deleted_at')
            ->orderByDesc('created_at');

        if ($request->filled('category')) {
            $query->where('category', $request->category);
        }
        if ($request->filled('severity')) {
            $query->where('severity', $request->severity);
        }

        $rules = $query->get();

        $data = $rules->map(fn($r) => $this->formatRule($r, $user->id, $isAdmin))->values();

        $unacknowledged = $data->filter(fn($r) => $r['needs_action'])->count();

        return response()->json([
            'data'            => $data,
            'categories'      => $this->buildCategories($communityId, true),
            'unacknowledged'  => $unacknowledged,
        ]);
    }

    /* ─── GET /v1/admin/community-rules ───────────────────────── */
    public function adminIndex(Request $request): JsonResponse
    {
        $user        = $request->user();
        $communityId = $this->resolveCommunityId($request, $user);

        $query = DB::table('community_rules')
            ->where('community_id', $communityId)
            ->whereNull('deleted_at')
            ->orderByDesc('created_at');

        if ($request->filled('status') && $request->status !== 'all') {
            $query->where('status', $request->status);
        }
        if ($request->filled('category')) {
            $query->where('category', $request->category);
        }
        if ($request->filled('severity')) {
            $query->where('severity', $request->severity);
        }
        if ($request->filled('search')) {
            $s = $request->search;
            $query->where(fn($q) => $q->where('title', 'like', "%{$s}%")
                ->orWhere('description', 'like', "%{$s}%")
                ->orWhere('category', 'like', "%{$s}%")
            );
        }

        $rules = $query->get();

        $data = $rules->map(function ($r) use ($user) {
            $ackCount = DB::table('rule_acknowledgments')->where('rule_id', $r->id)->count();
            return array_merge($this->formatRule($r, $user->id, true), [
                'acknowledgment_count' => $ackCount,
            ]);
        })->values();

        return response()->json([
            'data'       => $data,
            'categories' => $this->buildCategories($communityId),
            'total'      => $rules->count(),
        ]);
    }

    /* ─── POST /v1/admin/community-rules/categories ───────────── */
    public function storeCategory(Request $request): JsonResponse
    {
        $user        = $request->user();
        $communityId = $this->resolveCommunityId($request, $user);

        $data = $request->validate([
            'name' => 'required|string|max:100',
        ]);

        $name = trim($data['name']);
        abort_if($name === '', 422, 'Category name is required.');

        $exists = DB::table('community_rule_categories')
            ->where('community_id', $communityId)
            ->whereRaw('LOWER(name) = ?', [mb_strtolower($name)])
            ->exists();

        abort_if($exists, 422, 'That category already exists.');

        $id = DB::table('community_rule_categories')->insertGetId([
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

    /* ─── DELETE /v1/admin/community-rules/categories ─────────── */
    public function destroyCategory(Request $request): JsonResponse
    {
        $user        = $request->user();
        $communityId = $this->resolveCommunityId($request, $user);

        $data = $request->validate([
            'name' => 'required|string|max:100',
        ]);

        $name = trim($data['name']);

        $inUse = DB::table('community_rules')
            ->where('community_id', $communityId)
            ->whereNull('deleted_at')
            ->where('category', $name)
            ->exists();

        abort_if($inUse, 422, 'Remove or reassign rules in this category before deleting it.');

        $deleted = DB::table('community_rule_categories')
            ->where('community_id', $communityId)
            ->where('name', $name)
            ->delete();

        abort_if(!$deleted, 404, 'Category not found.');

        return response()->json(['message' => 'Category deleted successfully.']);
    }

    /* ─── POST /v1/admin/community-rules ──────────────────────── */
    public function store(Request $request): JsonResponse
    {
        $user        = $request->user();
        $communityId = $this->resolveCommunityId($request, $user);

        $data = $request->validate([
            'title'                   => 'required|string|max:200',
            'category'                => 'required|string|max:100',
            'description'             => 'required|string',
            'severity'                => 'required|in:' . implode(',', self::SEVERITIES),
            'requires_acknowledgment' => 'boolean',
            'status'                  => 'in:active,inactive',
        ]);

        $this->ensureCategory($communityId, $data['category']);

        $id = DB::table('community_rules')->insertGetId([
            'community_id'            => $communityId,
            'created_by'              => $user->id,
            'title'                   => $data['title'],
            'category'                => $data['category'],
            'description'             => $data['description'],
            'severity'                => $data['severity'],
            'requires_acknowledgment' => $data['requires_acknowledgment'] ?? false,
            'status'                  => $data['status'] ?? 'active',
            'created_at'              => now(),
            'updated_at'              => now(),
        ]);

        $rule = DB::table('community_rules')->find($id);

        return response()->json([
            'data'    => $this->formatRule($rule, $user->id, true),
            'message' => 'Rule created successfully.',
        ], 201);
    }

    /* ─── PATCH /v1/admin/community-rules/{id} ────────────────── */
    public function update(Request $request, int $id): JsonResponse
    {
        $user = $request->user();
        $rule = DB::table('community_rules')->whereNull('deleted_at')->where('id', $id)->first();

        abort_if(!$rule, 404, 'Rule not found.');

        $data = $request->validate([
            'title'                   => 'sometimes|string|max:200',
            'category'                => 'sometimes|string|max:100',
            'description'             => 'sometimes|string',
            'severity'                => 'sometimes|in:' . implode(',', self::SEVERITIES),
            'requires_acknowledgment' => 'sometimes|boolean',
            'status'                  => 'sometimes|in:active,inactive',
        ]);

        if (isset($data['category'])) {
            $this->ensureCategory((int) $rule->community_id, $data['category']);
        }

        $data['updated_at'] = now();
        $fields = ['title', 'category', 'description', 'severity', 'requires_acknowledgment', 'status'];
        $before = ActivityLogService::snapshot($rule, $fields);

        DB::table('community_rules')->where('id', $id)->update($data);
        $updated = DB::table('community_rules')->find($id);
        ActivityLogService::recordUpdate(
            'community_rule_updated',
            'CommunityRule',
            $id,
            $before,
            ActivityLogService::snapshot($updated, $fields),
            [],
            null,
            null,
            ['related_item' => $updated->title ?? $rule->title],
        );

        return response()->json([
            'data'    => $this->formatRule($updated, $user->id, true),
            'message' => 'Rule updated successfully.',
        ]);
    }

    /* ─── DELETE /v1/admin/community-rules/{id} ───────────────── */
    public function destroy(int $id): JsonResponse
    {
        $rule = DB::table('community_rules')->whereNull('deleted_at')->where('id', $id)->first();
        abort_if(!$rule, 404, 'Rule not found.');

        DB::table('community_rules')->where('id', $id)->update(['deleted_at' => now(), 'updated_at' => now()]);

        return response()->json(['message' => 'Rule deleted successfully.']);
    }

    /* ─── POST /v1/community-rules/{id}/acknowledge ───────────── */
    public function acknowledge(Request $request, int $id): JsonResponse
    {
        $user = $request->user();
        $rule = DB::table('community_rules')
            ->where('id', $id)
            ->where('status', 'active')
            ->whereNull('deleted_at')
            ->first();

        abort_if(!$rule, 404, 'Rule not found.');

        DB::table('rule_acknowledgments')->updateOrInsert(
            ['rule_id' => $id, 'user_id' => $user->id],
            ['acknowledged_at' => now()],
        );

        return response()->json(['message' => 'Rule acknowledged.', 'acknowledged' => true]);
    }
}
