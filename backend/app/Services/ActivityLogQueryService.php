<?php

namespace App\Services;

use App\Support\ActivityActionCatalog;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;
use Illuminate\Database\Query\Builder;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class ActivityLogQueryService
{
    /**
     * @return array<string, mixed>
     */
    public function paginate(Request $request, array $constraints = []): array
    {
        $query = $this->baseQuery();
        $this->applyConstraints($query, $constraints);
        $this->applyFilters($query, $request);

        $perPage = min(max((int) $request->get('per_page', 25), 1), 100);
        $result = $query->paginate($perPage);

        return $this->present($result);
    }

    public function baseQuery(): Builder
    {
        return DB::table('activity_logs as a')
            ->leftJoin('users as u', 'u.id', '=', DB::raw('COALESCE(a.actor_user_id, a.user_id)'))
            ->leftJoin('communities as c', 'c.id', '=', 'a.community_id')
            ->select([
                'a.id',
                'a.log_type',
                'a.action',
                'a.description',
                'a.entity_type',
                'a.entity_id',
                'a.ip_address',
                'a.user_agent',
                'a.severity',
                'a.meta',
                'a.created_at',
                'a.actor_user_id',
                'a.actor_role',
                'a.actor_type',
                'a.subject_user_id',
                'a.community_id',
                'a.module',
                'a.status',
                'a.request_id',
                'u.name as user_name',
                'u.email as user_email',
                'u.role as user_role',
                'c.name as community_name',
            ])
            ->orderByDesc('a.created_at')
            ->orderByDesc('a.id');
    }

    public function applyConstraints(Builder $query, array $constraints): void
    {
        if (! empty($constraints['tab'])) {
            $this->applyTab($query, (string) $constraints['tab']);
        }

        if (! empty($constraints['community_id'])) {
            $communityId = (int) $constraints['community_id'];
            $query->where(function (Builder $inner) use ($communityId) {
                $inner->where('a.community_id', $communityId)
                    ->orWhere(function (Builder $legacy) use ($communityId) {
                        $legacy->whereNull('a.community_id')
                            ->where('a.entity_type', 'Community')
                            ->where('a.entity_id', $communityId);
                    });
            });
        }

        if (! empty($constraints['actor_user_id'])) {
            $actorId = (int) $constraints['actor_user_id'];
            $query->where(function (Builder $inner) use ($actorId) {
                $inner->where('a.actor_user_id', $actorId)
                    ->orWhere('a.user_id', $actorId);
            });
        }

        if (! empty($constraints['subject_user_id'])) {
            $this->constrainToPerson($query, (int) $constraints['subject_user_id']);
        }
    }

    public function constrainToPerson(Builder $query, int $userId): void
    {
        $query->where(function (Builder $inner) use ($userId) {
            $inner->where('a.actor_user_id', $userId)
                ->orWhere('a.user_id', $userId)
                ->orWhere('a.subject_user_id', $userId)
                ->orWhere(function (Builder $entity) use ($userId) {
                    $entity->where('a.entity_type', 'User')->where('a.entity_id', $userId);
                })
                ->orWhere('a.meta->affected_user_id', $userId);
        });
    }

    public function applyTab(Builder $query, string $tab): void
    {
        match ($tab) {
            'residents' => $query->where(function (Builder $inner) {
                $inner->where('a.actor_type', 'resident')
                    ->orWhere('a.actor_role', 'resident')
                    ->orWhere(function (Builder $legacy) {
                        $legacy->whereNull('a.actor_type')
                            ->where('a.log_type', 'user')
                            ->where('u.role', 'resident');
                    });
            }),
            'community_admins' => $query->where(function (Builder $inner) {
                $inner->where('a.actor_type', 'community_admin')
                    ->orWhere('a.actor_role', 'community_admin')
                    ->orWhere(function (Builder $legacy) {
                        $legacy->whereNull('a.actor_type')
                            ->where('u.role', 'community_admin');
                    });
            }),
            'guests' => $query->where(function (Builder $inner) {
                $inner->where('a.actor_type', 'guest')
                    ->orWhere('a.actor_role', 'guest')
                    ->orWhere('a.action', 'like', 'guest_%')
                    ->orWhereIn('a.entity_type', ['Guest', 'GuestInvitation']);
            }),
            'system' => $query->where(function (Builder $inner) {
                $inner->where('a.log_type', 'system')
                    ->orWhereIn('a.actor_type', ['system_admin', 'system'])
                    ->orWhereIn('a.actor_role', ['system_admin', 'admin']);
            }),
            default => null,
        };
    }

    public function applyFilters(Builder $query, Request $request): void
    {
        if ($type = $request->get('type')) {
            $query->where('a.log_type', $type);
        }

        if ($severity = $request->get('severity')) {
            $query->where('a.severity', $severity);
        }

        if ($search = trim((string) $request->get('search', ''))) {
            $query->where(function (Builder $inner) use ($search) {
                $inner->where('a.description', 'like', "%{$search}%")
                    ->orWhere('a.action', 'like', "%{$search}%")
                    ->orWhere('a.entity_type', 'like', "%{$search}%")
                    ->orWhere('a.module', 'like', "%{$search}%")
                    ->orWhere('a.meta', 'like', "%{$search}%")
                    ->orWhere('u.name', 'like', "%{$search}%")
                    ->orWhere('c.name', 'like', "%{$search}%");
            });
        }

        if ($request->filled('date')) {
            $query->whereDate('a.created_at', $request->get('date'));
        }
        if ($request->filled('date_from')) {
            $query->whereDate('a.created_at', '>=', $request->get('date_from'));
        }
        if ($request->filled('date_to')) {
            $query->whereDate('a.created_at', '<=', $request->get('date_to'));
        }

        if ($request->filled('community_id') && empty($request->attributes->get('activity_community_locked'))) {
            $query->where('a.community_id', (int) $request->get('community_id'));
        }

        if ($request->filled('actor_user_id')) {
            $query->where(function (Builder $inner) use ($request) {
                $actorId = (int) $request->get('actor_user_id');
                $inner->where('a.actor_user_id', $actorId)->orWhere('a.user_id', $actorId);
            });
        }

        if ($request->filled('subject_user_id')) {
            $this->constrainToPerson($query, (int) $request->get('subject_user_id'));
        }

        if ($role = $request->get('role')) {
            $query->where(function (Builder $inner) use ($role) {
                $inner->where('a.actor_role', $role)->orWhere('u.role', $role);
            });
        }

        if ($module = $request->get('module')) {
            $query->where(function (Builder $inner) use ($module) {
                $inner->where('a.module', $module)->orWhere('a.entity_type', $module);
            });
        }

        if ($action = $request->get('action')) {
            $query->where('a.action', $action);
        }

        if ($status = $request->get('status')) {
            $query->where(function (Builder $inner) use ($status) {
                $inner->where('a.status', $status)->orWhere('a.meta->status', $status);
            });
        }

        if ($ip = $request->get('ip')) {
            $query->where('a.ip_address', 'like', '%'.$ip.'%');
        }
    }

    /**
     * @return array<string, mixed>
     */
    public function present(LengthAwarePaginator $result): array
    {
        $items = collect($result->items())->map(function ($row) {
            $formatted = ActivityActionCatalog::formatLogRow($row);

            $meta = is_array($formatted['meta'] ?? null) ? $formatted['meta'] : [];
            $changes = is_array($formatted['changes'] ?? null) ? $formatted['changes'] : [];
            $oldValues = [];
            $newValues = [];
            foreach ($changes as $change) {
                $key = (string) ($change['key'] ?? $change['field'] ?? '');
                if ($key === '') {
                    continue;
                }
                $oldValues[$key] = $change['previous'] ?? null;
                $newValues[$key] = $change['next'] ?? null;
            }

            return array_merge($formatted, [
                'log_type' => $row->log_type ?? 'user',
                'user_name' => $row->user_name ?? $formatted['performed_by'] ?? null,
                'user_email' => $row->user_email ?? null,
                'user_role' => $row->actor_role ?? $row->user_role ?? null,
                'user_agent' => $row->user_agent ?? null,
                'actor_user_id' => isset($row->actor_user_id) ? (int) $row->actor_user_id : null,
                'actor_type' => $row->actor_type ?? null,
                'account_role' => $formatted['account_role'] ?? ($meta['account_role'] ?? null),
                'active_context' => $formatted['active_context'] ?? ($meta['active_context'] ?? $row->actor_role ?? null),
                'active_mode' => $formatted['active_mode'] ?? ($meta['active_mode'] ?? $row->actor_role ?? null),
                'subject_user_id' => isset($row->subject_user_id) ? (int) $row->subject_user_id : null,
                'community_id' => isset($row->community_id) ? (int) $row->community_id : null,
                'community_name' => $row->community_name ?? null,
                'module' => $row->module ?? $formatted['module'] ?? null,
                'status' => $formatted['status'] ?? $row->status ?? null,
                'request_id' => $row->request_id ?? null,
                'old_values' => $oldValues,
                'new_values' => $newValues,
                'error' => $meta['error'] ?? $meta['error_message'] ?? null,
            ]);
        })->values();

        return [
            'data' => $items,
            'current_page' => $result->currentPage(),
            'last_page' => $result->lastPage(),
            'per_page' => $result->perPage(),
            'total' => $result->total(),
        ];
    }
}
