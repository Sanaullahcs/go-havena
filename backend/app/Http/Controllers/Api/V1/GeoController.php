<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Services\OsmGeocodingService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class GeoController extends Controller
{
    /** GET /v1/geo/address-suggest?q= */
    public function suggest(Request $request, OsmGeocodingService $geocoding): JsonResponse
    {
        $validated = $request->validate([
            'q' => ['required', 'string', 'min:3', 'max:200'],
        ]);

        return response()->json([
            'data' => $geocoding->suggest($validated['q']),
        ]);
    }

    /** GET /v1/geo/address-geocode?q= */
    public function geocode(Request $request, OsmGeocodingService $geocoding): JsonResponse
    {
        $validated = $request->validate([
            'q' => ['required', 'string', 'min:3', 'max:200'],
        ]);

        $query = trim($validated['q']);
        $coords = $geocoding->geocode($query);

        return response()->json([
            'data' => $coords ? [
                'address' => $query,
                'latitude' => $coords['latitude'],
                'longitude' => $coords['longitude'],
            ] : null,
        ]);
    }

    /** GET /v1/geo/address-reverse?lat=&lng= */
    public function reverse(Request $request, OsmGeocodingService $geocoding): JsonResponse
    {
        $validated = $request->validate([
            'lat' => ['required', 'numeric', 'between:-90,90'],
            'lng' => ['required', 'numeric', 'between:-180,180'],
        ]);

        return response()->json([
            'data' => $geocoding->reverse((float) $validated['lat'], (float) $validated['lng']),
        ]);
    }
}
