<?php

namespace App\Services;

use App\Mail\HavenaTransactionalMail;
use App\Support\AppUrls;
use App\Support\MediaUrl;
use Carbon\Carbon;
use Illuminate\Http\Request;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\ValidationException;
use RuntimeException;

class AgreementService
{
    public const REMINDER_GAP_HOURS = 12;

    public function assertPdf(UploadedFile $file): void
    {
        if ($file->getSize() < 5) {
            throw ValidationException::withMessages(['file' => 'The PDF file is empty.']);
        }

        $handle = fopen($file->getRealPath(), 'rb');
        $header = $handle ? fread($handle, 5) : '';
        if (is_resource($handle)) {
            fclose($handle);
        }

        if ($header !== '%PDF-') {
            throw ValidationException::withMessages(['file' => 'Upload a valid PDF file.']);
        }
    }

    public function storeFile(UploadedFile $file, int $communityId): array
    {
        $this->assertPdf($file);
        $path = $file->store("documents/{$communityId}", 'public');
        $absolute = Storage::disk('public')->path($path);
        $relative = '/storage/'.ltrim(str_replace('\\', '/', $path), '/');

        return [
            'file_path' => $relative,
            'file_name' => $file->getClientOriginalName(),
            'file_size' => (int) $file->getSize(),
            'mime_type' => 'application/pdf',
            'page_count' => AgreementPdf::pageCount($absolute),
            'original_checksum' => hash_file('sha256', $absolute) ?: null,
        ];
    }

    public function options(int $communityId, ?string $search): array
    {
        $residents = $this->eligibleResidents($communityId, $search);
        $units = $this->eligibleUnits($communityId, $search);

        return [
            'residents' => $residents,
            'units' => $units,
            'resident_count' => count($residents),
            'unit_count' => count($units),
        ];
    }

    public function createDraft(int $communityId, int $userId, array $fields, array $fileMeta): int
    {
        return (int) DB::table('community_documents')->insertGetId([
            'community_id' => $communityId,
            'created_by' => $userId,
            'title' => $fields['title'],
            'category' => $fields['category'],
            'description' => $fields['description'] ?? null,
            'file_path' => $fileMeta['file_path'],
            'file_name' => $fileMeta['file_name'],
            'file_size' => $fileMeta['file_size'],
            'mime_type' => $fileMeta['mime_type'],
            'status' => 'inactive',
            'kind' => 'agreement',
            'publication_status' => 'draft',
            'signature_required' => true,
            'allow_late_signing' => false,
            'due_at' => $fields['due_at'] ?? null,
            'effective_at' => $fields['effective_at'] ?? null,
            'expires_at' => $fields['expires_at'] ?? null,
            'version' => $fields['version'] ?? 1,
            'supersedes_id' => $fields['supersedes_id'] ?? null,
            'page_count' => $fileMeta['page_count'] ?? null,
            'original_checksum' => $fileMeta['original_checksum'] ?? null,
            'created_at' => now(),
            'updated_at' => now(),
        ]);
    }

    public function publish(object $document, int $actorId, string $scope, array $userIds, array $unitIds, bool $notify): array
    {
        if (($document->kind ?? '') !== 'agreement') {
            abort(404, 'Agreement not found.');
        }
        if ($document->publication_status === 'published') {
            return ['document' => $this->fresh($document->id), 'assigned' => 0, 'already_published' => true];
        }
        if ($document->publication_status !== 'draft') {
            abort(422, 'Only a draft agreement can be published.');
        }

        $recipients = $this->resolveRecipients((int) $document->community_id, $scope, $userIds, $unitIds);
        if ($recipients === []) {
            abort(422, 'No eligible residents were selected.');
        }

        $now = now();
        $publishedNow = false;
        DB::transaction(function () use ($document, $recipients, $scope, $now, &$publishedNow) {
            $locked = DB::table('community_documents')->where('id', $document->id)->lockForUpdate()->first();
            if (! $locked || $locked->publication_status === 'published') {
                return;
            }
            if ($locked->publication_status !== 'draft') {
                abort(422, 'Only a draft agreement can be published.');
            }
            $publishedNow = true;

            foreach ($recipients as $recipient) {
                DB::table('community_document_assignments')->insert([
                    'document_id' => $document->id,
                    'community_id' => $document->community_id,
                    'user_id' => $recipient['user_id'],
                    'unit_id' => $recipient['unit_id'],
                    'unit_label' => $recipient['unit_label'],
                    'scope_key' => $recipient['scope_key'],
                    'document_version' => (int) $locked->version,
                    'status' => 'pending',
                    'created_at' => $now,
                    'updated_at' => $now,
                ]);
            }

            DB::table('community_documents')->where('id', $document->id)->update([
                'publication_status' => 'published',
                'status' => 'active',
                'assignment_scope' => $scope,
                'published_at' => $now,
                'updated_at' => $now,
            ]);

            if ($locked->supersedes_id) {
                DB::table('community_documents')
                    ->where('id', $locked->supersedes_id)
                    ->where('publication_status', 'published')
                    ->update([
                        'publication_status' => 'superseded',
                        'updated_at' => $now,
                    ]);
            }
        });

        $fresh = $this->fresh((int) $document->id);
        if ($publishedNow) {
            $this->activity((int) $fresh->id, (int) $fresh->community_id, $actorId, null, 'published', [
                'recipients' => count($recipients),
                'scope' => $scope,
            ]);
            if ($notify) {
                $this->notifyRecipients($fresh, $recipients, $fresh->supersedes_id ? 'updated' : 'published');
            }
        }

        return [
            'document' => $fresh,
            'assigned' => $publishedNow ? count($recipients) : 0,
            'already_published' => ! $publishedNow,
        ];
    }

    public function remind(object $document, ?int $assignmentId, int $actorId): array
    {
        $this->assertAgreement($document);
        $query = DB::table('community_document_assignments')
            ->where('document_id', $document->id)
            ->whereIn('status', ['pending', 'viewed']);
        if ($assignmentId) {
            $query->where('id', $assignmentId);
        }
        $rows = $query->get();
        $sent = 0;
        $skipped = 0;
        foreach ($rows as $row) {
            if (! $this->reminderAllowed($row)) {
                $skipped++;
                continue;
            }
            $this->sendReminder($document, $row);
            $sent++;
            $this->activity((int) $document->id, (int) $document->community_id, $actorId, (int) $row->id, 'reminded', []);
        }

        return ['sent' => $sent, 'skipped' => $skipped];
    }

    public function sendDueReminders(): int
    {
        $rows = DB::table('community_document_assignments as a')
            ->join('community_documents as d', 'd.id', '=', 'a.document_id')
            ->where('d.kind', 'agreement')
            ->where('d.publication_status', 'published')
            ->whereNull('d.deleted_at')
            ->whereIn('a.status', ['pending', 'viewed'])
            ->whereNotNull('d.due_at')
            ->where('d.due_at', '<=', now()->addDays(3))
            ->get(['a.*', 'd.title', 'd.due_at', 'd.community_id as doc_community_id', 'd.publication_status', 'd.supersedes_id', 'd.kind', 'd.id as doc_id']);

        $sent = 0;
        foreach ($rows as $row) {
            if (! $this->reminderAllowed($row)) {
                continue;
            }
            $document = (object) [
                'id' => $row->doc_id,
                'title' => $row->title,
                'community_id' => $row->doc_community_id,
                'supersedes_id' => $row->supersedes_id,
            ];
            $this->sendReminder($document, $row);
            $sent++;
        }

        return $sent;
    }

    public function sign(object $document, object $user, array $payload, Request $request): array
    {
        $this->assertAgreement($document);
        $assignmentId = (int) $payload['assignment_id'];
        $replayed = false;

        $result = DB::transaction(function () use ($document, $user, $payload, $request, $assignmentId, &$replayed) {
            $assignment = DB::table('community_document_assignments')
                ->where('id', $assignmentId)
                ->where('document_id', $document->id)
                ->lockForUpdate()
                ->first();
            abort_if(! $assignment || (int) $assignment->user_id !== (int) $user->id, 404, 'Agreement assignment not found.');

            if ($assignment->status === 'signed') {
                $replayed = true;
                $signature = DB::table('community_document_signatures')->where('assignment_id', $assignment->id)->first();

                return [$assignment, $signature];
            }

            $this->assertCanSign($document, $assignment, $user, (int) $payload['version']);
            $method = $payload['method'];
            $strokes = $method === 'draw' ? $this->normalizeStrokes($payload['strokes'] ?? []) : [];
            $typedName = $method === 'type' ? trim((string) ($payload['typed_name'] ?? '')) : null;
            if ($method === 'type' && mb_strlen((string) $typedName) < 2) {
                throw ValidationException::withMessages(['typed_name' => 'Type your full name to sign.']);
            }
            $placement = $this->normalizePlacement($payload['placement'] ?? null);

            $signedAt = Carbon::now('UTC');
            $signatureId = DB::table('community_document_signatures')->insertGetId([
                'assignment_id' => $assignment->id,
                'document_id' => $document->id,
                'user_id' => $user->id,
                'community_id' => $document->community_id,
                'unit_id' => $assignment->unit_id,
                'document_version' => (int) $document->version,
                'method' => $method,
                'typed_name' => $typedName,
                'strokes' => $strokes === [] ? null : json_encode($strokes),
                'placement' => $placement === null ? null : json_encode($placement),
                'consent_accepted' => true,
                'consent_at' => $signedAt,
                'signed_at' => $signedAt,
                'ip_address' => $request->ip(),
                'user_agent' => substr((string) $request->userAgent(), 0, 255),
                'original_checksum' => $document->original_checksum,
                'created_at' => $signedAt,
                'updated_at' => $signedAt,
            ]);

            $bytes = $this->renderSignedPdf($document, $assignment, $user, $signatureId, $signedAt, $method, $typedName, $strokes, $placement);
            $checksum = hash('sha256', $bytes);
            $relative = "agreements/{$document->community_id}/{$signatureId}.pdf";
            if (! Storage::disk('local')->put($relative, $bytes)) {
                throw new RuntimeException('Could not store the signed agreement.');
            }

            DB::table('community_document_signatures')->where('id', $signatureId)->update([
                'signed_file_path' => $relative,
                'checksum' => $checksum,
                'updated_at' => $signedAt,
            ]);
            DB::table('community_document_assignments')->where('id', $assignment->id)->update([
                'status' => 'signed',
                'signed_at' => $signedAt,
                'signed_file_path' => $relative,
                'updated_at' => $signedAt,
            ]);

            return [
                DB::table('community_document_assignments')->where('id', $assignment->id)->first(),
                DB::table('community_document_signatures')->where('id', $signatureId)->first(),
            ];
        });

        [$assignment, $signature] = $result;
        if (! $replayed) {
            $this->activity((int) $document->id, (int) $document->community_id, (int) $user->id, (int) $assignment->id, 'signed', [
                'method' => $signature->method,
                'version' => (int) $document->version,
            ], $request);
            $this->notifySigned($document, $user, $assignment);
        }

        return [
            'assignment' => $assignment,
            'signature' => $this->publicSignature($signature),
            'replayed' => $replayed,
            'signed_file_url' => $this->temporaryFileUrl((int) $assignment->id, $request),
        ];
    }

    public function decline(object $document, object $user, int $assignmentId): object
    {
        $this->assertAgreement($document);

        return DB::transaction(function () use ($document, $user, $assignmentId) {
            $assignment = DB::table('community_document_assignments')
                ->where('id', $assignmentId)
                ->where('document_id', $document->id)
                ->lockForUpdate()
                ->first();
            abort_if(! $assignment || (int) $assignment->user_id !== (int) $user->id, 404, 'Agreement assignment not found.');
            if ($assignment->status === 'signed') {
                abort(422, 'A signed agreement cannot be declined.');
            }
            if ($assignment->status === 'declined') {
                return $assignment;
            }
            if (! in_array($assignment->status, ['pending', 'viewed'], true) || $document->publication_status !== 'published') {
                abort(422, 'This agreement can no longer be declined.');
            }
            DB::table('community_document_assignments')->where('id', $assignment->id)->update([
                'status' => 'declined',
                'declined_at' => now(),
                'updated_at' => now(),
            ]);
            $this->activity((int) $document->id, (int) $document->community_id, (int) $user->id, (int) $assignment->id, 'declined', []);

            return DB::table('community_document_assignments')->where('id', $assignment->id)->first();
        });
    }

    public function archive(object $document, int $actorId): object
    {
        $this->assertAgreement($document);
        if ($document->publication_status === 'draft') {
            abort(422, 'Delete a draft instead of archiving it.');
        }
        DB::table('community_documents')->where('id', $document->id)->update([
            'publication_status' => 'archived',
            'status' => 'inactive',
            'updated_at' => now(),
        ]);
        $this->activity((int) $document->id, (int) $document->community_id, $actorId, null, 'archived', []);

        return $this->fresh((int) $document->id);
    }

    public function revoke(object $document, int $actorId): object
    {
        $this->assertAgreement($document);
        $now = now();
        DB::transaction(function () use ($document, $now) {
            DB::table('community_documents')->where('id', $document->id)->update([
                'publication_status' => 'revoked',
                'status' => 'inactive',
                'updated_at' => $now,
            ]);
            DB::table('community_document_assignments')
                ->where('document_id', $document->id)
                ->whereIn('status', ['pending', 'viewed'])
                ->update([
                    'status' => 'revoked',
                    'updated_at' => $now,
                ]);
        });
        $this->activity((int) $document->id, (int) $document->community_id, $actorId, null, 'revoked', []);

        return $this->fresh((int) $document->id);
    }

    public function stats(int $documentId): array
    {
        $rows = DB::table('community_document_assignments')
            ->where('document_id', $documentId)
            ->selectRaw('status, COUNT(*) as total')
            ->groupBy('status')
            ->pluck('total', 'status');
        $document = DB::table('community_documents')->where('id', $documentId)->first();
        $overdue = 0;
        if ($document && $this->deadlinePassed($document->due_at)) {
            $overdue = (int) DB::table('community_document_assignments')
                ->where('document_id', $documentId)
                ->whereIn('status', ['pending', 'viewed'])
                ->count();
        }

        $signed = (int) ($rows['signed'] ?? 0);
        $pending = (int) ($rows['pending'] ?? 0) + (int) ($rows['viewed'] ?? 0);
        $declined = (int) ($rows['declined'] ?? 0);
        $viewed = (int) DB::table('community_document_assignments')
            ->where('document_id', $documentId)
            ->whereNotNull('viewed_at')
            ->count();

        return [
            'recipients' => (int) $rows->sum(),
            'signed' => $signed,
            'pending' => $pending,
            'viewed' => $viewed,
            'declined' => $declined,
            'overdue' => $overdue,
        ];
    }

    public function recipients(int $documentId, Request $request): array
    {
        $document = DB::table('community_documents')->where('id', $documentId)->first();
        $rows = DB::table('community_document_assignments as a')
            ->join('users as u', 'u.id', '=', 'a.user_id')
            ->where('a.document_id', $documentId)
            ->orderBy('u.name')
            ->get(['a.*', 'u.name as resident_name']);

        return $rows->map(function ($row) use ($document, $request) {
            return [
                'id' => (int) $row->id,
                'user_id' => (int) $row->user_id,
                'resident_name' => $row->resident_name,
                'unit_id' => $row->unit_id ? (int) $row->unit_id : null,
                'unit_label' => $row->unit_label,
                'delivery_status' => $row->notified_at ? 'delivered' : 'assigned',
                'viewed_at' => $this->iso($row->viewed_at),
                'signature_status' => $row->status,
                'display_status' => $this->displayStatus($document, $row),
                'signed_at' => $this->iso($row->signed_at),
                'signed_file_url' => $row->status === 'signed' ? $this->temporaryFileUrl((int) $row->id, $request) : null,
            ];
        })->all();
    }

    public function exportCsv(object $document, Request $request): string
    {
        $this->assertAgreement($document);
        $handle = fopen('php://temp', 'w+');
        fputcsv($handle, ['Resident', 'Unit', 'Delivery', 'Viewed at', 'Signature status', 'Signed at']);
        foreach ($this->recipients((int) $document->id, $request) as $row) {
            fputcsv($handle, [
                $row['resident_name'],
                $row['unit_label'] ?? '',
                $row['delivery_status'],
                $row['viewed_at'] ?? '',
                $row['display_status'],
                $row['signed_at'] ?? '',
            ]);
        }
        rewind($handle);
        $csv = stream_get_contents($handle) ?: '';
        fclose($handle);

        return $csv;
    }

    public function recordView(object $document, int $userId): void
    {
        if (($document->kind ?? 'document') !== 'agreement') {
            return;
        }
        $rows = DB::table('community_document_assignments')
            ->where('document_id', $document->id)
            ->where('user_id', $userId)
            ->whereIn('status', ['pending', 'viewed'])
            ->get();
        foreach ($rows as $row) {
            $updates = ['updated_at' => now()];
            if (! $row->viewed_at) {
                $updates['viewed_at'] = now();
                $updates['status'] = 'viewed';
                $this->activity((int) $document->id, (int) $document->community_id, $userId, (int) $row->id, 'viewed', []);
            }
            DB::table('community_document_assignments')->where('id', $row->id)->update($updates);
        }
    }

    public function residentCanView(object $document, int $userId, bool $isAdmin): bool
    {
        if (($document->kind ?? 'document') !== 'agreement') {
            return true;
        }
        if ($isAdmin) {
            return true;
        }

        return DB::table('community_document_assignments')
            ->where('document_id', $document->id)
            ->where('user_id', $userId)
            ->where('status', '!=', 'revoked')
            ->exists();
    }

    public function expandForResident(array $documents, int $userId): array
    {
        $ids = array_map(fn ($doc) => (int) $doc['id'], $documents);
        $assignments = DB::table('community_document_assignments')
            ->where('user_id', $userId)
            ->whereIn('document_id', $ids)
            ->where('status', '!=', 'revoked')
            ->orderBy('id')
            ->get()
            ->groupBy('document_id');

        $items = [];
        foreach ($documents as $document) {
            if (($document['kind'] ?? 'document') !== 'agreement') {
                $items[] = $document;
                continue;
            }
            $mine = $assignments->get($document['id'], collect());
            foreach ($mine as $assignment) {
                $items[] = $this->withAssignment($document, $assignment);
            }
        }

        return $items;
    }

    public function assignmentsFor(int $documentId, int $userId, Request $request): array
    {
        return DB::table('community_document_assignments')
            ->where('document_id', $documentId)
            ->where('user_id', $userId)
            ->where('status', '!=', 'revoked')
            ->orderBy('id')
            ->get()
            ->map(function ($assignment) use ($request) {
                $document = DB::table('community_documents')->where('id', $assignment->document_id)->first();

                return [
                    'assignment_id' => (int) $assignment->id,
                    'unit_id' => $assignment->unit_id ? (int) $assignment->unit_id : null,
                    'unit_label' => $assignment->unit_label,
                    'signature_status' => $assignment->status,
                    'display_status' => $this->displayStatus($document, $assignment),
                    'viewed_at' => $this->iso($assignment->viewed_at),
                    'signed_at' => $this->iso($assignment->signed_at),
                    'can_sign' => $this->canSign($document, $assignment),
                    'signed_file_url' => $assignment->status === 'signed'
                        ? $this->temporaryFileUrl((int) $assignment->id, $request)
                        : null,
                ];
            })->all();
    }

    public function ownedSignedPath(int $assignmentId, int $userId, bool $isAdmin, ?int $communityId): ?string
    {
        $assignment = DB::table('community_document_assignments')->where('id', $assignmentId)->first();
        if (! $assignment || $assignment->status !== 'signed' || ! $assignment->signed_file_path) {
            return null;
        }
        $allowed = (int) $assignment->user_id === $userId
            || ($isAdmin && $communityId && (int) $assignment->community_id === $communityId);
        if (! $allowed) {
            return null;
        }

        return $assignment->signed_file_path;
    }

    public function temporaryFileUrl(int $assignmentId, Request $request): string
    {
        $expires = now()->addMinutes(15)->getTimestamp();
        $signature = hash_hmac('sha256', $assignmentId.'|'.$expires, (string) config('app.key'));
        $path = '/api/v1/documents/signed-files/'.$assignmentId.'?expires='.$expires.'&signature='.$signature;

        return rtrim($request->getSchemeAndHttpHost().$request->getBaseUrl(), '/').$path;
    }

    private function signedPdfEmailUrl(int $assignmentId): string
    {
        $expires = now()->addDays(30)->getTimestamp();
        $signature = hash_hmac('sha256', $assignmentId.'|'.$expires, (string) config('app.key'));
        $base = rtrim((string) config('mail.brand.api_url', config('app.url')), '/');

        return $base.'/api/v1/documents/signed-files/'.$assignmentId.'?expires='.$expires.'&signature='.$signature;
    }

    public function validFileSignature(int $assignmentId, ?string $expires, ?string $signature): bool
    {
        if (! $expires || ! $signature || ! ctype_digit($expires)) {
            return false;
        }
        if ((int) $expires < time()) {
            return false;
        }
        $expected = hash_hmac('sha256', $assignmentId.'|'.$expires, (string) config('app.key'));

        return hash_equals($expected, $signature);
    }

    public function absoluteOriginalPath(object $document): string
    {
        $normalized = MediaUrl::normalize($document->file_path);
        $relative = ltrim(substr((string) $normalized, strlen('/storage/')), '/');

        return Storage::disk('public')->path($relative);
    }

    public function absoluteSignedPath(string $relative): string
    {
        return Storage::disk('local')->path($relative);
    }

    private function renderSignedPdf(object $document, object $assignment, object $user, int $signatureId, Carbon $signedAt, string $method, ?string $typedName, array $strokes, ?array $placement = null): string
    {
        $community = DB::table('communities')->where('id', $document->community_id)->value('name');
        $lines = [
            'Agreement: '.$document->title,
            'Community: '.($community ?: 'Community'),
            'Version: '.$document->version,
            'Original file: '.$document->file_name,
            'Original SHA-256: '.($document->original_checksum ?: 'unavailable'),
            'Signer: '.$user->name,
            'Account ID: '.$user->id,
            $assignment->unit_label ? 'Unit: '.$assignment->unit_label : 'Unit: not unit-specific',
            'Method: '.($method === 'draw' ? 'Drawn signature' : 'Typed electronic signature'),
            'Signed at (UTC): '.$signedAt->toIso8601String(),
            'The signer confirmed they reviewed this agreement and consented to sign it electronically.',
            'Signature event: '.$signatureId,
        ];

        try {
            return AgreementPdf::stamp($this->absoluteOriginalPath($document), $lines, $strokes, $typedName, $placement);
        } catch (RuntimeException $e) {
            abort(422, $e->getMessage());
        }
    }

    private function assertCanSign(object $document, object $assignment, object $user, int $version): void
    {
        if ((int) $version !== (int) $document->version || (int) $assignment->document_version !== (int) $document->version) {
            abort(409, 'This agreement version changed. Review the current version before signing.');
        }
        if (! $this->memberIsActive((int) $document->community_id, (int) $user->id)) {
            abort(403, 'You are not allowed to sign this agreement.');
        }
        if (! $this->canSign($document, $assignment)) {
            abort(422, 'This agreement is no longer available to sign.');
        }
    }

    /**
     * A date chosen in the agreement form is stored at midnight. That calendar
     * day stays open until the day ends. A value with a real time is exact.
     */
    private function deadlinePassed(mixed $value): bool
    {
        if ($value === null || $value === '') {
            return false;
        }
        $moment = Carbon::parse($value);
        if ($moment->format('H:i:s') === '00:00:00') {
            $moment = $moment->copy()->endOfDay();
        }

        return $moment->isPast();
    }

    private function canSign(object $document, object $assignment): bool
    {
        if (($document->publication_status ?? '') !== 'published') {
            return false;
        }
        if (! in_array($assignment->status, ['pending', 'viewed'], true)) {
            return false;
        }
        if ($this->deadlinePassed($document->expires_at ?? null)) {
            return false;
        }
        if ($this->deadlinePassed($document->due_at ?? null) && ! $document->allow_late_signing) {
            return false;
        }

        return true;
    }

    private function normalizeStrokes(array $strokes): array
    {
        $clean = [];
        $points = 0;
        foreach (array_slice($strokes, 0, 100) as $path) {
            if (! is_array($path)) {
                continue;
            }
            $normalized = [];
            foreach ($path as $point) {
                if (! is_array($point) || ! isset($point['x'], $point['y'])) {
                    continue;
                }
                $normalized[] = [
                    'x' => max(0, min(1, (float) $point['x'])),
                    'y' => max(0, min(1, (float) $point['y'])),
                ];
                $points++;
                if ($points > 800) {
                    break 2;
                }
            }
            if (count($normalized) >= 2) {
                $clean[] = $normalized;
            }
        }
        if ($clean === []) {
            throw ValidationException::withMessages(['strokes' => 'Draw your signature before signing.']);
        }

        return $clean;
    }

    /**
     * @return array{page: int, x: float, y: float, width: float, height: float}|null
     */
    private function normalizePlacement(mixed $placement): ?array
    {
        if (! is_array($placement)) {
            return null;
        }

        $width = max(0.08, min(0.9, (float) ($placement['width'] ?? 0)));
        $height = max(0.04, min(0.6, (float) ($placement['height'] ?? 0)));
        $x = max(0, min(1 - $width, (float) ($placement['x'] ?? 0)));
        $y = max(0, min(1 - $height, (float) ($placement['y'] ?? 0)));

        return [
            'page' => max(1, (int) ($placement['page'] ?? 1)),
            'x' => round($x, 4),
            'y' => round($y, 4),
            'width' => round($width, 4),
            'height' => round($height, 4),
        ];
    }

    private function resolveRecipients(int $communityId, string $scope, array $userIds, array $unitIds): array
    {
        $eligible = collect($this->eligibleResidents($communityId, null))->keyBy('id');
        $rows = [];

        if ($scope === 'units') {
            $units = DB::table('units')
                ->where('community_id', $communityId)
                ->where('status', 'active')
                ->whereIn('id', array_map('intval', $unitIds))
                ->get()
                ->keyBy('id');
            $links = DB::table('unit_residents')
                ->where('community_id', $communityId)
                ->whereIn('unit_id', $units->keys())
                ->where('status', 'active')
                ->whereNull('left_at')
                ->get();
            foreach ($links as $link) {
                if (! $eligible->has((int) $link->user_id)) {
                    continue;
                }
                $unit = $units->get((int) $link->unit_id);
                if (! $unit) {
                    continue;
                }
                $key = $link->user_id.'|unit:'.$unit->id;
                $rows[$key] = [
                    'user_id' => (int) $link->user_id,
                    'unit_id' => (int) $unit->id,
                    'unit_label' => $unit->unit_number,
                    'scope_key' => 'unit:'.$unit->id,
                ];
            }

            return array_values($rows);
        }

        $selected = $scope === 'residents'
            ? collect($userIds)->map(fn ($id) => (int) $id)->unique()->filter(fn ($id) => $eligible->has($id))
            : $eligible->keys();

        foreach ($selected as $userId) {
            $person = $eligible->get((int) $userId);
            if (! $person) {
                continue;
            }
            $unitId = null;
            $unitLabel = null;
            if (count($person['units']) === 1) {
                $unitId = $person['units'][0]['id'];
                $unitLabel = $person['units'][0]['unit_number'];
            }
            $rows[$userId.'|member'] = [
                'user_id' => (int) $userId,
                'unit_id' => $unitId,
                'unit_label' => $unitLabel,
                'scope_key' => 'member',
            ];
        }

        return array_values($rows);
    }

    private function eligibleResidents(int $communityId, ?string $search): array
    {
        $query = DB::table('community_memberships as m')
            ->join('users as u', 'u.id', '=', 'm.user_id')
            ->where('m.community_id', $communityId)
            ->where('m.status', 'approved')
            ->whereIn('m.role', ['member', 'resident'])
            ->where('u.status', 'active')
            ->orderBy('u.name')
            ->select(['u.id', 'u.name', 'm.status']);
        if ($search) {
            $query->where('u.name', 'like', '%'.$search.'%');
        }
        $people = $query->limit(200)->get();
        $units = DB::table('unit_residents as ur')
            ->join('units as un', 'un.id', '=', 'ur.unit_id')
            ->where('ur.community_id', $communityId)
            ->where('ur.status', 'active')
            ->whereNull('ur.left_at')
            ->whereIn('ur.user_id', $people->pluck('id'))
            ->orderBy('un.unit_number')
            ->get(['ur.user_id', 'un.id as unit_id', 'un.unit_number']);
        $byUser = $units->groupBy('user_id');

        return $people->map(function ($person) use ($byUser) {
            return [
                'id' => (int) $person->id,
                'name' => $person->name,
                'status' => $person->status,
                'units' => $byUser->get($person->id, collect())->map(fn ($unit) => [
                    'id' => (int) $unit->unit_id,
                    'unit_number' => $unit->unit_number,
                ])->values()->all(),
            ];
        })->all();
    }

    private function eligibleUnits(int $communityId, ?string $search): array
    {
        $query = DB::table('units')
            ->where('community_id', $communityId)
            ->where('status', 'active')
            ->orderBy('unit_number');
        if ($search) {
            $query->where('unit_number', 'like', '%'.$search.'%');
        }
        $units = $query->limit(200)->get();
        $links = DB::table('unit_residents as ur')
            ->join('users as u', 'u.id', '=', 'ur.user_id')
            ->join('community_memberships as m', function ($join) use ($communityId) {
                $join->on('m.user_id', '=', 'ur.user_id')
                    ->where('m.community_id', '=', $communityId)
                    ->where('m.status', '=', 'approved')
                    ->whereIn('m.role', ['member', 'resident']);
            })
            ->where('ur.community_id', $communityId)
            ->whereIn('ur.unit_id', $units->pluck('id'))
            ->where('ur.status', 'active')
            ->whereNull('ur.left_at')
            ->where('u.status', 'active')
            ->get(['ur.unit_id', 'u.id as user_id', 'u.name']);
        $byUnit = $links->groupBy('unit_id');

        return $units->map(function ($unit) use ($byUnit) {
            $residents = $byUnit->get($unit->id, collect());

            return [
                'id' => (int) $unit->id,
                'unit_number' => $unit->unit_number,
                'resident_count' => $residents->count(),
                'residents' => $residents->map(fn ($resident) => [
                    'id' => (int) $resident->user_id,
                    'name' => $resident->name,
                ])->values()->all(),
            ];
        })->all();
    }

    private function memberIsActive(int $communityId, int $userId): bool
    {
        return DB::table('community_memberships as m')
            ->join('users as u', 'u.id', '=', 'm.user_id')
            ->where('m.community_id', $communityId)
            ->where('m.user_id', $userId)
            ->where('m.status', 'approved')
            ->where('u.status', 'active')
            ->exists();
    }

    private function notifyRecipients(object $document, array $recipients, string $reason): void
    {
        $title = $reason === 'updated' ? 'Agreement Updated' : 'New Agreement Available';
        $body = $reason === 'updated'
            ? 'An agreement was updated and needs your review.'
            : 'A new agreement requires your review and signature.';
        $url = $this->residentUrl((int) $document->id);
        $communityName = (string) (DB::table('communities')->where('id', $document->community_id)->value('name') ?: 'your community');
        $users = DB::table('users')
            ->whereIn('id', collect($recipients)->pluck('user_id')->map(fn ($id) => (int) $id)->unique()->all())
            ->get(['id', 'name', 'email'])
            ->keyBy('id');
        $notified = [];
        foreach ($recipients as $recipient) {
            $userId = (int) $recipient['user_id'];
            if (isset($notified[$userId])) {
                continue;
            }
            $notified[$userId] = true;
            try {
                NotificationService::send($userId, 'agreement', $title, $body, $url, [
                    'kind' => 'agreement',
                    'document_id' => (int) $document->id,
                ], (int) $document->community_id);
                DB::table('community_document_assignments')
                    ->where('document_id', $document->id)
                    ->where('user_id', $userId)
                    ->update(['notified_at' => now(), 'updated_at' => now()]);
            } catch (\Throwable) {
                // A notification failure must not change the published agreement.
            }
            $this->emailRecipient($document, $users->get($userId), $communityName, $reason);
        }
    }

    private function emailRecipient(object $document, ?object $user, string $communityName, string $reason): void
    {
        if (! $user || ! filled($user->email)) {
            return;
        }

        $updated = $reason === 'updated';
        $name = trim((string) ($user->name ?? ''));
        $greeting = $name !== '' ? "Hello {$name}." : 'Hello.';
        try {
            app(LifecycleMailService::class)->sendOnce(
                'agreement_available',
                'agreement:'.(int) $document->id.':user:'.(int) $user->id,
                (string) $user->email,
                new HavenaTransactionalMail(
                    subjectLine: ($updated ? 'Updated agreement to sign: ' : 'New agreement to sign: ').$document->title,
                    preheader: $document->title.' is ready for your review and signature in '.$communityName.'.',
                    eyebrow: 'Agreement',
                    heading: $updated ? 'An updated agreement is ready to sign' : 'A new agreement is ready to sign',
                    intro: $greeting.' '.($updated
                        ? 'An updated agreement is available for your review and signature.'
                        : 'A new agreement is available for your review and signature.'),
                    paragraphs: [
                        'Open Havena to review the agreement and sign it.',
                    ],
                    details: [
                        ['label' => 'Agreement', 'value' => (string) $document->title],
                        ['label' => 'Community', 'value' => $communityName],
                    ],
                    ctaLabel: 'Review and sign',
                    ctaUrl: AppUrls::agreementReview((int) $document->id),
                    footerNote: 'This email was sent because your community admin shared this agreement with you.',
                ),
            );
        } catch (\Throwable) {
            // An email failure must not change the published agreement.
        }
    }

    private function sendReminder(object $document, object $assignment): void
    {
        try {
            NotificationService::send(
                (int) $assignment->user_id,
                'agreement',
                'Agreement Signature Reminder',
                'Your agreement is awaiting your signature.',
                $this->residentUrl((int) $document->id),
                ['kind' => 'agreement', 'document_id' => (int) $document->id],
                (int) $document->community_id,
            );
        } catch (\Throwable) {
            return;
        }
        DB::table('community_document_assignments')->where('id', $assignment->id)->update([
            'reminder_sent_at' => now(),
            'reminder_count' => ((int) ($assignment->reminder_count ?? 0)) + 1,
            'updated_at' => now(),
        ]);
    }

    private function notifySigned(object $document, object $user, object $assignment): void
    {
        $url = $this->residentUrl((int) $document->id);
        try {
            NotificationService::send(
                (int) $user->id,
                'agreement',
                'Agreement Signed Successfully',
                'Your signed agreement is now available in Documents.',
                $url,
                ['kind' => 'agreement', 'document_id' => (int) $document->id],
                (int) $document->community_id,
            );
        } catch (\Throwable) {
        }

        $admins = DB::table('community_memberships')
            ->where('community_id', $document->community_id)
            ->where('status', 'approved')
            ->where('role', 'admin')
            ->pluck('user_id');
        $adminUsers = DB::table('users')
            ->whereIn('id', $admins)
            ->get(['id', 'name', 'email'])
            ->keyBy('id');
        $communityName = (string) (DB::table('communities')->where('id', $document->community_id)->value('name') ?: 'your community');
        $signedOn = Carbon::parse($assignment->signed_at ?? now())->timezone(config('app.timezone'))->format('M j, Y');
        $pdfUrl = $this->signedPdfEmailUrl((int) $assignment->id);
        foreach ($admins as $adminId) {
            if ((int) $adminId === (int) $user->id) {
                continue;
            }
            try {
                NotificationService::send(
                    (int) $adminId,
                    'agreement',
                    'Agreement Signed',
                    $user->name.' signed '.$document->title.'.',
                    '/admin/documents?tab=agreements&agreement='.$document->id,
                    [
                        'kind' => 'agreement',
                        'document_id' => (int) $document->id,
                        'assignment_id' => (int) $assignment->id,
                        'open_signed' => true,
                    ],
                    (int) $document->community_id,
                );
            } catch (\Throwable) {
            }
            $admin = $adminUsers->get((int) $adminId) ?? $adminUsers->get((string) $adminId);
            $this->emailAdminSigned($document, $user, $admin, $communityName, $signedOn, $pdfUrl, (int) $assignment->id);
        }
    }

    private function emailAdminSigned(object $document, object $resident, ?object $admin, string $communityName, string $signedOn, string $pdfUrl, int $assignmentId): void
    {
        if (! $admin || ! filled($admin->email)) {
            return;
        }

        $adminName = trim((string) ($admin->name ?? ''));
        $residentName = trim((string) ($resident->name ?? '')) ?: 'A resident';
        try {
            app(LifecycleMailService::class)->sendOnce(
                'agreement_signed_admin',
                'agreement:'.(int) $document->id.':assignment:'.$assignmentId.':admin:'.(int) $admin->id,
                (string) $admin->email,
                new HavenaTransactionalMail(
                    subjectLine: $residentName.' signed '.$document->title,
                    preheader: $residentName.' signed '.$document->title.' in '.$communityName.'.',
                    eyebrow: 'Agreement signed',
                    heading: 'A resident signed an agreement',
                    intro: ($adminName !== '' ? "Hello {$adminName}." : 'Hello.').' '.$residentName.' has signed this agreement.',
                    paragraphs: [
                        'The signed PDF includes the resident’s signature on the document.',
                    ],
                    details: [
                        ['label' => 'Resident', 'value' => $residentName],
                        ['label' => 'Agreement', 'value' => (string) $document->title],
                        ['label' => 'Community', 'value' => $communityName],
                        ['label' => 'Signed on', 'value' => $signedOn],
                    ],
                    ctaLabel: 'View signed PDF',
                    ctaUrl: $pdfUrl,
                    footerNote: 'This email was sent because you manage this community on Havena.',
                ),
            );
        } catch (\Throwable) {
            // An email failure must not change the completed signature.
        }
    }

    private function reminderAllowed(object $assignment): bool
    {
        if (! in_array($assignment->status, ['pending', 'viewed'], true)) {
            return false;
        }
        if (! $assignment->reminder_sent_at) {
            return true;
        }

        return Carbon::parse($assignment->reminder_sent_at)->lt(now()->subHours(self::REMINDER_GAP_HOURS));
    }

    private function withAssignment(array $document, object $assignment): array
    {
        $document['assignment_id'] = (int) $assignment->id;
        $document['unit_id'] = $assignment->unit_id ? (int) $assignment->unit_id : null;
        $document['unit_label'] = $assignment->unit_label;
        $document['signature_status'] = $assignment->status;
        $document['display_status'] = $this->displayStatus((object) $document, $assignment);
        $document['viewed_at'] = $this->iso($assignment->viewed_at);
        $document['signed_at'] = $this->iso($assignment->signed_at);
        $document['can_sign'] = $this->canSign((object) $document, $assignment);

        return $document;
    }

    private function displayStatus(object $document, object $assignment): string
    {
        if ($assignment->status === 'signed') {
            return 'signed';
        }
        if (in_array($assignment->status, ['declined', 'revoked'], true)) {
            return $assignment->status;
        }
        $publication = $document->publication_status ?? 'published';
        if ($publication === 'revoked') {
            return 'revoked';
        }
        if ($publication === 'archived' || $publication === 'superseded') {
            return 'expired';
        }
        if ($this->deadlinePassed($document->expires_at ?? null)) {
            return 'expired';
        }
        if ($this->deadlinePassed($document->due_at ?? null)) {
            return 'overdue';
        }
        if ($assignment->status === 'viewed' || ! empty($assignment->viewed_at)) {
            return 'viewed';
        }

        return 'pending';
    }

    private function publicSignature(?object $signature): ?array
    {
        if (! $signature) {
            return null;
        }

        return [
            'id' => (int) $signature->id,
            'method' => $signature->method,
            'signed_at' => $this->iso($signature->signed_at),
            'document_version' => (int) $signature->document_version,
            'checksum' => $signature->checksum,
        ];
    }

    private function activity(int $documentId, int $communityId, ?int $userId, ?int $assignmentId, string $event, array $meta, ?Request $request = null): void
    {
        DB::table('community_document_activity')->insert([
            'document_id' => $documentId,
            'assignment_id' => $assignmentId,
            'community_id' => $communityId,
            'user_id' => $userId,
            'event' => $event,
            'meta' => $meta === [] ? null : json_encode($meta),
            'ip_address' => $request?->ip(),
            'created_at' => now(),
        ]);
    }

    private function residentUrl(int $documentId): string
    {
        return '/screens/property-management/documents/document-detail?documentId='.$documentId;
    }

    private function fresh(int $id): object
    {
        return DB::table('community_documents')->where('id', $id)->first();
    }

    private function assertAgreement(object $document): void
    {
        abort_if(($document->kind ?? '') !== 'agreement' || $document->deleted_at, 404, 'Agreement not found.');
    }

    private function iso(mixed $value): ?string
    {
        if (! $value) {
            return null;
        }

        return Carbon::parse($value)->utc()->toIso8601String();
    }
}
