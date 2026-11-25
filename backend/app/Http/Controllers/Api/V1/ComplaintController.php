<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Services\ComplaintService;
use App\Support\ContentFieldRules;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\StreamedResponse;

class ComplaintController extends Controller
{
    public function __construct(private readonly ComplaintService $complaints) {}

    public function units(Request $request): JsonResponse
    {
        return response()->json(['data' => $this->complaints->residentUnits($request->user())]);
    }

    public function index(Request $request): JsonResponse
    {
        return response()->json($this->complaints->residentIndex($request->user(), $request));
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'type' => 'required|in:maintenance,technical',
            'category' => 'required|string|max:40',
            'priority' => 'nullable|in:low,normal,high,urgent',
            'unit_id' => 'nullable|integer',
            'title' => ContentFieldRules::rules()['title'],
            'description' => ContentFieldRules::rules()['description'],
            'files' => 'nullable|array|max:5',
            'files.*' => 'file|max:10240|mimes:pdf,doc,docx,jpg,jpeg,png,webp',
        ], ContentFieldRules::messages());

        $headerCommunity = (int) $request->header('X-Community-Id', 0);
        $complaint = $this->complaints->create(
            $request->user(),
            $data,
            $this->uploadedFiles($request, 'files'),
            $headerCommunity > 0 ? $headerCommunity : null,
        );

        return response()->json(['data' => $complaint, 'message' => 'Complaint submitted.'], 201);
    }

    public function show(Request $request, int $id): JsonResponse
    {
        return response()->json(['data' => $this->complaints->showForResident($request->user(), $id)]);
    }

    public function message(Request $request, int $id): JsonResponse
    {
        $data = $request->validate([
            'body' => 'required|string|min:1|max:5000',
            'files' => 'nullable|array|max:5',
            'files.*' => 'file|max:10240|mimes:pdf,doc,docx,jpg,jpeg,png,webp',
        ]);

        return response()->json([
            'data' => $this->complaints->addMessage($request->user(), $id, $data['body'], 'public', $this->uploadedFiles($request, 'files')),
        ]);
    }

    public function attachment(Request $request, int $id): JsonResponse
    {
        $request->validate([
            'file' => 'required|file|max:10240|mimes:pdf,doc,docx,jpg,jpeg,png,webp',
        ]);

        return response()->json([
            'data' => $this->complaints->addMessage($request->user(), $id, 'Attachment added.', 'public', $this->uploadedFiles($request, 'file')),
        ]);
    }

    public function status(Request $request, int $id): JsonResponse
    {
        $data = $request->validate([
            'status' => 'required|string|max:32',
            'note' => [
                \Illuminate\Validation\Rule::requiredIf(fn () => $request->input('status') === 'reopened'),
                'nullable',
                'string',
                'max:1000',
            ],
            'files' => 'nullable|array|max:5',
            'files.*' => 'file|max:10240|mimes:pdf,doc,docx,jpg,jpeg,png,webp',
        ]);
        $files = $request->file('files');

        return response()->json([
            'data' => $this->complaints->transition(
                $request->user(),
                $id,
                $data['status'],
                $data['note'] ?? null,
                false,
                is_array($files) ? array_values($files) : ($files ? [$files] : []),
            ),
        ]);
    }

    public function read(Request $request, int $id): JsonResponse
    {
        return response()->json(['data' => $this->complaints->markRead($request->user(), $id)]);
    }

    public function feedback(Request $request, int $id): JsonResponse
    {
        $data = $request->validate([
            'rating' => 'required|integer|min:1|max:5',
            'comment' => 'nullable|string|max:1000',
        ]);

        return response()->json([
            'data' => $this->complaints->feedback($request->user(), $id, (int) $data['rating'], $data['comment'] ?? null),
        ]);
    }

    public function download(Request $request, int $id, int $attachment): StreamedResponse
    {
        return $this->complaints->download($request->user(), $id, $attachment);
    }

    /** @return list<\Illuminate\Http\UploadedFile> */
    private function uploadedFiles(Request $request, string $key): array
    {
        $files = $request->file($key);
        if (! $files) {
            return [];
        }

        return is_array($files) ? array_values($files) : [$files];
    }
}
