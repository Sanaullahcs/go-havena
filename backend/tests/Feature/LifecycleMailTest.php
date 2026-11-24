<?php

namespace Tests\Feature;

use App\Mail\HavenaTransactionalMail;
use App\Models\Community;
use App\Models\CommunityMembership;
use App\Models\CommunitySubscription;
use App\Models\Region;
use App\Models\User;
use App\Services\LifecycleMailService;
use Database\Seeders\SystemAdminSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Mail;
use Tests\TestCase;

class LifecycleMailTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Mail::fake();
    }

    public function test_community_admin_signup_sends_welcome_once(): void
    {
        $email = 'ca.signup@example.com';

        $this->postJson('/api/v1/auth/otp/request', [
            'email' => $email,
            'intent' => 'signup',
        ])->assertStatus(202);

        $this->postJson('/api/v1/auth/otp/verify', [
            'email' => $email,
            'code' => '123456',
            'intent' => 'signup',
            'role' => 'admin',
        ])->assertOk();

        Mail::assertSent(HavenaTransactionalMail::class, function (HavenaTransactionalMail $mail) use ($email) {
            return $mail->hasTo($email)
                && $mail->subjectLine === 'Welcome to Havena'
                && str_contains($mail->intro, 'community admin');
        });

        $this->assertSame(
            1,
            Mail::sent(HavenaTransactionalMail::class, fn (HavenaTransactionalMail $mail) => $mail->subjectLine === 'Welcome to Havena')->count(),
        );
    }

    public function test_resident_signup_sends_welcome(): void
    {
        $email = 'resident.welcome@example.com';

        $this->postJson('/api/v1/auth/otp/request', [
            'email' => $email,
            'intent' => 'signup',
        ])->assertStatus(202);

        $this->postJson('/api/v1/auth/otp/verify', [
            'email' => $email,
            'code' => '123456',
            'intent' => 'signup',
            'role' => 'resident',
        ])->assertOk();

        Mail::assertSent(HavenaTransactionalMail::class, function (HavenaTransactionalMail $mail) use ($email) {
            return $mail->hasTo($email)
                && $mail->subjectLine === 'Welcome to Havena'
                && str_contains($mail->intro, 'resident');
        });
    }

    public function test_system_admin_creating_community_admin_sends_account_email(): void
    {
        $system = $this->actingAsSystemAdmin();
        $region = $this->seedRegion();

        $this->withToken($system->createToken('sys')->plainTextToken)
            ->postJson('/api/v1/admin/users', [
            'type' => 'community_admin',
            'first_name' => 'Ahmed',
            'last_name' => 'Admin',
            'email' => 'ahmed.admin@example.com',
            'phone' => '+2017777777',
            'region_id' => $region->id,
            'community_name' => 'Nile Gardens',
            'community_address' => '123 Nile St',
        ])->assertCreated();

        Mail::assertSent(HavenaTransactionalMail::class, function (HavenaTransactionalMail $mail) {
            return $mail->hasTo('ahmed.admin@example.com')
                && str_contains($mail->subjectLine, 'Nile Gardens')
                && $mail->highlightCode === null
                && $mail->includeAppStoreLinks === true
                && str_contains(implode(' ', $mail->paragraphs), 'verification code');
        });
    }

    public function test_community_admin_approval_and_resident_membership_emails(): void
    {
        $system = $this->actingAsSystemAdmin();
        [$community, $ca] = $this->seedPendingCommunityAdmin();

        $this->withToken($system->createToken('sys')->plainTextToken)
            ->patchJson("/api/v1/admin/community-admins/{$ca->id}/approve")
            ->assertOk();

        Mail::assertSent(HavenaTransactionalMail::class, function (HavenaTransactionalMail $mail) use ($ca) {
            return $mail->hasTo($ca->email)
                && $mail->subjectLine === 'Your Havena community admin account is approved';
        });

        $resident = User::factory()->create([
            'role' => 'resident',
            'email' => 'pending.resident@example.com',
            'phone' => '+15555550102',
            'phone_verified_at' => now(),
        ]);
        CommunityMembership::query()->create([
            'user_id' => $resident->id,
            'community_id' => $community->id,
            'role' => 'member',
            'status' => 'pending',
        ]);

        $caToken = $ca->fresh()->createToken('test')->plainTextToken;
        $this->withToken($caToken)
            ->postJson("/api/v1/admin/members/{$resident->id}/approve", [
                'community_id' => $community->id,
            ])
            ->assertOk();

        Mail::assertSent(HavenaTransactionalMail::class, function (HavenaTransactionalMail $mail) use ($resident, $community) {
            return $mail->hasTo($resident->email)
                && str_contains($mail->subjectLine, $community->name);
        });

        app(LifecycleMailService::class)->residentApproved($resident->fresh(), $community);

        $this->assertSame(
            1,
            Mail::sent(HavenaTransactionalMail::class, fn (HavenaTransactionalMail $mail) => $mail->hasTo($resident->email) && str_contains($mail->heading, 'You are in'))->count(),
        );
    }

    public function test_resident_rejection_and_invitation_emails(): void
    {
        [$community, $ca] = $this->seedApprovedCommunityAdmin();
        $caToken = $ca->createToken('test')->plainTextToken;

        $resident = User::factory()->create([
            'role' => 'resident',
            'email' => 'reject.me@example.com',
            'phone' => '+15555550103',
        ]);
        CommunityMembership::query()->create([
            'user_id' => $resident->id,
            'community_id' => $community->id,
            'role' => 'member',
            'status' => 'pending',
        ]);

        $this->withToken($caToken)
            ->postJson("/api/v1/admin/members/{$resident->id}/reject", [
                'community_id' => $community->id,
                'reason' => 'Incomplete documents',
            ])
            ->assertOk();

        Mail::assertSent(HavenaTransactionalMail::class, function (HavenaTransactionalMail $mail) use ($resident) {
            return $mail->hasTo($resident->email)
                && str_contains($mail->subjectLine, 'request')
                && str_contains(implode(' ', $mail->paragraphs), 'Incomplete documents');
        });

        $this->withToken($caToken)
            ->postJson('/api/v1/admin/members/invite', [
                'name' => 'Jane Resident',
                'email' => 'jane.invite@example.com',
                'phone' => '+12025550123',
                'unit_number' => '12B',
            ])
            ->assertCreated();

        Mail::assertSent(HavenaTransactionalMail::class, function (HavenaTransactionalMail $mail) {
            return $mail->hasTo('jane.invite@example.com')
                && $mail->highlightCode !== null
                && filled($mail->highlightQrPayload)
                && str_starts_with((string) $mail->highlightQrPayload, 'havena://join?invite_code=')
                && $mail->includeAppStoreLinks === true
                && str_contains($mail->subjectLine, 'invited');
        });
    }

    public function test_guest_invitation_sends_email(): void
    {
        [, $ca] = $this->seedApprovedCommunityAdmin();
        $caToken = $ca->createToken('test')->plainTextToken;

        $this->withToken($caToken)
            ->postJson('/api/v1/admin/guests/invite', [
            'guest_name' => 'Visitor One',
            'guest_email' => 'visitor@example.com',
            'starts_at' => now()->addDay()->toIso8601String(),
            'ends_at' => now()->addDays(3)->toIso8601String(),
        ])->assertCreated();

        Mail::assertSent(HavenaTransactionalMail::class, function (HavenaTransactionalMail $mail) {
            return $mail->hasTo('visitor@example.com')
                && $mail->highlightCode !== null
                && str_contains($mail->heading, 'guest');
        });
    }

    public function test_duplicate_service_send_is_blocked_and_failures_do_not_throw(): void
    {
        $user = User::factory()->create([
            'email' => 'once@example.com',
            'role' => 'community_admin',
        ]);

        $mail = app(LifecycleMailService::class);
        $mail->communityAdminSignedUp($user);
        $mail->communityAdminSignedUp($user);

        $this->assertSame(
            1,
            Mail::sent(HavenaTransactionalMail::class, fn (HavenaTransactionalMail $mail) => $mail->hasTo($user->email))->count(),
        );

        $this->assertDatabaseCount('transactional_email_sends', 1);
    }

    public function test_placeholder_email_is_skipped(): void
    {
        $user = User::factory()->create([
            'email' => '15555550199@phone.havena.local',
            'role' => 'resident',
        ]);

        app(LifecycleMailService::class)->residentSignedUp($user);

        Mail::assertNothingSent();
    }

    private function actingAsSystemAdmin(): User
    {
        $this->seed(SystemAdminSeeder::class);

        return User::query()->where('email', 'admin@havena.app')->firstOrFail();
    }

    private function seedRegion(): Region
    {
        return Region::query()->create([
            'title' => 'Cairo Metro',
            'area' => 'Cairo',
            'users_label' => '0 users',
            'sort_order' => 1,
            'status' => 'active',
        ]);
    }

    private function seedApprovedCommunityAdmin(): array
    {
        $region = $this->seedRegion();
        $community = Community::query()->create([
            'name' => 'Palm Court',
            'region_id' => $region->id,
            'region' => $region->title,
            'status' => 'active',
            'review_status' => 'approved',
        ]);
        $admin = User::factory()->create([
            'name' => 'Primary Admin',
            'role' => 'community_admin',
            'community_admin_status' => 'approved',
            'status' => 'active',
            'email' => 'palm.admin@example.com',
            'phone' => '+15555550100',
            'phone_verified_at' => now(),
        ]);
        CommunityMembership::query()->create([
            'user_id' => $admin->id,
            'community_id' => $community->id,
            'role' => 'admin',
            'status' => 'approved',
        ]);

        CommunitySubscription::query()->create([
            'community_id' => $community->id,
            'plan_slug' => 'starter',
            'billing_interval' => 'month',
            'status' => CommunitySubscription::STATUS_ACTIVE,
            'seat_limit' => 150,
            'meta' => ['card_on_file' => true, 'activated_via' => 'manual'],
        ]);

        return [$community, $admin];
    }

    private function seedPendingCommunityAdmin(): array
    {
        [$community, $admin] = $this->seedApprovedCommunityAdmin();
        $admin->update(['community_admin_status' => 'pending']);
        CommunityMembership::query()
            ->where('user_id', $admin->id)
            ->update(['status' => 'pending']);

        return [$community, $admin->fresh()];
    }
}
