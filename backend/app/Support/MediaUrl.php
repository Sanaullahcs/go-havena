<?php

namespace App\Support;

use Illuminate\Http\Request;

class MediaUrl
{
    /** Store only the public disk path, e.g. `/storage/notices/abc.jpg`. */
    public static function normalize(?string $url): ?string
    {
        if ($url === null || trim($url) === '') {
            return null;
        }

        $url = trim($url);

        if (str_starts_with($url, 'http://') || str_starts_with($url, 'https://')) {
            $path = parse_url($url, PHP_URL_PATH);
            if (is_string($path) && str_contains($path, '/storage/')) {
                $offset = strpos($path, '/storage/');

                return substr($path, $offset);
            }

            return $url;
        }

        $path = str_starts_with($url, '/') ? $url : "/{$url}";
        if (! str_starts_with($path, '/storage/')) {
            return '/storage/'.ltrim($path, '/');
        }

        return $path;
    }

    /** Build a URL the current client can load (mobile, dashboard, etc.). */
    public static function toPublic(?string $url, ?Request $request = null): ?string
    {
        $path = self::normalize($url);
        if ($path === null) {
            return null;
        }

        if (str_starts_with($path, 'http://') || str_starts_with($path, 'https://')) {
            return $path;
        }

        return self::requestRoot($request).$path;
    }

    private static function requestRoot(?Request $request): string
    {
        if (! $request) {
            return rtrim((string) config('app.url'), '/');
        }

        $appParts = parse_url((string) config('app.url'));
        $basePath = isset($appParts['path']) ? rtrim($appParts['path'], '/') : '';
        $requestBase = $request->getBaseUrl();
        if ($requestBase) {
            $basePath = rtrim($requestBase, '/');
        }

        $host = $request->getHost();
        $isLoopback = in_array($host, ['127.0.0.1', 'localhost', '::1'], true);
        $appHost = is_string($appParts['host'] ?? null) ? $appParts['host'] : null;
        $appIsLoopback = $appHost !== null && in_array($appHost, ['127.0.0.1', 'localhost', '::1'], true);

        // Prefer APP_URL when the request came in on loopback but APP_URL is a LAN/public host.
        // Stops mobile clients receiving http://127.0.0.1/... image URLs they cannot open.
        if ($isLoopback && $appHost && ! $appIsLoopback) {
            return rtrim((string) config('app.url'), '/');
        }

        return rtrim($request->getSchemeAndHttpHost().$basePath, '/');
    }
}
