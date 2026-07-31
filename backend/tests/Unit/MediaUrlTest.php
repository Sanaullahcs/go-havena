<?php

namespace Tests\Unit;

use App\Support\MediaUrl;
use Illuminate\Http\Request;
use Tests\TestCase;

class MediaUrlTest extends TestCase
{
    public function test_normalize_extracts_storage_path_from_absolute_url(): void
    {
        $this->assertSame(
            '/storage/notices/cover.jpg',
            MediaUrl::normalize('http://127.0.0.1:8000/storage/notices/cover.jpg'),
        );
    }

    public function test_normalize_keeps_external_urls(): void
    {
        $url = 'https://cdn.example.com/notices/bbq.jpg';

        $this->assertSame($url, MediaUrl::normalize($url));
    }

    public function test_to_public_rewrites_storage_path_for_request_host(): void
    {
        config(['app.url' => 'http://10.0.2.2/Nbr-link/backend/public']);

        $request = Request::create(
            'http://10.0.2.2/Nbr-link/backend/public/api/v1/notices',
            'GET',
        );

        $resolved = MediaUrl::toPublic(
            'http://127.0.0.1:8000/storage/notices/cover.jpg',
            $request,
        );

        $this->assertSame(
            'http://10.0.2.2/Nbr-link/backend/public/storage/notices/cover.jpg',
            $resolved,
        );
    }
}
