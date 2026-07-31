<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\ContactSubmission;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class ContactController extends Controller
{
    /** POST /v1/contact — public landing page form */
    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'role'      => ['required', 'string', Rule::in(['resident', 'admin', 'other'])],
            'name'      => ['required', 'string', 'max:255'],
            'email'     => ['required', 'string', 'email', 'max:255'],
            'community' => ['nullable', 'string', 'max:255'],
            'message'   => ['required', 'string', 'max:5000'],
        ]);

        $submission = ContactSubmission::query()->create([
            ...$validated,
            'community'  => isset($validated['community']) ? trim($validated['community']) : null,
            'status'     => 'new',
            'ip_address' => $request->ip(),
            'user_agent' => $request->userAgent(),
        ]);

        return response()->json([
            'data' => $this->transform($submission),
            'message' => 'Thank you — your message has been received.',
        ], 201);
    }

    /** GET /v1/admin/contact-submissions */
    public function adminIndex(Request $request): JsonResponse
    {
        $query = ContactSubmission::query();

        if ($status = $request->string('status')->trim()->toString()) {
            if (in_array($status, ['new', 'read', 'archived'], true)) {
                $query->where('status', $status);
            }
        }

        if ($q = $request->string('q')->trim()->toString()) {
            $query->where(function ($w) use ($q) {
                $w->where('name', 'like', "%{$q}%")
                    ->orWhere('email', 'like', "%{$q}%")
                    ->orWhere('community', 'like', "%{$q}%")
                    ->orWhere('message', 'like', "%{$q}%");
            });
        }

        $statusCounts = ContactSubmission::query()
            ->selectRaw("SUM(CASE WHEN status = 'new' THEN 1 ELSE 0 END) as new_count")
            ->selectRaw("SUM(CASE WHEN status = 'read' THEN 1 ELSE 0 END) as read_count")
            ->selectRaw("SUM(CASE WHEN status = 'archived' THEN 1 ELSE 0 END) as archived_count")
            ->selectRaw('COUNT(*) as total_count')
            ->first();

        $items = $query->orderByDesc('created_at')
            ->paginate(min((int) ($request->per_page ?? 15), 100));

        return response()->json([
            'data' => collect($items->items())->map(fn (ContactSubmission $s) => $this->transform($s))->values(),
            'meta' => [
                'current_page' => $items->currentPage(),
                'last_page'    => $items->lastPage(),
                'total'        => $items->total(),
                'per_page'     => $items->perPage(),
                'stats'        => [
                    'new'      => (int) ($statusCounts->new_count ?? 0),
                    'read'     => (int) ($statusCounts->read_count ?? 0),
                    'archived' => (int) ($statusCounts->archived_count ?? 0),
                    'total'    => (int) ($statusCounts->total_count ?? 0),
                ],
            ],
        ]);
    }

    /** GET /v1/admin/contact-submissions/{id} */
    public function adminShow(int $id): JsonResponse
    {
        $submission = ContactSubmission::query()->findOrFail($id);

        return response()->json([
            'data' => $this->transform($submission, detailed: true),
        ]);
    }

    /** PATCH /v1/admin/contact-submissions/{id} */
    public function adminUpdate(Request $request, int $id): JsonResponse
    {
        $submission = ContactSubmission::query()->findOrFail($id);

        $validated = $request->validate([
            'status' => ['required', 'string', Rule::in(['new', 'read', 'archived'])],
        ]);

        $submission->update(['status' => $validated['status']]);

        return response()->json([
            'data' => $this->transform($submission->fresh(), detailed: true),
            'message' => 'Contact submission updated.',
        ]);
    }

    /** @return array<string, mixed> */
    private function transform(ContactSubmission $submission, bool $detailed = false): array
    {
        $data = [
            'id'         => $submission->id,
            'role'       => $submission->role,
            'name'       => $submission->name,
            'email'      => $submission->email,
            'community'  => $submission->community,
            'message'    => $submission->message,
            'status'     => $submission->status,
            'created_at' => $submission->created_at?->toIso8601String(),
            'updated_at' => $submission->updated_at?->toIso8601String(),
        ];

        if ($detailed) {
            $data['ip_address'] = $submission->ip_address;
            $data['user_agent'] = $submission->user_agent;
        } else {
            $data['message_preview'] = \Illuminate\Support\Str::limit($submission->message, 80);
        }

        return $data;
    }
}
