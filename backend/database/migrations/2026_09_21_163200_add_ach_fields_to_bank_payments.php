<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('community_plaid_connections')) {
            Schema::table('community_plaid_connections', function (Blueprint $table) {
                if (! Schema::hasColumn('community_plaid_connections', 'ach_account')) {
                    $table->text('ach_account')->nullable();
                }
                if (! Schema::hasColumn('community_plaid_connections', 'ach_routing')) {
                    $table->text('ach_routing')->nullable();
                }
                if (! Schema::hasColumn('community_plaid_connections', 'transfer_access_token')) {
                    $table->text('transfer_access_token')->nullable();
                }
                if (! Schema::hasColumn('community_plaid_connections', 'transfer_account_id')) {
                    $table->string('transfer_account_id')->nullable();
                }
            });
        }

        if (Schema::hasTable('bookings') && ! Schema::hasColumn('bookings', 'payment_method')) {
            Schema::table('bookings', function (Blueprint $table) {
                $table->string('payment_method', 32)->nullable();
                $table->foreignId('plaid_transfer_id')->nullable()->constrained('plaid_transfers')->nullOnDelete();
                $table->string('ach_status', 32)->nullable();
            });
        }

        if (Schema::hasTable('amenity_resident_bills') && ! Schema::hasColumn('amenity_resident_bills', 'payment_method')) {
            Schema::table('amenity_resident_bills', function (Blueprint $table) {
                $table->string('payment_method', 32)->nullable();
                $table->foreignId('plaid_transfer_id')->nullable()->constrained('plaid_transfers')->nullOnDelete();
                $table->string('ach_status', 32)->nullable();
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasTable('bookings') && Schema::hasColumn('bookings', 'plaid_transfer_id')) {
            Schema::table('bookings', function (Blueprint $table) {
                $table->dropConstrainedForeignId('plaid_transfer_id');
                $table->dropColumn(['payment_method', 'ach_status']);
            });
        }

        if (Schema::hasTable('amenity_resident_bills') && Schema::hasColumn('amenity_resident_bills', 'plaid_transfer_id')) {
            Schema::table('amenity_resident_bills', function (Blueprint $table) {
                $table->dropConstrainedForeignId('plaid_transfer_id');
                $table->dropColumn(['payment_method', 'ach_status']);
            });
        }

        if (Schema::hasTable('community_plaid_connections') && Schema::hasColumn('community_plaid_connections', 'ach_account')) {
            Schema::table('community_plaid_connections', function (Blueprint $table) {
                $table->dropColumn([
                    'ach_account',
                    'ach_routing',
                    'transfer_access_token',
                    'transfer_account_id',
                ]);
            });
        }
    }
};
