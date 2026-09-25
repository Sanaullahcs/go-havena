<?php

namespace App\Services;

use App\Exceptions\CommunityFeatureException;
use Illuminate\Auth\Access\AuthorizationException;
use Illuminate\Auth\AuthenticationException;
use Illuminate\Http\Request;
use Illuminate\Queue\Events\JobFailed;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpKernel\Exception\HttpExceptionInterface;
use Throwable;

class AuditEventLogger
{
    public static function fromException(Throwable $e, ?Request $request = null): void
    {
        $request = $request ?? request();
        if (! $request instanceof Request || ! $request->is('api/*')) {
            return;
        }

        if ($e instanceof ValidationException
            || $e instanceof AuthenticationException
            || $e instanceof CommunityFeatureException
            || $e instanceof \Illuminate\Database\Eloquent\ModelNotFoundException
            || $e instanceof \Symfony\Component\HttpKernel\Exception\NotFoundHttpException) {
            return;
        }

        if ($e instanceof AuthorizationException) {
            self::permissionDenied($request, $e->getMessage() ?: 'This action is unauthorized.');

            return;
        }

        if ($e instanceof HttpExceptionInterface) {
            $status = $e->getStatusCode();
            if ($status === 403 && $request->user()) {
                self::permissionDenied($request, $e->getMessage() ?: 'Forbidden');

                return;
            }

            if ($status >= 500) {
                self::apiError($request, $e, $status);
            }

            return;
        }

        self::apiError($request, $e, 500);
    }

    public static function permissionDenied(Request $request, string $message): void
    {
        $user = $request->user();

        ActivityLogService::system(
            'api_forbidden',
            $message !== '' ? $message : 'Permission denied',
            'warning',
            'Auth',
            $user?->id,
            [
                'module' => 'Auth',
                'status' => 'denied',
                'endpoint' => '/'.$request->path(),
                'http_method' => $request->method(),
                'result' => 'denied',
                'error' => $message,
                'actor_id' => $user?->id,
                'actor_role' => $user?->role,
            ],
        );
    }

    public static function apiError(Request $request, Throwable $e, int $status = 500): void
    {
        ActivityLogService::system(
            'api_error',
            'API error on '.$request->method().' /'.$request->path(),
            $status >= 500 ? 'error' : 'warning',
            'Api',
            null,
            [
                'module' => 'Api',
                'status' => (string) $status,
                'endpoint' => '/'.$request->path(),
                'http_method' => $request->method(),
                'result' => 'error',
                'error' => $e->getMessage(),
                'exception' => class_basename($e),
            ],
        );
    }

    public static function jobFailed(JobFailed $event): void
    {
        ActivityLogService::system(
            'job_failed',
            'Background job failed: '.$event->job->resolveName(),
            'error',
            'Job',
            null,
            [
                'module' => 'Job',
                'status' => 'failed',
                'job' => $event->job->resolveName(),
                'queue' => $event->job->getQueue(),
                'result' => 'failed',
                'error' => $event->exception->getMessage(),
            ],
        );
    }

    /**
     * @param  array<string, mixed>  $meta
     */
    public static function webhook(
        string $provider,
        string $result,
        string $description,
        string $severity = 'info',
        array $meta = [],
    ): void {
        $action = match ($result) {
            'invalid' => $provider.'_webhook_invalid',
            'failed' => $provider.'_webhook_failed',
            default => $provider.'_webhook_received',
        };

        ActivityLogService::system(
            $action,
            $description,
            $severity,
            'Integration',
            null,
            array_merge([
                'module' => $provider === 'plaid' ? 'Plaid' : ($provider === 'stripe' ? 'Billing' : 'Integration'),
                'status' => $result,
                'result' => $result,
            ], $meta),
        );
    }
}
