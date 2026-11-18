<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Services\CommunityStaffService;
use App\Services\ComplaintService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class StaffTaskController extends Controller
{
    public function __construct(
        private readonly ComplaintService $complaints,
        private readonly CommunityStaffService $staff,
    ) {}

    public function access(Request $request): JsonResponse
    {
        return response()->json(['data' => $this->staff->access($request->user())]);
    }

    public function invitations(Request $request): JsonResponse
    {
        return response()->json(['data' => $this->staff->invitations($request->user())]);
    }

    public function acceptInvitation(Request $request, int $id): JsonResponse
    {
        return response()->json($this->staff->acceptOwnInvitation($request->user(), $id));
    }

    public function index(Request $request): JsonResponse
    {
        return response()->json($this->complaints->staffIndex($request->user(), $request));
    }

    public function show(Request $request, int $id): JsonResponse
    {
        return response()->json(['data' => $this->complaints->staffShow($request->user(), $id)]);
    }

    public function status(Request $request, int $id): JsonResponse
    {
        $data = $request->validate([
            'status' => 'required|string|in:in_review,in_progress,not_resolved,resolved',
            'note' => [
                'nullable',
                'string',
                'max:1000',
                Rule::when(in_array($request->input('status'), ['resolved', 'not_resolved'], true), ['required', 'min:3']),
            ],
        ]);

        return response()->json([
            'data' => $this->complaints->staffTransition($request->user(), $id, $data['status'], $data['note'] ?? null),
        ]);
    }

    public function respond(Request $request, int $id): JsonResponse
    {
        $data = $request->validate([
            'decision' => 'required|in:accept,decline',
            'note' => 'nullable|string|max:1000',
        ]);

        return response()->json([
            'data' => $this->complaints->respondToAssignment($request->user(), $id, $data['decision'], $data['note'] ?? null),
        ]);
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $data = $request->validate([
            'body' => 'required|string|min:1|max:5000',
            'files' => 'nullable|array|max:5',
            'files.*' => 'file|max:10240|mimes:pdf,doc,docx,jpg,jpeg,png,webp',
        ]);
        $files = $request->file('files');

        return response()->json([
            'data' => $this->complaints->staffUpdate(
                $request->user(),
                $id,
                $data['body'],
                is_array($files) ? array_values($files) : ($files ? [$files] : []),
            ),
        ]);
    }
}
