<?php

namespace App\Support;

class AppUrls
{
    public static function adminBase(): string
    {
        return rtrim((string) config('mail.brand.admin_url', 'http://localhost:3000'), '/');
    }

    public static function appBase(): string
    {
        return rtrim((string) config('mail.brand.app_url', self::adminBase()), '/');
    }

    public static function adminLogin(): string
    {
        return self::adminBase().'/login';
    }

    public static function adminDashboard(): string
    {
        return self::adminBase().'/admin';
    }

    public static function adminPendingApproval(): string
    {
        return self::adminBase().'/admin/pending-approval';
    }

    public static function adminSetup(): string
    {
        return self::adminBase().'/admin/setup';
    }

    public static function residentLogin(): string
    {
        return self::appBase().'/resident-login';
    }

    public static function supportEmail(): string
    {
        return (string) config('mail.brand.support', config('mail.from.address', 'hello@gohavena.com'));
    }

    public static function brandName(): string
    {
        return (string) config('mail.brand.name', 'Havena');
    }

    public static function appStore(): string
    {
        return (string) config('mail.brand.app_store_url', 'https://apps.apple.com/app/id6800697897');
    }

    public static function playStore(): string
    {
        return (string) config('mail.brand.play_store_url', 'https://play.google.com/store/apps/details?id=com.zsquare.havena');
    }

    public static function websiteUrl(): string
    {
        $configured = rtrim((string) config('mail.brand.website_url', ''), '/');

        return $configured !== '' ? $configured : self::adminBase();
    }

    public static function tagline(): string
    {
        return (string) config('mail.brand.tagline', 'One trusted place for the whole neighborhood.');
    }

    public static function privacyUrl(): string
    {
        return self::websiteUrl().'/privacy-policy';
    }

    public static function termsUrl(): string
    {
        return self::websiteUrl().'/terms-and-conditions';
    }

    public static function logoPath(): string
    {
        return public_path('images/email/havena-mark.png');
    }

    public static function logoUrl(): string
    {
        $configured = (string) config('mail.brand.logo_url', '');
        if ($configured !== '') {
            return $configured;
        }

        return rtrim((string) config('app.url', self::adminBase()), '/').'/images/email/havena-mark.png';
    }
}
