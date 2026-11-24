<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('subscription_plans') && ! Schema::hasColumn('subscription_plans', 'caps_residents')) {
            Schema::table('subscription_plans', function (Blueprint $table) {
                $table->boolean('caps_residents')->default(true)->after('seat_limit');
            });
        }

        Schema::create('saas_price_books', function (Blueprint $table) {
            $table->id();
            $table->string('plan_slug', 50);
            $table->string('billing_model', 32);
            $table->char('currency', 3);
            $table->unsignedInteger('minimum_monthly_cents')->default(0);
            $table->unsignedSmallInteger('annual_discount_bps')->default(0);
            $table->unsignedInteger('version')->default(1);
            $table->string('status', 20)->default('published');
            $table->timestamp('effective_from')->nullable();
            $table->timestamps();
            $table->index(['plan_slug', 'billing_model', 'currency', 'status'], 'saas_price_book_lookup');
        });

        Schema::create('saas_price_tiers', function (Blueprint $table) {
            $table->id();
            $table->foreignId('price_book_id')->constrained('saas_price_books')->cascadeOnDelete();
            $table->unsignedSmallInteger('sort_order')->default(0);
            $table->unsignedInteger('min_quantity');
            $table->unsignedInteger('max_quantity')->nullable();
            $table->unsignedInteger('unit_amount_cents')->nullable();
            $table->unsignedInteger('fixed_amount_cents')->nullable();
            $table->timestamps();
        });

        Schema::create('saas_plan_entitlements', function (Blueprint $table) {
            $table->id();
            $table->string('plan_slug', 50);
            $table->string('feature_key', 64);
            $table->string('label', 120);
            $table->string('group_key', 40);
            $table->boolean('included')->default(false);
            $table->unsignedSmallInteger('sort_order')->default(0);
            $table->timestamps();
            $table->unique(['plan_slug', 'feature_key']);
        });

        Schema::create('saas_billing_accounts', function (Blueprint $table) {
            $table->id();
            $table->string('name', 160);
            $table->string('billing_email', 160)->nullable();
            $table->char('currency', 3)->default('USD');
            $table->string('country_code', 2)->nullable();
            $table->timestamps();
        });

        Schema::create('saas_custom_inquiries', function (Blueprint $table) {
            $table->id();
            $table->string('status', 40)->default('new');
            $table->string('organization_name', 160);
            $table->string('contact_name', 120);
            $table->string('email', 160);
            $table->string('phone', 40)->nullable();
            $table->string('country', 80)->nullable();
            $table->unsignedInteger('communities')->default(1);
            $table->unsignedInteger('residents')->nullable();
            $table->string('billing_model', 32)->nullable();
            $table->string('interval', 16)->nullable();
            $table->json('payload');
            $table->timestamps();
            $table->index('status');
        });

        if (Schema::hasTable('community_subscriptions') && ! Schema::hasColumn('community_subscriptions', 'billing_model')) {
            Schema::table('community_subscriptions', function (Blueprint $table) {
                $table->string('billing_model', 32)->nullable()->after('billing_interval');
                $table->char('currency', 3)->nullable()->after('billing_model');
                $table->unsignedBigInteger('contracted_amount_cents')->nullable()->after('currency');
                $table->unsignedInteger('contracted_resident_max')->nullable()->after('contracted_amount_cents');
                $table->foreignId('billing_account_id')->nullable()->after('community_id')->constrained('saas_billing_accounts')->nullOnDelete();
            });
        }

        $this->seedCatalog();
    }

    public function down(): void
    {
        if (Schema::hasTable('community_subscriptions') && Schema::hasColumn('community_subscriptions', 'billing_account_id')) {
            Schema::table('community_subscriptions', function (Blueprint $table) {
                $table->dropConstrainedForeignId('billing_account_id');
                $table->dropColumn(['billing_model', 'currency', 'contracted_amount_cents', 'contracted_resident_max']);
            });
        }
        Schema::dropIfExists('saas_custom_inquiries');
        Schema::dropIfExists('saas_billing_accounts');
        Schema::dropIfExists('saas_plan_entitlements');
        Schema::dropIfExists('saas_price_tiers');
        Schema::dropIfExists('saas_price_books');
        if (Schema::hasColumn('subscription_plans', 'caps_residents')) {
            Schema::table('subscription_plans', function (Blueprint $table) {
                $table->dropColumn('caps_residents');
            });
        }
    }

    private function seedCatalog(): void
    {
        $now = now();
        $plans = [
            ['essential', 'Essential', 'Communication and engagement for the whole community.', 1, false],
            ['professional', 'Professional', 'Daily operations, requests, amenities, and resident records.', 2, true],
            ['premium', 'Premium', 'Portfolio tools, reporting, and advanced administration.', 3, false],
            ['custom', 'Custom', 'A written agreement built around the modules you actually need.', 4, false],
        ];
        foreach ($plans as [$slug, $name, $description, $sort, $recommended]) {
            if (DB::table('subscription_plans')->where('slug', $slug)->exists()) {
                continue;
            }
            DB::table('subscription_plans')->insert([
                'slug' => $slug,
                'name' => $name,
                'description' => $description,
                'seat_limit' => 0,
                'caps_residents' => false,
                'price_monthly_cents' => 0,
                'price_yearly_cents' => 0,
                'trial_period_days' => 0,
                'is_active' => true,
                'is_recommended' => $recommended,
                'sort_order' => $sort,
                'created_at' => $now,
                'updated_at' => $now,
            ]);
        }

        $groups = [
            'feed' => ['Community feed', 'communication'],
            'notices' => ['Notices and announcements', 'communication'],
            'alerts' => ['Emergency alerts', 'communication'],
            'events' => ['Events', 'communication'],
            'messages' => ['Direct messages', 'communication'],
            'documents' => ['Documents', 'documents'],
            'community_rules' => ['Rules and regulations', 'documents'],
            'complaints' => ['Complaints and requests', 'operations'],
            'amenities' => ['Amenities', 'operations'],
            'bookings' => ['Amenity reservations', 'operations'],
            'marketplace' => ['Resident billing records and marketplace', 'billing'],
        ];
        $essential = ['feed', 'notices', 'alerts', 'events', 'messages', 'documents', 'community_rules'];
        $professional = array_merge($essential, ['complaints', 'amenities', 'bookings', 'marketplace']);
        $premium = array_keys($groups);
        $map = ['essential' => $essential, 'professional' => $professional, 'premium' => $premium, 'custom' => []];
        $order = 0;
        foreach ($map as $slug => $keys) {
            foreach ($groups as $key => [$label, $group]) {
                DB::table('saas_plan_entitlements')->insert([
                    'plan_slug' => $slug,
                    'feature_key' => $key,
                    'label' => $label,
                    'group_key' => $group,
                    'included' => $slug === 'custom' ? false : in_array($key, $keys, true),
                    'sort_order' => $order++,
                    'created_at' => $now,
                    'updated_at' => $now,
                ]);
            }
        }

        $resident = [
            'essential' => [150, 100, 70, 40, 4900],
            'professional' => [250, 180, 120, 80, 9900],
            'premium' => [400, 280, 180, 120, 19900],
        ];
        // Flat community fees stay under the per-resident total from about 50 residents up.
        // A smaller community still pays less per resident, because one flat fee is for a real community.
        $community = [
            'essential' => [6900, 14900, 39900, 109900, 299900],
            'professional' => [10900, 19900, 39900, 99900, 249900],
            'premium' => [20900, 39900, 129900, 299900, 749900],
        ];
        foreach ($resident as $slug => [$a, $b, $c, $d, $minimum]) {
            $id = DB::table('saas_price_books')->insertGetId([
                'plan_slug' => $slug,
                'billing_model' => 'per_resident',
                'currency' => 'USD',
                'minimum_monthly_cents' => $minimum,
                'annual_discount_bps' => 1500,
                'version' => 1,
                'status' => 'published',
                'effective_from' => $now,
                'created_at' => $now,
                'updated_at' => $now,
            ]);
            $bands = [
                [1, 500, $a],
                [501, 2500, $b],
                [2501, 10000, $c],
                [10001, null, $d],
            ];
            foreach ($bands as $i => [$min, $max, $cents]) {
                DB::table('saas_price_tiers')->insert([
                    'price_book_id' => $id,
                    'sort_order' => $i,
                    'min_quantity' => $min,
                    'max_quantity' => $max,
                    'unit_amount_cents' => $cents,
                    'fixed_amount_cents' => null,
                    'created_at' => $now,
                    'updated_at' => $now,
                ]);
            }
        }
        foreach ($community as $slug => $amounts) {
            $id = DB::table('saas_price_books')->insertGetId([
                'plan_slug' => $slug,
                'billing_model' => 'per_community',
                'currency' => 'USD',
                'minimum_monthly_cents' => 0,
                'annual_discount_bps' => 1500,
                'version' => 1,
                'status' => 'published',
                'effective_from' => $now,
                'created_at' => $now,
                'updated_at' => $now,
            ]);
            $bands = [[1, 100], [101, 500], [501, 2500], [2501, 10000], [10001, 50000]];
            foreach ($bands as $i => [$min, $max]) {
                DB::table('saas_price_tiers')->insert([
                    'price_book_id' => $id,
                    'sort_order' => $i,
                    'min_quantity' => $min,
                    'max_quantity' => $max,
                    'unit_amount_cents' => null,
                    'fixed_amount_cents' => $amounts[$i],
                    'created_at' => $now,
                    'updated_at' => $now,
                ]);
            }
        }
    }
};
