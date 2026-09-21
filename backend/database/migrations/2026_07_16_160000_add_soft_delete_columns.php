<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('community_rules', function (Blueprint $table) {
            if (! Schema::hasColumn('community_rules', 'deleted_at')) {
                $table->softDeletes();
            }
        });

        Schema::table('community_documents', function (Blueprint $table) {
            if (! Schema::hasColumn('community_documents', 'deleted_at')) {
                $table->softDeletes();
            }
        });

        Schema::table('regions', function (Blueprint $table) {
            if (! Schema::hasColumn('regions', 'deleted_at')) {
                $table->softDeletes();
            }
        });

        Schema::table('wellness_courses', function (Blueprint $table) {
            if (! Schema::hasColumn('wellness_courses', 'deleted_at')) {
                $table->softDeletes();
            }
        });

        Schema::table('wellness_lessons', function (Blueprint $table) {
            if (! Schema::hasColumn('wellness_lessons', 'deleted_at')) {
                $table->softDeletes();
            }
        });

        Schema::table('communities', function (Blueprint $table) {
            if (! Schema::hasColumn('communities', 'deleted_at')) {
                $table->softDeletes();
            }
        });
    }

    public function down(): void
    {
        foreach (['community_rules', 'community_documents', 'regions', 'wellness_courses', 'wellness_lessons', 'communities'] as $table) {
            if (Schema::hasColumn($table, 'deleted_at')) {
                Schema::table($table, function (Blueprint $blueprint) {
                    $blueprint->dropSoftDeletes();
                });
            }
        }
    }
};
