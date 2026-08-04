<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('posts', function (Blueprint $table) {
            if (! Schema::hasColumn('posts', 'is_sensitive')) {
                $table->boolean('is_sensitive')->default(false)->after('status');
            }
        });

        if (! Schema::hasTable('post_reports')) {
            Schema::create('post_reports', function (Blueprint $table) {
                $table->id();
                $table->foreignId('post_id')->constrained('posts')->cascadeOnDelete();
                $table->foreignId('reporter_id')->constrained('users')->cascadeOnDelete();
                $table->string('reason', 500);
                $table->timestamps();

                $table->index(['post_id', 'created_at']);
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('post_reports');

        Schema::table('posts', function (Blueprint $table) {
            if (Schema::hasColumn('posts', 'is_sensitive')) {
                $table->dropColumn('is_sensitive');
            }
        });
    }
};
