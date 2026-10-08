<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('plaid_transfers', function (Blueprint $table) {
            $table->string('provider_status', 32)->nullable()->after('status');
            $table->string('credit_status', 32)->nullable()->after('provider_status');
            $table->string('authorization_decision', 32)->nullable()->after('debit_authorization_id');
            $table->string('authorization_rationale', 64)->nullable()->after('authorization_decision');
            $table->string('return_code', 16)->nullable()->after('failure_message');
            $table->timestamp('returned_at')->nullable()->after('failed_at');
            $table->timestamp('cancelled_at')->nullable()->after('returned_at');

            $table->string('refund_status', 32)->nullable()->after('refund_transfer_id');
            $table->decimal('refund_amount', 10, 2)->nullable()->after('refund_status');
            $table->string('refund_reason', 255)->nullable()->after('refund_amount');
            $table->foreignId('refund_requested_by')->nullable()->after('refund_reason')->constrained('users')->nullOnDelete();
            $table->timestamp('refund_requested_at')->nullable()->after('refund_requested_by');
            $table->string('refund_failure_message', 500)->nullable()->after('refund_requested_at');

            $table->string('exception_code', 48)->nullable();
            $table->string('exception_message', 500)->nullable();
            $table->timestamp('exception_at')->nullable();
            $table->timestamp('exception_resolved_at')->nullable();
            $table->unsignedBigInteger('last_event_id')->nullable();
            $table->timestamp('last_synced_at')->nullable();
            $table->string('notified_status', 32)->nullable();

            $table->index('exception_code');
            $table->index('refund_transfer_id');
        });

        // Financial history must survive community or user deletion.
        Schema::table('plaid_transfers', function (Blueprint $table) {
            $table->dropForeign(['community_id']);
            $table->dropForeign(['user_id']);
        });
        Schema::table('plaid_transfers', function (Blueprint $table) {
            $table->unsignedBigInteger('user_id')->nullable()->change();
            $table->foreign('community_id')->references('id')->on('communities')->restrictOnDelete();
            $table->foreign('user_id')->references('id')->on('users')->nullOnDelete();
        });

        Schema::create('plaid_transfer_events', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('event_id')->unique();
            $table->foreignId('plaid_transfer_id')->nullable()->constrained('plaid_transfers')->nullOnDelete();
            $table->string('event_type', 48);
            $table->string('transfer_id')->nullable()->index();
            $table->string('transfer_type', 16)->nullable();
            $table->string('refund_id')->nullable()->index();
            $table->string('sweep_id')->nullable();
            $table->string('amount', 20)->nullable();
            $table->string('failure_code', 16)->nullable();
            $table->string('failure_description', 500)->nullable();
            $table->timestamp('occurred_at')->nullable();
            $table->boolean('matched')->default(false);
            $table->string('outcome', 32)->nullable();
            $table->json('payload')->nullable();
            $table->timestamps();

            $table->index(['matched', 'event_type']);
        });

        Schema::table('community_plaid_connections', function (Blueprint $table) {
            $table->timestamp('payments_paused_at')->nullable();
            $table->foreignId('payments_paused_by')->nullable()->constrained('users')->nullOnDelete();
            $table->string('payments_pause_reason', 255)->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('community_plaid_connections', function (Blueprint $table) {
            $table->dropConstrainedForeignId('payments_paused_by');
            $table->dropColumn(['payments_paused_at', 'payments_pause_reason']);
        });

        Schema::dropIfExists('plaid_transfer_events');

        Schema::table('plaid_transfers', function (Blueprint $table) {
            $table->dropForeign(['community_id']);
            $table->dropForeign(['user_id']);
        });
        Schema::table('plaid_transfers', function (Blueprint $table) {
            $table->foreign('community_id')->references('id')->on('communities')->cascadeOnDelete();
            $table->foreign('user_id')->references('id')->on('users')->cascadeOnDelete();
        });

        Schema::table('plaid_transfers', function (Blueprint $table) {
            $table->dropIndex(['exception_code']);
            $table->dropIndex(['refund_transfer_id']);
            $table->dropConstrainedForeignId('refund_requested_by');
            $table->dropColumn([
                'provider_status', 'credit_status', 'authorization_decision', 'authorization_rationale',
                'return_code', 'returned_at', 'cancelled_at', 'refund_status', 'refund_amount', 'refund_reason',
                'refund_requested_at', 'refund_failure_message', 'exception_code', 'exception_message',
                'exception_at', 'exception_resolved_at', 'last_event_id', 'last_synced_at', 'notified_status',
            ]);
        });
    }
};
