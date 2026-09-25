<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('units', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('community_id');
            $table->string('unit_number', 50);
            $table->string('unit_number_normalized', 50);
            $table->string('kind', 20)->default('residential');
            $table->string('status', 20)->default('active');
            $table->unsignedBigInteger('billing_contact_user_id')->nullable();
            $table->timestamps();

            $table->unique(['community_id', 'unit_number_normalized'], 'units_community_number_unique');
            $table->index(['community_id', 'status']);
            $table->foreign('community_id')->references('id')->on('communities')->cascadeOnDelete();
            $table->foreign('billing_contact_user_id')->references('id')->on('users')->nullOnDelete();
        });

        Schema::create('unit_residents', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('unit_id');
            $table->unsignedBigInteger('community_id');
            $table->unsignedBigInteger('user_id');
            $table->string('status', 20)->default('active');
            $table->timestamp('joined_at')->nullable();
            $table->timestamp('left_at')->nullable();
            $table->timestamps();

            $table->unique(['unit_id', 'user_id'], 'unit_residents_unit_user_unique');
            $table->index(['community_id', 'user_id', 'status']);
            $table->foreign('unit_id')->references('id')->on('units')->cascadeOnDelete();
            $table->foreign('community_id')->references('id')->on('communities')->cascadeOnDelete();
            $table->foreign('user_id')->references('id')->on('users')->cascadeOnDelete();
        });

        Schema::create('property_services', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('community_id');
            $table->unsignedBigInteger('created_by')->nullable();
            $table->string('name', 120);
            $table->string('category', 40)->default('water');
            $table->text('description')->nullable();
            $table->string('icon_key', 40)->nullable();
            $table->string('status', 20)->default('active');
            $table->string('application_type', 20);
            $table->string('billing_frequency', 20)->default('monthly');
            $table->string('amount_type', 20)->default('fixed');
            $table->decimal('amount', 10, 2)->nullable();
            $table->unsignedTinyInteger('due_day')->nullable();
            $table->date('first_billing_month')->nullable();
            $table->text('payment_instructions')->nullable();
            $table->boolean('require_payment_proof')->default(true);
            $table->boolean('require_acknowledgement')->default(false);
            $table->boolean('auto_generate_bills')->default(false);
            $table->boolean('send_notice')->default(true);
            $table->boolean('send_notification')->default(true);
            $table->string('notice_title', 200)->nullable();
            $table->text('notice_body')->nullable();
            $table->boolean('requires_admin_approval')->default(false);
            $table->unsignedInteger('max_subscribers')->nullable();
            $table->string('unsubscribe_mode', 20)->default('end_of_period');
            $table->timestamps();

            $table->index(['community_id', 'status']);
            $table->foreign('community_id')->references('id')->on('communities')->cascadeOnDelete();
            $table->foreign('created_by')->references('id')->on('users')->nullOnDelete();
        });

        Schema::create('unit_service_subscriptions', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('community_id');
            $table->unsignedBigInteger('service_id');
            $table->unsignedBigInteger('unit_id');
            $table->unsignedBigInteger('requested_by')->nullable();
            $table->string('status', 20)->default('pending');
            $table->text('note')->nullable();
            $table->unsignedBigInteger('reviewed_by')->nullable();
            $table->timestamp('reviewed_at')->nullable();
            $table->string('rejection_reason', 500)->nullable();
            $table->timestamp('starts_at')->nullable();
            $table->timestamp('ends_at')->nullable();
            $table->timestamp('cancelled_at')->nullable();
            $table->unsignedBigInteger('cancelled_by')->nullable();
            $table->timestamps();

            $table->unique(['service_id', 'unit_id'], 'unit_service_subscriptions_unique');
            $table->index(['community_id', 'status']);
            $table->foreign('community_id')->references('id')->on('communities')->cascadeOnDelete();
            $table->foreign('service_id')->references('id')->on('property_services')->cascadeOnDelete();
            $table->foreign('unit_id')->references('id')->on('units')->cascadeOnDelete();
            $table->foreign('requested_by')->references('id')->on('users')->nullOnDelete();
            $table->foreign('reviewed_by')->references('id')->on('users')->nullOnDelete();
            $table->foreign('cancelled_by')->references('id')->on('users')->nullOnDelete();
        });

        Schema::create('unit_service_bills', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('community_id');
            $table->unsignedBigInteger('service_id');
            $table->unsignedBigInteger('unit_id');
            $table->unsignedBigInteger('billing_contact_user_id')->nullable();
            $table->unsignedBigInteger('created_by')->nullable();
            $table->unsignedBigInteger('notice_id')->nullable();
            $table->date('billing_period');
            $table->string('title', 200);
            $table->text('description')->nullable();
            $table->decimal('amount', 10, 2);
            $table->date('due_date');
            $table->string('status', 32)->default('unpaid');
            $table->text('payment_instructions')->nullable();
            $table->boolean('require_acknowledgement')->default(false);
            $table->boolean('require_payment_proof')->default(true);
            $table->string('file_path', 512)->nullable();
            $table->string('file_name', 255)->nullable();
            $table->unsignedInteger('file_size')->nullable();
            $table->string('mime_type', 120)->nullable();
            $table->timestamp('acknowledged_at')->nullable();
            $table->unsignedBigInteger('acknowledged_by')->nullable();
            $table->string('proof_file_path', 512)->nullable();
            $table->string('proof_file_name', 255)->nullable();
            $table->unsignedInteger('proof_file_size')->nullable();
            $table->string('proof_mime_type', 120)->nullable();
            $table->date('payment_date')->nullable();
            $table->string('payment_reference', 100)->nullable();
            $table->text('payment_note')->nullable();
            $table->timestamp('proof_submitted_at')->nullable();
            $table->unsignedBigInteger('proof_submitted_by')->nullable();
            $table->unsignedBigInteger('approved_by')->nullable();
            $table->timestamp('approved_at')->nullable();
            $table->unsignedBigInteger('rejected_by')->nullable();
            $table->timestamp('rejected_at')->nullable();
            $table->string('rejection_reason', 500)->nullable();
            $table->timestamps();

            $table->unique(['service_id', 'unit_id', 'billing_period'], 'unit_service_bills_period_unique');
            $table->index(['community_id', 'status']);
            $table->index(['billing_contact_user_id', 'status']);
            $table->foreign('community_id')->references('id')->on('communities')->cascadeOnDelete();
            $table->foreign('service_id')->references('id')->on('property_services')->cascadeOnDelete();
            $table->foreign('unit_id')->references('id')->on('units')->cascadeOnDelete();
            $table->foreign('billing_contact_user_id')->references('id')->on('users')->nullOnDelete();
            $table->foreign('created_by')->references('id')->on('users')->nullOnDelete();
        });

        Schema::create('unit_service_bill_reviews', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('bill_id');
            $table->unsignedBigInteger('community_id');
            $table->unsignedBigInteger('service_id');
            $table->unsignedBigInteger('unit_id');
            $table->unsignedBigInteger('actor_id')->nullable();
            $table->string('action', 32);
            $table->string('status_from', 32)->nullable();
            $table->string('status_to', 32)->nullable();
            $table->string('proof_file_path', 512)->nullable();
            $table->string('proof_file_name', 255)->nullable();
            $table->unsignedInteger('proof_file_size')->nullable();
            $table->string('proof_mime_type', 120)->nullable();
            $table->date('payment_date')->nullable();
            $table->string('payment_reference', 100)->nullable();
            $table->text('payment_note')->nullable();
            $table->string('rejection_reason', 500)->nullable();
            $table->timestamps();

            $table->index(['bill_id', 'created_at']);
            $table->foreign('bill_id')->references('id')->on('unit_service_bills')->cascadeOnDelete();
        });

        Schema::create('unit_service_bill_notifications', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('bill_id');
            $table->string('kind', 40);
            $table->timestamp('sent_at')->nullable();
            $table->timestamps();

            $table->unique(['bill_id', 'kind'], 'unit_service_bill_notifications_unique');
            $table->foreign('bill_id')->references('id')->on('unit_service_bills')->cascadeOnDelete();
        });

        $this->backfillUnitsFromProfiles();
    }

    public function down(): void
    {
        Schema::dropIfExists('unit_service_bill_notifications');
        Schema::dropIfExists('unit_service_bill_reviews');
        Schema::dropIfExists('unit_service_bills');
        Schema::dropIfExists('unit_service_subscriptions');
        Schema::dropIfExists('property_services');
        Schema::dropIfExists('unit_residents');
        Schema::dropIfExists('units');
    }

    private function backfillUnitsFromProfiles(): void
    {
        $rows = DB::table('community_memberships as cm')
            ->join('profiles', 'profiles.user_id', '=', 'cm.user_id')
            ->join('users', 'users.id', '=', 'cm.user_id')
            ->where('cm.status', 'approved')
            ->whereNotNull('profiles.unit_number')
            ->where('profiles.unit_number', '!=', '')
            ->where('users.status', '!=', 'deleted')
            ->select([
                'cm.community_id',
                'cm.user_id',
                'cm.role as membership_role',
                'users.role as account_role',
                'profiles.unit_number',
            ])
            ->get();

        $now = now();
        $unitIds = [];

        foreach ($rows as $row) {
            $unitNumber = trim((string) $row->unit_number);
            if ($unitNumber === '') {
                continue;
            }

            $normalized = mb_strtolower(preg_replace('/\s+/', ' ', $unitNumber) ?? $unitNumber);
            $isAdmin = in_array((string) $row->membership_role, ['admin', 'moderator'], true)
                || in_array((string) $row->account_role, ['community_admin', 'admin', 'system_admin'], true);
            $isPlaceholder = in_array($normalized, ['office', 'management office'], true);
            $kind = ($isAdmin && $isPlaceholder) ? 'office' : 'residential';
            $key = $row->community_id.'|'.$normalized;

            if (! isset($unitIds[$key])) {
                $existing = DB::table('units')
                    ->where('community_id', $row->community_id)
                    ->where('unit_number_normalized', $normalized)
                    ->first();

                if ($existing) {
                    $unitIds[$key] = (int) $existing->id;
                } else {
                    $unitIds[$key] = (int) DB::table('units')->insertGetId([
                        'community_id' => $row->community_id,
                        'unit_number' => $unitNumber,
                        'unit_number_normalized' => $normalized,
                        'kind' => $kind,
                        'status' => 'active',
                        'billing_contact_user_id' => $kind === 'residential' ? $row->user_id : null,
                        'created_at' => $now,
                        'updated_at' => $now,
                    ]);
                }
            }

            $unitId = $unitIds[$key];
            $already = DB::table('unit_residents')
                ->where('unit_id', $unitId)
                ->where('user_id', $row->user_id)
                ->exists();

            if (! $already) {
                DB::table('unit_residents')->insert([
                    'unit_id' => $unitId,
                    'community_id' => $row->community_id,
                    'user_id' => $row->user_id,
                    'status' => 'active',
                    'joined_at' => $now,
                    'created_at' => $now,
                    'updated_at' => $now,
                ]);
            }

            $unit = DB::table('units')->find($unitId);
            if ($unit && $kind === 'residential' && empty($unit->billing_contact_user_id)) {
                DB::table('units')->where('id', $unitId)->update([
                    'billing_contact_user_id' => $row->user_id,
                    'updated_at' => $now,
                ]);
            }
        }
    }
};
