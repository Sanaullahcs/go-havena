<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Services\AchievementsService;
use App\Services\LoginStreakService;
use App\Services\PointsRewardService;
use App\Services\UserActingContextService;
use App\Support\MediaUrl;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class PointsController extends Controller
{
    public const BADGES_TOTAL = 8;

    /** GET /v1/me/points/stats */
    public function stats(Request $request): JsonResponse
    {
        $user = $request->user();
        $communityId = $this->resolveCommunityId($request, $user);

        app(LoginStreakService::class)->recordLogin($user);
        app(PointsRewardService::class)->awardDailyLogin($user);

        $totalPoints = $this->sumPoints($user->id, $communityId);
        $pointsThisWeek = $this->sumPoints($user->id, $communityId, now()->subDays(7));
        $currentStreak = app(LoginStreakService::class)->calculateStreak($user->id);
        $communityPosts = DB::table('posts')
            ->where('user_id', $user->id)
            ->when($communityId, fn ($q) => $q->where('community_id', $communityId))
            ->whereNull('deleted_at')
            ->count();

        $badgesEarned = app(AchievementsService::class)->countEarned($user->id, $communityId);
        $badgesTotal = AchievementsService::BADGES_TOTAL;
        $rank = $this->calculateCommunityRank($user->id, $communityId);
        $pointsToNextRank = $this->pointsToNextRank($user->id, $communityId, $rank);

        return response()->json([
            'data' => [
                'total_points'       => $totalPoints,
                'points_this_week'   => $pointsThisWeek,
                'current_streak'     => $currentStreak,
                'badges_earned'      => $badgesEarned,
                'badges_total'       => $badgesTotal,
                'community_posts'    => $communityPosts,
                'rank'               => $rank,
                'community_id'       => $communityId,
                'points_to_next_rank'=> $pointsToNextRank,
            ],
        ]);
    }

    /** GET /v1/me/points/history */
    public function history(Request $request): JsonResponse
    {
        $user = $request->user();
        $communityId = $this->resolveCommunityId($request, $user);
        $perPage = min((int) $request->get('per_page', 20), 50);

        $query = DB::table('point_transactions')
            ->where('user_id', $user->id)
            ->when($communityId, fn ($q) => $q->where('community_id', $communityId))
            ->orderByDesc('created_at');

        $paginator = $query->paginate($perPage);

        $items = collect($paginator->items())->map(fn ($row) => [
            'id'         => $row->id,
            'action'     => $row->action,
            'title'      => $row->title,
            'subtitle'   => $row->subtitle,
            'points'     => (int) $row->points,
            'created_at' => $row->created_at,
        ]);

        return response()->json([
            'data' => $items,
            'meta' => [
                'current_page' => $paginator->currentPage(),
                'last_page'    => $paginator->lastPage(),
                'per_page'     => $paginator->perPage(),
                'total'        => $paginator->total(),
            ],
        ]);
    }

    /** GET /v1/me/points/rank */
    public function rank(Request $request): JsonResponse
    {
        $user = $request->user();
        $communityId = $this->resolveCommunityId($request, $user);

        $totalPoints = $this->sumPoints($user->id, $communityId);
        $pointsThisWeek = $this->sumPoints($user->id, $communityId, now()->subDays(7));
        $rank = $this->calculateCommunityRank($user->id, $communityId);
        $pointsToNextRank = $this->pointsToNextRank($user->id, $communityId, $rank);
        $nextRank = $rank && $rank > 1 ? $rank - 1 : null;

        $board = $this->leaderboardEntries($user, $communityId);
        $entries = $board['entries'];
        $myEntry = collect($entries)->firstWhere('is_me', true);
        $peopleBelow = $myEntry && $rank ? max(count($entries) - $rank, 0) : 0;

        $nearby = [];
        if ($rank) {
            $nearby = collect($entries)
                ->filter(fn ($entry) => abs($entry['rank'] - $rank) <= 2)
                ->values()
                ->all();
        }

        return response()->json([
            'data' => [
                'rank'                => $rank,
                'total_points'        => $totalPoints,
                'points_this_week'    => $pointsThisWeek,
                'points_to_next_rank' => $pointsToNextRank,
                'next_rank'           => $nextRank,
                'community_members'   => count($entries),
                'people_below'        => $peopleBelow,
                'nearby_entries'      => $nearby,
                'entries'             => $entries,
            ],
        ]);
    }

    /** GET /v1/me/achievements */
    public function achievements(Request $request): JsonResponse
    {
        $user = $request->user();
        $communityId = $this->resolveCommunityId($request, $user);

        return response()->json([
            'data' => app(AchievementsService::class)->forUser($user->id, $communityId),
        ]);
    }

    /** GET /v1/leaderboard */
    public function leaderboard(Request $request): JsonResponse
    {
        $user = $request->user();
        $communityId = $this->resolveCommunityId($request, $user);

        if (! $communityId) {
            return response()->json(['data' => ['entries' => [], 'my_rank' => null]]);
        }

        return response()->json([
            'data' => $this->leaderboardEntries($user, $communityId),
        ]);
    }

    /** @return \Illuminate\Support\Collection<int, object{user_id: int, total_points: int}> */
    private function communityLeaderboardTotals(?int $communityId)
    {
        if (! $communityId) {
            return collect();
        }

        $pointsSub = DB::table('point_transactions')
            ->where('community_id', $communityId)
            ->select('user_id', DB::raw('SUM(points) as total_points'))
            ->groupBy('user_id');

        return DB::table('community_memberships as cm')
            ->leftJoinSub($pointsSub, 'pt', 'pt.user_id', '=', 'cm.user_id')
            ->where('cm.community_id', $communityId)
            ->where('cm.status', 'approved')
            ->select('cm.user_id', DB::raw('COALESCE(pt.total_points, 0) as total_points'))
            ->orderByDesc('total_points')
            ->orderBy('cm.user_id')
            ->get();
    }

    /** @return array{entries: array<int, array<string, mixed>>, my_rank: ?int} */
    private function leaderboardEntries(User $user, ?int $communityId): array
    {
        if (! $communityId) {
            return ['entries' => [], 'my_rank' => null];
        }

        $totals = $this->communityLeaderboardTotals($communityId);

        $ranked = $totals->values()->map(function ($row, $index) use ($user) {
            $profileUser = User::query()->with('profile')->find($row->user_id);

            return [
                'rank'         => $index + 1,
                'user_id'      => (int) $row->user_id,
                'name'         => $profileUser?->profile?->display_name ?? $profileUser?->name ?? 'Member',
                'unit_number'  => $profileUser?->profile?->unit_number,
                'avatar_url'   => MediaUrl::toPublic($profileUser?->profile?->avatar_url ?? null, request()),
                'total_points' => (int) $row->total_points,
                'is_me'        => (int) $row->user_id === (int) $user->id,
            ];
        });

        $myRank = $ranked->firstWhere('is_me', true)['rank'] ?? null;

        return [
            'entries' => $ranked->all(),
            'my_rank' => $myRank,
        ];
    }

    private function resolveCommunityId(Request $request, User $user): ?int
    {
        $header = $request->header('X-Community-Id');
        if ($header) {
            return (int) $header;
        }

        return UserActingContextService::currentCommunityId($user);
    }

    private function sumPoints(int $userId, ?int $communityId, $since = null): int
    {
        $query = DB::table('point_transactions')->where('user_id', $userId);

        if ($communityId) {
            $query->where('community_id', $communityId);
        }

        if ($since) {
            $query->where('created_at', '>=', $since);
        }

        return (int) $query->sum('points');
    }

    private function calculateCommunityRank(int $userId, ?int $communityId): ?int
    {
        if (! $communityId) {
            return null;
        }

        $userIds = $this->communityLeaderboardTotals($communityId)->pluck('user_id');
        $rank = $userIds->search($userId);

        return $rank === false ? null : $rank + 1;
    }

    private function pointsToNextRank(int $userId, ?int $communityId, ?int $currentRank): ?int
    {
        if (! $communityId || ! $currentRank || $currentRank <= 1) {
            return null;
        }

        $leaderboard = $this->communityLeaderboardTotals($communityId);

        $myPoints = (int) ($leaderboard->firstWhere('user_id', $userId)->total_points ?? 0);
        $above = $leaderboard->values()->get($currentRank - 2);
        $abovePoints = (int) ($above->total_points ?? $myPoints);

        return max(0, $abovePoints - $myPoints + 1);
    }
}
