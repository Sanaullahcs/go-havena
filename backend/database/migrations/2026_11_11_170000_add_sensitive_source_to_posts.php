<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('posts')) {
            return;
        }

        Schema::table('posts', function (Blueprint $table) {
            if (! Schema::hasColumn('posts', 'sensitive_source')) {
                $table->string('sensitive_source', 32)->nullable()->after('is_sensitive');
            }
            if (! Schema::hasColumn('posts', 'sensitive_reason')) {
                $table->text('sensitive_reason')->nullable()->after('sensitive_source');
            }
        });
    }

    public function down(): void
    {
        if (! Schema::hasTable('posts')) {
            return;
        }

        Schema::table('posts', function (Blueprint $table) {
            if (Schema::hasColumn('posts', 'sensitive_reason')) {
                $table->dropColumn('sensitive_reason');
            }
            if (Schema::hasColumn('posts', 'sensitive_source')) {
                $table->dropColumn('sensitive_source');
            }
        });
    }
};
