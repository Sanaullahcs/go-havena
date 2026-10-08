<?php

namespace Tests\Support;

use App\Services\PlaidHttpClient;

/** Records Plaid API calls and answers them from per-path fixtures. */
class FakePlaidHttp extends PlaidHttpClient
{
    /** @var list<array{path: string, payload: array<string, mixed>}> */
    public array $calls = [];

    /** @var array<string, mixed> */
    private array $routes = [];

    public function on(string $path, mixed $response): static
    {
        $this->routes[$path] = $response;

        return $this;
    }

    public function post(string $path, array $payload = []): array
    {
        $this->calls[] = ['path' => $path, 'payload' => $payload];

        if (! array_key_exists($path, $this->routes)) {
            throw new \RuntimeException('Unexpected Plaid path '.$path);
        }

        $response = $this->routes[$path];
        if ($response instanceof \Closure) {
            $response = $response($payload, $this);
        }
        if ($response instanceof \Throwable) {
            throw $response;
        }

        return $response;
    }

    /**
     * @return list<array<string, mixed>>
     */
    public function payloads(string $path): array
    {
        return array_values(array_map(
            static fn (array $call) => $call['payload'],
            array_filter($this->calls, static fn (array $call) => $call['path'] === $path),
        ));
    }

    public function count(string $path): int
    {
        return count($this->payloads($path));
    }
}
