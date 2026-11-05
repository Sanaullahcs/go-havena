<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('community_documents', function (Blueprint $table) {
            $table->string('kind', 20)->default('document')->after('status');
            $table->string('publication_status', 20)->default('published')->after('kind');
            $table->boolean('signature_required')->default(false)->after('publication_status');
            $table->boolean('allow_late_signing')->default(false)->after('signature_required');
            $table->timestamp('due_at')->nullable()->after('allow_late_signing');
            $table->timestamp('effective_at')->nullable()->after('due_at');
            $table->timestamp('expires_at')->nullable()->after('effective_at');
            $table->unsignedInteger('version')->default(1)->after('expires_at');
            $table->unsignedBigInteger('supersedes_id')->nullable()->after('version');
            $table->timestamp('published_at')->nullable()->after('supersedes_id');
            $table->string('assignment_scope', 20)->nullable()->after('published_at');
            $table->unsignedInteger('page_count')->nullable()->after('assignment_scope');
            $table->string('original_checksum', 64)->nullable()->after('page_count');

            $table->index(['community_id', 'kind', 'publication_status'], 'community_documents_kind_idx');
            $table->index('supersedes_id', 'community_documents_supersedes_idx');
        });

        Schema::create('community_document_assignments', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('document_id');
            $table->unsignedBigInteger('community_id');
            $table->unsignedBigInteger('user_id');
            $table->unsignedBigInteger('unit_id')->nullable();
            $table->string('unit_label', 50)->nullable();
            $table->string('scope_key', 40);
            $table->unsignedInteger('document_version')->default(1);
            $table->string('status', 20)->default('pending');
            $table->timestamp('viewed_at')->nullable();
            $table->timestamp('signed_at')->nullable();
            $table->timestamp('declined_at')->nullable();
            $table->timestamp('notified_at')->nullable();
            $table->timestamp('reminder_sent_at')->nullable();
            $table->unsignedInteger('reminder_count')->default(0);
            $table->string('signed_file_path', 512)->nullable();
            $table->timestamps();

            $table->unique(['document_id', 'user_id', 'scope_key'], 'doc_assignment_recipient_unique');
            $table->index(['user_id', 'community_id', 'status'], 'doc_assignment_user_idx');
            $table->index(['document_id', 'status'], 'doc_assignment_status_idx');
            $table->foreign('document_id')->references('id')->on('community_documents')->cascadeOnDelete();
            $table->foreign('community_id')->references('id')->on('communities')->cascadeOnDelete();
            $table->foreign('user_id')->references('id')->on('users')->cascadeOnDelete();
            $table->foreign('unit_id')->references('id')->on('units')->nullOnDelete();
        });

        Schema::create('community_document_signatures', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('assignment_id')->unique();
            $table->unsignedBigInteger('document_id');
            $table->unsignedBigInteger('user_id');
            $table->unsignedBigInteger('community_id');
            $table->unsignedBigInteger('unit_id')->nullable();
            $table->unsignedInteger('document_version');
            $table->string('method', 20);
            $table->text('typed_name')->nullable();
            $table->longText('strokes')->nullable();
            $table->boolean('consent_accepted')->default(false);
            $table->timestamp('consent_at')->nullable();
            $table->dateTime('signed_at');
            $table->string('ip_address', 45)->nullable();
            $table->string('user_agent', 255)->nullable();
            $table->string('signed_file_path', 512)->nullable();
            $table->string('checksum', 64)->nullable();
            $table->string('original_checksum', 64)->nullable();
            $table->timestamps();

            $table->index(['document_id', 'user_id'], 'doc_signature_user_idx');
            $table->foreign('assignment_id')->references('id')->on('community_document_assignments')->cascadeOnDelete();
            $table->foreign('document_id')->references('id')->on('community_documents')->cascadeOnDelete();
            $table->foreign('user_id')->references('id')->on('users')->cascadeOnDelete();
        });

        Schema::create('community_document_activity', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('document_id');
            $table->unsignedBigInteger('assignment_id')->nullable();
            $table->unsignedBigInteger('community_id');
            $table->unsignedBigInteger('user_id')->nullable();
            $table->string('event', 40);
            $table->json('meta')->nullable();
            $table->string('ip_address', 45)->nullable();
            $table->timestamp('created_at')->nullable();

            $table->index(['document_id', 'event'], 'doc_activity_event_idx');
            $table->foreign('document_id')->references('id')->on('community_documents')->cascadeOnDelete();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('community_document_activity');
        Schema::dropIfExists('community_document_signatures');
        Schema::dropIfExists('community_document_assignments');

        Schema::table('community_documents', function (Blueprint $table) {
            $table->dropIndex('community_documents_kind_idx');
            $table->dropIndex('community_documents_supersedes_idx');
            $table->dropColumn([
                'kind',
                'publication_status',
                'signature_required',
                'allow_late_signing',
                'due_at',
                'effective_at',
                'expires_at',
                'version',
                'supersedes_id',
                'published_at',
                'assignment_scope',
                'page_count',
                'original_checksum',
            ]);
        });
    }
};
