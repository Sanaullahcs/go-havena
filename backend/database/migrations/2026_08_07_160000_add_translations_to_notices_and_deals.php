<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('notices', function (Blueprint $table) {
            $table->string('title_es', 200)->nullable()->after('title');
            $table->string('title_ar', 200)->nullable()->after('title_es');
            $table->longText('body_es')->nullable()->after('body');
            $table->longText('body_ar')->nullable()->after('body_es');
        });

        Schema::table('deals', function (Blueprint $table) {
            $table->string('title_es', 200)->nullable()->after('title');
            $table->string('title_ar', 200)->nullable()->after('title_es');
            $table->text('description_es')->nullable()->after('description');
            $table->text('description_ar')->nullable()->after('description_es');
            $table->string('discount_label_es', 60)->nullable()->after('discount_label');
            $table->string('discount_label_ar', 60)->nullable()->after('discount_label_es');
        });
    }

    public function down(): void
    {
        Schema::table('notices', function (Blueprint $table) {
            $table->dropColumn(['title_es', 'title_ar', 'body_es', 'body_ar']);
        });

        Schema::table('deals', function (Blueprint $table) {
            $table->dropColumn(['title_es', 'title_ar', 'description_es', 'description_ar', 'discount_label_es', 'discount_label_ar']);
        });
    }
};
