<?php

namespace App\Support;

class UtilityBillTextScorer
{
    /** @var list<string> */
    public const UTILITY_TERMS = [
        'utility', 'electric', 'electricity', 'gas', 'water', 'sewer', 'internet',
        'broadband', 'cable', 'telecom', 'energy', 'power company', 'kwh', 'therm',
        'meter', 'account number', 'account no', 'acct #', 'amount due', 'due date',
        'billing period', 'billing date', 'service address', 'statement', 'invoice',
        'bill', 'provider', 'usage', 'past due', 'kilowatt',
    ];

    /** @var list<string> */
    public const LEASE_TERMS = [
        'lease', 'rental agreement', 'tenancy', 'tenant', 'landlord', 'lessor',
        'lessee', 'rent', 'security deposit', 'premises', 'property address',
        'lease term', 'commencement', 'expiration', 'signature', 'agreement',
        'property management', 'resident', 'occupancy',
    ];

    /** @var list<string> */
    public const UNRELATED_TERMS = [
        'selfie', 'vacation', 'instagram', 'facebook', 'tiktok', 'portrait',
        'scenery', 'landscape', 'product photo', 'screenshot of chat',
        'my cat', 'my dog', 'birthday party',
    ];

    /**
     * @return array{document: int, unrelated: int, words: int}
     */
    public static function score(string $text): array
    {
        $normalized = strtolower(preg_replace('/\s+/', ' ', $text) ?? '');
        $compact = str_replace(' ', '', $normalized);
        $document = 0;
        foreach ([...self::UTILITY_TERMS, ...self::LEASE_TERMS] as $term) {
            if (str_contains($normalized, $term)) {
                $document++;

                continue;
            }

            $compactTerm = str_replace(' ', '', $term);
            if (strlen($compactTerm) >= 6 && str_contains($compact, $compactTerm)) {
                $document++;
            }
        }

        $unrelated = 0;
        foreach (self::UNRELATED_TERMS as $term) {
            if (str_contains($normalized, $term)) {
                $unrelated++;
            }
        }

        return [
            'document' => $document,
            'unrelated' => $unrelated,
            'words' => str_word_count($normalized),
        ];
    }

    public static function verdictFromTextSignals(array $signals, string $likelyReason, string $reviewReason, string $rejectReason): UtilityBillDocumentVerdict
    {
        if ($signals['document'] >= 2) {
            return UtilityBillDocumentVerdict::likely($likelyReason);
        }

        if ($signals['unrelated'] >= 1 && $signals['document'] === 0) {
            return UtilityBillDocumentVerdict::reject($rejectReason);
        }

        if ($signals['document'] === 1) {
            return UtilityBillDocumentVerdict::review($reviewReason);
        }

        if ($signals['words'] >= 8) {
            return UtilityBillDocumentVerdict::reject($rejectReason);
        }

        return UtilityBillDocumentVerdict::review($reviewReason);
    }
}
