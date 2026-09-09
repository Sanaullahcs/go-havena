<?php

namespace App\Support;

use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class ReportTypes
{
    /** Legacy plus content-specific slugs used by mobile/web report sheets. */
    public const ALL = [
        'noise',
        'harassment',
        'damage',
        'spam',
        'safety',
        'other',
        'hate',
        'inappropriate',
        'illegal',
        'privacy',
        'impersonation',
        'fake_profile',
        'scam',
        'prohibited',
        'incorrect',
    ];

    /** @return array<string, mixed> */
    public static function requestRules(bool $typeRequired = false): array
    {
        return [
            'type'        => [$typeRequired ? 'required' : 'nullable', Rule::in(self::ALL)],
            'reason'      => ['nullable', 'string', 'max:500'],
            'description' => ['nullable', 'string', 'max:500'],
        ];
    }

    /**
     * @return array{0: string, 1: string} [type, stored reason text]
     */
    public static function resolvePayload(Request $request): array
    {
        $type = (string) ($request->input('type') ?: 'other');
        $details = trim((string) ($request->input('reason') ?? $request->input('description') ?? ''));

        if ($type === 'other' && mb_strlen($details) < 8) {
            throw ValidationException::withMessages([
                'description' => ['Please tell us more about this report.'],
            ]);
        }

        return [$type, $details !== '' ? $details : $type];
    }
}
