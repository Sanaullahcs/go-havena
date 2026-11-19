<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Services\CommunityStaffService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class CommunityStaffController extends Controller
{
    public function __construct(private readonly CommunityStaffService $staff) {}

    public function index(Request $request): JsonResponse
    {
        return response()->json(['data' => $this->staff->index($request->user(), $request)]);
    }

    public function show(Request $request, int $id): JsonResponse
    {
        return response()->json(['data' => $this->staff->show($request->user(), $id)]);
    }

    public function residents(Request $request): JsonResponse
    {
        return response()->json($this->staff->residents($request->user(), $request));
    }

    public function store(Request $request): JsonResponse
    {
        $data = $this->staff->store($request->user(), $request->all());

        return response()->json([
            'data' => $data,
            'message' => $data['delivery_error']
                ? 'Staff member added, but the invitation email was not delivered. '.$data['delivery_error']
                : 'Staff member added. An invitation email was sent.',
        ], 201);
    }

    public function update(Request $request, int $id): JsonResponse
    {
        return response()->json(['data' => $this->staff->update($request->user(), $id, $request->all())]);
    }

    public function resend(Request $request, int $id): JsonResponse
    {
        $data = $this->staff->resend($request->user(), $id);
        if ($data['delivery_error']) {
            return response()->json([
                'data' => $data,
                'message' => $data['delivery_error'],
            ], 422);
        }

        return response()->json([
            'data' => $data,
            'message' => 'Invitation sent.',
        ]);
    }

    public function accept(Request $request): JsonResponse
    {
        $data = $request->validate(['token' => 'required|string|max:80']);

        return response()->json($this->staff->acceptInvitation($data['token']));
    }
}
