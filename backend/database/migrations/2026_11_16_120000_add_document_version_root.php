<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('community_documents', function (Blueprint $table) {
            $table->unsignedBigInteger('version_root_id')->nullable()->after('supersedes_id');
            $table->index('version_root_id', 'community_documents_version_root_idx');
        });

        DB::table('community_documents')
            ->whereNull('version_root_id')
            ->where(function ($query) {
                $query->where('kind', 'document')->orWhereNull('kind');
            })
            ->update(['version_root_id' => DB::raw('id')]);

        Schema::table('community_documents', function (Blueprint $table) {
            $table->unique(['version_root_id', 'version'], 'community_documents_version_unique');
        });
    }

    public function down(): void
    {
        Schema::table('community_documents', function (Blueprint $table) {
            $table->dropUnique('community_documents_version_unique');
            $table->dropIndex('community_documents_version_root_idx');
            $table->dropColumn('version_root_id');
        });
    }
};
