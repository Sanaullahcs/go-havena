<?php

namespace App\Services\Kuickpay;

use App\Models\PaymentAttempt;
use App\Models\UtilityBiller;

/**
 * Everything Havena asks of KuickPay. The rest of the app never calls
 * KuickPay directly, so the sandbox simulator and the live client are
 * interchangeable and another provider can be added later.
 */
interface KuickpayGateway
{
    public function isSimulated(): bool;

    /** Starts a hosted checkout. Throws KuickpayException when KuickPay is unreachable. */
    public function createCheckoutSession(PaymentAttempt $attempt, string $returnUrl): CheckoutSession;

    /** @param  array<string, mixed>  $params  Query/body KuickPay sent to the return URL. */
    public function verifyReturn(array $params): bool;

    /** Authoritative checkout result for reconciliation when the return never arrived. */
    public function checkoutStatus(PaymentAttempt $attempt): CheckoutStatus;

    /** @return list<array{mnemonic: string, name: string, category?: string, biller_id?: string}> */
    public function getBillers(): array;

    public function billInquiry(UtilityBiller $biller, string $consumerNumber): BillInquiryResult;

    public function billPayment(
        UtilityBiller $biller,
        string $consumerNumber,
        string $tranAuthId,
        int $paidPaisa,
        string $billingMonth,
    ): BillPaymentResult;
}
