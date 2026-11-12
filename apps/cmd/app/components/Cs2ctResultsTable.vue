<script setup lang="ts">
import type { Cs2ctRecord } from '@dig-portal/domain'
import { cs2ctLabel, cs2ctVariantRegion, formatGeneSupport } from '@dig-portal/feature-phenotype'
defineProps<{ rows: readonly Cs2ctRecord[] }>()
const tissueUrl = (tissue: string) => `https://hugeamp.org/tissue.html?${new URLSearchParams({ tissue })}`
const variantUrl = (variant: string) => `https://hugeamp.org/variant.html?${new URLSearchParams({ variant })}`
const sifterUrl = (row: Cs2ctRecord) => `https://hugeamp.org/research.html?${new URLSearchParams({ pageid: 'kp_variant_sifter', phenotype: row.phenotype, region: cs2ctVariantRegion(row)! })}`
</script>

<template>
  <div tabindex="0" role="region" aria-label="CS2CT results" class="overflow-x-auto rounded-lg border border-default">
    <table class="w-full text-left text-sm">
      <caption class="sr-only">Credible Sets to Cell Type results. Higher overlap probability indicates greater overlap. Combined score incorporates overlap and specificity. Clump intervals are shown as reported.</caption>
      <thead class="bg-elevated"><tr>
        <th scope="col" class="p-3">Tissue</th><th scope="col" class="p-3">Biosample</th><th scope="col" class="p-3">Source</th>
        <th scope="col" class="p-3">Clump start–end</th><th scope="col" class="p-3 text-right">Variants</th><th scope="col" class="p-3">Overlap lead SNP</th>
        <th scope="col" class="p-3 text-right">Overlap probability</th><th scope="col" class="p-3 text-right">Genericity</th><th scope="col" class="p-3 text-right">Combined score</th><th scope="col" class="p-3">Variant Sifter</th>
      </tr></thead>
      <tbody class="divide-y divide-default">
        <tr v-for="(row, index) in rows" :key="`${row.credibleSetId}:${row.biosample}:${row.tissue}:${index}`" class="align-top">
          <th scope="row" class="min-w-36 p-3 font-normal"><a v-if="row.tissue !== null" :href="tissueUrl(row.tissue)" class="text-primary underline">{{ cs2ctLabel(row.tissue) }}</a><span v-else>Not recorded</span></th>
          <td class="min-w-40 p-3">{{ cs2ctLabel(row.biosample) }}</td><td class="min-w-40 p-3">{{ cs2ctLabel(row.source) }}</td>
          <td class="whitespace-nowrap p-3">{{ row.chromosome }}:{{ row.clumpStart }}–{{ row.clumpEnd }}</td>
          <td class="p-3 text-right tabular-nums">{{ row.variantCount.toLocaleString() }}</td>
          <td class="max-w-60 break-all p-3"><a v-if="row.overlapLeadVariant" :href="variantUrl(row.overlapLeadVariant)" class="text-primary underline">{{ row.overlapLeadVariant }}</a><span v-else>Not recorded</span></td>
          <td class="p-3 text-right tabular-nums">{{ formatGeneSupport(row.overlapProbability) }}</td><td class="p-3 text-right tabular-nums">{{ formatGeneSupport(row.genericity) }}</td><td class="p-3 text-right tabular-nums">{{ formatGeneSupport(row.score) }}</td>
          <td class="p-3"><a v-if="cs2ctVariantRegion(row)" :href="sifterUrl(row)" class="text-primary underline">Open<span class="sr-only"> Variant Sifter around {{ row.overlapLeadVariant }}</span></a><span v-else>Region unavailable</span></td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
