<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class AppVersionSetting extends Model
{
    public const DEFAULT_VERSION = '1.0.2';

    public const DEFAULT_IOS_STORE_URL = 'https://apps.apple.com/app/id6800697897';

    public const DEFAULT_ANDROID_STORE_URL = 'https://play.google.com/store/apps/details?id=com.zsquare.havena';

    protected $fillable = [
        'ios_latest_version',
        'ios_minimum_version',
        'ios_force_update',
        'ios_store_url',
        'android_latest_version',
        'android_minimum_version',
        'android_force_update',
        'android_store_url',
        'updated_by',
    ];

    protected function casts(): array
    {
        return [
            'ios_force_update' => 'boolean',
            'android_force_update' => 'boolean',
        ];
    }

    public function updater(): BelongsTo
    {
        return $this->belongsTo(User::class, 'updated_by');
    }

    public static function current(): self
    {
        $settings = self::query()->first();
        if ($settings) {
            return $settings;
        }

        return self::query()->create([
            'ios_latest_version' => self::DEFAULT_VERSION,
            'ios_minimum_version' => self::DEFAULT_VERSION,
            'ios_force_update' => false,
            'ios_store_url' => self::DEFAULT_IOS_STORE_URL,
            'android_latest_version' => self::DEFAULT_VERSION,
            'android_minimum_version' => self::DEFAULT_VERSION,
            'android_force_update' => false,
            'android_store_url' => self::DEFAULT_ANDROID_STORE_URL,
        ]);
    }

    public function platformPayload(string $platform): array
    {
        $isIos = strtolower($platform) === 'ios';

        return [
            'platform' => $isIos ? 'ios' : 'android',
            'latest_version' => $isIos ? $this->ios_latest_version : $this->android_latest_version,
            'minimum_version' => $isIos ? $this->ios_minimum_version : $this->android_minimum_version,
            'force_update' => $isIos ? (bool) $this->ios_force_update : (bool) $this->android_force_update,
            'store_url' => $isIos
                ? ($this->ios_store_url ?: self::DEFAULT_IOS_STORE_URL)
                : ($this->android_store_url ?: self::DEFAULT_ANDROID_STORE_URL),
        ];
    }

    public function toAdminArray(): array
    {
        return [
            'ios' => [
                'latest_version' => $this->ios_latest_version,
                'minimum_version' => $this->ios_minimum_version,
                'force_update' => (bool) $this->ios_force_update,
                'store_url' => $this->ios_store_url ?: self::DEFAULT_IOS_STORE_URL,
            ],
            'android' => [
                'latest_version' => $this->android_latest_version,
                'minimum_version' => $this->android_minimum_version,
                'force_update' => (bool) $this->android_force_update,
                'store_url' => $this->android_store_url ?: self::DEFAULT_ANDROID_STORE_URL,
            ],
            'updated_at' => $this->updated_at?->toIso8601String(),
        ];
    }
}
