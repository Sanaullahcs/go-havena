<?php

namespace App\Support;

use Illuminate\Support\Carbon;
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
        'community_admin_updated' => 'Updated community admin',
        'community_admin_approved' => 'Approved community admin',
        'community_admin_rejected' => 'Rejected community admin',
        'community_admin_suspended' => 'Suspended community admin',
        'community_admin_reactivated' => 'Reactivated community admin',
        'community_admin_assigned' => 'Assigned community admin',
        'community_updated'   => 'Updated a community',
        'community_deactivated' => 'Deactivated a community',
        'community_reactivated' => 'Reactivated a community',
        'member_approved'     => 'Approved a member',
        'member_rejected'     => 'Rejected a member',
        'member_suspended'    => 'Suspended a member',
        'amenity_updated'     => 'Updated an amenity',
        'amenity_approved'    => 'Approved an amenity',
        'amenity_rejected'    => 'Rejected an amenity',
        'notice_updated'      => 'Updated a notice',
        'post_updated'        => 'Updated a post',
        'region_updated'      => 'Updated a region',
        'community_rule_updated' => 'Updated a community rule',
        'community_document_updated' => 'Updated a document',
        'plaid_bank_connected' => 'Bank connected',
        'plaid_bank_disconnected' => 'Bank disconnected',
        'plaid_bank_replaced' => 'Bank replaced',
        'plaid_connection_error' => 'Bank connection error',
        'plaid_reconnected' => 'Bank reconnection completed',
        'plaid_resident_bank_connected' => 'Resident bank connected',
        'plaid_resident_bank_replaced' => 'Resident bank replaced',
        'plaid_resident_bank_disconnected' => 'Resident bank disconnected',
        'plaid_resident_reconnected' => 'Resident bank reconnected',
        'plaid_ach_initiated' => 'Bank payment started',
        'plaid_ach_refunded' => 'Bank payment refunded',
        'community_features_updated' => 'Updated resident features',
        'feature_disable_requested' => 'Requested to disable a feature',
        'feature_disable_approved' => 'Approved a feature disable request',
        'feature_disable_rejected' => 'Rejected a feature disable request',
        'feature_enable_requested' => 'Requested to enable a feature',
        'feature_enable_approved' => 'Approved a feature enable request',
        'feature_enable_rejected' => 'Rejected a feature enable request',
        'member_prepared' => 'Added a resident without an invitation',
        'member_invited' => 'Invited a member',
        'member_provisioned' => 'Provisioned a member',
        'member_invite_resent' => 'Resent member invitation',
        'member_invite_cancelled' => 'Cancelled member invitation',
        'member_deactivated' => 'Deactivated a member',
        'member_reactivated' => 'Reactivated a member',
        'member_deleted' => 'Deleted a member',
        'account_deleted' => 'Deleted account',
        'community_created' => 'Created a community',
        'community_approved' => 'Approved a community',
        'community_rejected' => 'Rejected a community',
        'community_deleted' => 'Deleted a community',
        'community_admin_released' => 'Released community admin',
        'community_admin_deleted' => 'Deleted community admin',
        'user_provisioned' => 'Provisioned a user',
        'user_blocked' => 'Blocked a user',
        'report_resolved' => 'Resolved a report',
        'report_escalated' => 'Escalated a report',
        'event_reported_by_resident' => 'Reported an event',
        'post_approved' => 'Approved a post',
        'post_reapproved' => 'Re-approved a post',
        'post_rejected' => 'Rejected a post',
        'post_reported' => 'Reported a post',
        'comment_liked' => 'Liked a comment',
        'comment_unliked' => 'Removed comment like',
        'amenity_created' => 'Created an amenity',
        'amenity_deleted' => 'Deleted an amenity',
        'amenity_booking_requested' => 'Requested an amenity booking',
        'booking_approved' => 'Approved a booking',
        'booking_rejected' => 'Rejected a booking',
        'guest_invite_cancelled' => 'Cancelled a guest invite',
        'guest_login' => 'Guest signed in',
        'guest_access_revoked' => 'Guest access revoked',
        'guest_access_extended' => 'Guest access extended',
        'guest_access_activated' => 'Guest access activated',
        'guest_blocked_action' => 'Guest action blocked',
        'failed_login' => 'Failed sign-in attempt',
        'stripe_webhook_received' => 'Stripe webhook received',
        'stripe_webhook_failed' => 'Stripe webhook failed',
        'stripe_webhook_invalid' => 'Stripe webhook rejected',
        'plaid_webhook_received' => 'Plaid webhook received',
        'plaid_webhook_failed' => 'Plaid webhook failed',
        'plaid_webhook_invalid' => 'Plaid webhook rejected',
        'api_forbidden' => 'Permission denied',
        'api_error' => 'API error',
        'job_failed' => 'Background job failed',
        'switched_to_resident_mode' => 'Switched to Resident Mode',
        'switched_to_admin_mode' => 'Switched to Admin Mode',
        'family_created' => 'Created a family',
        'family_join_requested' => 'Requested to join a family',
        'family_join_activated' => 'Joined a family',
        'family_add_member_requested' => 'Requested to add a family member',
        'family_add_member_admin_approved' => 'Approved a family member request',
        'family_add_member_admin_rejected' => 'Rejected a family member request',
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

        $changes = [];
        if (is_array($meta) && isset($meta['changes']) && is_array($meta['changes'])) {
            foreach ($meta['changes'] as $change) {
                if (! is_array($change)) {
                    continue;
                }
                $changes[] = [
                    'field'    => (string) ($change['field'] ?? ''),
                    'key'      => isset($change['key']) ? (string) $change['key'] : null,
                    'previous' => (string) ($change['previous'] ?? ''),
                    'next'     => (string) ($change['next'] ?? ''),
                ];
            }
        }

        $performedBy = self::performedByFromMeta(is_array($meta) ? $meta : null)
            ?? self::fallbackPerformedBy($log, is_array($meta) ? $meta : null);

        $affectedUser = null;
        if (is_array($meta) && ! empty($meta['affected_user_name'])) {
            $affectedUser = (string) $meta['affected_user_name'];
        } elseif (is_array($meta) && ! empty($meta['affected_user']['name'])) {
            $affectedUser = (string) $meta['affected_user']['name'];
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
            'created_at'    => self::utcIsoTimestamp($log->created_at ?? null),
            'changes'       => $changes,
            'performed_by'  => $performedBy,
            'affected_user' => $affectedUser,
            'affected_user_id' => is_array($meta) && isset($meta['affected_user_id'])
                ? (int) $meta['affected_user_id']
                : null,
            'actor_role_label' => is_array($meta) && ! empty($meta['actor_role_label'])
                ? (string) $meta['actor_role_label']
                : null,
            'account_role' => is_array($meta) && ! empty($meta['account_role'])
                ? (string) $meta['account_role']
                : null,
            'active_context' => is_array($meta) && ! empty($meta['active_context'])
                ? (string) $meta['active_context']
                : (is_array($meta) && ! empty($meta['active_mode']) ? (string) $meta['active_mode'] : null),
            'active_mode' => is_array($meta) && ! empty($meta['active_mode'])
                ? (string) $meta['active_mode']
                : (is_array($meta) && ! empty($meta['active_context']) ? (string) $meta['active_context'] : null),
            'module'        => $log->entity_type ?? (is_array($meta) ? ($meta['module'] ?? null) : null),
            'meta'          => is_array($meta) ? $meta : null,
        ];
    }

    /**
     * @param  array<string, mixed>|null  $meta
     */
    public static function performedByFromMeta(?array $meta): ?string
    {
        if (! $meta) {
            return null;
        }

        if (is_string($meta['performed_by'] ?? null) && $meta['performed_by'] !== '') {
            return $meta['performed_by'];
        }

        if (is_array($meta['performed_by'] ?? null) && ! empty($meta['performed_by']['name'])) {
            $role = \App\Services\ActivityLogService::roleLabel($meta['performed_by']['role'] ?? null);
            $name = (string) $meta['performed_by']['name'];

            return $role.', '.$name;
        }

        if (! empty($meta['actor_name'])) {
            $role = (string) ($meta['actor_role_label'] ?? '');
            $name = (string) $meta['actor_name'];

            return $role !== '' ? $role.', '.$name : $name;
        }

        return null;
    }

    /**
     * @param  array<string, mixed>|null  $meta
     */
    public static function fallbackPerformedBy(object $log, ?array $meta): ?string
    {
        if (is_array($meta) && ! empty($meta['actor_name'])) {
            $role = (string) ($meta['actor_role_label'] ?? '');
            $name = (string) $meta['actor_name'];

            return $role !== '' ? $role.', '.$name : $name;
        }

        $name = $log->user_name ?? $log->actor_name ?? null;
        $role = $log->user_role ?? $log->actor_role ?? null;
        if (! $name) {
            return $log->log_type === 'system' ? 'System' : null;
        }

        $roleLabel = \App\Services\ActivityLogService::roleLabel(is_string($role) ? $role : null);

        return $roleLabel.', '.$name;
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

    /**
     * Activity rows store UTC wall time without an offset. Return one ISO-8601 UTC instant.
     */
    public static function utcIsoTimestamp(mixed $value): ?string
    {
        if ($value === null || $value === '') {
            return null;
        }

        $parsed = Carbon::parse($value, 'UTC')->utc();

        return $parsed->toIso8601String();
    }
}
