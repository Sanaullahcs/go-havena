<?php

namespace Tests\Feature;

use App\Mail\HavenaTransactionalMail;
use App\Models\Community;
use App\Models\CommunityMembership;
use App\Models\CommunitySubscription;
use App\Models\Region;
use App\Models\User;
use App\Services\ComplaintMailer;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Mail;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class StaffAssignmentTest extends TestCase
{
    use RefreshDatabase;

    private int $staffPhoneSequence = 1000000;

    protected function setUp(): void
    {
        parent::setUp();
        config(['billing.enabled' => false, 'billing.enforce' => false]);
        Http::fake();
        Mail::fake();
    }

    public function test_admin_assigns_staff_and_status_emails_reach_resident_and_staff(): void
    {
        ['community' => $community, 'admin' => $admin, 'resident' => $resident, 'unit' => $unit] = $this->seedWorld();

        Sanctum::actingAs($admin);
        $created = $this->postJson('/api/v1/admin/staff', [
            'name' => 'Ali Ahmed',
            'email' => 'ali.electrician@example.com',
            'phone' => '+923001234567',
            'staff_type' => 'external',
            'specializations' => ['electrical'],
            'status' => 'active',
        ])->assertCreated();
        $staffUser = User::query()->where('email', 'ali.electrician@example.com')->first();
        if (in_array((string) config('mail.default'), ['log', 'array'], true)) {
            $this->assertNotNull($created->json('data.delivery_error'));
        }
        $this->assertSame('pending', $created->json('data.invitation'));
        $this->assertSame('resident', $staffUser->role);
        $this->assertFalse(DB::table('community_memberships')->where('user_id', $staffUser->id)->exists());
        $token = (string) DB::table('community_staff')->where('id', $created->json('data.id'))->value('invitation_token');

        Sanctum::actingAs($resident);
        $pendingComplaint = $this->postJson('/api/v1/complaints', [
            'type' => 'maintenance',
            'category' => 'electrical',
            'priority' => 'normal',
            'unit_id' => $unit->id,
            'title' => 'Office Light Not Working',
            'description' => 'The light in our office is not working and needs repair.',
        ])->assertCreated()->json('data');
        Sanctum::actingAs($admin);
        $pendingAssignees = $this->getJson('/api/v1/admin/complaints/'.$pendingComplaint['id'].'/assignees')->assertOk()->json('data');
        $this->assertNotContains($staffUser->id, collect($pendingAssignees)->pluck('id')->all());
        $this->assertNull(DB::table('community_staff')->where('user_id', $staffUser->id)->value('activated_at'));

        $this->postJson('/api/v1/staff/invitations/accept', ['token' => $token])
            ->assertOk()
            ->assertJsonPath('email', 'ali.electrician@example.com');
        $this->assertNotNull(DB::table('community_staff')->where('user_id', $staffUser->id)->value('activated_at'));

        $this->postJson('/api/v1/admin/complaints/'.$pendingComplaint['id'].'/assign', [
            'assigned_to_user_id' => $staffUser->id,
        ])->assertOk();
        $this->postJson('/api/v1/admin/complaints/'.$pendingComplaint['id'].'/assign', [
            'assigned_to_user_id' => 0,
        ])->assertOk()->assertJsonPath('data.assigned_to_user_id', null);

        Sanctum::actingAs($resident);
        $complaint = $this->postJson('/api/v1/complaints', [
            'type' => 'maintenance',
            'category' => 'electrical',
            'priority' => 'normal',
            'unit_id' => $unit->id,
            'title' => 'Office Light Not Working',
            'description' => 'The light in our office is not working and needs repair.',
        ])->assertCreated()->json('data');
        $this->assertSame('community_admin', $complaint['routed_to']);
        $this->assertNull($complaint['assigned_staff_id']);

        Sanctum::actingAs($admin);
        $assignees = $this->getJson('/api/v1/admin/complaints/'.$complaint['id'].'/assignees')->assertOk()->json('data');
        $this->assertSame($staffUser->id, $assignees[0]['id']);
        $this->assertTrue($assignees[0]['matched']);

        $assigned = $this->postJson('/api/v1/admin/complaints/'.$complaint['id'].'/assign', [
            'assigned_to_user_id' => $staffUser->id,
        ])->assertOk()->json('data');
        $this->assertSame('Ali Ahmed · Electrical', $assigned['assigned_staff_label']);

        Sanctum::actingAs($staffUser);
        $this->postJson('/api/v1/staff/tasks/'.$complaint['id'].'/status', ['status' => 'in_progress'])
            ->assertStatus(422);
        $this->postJson('/api/v1/staff/tasks/'.$complaint['id'].'/respond', ['decision' => 'accept'])
            ->assertOk();
        $this->postJson('/api/v1/staff/tasks/'.$complaint['id'].'/status', [
            'status' => 'in_progress',
            'note' => 'Replacing the office light.',
        ])->assertOk()->assertJsonPath('data.status', 'in_progress');

        Sanctum::actingAs($admin);
        $this->postJson('/api/v1/admin/complaints/'.$complaint['id'].'/status', [
            'status' => 'waiting_on_resident',
        ])->assertForbidden();

        Sanctum::actingAs($staffUser);
        $this->postJson('/api/v1/staff/tasks/'.$complaint['id'].'/status', [
            'status' => 'resolved',
            'note' => 'The office light has been replaced.',
        ])->assertOk()->assertJsonPath('data.status', 'resolved');

        Sanctum::actingAs($resident);
        $confirmed = $this->postJson('/api/v1/complaints/'.$complaint['id'].'/status', [
            'status' => 'closed',
        ])->assertOk()->json('data');
        $this->assertSame('closed', $confirmed['status']);
        $this->assertSame('Ali Ahmed · Electrical', $confirmed['assigned_staff_label']);

        Mail::assertSent(HavenaTransactionalMail::class, function (HavenaTransactionalMail $mail) use ($resident) {
            return $mail->hasTo($resident->email) && str_contains($mail->subjectLine, 'Status Updated');
        });
        Mail::assertSent(HavenaTransactionalMail::class, function (HavenaTransactionalMail $mail) use ($staffUser) {
            return $mail->hasTo($staffUser->email) && str_contains($mail->subjectLine, 'Status Updated');
        });
        Mail::assertSent(HavenaTransactionalMail::class, function (HavenaTransactionalMail $mail) use ($admin) {
            return $mail->hasTo($admin->email) && str_contains($mail->subjectLine, 'Status Updated');
        });

        $row = DB::table('complaints')->where('id', $complaint['id'])->first();
        $eventId = (int) DB::table('complaint_events')->where('complaint_id', $row->id)->max('id');
        $before = Mail::sent(HavenaTransactionalMail::class)->count();
        app(ComplaintMailer::class)->statusChanged($row, 'resolved', 'closed', $resident, $eventId, null, false);
        $this->assertSame($before, Mail::sent(HavenaTransactionalMail::class)->count());
        $this->assertSame($community->id, (int) DB::table('community_staff')->where('user_id', $staffUser->id)->value('community_id'));
    }

    public function test_reassignment_decline_and_technical_complaints_stay_protected(): void
    {
        ['admin' => $admin, 'resident' => $resident, 'unit' => $unit, 'systemAdmin' => $systemAdmin] = $this->seedWorld();
        $first = $this->staff($admin, 'First Electrician', 'first.staff@example.com', ['electrical']);
        $second = $this->staff($admin, 'Second Electrician', 'second.staff@example.com', ['electrical']);

        Sanctum::actingAs($resident);
        $complaint = $this->postJson('/api/v1/complaints', [
            'type' => 'maintenance',
            'category' => 'electrical',
            'priority' => 'normal',
            'unit_id' => $unit->id,
            'title' => 'Lobby socket failed',
            'description' => 'The lobby socket no longer provides power.',
        ])->assertCreated()->json('data');

        Sanctum::actingAs($admin);
        $this->postJson('/api/v1/admin/complaints/'.$complaint['id'].'/assign', [
            'assigned_to_user_id' => $first->id,
        ])->assertOk();

        Sanctum::actingAs($first);
        $this->postJson('/api/v1/staff/tasks/'.$complaint['id'].'/respond', [
            'decision' => 'decline',
            'note' => 'I am not available today.',
        ])->assertOk();
        $this->getJson('/api/v1/staff/tasks/'.$complaint['id'])->assertNotFound();

        Sanctum::actingAs($admin);
        $this->postJson('/api/v1/admin/complaints/'.$complaint['id'].'/assign', [
            'assigned_to_user_id' => $second->id,
        ])->assertOk()->assertJsonPath('data.assigned_to_user_id', $second->id);
        $this->patchJson('/api/v1/admin/staff/'.DB::table('community_staff')->where('user_id', $second->id)->value('id'), [
            'status' => 'inactive',
        ])->assertOk();

        Sanctum::actingAs($second);
        $this->getJson('/api/v1/staff/tasks')->assertForbidden();
        $this->assertNull(DB::table('complaints')->where('id', $complaint['id'])->value('assigned_to_user_id'));
        $this->assertSame(
            'unassigned',
            DB::table('complaint_assignments')->where('complaint_id', $complaint['id'])->orderByDesc('id')->value('action'),
        );

        Sanctum::actingAs($resident);
        $technical = $this->postJson('/api/v1/complaints', [
            'type' => 'technical',
            'category' => 'app_bug',
            'priority' => 'normal',
            'title' => 'Screen will not open',
            'description' => 'The complaints screen closes as soon as it opens.',
        ])->assertCreated()->json('data');

        Sanctum::actingAs($admin);
        $denied = $this->postJson('/api/v1/admin/complaints/'.$technical['id'].'/assign', [
            'assigned_to_user_id' => $first->id,
        ]);
        $this->assertContains($denied->status(), [403, 404, 422], $denied->getContent());
        $this->assertNull(DB::table('complaints')->where('id', $technical['id'])->value('assigned_staff_id'));

        Sanctum::actingAs($systemAdmin);
        $this->postJson('/api/v1/admin/complaints/'.$technical['id'].'/assign', [
            'assigned_to_user_id' => $systemAdmin->id,
        ])->assertOk()->assertJsonPath('data.assigned_staff_id', null);
    }

    public function test_a_resident_message_reaches_the_admin_and_clears_when_read(): void
    {
        ['admin' => $admin, 'resident' => $resident, 'unit' => $unit] = $this->seedWorld();
        Sanctum::actingAs($resident);
        $complaint = $this->postJson('/api/v1/complaints', [
            'type' => 'maintenance',
            'category' => 'plumbing',
            'priority' => 'normal',
            'unit_id' => $unit->id,
            'title' => 'Kitchen tap dripping',
            'description' => 'The kitchen tap has been dripping since this morning.',
        ])->assertCreated()->json('data');

        $this->postJson('/api/v1/complaints/'.$complaint['id'].'/messages', [
            'body' => 'The drip is getting worse.',
        ])->assertOk();

        Sanctum::actingAs($admin);
        $row = collect($this->getJson('/api/v1/admin/complaints')->assertOk()->json('data'))
            ->firstWhere('id', $complaint['id']);
        $this->assertSame(1, $row['unread_count']);
        Mail::assertSent(HavenaTransactionalMail::class, fn (HavenaTransactionalMail $mail) => $mail->hasTo($admin->email) && str_contains($mail->subjectLine, 'New Message'));

        $this->postJson('/api/v1/admin/complaints/'.$complaint['id'].'/read')->assertOk();
        $fresh = collect($this->getJson('/api/v1/admin/complaints')->assertOk()->json('data'))
            ->firstWhere('id', $complaint['id']);
        $this->assertSame(0, $fresh['unread_count']);
    }

    public function test_resident_staff_access_stays_limited_to_accepted_communities(): void
    {
        ['community' => $community, 'admin' => $admin, 'resident' => $resident, 'unit' => $unit] = $this->seedWorld();
        $resident->forceFill(['email_verified_at' => now()])->save();

        Sanctum::actingAs($admin);
        $created = $this->postJson('/api/v1/admin/staff', [
            'name' => 'Resident Electrician',
            'email' => $resident->email,
            'phone' => $this->staffPhone(),
            'staff_type' => 'internal',
            'specializations' => ['electrical'],
        ])->assertCreated();
        $staffId = (int) $created->json('data.id');
        $this->assertSame($resident->id, (int) $created->json('data.user_id'));
        $this->assertSame('resident', $resident->fresh()->role);
        $this->assertNull(DB::table('community_staff')->where('id', $staffId)->value('activated_at'));
        $this->assertTrue(DB::table('community_memberships')->where('user_id', $resident->id)->where('status', 'approved')->exists());

        Sanctum::actingAs($resident);
        $this->getJson('/api/v1/staff/tasks')->assertForbidden();
        $this->getJson('/api/v1/staff/access')->assertOk()
            ->assertJsonPath('data.active', false)
            ->assertJsonPath('data.pending', true);
        $this->postJson('/api/v1/staff/invitations/'.$staffId.'/accept')->assertOk();
        $this->getJson('/api/v1/staff/access')->assertOk()->assertJsonPath('data.active', true);

        $second = $this->secondCommunity();
        Sanctum::actingAs($second['admin']);
        $pending = $this->postJson('/api/v1/admin/staff', [
            'name' => 'Resident Electrician',
            'email' => $resident->email,
            'phone' => $this->staffPhone(),
            'staff_type' => 'external',
            'specializations' => ['plumbing'],
        ])->assertCreated();
        $this->assertSame($resident->id, (int) $pending->json('data.user_id'));

        Sanctum::actingAs($resident);
        $invitations = $this->getJson('/api/v1/staff/invitations')->assertOk()->json('data');
        $this->assertCount(1, $invitations);
        $this->assertSame($second['community']->id, $invitations[0]['community_id']);
        $this->assertSame('pending', $invitations[0]['status']);
        $this->assertCount(1, $this->getJson('/api/v1/staff/tasks')->assertOk()->json('meta.communities'));

        Sanctum::actingAs($resident);
        $complaint = $this->postJson('/api/v1/complaints', [
            'type' => 'maintenance',
            'category' => 'electrical',
            'priority' => 'high',
            'unit_id' => $unit->id,
            'title' => 'Hallway light is out',
            'description' => 'The hallway light has been out since last night.',
        ])->assertCreated()->json('data');

        Sanctum::actingAs($admin);
        $this->postJson('/api/v1/admin/complaints/'.$complaint['id'].'/assign', [
            'assigned_to_user_id' => $resident->id,
        ])->assertOk();
        $notice = DB::table('app_notifications')
            ->where('user_id', $resident->id)
            ->where('action_url', 'like', '/screens/staff-tasks/detail?id='.$complaint['id'].'%')
            ->first();
        $this->assertNotNull($notice);

        $outsider = $this->staff($admin, 'Other Worker', 'other.worker@example.com', ['electrical']);
        Sanctum::actingAs($outsider);
        $this->getJson('/api/v1/staff/tasks/'.$complaint['id'])->assertNotFound();

        Sanctum::actingAs($resident);
        $this->postJson('/api/v1/staff/invitations/'.$pending->json('data.id').'/accept')->assertOk();
        Sanctum::actingAs($admin);
        $this->patchJson('/api/v1/admin/staff/'.$staffId, ['status' => 'inactive'])->assertOk();
        $this->assertNull(DB::table('complaints')->where('id', $complaint['id'])->value('assigned_staff_id'));
        $this->assertTrue(DB::table('community_memberships')->where('user_id', $resident->id)->where('status', 'approved')->exists());

        Sanctum::actingAs($resident);
        $remaining = $this->getJson('/api/v1/staff/tasks')->assertOk()->json('meta.communities');
        $this->assertCount(1, $remaining);
        $this->assertSame($second['community']->id, $remaining[0]['id']);
        $this->getJson('/api/v1/staff/tasks?community_id='.$community->id)->assertForbidden();
        $this->getJson('/api/v1/staff/tasks?community_id='.$second['community']->id)->assertOk();
    }

    public function test_existing_resident_can_be_added_as_staff_without_losing_membership(): void
    {
        ['admin' => $admin, 'resident' => $resident] = $this->seedWorld();
        $resident->update([
            'name' => 'Sara Resident',
            'email' => 'resident.staff@example.com',
            'phone' => '+923001112233',
        ]);

        Sanctum::actingAs($admin);
        $options = $this->getJson('/api/v1/admin/staff/residents?search=A-1')->assertOk()->json('data');
        $this->assertSame($resident->id, $options[0]['id']);
        $this->assertSame('A-1', $options[0]['unit']);
        $this->assertSame('resident.staff@example.com', $options[0]['email']);

        $membership = DB::table('community_memberships')->where('user_id', $resident->id)->first();
        $created = $this->postJson('/api/v1/admin/staff', [
            'user_id' => $resident->id,
            'name' => 'Someone Else',
            'email' => 'other@example.com',
            'phone' => '+923001112233',
            'staff_type' => 'internal',
            'specializations' => ['plumbing'],
        ])->assertCreated();

        $this->assertSame($resident->id, $created->json('data.user_id'));
        $this->assertSame('Sara Resident', $created->json('data.name'));
        $this->assertSame('resident.staff@example.com', $created->json('data.email'));
        $this->assertSame(1, User::query()->where('email', 'resident.staff@example.com')->count());
        $still = DB::table('community_memberships')->where('user_id', $resident->id)->first();
        $this->assertSame($membership->status, $still->status);
        $this->assertSame($membership->role, $still->role);
        $this->assertSame(1, DB::table('unit_residents')->where('user_id', $resident->id)->where('status', 'active')->count());

        $this->postJson('/api/v1/admin/staff', [
            'user_id' => $resident->id,
            'name' => 'Sara Resident',
            'email' => 'resident.staff@example.com',
            'phone' => '+923001112233',
            'staff_type' => 'external',
            'specializations' => ['cleaning'],
        ])->assertStatus(422)->assertJsonValidationErrors(['user_id']);

        $this->getJson('/api/v1/admin/staff/residents?search=Sara')->assertOk()->assertJsonCount(0, 'data');

        $this->postJson('/api/v1/admin/staff', [
            'name' => 'Bad Phone',
            'email' => 'bad.phone.staff@example.com',
            'phone' => '03001234567',
            'staff_type' => 'external',
            'specializations' => ['other'],
        ])->assertStatus(422)->assertJsonValidationErrors(['phone']);
    }

    private function staffPhone(): string
    {
        $this->staffPhoneSequence++;

        return '+92300'.$this->staffPhoneSequence;
    }

    public function test_staff_status_choices_require_a_resolved_note_and_share_the_reporter_phone(): void
    {
        ['admin' => $admin, 'resident' => $resident, 'unit' => $unit] = $this->seedWorld();
        $resident->forceFill(['phone' => '+92 300 1112233'])->save();
        $staffUser = $this->staff($admin, 'Noor Plumber', 'noor.staff@example.com', ['plumbing']);

        Sanctum::actingAs($resident);
        $created = $this->postJson('/api/v1/complaints', [
            'type' => 'maintenance',
            'category' => 'plumbing',
            'priority' => 'normal',
            'unit_id' => $unit->id,
            'title' => 'Kitchen tap leaking',
            'description' => 'The kitchen tap has been leaking since this morning.',
        ])->assertCreated();
        $created->assertJsonPath('data.status_label', 'Open')->assertJsonPath('data.workflow_status', 'open');
        $complaint = $created->json('data');

        Sanctum::actingAs($admin);
        $this->postJson('/api/v1/admin/complaints/'.$complaint['id'].'/assign', [
            'assigned_to_user_id' => $staffUser->id,
        ])->assertOk()
            ->assertJsonPath('data.status', 'submitted')
            ->assertJsonPath('data.status_label', 'Requested')
            ->assertJsonPath('data.workflow_status', 'requested');

        Sanctum::actingAs($staffUser);
        $this->postJson('/api/v1/staff/tasks/'.$complaint['id'].'/status', [
            'status' => 'in_progress',
        ])->assertStatus(422);
        $this->postJson('/api/v1/staff/tasks/'.$complaint['id'].'/respond', ['decision' => 'accept'])
            ->assertOk()
            ->assertJsonPath('data.status', 'in_review')
            ->assertJsonPath('data.status_label', 'Pending')
            ->assertJsonPath('data.workflow_status', 'pending');
        $listed = $this->getJson('/api/v1/staff/tasks')->assertOk()->json('data');
        $this->assertSame('+923001112233', collect($listed)->firstWhere('id', $complaint['id'])['reporter_phone']);

        $this->postJson('/api/v1/staff/tasks/'.$complaint['id'].'/status', [
            'status' => 'not_resolved',
            'note' => 'No',
        ])->assertStatus(422);
        $this->postJson('/api/v1/staff/tasks/'.$complaint['id'].'/status', [
            'status' => 'not_resolved',
            'note' => 'The part is not available.',
        ])->assertOk()->assertJsonPath('data.status', 'not_resolved')->assertJsonPath('data.status_label', 'Not Resolved');
        $this->postJson('/api/v1/staff/tasks/'.$complaint['id'].'/status', [
            'status' => 'in_progress',
            'note' => 'The replacement part arrived.',
        ])->assertOk()->assertJsonPath('data.status', 'in_progress')->assertJsonPath('data.status_label', 'In Progress');
        $this->postJson('/api/v1/staff/tasks/'.$complaint['id'].'/status', [
            'status' => 'not_resolved',
            'note' => 'The part is not available.',
        ])->assertOk()->assertJsonPath('data.status', 'not_resolved');

        Sanctum::actingAs($resident);
        $this->getJson('/api/v1/complaints/'.$complaint['id'])
            ->assertOk()
            ->assertJsonPath('data.status_label', 'Not Resolved');
        Sanctum::actingAs($admin);
        $this->getJson('/api/v1/admin/complaints/'.$complaint['id'])
            ->assertOk()
            ->assertJsonPath('data.status_label', 'Not Resolved')
            ->assertJsonPath('data.workflow_status', 'not_resolved')
            ->assertJsonPath('data.assigned_to_name', 'Noor Plumber')
            ->assertJsonPath('data.allowed_transitions', []);
        $this->postJson('/api/v1/admin/complaints/'.$complaint['id'].'/status', [
            'status' => 'in_progress',
        ])->assertForbidden();
        $this->postJson('/api/v1/admin/complaints/'.$complaint['id'].'/status', [
            'status' => 'resolved',
        ])->assertForbidden();

        Sanctum::actingAs($staffUser);
        $this->postJson('/api/v1/staff/tasks/'.$complaint['id'].'/status', [
            'status' => 'resolved',
            'note' => 'No',
        ])->assertStatus(422);

        $this->postJson('/api/v1/staff/tasks/'.$complaint['id'].'/status', [
            'status' => 'resolved',
            'note' => 'The kitchen tap has been repaired.',
        ])->assertOk()->assertJsonPath('data.status', 'resolved');

        Sanctum::actingAs($resident);
        $this->getJson('/api/v1/complaints/'.$complaint['id'])
            ->assertOk()
            ->assertJsonPath('data.status', 'resolved')
            ->assertJsonPath('data.status_label', 'Resolved');

        Sanctum::actingAs($admin);
        $this->getJson('/api/v1/admin/complaints/'.$complaint['id'])
            ->assertOk()
            ->assertJsonPath('data.status', 'resolved')
            ->assertJsonPath('data.allowed_transitions', []);
        $this->postJson('/api/v1/admin/complaints/'.$complaint['id'].'/status', [
            'status' => 'in_progress',
        ])->assertForbidden();
        $this->postJson('/api/v1/admin/complaints/'.$complaint['id'].'/status', [
            'status' => 'reopened',
        ])->assertForbidden();
    }

    public function test_community_admin_reassigns_a_not_resolved_complaint_without_changing_its_status(): void
    {
        ['admin' => $admin, 'resident' => $resident, 'unit' => $unit] = $this->seedWorld();
        $first = $this->staff($admin, 'Noor Plumber', 'noor.reassign@example.com', ['plumbing']);
        $second = $this->staff($admin, 'Second Plumber', 'second.reassign@example.com', ['plumbing']);

        Sanctum::actingAs($resident);
        $complaint = $this->postJson('/api/v1/complaints', [
            'type' => 'maintenance',
            'category' => 'plumbing',
            'priority' => 'normal',
            'unit_id' => $unit->id,
            'title' => 'Kitchen tap leaking',
            'description' => 'The kitchen tap has been leaking since this morning.',
        ])->assertCreated()->json('data');

        Sanctum::actingAs($admin);
        $this->postJson('/api/v1/admin/complaints/'.$complaint['id'].'/assign', [
            'assigned_to_user_id' => $first->id,
        ])->assertOk();

        Sanctum::actingAs($first);
        $this->postJson('/api/v1/staff/tasks/'.$complaint['id'].'/respond', ['decision' => 'accept'])->assertOk();
        $this->postJson('/api/v1/staff/tasks/'.$complaint['id'].'/status', [
            'status' => 'not_resolved',
            'note' => 'The part is not available.',
        ])->assertOk();

        Sanctum::actingAs($admin);
        $this->postJson('/api/v1/admin/complaints/'.$complaint['id'].'/assign', [
            'assigned_to_user_id' => $second->id,
        ])->assertOk()
            ->assertJsonPath('data.status', 'not_resolved')
            ->assertJsonPath('data.status_label', 'Not Resolved')
            ->assertJsonPath('data.workflow_status', 'not_resolved')
            ->assertJsonPath('data.assigned_to_name', 'Second Plumber')
            ->assertJsonPath('data.allowed_transitions', []);

        $listed = collect($this->getJson('/api/v1/admin/complaints')->assertOk()->json('data'))
            ->firstWhere('id', $complaint['id']);
        $this->assertSame('Second Plumber', $listed['assigned_to_name']);
        $this->assertSame('Not Resolved', $listed['status_label']);
        $this->assertSame([], $listed['allowed_transitions']);

        $this->assertDatabaseHas('app_notifications', [
            'user_id' => $resident->id,
            'title' => 'Staff assigned',
        ]);
        $this->assertDatabaseHas('app_notifications', [
            'user_id' => $second->id,
            'title' => 'Complaint assigned to you',
        ]);
        $this->assertDatabaseHas('app_notifications', [
            'user_id' => $first->id,
            'title' => 'Assignment updated',
        ]);
        $this->assertDatabaseHas('app_notifications', [
            'user_id' => $resident->id,
            'title' => 'Complaint Not Resolved',
        ]);
    }

    public function test_declining_an_assignment_returns_the_complaint_to_open(): void
    {
        ['admin' => $admin, 'resident' => $resident, 'unit' => $unit] = $this->seedWorld();
        $staffUser = $this->staff($admin, 'Decline Plumber', 'decline.staff@example.com', ['plumbing']);

        Sanctum::actingAs($resident);
        $complaint = $this->postJson('/api/v1/complaints', [
            'type' => 'maintenance',
            'category' => 'plumbing',
            'priority' => 'normal',
            'unit_id' => $unit->id,
            'title' => 'Blocked drain',
            'description' => 'The bathroom drain is blocked and water is standing.',
        ])->assertCreated()->json('data');

        Sanctum::actingAs($admin);
        $this->postJson('/api/v1/admin/complaints/'.$complaint['id'].'/assign', [
            'assigned_to_user_id' => $staffUser->id,
        ])->assertOk();

        Sanctum::actingAs($staffUser);
        $this->postJson('/api/v1/staff/tasks/'.$complaint['id'].'/respond', [
            'decision' => 'decline',
            'note' => 'I am not available today.',
        ])->assertOk();

        Sanctum::actingAs($admin);
        $this->getJson('/api/v1/admin/complaints/'.$complaint['id'])
            ->assertOk()
            ->assertJsonPath('data.status', 'submitted')
            ->assertJsonPath('data.status_label', 'Open')
            ->assertJsonPath('data.workflow_status', 'open')
            ->assertJsonPath('data.assigned_to_user_id', null);

        Sanctum::actingAs($staffUser);
        $this->getJson('/api/v1/staff/tasks/'.$complaint['id'])->assertNotFound();
    }

    private function staff(User $admin, string $name, string $email, array $skills): User
    {
        Sanctum::actingAs($admin);
        $created = $this->postJson('/api/v1/admin/staff', [
            'name' => $name,
            'email' => $email,
            'phone' => $this->staffPhone(),
            'staff_type' => 'internal',
            'specializations' => $skills,
        ])->assertCreated();
        $token = (string) DB::table('community_staff')->where('id', $created->json('data.id'))->value('invitation_token');
        $this->postJson('/api/v1/staff/invitations/accept', ['token' => $token])->assertOk();

        return User::query()->where('email', $email)->firstOrFail();
    }

    /** @return array<string, mixed> */
    private function seedWorld(): array
    {
        $region = Region::query()->create([
            'title' => 'Staff Region',
            'area' => 'Staff Area',
            'users_label' => '0 users',
            'sort_order' => 1,
            'status' => 'active',
        ]);
        $community = Community::query()->create([
            'name' => 'Holy Tower',
            'region_id' => $region->id,
            'region' => $region->title,
            'status' => 'active',
            'review_status' => 'approved',
        ]);
        $admin = User::factory()->create([
            'role' => 'community_admin',
            'community_admin_status' => 'approved',
            'status' => 'active',
            'active_context' => 'community_admin',
            'active_context_community_id' => $community->id,
        ]);
        $resident = User::factory()->create([
            'role' => 'resident',
            'status' => 'active',
            'active_context_community_id' => $community->id,
        ]);
        $systemAdmin = User::factory()->create([
            'role' => 'system_admin',
            'status' => 'active',
        ]);
        foreach ([[$admin, 'admin'], [$resident, 'member']] as [$user, $role]) {
            CommunityMembership::query()->create([
                'user_id' => $user->id,
                'community_id' => $community->id,
                'role' => $role,
                'status' => 'approved',
            ]);
        }
        $unitId = DB::table('units')->insertGetId([
            'community_id' => $community->id,
            'unit_number' => 'A-1',
            'unit_number_normalized' => 'a-1',
            'kind' => 'residential',
            'status' => 'active',
            'created_at' => now(),
            'updated_at' => now(),
        ]);
        DB::table('unit_residents')->insert([
            'unit_id' => $unitId,
            'community_id' => $community->id,
            'user_id' => $resident->id,
            'status' => 'active',
            'joined_at' => now(),
            'created_at' => now(),
            'updated_at' => now(),
        ]);
        CommunitySubscription::query()->create([
            'community_id' => $community->id,
            'plan_slug' => 'growth',
            'billing_interval' => 'month',
            'status' => CommunitySubscription::STATUS_TRIALING,
            'seat_limit' => 150,
            'stripe_customer_id' => 'cus_staff',
            'stripe_subscription_id' => 'sub_staff',
            'current_period_start' => now(),
            'current_period_end' => now()->addDays(30),
            'meta' => ['card_on_file' => true],
        ]);

        return compact('community', 'admin', 'resident', 'systemAdmin') + ['unit' => (object) ['id' => $unitId]];
    }

    /** @return array{community: Community, admin: User} */
    private function secondCommunity(): array
    {
        $regionId = (int) Region::query()->value('id');
        $community = Community::query()->create([
            'name' => 'DHA Community',
            'region_id' => $regionId,
            'region' => 'Staff Region',
            'status' => 'active',
            'review_status' => 'approved',
        ]);
        $admin = User::factory()->create([
            'role' => 'community_admin',
            'community_admin_status' => 'approved',
            'status' => 'active',
            'active_context' => 'community_admin',
            'active_context_community_id' => $community->id,
        ]);
        CommunityMembership::query()->create([
            'user_id' => $admin->id,
            'community_id' => $community->id,
            'role' => 'admin',
            'status' => 'approved',
        ]);
        CommunitySubscription::query()->create([
            'community_id' => $community->id,
            'plan_slug' => 'growth',
            'billing_interval' => 'month',
            'status' => CommunitySubscription::STATUS_TRIALING,
            'seat_limit' => 150,
            'stripe_customer_id' => 'cus_staff_two',
            'stripe_subscription_id' => 'sub_staff_two',
            'current_period_start' => now(),
            'current_period_end' => now()->addDays(30),
            'meta' => ['card_on_file' => true],
        ]);

        return compact('community', 'admin');
    }
}
