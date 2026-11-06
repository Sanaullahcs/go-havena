<?php

use App\Http\Controllers\Api\V1\Auth\LoginController;
use App\Http\Controllers\Api\V1\Auth\OtpController;
use App\Http\Controllers\Api\V1\Auth\GuestAuthController;
use App\Http\Controllers\Api\V1\Auth\WebHandoffController;
use App\Http\Controllers\Api\V1\CommunityController;
use App\Http\Controllers\Api\V1\ActivityLogController;
use App\Http\Controllers\Api\V1\MessageController;
use App\Http\Controllers\Api\V1\CommunityAdminNotificationPreferenceController;
use App\Http\Controllers\Api\V1\CommunityAdminPushPreferenceController;
use App\Http\Controllers\Api\V1\NotificationController;
use App\Http\Controllers\Api\V1\PointsController;
use App\Http\Controllers\Api\V1\ProfileController;
use App\Http\Controllers\Api\V1\ResidentCommunityController;
use App\Http\Controllers\Api\V1\UserBlockController;
use App\Http\Controllers\Api\V1\MemberController;
use App\Http\Controllers\Api\V1\NoticeController;
use App\Http\Controllers\Api\V1\ReportController;
use App\Http\Controllers\Api\V1\ListingController;
use App\Http\Controllers\Api\V1\DealController;
use App\Http\Controllers\Api\V1\BusinessController;
use App\Http\Controllers\Api\V1\FeedController;
use App\Http\Controllers\Api\V1\DeviceController;
use App\Http\Controllers\Api\V1\FamilyController;
use App\Http\Controllers\Api\V1\DashboardController;
use App\Http\Controllers\Api\V1\AmenityController;
use App\Http\Controllers\Api\V1\AmenitySharedBillController;
use App\Http\Controllers\Api\V1\PropertyServiceController;
use App\Http\Controllers\Api\V1\UnitController;
use App\Http\Controllers\Api\V1\UnitServiceBillController;
use App\Http\Controllers\Api\V1\WellnessController;
use App\Http\Controllers\Api\V1\AdminWellnessController;
use App\Http\Controllers\Api\V1\GeographyController;
use App\Http\Controllers\Api\V1\RegionController;
use App\Http\Controllers\Api\V1\AdminCommunityController;
use App\Http\Controllers\Api\V1\AdminCommunityAdminController;
use App\Http\Controllers\Api\V1\AdminUserController;
use App\Http\Controllers\Api\V1\ContactController;
use App\Http\Controllers\Api\V1\CommunityRuleController;
use App\Http\Controllers\Api\V1\CommunityDocumentController;
use App\Http\Controllers\Api\V1\GuestAccessController;
use App\Http\Controllers\Api\V1\GuestController;
use App\Http\Controllers\Api\V1\ResidentGuestController;
use App\Http\Controllers\Api\V1\BillingController;
use App\Http\Controllers\Api\V1\StripeWebhookController;
use App\Http\Controllers\Api\V1\SubscriptionPlanController;
use App\Http\Controllers\Api\V1\SubscriptionCouponController;
use App\Http\Controllers\Api\V1\ReferralController;
use App\Http\Controllers\Api\V1\ReferralProgramController;
use App\Http\Controllers\Api\V1\AppVersionController;
use App\Http\Controllers\Api\V1\AdminKuickpayPlatformController;
use App\Http\Controllers\Api\V1\AdminPaymentController;
use App\Http\Controllers\Api\V1\KuickpayGatewayController;
use App\Http\Controllers\Api\V1\KuickpayInstitutionController;
use App\Http\Controllers\Api\V1\PaymentController;
use App\Http\Controllers\Api\V1\UtilityBillController;
use App\Http\Controllers\Api\V1\AdminPlaidController;
use App\Http\Controllers\Api\V1\PlaidController;
use App\Http\Controllers\Api\V1\PlaidPaymentController;
use App\Http\Controllers\Api\V1\PlaidWebhookController;
use App\Http\Controllers\Api\V1\ResidentPlaidController;
use App\Http\Controllers\Api\V1\GeoController;
use App\Http\Controllers\Api\V1\NearbyPlaceController;
use App\Http\Controllers\Api\V1\CommunityDirectoryController;
use App\Http\Controllers\Api\V1\InviteQrImageController;
use App\Http\Controllers\Api\V1\CommunityFeatureController;
use Illuminate\Support\Facades\Route;

Route::prefix('v1')->group(function () {

    /* ── Health ── */
    Route::get('/health', fn() => response()->json([
        'data' => ['status' => 'ok', 'service' => 'havena-api', 'version' => '2.0.0', 'time' => now()->toIso8601String()],
    ]));

    /* ── Stripe webhooks (no auth; verified by signature) ── */
    Route::post('/billing/stripe/webhook', StripeWebhookController::class);
    Route::post('/plaid/webhook', PlaidWebhookController::class);

    /* ── KuickPay browser flow + Institution callbacks (no auth; verified by signature / credentials) ── */
    Route::get('/payments/kuickpay/launch/{token}', [KuickpayGatewayController::class, 'launch'])
        ->where('token', '[A-Za-z0-9]{32,64}')->middleware('throttle:60,1');
    Route::match(['get', 'post'], '/payments/kuickpay/return/{payment}', [KuickpayGatewayController::class, 'handleReturn'])
        ->where('payment', '[0-9a-fA-F-]{36}')->middleware('throttle:60,1');
    Route::get('/payments/kuickpay/sandbox/{session}', [KuickpayGatewayController::class, 'sandbox'])
        ->where('session', '[0-9a-fA-F-]{36}');
    Route::post('/payments/kuickpay/sandbox/{session}', [KuickpayGatewayController::class, 'sandboxSubmit'])
        ->where('session', '[0-9a-fA-F-]{36}')->middleware('throttle:30,1');
    Route::post('/integrations/kuickpay/bill-inquiry', [KuickpayInstitutionController::class, 'inquiry'])->middleware('throttle:120,1');
    Route::post('/integrations/kuickpay/bill-payment', [KuickpayInstitutionController::class, 'payment'])->middleware('throttle:120,1');
    Route::get('/billing/plans', [SubscriptionPlanController::class, 'publicIndex']);
    Route::get('/app/version-policy', [AppVersionController::class, 'policy']);
    Route::get('/public/invite-qr.png', [InviteQrImageController::class, 'show'])
        ->name('public.invite-qr');
    Route::get('/public/invite-qr', [InviteQrImageController::class, 'view'])
        ->name('public.invite-qr-view');

    /* ── Auth ── */
    Route::prefix('auth')->group(function () {
        Route::post('/login',  [LoginController::class, 'login']);
        Route::post('/logout', [LoginController::class, 'logout'])->middleware('auth:sanctum');
        Route::post('/otp/request', [OtpController::class, 'requestOtp']);
        Route::get('/otp/challenge', [OtpController::class, 'challenge']);
        Route::post('/otp/verify',  [OtpController::class, 'verifyOtp']);
        Route::post('/web-handoff', [WebHandoffController::class, 'store'])->middleware('auth:sanctum');
        Route::post('/web-handoff/consume', [WebHandoffController::class, 'consume'])->middleware('throttle:30,1');

        Route::prefix('guest')->group(function () {
            Route::post('/otp/request', [GuestAuthController::class, 'requestOtp']);
            Route::post('/otp/verify',  [GuestAuthController::class, 'verifyOtp']);
            Route::post('/verify-invite', [GuestAuthController::class, 'verifyInvite']);
        });
    });

    /* ── Public ── */
    Route::get('/communities/search', [CommunityController::class, 'search']);
    Route::get('/countries', [GeographyController::class, 'countries']);
    Route::get('/countries/{countryId}/states', [GeographyController::class, 'states'])->whereNumber('countryId');
    Route::get('/states/{stateId}/cities', [GeographyController::class, 'cities'])->whereNumber('stateId');
    Route::post('/locations/resolve', [GeographyController::class, 'resolveLocation']);
    Route::get('/regions', [RegionController::class, 'index']);
    Route::post('/contact', [ContactController::class, 'store']);

    /* ── Authenticated ── */
    Route::middleware(['auth:sanctum', 'guest.access', 'account.access'])->group(function () {

        /* Profile */
        Route::get('/me',             [ProfileController::class, 'show']);
        Route::get('/me/membership-review', [ProfileController::class, 'membershipReview']);
        Route::get('/guest-access/status',   [GuestAccessController::class, 'status']);
        Route::get('/neighbors/{id}', [ProfileController::class, 'showNeighbor'])->whereNumber('id');
        Route::get('/users/blocked', [UserBlockController::class, 'index']);
        Route::post('/users/{id}/block', [UserBlockController::class, 'store'])->whereNumber('id');
        Route::delete('/users/{id}/block', [UserBlockController::class, 'destroy'])->whereNumber('id');
        Route::put('/me/active-context', [ProfileController::class, 'updateActiveContext']);
        Route::get('/me/communities', [ResidentCommunityController::class, 'communities']);
        Route::get('/me/invitations', [ResidentCommunityController::class, 'invitations']);
        Route::post('/me/invitations/{invite}/reject', [ResidentCommunityController::class, 'rejectInvitation'])->whereNumber('invite');
        Route::put('/me',             [ProfileController::class, 'update']);
        Route::post('/me',            [ProfileController::class, 'update']);
        Route::delete('/me',          [ProfileController::class, 'destroy']);
        Route::post('/me/avatar',         [ProfileController::class, 'uploadAvatar']);
        Route::post('/me/utility-bill',   [ProfileController::class, 'uploadUtilityBill']);
        Route::put('/me/password',        [ProfileController::class, 'changePassword']);

        /* Points & leaderboard */
        Route::middleware('resident.feature:points')->group(function () {
            Route::get('/me/points/stats',    [PointsController::class, 'stats']);
            Route::get('/me/points/history',  [PointsController::class, 'history']);
            Route::get('/me/points/rank',     [PointsController::class, 'rank']);
            Route::get('/me/achievements',    [PointsController::class, 'achievements']);
            Route::get('/leaderboard',        [PointsController::class, 'leaderboard']);
        });

        /* Communities */
        Route::post('/communities/join-by-invite', [CommunityController::class, 'joinByInvite']);
        Route::post('/communities/request',        [CommunityController::class, 'requestCommunity']);
        Route::post('/communities/self-serve',     [CommunityController::class, 'selfServeCreate']);
        Route::post('/communities/{id}/join',      [CommunityController::class, 'join']);
        Route::get('/communities/{id}/units',      [UnitController::class, 'communityIndex'])->whereNumber('id');
        Route::post('/communities/{id}/units',     [UnitController::class, 'communityStore'])->whereNumber('id');
        Route::get('/units/mine',                  [UnitController::class, 'mine']);
        Route::post('/units/mine/registration-packages', [UnitController::class, 'submitRegistrationPackage']);
        Route::post('/units/mine/onboarding-units', [UnitController::class, 'completeOnboardingUnits']);
        Route::post('/units/mine/billing-contact-transfers', [UnitController::class, 'requestTransfer']);
        Route::patch('/billing-contact-transfers/{id}/accept', [UnitController::class, 'acceptTransfer'])->whereNumber('id');
        Route::patch('/billing-contact-transfers/{id}/reject', [UnitController::class, 'rejectTransfer'])->whereNumber('id');
        Route::patch('/billing-contact-transfers/{id}/cancel', [UnitController::class, 'cancelTransfer'])->whereNumber('id');
        Route::get('/property-services',           [PropertyServiceController::class, 'residentIndex']);
        Route::post('/property-services/{id}/subscribe', [PropertyServiceController::class, 'subscribe'])->whereNumber('id');
        Route::post('/property-services/{id}/unsubscribe', [PropertyServiceController::class, 'unsubscribe'])->whereNumber('id');
        Route::get('/service-bills',               [UnitServiceBillController::class, 'residentIndex']);
        Route::post('/service-bills/{id}/acknowledge', [UnitServiceBillController::class, 'residentAcknowledge'])->whereNumber('id');
        Route::post('/service-bills/{id}/proof',   [UnitServiceBillController::class, 'residentSubmitProof'])->whereNumber('id');

        Route::get('/geo/address-suggest', [GeoController::class, 'suggest']);
        Route::get('/geo/address-reverse', [GeoController::class, 'reverse']);
        Route::get('/nearby-places', [NearbyPlaceController::class, 'index'])->middleware('resident.feature:nearby_places');
        Route::get('/nearby-places/suggestions', [CommunityDirectoryController::class, 'mySuggestions'])->middleware('resident.feature:nearby_places');
        Route::post('/nearby-places/suggestions', [CommunityDirectoryController::class, 'storeSuggestion'])->middleware('resident.feature:nearby_places');
        Route::get('/essentials', [CommunityDirectoryController::class, 'essentials'])->middleware('resident.feature:nearby_places');

        /* Guest invitations (resident) */
        Route::middleware('resident.feature:guest_invites')->group(function () {
            Route::get('/guest-invitations/mine',              [ResidentGuestController::class, 'mine']);
            Route::get('/guest-invitations/pending-approval',  [ResidentGuestController::class, 'pendingApproval']);
            Route::post('/guest-invitations',                  [ResidentGuestController::class, 'store']);
            Route::match(['patch', 'post'],'/guest-invitations/{id}/approve',    [ResidentGuestController::class, 'approve']);
            Route::match(['patch', 'post'],'/guest-invitations/{id}/reject',     [ResidentGuestController::class, 'reject']);
        });

        /* Families (resident) */
        Route::middleware('resident.feature:family')->group(function () {
        Route::get('/families/mine',                         [FamilyController::class, 'mine']);
        Route::get('/families/suggest-number',              [FamilyController::class, 'suggestNumber']);
        Route::get('/families/check-number',                 [FamilyController::class, 'checkNumber']);
        Route::post('/families/ensure',                      [FamilyController::class, 'ensure']);
        Route::post('/families',                             [FamilyController::class, 'store']);
        Route::post('/families/join',                        [FamilyController::class, 'join']);
        Route::post('/families/leave',                       [FamilyController::class, 'leave']);
        Route::get('/families/join-requests/pending',        [FamilyController::class, 'pendingJoinRequests']);
        Route::post('/families/add-member-requests',         [FamilyController::class, 'storeAddMemberRequest']);
        Route::match(['patch', 'post'],'/family-join-requests/{id}/approve',   [FamilyController::class, 'approveJoinRequest']);
        Route::match(['patch', 'post'],'/family-join-requests/{id}/reject',    [FamilyController::class, 'rejectJoinRequest']);
        Route::match(['patch', 'post'],'/family-join-requests/{id}/cancel',    [FamilyController::class, 'cancelJoinRequest']);
        Route::match(['patch', 'post'],'/family-add-member-requests/{id}/approve', [FamilyController::class, 'approveAddMemberRequest']);
        Route::match(['patch', 'post'],'/family-add-member-requests/{id}/reject',  [FamilyController::class, 'rejectAddMemberRequest']);
        Route::match(['patch', 'post'],'/families/members/{userId}/suspend',   [FamilyController::class, 'suspendMember'])->whereNumber('userId');
        Route::match(['patch', 'post'],'/families/members/{userId}/unsuspend', [FamilyController::class, 'unsuspendMember'])->whereNumber('userId');
        Route::match(['patch', 'post'],'/families/members/{userId}/block',     [FamilyController::class, 'blockMember'])->whereNumber('userId');
        Route::delete('/families/members/{userId}',         [FamilyController::class, 'removeMember'])->whereNumber('userId');
        });

        /* ── Notices ── */
        Route::middleware('resident.feature:notices,events,alerts')->group(function () {
            Route::get('/notices',              [NoticeController::class, 'index']);
            Route::get('/notices/{id}',         [NoticeController::class, 'show']);
        });
        Route::middleware('resident.feature:events')->group(function () {
            Route::post('/notices/{id}/rsvp',   [NoticeController::class, 'rsvp']);
            Route::post('/events',              [NoticeController::class, 'submitEvent']);
            Route::post('/events/upload-image', [NoticeController::class, 'uploadEventImage']);
        });

        /* ── Marketplace / Listings ── */
        Route::middleware('resident.feature:marketplace')->group(function () {
        Route::get('/listings',             [ListingController::class, 'index']);
        Route::get('/listings/{id}',        [ListingController::class, 'show'])->whereNumber('id');
        Route::post('/listings/upload-image', [ListingController::class, 'uploadImage']);
        Route::post('/listings',            [ListingController::class, 'store']);
        Route::match(['patch', 'post'],'/listings/{id}',           [ListingController::class, 'update']);
        Route::match(['patch', 'post'],'/listings/{id}/mark-sold', [ListingController::class, 'markSold']);
        Route::delete('/listings/{id}',          [ListingController::class, 'destroy']);
        Route::post('/listings/{id}/save',  [ListingController::class, 'toggleSave']);

        /* ── Deals & Offers ── */
        Route::get('/deals',                [DealController::class, 'index']);
        Route::post('/deals/upload-image',  [DealController::class, 'residentUploadImage']);
        Route::post('/deals',               [DealController::class, 'residentStore']);
        Route::get('/deals/{id}',           [DealController::class, 'show'])->whereNumber('id');
        Route::post('/deals/{id}/save',     [DealController::class, 'toggleSave'])->whereNumber('id');
        Route::match(['patch', 'post'],'/deals/{id}',         [DealController::class, 'residentUpdate'])->whereNumber('id');
        Route::delete('/deals/{id}',        [DealController::class, 'residentDestroy'])->whereNumber('id');

        /* ── Businesses ── */
        Route::get('/businesses',                [BusinessController::class, 'index']);
        Route::post('/businesses/upload-image',  [BusinessController::class, 'uploadImage']);
        Route::post('/businesses',               [BusinessController::class, 'store']);
        Route::get('/businesses/{id}',           [BusinessController::class, 'show'])->whereNumber('id');
        Route::match(['patch', 'post'],'/businesses/{id}',         [BusinessController::class, 'update'])->whereNumber('id');
        Route::delete('/businesses/{id}',        [BusinessController::class, 'destroy'])->whereNumber('id');
        });

        /* ── Community Feed ── */
        Route::middleware('resident.feature:feed')->group(function () {
        Route::get('/feed/topics',                               [FeedController::class, 'topics']);
        Route::get('/feed',                                      [FeedController::class, 'index']);
        Route::post('/feed',                                     [FeedController::class, 'store']);
        Route::post('/feed/upload-image',                        [FeedController::class, 'uploadImage']);
        Route::get('/feed/{id}',                                 [FeedController::class, 'show']);
        Route::put('/feed/{id}',                                 [FeedController::class, 'update']);
        Route::delete('/feed/{id}',                              [FeedController::class, 'destroy']);
        Route::post('/feed/{id}/like',                         [FeedController::class, 'like']);
        Route::post('/feed/{id}/vote',                         [FeedController::class, 'vote']);
        Route::post('/feed/{id}/report',                       [FeedController::class, 'reportPost']);
        Route::get('/feed/{id}/comments',                      [FeedController::class, 'comments']);
        Route::post('/feed/{id}/comments',                     [FeedController::class, 'addComment']);
        Route::post('/feed/{postId}/comments/{commentId}/like', [FeedController::class, 'likeComment']);
        Route::delete('/feed/{postId}/comments/{commentId}',   [FeedController::class, 'deleteComment']);
        Route::post('/feed/{postId}/comments/{commentId}/report', [FeedController::class, 'reportComment']);
        });

        /* ── Amenities & Bookings ── */
        Route::middleware('resident.feature:amenities')->group(function () {
            Route::get('/amenities',                        [AmenityController::class, 'index']);
            Route::post('/amenities',                       [AmenityController::class, 'create']);
            Route::get('/amenities/{id}/slots',             [AmenityController::class, 'slots']);
            Route::get('/amenities/{id}/bills',             [AmenitySharedBillController::class, 'residentIndex']);
            Route::get('/amenity-bills',                    [AmenitySharedBillController::class, 'myIndex']);
            Route::get('/amenity-owner-bills',              [AmenitySharedBillController::class, 'ownerIndex']);
            Route::post('/amenities/{id}/bills/{residentBillId}/proof', [AmenitySharedBillController::class, 'residentSubmitProof']);
            Route::post('/amenities/{id}/bills/{residentBillId}/pay-bank', [AmenitySharedBillController::class, 'residentPayBank']);
            Route::patch('/amenities/{id}/resident-bills/{residentBillId}/approve', [AmenitySharedBillController::class, 'ownerApprove']);
            Route::patch('/amenities/{id}/resident-bills/{residentBillId}/reject', [AmenitySharedBillController::class, 'ownerReject']);
        });
        Route::middleware('resident.feature:bookings')->group(function () {
            Route::get('/bookings',                         [AmenityController::class, 'myBookings']);
            Route::get('/bookings/inbox',                   [AmenityController::class, 'bookingInbox']);
            Route::post('/bookings',                        [AmenityController::class, 'book']);
            Route::delete('/bookings/{id}',                 [AmenityController::class, 'cancelBooking']);
            // Hosting may block HTTP DELETE; POST keeps cancel available.
            Route::post('/bookings/{id}/cancel',            [AmenityController::class, 'cancelBooking']);
            Route::match(['patch', 'post'],'/bookings/{id}/approve',          [AmenityController::class, 'approveBooking']);
            Route::match(['patch', 'post'],'/bookings/{id}/reject',           [AmenityController::class, 'rejectBooking']);
        });

        /* ── Wellness ── */
        Route::middleware('resident.feature:wellness')->group(function () {
        Route::get('/wellness',                         [WellnessController::class, 'index']);
        Route::get('/wellness/hub',                     [WellnessController::class, 'hub']);
        Route::get('/wellness/categories/{key}/courses', [WellnessController::class, 'categoryCourses']);
        Route::get('/wellness/courses/{id}',            [WellnessController::class, 'showCourse']);
        Route::get('/wellness/lessons/{id}',            [WellnessController::class, 'showLesson']);
        Route::post('/wellness/lessons/{id}/complete',  [WellnessController::class, 'completeLesson']);
        Route::delete('/wellness/lessons/{id}/complete',[WellnessController::class, 'uncompleteLesson']);
        // Some hosts block HTTP DELETE; POST fallback keeps portal "undo" working.
        Route::post('/wellness/lessons/{id}/uncomplete',[WellnessController::class, 'uncompleteLesson']);
        Route::post('/wellness/{id}/complete',          [WellnessController::class, 'complete']);
        Route::delete('/wellness/{id}/complete',        [WellnessController::class, 'uncomplete']);
        Route::post('/wellness/{id}/uncomplete',        [WellnessController::class, 'uncomplete']);
        });

        /* ── Dashboard ── */
        Route::get('/dashboard/stats',            [DashboardController::class, 'residentStats']);

        /* ── Messaging ── */
        Route::middleware('resident.feature:messages')->group(function () {
            Route::get('/conversations/unread-count',           [MessageController::class, 'unreadCount']);
            Route::get('/conversations',                        [MessageController::class, 'conversations']);
            Route::get('/community-members',                  [MessageController::class, 'communityMembers']);
            Route::post('/conversations',                       [MessageController::class, 'startConversation']);
            Route::get('/conversations/{id}/messages',          [MessageController::class, 'messages']);
            Route::post('/conversations/{id}/messages',         [MessageController::class, 'send']);
        });

        /* ── Notifications ── */
        Route::get('/me/push-notifications',      [CommunityAdminPushPreferenceController::class, 'show']);
        Route::patch('/me/push-notifications',    [CommunityAdminPushPreferenceController::class, 'update']);
        Route::get('/me/notification-preferences',   [CommunityAdminNotificationPreferenceController::class, 'show']);
        Route::patch('/me/notification-preferences', [CommunityAdminNotificationPreferenceController::class, 'update']);

        Route::get('/notifications',              [NotificationController::class, 'index']);
        Route::post('/notifications/{id}/read',   [NotificationController::class, 'markRead']);
        Route::post('/notifications/read-all',    [NotificationController::class, 'markAllRead']);

        Route::post('/devices', [DeviceController::class, 'store']);
        Route::delete('/devices', [DeviceController::class, 'destroy']);
        Route::post('/devices/test-push', [DeviceController::class, 'testPush']);

        /* Plaid — resident bank + ACH payments */
        Route::prefix('plaid/resident')->group(function () {
            Route::get('/capability', [ResidentPlaidController::class, 'capability']);
            Route::get('/connection', [ResidentPlaidController::class, 'showConnection']);
            Route::post('/link-token', [ResidentPlaidController::class, 'createLinkToken']);
            Route::post('/exchange-token', [ResidentPlaidController::class, 'exchangeToken']);
            Route::post('/reconnect', [ResidentPlaidController::class, 'reconnect']);
            Route::post('/disconnect', [ResidentPlaidController::class, 'disconnect']);
        });
        /* KuickPay — resident payments + utility bills (Pakistan) */
        Route::get('/payments/capability', [PaymentController::class, 'capability']);
        Route::get('/payments', [PaymentController::class, 'index']);
        Route::post('/payments', [PaymentController::class, 'store'])->middleware('throttle:20,1');
        Route::get('/payments/{id}', [PaymentController::class, 'show'])->where('id', '[0-9a-fA-F-]{36}');
        Route::post('/payments/{id}/cases', [PaymentController::class, 'openCase'])->where('id', '[0-9a-fA-F-]{36}');
        Route::post('/payments/{id}/cancel', [PaymentController::class, 'cancel'])->where('id', '[0-9a-fA-F-]{36}');
        Route::get('/utilities/billers', [UtilityBillController::class, 'billers']);
        Route::get('/utilities/accounts', [UtilityBillController::class, 'index']);
        Route::post('/utilities/accounts', [UtilityBillController::class, 'store'])->middleware('throttle:10,1');
        Route::post('/utilities/accounts/{id}/refresh', [UtilityBillController::class, 'refresh'])->whereNumber('id')->middleware('throttle:30,1');
        Route::patch('/utilities/accounts/{id}', [UtilityBillController::class, 'update'])->whereNumber('id');
        Route::delete('/utilities/accounts/{id}', [UtilityBillController::class, 'destroy'])->whereNumber('id');

        Route::get('/plaid/resident/payments', [PlaidPaymentController::class, 'index']);
        Route::post('/plaid/payments/booking', [PlaidPaymentController::class, 'payBooking']);
        Route::post('/plaid/payments/shared-bill', [PlaidPaymentController::class, 'paySharedBill']);

        /* Plaid (community admin bank linking + ACH ledger) */
        Route::middleware('community.admin')->prefix('plaid')->group(function () {
            Route::get('/connection', [PlaidController::class, 'showConnection']);
            Route::post('/link-token', [PlaidController::class, 'createLinkToken']);
            Route::post('/exchange-token', [PlaidController::class, 'exchangeToken']);
            Route::post('/reconnect', [PlaidController::class, 'reconnect']);
            Route::post('/disconnect', [PlaidController::class, 'disconnect']);
            Route::get('/payments', [PlaidPaymentController::class, 'adminIndex']);
        });

        /* ── Activity Logs ── */
        Route::get('/activity-logs',              [ActivityLogController::class, 'index']);
        Route::post('/activity-logs',             [ActivityLogController::class, 'store']);
        Route::get('/activity-logs/stats',        [ActivityLogController::class, 'stats']);

        /* ── Admin Routes ── */
        Route::prefix('admin')->group(function () {

            /* System admin — approve community admins & community requests (for now) */
            Route::middleware('system.admin')->group(function () {
                Route::get('/community-admins', [AdminCommunityAdminController::class, 'index']);
                Route::match(['patch', 'post'], '/community-admins/{id}', [AdminCommunityAdminController::class, 'update']);
                Route::match(['patch', 'post'], '/community-admins/{id}/approve', [AdminCommunityAdminController::class, 'approve']);
                Route::match(['patch', 'post'], '/community-admins/{id}/reapprove', [AdminCommunityAdminController::class, 'approve']);
                Route::match(['patch', 'post'], '/community-admins/{id}/reject', [AdminCommunityAdminController::class, 'reject']);
                Route::match(['patch', 'post'], '/community-admins/{id}/suspend', [AdminCommunityAdminController::class, 'suspend']);
                Route::match(['patch', 'post'], '/community-admins/{id}/reactivate', [AdminCommunityAdminController::class, 'reactivate']);
                Route::match(['patch', 'post'], '/community-admins/{id}/release', [AdminCommunityAdminController::class, 'release']);
                Route::match(['patch', 'post'], '/community-admins/{id}/assign-community', [AdminCommunityAdminController::class, 'assignCommunity']);
                Route::delete('/community-admins/{id}', [AdminCommunityAdminController::class, 'destroy']);

                Route::post('/users', [AdminUserController::class, 'store']);

                /* Plaid (US) — platform operations: health, readiness, reconciliation */
                Route::get('/kuickpay/overview', [AdminKuickpayPlatformController::class, 'overview']);
                Route::get('/kuickpay/payments/export', [AdminKuickpayPlatformController::class, 'export']);
                Route::get('/kuickpay/payments', [AdminKuickpayPlatformController::class, 'payments']);

                Route::get('/plaid/overview', [AdminPlaidController::class, 'overview']);
                Route::get('/plaid/transfers', [AdminPlaidController::class, 'transfers']);
                Route::get('/plaid/transfers/{id}', [AdminPlaidController::class, 'show'])->where('id', '[0-9a-fA-F-]{36}');
                Route::post('/plaid/transfers/{id}/refresh', [AdminPlaidController::class, 'refresh'])->where('id', '[0-9a-fA-F-]{36}')->middleware('throttle:30,1');
                Route::post('/plaid/transfers/{id}/resolve-exception', [AdminPlaidController::class, 'resolveException'])->where('id', '[0-9a-fA-F-]{36}');
                Route::post('/plaid/sync-events', [AdminPlaidController::class, 'syncEvents'])->middleware('throttle:10,1');
                Route::get('/plaid/events', [AdminPlaidController::class, 'events']);
                Route::patch('/plaid/communities/{id}/payments', [AdminPlaidController::class, 'updateCommunityPayments'])->whereNumber('id');

                Route::get('/community-requests', [AdminCommunityController::class, 'index']);
                Route::get('/community-requests/{id}', [AdminCommunityController::class, 'show']);
                Route::match(['patch', 'post'], '/community-requests/{id}/approve', [AdminCommunityController::class, 'approve']);
                Route::match(['patch', 'post'], '/community-requests/{id}/reject', [AdminCommunityController::class, 'reject']);

                Route::put('/communities/{id}', [AdminCommunityController::class, 'update']);
                Route::delete('/communities/{id}', [AdminCommunityController::class, 'destroy']);
                Route::match(['patch', 'post'],'/communities/{id}/status', [AdminCommunityController::class, 'updateStatus']);
                Route::get('/communities/{id}/admin', [AdminCommunityController::class, 'showAdmin']);
                Route::post('/communities/{id}/assign-admin', [AdminCommunityController::class, 'assignAdmin']);
                Route::post('/communities/{id}/release-admin', [AdminCommunityController::class, 'releaseAdmin']);
                Route::get('/communities/{id}/resident-features', [CommunityFeatureController::class, 'show'])->whereNumber('id');
                Route::put('/communities/{id}/resident-features', [CommunityFeatureController::class, 'update'])->whereNumber('id');
                Route::get('/feature-disable-requests', [CommunityFeatureController::class, 'disableRequests']);
                Route::post('/feature-disable-requests/{id}/approve', [CommunityFeatureController::class, 'approveDisableRequest'])->whereNumber('id');
                Route::post('/feature-disable-requests/{id}/reject', [CommunityFeatureController::class, 'rejectDisableRequest'])->whereNumber('id');
                Route::get('/communities/{id}/activity-logs', [ActivityLogController::class, 'community'])->whereNumber('id');
                Route::get('/community-admins/{id}/activity-logs', [ActivityLogController::class, 'communityAdmin'])->whereNumber('id');

                Route::get('/contact-submissions', [ContactController::class, 'adminIndex']);
                Route::get('/contact-submissions/{id}', [ContactController::class, 'adminShow']);
                Route::match(['patch', 'post'],'/contact-submissions/{id}', [ContactController::class, 'adminUpdate']);

                Route::post('/billing/grant', [BillingController::class, 'grant']);
                Route::get('/subscription-plans', [SubscriptionPlanController::class, 'index']);
                Route::post('/subscription-plans', [SubscriptionPlanController::class, 'store']);
                Route::put('/subscription-plans/{id}', [SubscriptionPlanController::class, 'update']);
                Route::match(['patch', 'post'],'/subscription-plans/{id}/status', [SubscriptionPlanController::class, 'updateStatus']);
                Route::get('/subscription-coupons', [SubscriptionCouponController::class, 'index']);
                Route::post('/subscription-coupons', [SubscriptionCouponController::class, 'store']);
                Route::put('/subscription-coupons/{id}', [SubscriptionCouponController::class, 'update']);
                Route::match(['patch', 'post'],'/subscription-coupons/{id}/status', [SubscriptionCouponController::class, 'updateStatus']);
                Route::get('/referral-program/settings', [ReferralProgramController::class, 'settings']);
                Route::put('/referral-program/settings', [ReferralProgramController::class, 'updateSettings']);
                Route::get('/referral-program/attributions', [ReferralProgramController::class, 'attributions']);
                Route::post('/referral-program/attributions/{id}/review', [ReferralProgramController::class, 'review']);
                Route::post('/referral-program/rewards/{id}/retry', [ReferralProgramController::class, 'retryReward']);
                Route::get('/app-version/settings', [AppVersionController::class, 'settings']);
                Route::put('/app-version/settings', [AppVersionController::class, 'updateSettings']);
                Route::post('/app-version/send-update-notification', [AppVersionController::class, 'sendUpdateNotification']);
            });

            /* Community admin (+ system admin override) */
            Route::middleware(['community.admin', 'admin.feature'])->group(function () {
                Route::get('/resident-features', [CommunityFeatureController::class, 'showMine']);
                Route::put('/resident-features', [CommunityFeatureController::class, 'updateMine']);
                Route::post('/resident-features/disable-requests', [CommunityFeatureController::class, 'requestDisable']);
                Route::post('/resident-features/enable-requests', [CommunityFeatureController::class, 'requestEnable']);
                Route::post('/resident-features/enable', [CommunityFeatureController::class, 'enableMine']);

                /* Community Rules — admin CRUD */
                Route::get('/essentials', [CommunityDirectoryController::class, 'adminIndex']);
                Route::post('/essentials', [CommunityDirectoryController::class, 'adminStore']);
                Route::match(['patch', 'post'], '/essentials/{id}', [CommunityDirectoryController::class, 'adminUpdate'])->whereNumber('id');
                Route::delete('/essentials/{id}', [CommunityDirectoryController::class, 'adminDestroy'])->whereNumber('id');
                Route::post('/nearby-suggestions/{id}/approve', [CommunityDirectoryController::class, 'approveSuggestion'])->whereNumber('id');
                Route::post('/nearby-suggestions/{id}/reject', [CommunityDirectoryController::class, 'rejectSuggestion'])->whereNumber('id');

                Route::get('/community-rules',              [CommunityRuleController::class, 'adminIndex']);
                Route::post('/community-rules',             [CommunityRuleController::class, 'store']);
                Route::post('/community-rules/categories',  [CommunityRuleController::class, 'storeCategory']);
                Route::delete('/community-rules/categories', [CommunityRuleController::class, 'destroyCategory']);
                Route::match(['patch', 'post'],'/community-rules/{id}',       [CommunityRuleController::class, 'update']);
                Route::delete('/community-rules/{id}',      [CommunityRuleController::class, 'destroy']);
                Route::post('/community-rules/{id}/delete', [CommunityRuleController::class, 'destroy']);

                /* Community Documents — admin CRUD */
                Route::get('/documents',                   [CommunityDocumentController::class, 'adminIndex']);
                Route::post('/documents',                  [CommunityDocumentController::class, 'store']);
                Route::post('/documents/categories',       [CommunityDocumentController::class, 'storeCategory']);
                Route::delete('/documents/categories',     [CommunityDocumentController::class, 'destroyCategory']);
                Route::match(['patch', 'post'],'/documents/{id}',            [CommunityDocumentController::class, 'update']);
                Route::delete('/documents/{id}',           [CommunityDocumentController::class, 'destroy']);
                Route::post('/documents/{id}/delete',      [CommunityDocumentController::class, 'destroy']);

                /* Guest users — admin CRUD */
                Route::get('/guests',                     [GuestController::class, 'index']);
                Route::get('/guests/{id}',                [GuestController::class, 'show']);
                Route::get('/guests/{id}/activity',       [GuestController::class, 'activity']);
                Route::post('/guests/invite',             [GuestController::class, 'invite']);
                Route::match(['patch', 'post'],'/guests/{id}/approve',     [GuestController::class, 'approve']);
                Route::match(['patch', 'post'],'/guests/{id}/reject',      [GuestController::class, 'reject']);
                Route::match(['patch', 'post'],'/guests/{id}/revoke',       [GuestController::class, 'revoke'])->whereNumber('id');
                Route::match(['patch', 'post'],'/guests/{id}/extend',       [GuestController::class, 'extend'])->whereNumber('id');
                Route::delete('/guests/{id}',             [GuestController::class, 'destroy'])->whereNumber('id');
                // Some hosts block HTTP DELETE; POST keeps Community Admin cancel working.
                Route::post('/guests/{id}/cancel',        [GuestController::class, 'destroy'])->whereNumber('id');

                Route::get('/dashboard/stats', [DashboardController::class, 'adminStats']);

                Route::get('/members',              [MemberController::class, 'index']);
                Route::get('/members/{id}',         [MemberController::class, 'show']);
                Route::get('/members/{id}/activity-logs', [MemberController::class, 'activityLogs']);
                Route::post('/members/invite',      [MemberController::class, 'invite']);
                Route::post('/members/invite-batch/preview', [MemberController::class, 'previewBatch']);
                Route::post('/members/invite-batch', [MemberController::class, 'commitBatch']);
                Route::post('/members/resend-invites', [MemberController::class, 'resendInvites']);
                Route::post('/members/{id}/resend-invite', [MemberController::class, 'resendInvite'])->whereNumber('id');
                Route::match(['patch', 'post'], '/members/{id}/approve',  [MemberController::class, 'approve']);
                Route::match(['patch', 'post'], '/members/{id}/reject',   [MemberController::class, 'reject']);
                Route::match(['patch', 'post'], '/members/{id}/suspend',  [MemberController::class, 'suspend']);
                Route::match(['patch', 'post'], '/members/{id}/deactivate', [MemberController::class, 'deactivate']);
                // Soft-remove only (no hard delete). Legacy delete routes map to deactivate.
                Route::delete('/members/{id}',      [MemberController::class, 'destroy']);
                Route::post('/members/{id}/delete', [MemberController::class, 'destroy']);

                /* Community subscription billing */
                Route::get('/billing',                      [BillingController::class, 'show']);
                Route::post('/billing/checkout',             [BillingController::class, 'checkout']);
                Route::post('/billing/coupon/apply',         [BillingController::class, 'applyCoupon']);
                Route::delete('/billing/coupon',             [BillingController::class, 'removeCoupon']);
                Route::post('/billing/confirm-checkout',     [BillingController::class, 'confirmCheckout']);
                Route::post('/billing/portal',               [BillingController::class, 'portal']);
                Route::post('/billing/change-plan',          [BillingController::class, 'changePlan']);
                Route::get('/referrals/me',                  [ReferralController::class, 'me']);

                Route::match(['patch', 'post'],'/family-add-member-requests/{id}/approve', [FamilyController::class, 'adminApproveAddMemberRequest']);
                Route::match(['patch', 'post'],'/family-add-member-requests/{id}/reject',  [FamilyController::class, 'adminRejectAddMemberRequest']);

                Route::get('/notices',              [NoticeController::class, 'adminIndex']);
                Route::post('/notices/upload-image', [NoticeController::class, 'uploadImage']);
                Route::post('/notices',             [NoticeController::class, 'store']);
                Route::post('/events',              [NoticeController::class, 'storeEvent']);
                Route::post('/alerts',              [NoticeController::class, 'storeAlert']);
                Route::match(['patch', 'post'],'/notices/{id}',       [NoticeController::class, 'update']);
                Route::delete('/notices/{id}',      [NoticeController::class, 'destroy']);
                Route::post('/notices/{id}/delete', [NoticeController::class, 'destroy']);
                Route::match(['patch', 'post'],'/notices/{id}/approve', [NoticeController::class, 'approve']);
                Route::match(['patch', 'post'],'/notices/{id}/reject',  [NoticeController::class, 'reject']);

                Route::get('/posts',                    [FeedController::class, 'adminIndex']);
                Route::get('/posts/{id}',                [FeedController::class, 'adminShow']);
                Route::post('/posts/{id}/report',        [FeedController::class, 'adminReportPost']);
                Route::get('/posts/{id}/reports',        [FeedController::class, 'adminPostReports']);
                Route::post('/posts/{id}/reports/{reportId}/dismiss', [FeedController::class, 'adminDismissPostReport'])->whereNumber('reportId');
                Route::delete('/posts/{id}',             [FeedController::class, 'adminDestroy']);
                Route::post('/posts/{id}/delete',        [FeedController::class, 'adminDestroy']);
                Route::match(['patch', 'post'],'/posts/{id}/approve',     [FeedController::class, 'adminApprove']);
                Route::match(['patch', 'post'],'/posts/{id}/reject',      [FeedController::class, 'adminReject']);

                /* Amenities — admin CRUD + publish review */
                Route::get('/units',                          [UnitController::class, 'adminIndex']);
                Route::post('/units',                         [UnitController::class, 'adminStore']);
                Route::patch('/units/{id}',                   [UnitController::class, 'adminUpdate'])->whereNumber('id');
                Route::delete('/units/{id}',                  [UnitController::class, 'adminDestroy'])->whereNumber('id');
                Route::patch('/units/{id}/billing-contact',   [UnitController::class, 'adminTransfer'])->whereNumber('id');
                Route::get('/unit-registration-packages',     [UnitController::class, 'adminPackagesIndex']);
                Route::post('/unit-registration-packages/{id}/approve', [UnitController::class, 'adminApprovePackage'])->whereNumber('id');
                Route::post('/unit-registration-packages/{id}/reject',  [UnitController::class, 'adminRejectPackage'])->whereNumber('id');
                Route::get('/property-services',              [PropertyServiceController::class, 'adminIndex']);
                Route::post('/property-services',             [PropertyServiceController::class, 'store']);
                Route::patch('/property-services/{id}',       [PropertyServiceController::class, 'update'])->whereNumber('id');
                Route::delete('/property-services/{id}',      [PropertyServiceController::class, 'destroy'])->whereNumber('id');
                Route::post('/property-services/{id}/generate-bills', [PropertyServiceController::class, 'generateBills'])->whereNumber('id');
                Route::get('/property-services/{id}/subscriptions', [PropertyServiceController::class, 'adminSubscriptions'])->whereNumber('id');
                Route::get('/service-subscriptions', [PropertyServiceController::class, 'adminSubscriptionInbox']);
                Route::patch('/service-subscriptions/{id}/approve', [PropertyServiceController::class, 'approveSubscription'])->whereNumber('id');
                Route::patch('/service-subscriptions/{id}/reject', [PropertyServiceController::class, 'rejectSubscription'])->whereNumber('id');
                Route::get('/service-bills',                  [UnitServiceBillController::class, 'adminIndex']);
                Route::get('/service-bills/{id}',             [UnitServiceBillController::class, 'adminShow'])->whereNumber('id');
                Route::get('/service-bills/{id}/reviews',     [UnitServiceBillController::class, 'adminReviews'])->whereNumber('id');
                Route::patch('/service-bills/{id}/approve',   [UnitServiceBillController::class, 'adminApprove'])->whereNumber('id');
                Route::patch('/service-bills/{id}/reject',    [UnitServiceBillController::class, 'adminReject'])->whereNumber('id');
                Route::patch('/service-bills/{id}/clarify',   [UnitServiceBillController::class, 'adminClarify'])->whereNumber('id');

                /* KuickPay (Pakistan) — payments ledger, exceptions, settings */
                Route::get('/payments',                       [AdminPaymentController::class, 'index']);
                Route::get('/payments/summary',               [AdminPaymentController::class, 'summary']);
                Route::get('/payments/export',                [AdminPaymentController::class, 'export']);
                Route::get('/payments/outstanding',           [AdminPaymentController::class, 'outstanding']);
                Route::get('/payments/cases',                 [AdminPaymentController::class, 'cases']);
                Route::post('/payments/cases/{case}/resolve', [AdminPaymentController::class, 'resolveCase']);
                Route::patch('/payments/settings',            [AdminPaymentController::class, 'updateSettings']);
                Route::get('/payments/{id}',                  [AdminPaymentController::class, 'show']);
                Route::post('/payments/{id}/cases',           [AdminPaymentController::class, 'openCase']);
                Route::post('/payments/{id}/reconcile',       [AdminPaymentController::class, 'reconcile']);
                Route::post('/payments/{id}/refunded',        [AdminPaymentController::class, 'markRefunded']);

                Route::get('/amenity-bills',                  [AmenitySharedBillController::class, 'communityIndex']);
                Route::get('/amenities',                      [AmenityController::class, 'adminIndex']);
                Route::post('/amenities',                     [AmenityController::class, 'store']);
                Route::match(['patch', 'post'],'/amenities/{id}',               [AmenityController::class, 'update']);
                Route::delete('/amenities/{id}',              [AmenityController::class, 'destroy']);
                Route::post('/amenities/{id}/delete',         [AmenityController::class, 'destroy']);
                Route::match(['patch', 'post'],'/amenities/{id}/approve',       [AmenityController::class, 'approveAmenity']);
                Route::match(['patch', 'post'],'/amenities/{id}/reject',        [AmenityController::class, 'rejectAmenity']);
                Route::get('/amenities/{id}/bills',           [AmenitySharedBillController::class, 'adminIndex']);
                Route::post('/amenities/{id}/bills',          [AmenitySharedBillController::class, 'adminStore']);
                Route::get('/amenities/{id}/bills/{monthlyBillId}/residents', [AmenitySharedBillController::class, 'adminResidentIndex']);
                Route::get('/amenities/{id}/resident-bills/{residentBillId}/reviews', [AmenitySharedBillController::class, 'adminReviews']);
                Route::match(['patch', 'post'],'/amenities/{id}/resident-bills/{residentBillId}/approve', [AmenitySharedBillController::class, 'adminApprove']);
                Route::match(['patch', 'post'],'/amenities/{id}/resident-bills/{residentBillId}/reject', [AmenitySharedBillController::class, 'adminReject']);
                Route::match(['patch', 'post'],'/amenities/{id}/resident-bills/{residentBillId}/clarify', [AmenitySharedBillController::class, 'adminClarify']);

                /* Amenity bookings — admin can still review community-wide */
                Route::get('/bookings',                       [AmenityController::class, 'adminBookings']);
                Route::match(['patch', 'post'],'/bookings/{id}/approve',        [AmenityController::class, 'approveBooking']);
                Route::match(['patch', 'post'],'/bookings/{id}/reject',         [AmenityController::class, 'rejectBooking']);

                Route::get('/communities', [AdminCommunityController::class, 'listActive']);

                Route::match(['patch', 'post'],'/listings/{id}/approve', [ListingController::class, 'approve']);
                Route::match(['patch', 'post'],'/listings/{id}/reject',  [ListingController::class, 'reject']);

                /* Deals & Offers (community admin managed) */
                Route::get('/deals',            [DealController::class, 'adminIndex']);
                Route::post('/deals',           [DealController::class, 'store']);
                Route::post('/deals/upload-image', [DealController::class, 'uploadImage']);
                Route::match(['patch', 'post'],'/deals/{id}',     [DealController::class, 'update']);
                Route::delete('/deals/{id}',    [DealController::class, 'destroy']);
                Route::post('/deals/{id}/delete', [DealController::class, 'destroy']);

                /* Local businesses */
                Route::match(['patch', 'post'],'/businesses/{id}/approve',   [BusinessController::class, 'approve']);
                Route::match(['patch', 'post'],'/businesses/{id}/reject',    [BusinessController::class, 'reject']);
                Route::match(['patch', 'post'],'/businesses/{id}/reapprove', [BusinessController::class, 'approve']); // re-approve a rejected business
            });

            /* Platform-only content review (legacy — system admin) */
            Route::middleware('system.admin')->group(function () {
                Route::post('/communities', [AdminCommunityController::class, 'store']);
                Route::get('/regions', [RegionController::class, 'adminIndex']);
                Route::post('/regions', [RegionController::class, 'store']);
                Route::put('/regions/{id}', [RegionController::class, 'update']);
                Route::delete('/regions/{id}', [RegionController::class, 'destroy']);
                Route::get('/countries', [GeographyController::class, 'adminCountries']);
                Route::get('/states', [GeographyController::class, 'adminStates']);
                Route::post('/states', [GeographyController::class, 'storeState']);

                Route::get('/reports',                       [ReportController::class, 'index']);
                Route::match(['patch', 'post'],'/reports/{id}/resolve',        [ReportController::class, 'resolve']);
                Route::match(['patch', 'post'],'/reports/{id}/escalate',       [ReportController::class, 'escalate']);
                Route::match(['patch', 'post'],'/reports/{id}/dismiss',        [ReportController::class, 'dismiss']);

                Route::get('/wellness/categories',                    [AdminWellnessController::class, 'categories']);
                Route::post('/wellness/categories',                    [AdminWellnessController::class, 'storeCategory']);
                Route::post('/wellness/categories/upload-image',       [AdminWellnessController::class, 'uploadCategoryImage']);
                Route::match(['patch', 'post'],'/wellness/categories/{id}',              [AdminWellnessController::class, 'updateCategory']);
                Route::delete('/wellness/categories/{id}',             [AdminWellnessController::class, 'destroyCategory']);
                Route::get('/wellness/courses',                        [AdminWellnessController::class, 'courses']);
                Route::post('/wellness/courses',                       [AdminWellnessController::class, 'storeCourse']);
                Route::post('/wellness/courses/upload-image',          [AdminWellnessController::class, 'uploadCourseImage']);
                Route::match(['patch', 'post'],'/wellness/courses/{id}',                  [AdminWellnessController::class, 'updateCourse']);
                Route::delete('/wellness/courses/{id}',                [AdminWellnessController::class, 'destroyCourse']);
                Route::get('/wellness/courses/{id}/lessons',           [AdminWellnessController::class, 'lessons']);
                Route::post('/wellness/courses/{id}/lessons',          [AdminWellnessController::class, 'storeLesson']);
                Route::match(['patch', 'post'],'/wellness/lessons/{id}',                 [AdminWellnessController::class, 'updateLesson']);
                Route::delete('/wellness/lessons/{id}',               [AdminWellnessController::class, 'destroyLesson']);
            });
        });

        /* ── Community Rules (resident read + acknowledge) ── */
        Route::middleware('resident.feature:community_rules')->group(function () {
            Route::get('/community-rules',                          [CommunityRuleController::class, 'index']);
            Route::post('/community-rules/{id}/acknowledge',        [CommunityRuleController::class, 'acknowledge']);
        });

        /* ── Community Documents ── */
        Route::middleware('resident.feature:documents')->group(function () {
            Route::get('/documents',                                [CommunityDocumentController::class, 'index']);
            Route::get('/documents/{id}',                           [CommunityDocumentController::class, 'show']);
            Route::post('/documents/{id}/download',                 [CommunityDocumentController::class, 'recordDownload']);
        });

        /* Resident report filing */
        Route::post('/reports', [ReportController::class, 'store']);
    });
});
