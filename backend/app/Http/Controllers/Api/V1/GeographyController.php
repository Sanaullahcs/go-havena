<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Country;
use App\Models\State;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class GeographyController extends Controller
{
    /** GET /v1/countries — public list for onboarding pickers */
    public function countries(Request $request): JsonResponse
    {
        $query = Country::query()->where('status', 'active');

        if ($request->boolean('with_states')) {
            $query->with(['states' => fn ($q) => $q->where('status', 'active')]);
        }

        $countries = $query->orderBy('sort_order')->orderBy('name')->get();

        return response()->json([
            'data' => $countries->map(fn (Country $country) => $this->transformCountry($country, $request->boolean('with_states'))),
        ]);
    }

    /** GET /v1/countries/{countryId}/states — public state list */
    public function states(Request $request, int $countryId): JsonResponse
    {
        Country::query()->where('status', 'active')->findOrFail($countryId);

        $states = State::query()
            ->where('country_id', $countryId)
            ->where('status', 'active')
            ->orderBy('sort_order')
            ->orderBy('name')
            ->get();

        return response()->json([
            'data' => $states->map(fn (State $state) => $this->transformState($state)),
        ]);
    }

    /** GET /v1/admin/countries */
    public function adminCountries(Request $request): JsonResponse
    {
        $query = Country::query()->withCount('states');

        if ($q = $request->string('q')->trim()->toString()) {
            $query->where(function ($builder) use ($q) {
                $builder->where('name', 'like', '%'.$q.'%')
                    ->orWhere('code', 'like', '%'.$q.'%');
            });
        }

        $countries = $query->orderBy('sort_order')->orderBy('name')->get();

        return response()->json([
            'data' => $countries->map(fn (Country $country) => [
                ...$this->transformCountry($country),
                'states_count' => $country->states_count,
            ]),
        ]);
    }

    /** GET /v1/admin/states */
    public function adminStates(Request $request): JsonResponse
    {
        $query = State::query()->with('country');

        if ($countryId = $request->integer('country_id')) {
            $query->where('country_id', $countryId);
        }

        if ($status = $request->string('status')->trim()->toString()) {
            if (in_array($status, ['active', 'inactive'], true)) {
                $query->where('status', $status);
            }
        }

        $states = $query->orderBy('sort_order')->orderBy('name')->get();

        return response()->json([
            'data' => $states->map(fn (State $state) => $this->transformState($state, true)),
        ]);
    }

    /** POST /v1/admin/states */
    public function storeState(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'country_id' => ['required', 'integer', 'exists:countries,id'],
            'name' => ['required', 'string', 'min:2', 'max:100'],
            'code' => ['nullable', 'string', 'max:10'],
            'sort_order' => ['nullable', 'integer', 'min:0'],
            'status' => ['nullable', 'in:active,inactive'],
        ]);

        $state = State::query()->create([
            'country_id' => $validated['country_id'],
            'name' => $validated['name'],
            'code' => $validated['code'] ?? null,
            'sort_order' => $validated['sort_order'] ?? 0,
            'status' => $validated['status'] ?? 'active',
        ]);

        $state->load('country');

        return response()->json([
            'data' => $this->transformState($state, true),
            'message' => 'State created',
        ], 201);
    }

    private function transformCountry(Country $country, bool $includeStates = false): array
    {
        $payload = [
            'id' => $country->id,
            'code' => $country->code,
            'name' => $country->name,
            'billing_policy' => $country->billing_policy,
            'billing_exempt' => $country->isBillingExempt(),
            'sort_order' => $country->sort_order,
            'status' => $country->status,
        ];

        if ($includeStates) {
            $payload['states'] = $country->states
                ?->map(fn (State $state) => $this->transformState($state))
                ->values()
                ->all() ?? [];
        }

        return $payload;
    }

    private function transformState(State $state, bool $includeCountry = false): array
    {
        $payload = [
            'id' => $state->id,
            'country_id' => $state->country_id,
            'name' => $state->name,
            'code' => $state->code,
            'sort_order' => $state->sort_order,
            'status' => $state->status,
        ];

        if ($includeCountry && $state->relationLoaded('country') && $state->country) {
            $payload['country'] = $this->transformCountry($state->country);
        }

        return $payload;
    }
}
