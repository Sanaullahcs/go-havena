<?php

namespace App\Services;

use App\Support\MediaUrl;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\ValidationException;

class UtilityBillStorage
{
    /** Shared with profile self-upload and system-admin profile edits. */
    public const RULE = 'file|mimes:jpg,jpeg,jfif,png,pdf,heic,heif|max:10240';

    public function store(UploadedFile $file): string
    {
        $path = $file->store('utility-bills', 'public');
        if (! is_string($path) || $path === '') {
            throw ValidationException::withMessages([
                'utility_bill' => ['Could not save the file. Storage is not writable.'],
            ]);
        }

        $absolute = url(Storage::url($path));

        return MediaUrl::normalize($absolute) ?? $absolute;
    }
}
