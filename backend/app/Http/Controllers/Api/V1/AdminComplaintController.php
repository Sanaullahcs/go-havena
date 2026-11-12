<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Services\ComplaintService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\StreamedResponse;

class AdminComplaintController extends Controller
{
    public function __construct(private readonly ComplaintService $complaints) {}

    public function index(Request $request): JsonResponse
    {
        return response()->json($this->complaints->adminIndex($request->user(), $request));
    }

    public function show(Request $request, int $id): JsonResponse
    {
        return response()->json(['data' => $this->complaints->showForAdmin($request->user(), $id)]);
    }

    public function assignees(Request $request, int $id): JsonResponse
    {
        return response()->json(['data' => $this->complaints->assigneesFor($request->user(), $id)]);
    }

    public function message(Request $request, int $id): JsonResponse
    {
        $data = $request->validate([
            'body' => 'required|string|min:1|max:5000',
            'visibility' => 'nullable|in:public,internal',
            'files' => 'nullable|array|max:5',
            'files.*' => 'file|max:10240|mimes:pdf,doc,docx,jpg,jpeg,png,webp',
        ]);

        return response()->json([
            'data' => $this->complaints->addMessage(
                $request->user(),
                $id,
                $data['body'],
                $data['visibility'] ?? 'public',
                $this->uploadedFiles($request),
                true,
            ),
        ]);
    }

    public function status(Request $request, int $id): JsonResponse
    {
        $data = $request->validate([
            'status' => 'required|string|max:32',
            'note' => 'nullable|string|max:1000',
        ]);

        return response()->json([
            'data' => $this->complaints->transition($request->user(), $id, $data['status'], $data['note'] ?? null, true),
        ]);
    }

    public function assign(Request $request, int $id): JsonResponse
    {
        $data = $request->validate(['assigned_to_user_id' => 'required|integer']);

        return response()->json([
            'data' => $this->complaints->assign($request->user(), $id, (int) $data['assigned_to_user_id']),
        ]);
    }

    public function download(Request $request, int $id, int $attachment): StreamedResponse
    {
        return $this->complaints->download($request->user(), $id, $attachment, true);
    }

    /** @return list<\Illuminate\Http\UploadedFile> */
    private function uploadedFiles(Request $request): array
    {
        $files = $request->file('files');
        if (! $files) {
            return [];
        }

        return is_array($files) ? array_values($files) : [$files];
    }
}
