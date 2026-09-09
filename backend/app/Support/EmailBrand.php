<?php

namespace App\Support;

use Illuminate\Mail\Mailable;
use Symfony\Component\Mime\Email;

class EmailBrand
{
    /**
     * Shared brand values for every transactional email view.
     *
     * @return array<string, mixed>
     */
    public static function viewData(): array
    {
        return [
            'brandName' => AppUrls::brandName(),
            'supportEmail' => AppUrls::supportEmail(),
            'tagline' => AppUrls::tagline(),
            'logoUrl' => AppUrls::logoUrl(),
            'logoSrc' => 'cid:havena-mark',
            'appStoreBadgeSrc' => 'cid:badge-app-store',
            'playStoreBadgeSrc' => 'cid:badge-google-play',
            'websiteUrl' => AppUrls::websiteUrl(),
            'privacyUrl' => AppUrls::privacyUrl(),
            'termsUrl' => AppUrls::termsUrl(),
            'appStoreUrl' => AppUrls::appStore(),
            'playStoreUrl' => AppUrls::playStore(),
            'currentYear' => now()->timezone(config('app.timezone'))->format('Y'),
        ];
    }

    /**
     * @return array<string, string> cid name => filename
     */
    public static function inlineImageMap(): array
    {
        return [
            'havena-mark' => 'havena-mark.png',
            'badge-app-store' => 'badge-app-store.png',
            'badge-google-play' => 'badge-google-play.png',
            'icon-community' => 'icon-community.png',
            'icon-person' => 'icon-person.png',
            'icon-code' => 'icon-code.png',
            'icon-mail' => 'icon-mail.png',
            'icon-info' => 'icon-info.png',
            'icon-calendar' => 'icon-calendar.png',
            'icon-home' => 'icon-home.png',
        ];
    }

    public static function attachInlineImages(Mailable $mailable): void
    {
        $mailable->withSymfonyMessage(function (Email $email) {
            foreach (self::inlineImageMap() as $cid => $filename) {
                $path = public_path('images/email/'.$filename);
                if (is_file($path)) {
                    $email->embedFromPath($path, $cid);
                }
            }
        });
    }

    public static function logoSrc(mixed $message = null): string
    {
        return 'cid:havena-mark';
    }

    public static function imageSrc(string $filename, mixed $message = null, ?string $fallbackUrl = null): string
    {
        $cid = pathinfo($filename, PATHINFO_FILENAME);

        return 'cid:'.$cid;
    }

    public static function iconSrc(string $label): string
    {
        return self::imageSrc(self::iconForLabel($label));
    }

    public static function iconForLabel(string $label): string
    {
        $key = strtolower($label);

        return match (true) {
            str_contains($key, 'community') => 'icon-community.png',
            str_contains($key, 'invited') || str_contains($key, 'person') || str_contains($key, 'name') => 'icon-person.png',
            str_contains($key, 'email') || str_contains($key, 'mail') => 'icon-mail.png',
            str_contains($key, 'code') || str_contains($key, 'invite') => 'icon-code.png',
            str_contains($key, 'time') || str_contains($key, 'date') || str_contains($key, 'preferred') => 'icon-calendar.png',
            default => 'icon-info.png',
        };
    }
}
