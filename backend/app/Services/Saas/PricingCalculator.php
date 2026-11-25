<?php

namespace App\Services\Saas;

/**
 * Server-side money math for Havena SaaS quotes.
 * Amounts are integer minor units (cents). No floats.
 */
class PricingCalculator
{
    public const MAX_RESIDENTS = 10_000_000;

    /**
     * @param  list<array{min: int, max: int|null, unit_cents?: int, fixed_cents?: int}>  $tiers
     * @return array<string, mixed>
     */
    public function quote(array $input): array
    {
        $residents = $this->residents($input['residents'] ?? null);
        $model = (string) ($input['billing_model'] ?? '');
        $interval = (string) ($input['interval'] ?? 'month');
        if (! in_array($model, ['per_resident', 'per_community'], true)) {
            throw new \InvalidArgumentException('Choose a billing model.');
        }
        if (! in_array($interval, ['month', 'year'], true)) {
            throw new \InvalidArgumentException('Choose monthly or annual billing.');
        }

        $minimum = max(0, (int) ($input['minimum_monthly_cents'] ?? 0));
        $discountBps = max(0, min(10_000, (int) ($input['annual_discount_bps'] ?? 0)));
        $tiers = $input['tiers'] ?? [];
        if (! is_array($tiers) || $tiers === []) {
            return $this->unavailable($residents, $model, $interval, 'No published price for this plan.');
        }

        if ($model === 'per_resident') {
            $monthly = $this->graduated($residents, $tiers);
            if ($monthly < 0) {
                throw new \InvalidArgumentException('Price cannot be negative.');
            }
            if ($minimum > 0 && $monthly < $minimum) {
                $monthly = $minimum;
            }
        } else {
            $band = $this->communityBand($residents, $tiers);
            if ($band === null) {
                return $this->unavailable($residents, $model, $interval, 'This community size needs a written quote.');
            }
            $monthly = (int) $band;
        }

        $annualFull = $this->mul($monthly, 12);
        $annual = $annualFull;
        $discount = 0;
        if ($discountBps > 0) {
            $discount = intdiv($annualFull * $discountBps, 10_000);
            $annual = $annualFull - $discount;
        }

        $due = $interval === 'year' ? $annual : $monthly;

        return [
            'available' => true,
            'quote_required' => false,
            'residents' => $residents,
            'billing_model' => $model,
            'interval' => $interval,
            'currency' => strtoupper((string) ($input['currency'] ?? 'USD')),
            'monthly_cents' => $monthly,
            'annual_cents' => $annual,
            'annual_before_discount_cents' => $annualFull,
            'discount_cents' => $interval === 'year' ? $discount : 0,
            'amount_due_cents' => $due,
            'minimum_applied' => $model === 'per_resident' && $minimum > 0 && $monthly === $minimum,
        ];
    }

    /**
     * @param  list<array{min: int, max: int|null, unit_cents?: int}>  $tiers
     */
    public function graduated(int $residents, array $tiers): int
    {
        $remaining = $residents;
        $cursor = 1;
        $total = 0;
        foreach ($this->sorted($tiers) as $tier) {
            if ($remaining <= 0) {
                break;
            }
            $min = max(1, (int) $tier['min']);
            $max = isset($tier['max']) && $tier['max'] !== null ? (int) $tier['max'] : null;
            if ($max !== null && $max < $min) {
                throw new \InvalidArgumentException('A pricing bracket ends before it starts.');
            }
            if ($min > $cursor) {
                throw new \InvalidArgumentException('Pricing brackets leave a gap.');
            }
            $bandEnd = $max ?? ($cursor + $remaining - 1);
            $span = $bandEnd - $cursor + 1;
            $take = min($remaining, $span);
            if ($take > 0) {
                $total = $this->add($total, $this->mul($take, max(0, (int) ($tier['unit_cents'] ?? 0))));
                $remaining -= $take;
                $cursor += $take;
            }
        }
        if ($remaining > 0) {
            throw new \InvalidArgumentException('Pricing brackets do not cover this resident count.');
        }

        return $total;
    }

    /**
     * @param  list<array{min: int, max: int|null, fixed_cents?: int}>  $tiers
     */
    private function communityBand(int $residents, array $tiers): ?int
    {
        foreach ($tiers as $tier) {
            $min = max(1, (int) ($tier['min'] ?? 1));
            $max = isset($tier['max']) && $tier['max'] !== null ? (int) $tier['max'] : null;
            if ($residents < $min) {
                continue;
            }
            if ($max !== null && $residents > $max) {
                continue;
            }
            if (! array_key_exists('fixed_cents', $tier) || $tier['fixed_cents'] === null) {
                return null;
            }

            return max(0, (int) $tier['fixed_cents']);
        }

        return null;
    }

    /** @param  list<array<string, mixed>>  $tiers */
    private function sorted(array $tiers): array
    {
        usort($tiers, fn ($a, $b) => ((int) ($a['min'] ?? 0)) <=> ((int) ($b['min'] ?? 0)));

        return $tiers;
    }

    private function residents(mixed $value): int
    {
        if (! is_numeric($value) || (int) $value != $value) {
            throw new \InvalidArgumentException('Enter a whole number of residents.');
        }
        $count = (int) $value;
        if ($count < 1) {
            throw new \InvalidArgumentException('Enter at least 1 resident.');
        }
        if ($count > self::MAX_RESIDENTS) {
            throw new \InvalidArgumentException('Enter a resident count of 10,000,000 or less.');
        }

        return $count;
    }

    private function mul(int $a, int $b): int
    {
        if ($a !== 0 && $b > intdiv(PHP_INT_MAX, $a)) {
            throw new \InvalidArgumentException('That price is too large to calculate.');
        }

        return $a * $b;
    }

    private function add(int $a, int $b): int
    {
        if ($b > 0 && $a > PHP_INT_MAX - $b) {
            throw new \InvalidArgumentException('That price is too large to calculate.');
        }

        return $a + $b;
    }

    /** @return array<string, mixed> */
    private function unavailable(int $residents, string $model, string $interval, string $reason): array
    {
        return [
            'available' => false,
            'quote_required' => true,
            'reason' => $reason,
            'residents' => $residents,
            'billing_model' => $model,
            'interval' => $interval,
            'currency' => 'USD',
            'monthly_cents' => null,
            'annual_cents' => null,
            'annual_before_discount_cents' => null,
            'discount_cents' => 0,
            'amount_due_cents' => null,
            'minimum_applied' => false,
        ];
    }
}
