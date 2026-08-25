<?php

namespace Tests\Feature;

use App\Models\Community;
use App\Models\CommunityMembership;
use App\Models\CommunitySubscription;
use App\Models\Region;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class AgreementTest extends TestCase
{
    use RefreshDatabase;

    private function signaturePayload(): string
    {
        return 'data:image/png;base64,'.base64_encode(str_repeat("PNG-SIGNATURE-PAD", 12));
    }

    private function seedCommunity(): array
    {
        $region = Region::query()->create([
            'title' => 'Test Region',
            'area' => 'Test Area',
            'users_label' => '0 users',
            'sort_order' => 1,
            'status' => 'active',
        ]);

        $community = Community::query()->create([
            'name' => 'Test Community',
            'region_id' => $region->id,
            'region' => $region->title,
            'status' => 'active',
            'review_status' => 'approved',
        ]);

        $admin = User::factory()->create([
            'role' => 'community_admin',
            'community_admin_status' => 'approved',
            'status' => 'active',
            'phone' => '+2017'.random_int(10000000, 99999999),
        ]);

        $resident = User::factory()->create([
            'role' => 'resident',
            'status' => 'active',
            'phone' => '+2018'.random_int(10000000, 99999999),
        ]);

        CommunityMembership::query()->create([
            'user_id' => $admin->id,
            'community_id' => $community->id,
            'role' => 'admin',
            'status' => 'approved',
        ]);

        CommunityMembership::query()->create([
            'user_id' => $resident->id,
            'community_id' => $community->id,
            'role' => 'member',
            'status' => 'approved',
        ]);

        CommunitySubscription::query()->create([
            'community_id' => $community->id,
            'plan_slug' => 'growth',
            'billing_interval' => 'month',
            'status' => CommunitySubscription::STATUS_ACTIVE,
            'seat_limit' => 150,
            'current_period_start' => now()->subDay(),
            'current_period_end' => now()->addMonth(),
            'meta' => ['card_on_file' => true, 'trial_consumed' => true],
        ]);

        return compact('community', 'admin', 'resident');
    }

    public function test_admin_can_send_agreement_and_resident_can_sign(): void
    {
        Storage::fake('public');
        ['admin' => $admin, 'resident' => $resident] = $this->seedCommunity();

        Sanctum::actingAs($admin);
        $create = $this->postJson('/api/v1/admin/agreements', [
            'title' => 'Living Standards',
            'category' => 'lease',
            'body' => str_repeat('Community living standards acknowledgment text. ', 4),
            'audience' => 'all',
            'signature_fee_cents' => 0,
            'send' => true,
        ]);
        $create->assertOk()->assertJsonPath('data.status', 'sent');
        $id = $create->json('data.id');

        Sanctum::actingAs($resident);
        $inbox = $this->getJson('/api/v1/agreements');
        $inbox->assertOk()->assertJsonPath('stats.awaiting', 1);

        $show = $this->getJson('/api/v1/agreements/'.$id);
        $show->assertOk()->assertJsonPath('data.my_status', 'viewed');

        $sign = $this->postJson('/api/v1/agreements/'.$id.'/sign', [
            'signer_name' => 'Aisha Johnson',
            'signature' => $this->signaturePayload(),
            'accepted_terms' => true,
        ]);
        $sign->assertOk()
            ->assertJsonPath('data.my_status', 'signed')
            ->assertJsonPath('data.signer_name', 'Aisha Johnson');
        $this->assertNotEmpty($sign->json('data.certificate_id'));
        $this->assertNotEmpty($sign->json('data.content_hash'));
    }

    public function test_paid_agreement_requires_fee_authorization(): void
    {
        Storage::fake('public');
        ['admin' => $admin, 'resident' => $resident] = $this->seedCommunity();

        Sanctum::actingAs($admin);
        $id = $this->postJson('/api/v1/admin/agreements', [
            'title' => 'Amenity Waiver',
            'category' => 'amenity',
            'body' => str_repeat('Amenity use is at your own risk and you will follow posted rules. ', 3),
            'audience' => 'all',
            'signature_fee_cents' => 299,
            'send' => true,
        ])->json('data.id');

        Sanctum::actingAs($resident);
        $this->getJson('/api/v1/agreements/'.$id)
            ->assertOk()
            ->assertJsonPath('data.needs_payment', true)
            ->assertJsonPath('data.can_sign', false);

        $this->postJson('/api/v1/agreements/'.$id.'/sign', [
            'signer_name' => 'Aisha Johnson',
            'signature' => $this->signaturePayload(),
            'accepted_terms' => true,
        ])->assertStatus(422);

        $this->postJson('/api/v1/agreements/'.$id.'/authorize-fee')
            ->assertOk()
            ->assertJsonPath('data.can_sign', true);

        $this->postJson('/api/v1/agreements/'.$id.'/sign', [
            'signer_name' => 'Aisha Johnson',
            'signature' => $this->signaturePayload(),
            'accepted_terms' => true,
        ])->assertOk()->assertJsonPath('data.my_status', 'signed');
    }

    public function test_resident_cannot_create_agreement(): void
    {
        ['resident' => $resident] = $this->seedCommunity();
        Sanctum::actingAs($resident);

        $this->postJson('/api/v1/admin/agreements', [
            'title' => 'Unauthorized',
            'body' => str_repeat('This should be rejected by policy. ', 4),
        ])->assertForbidden();
    }

    public function test_admin_can_remind_duplicate_and_cannot_edit_signed_text(): void
    {
        Storage::fake('public');
        ['admin' => $admin, 'resident' => $resident] = $this->seedCommunity();

        Sanctum::actingAs($admin);
        $id = $this->postJson('/api/v1/admin/agreements', [
            'title' => 'Living Standards',
            'category' => 'lease',
            'body' => str_repeat('Community living standards acknowledgment text. ', 4),
            'audience' => 'all',
            'send' => true,
        ])->json('data.id');

        $this->postJson('/api/v1/admin/agreements/'.$id.'/remind')
            ->assertOk()
            ->assertJsonPath('data.status', 'sent');

        $copy = $this->postJson('/api/v1/admin/agreements/'.$id.'/duplicate');
        $copy->assertCreated()->assertJsonPath('data.status', 'draft');

        Sanctum::actingAs($resident);
        $this->getJson('/api/v1/agreements/'.$id);
        $this->postJson('/api/v1/agreements/'.$id.'/sign', [
            'signer_name' => 'Aisha Johnson',
            'signature' => $this->signaturePayload(),
            'accepted_terms' => true,
        ])->assertOk();

        Sanctum::actingAs($admin);
        $this->patchJson('/api/v1/admin/agreements/'.$id, [
            'body' => str_repeat('Changed after a signature was already on file. ', 3),
        ])->assertStatus(422);
    }

    public function test_required_agreement_cannot_be_declined_and_optional_can_be_reopened(): void
    {
        Storage::fake('public');
        ['admin' => $admin, 'resident' => $resident] = $this->seedCommunity();

        Sanctum::actingAs($admin);
        $requiredId = $this->postJson('/api/v1/admin/agreements', [
            'title' => 'Required Occupancy Acknowledgment',
            'category' => 'lease',
            'body' => str_repeat('This occupancy acknowledgment is required for community records. ', 3),
            'audience' => 'all',
            'is_required' => true,
            'cover_message' => 'Please sign before the deadline.',
            'send' => true,
        ])->assertOk()
            ->assertJsonPath('data.is_required', true)
            ->assertJsonPath('data.cover_message', 'Please sign before the deadline.')
            ->json('data.id');

        $optionalId = $this->postJson('/api/v1/admin/agreements', [
            'title' => 'Optional Pet Form',
            'category' => 'pet',
            'body' => str_repeat('This pet form is optional and may be declined. ', 3),
            'audience' => 'all',
            'is_required' => false,
            'send' => true,
        ])->json('data.id');

        Sanctum::actingAs($resident);
        $this->getJson('/api/v1/agreements/'.$requiredId)
            ->assertOk()
            ->assertJsonPath('data.can_decline', false)
            ->assertJsonPath('data.can_sign', true);

        $this->postJson('/api/v1/agreements/'.$requiredId.'/decline', [
            'reason' => 'I do not agree',
        ])->assertStatus(422);

        $this->postJson('/api/v1/agreements/'.$optionalId.'/decline', [
            'reason' => 'No pet in the unit',
        ])->assertOk()->assertJsonPath('data.my_status', 'declined');

        Sanctum::actingAs($admin);
        $this->postJson('/api/v1/admin/agreements/'.$optionalId.'/recipients/'.$resident->id.'/reopen')
            ->assertOk();

        Sanctum::actingAs($resident);
        $this->getJson('/api/v1/agreements/'.$optionalId)
            ->assertOk()
            ->assertJsonPath('data.my_status', 'viewed')
            ->assertJsonPath('data.can_sign', true);
    }

    public function test_admin_can_reopen_closed_remind_one_and_withdraw_unsigned(): void
    {
        ['admin' => $admin, 'resident' => $resident] = $this->seedCommunity();

        Sanctum::actingAs($admin);
        $id = $this->postJson('/api/v1/admin/agreements', [
            'title' => 'Guest Policy Update',
            'category' => 'guest',
            'body' => str_repeat('Guest registration is required for overnight visitors. ', 3),
            'audience' => 'all',
            'due_at' => now()->addDays(2)->toDateString(),
            'send' => true,
        ])->json('data.id');

        $this->postJson('/api/v1/admin/agreements/'.$id.'/remind', [
            'user_ids' => [$resident->id],
        ])->assertOk()->assertJsonPath('message', 'Reminder sent to 1 resident.');

        $this->patchJson('/api/v1/admin/agreements/'.$id, [
            'due_at' => now()->addDays(10)->toDateString(),
            'notify_due_change' => true,
        ])->assertOk();

        $this->patchJson('/api/v1/admin/agreements/'.$id, [
            'status' => 'closed',
        ])->assertOk()->assertJsonPath('data.status', 'closed');

        Sanctum::actingAs($resident);
        $this->postJson('/api/v1/agreements/'.$id.'/sign', [
            'signer_name' => 'Aisha Johnson',
            'signature' => $this->signaturePayload(),
            'accepted_terms' => true,
        ])->assertStatus(422);

        Sanctum::actingAs($admin);
        $this->postJson('/api/v1/admin/agreements/'.$id.'/reopen')
            ->assertOk()
            ->assertJsonPath('data.status', 'sent')
            ->assertJsonPath('data.can_withdraw', true);

        $this->postJson('/api/v1/admin/agreements/'.$id.'/withdraw')
            ->assertOk()
            ->assertJsonPath('data.status', 'draft');

        Sanctum::actingAs($resident);
        $this->getJson('/api/v1/agreements')
            ->assertOk()
            ->assertJsonPath('stats.awaiting', 0);
    }

    public function test_selected_draft_can_be_sent_later_and_resend_keeps_signatures(): void
    {
        Storage::fake('public');
        ['community' => $community, 'admin' => $admin, 'resident' => $resident] = $this->seedCommunity();

        $late = User::factory()->create([
            'role' => 'resident',
            'status' => 'active',
            'phone' => '+2019'.random_int(10000000, 99999999),
        ]);
        CommunityMembership::query()->create([
            'user_id' => $late->id,
            'community_id' => $community->id,
            'role' => 'member',
            'status' => 'approved',
        ]);

        Sanctum::actingAs($admin);
        $draft = $this->postJson('/api/v1/admin/agreements', [
            'title' => 'Selected Parking Form',
            'category' => 'parking',
            'body' => str_repeat('Assigned parking is limited to marked resident bays. ', 3),
            'audience' => 'selected',
            'user_ids' => [$resident->id],
            'due_at' => now()->addHours(24)->toIso8601String(),
        ]);
        $draft->assertCreated()->assertJsonPath('data.status', 'draft');
        $id = $draft->json('data.id');

        $this->postJson('/api/v1/admin/agreements/'.$id.'/send')
            ->assertOk()
            ->assertJsonPath('data.status', 'sent')
            ->assertJsonPath('data.is_due_soon', true)
            ->assertJsonPath('data.counts.total', 1);

        Sanctum::actingAs($resident);
        $this->postJson('/api/v1/agreements/'.$id.'/sign', [
            'signer_name' => 'Aisha Johnson',
            'signature' => $this->signaturePayload(),
            'accepted_terms' => true,
        ])->assertOk()->assertJsonPath('data.my_status', 'signed');

        Sanctum::actingAs($admin);
        $this->postJson('/api/v1/admin/agreements/'.$id.'/send', ['audience' => 'all'])
            ->assertOk()
            ->assertJsonPath('data.counts.signed', 1)
            ->assertJsonPath('data.counts.total', 2);

        $recipients = collect($this->getJson('/api/v1/admin/agreements/'.$id)->json('data.recipients'));
        $this->assertSame('signed', $recipients->firstWhere('user_id', $resident->id)['status']);
        $this->assertSame('pending', $recipients->firstWhere('user_id', $late->id)['status']);

        $this->deleteJson('/api/v1/admin/agreements/'.$id)->assertStatus(422);
        $this->postJson('/api/v1/admin/agreements/'.$id.'/withdraw')->assertStatus(422);
        $this->deleteJson('/api/v1/admin/agreements/'.$id.'/recipients/'.$resident->id)->assertStatus(422);

        $this->deleteJson('/api/v1/admin/agreements/'.$id.'/recipients/'.$late->id)
            ->assertOk()
            ->assertJsonPath('data.counts.total', 1);
    }
}
