<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('amenities', function (Blueprint $table) {
            $table->boolean('shared_billing_enabled')->default(false)->after('icon_key');
            $table->string('shared_billing_type', 32)->nullable()->after('shared_billing_enabled');
            $table->string('shared_billing_frequency', 16)->nullable()->after('shared_billing_type');
            $table->decimal('shared_billing_amount', 10, 2)->nullable()->after('shared_billing_frequency');
            $table->unsignedTinyInteger('shared_billing_due_day')->nullable()->after('shared_billing_amount');
        });
    }

    public function down(): void
    {
        Schema::table('amenities', function (Blueprint $table) {
            $table->dropColumn([
                'shared_billing_enabled',
                'shared_billing_type',
                'shared_billing_frequency',
                'shared_billing_amount',
                'shared_billing_due_day',
            ]);
        });
    }
};
