<?php

namespace App\Support;

use Illuminate\Support\Facades\DB;

class ActivityActionCatalog
{
    /** @var array<string, string> */
    private const LABELS = [
        'guest_invited'       => 'Guest invited',
        'login'               => 'Logged in',
        'logout'              => 'Logged out',
        'post_created'        => 'Created a post',
        'post_deleted'        => 'Deleted a post',
        'post_liked'          => 'Liked a post',
        'post_unliked'        => 'Removed post like',
        'post_commented'      => 'Commented on a post',
        'comment_deleted'     => 'Deleted a comment',
        'comment_reported_by_resident' => 'Reported a comment',
        'user_reported_by_resident' => 'Reported a resident',
        'listing_reported_by_resident' => 'Reported a marketplace listing',
        'listing_created'     => 'Created a marketplace listing',
        'listing_updated'     => 'Updated a marketplace listing',
        'listing_deleted'     => 'Deleted a marketplace listing',
        'listing_sold'        => 'Marked listing as sold',
        'listing_approved'    => 'Listing approved',
        'listing_reapproved'  => 'Listing re-approved',
        'listing_rejected'    => 'Listing rejected',
        'business_created'    => 'Added a business',
        'business_updated'    => 'Updated a business',
        'business_deleted'    => 'Deleted a business',
        'business_approved'   => 'Business approved',
        'business_rejected'   => 'Business rejected',
        'deal_created'        => 'Created a deal',
        'deal_updated'        => 'Updated a deal',
        'deal_deleted'        => 'Deleted a deal',
        'notice_created'      => 'Created a notice',
        'event_created'       => 'Created an event',
        'event_submitted'     => 'Submitted an event',
        'alert_created'       => 'Sent an alert',
        'profile_updated'     => 'Updated profile',
    ];

    public static function label(string $action): string
    {
        return self::LABELS[$action] ?? ucwords(str_replace('_', ' ', $action));
    }

    /**
     * @param  array<string, mixed>|null  $meta
     * @return array{activity_name: string, related_item: string|null, status: string|null}
     */
    public static function presentation(string $action, ?string $entityType, ?int $entityId, ?array $meta = null): array
    {
        $meta = $meta ?? [];

        $related = null;
        if (! empty($meta['related_item'])) {
            $related = (string) $meta['related_item'];
        } elseif (! empty($meta['title'])) {
            $related = (string) $meta['title'];
        } elseif (! empty($meta['name'])) {
            $related = (string) $meta['name'];
        } elseif ($entityType && $entityId) {
            $related = "{$entityType} #{$entityId}";
        }

        $status = isset($meta['status']) ? (string) $meta['status'] : null;

        return [
            'activity_name' => self::label($action),
            'related_item'  => $related,
            'status'        => $status,
        ];
    }

    /** @return array<string, mixed> */
    public static function formatLogRow(object $log): array
    {
        $meta = null;
        if (isset($log->meta) && is_string($log->meta) && $log->meta !== '') {
            $meta = json_decode($log->meta, true);
        } elseif (isset($log->meta) && is_array($log->meta)) {
            $meta = $log->meta;
        }

        $presentation = self::presentation(
            (string) $log->action,
            $log->entity_type ?? null,
            isset($log->entity_id) ? (int) $log->entity_id : null,
            is_array($meta) ? $meta : null,
        );

        $status = $presentation['status'];
        $liveStatus = self::resolveLiveEntityStatus(
            $log->entity_type ?? null,
            isset($log->entity_id) ? (int) $log->entity_id : null,
        );
        if ($liveStatus !== null) {
            $status = $liveStatus;
        }

        return [
            'id'            => (int) $log->id,
            'action'        => (string) $log->action,
            'activity_name' => $presentation['activity_name'],
            'description'   => (string) $log->description,
            'entity_type'   => $log->entity_type ?? null,
            'entity_id'     => isset($log->entity_id) ? (int) $log->entity_id : null,
            'related_item'  => $presentation['related_item'],
            'status'        => $status,
            'severity'      => (string) ($log->severity ?? 'info'),
            'ip_address'    => $log->ip_address ?? null,
            'created_at'    => (string) $log->created_at,
        ];
    }

    public static function resolveLiveEntityStatus(?string $entityType, ?int $entityId): ?string
    {
        if (! $entityType || ! $entityId) {
            return null;
        }

        $table = match ($entityType) {
            'Listing'  => 'listings',
            'Deal'     => 'deals',
            'Business' => 'businesses',
            'Post'     => 'posts',
            default    => null,
        };

        if (! $table) {
            return null;
        }

        $row = DB::table($table)->where('id', $entityId)->first();
        if (! $row) {
            return null;
        }

        if (property_exists($row, 'deleted_at') && $row->deleted_at) {
            return 'deleted';
        }

        return isset($row->status) ? (string) $row->status : null;
    }
}
