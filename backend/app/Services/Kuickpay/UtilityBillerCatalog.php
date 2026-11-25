<?php

namespace App\Services\Kuickpay;

use App\Models\UtilityBiller;

/**
 * Pakistan utility billers Havena supports. In live mode GetBillers is the
 * source of truth and only billers KuickPay returns stay active; these rows
 * carry the resident-facing labels and reference formats KuickPay does not.
 */
final class UtilityBillerCatalog
{
    /** @return list<array<string, mixed>> */
    public static function defaults(): array
    {
        $electricity = [
            ['KE', 'K-Electric', 'K-Electric', 'Karachi', 'Account number', '13-digit account number printed at the top of your K-Electric bill.', 13, 13, '#E2231A'],
            ['LESCO', 'Lahore Electric Supply Company', 'LESCO', 'Lahore', 'Reference number', '14-digit reference number on your LESCO bill.', 14, 14, '#0B6E4F'],
            ['IESCO', 'Islamabad Electric Supply Company', 'IESCO', 'Islamabad · Rawalpindi', 'Reference number', '14-digit reference number on your IESCO bill.', 14, 14, '#1F5FAD'],
            ['FESCO', 'Faisalabad Electric Supply Company', 'FESCO', 'Faisalabad', 'Reference number', '14-digit reference number on your FESCO bill.', 14, 14, '#0E7490'],
            ['GEPCO', 'Gujranwala Electric Power Company', 'GEPCO', 'Gujranwala', 'Reference number', '14-digit reference number on your GEPCO bill.', 14, 14, '#7C3AED'],
            ['MEPCO', 'Multan Electric Power Company', 'MEPCO', 'Multan', 'Reference number', '14-digit reference number on your MEPCO bill.', 14, 14, '#B45309'],
            ['PESCO', 'Peshawar Electric Supply Company', 'PESCO', 'Peshawar', 'Reference number', '14-digit reference number on your PESCO bill.', 14, 14, '#047857'],
            ['HESCO', 'Hyderabad Electric Supply Company', 'HESCO', 'Hyderabad', 'Reference number', '14-digit reference number on your HESCO bill.', 14, 14, '#BE123C'],
            ['QESCO', 'Quetta Electric Supply Company', 'QESCO', 'Quetta', 'Reference number', '14-digit reference number on your QESCO bill.', 14, 14, '#4338CA'],
        ];
        $gas = [
            ['SNGPL', 'Sui Northern Gas Pipelines', 'SNGPL', 'Punjab · KP · Islamabad', 'Consumer number', '11-digit consumer number on your SNGPL bill.', 11, 11, '#F59E0B'],
            ['SSGC', 'Sui Southern Gas Company', 'SSGC', 'Sindh · Balochistan', 'Consumer number', '10-digit consumer number on your SSGC bill.', 10, 10, '#EA580C'],
        ];
        $water = [
            ['LWASA', 'WASA Lahore', 'WASA Lahore', 'Lahore', 'Consumer number', 'Consumer number on your WASA bill.', 8, 14, '#0284C7'],
            ['KWSC', 'Karachi Water & Sewerage Corporation', 'KW&SC', 'Karachi', 'Consumer number', 'Consumer number on your KW&SC bill.', 8, 14, '#0369A1'],
        ];
        $internet = [
            ['PTCL', 'PTCL', 'PTCL', 'Nationwide', 'Account ID', '10-digit account ID on your PTCL bill.', 10, 10, '#10B981'],
            ['NAYATEL', 'Nayatel', 'Nayatel', 'Islamabad · Rawalpindi · more', 'Customer ID', 'Customer ID on your Nayatel invoice.', 6, 12, '#E11D48'],
            ['STORMFIBER', 'StormFiber', 'StormFiber', 'Lahore · Karachi · more', 'Customer ID', 'Customer ID on your StormFiber invoice.', 6, 12, '#2563EB'],
        ];

        $rows = [];
        $sort = 10;
        foreach ([
            'electricity' => $electricity,
            'gas' => $gas,
            'water' => $water,
            'internet' => $internet,
        ] as $type => $billers) {
            foreach ($billers as [$mnemonic, $name, $short, $region, $label, $hint, $min, $max, $color]) {
                $rows[] = [
                    'mnemonic' => $mnemonic,
                    'biller_id' => null,
                    'name' => $name,
                    'short_name' => $short,
                    'service_type' => $type,
                    'region' => $region,
                    'reference_label' => $label,
                    'reference_hint' => $hint,
                    'reference_min_length' => $min,
                    'reference_max_length' => $max,
                    'brand_color' => $color,
                    'sort_order' => $sort,
                ];
                $sort += 10;
            }
        }

        return $rows;
    }

    /** Ensures the catalog exists; safe to call on every request. */
    public static function ensureSeeded(): void
    {
        if (UtilityBiller::query()->exists()) {
            return;
        }

        self::upsertDefaults();
    }

    public static function upsertDefaults(): int
    {
        $count = 0;
        foreach (self::defaults() as $row) {
            UtilityBiller::query()->updateOrCreate(
                ['mnemonic' => $row['mnemonic']],
                $row + ['active' => true, 'synced_at' => now()],
            );
            $count++;
        }

        return $count;
    }

    /**
     * Applies a GetBillers response: billers KuickPay no longer lists are
     * deactivated (never deleted, so existing linked accounts keep history).
     *
     * @param  list<array{mnemonic: string, name: string, category?: string, biller_id?: ?string}>  $remote
     */
    public static function applyRemote(array $remote): int
    {
        if ($remote === []) {
            return 0;
        }

        self::upsertDefaults();
        $listed = [];
        foreach ($remote as $row) {
            $mnemonic = strtoupper((string) $row['mnemonic']);
            $listed[] = $mnemonic;
            $biller = UtilityBiller::query()->where('mnemonic', $mnemonic)->first();
            if ($biller) {
                $biller->fill([
                    'biller_id' => $row['biller_id'] ?? $biller->biller_id,
                    'active' => true,
                    'synced_at' => now(),
                ])->save();
            }
        }

        return UtilityBiller::query()->whereNotIn('mnemonic', $listed)->update(['active' => false]);
    }
}
