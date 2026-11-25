<?php

namespace App\Console\Commands;

use App\Models\Community;
use App\Models\Region;
use App\Services\LocationCatalog;
use App\Services\OsmGeocodingService;
use App\Support\CommunityGeography;
use App\Support\RegionHierarchy;
use Illuminate\Console\Command;

class RepairCommunityRegionsCommand extends Command
{
    protected $signature = 'communities:repair-regions {--dry-run : Report changes without writing}';

    protected $description = 'Normalize community region links to city-level regions with Country → State → City titles';

    public function handle(
        LocationCatalog $catalog,
        OsmGeocodingService $geocoder,
        CommunityGeography $geography,
    ): int {
        $dryRun = (bool) $this->option('dry-run');
        $fixed = 0;
        $skipped = 0;

        Community::query()
            ->with(['regionRecord.stateRecord.country'])
            ->orderBy('id')
            ->each(function (Community $community) use ($catalog, $geocoder, $geography, $dryRun, &$fixed, &$skipped) {
                $region = $community->regionRecord;
                if (! $region) {
                    $skipped++;
                    $this->warn("Community #{$community->id} ({$community->name}) has no region — skipped.");

                    return;
                }

                try {
                    $canonical = $geography->resolveForCommunity(
                        $region,
                        $region->area,
                        $community->address,
                        $community->latitude,
                        $community->longitude,
                        $catalog,
                        $geocoder,
                    );
                } catch (\Throwable $e) {
                    $skipped++;
                    $this->warn("Community #{$community->id} ({$community->name}) — {$e->getMessage()}");

                    return;
                }

                $nextTitle = $canonical->title;
                $needsUpdate = (int) $community->region_id !== (int) $canonical->id
                    || (string) $community->region !== (string) $nextTitle;

                if (! $needsUpdate) {
                    return;
                }

                $this->line(sprintf(
                    'Community #%d %s: region %d → %d (%s)',
                    $community->id,
                    $community->name,
                    $community->region_id,
                    $canonical->id,
                    RegionHierarchy::hierarchyLabel($canonical),
                ));

                if (! $dryRun) {
                    $community->update([
                        'region_id' => $canonical->id,
                        'region' => $nextTitle,
                    ]);
                }

                $fixed++;
            });

        if (! $dryRun) {
            $this->deactivateInconsistentRegions();
        }

        $this->info($dryRun
            ? "Dry run complete. {$fixed} communit".($fixed === 1 ? 'y' : 'ies')." would be updated; {$skipped} skipped."
            : "Done. Updated {$fixed} communit".($fixed === 1 ? 'y' : 'ies')."; {$skipped} skipped.");

        return self::SUCCESS;
    }

    private function deactivateInconsistentRegions(): void
    {
        Region::query()
            ->with('stateRecord.country')
            ->where('status', 'active')
            ->each(function (Region $region) {
                if (RegionHierarchy::isRegionStateLinkConsistent($region)) {
                    return;
                }

                $inUse = Community::query()->where('region_id', $region->id)->exists();
                if ($inUse) {
                    return;
                }

                $region->update(['status' => 'inactive']);
                $this->line("Deactivated inconsistent region #{$region->id} ({$region->title})");
            });
    }
}